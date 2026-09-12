import {
  canonicalSha256,
  type CanonicalSha256,
  type Sha256Hex,
} from '../commands/command.js';
import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import {
  commandId,
  correlationId,
  eventId,
  eventType,
  worldId,
  type CommandId,
  type CorrelationId,
  type EventId,
  type EventType,
  type WorldId,
} from '../ids.js';
import { isSimTime, SimTime } from '../numeric/sim-time.js';
import {
  canonicalHashInput,
  canonicalSerialize,
} from '../serialization/canonical.js';

export const EVENT_SCHEMA_VERSION = 'event-v1' as const;
export type EventSchemaVersion = typeof EVENT_SCHEMA_VERSION;

const POSITIVE_INTEGER = /^[1-9]\d*$/u;
const RFC3339_MILLISECONDS =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const EVENT_FIELDS = Object.freeze([
  'causationCommandId',
  'correlationId',
  'correctsEventId',
  'eventId',
  'eventType',
  'payload',
  'recordedAtReal',
  'schemaVersion',
  'sequence',
  'simTime',
  'worldId',
  'worldVersion',
]);

export interface AuthoritativeEvent {
  readonly causationCommandId: CommandId;
  readonly correlationId: CorrelationId;
  readonly correctsEventId: EventId | null;
  readonly eventId: EventId;
  readonly eventType: EventType;
  readonly fingerprint: CanonicalSha256;
  readonly canonicalPayload: string;
  readonly payloadHash: CanonicalSha256;
  readonly recordedAtReal: string;
  readonly schemaVersion: EventSchemaVersion;
  readonly sequence: string;
  readonly simTime: SimTime;
  readonly worldId: WorldId;
  readonly worldVersion: string;
}

export interface EventLedgerTail {
  readonly lastSequence: string;
  readonly worldId: WorldId;
}

function invalid(message: string): never {
  throw new DomainError(DOMAIN_ERROR_CODES.EVENT_SCHEMA_INVALID, message);
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    invalid(`${label} must be a non-empty string`);
  }
  return value;
}

function positiveInteger(value: unknown, label: string): string {
  const rendered = requiredString(value, label);
  if (!POSITIVE_INTEGER.test(rendered)) {
    invalid(`${label} must be a canonical positive integer`);
  }
  return rendered;
}

function canonicalRealTimestamp(value: unknown): string {
  const rendered = requiredString(value, 'recordedAtReal');
  if (!RFC3339_MILLISECONDS.test(rendered)) {
    invalid('recordedAtReal must be canonical RFC3339 UTC milliseconds');
  }
  return rendered;
}

function inertRecord(input: unknown): Record<string, unknown> {
  const canonical = canonicalSerialize(input);
  const parsed: unknown = JSON.parse(canonical);
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
    invalid('Event must be an inert canonical record');
  }
  const keys = Object.keys(parsed).sort();
  if (
    keys.length !== EVENT_FIELDS.length ||
    keys.some((key) => !EVENT_FIELDS.includes(key))
  ) {
    invalid('Event contains missing or unknown fields');
  }
  return parsed as Record<string, unknown>;
}

export function parseAuthoritativeEvent(
  input: unknown,
  sha256Hex: Sha256Hex,
): AuthoritativeEvent {
  const record = inertRecord(input);
  if (record.schemaVersion !== EVENT_SCHEMA_VERSION) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.VERSION_MISMATCH,
      'Unsupported Event schema version',
    );
  }
  const canonicalPayload = canonicalSerialize(record.payload);
  const intent = Object.freeze({
    causationCommandId: commandId(
      requiredString(record.causationCommandId, 'causationCommandId'),
    ),
    correlationId: correlationId(
      requiredString(record.correlationId, 'correlationId'),
    ),
    correctsEventId:
      record.correctsEventId === null
        ? null
        : eventId(requiredString(record.correctsEventId, 'correctsEventId')),
    eventId: eventId(requiredString(record.eventId, 'eventId')),
    eventType: eventType(requiredString(record.eventType, 'eventType')),
    canonicalPayload,
    schemaVersion: EVENT_SCHEMA_VERSION,
    sequence: positiveInteger(record.sequence, 'sequence'),
    simTime: SimTime.fromTicks(requiredString(record.simTime, 'simTime')),
    worldId: worldId(requiredString(record.worldId, 'worldId')),
    worldVersion: positiveInteger(record.worldVersion, 'worldVersion'),
  });
  return Object.freeze({
    ...intent,
    fingerprint: canonicalSha256(canonicalHashInput(intent), sha256Hex),
    payloadHash: canonicalSha256(canonicalHashInput(record.payload), sha256Hex),
    recordedAtReal: canonicalRealTimestamp(record.recordedAtReal),
  });
}

export function validateAuthoritativeEvent(
  input: AuthoritativeEvent,
  sha256Hex: Sha256Hex,
): Readonly<AuthoritativeEvent> {
  let payload: unknown;
  try {
    payload = JSON.parse(input.canonicalPayload);
  } catch {
    invalid('Event canonical payload must be valid JSON');
  }
  if (canonicalSerialize(payload) !== input.canonicalPayload) {
    invalid('Event canonical payload is not canonical');
  }
  const parsed = parseAuthoritativeEvent(
    {
      causationCommandId: input.causationCommandId,
      correlationId: input.correlationId,
      correctsEventId: input.correctsEventId,
      eventId: input.eventId,
      eventType: input.eventType,
      payload,
      recordedAtReal: input.recordedAtReal,
      schemaVersion: input.schemaVersion,
      sequence: input.sequence,
      simTime: isSimTime(input.simTime)
        ? input.simTime.toCanonicalValue()
        : input.simTime,
      worldId: input.worldId,
      worldVersion: input.worldVersion,
    },
    sha256Hex,
  );
  if (canonicalSerialize(parsed) !== canonicalSerialize(input)) {
    invalid('Event evidence does not match its canonical fingerprints');
  }
  return parsed;
}

export function validateAppendOnlyEventBatch(
  tail: EventLedgerTail,
  additions: readonly AuthoritativeEvent[],
): readonly AuthoritativeEvent[] {
  let expected = BigInt(tail.lastSequence) + 1n;
  for (const event of additions) {
    if (event.worldId !== tail.worldId || BigInt(event.sequence) !== expected) {
      throw new DomainError(
        DOMAIN_ERROR_CODES.EVENT_APPEND_CONFLICT,
        'Event append must preserve one World and contiguous authoritative sequence',
      );
    }
    expected += 1n;
  }
  return Object.freeze([...additions]);
}
