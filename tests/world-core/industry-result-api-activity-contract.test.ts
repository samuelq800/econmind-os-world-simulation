/** TEST_ONLY authored wire fixtures. No admitted production/source/publisher positive. */
import { beforeAll, describe, expect, it } from 'vitest';
import { assertDecisionResultPayload } from '../../apps/world-api/src/integration/office-decision-result-validator.js';
import { publishedDecisionFixture } from '../support/office-decision-result-consumer-fixture.js';
import { readPersistedDecisionTestRow } from '../support/office-decision-result-persisted-read-fixture.js';

type Row = Record<string, unknown>;
const row = (v: unknown) => v as Row;
const WORLD = 'WORLD_TEST_ONLY_DECISION_RESULTS';
const hash = 'sha256:' + 'a'.repeat(64);
function packet() {
  const cause = {
    commandId: 'COMMAND_TEST_ONLY_PRODUCTION',
    commandFingerprint: hash,
    eventId: 'EVENT_TEST_ONLY_PRODUCTION',
    eventFingerprint: hash,
    eventType: 'INDUSTRY_PRODUCTION_SETTLED',
    eventSequence: '1',
    worldVersionBefore: '0',
    worldVersionAfter: '1',
    simTime: '10000',
    planCommandId: null,
  };
  const head = { worldId: WORLD, worldVersion: '2', eventSequence: '2' };
  return {
    result: {
      schemaVersion: 'office-decision-results-v1',
      classification: 'OFFICE_PRIVATE',
      countryId: 'COUNTRY_01',
      officeId: 'INDUSTRY',
      sourceHead: head,
      semantics: 'COMMITTED_EVENT_RESULT_NOT_CURRENT_POSITION',
      source: 'COMMITTED_EVENT_RESULT',
      afterState: null,
      status: 'COMMITTED',
      reason: null,
      businessState: 'APPLIED',
      cause,
      metrics: [
        {
          key: 'PRODUCTION_OUTPUT',
          unit: 'tonne',
          status: 'AFTER_ONLY',
          before: null,
          delta: null,
          after: '123.45',
          reason: 'PREDECESSOR_STATE_NOT_CARRIED',
        },
      ],
    },
    disclosure: {
      status: 'AUTHORIZED_RESULT_ONLY',
      purpose: 'INDUSTRY_COMMITTED_PRODUCTION_OUTPUT_AFTER_ONLY',
      sourceHead: { ...head },
      causeBinding: {
        commandId: cause.commandId,
        commandFingerprint: cause.commandFingerprint,
        eventId: cause.eventId,
        eventFingerprint: cause.eventFingerprint,
      },
    },
  };
}
function validate(p: ReturnType<typeof packet>, overrides: Row = {}) {
  assertDecisionResultPayload({
    value: p.result,
    worldId: WORLD,
    countryId: 'COUNTRY_01',
    officeId: 'INDUSTRY',
    worldVersion: '2',
    eventSequence: '2',
    financialDetail: 'NOT_AUTHORIZED',
    activitySchema: 'world-activity-projection-v2',
    economicVisibilitySchema: 'economic-read-visibility-v2',
    industryProductionResult: p.disclosure,
    lastOfficeActivity: {
      eventCount: '1',
      eventSequence: '1',
      worldVersion: '1',
    },
    ...overrides,
  });
}
type Vector = [string, (p: ReturnType<typeof packet>) => void];
const invalidVectors: Vector[] = [
  [
    'wrong purpose',
    (p) => {
      p.disclosure.purpose = 'STOCK';
    },
  ],
  [
    'extra disclosure key',
    (p) => {
      row(p.disclosure).inventoryGrant = true;
    },
  ],
  [
    'extra head key',
    (p) => {
      row(p.disclosure.sourceHead).grant = true;
    },
  ],
  [
    'world mismatch',
    (p) => {
      p.disclosure.sourceHead.worldId = 'WORLD_OTHER';
    },
  ],
  [
    'version mismatch',
    (p) => {
      p.disclosure.sourceHead.worldVersion = '3';
    },
  ],
  [
    'sequence mismatch',
    (p) => {
      p.disclosure.sourceHead.eventSequence = '3';
    },
  ],
  ...['commandId', 'commandFingerprint', 'eventId', 'eventFingerprint'].map(
    (key): Vector => [
      'cause binding ' + key,
      (p) => {
        row(p.disclosure.causeBinding)[key] = key.endsWith('Fingerprint')
          ? 'sha256:' + 'b'.repeat(64)
          : 'OTHER_TEST_ID';
      },
    ],
  ),
  [
    'missing binding',
    (p) => {
      delete row(p.disclosure.causeBinding).eventId;
    },
  ],
  [
    'unauthorized success',
    (p) => {
      row(p).disclosure = { status: 'NOT_AUTHORIZED' };
    },
  ],
  [
    'wrong event',
    (p) => {
      p.result.cause.eventType = 'SOCIAL_JOB_MATCH_SETTLED_V1';
    },
  ],
  [
    'plan id',
    (p) => {
      row(p.result.cause).planCommandId = 'COMMAND_PLAN';
    },
  ],
  [
    'stale cause',
    (p) => {
      p.result.cause.eventSequence = '2';
    },
  ],
  [
    'old fallback cause',
    (p) => {
      p.result.cause.worldVersionAfter = '2';
      p.result.cause.worldVersionBefore = '1';
    },
  ],
  [
    'wrong unit',
    (p) => {
      p.result.metrics[0]!.unit = 'kg';
    },
  ],
  [
    'wrong metric',
    (p) => {
      p.result.metrics[0]!.key = 'CURRENT_STOCK';
    },
  ],
  [
    'extra metric',
    (p) => {
      p.result.metrics.push({ ...p.result.metrics[0]! });
    },
  ],
  [
    'invented before',
    (p) => {
      row(p.result.metrics[0]).before = '0';
    },
  ],
  [
    'invented delta',
    (p) => {
      row(p.result.metrics[0]).delta = '123.45';
    },
  ],
  [
    'raw account leak',
    (p) => {
      row(p.result.metrics[0]).accountId = 'ACCOUNT_RAW';
    },
  ],
  [
    'full state',
    (p) => {
      row(p.result).afterState = {};
    },
  ],
  [
    'TEST_ONLY envelope marker',
    (p) => {
      row(p.result).provenance = 'TEST_ONLY';
    },
  ],
];
describe('Industry compatibility API / authored TEST_ONLY wire only', () => {
  it('accepts exact result-only H binding with historical T < H and null predecessor', () => {
    expect(() => validate(packet())).not.toThrow();
  });
  it.each(invalidVectors)('rejects %s', (_label, edit) => {
    const p = packet();
    edit(p);
    expect(() => validate(p)).toThrow(/invalid/);
  });
  it.each([
    '0',
    '-1',
    '01',
    '1.0',
    '1e2',
    '+1',
    '1,000',
    '.1',
    '1.',
    '9'.repeat(121),
  ])('rejects unsupported amount %s', (amount) => {
    const p = packet();
    p.result.metrics[0]!.after = amount;
    expect(() => validate(p)).toThrow();
  });
  it('preserves exact 120-digit positive operand', () => {
    const p = packet();
    p.result.metrics[0]!.after = '9'.repeat(120);
    expect(() => validate(p)).not.toThrow();
  });
  it.each([
    { activitySchema: 'world-activity-projection-v1' },
    { economicVisibilitySchema: 'economic-read-visibility-v1' },
    { officeId: 'SOCIAL' },
    { activitySchema: 'world-activity-projection-v3' },
  ])('rejects mixed/foreign version pair %j', (overrides) => {
    expect(() => validate(packet(), overrides)).toThrow();
  });
  it('legacy Industry COMMITTED remains rejected without the new context', () => {
    const p = packet();
    expect(() =>
      validate(p, {
        activitySchema: undefined,
        economicVisibilitySchema: undefined,
        industryProductionResult: undefined,
      }),
    ).toThrow();
  });
  it.each([
    ['SOURCE_UNAVAILABLE', 'COMMITTED_PRODUCTION_SOURCE_UNAVAILABLE'],
    ['NOT_AUTHORIZED', 'SCOPE_NOT_AUTHORIZED'],
  ])(
    'validates closed %s without retaining an authorized binding',
    (status, reason) => {
      const p = packet();
      Object.assign(p.result, {
        status,
        reason,
        source: null,
        businessState: null,
        cause: null,
        metrics: [],
      });
      row(p).disclosure = { status: 'NOT_AUTHORIZED' };
      expect(() => validate(p)).not.toThrow();
      for (const forbidden of [
        'NO_COMMITTED_PRODUCTION_RESULT',
        'PRODUCTION_CAUSE_CORRECTED',
        'UNSUPPORTED_EVENT_TYPE',
      ]) {
        row(p.result).reason = forbidden;
        expect(() => validate(p)).toThrow();
      }
    },
  );
});

describe('Industry same persisted read carrier / TEST_FIXTURE context only', () => {
  let original: Awaited<ReturnType<typeof publishedDecisionFixture>>;
  beforeAll(async () => {
    original = await publishedDecisionFixture('industry');
  });
  function rawRow() {
    const p = packet(),
      payload = structuredClone(original.dto.payload) as Row;
    Object.assign(payload, {
      schemaVersion: 'world-activity-projection-v2',
      decisionResult: p.result,
      activity: {
        authoritativeEventCount: '1',
        lastAuthoritativeEventSequence: '1',
        lastAuthoritativeEventWorldVersion: '1',
      },
    });
    row(payload.ledger).visibility = {
      schemaVersion: 'economic-read-visibility-v2',
      financialDetail: 'NOT_AUTHORIZED',
      inventoryDetail: 'NOT_AUTHORIZED',
      countrySummary: 'NOT_AUTHORIZED',
      industryProductionResult: p.disclosure,
    };
    return {
      world_id: WORLD,
      classification: original.dto.classification,
      scope_key: original.dto.scopeKey,
      schema_version: original.dto.schemaVersion,
      world_version: '2',
      event_sequence: '2',
      generated_at: original.dto.watermark.generatedAt,
      payload,
    };
  }
  it('unchanged sole publisher still emits unavailable; authored v2 passes only read compatibility', async () => {
    expect(row(original.dto.payload).decisionResult).toMatchObject({
      status: 'SOURCE_UNAVAILABLE',
      reason: 'COMMITTED_PRODUCTION_SOURCE_UNAVAILABLE',
    });
    const value = await readPersistedDecisionTestRow({
      row: rawRow(),
      office: 'INDUSTRY',
    });
    expect(value?.schemaVersion).toBe('world-projection-read-v1');
    expect(row(value?.payload).schemaVersion).toBe(
      'world-activity-projection-v2',
    );
    expect(row(row(value?.payload).ledger).inventoryPositions).toEqual([]);
  });
  it.each([
    [
      'legacy activity',
      (p: Row) => {
        p.schemaVersion = 'world-activity-projection-v1';
      },
    ],
    [
      'raw stock',
      (p: Row) => {
        row(p.ledger).inventoryPositions = [{ quantity: '1' }];
      },
    ],
    [
      'missing result',
      (p: Row) => {
        delete p.decisionResult;
      },
    ],
    [
      'extra visibility key',
      (p: Row) => {
        row(row(p.ledger).visibility).grant = true;
      },
    ],
  ])(
    'actual outer reader rejects %s after valid context baseline',
    async (_label, edit) => {
      await expect(
        readPersistedDecisionTestRow({
          row: rawRow(),
          office: 'INDUSTRY',
          edit,
        }),
      ).rejects.toMatchObject({ code: 'PROTOCOL_ERROR' });
    },
  );
});
