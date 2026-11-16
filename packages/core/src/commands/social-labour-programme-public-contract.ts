/** Browser-safe DATA only. The authoritative parser/source/commit guards remain
 * on the server. Proposed terms grant no approval, funding or eligibility. */
export const SOCIAL_PROGRAMMES_DATASET = 'social-labour-programmes';
export const SOCIAL_PROGRAMMES_NATURE =
  'ADMITTED_CURRENT_SOCIAL_LABOUR_PROGRAMME_TERMS';
export const SOCIAL_PROGRAMME_COMMAND =
  'CORE_SOCIAL_LABOUR_PROGRAMME_CREATE_V1';
export type SocialProgrammeTermsDto = Readonly<
  {
    schemaVersion: 'social-labour-programme-create-v1';
    programmeId: string;
  } & (
    | {
        kind: 'RELOCATION_SUPPORT';
        locationId: string;
        participants: string;
        benefit: Readonly<{ amount: string; currency: string }>;
      }
    | {
        kind: 'RETURN_TO_WORK';
        eligible: string;
        capacity: string;
        duration: Readonly<{ amount: string; unit: 'SIM_DAY' }>;
      }
  )
>;
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('SOCIAL_PROGRAMME_DATA_INVALID');
  return value as Record<string, unknown>;
};
const exact = (value: unknown, keys: readonly string[]) => {
  const r = record(value);
  if (
    Object.keys(r).length !== keys.length ||
    keys.some((k) => !Object.hasOwn(r, k))
  )
    throw Error('SOCIAL_PROGRAMME_DATA_INVALID');
  return r;
};
const identifier = (v: unknown): v is string =>
  typeof v === 'string' && /^[A-Za-z][A-Za-z0-9_:.-]{0,255}$/u.test(v);
const positive = (v: unknown): v is string =>
  typeof v === 'string' && /^[1-9][0-9]{0,77}$/u.test(v);
const fingerprint = (v: unknown): v is string =>
  typeof v === 'string' && /^sha256:[a-f0-9]{64}$/u.test(v);
export function parseSocialProgrammeTermsDto(
  value: unknown,
): SocialProgrammeTermsDto {
  const r = record(value);
  if (
    r.schemaVersion !== 'social-labour-programme-create-v1' ||
    !identifier(r.programmeId)
  )
    throw Error('SOCIAL_PROGRAMME_TERMS_INVALID');
  if (r.kind === 'RELOCATION_SUPPORT') {
    exact(r, [
      'schemaVersion',
      'programmeId',
      'kind',
      'locationId',
      'participants',
      'benefit',
    ]);
    const b = exact(r.benefit, ['amount', 'currency']);
    if (
      !identifier(r.locationId) ||
      !positive(r.participants) ||
      typeof b.amount !== 'string' ||
      b.amount.length > 100 ||
      !/^(0|[1-9][0-9]*)(\.[0-9]*[1-9])?$/u.test(b.amount) ||
      !identifier(b.currency)
    )
      throw Error('SOCIAL_PROGRAMME_TERMS_INVALID');
  } else if (r.kind === 'RETURN_TO_WORK') {
    exact(r, [
      'schemaVersion',
      'programmeId',
      'kind',
      'eligible',
      'capacity',
      'duration',
    ]);
    const d = exact(r.duration, ['amount', 'unit']);
    if (
      typeof r.eligible !== 'string' ||
      !r.eligible.trim() ||
      r.eligible !== r.eligible.trim() ||
      r.eligible.length > 2048 ||
      !positive(r.capacity) ||
      !positive(d.amount) ||
      d.unit !== 'SIM_DAY'
    )
      throw Error('SOCIAL_PROGRAMME_TERMS_INVALID');
  } else throw Error('SOCIAL_PROGRAMME_TERMS_INVALID');
  return value as SocialProgrammeTermsDto;
}
export interface SocialProgrammeRowDto {
  readonly countryId: string;
  readonly programmeId: string;
  readonly terms: SocialProgrammeTermsDto;
  readonly status: 'PENDING_REVIEW';
  readonly commandId: string;
  readonly commandFingerprint: string;
  readonly sourceRef: string;
  readonly sourceFingerprint: string;
  readonly classification: 'TERMS_ONLY_NOT_ELIGIBILITY_APPROVAL_FUNDING_OR_SERVICE';
}
export function parseSocialProgrammeRowDto(
  value: unknown,
): SocialProgrammeRowDto {
  const r = exact(value, [
    'countryId',
    'programmeId',
    'terms',
    'status',
    'commandId',
    'commandFingerprint',
    'sourceRef',
    'sourceFingerprint',
    'classification',
  ]);
  const terms = parseSocialProgrammeTermsDto(r.terms);
  if (
    !identifier(r.countryId) ||
    terms.programmeId !== r.programmeId ||
    !identifier(r.commandId) ||
    !identifier(r.sourceRef) ||
    !fingerprint(r.commandFingerprint) ||
    !fingerprint(r.sourceFingerprint) ||
    r.status !== 'PENDING_REVIEW' ||
    r.classification !==
      'TERMS_ONLY_NOT_ELIGIBILITY_APPROVAL_FUNDING_OR_SERVICE'
  )
    throw Error('SOCIAL_PROGRAMME_ROW_INVALID');
  return value as SocialProgrammeRowDto;
}

/** The server selects the real whole E03 group and its current count. */
export const SOCIAL_PROGRAMME_APPLY_COMMAND =
  'CORE_SOCIAL_LABOUR_PROGRAMME_APPLY_V1';
export const SOCIAL_PROGRAMME_APPLICATIONS_DATASET =
  'social-labour-programme-applications';
export const SOCIAL_PROGRAMME_APPLICATIONS_NATURE =
  'ADMITTED_CURRENT_SOCIAL_LABOUR_PROGRAMME_APPLICATIONS';
export interface SocialProgrammeApplicantDto {
  readonly locationId: string;
  readonly skill: 'LOW' | 'MEDIUM' | 'HIGH';
  readonly status:
    'EMPLOYED' | 'UNEMPLOYED_SEARCHING' | 'NOT_IN_LABOUR_FORCE' | 'STUDENT';
}
function applicantDto(value: unknown): SocialProgrammeApplicantDto {
  const r = exact(value, ['locationId', 'skill', 'status']);
  if (
    !identifier(r.locationId) ||
    !['LOW', 'MEDIUM', 'HIGH'].includes(String(r.skill)) ||
    ![
      'EMPLOYED',
      'UNEMPLOYED_SEARCHING',
      'NOT_IN_LABOUR_FORCE',
      'STUDENT',
    ].includes(String(r.status))
  )
    throw Error('SOCIAL_PROGRAMME_APPLICANT_INVALID');
  return value as SocialProgrammeApplicantDto;
}
export interface SocialProgrammeApplicationIntentDto {
  readonly schemaVersion: 'social-labour-programme-apply-v1';
  readonly programmeId: string;
  readonly programmeCommandFingerprint: string;
  readonly applicationId: string;
  readonly applicant: SocialProgrammeApplicantDto;
}
export function parseSocialProgrammeApplicationIntentDto(
  value: unknown,
): SocialProgrammeApplicationIntentDto {
  const r = exact(value, [
    'schemaVersion',
    'programmeId',
    'programmeCommandFingerprint',
    'applicationId',
    'applicant',
  ]);
  if (
    r.schemaVersion !== 'social-labour-programme-apply-v1' ||
    !identifier(r.programmeId) ||
    !identifier(r.applicationId) ||
    !fingerprint(r.programmeCommandFingerprint)
  )
    throw Error('SOCIAL_PROGRAMME_APPLICATION_INTENT_INVALID');
  applicantDto(r.applicant);
  return value as SocialProgrammeApplicationIntentDto;
}
export interface SocialProgrammeApplicationRowDto {
  readonly countryId: string;
  readonly programmeId: string;
  readonly programmeCommandFingerprint: string;
  readonly applicationId: string;
  readonly applicant: SocialProgrammeApplicantDto;
  readonly personCount: string;
  readonly submittedAtSimTime: string;
  readonly commandId: string;
  readonly commandFingerprint: string;
  readonly sourceRef: string;
  readonly sourceFingerprint: string;
  readonly status: 'APPLIED';
  readonly classification: 'APPLICATION_ONLY_NOT_ELIGIBILITY_APPROVAL_FUNDING_OR_SERVICE';
}
export function parseSocialProgrammeApplicationRowDto(
  value: unknown,
): SocialProgrammeApplicationRowDto {
  const r = exact(value, [
    'countryId',
    'programmeId',
    'programmeCommandFingerprint',
    'applicationId',
    'applicant',
    'personCount',
    'submittedAtSimTime',
    'commandId',
    'commandFingerprint',
    'sourceRef',
    'sourceFingerprint',
    'status',
    'classification',
  ]);
  applicantDto(r.applicant);
  if (
    ![
      'countryId',
      'programmeId',
      'applicationId',
      'commandId',
      'sourceRef',
    ].every((k) => identifier(r[k])) ||
    !positive(r.personCount) ||
    typeof r.submittedAtSimTime !== 'string' ||
    !/^(0|[1-9][0-9]{0,77})$/u.test(r.submittedAtSimTime) ||
    !fingerprint(r.programmeCommandFingerprint) ||
    !fingerprint(r.commandFingerprint) ||
    !fingerprint(r.sourceFingerprint) ||
    r.status !== 'APPLIED' ||
    r.classification !==
      'APPLICATION_ONLY_NOT_ELIGIBILITY_APPROVAL_FUNDING_OR_SERVICE'
  )
    throw Error('SOCIAL_PROGRAMME_APPLICATION_ROW_INVALID');
  return value as SocialProgrammeApplicationRowDto;
}
