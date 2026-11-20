/** Actual selected 70-country source and canonical financial/supply seed.
 * Only the document envelope is scoped to this read-validator test; it grants
 * no project adoption, database admission, authorization or live World. */
import { createHash } from 'node:crypto';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  canonicalSerialize,
  createOpeningSeed,
  createOpeningSource,
  openingSourceId,
  openingInventoryEntryId,
  createInventoryAccount,
  inventoryBatchId,
  OPENING_SOURCE_SCHEMA_VERSION,
  type OpeningSeed,
} from '@econmind/core';
import { preparePostwarWorldGenesis } from '../../apps/world-worker/src/preparation/postwar-world-genesis.js';
import {
  createPostwarPhysicalServiceReceipt,
  validatePostwarPhysicalServiceReceiptFromSeed,
  consumePostwarPhysicalServiceReceipt,
  type PostwarPhysicalReceiptDocument,
} from '../../apps/world-worker/src/preparation/postwar-physical-service-receipt.js';

const prepared = await preparePostwarWorldGenesis({
  repositoryRoot: path.resolve(import.meta.dirname, '../..'),
  worldId: 'WORLD_POSTWAR_PHYSICAL_RECEIPT_TEST',
  seedId: 'SEED_POSTWAR_PHYSICAL_RECEIPT_TEST',
  genesisVersion: 'POSTWAR_PHYSICAL_RECEIPT_TEST_V1',
  valueDate: '2026-10-28',
});
const original = canonicalSerialize(prepared.supplySeed);
const created = createPostwarPhysicalServiceReceipt({
  context: prepared.context,
  social: prepared.social,
  utilities: prepared.utilities,
  utilityAllocations: prepared.utilityAllocations,
  supplies: prepared.supplies,
  supplyAllocations: prepared.supplyAllocations,
  suppliesSeed: prepared.supplySeed,
  worldId: prepared.input.worldId,
  seedId: prepared.input.seedId,
  openingGregorianTimestamp: prepared.utilities.openingGregorianTimestamp,
  policyBytes: {
    utilities: prepared.policyBytes.utilities,
    supplies: prepared.policyBytes.supplies,
  },
});
const sha = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
const clone = <T>(value: T): T => JSON.parse(canonicalSerialize(value)) as T;
const storedPolicies = JSON.parse(
  created.documents.find(
    (document) => document.documentId === created.receipt.policyDocumentId,
  )!.bytes,
).policies;
const materialUnits = JSON.parse(storedPolicies.supplies).schoolMaterials
  .unitsPerSeatSimDay as string;
const doseUnits = JSON.parse(storedPolicies.social).healthcare
  .dosesPerEpisode as string;
const serviceClaims = prepared.social.regions.flatMap((region) => {
  const row = created.regions.find(
    (item) => item.locationId === region.locationId,
  )!;
  return (['SCHOOL', 'MEDICAL'] as const).map((kind) => {
    const serviceId =
      kind === 'SCHOOL' ? region.schoolAssetId : region.hospitalAssetId;
    const stock = created.receipt.supplies.stocks.find(
      (item) => item.serviceAssetId === serviceId,
    )!;
    const grant = prepared.supplyAllocations.grants.find(
      (item) => item.entryId === stock.entryId,
    )!;
    const limits =
      kind === 'SCHOOL'
        ? [
            row.educationMaterialSeats,
            row.educationWaterStudentDays,
            row.educationPowerStudentDays,
          ]
        : [
            (BigInt(row.medicineDoses) / BigInt(doseUnits)).toString(),
            row.waterEpisodes,
            row.powerEpisodes,
          ];
    const cap = limits
      .map(BigInt)
      .reduce((a, b) => (a < b ? a : b))
      .toString();
    return {
      serviceId,
      regionId: region.locationId,
      kind,
      capacityCount: cap,
      allocatedCount: '0',
      capacityBounds: [
        {
          reference:
            kind === 'SCHOOL'
              ? 'FUNDED_MATERIAL_AND_UTILITY_SEATS'
              : 'FINITE_SUPPLY_AND_UTILITIES',
          count: cap,
        },
      ],
      inputAllocations: [
        {
          allocationId: grant.allocationId,
          sourceId: grant.sourceId,
          entryId: grant.entryId,
          commodityId: grant.commodityId,
          unit: grant.unit,
          quantity: grant.quantity,
          unitsPerService: kind === 'SCHOOL' ? materialUnits : doseUnits,
        },
      ],
    };
  });
});
function envelope(
  documents: readonly PostwarPhysicalReceiptDocument[] = created.documents,
  documentId = created.receiptDocumentId,
  base: OpeningSeed = prepared.supplySeed,
  services: typeof serviceClaims = serviceClaims,
): OpeningSeed {
  const source = createOpeningSource(
    {
      schemaVersion: OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: openingSourceId('SOURCE_POSTWAR_PHYSICAL_READ_TEST'),
      sourceKind: 'DOCUMENTED_ASSUMPTION',
      sourceVersion: 'POSTWAR_PHYSICAL_READ_TEST_V1',
      locator: 'TEST_ONLY_DOCUMENT_ENVELOPE_ACTUAL_SOURCE_RECEIPT',
      payload: {
        schemaVersion: 'postwar-operating-genesis-seed-source-v1',
        carrier: {
          physicalServiceReceiptDocumentId: documentId,
          documents,
          facts: { services },
        },
      },
    },
    sha,
  );
  return createOpeningSeed(
    { ...base, sources: [...base.sources, source] },
    sha,
  );
}
const seed = envelope();
const read = (value: OpeningSeed = seed) =>
  validatePostwarPhysicalServiceReceiptFromSeed({
    seed: value,
    documentId: created.receiptDocumentId,
    context: prepared.context,
  });
function changedReceipt(
  change: (value: typeof created.receipt) => void,
): OpeningSeed {
  const receipt = clone(created.receipt);
  change(receipt);
  const documents = created.documents.map((document) =>
    document.documentId === created.receiptDocumentId
      ? {
          ...document,
          bytes: canonicalSerialize(receipt),
          sha256: sha(canonicalSerialize(receipt)),
        }
      : document,
  );
  // Recompute all outer Core/source/document hashes. A self-consistent envelope
  // still cannot substitute a different physical source or global allocation.
  return envelope(documents);
}

describe('actual source to persisted global physical service receipt', () => {
  it('binds persisted service capacity and input references to the same globally conserved physical receipt', () => {
    const over = clone(serviceClaims);
    over[0]!.capacityCount = '99999999999999999';
    expect(() =>
      read(
        envelope(
          created.documents,
          created.receiptDocumentId,
          prepared.supplySeed,
          over,
        ),
      ),
    ).toThrow('exceeds recomputed');
    const foreign = clone(serviceClaims);
    foreign[0]!.inputAllocations[0]!.entryId =
      foreign[1]!.inputAllocations[0]!.entryId;
    expect(() =>
      read(
        envelope(
          created.documents,
          created.receiptDocumentId,
          prepared.supplySeed,
          foreign,
        ),
      ),
    ).toThrow('input reference differs');
  });
  it('rederives all finite utility accounts/grants and the sole first-day supply plan from the canonical seed and pinned context', () => {
    const current = read();
    expect(current).toEqual(created.receipt);
    expect(current.utility.inputs.accounts).toHaveLength(192);
    expect(current.utility.allocation.grants).toHaveLength(488);
    expect(current.supplies.stocks).toHaveLength(244);
    expect(current.supplies.plan.grants).toHaveLength(244);
    expect(current.regions).toHaveLength(122);
    expect(
      current.regions.some(
        (region) =>
          BigInt(region.waterEpisodes) > 0n &&
          BigInt(region.powerEpisodes) > 0n,
      ),
    ).toBe(true);
    expect(seed.inventoryEntries).toEqual(prepared.supplySeed.inventoryEntries);
    expect(seed.financialBatches).toEqual(prepared.supplySeed.financialBatches);
    expect(canonicalSerialize(prepared.supplySeed)).toBe(original);
    expect(consumePostwarPhysicalServiceReceipt(current)).toBe(current);
    expect(() => consumePostwarPhysicalServiceReceipt({ ...current })).toThrow(
      'Recomputed',
    );
  });

  it('rejects rehashed account/capacity and source-use claims rather than accepting JSON hash or authority fields', () => {
    const excessWater = changedReceipt((value) => {
      (
        value.utility.inputs.accounts[0] as { availableAmount: string }
      ).availableAmount = '999999999999999999999';
    });
    expect(() => read(excessWater)).toThrow('does not match source');
    const falseEnergy = changedReceipt((value) => {
      const power = value.utility.allocation.accounts.find(
        (account) => account.utility === 'POWER',
      )!;
      (
        power as {
          sourceEnergyReservedMWh: { numerator: string; denominator: string };
        }
      ).sourceEnergyReservedMWh = {
        numerator: '999999999999999999',
        denominator: '1',
      };
    });
    expect(() => read(falseEnergy)).toThrow('does not match source');
  });

  it('rejects duplicate or enlarged first-day inventory plans even when the document and Core seed hashes are regenerated', () => {
    const duplicate = changedReceipt((value) => {
      (value.supplies.plan.grants as unknown[]).push(
        clone(value.supplies.plan.grants[0]!),
      );
    });
    expect(() => read(duplicate)).toThrow('does not match source');
    const stock = prepared.supplies.stocks[0]!;
    const extra = createOpeningSeed(
      {
        ...prepared.supplySeed,
        inventoryEntries: [
          ...prepared.supplySeed.inventoryEntries,
          {
            ...stock.entry,
            entryId: openingInventoryEntryId(
              'ENTRY_TEST_ONLY_DUPLICATE_PUBLIC_SUPPLY',
            ),
            account: createInventoryAccount({
              ...stock.entry.account,
              batchId: inventoryBatchId(
                'BATCH_TEST_ONLY_DUPLICATE_PUBLIC_SUPPLY',
              ),
            }),
          },
        ],
      },
      sha,
    );
    expect(() =>
      read(envelope(created.documents, created.receiptDocumentId, extra)),
    ).toThrow();
  });

  it('rejects foreign context/world and missing or changed raw policy documents without recreating physical stock', () => {
    expect(() =>
      validatePostwarPhysicalServiceReceiptFromSeed({
        seed,
        documentId: created.receiptDocumentId,
        context: {
          ...prepared.context,
          source: { ...prepared.context.source },
        },
      }),
    ).toThrow('Actual verified');
    const foreign = changedReceipt((value) => {
      (value as { worldId: string }).worldId = 'WORLD_FOREIGN';
    });
    expect(() => read(foreign)).toThrow('schema/world/seed differs');
    const missing = envelope(
      created.documents.filter(
        (document) => document.documentId === created.receiptDocumentId,
      ),
    );
    expect(() => read(missing)).toThrow('Exact unique');
    const changed = created.documents.map((document) =>
      document.documentId === created.receipt.policyDocumentId
        ? {
            ...document,
            bytes: document.bytes + '\n',
            sha256: sha(document.bytes + '\n'),
          }
        : document,
    );
    expect(() => read(envelope(changed))).toThrow('Canonical physical policy');
    expect(canonicalSerialize(prepared.supplySeed)).toBe(original);
  });
});
