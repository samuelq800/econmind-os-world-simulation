import { createHash } from 'node:crypto';

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import * as core from '../../packages/core/src/index.js';
import {
  DOMAIN_ERROR_CODES,
  FINANCIAL_POSTING_SCHEMA_VERSION,
  INVENTORY_POSTING_SCHEMA_VERSION,
  Money,
  Quantity,
  SimTime,
  applyFinancialPostingBatch,
  applyInventoryPosting,
  assertV08LedgerReconciled,
  commandId,
  commodityId,
  countryId,
  createFinancialAccount,
  createFinancialPostingBatch,
  createInventoryAccount,
  createReservationPosting,
  eventId,
  financialAccountId,
  financialPostingBatchId,
  financialPostingLegId,
  inventoryBatchId,
  inventoryLocationId,
  inventoryPostingId,
  inventoryReservationId,
  legalEntityId,
  parseFinancialLedgerSnapshot,
  parseInventoryLedgerSnapshot,
  reconcileV08LedgerSnapshots,
  worldId,
  type FinancialLedgerState,
  type InventoryLedgerState,
} from '../../packages/core/src/index.js';
import { FOUNDATION_PROPERTY_CONFIG } from '../property/property-config.js';
import { openingLedgers } from '../helpers/v08-ledgers.js';

const sha256 = (preimage: string) =>
  createHash('sha256').update(preimage, 'utf8').digest('hex');
const WORLD = worldId('WORLD_AUTHORITY_BOUNDARY');
const OWNER = legalEntityId('ENTITY_AUTHORITY_OWNER');
const COUNTRY = countryId('COUNTRY_AUTHORITY');
const available = createInventoryAccount({
  worldId: WORLD,
  countryId: COUNTRY,
  commodityId: commodityId('AUTHORITY_GOOD'),
  batchId: inventoryBatchId('AUTHORITY_BATCH'),
  unit: 'tonne',
  physicalLocationId: inventoryLocationId('AUTHORITY_LOCATION'),
  bucket: 'AVAILABLE',
  reservationId: null,
  shipmentId: null,
  titleHolderId: OWNER,
  riskBearerId: OWNER,
  economicRecognitionId: null,
});
const reserved = createInventoryAccount({
  ...available,
  bucket: 'RESERVED',
  reservationId: inventoryReservationId('AUTHORITY_RESERVATION'),
});
const cash = createFinancialAccount({
  worldId: WORLD,
  accountId: financialAccountId('AUTHORITY_CASH'),
  ownerId: OWNER,
  countryId: COUNTRY,
  accountClass: 'CASH',
  currency: 'GCU',
  claimId: null,
  counterpartyEntityId: null,
});
const equity = createFinancialAccount({
  ...cash,
  accountId: financialAccountId('AUTHORITY_EQUITY'),
  accountClass: 'EQUITY',
});

function inventoryPosting(version: string) {
  return createReservationPosting(
    {
      schemaVersion: INVENTORY_POSTING_SCHEMA_VERSION,
      postingId: inventoryPostingId(`AUTHORITY_INVENTORY_${version}`),
      worldId: WORLD,
      causationCommandId: commandId(`AUTHORITY_COMMAND_I_${version}`),
      causationEventIds: [eventId(`AUTHORITY_EVENT_I_${version}`)],
      worldVersionBefore: version,
      worldVersionAfter: (BigInt(version) + 1n).toString(),
      simTime: SimTime.fromTicks('10000'),
      quantity: Quantity.from('1', 'tonne'),
      source: available,
      destination: reserved,
    },
    sha256,
  );
}

function financialPosting(version: string) {
  return createFinancialPostingBatch(
    {
      schemaVersion: FINANCIAL_POSTING_SCHEMA_VERSION,
      batchId: financialPostingBatchId(`AUTHORITY_FINANCIAL_${version}`),
      worldId: WORLD,
      causationCommandId: commandId(`AUTHORITY_COMMAND_F_${version}`),
      causationEventIds: [eventId(`AUTHORITY_EVENT_F_${version}`)],
      worldVersionBefore: version,
      worldVersionAfter: (BigInt(version) + 1n).toString(),
      simTime: SimTime.fromTicks('10000'),
      settlementCurrency: 'GCU',
      legs: [
        {
          legId: financialPostingLegId(`AUTHORITY_DEBIT_${version}`),
          account: cash,
          direction: 'DEBIT',
          amount: Money.from('1', 'GCU'),
          counterpartyAccountId: equity.accountId,
        },
        {
          legId: financialPostingLegId(`AUTHORITY_CREDIT_${version}`),
          account: equity,
          direction: 'CREDIT',
          amount: Money.from('1', 'GCU'),
          counterpartyAccountId: cash.accountId,
        },
      ],
    },
    sha256,
  );
}

describe('V08 authoritative ledger authority boundary', () => {
  it('keeps raw inventory snapshot data outside the authoritative writer type', () => {
    const raw = parseInventoryLedgerSnapshot({
      worldId: WORLD,
      worldVersion: '77',
      balances: [
        { account: available, quantity: Quantity.from('999', 'tonne') },
      ],
      appliedPostings: [
        {
          postingId: inventoryPostingId('ARBITRARY_HISTORY'),
          fingerprint: `sha256:${'a'.repeat(64)}`,
        },
      ],
    });
    expect(() =>
      applyInventoryPosting(
        raw as InventoryLedgerState,
        inventoryPosting('77'),
      ),
    ).toThrowError(
      expect.objectContaining({ code: DOMAIN_ERROR_CODES.VERSION_MISMATCH }),
    );
  });

  it('keeps an unbalanced raw financial snapshot outside the authoritative writer type', () => {
    const raw = parseFinancialLedgerSnapshot({
      worldId: WORLD,
      worldVersion: '77',
      accounts: [cash],
      positions: [{ account: cash, netDebitBalance: Money.from('123', 'GCU') }],
      appliedBatches: [
        {
          batchId: financialPostingBatchId('ARBITRARY_FINANCIAL_HISTORY'),
          fingerprint: `sha256:${'b'.repeat(64)}`,
        },
      ],
    });
    expect(() =>
      applyFinancialPostingBatch(
        raw as FinancialLedgerState,
        financialPosting('77'),
      ),
    ).toThrowError(
      expect.objectContaining({ code: DOMAIN_ERROR_CODES.VERSION_MISMATCH }),
    );
  });

  it('exports parsers but no raw-to-authoritative hydration bypass', () => {
    expect(core).toHaveProperty('parseInventoryLedgerSnapshot');
    expect(core).toHaveProperty('parseFinancialLedgerSnapshot');
    expect(core).not.toHaveProperty('hydrateInventoryLedgerState');
    expect(core).not.toHaveProperty('hydrateFinancialLedgerState');
    expect(core).not.toHaveProperty('authorizeInventoryLedgerState');
    expect(core).not.toHaveProperty('authorizeFinancialLedgerState');
  });

  it('fails closed on a snapshot mismatch and preserves canonical lineage state', () => {
    const rebuilt = openingLedgers({
      worldId: WORLD,
      sha256Hex: sha256,
      inventory: {
        account: available,
        quantity: Quantity.from('10', 'tonne'),
      },
    });
    const raw = parseInventoryLedgerSnapshot({
      worldId: WORLD,
      worldVersion: '77',
      balances: [
        { account: available, quantity: Quantity.from('999', 'tonne') },
      ],
      appliedPostings: [],
    });
    const report = reconcileV08LedgerSnapshots({
      reconstructed: rebuilt,
      inventorySnapshot: raw,
      sha256Hex: sha256,
    });
    expect(report.reconciled).toBe(false);
    expect(report.inventory.status).toBe('MISMATCH');
    expect(() => assertV08LedgerReconciled(report)).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.RECONCILIATION_MISMATCH,
      }),
    );
    expect(rebuilt.worldVersion).toBe('0');
    expect(
      rebuilt.inventory.balances[0]?.quantity.toCanonicalValue().amount,
    ).toBe('10');
  });

  it('accepts only opening-plus-lineage state at the posting boundary', () => {
    const rebuilt = openingLedgers({
      worldId: WORLD,
      sha256Hex: sha256,
      inventory: {
        account: available,
        quantity: Quantity.from('10', 'tonne'),
      },
    });
    const result = applyInventoryPosting(
      rebuilt.inventory,
      inventoryPosting('0'),
    );
    expect(result.state.worldVersion).toBe('1');
  });

  it('never grants authority to arbitrary parsed inventory snapshot mutations', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 10n ** 24n }),
        fc.bigInt({ min: 0n, max: 10n ** 12n }),
        (quantity, version) => {
          const raw = parseInventoryLedgerSnapshot({
            worldId: WORLD,
            worldVersion: version.toString(),
            balances: [
              {
                account: available,
                quantity: Quantity.from(quantity.toString(), 'tonne'),
              },
            ],
            appliedPostings: [],
          });
          expect(() =>
            applyInventoryPosting(
              raw as InventoryLedgerState,
              inventoryPosting(version.toString()),
            ),
          ).toThrowError(
            expect.objectContaining({
              code: DOMAIN_ERROR_CODES.VERSION_MISMATCH,
            }),
          );
        },
      ),
      {
        ...FOUNDATION_PROPERTY_CONFIG,
        seed: FOUNDATION_PROPERTY_CONFIG.seed + 110,
      },
    );
  });
});
