/** Expensive controlled OFFLINE publication. Never re-export through online API. */
import { createHash } from 'node:crypto';
import {
  canonicalSerialize,
  parseOpeningSeed,
  rebuildV08LedgersFromLineage,
  countryId,
} from '@econmind/core';
import { readPostwarOperatingGenesisFromSeed } from '../preparation/postwar-operating-genesis-adoption.js';
import type { SqlExecutor } from './sql-database.js';
import {
  POSTWAR_PROJECTION_DATASETS,
  POSTWAR_PROJECTION_PUBLISH_QUERY,
  PostwarOfficeProjectionStoreError,
  type PostwarProjectionOffice,
} from './postwar-office-projection-store.js';
const prepared = new WeakSet<object>();
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
type Row = Readonly<Record<string, unknown>>;
function invalid(s: string): never {
  throw new PostwarOfficeProjectionStoreError(s);
}
function text(v: unknown): string {
  if (typeof v !== 'string' || !v || v.trim() !== v || v.length > 256)
    invalid('INVALID_PROJECTION_METADATA');
  return v;
}
function freeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
function office(v: string): PostwarProjectionOffice {
  if (!Object.hasOwn(POSTWAR_PROJECTION_DATASETS, v))
    invalid('INVALID_OFFICE_DATASET');
  return v as PostwarProjectionOffice;
}
function dataset(o: PostwarProjectionOffice, v: string) {
  if (!(POSTWAR_PROJECTION_DATASETS[o] as readonly string[]).includes(v))
    invalid('INVALID_OFFICE_DATASET');
  return v;
}
export interface PostwarOfficeProjectionPublication {
  readonly classification: 'GENUINE_FULL_VALIDATED_OFFLINE_PLAN_NOT_ADMISSION';
  readonly worldId: string;
  readonly seedId: string;
  readonly seedFingerprint: string;
  readonly canonicalSeedSha256: string;
  readonly modelVersion: string;
  readonly replayBinding: string;
  readonly sourceBundleSha256: string;
  readonly admissionRef: string;
  readonly carrierSha256: string;
  readonly policySha256: string;
  readonly outputSha256: string;
}
/** Deliberately expensive OFFLINE only. The only issuer executes real Core and
 * the existing full operating/source/invariant validator on the exact seed. */
export function preparePostwarOfficeProjectionPublication(input: {
  seed: unknown;
  sourceBundleSha256: string;
  admissionRef: string;
}): PostwarOfficeProjectionPublication {
  if (!/^[a-f0-9]{64}$/u.test(input.sourceBundleSha256))
    invalid('INVALID_SOURCE_BUNDLE_SHA256');
  const seed = parseOpeningSeed(
    JSON.parse(canonicalSerialize(input.seed)),
    sha,
  );
  const validated = readPostwarOperatingGenesisFromSeed(seed);
  rebuildV08LedgersFromLineage({ seed, sha256Hex: sha });
  const { fingerprint: _fingerprint, ...seedIntent } = seed;
  void _fingerprint;
  const result = freeze({
    classification:
      'GENUINE_FULL_VALIDATED_OFFLINE_PLAN_NOT_ADMISSION' as const,
    worldId: seed.worldId,
    seedId: seed.seedId,
    seedFingerprint: seed.fingerprint,
    canonicalSeedSha256: sha(canonicalSerialize(seedIntent)),
    modelVersion: seed.replayBinding.modelVersion,
    replayBinding: canonicalSerialize(seed.replayBinding),
    sourceBundleSha256: input.sourceBundleSha256,
    admissionRef: text(input.admissionRef),
    carrierSha256: validated.carrierSha256,
    policySha256: validated.policySha256,
    outputSha256: validated.outputSha256,
  });
  prepared.add(result);
  return result;
}
/** Controlled offline publisher. SQL derives every row from its own stored seed,
 * and the result must match the genuinely full-validated exact bytes above. */
export async function publishPostwarOfficeProjectionFrom(
  executor: SqlExecutor,
  publication: PostwarOfficeProjectionPublication,
  input: {
    countryId: string;
    officeId: PostwarProjectionOffice;
    dataset: string;
  },
) {
  if (!prepared.has(publication))
    invalid('GENUINE_OFFLINE_FULL_VALIDATION_REQUIRED');
  const o = office(input.officeId),
    d = dataset(o, input.dataset);
  countryId(input.countryId);
  const result = await executor.query<Row>(POSTWAR_PROJECTION_PUBLISH_QUERY, [
    publication.worldId,
    input.countryId,
    o,
    d,
    publication.seedFingerprint,
    publication.canonicalSeedSha256,
    publication.sourceBundleSha256,
    publication.admissionRef,
  ]);
  if (result.rows.length !== 1) invalid('PROJECTION_PUBLICATION_NOT_UNIQUE');
  const r = result.rows[0]!;
  for (const [field, value] of Object.entries({
    world_id: publication.worldId,
    country_id: input.countryId,
    office_id: o,
    dataset: d,
    seed_id: publication.seedId,
    seed_fingerprint: publication.seedFingerprint,
    canonical_seed_sha256: publication.canonicalSeedSha256,
    admission_ref: publication.admissionRef,
    model_version: publication.modelVersion,
    replay_binding: publication.replayBinding,
    source_bundle_sha256: publication.sourceBundleSha256,
  }))
    if (r[field] !== value)
      invalid('STORED_CANONICAL_SOURCE_OR_ADMISSION_MISMATCH');
  if (String(r.world_version) !== '0' || String(r.event_sequence) !== '0')
    invalid('PUBLICATION_H0_REQUIRED');
  return freeze(r);
}
