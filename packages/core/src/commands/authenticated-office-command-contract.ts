/** Pure transport for manual Office intent. A parsed intent grants no authority.
 * This version rejects every supported family until its real source and the
 * sole durable consumer are wired. REJECTED is no acceptance, queue or result. */
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

export interface AuthenticatedOfficeCommandResponseDto {
  readonly schemaVersion: typeof AUTHENTICATED_OFFICE_COMMAND_SCHEMA;
  readonly requestId: string;
  readonly ok: false;
  readonly error: Readonly<{ code: string; retryable: boolean }>;
  readonly state?: Readonly<{
    status: 'REJECTED';
    reason: 'SOURCE_RUNTIME_UNAVAILABLE';
    commandType: ManualOfficeCommandFamily;
    /** This call created no submission, acceptance, queue row or result. */
    submitted: false;
    queued: false;
    missing: readonly ('ADMITTED_DOMAIN_SOURCE' | 'SOLE_DURABLE_CONSUMER')[];
  }>;
}
