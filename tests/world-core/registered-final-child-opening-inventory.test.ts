import { describe, it, expect } from 'vitest';
import * as C from '@econmind/core';
import { createHash } from 'node:crypto';
import { projectRegisteredFinalOpeningInventoryRows } from '../support/registered-final-opening-inventory.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const financial = C.openingSourceId('SOURCE_TEST_ONLY_FINANCIAL');
const supply = C.openingSourceId('SOURCE_TEST_ONLY_SUPPLY');
const sources = [financial, supply].map((sourceId) => ({
  sourceId,
  payloadHash: C.canonicalSha256(C.canonicalHashInput({ sourceId }), sha),
}));
function entry(
  sourceId: C.OpeningInventoryEntry['sourceId'],
  suffix: string,
  country = 'COUNTRY_02',
): C.OpeningInventoryEntry {
  return {
    entryId: C.openingInventoryEntryId('ENTRY_TEST_ONLY_' + suffix),
    sourceId,
    account: C.createInventoryAccount({
      worldId: C.worldId('WORLD_TEST_ONLY_INVENTORY_PROJECTION'),
      countryId: C.countryId(country),
      commodityId: C.commodityId('GRAIN'),
      batchId: C.inventoryBatchId('BATCH_TEST_ONLY_' + suffix),
      unit: 'tonne',
      physicalLocationId: C.inventoryLocationId('LOCATION_TEST_ONLY'),
      bucket: 'AVAILABLE',
      reservationId: null,
      shipmentId: null,
      titleHolderId: C.legalEntityId('ENTITY_OPERATOR_TEST_ONLY'),
      riskBearerId: C.legalEntityId('ENTITY_OPERATOR_TEST_ONLY'),
      economicRecognitionId: null,
    }),
    quantity: C.Quantity.from('3.123456', 'tonne'),
  };
}
describe('complete child opening inventory DATA projection', () => {
  it('retains both financial and supply entries and exact source pins without altering original rows', () => {
    const entries = [
      entry(supply, 'SUPPLY'),
      entry(financial, 'FINANCIAL'),
      entry(supply, 'OTHER', 'COUNTRY_01'),
    ];
    const before = C.canonicalSerialize(entries);
    const result = projectRegisteredFinalOpeningInventoryRows({
      inventoryEntries: entries,
      sources,
      countryId: 'COUNTRY_02',
    });
    expect(result.rows).toEqual(
      JSON.parse(C.canonicalSerialize([entries[1], entries[0]])),
    );
    expect(result.inventorySources).toEqual(
      sources.map((s) => ({
        sourceId: s.sourceId,
        sourcePayloadHash: s.payloadHash,
      })),
    );
    expect(C.canonicalSerialize(entries)).toBe(before);
    expect(Object.isFrozen(result)).toBe(true);
  });
  it.each(['missing', 'duplicate'] as const)(
    'rejects %s used source instead of publishing a partial opening',
    (mode) => {
      const entries = [entry(financial, 'FINANCIAL'), entry(supply, 'SUPPLY')];
      expect(() =>
        projectRegisteredFinalOpeningInventoryRows({
          inventoryEntries: entries,
          sources:
            mode === 'missing' ? [sources[0]!] : [...sources, sources[1]!],
          countryId: 'COUNTRY_02',
        }),
      ).toThrow('EXACT_RETAINED_OPENING_INVENTORY_SOURCE_REQUIRED');
    },
  );
});
