/** TEST_PROTOCOL_ONLY. Real SQL/roles in owned serial PGlite, not native or formal admission. */
import { createHash } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import {
  acquireWorldWriterLease,
  canonicalSerialize,
  createWorldWriterCommitAssertion,
  CURRENT_REPLAY_BINDING,
  parseOpeningSeed,
  workerId,
  worldId,
  worldWriterLeaseRequest,
} from '@econmind/core';
import {
  AuthoritativeActivityReadProjectionPublisher,
  CurrentAuthorizationEntitlementPublisher,
} from '../../apps/world-worker/src/index.js';
import { parseSupabaseAuthSubject } from '../../apps/world-api/src/integration/identity.js';
import { V09TransactionRolledBackError } from '../support/v09-atomic-contract.js';
import {
  WORLD_V2_ENTITLED_PROJECTION_QUERY,
  type ParameterizedPgReadRequest,
} from '../../apps/world-api/src/integration/postgres-read-adapter.js';
import {
  createTestOnlyPersistedReadContextFixture,
  protocolFixtureLifecycle,
  type TestOnlyPersistedReadContextFixture,
} from '../support/test-only-persisted-read-context-fixture.js';

const WORLD = worldId('WORLD_V10_COUNTRY_FLOW_TEST');
const WORKER = workerId('WORKER_V10_COUNTRY_FLOW_TEST');
const SUBJECT = parseSupabaseAuthSubject(
  '550e8400-e29b-41d4-a716-446655440021',
);
const OTHER = parseSupabaseAuthSubject('550e8400-e29b-41d4-a716-446655440022');
const SCOPE = 'OFFICE_434F554E5452595F53454C4C4552_5452414445';
const AT = '2026-09-14T00:00:00.000Z';
const live: Readonly<TestOnlyPersistedReadContextFixture>[] = [];
const before = protocolFixtureLifecycle();
let allocations = 0;
async function using(
  options?: Parameters<typeof createTestOnlyPersistedReadContextFixture>[0],
) {
  const fixture = await createTestOnlyPersistedReadContextFixture(options);
  allocations++;
  live.push(fixture);
  return fixture;
}
afterEach(async () => {
  for (const fixture of live.splice(0)) await fixture.close();
});
afterAll(() => {
  const actual = protocolFixtureLifecycle();
  expect(actual.created - before.created).toBe(allocations);
  expect(actual.closed - before.closed).toBe(allocations);
  expect(actual.open).toBe(0);
  expect(actual.peakOpen).toBe(1);
  expect(allocations).toBeLessThanOrEqual(20);
});
function request(signal?: AbortSignal): ParameterizedPgReadRequest {
  return {
    text: WORLD_V2_ENTITLED_PROJECTION_QUERY,
    values: [SUBJECT, WORLD, 'OFFICE_PRIVATE', SCOPE, '0', '0'],
    verifiedAuthSubject: SUBJECT,
    ...(signal ? { signal } : {}),
  };
}
async function projections(f: Readonly<TestOnlyPersistedReadContextFixture>) {
  await f.database.query(
    'select * from world_v2.acquire_world_writer_lease($1,$2,$3,300000)',
    [WORLD, WORKER, AT],
  );
  const lease = acquireWorldWriterLease(
    null,
    worldWriterLeaseRequest(WORLD, WORKER, AT, '2026-09-14T00:05:00.000Z'),
  );
  const assertion = createWorldWriterCommitAssertion(lease.lease, '0');
  await new AuthoritativeActivityReadProjectionPublisher({
    database: f.database,
    workerId: WORKER,
  }).replace({ assertion, observedAtReal: AT });
  await new CurrentAuthorizationEntitlementPublisher({
    database: f.database,
    workerId: WORKER,
  }).replace({ assertion, observedAtReal: AT });
}
const count = async (f: Readonly<TestOnlyPersistedReadContextFixture>) =>
  (
    await f.database.query<{ n: number }>(
      'select count(*)::int as n from test_protocol.persisted_read_context',
    )
  ).rows[0]!.n;

describe('TEST_PROTOCOL_ONLY persisted context contract', () => {
  it('persists exact truthful canonical source and retries committed intent before a later-head genesis check', async () => {
    const f = await using();
    const first = await f.publishContext();
    const row = (
      await f.database.query<{
        canonical_seed_payload: string;
        source_bytes_sha256: string;
        seed_fingerprint: string;
        canonical_replay_binding: string;
      }>(
        'select canonical_seed_payload,source_bytes_sha256,seed_fingerprint,canonical_replay_binding from test_protocol.persisted_read_context',
      )
    ).rows[0]!;
    const seed = parseOpeningSeed(
      JSON.parse(row.canonical_seed_payload) as unknown,
      (s) => createHash('sha256').update(s).digest('hex'),
    );
    expect(seed.sources[0]?.sourceKind).toBe('TEST_FIXTURE');
    expect(seed.inventoryEntries).toEqual([]);
    expect(seed.financialBatches).toEqual([]);
    expect(seed.fingerprint).toBe(row.seed_fingerprint);
    expect(row.source_bytes_sha256).toBe(
      '85501ca4f4605094f43e90a790990d788171ff6afe6a6c14cf805c05aac3a3b5',
    );
    expect(row.canonical_replay_binding).toBe(
      canonicalSerialize(CURRENT_REPLAY_BINDING),
    );
    // State-machine-only later-head probe, NOT evidence of an economic transition.
    // The unchanged original integration cases separately commit the real1/1 activity.
    await f.database.query(
      'update world_v2.world_head set world_version=1,event_sequence=1 where world_id=$1',
      [WORLD],
    );
    expect(await f.publishContext()).toEqual({
      ...first,
      disposition: 'EXISTING_TEST_PROTOCOL_CONTEXT',
    });
    expect(await count(f)).toBe(1);
    expect(
      (
        await f.database.query(
          'select count(*)::int as n from world_v2.authoritative_event',
        )
      ).rows,
    ).toEqual([{ n: 0 }]);
    expect(
      (
        await f.database.query(
          "select to_regclass('world_v2.opening_seed') as opening,to_regclass('world_v2.runtime_opening_admission') as admission",
        )
      ).rows,
    ).toEqual([{ opening: null, admission: null }]);
  });

  it('rejects a new context after the actual head has advanced without inserting metadata', async () => {
    const f = await using();
    await f.database.query(
      'update world_v2.world_head set world_version=1,event_sequence=1 where world_id=$1',
      [WORLD],
    );
    await expect(f.publishContext()).rejects.toMatchObject({
      name: 'V09TransactionRolledBackError',
      cause: { code: 'PROTOCOL_ERROR' },
    });
    expect(await count(f)).toBe(0);
  });

  it('rolls back context and validation metadata on actual precommit failure', async () => {
    const f = await using({ faultPoint: 'AFTER_CONTEXT_INSERT_BEFORE_COMMIT' });
    await expect(f.publishContext()).rejects.toMatchObject({
      name: 'V09TransactionRolledBackError',
      cause: { message: 'TEST_ONLY_CONTEXT_BEFORE_COMMIT' },
    });
    expect(await count(f)).toBe(0);
    expect((await f.publishContext()).disposition).toBe(
      'TEST_PROTOCOL_CONTEXT_PUBLISHED',
    );
    expect(await count(f)).toBe(1);
  });

  it('separates acknowledged-commit response loss from UNKNOWN and reads back the identical intent', async () => {
    const f = await using({
      faultPoint: 'AFTER_COMMIT_BEFORE_ACKNOWLEDGEMENT',
    });
    await expect(f.publishContext()).rejects.toThrow(
      'TEST_ONLY_KNOWN_COMMIT_RESPONSE_LOST',
    );
    expect(await count(f)).toBe(1);
    await f.database.query(
      'update world_v2.world_head set world_version=1,event_sequence=1 where world_id=$1',
      [WORLD],
    );
    expect((await f.publishContext()).disposition).toBe(
      'EXISTING_TEST_PROTOCOL_CONTEXT',
    );
    expect(await count(f)).toBe(1);
  });

  it('rejects an externally supplied database before allocating any owned instance', async () => {
    const start = protocolFixtureLifecycle();
    await expect(
      createTestOnlyPersistedReadContextFixture({ database: {} } as never),
    ).rejects.toThrow('EXTERNAL_INPUT_DENIED');
    expect(protocolFixtureLifecycle()).toEqual(start);
  });

  it('derives all eight context fields from the actual persisted subject-bound same-head SQL snapshot', async () => {
    const f = await using();
    await f.publishContext();
    await projections(f);
    const actual = await f.executor.query(request());
    const source = (
      await f.database.query<{
        world_id: string;
        seed_id: string;
        seed_fingerprint: string;
      }>(
        'select world_id,seed_id,seed_fingerprint from test_protocol.persisted_read_context',
      )
    ).rows[0]!;
    expect(actual.rows).toHaveLength(1);
    expect(actual.verifiedProjectionAuthority).toEqual({
      authSubject: SUBJECT,
      worldId: source.world_id,
      classification: 'OFFICE_PRIVATE',
      scopeKey: SCOPE,
      seedRef: source.seed_id,
      contentHash: source.seed_fingerprint,
      worldVersion: '0',
      eventSequence: '0',
    });
    expect(
      (
        await f.database.query(
          'select auth_subject::text,capability from world_v2.current_commit_authorization',
        )
      ).rows,
    ).toEqual([{ auth_subject: SUBJECT, capability: 'TRADE_POLICY' }]);
    expect(
      (
        await f.database.query(
          'select count(*)::int as n from world_v2.runtime_read_seat',
        )
      ).rows,
    ).toEqual([{ n: 1 }]);
  });

  it.each(['capability', 'revision', 'entitlement', 'head'] as const)(
    'fails closed after actual persisted %s becomes stale',
    async (fault) => {
      const f = await using();
      await f.publishContext();
      await projections(f);
      if (fault === 'capability')
        await f.database.query(
          'update world_v2.current_commit_authorization set active=false',
        );
      if (fault === 'revision')
        await f.database.query(
          "update world_v2.current_commit_authorization set authorization_version='AUTH_CHANGED'",
        );
      if (fault === 'capability' || fault === 'revision')
        await f.database.transaction(async (tx) => {
          await tx.query('set local role test_only_protocol_authz_publisher');
          await tx.query(
            'update world_v2.current_commit_authorization set refreshed_at_real=$1',
            ['2026-09-15T00:00:00.000Z'],
          );
        });
      if (fault === 'entitlement')
        await f.database.query(
          'update world_v2.projection_entitlement set active=false,revoked_at=$1',
          [AT],
        );
      if (fault === 'head')
        await f.database.query(
          'update world_v2.world_head set world_version=1,event_sequence=1',
        );
      if (fault === 'head')
        await expect(f.executor.query(request())).rejects.toMatchObject({
          code: 'PROTOCOL_ERROR',
        });
      else expect(await f.executor.query(request())).toEqual({ rows: [] });
    },
  );

  it('requires a persisted context and refuses unentitled subjects, mismatched claims and arbitrary SQL', async () => {
    const f = await using();
    await projections(f);
    await expect(f.executor.query(request())).rejects.toMatchObject({
      code: 'PROTOCOL_ERROR',
    });
    await f.publishContext();
    const r = request();
    expect(
      await f.executor.query({
        ...r,
        verifiedAuthSubject: OTHER,
        values: [OTHER, ...r.values.slice(1)],
      }),
    ).toEqual({ rows: [] });
    await expect(
      f.executor.query({ ...r, verifiedAuthSubject: OTHER }),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
    await expect(
      f.executor.query({ ...r, text: 'select 1' }),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
  });

  it('denies runtime reader DML and retains immutable context without installing formal admission', async () => {
    const f = await using();
    await f.publishContext();
    expect(
      (
        await f.database.query(`select
          has_column_privilege('test_only_protocol_authz_publisher',
            'world_v2.current_commit_authorization','refreshed_at_real','UPDATE') as publisher_lock,
          has_column_privilege('test_only_protocol_authz_publisher',
            'world_v2.current_commit_authorization','authorization_version','UPDATE') as publisher_revision,
          has_column_privilege('test_only_protocol_authz_publisher',
            'world_v2.current_commit_authorization','active','UPDATE') as publisher_active,
          has_any_column_privilege('test_only_protocol_reader',
            'world_v2.current_commit_authorization','UPDATE') as reader_update`)
      ).rows,
    ).toEqual([
      {
        publisher_lock: true,
        publisher_revision: false,
        publisher_active: false,
        reader_update: false,
      },
    ]);
    for (const column of [
      'world_id',
      'auth_subject',
      'country_id',
      'office_id',
      'capability',
      'team_id',
      'authorization_version',
      'active',
    ])
      await expect(
        f.database.transaction(async (tx) => {
          await tx.query('set local role test_only_protocol_authz_publisher');
          await tx.query(
            `update world_v2.current_commit_authorization set ${column}=${column}`,
          );
        }),
      ).rejects.toMatchObject({
        name: 'V09TransactionRolledBackError',
        cause: { code: '42501' },
      });
    await expect(
      f.database.transaction(async (tx) => {
        await tx.query('set local role test_only_protocol_reader');
        await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
          SUBJECT,
        ]);
        await tx.query(
          "update test_protocol.persisted_read_context set model_version='FORGED'",
        );
      }),
    ).rejects.toMatchObject({
      name: 'V09TransactionRolledBackError',
      cause: { code: '42501' },
    });
    await expect(
      f.database.query(
        "update test_protocol.persisted_read_context set model_version='FORGED'",
      ),
    ).rejects.toThrow('append-only');
    expect((await f.publishContext()).disposition).toBe(
      'EXISTING_TEST_PROTOCOL_CONTEXT',
    );
  });

  it('reproduces the original seat SQL lock denial without the fixture-only timestamp privilege', async () => {
    const f = await using();
    await f.database.query(
      'revoke update (refreshed_at_real) on world_v2.current_commit_authorization from test_only_protocol_authz_publisher',
    );
    const failure = await f.database
      .transaction(async (tx) => {
        await tx.query('set local role test_only_protocol_authz_publisher');
        await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
          SUBJECT,
        ]);
        // Exact source SELECT from RuntimeReadBindingStore.bindCurrentSeat.
        await tx.query(
          `select country_id, office_id, capability, team_id, authorization_version
        from world_v2.current_commit_authorization
        where world_id = $1 and auth_subject = $2::uuid and active
        order by country_id, office_id, capability for share`,
          [WORLD, SUBJECT],
        );
      })
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(failure).toMatchObject({
      name: 'V09TransactionRolledBackError',
      cause: {
        code: '42501',
        message: 'permission denied for table current_commit_authorization',
      },
    });
    // Log actual allowlisted fields only after asserting the closed SQL denial.
    if (
      failure instanceof V09TransactionRolledBackError &&
      failure.cause instanceof Error
    )
      console.info(
        'TEST_ONLY_ORIGINAL_SEAT_LOCK_DENIAL',
        JSON.stringify({
          code: Reflect.get(failure.cause, 'code'),
          message: failure.cause.message,
        }),
      );
  });

  it('checks pre-abort and queued abort, settles the real operation and closes idempotently', async () => {
    const f = await using();
    await f.publishContext();
    await projections(f);
    const early = new AbortController();
    early.abort();
    await expect(f.executor.query(request(early.signal))).rejects.toMatchObject(
      { code: 'CANCELLED' },
    );
    let release: () => void = () => undefined,
      entered: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const holding = f.database.transaction(async (tx) => {
      await tx.query('select 1');
      entered();
      await gate;
    });
    await started;
    const abort = new AbortController();
    const pending = f.executor.query(request(abort.signal));
    const assertion = expect(pending).rejects.toMatchObject({
      code: 'CANCELLED',
    });
    abort.abort();
    release();
    await holding;
    await assertion;
    await f.close();
    await f.close();
    await expect(f.database.query('select 1')).rejects.toThrow(
      'DATABASE_UNAVAILABLE',
    );
  });

  it('withholds authority after actual fact reads and rolls back local role/subject before reuse', async () => {
    const f = await using({ faultPoint: 'READ_AFTER_FACTS_BEFORE_RETURN' });
    await f.publishContext();
    await projections(f);
    const role = await f.database.query(
      "select current_user as role,current_setting('request.jwt.claim.sub',true) as subject",
    );
    await expect(f.executor.query(request())).rejects.toMatchObject({
      code: 'CANCELLED',
    });
    expect(
      await f.database.query(
        "select current_user as role,current_setting('request.jwt.claim.sub',true) as subject",
      ),
    ).toEqual(role);
    expect((await f.executor.query(request())).rows).toHaveLength(1);
  });

  it('rejects a conflicting persisted seed fingerprint without rewriting the immutable existing context', async () => {
    const first = await using();
    await first.publishContext();
    const saved = JSON.parse(
      (
        await first.database.query<{ payload: string }>(
          'select to_jsonb(c)::text as payload from test_protocol.persisted_read_context c',
        )
      ).rows[0]!.payload,
    ) as Record<string, unknown>;
    await first.close();
    const second = await using();
    saved.seed_fingerprint = 'sha256:' + 'a'.repeat(64);
    await second.database.query(
      'insert into test_protocol.persisted_read_context select * from json_populate_record(null::test_protocol.persisted_read_context,$1::json)',
      [JSON.stringify(saved)],
    );
    await expect(second.publishContext()).rejects.toMatchObject({
      name: 'V09TransactionRolledBackError',
      cause: { code: 'PROTOCOL_ERROR' },
    });
    expect(await count(second)).toBe(1);
  });
});
