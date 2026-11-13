import * as C from '@econmind/core';

/** Serializable DATA only. The caller that issues/install documents must still
 * validate the actual child seed and its live private preparation. Every
 * adopted opening inventory source contributes, not only financial stocks. */
export function projectRegisteredFinalOpeningInventoryRows(input: {
  readonly inventoryEntries: C.OpeningSeed['inventoryEntries'];
  readonly sources: readonly Pick<
    C.OpeningSeed['sources'][number],
    'sourceId' | 'payloadHash'
  >[];
  readonly countryId: string;
}) {
  const rows = input.inventoryEntries
    .filter((entry) => entry.account.countryId === input.countryId)
    .sort((a, b) =>
      a.entryId < b.entryId ? -1 : a.entryId > b.entryId ? 1 : 0,
    );
  const sourceIds = [...new Set(rows.map((entry) => entry.sourceId))].sort();
  const inventorySources = sourceIds.map((sourceId) => {
    const matches = input.sources.filter(
      (source) => source.sourceId === sourceId,
    );
    if (
      matches.length !== 1 ||
      !/^sha256:[a-f0-9]{64}$/u.test(matches[0]!.payloadHash)
    )
      throw Error(
        'REGISTERED_CHILD_H0:EXACT_RETAINED_OPENING_INVENTORY_SOURCE_REQUIRED',
      );
    return { sourceId, sourcePayloadHash: matches[0]!.payloadHash };
  });
  return Object.freeze({
    rows: Object.freeze(JSON.parse(C.canonicalSerialize(rows)) as unknown[]),
    inventorySources: Object.freeze(
      inventorySources.map((source) => Object.freeze(source)),
    ),
  });
}
