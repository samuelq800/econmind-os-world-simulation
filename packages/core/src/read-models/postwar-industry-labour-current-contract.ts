import {
  parsePostwarCurrentPageProof,
  type PostwarCurrentPageProof,
} from './postwar-extended-current-reducer.js';
/** Browser-safe DATA shape. Headcount never proves attendance, work or payment. */
export const POSTWAR_INDUSTRY_LABOUR_PAGED_COVERAGE_SCHEMA =
  'postwar-industry-labour-current-page-chain-coverage-v2' as const;
export const POSTWAR_INDUSTRY_LABOUR_CURRENT_DATASET =
  'industry-labour-current' as const;
export const POSTWAR_INDUSTRY_LABOUR_OPENING_NATURE =
  'ADMITTED_OPENING_INDUSTRY_EMPLOYMENT_HEADCOUNT' as const;
export const POSTWAR_INDUSTRY_LABOUR_CURRENT_NATURE =
  'ADMITTED_CURRENT_INDUSTRY_EMPLOYMENT_HEADCOUNT' as const;
export interface PostwarIndustryLabourCurrentRow {
  readonly schemaVersion: 'postwar-industry-labour-current-row-v1';
  readonly countryId: string;
  readonly facilityId: string;
  readonly locationId: string;
  readonly operatorId: string;
  readonly positionId: string;
  readonly skill: 'LOW' | 'MEDIUM' | 'HIGH';
  readonly classificationId: string;
  readonly requiredCount: string;
  readonly openingFilledCount: string;
  readonly currentEmployedCount: string;
  readonly measurement: 'EMPLOYMENT_HEADCOUNT_NOT_ATTENDANCE_OR_PAYMENT';
  readonly completedPersonDays: null;
  readonly paidCost: null;
}
export interface PostwarIndustryLabourCurrentCoverage {
  readonly schemaVersion:
    | 'postwar-industry-labour-current-coverage-v1'
    | typeof POSTWAR_INDUSTRY_LABOUR_PAGED_COVERAGE_SCHEMA;
  readonly pageProof?: Readonly<PostwarCurrentPageProof>;
  readonly countryId: string;
  readonly prefixFingerprint: string;
  readonly knownEffectsFingerprint: string;
  readonly coveredThroughEventId: string | null;
  readonly coveredThroughEventFingerprint: string | null;
  readonly financialPostingCount: string;
  readonly financialBatchCount: string;
  readonly financialPostingsFingerprint: string;
  readonly globalWorldVersion: string;
  readonly globalEventSequence: string;
  readonly rowsHash: string;
  readonly originalScopeSha256: string;
}
function invalid(reason: string): never {
  throw Error('POSTWAR_INDUSTRY_LABOUR_WIRE:' + reason);
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
const fp = (v: unknown): v is string =>
  typeof v === 'string' && /^sha256:[a-f0-9]{64}$/u.test(v);
export function parsePostwarIndustryLabourCurrentRow(
  value: unknown,
): Readonly<PostwarIndustryLabourCurrentRow> {
  const r = record(value, [
    'schemaVersion',
    'countryId',
    'facilityId',
    'locationId',
    'operatorId',
    'positionId',
    'skill',
    'classificationId',
    'requiredCount',
    'openingFilledCount',
    'currentEmployedCount',
    'measurement',
    'completedPersonDays',
    'paidCost',
  ]);
  if (
    r.schemaVersion !== 'postwar-industry-labour-current-row-v1' ||
    ![
      'countryId',
      'facilityId',
      'locationId',
      'operatorId',
      'positionId',
      'classificationId',
    ].every((k) => id(r[k])) ||
    !['LOW', 'MEDIUM', 'HIGH'].includes(String(r.skill)) ||
    !['requiredCount', 'openingFilledCount', 'currentEmployedCount'].every(
      (k) => uint(r[k]),
    ) ||
    r.measurement !== 'EMPLOYMENT_HEADCOUNT_NOT_ATTENDANCE_OR_PAYMENT' ||
    r.completedPersonDays !== null ||
    r.paidCost !== null
  )
    invalid('TYPED_HEADCOUNT_ONLY_REQUIRED');
  if (
    BigInt(r.currentEmployedCount as string) >
      BigInt(r.requiredCount as string) ||
    BigInt(r.openingFilledCount as string) > BigInt(r.requiredCount as string)
  )
    invalid('POSITION_CAPACITY_EXCEEDED');
  return Object.freeze({
    ...r,
  }) as unknown as Readonly<PostwarIndustryLabourCurrentRow>;
}
export function parsePostwarIndustryLabourCurrentCoverage(
  value: unknown,
): Readonly<PostwarIndustryLabourCurrentCoverage> {
  const paged =
    !!value &&
    typeof value === 'object' &&
    'schemaVersion' in value &&
    value.schemaVersion === POSTWAR_INDUSTRY_LABOUR_PAGED_COVERAGE_SCHEMA;
  const r = record(value, [
    'schemaVersion',
    'countryId',
    'prefixFingerprint',
    'knownEffectsFingerprint',
    'coveredThroughEventId',
    'coveredThroughEventFingerprint',
    'financialPostingCount',
    'financialBatchCount',
    'financialPostingsFingerprint',
    'globalWorldVersion',
    'globalEventSequence',
    'rowsHash',
    'originalScopeSha256',
    ...(paged ? ['pageProof'] : []),
  ]);
  if (
    r.schemaVersion !==
      (paged
        ? POSTWAR_INDUSTRY_LABOUR_PAGED_COVERAGE_SCHEMA
        : 'postwar-industry-labour-current-coverage-v1') ||
    !id(r.countryId) ||
    ![
      'prefixFingerprint',
      'knownEffectsFingerprint',
      'financialPostingsFingerprint',
      'rowsHash',
    ].every((k) => fp(r[k])) ||
    ![
      'financialPostingCount',
      'financialBatchCount',
      'globalWorldVersion',
      'globalEventSequence',
    ].every((k) => uint(r[k])) ||
    typeof r.originalScopeSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(r.originalScopeSha256) ||
    BigInt(r.globalEventSequence as string) <
      BigInt(r.globalWorldVersion as string)
  )
    invalid('COMPLETE_CURRENT_PREFIX_REQUIRED');
  if (
    r.globalWorldVersion === '0'
      ? r.globalEventSequence !== '0' ||
        r.coveredThroughEventId !== null ||
        r.coveredThroughEventFingerprint !== null ||
        r.financialPostingCount !== '0' ||
        r.financialBatchCount !== '0'
      : !id(r.coveredThroughEventId) || !fp(r.coveredThroughEventFingerprint)
  )
    invalid('EXACT_OPENING_OR_CURRENT_PREFIX_REQUIRED');
  if (paged && r.globalWorldVersion === '0')
    invalid('H0_REQUIRES_EXPLICIT_OPENING_SOURCE');
  const pageProof = paged
    ? parsePostwarCurrentPageProof(r.pageProof, {
        worldVersion: r.globalWorldVersion as string,
        eventSequence: r.globalEventSequence as string,
      })
    : undefined;
  return Object.freeze({
    ...r,
    ...(pageProof === undefined ? {} : { pageProof }),
  }) as unknown as Readonly<PostwarIndustryLabourCurrentCoverage>;
}
