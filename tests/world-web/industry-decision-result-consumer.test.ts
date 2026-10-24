/** Authored TEST_ONLY wire / read-binding fixture. No real source/admission or Worker v2 emission. */
import { describe, expect, it } from 'vitest';
import { consumeOfficeProjection } from '../../apps/world-web/src/office-projection/model.js';
import { renderDecisionResult } from '../../apps/world-web/src/office-projection/decision-result-view.js';
import { officeProjectionFixture } from './office-projection-fixture.js';

type Row = Record<string, unknown>;
const row = (value: unknown) => value as Row;
function fixture() {
  const f = officeProjectionFixture('industry');
  const cause = {
    commandId: 'COMMAND_TEST_ONLY_PRODUCTION',
    commandFingerprint: 'sha256:' + 'a'.repeat(64),
    eventId: 'EVENT_TEST_ONLY_PRODUCTION',
    eventFingerprint: 'sha256:' + 'b'.repeat(64),
    eventType: 'INDUSTRY_PRODUCTION_SETTLED',
    eventSequence: '1',
    worldVersionBefore: '0',
    worldVersionAfter: '1',
    simTime: '10000',
    planCommandId: null,
  };
  const head = { worldId: 'TEST_WORLD', worldVersion: '2', eventSequence: '2' };
  Object.assign(f.payload, {
    schemaVersion: 'world-activity-projection-v2',
    decisionResult: {
      schemaVersion: 'office-decision-results-v1',
      classification: 'OFFICE_PRIVATE',
      countryId: 'TEST_COUNTRY',
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
  });
  Object.assign(f.payload.ledger.visibility, {
    schemaVersion: 'economic-read-visibility-v2',
    industryProductionResult: {
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
  });
  return f;
}
type Fixture = ReturnType<typeof fixture>;
async function model(f: Fixture) {
  const port = f.client();
  try {
    return consumeOfficeProjection(
      await port.readProjection('11111111-1111-4111-8111-111111111112'),
      f.config,
      'industry',
    );
  } finally {
    port.disconnect();
  }
}
class Element {
  children: Element[] = [];
  ownText = '';
  scope = '';
  constructor(readonly tag: string) {}
  set textContent(value: string) {
    this.ownText = value;
  }
  get textContent(): string {
    return [this.ownText, ...this.children.map((c) => c.textContent)].join(
      '\n',
    );
  }
  append(...children: Element[]) {
    this.children.push(...children);
  }
  setAttribute() {}
  all(tag: string): Element[] {
    return [
      ...(this.tag === tag ? [this] : []),
      ...this.children.flatMap((c) => c.all(tag)),
    ];
  }
}
const documentDouble = {
  createElement: (tag: string) => new Element(tag),
} as unknown as Document;
describe('Industry independent browser v2 mirror / TEST_ONLY wire', () => {
  it('renders historical production as PARTIAL with nulls and inventory unavailable', async () => {
    const m = await model(fixture());
    expect(m.kind).toBe('CURRENT');
    if (m.kind !== 'CURRENT') throw Error(m.code);
    expect(m.decisionResult.availability).toBe('PARTIAL');
    expect(m.economicAvailability.inventory).toBe('NOT_AUTHORIZED');
    expect(m.readouts).toHaveLength(1);
    expect(m.currentFinancialPosition.availability).not.toBe('AVAILABLE');
    const dom = renderDecisionResult(
      documentDouble,
      m.decisionResult,
    ) as unknown as Element;
    expect(dom.textContent).toContain('Production committed · Partial result');
    expect(dom.textContent).toContain('Production output');
    expect(dom.textContent).toContain('Not current balances');
    expect(dom.all('td').map((c) => c.textContent)).toEqual([
      'Not supplied',
      'Not supplied',
      '123.45 tonne',
    ]);
  });
  const edits: [string, (p: Row) => void][] = [
    [
      'mixed activity',
      (p) => {
        p.schemaVersion = 'world-activity-projection-v1';
      },
    ],
    [
      'unknown activity',
      (p) => {
        p.schemaVersion = 'world-activity-projection-v3';
      },
    ],
    [
      'mixed visibility',
      (p) => {
        row(row(p.ledger).visibility).schemaVersion =
          'economic-read-visibility-v1';
      },
    ],
    [
      'unknown visibility',
      (p) => {
        row(row(p.ledger).visibility).schemaVersion =
          'economic-read-visibility-v3';
      },
    ],
    [
      'extra payload',
      (p) => {
        p.sourceAdmitted = true;
      },
    ],
    [
      'extra visibility',
      (p) => {
        row(row(p.ledger).visibility).grant = true;
      },
    ],
    [
      'extra disclosure',
      (p) => {
        row(row(row(p.ledger).visibility).industryProductionResult).grant =
          true;
      },
    ],
    [
      'missing result',
      (p) => {
        delete p.decisionResult;
      },
    ],
    [
      'raw inventory',
      (p) => {
        row(p.ledger).inventoryPositions = [{ quantity: '1' }];
      },
    ],
    [
      'financial leak',
      (p) => {
        row(p.ledger).financialPositions = [
          {
            accountId: 'RAW',
            accountClass: 'CASH',
            currency: 'GCU',
            netDebitBalance: '1',
          },
        ];
      },
    ],
    [
      'wrong purpose',
      (p) => {
        row(row(row(p.ledger).visibility).industryProductionResult).purpose =
          'STOCK';
      },
    ],
    [
      'head mismatch',
      (p) => {
        row(
          row(row(row(p.ledger).visibility).industryProductionResult)
            .sourceHead,
        ).eventSequence = '3';
      },
    ],
    [
      'cause mismatch',
      (p) => {
        row(
          row(row(row(p.ledger).visibility).industryProductionResult)
            .causeBinding,
        ).eventId = 'EVENT_OTHER';
      },
    ],
    [
      'unauthorized success',
      (p) => {
        row(row(p.ledger).visibility).industryProductionResult = {
          status: 'NOT_AUTHORIZED',
        };
      },
    ],
    [
      'unsupported reason',
      (p) => {
        row(p.decisionResult).reason = 'PRODUCTION_CAUSE_CORRECTED';
      },
    ],
    [
      'unsupported unit',
      (p) => {
        row((row(p.decisionResult).metrics as unknown[])[0]).unit = 'kg';
      },
    ],
    [
      'latest activity newer than result',
      (p) => {
        row(p.activity).lastAuthoritativeEventSequence = '2';
        row(p.activity).lastAuthoritativeEventWorldVersion = '2';
      },
    ],
    [
      'invented before',
      (p) => {
        row((row(p.decisionResult).metrics as unknown[])[0]).before = '0';
      },
    ],
    [
      'TEST_ONLY authority marker',
      (p) => {
        row(p.decisionResult).provenance = 'TEST_ONLY';
      },
    ],
    ...['0', '-1', '01', '1.0', '1e2', '9'.repeat(121)].map(
      (amount): [string, (p: Row) => void] => [
        'invalid decimal ' + amount,
        (p) => {
          row((row(p.decisionResult).metrics as unknown[])[0]).after = amount;
        },
      ],
    ),
  ];
  it.each(edits)(
    'rejects %s without old-result fallback',
    async (_label, edit) => {
      const f = fixture();
      edit(row(f.payload));
      const m = await model(f);
      if (m.kind === 'CURRENT')
        expect(m.decisionResult).toMatchObject({
          availability: 'UNAVAILABLE',
          result: null,
        });
      else expect(m.code).toBe('INVALID_ACTIVITY_DTO');
    },
  );
  it.each([
    [
      'SOURCE_UNAVAILABLE',
      'COMMITTED_PRODUCTION_SOURCE_UNAVAILABLE',
      'UNAVAILABLE',
    ],
    ['NOT_AUTHORIZED', 'SCOPE_NOT_AUTHORIZED', 'NOT_AUTHORIZED'],
  ])('keeps %s empty and withheld', async (status, reason, availability) => {
    const f = fixture();
    row(f.payload.ledger.visibility).industryProductionResult = {
      status: 'NOT_AUTHORIZED',
    };
    Object.assign(row(row(f.payload).decisionResult), {
      status,
      reason,
      source: null,
      businessState: null,
      cause: null,
      metrics: [],
    });
    const m = await model(f);
    expect(m.kind).toBe('CURRENT');
    if (m.kind !== 'CURRENT') throw Error(m.code);
    expect(m.decisionResult).toEqual({ availability, reason, result: null });
    expect(
      (
        renderDecisionResult(
          documentDouble,
          m.decisionResult,
        ) as unknown as Element
      ).all('table'),
    ).toHaveLength(0);
  });
  it('owns the displayed result despite caller mutation', async () => {
    const f = fixture(),
      m = await model(f);
    if (m.kind !== 'CURRENT') throw Error(m.code);
    row((row(row(f.payload).decisionResult).metrics as unknown[])[0]).after =
      '999';
    expect(m.decisionResult.result?.metrics[0]?.after).toBe('123.45');
    expect(Object.isFrozen(m.decisionResult.result?.metrics[0])).toBe(true);
  });
});
