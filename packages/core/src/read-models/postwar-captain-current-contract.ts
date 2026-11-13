import {
  POSTWAR_EXTENDED_CURRENT_REDUCER,
  POSTWAR_RENT_CURRENT_REDUCER,
  POSTWAR_PAGED_CURRENT_REDUCER,
  parsePostwarCurrentPageProof,
  type PostwarCurrentPageProof,
} from './postwar-extended-current-reducer.js';
export {
  POSTWAR_EXTENDED_CURRENT_REDUCER,
  POSTWAR_RENT_CURRENT_REDUCER,
  POSTWAR_PAGED_CURRENT_REDUCER,
  parsePostwarCurrentPageProof,
  type PostwarCurrentPageProof,
} from './postwar-extended-current-reducer.js';
/** Browser-safe wire validation only. These records grant no source admission,
 * political capital, command authority or currentness by themselves. */
export const POSTWAR_CAPTAIN_PAGED_COVERAGE_SCHEMA =
  'postwar-captain-current-page-chain-coverage-v2' as const;
export const POSTWAR_CAPTAIN_CURRENT_NATURE =
  'ADMITTED_CURRENT_POLITICAL_CAPITAL_MIXED_PREFIX' as const;
export const POSTWAR_CAPTAIN_OPENING_NATURE =
  'ADMITTED_OPENING_POLITICAL_CAPITAL_GENESIS' as const;
export const POSTWAR_CAPTAIN_OPENING_COVERAGE_SCHEMA =
  'postwar-captain-opening-current-coverage-v1' as const;
export const POSTWAR_CAPTAIN_OPENING_REDUCER =
  'POSTWAR_CAPTAIN_ADMITTED_GENESIS_EXACT_H0_V1' as const;
export const POSTWAR_CAPTAIN_CURRENT_DATASET =
  'political-capital-current' as const;
export const POSTWAR_CAPTAIN_CURRENT_BUCKETS = Object.freeze([
  'FISCAL_REFORM',
  'INDUSTRIAL_STRATEGY',
  'TRADE_NEGOTIATIONS',
  'SOCIAL_REFORM_PROTECTION',
  'STRATEGIC_PROJECT_SUPPORT',
  'CRISIS_RESPONSE',
  'UNALLOCATED_CRISIS_RESERVE',
] as const);
export interface PostwarCaptainPoliticalCapitalRow {
  readonly schemaVersion: 'postwar-captain-political-capital-row-v1';
  readonly countryId: string;
  readonly capitalRef: string;
  readonly bucket: (typeof POSTWAR_CAPTAIN_CURRENT_BUCKETS)[number];
  readonly unit: 'political_capital';
  readonly balance: string;
  readonly opening: string;
  readonly generated: string;
  readonly total: string;
  readonly available: string;
  readonly spent: string;
  readonly closing: string;
  readonly allocationNature: 'REALLOCATION_NOT_GENERATION_OR_SPENDING';
}
export interface PostwarCaptainCurrentCoverage {
  readonly schemaVersion:
    | 'postwar-captain-current-prefix-coverage-v1'
    | typeof POSTWAR_CAPTAIN_OPENING_COVERAGE_SCHEMA
    | typeof POSTWAR_CAPTAIN_PAGED_COVERAGE_SCHEMA;
  readonly reducerVersion:
    | 'POSTWAR_CAPTAIN_FINANCE_SOCIAL_FX_COMPLETE_PREFIX_V1'
    | typeof POSTWAR_CAPTAIN_OPENING_REDUCER
    | typeof POSTWAR_EXTENDED_CURRENT_REDUCER
    | typeof POSTWAR_RENT_CURRENT_REDUCER
    | typeof POSTWAR_PAGED_CURRENT_REDUCER;
  readonly pageProof?: Readonly<PostwarCurrentPageProof>;
  readonly countryId: string;
  readonly coverageRef: string;
  readonly prefixFingerprint: string;
  readonly knownEffectsFingerprint: string;
  readonly globalWorldVersion: string;
  readonly globalEventSequence: string;
  readonly coveredThroughEventId: string | null;
  readonly coveredThroughEventFingerprint: string | null;
  readonly financialPostingCount: string;
  readonly financialBatchCount: string;
  readonly financialPostingsFingerprint: string;
  readonly capitalStateHash: string;
  readonly originalPacketSha256: string;
  readonly originWorldVersion: string;
  readonly originEventSequence: string;
}
function invalid(s: string): never {
  throw Error('POSTWAR_CAPTAIN_CURRENT_WIRE:' + s);
}
function record(v: unknown, keys: readonly string[]): Record<string, unknown> {
  if (
    !v ||
    typeof v !== 'object' ||
    Array.isArray(v) ||
    Object.keys(v).sort().join('|') !== [...keys].sort().join('|')
  )
    invalid('EXACT_FIELDS_REQUIRED');
  return v as Record<string, unknown>;
}
const id = (v: unknown): v is string =>
  typeof v === 'string' && /^[A-Za-z][A-Za-z0-9._:-]{0,255}$/u.test(v);
const uint = (v: unknown): v is string =>
  typeof v === 'string' && /^(?:0|[1-9]\d{0,18})$/u.test(v);
const hash = (v: unknown): v is string =>
  typeof v === 'string' && /^sha256:[a-f0-9]{64}$/u.test(v);
const amount = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.length <= 256 &&
  /^(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/u.test(v);
export function parsePostwarCaptainPoliticalCapitalRow(
  value: unknown,
): Readonly<PostwarCaptainPoliticalCapitalRow> {
  const r = record(value, [
    'schemaVersion',
    'countryId',
    'capitalRef',
    'bucket',
    'unit',
    'balance',
    'opening',
    'generated',
    'total',
    'available',
    'spent',
    'closing',
    'allocationNature',
  ]);
  if (
    r.schemaVersion !== 'postwar-captain-political-capital-row-v1' ||
    typeof r.countryId !== 'string' ||
    !/^COUNTRY_(?:0[1-9]|[1-6][0-9]|70)$/u.test(r.countryId) ||
    !id(r.capitalRef) ||
    !POSTWAR_CAPTAIN_CURRENT_BUCKETS.some((x) => x === r.bucket) ||
    r.unit !== 'political_capital' ||
    r.allocationNature !== 'REALLOCATION_NOT_GENERATION_OR_SPENDING' ||
    ![
      'balance',
      'opening',
      'generated',
      'total',
      'available',
      'spent',
      'closing',
    ].every((k) => amount(r[k]))
  )
    invalid('EXACT_CAPITAL_ROW_REQUIRED');
  return Object.freeze({
    ...r,
  }) as unknown as Readonly<PostwarCaptainPoliticalCapitalRow>;
}
export function parsePostwarCaptainCurrentCoverage(
  value: unknown,
): Readonly<PostwarCaptainCurrentCoverage> {
  const paged =
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).schemaVersion ===
      POSTWAR_CAPTAIN_PAGED_COVERAGE_SCHEMA;
  const opening =
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).schemaVersion ===
      POSTWAR_CAPTAIN_OPENING_COVERAGE_SCHEMA;
  const r = record(value, [
    'schemaVersion',
    'reducerVersion',
    'countryId',
    'coverageRef',
    'prefixFingerprint',
    'knownEffectsFingerprint',
    'globalWorldVersion',
    'globalEventSequence',
    'coveredThroughEventId',
    'coveredThroughEventFingerprint',
    'financialPostingCount',
    'financialBatchCount',
    'financialPostingsFingerprint',
    ...(paged ? ['pageProof'] : []),
    'capitalStateHash',
    'originalPacketSha256',
    'originWorldVersion',
    'originEventSequence',
  ]);
  if (
    (!paged &&
      !opening &&
      r.schemaVersion !== 'postwar-captain-current-prefix-coverage-v1') ||
    (opening
      ? r.reducerVersion !== POSTWAR_CAPTAIN_OPENING_REDUCER
      : paged
        ? r.reducerVersion !== POSTWAR_PAGED_CURRENT_REDUCER
        : r.reducerVersion !==
            'POSTWAR_CAPTAIN_FINANCE_SOCIAL_FX_COMPLETE_PREFIX_V1' &&
          r.reducerVersion !== POSTWAR_EXTENDED_CURRENT_REDUCER &&
          r.reducerVersion !== POSTWAR_RENT_CURRENT_REDUCER) ||
    typeof r.countryId !== 'string' ||
    !/^COUNTRY_(?:0[1-9]|[1-6][0-9]|70)$/u.test(r.countryId) ||
    !id(r.coverageRef) ||
    (opening
      ? r.coveredThroughEventId !== null ||
        r.coveredThroughEventFingerprint !== null
      : !id(r.coveredThroughEventId) ||
        !hash(r.coveredThroughEventFingerprint)) ||
    ![
      'prefixFingerprint',
      'knownEffectsFingerprint',
      'financialPostingsFingerprint',
      'capitalStateHash',
    ].every((k) => hash(r[k])) ||
    typeof r.originalPacketSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(r.originalPacketSha256) ||
    ![
      'globalWorldVersion',
      'globalEventSequence',
      'financialPostingCount',
      'financialBatchCount',
      'originWorldVersion',
      'originEventSequence',
    ].every((k) => uint(r[k]))
  )
    invalid('COMPLETE_CAPITAL_COVERAGE_REQUIRED');
  if (
    opening &&
    [
      r.globalWorldVersion,
      r.globalEventSequence,
      r.originWorldVersion,
      r.originEventSequence,
      r.financialPostingCount,
      r.financialBatchCount,
    ].some((v) => v !== '0')
  )
    invalid('EXACT_OPENING_ZERO_HEAD_AND_JOURNALS_REQUIRED');
  if (
    !opening &&
    (BigInt(r.originWorldVersion as string) >
      BigInt(r.globalWorldVersion as string) ||
      BigInt(r.originEventSequence as string) >
        BigInt(r.globalEventSequence as string) ||
      (r.originWorldVersion === '0') !== (r.originEventSequence === '0') ||
      r.globalWorldVersion === '0' ||
      r.globalEventSequence === '0')
  )
    invalid('EXACT_ORIGIN_AND_CURRENT_HEAD_REQUIRED');
  const pageProof = paged
    ? parsePostwarCurrentPageProof(r.pageProof, {
        worldVersion: String(r.globalWorldVersion),
        eventSequence: String(r.globalEventSequence),
      })
    : undefined;
  return Object.freeze({
    ...r,
    ...(pageProof === undefined ? {} : { pageProof }),
  }) as unknown as Readonly<PostwarCaptainCurrentCoverage>;
}

/** Actual registered reason references, read under the same authorized current
 * source snapshot. This immutable metadata is not allocation approval. */
export interface PostwarCaptainAllocationOptions {
  readonly schemaVersion: 'postwar-captain-allocation-options-v1';
  readonly classification: 'REGISTERED_REASON_REFERENCES_NOT_ALLOCATION_APPROVAL';
  readonly countryId: string;
  readonly originalPacketSha256: string;
  readonly reasons: readonly Readonly<{
    factRef: string;
    sourceRef: string;
    payloadSha256: string;
    revision: string;
    sourceClass: 'ADMITTED_ORIGINAL' | 'TEST_ONLY';
    effectiveFromSimTime: string;
    effectiveUntilSimTime: string | null;
    recordRef: string;
    reason: string;
  }>[];
}
export function parsePostwarCaptainAllocationOptions(
  value: unknown,
): Readonly<PostwarCaptainAllocationOptions> {
  const r = record(value, [
    'schemaVersion',
    'classification',
    'countryId',
    'originalPacketSha256',
    'reasons',
  ]);
  if (
    r.schemaVersion !== 'postwar-captain-allocation-options-v1' ||
    r.classification !==
      'REGISTERED_REASON_REFERENCES_NOT_ALLOCATION_APPROVAL' ||
    typeof r.countryId !== 'string' ||
    !/^COUNTRY_(0[1-9]|[1-6][0-9]|70)$/u.test(r.countryId) ||
    typeof r.originalPacketSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(r.originalPacketSha256) ||
    !Array.isArray(r.reasons) ||
    r.reasons.length < 1 ||
    r.reasons.length > 64 ||
    JSON.stringify(value).length > 16384
  )
    invalid('BOUNDED_ALLOCATION_OPTIONS_REQUIRED');
  const reasons = r.reasons.map((v) => {
    const x = record(v, [
      'factRef',
      'sourceRef',
      'payloadSha256',
      'revision',
      'sourceClass',
      'effectiveFromSimTime',
      'effectiveUntilSimTime',
      'recordRef',
      'reason',
    ]);
    if (
      !id(x.factRef) ||
      !['sourceRef', 'revision', 'recordRef'].every(
        (k) =>
          typeof x[k] === 'string' &&
          String(x[k]).trim().length > 0 &&
          String(x[k]).length <= 8192,
      ) ||
      typeof x.payloadSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(x.payloadSha256) ||
      !['ADMITTED_ORIGINAL', 'TEST_ONLY'].includes(String(x.sourceClass)) ||
      !uint(x.effectiveFromSimTime) ||
      (x.effectiveUntilSimTime !== null &&
        (!uint(x.effectiveUntilSimTime) ||
          BigInt(x.effectiveUntilSimTime) <=
            BigInt(String(x.effectiveFromSimTime)))) ||
      typeof x.reason !== 'string' ||
      !x.reason.trim() ||
      x.reason.length > 8192
    )
      invalid('ACTUAL_REGISTERED_REASON_REFERENCE_REQUIRED');
    return Object.freeze({ ...x });
  });
  if (new Set(reasons.map((x) => x.factRef)).size !== reasons.length)
    invalid('DISTINCT_REASON_REFERENCES_REQUIRED');
  return Object.freeze({
    ...r,
    reasons: Object.freeze(reasons),
  }) as unknown as Readonly<PostwarCaptainAllocationOptions>;
}
