/** Read-only committed schedules from the complete Core prefix. Neither a
 * pending command nor a schedule proves paid work, output or free capacity. */
export const INDUSTRY_COMMITTED_RUNS_DATASET =
  'industry-committed-runs' as const;
export const INDUSTRY_COMMITTED_RUNS_NATURE =
  'ADMITTED_CURRENT_INDUSTRY_COMMITTED_RUNS' as const;
export interface IndustryCommittedRunRow {
  readonly schemaVersion: 'postwar-industry-committed-run-row-v1';
  readonly countryId: string;
  readonly facilityId: string;
  readonly runId: string;
  readonly quantity: string;
  readonly outputUnit: string;
  readonly startsAtSimTime: string;
  readonly endsAtSimTime: string;
  readonly maximumExpense: string;
  readonly expenseCurrency: string;
  readonly sourceRef: string;
  readonly sourceRawSha256: string;
  readonly commandId: string;
  readonly commandFingerprint: string;
  readonly eventId: string;
  readonly eventFingerprint: string;
  readonly committedWorldVersion: string;
  readonly performedPersonMilliseconds: string;
  readonly measurement: 'COMMITTED_SCHEDULE_AND_RECORDED_WORK_NOT_OUTPUT_PAYMENT_OR_REMAINING_CAPACITY';
}
export interface IndustryCommittedRunsCoverage {
  readonly schemaVersion: 'postwar-industry-committed-runs-coverage-v1';
  readonly reducerVersion: 'POSTWAR_INDUSTRY_COMMITTED_RUNS_COMPLETE_PREFIX_V1';
  readonly countryId: string;
  readonly facilityId: string;
  readonly globalWorldVersion: string;
  readonly globalEventSequence: string;
  readonly prefixFingerprint: string;
  readonly pageChainFingerprint: string;
  readonly sourceOriginalsFingerprint: string;
  readonly runRowsFingerprint: string;
}
const obj = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    throw Error('INDUSTRY_COMMITTED_RUNS:OBJECT_REQUIRED');
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
const decimal = (v: unknown) =>
  typeof v === 'string' &&
  v.length <= 128 &&
  /^(0|[1-9][0-9]*)(\.[0-9]*[1-9])?$/u.test(v);
const text = (v: unknown) =>
  typeof v === 'string' && v.length > 0 && v.length <= 256 && v.trim() === v;
export function parseIndustryCommittedRunRow(
  input: unknown,
): Readonly<IndustryCommittedRunRow> {
  const r = obj(input);
  if (
    !exact(r, [
      'schemaVersion',
      'countryId',
      'facilityId',
      'runId',
      'quantity',
      'outputUnit',
      'startsAtSimTime',
      'endsAtSimTime',
      'maximumExpense',
      'expenseCurrency',
      'sourceRef',
      'sourceRawSha256',
      'commandId',
      'commandFingerprint',
      'eventId',
      'eventFingerprint',
      'committedWorldVersion',
      'performedPersonMilliseconds',
      'measurement',
    ]) ||
    r.schemaVersion !== 'postwar-industry-committed-run-row-v1' ||
    ![
      r.countryId,
      r.facilityId,
      r.runId,
      r.sourceRef,
      r.commandId,
      r.eventId,
    ].every(ref) ||
    ![r.commandFingerprint, r.eventFingerprint].every(fp) ||
    typeof r.sourceRawSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(r.sourceRawSha256) ||
    !decimal(r.quantity) ||
    r.quantity === '0' ||
    !decimal(r.maximumExpense) ||
    ![r.outputUnit, r.expenseCurrency].every(text) ||
    !uint(r.startsAtSimTime) ||
    !uint(r.endsAtSimTime) ||
    BigInt(r.startsAtSimTime) >= BigInt(r.endsAtSimTime) ||
    !uint(r.committedWorldVersion) ||
    r.committedWorldVersion === '0' ||
    !uint(r.performedPersonMilliseconds) ||
    r.measurement !==
      'COMMITTED_SCHEDULE_AND_RECORDED_WORK_NOT_OUTPUT_PAYMENT_OR_REMAINING_CAPACITY'
  )
    throw Error('INDUSTRY_COMMITTED_RUNS:EXACT_ROW_REQUIRED');
  return Object.freeze({
    ...r,
  }) as unknown as Readonly<IndustryCommittedRunRow>;
}
export function parseIndustryCommittedRunsCoverage(
  input: unknown,
): Readonly<IndustryCommittedRunsCoverage> {
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
      'runRowsFingerprint',
    ]) ||
    c.schemaVersion !== 'postwar-industry-committed-runs-coverage-v1' ||
    c.reducerVersion !== 'POSTWAR_INDUSTRY_COMMITTED_RUNS_COMPLETE_PREFIX_V1' ||
    !ref(c.countryId) ||
    !ref(c.facilityId) ||
    !uint(c.globalWorldVersion) ||
    !uint(c.globalEventSequence) ||
    ![
      c.prefixFingerprint,
      c.pageChainFingerprint,
      c.sourceOriginalsFingerprint,
      c.runRowsFingerprint,
    ].every(fp)
  )
    throw Error('INDUSTRY_COMMITTED_RUNS:EXACT_COVERAGE_REQUIRED');
  return Object.freeze({
    ...c,
  }) as unknown as Readonly<IndustryCommittedRunsCoverage>;
}
