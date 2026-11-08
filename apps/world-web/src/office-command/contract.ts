import {
  AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
  type AuthenticatedCommandRecoveryRequestDto,
} from '@econmind/core/authenticated-command-recovery-contract';
import {
  MANUAL_INDUSTRY_UTILITY_COMMANDS,
  isManualIndustryUtilityCommandFamily,
  isManualIndustryUtilityPayload,
  AUTHENTICATED_OFFICE_COMMAND_PATH,
  AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
  type AuthenticatedOfficeCommandRequestDto,
  type ManualOfficeQueueAcknowledgementDto,
  type ManualOfficeCommandRequestDto,
  type ManualOfficeCommandFamily,
} from '@econmind/core/authenticated-office-command-contract';
import { exactJson } from '../country-runtime/staged-reservation-client.js';
import {
  canonicalId,
  hash,
  row,
  uuid,
  validConfig,
  validEndpoints,
  version,
  type ProductionReadConfig,
} from '../production-read/contract.js';

export const MAX_OFFICE_TRANSPORT_REQUEST_BYTES = 16 * 1024;
export function officeRecoveryRequest(
  original: AuthenticatedOfficeCommandRequestDto,
  requestId: string,
  knownCommandFingerprint?: string,
): AuthenticatedCommandRecoveryRequestDto {
  return {
    schemaVersion: AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
    requestId,
    request: {
      worldId: original.request.worldId,
      commandId: original.request.commandId,
      idempotencyKey: original.request.idempotencyKey,
      originalRequest: original,
      ...(knownCommandFingerprint === undefined
        ? {}
        : { knownCommandFingerprint }),
    },
  };
}
export interface OfficeCommandEndpoint {
  readonly origin: string;
  readonly path: typeof AUTHENTICATED_OFFICE_COMMAND_PATH;
  readonly deploymentRef: string;
}
export const officeFamilies = Object.freeze({
  CAPTAIN: Object.freeze(['CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1'] as const),
  CENTRAL_BANK: Object.freeze(['CORE_CENTRAL_BANK_OMO_V1'] as const),
  TRADE: Object.freeze(['CORE_GOODS_TRANSFER_V1'] as const),
  INDUSTRY: Object.freeze([
    'CORE_INDUSTRY_PRODUCTION_V1',
    'CORE_INDUSTRY_RUN_SCHEDULE_V1',
    MANUAL_INDUSTRY_UTILITY_COMMANDS.POWER,
    MANUAL_INDUSTRY_UTILITY_COMMANDS.WATER,
    MANUAL_INDUSTRY_UTILITY_COMMANDS.LOGISTICS,
  ] as const),
  SOCIAL: Object.freeze([
    'CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1',
    'CORE_SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATE_V1',
    'CORE_SOCIAL_EMPLOYMENT_SERVICE_CREATE_V1',
  ] as const),
  FINANCE: Object.freeze([
    'CORE_FINANCE_BUDGET_APPROPRIATION_V1',
    'POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1',
  ] as const),
} as const satisfies Record<
  ManualOfficeCommandRequestDto['officeId'],
  readonly ManualOfficeCommandFamily[]
>);
export const exactKeys = (
  v: Record<string, unknown>,
  keys: readonly string[],
) =>
  Object.keys(v).length === keys.length &&
  keys.every((k) => Object.hasOwn(v, k));
export function validOfficeEndpoint(
  e: OfficeCommandEndpoint,
  c: ProductionReadConfig,
) {
  return (
    !!e &&
    validConfig(c) &&
    e.path === AUTHENTICATED_OFFICE_COMMAND_PATH &&
    canonicalId(e.deploymentRef) &&
    validEndpoints({ ...c.endpoints, origin: e.origin })
  );
}
/** Exact public transport shape, not an economic parser or an authority grant.
 * Family payload validation remains exclusively in the existing server parser. */
export function parseOfficeIntent(
  value: unknown,
  c: ProductionReadConfig,
): AuthenticatedOfficeCommandRequestDto | null {
  try {
    const serialized = exactJson(value);
    if (
      new TextEncoder().encode(serialized).byteLength >
      MAX_OFFICE_TRANSPORT_REQUEST_BYTES
    )
      return null;
    const envelope = row(JSON.parse(serialized)),
      r = row(envelope?.request);
    if (
      !envelope ||
      !r ||
      !exactKeys(envelope, ['schemaVersion', 'requestId', 'request']) ||
      envelope.schemaVersion !== AUTHENTICATED_OFFICE_COMMAND_SCHEMA ||
      !uuid(envelope.requestId) ||
      !exactKeys(r, [
        'worldId',
        'countryId',
        'officeId',
        'commandType',
        'commandId',
        'idempotencyKey',
        'expectedWorldVersion',
        'payload',
      ]) ||
      !Object.hasOwn(officeFamilies, String(r.officeId)) ||
      !(
        officeFamilies[
          r.officeId as keyof typeof officeFamilies
        ] as readonly unknown[]
      ).includes(r.commandType) ||
      ![r.worldId, r.countryId, r.commandId, r.idempotencyKey].every(
        canonicalId,
      ) ||
      !version(r.expectedWorldVersion) ||
      !row(r.payload) ||
      (isManualIndustryUtilityCommandFamily(r.commandType) &&
        !isManualIndustryUtilityPayload(r.commandType, r.payload)) ||
      r.worldId !== c.identity.worldId ||
      r.countryId !== c.identity.countryId ||
      r.officeId !== c.identity.officeId ||
      c.identity.classification !== 'OFFICE_PRIVATE'
    )
      return null;
    const parsed = JSON.parse(
      serialized,
    ) as AuthenticatedOfficeCommandRequestDto;
    // Keep enough room for the original-request recovery wrapper, even when
    // a known fingerprint is present. The server's 16KiB limit is unchanged.
    if (
      new TextEncoder().encode(
        JSON.stringify(
          officeRecoveryRequest(
            parsed,
            parsed.requestId,
            'sha256:' + '0'.repeat(64),
          ),
        ),
      ).byteLength > MAX_OFFICE_TRANSPORT_REQUEST_BYTES
    )
      return null;
    return parsed;
  } catch {
    return null;
  }
}
export function parseQueueAck(
  value: unknown,
  request: AuthenticatedOfficeCommandRequestDto,
): ManualOfficeQueueAcknowledgementDto | null {
  const s = row(value);
  if (
    !s ||
    !exactKeys(s, [
      'status',
      'source',
      'commandType',
      'commandId',
      'commandFingerprint',
      'submitted',
      'queued',
    ]) ||
    !['QUEUED', 'EXECUTING', 'FINALIZED'].includes(String(s.status)) ||
    !['NEW', 'EXISTING'].includes(String(s.source)) ||
    s.commandType !== request.request.commandType ||
    s.commandId !== request.request.commandId ||
    !hash(s.commandFingerprint) ||
    typeof s.submitted !== 'boolean' ||
    s.queued !== true ||
    (s.source === 'NEW'
      ? s.submitted !== true || s.status !== 'QUEUED'
      : s.submitted !== false)
  )
    return null;
  return Object.freeze({
    ...s,
  }) as unknown as ManualOfficeQueueAcknowledgementDto;
}
