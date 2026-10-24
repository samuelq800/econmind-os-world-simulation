import {
  OFFICE_DECISION_RESULT_SCHEMA,
  POLITICAL_CAPITAL_BUCKETS,
  CAPTAIN_POLITICAL_CAPITAL_EVENT,
  CENTRAL_BANK_OMO_EVENT,
  SOCIAL_SERVICE_PLAN_EVENT,
  SOCIAL_JOB_MATCH_EVENT,
  WORLD_DECIMAL_OPERAND_MAX_DIGITS,
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
  readonly activitySchema?: unknown;
  readonly economicVisibilitySchema?: unknown;
  readonly industryProductionResult?: unknown;
  readonly lastOfficeActivity: {
    readonly eventCount: string;
    readonly eventSequence: string;
    readonly worldVersion: string;
  };
}): void {
  const office = input.officeId;
  const industryV2 =
    office === 'INDUSTRY' &&
    input.activitySchema === 'world-activity-projection-v2' &&
    input.economicVisibilitySchema === 'economic-read-visibility-v2';
  if (
    (input.activitySchema !== undefined ||
      input.economicVisibilitySchema !== undefined) &&
    !industryV2 &&
    (input.activitySchema !== 'world-activity-projection-v1' ||
      input.economicVisibilitySchema !== 'economic-read-visibility-v1')
  )
    invalid();
  if (!industryV2 && input.industryProductionResult !== undefined) invalid();
  let disclosure: RecordValue | null = null;
  if (industryV2) {
    if (input.financialDetail !== 'NOT_AUTHORIZED') invalid();
    const raw = input.industryProductionResult;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) invalid();
    disclosure = object(
      raw,
      (raw as RecordValue).status === 'NOT_AUTHORIZED'
        ? ['status']
        : ['status', 'purpose', 'sourceHead', 'causeBinding'],
    );
    if (disclosure.status !== 'NOT_AUTHORIZED') {
      if (
        disclosure.status !== 'AUTHORIZED_RESULT_ONLY' ||
        disclosure.purpose !== 'INDUSTRY_COMMITTED_PRODUCTION_OUTPUT_AFTER_ONLY'
      )
        invalid();
      const h = object(disclosure.sourceHead, [
        'worldId',
        'worldVersion',
        'eventSequence',
      ]);
      if (
        h.worldId !== input.worldId ||
        h.worldVersion !== input.worldVersion ||
        h.eventSequence !== input.eventSequence
      )
        invalid();
      text(h.worldId, ID);
      integer(h.worldVersion);
      integer(h.eventSequence);
      const binding = object(disclosure.causeBinding, [
        'commandId',
        'commandFingerprint',
        'eventId',
        'eventFingerprint',
      ]);
      text(binding.commandId, ID);
      text(binding.eventId, ID);
      text(binding.commandFingerprint, HASH);
      text(binding.eventFingerprint, HASH);
    }
  }
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
    if (industryV2 && disclosure?.status !== 'NOT_AUTHORIZED') invalid();
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
          (office === 'CENTRAL_BANK' || industryV2) &&
          value.reason === 'SCOPE_NOT_AUTHORIZED')
      )
    )
      invalid();
    return;
  }
  if (
    (office === 'INDUSTRY' && !industryV2) ||
    (industryV2 && disclosure?.status !== 'AUTHORIZED_RESULT_ONLY') ||
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
  if (industryV2) {
    const binding = object(disclosure!.causeBinding, [
      'commandId',
      'commandFingerprint',
      'eventId',
      'eventFingerprint',
    ]);
    for (const key of Object.keys(binding))
      if (binding[key] !== cause[key]) invalid();
  }
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
        : industryV2
          ? 'INDUSTRY_PRODUCTION_SETTLED'
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
        : industryV2
          ? [['PRODUCTION_OUTPUT', 'tonne']]
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
      ...(social || industryV2 ? ['reason'] : []),
    ]);
    const [key, unit] = expected[index]!;
    if (
      metric.key !== key ||
      typeof metric.unit !== 'string' ||
      (unit !== null && metric.unit !== unit)
    )
      invalid();
    if (social || industryV2) {
      if (
        metric.status !== 'AFTER_ONLY' ||
        metric.before !== null ||
        metric.delta !== null ||
        metric.reason !== 'PREDECESSOR_STATE_NOT_CARRIED'
      )
        invalid();
      if (industryV2) {
        const amount = text(metric.after, /^(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/u);
        if (
          amount === '0' ||
          amount.replace('.', '').length > WORLD_DECIMAL_OPERAND_MAX_DIGITS
        )
          invalid();
      } else text(metric.after, /^(?:0|[1-9]\d*)$/u);
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
