import { createHash } from 'node:crypto';

type Json = null | boolean | number | string | readonly Json[] | Row;
type Row = { readonly [key: string]: Json };

/** Exact reviewed hypothetical inputs. These hashes establish identity, never admission. */
export const SOCIAL_CANDIDATE_INPUT_IDENTITIES = Object.freeze({
  modelOptions:
    '3c006105511a695145d83a1c4893f8b740fb31da8cb8d63fe9ebc92027f83f39',
  independentDemand:
    '1fbc2a1a7cf7c86433334318370b63c2adfb8a3f6086e0db89c959c5a7d1a915',
  wageInput: 'efaeb578247e7cc0877b9dce7260f07531ff26fd62ed616c32706385836998cd',
});

function reject(reason: string): never {
  throw new Error(`Social candidate: ${reason}`);
}
function row(value: unknown): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    reject('record required');
  return value as Row;
}
function keys(value: object, expected: readonly string[]) {
  if (Object.keys(value).sort().join('|') !== [...expected].sort().join('|'))
    reject('missing/unknown fields');
}
function list(value: Json | undefined): readonly Json[] {
  if (!Array.isArray(value)) reject('array required');
  return value;
}
function owned<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) owned(child);
    Object.freeze(value);
  }
  return value;
}
function pinnedJson(value: string, hash: string): Row {
  if (
    typeof value !== 'string' ||
    createHash('sha256').update(value, 'utf8').digest('hex') !== hash
  )
    reject('input identity mismatch');
  return row(JSON.parse(value) as unknown);
}

export interface SocialCandidateSourceWindow {
  readonly validFromDayIndex: string;
  readonly validUntilDayIndex: string;
  readonly inclusiveEndpoints: true;
  readonly durationE01Days: string;
}

/** Finite bridge bound only; this introduces no economic or Core integer limit. */
const MAX_BRIDGE_DAY = 9223372036854775807n;
function day(value: unknown): bigint {
  if (
    typeof value !== 'string' ||
    !/^(?:0|[1-9]\d{0,18})$/u.test(value) ||
    BigInt(value) > MAX_BRIDGE_DAY
  )
    reject('canonical bounded day required');
  return BigInt(value);
}

export function mapSocialCandidateWageWindows(
  input: SocialCandidateSourceWindow,
) {
  row(input);
  keys(input, [
    'validFromDayIndex',
    'validUntilDayIndex',
    'inclusiveEndpoints',
    'durationE01Days',
  ]);
  if (input.inclusiveEndpoints !== true)
    reject('explicit inclusive source required');
  const from = day(input.validFromDayIndex);
  const last = day(input.validUntilDayIndex);
  const duration = day(input.durationE01Days);
  if (last < from || duration === 0n || last - from + 1n !== duration)
    reject('source range/duration mismatch or repeated conversion');
  if (last === MAX_BRIDGE_DAY) reject('exclusive endpoint overflow');
  const fragment = () =>
    ({
      validFromDayIndex: from.toString(),
      validUntilDayIndex: (last + 1n).toString(),
    }) as const;
  return owned({
    sourceConvention: {
      ...input,
      targetConvention: 'HALF_OPEN' as const,
      conversionCount: 1 as const,
    },
    offer: fragment(),
    minimumWage: fragment(),
  } as const);
}

export interface SocialModelCandidateInput {
  readonly modelId: string;
  readonly modelOptionsJson: string;
  readonly independentDemandJson: string;
  readonly wageInputJson: string;
}

export interface SocialModelCandidatePreparation {
  readonly schemaVersion: 'social-model-candidate-preparation-v1';
  readonly status: 'CANDIDATE_CONSUMED';
  readonly scope: 'REPOSITORY_CI_CANDIDATE_PREVIEW_ONLY';
  readonly previewModelId: string;
  readonly sourceIdentities: typeof SOCIAL_CANDIDATE_INPUT_IDENTITIES;
  readonly candidateModel: Row;
  readonly candidateIndependentDemand: Row;
  readonly candidateWageVersion: Row;
  readonly wageWindows: ReturnType<typeof mapSocialCandidateWageWindows>;
  readonly unresolved: readonly string[];
  readonly authority: {
    readonly selected: false;
    readonly adopted: false;
    readonly sourceAdmitted: false;
    readonly runtimeReady: false;
    readonly formalSourceInputReady: false;
    readonly operatingReady: false;
    readonly executionEligible: false;
    readonly actualCash: null;
    readonly actualEmployerBinding: null;
    readonly actualLawfulFundedOffers: null;
    readonly actualInputs: null;
    readonly actualCustodian: 'SUPPLIER_UNCONFIRMED';
    readonly physicalDailyAttemptTimeEnvelope: 'OPEN';
    readonly WorldClock: false;
  };
}

/** Pure candidate consumption: no economic recalculation, state, issuer or runtime registration. */
export function consumeSocialModelCandidate(
  input: SocialModelCandidateInput,
): SocialModelCandidatePreparation {
  row(input);
  keys(input, [
    'modelId',
    'modelOptionsJson',
    'independentDemandJson',
    'wageInputJson',
  ]);
  if (typeof input.modelId !== 'string' || !input.modelId.length)
    reject('explicit unique model ID required');
  const options = pinnedJson(
    input.modelOptionsJson,
    SOCIAL_CANDIDATE_INPUT_IDENTITIES.modelOptions,
  );
  const demand = pinnedJson(
    input.independentDemandJson,
    SOCIAL_CANDIDATE_INPUT_IDENTITIES.independentDemand,
  );
  const wages = pinnedJson(
    input.wageInputJson,
    SOCIAL_CANDIDATE_INPUT_IDENTITIES.wageInput,
  );
  if (
    options.schemaVersion !== 'G_C01_TASK_BASED_SUCCESSOR_OPTIONS_V2' ||
    options.selectedModel !== null ||
    wages.schemaVersion !== 'a-social-c01-wage-currency-candidate-v1' ||
    wages.countryId !== 'COUNTRY_01' ||
    wages.locationId !== 'REGION_01_E1' ||
    wages.currency !== 'XAA' ||
    wages.period !== 'SIM_YEAR'
  )
    reject('foreign candidate schema/scope/version');
  const matches = list(options.models)
    .map(row)
    .filter((m) => m.id === input.modelId);
  if (matches.length !== 1) reject('explicit unique known model ID required');
  const model = matches[0]!;
  if (
    model.schemaVersion !== 'G_C01_TASK_DERIVED_NUMERIC_MODEL_V2' ||
    model.demandProfile !== 'HIGH_CONTACT_TIME' ||
    model.status !== 'SOURCE_EMPLOYMENT_CONSTRAINTS_MAPPED_CANDIDATE_ONLY' ||
    model.unexpandedSourceEmployed !== '0' ||
    model.mappedEmployed !== model.sourceEmployedTarget
  )
    reject(
      'incomplete source employment; candidate cannot be consumed as complete',
    );
  const modelAuthority = row(model.authority);
  for (const field of [
    'selected',
    'adopted',
    'sourceAdmitted',
    'operatingReady',
    'formalSourceInputReady',
    'WorldClock',
  ])
    if (modelAuthority[field] !== false) reject('candidate authority changed');
  for (const value of list(model.positions)) {
    const position = row(value);
    if (
      position.countryId !== wages.countryId ||
      position.locationId !== wages.locationId ||
      position.actualEmployerBinding !== null
    )
      reject('foreign position scope or actual employer claim');
  }
  const wageVersions = list(wages.versions)
    .map(row)
    .filter((v) => v.id === model.wageVersion);
  if (wageVersions.length !== 1) reject('same-version wage input required');
  const candidateDemand = row(demand[model.demandProfile]);
  const sourceWindow = row(wages.candidateWindow);
  if (
    sourceWindow.activation !== 'NOT_ADOPTED_NOT_ACTIVE' ||
    sourceWindow.actualWorldId !== null
  )
    reject('candidate window is not inert');
  const wageWindows = mapSocialCandidateWageWindows({
    validFromDayIndex: sourceWindow.validFromDayIndex as string,
    validUntilDayIndex: sourceWindow.validUntilDayIndex as string,
    inclusiveEndpoints: sourceWindow.inclusiveEndpoints as true,
    durationE01Days: sourceWindow.durationE01Days as string,
  });
  return owned<SocialModelCandidatePreparation>({
    schemaVersion: 'social-model-candidate-preparation-v1',
    status: 'CANDIDATE_CONSUMED',
    scope: 'REPOSITORY_CI_CANDIDATE_PREVIEW_ONLY',
    previewModelId: input.modelId,
    sourceIdentities: { ...SOCIAL_CANDIDATE_INPUT_IDENTITIES },
    candidateModel: model,
    candidateIndependentDemand: candidateDemand,
    candidateWageVersion: wageVersions[0]!,
    wageWindows,
    unresolved: [
      'Formal admitted genesis/current source and snapshot reader binding not supplied',
      'Actual employer/legal offer/payroll funding/cash/inputs/custodian not supplied',
      'Physical daily failed/repeated-attempt-time envelope OPEN; reservation release does not restore time',
      'No model selection/adoption or actual Social execution authorized by this preview',
    ],
    authority: {
      selected: false,
      adopted: false,
      sourceAdmitted: false,
      runtimeReady: false,
      formalSourceInputReady: false,
      operatingReady: false,
      executionEligible: false,
      actualCash: null,
      actualEmployerBinding: null,
      actualLawfulFundedOffers: null,
      actualInputs: null,
      actualCustodian: 'SUPPLIER_UNCONFIRMED',
      physicalDailyAttemptTimeEnvelope: 'OPEN',
      WorldClock: false,
    },
  });
}
