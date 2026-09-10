import { createHash } from 'node:crypto';

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  CURRENT_REPLAY_BINDING,
  Money,
  OPENING_SEED_SCHEMA_VERSION,
  OPENING_SOURCE_SCHEMA_VERSION,
  Quantity,
  canonicalSerialize,
  commodityId,
  countryId,
  createFinancialAccount,
  createInventoryAccount,
  createOpeningSeed,
  createOpeningSource,
  financialAccountId,
  financialOpeningBatchId,
  financialOpeningLegId,
  inventoryBatchId,
  inventoryLocationId,
  legalEntityId,
  openingInventoryEntryId,
  openingSeedId,
  openingSourceId,
  rebuildV08LedgersFromLineage,
  reconcileV08LedgerSnapshots,
  worldId,
} from '../../packages/core/src/index.js';
import { FOUNDATION_PROPERTY_CONFIG } from './property-config.js';

const sha256 = (preimage: string) =>
  createHash('sha256').update(preimage, 'utf8').digest('hex');
const WORLD = worldId('WORLD_OPENING_PROPERTY');
const OWNER = legalEntityId('ENTITY_OWNER');
const COUNTRY = countryId('COUNTRY_A');

function build(amount: bigint, reverse: boolean) {
  const source = createOpeningSource(
    {
      schemaVersion: OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: openingSourceId('SOURCE_PROPERTY'),
      sourceKind: 'TEST_FIXTURE',
      locator: 'tests/property/generated-opening',
      sourceVersion: 'property-v1',
      payload: { amount: amount.toString() },
    },
    sha256,
  );
  const inventoryAccount = createInventoryAccount({
    worldId: WORLD,
    countryId: COUNTRY,
    commodityId: commodityId('RESOURCE'),
    batchId: inventoryBatchId('BATCH_PROPERTY'),
    unit: 'unit',
    physicalLocationId: inventoryLocationId('LOCATION_A'),
    bucket: 'AVAILABLE',
    reservationId: null,
    shipmentId: null,
    titleHolderId: OWNER,
    riskBearerId: OWNER,
    economicRecognitionId: null,
  });
  const debit = createFinancialAccount({
    worldId: WORLD,
    accountId: financialAccountId('ACCOUNT_DEBIT'),
    ownerId: OWNER,
    countryId: COUNTRY,
    accountClass: 'ASSET',
    currency: 'GCU',
    claimId: null,
    counterpartyEntityId: null,
  });
  const credit = createFinancialAccount({
    ...debit,
    accountId: financialAccountId('ACCOUNT_CREDIT'),
    accountClass: 'EQUITY',
  });
  const legs = [
    {
      legId: financialOpeningLegId('LEG_DEBIT'),
      account: debit,
      direction: 'DEBIT' as const,
      amount: Money.from(amount.toString(), 'GCU'),
      counterpartLegId: financialOpeningLegId('LEG_CREDIT'),
    },
    {
      legId: financialOpeningLegId('LEG_CREDIT'),
      account: credit,
      direction: 'CREDIT' as const,
      amount: Money.from(amount.toString(), 'GCU'),
      counterpartLegId: financialOpeningLegId('LEG_DEBIT'),
    },
  ];
  return createOpeningSeed(
    {
      schemaVersion: OPENING_SEED_SCHEMA_VERSION,
      seedId: openingSeedId('SEED_PROPERTY'),
      worldId: WORLD,
      openingWorldVersion: '0',
      replayBinding: CURRENT_REPLAY_BINDING,
      sources: [source],
      inventoryEntries: [
        {
          entryId: openingInventoryEntryId('INVENTORY_PROPERTY'),
          sourceId: source.sourceId,
          account: inventoryAccount,
          quantity: Quantity.from(amount.toString(), 'unit'),
        },
      ],
      financialBatches: [
        {
          batchId: financialOpeningBatchId('FINANCE_PROPERTY'),
          sourceId: source.sourceId,
          settlementCurrency: 'GCU',
          legs: reverse ? [...legs].reverse() : legs,
        },
      ],
    },
    sha256,
  );
}

describe('V08.3 opening reconciliation properties', () => {
  it('rebuilds every generated exact counterpart opening deterministically', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: 10n ** 30n }), (amount) => {
        const forward = rebuildV08LedgersFromLineage({
          seed: build(amount, false),
        });
        const reverse = rebuildV08LedgersFromLineage({
          seed: build(amount, true),
        });
        expect(canonicalSerialize(reverse)).toBe(canonicalSerialize(forward));
        const net = forward.financial.positions.reduce(
          (sum, position) => sum.add(position.netDebitBalance),
          Money.from('0', 'GCU'),
        );
        expect(net.toCanonicalValue().amount).toBe('0');
      }),
      {
        ...FOUNDATION_PROPERTY_CONFIG,
        seed: FOUNDATION_PROPERTY_CONFIG.seed + 100,
      },
    );
  });

  it('always reconstructs without a snapshot and matches its derived projection', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: 10n ** 24n }), (amount) => {
        const rebuilt = rebuildV08LedgersFromLineage({
          seed: build(amount, false),
        });
        const absent = reconcileV08LedgerSnapshots({
          reconstructed: rebuilt,
          sha256Hex: sha256,
        });
        expect(absent.reconciled).toBe(true);
        const matched = reconcileV08LedgerSnapshots({
          reconstructed: rebuilt,
          inventorySnapshot: rebuilt.inventory,
          financialSnapshot: rebuilt.financial,
          sha256Hex: sha256,
        });
        expect(matched.reconciled).toBe(true);
        expect(matched.inventory.status).toBe('MATCH');
        expect(matched.financial.status).toBe('MATCH');
      }),
      {
        ...FOUNDATION_PROPERTY_CONFIG,
        seed: FOUNDATION_PROPERTY_CONFIG.seed + 101,
      },
    );
  });
});
