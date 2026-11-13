/** Fixed known beneficial delta → unchanged genuine parent view. Never
 * rewrites the parent fingerprint, grants admission or replaces child SQL pins. */
import {
  createOpeningSeed,
  type OpeningSeed,
  type BeneficialHousingReclassificationReceipt,
} from '@econmind/core';
import { createHash } from 'node:crypto';
import {
  consumeBeneficialHousingRentSource,
  type PreparedBeneficialHousingRentSource,
} from './postwar-beneficial-housing-rent-source.js';
import {
  requirePostwarSha256OpeningSeed,
  readPostwarOperatingGenesisFromSeed,
} from '../preparation/postwar-operating-genesis-adoption.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function invalid(reason: string): never {
  throw Error('BENEFICIAL_CHILD_PARENT_VIEW:' + reason);
}
export interface PostwarBeneficialHousingRentChildOperatingView {
  readonly classification: 'CORE_VERIFIED_BENEFICIAL_CHILD_PARENT_DATA_NOT_ADMISSION';
  readonly binding: Readonly<{
    worldId: string;
    seedId: string;
    childFingerprint: string;
    parentFingerprint: string;
    bundleSha256: string;
  }>;
  /** Intentionally retains the original parent's seedFingerprint. */
  readonly parentView: ReturnType<typeof readPostwarOperatingGenesisFromSeed>;
  readonly rentReceipts: readonly BeneficialHousingReclassificationReceipt[];
}
/** Only a live privately issued full-family proof may avoid repeating the
 * complete 70-country verifier. A manifest JSON/hash/label cannot issue it.
 * Output is ordinary Core opening DATA. No permission/head/source lock cached. */
export function restoreVerifiedBeneficialHousingRentParent(input: {
  readonly seed: Readonly<OpeningSeed>;
  readonly preparation: PreparedBeneficialHousingRentSource;
}): Readonly<OpeningSeed> {
  const proof = consumeBeneficialHousingRentSource(input.preparation);
  const seed = requirePostwarSha256OpeningSeed(input.seed);
  if (
    seed.worldId !== proof.worldId ||
    seed.seedId !== proof.seedId ||
    seed.fingerprint !== proof.seedFingerprint ||
    seed.openingWorldVersion !== '0' ||
    proof.receipts.length !== 70 ||
    new Set(proof.receipts.map((r) => r.countryId)).size !== 70
  )
    invalid('EXACT_LIVE_COMPLETE_CHILD_PROOF_REQUIRED');
  const sources = new Set(proof.receipts.map((r) => r.supplementalSourceId));
  const batches = new Set(proof.receipts.map((r) => r.reclassificationBatchId));
  if (
    sources.size !== 70 ||
    batches.size !== 70 ||
    seed.sources.filter((s) => sources.has(s.sourceId)).length !== 70 ||
    seed.financialBatches.filter((b) => batches.has(b.batchId)).length !== 70
  )
    invalid('EXACT_VERIFIED_SEVENTY_SOURCE_BATCH_DELTA_REQUIRED');
  const parent = createOpeningSeed(
    {
      ...seed,
      sources: seed.sources.filter((s) => !sources.has(s.sourceId)),
      financialBatches: seed.financialBatches.filter(
        (b) => !batches.has(b.batchId),
      ),
    },
    sha,
  );
  if (
    parent.fingerprint !== proof.parentSeedFingerprint ||
    proof.receipts.some((r) => r.parentSeedFingerprint !== parent.fingerprint)
  )
    invalid('EXACT_RESTORED_PARENT_FINGERPRINT_REQUIRED');
  return parent;
}
const cached = new WeakMap<
  object,
  WeakMap<object, Readonly<PostwarBeneficialHousingRentChildOperatingView>>
>();
export function readPostwarBeneficialHousingRentChildOperatingView(input: {
  readonly seed: Readonly<OpeningSeed>;
  readonly preparation: PreparedBeneficialHousingRentSource;
}): Readonly<PostwarBeneficialHousingRentChildOperatingView> {
  // Always check liveness before an immutable-data cache hit.
  const proof = consumeBeneficialHousingRentSource(input.preparation);
  const previous = cached.get(input.preparation)?.get(input.seed);
  if (previous) return previous;
  const parent = restoreVerifiedBeneficialHousingRentParent(input);
  const parentView = readPostwarOperatingGenesisFromSeed(parent);
  if (
    parentView.seedFingerprint !== proof.parentSeedFingerprint ||
    parentView.worldId !== proof.worldId
  )
    invalid('ACTUAL_PARENT_OPERATING_VIEW_REQUIRED');
  const result: Readonly<PostwarBeneficialHousingRentChildOperatingView> =
    Object.freeze({
      classification:
        'CORE_VERIFIED_BENEFICIAL_CHILD_PARENT_DATA_NOT_ADMISSION',
      binding: Object.freeze({
        worldId: proof.worldId,
        seedId: proof.seedId,
        childFingerprint: proof.seedFingerprint,
        parentFingerprint: proof.parentSeedFingerprint,
        bundleSha256: proof.bundleSha256,
      }),
      parentView,
      rentReceipts: proof.receipts,
    });
  let bySeed = cached.get(input.preparation);
  if (!bySeed) {
    bySeed = new WeakMap();
    cached.set(input.preparation, bySeed);
  }
  bySeed.set(input.seed, result);
  return result;
}
