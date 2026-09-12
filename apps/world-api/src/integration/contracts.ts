export const WORLD_READ_API_SCHEMA_VERSION = 'world-read-api-v1' as const;
export const WORLD_PROJECTION_SCHEMA_VERSION =
  'world-projection-read-v1' as const;
export const MAX_WORLD_READ_REQUEST_BYTES = 16 * 1024;

export type JsonPrimitive = boolean | null | number | string;
export type JsonValue =
  JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export type ProjectionClassification =
  'PUBLIC' | 'COUNTRY' | 'OFFICE_PRIVATE' | 'NEGOTIATION_PARTY' | 'ADMIN';

export type WorldReadErrorCode =
  | 'OFFLINE'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'AUTHENTICATION_REQUIRED'
  | 'AUTHENTICATION_INVALID'
  | 'AUTHORIZATION_DENIED'
  | 'NOT_FOUND'
  | 'STALE_PROJECTION'
  | 'RATE_LIMITED'
  | 'UPSTREAM_UNAVAILABLE'
  | 'PROTOCOL_ERROR'
  | 'UNKNOWN';

export interface WorldProjectionRequest {
  readonly worldId: string;
  readonly classification: ProjectionClassification;
  readonly scopeKey: string;
}

export interface WorldReadRequestEnvelope {
  readonly schemaVersion: typeof WORLD_READ_API_SCHEMA_VERSION;
  readonly requestId: string;
  readonly operation: 'READ_WORLD_PROJECTION';
  readonly payload: WorldProjectionRequest;
}

export interface ProjectionWatermarkDto {
  readonly worldVersion: string;
  readonly eventSequence: string;
  readonly generatedAt: string;
}

export interface ProjectionReceiptDto {
  readonly commandId: string;
  readonly outcome: 'COMMITTED' | 'REJECTED' | 'AUTHORIZATION_REVOKED';
  readonly reasonCode: string | null;
  readonly worldVersionAfter: string | null;
  readonly eventIds: readonly string[];
  readonly recordedAtReal: string;
}

export interface ProjectionEventDto {
  readonly eventId: string;
  readonly sequence: string;
  readonly worldVersion: string;
  readonly eventType: string;
  readonly recordedAtReal: string;
}

export interface WorldProjectionDto {
  readonly schemaVersion: typeof WORLD_PROJECTION_SCHEMA_VERSION;
  readonly worldId: string;
  readonly classification: ProjectionClassification;
  readonly scopeKey: string;
  readonly watermark: ProjectionWatermarkDto;
  readonly payload: JsonValue;
  readonly receipts: readonly ProjectionReceiptDto[];
  readonly events: readonly ProjectionEventDto[];
}

export interface WorldReadErrorDto {
  readonly code: WorldReadErrorCode;
  readonly message: string;
  readonly retryable: boolean;
}

export type WorldReadResponseEnvelope =
  | {
      readonly schemaVersion: typeof WORLD_READ_API_SCHEMA_VERSION;
      readonly requestId: string;
      readonly ok: true;
      readonly data: WorldProjectionDto;
    }
  | {
      readonly schemaVersion: typeof WORLD_READ_API_SCHEMA_VERSION;
      readonly requestId: string;
      readonly ok: false;
      readonly error: WorldReadErrorDto;
    };

const CANONICAL_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const CANONICAL_ID = /^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u;
const NON_NEGATIVE_INTEGER = /^(?:0|[1-9]\d*)$/u;
const POSITIVE_INTEGER = /^[1-9]\d*$/u;
const REASON_CODE = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/u;
const RFC3339_MILLISECONDS =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;

const CLASSIFICATIONS = new Set<ProjectionClassification>([
  'PUBLIC',
  'COUNTRY',
  'OFFICE_PRIVATE',
  'NEGOTIATION_PARTY',
  'ADMIN',
]);
const ERROR_CODES = new Set<WorldReadErrorCode>([
  'OFFLINE',
  'TIMEOUT',
  'CANCELLED',
  'AUTHENTICATION_REQUIRED',
  'AUTHENTICATION_INVALID',
  'AUTHORIZATION_DENIED',
  'NOT_FOUND',
  'STALE_PROJECTION',
  'RATE_LIMITED',
  'UPSTREAM_UNAVAILABLE',
  'PROTOCOL_ERROR',
  'UNKNOWN',
]);

function invalid(message: string): never {
  throw new Error(`WORLD_READ_PROTOCOL_INVALID: ${message}`);
}

function assertBoundedJson(value: unknown, limit: number, label: string): void {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    invalid(`${label} is not JSON`);
  }
  if (serialized === undefined || Buffer.byteLength(serialized) > limit) {
    invalid(`${label} exceeds the byte limit`);
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    invalid(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
) {
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (
    actual.length !== required.length ||
    actual.some((key, index) => key !== required[index])
  ) {
    invalid(`${label} contains missing or unknown fields`);
  }
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    invalid(`${label} must be a non-empty string`);
  }
  return value;
}

function canonicalId(value: unknown, label: string): string {
  const rendered = string(value, label);
  if (!CANONICAL_ID.test(rendered)) invalid(`${label} is not canonical`);
  return rendered;
}

function integerString(
  value: unknown,
  label: string,
  positive: boolean,
): string {
  const rendered = string(value, label);
  const pattern = positive ? POSITIVE_INTEGER : NON_NEGATIVE_INTEGER;
  if (!pattern.test(rendered)) invalid(`${label} is not a canonical integer`);
  return rendered;
}

function timestamp(value: unknown, label: string): string {
  const rendered = string(value, label);
  if (!RFC3339_MILLISECONDS.test(rendered)) {
    invalid(`${label} must be canonical RFC3339 UTC milliseconds`);
  }
  return rendered;
}

function classification(value: unknown): ProjectionClassification {
  if (
    typeof value !== 'string' ||
    !CLASSIFICATIONS.has(value as ProjectionClassification)
  ) {
    invalid('classification is unsupported');
  }
  return value as ProjectionClassification;
}

function jsonValue(value: unknown, label: string): JsonValue {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) invalid(`${label} is not JSON`);
    return JSON.parse(serialized) as JsonValue;
  } catch {
    invalid(`${label} is not JSON`);
  }
}

export function createWorldReadRequest(input: {
  readonly requestId: string;
  readonly worldId: string;
  readonly classification: ProjectionClassification;
  readonly scopeKey: string;
}): WorldReadRequestEnvelope {
  if (!CANONICAL_UUID.test(input.requestId)) {
    invalid('requestId must be a canonical UUID');
  }
  return Object.freeze({
    schemaVersion: WORLD_READ_API_SCHEMA_VERSION,
    requestId: input.requestId,
    operation: 'READ_WORLD_PROJECTION',
    payload: Object.freeze({
      worldId: canonicalId(input.worldId, 'worldId'),
      classification: classification(input.classification),
      scopeKey: canonicalId(input.scopeKey, 'scopeKey'),
    }),
  });
}

/** Parses untrusted server-request input before it reaches a read adapter. */
export function parseWorldReadRequest(
  value: unknown,
): WorldReadRequestEnvelope {
  assertBoundedJson(value, MAX_WORLD_READ_REQUEST_BYTES, 'request');
  const input = record(value, 'request');
  exactKeys(
    input,
    ['schemaVersion', 'requestId', 'operation', 'payload'],
    'request',
  );
  if (
    input.schemaVersion !== WORLD_READ_API_SCHEMA_VERSION ||
    input.operation !== 'READ_WORLD_PROJECTION'
  ) {
    invalid('request operation is unsupported');
  }
  const payload = record(input.payload, 'request payload');
  exactKeys(
    payload,
    ['worldId', 'classification', 'scopeKey'],
    'request payload',
  );
  return createWorldReadRequest({
    requestId: string(input.requestId, 'requestId'),
    worldId: string(payload.worldId, 'worldId'),
    classification: classification(payload.classification),
    scopeKey: string(payload.scopeKey, 'scopeKey'),
  });
}

function parseWatermark(value: unknown): ProjectionWatermarkDto {
  const input = record(value, 'watermark');
  exactKeys(
    input,
    ['worldVersion', 'eventSequence', 'generatedAt'],
    'watermark',
  );
  return Object.freeze({
    worldVersion: integerString(input.worldVersion, 'worldVersion', false),
    eventSequence: integerString(input.eventSequence, 'eventSequence', false),
    generatedAt: timestamp(input.generatedAt, 'generatedAt'),
  });
}

function parseReceipt(value: unknown): ProjectionReceiptDto {
  const input = record(value, 'receipt');
  exactKeys(
    input,
    [
      'commandId',
      'outcome',
      'reasonCode',
      'worldVersionAfter',
      'eventIds',
      'recordedAtReal',
    ],
    'receipt',
  );
  if (
    input.outcome !== 'COMMITTED' &&
    input.outcome !== 'REJECTED' &&
    input.outcome !== 'AUTHORIZATION_REVOKED'
  ) {
    invalid('receipt outcome is unsupported');
  }
  if (!Array.isArray(input.eventIds) || input.eventIds.length > 1_000) {
    invalid('receipt eventIds must be a bounded array');
  }
  const committed = input.outcome === 'COMMITTED';
  if (
    (committed && input.eventIds.length === 0) ||
    (!committed && input.eventIds.length !== 0)
  ) {
    invalid('receipt eventIds do not match outcome');
  }
  const reasonCode =
    input.reasonCode === null ? null : string(input.reasonCode, 'reasonCode');
  if (
    (committed && reasonCode !== null) ||
    (!committed && reasonCode === null)
  ) {
    invalid('receipt reasonCode does not match outcome');
  }
  if (reasonCode !== null && !REASON_CODE.test(reasonCode)) {
    invalid('receipt reasonCode is not canonical');
  }
  const worldVersionAfter =
    input.worldVersionAfter === null
      ? null
      : integerString(input.worldVersionAfter, 'worldVersionAfter', true);
  if (
    (committed && worldVersionAfter === null) ||
    (!committed && worldVersionAfter !== null)
  ) {
    invalid('receipt worldVersionAfter does not match outcome');
  }
  return Object.freeze({
    commandId: canonicalId(input.commandId, 'commandId'),
    outcome: input.outcome,
    reasonCode,
    worldVersionAfter,
    eventIds: Object.freeze(
      input.eventIds.map((eventId) => canonicalId(eventId, 'eventId')),
    ),
    recordedAtReal: timestamp(input.recordedAtReal, 'recordedAtReal'),
  });
}

function parseEvent(value: unknown): ProjectionEventDto {
  const input = record(value, 'event');
  exactKeys(
    input,
    ['eventId', 'sequence', 'worldVersion', 'eventType', 'recordedAtReal'],
    'event',
  );
  return Object.freeze({
    eventId: canonicalId(input.eventId, 'eventId'),
    sequence: integerString(input.sequence, 'sequence', true),
    worldVersion: integerString(input.worldVersion, 'worldVersion', true),
    eventType: canonicalId(input.eventType, 'eventType'),
    recordedAtReal: timestamp(input.recordedAtReal, 'recordedAtReal'),
  });
}

export function parseWorldProjectionDto(value: unknown): WorldProjectionDto {
  const input = record(value, 'projection');
  exactKeys(
    input,
    [
      'schemaVersion',
      'worldId',
      'classification',
      'scopeKey',
      'watermark',
      'payload',
      'receipts',
      'events',
    ],
    'projection',
  );
  if (input.schemaVersion !== WORLD_PROJECTION_SCHEMA_VERSION) {
    invalid('projection schemaVersion is unsupported');
  }
  if (!Array.isArray(input.receipts) || input.receipts.length > 1_000) {
    invalid('receipts must be a bounded array');
  }
  if (!Array.isArray(input.events) || input.events.length > 1_000) {
    invalid('events must be a bounded array');
  }
  return Object.freeze({
    schemaVersion: WORLD_PROJECTION_SCHEMA_VERSION,
    worldId: canonicalId(input.worldId, 'worldId'),
    classification: classification(input.classification),
    scopeKey: canonicalId(input.scopeKey, 'scopeKey'),
    watermark: parseWatermark(input.watermark),
    payload: jsonValue(input.payload, 'payload'),
    receipts: Object.freeze(input.receipts.map(parseReceipt)),
    events: Object.freeze(input.events.map(parseEvent)),
  });
}

export function parseWorldReadResponse(
  value: unknown,
): WorldReadResponseEnvelope {
  const input = record(value, 'response');
  if (input.schemaVersion !== WORLD_READ_API_SCHEMA_VERSION) {
    invalid('response schemaVersion is unsupported');
  }
  const requestId = string(input.requestId, 'requestId');
  if (!CANONICAL_UUID.test(requestId)) {
    invalid('response requestId must be a canonical UUID');
  }
  if (input.ok === true) {
    exactKeys(input, ['schemaVersion', 'requestId', 'ok', 'data'], 'response');
    return Object.freeze({
      schemaVersion: WORLD_READ_API_SCHEMA_VERSION,
      requestId,
      ok: true,
      data: parseWorldProjectionDto(input.data),
    });
  }
  if (input.ok !== false) invalid('response ok must be boolean');
  exactKeys(input, ['schemaVersion', 'requestId', 'ok', 'error'], 'response');
  const error = record(input.error, 'error');
  exactKeys(error, ['code', 'message', 'retryable'], 'error');
  if (
    typeof error.code !== 'string' ||
    !ERROR_CODES.has(error.code as WorldReadErrorCode)
  ) {
    invalid('error code is unsupported');
  }
  if (typeof error.retryable !== 'boolean') {
    invalid('error retryable must be boolean');
  }
  return Object.freeze({
    schemaVersion: WORLD_READ_API_SCHEMA_VERSION,
    requestId,
    ok: false,
    error: Object.freeze({
      code: error.code as WorldReadErrorCode,
      message: string(error.message, 'error message'),
      retryable: error.retryable,
    }),
  });
}
