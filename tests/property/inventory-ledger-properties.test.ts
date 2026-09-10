import { createHash } from 'node:crypto';

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  INVENTORY_POSTING_SCHEMA_VERSION,
  Quantity,
  SimTime,
  applyInventoryPosting,
  canonicalSerialize,
  commandId,
  commodityId,
  countryId,
  createInventoryAccount,
  createReservationPosting,
  eventId,
  hydrateInventoryLedgerState,
  inventoryBatchId,
  inventoryLocationId,
  inventoryPostingId,
  inventoryReservationId,
  legalEntityId,
  worldId,
} from '../../packages/core/src/index.js';
import { FOUNDATION_PROPERTY_CONFIG } from './property-config.js';

const sha256 = (preimage: string) =>
  createHash('sha256').update(preimage, 'utf8').digest('hex');

const WORLD = worldId('WORLD_PROPERTY');
const available = createInventoryAccount({
  worldId: WORLD,
  countryId: countryId('COUNTRY_PROPERTY'),
  commodityId: commodityId('PROPERTY_GOOD'),
  batchId: inventoryBatchId('BATCH_PROPERTY'),
  unit: 'kg',
  physicalLocationId: inventoryLocationId('LOCATION_PROPERTY'),
  bucket: 'AVAILABLE',
  reservationId: null,
  shipmentId: null,
  titleHolderId: legalEntityId('ENTITY_PROPERTY'),
  riskBearerId: legalEntityId('ENTITY_PROPERTY'),
  economicRecognitionId: null,
});
const reserved = createInventoryAccount({
  ...available,
  bucket: 'RESERVED',
  reservationId: inventoryReservationId('RESERVATION_PROPERTY'),
});

function initial(total: bigint) {
  return hydrateInventoryLedgerState({
    worldId: WORLD,
    worldVersion: '0',
    balances: [
      { account: available, quantity: Quantity.from(String(total), 'kg') },
    ],
  });
}

function reserve(total: bigint, requested: bigint) {
  const posting = createReservationPosting(
    {
      schemaVersion: INVENTORY_POSTING_SCHEMA_VERSION,
      postingId: inventoryPostingId('POSTING_PROPERTY'),
      worldId: WORLD,
      causationCommandId: commandId('COMMAND_PROPERTY'),
      causationEventIds: [eventId('EVENT_PROPERTY')],
      worldVersionBefore: '0',
      worldVersionAfter: '1',
      simTime: SimTime.fromTicks('10000'),
      quantity: Quantity.from(String(requested), 'kg'),
      source: available,
      destination: reserved,
    },
    sha256,
  );
  return applyInventoryPosting(initial(total), posting);
}

describe('V08.1 inventory conservation properties', () => {
  it('conserves every generated valid reservation exactly', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 10n ** 30n }),
        fc.bigInt({ min: 1n, max: 10n ** 30n }),
        (first, second) => {
          const total = first + second;
          const result = reserve(total, first);
          const quantities = result.state.balances.map(
            (balance) => balance.quantity,
          );
          const sum = quantities.reduce(
            (accumulator, quantity) => accumulator.add(quantity),
            Quantity.from('0', 'kg'),
          );
          expect(sum.toCanonicalValue().amount).toBe(String(total));
          expect(
            quantities.every((quantity) => !quantity.amount.isNegative()),
          ).toBe(true);
        },
      ),
      {
        ...FOUNDATION_PROPERTY_CONFIG,
        seed: FOUNDATION_PROPERTY_CONFIG.seed + 80,
      },
    );
  });

  it('rejects every generated over-reservation without partial mutation', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 10n ** 24n }),
        fc.bigInt({ min: 1n, max: 10n ** 24n }),
        (total, excess) => {
          const before = initial(total);
          expect(() => reserve(total, total + excess)).toThrow();
          expect(before.worldVersion).toBe('0');
          expect(before.balances[0]?.quantity.toCanonicalValue().amount).toBe(
            String(total),
          );
        },
      ),
      {
        ...FOUNDATION_PROPERTY_CONFIG,
        seed: FOUNDATION_PROPERTY_CONFIG.seed + 81,
      },
    );
  });

  it('replays identical posting intent to identical state and receipt evidence', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 2n, max: 10n ** 24n }),
        fc.bigInt({ min: 1n, max: 10n ** 12n }),
        (total, rawRequested) => {
          const requested = (rawRequested % (total - 1n)) + 1n;
          const first = reserve(total, requested);
          const replayed = reserve(total, requested);
          expect(canonicalSerialize(replayed.state)).toBe(
            canonicalSerialize(first.state),
          );
          expect(canonicalSerialize(replayed.receipt)).toBe(
            canonicalSerialize(first.receipt),
          );
        },
      ),
      {
        ...FOUNDATION_PROPERTY_CONFIG,
        seed: FOUNDATION_PROPERTY_CONFIG.seed + 82,
      },
    );
  });
});
