/** Browser-safe immutable rule DATA. These parameters grant no run, funds,
 * worker-time, work, payment, delivery or output authority. */
export const INDUSTRY_RUN_PARAMETERS_DATASET =
  'industry-run-parameters' as const;
export const INDUSTRY_RUN_PARAMETER_ROW_SCHEMA =
  'postwar-industry-run-parameter-row-v1' as const;
export interface IndustryRunParameterRow {
  readonly schemaVersion: typeof INDUSTRY_RUN_PARAMETER_ROW_SCHEMA;
  readonly countryId: string;
  readonly facilityId: string;
  readonly locationId: string;
  readonly operatorId: string;
  readonly sourceRef: string;
  readonly sourceRawSha256: string;
  readonly policyVersion: string;
  readonly policyRawSha256: string;
  readonly userAdoptionRawSha256: string;
  readonly outputUnit: string;
  readonly expenseCurrency: string;
  readonly windowStartsAtSimTime: string;
  readonly windowEndsAtSimTime: string;
  readonly maximumMinutesPerWorkerFirstSimDay: string;
  readonly measurement: 'ADOPTED_PARAMETERS_NOT_RUN_WORK_PAYMENT_OR_OUTPUT_AUTHORITY';
}
const keys = [
  'schemaVersion',
  'countryId',
  'facilityId',
  'locationId',
  'operatorId',
  'sourceRef',
  'sourceRawSha256',
  'policyVersion',
  'policyRawSha256',
  'userAdoptionRawSha256',
  'outputUnit',
  'expenseCurrency',
  'windowStartsAtSimTime',
  'windowEndsAtSimTime',
  'maximumMinutesPerWorkerFirstSimDay',
  'measurement',
] as const;
export function parseIndustryRunParameterRow(
  input: unknown,
): Readonly<IndustryRunParameterRow> {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw Error('INDUSTRY_RUN_PARAMETERS:OBJECT_REQUIRED');
  const r = input as Record<string, unknown>;
  const text = (k: string) =>
    typeof r[k] === 'string' &&
    String(r[k]).length > 0 &&
    String(r[k]).length <= 256 &&
    String(r[k]).trim() === r[k];
  if (
    Object.keys(r).length !== keys.length ||
    !keys.every((k) => Object.hasOwn(r, k)) ||
    r.schemaVersion !== INDUSTRY_RUN_PARAMETER_ROW_SCHEMA ||
    r.measurement !==
      'ADOPTED_PARAMETERS_NOT_RUN_WORK_PAYMENT_OR_OUTPUT_AUTHORITY' ||
    ![
      'countryId',
      'facilityId',
      'locationId',
      'operatorId',
      'sourceRef',
      'policyVersion',
      'outputUnit',
      'expenseCurrency',
    ].every(text) ||
    !['sourceRawSha256', 'policyRawSha256', 'userAdoptionRawSha256'].every(
      (k) => typeof r[k] === 'string' && /^[a-f0-9]{64}$/u.test(r[k]),
    ) ||
    r.sourceRef !==
      'INDUSTRY_FIRST_DAY_' + String(r.sourceRawSha256).toUpperCase() ||
    ![
      'windowStartsAtSimTime',
      'windowEndsAtSimTime',
      'maximumMinutesPerWorkerFirstSimDay',
    ].every(
      (k) => typeof r[k] === 'string' && /^(0|[1-9][0-9]*)$/u.test(r[k]),
    ) ||
    BigInt(String(r.windowEndsAtSimTime)) <=
      BigInt(String(r.windowStartsAtSimTime)) ||
    BigInt(String(r.maximumMinutesPerWorkerFirstSimDay)) === 0n ||
    !/^[A-Z][A-Z0-9_]{0,31}$/u.test(String(r.expenseCurrency))
  )
    throw Error('INDUSTRY_RUN_PARAMETERS:EXACT_ADOPTED_PARAMETERS_REQUIRED');
  return Object.freeze({
    ...r,
  }) as unknown as Readonly<IndustryRunParameterRow>;
}
