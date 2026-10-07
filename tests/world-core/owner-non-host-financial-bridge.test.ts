import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  Money,
  SimTime,
  canonicalSerialize,
  rebuildV08LedgersFromLineage,
  createFinancialAccount,
  createFinancialPostingBatch,
  financialAccountId,
  financialPostingBatchId,
  financialPostingLegId,
  countryId,
  commandId,
  eventId,
  FINANCIAL_POSTING_SCHEMA_VERSION,
  COMMAND_SCHEMA_VERSION,
  EVENT_SCHEMA_VERSION,
  parseCanonicalCommand,
  parseAuthoritativeEvent,
  createAuthoritativeTransition,
  type OpeningSeed,
} from '@econmind/core';
import {
  CENTRAL_BANK_OPENING_CATEGORIES,
  createTestOnlyOpeningFx,
  loadOwnerNonHostSourceAdoption,
  produceOwnerNonHostSourceAdoption,
  type OwnerNonHostSourceAdoption,
} from '../../apps/world-worker/src/preparation/owner-non-host-source-adoption.js';
import {
  createTestOnlyCentralBankRegister,
  prepareOwnerAdoptedOpeningSeed,
  type TestOnlyCentralBankHolding,
} from '../../apps/world-worker/src/preparation/opening-canonical-seed-bridge.js';
import {
  openingBookMoney,
  openingCentralBankNetWorth,
} from '../../apps/world-worker/src/preparation/opening-economic-decision.js';
import { WorldOpeningSeedStore } from '../../apps/world-worker/src/persistence/opening-seed-store.js';
import { WorldOpeningBootstrapReadback } from '../../apps/world-worker/src/persistence/world-opening-bootstrap-readback.js';
import { DurableV08LedgerLineageReader } from '../../apps/world-worker/src/persistence/durable-v08-ledger-lineage-reader.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';
import { createPGliteV09AtomicTestDatabase } from '../support/v09-atomic-database.js';

// Real immutable source + actual Root Owner receipt. All LC/FX/CB instruments
// below are explicitly synthetic TEST_ONLY, NEVER formal admission evidence.
const root = path.resolve(import.meta.dirname, '../..');
const wid = 'WORLD_TEST_ONLY_A_NON_HOST';
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
let real: OwnerNonHostSourceAdoption, fixture: OwnerNonHostSourceAdoption;
beforeAll(async () => {
  real = await loadOwnerNonHostSourceAdoption({
    repositoryRoot: root,
    ownerDocumentPath: path.join(
      root,
      'docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISIONS.original.md',
    ),
    rootReceiptPath: path.join(
      root,
      'docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISION_RECEIPT.json',
    ),
    scope: { environment: 'NON_ACTIVATED_PREPARATION', worldId: null },
  });
  fixture = produceOwnerNonHostSourceAdoption({
    source: real.source,
    ownerPolicy: real.ownerPolicy,
    scope: { environment: 'TEST_ONLY', worldId: wid },
    openingFx: createTestOnlyOpeningFx(
      wid,
      real.source.countryIds.map((cid, i) => ({
        countryId: cid,
        localCurrency:
          'L' +
          String.fromCharCode(65 + Math.floor(i / 26)) +
          String.fromCharCode(65 + (i % 26)),
        localCurrencyPerGcu: '1.25',
        version: 'TEST_ONLY_FX_V1',
        valueDate: '2026-10-07',
      })),
    ),
  });
});
function rows(delta = '0', foreignCash = false): TestOnlyCentralBankHolding[] {
  return fixture.manifest.countries.flatMap((c) =>
    CENTRAL_BANK_OPENING_CATEGORIES.map(([category]) => {
      const lc = c.denominations.bankReserveAssets.localBookValue!.currency;
      const common = {
        countryId: c.countryId,
        category,
        holdingId: `HOLDING_TEST_ONLY_${c.countryId}_${category}`,
      };
      if (
        category === 'COMMERCIAL_BANK_RESERVE_ACCOUNTS' ||
        category === 'TREASURY_GOVERNMENT_DEPOSIT'
      ) {
        const d =
          category === 'COMMERCIAL_BANK_RESERVE_ACCOUNTS'
            ? c.reserve
            : c.treasury;
        return {
          ...common,
          disposition: 'TEST_ONLY_AMOUNT',
          amount: d.localAmount!.amount,
          currency: lc,
          counterpartyEntityId: d.assetHolderId,
        };
      }
      if (category === 'FX_CASH_AND_DEPOSITS') {
        const base = Money.from(c.treasury.localAmount!.amount, lc).add(
          Money.from(c.reserve.localAmount!.amount, lc),
        );
        return {
          ...common,
          disposition: 'TEST_ONLY_AMOUNT',
          amount: foreignCash
            ? '8'
            : base.add(Money.from(delta, lc)).toCanonicalValue().amount,
          currency: foreignCash ? 'GCU' : lc,
          counterpartyEntityId: null,
        };
      }
      return {
        ...common,
        disposition: 'TEST_ONLY_NOT_APPLICABLE',
        amount: null,
        currency: null,
        counterpartyEntityId: null,
      };
    }),
  );
}
function prepared(registerRows = rows()) {
  return prepareOwnerAdoptedOpeningSeed({
    sourceAdoption: fixture,
    seedId: 'SEED_TEST_ONLY_A_NON_HOST',
    sourceId: 'SOURCE_TEST_ONLY_A_NON_HOST',
    testOnlyCentralBankRegister: createTestOnlyCentralBankRegister({
      worldId: wid,
      rows: registerRows,
    }),
  });
}
function opening(registerRows = rows()): OpeningSeed {
  const result = prepared(registerRows);
  expect(result.blockers).toEqual([]);
  expect(result.status).toBe('NOT_ADMITTED');
  expect(result.activationAllowed).toBe(false);
  return result.seed!;
}
async function database() {
  const db = createPGliteV09AtomicTestDatabase();
  const directory = path.join(root, 'database/migrations/artifacts');
  const names = (await readdir(directory))
    .filter((n) => /^00(?:0[1-9]|1[0-6])_.*\.sql$/u.test(n))
    .sort();
  expect(names).toHaveLength(16);
  for (const name of names)
    await db.executeScript(await readFile(path.join(directory, name), 'utf8'));
  await db.query(
    'insert into world_v2.world_head (world_id, world_version, event_sequence) values ($1, 0, 0)',
    [wid],
  );
  return db;
}
describe('actual non-host Owner policy financial consumer', () => {
  it('consumes real adoption without fabricating a legacy full-intent approval; formal missing sources block', () => {
    expect(real.ownerPolicy.state).toBe('DECISION_ADOPTED');
    expect(real.legacyOwnerRecords).toEqual([]);
    const result = prepareOwnerAdoptedOpeningSeed({
      sourceAdoption: real,
      seedId: 'SEED_REAL_BLOCKED',
      sourceId: 'SOURCE_REAL_BLOCKED',
    });
    expect(result.seed).toBeNull();
    expect(result.status).toBe('BLOCKED');
    expect(new Set(result.blockers.map((b) => b.countryId)).size).toBe(70);
    expect(
      result.blockers.some((b) => b.code === 'OPENING_FX_SOURCE_MISSING'),
    ).toBe(true);
    expect(
      result.blockers.some(
        (b) =>
          b.code === 'CB_OPENING_HOLDING_REGISTER_COMPLETENESS_NOT_ESTABLISHED',
      ),
    ).toBe(true);
    expect(
      result.blockers.some(
        (b) => b.code === 'CB_CATEGORY_SOURCE_MISSING_NOT_APPROVED_ZERO',
      ),
    ).toBe(true);
    expect(result.blockers.some((b) => b.code.includes('OWNER_RECORD'))).toBe(
      false,
    );
    expect(real.manifest.stockRights).toHaveLength(840);
    expect(real.manifest.stockRights.filter((s) => s.positive)).toHaveLength(
      619,
    );
  });
  it('does exact field conversion once, rejects non-positive FX and over-limit precision without rounding', () => {
    expect(
      openingBookMoney({
        rawAmount: '0.123456789123456789',
        denomination: 'GCU_EQUIVALENT',
        localCurrency: 'LAA',
        localCurrencyPerGcu: '1.25',
      }).toCanonicalValue().amount,
    ).toBe('0.15432098640432098625');
    expect(
      openingBookMoney({
        rawAmount: '9',
        denomination: 'LOCAL_CURRENCY',
        localCurrency: 'LAA',
        localCurrencyPerGcu: '1.25',
      }).toCanonicalValue().amount,
    ).toBe('9');
    expect(() =>
      openingBookMoney({
        rawAmount: '1',
        denomination: 'GCU_EQUIVALENT',
        localCurrency: 'LAA',
        localCurrencyPerGcu: '0',
      }),
    ).toThrow();
    expect(() =>
      openingBookMoney({
        rawAmount: '9'.repeat(120),
        denomination: 'GCU_EQUIVALENT',
        localCurrency: 'LAA',
        localCurrencyPerGcu: '9',
      }),
    ).toThrow();
    expect(() =>
      openingCentralBankNetWorth({
        assets: [],
        liabilities: [],
        localCurrency: 'LAA',
        registerCompleteness: 'SOURCE_MISSING',
      }),
    ).toThrow();
  });
  it.each(['5', '0', '-5'])(
    'complete TEST_ONLY register yields signed once-only CB net worth %s in existing Core',
    (delta) => {
      const seed = opening(rows(delta));
      const payload = JSON.parse(seed.sources[0]!.canonicalPayload) as {
        reconciliations: {
          centralBankNetWorth: { amount: string };
          runtimeResetAllowed: boolean;
        }[];
      };
      expect(
        payload.reconciliations.every(
          (c) =>
            c.centralBankNetWorth.amount === delta && !c.runtimeResetAllowed,
        ),
      ).toBe(true);
      expect(seed.inventoryEntries).toHaveLength(619);
      expect(seed.sources[0]!.sourceKind).toBe('DOCUMENTED_ASSUMPTION');
      expect(seed.sources[0]!.locator).toContain('TEST_ONLY');
      expect(seed.financialBatches).toHaveLength(70);
      expect(
        rebuildV08LedgersFromLineage({ seed, sha256Hex: sha }).worldVersion,
      ).toBe('0');
    },
  );
  it('keeps native GCU cash separate from LC claims; never relabels or converts an actual LC field twice', () => {
    const seed = opening(rows('0', true));
    expect(seed.financialBatches).toHaveLength(140);
    const cash = seed.financialBatches
      .flatMap((b) => b.legs)
      .find(
        (l) => l.account.accountId === 'CB_HOLDING_01_FX_CASH_AND_DEPOSITS',
      )!;
    expect(cash.amount.toCanonicalValue()).toEqual({
      amount: '8',
      currency: 'GCU',
    });
    const payload = JSON.parse(seed.sources[0]!.canonicalPayload) as {
      reconciliations: { centralBankNetWorth: { amount: string } }[];
    };
    const c = fixture.manifest.countries[0]!;
    expect(payload.reconciliations[0]!.centralBankNetWorth.amount).toBe(
      Money.from('10', 'LAA')
        .subtract(Money.from(c.treasury.localAmount!.amount, 'LAA'))
        .subtract(Money.from(c.reserve.localAmount!.amount, 'LAA'))
        .toCanonicalValue().amount,
    );
  });
  it('materializes full B/R same claims and H/D holders exactly, preserving source L/E and deltas', () => {
    const seed = opening(),
      c = fixture.manifest.countries[0]!;
    const legs = seed.financialBatches.flatMap((b) => b.legs);
    for (const [purpose, holder, issuer, amount] of [
      [
        'TGA',
        c.holderRoster.treasury,
        c.holderRoster.centralBank,
        c.treasury.localAmount!.amount,
      ],
      [
        'RESERVE',
        c.holderRoster.bank,
        c.holderRoster.centralBank,
        c.reserve.localAmount!.amount,
      ],
      [
        'HOUSEHOLD_DEPOSIT',
        c.holderRoster.households,
        c.holderRoster.bank,
        c.denominations.householdBankDeposits.localBookValue!.amount,
      ],
      [
        'BUSINESS_DEPOSIT',
        c.holderRoster.operator,
        c.holderRoster.bank,
        c.denominations.businessBankDeposits.localBookValue!.amount,
      ],
    ]) {
      const pair = legs.filter(
        (l) => l.account.claimId === `CLAIM_TEST_ONLY_${purpose}_01`,
      );
      expect(pair).toHaveLength(2);
      expect(pair.map((l) => l.account.ownerId).sort()).toEqual(
        [holder, issuer].sort(),
      );
      expect(
        pair.every(
          (l) =>
            l.amount.toCanonicalValue().amount === amount &&
            l.account.currency === 'LAA',
        ),
      ).toBe(true);
      expect(pair[0]!.counterpartLegId).toBe(pair[1]!.legId);
    }
    expect(
      legs.filter(
        (l) =>
          l.account.ownerId === c.holderRoster.centralBank &&
          l.account.accountClass === 'ASSET',
      ),
    ).toHaveLength(1);
    const payload = JSON.parse(seed.sources[0]!.canonicalPayload) as {
      reconciliations: {
        original: unknown;
        bankAdoptedMinusOriginalL: unknown;
        bankAdoptedMinusOriginalE: unknown;
      }[];
    };
    expect(payload.reconciliations[0]!.original).toEqual(c.rawFinance);
    expect(payload.reconciliations[0]!.bankAdoptedMinusOriginalL).toEqual(
      openingBookMoney({
        rawAmount: c.bankOpening.adoptedMinusOriginalL,
        denomination: 'GCU_EQUIVALENT',
        localCurrency: 'LAA',
        localCurrencyPerGcu: '1.25',
      }).toCanonicalValue(),
    );
    expect(payload.reconciliations[0]!.bankAdoptedMinusOriginalE).toEqual(
      openingBookMoney({
        rawAmount: c.bankOpening.adoptedMinusOriginalE,
        denomination: 'GCU_EQUIVALENT',
        localCurrency: 'LAA',
        localCurrencyPerGcu: '1.25',
      }).toCanonicalValue(),
    );
  });
  it('rejects missing/null, duplicate, mismatched currency/counterparty and unsupported declared instruments all-or-zero', () => {
    const values = rows();
    const scenarios = [
      values.slice(1),
      values.map((r, i) => (i === 0 ? { ...r, amount: null } : r)),
      values.map((r, i) =>
        i === 1 ? { ...r, holdingId: values[0]!.holdingId } : r,
      ),
      values.map((r) =>
        r.category === 'TREASURY_GOVERNMENT_DEPOSIT'
          ? { ...r, currency: 'GCU' }
          : r,
      ),
      values.map((r) =>
        r.category === 'COMMERCIAL_BANK_RESERVE_ACCOUNTS'
          ? { ...r, counterpartyEntityId: null }
          : r,
      ),
      values.map((r) =>
        r.category === 'DOMESTIC_GOVERNMENT_SECURITIES'
          ? {
              ...r,
              disposition: 'TEST_ONLY_AMOUNT' as const,
              amount: '3',
              currency: 'LAA',
            }
          : r,
      ),
    ];
    for (const r of scenarios) {
      const result = prepared(r);
      expect(result.status).toBe('BLOCKED');
      expect(result.seed).toBeNull();
    }
    const zeros = values.map((r) =>
      r.category === 'DOMESTIC_GOVERNMENT_SECURITIES'
        ? {
            ...r,
            disposition: 'TEST_ONLY_AMOUNT' as const,
            amount: '0',
            currency: fixture.manifest.countries.find(
              (c) => c.countryId === r.countryId,
            )!.treasury.localAmount!.currency,
          }
        : r,
    );
    expect(prepared(zeros).blockers).toEqual([]);
  });
  it('rejects copied brands and TEST_ONLY registers outside their actual TEST_ONLY scope', () => {
    expect(() =>
      prepareOwnerAdoptedOpeningSeed({
        sourceAdoption: { ...fixture },
        seedId: 'SEED_TEST',
        sourceId: 'SOURCE_TEST',
      }),
    ).toThrow('UNTRUSTED_OWNER');
    const register = createTestOnlyCentralBankRegister({
      worldId: wid,
      rows: rows(),
    });
    expect(() =>
      prepareOwnerAdoptedOpeningSeed({
        sourceAdoption: real,
        seedId: 'SEED_TEST',
        sourceId: 'SOURCE_TEST',
        testOnlyCentralBankRegister: register,
      }),
    ).toThrow('TEST_REGISTER_CANNOT_ENTER_PRODUCTION');
    expect(() =>
      prepareOwnerAdoptedOpeningSeed({
        sourceAdoption: fixture,
        seedId: 'SEED_TEST',
        sourceId: 'SOURCE_TEST',
        testOnlyCentralBankRegister: { ...register },
      }),
    ).toThrow();
    expect(() =>
      createTestOnlyCentralBankRegister({
        worldId: 'WORLD_FORMAL',
        rows: rows(),
      }),
    ).toThrow('TEST_ONLY_WORLD_REQUIRED');
  });
  it('persists real Core carrier to isolated SQL, rehydrates balances/claims, retries identically and rejects conflicting seed', async () => {
    const db = await database();
    try {
      const seed = opening(rows('-5'));
      const readback = new WorldOpeningBootstrapReadback({
        database: db,
        sha256Hex: sha,
      });
      const first = await readback.bootstrapAndReadback({
        seed,
        bootstrappedAtReal: '2026-10-07T00:00:00.000Z',
      });
      expect(first.disposition).toBe('BOOTSTRAPPED');
      expect(first.readback.seedFingerprint).toBe(seed.fingerprint);
      expect(first.readback.inventoryBalanceCount).toBe(619);
      const loaded = await new WorldOpeningSeedStore({
        database: db,
        sha256Hex: sha,
      }).load(wid);
      expect(canonicalSerialize(loaded)).toBe(canonicalSerialize(seed));
      const snapshot = await new DurableV08LedgerLineageReader({
        database: db,
        sha256Hex: sha,
      }).rebuild(wid);
      expect(snapshot.seedFingerprint).toBe(seed.fingerprint);
      const position = snapshot.financial.positions.find(
        (p) => p.account.accountId === 'CB_INITIAL_NETWORTH_01_LAA',
      )!;
      expect(position.netDebitBalance.toCanonicalValue()).toEqual({
        amount: '5',
        currency: 'LAA',
      });
      expect(
        (
          await readback.bootstrapAndReadback({
            seed,
            bootstrappedAtReal: '2026-10-07T00:00:01.000Z',
          })
        ).disposition,
      ).toBe('ALREADY_BOOTSTRAPPED');
      await expect(
        new WorldOpeningSeedStore({ database: db, sha256Hex: sha }).bootstrap({
          seed: opening(rows('5')),
          bootstrappedAtReal: '2026-10-07T00:00:02.000Z',
        }),
      ).rejects.toThrow();
      expect(
        (
          await db.query<{ count: string }>(
            'select count(*)::text as count from world_v2.opening_seed',
          )
        ).rows[0]!.count,
      ).toBe('1');
    } finally {
      await db.close();
    }
  });
  it('injected post-insert failure rolls back actual SQL; retry leaves one canonical opening, never half-seed', async () => {
    const db = await database();
    try {
      const failing: SqlDatabase = {
        query: db.query.bind(db),
        transaction: (op) =>
          db.transaction((tx) => {
            const query: SqlExecutor['query'] = async <Row extends object>(
              statement: string,
              parameters?: readonly unknown[],
            ) => {
              const result = await tx.query<Row>(statement, parameters);
              if (/insert into world_v2\.opening_seed/iu.test(statement))
                throw new Error('TEST_ONLY_AFTER_INSERT');
              return result;
            };
            return op({ query });
          }),
      };
      const seed = opening();
      await expect(
        new WorldOpeningSeedStore({
          database: failing,
          sha256Hex: sha,
        }).bootstrap({ seed, bootstrappedAtReal: '2026-10-07T00:00:00.000Z' }),
      ).rejects.toThrow();
      expect(
        (
          await db.query<{ count: string }>(
            'select count(*)::text as count from world_v2.opening_seed',
          )
        ).rows[0]!.count,
      ).toBe('0');
      expect(
        await new WorldOpeningSeedStore({
          database: db,
          sha256Hex: sha,
        }).bootstrap({ seed, bootstrappedAtReal: '2026-10-07T00:00:01.000Z' }),
      ).toBe('BOOTSTRAPPED');
      expect(
        (
          await new WorldOpeningBootstrapReadback({
            database: db,
            sha256Hex: sha,
          }).read(wid)
        ).seedFingerprint,
      ).toBe(seed.fingerprint);
    } finally {
      await db.close();
    }
  });
  it('later non-deposit BANK liability survives deterministic restart replay; duplicate authoritative facts reject instead of resetting L=H+D', () => {
    const seed = opening(),
      c = fixture.manifest.countries[0]!;
    const command = parseCanonicalCommand(
      {
        actorId: 'ACTOR_TEST_ONLY_A',
        authSubject: '00000000-0000-4000-8000-000000000001',
        commandId: commandId('COMMAND_TEST_ONLY_WHOLESALE'),
        commandType: 'TEST_ONLY_WHOLESALE',
        correlationId: 'CORRELATION_TEST_ONLY_A',
        countryId: c.countryId,
        expectedWorldVersion: '0',
        idempotencyKey: 'IDEMPOTENCY_TEST_ONLY_A',
        officeId: null,
        payload: { testOnly: true },
        schemaVersion: COMMAND_SCHEMA_VERSION,
        simTime: SimTime.fromTicks('10000').toCanonicalValue(),
        submittedAtReal: '2026-10-07T00:00:00.000Z',
        worldId: seed.worldId,
      },
      sha,
    );
    const event = parseAuthoritativeEvent(
      {
        causationCommandId: command.commandId,
        correlationId: command.correlationId,
        correctsEventId: null,
        eventId: eventId('EVENT_TEST_ONLY_WHOLESALE'),
        eventType: 'TEST_ONLY_WHOLESALE',
        payload: { testOnly: true },
        recordedAtReal: '2026-10-07T00:00:01.000Z',
        schemaVersion: EVENT_SCHEMA_VERSION,
        sequence: '1',
        simTime: command.simTime.toCanonicalValue(),
        worldId: seed.worldId,
        worldVersion: '1',
      },
      sha,
    );
    const evidence = {
      command,
      transition: createAuthoritativeTransition({
        command,
        worldVersionBefore: '0',
        worldVersionAfter: '1',
        events: [event],
      }),
    };
    const target = (id: string, accountClass: 'ASSET' | 'LIABILITY') =>
      createFinancialAccount({
        worldId: seed.worldId,
        countryId: countryId(c.countryId),
        accountId: financialAccountId(id),
        ownerId: c.holderRoster.bank,
        accountClass,
        currency: 'LAA',
        claimId: null,
        counterpartyEntityId: null,
      });
    const asset = target('BANK_TEST_ONLY_WHOLESALE_CASH', 'ASSET'),
      liability = target('BANK_TEST_ONLY_WHOLESALE_LIABILITY', 'LIABILITY');
    const posting = createFinancialPostingBatch(
      {
        schemaVersion: FINANCIAL_POSTING_SCHEMA_VERSION,
        batchId: financialPostingBatchId('BATCH_TEST_ONLY_WHOLESALE'),
        worldId: seed.worldId,
        causationCommandId: evidence.command.commandId,
        causationEventIds: [evidence.transition.events[0]!.eventId],
        worldVersionBefore: '0',
        worldVersionAfter: '1',
        simTime: evidence.command.simTime,
        command: evidence.command,
        transition: evidence.transition,
        settlementCurrency: 'LAA',
        legs: [
          {
            legId: financialPostingLegId('LEG_TEST_ONLY_WHOLESALE_ASSET'),
            account: asset,
            direction: 'DEBIT',
            amount: Money.from('7', 'LAA'),
            counterpartyAccountId: liability.accountId,
          },
          {
            legId: financialPostingLegId('LEG_TEST_ONLY_WHOLESALE_LIABILITY'),
            account: liability,
            direction: 'CREDIT',
            amount: Money.from('7', 'LAA'),
            counterpartyAccountId: asset.accountId,
          },
        ],
      },
      sha,
    );
    const transition = {
      ...evidence,
      inventoryPostings: [],
      financialPostingBatches: [posting],
    };
    const replay = rebuildV08LedgersFromLineage({
      seed,
      transitions: [transition],
      sha256Hex: sha,
    });
    const total = replay.financial.positions
      .filter(
        (p) =>
          p.account.ownerId === c.holderRoster.bank &&
          p.account.accountClass === 'LIABILITY',
      )
      .reduce(
        (sum, p) => sum.subtract(p.netDebitBalance),
        Money.from('0', 'LAA'),
      );
    expect(total.toCanonicalValue()).toEqual(
      Money.from(c.bankOpening.localL!.amount, 'LAA')
        .add(Money.from('7', 'LAA'))
        .toCanonicalValue(),
    );
    expect(() =>
      rebuildV08LedgersFromLineage({
        seed,
        transitions: [transition, transition],
        sha256Hex: sha,
      }),
    ).toThrow('Authoritative transition identity is duplicated');
    const restart = rebuildV08LedgersFromLineage({
      seed,
      transitions: [transition],
      sha256Hex: sha,
    });
    expect(canonicalSerialize(restart.financial)).toBe(
      canonicalSerialize(replay.financial),
    );
    expect(
      replay.financial.positions
        .find((p) => p.account.accountId === 'INITIAL_NETWORTH_BANK_01')!
        .netDebitBalance.toCanonicalValue(),
    ).toEqual(
      Money.from('0', 'LAA')
        .subtract(Money.from(c.bankOpening.localE!.amount, 'LAA'))
        .toCanonicalValue(),
    );
  });
});
