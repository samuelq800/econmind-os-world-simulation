/** Browser-safe transport contract only. Capabilities describe implemented
 * staged actions; they grant no Office, seat, admission or economic authority.
 * The existing server parser and deterministic Command kernel remain sole
 * validators. Four unsupported Offices must stay visibly unsupported. */
export const AUTHENTICATED_FINANCIAL_INTAKE_SCHEMA =
  'world-authenticated-financial-intake-v1' as const;
export const AUTHENTICATED_FINANCIAL_INTAKE_PATH =
  '/v1/financial-intake' as const;
export const FINANCIAL_INTAKE_OFFICE_ACTIONS = Object.freeze({
  CAPTAIN: Object.freeze([]),
  FINANCE: Object.freeze([
    'INSPECT',
    'SIGN_BUYER_FINANCE',
    'BIND_REFERENCE',
  ] as const),
  CENTRAL_BANK: Object.freeze([]),
  INDUSTRY: Object.freeze([]),
  TRADE: Object.freeze([
    'REGISTER',
    'INSPECT',
    'SIGN_SELLER',
    'SIGN_BUYER_TRADE',
    'ENQUEUE',
    'READ',
  ] as const),
  SOCIAL: Object.freeze([]),
});
export type FinancialIntakeOffice =
  keyof typeof FINANCIAL_INTAKE_OFFICE_ACTIONS;
export type FinancialIntakeAction =
  (typeof FINANCIAL_INTAKE_OFFICE_ACTIONS)[FinancialIntakeOffice][number];
export interface FinancialIntakeStagedRequestDto {
  readonly schemaVersion: 'world-staged-transfer-v1';
  readonly action: FinancialIntakeAction;
  readonly worldId: string;
  readonly countryId: string;
  readonly officeId: FinancialIntakeOffice;
  readonly commandId: string;
  readonly idempotencyKey: string;
  readonly commandFingerprint?: string;
  readonly approvalRef?: string;
  readonly intent?: Readonly<{
    expectedWorldVersion: string;
    buyerCountryId: string;
    quantity: Readonly<{ amount: string; unit: string }>;
    price: Readonly<{ amount: string; currency: string; perUnit: string }>;
    assetSource: Readonly<{
      batchId: string;
      physicalLocationId: string;
      titleHolderId: string;
      riskBearerId: string;
      economicRecognitionId: string;
    }>;
    expiresAtReal: string;
  }>;
}
export interface AuthenticatedFinancialIntakeRequestDto {
  readonly schemaVersion: typeof AUTHENTICATED_FINANCIAL_INTAKE_SCHEMA;
  readonly requestId: string;
  readonly request: FinancialIntakeStagedRequestDto;
}
/** Public wire shape matches the real provider. Merely constructing this DTO
 * does not verify a signature, current seat or admitted source. */
export interface FinancialIntakeBindingDto {
  readonly source: 'SERVER_VERIFIED_READ_BINDING';
  readonly capability: 'READ_AUTHORIZED_PROJECTION_AND_FINAL';
  readonly seatRef: string;
  readonly seatState: 'ACTIVE';
  readonly identity: Readonly<{
    authSubjectId: string;
    worldId: string;
    countryId: string;
    officeId: string;
    scopeKey: string;
    classification: 'COUNTRY' | 'OFFICE_PRIVATE';
    authorizationRevision: string;
    modelVersion: string;
    projectionVersion: string;
  }>;
  readonly seed: Readonly<{
    worldId: string;
    seedRef: string;
    contentHash: string;
    admissionRef: string;
  }>;
  readonly readback: Readonly<{
    worldId: string;
    seedRef: string;
    contentHash: string;
    admissionRef: string;
    worldVersion: string;
    eventSequence: string;
    readbackRef: string;
  }>;
}
export type FinancialIntakeStateStatus =
  | 'PENDING_APPROVAL_OR_ENQUEUE'
  | 'QUEUED'
  | 'EXECUTING'
  | 'FINAL'
  | 'NOT_FOUND'
  | 'UNKNOWN'
  | 'INTENT'
  | 'SIGNATURE_RECORDED'
  | 'REFERENCE_BOUND';
export interface FinancialIntakeStateDto {
  readonly status: FinancialIntakeStateStatus;
  readonly [field: string]: unknown;
}
export interface AuthenticatedFinancialIntakeResponseDto {
  readonly schemaVersion: typeof AUTHENTICATED_FINANCIAL_INTAKE_SCHEMA;
  readonly requestId: string;
  readonly ok: boolean;
  readonly authority?: FinancialIntakeBindingDto;
  /** QUEUED/signature/registration is not a committed economic result. */
  readonly state?: FinancialIntakeStateDto;
  readonly error?: Readonly<{ code: string; retryable: boolean }>;
}
/** Caller supplies its current server session token, never a seat or approval.
 * Retries keep exactly the same Command/idempotency identities and intent;
 * UNKNOWN must be inspected, not replaced by a new request to add funds. */
export interface AuthenticatedFinancialIntakeClientPort {
  execute(input: {
    readonly request: AuthenticatedFinancialIntakeRequestDto;
    readonly accessToken: string;
    readonly signal?: AbortSignal;
  }): Promise<AuthenticatedFinancialIntakeResponseDto>;
}
