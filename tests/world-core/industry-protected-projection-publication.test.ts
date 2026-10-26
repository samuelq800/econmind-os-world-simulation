// New protected-publication controls only. Protocol audits below are TEST_ONLY,
// not native locks, source installation or valid production-admission evidence.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, it, expect } from 'vitest';
import {
  CURRENT_REPLAY_BINDING,
  OPENING_SEED_SCHEMA_VERSION,
  OPENING_SOURCE_SCHEMA_VERSION,
  acquireWorldWriterLease,
  worldWriterLeaseRequest,
  createWorldWriterCommitAssertion,
  canonicalSerialize,
  createOpeningSource,
  createOpeningSeed,
  openingSourceId,
  openingSeedId,
  workerId,
  worldId,
  bindAuthoritativeTransition,
  type IndustryPersistenceSchemaReadContextV1,
} from '@econmind/core';
import { AuthoritativeActivityReadProjectionPublisher } from '../../apps/world-worker/src/projections/authoritative-activity-read-projection-publisher.js';
import type { IndustryGoverningCustodyPort } from '../../apps/world-worker/src/projections/industry-production-governing-source.js';
import type {
  IndustryProductionHistoricalReadGuard,
  IndustryProductionHistoricalReadRequest,
  IndustryProductionHistoricalReadObservation,
} from '../../apps/world-worker/src/persistence/industry-production-source-cutoff.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';
import { createPGliteV09AtomicTestDatabase } from '../support/v09-atomic-database.js';
import {
  persistVisibilitySeed,
  admitVisibilitySeed,
} from '../support/g-economic-visibility-fixture.js';
import { persistCanonicalVisibilityMovement } from '../support/g-canonical-financial-movement-fixture.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const WORLD = worldId('WORLD_INDUSTRY_CONSUMER_EMPTY_TEST'),
  WORKER = workerId('WORKER_INDUSTRY_CONSUMER_TEST');
const at = '2026-10-25T08:00:00.000Z';
type Row = Record<string, unknown>;
function protocol(
  input: {
    badLineageHead?: boolean;
    productionLedgerRow?: boolean;
    otherOfficeOnly?: boolean;
    countMismatch?: boolean;
  } = {},
) {
  const source = createOpeningSource(
    {
      schemaVersion: OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: openingSourceId('SOURCE_EMPTY_G_INDUSTRY_PROTOCOL'),
      sourceKind: 'AUTHORITATIVE_DATASET',
      locator:
        'dataset://TEST_ONLY_EMPTY_NONPRODUCTION_SQL_PROTOCOL_NOT_ADMITTED',
      sourceVersion: 'TEST_ONLY.1',
      payload: { TEST_ONLY: 'EMPTY_PROTOCOL_NOT_SOURCE_ADMISSION' },
    },
    sha,
  );
  const seed = createOpeningSeed(
    {
      schemaVersion: OPENING_SEED_SCHEMA_VERSION,
      seedId: openingSeedId('SEED_EMPTY_G_INDUSTRY_PROTOCOL'),
      worldId: WORLD,
      openingWorldVersion: '0',
      replayBinding: CURRENT_REPLAY_BINDING,
      sources: [source],
      inventoryEntries: [],
      financialBatches: [],
    },
    sha,
  );
  const { fingerprint: _fingerprint, ...seedIntent } = seed;
  void _fingerprint;
  const queries: string[] = [],
    writes: { classification: string; payload: Row }[] = [];
  let headReads = 0,
    transactions = 0,
    custodyCalls = 0;
  const executor: SqlExecutor = {
    async query<Result>(sql: string, parameters = []) {
      queries.push(sql);
      let rows: unknown[];
      if (sql.includes('assert_world_writer_commit_guard'))
        rows = [{ world_version: '0', event_sequence: '0' }];
      else if (sql.includes('current_commit_authorization'))
        rows = (
          input.otherOfficeOnly ? ['SOCIAL'] : ['INDUSTRY', 'SOCIAL']
        ).map((office_id) => ({ country_id: 'COUNTRY_01', office_id }));
      else if (sql.includes('to_regclass'))
        rows = [{ opening: null, admission: null }];
      else if (sql.includes('from world_v2.world_head')) {
        headReads++;
        rows = [
          {
            world_version: input.badLineageHead ? '1' : '0',
            event_sequence: '0',
          },
        ];
      } else if (sql.includes('from world_v2.opening_seed'))
        rows = [
          {
            world_id: WORLD,
            seed_id: seed.seedId,
            opening_world_version: '0',
            replay_binding: canonicalSerialize(seed.replayBinding),
            canonical_payload: canonicalSerialize(seedIntent),
            seed_fingerprint: seed.fingerprint,
          },
        ];
      else if (
        sql.includes('from world_v2.inventory_posting') &&
        input.productionLedgerRow
      )
        rows = [
          {
            canonical_payload: canonicalSerialize({
              schemaVersion: 'production-consumption-posting-v1',
            }),
            world_version_after: '0',
          },
        ];
      else if (
        sql.includes('from world_v2.authoritative_event') ||
        sql.includes('from world_v2.inventory_posting') ||
        sql.includes('from world_v2.financial_posting_batch') ||
        sql.includes('from world_v2.command_receipt')
      )
        rows = [];
      else if (sql.includes('delete from world_v2.read_projection')) rows = [];
      else if (sql.includes('insert into world_v2.read_projection')) {
        writes.push({
          classification: String(parameters[1]),
          payload: JSON.parse(String(parameters[6])) as Row,
        });
        rows = [];
      } else if (
        sql.includes('count(*)') &&
        sql.includes('from world_v2.read_projection')
      )
        rows = [{ count: input.countMismatch ? '1' : '0' }];
      else throw new Error('Unexpected protocol query');
      return { rows: rows as Result[], rowCount: rows.length };
    },
  };
  const database: SqlDatabase = {
    query: async () => {
      throw new Error('Unexpected pool query');
    },
    transaction: async (fn) => {
      transactions++;
      return fn(executor);
    },
  };
  const custody: IndustryGoverningCustodyPort = {
    async withSnapshotFrom() {
      custodyCalls++;
      throw new Error(
        'No genuine production target: custody must not be called',
      );
    },
  };
  const lease = acquireWorldWriterLease(
    null,
    worldWriterLeaseRequest(WORLD, WORKER, at, '2026-10-25T09:00:00.000Z'),
  );
  return {
    executor,
    database,
    queries,
    writes,
    custody,
    assertion: createWorldWriterCommitAssertion(lease.lease, '0'),
    calls: () => ({ transactions, custodyCalls, headReads }),
  };
}

function profile() {
  return {
    target: {
      targetDeploymentRef: 'TEST_ONLY_PUBLISHER',
      databaseIdentityRef: 'TEST_ONLY_DB',
    },
    build: {
      constructorSourceCommit: 'a'.repeat(40),
      constructorBlobSHA256: 'b'.repeat(64),
      decoderProtocol: 'industry-production-decoder-v1' as const,
      decoderBuildSHA256: 'c'.repeat(64),
    },
  };
}
/** Owned inert correspondence only. Its TEST_ONLY resources are not native proof. */
function audit(
  r: Readonly<IndustryProductionHistoricalReadRequest>,
): Readonly<IndustryProductionHistoricalReadObservation> {
  return {
    schemaVersion: 'industry-production-historical-read-observation-v1',
    purpose: r.context.purpose,
    worldId: r.context.worldId,
    checkedHead: r.context.expectedHead,
    target: r.context.target,
    build: r.context.build,
    checkedGroups: r.groups.map((g) => ({
      commandFingerprint: g.command.fingerprint,
      transitionBinding: JSON.parse(
        canonicalSerialize(bindAuthoritativeTransition(g, sha)),
      ) as unknown,
      postingIdentities: g.postingIdentities,
    })),
    representationDecision: {
      issuerRef: 'TEST_ONLY_ISSUER',
      custodyRef: 'TEST_ONLY_CUSTODY',
      decisionRef: 'TEST_ONLY_DECISION',
      revision: '1',
      sourceContentHash: 'sha256:' + 'd'.repeat(64),
    },
    lockedResources: [
      {
        targetDatabaseIdentity: r.context.target.databaseIdentityRef,
        ownerDomainId: 'TEST_ONLY_OWNER',
        resourceKind: 'TEST_ONLY_NO_NATIVE_LOCK',
        canonicalResourceKey: 'TEST_ONLY_R',
        aliasIdentity: 'TEST_ONLY_R',
        lockMode: 'SHARE',
        observationRevision: '1',
        protectedPredicateRef: 'TEST_ONLY_PARENT',
        writerProtocolRevision: '1',
        revokerProtocolRevision: '1',
        postlockObservationRef: 'TEST_ONLY_POSTLOCK',
      },
    ],
  };
}
function publisher(
  f: ReturnType<typeof protocol>,
  guard: IndustryProductionHistoricalReadGuard,
  fixed = profile(),
) {
  return new AuthoritativeActivityReadProjectionPublisher({
    database: f.database,
    workerId: WORKER,
    industryGoverningCustody: f.custody,
    industryProtectedRead: { historicalReadGuard: guard, ...fixed },
  });
}
function replace(
  p: AuthoritativeActivityReadProjectionPublisher,
  f: ReturnType<typeof protocol>,
) {
  return p.replace({ assertion: f.assertion, observedAtReal: at });
}
describe('G protected sole publication finite controls', () => {
  it('GPP04/GPP06 consumes canonical financial movements and absolute positions from one protected prefix', async () => {
    // Existing isolated fixture intentionally installs its own visibility admission.
    // This is nonproduction financial evidence, never Industry/native admission.
    const db = createPGliteV09AtomicTestDatabase();
    try {
      const manifest = JSON.parse(
        await readFile(
          new URL('../../database/migrations/manifest.json', import.meta.url),
          'utf8',
        ),
      ) as { migrations: { release_order: number; path: string }[] };
      // Reuse the shared manifest's original World-only test prefix, no new list.
      for (const migration of manifest.migrations.filter(
        (m) => m.release_order <= 13,
      ))
        await db.executeScript(
          await readFile(
            new URL('../../' + migration.path, import.meta.url),
            'utf8',
          ),
        );
      await db.query('insert into world_v2.world_head(world_id) values($1)', [
        WORLD,
      ]);
      const seed = await persistVisibilitySeed(db, WORLD);
      await admitVisibilitySeed(db, WORLD);
      await persistCanonicalVisibilityMovement(db, seed, '3');
      for (const office of ['FINANCE', 'INDUSTRY'])
        await db.query(
          `insert into world_v2.current_commit_authorization(world_id,auth_subject,country_id,office_id,capability,team_id,authorization_version,active,refreshed_at_real)
          values($1,$2::uuid,'COUNTRY_SELLER',$3,$4,'TEAM_TEST','AUTH_TEST',true,$5)`,
          [
            WORLD,
            '550e8400-e29b-41d4-a716-446655440011',
            office,
            'TEST_' + office,
            at,
          ],
        );
      await db.query(
        'select * from world_v2.acquire_world_writer_lease($1,$2,$3,300000)',
        [WORLD, WORKER, at],
      );
      const trace: string[] = [];
      let guardAt = -1,
        guardCalls = 0,
        transactions = 0;
      const database: SqlDatabase = {
        async query() {
          throw Error('Unexpected pool query');
        },
        async transaction(fn) {
          transactions++;
          return db.transaction((tx) =>
            fn({
              async query<Result extends object>(
                sql: string,
                parameters: readonly unknown[] = [],
              ) {
                trace.push(sql);
                return tx.query<Result>(sql, parameters);
              },
            }),
          );
        },
      };
      const guard: IndustryProductionHistoricalReadGuard = {
        async assertReadFrom(_tx, r) {
          guardCalls++;
          guardAt = trace.length;
          expect(r.actualHeldHead).toEqual({
            worldId: WORLD,
            worldVersion: '1',
            eventSequence: '1',
          });
          expect(r.groups).toHaveLength(0); // Full prefix is nonproduction, not empty.
          return audit(r);
        },
      };
      const custody: IndustryGoverningCustodyPort = {
        async withSnapshotFrom() {
          throw Error('No production target');
        },
      };
      const p = new AuthoritativeActivityReadProjectionPublisher({
        database,
        workerId: WORKER,
        industryGoverningCustody: custody,
        industryProtectedRead: { historicalReadGuard: guard, ...profile() },
      });
      const lease = acquireWorldWriterLease(
        null,
        worldWriterLeaseRequest(WORLD, WORKER, at, '2026-10-25T09:00:00.000Z'),
      );
      await p.replace({
        assertion: createWorldWriterCommitAssertion(lease.lease, '1'),
        observedAtReal: at,
      });
      expect(guardCalls).toBe(1);
      expect(transactions).toBe(1);
      expect(
        trace.filter((s) => s.includes('from world_v2.world_head')),
      ).toHaveLength(2); // Visibility then sole reader, both before R/F.
      expect(
        trace
          .slice(guardAt)
          .some((s) => s.includes('from world_v2.world_head')),
      ).toBe(false);
      expect(
        trace.some((s) =>
          /select canonical_payload, world_version_after\s+from world_v2.financial_posting_batch/u.test(
            s,
          ),
        ),
      ).toBe(false);
      expect(trace.some((s) => s.includes('to_jsonb(event)'))).toBe(false);
      const rows = (
        await db.query<{ payload: unknown }>(
          `select payload from world_v2.read_projection where world_id=$1 and classification='OFFICE_PRIVATE'`,
          [WORLD],
        )
      ).rows;
      type Stored = {
        officeId: string;
        ledger: {
          financialPositions: { netDebitBalance: string }[];
          inventoryPositions: unknown[];
          visibility: { inventoryDetail: string; countrySummary: string };
          authoritativeFinancialPosition: {
            status: string;
            semantics: string;
            sourceHead: unknown;
            positions: { accountId: string; netDebitBalance: string }[];
          };
        };
      };
      const payloads = rows.map(
        (r) =>
          (typeof r.payload === 'string'
            ? JSON.parse(r.payload)
            : r.payload) as Stored,
      );
      const finance = payloads.find((r) => r.officeId === 'FINANCE')!.ledger;
      expect(finance.financialPositions[0]?.netDebitBalance).toBe('3');
      expect(finance.authoritativeFinancialPosition).toMatchObject({
        status: 'AUTHORIZED_FILTERED',
        semantics: 'OPENING_PLUS_POSTING_LINEAGE',
        sourceHead: { worldVersion: '1', eventSequence: '1' },
      });
      expect(
        finance.authoritativeFinancialPosition.positions.find(
          (p) => p.accountId === 'ACCOUNT_ACTIVITY_SELLER_CASH',
        )?.netDebitBalance,
      ).toBe('13');
      expect(finance.inventoryPositions).toEqual([]);
      expect(finance.visibility).toMatchObject({
        inventoryDetail: 'NOT_AUTHORIZED',
        countrySummary: 'NOT_AUTHORIZED',
      });
    } finally {
      await db.close();
    }
  }, 30000);
  it('GPP01 retains default v1 and raw production refusal without the protected binding', async () => {
    const f = protocol();
    await replace(
      new AuthoritativeActivityReadProjectionPublisher({
        database: f.database,
        workerId: WORKER,
      }),
      f,
    );
    expect(f.calls().headReads).toBe(1);
    expect(
      f.writes
        .filter((w) => w.classification === 'OFFICE_PRIVATE')
        .every(
          (w) => w.payload.schemaVersion === 'world-activity-projection-v1',
        ),
    ).toBe(true);
    const bad = protocol({ productionLedgerRow: true });
    await expect(
      replace(
        new AuthoritativeActivityReadProjectionPublisher({
          database: bad.database,
          workerId: WORKER,
        }),
        bad,
      ),
    ).rejects.toThrow('unsupported schema');
    expect(bad.writes).toHaveLength(0);
  });
  it('GPP02 refuses missing fixed custody or malformed expected profile before issuing a view or writing', async () => {
    const f = protocol(),
      guard: IndustryProductionHistoricalReadGuard = {
        async assertReadFrom(_tx, r) {
          return audit(r);
        },
      };
    expect(
      () =>
        new AuthoritativeActivityReadProjectionPublisher({
          database: f.database,
          workerId: WORKER,
          industryProtectedRead: { historicalReadGuard: guard, ...profile() },
        }),
    ).toThrow('guard and custody');
    const bad = profile();
    bad.build.constructorBlobSHA256 = 'bad';
    await expect(replace(publisher(f, guard, bad), f)).rejects.toThrow();
    expect(f.writes).toHaveLength(0);
    expect(f.calls().headReads).toBe(1);
  });
  it('GPP02 captures an owned fixed profile and validates actual H before the guard', async () => {
    const f = protocol(),
      fixed = profile();
    let received: IndustryPersistenceSchemaReadContextV1 | undefined;
    const p = publisher(
      f,
      {
        async assertReadFrom(tx, r) {
          expect(tx).toBe(f.executor);
          received = r.context;
          return audit(r);
        },
      },
      fixed,
    );
    fixed.target.targetDeploymentRef = 'CHANGED_AFTER_CONSTRUCTION';
    await replace(p, f);
    expect(received?.target.targetDeploymentRef).toBe('TEST_ONLY_PUBLISHER');
    expect(Object.isFrozen(fixed.target)).toBe(false);
    const bad = protocol({ badLineageHead: true });
    let calls = 0;
    await expect(
      replace(
        publisher(bad, {
          async assertReadFrom(_tx, r) {
            calls++;
            return audit(r);
          },
        }),
        bad,
      ),
    ).rejects.toThrow();
    expect(calls).toBe(0);
    expect(bad.writes).toHaveLength(0);
  });
  it('GPP03 awaits the actual reader guard even for an empty prefix before any write', async () => {
    const f = protocol(),
      entered = Promise.withResolvers<void>(),
      release = Promise.withResolvers<void>();
    let calls = 0;
    const task = replace(
      publisher(f, {
        async assertReadFrom(tx, r) {
          calls++;
          expect(tx).toBe(f.executor);
          expect(r.groups).toHaveLength(0);
          entered.resolve();
          await release.promise;
          return audit(r);
        },
      }),
      f,
    );
    await entered.promise;
    expect(f.writes).toHaveLength(0);
    release.resolve();
    await task;
    expect(calls).toBe(1);
    expect(f.calls().headReads).toBe(2);
    expect(f.calls().transactions).toBe(1);
  });
  it('GPP05 refuses an extra unmatched inventory row instead of skipping or relabelling it', async () => {
    const f = protocol({ productionLedgerRow: true });
    await expect(
      replace(
        publisher(f, {
          async assertReadFrom(_tx, r) {
            return audit(r);
          },
        }),
        f,
      ),
    ).rejects.toThrow();
    expect(f.writes).toHaveLength(0);
  });
  it('GPP07 propagates unknown cross-port plan coverage and changed audit without publication', async () => {
    for (const kind of ['coverage', 'audit'] as const) {
      const f = protocol();
      await expect(
        replace(
          publisher(f, {
            async assertReadFrom(_tx, r) {
              await Promise.resolve();
              if (kind === 'coverage')
                throw Error('TEST_ONLY_CUSTODY_PLAN_COVERAGE_UNKNOWN');
              return {
                ...audit(r),
                checkedHead: { worldVersion: '1', eventSequence: '0' },
              };
            },
          }),
          f,
        ),
      ).rejects.toThrow();
      expect(f.writes).toHaveLength(0);
    }
  });
  it('GPP08 uses one real empty view and emits only the existing paired unavailable result', async () => {
    const f = protocol();
    let calls = 0;
    await replace(
      publisher(f, {
        async assertReadFrom(_tx, r) {
          calls++;
          expect(r.context.purpose).toBe(
            'INDUSTRY_PRODUCTION_CANONICAL_HISTORY_READ',
          );
          return audit(r);
        },
      }),
      f,
    );
    expect(calls).toBe(1);
    expect(f.calls().headReads).toBe(2);
    expect(f.calls().custodyCalls).toBe(0);
    const industry = f.writes.find(
      (w) => w.payload.officeId === 'INDUSTRY',
    )!.payload;
    const social = f.writes.find(
      (w) => w.payload.officeId === 'SOCIAL',
    )!.payload;
    expect(industry.schemaVersion).toBe('world-activity-projection-v2');
    expect(social.schemaVersion).toBe('world-activity-projection-v1');
    expect(JSON.stringify(industry)).not.toContain('TEST_ONLY_ISSUER');
    expect(JSON.stringify(industry)).not.toContain('AUTHORIZED_RESULT_ONLY');
    expect(industry.ledger).toMatchObject({
      inventoryPositions: [],
      visibility: {
        inventoryDetail: 'NOT_AUTHORIZED',
        countrySummary: 'NOT_AUTHORIZED',
      },
    });
  });
  it('GPP09 retains final stored-head verification after the sole writer; protocol failure is not a native rollback claim', async () => {
    const f = protocol({ countMismatch: true });
    let returned = false;
    await expect(
      replace(
        publisher(f, {
          async assertReadFrom(_tx, r) {
            returned = true;
            return audit(r);
          },
        }),
        f,
      ),
    ).rejects.toThrow('non-head watermark');
    expect(returned).toBe(true);
    expect(f.writes.length).toBeGreaterThan(0);
    expect(f.calls().transactions).toBe(1);
  });
});
