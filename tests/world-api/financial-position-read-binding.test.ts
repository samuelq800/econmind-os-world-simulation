import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  acquireWorldWriterLease,
  createWorldWriterCommitAssertion,
  worldWriterLeaseRequest,
  worldId,
  workerId,
  countryId,
  officeId,
} from '@econmind/core';
import {
  AuthoritativeActivityReadProjectionPublisher,
  officePrivateReadProjectionScopeKey,
} from '../../apps/world-worker/src/index.js';
import { createPostgresRuntimeReadExecutor } from '../../apps/world-api/src/integration/postgres-runtime-read-executor.js';
import {
  createWorldReadRequest,
  readEntitledWorldProjection,
  parseSupabaseAuthSubject,
  type ParameterizedPgReadExecutor,
} from '../../apps/world-api/src/index.js';
import { createPGliteV09AtomicTestDatabase } from '../support/v09-atomic-database.js';
import {
  persistVisibilitySeed,
  admitVisibilitySeed,
} from '../support/g-economic-visibility-fixture.js';
import { persistCanonicalVisibilityMovement } from '../support/g-canonical-financial-movement-fixture.js';

// Real PGlite SQL/roles/policies through the actual production reader chain.
// PoolClient is only a serial SQL transport bridge, never a fake binding port.
// Native PostgreSQL connection isolation/concurrency remains NOT_RUN.
const db = createPGliteV09AtomicTestDatabase();
const world = worldId('WORLD_POSITION_BINDING_TEST'),
  worker = workerId('WORKER_POSITION_BINDING_TEST');
const subject = parseSupabaseAuthSubject(
  '550e8400-e29b-41d4-a716-446655440011',
);
const other = parseSupabaseAuthSubject('550e8400-e29b-41d4-a716-446655440012');
const at = '2026-09-14T00:00:00.000Z';
const role = 'test_only_position_reader',
  publisherRole = 'test_only_position_publisher';
const scope = officePrivateReadProjectionScopeKey({
  countryId: countryId('COUNTRY_SELLER'),
  officeId: officeId('FINANCE'),
});
let reset = Promise.resolve();
let executor: ParameterizedPgReadExecutor;
let canonicalPayload: string;
let fingerprint: string;
const sqlTrace: string[] = [];
const pool: Pick<Pool, 'connect'> = {
  async connect() {
    await reset;
    await db.query(`set role ${role}`);
    const client = {
      async query(text: string, values?: unknown[]) {
        sqlTrace.push(text);
        return db.query(text, values);
      },
      release() {
        reset = db.query('reset role').then(() => undefined);
      },
    };
    return client as unknown as PoolClient;
  },
};
const read = (
  selected: ParameterizedPgReadExecutor = executor,
  authSubject = subject,
) =>
  readEntitledWorldProjection({
    executor: selected,
    authSubject,
    request: createWorldReadRequest({
      requestId: '123e4567-e89b-42d3-a456-426614174010',
      worldId: world,
      classification: 'OFFICE_PRIVATE',
      scopeKey: scope,
    }),
  });
const restore = async () => {
  await reset;
  await db.query(
    'update world_v2.read_projection set payload=$2::jsonb where world_id=$1',
    [world, canonicalPayload],
  );
  await db.query(
    'update world_v2.world_head set world_version=1,event_sequence=1 where world_id=$1',
    [world],
  );
};
beforeAll(async () => {
  for (const name of [
    '0001_world_v2_namespace.sql',
    '0002_world_v2_command_event_ledger.sql',
    '0003_world_v2_command_receipts_outbox.sql',
    '0004_world_v2_receipt_event_set_integrity.sql',
    '0005_world_v2_writer_lease_fencing.sql',
    '0006_world_v2_writer_lease_lineage_guard.sql',
    '0007_world_v2_atomic_transition_facts.sql',
    '0008_world_v2_materialization_recovery.sql',
    '0009_world_v2_posting_payload_integrity.sql',
    '0010_world_v2_command_claim_fencing.sql',
    '0011_world_v2_current_commit_authorization.sql',
    '0012_world_v2_command_claim_active_lease_guard.sql',
    '0013_world_v2_read_projection_boundary.sql',
  ])
    await db.executeScript(
      await readFile(
        new URL('../../database/migrations/artifacts/' + name, import.meta.url),
        'utf8',
      ),
    );
  await db.query('insert into world_v2.world_head(world_id)values($1)', [
    world,
  ]);
  const seed = await persistVisibilitySeed(db, world);
  fingerprint = seed.fingerprint;
  await admitVisibilitySeed(db, world);
  await persistCanonicalVisibilityMovement(db, seed, '3');
  await db.query(
    `insert into world_v2.current_commit_authorization(world_id,auth_subject,country_id,office_id,capability,team_id,authorization_version,active,refreshed_at_real)
    values($1,$2::uuid,'COUNTRY_SELLER','FINANCE','READ','TEAM_POSITION_TEST','REV_POSITION_TEST',true,$3)`,
    [world, subject, at],
  );
  await db.query(
    `insert into world_v2.runtime_read_seat(seat_ref,world_id,auth_subject,country_id,office_id,team_id,authorization_revision)
    values('SEAT_POSITION_TEST',$1,$2::uuid,'COUNTRY_SELLER','FINANCE','TEAM_POSITION_TEST','REV_POSITION_TEST')`,
    [world, subject],
  );
  await db.query(
    `insert into world_v2.projection_entitlement(world_id,auth_subject,classification,scope_key,authorization_version,granted_at)
    values($1,$2::uuid,'OFFICE_PRIVATE',$3,'REV_POSITION_TEST',$4)`,
    [world, subject, scope, at],
  );
  await db.query(
    'select * from world_v2.acquire_world_writer_lease($1,$2,$3,300000)',
    [world, worker, at],
  );
  const lease = acquireWorldWriterLease(
    null,
    worldWriterLeaseRequest(world, worker, at, '2026-09-14T00:05:00.000Z'),
  );
  await new AuthoritativeActivityReadProjectionPublisher({
    database: db,
    workerId: worker,
  }).replace({
    assertion: createWorldWriterCommitAssertion(lease.lease, '1'),
    observedAtReal: at,
  });
  canonicalPayload = (
    await db.query<{ payload: string }>(
      'select payload::text as payload from world_v2.read_projection where world_id=$1 and scope_key=$2',
      [world, scope],
    )
  ).rows[0]!.payload;
  // Disposable fixture-only provisioning. No source SQL/migration/grant changes.
  await db.executeScript(`create role ${role} nologin nosuperuser nobypassrls nocreaterole nocreatedb noreplication;
    create role ${publisherRole} nologin nosuperuser nobypassrls;
    grant usage on schema world_v2 to ${role};
    grant select on world_v2.current_commit_authorization,world_v2.projection_entitlement,world_v2.read_projection,world_v2.world_head,world_v2.opening_seed,world_v2.command_submission,world_v2.runtime_read_seat,world_v2.runtime_opening_admission to ${role};
    create policy test_only_position_seed_read on world_v2.opening_seed for select to ${role} using(exists(select 1 from world_v2.runtime_read_seat s where s.world_id=opening_seed.world_id and s.auth_subject::text=current_setting('request.jwt.claim.sub',true)));`);
  executor = createPostgresRuntimeReadExecutor({
    pool,
    readerRole: role,
    authorizationPublisherRole: publisherRole,
  });
});
afterAll(async () => {
  await reset;
  await db.close();
});

it('binds actual sole-publisher opening position to the actual persisted admission context in the subject-bound read snapshot', async () => {
  const result = await read();
  expect(result).toMatchObject({
    payload: {
      ledger: {
        authoritativeFinancialPosition: {
          status: 'AUTHORIZED_FILTERED',
          opening: {
            seedId: 'SEED_VISIBILITY_TEST',
            seedFingerprint: fingerprint,
          },
          sourceHead: { worldVersion: '1', eventSequence: '1' },
        },
      },
    },
  });
  const positions = (
    result!.payload as {
      ledger: {
        authoritativeFinancialPosition: {
          positions: { accountId: string; netDebitBalance: string }[];
        };
      };
    }
  ).ledger.authoritativeFinancialPosition.positions;
  expect(
    positions.find((p) => p.accountId === 'ACCOUNT_ACTIVITY_SELLER_CASH')
      ?.netDebitBalance,
  ).toBe('13');
  expect(sqlTrace).toContain('begin isolation level repeatable read read only');
  expect(
    sqlTrace.some((sql) =>
      sql.includes('from world_v2.runtime_opening_admission'),
    ),
  ).toBe(true);
  expect(
    sqlTrace.some((sql) => sql.includes('from world_v2.runtime_read_seat')),
  ).toBe(true);
  expect(JSON.stringify(result)).not.toMatch(
    /verifiedProjectionAuthority|test_only_position_reader|SEAT_POSITION_TEST|ADMISSION_VISIBILITY_TEST/,
  );
  await expect(read(executor, other)).resolves.toBeNull();
});

it.each(['wrongSeed', 'wrongHash', 'staleHead'])(
  'rejects %s cached absolute position against real current durable facts',
  async (failure) => {
    await restore();
    try {
      const payload = JSON.parse(canonicalPayload);
      if (failure === 'wrongSeed')
        payload.ledger.authoritativeFinancialPosition.opening.seedId =
          'SEED_OTHER';
      if (failure === 'wrongHash')
        payload.ledger.authoritativeFinancialPosition.opening.seedFingerprint =
          'sha256:' + createHash('sha256').update('other').digest('hex');
      if (failure === 'staleHead')
        await db.query(
          'update world_v2.world_head set world_version=2,event_sequence=2 where world_id=$1',
          [world],
        );
      else
        await db.query(
          'update world_v2.read_projection set payload=$2::jsonb where world_id=$1 and scope_key=$3',
          [world, JSON.stringify(payload), scope],
        );
      await expect(read()).rejects.toMatchObject({
        code: 'PROTOCOL_ERROR',
        retryable: false,
      });
    } finally {
      await restore();
    }
  },
);

it.each([
  'missingContext',
  'wrongSubject',
  'malformedContext',
  'throwingContext',
])(
  'fails closed and sanitizes %s returned by a server executor',
  async (failure) => {
    await restore();
    const bad: ParameterizedPgReadExecutor = {
      query: async (request) => {
        const actual = await executor.query(request);
        if (failure === 'missingContext') return { rows: actual.rows };
        if (failure === 'throwingContext')
          return Object.defineProperty(
            { ...actual },
            'verifiedProjectionAuthority',
            {
              get() {
                throw new Error('SENSITIVE_CONTEXT_TEST');
              },
            },
          );
        const context =
          failure === 'wrongSubject'
            ? { ...actual.verifiedProjectionAuthority, authSubject: other }
            : {
                ...actual.verifiedProjectionAuthority,
                seedRef: { secret: 'SENSITIVE_CONTEXT_TEST' },
              };
        return { ...actual, verifiedProjectionAuthority: context as never };
      },
    };
    const error = await read(bad).catch((e) => e as Error & { code: string });
    expect(error).toMatchObject({ code: 'PROTOCOL_ERROR', retryable: false });
    expect(String(error)).not.toContain('SENSITIVE_CONTEXT_TEST');
  },
);

it('retains denied and prior classified movement-only payloads without minting an absolute claim', async () => {
  await restore();
  try {
    const payload = JSON.parse(canonicalPayload);
    delete payload.ledger.authoritativeFinancialPosition;
    await db.query(
      'update world_v2.read_projection set payload=$2::jsonb where world_id=$1 and scope_key=$3',
      [world, JSON.stringify(payload), scope],
    );
    const legacy = await read();
    expect(
      (legacy!.payload as typeof payload).ledger.financialPositions[0]
        .netDebitBalance,
    ).toBe('3');
    expect(
      (legacy!.payload as typeof payload).ledger.authoritativeFinancialPosition,
    ).toBeUndefined();
    payload.ledger.authoritativeFinancialPosition = {
      schemaVersion: 'authoritative-financial-position-v1',
      status: 'NOT_AUTHORIZED',
      reason: 'SCOPE_NOT_AUTHORIZED',
    };
    await db.query(
      'update world_v2.read_projection set payload=$2::jsonb where world_id=$1 and scope_key=$3',
      [world, JSON.stringify(payload), scope],
    );
    await expect(read()).resolves.toMatchObject({
      payload: {
        ledger: {
          authoritativeFinancialPosition: { status: 'NOT_AUTHORIZED' },
        },
      },
    });
  } finally {
    await restore();
  }
});
