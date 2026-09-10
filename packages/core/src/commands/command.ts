import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import {
  actorId,
  authSubject,
  commandId,
  commandType,
  correlationId,
  countryId,
  idempotencyKey,
  officeId,
  worldId,
  type ActorId,
  type AuthSubject,
  type CommandId,
  type CommandType,
  type CorrelationId,
  type CountryId,
  type IdempotencyKey,
  type OfficeId,
  type WorldId,
} from '../ids.js';
import { SimTime } from '../numeric/sim-time.js';
import {
  canonicalHashInput,
  canonicalSerialize,
} from '../serialization/canonical.js';

export const COMMAND_SCHEMA_VERSION = 'command-v1' as const;
export type CommandSchemaVersion = typeof COMMAND_SCHEMA_VERSION;
export type CanonicalSha256 = `sha256:${string}`;
export type Sha256Hex = (preimage: string) => string;

const CANONICAL_INTEGER = /^(?:0|[1-9]\d*)$/u;
const SHA256_HEX = /^[0-9a-f]{64}$/u;
const RFC3339_MILLISECONDS =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const COMMAND_FIELDS = Object.freeze([
  'actorId',
  'authSubject',
  'commandId',
  'commandType',
  'correlationId',
  'countryId',
  'expectedWorldVersion',
  'idempotencyKey',
  'officeId',
  'payload',
  'schemaVersion',
  'simTime',
  'submittedAtReal',
  'worldId',
]);

export interface CanonicalCommand {
  readonly actorId: ActorId;
  readonly authSubject: AuthSubject;
  readonly commandId: CommandId;
  readonly commandType: CommandType;
  readonly correlationId: CorrelationId;
  readonly countryId: CountryId;
  readonly expectedWorldVersion: string | null;
  readonly fingerprint: CanonicalSha256;
  readonly idempotencyKey: IdempotencyKey | null;
  readonly officeId: OfficeId | null;
  readonly canonicalPayload: string;
  readonly payloadHash: CanonicalSha256;
  readonly schemaVersion: CommandSchemaVersion;
  readonly simTime: SimTime;
  readonly submittedAtReal: string;
  readonly worldId: WorldId;
}

export interface DurableCommandIdentity {
  readonly commandId: CommandId;
  readonly fingerprint: CanonicalSha256;
  readonly idempotencyKey: IdempotencyKey | null;
  readonly worldId: WorldId;
}

export type CommandIdentityDecision =
  | Readonly<{ kind: 'NEW' }>
  | Readonly<{
      kind: 'EXACT_DUPLICATE';
      originalCommandId: CommandId;
      fingerprint: CanonicalSha256;
    }>;

function invalid(message: string): never {
  throw new DomainError(DOMAIN_ERROR_CODES.COMMAND_SCHEMA_INVALID, message);
}

function inertRecord(input: unknown): Record<string, unknown> {
  const canonical = canonicalSerialize(input);
  const parsed: unknown = JSON.parse(canonical);
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
    invalid('Command must be an inert canonical record');
  }
  const keys = Object.keys(parsed).sort();
  if (
    keys.length !== COMMAND_FIELDS.length ||
    keys.some((key) => !COMMAND_FIELDS.includes(key))
  ) {
    invalid('Command contains missing or unknown fields');
  }
  return parsed as Record<string, unknown>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    invalid(`${label} must be a non-empty string`);
  }
  return value;
}

function nullableString(value: unknown, label: string): string | null {
  return value === null ? null : requiredString(value, label);
}

function canonicalWorldVersion(value: unknown): string | null {
  if (value === null) return null;
  const rendered = requiredString(value, 'expectedWorldVersion');
  if (!CANONICAL_INTEGER.test(rendered)) {
    invalid('expectedWorldVersion must be a canonical non-negative integer');
  }
  return rendered;
}

function canonicalRealTimestamp(value: unknown): string {
  const rendered = requiredString(value, 'submittedAtReal');
  if (!RFC3339_MILLISECONDS.test(rendered)) {
    invalid('submittedAtReal must be canonical RFC3339 UTC milliseconds');
  }
  return rendered;
}

export function canonicalSha256(
  preimage: string,
  sha256Hex: Sha256Hex,
): CanonicalSha256 {
  const digest = sha256Hex(preimage);
  if (!SHA256_HEX.test(digest)) {
    invalid('SHA-256 adapter must return 64 lowercase hexadecimal characters');
  }
  return `sha256:${digest}`;
}

export function parseCanonicalCommand(
  input: unknown,
  sha256Hex: Sha256Hex,
): CanonicalCommand {
  const record = inertRecord(input);
  if (record.schemaVersion !== COMMAND_SCHEMA_VERSION) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.VERSION_MISMATCH,
      'Unsupported Command schema version',
    );
  }
  const canonicalPayload = canonicalSerialize(record.payload);
  const canonicalCommandId = commandId(
    requiredString(record.commandId, 'commandId'),
  );
  const canonicalIdempotencyKey = nullableString(
    record.idempotencyKey,
    'idempotencyKey',
  );
  const canonicalSimTime = SimTime.fromTicks(
    requiredString(record.simTime, 'simTime'),
  );
  const intent = Object.freeze({
    actorId: actorId(requiredString(record.actorId, 'actorId')),
    authSubject: authSubject(requiredString(record.authSubject, 'authSubject')),
    commandId: canonicalCommandId,
    commandType: commandType(requiredString(record.commandType, 'commandType')),
    correlationId: correlationId(
      requiredString(record.correlationId, 'correlationId'),
    ),
    countryId: countryId(requiredString(record.countryId, 'countryId')),
    expectedWorldVersion: canonicalWorldVersion(record.expectedWorldVersion),
    idempotencyKey:
      canonicalIdempotencyKey === null
        ? null
        : idempotencyKey(canonicalIdempotencyKey),
    officeId:
      record.officeId === null
        ? null
        : officeId(requiredString(record.officeId, 'officeId')),
    canonicalPayload,
    schemaVersion: COMMAND_SCHEMA_VERSION,
    simTime: canonicalSimTime,
    worldId: worldId(requiredString(record.worldId, 'worldId')),
  });
  return Object.freeze({
    ...intent,
    fingerprint: canonicalSha256(canonicalHashInput(intent), sha256Hex),
    payloadHash: canonicalSha256(canonicalHashInput(record.payload), sha256Hex),
    submittedAtReal: canonicalRealTimestamp(record.submittedAtReal),
  });
}

export function classifyCommandIdentity(
  durableRecords: readonly DurableCommandIdentity[],
  incoming: CanonicalCommand,
): CommandIdentityDecision {
  const matches = durableRecords.filter(
    (record) =>
      record.worldId === incoming.worldId &&
      (record.commandId === incoming.commandId ||
        (incoming.idempotencyKey !== null &&
          record.idempotencyKey === incoming.idempotencyKey)),
  );
  if (matches.some((record) => record.fingerprint !== incoming.fingerprint)) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.IDEMPOTENCY_CONFLICT,
      'Command identity is already bound to a different canonical fingerprint',
    );
  }
  const original = matches[0];
  return original === undefined
    ? Object.freeze({ kind: 'NEW' })
    : Object.freeze({
        kind: 'EXACT_DUPLICATE',
        originalCommandId: original.commandId,
        fingerprint: original.fingerprint,
      });
}
