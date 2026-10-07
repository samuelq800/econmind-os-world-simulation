import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import type { Pool, PoolClient } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CURRENT_REPLAY_BINDING,
  OPENING_SEED_SCHEMA_VERSION,
  OPENING_SOURCE_SCHEMA_VERSION,
  canonicalSerialize,
  countryId,
  createOpeningSeed,
  createOpeningSource,
  officeId,
  openingSeedId,
  openingSourceId,
  worldId,
} from '@econmind/core';
import { officePrivateReadProjectionScopeKey } from '../../apps/world-worker/src/projections/current-authorization-entitlement-publisher.js';
import { parseSupabaseAuthSubject } from '../../apps/world-api/src/integration/identity.js';
import type { ServerReadBindingPort } from '../../apps/world-api/src/integration/https-authenticated-read-composition.js';
import {
  createPostgresServerReadBindingFactsReader,
  POSTGRES_BINDING_READER_ROLE_QUERY,
  POSTGRES_OPENING_HEAD_FACTS_QUERY,
  POSTGRES_PROJECTION_BINDING_FACTS_QUERY,
  POSTGRES_READ_BINDING_MISSING_PERSISTED_AUTHORITY,
} from '../../apps/world-api/src/integration/postgres-server-read-binding.js';

type Request = Parameters<ServerReadBindingPort['resolve']>[0];
const subject = parseSupabaseAuthSubject(
  '11111111-1111-4111-8111-111111111111',
);
const otherSubject = parseSupabaseAuthSubject(
  '22222222-2222-4222-8222-222222222222',
);
const world = 'WORLD_BINDING_TEST';
const role = 'test_runtime_binding_reader';
const fingerprint = `sha256:${'a'.repeat(64)}`;
const privateScope = officePrivateReadProjectionScopeKey({
  countryId: countryId('COUNTRY_A'),
  officeId: officeId('TRADE'),
});
const request = (overrides: Partial<Request> = {}): Request => ({
  verifiedSubject: subject,
  worldId: world,
  projectionSelector: {
    classification: 'OFFICE_PRIVATE',
    scopeKey: privateScope,
  },
  finalSelector: null,
  signal: new AbortController().signal,
  ...overrides,
});
const finalRequest = () =>
  request({
    projectionSelector: null,
    finalSelector: {
      commandId: 'COMMAND_ORIGINAL',
      idempotencyKey: 'IDEMPOTENCY_ORIGINAL',
    },
  });
const databases: PGlite[] = [];
afterEach(async () => {
  for (const db of databases.splice(0)) await db.close();
});

async function fixture(
  sourceKind:
    'AUTHORITATIVE_DATASET' | 'TEST_FIXTURE' = 'AUTHORITATIVE_DATASET',
) {
  // Entirely offline synthetic lineage. Source kind exercises the parser and
  // does not claim that this test World is admitted or real economic data.
  const db = new PGlite();
  databases.push(db);
  for (const migration of [
    '0001_world_v2_namespace.sql',
    '0002_world_v2_command_event_ledger.sql',
    '0011_world_v2_current_commit_authorization.sql',
    '0013_world_v2_read_projection_boundary.sql',
    '0016_world_v2_opening_seed.sql',
  ]) {
    await db.exec(
      await readFile(
        new URL(
          `../../database/migrations/artifacts/${migration}`,
          import.meta.url,
        ),
        'utf8',
      ),
    );
  }
  const sha256Hex = (value: string) =>
    createHash('sha256').update(value).digest('hex');
  const seed = createOpeningSeed(
    {
      schemaVersion: OPENING_SEED_SCHEMA_VERSION,
      seedId: openingSeedId('SEED_BINDING_TEST'),
      worldId: worldId(world),
      openingWorldVersion: '0',
      replayBinding: CURRENT_REPLAY_BINDING,
      sources: [
        createOpeningSource(
          {
            schemaVersion: OPENING_SOURCE_SCHEMA_VERSION,
            sourceId: openingSourceId('SOURCE_BINDING_TEST'),
            sourceKind,
            locator: 'fixture://offline-binding-test',
            sourceVersion: 'TEST_ONLY',
            payload: { testOnly: true },
          },
          sha256Hex,
        ),
      ],
      inventoryEntries: [],
      financialBatches: [],
    },
    sha256Hex,
  );
  const { fingerprint: seedHash, ...intent } = seed;
  await db.query('insert into world_v2.world_head values ($1,0,0)', [world]);
  await db.query(
    'insert into world_v2.opening_seed values ($1,$2,0,$3,$4,$5,now())',
    [
      world,
      seed.seedId,
      canonicalSerialize(seed.replayBinding),
      canonicalSerialize(intent),
      seedHash,
    ],
  );
  await db.query(
    'update world_v2.world_head set world_version=3,event_sequence=4',
  );
  await db.query(
    `insert into world_v2.current_commit_authorization values ($1,$2,'COUNTRY_A','TRADE','READ','TEAM_A','AUTH_1',true,now())`,
    [world, subject],
  );
  for (const [classification, scope] of [
    ['OFFICE_PRIVATE', privateScope],
    ['COUNTRY', 'COUNTRY_A'],
  ]) {
    await db.query(
      "insert into world_v2.projection_entitlement values ($1,$2,$3,$4,'AUTH_1',true,now(),null)",
      [world, subject, classification, scope],
    );
    await db.query(
      "insert into world_v2.read_projection values ($1,$2,$3,'world-projection-read-v1',3,4,'{}',now())",
      [world, classification, scope],
    );
  }
  await db.query(
    `insert into world_v2.command_submission (world_id,command_id,idempotency_key,command_type,schema_version,canonical_payload,payload_sha256,command_fingerprint,auth_subject,actor_id,country_id,office_id,sim_time,correlation_id,submitted_at_real) values ($1,'COMMAND_ORIGINAL','IDEMPOTENCY_ORIGINAL','TEST','TEST','{}',$3,$3,$2,'ACTOR_A','COUNTRY_A','TRADE',0,'CORRELATION_TEST',now())`,
    [world, subject, fingerprint],
  );
  // Fixture-only role/policy, intentionally absent from production migrations.
  await db.exec(`create role ${role} nologin nosuperuser nobypassrls;
    grant usage on schema world_v2 to ${role};
    grant select(world_id,auth_subject,country_id,office_id,authorization_version,active) on world_v2.current_commit_authorization to ${role};
    grant select(world_id,auth_subject,classification,scope_key,authorization_version,active,revoked_at) on world_v2.projection_entitlement to ${role};
    grant select(world_id,classification,scope_key,schema_version,world_version,event_sequence) on world_v2.read_projection to ${role};
    grant select(world_id,auth_subject,country_id,office_id,command_id,idempotency_key,command_fingerprint) on world_v2.command_submission to ${role};
    grant select(world_id,seed_id,opening_world_version,replay_binding,canonical_payload,seed_fingerprint) on world_v2.opening_seed to ${role};
    grant select(world_id,world_version,event_sequence) on world_v2.world_head to ${role};
    create policy test_only_opening_read on world_v2.opening_seed for select to ${role} using (exists(select 1 from world_v2.projection_entitlement e where e.world_id=opening_seed.world_id and e.auth_subject::text=current_setting('request.jwt.claim.sub',true) and e.active and e.revoked_at is null));`);
  const queries: Array<{ sql: string; values: unknown[] | undefined }> = [];
  const release = vi.fn();
  const client = {
    query: async (sql: string, values?: unknown[]) => {
      queries.push({ sql, values });
      return db.query(sql, values);
    },
    release,
  } as unknown as PoolClient;
  const pool = {
    connect: async () => {
      await db.exec(`set role ${role}`);
      return client;
    },
  } as Pick<Pool, 'connect'>;
  const reader = createPostgresServerReadBindingFactsReader({
    pool,
    readerRole: role,
  });
  const admin = async (sql: string, values?: unknown[]) => {
    await db.exec('reset role');
    return db.query(sql, values);
  };
  return { db, seed, reader, queries, release, admin };
}

describe('offline persisted PostgreSQL binding facts', () => {
  it('reads exact persisted lineage, revision and head under verified-subject GUC', async () => {
    const f = await fixture();
    const facts = await f.reader.inspectExistingFacts(request());
    expect(facts).toEqual({
      scope: {
        authSubject: subject,
        worldId: world,
        countryId: 'COUNTRY_A',
        officeId: 'TRADE',
        authorizationRevision: 'AUTH_1',
        classification: 'OFFICE_PRIVATE',
        scopeKey: privateScope,
        projectionSchemaVersion: 'world-projection-read-v1',
      },
      originalSubmission: null,
      opening: {
        seedId: f.seed.seedId,
        seedFingerprint: f.seed.fingerprint,
        modelVersion: CURRENT_REPLAY_BINDING.modelVersion,
      },
      head: { worldVersion: '3', eventSequence: '4' },
    });
    expect(Object.isFrozen(facts?.opening)).toBe(true);
    expect(f.queries[0]?.sql).toBe(
      'begin isolation level repeatable read read only',
    );
    expect(
      f.queries.find((q) => q.sql.includes('request.jwt.claim.sub'))?.values,
    ).toEqual([subject]);
    expect(f.queries.at(-1)?.sql).toBe('commit');
    expect(f.release).toHaveBeenCalledExactlyOnceWith(false);
    expect('resolve' in f.reader).toBe(false);
    expect(POSTGRES_READ_BINDING_MISSING_PERSISTED_AUTHORITY).toEqual([
      'seatRef',
      'seed.admissionRef',
    ]);
  });
  it('preserves exact original FINAL command, fingerprint and office', async () => {
    const f = await fixture();
    expect(
      (await f.reader.inspectExistingFacts(finalRequest()))?.originalSubmission,
    ).toEqual({
      commandId: 'COMMAND_ORIGINAL',
      idempotencyKey: 'IDEMPOTENCY_ORIGINAL',
      commandFingerprint: fingerprint,
    });
  });
  it.each(['subject', 'world', 'scope', 'command', 'idempotency'] as const)(
    'denies mismatched %s selector',
    async (key) => {
      const f = await fixture();
      let r = request();
      if (key === 'subject') r = request({ verifiedSubject: otherSubject });
      if (key === 'world') r = request({ worldId: 'WORLD_OTHER' });
      if (key === 'scope')
        r = request({
          projectionSelector: {
            classification: 'OFFICE_PRIVATE',
            scopeKey: 'OFFICE_OTHER',
          },
        });
      if (key === 'command')
        r = {
          ...finalRequest(),
          finalSelector: {
            commandId: 'COMMAND_OTHER',
            idempotencyKey: 'IDEMPOTENCY_ORIGINAL',
          },
        };
      if (key === 'idempotency')
        r = {
          ...finalRequest(),
          finalSelector: {
            commandId: 'COMMAND_ORIGINAL',
            idempotencyKey: 'IDEMPOTENCY_OTHER',
          },
        };
      expect(await f.reader.inspectExistingFacts(r)).toBeNull();
    },
  );
  it.each([
    'update world_v2.current_commit_authorization set active=false',
    'update world_v2.projection_entitlement set active=false,revoked_at=now()',
    "update world_v2.projection_entitlement set authorization_version='AUTH_OTHER'",
    'update world_v2.read_projection set world_version=5',
  ])('denies revoked/stale/inconsistent persisted fact: %s', async (sql) => {
    const f = await fixture();
    await f.admin(sql);
    expect(await f.reader.inspectExistingFacts(request())).toBeNull();
  });
  it('collapses duplicate capabilities, rejects ambiguous country office facts', async () => {
    const f = await fixture();
    await f.admin(
      `insert into world_v2.current_commit_authorization values ($1,$2,'COUNTRY_A','TRADE','OTHER','TEAM_A','AUTH_1',true,now())`,
      [world, subject],
    );
    expect(await f.reader.inspectExistingFacts(request())).not.toBeNull();
    await f.admin(
      `insert into world_v2.current_commit_authorization values ($1,$2,'COUNTRY_A','FINANCE','READ','TEAM_A','AUTH_1',true,now())`,
      [world, subject],
    );
    expect(
      await f.reader.inspectExistingFacts(
        request({
          projectionSelector: {
            classification: 'COUNTRY',
            scopeKey: 'COUNTRY_A',
          },
        }),
      ),
    ).toBeNull();
  });
  it('does not substitute another active office for revoked original FINAL scope', async () => {
    const f = await fixture();
    await f.admin(
      'update world_v2.current_commit_authorization set active=false',
    );
    await f.admin(
      `insert into world_v2.current_commit_authorization values ($1,$2,'COUNTRY_A','FINANCE','READ','TEAM_A','AUTH_1',true,now())`,
      [world, subject],
    );
    expect(await f.reader.inspectExistingFacts(finalRequest())).toBeNull();
  });
  it('seed with fixture provenance cannot count as persisted opening facts', async () => {
    const f = await fixture('TEST_FIXTURE');
    expect(await f.reader.inspectExistingFacts(request())).toBeNull();
  });
  it('absence of seed RLS policy returns no opening facts', async () => {
    const f = await fixture();
    await f.admin(
      'drop policy test_only_opening_read on world_v2.opening_seed',
    );
    expect(await f.reader.inspectExistingFacts(request())).toBeNull();
  });
  it('permission absence fails unavailable with rollback and cleanup', async () => {
    const f = await fixture();
    await f.admin(
      `revoke select(seed_fingerprint) on world_v2.opening_seed from ${role}`,
    );
    await expect(
      f.reader.inspectExistingFacts(request()),
    ).rejects.toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });
    expect(f.queries.at(-1)?.sql).toBe('rollback');
    expect(f.release).toHaveBeenCalledExactlyOnceWith(false);
  });
  it('uses an actual non-bypass role and read-only transaction', async () => {
    const f = await fixture();
    await f.db.exec(`set role ${role}`);
    await f.db.exec('begin read only');
    expect(
      (
        await f.db.query<{ read_only: string }>(
          "select current_setting('transaction_read_only') as read_only",
        )
      ).rows[0]?.read_only,
    ).toBe('on');
    await expect(
      f.db.query('update world_v2.world_head set world_version=9'),
    ).rejects.toThrow();
    await f.db.exec('rollback');
    await expect(
      f.db.query('select payload from world_v2.read_projection'),
    ).rejects.toThrow();
    const roles = await f.db.query(POSTGRES_BINDING_READER_ROLE_QUERY);
    expect(roles.rows).toEqual([
      { role_name: role, rolsuper: false, rolbypassrls: false },
    ]);
  });
});

function mockReader(
  queryHandler?: (sql: string) => Promise<{ rows: unknown[] }>,
  connectHandler?: () => Promise<PoolClient>,
) {
  const release = vi.fn();
  const query = vi.fn(async (sql: string) =>
    queryHandler
      ? queryHandler(sql)
      : {
          rows:
            sql === POSTGRES_BINDING_READER_ROLE_QUERY
              ? [{ role_name: role, rolsuper: false, rolbypassrls: false }]
              : [],
        },
  );
  const client = { query, release } as unknown as PoolClient;
  const connect = vi.fn(connectHandler ?? (async () => client));
  return {
    reader: createPostgresServerReadBindingFactsReader({
      pool: { connect } as unknown as Pick<Pool, 'connect'>,
      readerRole: role,
    }),
    client,
    connect,
    query,
    release,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('managed binding facts cancellation and validation', () => {
  it('pre-abort avoids pool acquisition', async () => {
    const f = mockReader();
    const c = new AbortController();
    c.abort();
    await expect(
      f.reader.inspectExistingFacts(request({ signal: c.signal })),
    ).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(f.connect).not.toHaveBeenCalled();
  });
  it('destroys late acquired client after cancellation without SQL', async () => {
    const pending = deferred<PoolClient>();
    const f = mockReader(undefined, () => pending.promise);
    const c = new AbortController();
    const result = f.reader.inspectExistingFacts(request({ signal: c.signal }));
    c.abort();
    await expect(result).rejects.toMatchObject({ code: 'CANCELLED' });
    pending.resolve(f.client);
    await new Promise((r) => setImmediate(r));
    expect(f.release).toHaveBeenCalledExactlyOnceWith(true);
    expect(f.query).not.toHaveBeenCalled();
  });
  it('destroys in-flight client once and stops after late query result', async () => {
    const pending = deferred<{ rows: unknown[] }>();
    const started = deferred<boolean>();
    const f = mockReader(async (sql) => {
      if (sql === POSTGRES_PROJECTION_BINDING_FACTS_QUERY) {
        started.resolve(true);
        return pending.promise;
      }
      return {
        rows:
          sql === POSTGRES_BINDING_READER_ROLE_QUERY
            ? [{ role_name: role, rolsuper: false, rolbypassrls: false }]
            : [],
      };
    });
    const c = new AbortController();
    const result = f.reader.inspectExistingFacts(request({ signal: c.signal }));
    await started.promise;
    c.abort();
    await expect(result).rejects.toMatchObject({ code: 'CANCELLED' });
    const calls = f.query.mock.calls.length;
    pending.resolve({ rows: [{}] });
    await new Promise((r) => setImmediate(r));
    expect(f.release).toHaveBeenCalledExactlyOnceWith(true);
    expect(f.query).toHaveBeenCalledTimes(calls);
  });
  it.each(['rolsuper', 'rolbypassrls', 'wrong_role'])(
    'rejects %s before protected SQL',
    async (flag) => {
      const f = mockReader(async (sql) => ({
        rows:
          sql === POSTGRES_BINDING_READER_ROLE_QUERY
            ? [
                {
                  role_name: flag === 'wrong_role' ? 'different_reader' : role,
                  rolsuper: flag === 'rolsuper',
                  rolbypassrls: flag === 'rolbypassrls',
                },
              ]
            : [],
      }));
      expect(await f.reader.inspectExistingFacts(request())).toBeNull();
      expect(f.query.mock.calls.map(([sql]) => sql)).toEqual([
        'begin isolation level repeatable read read only',
        POSTGRES_BINDING_READER_ROLE_QUERY,
        'rollback',
      ]);
    },
  );
  it('destroys connection if rollback fails', async () => {
    const f = mockReader(async (sql) => {
      if (sql === POSTGRES_PROJECTION_BINDING_FACTS_QUERY || sql === 'rollback')
        throw new Error('offline failure');
      return {
        rows:
          sql === POSTGRES_BINDING_READER_ROLE_QUERY
            ? [{ role_name: role, rolsuper: false, rolbypassrls: false }]
            : [],
      };
    });
    await expect(
      f.reader.inspectExistingFacts(request()),
    ).rejects.toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });
    expect(f.release).toHaveBeenCalledExactlyOnceWith(true);
  });
  it.each([
    'postgres',
    'supabase_admin',
    'service_role',
    'authenticated',
    'anon',
    'unsafe;role',
  ])('rejects forbidden role %s', (readerRole) =>
    expect(() =>
      createPostgresServerReadBindingFactsReader({
        pool: {} as Pick<Pool, 'connect'>,
        readerRole,
      }),
    ).toThrow(),
  );
  it.each([
    request({ projectionSelector: null }),
    request({ finalSelector: finalRequest().finalSelector }),
    request({ worldId: 'invalid' }),
    request({
      projectionSelector: { classification: 'ADMIN', scopeKey: 'COUNTRY_A' },
    }),
  ])('rejects malformed/ambiguous request before SQL', async (r) => {
    const f = mockReader();
    expect(await f.reader.inspectExistingFacts(r)).toBeNull();
    expect(f.connect).not.toHaveBeenCalled();
  });
  it('rejects malformed canonical seed even with one matching scope row', async () => {
    const f = await fixture();
    const seedRow = (
      await f.db.query<Record<string, unknown>>(
        POSTGRES_OPENING_HEAD_FACTS_QUERY,
        [world],
      )
    ).rows[0];
    const scopeRow = (
      await f.db.query(POSTGRES_PROJECTION_BINDING_FACTS_QUERY, [
        subject,
        world,
        'OFFICE_PRIVATE',
        privateScope,
      ])
    ).rows[0];
    const m = mockReader(async (sql) => ({
      rows:
        sql === POSTGRES_BINDING_READER_ROLE_QUERY
          ? [{ role_name: role, rolsuper: false, rolbypassrls: false }]
          : sql === POSTGRES_PROJECTION_BINDING_FACTS_QUERY
            ? [scopeRow]
            : sql === POSTGRES_OPENING_HEAD_FACTS_QUERY
              ? [{ ...seedRow, canonical_payload: '{}' }]
              : [],
    }));
    expect(await m.reader.inspectExistingFacts(request())).toBeNull();
  });
});
