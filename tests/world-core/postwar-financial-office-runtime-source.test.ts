/** Actual 70-country seed and real controlled SQL permit via the shared
 * fixture. TEST_ONLY keys/principals are not project Owner admission. */
import { createHash } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  canonicalSerialize,
  type AuthorizedOfficeContext,
} from '@econmind/core';
import {
  createPostwarAdmittedRuntimeFixture,
  type PostwarAdmittedRuntimeFixture,
} from '../support/postwar-admitted-runtime-fixture.js';
import {
  createPostwarFinancialOfficeOriginalDocument,
  validatePostwarFinancialOfficeOriginalDocument,
  readPostwarFinancialOfficeOriginalsFromSeed,
} from '../../apps/world-worker/src/preparation/postwar-financial-office-originals.js';
import {
  createPostwarFinancialOfficeRuntimeSource,
  readPostwarFinancialOfficeApiFrom,
  consumePostwarFinancialOfficeRuntimeSourceFrom,
} from '../../apps/world-worker/src/persistence/postwar-financial-office-runtime-source.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
// Optional timing only. Every wrapper delegates to the real Core/SQL method;
// no source, result, identity, timeout or assertion is replaced.
const profile = vi.hoisted(() => ({
  active: false,
  timings: [] as { stage: string; milliseconds: number }[],
}));
vi.mock('@econmind/core', async (importOriginal) => {
  const core = await importOriginal<typeof import('@econmind/core')>();
  const timed =
    <Args extends unknown[], Result>(
      stage: string,
      run: (...args: Args) => Result,
    ) =>
    (...args: Args): Result => {
      if (!profile.active) return run(...args);
      const started = performance.now();
      try {
        return run(...args);
      } finally {
        profile.timings.push({
          stage,
          milliseconds: performance.now() - started,
        });
      }
    };
  return {
    ...core,
    parseOpeningSeed: timed('CORE_PARSE_OPENING_SEED', core.parseOpeningSeed),
    rebuildV08LedgersFromLineage: timed(
      'CORE_REBUILD_LINEAGE',
      core.rebuildV08LedgersFromLineage,
    ),
    canonicalSerialize: timed(
      'CORE_CANONICAL_SERIALIZE',
      core.canonicalSerialize,
    ),
  };
});
const WORLD = 'WORLD_POSTWAR_FINANCIAL_READ_TEST',
  SEED = 'SEED_POSTWAR_FINANCIAL_READ_TEST',
  COUNTRY = 'COUNTRY_01';
const SUBJECT = '11111111-1111-4111-8111-111111111111',
  OTHER = '22222222-2222-4222-8222-222222222222';
const sha = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
let fixture: PostwarAdmittedRuntimeFixture,
  db: PGlite,
  executor: SqlExecutor,
  statements: string[],
  READER: string,
  PUBLISHER: string;
let prepared: PostwarAdmittedRuntimeFixture['prepared'],
  assembled: PostwarAdmittedRuntimeFixture['assembly'];
let finance: AuthorizedOfficeContext, centralBank: AuthorizedOfficeContext;
let config: Parameters<typeof createPostwarFinancialOfficeRuntimeSource>[0];
let financePort: ReturnType<typeof createPostwarFinancialOfficeRuntimeSource>,
  cbPort: ReturnType<typeof createPostwarFinancialOfficeRuntimeSource>;
const admin = async () => {
  await db.exec('reset role;set session authorization postgres');
};
async function inRead<T>(
  run: () => Promise<T>,
  mode = 'repeatable read read only',
  subject = SUBJECT,
  role = READER,
) {
  if (
    ![
      'repeatable read read only',
      'read committed read only',
      'repeatable read read write',
    ].includes(mode)
  )
    throw Error('TEST_ONLY_SQL_MODE');
  return fixture.asReader(() => run(), {
    mode: mode as
      | 'repeatable read read only'
      | 'read committed read only'
      | 'repeatable read read write',
    subject,
    role,
  });
}
beforeAll(async () => {
  fixture = await createPostwarAdmittedRuntimeFixture({
    worldId: WORLD,
    seedId: SEED,
    genesisVersion: 'POSTWAR_OPERATING_20261028_V1',
  });
  db = fixture.db;
  executor = {
    async query<Row extends object>(
      sql: string,
      parameters: readonly unknown[] = [],
    ) {
      if (!profile.active) return fixture.executor.query<Row>(sql, parameters);
      const started = performance.now();
      try {
        return await fixture.executor.query<Row>(sql, parameters);
      } finally {
        profile.timings.push({
          stage: sql.includes('from world_v2.opening_seed')
            ? 'SQL_OPENING_SEED'
            : 'SQL_OTHER_READ',
          milliseconds: performance.now() - started,
        });
      }
    },
  };
  statements = fixture.statements;
  prepared = fixture.prepared;
  assembled = fixture.assembly;
  READER = fixture.roles.readerRole;
  PUBLISHER = fixture.roles.authorizationPublisherRole;
  config = {
    scope: { worldId: WORLD, countryId: COUNTRY, officeId: 'FINANCE' },
    runtimeReaderRole: READER,
    authorizationPublisherRole: PUBLISHER,
  };
  financePort = createPostwarFinancialOfficeRuntimeSource(config);
  cbPort = createPostwarFinancialOfficeRuntimeSource({
    ...config,
    scope: { ...config.scope, officeId: 'CENTRAL_BANK' },
  });
  finance = await fixture.authorization('FINANCE', 'FINANCE_BUDGET');
  centralBank = await fixture.authorization(
    'CENTRAL_BANK',
    'CENTRAL_BANK_MONETARY_POLICY',
  );
}, 180_000);
beforeEach(async () => {
  profile.active = false;
  profile.timings.length = 0;
  await admin();
  fixture.state.membership = {
    ...fixture.state.membership,
    active: true,
    suspended: false,
    authorizationVersion: 'REV_1',
  };
  await db.query(
    "update world_v2.current_commit_authorization set active=true,authorization_version='REV_1' where world_id=$1",
    [WORLD],
  );
  await db.query(
    "update world_v2.projection_entitlement set active=true,revoked_at=null,authorization_version='REV_1' where world_id=$1",
    [WORLD],
  );
  statements.length = 0;
  profile.active = process.env.POSTWAR_PROFILE_LEGACY_READ === '1';
});
afterEach(() => {
  profile.active = false;
  if (process.env.POSTWAR_PROFILE_LEGACY_READ !== '1') return;
  const stages: Record<string, { calls: number; milliseconds: number }> = {};
  for (const sample of profile.timings) {
    const stage = (stages[sample.stage] ??= { calls: 0, milliseconds: 0 });
    stage.calls++;
    stage.milliseconds += sample.milliseconds;
  }
  console.info(
    JSON.stringify({
      classification: 'ACTUAL_LEGACY_READ_TIMING_NOT_AUTHORITY',
      stages,
    }),
  );
});
afterAll(async () => {
  await fixture?.close();
});
describe('real Finance + Central Bank canonical office source, isolated TEST_ONLY admission permit', () => {
  it('retains all 70 actual financial original contracts and rejects altered bytes, pointers and World scope', () => {
    const document = createPostwarFinancialOfficeOriginalDocument(
      prepared.financial,
    );
    const originals = validatePostwarFinancialOfficeOriginalDocument(
      document,
      assembled.finalSeed,
    );
    expect(originals.contract.countries).toHaveLength(70);
    expect(
      readPostwarFinancialOfficeOriginalsFromSeed(assembled.finalSeed),
    ).toEqual(originals);
    for (const change of [
      (v: typeof originals) => {
        (v as { worldId: string }).worldId = 'WORLD_FOREIGN';
      },
      (v: typeof originals) => {
        (v.contract.documents[0] as { bytes: string }).bytes = '{}';
      },
      (v: typeof originals) => {
        (
          v.contract.countries[0]!.cbRegister.source as { pointer: string }
        ).pointer = '/ABSENT';
      },
    ]) {
      const v = JSON.parse(document.bytes) as typeof originals;
      change(v);
      const bytes = canonicalSerialize(v);
      expect(() =>
        validatePostwarFinancialOfficeOriginalDocument(
          { ...document, bytes, sha256: sha(bytes) },
          assembled.finalSeed,
        ),
      ).toThrow();
    }
  });
  it('actually executes the Finance API entry against the persisted seed and exposes only own government ledger/funding', async () => {
    const result = await inRead(() =>
      readPostwarFinancialOfficeApiFrom({
        executor,
        authorization: finance,
        source: financePort,
      }),
    );
    expect(result.scope.officeId).toBe('FINANCE');
    expect(result.scope.countryId).toBe(COUNTRY);
    expect(result.boundary.seedFingerprint).toBe(
      assembled.finalSeed.fingerprint,
    );
    const facts = result.facts;
    expect(facts.officeId).toBe('FINANCE');
    if (facts.officeId !== 'FINANCE') throw Error('NARROW_FINANCE');
    expect(
      facts.financialPositions.every(
        (p) =>
          p.account.countryId === COUNTRY &&
          p.account.ownerId === facts.governmentEntityId,
      ),
    ).toBe(true);
    expect(facts.treasuryLiquidClaim.availableAmount).toBe(
      prepared.financial.fundingAccounts.find(
        (f) => f.countryId === COUNTRY && f.kind === 'TREASURY_TGA',
      )!.availableAmount,
    );
    expect(facts.openingOperatingAllocations?.funding.length).toBeGreaterThan(
      0,
    );
    expect(facts).not.toHaveProperty('centralBankRegister');
    expect(facts).not.toHaveProperty('bankLoans');
    expect(JSON.stringify(result)).not.toContain('COUNTRY_02');
    expect(() =>
      consumePostwarFinancialOfficeRuntimeSourceFrom(executor, result),
    ).toThrow('source scope expired');
  }, 60_000);
  it('actually executes the Central Bank API entry and preserves the original no-government-security register instead of inventing prices', async () => {
    const result = await inRead(() =>
      readPostwarFinancialOfficeApiFrom({
        executor,
        authorization: centralBank,
        source: cbPort,
      }),
    );
    expect(result.facts.officeId).toBe('CENTRAL_BANK');
    if (result.facts.officeId !== 'CENTRAL_BANK') throw Error('NARROW_CB');
    const owners = [
      result.facts.centralBankEntityId,
      result.facts.domesticBankEntityId,
    ];
    expect(
      result.facts.financialPositions.every(
        (p) =>
          p.account.countryId === COUNTRY && owners.includes(p.account.ownerId),
      ),
    ).toBe(true);
    expect(result.facts.centralBankRegister.holdings).toHaveLength(2);
    expect(result.facts.omoInventory.status).toBe(
      'NO_DECLARED_GOVERNMENT_SECURITY',
    );
    expect(result.facts.omoInventory.holdings).toEqual([]);
    expect(result.facts).not.toHaveProperty('quote');
    expect(result.facts).not.toHaveProperty('treasuryLiquidClaim');
    expect(result.facts).not.toHaveProperty('openingOperatingAllocations');
    expect(JSON.stringify(result)).not.toContain('COUNTRY_02');
  }, 60_000);
  it('rejects cross-office, cross-country and copied authority before mapping any private source', async () => {
    await expect(
      readPostwarFinancialOfficeApiFrom({
        executor,
        authorization: finance,
        source: { ...financePort },
      }),
    ).rejects.toThrow('fixed server source port required');
    await expect(
      inRead(() =>
        readPostwarFinancialOfficeApiFrom({
          executor,
          authorization: centralBank,
          source: financePort,
        }),
      ),
    ).rejects.toMatchObject({ code: 'SOURCE_SCOPE_MISMATCH' });
    await expect(
      inRead(() =>
        readPostwarFinancialOfficeApiFrom({
          executor,
          authorization: { ...finance },
          source: financePort,
        }),
      ),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
    for (const scope of [
      { ...config.scope, countryId: 'COUNTRY_02' },
      { ...config.scope, worldId: 'WORLD_FOREIGN_FINANCIAL_READ' },
    ]) {
      const foreign = createPostwarFinancialOfficeRuntimeSource({
        ...config,
        scope,
      });
      await expect(
        inRead(() =>
          readPostwarFinancialOfficeApiFrom({
            executor,
            authorization: finance,
            source: foreign,
          }),
        ),
      ).rejects.toMatchObject({ code: 'SOURCE_SCOPE_MISMATCH' });
    }
  });
  it('refuses to expose opening financial facts at a subsequent World head', async () => {
    await db.query(
      'update world_v2.world_head set world_version=1 where world_id=$1',
      [WORLD],
    );
    try {
      await expect(
        inRead(() =>
          readPostwarFinancialOfficeApiFrom({
            executor,
            authorization: finance,
            source: financePort,
          }),
        ),
      ).rejects.toMatchObject({ code: 'REPLAY_UNAVAILABLE' });
    } finally {
      await db.query(
        'update world_v2.world_head set world_version=0 where world_id=$1',
        [WORLD],
      );
    }
  });
  it('rejects unstable/write transactions, other subject, publisher and privileged sessions', async () => {
    for (const mode of [
      'read committed read only',
      'repeatable read read write',
    ])
      await expect(
        inRead(
          () =>
            readPostwarFinancialOfficeApiFrom({
              executor,
              authorization: finance,
              source: financePort,
            }),
          mode,
        ),
      ).rejects.toMatchObject({ code: 'READ_TRANSACTION_REQUIRED' });
    for (const role of [PUBLISHER, 'postgres'])
      await expect(
        inRead(
          () =>
            readPostwarFinancialOfficeApiFrom({
              executor,
              authorization: finance,
              source: financePort,
            }),
          'repeatable read read only',
          SUBJECT,
          role,
        ),
      ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
    await expect(
      inRead(
        () =>
          readPostwarFinancialOfficeApiFrom({
            executor,
            authorization: finance,
            source: financePort,
          }),
        'repeatable read read only',
        OTHER,
      ),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
  });
  it('rejects same-head revoked capability/entitlement and stale seat revision', async () => {
    await db.query(
      "update world_v2.current_commit_authorization set active=false where world_id=$1 and office_id='FINANCE'",
      [WORLD],
    );
    await expect(
      inRead(() =>
        readPostwarFinancialOfficeApiFrom({
          executor,
          authorization: finance,
          source: financePort,
        }),
      ),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
    await db.query(
      'update world_v2.current_commit_authorization set active=true where world_id=$1',
      [WORLD],
    );
    await db.query(
      "update world_v2.projection_entitlement set active=false,revoked_at='2026-10-28T00:01:00Z' where world_id=$1",
      [WORLD],
    );
    await expect(
      inRead(() =>
        readPostwarFinancialOfficeApiFrom({
          executor,
          authorization: finance,
          source: financePort,
        }),
      ),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
    await db.query(
      'update world_v2.projection_entitlement set active=true,revoked_at=null where world_id=$1',
      [WORLD],
    );
    await db.query(
      "update world_v2.current_commit_authorization set authorization_version='REV_2' where world_id=$1",
      [WORLD],
    );
    fixture.state.membership = {
      ...fixture.state.membership,
      authorizationVersion: 'REV_2',
    };
    await expect(
      inRead(() =>
        readPostwarFinancialOfficeApiFrom({
          executor,
          authorization: finance,
          source: financePort,
        }),
      ),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
  });
  it('invalidates callback sources after return and rejects a role or membership escape before returning results', async () => {
    let escaped:
      | Parameters<typeof consumePostwarFinancialOfficeRuntimeSourceFrom>[1]
      | undefined;
    await inRead(() =>
      financePort.withSourceFrom(executor, finance, async (source) => {
        escaped = source;
        expect(
          consumePostwarFinancialOfficeRuntimeSourceFrom(executor, source),
        ).toBe(source);
      }),
    );
    expect(() =>
      consumePostwarFinancialOfficeRuntimeSourceFrom(executor, escaped!),
    ).toThrow('source scope expired');
    await expect(
      inRead(() =>
        financePort.withSourceFrom(executor, finance, async () => {
          fixture.state.membership = {
            ...fixture.state.membership,
            suspended: true,
          };
          return 'DENIED';
        }),
      ),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
    fixture.state.membership = {
      ...fixture.state.membership,
      suspended: false,
    };
    await expect(
      inRead(() =>
        financePort.withSourceFrom(executor, finance, async () => {
          await db.exec('set local role postgres');
          return 'DENIED_ROLE_ESCAPE';
        }),
      ),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
  });
  it('keeps source reads free of balance, Event, receipt and outbox writes', async () => {
    await inRead(() =>
      readPostwarFinancialOfficeApiFrom({
        executor,
        authorization: finance,
        source: financePort,
      }),
    );
    expect(statements.every((s) => /^select\s/iu.test(s.trim()))).toBe(true);
    for (const table of [
      'authoritative_event',
      'inventory_posting',
      'financial_posting_batch',
      'command_receipt',
      'notification_outbox',
    ])
      expect(
        (await db.query(`select count(*)::text as n from world_v2.${table}`))
          .rows,
      ).toEqual([{ n: '0' }]);
  }, 60_000);
});
