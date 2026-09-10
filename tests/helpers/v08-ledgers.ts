import {
  CURRENT_REPLAY_BINDING,
  OPENING_SEED_SCHEMA_VERSION,
  OPENING_SOURCE_SCHEMA_VERSION,
  createOpeningSeed,
  createOpeningSource,
  openingInventoryEntryId,
  openingSeedId,
  openingSourceId,
  rebuildV08LedgersFromLineage,
  type InventoryAccount,
  type OpeningSeed,
  type Quantity,
  type RebuiltV08Ledgers,
  type Sha256Hex,
  type WorldId,
} from '../../packages/core/src/index.js';

export function openingLedgers(input: {
  readonly worldId: WorldId;
  readonly sha256Hex: Sha256Hex;
  readonly inventory?: Readonly<{
    account: Readonly<InventoryAccount>;
    quantity: Quantity;
  }>;
}): Readonly<RebuiltV08Ledgers> {
  return rebuildV08LedgersFromLineage({ seed: testOpeningSeed(input) });
}

export function testOpeningSeed(input: {
  readonly worldId: WorldId;
  readonly sha256Hex: Sha256Hex;
  readonly inventory?: Readonly<{
    account: Readonly<InventoryAccount>;
    quantity: Quantity;
  }>;
}): Readonly<OpeningSeed> {
  const source = createOpeningSource(
    {
      schemaVersion: OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: openingSourceId(`SOURCE_${input.worldId}`),
      sourceKind: 'TEST_FIXTURE',
      locator: 'tests/helpers/v08-ledgers.ts',
      sourceVersion: 'v08-forward-fix-1',
      payload: { worldId: input.worldId },
    },
    input.sha256Hex,
  );
  return createOpeningSeed(
    {
      schemaVersion: OPENING_SEED_SCHEMA_VERSION,
      seedId: openingSeedId(`SEED_${input.worldId}`),
      worldId: input.worldId,
      openingWorldVersion: '0',
      replayBinding: CURRENT_REPLAY_BINDING,
      sources: [source],
      inventoryEntries:
        input.inventory === undefined
          ? []
          : [
              {
                entryId: openingInventoryEntryId(
                  `OPENING_INVENTORY_${input.worldId}`,
                ),
                sourceId: source.sourceId,
                account: input.inventory.account,
                quantity: input.inventory.quantity,
              },
            ],
      financialBatches: [],
    },
    input.sha256Hex,
  );
}
