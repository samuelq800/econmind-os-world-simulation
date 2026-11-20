/** Fixed Core source reconstruction only. This private preparation proves no
 * admission, lease publication, Clock, actor or automatic execution authority. */
import { createHash } from 'node:crypto';
import {
  canonicalSerialize,
  createOpeningSeed,
  isValidatedOpeningSeed,
  parseOpeningSeed,
  rebuildV08LedgersFromLineage,
  verifyBeneficialHousingReclassification,
  aggregateBeneficialHousingLiquidClaim,
  type OpeningSeed,
  type FinancialLedgerState,
  type BeneficialHousingReclassificationReceipt,
} from '@econmind/core';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function invalid(reason: string): never {
  throw Error('BENEFICIAL_RENT_SOURCE:' + reason);
}
const same = (a: unknown, b: unknown) =>
  canonicalSerialize(a) === canonicalSerialize(b);
declare const prepared: unique symbol;
export interface PreparedBeneficialHousingRentSource {
  readonly [prepared]: true;
}
export interface BeneficialHousingRentSourceData {
  readonly worldId: string;
  readonly seedId: string;
  readonly seedFingerprint: string;
  readonly parentSeedFingerprint: string;
  readonly canonicalSeedSha256: string;
  readonly bundleBytes: string;
  readonly bundleSha256: string;
  readonly openingFinancial: Readonly<FinancialLedgerState>;
  readonly receipts: readonly BeneficialHousingReclassificationReceipt[];
}
const sources = new WeakMap<
  object,
  Readonly<BeneficialHousingRentSourceData>
>();
/** All country children must reconstruct independently from the exact retained
 * parent, then cover the composed seed's complete additional source/batch set.
 * Finite TEST_ONLY fixtures may contain one country; a 70-country seed cannot
 * omit 69 receipts, hide an extra source, change inventory or replace its parent.
 * The existing 70-country producer/verifier is deliberately unchanged. */
export function prepareBeneficialHousingRentSource(input: {
  readonly parentSeed: Readonly<OpeningSeed>;
  readonly seed: Readonly<OpeningSeed>;
  readonly receipts: readonly BeneficialHousingReclassificationReceipt[];
}): PreparedBeneficialHousingRentSource {
  if (
    !isValidatedOpeningSeed(input.seed) ||
    !isValidatedOpeningSeed(input.parentSeed)
  )
    invalid('GENUINE_CORE_SEEDS_REQUIRED');
  // Reparse with the fixed actual digest; never trust a caller SHA implementation.
  const parent = parseOpeningSeed(
    JSON.parse(canonicalSerialize(input.parentSeed)),
    sha,
  );
  const seed = parseOpeningSeed(
    JSON.parse(canonicalSerialize(input.seed)),
    sha,
  );
  if (
    seed.worldId !== parent.worldId ||
    seed.seedId !== parent.seedId ||
    seed.openingWorldVersion !== '0' ||
    parent.openingWorldVersion !== '0' ||
    !same(seed.replayBinding, parent.replayBinding) ||
    !same(seed.inventoryEntries, parent.inventoryEntries)
  )
    invalid('EXACT_IMMUTABLE_PARENT_WORLD_INVENTORY_REQUIRED');
  if (
    input.receipts.length < 1 ||
    input.receipts.length > 70 ||
    new Set(input.receipts.map((r) => r.countryId)).size !==
      input.receipts.length
  )
    invalid('COMPLETE_UNIQUE_FINITE_COUNTRY_FAMILY_REQUIRED');
  const before = rebuildV08LedgersFromLineage({ seed: parent, sha256Hex: sha });
  void before;
  const after = rebuildV08LedgersFromLineage({ seed, sha256Hex: sha });
  const sourceIds = new Set(parent.sources.map((s) => s.sourceId));
  const batchIds = new Set(parent.financialBatches.map((b) => b.batchId));
  const receipts = input.receipts
    .map((original) => {
      if (original.parentSeedFingerprint !== parent.fingerprint)
        invalid('EXACT_PARENT_FINGERPRINT_REQUIRED');
      const source = seed.sources.find(
        (s) => s.sourceId === original.supplementalSourceId,
      );
      const batch = seed.financialBatches.find(
        (b) => b.batchId === original.reclassificationBatchId,
      );
      if (
        !source ||
        !batch ||
        sourceIds.has(source.sourceId) ||
        batchIds.has(batch.batchId)
      )
        invalid('UNIQUE_ACTUAL_SOURCE_AND_BATCH_REQUIRED');
      sourceIds.add(source.sourceId);
      batchIds.add(batch.batchId);
      const child = createOpeningSeed(
        {
          ...parent,
          sources: [...parent.sources, source],
          financialBatches: [...parent.financialBatches, batch],
        },
        sha,
      );
      const receipt = verifyBeneficialHousingReclassification(
        parent,
        child,
        original,
        sha,
      );
      aggregateBeneficialHousingLiquidClaim(after.financial, receipt);
      return receipt;
    })
    .sort((a, b) => a.countryId.localeCompare(b.countryId));
  if (
    sourceIds.size !== seed.sources.length ||
    batchIds.size !== seed.financialBatches.length ||
    !same(
      seed.sources.filter((s) =>
        parent.sources.some((p) => p.sourceId === s.sourceId),
      ),
      parent.sources,
    ) ||
    !same(
      seed.financialBatches.filter((b) =>
        parent.financialBatches.some((p) => p.batchId === b.batchId),
      ),
      parent.financialBatches,
    )
  )
    invalid('COMPLETE_PARENT_AND_COMPOSED_SOURCE_BATCH_COVERAGE_REQUIRED');
  const bundleBytes = canonicalSerialize({
    schemaVersion: 'postwar-beneficial-housing-rent-source-v1',
    worldId: seed.worldId,
    seedId: seed.seedId,
    seedFingerprint: seed.fingerprint,
    parentSeedFingerprint: parent.fingerprint,
    receipts,
  });
  const { fingerprint: _fp, ...intent } = seed;
  void _fp;
  const data: Readonly<BeneficialHousingRentSourceData> = Object.freeze({
    worldId: seed.worldId,
    seedId: seed.seedId,
    seedFingerprint: seed.fingerprint,
    parentSeedFingerprint: parent.fingerprint,
    canonicalSeedSha256: sha(canonicalSerialize(intent)),
    bundleBytes,
    bundleSha256: sha(bundleBytes),
    openingFinancial: after.financial,
    receipts: Object.freeze(receipts),
  });
  const token = Object.freeze({}) as PreparedBeneficialHousingRentSource;
  sources.set(token, data);
  return token;
}
export function consumeBeneficialHousingRentSource(
  value: PreparedBeneficialHousingRentSource,
): Readonly<BeneficialHousingRentSourceData> {
  const data = sources.get(value);
  if (!data) invalid('GENUINE_LIVE_PREPARED_SOURCE_REQUIRED');
  return data;
}
export function retireBeneficialHousingRentSource(
  value: PreparedBeneficialHousingRentSource,
): void {
  sources.delete(value);
}
