/** Read-only committed target intents from the complete Core prefix. A target
 * never proves feasible output, booked capacity, performed work or payment. */
export const INDUSTRY_UTILISATION_TARGETS_DATASET =
  'industry-utilisation-targets' as const;
export const INDUSTRY_UTILISATION_TARGETS_NATURE =
  'ADMITTED_CURRENT_INDUSTRY_UTILISATION_TARGETS' as const;
export interface IndustryUtilisationTargetRow {
  readonly schemaVersion: 'postwar-industry-utilisation-target-row-v1';
  readonly countryId: string;
  readonly facilityId: string;
  readonly targetPercent: string;
  readonly startsAtSimTime: string;
  readonly endsAtSimTime: string;
  readonly sourceRef: string;
  readonly sourceRawSha256: string;
  readonly commandId: string;
  readonly commandFingerprint: string;
  readonly eventId: string;
  readonly eventFingerprint: string;
  readonly committedWorldVersion: string;
  readonly measurement: 'COMMITTED_TARGET_INTENT_NOT_PRODUCTION_RESERVATION_OR_FEASIBILITY';
}
export interface IndustryUtilisationTargetsCoverage {
  readonly schemaVersion: 'postwar-industry-utilisation-targets-coverage-v1';
  readonly reducerVersion: 'POSTWAR_INDUSTRY_UTILISATION_TARGETS_COMPLETE_PREFIX_V1';
  readonly countryId: string;
  readonly facilityId: string;
  readonly globalWorldVersion: string;
  readonly globalEventSequence: string;
  readonly prefixFingerprint: string;
  readonly pageChainFingerprint: string;
  readonly sourceOriginalsFingerprint: string;
  readonly targetRowsFingerprint: string;
}
const obj = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    throw Error('INDUSTRY_UTILISATION_TARGETS:OBJECT_REQUIRED');
  return v as Record<string, unknown>;
};
const exact = (v: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(v).length === keys.length &&
  keys.every((k) => Object.hasOwn(v, k));
const ref = (v: unknown) =>
  typeof v === 'string' && /^[A-Za-z][A-Za-z0-9_.:-]{0,255}$/u.test(v);
const uint = (v: unknown): v is string =>
  typeof v === 'string' && /^(0|[1-9][0-9]*)$/u.test(v) && v.length <= 128;
const fp = (v: unknown) =>
  typeof v === 'string' && /^sha256:[a-f0-9]{64}$/u.test(v);
const decimal = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.length <= 128 &&
  /^(0|[1-9][0-9]*)(\.[0-9]*[1-9])?$/u.test(v);
const atMostHundred = (v: string) => {
  const [whole, fraction = ''] = v.split('.');
  return BigInt(whole! + fraction) <= 100n * 10n ** BigInt(fraction.length);
};
export function parseIndustryUtilisationTargetRow(
  input: unknown,
): Readonly<IndustryUtilisationTargetRow> {
  const r = obj(input);
  if (
    !exact(r, [
      'schemaVersion',
      'countryId',
      'facilityId',
      'targetPercent',
      'startsAtSimTime',
      'endsAtSimTime',
      'sourceRef',
      'sourceRawSha256',
      'commandId',
      'commandFingerprint',
      'eventId',
      'eventFingerprint',
      'committedWorldVersion',
      'measurement',
    ]) ||
    r.schemaVersion !== 'postwar-industry-utilisation-target-row-v1' ||
    ![r.countryId, r.facilityId, r.sourceRef, r.commandId, r.eventId].every(
      ref,
    ) ||
    ![r.commandFingerprint, r.eventFingerprint].every(fp) ||
    typeof r.sourceRawSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(r.sourceRawSha256) ||
    !decimal(r.targetPercent) ||
    !atMostHundred(r.targetPercent) ||
    !uint(r.startsAtSimTime) ||
    !uint(r.endsAtSimTime) ||
    BigInt(r.startsAtSimTime) >= BigInt(r.endsAtSimTime) ||
    BigInt(r.endsAtSimTime) > 86400000n ||
    !uint(r.committedWorldVersion) ||
    r.committedWorldVersion === '0' ||
    r.measurement !==
      'COMMITTED_TARGET_INTENT_NOT_PRODUCTION_RESERVATION_OR_FEASIBILITY'
  )
    throw Error('INDUSTRY_UTILISATION_TARGETS:EXACT_ROW_REQUIRED');
  return Object.freeze({
    ...r,
  }) as unknown as Readonly<IndustryUtilisationTargetRow>;
}
export function parseIndustryUtilisationTargetsCoverage(
  input: unknown,
): Readonly<IndustryUtilisationTargetsCoverage> {
  const c = obj(input);
  if (
    !exact(c, [
      'schemaVersion',
      'reducerVersion',
      'countryId',
      'facilityId',
      'globalWorldVersion',
      'globalEventSequence',
      'prefixFingerprint',
      'pageChainFingerprint',
      'sourceOriginalsFingerprint',
      'targetRowsFingerprint',
    ]) ||
    c.schemaVersion !== 'postwar-industry-utilisation-targets-coverage-v1' ||
    c.reducerVersion !==
      'POSTWAR_INDUSTRY_UTILISATION_TARGETS_COMPLETE_PREFIX_V1' ||
    !ref(c.countryId) ||
    !ref(c.facilityId) ||
    !uint(c.globalWorldVersion) ||
    !uint(c.globalEventSequence) ||
    ![
      c.prefixFingerprint,
      c.pageChainFingerprint,
      c.sourceOriginalsFingerprint,
      c.targetRowsFingerprint,
    ].every(fp)
  )
    throw Error('INDUSTRY_UTILISATION_TARGETS:EXACT_COVERAGE_REQUIRED');
  return Object.freeze({
    ...c,
  }) as unknown as Readonly<IndustryUtilisationTargetsCoverage>;
}
