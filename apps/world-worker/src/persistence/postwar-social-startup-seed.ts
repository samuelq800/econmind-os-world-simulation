/** Explicit offline startup DATA input. Core constructor identity and actual
 * canonical bytes are checked locally; the low-privilege transaction then
 * compares a locked server-computed stored-raw digest/header. No raw row,
 * caller hash/READY flag, cached permission or current ledger is accepted. */
import { createHash } from 'node:crypto';
import {
  canonicalSerialize,
  isValidatedOpeningSeed,
  DomainError,
  DOMAIN_ERROR_CODES,
  type OpeningSeed,
} from '@econmind/core';
import type { SqlExecutor } from './sql-database.js';
export const POSTWAR_SOCIAL_STARTUP_SEED_HEADER_QUERY =
  'select * from world_v2.lock_social_startup_seed_header($1,$2)';
export const POSTWAR_SOCIAL_STARTUP_SEED_HEADER_PROPOSAL =
  'database/proposals/postwar-social-startup-seed-header.sql';
const inspected = new WeakMap<object, string>();
function invalid(reason: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.OPENING_SEED_INVALID,
    'Controlled Social startup seed: ' + reason,
  );
}
/** Digests only are cached by immutable Core identity, never the 119MiB text. */
export function inspectPostwarSocialStartupSeed(
  seed: Readonly<OpeningSeed>,
): Readonly<{ seed: Readonly<OpeningSeed>; canonicalSeedSha256: string }> {
  if (!seed || typeof seed !== 'object' || !isValidatedOpeningSeed(seed))
    invalid('genuine Core-parsed immutable opening seed required');
  if (
    seed.openingWorldVersion !== '0' ||
    seed.sources.some((s) => s.sourceKind === 'TEST_FIXTURE')
  )
    invalid('server opening provenance required');
  let digest = inspected.get(seed);
  if (!digest) {
    const { fingerprint, ...intent } = seed;
    const canonical = canonicalSerialize(intent);
    const actualFingerprint =
      'sha256:' +
      createHash('sha256').update('SHA-256\n').update(canonical).digest('hex');
    if (actualFingerprint !== fingerprint)
      invalid('canonical Core fingerprint mismatch');
    digest = createHash('sha256').update(canonical).digest('hex');
    inspected.set(seed, digest);
  }
  return Object.freeze({ seed, canonicalSeedSha256: digest });
}
export async function readPostwarSocialStartupSeedFrom(input: {
  readonly executor: SqlExecutor;
  readonly seed: Readonly<OpeningSeed>;
  readonly worldId: string;
  readonly countryId: string;
  readonly seedRef: string;
  readonly seedFingerprint: string;
  readonly admissionRef: string;
  readonly modelVersion: string;
  readonly registration: Readonly<Record<string, unknown>>;
}): Promise<Readonly<OpeningSeed>> {
  const validated = inspectPostwarSocialStartupSeed(input.seed),
    seed = validated.seed;
  if (
    seed.worldId !== input.worldId ||
    seed.seedId !== input.seedRef ||
    seed.fingerprint !== input.seedFingerprint ||
    seed.replayBinding.modelVersion !== input.modelVersion
  )
    invalid('startup input differs from configured immutable pins');
  const result = await input.executor.query<Record<string, unknown>>(
    POSTWAR_SOCIAL_STARTUP_SEED_HEADER_QUERY,
    [input.worldId, input.countryId],
  );
  const r = result.rows[0];
  if (
    result.rows.length !== 1 ||
    !r ||
    r.world_id !== input.worldId ||
    r.country_id !== input.countryId ||
    r.seed_id !== seed.seedId ||
    r.seed_fingerprint !== seed.fingerprint ||
    r.opening_world_version !== '0' ||
    r.model_version !== input.modelVersion ||
    r.replay_binding !== canonicalSerialize(seed.replayBinding) ||
    r.admission_ref !== input.admissionRef ||
    r.canonical_seed_sha256 !== validated.canonicalSeedSha256 ||
    r.registration_ref !== input.registration.registration_ref ||
    r.source_id !== input.registration.source_id ||
    r.source_payload_hash !== input.registration.source_payload_hash
  )
    invalid(
      'locked stored raw SHA/header/registration differs from actual Core seed',
    );
  return seed;
}
