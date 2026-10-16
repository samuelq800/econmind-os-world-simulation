import { CANONICAL_OFFICE_IDS, countryId } from '@econmind/core';
import type { WorldProjectionDto } from './contracts.js';
import { WorldReadFailure } from './transport.js';

const ID = /^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u;
const HASH = /^sha256:[0-9a-f]{64}$/u;
const INTEGER = /^(?:0|[1-9]\d{0,18})$/u;
const MAX_INTEGER = 9_223_372_036_854_775_807n;
function invalid(): never {
  throw new WorldReadFailure(
    'PROTOCOL_ERROR',
    'Classified feedback is unavailable or outside its persisted read context',
    false,
  );
}
function exact(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const own = Reflect.ownKeys(value);
  if (
    own.length !== keys.length ||
    own.some((key) => typeof key !== 'string' || !keys.includes(key))
  )
    invalid();
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value'))
      invalid();
  }
  return value as Record<string, unknown>;
}
function integer(value: unknown): void {
  if (
    typeof value !== 'string' ||
    !INTEGER.test(value) ||
    BigInt(value) > MAX_INTEGER
  )
    invalid();
}
function canonicalTime(value: unknown): void {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
  )
    invalid();
  try {
    if (new Date(value).toISOString() !== value) invalid();
  } catch {
    invalid();
  }
}
function unavailable(value: unknown, reason: string): void {
  const part = exact(value, ['status', 'reason', 'items']);
  if (
    part.status !== 'UNAVAILABLE' ||
    part.reason !== reason ||
    !Array.isArray(part.items) ||
    part.items.length !== 0 ||
    Reflect.ownKeys(part.items).some((key) => key !== 'length')
  )
    invalid();
}

/** Wire integrity only; never issues authority or admits a model. The actual
 * persisted executor must supply its same-subject/current-head snapshot facts.
 * The production model allowlist is empty: CURRENT and every item reject.
 */
export function assertDerivedSystemFeedbackPayload(input: {
  readonly value: unknown;
  readonly projection: WorldProjectionDto;
  readonly authority: unknown;
  readonly authSubject: string;
}): void {
  const { projection } = input;
  if (projection.classification !== 'OFFICE_PRIVATE') invalid();
  if (
    !projection.payload ||
    typeof projection.payload !== 'object' ||
    Array.isArray(projection.payload)
  )
    invalid();
  const parent = projection.payload as Record<string, unknown>;
  if (typeof parent.countryId !== 'string') invalid();
  let country: string;
  try {
    country = countryId(parent.countryId);
  } catch {
    invalid();
  }
  if (
    typeof parent.officeId !== 'string' ||
    !CANONICAL_OFFICE_IDS.some((office) => office === parent.officeId)
  )
    invalid();
  const scopeKey = `OFFICE_${Buffer.from(country, 'utf8').toString('hex').toUpperCase()}_${Buffer.from(parent.officeId, 'utf8').toString('hex').toUpperCase()}`;
  if (projection.scopeKey !== scopeKey) invalid();
  const feedback = exact(input.value, [
    'schemaVersion',
    'classification',
    'scopeKey',
    'countryId',
    'officeId',
    'sourceHead',
    'generatedAt',
    'citizen',
    'government',
  ]);
  if (
    feedback.schemaVersion !== 'derived-system-feedback-v1' ||
    feedback.classification !== 'OFFICE_PRIVATE' ||
    feedback.scopeKey !== scopeKey ||
    feedback.countryId !== country ||
    feedback.officeId !== parent.officeId ||
    feedback.generatedAt !== projection.watermark.generatedAt
  )
    invalid();
  canonicalTime(feedback.generatedAt);
  const head = exact(feedback.sourceHead, [
    'worldId',
    'worldVersion',
    'eventSequence',
  ]);
  integer(head.worldVersion);
  integer(head.eventSequence);
  if (
    head.worldId !== projection.worldId ||
    head.worldVersion !== projection.watermark.worldVersion ||
    head.eventSequence !== projection.watermark.eventSequence
  )
    invalid();
  unavailable(feedback.citizen, 'MODEL_NOT_ADMITTED');
  unavailable(feedback.government, 'DISCLOSURE_UNAVAILABLE');
  const authority = exact(input.authority, [
    'authSubject',
    'worldId',
    'classification',
    'scopeKey',
    'seedRef',
    'contentHash',
    'worldVersion',
    'eventSequence',
  ]);
  if (
    authority.authSubject !== input.authSubject ||
    authority.worldId !== projection.worldId ||
    authority.classification !== projection.classification ||
    authority.scopeKey !== scopeKey ||
    authority.worldVersion !== head.worldVersion ||
    authority.eventSequence !== head.eventSequence ||
    typeof authority.seedRef !== 'string' ||
    !ID.test(authority.seedRef) ||
    typeof authority.contentHash !== 'string' ||
    !HASH.test(authority.contentHash)
  )
    invalid();
}
