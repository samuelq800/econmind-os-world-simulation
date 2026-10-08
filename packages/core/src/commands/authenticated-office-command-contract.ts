/** Pure transport for manual Office intent. A parsed intent grants no authority.
 * Durable acknowledgement is queue registration only; no economic outcome. */
export const AUTHENTICATED_OFFICE_COMMAND_SCHEMA =
  'world-authenticated-office-command-v1' as const;

export type ManualOfficeCommandFamily =
  | 'CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1'
  | 'CORE_CENTRAL_BANK_OMO_V1'
  | 'CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1';

export interface ManualOfficeCommandRequestDto {
  readonly worldId: string;
  readonly countryId: string;
  readonly officeId: 'CAPTAIN' | 'CENTRAL_BANK' | 'SOCIAL';
  readonly commandType: ManualOfficeCommandFamily;
  readonly commandId: string;
  readonly idempotencyKey: string;
  readonly expectedWorldVersion: string;
  /** Validated exclusively by the existing strict family parser. */
  readonly payload: unknown;
}

export interface AuthenticatedOfficeCommandRequestDto {
  readonly schemaVersion: typeof AUTHENTICATED_OFFICE_COMMAND_SCHEMA;
  readonly requestId: string;
  readonly request: ManualOfficeCommandRequestDto;
}

export interface ManualOfficeSourceRejectionDto {
  readonly status: 'REJECTED';
  readonly reason: 'SOURCE_RUNTIME_UNAVAILABLE';
  readonly commandType: ManualOfficeCommandFamily;
  readonly submitted: false;
  readonly queued: false;
  readonly missing: readonly (
    'ADMITTED_DOMAIN_SOURCE' | 'SOLE_DURABLE_CONSUMER'
  )[];
}
export interface ManualOfficeQueueAcknowledgementDto {
  readonly status: 'QUEUED' | 'EXECUTING' | 'FINALIZED';
  readonly source: 'NEW' | 'EXISTING';
  readonly commandType: ManualOfficeCommandFamily;
  readonly commandId: string;
  readonly commandFingerprint: string;
  /** True only when this transaction inserted the command and queue. */
  readonly submitted: boolean;
  /** Existing durable queue membership; never an economic commit receipt. */
  readonly queued: true;
}
export type AuthenticatedOfficeCommandResponseDto = Readonly<{
  schemaVersion: typeof AUTHENTICATED_OFFICE_COMMAND_SCHEMA;
  requestId: string;
}> &
  (
    | Readonly<{
        ok: false;
        error: Readonly<{ code: string; retryable: boolean }>;
        state?: ManualOfficeSourceRejectionDto;
      }>
    | Readonly<{
        ok: true;
        error?: never;
        state: ManualOfficeQueueAcknowledgementDto;
      }>
  );
