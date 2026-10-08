import {
  OFFICE_DECISION_RESULT_SCHEMA,
  POLITICAL_CAPITAL_BUCKETS,
  CAPTAIN_POLITICAL_CAPITAL_EVENT,
  CENTRAL_BANK_OMO_EVENT,
  SOCIAL_SERVICE_PLAN_EVENT,
  SOCIAL_JOB_MATCH_EVENT,
  Money,
  Quantity,
  SimTime,
} from '@econmind/core';
import { WorldReadFailure } from './transport.js';

type RecordValue = Record<string, unknown>;
const OFFICES = ['CAPTAIN', 'CENTRAL_BANK', 'SOCIAL', 'INDUSTRY'];
const ID = /^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u;
const HASH = /^sha256:[0-9a-f]{64}$/u;
function invalid(): never {
  throw new WorldReadFailure(
    'PROTOCOL_ERROR',
    'Classified decision result is invalid',
    false,
  );
}
function object(value: unknown, keys: readonly string[]): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const record = value as RecordValue;
  const actual = Object.keys(record);
  if (
    actual.length !== keys.length ||
    actual.some((key) => !keys.includes(key))
  )
    invalid();
  return record;
}
function text(value: unknown, pattern: RegExp): string {
  if (typeof value !== 'string' || !pattern.test(value)) invalid();
  return value;
}
function integer(value: unknown): bigint {
  const result = BigInt(text(value, /^(?:0|[1-9]\d*)$/u));
  if (result > 9_223_372_036_854_775_807n) invalid();
  return result;
}

/** Bounded wire validation only. Current signed subject/entitlement and row
 * scope must already be enforced by the actual server query/mapping boundary.
 * A DTO marker is neither admission evidence nor an authorization grant. */
export function assertDecisionResultPayload(input: {
  readonly value: unknown;
  readonly worldId: string;
  readonly countryId: string;
  readonly officeId: string | null;
  readonly worldVersion: string;
  readonly eventSequence: string;
  readonly financialDetail: unknown;
  readonly lastOfficeActivity: {
    readonly eventCount: string;
    readonly eventSequence: string;
    readonly worldVersion: string;
  };
}): void {
  const office = input.officeId;
  if (office !== null && !OFFICES.includes(office)) {
    // The sole publisher carries an explicit null for offices with no contract.
    if (input.value !== null) invalid();
    return;
  }
  const value = object(
    input.value,
    office === null
      ? [
          'schemaVersion',
          'classification',
          'countryId',
          'sourceHead',
          'status',
          'reason',
        ]
      : [
          'schemaVersion',
          'classification',
          'countryId',
          'officeId',
          'sourceHead',
          'semantics',
          'source',
          'afterState',
          'status',
          'reason',
          'businessState',
          'cause',
          'metrics',
        ],
  );
  if (
    value.schemaVersion !== OFFICE_DECISION_RESULT_SCHEMA ||
    value.classification !== (office === null ? 'COUNTRY' : 'OFFICE_PRIVATE') ||
    value.countryId !== input.countryId ||
    (office !== null && value.officeId !== office)
  )
    invalid();
  const head = object(value.sourceHead, [
    'worldId',
    'worldVersion',
    'eventSequence',
  ]);
  if (
    head.worldId !== input.worldId ||
    head.worldVersion !== input.worldVersion ||
    head.eventSequence !== input.eventSequence
  )
    invalid();
  const version = integer(head.worldVersion),
    sequence = integer(head.eventSequence);
  if (office === null) {
    if (
      value.status !== 'NOT_AUTHORIZED' ||
      value.reason !== 'OFFICE_DECISION_DETAIL_PRIVATE'
    )
      invalid();
    return;
  }
  if (
    value.semantics !== 'COMMITTED_EVENT_RESULT_NOT_CURRENT_POSITION' ||
    value.afterState !== null ||
    !Array.isArray(value.metrics)
  )
    invalid();
  if (value.status !== 'COMMITTED') {
    if (
      value.source !== null ||
      value.businessState !== null ||
      value.cause !== null ||
      value.metrics.length !== 0 ||
      !(
        (value.status === 'SOURCE_UNAVAILABLE' &&
          (office === 'INDUSTRY'
            ? value.reason === 'COMMITTED_PRODUCTION_SOURCE_UNAVAILABLE'
            : typeof value.reason === 'string' &&
              ['NO_COMMITTED_DOMAIN_RESULT', 'UNSUPPORTED_EVENT_TYPE'].includes(
                value.reason,
              ))) ||
        (value.status === 'NOT_AUTHORIZED' &&
          office === 'CENTRAL_BANK' &&
          value.reason === 'SCOPE_NOT_AUTHORIZED')
      )
    )
      invalid();
    return;
  }
  if (
    office === 'INDUSTRY' ||
    value.source !== 'COMMITTED_EVENT_RESULT' ||
    (office === 'CENTRAL_BANK' &&
      input.financialDetail !== 'AUTHORIZED_FILTERED')
  )
    invalid();
  const cause = object(value.cause, [
    'commandId',
    'commandFingerprint',
    'eventId',
    'eventFingerprint',
    'eventType',
    'eventSequence',
    'worldVersionBefore',
    'worldVersionAfter',
    'simTime',
    'planCommandId',
  ]);
  text(cause.commandId, ID);
  text(cause.eventId, ID);
  text(cause.commandFingerprint, HASH);
  text(cause.eventFingerprint, HASH);
  SimTime.fromTicks(text(cause.simTime, /^(?:0|[1-9]\d*)$/u));
  const before = integer(cause.worldVersionBefore),
    after = integer(cause.worldVersionAfter),
    eventSequence = integer(cause.eventSequence);
  if (
    after !== before + 1n ||
    after > version ||
    eventSequence === 0n ||
    eventSequence > sequence
  )
    invalid();
  const social = office === 'SOCIAL';
  const lastSequence = integer(input.lastOfficeActivity.eventSequence),
    lastVersion = integer(input.lastOfficeActivity.worldVersion);
  // System Social due commands have no human Office and are intentionally not
  // counted by the legacy per-Office activity summary. A due result may be later
  // than that summary, never earlier. Other results must match its last cause.
  const systemDue = social && cause.eventType === SOCIAL_JOB_MATCH_EVENT;
  if (
    integer(input.lastOfficeActivity.eventCount) === 0n ||
    (systemDue
      ? eventSequence < lastSequence || after < lastVersion
      : eventSequence !== lastSequence || after !== lastVersion)
  )
    invalid();
  if (social) {
    text(cause.planCommandId, ID);
    if (
      value.reason !== 'PREDECESSOR_STATE_NOT_CARRIED' ||
      !(
        (value.businessState === 'PLAN_PENDING' &&
          cause.eventType === SOCIAL_SERVICE_PLAN_EVENT &&
          cause.planCommandId === cause.commandId) ||
        (value.businessState === 'MATCH_SETTLED' &&
          cause.eventType === SOCIAL_JOB_MATCH_EVENT &&
          cause.planCommandId !== cause.commandId)
      )
    )
      invalid();
  } else if (
    value.reason !== null ||
    value.businessState !== 'APPLIED' ||
    cause.planCommandId !== null ||
    cause.eventType !==
      (office === 'CAPTAIN'
        ? CAPTAIN_POLITICAL_CAPITAL_EVENT
        : CENTRAL_BANK_OMO_EVENT)
  )
    invalid();
  const expected =
    office === 'CAPTAIN'
      ? POLITICAL_CAPITAL_BUCKETS.map((bucket) => [
          'POLITICAL_CAPITAL.' + bucket,
          'political_capital',
        ])
      : social
        ? [
            'matched',
            'remainingUnemployed',
            'remainingVacancies',
            'remainingFreeServiceSlots',
          ].map((key) => [
            'SOCIAL.' + key,
            key === 'remainingFreeServiceSlots' ? 'service_slot' : 'person',
          ])
        : [
            ['CB_GOVERNMENT_SECURITIES', null],
            ['CB_COMMERCIAL_BANK_RESERVES', null],
          ];
  if (value.metrics.length !== expected.length) invalid();
  let currency: string | null = null;
  value.metrics.forEach((raw, index) => {
    const metric = object(raw, [
      'key',
      'unit',
      'status',
      'before',
      'delta',
      'after',
      ...(social ? ['reason'] : []),
    ]);
    const [key, unit] = expected[index]!;
    if (
      metric.key !== key ||
      typeof metric.unit !== 'string' ||
      (unit !== null && metric.unit !== unit)
    )
      invalid();
    if (social) {
      if (
        metric.status !== 'AFTER_ONLY' ||
        metric.before !== null ||
        metric.delta !== null ||
        metric.reason !== 'PREDECESSOR_STATE_NOT_CARRIED'
      )
        invalid();
      text(metric.after, /^(?:0|[1-9]\d*)$/u);
    } else {
      if (
        metric.status !== 'EXACT_CHANGE' ||
        typeof metric.before !== 'string' ||
        typeof metric.delta !== 'string' ||
        typeof metric.after !== 'string'
      )
        invalid();
      const a = Quantity.from(metric.before, metric.unit),
        b = Quantity.from(metric.after, metric.unit);
      if (
        a.toCanonicalValue().amount !== metric.before ||
        b.toCanonicalValue().amount !== metric.after ||
        b.subtract(a).toCanonicalValue().amount !== metric.delta
      )
        invalid();
      if (office === 'CENTRAL_BANK') {
        Money.from(metric.before, metric.unit);
        if (currency !== null && metric.unit !== currency) invalid();
        currency = metric.unit;
      }
    }
  });
}
