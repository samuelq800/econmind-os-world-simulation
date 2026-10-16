import { afterEach, expect, it, vi } from 'vitest';
import { createProductionReadClient } from '../../apps/world-web/src/production-read/client.js';
import { createOfficeProjectionController } from '../../apps/world-web/src/office-projection/controller.js';
import {
  consumeOfficeProjection,
  officeProjectionRoles,
  type OfficeRole,
} from '../../apps/world-web/src/office-projection/model.js';
import { renderOfficeReadout } from '../../apps/world-web/src/office-projection/readout-view.js';
import { installOfficeProjection } from '../../apps/world-web/src/office-projection/view.js';
import { currentFinancialPositionFixture } from './current-financial-position-fixture.js';
import { HostDocument } from './trusted-host-dom.js';

// OFFLINE TEST_ONLY: shipped client -> consumer -> shared private renderer.
// No live read, admitted World/seed, browser E2E or Clock activation is claimed.
const generation = '2026-10-07T01:02:03.789Z';
const requestId = () => '11111111-1111-4111-8111-111111111111';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function fixture(role: OfficeRole = 'finance') {
  const f = currentFinancialPositionFixture(role);
  let generatedAt: unknown = generation,
    unavailable = false,
    wrongHead = false;
  const fetcher: typeof fetch = async (input, init) => {
    const response = await f.fetcher(input, init);
    if (unavailable) return new Response(null, { status: 503 });
    const body = (await response.json()) as {
      result: { data: { watermark: Record<string, unknown> } };
    };
    const watermark = body.result.data.watermark;
    if (generatedAt === undefined) delete watermark.generatedAt;
    else watermark.generatedAt = generatedAt;
    if (wrongHead) watermark.worldVersion = '99';
    return Response.json(body);
  };
  return {
    ...f,
    client: () => createProductionReadClient(f.config, { fetcher }),
    setGeneration: (next: unknown) => {
      generatedAt = next;
    },
    failRefresh: () => {
      unavailable = true;
    },
    mismatchHead: () => {
      wrongHead = true;
    },
  };
}

it.each(Object.keys(officeProjectionRoles) as OfficeRole[])(
  'passes the exact validated generation timestamp and source head through %s readout',
  async (role) => {
    const f = fixture(role);
    if (role === 'finance' || role === 'central_bank') {
      const carrier = f.getCarrier();
      carrier.positions = [
        {
          accountId: 'TEST_EXACT',
          accountClass: 'CASH',
          currency: 'LNY',
          netDebitBalance: '-9007199254740993.000000000000000001',
        },
        {
          accountId: 'TEST_EXACT',
          accountClass: 'CASH',
          currency: 'GCU',
          netDebitBalance: '0.000000000000000001',
        },
      ];
      f.setCarrier(carrier);
    }
    const client = f.client();
    const result = await client.readProjection(requestId());
    expect(result.status).toBe('PROJECTION');
    if (result.status !== 'PROJECTION') throw Error(result.status);
    expect(result.generatedAt).toBe(generation);
    const model = consumeOfficeProjection(result, f.config, role);
    if (model.kind !== 'CURRENT') throw Error(model.code);
    expect(model.head.generatedAt).toBe(generation);
    expect(model.head.worldVersion).toBe('2');
    expect(model.head.eventSequence).toBe('2');
    const doc = new HostDocument(role);
    const element = renderOfficeReadout(doc as unknown as Document, model);
    expect(element.textContent).toContain(
      '投影生成时间 / Projection generated at',
    );
    expect(element.textContent).toContain(generation);
    expect(element.textContent).toContain('World v2 / event 2');
    expect(element.textContent).toContain('不是余额结算时点');
    expect(element.textContent).toContain('WorldClock');
    if (role === 'finance' || role === 'central_bank') {
      expect(element.textContent).toContain(
        '-9007199254740993.000000000000000001 LNY',
      );
      expect(element.textContent).toContain('0.000000000000000001 GCU');
      expect(element.textContent).not.toContain(
        '-9007199254740993.000000000000000001 GCU',
      );
    } else {
      expect(element.textContent).not.toContain('TEST_EXACT');
      expect(element.textContent).toContain('NOT_AUTHORIZED');
    }
    expect(f.calls).toHaveLength(1);
    client.disconnect();
  },
);

it.each([undefined, '2026-02-31T00:00:00.000Z'])(
  'keeps the original missing/invalid wire timestamp rejection: %s',
  async (value) => {
    const f = fixture();
    f.setGeneration(value);
    const client = f.client();
    expect(await client.readProjection(requestId())).toEqual({
      status: 'UNAVAILABLE',
    });
    expect(client.state()).toBe('NOT_CONNECTED');
    expect(f.calls).toHaveLength(1);
    client.disconnect();
  },
);

it('rejects an invalid timestamp supplied directly to the consumer instead of inventing a fallback', async () => {
  const f = fixture(),
    client = f.client();
  const result = await client.readProjection(requestId());
  if (result.status !== 'PROJECTION') throw Error(result.status);
  expect(
    consumeOfficeProjection(
      { ...result, generatedAt: '' },
      f.config,
      'finance',
    ),
  ).toEqual({ kind: 'MISSING', code: 'PROJECTION_UNAVAILABLE' });
  client.disconnect();
});

it('does not pass generation metadata through a mismatched source/head guard', async () => {
  const f = fixture(),
    client = f.client();
  f.mismatchHead();
  expect(await client.readProjection(requestId())).toEqual({
    status: 'UNAVAILABLE',
  });
  expect(client.state()).toBe('NOT_CONNECTED');
  client.disconnect();
});

it('does not replace the raw timestamp with device now or interpret it as a freshness or economic cutoff', async () => {
  const deviceNow = '2036-12-31T23:59:59.999Z';
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse(deviceNow));
  const f = fixture(),
    client = f.client();
  f.setGeneration('2000-01-02T03:04:05.006Z');
  const model = consumeOfficeProjection(
    await client.readProjection(requestId()),
    f.config,
    'finance',
  );
  if (model.kind !== 'CURRENT') throw Error(model.code);
  expect(model.head.generatedAt).toBe('2000-01-02T03:04:05.006Z');
  expect(JSON.stringify(model)).not.toContain(deviceNow);
  expect(model.head.worldVersion).toBe('2');
  client.disconnect();
});

function mount() {
  const f = fixture(),
    doc = new HostDocument('finance');
  vi.stubGlobal(
    'MutationObserver',
    class {
      observe() {}
    },
  );
  const client = f.client();
  const ui = installOfficeProjection(
    doc as unknown as Document,
    { addEventListener: () => undefined } as unknown as Window,
    (binding, view) =>
      createOfficeProjectionController(binding, view, () => client, requestId),
  );
  ui.connect(f.binding);
  const trigger = doc.tools.children[0]!;
  trigger.click();
  const drawer = doc.root.children.find((el) => el.tag === 'dialog')!;
  const action = (name: string) => {
    const button = drawer
      .all()
      .find((el) => el.dataset.officeReadAction === name);
    if (!button) throw Error('Missing shipped action ' + name);
    button.click();
  };
  return { f, doc, ui, trigger, drawer, action };
}
async function current(m: ReturnType<typeof mount>) {
  m.action('refresh');
  await expect.poll(() => m.ui.getState().status).toBe('CURRENT');
  expect(m.drawer.textContent).toContain(generation);
  expect(m.f.calls).toHaveLength(1);
}

it('removes private generation metadata on Close and reopens the authorized model without another fetch', async () => {
  const m = mount();
  await current(m);
  m.action('close');
  expect(m.drawer.children).toHaveLength(0);
  expect(m.doc.body.textContent).not.toContain(generation);
  expect(m.doc.activeElement).toBe(m.trigger);
  expect(m.ui.getState().model?.head.generatedAt).toBe(generation);
  m.trigger.click();
  expect(m.drawer.textContent).toContain(generation);
  expect(m.f.calls).toHaveLength(1);
  m.ui.disconnect();
});

it('clears the old generation timestamp after failed refresh rather than relabeling stale data as current', async () => {
  const m = mount();
  await current(m);
  m.f.failRefresh();
  m.action('refresh');
  await expect.poll(() => m.ui.getState().status).toBe('UNAVAILABLE');
  expect(m.ui.getState().model).toBeNull();
  expect(m.doc.body.textContent).not.toContain(generation);
  expect(m.f.calls).toHaveLength(2);
  m.ui.disconnect();
});

it('clears generation metadata and the model on session invalidation, including while closed', async () => {
  const m = mount();
  await current(m);
  m.action('close');
  m.f.invalidate();
  expect(m.ui.getState().model).toBeNull();
  expect(m.ui.getState().canRead).toBe(false);
  expect(m.doc.body.textContent).not.toContain(generation);
  m.trigger.click();
  expect(m.drawer.textContent).not.toContain(generation);
  expect(m.f.calls).toHaveLength(1);
});
