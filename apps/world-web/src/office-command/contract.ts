import {
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

export interface OfficeCommandEndpoint {
  readonly origin: string;
  readonly path: typeof AUTHENTICATED_OFFICE_COMMAND_PATH;
  readonly deploymentRef: string;
}
export const officeFamilies = Object.freeze({
  CAPTAIN: 'CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1',
  CENTRAL_BANK: 'CORE_CENTRAL_BANK_OMO_V1',
  SOCIAL: 'CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1',
} as const satisfies Record<
  ManualOfficeCommandRequestDto['officeId'],
  ManualOfficeCommandFamily
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
    if (new TextEncoder().encode(serialized).byteLength > 65536) return null;
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
      officeFamilies[r.officeId as keyof typeof officeFamilies] !==
        r.commandType ||
      ![r.worldId, r.countryId, r.commandId, r.idempotencyKey].every(
        canonicalId,
      ) ||
      !version(r.expectedWorldVersion) ||
      !row(r.payload) ||
      r.worldId !== c.identity.worldId ||
      r.countryId !== c.identity.countryId ||
      r.officeId !== c.identity.officeId ||
      c.identity.classification !== 'OFFICE_PRIVATE'
    )
      return null;
    return JSON.parse(serialized) as AuthenticatedOfficeCommandRequestDto;
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
