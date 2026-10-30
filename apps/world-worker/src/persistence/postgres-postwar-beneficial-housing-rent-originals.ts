/** Fixed SQL DATA contract. Roles/publication/admission locks are implemented
 * by the candidate definer; this parser creates no issuer or authorization. */
import { DomainError, DOMAIN_ERROR_CODES } from '@econmind/core';
import type { SqlExecutor } from './sql-database.js';
export const BENEFICIAL_RENT_SOURCE_READER =
  'world_v2_beneficial_rent_source_reader';
export const BENEFICIAL_RENT_SOURCE_PUBLISHER =
  'world_v2_beneficial_rent_source_publisher';
export const BENEFICIAL_RENT_SOURCE_QUERY =
  'select * from world_v2.lock_postwar_beneficial_rent_original($1,$2,$3,$4,$5::timestamptz)';
export const BENEFICIAL_RENT_HEADER_QUERY =
  'select * from world_v2.lock_postwar_beneficial_rent_header($1,$2)';
export function invalidBeneficialRentSource(reason: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    'BENEFICIAL_RENT_SOURCE:' + reason,
  );
}
export function exactRentText(v: unknown): string {
  if (typeof v !== 'string' || !v || v.trim() !== v)
    invalidBeneficialRentSource('EXACT_ORIGINAL_FIELD_REQUIRED');
  return v;
}
export interface BeneficialRentLockedSource {
  readonly registrationRef: string;
  readonly worldId: string;
  readonly seedId: string;
  readonly seedFingerprint: string;
  readonly parentSeedFingerprint: string;
  readonly canonicalSeedSha256: string;
  readonly bundleSha256: string;
  readonly admissionRef: string;
  readonly receiptFingerprint: string;
  readonly publicationRef: string;
  readonly publicationCommandFingerprint: string;
  readonly clockBindingRef: string;
  readonly workerId: string;
  readonly clockSimTime: string;
  readonly head: Readonly<{ worldVersion: string; eventSequence: string }>;
  readonly prefixRow: unknown;
  readonly journal: unknown;
}
async function fixedQuery(
  tx: SqlExecutor,
  sql: string,
  args: readonly unknown[],
) {
  try {
    return await tx.query<Record<string, unknown>>(sql, args);
  } catch (error: unknown) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      'message' in error &&
      String(error.code) === '55000' &&
      /^BENEFICIAL_RENT_[A-Z_]+$/u.test(String(error.message))
    ) {
      const failure = new DomainError(
        DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
        'BENEFICIAL_RENT_SOURCE:' + String(error.message),
      );
      Object.defineProperty(failure, 'cause', { value: error });
      throw failure;
    }
    throw error;
  }
}
export async function lockBeneficialRentHeaderFrom(
  tx: SqlExecutor,
  worldId: string,
  countryId: string,
): Promise<Readonly<Record<string, unknown>>> {
  const r = await fixedQuery(tx, BENEFICIAL_RENT_HEADER_QUERY, [
    worldId,
    countryId,
  ]);
  if (r.rows.length !== 1)
    invalidBeneficialRentSource('REGISTERED_ADMITTED_SOURCE_MISSING');
  return Object.freeze(r.rows[0]!);
}
export async function lockBeneficialRentOriginalFrom(
  tx: SqlExecutor,
  input: {
    readonly worldId: string;
    readonly countryId: string;
    readonly commandId: string;
    readonly commandFingerprint: string;
    readonly observedAtReal: string;
  },
): Promise<Readonly<BeneficialRentLockedSource>> {
  const r = await fixedQuery(tx, BENEFICIAL_RENT_SOURCE_QUERY, [
    input.worldId,
    input.countryId,
    input.commandId,
    input.commandFingerprint,
    input.observedAtReal,
  ]);
  if (r.rows.length !== 1)
    invalidBeneficialRentSource('REGISTERED_ADMITTED_SOURCE_MISSING');
  const row = r.rows[0]!;
  const uint = (v: unknown) => {
    const s = exactRentText(v);
    if (!/^(?:0|[1-9]\d*)$/u.test(s))
      invalidBeneficialRentSource('CANONICAL_CURRENT_HEAD_REQUIRED');
    return s;
  };
  const data: Readonly<BeneficialRentLockedSource> = Object.freeze({
    registrationRef: exactRentText(row.registration_ref),
    worldId: exactRentText(row.world_id),
    seedId: exactRentText(row.seed_id),
    seedFingerprint: exactRentText(row.seed_fingerprint),
    parentSeedFingerprint: exactRentText(row.parent_seed_fingerprint),
    canonicalSeedSha256: exactRentText(row.canonical_seed_sha256),
    bundleSha256: exactRentText(row.bundle_sha256),
    admissionRef: exactRentText(row.admission_ref),
    receiptFingerprint: exactRentText(row.receipt_fingerprint),
    publicationRef: exactRentText(row.publication_ref),
    publicationCommandFingerprint: exactRentText(row.command_fingerprint),
    clockBindingRef: exactRentText(row.clock_binding_ref),
    workerId: exactRentText(row.worker_id),
    clockSimTime: uint(row.clock_sim_time),
    head: Object.freeze({
      worldVersion: uint(row.world_version),
      eventSequence: uint(row.event_sequence),
    }),
    prefixRow: row.prefix,
    journal: row.journal,
  });
  if (
    data.worldId !== input.worldId ||
    data.publicationCommandFingerprint !== input.commandFingerprint
  )
    invalidBeneficialRentSource('EXACT_PUBLICATION_SCOPE_REQUIRED');
  return data;
}
