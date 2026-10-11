// PREPARATION_ONLY. Parsed bytes are data, never registered source or authority.
import { createHash } from 'node:crypto';
import { OFFICE_DEFINITIONS, type CanonicalOfficeName } from '@econmind/core';

export const AUTHORIZATION_PREPARATION_SCHEMA =
  'authorization-publication-preparation.v1' as const;
export const MAX_SOURCE_BYTES = 65_536;
export const IDENTIFIER = /^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$/u;
export const REVISION = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
export const SUBJECT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
export const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const KEYS = [
  'schemaVersion',
  'sourceOwnerRef',
  'sourceRegistrationId',
  'sourceRecordRef',
  'sourceRevision',
  'predecessorRevision',
  'operationId',
  'worldId',
  'authSubject',
  'expectedWorldVersion',
  'expectedBeforeSemanticFingerprint',
  'verifiedActorSubject',
  'issuer',
  'audience',
  'actorApprovalRef',
  'adminRevision',
  'adminScopeRef',
  'sourceWatermark',
  'cutoffProtocol',
  'effectiveAtReal',
  'expiresAtReal',
  'operation',
  'countryId',
  'teamId',
  'grants',
] as const;

export interface AuthorizationGrantData {
  readonly officeId: CanonicalOfficeName;
  readonly capability: string;
}
export interface UntrustedAuthorizationSourceRecord {
  readonly classification: 'UNTRUSTED_PARSED_DATA_NOT_AUTHORITY';
  readonly rawBytes: string;
  readonly sourceSha256: string;
  readonly schemaVersion: typeof AUTHORIZATION_PREPARATION_SCHEMA;
  readonly sourceOwnerRef: string;
  readonly sourceRegistrationId: string;
  readonly sourceRecordRef: string;
  readonly sourceRevision: string;
  readonly predecessorRevision: string | null;
  readonly operationId: string;
  readonly worldId: string;
  readonly authSubject: string;
  readonly expectedWorldVersion: string;
  readonly expectedBeforeSemanticFingerprint: string;
  readonly verifiedActorSubject: string;
  readonly issuer: string;
  readonly audience: string;
  readonly actorApprovalRef: string;
  readonly adminRevision: string;
  readonly adminScopeRef: string;
  readonly sourceWatermark: string;
  readonly cutoffProtocol: 'SAME_TRANSACTION_H';
  readonly effectiveAtReal: string;
  readonly expiresAtReal: string;
  readonly operation: 'REPLACE_ACTIVE_SET' | 'REVOKE';
  readonly countryId: string;
  readonly teamId: string;
  readonly grants: readonly AuthorizationGrantData[];
}
export function preparationRefusal(code: string): never {
  throw new Error(code);
}
export const sha256 = (bytes: string) =>
  'sha256:' + createHash('sha256').update(bytes, 'utf8').digest('hex');

export function canonicalVersion(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^(0|[1-9][0-9]{0,18})$/u.test(value) ||
    BigInt(value) > 9_223_372_036_854_775_807n
  )
    preparationRefusal('AUTHORIZATION_WORLD_VERSION_INVALID');
  return value;
}
export function canonicalTime(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    preparationRefusal('AUTHORIZATION_TIME_INVALID');
  return value;
}
function object(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    preparationRefusal('AUTHORIZATION_RECORD_SHAPE_INVALID');
  const actual = Object.keys(value);
  if (
    actual.length !== keys.length ||
    actual.some((key) => !keys.includes(key))
  )
    preparationRefusal('AUTHORIZATION_RECORD_KEYS_INVALID');
  return value as Record<string, unknown>;
}
export function officeCapability(
  office: string,
  capability: string,
): CanonicalOfficeName {
  if (
    !Object.hasOwn(OFFICE_DEFINITIONS, office) ||
    !(
      OFFICE_DEFINITIONS[office as CanonicalOfficeName]
        .capabilities as readonly string[]
    ).includes(capability)
  )
    preparationRefusal('AUTHORIZATION_OFFICE_CAPABILITY_INVALID');
  return office as CanonicalOfficeName;
}

/** Integrity/schema validation only. expectedSha256 is NOT source registration.
 * Canonical JSON rejects duplicate keys, whitespace/number aliases and trailing
 * bytes. No caller object, callback, positive Boolean or ADMIN resolver accepted.
 */
export function parseAuthorizationSourceBytes(
  rawBytes: unknown,
  expectedSha256: unknown,
): UntrustedAuthorizationSourceRecord {
  if (
    typeof rawBytes !== 'string' ||
    Buffer.byteLength(rawBytes, 'utf8') > MAX_SOURCE_BYTES ||
    Buffer.from(rawBytes, 'utf8').toString('utf8') !== rawBytes ||
    typeof expectedSha256 !== 'string' ||
    !DIGEST.test(expectedSha256) ||
    sha256(rawBytes) !== expectedSha256
  )
    preparationRefusal('AUTHORIZATION_SOURCE_BYTES_INVALID');
  let decoded: unknown;
  try {
    decoded = JSON.parse(rawBytes);
  } catch {
    preparationRefusal('AUTHORIZATION_SOURCE_JSON_INVALID');
  }
  if (JSON.stringify(decoded) !== rawBytes)
    preparationRefusal('AUTHORIZATION_SOURCE_NOT_CANONICAL');
  const data = object(decoded, KEYS);
  const text = (
    key: (typeof KEYS)[number],
    pattern = /^[\x21-\x7e]{1,256}$/u,
  ): string => {
    const value = data[key];
    if (typeof value !== 'string' || value.length > 256 || !pattern.test(value))
      preparationRefusal('AUTHORIZATION_RECORD_VALUE_INVALID:' + key);
    return value;
  };
  if (
    data.schemaVersion !== AUTHORIZATION_PREPARATION_SCHEMA ||
    data.cutoffProtocol !== 'SAME_TRANSACTION_H'
  )
    preparationRefusal('AUTHORIZATION_SOURCE_SCHEMA_OR_CUTOFF_UNSUPPORTED');
  const sourceRevision = text('sourceRevision', REVISION);
  const predecessorRevision =
    data.predecessorRevision === null
      ? null
      : text('predecessorRevision', REVISION);
  if (sourceRevision === predecessorRevision)
    preparationRefusal('AUTHORIZATION_SOURCE_REVISION_REUSED');
  if (data.operation !== 'REPLACE_ACTIVE_SET' && data.operation !== 'REVOKE')
    preparationRefusal('AUTHORIZATION_OPERATION_INVALID');
  if (!Array.isArray(data.grants) || data.grants.length > 18)
    preparationRefusal('AUTHORIZATION_GRANTS_INVALID');
  const grants = data.grants.map((value: unknown) => {
    const pair = object(value, ['officeId', 'capability']);
    if (
      typeof pair.officeId !== 'string' ||
      typeof pair.capability !== 'string'
    )
      preparationRefusal('AUTHORIZATION_GRANTS_INVALID');
    return Object.freeze({
      officeId: officeCapability(pair.officeId, pair.capability),
      capability: pair.capability,
    });
  });
  if (
    new Set(grants.map((g) => g.officeId + '|' + g.capability)).size !==
      grants.length ||
    (data.operation === 'REVOKE' ? grants.length !== 0 : grants.length === 0)
  )
    preparationRefusal('AUTHORIZATION_GRANTS_INVALID');
  const effectiveAtReal = canonicalTime(data.effectiveAtReal);
  const expiresAtReal = canonicalTime(data.expiresAtReal);
  if (effectiveAtReal >= expiresAtReal)
    preparationRefusal('AUTHORIZATION_EXPIRY_INVALID');
  return Object.freeze({
    classification: 'UNTRUSTED_PARSED_DATA_NOT_AUTHORITY',
    rawBytes,
    sourceSha256: expectedSha256,
    schemaVersion: AUTHORIZATION_PREPARATION_SCHEMA,
    sourceOwnerRef: text('sourceOwnerRef'),
    sourceRegistrationId: text('sourceRegistrationId'),
    sourceRecordRef: text('sourceRecordRef'),
    sourceRevision,
    predecessorRevision,
    operationId: text('operationId'),
    worldId: text('worldId', IDENTIFIER),
    authSubject: text('authSubject', SUBJECT),
    expectedWorldVersion: canonicalVersion(data.expectedWorldVersion),
    expectedBeforeSemanticFingerprint: text(
      'expectedBeforeSemanticFingerprint',
      DIGEST,
    ),
    verifiedActorSubject: text('verifiedActorSubject', SUBJECT),
    issuer: text('issuer'),
    audience: text('audience'),
    actorApprovalRef: text('actorApprovalRef'),
    adminRevision: text('adminRevision', REVISION),
    adminScopeRef: text('adminScopeRef'),
    sourceWatermark: text('sourceWatermark', REVISION),
    cutoffProtocol: 'SAME_TRANSACTION_H',
    effectiveAtReal,
    expiresAtReal,
    operation: data.operation,
    countryId: text('countryId', IDENTIFIER),
    teamId: text('teamId', IDENTIFIER),
    grants: Object.freeze(grants),
  });
}
