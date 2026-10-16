import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { officeProjectionFixture } from './office-projection-fixture.js';
import { HostDocument, HostElement } from './trusted-host-dom.js';
import type {
  ProductionReadPort,
  ProjectionResult,
} from '../../apps/world-web/src/production-read/client.js';
import type { OfficeProjectionView } from '../../apps/world-web/src/office-projection/model.js';
import { CrisisSummary } from '../../apps/world-web/src/crisis-action/CrisisActionPage.js';

const requireWeb = createRequire(
  new URL('../../apps/world-web/package.json', import.meta.url),
);
const { createElement } = requireWeb('react') as typeof import('react');
const { renderToStaticMarkup } = requireWeb(
  'react-dom/server',
) as typeof import('react-dom/server');
const render = vi.fn(),
  unmount = vi.fn(),
  createRoot = vi.fn(() => ({ render, unmount }));
vi.doMock(requireWeb.resolve('react-dom/client'), () => ({ createRoot }));
const { createCrisisReadBridge, installCrisisReadSurface } =
  await import('../../apps/world-web/src/crisis-action/authorized-read.js');
const requestId = () => '11111111-1111-4111-8111-111111111111';

// OFFLINE TEST_ONLY: real read client + original Office controller, intercepted
// transport. These pins/carrier are not admitted production feedback or data.
function fixture() {
  const f = officeProjectionFixture('finance');
  Object.assign(f.payload, {
    feedback: {
      schemaVersion: 'derived-system-feedback-v1',
      classification: 'OFFICE_PRIVATE',
      scopeKey: f.config.identity.scopeKey,
      countryId: f.config.identity.countryId,
      officeId: f.config.identity.officeId,
      sourceHead: {
        worldId: 'TEST_WORLD',
        worldVersion: '2',
        eventSequence: '2',
      },
      generatedAt: '2026-10-07T00:00:00.000Z',
      citizen: {
        status: 'UNAVAILABLE',
        reason: 'MODEL_NOT_ADMITTED',
        items: [],
      },
      government: {
        status: 'UNAVAILABLE',
        reason: 'DISCLOSURE_UNAVAILABLE',
        items: [],
      },
    },
  });
  let view: OfficeProjectionView = { ...f.binding.view };
  const bridge = createCrisisReadBridge(() => f.client(), requestId);
  const controller = bridge.createController(f.binding, () => view);
  return {
    ...f,
    bridge,
    controller,
    setView: (next: OfficeProjectionView) => {
      view = next;
    },
  };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('authorized crisis unavailable consumption / OFFLINE TEST_ONLY', () => {
  it('shares the original real client read, preserves exact unavailable reasons, never fabricates a crisis view', async () => {
    const f = fixture();
    const changes: string[] = [];
    const stop = f.bridge.subscribe(() =>
      changes.push(f.bridge.getState().status),
    );
    expect(f.bridge.getState().status).toBe('UNBOUND');
    expect(f.calls).toHaveLength(0);
    await f.controller.refresh();
    expect(f.calls).toHaveLength(1);
    expect(f.controller.getState().status).toBe('CURRENT');
    expect(f.bridge.getState()).toEqual({
      status: 'UNAVAILABLE',
      reasons: [
        'ACTUAL_GAP_NOT_PROJECTED',
        'VERIFIED_DELIVERY_NOT_PROJECTED',
        'CONTRIBUTION_NOT_PROJECTED',
        'CRISIS_CLOCK_NOT_PROJECTED',
        'PLAYER_CONTENT_NOT_PROJECTED',
        'MODEL_NOT_ADMITTED',
        'DISCLOSURE_UNAVAILABLE',
      ],
    });
    expect(changes).toEqual(['LOADING', 'UNAVAILABLE']);
    expect(Object.isFrozen(f.bridge.getState())).toBe(true);
    stop();
    f.bridge.dispose();
  });

  it.each(['country', 'role', 'head', 'seat'] as const)(
    'rejects mismatched %s without exposing reasons as a current read',
    async (mismatch) => {
      const f = fixture(),
        real = f.client();
      const result = await real.readProjection(requestId());
      if (result.status !== 'PROJECTION') throw Error('Fixture failed');
      const changed = JSON.parse(JSON.stringify(result)) as Extract<
        ProjectionResult,
        { status: 'PROJECTION' }
      >;
      if (mismatch === 'country')
        Object.assign(changed.payload as object, {
          countryId: 'OTHER_COUNTRY',
        });
      if (mismatch === 'role')
        Object.assign(changed.payload as object, { officeId: 'SOCIAL' });
      if (mismatch === 'head') Object.assign(changed, { worldVersion: '1' });
      if (mismatch === 'seat')
        Object.assign(changed.authority, { seatRef: 'OTHER_SEAT' });
      const bridge = createCrisisReadBridge(
        () => ({ ...real, readProjection: async () => changed }),
        requestId,
      );
      const c = bridge.createController(f.binding, () => f.binding.view);
      await c.refresh();
      expect(bridge.getState()).toEqual({ status: 'ERROR', view: null });
      bridge.dispose();
      f.bridge.dispose();
    },
  );

  it.each(['missing', 'head', 'content'] as const)(
    'does not unwrap %s feedback or treat it as player content',
    async (kind) => {
      const f = fixture();
      const payload = f.payload as unknown as {
        feedback?: {
          sourceHead: { worldVersion: string };
          citizen: { items: unknown[] };
        };
      };
      if (kind === 'missing') delete payload.feedback;
      if (kind === 'head') payload.feedback!.sourceHead.worldVersion = '1';
      if (kind === 'content')
        payload.feedback!.citizen.items.push({
          origin: 'CITIZEN_PLAYER',
          text: 'MUST_NOT_DISPLAY',
        });
      await f.controller.refresh();
      const state = f.bridge.getState();
      expect(state.status).toBe('UNAVAILABLE');
      if (state.status !== 'UNAVAILABLE') throw Error('Missing state');
      expect(state.reasons).toContain('FEEDBACK_UNAVAILABLE');
      expect(state.reasons).not.toContain('MODEL_NOT_ADMITTED');
      expect(JSON.stringify(state)).not.toContain('MUST_NOT_DISPLAY');
      f.bridge.dispose();
    },
  );

  it.each(['session', 'country', 'role'] as const)(
    'clears immediately on %s loss',
    async (loss) => {
      const f = fixture();
      await f.controller.refresh();
      if (loss === 'session') f.invalidate();
      else
        f.setView(
          loss === 'country'
            ? { ...f.binding.view, countryDisplayId: '70' }
            : { ...f.binding.view, role: 'social' },
        );
      expect(f.bridge.getState()).toEqual({ status: 'UNBOUND' });
      expect(f.controller.getState().model).toBeNull();
      f.bridge.dispose();
    },
  );

  it('adds no session subscription and cleans existing client/controller subscriptions once', async () => {
    const f = officeProjectionFixture('finance');
    const original = f.config.session.onInvalidate,
      active = new Set<() => void>();
    const subscribe = vi.fn((fn: () => void) => {
      active.add(fn);
      const stop = original(fn);
      return () => {
        active.delete(fn);
        stop();
      };
    });
    Object.assign(f.config.session, { onInvalidate: subscribe });
    const bridge = createCrisisReadBridge(() => f.client(), requestId);
    const c = bridge.createController(f.binding, () => f.binding.view);
    expect(subscribe).toHaveBeenCalledTimes(2); // Existing client + controller only.
    await c.refresh();
    await c.refresh();
    expect(f.calls).toHaveLength(2);
    expect(active.size).toBe(2);
    bridge.dispose();
    bridge.dispose();
    expect(active.size).toBe(0);
  });

  it('clears prior reasons during original FINAL lookup and shares its single head-fenced refresh', async () => {
    const f = fixture();
    await f.controller.refresh();
    const seen: string[] = [];
    const stop = f.bridge.subscribe(() =>
      seen.push(f.bridge.getState().status),
    );
    await f.controller.lookupAndRefresh();
    expect(f.calls.map((call) => call.path)).toEqual([
      '/v1/test-only-read',
      '/v1/test-only-final',
      '/v1/test-only-read',
    ]);
    expect(f.controller.getState().model?.head.worldVersion).toBe('3');
    expect(seen).toEqual(['LOADING', 'LOADING', 'UNAVAILABLE']);
    // The old fixture feedback head stays 2: it cannot be presented at head 3.
    expect(f.bridge.getState()).toMatchObject({
      status: 'UNAVAILABLE',
      reasons: expect.arrayContaining(['FEEDBACK_UNAVAILABLE']),
    });
    stop();
    f.bridge.dispose();
  });

  it('fences a pending read across disconnect/reconnect', async () => {
    const f = officeProjectionFixture('finance'),
      real = f.client();
    let release!: (result: ProjectionResult) => void;
    const bridge = createCrisisReadBridge(
      () => ({
        ...real,
        readProjection: () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      }),
      requestId,
    );
    const old = bridge.createController(f.binding, () => f.binding.view);
    const pending = old.refresh();
    bridge.createController(null, () => null);
    release(await f.client().readProjection(requestId()));
    await pending;
    expect(bridge.getState()).toEqual({ status: 'UNBOUND' });
    bridge.dispose();
  });

  it.each(['DENIED', 'STALE', 'UNAVAILABLE'] as const)(
    'clears on actual read %s',
    async (status) => {
      const f = officeProjectionFixture('finance');
      const port: ProductionReadPort = {
        state: () => 'READ_ONLY_BOUND',
        readProjection: async () => ({ status }),
        lookupFinal: async () => ({ status }),
        disconnect: () => {},
      };
      const bridge = createCrisisReadBridge(() => port, requestId);
      const c = bridge.createController(f.binding, () => f.binding.view);
      await c.refresh();
      expect(bridge.getState().status).toBe(
        status === 'DENIED'
          ? 'UNBOUND'
          : status === 'STALE'
            ? 'STALE'
            : 'ERROR',
      );
      expect('reasons' in bridge.getState()).toBe(false);
      bridge.dispose();
    },
  );

  it('renders the original localized summary without data/clock/operation link; public summary remains UNBOUND', async () => {
    const f = fixture();
    await f.controller.refresh();
    const html = renderToStaticMarkup(
      createElement(CrisisSummary, {
        state: f.bridge.getState(),
        locale: 'en',
        href: null,
      }),
    );
    for (const label of [
      'MODEL_NOT_ADMITTED',
      'DISCLOSURE_UNAVAILABLE',
      'Actual shortfall',
      'System simulation',
      'Player content / diplomacy',
      'No data',
    ])
      expect(html).toContain(label);
    expect(html).not.toMatch(
      /<a |<button|TEST_WORLD|9007199254740993|serverNow|[\u3400-\u9fff]/u,
    );
    const publicHtml = renderToStaticMarkup(
      createElement(CrisisSummary, { locale: 'en' }),
    );
    expect(publicHtml).toContain('Official crisis data is not connected');
    expect(publicHtml).not.toContain('MODEL_NOT_ADMITTED');
    f.bridge.dispose();
  });

  it('mounts only inside the original open authorized drawer, unmounts on close/replacement/pagehide and removes its subscription', async () => {
    const f = fixture();
    const doc = new HostDocument('finance');
    const dialog = new HostElement('dialog', doc);
    doc.root.append(dialog);
    const mounts: HostElement[] = [];
    Object.defineProperty(HostElement.prototype, 'parentElement', {
      get() {
        return this.parent;
      },
      configurable: true,
    });
    doc.querySelector = (selector: string) =>
      selector.includes('data-office-projection-dialog')
        ? dialog.open
          ? dialog
          : null
        : selector === '.country-game'
          ? doc.root
          : null;
    const originalCreate = doc.createElement.bind(doc);
    doc.createElement = (tag: string) => {
      const el = originalCreate(tag);
      mounts.push(el);
      return el;
    };
    let mutation!: () => void;
    const observerStop = vi.fn();
    vi.stubGlobal(
      'MutationObserver',
      class {
        constructor(fn: () => void) {
          mutation = fn;
        }
        observe() {}
        disconnect = observerStop;
      },
    );
    const host = new EventTarget();
    const ui = installCrisisReadSurface(
      doc as unknown as Document,
      host as unknown as Window,
      f.bridge,
    );
    await f.controller.refresh();
    expect(createRoot).not.toHaveBeenCalled();
    dialog.open = true;
    mutation();
    expect(createRoot).toHaveBeenCalledTimes(1);
    expect(render.mock.calls[0]?.[0]).toMatchObject({
      props: { countryNumber: '01', href: null },
    });
    mutation();
    expect(createRoot).toHaveBeenCalledTimes(1);
    dialog.open = false;
    mutation();
    expect(unmount).toHaveBeenCalledTimes(1);
    dialog.open = true;
    mutation();
    expect(createRoot).toHaveBeenCalledTimes(2);
    dialog.replaceChildren();
    mutation();
    expect(createRoot).toHaveBeenCalledTimes(3);
    host.dispatchEvent(new Event('pagehide'));
    expect(observerStop).toHaveBeenCalledTimes(1);
    expect(f.bridge.getState().status).toBe('UNBOUND');
    expect(unmount).toHaveBeenCalledTimes(3);
    expect(mounts.length).toBe(3);
    ui.dispose();
    mutation();
    expect(createRoot).toHaveBeenCalledTimes(3);
    delete (HostElement.prototype as unknown as { parentElement?: unknown })
      .parentElement;
  });
});
