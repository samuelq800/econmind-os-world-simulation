import { POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND } from './authenticated-fx-command-contract.js';
export {
  POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND,
  POSTWAR_DAY_ONE_TREASURY_FX_PAYLOAD_SCHEMA,
  type PostwarDayOneTreasuryFxPayload,
} from './authenticated-fx-command-contract.js';
/** Pure transport for manual Office intent. A parsed intent grants no authority.
 * Durable acknowledgement is queue registration only; no economic outcome. */
export const AUTHENTICATED_OFFICE_COMMAND_SCHEMA =
  'world-authenticated-office-command-v1' as const;
export const AUTHENTICATED_OFFICE_COMMAND_PATH = '/v1/office-command' as const;

/** Intent schema registration only; no budget source or execution readiness. */
export const FINANCE_BUDGET_APPROPRIATION_COMMAND =
  'CORE_FINANCE_BUDGET_APPROPRIATION_V1' as const;

export type ManualOfficeCommandFamily =
  | 'CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1'
  | 'CORE_CENTRAL_BANK_OMO_V1'
  | 'CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1'
  | 'CORE_SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATE_V1'
  | typeof FINANCE_BUDGET_APPROPRIATION_COMMAND
  | typeof POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND;

export interface ManualOfficeCommandRequestDto {
  readonly worldId: string;
  readonly countryId: string;
  readonly officeId: 'CAPTAIN' | 'CENTRAL_BANK' | 'SOCIAL' | 'FINANCE';
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
