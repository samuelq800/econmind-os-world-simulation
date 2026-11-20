/** Shipped controller/view with TEST_ONLY intercepted DTOs. No actual SQL,
 * source admission, queue, settlement or native browser acceptance. */
import { afterEach, expect, it, vi } from 'vitest';
import { createOfficeCommandController } from '../../apps/world-web/src/office-command/controller.js';
import { installOfficeCommand } from '../../apps/world-web/src/office-command/view.js';
import {
  POSTWAR_RUNTIME_SCHEMA,
  POSTWAR_RUNTIME_PATH,
} from '../../apps/world-web/src/postwar-office-runtime/client.js';
import { fixedOfficeCommandFixture } from './office-command-fixed-offices-fixture.js';
import { HostDocument } from './trusted-host-dom.js';
afterEach(() => vi.unstubAllGlobals());
function controller(
  f: ReturnType<typeof fixedOfficeCommandFixture>,
  fetcher = f.fetcher,
) {
  return createOfficeCommandController(f.binding, () => f.binding.view, {
    fetcher,
    requestId: () => f.request.requestId,
  });
}
const unavailable = (requestId: unknown) =>
  Response.json(
    {
      schemaVersion: POSTWAR_RUNTIME_SCHEMA,
      requestId,
      ok: false,
      error: { code: 'SOURCE_UNAVAILABLE', retryable: true },
    },
    { status: 503 },
  );

it('defaults to actual current inventory and retains the explicit transfer selection through refresh, FINAL recovery and inventory re-selection', async () => {
  const f = fixedOfficeCommandFixture('trade'),
    c = controller(f);
  try {
    await c.refresh();
    expect(f.calls[0]?.body.dataset).toBe('inventory-current');
    expect(c.getState().runtimePage).toMatchObject({
      dataset: 'inventory-current',
      rows: [
        {
          quantity: '1',
          unit: 'tonne',
          physicalLocationId: 'LOCATION_TEST_ONLY',
          titleHolderId: 'ENTITY_TEST_ONLY_OWNER',
        },
      ],
      source: { worldVersion: '2' },
    });
    await c.selectTradeDataset('goods-transfers-current');
    await c.refresh();
    expect(c.getState()).toMatchObject({
      tradeDataset: 'goods-transfers-current',
      runtimePage: {
        dataset: 'goods-transfers-current',
        rows: [
          {
            quantity: '0.000001',
            status: 'DELIVERED',
            sellerCountryId: 'COUNTRY_01',
            buyerCountryId: 'COUNTRY_02',
          },
        ],
      },
    });
    expect(c.stage(f.request)).toBe(true);
    expect(c.review()).toBe(true);
    await c.confirm();
    f.recover('final');
    await c.recoverOriginal();
    expect(c.getState()).toMatchObject({
      tradeDataset: 'goods-transfers-current',
      receipt: { outcome: 'COMMITTED' },
      runtimePage: {
        dataset: 'goods-transfers-current',
        authority: { readback: { worldVersion: '3' } },
      },
      canConfirm: false,
    });
    expect(
      f.calls
        .filter((x) => x.path === POSTWAR_RUNTIME_PATH)
        .every((x) => x.body.dataset !== 'opening-inventory-entries'),
    ).toBe(true);
    expect(f.calls.filter((x) => x.path === '/v1/office-command')).toHaveLength(
      1,
    );
    expect(
      f.calls.find((x) => x.path === '/v1/command-recovery')?.body.request,
    ).toMatchObject({ originalRequest: f.request });
    await c.selectTradeDataset('inventory-current');
    expect(c.getState().runtimePage?.dataset).toBe('inventory-current');
  } finally {
    c.disconnect();
  }
});

it.each(['unavailable', 'offline', 'denied'] as const)(
  'keeps %s distinct from EMPTY, with no automatic opening fallback or retained private stock',
  async (mode) => {
    const f = fixedOfficeCommandFixture('trade'),
      datasets: unknown[] = [],
      fetcher: typeof fetch = async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        datasets.push(body.dataset);
        if (mode === 'offline') throw Error('TEST_ONLY_NETWORK_LOST');
        if (mode === 'denied')
          return Response.json(
            { error: { code: 'FORBIDDEN' } },
            { status: 403 },
          );
        return unavailable(body.requestId);
      },
      c = controller(f, fetcher);
    try {
      await c.refresh();
      expect(c.getState()).toMatchObject({
        status: mode === 'denied' ? 'DENIED' : 'UNAVAILABLE',
        runtimePage: null,
        currentHead: null,
        canStage: false,
      });
      expect(datasets).toEqual(['inventory-current']);
      if (mode === 'denied') {
        await c.readTradeOpeningH0();
        expect(datasets).toEqual(['inventory-current']);
        expect(c.getState().canReadTradeOpeningH0).toBe(false);
      }
    } finally {
      c.disconnect();
    }
  },
);

it.each([
  'ADMITTED_IMMUTABLE_OPENING_FACTS',
  'ADMITTED_H0_DERIVED_PROJECTION_NOT_POST_H0_REPLAY',
])(
  'requires an explicit read for genuine zero-head opening (%s) and refresh returns to selected current data',
  async (nature) => {
    const f = fixedOfficeCommandFixture('trade');
    f.setHead('0');
    const datasets: unknown[] = [],
      fetcher: typeof fetch = async (url, init) => {
        const request = JSON.parse(String(init?.body)) as Record<
          string,
          unknown
        >;
        datasets.push(request.dataset);
        if (request.dataset !== 'opening-inventory-entries')
          return unavailable(request.requestId);
        const body = (await (await f.fetcher(url, init)).json()) as {
          source: Record<string, unknown>;
        };
        body.source.dataNature = nature;
        if (nature === 'ADMITTED_H0_DERIVED_PROJECTION_NOT_POST_H0_REPLAY') {
          delete body.source.originWorldVersion;
          delete body.source.originEventSequence;
          delete body.source.observedHead;
        }
        return Response.json(body);
      },
      c = controller(f, fetcher);
    try {
      await c.refresh();
      expect(datasets).toEqual(['inventory-current']);
      expect(c.getState()).toMatchObject({
        runtimePage: null,
        canStage: false,
      });
      await c.readTradeOpeningH0();
      expect(c.getState()).toMatchObject({
        tradeDataset: 'inventory-current',
        currentHead: { worldVersion: '0', eventSequence: '0' },
        runtimePage: {
          dataset: 'opening-inventory-entries',
          source: { worldVersion: '0', eventSequence: '0', dataNature: nature },
        },
        canStage: true,
      });
      await c.refresh();
      expect(c.getState().runtimePage).toBeNull();
      expect(datasets).toEqual([
        'inventory-current',
        'opening-inventory-entries',
        'inventory-current',
      ]);
    } finally {
      c.disconnect();
    }
  },
);

it.each([
  'positiveHead',
  'nonzeroSequence',
  'nonzeroOrigin',
  'nonzeroObservedHead',
] as const)(
  'refuses opening %s rather than presenting historical rows as current',
  async (kind) => {
    const f = fixedOfficeCommandFixture('trade');
    f.setHead('0');
    const fetcher: typeof fetch = async (url, init) => {
        const body = (await (await f.fetcher(url, init)).json()) as {
          source: Record<string, unknown>;
          authority: {
            readback: { worldVersion: string; eventSequence: string };
          };
        };
        if (kind === 'positiveHead') {
          body.authority.readback.worldVersion = '1';
          body.authority.readback.eventSequence = '1';
          body.source.observedHead = { worldVersion: '1', eventSequence: '1' };
        }
        if (kind === 'nonzeroSequence')
          body.authority.readback.eventSequence = '1';
        if (kind === 'nonzeroOrigin') body.source.originWorldVersion = '1';
        if (kind === 'nonzeroObservedHead')
          body.source.observedHead = { worldVersion: '1', eventSequence: '1' };
        return Response.json(body);
      },
      c = controller(f, fetcher);
    try {
      await c.readTradeOpeningH0();
      expect(c.getState()).toMatchObject({
        status: 'UNAVAILABLE',
        runtimePage: null,
        canStage: false,
      });
    } finally {
      c.disconnect();
    }
  },
);

it('does not query opening once a positive head has been observed', async () => {
  const f = fixedOfficeCommandFixture('trade'),
    c = controller(f);
  try {
    await c.refresh();
    const before = f.calls.length;
    await c.readTradeOpeningH0();
    expect(f.calls).toHaveLength(before);
    expect(c.getState().canReadTradeOpeningH0).toBe(false);
  } finally {
    c.disconnect();
  }
});

it.each([false, true])(
  'pages through the same selected current dataset, refusing a changed head instead of combining snapshots (changed=%s)',
  async (changed) => {
    const f = fixedOfficeCommandFixture('trade'),
      fetcher: typeof fetch = async (url, init) => {
        const request = JSON.parse(String(init?.body)) as {
            page: { offset: number };
          },
          body = (await (await f.fetcher(url, init)).json()) as {
            page: Record<string, unknown>;
            rows: Record<string, unknown>[];
            source: Record<string, unknown>;
            authority: {
              readback: { worldVersion: string; eventSequence: string };
            };
          };
        body.page = {
          offset: request.page.offset,
          limit: 25,
          returned: 1,
          total: 2,
          nextOffset: request.page.offset === 0 ? 1 : null,
        };
        if (request.page.offset === 1) {
          body.rows[0] = {
            ...body.rows[0],
            batchId: 'BATCH_TEST_ONLY_SECOND',
            quantity: '2',
          };
          if (changed) {
            body.authority.readback = {
              ...body.authority.readback,
              worldVersion: '3',
              eventSequence: '3',
            };
            body.source.worldVersion = '3';
            body.source.eventSequence = '3';
            body.source.originWorldVersion = '3';
            body.source.originEventSequence = '3';
            body.source.observedHead = {
              worldVersion: '3',
              eventSequence: '3',
            };
            const coverage = body.source.currentTradeCoverage as Record<
              string,
              unknown
            >;
            coverage.globalWorldVersion = '3';
            coverage.globalEventSequence = '3';
            (coverage.pageProof as Record<string, unknown>).frameCount = '3';
          }
        }
        return Response.json(body);
      },
      c = controller(f, fetcher);
    try {
      await c.refresh();
      expect(c.getState().runtimePage?.page.nextOffset).toBe(1);
      await c.nextTradePage();
      expect(f.calls.at(-1)?.body).toMatchObject({
        dataset: 'inventory-current',
        page: {
          offset: 1,
          sourceVersion: f.page('', 'inventory-current').source.sourceVersion,
        },
      });
      if (changed)
        expect(c.getState()).toMatchObject({
          status: 'UNAVAILABLE',
          code: 'STALE',
          runtimePage: null,
        });
      else {
        expect(c.getState().runtimePage).toMatchObject({
          page: { offset: 1 },
          rows: [{ batchId: 'BATCH_TEST_ONLY_SECOND', quantity: '2' }],
        });
        await c.refresh();
        expect(c.getState().runtimePage?.page.offset).toBe(0);
      }
    } finally {
      c.disconnect();
    }
  },
);

it('renders real inventory fields and committed transfer statuses through explicit drawer switches, while preserving source errors', async () => {
  vi.stubGlobal(
    'MutationObserver',
    class {
      observe() {}
    },
  );
  const f = fixedOfficeCommandFixture('trade'),
    doc = new HostDocument('trade'),
    ui = installOfficeCommand(
      doc as unknown as Document,
      { addEventListener() {} } as unknown as Window,
      (binding, view) =>
        createOfficeCommandController(binding, view, {
          fetcher: f.fetcher,
          requestId: () => f.request.requestId,
        }),
    );
  try {
    ui.connect(f.binding);
    doc.tools
      .all()
      .find((e) => Object.hasOwn(e.dataset, 'officeCommandEntry'))!
      .click();
    const dialog = doc.root
        .all()
        .find((e) => Object.hasOwn(e.dataset, 'officeCommandDialog'))!,
      action = (name: string) =>
        dialog.all().find((e) => e.dataset.officeCommandAction === name)!;
    action('trade-inventory').click();
    await expect
      .poll(() => ui.getState().runtimePage?.dataset)
      .toBe('inventory-current');
    expect(dialog.textContent).toContain('LOCATION_TEST_ONLY');
    expect(dialog.textContent).toContain('ENTITY_TEST_ONLY_OWNER');
    expect(action('trade-inventory').getAttribute('aria-pressed')).toBe('true');
    action('trade-transfers').click();
    await expect
      .poll(() => ui.getState().runtimePage?.dataset)
      .toBe('goods-transfers-current');
    expect(dialog.textContent).toContain('0.000001');
    expect(dialog.textContent).toContain('DELIVERED');
    expect(action('trade-transfers').getAttribute('aria-pressed')).toBe('true');
    action('refresh').click();
    await expect.poll(() => ui.getState().canRead).toBe(true);
    expect(ui.getState().runtimePage?.dataset).toBe('goods-transfers-current');
    f.read('unavailable');
    action('refresh').click();
    await expect.poll(() => ui.getState().status).toBe('UNAVAILABLE');
    expect(dialog.textContent).not.toContain('DELIVERED');
    expect(dialog.textContent).not.toContain('当前已授权数据页无记录');
    f.invalidate();
    expect(doc.root.textContent).not.toContain('ENTITY_TEST_ONLY_OWNER');
  } finally {
    f.invalidate();
  }
});
