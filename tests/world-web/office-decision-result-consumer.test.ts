import { describe, expect, it } from 'vitest';
import {
  consumeOfficeProjection,
  type OfficeRole,
  type OfficeProjectionView,
} from '../../apps/world-web/src/office-projection/model.js';
import { createOfficeProjectionController } from '../../apps/world-web/src/office-projection/controller.js';
import { renderDecisionResult } from '../../apps/world-web/src/office-projection/decision-result-view.js';
import type { ProjectionResult } from '../../apps/world-web/src/production-read/client.js';
import { publishedDecisionFixture } from '../support/office-decision-result-consumer-fixture.js';

const requestId = () => '11111111-1111-4111-8111-111111111112';
type Fixture = Awaited<ReturnType<typeof publishedDecisionFixture>>;
async function model(f: Fixture, role: OfficeRole = f.binding.view.role) {
  const port = f.client();
  const m = consumeOfficeProjection(
    await port.readProjection(requestId()),
    f.config,
    role,
  );
  port.disconnect();
  if (m.kind !== 'CURRENT') throw Error(m.code);
  return m;
}
/** Minimal DOM double, not a browser/preview or visual-layout acceptance test. */
class Element {
  readonly children: Element[] = [];
  readonly attributes = new Map<string, string>();
  scope = '';
  private ownText = '';
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
  setAttribute(key: string, value: string) {
    this.attributes.set(key, value);
  }
  all(tag: string): Element[] {
    return [
      ...(this.tag === tag ? [this] : []),
      ...this.children.flatMap((child) => child.all(tag)),
    ];
  }
}
const documentDouble = {
  createElement: (tag: string) => new Element(tag),
} as unknown as Document;

describe('actual classified result -> read client -> drawer / bounded TEST_ONLY', () => {
  it('actual sole publisher and strict DTO supply Captain exact change and causality', async () => {
    const f = await publishedDecisionFixture('captain');
    const m = await model(f);
    expect(m.decisionResult).toMatchObject({
      availability: 'COMMITTED',
      result: {
        afterState: null,
        source: 'COMMITTED_EVENT_RESULT',
        sourceHead: {
          worldId: f.config.identity.worldId,
          worldVersion: '1',
          eventSequence: '1',
        },
        cause: {
          commandId: 'COMMAND_TEST_RESULT',
          eventId: 'EVENT_COMMAND_TEST_RESULT',
          worldVersionBefore: '0',
          worldVersionAfter: '1',
        },
      },
    });
    expect(m.decisionResult.result?.metrics).toHaveLength(7);
    expect(m.decisionResult.result?.metrics[0]).toMatchObject({
      before: '11.5',
      delta: '-2.75',
      after: '8.75',
      unit: 'political_capital',
    });
    const dom = renderDecisionResult(
      documentDouble,
      m.decisionResult,
    ) as unknown as Element;
    expect(dom.attributes.get('aria-label')).toBe('Last committed decision');
    expect(
      dom
        .all('th')
        .slice(0, 4)
        .map((el) => el.textContent),
    ).toEqual(['Result', 'Before', 'Change', 'After']);
    expect(
      dom
        .all('th')
        .slice(0, 4)
        .every((el) => el.scope === 'col'),
    ).toBe(true);
    expect(
      dom
        .all('td')
        .slice(0, 3)
        .map((el) => el.textContent),
    ).toEqual([
      '11.5 political_capital',
      '-2.75 political_capital',
      '8.75 political_capital',
    ]);
    expect(dom.textContent).toContain('COMMAND_TEST_RESULT');
    expect(dom.textContent).toContain('EVENT_COMMAND_TEST_RESULT');
    expect(dom.textContent).toContain('Not current balances');
    expect(dom.all('details')).toHaveLength(1);
  });

  it.each([
    'captain',
    'central_bank',
    'social',
    'industry',
    'finance',
    'trade',
  ] as OfficeRole[])(
    '%s country DTO is withheld; no private metrics or causality enter the model/DOM',
    async (role) => {
      const f = await publishedDecisionFixture(role, 'COUNTRY');
      const m = await model(f);
      expect(m.decisionResult).toEqual({
        availability: 'NOT_AUTHORIZED',
        reason: 'OFFICE_DECISION_DETAIL_PRIVATE',
        result: null,
      });
      const dom = renderDecisionResult(
        documentDouble,
        m.decisionResult,
      ) as unknown as Element;
      expect(dom.textContent).toContain('NOT_AUTHORIZED');
      expect(dom.textContent).not.toContain('11.5');
      expect(dom.textContent).not.toContain('COMMAND_TEST');
      expect(dom.all('table')).toHaveLength(0);
    },
  );

  it('actual publisher CB denial remains withheld without a financial visibility grant', async () => {
    const f = await publishedDecisionFixture('central_bank');
    expect((await model(f)).decisionResult).toEqual({
      availability: 'NOT_AUTHORIZED',
      reason: 'SCOPE_NOT_AUTHORIZED',
      result: null,
    });
  });

  it('actual CB domain output through strict API carries exact GBP changes only when visibility matches', async () => {
    const f = await publishedDecisionFixture('central_bank');
    f.setData(await f.domainDto());
    const m = await model(f);
    expect(m.decisionResult.availability).toBe('COMMITTED');
    expect(m.decisionResult.result?.metrics).toHaveLength(2);
    expect(m.decisionResult.result?.metrics[0]).toMatchObject({
      key: 'CB_GOVERNMENT_SECURITIES',
      before: '100',
      delta: '10',
      after: '110',
      unit: 'GBP',
    });
    const wire = await f.domainDto();
    const p = wire.payload as Record<string, unknown>;
    (
      (p.ledger as Record<string, unknown>).visibility as Record<
        string,
        unknown
      >
    ).financialDetail = 'NOT_AUTHORIZED';
    f.setData(wire);
    expect((await model(f)).decisionResult).toMatchObject({
      availability: 'UNAVAILABLE',
      result: null,
    });
  });

  it('actual Social plan remains pending and partial; null predecessor values are never zero', async () => {
    const f = await publishedDecisionFixture('social');
    const m = await model(f);
    expect(m.decisionResult).toMatchObject({
      availability: 'PARTIAL',
      result: { businessState: 'PLAN_PENDING', afterState: null },
    });
    expect(m.decisionResult.result?.metrics).toHaveLength(4);
    expect(
      m.decisionResult.result?.metrics.every(
        (metric) =>
          metric.before === null &&
          metric.delta === null &&
          metric.status === 'AFTER_ONLY',
      ),
    ).toBe(true);
    const dom = renderDecisionResult(
      documentDouble,
      m.decisionResult,
    ) as unknown as Element;
    expect(dom.textContent).toContain('Matching pending');
    expect(dom.textContent).toContain('Matched');
    expect(
      dom
        .all('td')
        .slice(0, 2)
        .map((el) => el.textContent),
    ).toEqual(['Not supplied', 'Not supplied']);
  });

  it('actual Social due projector -> strict DTO allows result later than last human-office activity without fabricating predecessor', async () => {
    const f = await publishedDecisionFixture('social');
    f.setData(await f.domainDto());
    const m = await model(f);
    expect(m.decisionResult).toMatchObject({
      availability: 'PARTIAL',
      result: {
        businessState: 'MATCH_SETTLED',
        cause: {
          planCommandId: 'COMMAND_TEST_PLAN',
          commandId: 'COMMAND_TEST_DUE',
          worldVersionAfter: '2',
        },
      },
    });
    expect(m.decisionResult.result?.metrics).toHaveLength(4);
    expect(m.decisionResult.result?.metrics[0]).toMatchObject({
      before: null,
      delta: null,
      after: '3',
    });
    expect(m.head.worldVersion).toBe('2');
    const dom = renderDecisionResult(
      documentDouble,
      m.decisionResult,
    ) as unknown as Element;
    expect(dom.textContent).toContain('Matching settled');
    expect(dom.textContent).not.toContain('Matching pending');
  });

  it.each(['industry', 'trade', 'finance'] as OfficeRole[])(
    '%s unavailable/unsupported contract is not a fabricated result',
    async (role) => {
      const f = await publishedDecisionFixture(role);
      const result = (await model(f)).decisionResult;
      expect(result.result).toBeNull();
      expect(result.availability).toBe('UNAVAILABLE');
      expect(result.reason).toBe(
        role === 'industry'
          ? 'COMMITTED_PRODUCTION_SOURCE_UNAVAILABLE'
          : 'RESULT_NOT_PROJECTED',
      );
    },
  );

  it('old DTO without optional result fields remains compatible and does not infer a result from event count', async () => {
    const f = await publishedDecisionFixture('captain'),
      wire = structuredClone(f.dto);
    delete (wire.payload as Record<string, unknown>).decisionResult;
    f.setData(wire);
    expect((await model(f)).decisionResult).toEqual({
      availability: 'UNAVAILABLE',
      reason: 'RESULT_NOT_PROJECTED',
      result: null,
    });
  });

  it('malformed CB visibility cannot disclose a result even if its financialDetail marker says authorized', async () => {
    const f = await publishedDecisionFixture('central_bank'),
      wire = await f.domainDto();
    const p = wire.payload as Record<string, unknown>;
    (
      (p.ledger as Record<string, unknown>).visibility as Record<
        string,
        unknown
      >
    ).schemaVersion = 'UNKNOWN_VISIBILITY';
    f.setData(wire);
    expect((await model(f)).decisionResult).toMatchObject({
      availability: 'UNAVAILABLE',
      result: null,
    });
  });

  it('a historical committed result is separate from its later current publication head', async () => {
    const f = await publishedDecisionFixture('captain'),
      wire = structuredClone(f.dto);
    Object.assign(wire.watermark, { worldVersion: '7', eventSequence: '7' });
    Object.assign(
      (
        (wire.payload as Record<string, unknown>).decisionResult as Record<
          string,
          unknown
        >
      ).sourceHead as Record<string, unknown>,
      { worldVersion: '7', eventSequence: '7' },
    );
    f.setData(wire);
    const m = await model(f);
    expect(m.head.worldVersion).toBe('7');
    expect(m.decisionResult.result?.cause?.worldVersionAfter).toBe('1');
    const dom = renderDecisionResult(
      documentDouble,
      m.decisionResult,
    ) as unknown as Element;
    expect(dom.textContent).toContain('World v7 / event 7');
    expect(dom.textContent).toContain('0 → 1');
  });

  it('displayed result and nested metrics are frozen copies, not caller-owned payloads', async () => {
    const f = await publishedDecisionFixture('captain'),
      m = await model(f);
    const result = m.decisionResult.result!;
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.cause)).toBe(true);
    expect(Object.isFrozen(result.metrics)).toBe(true);
    expect(Object.isFrozen(result.metrics[0])).toBe(true);
    const source = (f.dto.payload as Record<string, unknown>)
      .decisionResult as Record<string, unknown>;
    (source.metrics as Record<string, unknown>[])[0]!.after = '999';
    expect(result.metrics[0]!.after).toBe('8.75');
  });

  it('simulation ticks stay canonical strings, not the bounded database head version type', async () => {
    const f = await publishedDecisionFixture('captain'),
      wire = structuredClone(f.dto);
    const cause = (
      (wire.payload as Record<string, unknown>).decisionResult as Record<
        string,
        unknown
      >
    ).cause as Record<string, unknown>;
    // Wire-format test only, not a claim that the fixture command ran at this time.
    cause.simTime = '9223372036854775808';
    f.setData(wire);
    expect((await model(f)).decisionResult.result?.cause?.simTime).toBe(
      '9223372036854775808',
    );
    cause.simTime = '01';
    f.setData(wire);
    expect((await model(f)).decisionResult.result).toBeNull();
  });

  it('403 after a result clears the drawer and retires the authority, not only the current read', async () => {
    const f = await publishedDecisionFixture('captain');
    const controller = createOfficeProjectionController(
      f.binding,
      () => f.binding.view,
      () => f.client(),
      requestId,
    );
    await controller.refresh();
    expect(controller.getState().model?.decisionResult.availability).toBe(
      'COMMITTED',
    );
    f.fail(403);
    await controller.refresh();
    expect(controller.getState()).toMatchObject({
      status: 'DENIED',
      model: null,
      receipt: null,
      canRead: false,
      canLookupFinal: false,
    });
  });

  it.each([
    'country',
    'office',
    'head',
    'world',
    'before',
    'delta',
    'future',
    'old-cause',
    'fingerprint',
    'extra',
    'unit',
    'metric-count',
    'afterState',
    'unknown-event',
    'status',
  ])(
    'rejects invalid %s result without displaying any result values',
    async (mode) => {
      const f = await publishedDecisionFixture('captain'),
        wire = structuredClone(f.dto);
      const r = (wire.payload as Record<string, unknown>)
        .decisionResult as Record<string, unknown>;
      const head = r.sourceHead as Record<string, unknown>,
        cause = r.cause as Record<string, unknown>,
        metrics = r.metrics as Record<string, unknown>[];
      if (mode === 'country') r.countryId = 'OTHER_COUNTRY';
      if (mode === 'office') r.officeId = 'SOCIAL';
      if (mode === 'head') head.eventSequence = '2';
      if (mode === 'world') head.worldId = 'OTHER_WORLD';
      if (mode === 'before') metrics[0]!.before = '11.50';
      if (mode === 'delta') metrics[0]!.delta = '99';
      if (mode === 'future')
        Object.assign(cause, {
          worldVersionBefore: '1',
          worldVersionAfter: '2',
        });
      if (mode === 'old-cause') cause.eventSequence = '0';
      if (mode === 'fingerprint') cause.eventFingerprint = 'invalid';
      if (mode === 'extra') r.privateRaw = 'hidden';
      if (mode === 'unit') metrics[0]!.unit = 'GCU';
      if (mode === 'metric-count') metrics.pop();
      if (mode === 'afterState') r.afterState = { treasury: '99' };
      if (mode === 'unknown-event') cause.eventType = 'TEST_UNKNOWN';
      if (mode === 'status') r.status = 'QUEUED';
      f.setData(wire);
      const m = await model(f);
      expect(m.decisionResult).toEqual({
        availability: 'UNAVAILABLE',
        reason: 'DECISION_RESULT_INVALID',
        result: null,
      });
      expect(
        (
          renderDecisionResult(
            documentDouble,
            m.decisionResult,
          ) as unknown as Element
        ).all('td'),
      ).toHaveLength(0);
    },
  );

  it('wrong classification field fails the projection rather than treating private results as country detail', async () => {
    const f = await publishedDecisionFixture('captain', 'COUNTRY'),
      wire = structuredClone(f.dto);
    const p = wire.payload as Record<string, unknown>;
    p.decisionResult = f.projected();
    f.setData(wire);
    const port = f.client();
    expect(
      consumeOfficeProjection(
        await port.readProjection(requestId()),
        f.config,
        'captain',
      ).kind,
    ).toBe('MISSING');
    port.disconnect();
  });

  it.each([
    'session',
    'role',
    'country',
    'revision',
    'seed',
    'disconnect',
    'unavailable',
  ])('clears actual result on %s loss', async (loss) => {
    const f = await publishedDecisionFixture('captain');
    let view: OfficeProjectionView = f.binding.view;
    const controller = createOfficeProjectionController(
      f.binding,
      () => view,
      () => f.client(),
      requestId,
    );
    await controller.refresh();
    expect(controller.getState().model?.decisionResult.availability).toBe(
      'COMMITTED',
    );
    if (loss === 'session') f.invalidate();
    if (loss === 'role') view = { ...view, role: 'social' };
    if (loss === 'country') view = { ...view, countryDisplayId: '70' };
    if (loss === 'revision')
      Object.assign(f.config.identity, {
        authorizationRevision: 'REVOKED_REVISION',
      });
    if (loss === 'seed') {
      // Host seed replacement does not authorize the old returned binding.
      Object.assign(f.config.world, {
        contentHash: `sha256:${'b'.repeat(64)}`,
      });
    }
    if (loss === 'disconnect') controller.disconnect();
    if (loss === 'unavailable') f.fail();
    if (loss === 'seed' || loss === 'unavailable') await controller.refresh();
    expect(controller.getState().model).toBeNull();
    expect(controller.getState().command.kind).toBe('DISABLED');
    controller.disconnect();
  });

  it('late result after role navigation never returns to the drawer', async () => {
    const f = await publishedDecisionFixture('captain'),
      port = f.client();
    const result = await port.readProjection(requestId());
    let release!: (result: ProjectionResult) => void;
    let view: OfficeProjectionView = f.binding.view;
    const controller = createOfficeProjectionController(
      f.binding,
      () => view,
      () => ({
        ...port,
        readProjection: () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      }),
      requestId,
    );
    const pending = controller.refresh();
    view = { ...view, role: 'social' };
    release(result);
    await pending;
    expect(controller.getState().model).toBeNull();
    expect(controller.getState().status).toBe('MISSING');
  });
});
