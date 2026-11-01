/** Browser-safe wire validation only. These records grant no source admission,
 * political capital, command authority or currentness by themselves. */
export const POSTWAR_CAPTAIN_CURRENT_NATURE =
  'ADMITTED_CURRENT_POLITICAL_CAPITAL_MIXED_PREFIX' as const;
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
  readonly schemaVersion: 'postwar-captain-current-prefix-coverage-v1';
  readonly reducerVersion: 'POSTWAR_CAPTAIN_FINANCE_SOCIAL_FX_COMPLETE_PREFIX_V1';
  readonly countryId: string;
  readonly coverageRef: string;
  readonly prefixFingerprint: string;
  readonly knownEffectsFingerprint: string;
  readonly globalWorldVersion: string;
  readonly globalEventSequence: string;
  readonly coveredThroughEventId: string;
  readonly coveredThroughEventFingerprint: string;
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
    'capitalStateHash',
    'originalPacketSha256',
    'originWorldVersion',
    'originEventSequence',
  ]);
  if (
    r.schemaVersion !== 'postwar-captain-current-prefix-coverage-v1' ||
    r.reducerVersion !==
      'POSTWAR_CAPTAIN_FINANCE_SOCIAL_FX_COMPLETE_PREFIX_V1' ||
    typeof r.countryId !== 'string' ||
    !/^COUNTRY_(?:0[1-9]|[1-6][0-9]|70)$/u.test(r.countryId) ||
    !id(r.coverageRef) ||
    !id(r.coveredThroughEventId) ||
    ![
      'prefixFingerprint',
      'knownEffectsFingerprint',
      'coveredThroughEventFingerprint',
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
    BigInt(r.originWorldVersion as string) >
      BigInt(r.globalWorldVersion as string) ||
    BigInt(r.originEventSequence as string) >
      BigInt(r.globalEventSequence as string) ||
    (r.originWorldVersion === '0') !== (r.originEventSequence === '0') ||
    r.globalWorldVersion === '0' ||
    r.globalEventSequence === '0'
  )
    invalid('EXACT_ORIGIN_AND_CURRENT_HEAD_REQUIRED');
  return Object.freeze({
    ...r,
  }) as unknown as Readonly<PostwarCaptainCurrentCoverage>;
}
