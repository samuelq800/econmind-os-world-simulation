import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  CURRENT_REPLAY_BINDING,
  DOMAIN_ERROR_CODES,
  FINANCIAL_POSTING_SCHEMA_VERSION,
  INVENTORY_POSTING_SCHEMA_VERSION,
  Money,
  OPENING_SEED_SCHEMA_VERSION,
  OPENING_SOURCE_SCHEMA_VERSION,
  Quantity,
  SimTime,
  assertV08LedgerReconciled,
  commandId,
  commodityId,
  countryId,
  createFinancialAccount,
  createFinancialPostingBatch,
  createInventoryAccount,
  createOpeningSeed,
  createOpeningSource,
  createReservationPosting,
  eventId,
  financialAccountId,
  financialOpeningBatchId,
  financialOpeningLegId,
  financialPostingBatchId,
  financialPostingLegId,
  hydrateInventoryLedgerState,
  inventoryBatchId,
  inventoryLocationId,
  inventoryPostingId,
  inventoryReservationId,
  legalEntityId,
  openingInventoryEntryId,
  openingSeedId,
  openingSourceId,
  rebuildV08LedgersFromLineage,
  reconcileV08LedgerSnapshots,
  worldId,
  type FinancialOpeningBatch,
  type OpeningInventoryEntry,
  type OpeningSource,
} from '../../packages/core/src/index.js';

const sha256 = (preimage: string) =>
  createHash('sha256').update(preimage, 'utf8').digest('hex');
const WORLD = worldId('WORLD_OPENING');
const OWNER = legalEntityId('ENTITY_OWNER');
const COUNTRY = countryId('COUNTRY_A');

const inventoryAvailable = createInventoryAccount({
  worldId: WORLD,
  countryId: COUNTRY,
  commodityId: commodityId('WHEAT'),
  batchId: inventoryBatchId('BATCH_WHEAT'),
  unit: 'tonne',
  physicalLocationId: inventoryLocationId('PORT_A'),
  bucket: 'AVAILABLE',
  reservationId: null,
  shipmentId: null,
  titleHolderId: OWNER,
  riskBearerId: OWNER,
  economicRecognitionId: null,
});
const inventoryReserved = createInventoryAccount({
  ...inventoryAvailable,
  bucket: 'RESERVED',
  reservationId: inventoryReservationId('RESERVATION_A'),
});
const cash = createFinancialAccount({
  worldId: WORLD,
  accountId: financialAccountId('ACCOUNT_CASH'),
  ownerId: OWNER,
  countryId: COUNTRY,
  accountClass: 'CASH',
  currency: 'GCU',
  claimId: null,
  counterpartyEntityId: null,
});
const equity = createFinancialAccount({
  ...cash,
  accountId: financialAccountId('ACCOUNT_OPENING_EQUITY'),
  accountClass: 'EQUITY',
});

function source(
  id = 'SOURCE_FIXTURE',
  payload: unknown = { fixture: 'balanced-opening-v1' },
) {
  return createOpeningSource(
    {
      schemaVersion: OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: openingSourceId(id),
      sourceKind: 'TEST_FIXTURE',
      locator: 'tests/fixtures/opening-v1.json',
      sourceVersion: 'fixture-v1',
      payload,
    },
    sha256,
  );
}

function inventoryEntry(
  sourceRecord: OpeningSource,
  amount = '10',
): OpeningInventoryEntry {
  return {
    entryId: openingInventoryEntryId('OPENING_INVENTORY_WHEAT'),
    sourceId: sourceRecord.sourceId,
    account: inventoryAvailable,
    quantity: Quantity.from(amount, 'tonne'),
  };
}

function financialBatch(
  sourceRecord: OpeningSource,
  amount = '100',
): FinancialOpeningBatch {
  return {
    batchId: financialOpeningBatchId('OPENING_FINANCE_A'),
    sourceId: sourceRecord.sourceId,
    settlementCurrency: 'GCU',
    legs: [
      {
        legId: financialOpeningLegId('OPENING_LEG_CASH'),
        account: cash,
        direction: 'DEBIT',
        amount: Money.from(amount, 'GCU'),
        counterpartLegId: financialOpeningLegId('OPENING_LEG_EQUITY'),
      },
      {
        legId: financialOpeningLegId('OPENING_LEG_EQUITY'),
        account: equity,
        direction: 'CREDIT',
        amount: Money.from(amount, 'GCU'),
        counterpartLegId: financialOpeningLegId('OPENING_LEG_CASH'),
      },
    ],
  };
}

function seed(
  overrides: {
    sources?: readonly OpeningSource[];
    inventoryEntries?: readonly OpeningInventoryEntry[];
    financialBatches?: readonly FinancialOpeningBatch[];
    replayBinding?: typeof CURRENT_REPLAY_BINDING;
    openingWorldVersion?: '0';
  } = {},
) {
  const sourceRecord = overrides.sources?.[0] ?? source();
  return createOpeningSeed(
    {
      schemaVersion: OPENING_SEED_SCHEMA_VERSION,
      seedId: openingSeedId('SEED_WORLD_OPENING'),
      worldId: WORLD,
      openingWorldVersion: overrides.openingWorldVersion ?? '0',
      replayBinding: overrides.replayBinding ?? CURRENT_REPLAY_BINDING,
      sources: overrides.sources ?? [sourceRecord],
      inventoryEntries: overrides.inventoryEntries ?? [
        inventoryEntry(sourceRecord),
      ],
      financialBatches: overrides.financialBatches ?? [
        financialBatch(sourceRecord),
      ],
    },
    sha256,
  );
}

describe('V08.3 opening seed and reconciliation', () => {
  it('builds exact opening inventory and balanced counterpart positions', () => {
    const opening = seed();
    const rebuilt = rebuildV08LedgersFromLineage({ seed: opening });
    expect(rebuilt.inventory.worldVersion).toBe('0');
    expect(
      rebuilt.inventory.balances[0]?.quantity.toCanonicalValue().amount,
    ).toBe('10');
    expect(rebuilt.financial.worldVersion).toBe('0');
    expect(
      rebuilt.financial.positions.map(
        (position) => position.netDebitBalance.toCanonicalValue().amount,
      ),
    ).toEqual(['100', '-100']);
  });

  it('binds explicit canonical source payload, version, locator and hash', () => {
    const record = source();
    expect(record).toMatchObject({
      sourceKind: 'TEST_FIXTURE',
      sourceVersion: 'fixture-v1',
      locator: 'tests/fixtures/opening-v1.json',
    });
    expect(record.canonicalPayload).toBe('{"fixture":"balanced-opening-v1"}');
    expect(record.payloadHash).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(() =>
      createOpeningSeed(
        {
          ...seed(),
          sources: [{ ...record }],
          inventoryEntries: [inventoryEntry(record)],
          financialBatches: [financialBatch(record)],
        },
        sha256,
      ),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.OPENING_SEED_INVALID,
      }),
    );
  });

  it('rejects unknown source references and invalid opening versions', () => {
    const declared = source();
    const unknown = source('SOURCE_OTHER');
    expect(() =>
      seed({
        sources: [declared],
        inventoryEntries: [inventoryEntry(unknown)],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.OPENING_SEED_INVALID,
      }),
    );
    expect(() =>
      createOpeningSeed(
        {
          ...seed(),
          openingWorldVersion: '1' as never,
        },
        sha256,
      ),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.OPENING_SEED_INVALID,
      }),
    );
  });

  it('rejects missing/opposite-counterpart failures and exact imbalance', () => {
    const declared = source();
    const valid = financialBatch(declared);
    expect(() =>
      seed({
        sources: [declared],
        financialBatches: [
          {
            ...valid,
            legs: [
              {
                ...valid.legs[0]!,
                counterpartLegId: financialOpeningLegId('MISSING_LEG'),
              },
              valid.legs[1]!,
            ],
          },
        ],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.OPENING_SEED_INVALID,
      }),
    );
    expect(() =>
      seed({
        sources: [declared],
        financialBatches: [
          {
            ...valid,
            legs: [
              valid.legs[0]!,
              { ...valid.legs[1]!, amount: Money.from('99', 'GCU') },
            ],
          },
        ],
      }),
    ).toThrowError(
      expect.objectContaining({ code: DOMAIN_ERROR_CODES.LEDGER_IMBALANCE }),
    );
  });

  it('rejects zero/negative inventory and duplicate canonical accounts', () => {
    const declared = source();
    for (const amount of ['0', '-1']) {
      expect(() =>
        seed({
          sources: [declared],
          inventoryEntries: [inventoryEntry(declared, amount)],
        }),
      ).toThrowError(
        expect.objectContaining({
          code: DOMAIN_ERROR_CODES.OPENING_SEED_INVALID,
        }),
      );
    }
    expect(() =>
      seed({
        sources: [declared],
        inventoryEntries: [
          inventoryEntry(declared),
          {
            ...inventoryEntry(declared),
            entryId: openingInventoryEntryId('OPENING_INVENTORY_DUPLICATE'),
          },
        ],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.OPENING_SEED_INVALID,
      }),
    );
  });

  it('canonicalizes source, inventory and financial batch order', () => {
    const firstSource = source('SOURCE_A', { order: '1' });
    const secondSource = source('SOURCE_B', { order: '2' });
    const firstEntry = inventoryEntry(firstSource);
    const secondEntry = {
      ...inventoryEntry(secondSource),
      entryId: openingInventoryEntryId('OPENING_INVENTORY_SECOND'),
      account: createInventoryAccount({
        ...inventoryAvailable,
        batchId: inventoryBatchId('BATCH_SECOND'),
      }),
    };
    const firstBatch = financialBatch(firstSource);
    const secondBatch = {
      ...financialBatch(secondSource),
      batchId: financialOpeningBatchId('OPENING_FINANCE_B'),
      legs: financialBatch(secondSource).legs.map((leg, index) => ({
        ...leg,
        legId: financialOpeningLegId(`SECOND_LEG_${index}`),
        counterpartLegId: financialOpeningLegId(`SECOND_LEG_${1 - index}`),
        account: createFinancialAccount({
          ...leg.account,
          accountId: financialAccountId(`SECOND_ACCOUNT_${index}`),
        }),
      })),
    };
    const forward = seed({
      sources: [firstSource, secondSource],
      inventoryEntries: [firstEntry, secondEntry],
      financialBatches: [firstBatch, secondBatch],
    });
    const reverse = seed({
      sources: [secondSource, firstSource],
      inventoryEntries: [secondEntry, firstEntry],
      financialBatches: [secondBatch, firstBatch],
    });
    expect(reverse.fingerprint).toBe(forward.fingerprint);
  });

  it('reconstructs later inventory and financial posting lineage', () => {
    const opening = seed();
    const reservation = createReservationPosting(
      {
        schemaVersion: INVENTORY_POSTING_SCHEMA_VERSION,
        postingId: inventoryPostingId('POSTING_RESERVE'),
        worldId: WORLD,
        causationCommandId: commandId('COMMAND_RESERVE'),
        causationEventIds: [eventId('EVENT_RESERVE')],
        worldVersionBefore: '0',
        worldVersionAfter: '1',
        simTime: SimTime.fromTicks('10000'),
        quantity: Quantity.from('4', 'tonne'),
        source: inventoryAvailable,
        destination: inventoryReserved,
      },
      sha256,
    );
    const expense = createFinancialAccount({
      ...cash,
      accountId: financialAccountId('ACCOUNT_EXPENSE'),
      accountClass: 'EXPENSE',
    });
    const payment = createFinancialPostingBatch(
      {
        schemaVersion: FINANCIAL_POSTING_SCHEMA_VERSION,
        batchId: financialPostingBatchId('POSTING_PAYMENT'),
        worldId: WORLD,
        causationCommandId: commandId('COMMAND_PAYMENT'),
        causationEventIds: [eventId('EVENT_PAYMENT')],
        worldVersionBefore: '0',
        worldVersionAfter: '1',
        simTime: SimTime.fromTicks('10000'),
        settlementCurrency: 'GCU',
        legs: [
          {
            legId: financialPostingLegId('PAYMENT_DEBIT'),
            account: expense,
            direction: 'DEBIT',
            amount: Money.from('5', 'GCU'),
            counterpartyAccountId: cash.accountId,
          },
          {
            legId: financialPostingLegId('PAYMENT_CREDIT'),
            account: cash,
            direction: 'CREDIT',
            amount: Money.from('5', 'GCU'),
            counterpartyAccountId: expense.accountId,
          },
        ],
      },
      sha256,
    );
    const rebuilt = rebuildV08LedgersFromLineage({
      seed: opening,
      inventoryPostings: [reservation],
      financialPostingBatches: [payment],
    });
    expect(rebuilt.inventory.worldVersion).toBe('1');
    expect(rebuilt.inventory.balances).toHaveLength(2);
    expect(rebuilt.financial.worldVersion).toBe('1');
    expect(
      rebuilt.financial.positions
        .find((position) => position.account.accountId === cash.accountId)
        ?.netDebitBalance.toCanonicalValue().amount,
    ).toBe('95');
  });

  it('rebuilds without snapshots and reports matching derived snapshots', () => {
    const rebuilt = rebuildV08LedgersFromLineage({ seed: seed() });
    const absent = reconcileV08LedgerSnapshots({
      reconstructed: rebuilt,
      sha256Hex: sha256,
    });
    expect(absent).toMatchObject({
      reconciled: true,
      inventory: { status: 'NOT_PROVIDED', snapshotHash: null },
      financial: { status: 'NOT_PROVIDED', snapshotHash: null },
    });
    const matching = reconcileV08LedgerSnapshots({
      reconstructed: rebuilt,
      inventorySnapshot: rebuilt.inventory,
      financialSnapshot: rebuilt.financial,
      sha256Hex: sha256,
    });
    expect(matching.inventory.status).toBe('MATCH');
    expect(matching.financial.status).toBe('MATCH');
    expect(() => assertV08LedgerReconciled(matching)).not.toThrow();
  });

  it('reports snapshot mismatch without mutating or repairing lineage', () => {
    const rebuilt = rebuildV08LedgersFromLineage({ seed: seed() });
    const mismatching = hydrateInventoryLedgerState({
      worldId: WORLD,
      worldVersion: '0',
      balances: [
        { account: inventoryAvailable, quantity: Quantity.from('11', 'tonne') },
      ],
    });
    const report = reconcileV08LedgerSnapshots({
      reconstructed: rebuilt,
      inventorySnapshot: mismatching,
      financialSnapshot: rebuilt.financial,
      sha256Hex: sha256,
    });
    expect(report).toMatchObject({
      reconciled: false,
      inventory: { status: 'MISMATCH' },
      financial: { status: 'MATCH' },
    });
    expect(() => assertV08LedgerReconciled(report)).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.RECONCILIATION_MISMATCH,
      }),
    );
    expect(
      rebuilt.inventory.balances[0]?.quantity.toCanonicalValue().amount,
    ).toBe('10');
  });

  it('rejects a forged seed and mismatched replay binding', () => {
    const opening = seed();
    expect(() =>
      rebuildV08LedgersFromLineage({ seed: { ...opening } }),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.OPENING_SEED_INVALID,
      }),
    );
    expect(() =>
      createOpeningSeed(
        {
          ...opening,
          replayBinding: {
            ...CURRENT_REPLAY_BINDING,
            engineVersion: 'unsupported-engine',
          },
        },
        sha256,
      ),
    ).toThrowError(
      expect.objectContaining({ code: DOMAIN_ERROR_CODES.VERSION_MISMATCH }),
    );
    const rebuilt = rebuildV08LedgersFromLineage({ seed: opening });
    expect(() =>
      reconcileV08LedgerSnapshots({
        reconstructed: { ...rebuilt },
        sha256Hex: sha256,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.OPENING_SEED_INVALID,
      }),
    );
  });
});
