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

/** Fixed public scheduling families. These literals and the payload gate are
 * browser-safe transport only; they issue no work, payment, right or delivery. */
export const MANUAL_INDUSTRY_UTILITY_COMMANDS = Object.freeze({
  POWER: 'INDUSTRY_FIRST_DAY_POWER_EXECUTE_V1',
  WATER: 'INDUSTRY_FIRST_DAY_WATER_EXECUTE_V1',
  LOGISTICS: 'INDUSTRY_FIRST_DAY_LOGISTICS_EXECUTE_V1',
} as const);
export type ManualIndustryUtilityCommandFamily =
  (typeof MANUAL_INDUSTRY_UTILITY_COMMANDS)[keyof typeof MANUAL_INDUSTRY_UTILITY_COMMANDS];
export function isManualIndustryUtilityCommandFamily(
  family: unknown,
): family is ManualIndustryUtilityCommandFamily {
  return Object.values(MANUAL_INDUSTRY_UTILITY_COMMANDS).some(
    (f) => f === family,
  );
}
/** Only these user scheduling actions may cross the manual boundary. Historical
 * conditional DATA reducers retain their other stages for fixed issuers. */
export function isManualIndustryUtilityPayload(
  family: unknown,
  value: unknown,
): boolean {
  const record = (v: unknown): Record<string, unknown> | null =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null;
  const reference = (v: unknown) =>
    typeof v === 'string' && /^[A-Za-z][A-Za-z0-9_.:-]{0,255}$/u.test(v);
  const fingerprint = (v: unknown) =>
    typeof v === 'string' && /^sha256:[a-f0-9]{64}$/u.test(v);
  const exact = (v: Record<string, unknown>, keys: readonly string[]) =>
    Object.keys(v).length === keys.length &&
    keys.every((k) => Object.hasOwn(v, k));
  const payload = record(value),
    operation = record(payload?.operation);
  if (
    !payload ||
    !operation ||
    !exact(payload, [
      'schemaVersion',
      'serviceKind',
      'operationRef',
      'facilityId',
      'runId',
      'sourceRef',
      'sourceRawSha256',
      'operation',
    ]) ||
    payload.schemaVersion !== 'industry-first-day-utility-command-v1' ||
    !Object.hasOwn(
      MANUAL_INDUSTRY_UTILITY_COMMANDS,
      String(payload.serviceKind),
    ) ||
    family !==
      MANUAL_INDUSTRY_UTILITY_COMMANDS[
        payload.serviceKind as keyof typeof MANUAL_INDUSTRY_UTILITY_COMMANDS
      ]
  )
    return false;
  switch (family) {
    case MANUAL_INDUSTRY_UTILITY_COMMANDS.POWER:
      if (operation.action === 'DELIVER')
        return (
          exact(operation, [
            'action',
            'bookingRef',
            'workEventFingerprint',
            'paymentEventFingerprint',
          ]) &&
          reference(operation.bookingRef) &&
          fingerprint(operation.workEventFingerprint) &&
          fingerprint(operation.paymentEventFingerprint)
        );
      return (
        operation.action === 'BOOK' &&
        exact(operation, [
          'action',
          'bookingRef',
          'purpose',
          'fromSimTime',
          'throughSimTime',
          'outputMWh',
        ])
      );
    case MANUAL_INDUSTRY_UTILITY_COMMANDS.WATER:
      // References locate real prior records. They never attest paid work or
      // create a water right; the fixed source and reducer check every record.
      return (
        operation.action === 'DELIVER' &&
        exact(operation, [
          'action',
          'workEventFingerprint',
          'paymentEventFingerprint',
          'powerEventFingerprints',
          'additionalProtectedClaims',
        ])
      );
    case MANUAL_INDUSTRY_UTILITY_COMMANDS.LOGISTICS:
      if (operation.action === 'BOOK')
        return (
          exact(operation, ['action', 'transferId', 'request']) &&
          record(operation.request) !== null
        );
      if (operation.action === 'SHIP' || operation.action === 'DELIVER')
        return exact(operation, ['action', 'transferId']);
      if (operation.action === 'SERVICE_WORK')
        return exact(operation, [
          'action',
          'transferId',
          'workOrderRef',
          'workOrderSha256',
        ]);
      if (operation.action === 'PAY_INPUTS')
        return exact(operation, [
          'action',
          'transferId',
          'workEventFingerprint',
          'expenseOrderRef',
          'expenseOrderSha256',
        ]);
      return false;
    default:
      return false;
  }
}

export type ManualOfficeCommandFamily =
  | 'CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1'
  | 'CORE_CENTRAL_BANK_OMO_V1'
  | 'CORE_GOODS_TRANSFER_V1'
  | 'CORE_INDUSTRY_PRODUCTION_V1'
  | 'CORE_INDUSTRY_RUN_SCHEDULE_V1'
  | ManualIndustryUtilityCommandFamily
  | 'CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1'
  | 'CORE_SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATE_V1'
  | typeof FINANCE_BUDGET_APPROPRIATION_COMMAND
  | typeof POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND;

export interface ManualOfficeCommandRequestDto {
  readonly worldId: string;
  readonly countryId: string;
  readonly officeId:
    'CAPTAIN' | 'CENTRAL_BANK' | 'SOCIAL' | 'FINANCE' | 'TRADE' | 'INDUSTRY';
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
