import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CrisisGeography } from '../../apps/world-web/src/map-explorer/CrisisGeography.js';
import {
  CrisisActionPage,
  CrisisSummary,
} from '../../apps/world-web/src/crisis-action/CrisisActionPage.js';
import {
  bindCrisisPresentation,
  crisisMapObjects,
  crisisPresentation,
  crisisSourcedFeedback,
  crisisVerifiedContributions,
  crisisWindow,
  type BoundCrisisView,
  type CrisisOffice,
  type CrisisPresentation,
} from '../../apps/world-web/src/crisis-action/model.js';
import {
  READ_OFFICES,
  type ProductionReadConfig,
} from '../../apps/world-web/src/production-read/contract.js';

const requireWeb = createRequire(
  new URL('../../apps/world-web/package.json', import.meta.url),
);
const reactDomClientModule = requireWeb.resolve('react-dom/client');
const { createElement } = requireWeb('react') as typeof import('react');
const { renderToStaticMarkup } = requireWeb(
  'react-dom/server',
) as typeof import('react-dom/server');

// OFFLINE TEST_ONLY. No seed, actor, admission, event or endpoint below exists.
function fixture(office: CrisisOffice = 'TRADE') {
  const identity = {
    worldId: 'TEST_WORLD',
    countryId: 'TEST_COUNTRY',
    officeId: office,
    scopeKey: `TEST_SCOPE_${office}`,
    authSubjectId: '22222222-2222-4222-8222-222222222222',
    authorizationRevision: 'TEST_REVISION',
    modelVersion: 'TEST_MODEL',
    projectionVersion: 'TEST_PROJECTION',
    classification: 'OFFICE_PRIVATE' as const,
  };
  let alive = true;
  const config: ProductionReadConfig = {
    identity,
    seatRef: 'TEST_SEAT',
    endpoints: {
      origin: 'https://test-only.example.invalid',
      projectionPath: '/v1/test-only-read',
      finalLookupPath: '/v1/test-only-final',
      deploymentRef: 'TEST_DEPLOYMENT',
    },
    world: {
      worldId: identity.worldId,
      seedRef: 'TEST_SEED',
      contentHash: `sha256:${'a'.repeat(64)}`,
      admissionRef: 'TEST_ADMISSION',
      minimumWorldVersion: '1',
    },
    currentIdentity: () => (alive ? identity : null),
    getAccessToken: async () => null,
    session: {
      sessionRef: 'TEST_SESSION',
      isCurrent: () => alive,
      onInvalidate: () => () => {},
    },
  };
  const authority = {
    source: 'SERVER_VERIFIED_READ_BINDING',
    capability: 'READ_AUTHORIZED_PROJECTION_AND_FINAL',
    identity,
    seatRef: config.seatRef,
    seatState: 'ACTIVE',
    seed: {
      worldId: identity.worldId,
      seedRef: config.world.seedRef,
      contentHash: config.world.contentHash,
      admissionRef: config.world.admissionRef,
    },
    readback: {
      worldId: identity.worldId,
      seedRef: config.world.seedRef,
      contentHash: config.world.contentHash,
      admissionRef: config.world.admissionRef,
      worldVersion: '2',
      eventSequence: '3',
      readbackRef: 'TEST_READBACK',
    },
  };
  const source = {
    sourceRef: 'TEST_SOURCE',
    version: '2',
    effectiveAt: '2026-10-12T00:00:00Z',
  };
  const presentation: CrisisPresentation = {
    ...source,
    worldId: identity.worldId,
    countryId: identity.countryId,
    countryLabel: 'TEST_ONLY_COUNTRY',
    eventId: 'TEST_EVENT',
    eventLabel: 'TEST_ONLY_CRISIS',
    worldVersion: '2',
    eventSequence: '3',
    officeId: office,
    clock: {
      realStartAt: '2026-10-12T00:00:00Z',
      realEndAt: '2026-10-26T00:00:00Z',
      serverNow: '2026-10-12T00:00:00Z',
      worldTimeLabel: 'TEST_ONLY_WORLD_DAY_140',
      worldRate: '10',
    },
    shortages: [
      {
        ...source,
        shortageId: 'TEST_SHORTAGE',
        resourceId: 'TEST_FOOD',
        label: 'TEST_ONLY_FOOD',
        unit: 'TEST_UNIT',
        current: '9007199254740993.25',
        target: '9007199254741093.25',
        gap: '100',
        basis: 'INVENTORY',
        expectedArrival: '50',
        locationId: 'TEST_A',
      },
    ],
    locations: [
      {
        ...source,
        locationId: 'TEST_A',
        label: 'TEST_ONLY_SITE_A',
        kind: 'SHORTAGE',
        geographyRef: 'TEST_GEOGRAPHY_A',
        mapSource: 'TEST_GEOGRAPHY',
        mapVersion: 'TEST_MAP_1',
      },
      {
        ...source,
        locationId: 'TEST_B',
        label: 'TEST_ONLY_SITE_B',
        kind: 'SUPPLY',
        geographyRef: 'TEST_GEOGRAPHY_B',
        mapSource: 'TEST_GEOGRAPHY',
        mapVersion: 'TEST_MAP_1',
      },
    ],
    routes: [
      {
        ...source,
        routeId: 'TEST_ROUTE',
        fromLocationId: 'TEST_A',
        toLocationId: 'TEST_B',
        geometryRef: 'TEST_ROUTE_GEOMETRY',
        mode: 'TEST_ONLY_MODE',
        passage: 'BLOCKED',
        validatedAt: source.effectiveAt,
      },
    ],
    tasks: [
      {
        ...source,
        taskId: 'TEST_TASK',
        label: 'TEST_ONLY_TASK',
        locationId: 'TEST_A',
        status: 'IN_TRANSIT',
        ownerLabel: null,
        requiredOffices: ['TRADE', 'FINANCE'],
        nextStep: null,
        resourcesLabel: null,
        expectedEffect: 'TEST_ONLY_FORECAST',
        evidenceRefs: [],
        allowedActions: [
          {
            actionId: 'TEST_ONLY_ALLOWED_ACTION',
            label: 'TEST_ONLY_SERVER_ACTION',
          },
        ],
      },
    ],
    contributions: [
      {
        ...source,
        contributionId: 'TEST_CONTRIBUTION',
        taskId: 'TEST_TASK',
        eventId: 'TEST_COMPLETION',
        contributorLabel: 'TEST_ONLY_ACTOR',
        locationId: 'TEST_A',
        kind: 'DELIVERY',
        resultLabel: 'TEST_ONLY_VERIFIED_RESULT',
        verifiedAt: source.effectiveAt,
        evidenceRef: 'TEST_EVIDENCE',
      },
    ],
    feedback: [
      {
        ...source,
        feedbackId: 'TEST_FEEDBACK',
        origin: 'GOVERNMENT_SIMULATION',
        text: 'TEST_ONLY_SIMULATION',
        generatedAt: source.effectiveAt,
        relatedEventIds: ['TEST_EVENT'],
        taskId: null,
        locationId: 'TEST_A',
      },
    ],
  };
  return {
    config,
    authority,
    presentation,
    revoke: () => {
      alive = false;
    },
    restore: () => {
      alive = true;
    },
  };
}

describe('crisis read-only presentation / OFFLINE TEST_ONLY', () => {
  it.each(READ_OFFICES)(
    'binds %s only to its exact authorized office',
    (office) => {
      const f = fixture(office);
      expect(
        bindCrisisPresentation(f.presentation, f.authority, f.config),
      ).not.toBeNull();
      expect(
        bindCrisisPresentation(
          {
            ...f.presentation,
            officeId: office === 'CAPTAIN' ? 'TRADE' : 'CAPTAIN',
          },
          f.authority,
          f.config,
        ),
      ).toBeNull();
    },
  );

  it('rejects mismatched world, country, read head, seed hash and absent sources', () => {
    const f = fixture();
    for (const override of [
      { worldId: 'OTHER_WORLD' },
      { countryId: 'OTHER_COUNTRY' },
      { worldVersion: '3' },
      { eventSequence: '4' },
      { sourceRef: '' },
    ]) {
      expect(
        bindCrisisPresentation(
          { ...f.presentation, ...override },
          f.authority,
          f.config,
        ),
      ).toBeNull();
    }
    expect(
      bindCrisisPresentation(
        f.presentation,
        {
          ...f.authority,
          seed: {
            ...f.authority.seed,
            contentHash: `sha256:${'b'.repeat(64)}`,
          },
        },
        f.config,
      ),
    ).toBeNull();
  });

  it('does not accept a structural forged view and retires a revoked view permanently', () => {
    const f = fixture();
    const view = bindCrisisPresentation(f.presentation, f.authority, f.config)!;
    expect(
      crisisPresentation({
        status: 'CURRENT',
        view: {
          presentation: f.presentation,
          readbackRef: 'TEST_READBACK',
        } as BoundCrisisView,
      }),
    ).toBeNull();
    f.revoke();
    expect(crisisPresentation({ status: 'CURRENT', view })).toBeNull();
    expect(
      bindCrisisPresentation(f.presentation, f.authority, f.config),
    ).toBeNull();
    f.restore();
    expect(crisisPresentation({ status: 'CURRENT', view })).toBeNull();
  });

  it('freezes the read snapshot and preserves exact values without arrival netting', () => {
    const f = fixture();
    const view = bindCrisisPresentation(f.presentation, f.authority, f.config)!;
    expect(Object.isFrozen(view.presentation.shortages[0])).toBe(true);
    const html = renderToStaticMarkup(
      createElement(CrisisActionPage, { state: { status: 'CURRENT', view } }),
    );
    expect(html).toContain('9007199254740993.25');
    expect(html).toContain('100');
    expect(html).toContain('预估到货');
    expect(html).toContain('不提前抵扣缺口');
    expect(html).not.toContain('TEST_ONLY_FORECAST'); // unselected task details
  });

  it('keeps 14 real days independent of 10x/100x world time, timezone and browser time', () => {
    const clock = fixture().presentation.clock!;
    expect(crisisWindow(clock)).toEqual({
      status: 'OPEN',
      remainingLabel: '14 天 0 小时 0 分钟',
    });
    expect(
      crisisWindow({
        ...clock,
        worldRate: '100',
        worldTimeLabel: 'ANY_WORLD_TIME',
        serverNow: '2026-10-12T08:00:00+08:00',
      }),
    ).toEqual(crisisWindow(clock));
    expect(crisisWindow({ ...clock, serverNow: clock.realEndAt }).status).toBe(
      'CLOSED',
    );
    expect(
      crisisWindow({ ...clock, serverNow: '2026-10-11T00:00:00Z' }).status,
    ).toBe('UPCOMING');
    expect(
      crisisWindow({ ...clock, serverNow: '2026-10-12T00:00:00' }).status,
    ).toBe('UNKNOWN');
    expect(crisisWindow(null).status).toBe('UNKNOWN');
  });

  it('never draws guessed geography or unvalidated/disconnected routes', () => {
    const f = fixture();
    expect(crisisMapObjects(f.presentation).routes[0]?.passage).toBe('BLOCKED');
    expect(
      crisisMapObjects({
        ...f.presentation,
        routes: f.presentation.routes.map((route) => ({
          ...route,
          validatedAt: null,
        })),
      }).routes,
    ).toEqual([]);
    expect(
      crisisMapObjects({
        ...f.presentation,
        routes: f.presentation.routes.map((route) => ({
          ...route,
          toLocationId: 'MISSING',
        })),
      }).routes,
    ).toEqual([]);
    const missing = {
      ...f.presentation,
      locations: f.presentation.locations.map((location) => ({
        ...location,
        mapSource: '',
      })),
    };
    expect(crisisMapObjects(missing)).toEqual({ locations: [], routes: [] });
  });

  it('contribution requires a verified completion event and does not count it twice', () => {
    const f = fixture(),
      contribution = f.presentation.contributions[0]!;
    const view = {
      ...f.presentation,
      contributions: [
        contribution,
        { ...contribution, contributionId: 'DUPLICATE' },
        { ...contribution, eventId: 'UNVERIFIED', verifiedAt: null },
        { ...contribution, eventId: 'UNSOURCED', evidenceRef: null },
      ],
    };
    expect(crisisVerifiedContributions(view)).toEqual([contribution]);
    expect(crisisVerifiedContributions(null)).toEqual([]);
  });

  it('keeps player diplomacy separate from system simulation with provenance', () => {
    const f = fixture(),
      item = f.presentation.feedback[0]!;
    const p = {
      ...f.presentation,
      feedback: [
        item,
        {
          ...item,
          feedbackId: 'TEST_PLAYER',
          origin: 'PLAYER_DIPLOMACY' as const,
          text: 'TEST_ONLY_PLAYER',
        },
        { ...item, sourceRef: '', text: 'UNSOURCED_CONTENT' },
      ],
    };
    expect(crisisSourcedFeedback(p)).toHaveLength(2);
    const view = bindCrisisPresentation(p, f.authority, f.config)!;
    const html = renderToStaticMarkup(
      createElement(CrisisSummary, { state: { status: 'CURRENT', view } }),
    );
    expect(html).toContain('他国回应 · 系统模拟：TEST_ONLY_SIMULATION');
    expect(html).toContain('玩家外交：TEST_ONLY_PLAYER');
    expect(html).not.toContain('UNSOURCED_CONTENT');
    expect(html).toContain('TEST_ONLY_FOOD 100 TEST_UNIT');
  });

  it.each([
    ['CITIZEN_SIMULATION', '民众声音 · 系统模拟'],
    ['CITIZEN_PLAYER', '民众声音 · 玩家内容'],
  ] as const)(
    'preserves %s provenance on World and Country summaries',
    (origin, label) => {
      const f = fixture();
      const p = {
        ...f.presentation,
        feedback: [
          {
            ...f.presentation.feedback[0]!,
            origin,
            text: 'TEST_CITIZEN_VOICE',
          },
        ],
      };
      const view = bindCrisisPresentation(p, f.authority, f.config)!;
      const html = renderToStaticMarkup(
        createElement(CrisisSummary, { state: { status: 'CURRENT', view } }),
      );
      expect(html).toContain(`${label}：TEST_CITIZEN_VOICE`);
    },
  );

  it.each(['UNBOUND', 'LOADING', 'DENIED'] as const)(
    'renders honest %s emptiness and never fills public placeholders',
    (status) => {
      const html = renderToStaticMarkup(
        createElement(CrisisActionPage, {
          state: { status },
          countryLabel: 'DISPLAY_COUNTRY',
        }),
      );
      expect(html).toContain('暂无');
      expect(html).toContain('待权威');
      expect(html).toContain('前14天（两周）');
      expect(html).toContain('目标 10× · 尚未绑定');
      expect(html).toContain('他国回应 · 系统模拟');
      expect(html).toContain('玩家外交');
      expect(html).not.toContain('TEST_ONLY');
      expect(html).not.toContain('TEST_SOURCE');
    },
  );

  it.each(['ERROR', 'STALE'] as const)(
    'labels %s last reliable data and keeps task states independent',
    (status) => {
      const f = fixture(),
        view = bindCrisisPresentation(f.presentation, f.authority, f.config)!;
      const html = renderToStaticMarkup(
        createElement(CrisisActionPage, {
          state: { status, view },
          onRefresh: () => {},
        }),
      );
      expect(html).toContain('重新读取');
      expect(html).toContain('TEST_ONLY_TASK');
      expect(html).toContain('运输中');
      expect(html).not.toContain('已完成');
    },
  );

  it('map host receives only vetted source references and no invented geometry', () => {
    const f = fixture(),
      view = bindCrisisPresentation(f.presentation, f.authority, f.config)!;
    let seen = false;
    renderToStaticMarkup(
      createElement(CrisisActionPage, {
        state: { status: 'CURRENT', view },
        renderMap: (slot) => {
          seen = true;
          expect(slot.selectedLocationId).toBeNull();
          expect(slot.locations).toHaveLength(2);
          expect(slot.routes[0]?.geometryRef).toBe('TEST_ROUTE_GEOMETRY');
          expect(slot.routes[0]).not.toHaveProperty('coordinates');
          return createElement('div', null, 'TEST_ONLY_MAP_SLOT');
        },
      }),
    );
    expect(seen).toBe(true);
  });
});

describe('crisis static canonical display extent', () => {
  it.each(Array.from({ length: 70 }, (_, i) => String(i + 1).padStart(2, '0')))(
    'contains country %s camera within the immutable terrain extent',
    (number) => {
      const html = renderToStaticMarkup(
        createElement(CrisisGeography, { countryNumber: number }),
      );
      const values = html
        .match(/viewBox="([^"]+)"/)![1]!
        .split(' ')
        .map(Number);
      const [x, y, width, height] = values;
      expect(values.every(Number.isFinite)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(width).toBeGreaterThan(0);
      expect(height).toBeGreaterThan(0);
      expect(x! + width!).toBeLessThanOrEqual(1774.000001);
      expect(y! + height!).toBeLessThanOrEqual(887.000001);
      expect(html).toContain('未接危机点位或运输路线');
      expect(html).not.toContain('TEST_');
    },
  );
});

describe('legacy crisis summary stylesheet wiring', () => {
  it('ships the summary styles inside the injected legacy stylesheet', async () => {
    const { readFile } = await import('node:fs/promises');
    const entry = await readFile(
      'apps/world-web/src/brand-shell/entry.ts',
      'utf8',
    );
    expect(entry).toContain('../crisis-action/crisis-action.css?inline');
    expect(entry).toMatch(/style\.textContent = css \+ '\\n' \+ crisisCss/);
  });
});

describe('legacy country crisis summary route mount (offline DOM branch)', () => {
  afterEach(() => {
    vi.doUnmock(reactDomClientModule);
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function loadRoute(href: string, base = '/') {
    vi.resetModules();
    vi.stubEnv('BASE_URL', base);
    type Host = { className: string; isConnected: boolean };
    const hosts: Host[] = [];
    const roots: {
      render: ReturnType<typeof vi.fn>;
      unmount: ReturnType<typeof vi.fn>;
    }[] = [];
    let mutation = () => {};
    const parent = {
      querySelector: () => hosts.find((host) => host.isConnected) ?? null,
    };
    const makeScene = () => ({
      isConnected: true,
      parentElement: parent,
      before(host: Host) {
        host.isConnected = true;
        hosts.push(host);
      },
    });
    let scene: ReturnType<typeof makeScene> | null = makeScene();
    const document = {
      body: { dataset: {} },
      querySelector(selector: string) {
        // Existing chrome is already mounted. This test exercises the actual
        // route/observer/React mount branch, not the separate markup installer.
        if (selector === '[data-econmind-brand-header]') return {};
        return selector === '.national-world' ? scene : null;
      },
      createElement: () => ({ className: '', isConnected: false }),
    };
    const fetcher = vi.fn();
    vi.stubGlobal('document', document);
    vi.stubGlobal('window', { location: new URL(href) });
    vi.stubGlobal('fetch', fetcher);
    vi.stubGlobal(
      'MutationObserver',
      class {
        constructor(callback: () => void) {
          mutation = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    // Only the DOM renderer is recorded; all actual entry/route/component/
    // stylesheet/legacy source modules remain real imports. This is not a
    // browser-rendering claim. CrisisSummary is separately rendered below.
    // Resolve from the same application package as entry.ts. A bare test-root
    // mock misses this module when pnpm has no root react-dom dependency.
    vi.doMock(reactDomClientModule, () => ({
      createRoot: vi.fn(() => {
        const root = { render: vi.fn(), unmount: vi.fn() };
        roots.push(root);
        return root;
      }),
    }));
    const renderer = await import(reactDomClientModule);
    expect(vi.isMockFunction(renderer.createRoot)).toBe(true);
    await import('../../apps/world-web/src/brand-shell/entry.js');
    return {
      hosts,
      roots,
      fetcher,
      mutation: () => mutation(),
      removeHost: () => {
        for (const host of hosts) host.isConnected = false;
      },
      removeScene: () => {
        if (scene) scene.isConnected = false;
        scene = null;
      },
      replaceScene: () => {
        scene = makeScene();
      },
    };
  }

  it.each([
    ['https://test.invalid/season1-immersive/', '/'],
    ['https://test.invalid/season1-immersive/index.html', '/'],
    [
      'https://test.invalid/econmind-os-world-simulation/season1-immersive/',
      '/econmind-os-world-simulation/',
    ],
    [
      'https://test.invalid/econmind-os-world-simulation/season1-immersive/index.html',
      '/econmind-os-world-simulation/',
    ],
    [
      'https://test.invalid/season1-immersive/index.html?role=captain&country=01#country',
      '/',
    ],
    [
      'https://test.invalid/prefix/season1-immersive/?country=01#country',
      '/prefix/',
    ],
  ])(
    'mounts exactly one UNBOUND summary on actual pathname %s',
    async (href, base) => {
      const route = await loadRoute(href!, base!);
      expect(route.roots).toHaveLength(1);
      route.mutation();
      route.mutation();
      expect(route.roots).toHaveLength(1);
      expect(route.hosts.filter((host) => host.isConnected)).toHaveLength(1);
      const element = route.roots[0]!.render.mock.calls[0]![0];
      const html = renderToStaticMarkup(element);
      expect(html).toContain('正式危机数据尚未接入');
      expect(html).not.toContain('TEST_ONLY');
      expect(element.props).not.toHaveProperty('state');
      const target = new URL(element.props.href);
      expect(target.pathname).toBe(base);
      expect(target.searchParams.get('atlas')).toBe('crisis');
      expect(target.searchParams.get('country')).toBe(
        new URL(href!).searchParams.get('country'),
      );
      expect(route.fetcher).not.toHaveBeenCalled();
    },
  );

  it.each([
    '/season1-immersive',
    '/season1-immersive/index.htm',
    '/season1-immersive/index.html/',
    '/season1-immersive/index.html/extra',
    '/season1-immersive/index.html.extra',
    '/season1-immersive//',
    '/season1-immersive-extra/',
    '/not-season1-immersive/index.html',
    '/prefix/season1-immersive/countries/01/',
    '/unrelated/?next=/season1-immersive/index.html#/season1-immersive/',
  ])(
    'does not mount a summary for similar or suffixed path %s',
    async (pathname) => {
      const route = await loadRoute(`https://test.invalid${pathname}`);
      route.mutation();
      expect(route.roots).toHaveLength(0);
      expect(route.hosts).toHaveLength(0);
      expect(route.fetcher).not.toHaveBeenCalled();
    },
  );

  it.each(['/', '/index.html'])(
    'retains disconnected-host/subtree cleanup and remount on alias %s',
    async (suffix) => {
      const route = await loadRoute(
        `https://test.invalid/season1-immersive${suffix}`,
      );
      expect(route.roots).toHaveLength(1);
      const first = route.roots[0]!;
      route.removeHost();
      route.mutation();
      expect(first.unmount).toHaveBeenCalledTimes(1);
      expect(route.roots).toHaveLength(2);
      route.mutation();
      expect(route.roots).toHaveLength(2);
      const second = route.roots[1]!;
      route.removeHost();
      route.removeScene();
      route.mutation();
      expect(second.unmount).toHaveBeenCalledTimes(1);
      route.mutation();
      expect(second.unmount).toHaveBeenCalledTimes(1);
      route.replaceScene();
      route.mutation();
      expect(route.roots).toHaveLength(3);
      expect(route.hosts.filter((host) => host.isConnected)).toHaveLength(1);
    },
  );
});
