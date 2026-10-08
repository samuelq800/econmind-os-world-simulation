import type { OfficeDecisionResult } from '@econmind/core';
import {
  canonicalId,
  hash,
  row,
  version,
} from '../production-read/contract.js';

// Type-checked wire literals only: do not load Core's server-oriented barrel,
// event parsers or economic kernels into the browser just to validate a DTO.
const OFFICE_DECISION_RESULT_SCHEMA: OfficeDecisionResult['schemaVersion'] =
  'office-decision-results-v1';
const POLITICAL_CAPITAL_BUCKETS: typeof import('@econmind/core').POLITICAL_CAPITAL_BUCKETS =
  [
    'FISCAL_REFORM',
    'INDUSTRIAL_STRATEGY',
    'TRADE_NEGOTIATIONS',
    'SOCIAL_REFORM_PROTECTION',
    'STRATEGIC_PROJECT_SUPPORT',
    'CRISIS_RESPONSE',
    'UNALLOCATED_CRISIS_RESERVE',
  ];
const CAPTAIN_POLITICAL_CAPITAL_EVENT: typeof import('@econmind/core').CAPTAIN_POLITICAL_CAPITAL_EVENT =
  'CAPTAIN_POLITICAL_CAPITAL_ALLOCATED_V1';
const CENTRAL_BANK_OMO_EVENT: typeof import('@econmind/core').CENTRAL_BANK_OMO_EVENT =
  'CENTRAL_BANK_OMO_SETTLED_V1';
const SOCIAL_SERVICE_PLAN_EVENT: typeof import('@econmind/core').SOCIAL_SERVICE_PLAN_EVENT =
  'SOCIAL_EMPLOYMENT_SERVICE_PLANNED_V1';
const SOCIAL_JOB_MATCH_EVENT: typeof import('@econmind/core').SOCIAL_JOB_MATCH_EVENT =
  'SOCIAL_JOB_MATCH_SETTLED_V1';
const MAX_DECIMAL_DIGITS: typeof import('@econmind/core').WORLD_DECIMAL_OPERAND_MAX_DIGITS = 120;

/** Presentation only. A server result never grants a seat or a command port. */
export interface DecisionResultView {
  readonly availability:
    'COMMITTED' | 'PARTIAL' | 'NOT_AUTHORIZED' | 'UNAVAILABLE';
  readonly reason: string | null;
  readonly result: OfficeDecisionResult | null;
}
interface ResultPins {
  readonly worldId: string;
  readonly countryId: string;
  readonly officeId: string;
  readonly classification: string;
  readonly worldVersion: string;
  readonly eventSequence: string;
  readonly financialDetail: unknown;
  readonly activity: {
    readonly eventCount: string;
    readonly eventSequence: string;
    readonly worldVersion: string;
  };
}
const absent = (
  availability: 'NOT_AUTHORIZED' | 'UNAVAILABLE',
  reason: string,
): DecisionResultView => Object.freeze({ availability, reason, result: null });
const exact = (value: unknown, keys: readonly string[]) => {
  const object = row(value);
  if (
    !object ||
    Object.keys(object).length !== keys.length ||
    !keys.every((key) => Object.hasOwn(object, key))
  )
    throw Error('DECISION_RESULT_INVALID');
  return object;
};
const assertResult = (condition: unknown) => {
  if (!condition) throw Error('DECISION_RESULT_INVALID');
};
// Wire consistency only. Exact bounded coefficients, no Number conversion,
// rounded amounts, inferred positions or generated result values.
function coefficient(value: unknown) {
  assertResult(
    typeof value === 'string' &&
      /^-?(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/u.test(value) &&
      value !== '-0' &&
      value.replace(/[-.]/gu, '').length <= MAX_DECIMAL_DIGITS,
  );
  const [whole, fraction = ''] = (value as string).split('.');
  return { value: BigInt(whole! + fraction), scale: fraction.length };
}
function exactChange(before: unknown, delta: unknown, after: unknown) {
  const a = coefficient(before),
    d = coefficient(delta),
    b = coefficient(after);
  const scale = Math.max(a.scale, d.scale, b.scale);
  const aligned = (v: ReturnType<typeof coefficient>) =>
    v.value * 10n ** BigInt(scale - v.scale);
  assertResult(aligned(b) - aligned(a) === aligned(d));
}
const offices = ['CAPTAIN', 'CENTRAL_BANK', 'SOCIAL', 'INDUSTRY'];

/** Exact browser mirror of the approved API result shape. Not a server import,
 * result generator, operating-state reconstruction or economic execution. */
export function consumeDecisionResult(
  value: unknown,
  pins: ResultPins,
): DecisionResultView {
  if (
    value === undefined ||
    (value === null && !offices.includes(pins.officeId))
  )
    return absent('UNAVAILABLE', 'RESULT_NOT_PROJECTED');
  try {
    const country = pins.classification === 'COUNTRY';
    if (!country) assertResult(offices.includes(pins.officeId));
    const result = exact(
      value,
      country
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
    const head = exact(result.sourceHead, [
      'worldId',
      'worldVersion',
      'eventSequence',
    ]);
    assertResult(
      result.schemaVersion === OFFICE_DECISION_RESULT_SCHEMA &&
        result.classification === pins.classification &&
        result.countryId === pins.countryId &&
        head.worldId === pins.worldId &&
        head.worldVersion === pins.worldVersion &&
        head.eventSequence === pins.eventSequence &&
        version(head.worldVersion) &&
        version(head.eventSequence),
    );
    if (country) {
      assertResult(
        result.status === 'NOT_AUTHORIZED' &&
          result.reason === 'OFFICE_DECISION_DETAIL_PRIVATE',
      );
      return absent('NOT_AUTHORIZED', 'OFFICE_DECISION_DETAIL_PRIVATE');
    }
    assertResult(
      pins.classification === 'OFFICE_PRIVATE' &&
        result.officeId === pins.officeId &&
        result.semantics === 'COMMITTED_EVENT_RESULT_NOT_CURRENT_POSITION' &&
        result.afterState === null &&
        Array.isArray(result.metrics),
    );
    const metrics = result.metrics as unknown[];
    if (result.status !== 'COMMITTED') {
      assertResult(
        result.source === null &&
          result.businessState === null &&
          result.cause === null &&
          metrics.length === 0,
      );
      if (result.status === 'NOT_AUTHORIZED') {
        assertResult(
          pins.officeId === 'CENTRAL_BANK' &&
            result.reason === 'SCOPE_NOT_AUTHORIZED',
        );
        return absent('NOT_AUTHORIZED', 'SCOPE_NOT_AUTHORIZED');
      }
      assertResult(
        result.status === 'SOURCE_UNAVAILABLE' &&
          (pins.officeId === 'INDUSTRY'
            ? result.reason === 'COMMITTED_PRODUCTION_SOURCE_UNAVAILABLE'
            : ['NO_COMMITTED_DOMAIN_RESULT', 'UNSUPPORTED_EVENT_TYPE'].includes(
                String(result.reason),
              )),
      );
      return absent('UNAVAILABLE', String(result.reason));
    }
    assertResult(
      pins.officeId !== 'INDUSTRY' &&
        result.source === 'COMMITTED_EVENT_RESULT' &&
        (pins.officeId !== 'CENTRAL_BANK' ||
          pins.financialDetail === 'AUTHORIZED_FILTERED'),
    );
    const cause = exact(result.cause, [
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
    assertResult(
      canonicalId(cause.commandId) &&
        canonicalId(cause.eventId) &&
        hash(cause.commandFingerprint) &&
        hash(cause.eventFingerprint) &&
        version(cause.eventSequence) &&
        version(cause.worldVersionBefore) &&
        version(cause.worldVersionAfter) &&
        typeof cause.simTime === 'string' &&
        /^(?:0|[1-9]\d*)$/u.test(cause.simTime),
    );
    const before = BigInt(cause.worldVersionBefore as string),
      after = BigInt(cause.worldVersionAfter as string),
      sequence = BigInt(cause.eventSequence as string);
    assertResult(
      after === before + 1n &&
        after <= BigInt(pins.worldVersion) &&
        sequence > 0n &&
        sequence <= BigInt(pins.eventSequence),
    );
    const social = pins.officeId === 'SOCIAL',
      due = social && cause.eventType === SOCIAL_JOB_MATCH_EVENT;
    assertResult(
      version(pins.activity.eventCount) &&
        version(pins.activity.eventSequence) &&
        version(pins.activity.worldVersion) &&
        BigInt(pins.activity.eventCount) > 0n,
    );
    assertResult(
      due
        ? sequence >= BigInt(pins.activity.eventSequence) &&
            after >= BigInt(pins.activity.worldVersion)
        : cause.eventSequence === pins.activity.eventSequence &&
            cause.worldVersionAfter === pins.activity.worldVersion,
    );
    if (social) {
      assertResult(
        canonicalId(cause.planCommandId) &&
          result.reason === 'PREDECESSOR_STATE_NOT_CARRIED' &&
          ((result.businessState === 'PLAN_PENDING' &&
            cause.eventType === SOCIAL_SERVICE_PLAN_EVENT &&
            cause.planCommandId === cause.commandId) ||
            (result.businessState === 'MATCH_SETTLED' &&
              due &&
              cause.planCommandId !== cause.commandId)),
      );
    } else
      assertResult(
        result.reason === null &&
          result.businessState === 'APPLIED' &&
          cause.planCommandId === null &&
          cause.eventType ===
            (pins.officeId === 'CAPTAIN'
              ? CAPTAIN_POLITICAL_CAPITAL_EVENT
              : CENTRAL_BANK_OMO_EVENT),
      );
    const expected =
      pins.officeId === 'CAPTAIN'
        ? POLITICAL_CAPITAL_BUCKETS.map((bucket) => [
            `POLITICAL_CAPITAL.${bucket}`,
            'political_capital',
          ])
        : social
          ? [
              'matched',
              'remainingUnemployed',
              'remainingVacancies',
              'remainingFreeServiceSlots',
            ].map((key) => [
              `SOCIAL.${key}`,
              key === 'remainingFreeServiceSlots' ? 'service_slot' : 'person',
            ])
          : [
              ['CB_GOVERNMENT_SECURITIES', null],
              ['CB_COMMERCIAL_BANK_RESERVES', null],
            ];
    assertResult(metrics.length === expected.length);
    let currency: string | null = null;
    for (const [index, raw] of metrics.entries()) {
      const metric = exact(raw, [
        'key',
        'unit',
        'status',
        'before',
        'delta',
        'after',
        ...(social ? ['reason'] : []),
      ]);
      const [key, unit] = expected[index]!;
      assertResult(
        metric.key === key &&
          typeof metric.unit === 'string' &&
          metric.unit.length <= 256 &&
          (unit === null || metric.unit === unit),
      );
      if (social)
        assertResult(
          metric.status === 'AFTER_ONLY' &&
            metric.before === null &&
            metric.delta === null &&
            metric.reason === 'PREDECESSOR_STATE_NOT_CARRIED' &&
            typeof metric.after === 'string' &&
            /^(?:0|[1-9]\d*)$/u.test(metric.after) &&
            metric.after.length <= 256,
        );
      else {
        assertResult(
          metric.status === 'EXACT_CHANGE' &&
            typeof metric.before === 'string' &&
            typeof metric.delta === 'string' &&
            typeof metric.after === 'string',
        );
        exactChange(metric.before, metric.delta, metric.after);
        if (pins.officeId === 'CENTRAL_BANK') {
          assertResult(/^[A-Z]{3}$/u.test(metric.unit as string));
          assertResult(currency === null || currency === metric.unit);
          currency = metric.unit as string;
        }
      }
    }
    // Own a frozen wire copy; later caller edits cannot mutate a displayed result.
    const copy = JSON.parse(JSON.stringify(result)) as OfficeDecisionResult;
    Object.freeze(copy.sourceHead);
    Object.freeze(copy.cause);
    for (const metric of copy.metrics) Object.freeze(metric);
    Object.freeze(copy.metrics);
    Object.freeze(copy);
    return Object.freeze({
      availability: social ? 'PARTIAL' : 'COMMITTED',
      reason: copy.reason,
      result: copy,
    });
  } catch {
    return absent('UNAVAILABLE', 'DECISION_RESULT_INVALID');
  }
}
