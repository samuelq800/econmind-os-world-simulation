import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

// Exercise the shipped script functions directly. No page, economic fixture,
// official source values, host binding or endpoint is invented here.
const base = 'apps/world-web/public/season1-immersive/';
const journey = readFileSync(base + 'journey.js', 'utf8');
const worldClock = readFileSync(base + 'world-clock.js', 'utf8');
const countryContext = readFileSync(base + 'country-context.js', 'utf8');
const roles = [
  'captain',
  'finance',
  'central_bank',
  'industry',
  'trade',
  'social',
];
function line(source: string, prefix: string) {
  const found = source.split('\n').find((item) => item.startsWith(prefix));
  if (!found) throw Error(`Missing shipped function: ${prefix}`);
  return found;
}

function journeyPort(role: string, scoped = true) {
  let tick!: () => void;
  const patch = vi.fn();
  const mount = vi.fn();
  const route = vi.fn();
  const clear = vi.fn();
  const panel = {
    innerHTML: 'Loading selected country source',
    remove: vi.fn(),
  };
  const sandbox = {
    countryScope: scoped ? '01' : null,
    role,
    view: null,
    exploring: false,
    journeyPhase: 'brief',
    journeyRoom: 0,
    officeGroup: 0,
    journeyRoles: { [role]: { object: 'Local sample' } },
    roles: { [role]: { name: role } },
    officeGroups: { [role]: [['Office', []]] },
    catalog: { modules: [] },
    data: { policies: {} },
    patchSceneHTML: patch,
    mountClock: mount,
    pathTo: route,
    journeyArtwork: () => '',
    jHeader: () => '',
    jSteps: () => '',
    journeyChoices: () => [],
    jNav: () => '',
    briefContent: () => 'Local sample',
    recentChanges: () => '',
    jButton: () => '',
    document: {
      body: { classList: { add: vi.fn() } },
      querySelector: () => panel,
    },
    location: { hash: '' },
    window: { GameTest: false as unknown, JourneyTest: undefined as unknown },
    setInterval: (fn: () => void) => {
      tick = fn;
      return 7;
    },
    clearInterval: clear,
  };
  const api = runInNewContext(
    [
      line(journey, 'function renderJourney('),
      line(journey, 'function renderOffice('),
      line(journey, 'function goJourney('),
      line(journey, 'const initJourney='),
      '({renderJourney,renderOffice,goJourney})',
    ].join('\n'),
    sandbox,
  ) as Record<string, () => void>;
  return {
    sandbox,
    api,
    tick: () => tick(),
    patch,
    mount,
    route,
    clear,
    panel,
  };
}

describe('official country loading never falls back to a local sample', () => {
  it.each(roles)(
    '%s slow or late source boot does not start a sample journey',
    (role) => {
      const f = journeyPort(role);
      f.tick(); // Source and catalogue have not resolved.
      f.sandbox.window.GameTest = {};
      f.tick(); // Catalogue is ready before selected-country source.
      expect(f.patch).not.toHaveBeenCalled();
      expect(f.mount).not.toHaveBeenCalled();
      expect(f.route).not.toHaveBeenCalled();
      expect(f.sandbox.window.JourneyTest).toBeUndefined();
      expect(f.clear).toHaveBeenCalled();
    },
  );
  it.each(roles)(
    '%s direct legacy render/navigation cannot display sample outcomes',
    (role) => {
      const f = journeyPort(role);
      f.api.goJourney!();
      f.api.renderJourney!();
      f.api.renderOffice!();
      expect(f.patch).not.toHaveBeenCalled();
      expect(f.mount).not.toHaveBeenCalled();
      expect(f.route).not.toHaveBeenCalled();
      expect(f.sandbox.view).toBeNull();
    },
  );
  it('rapid role navigation and late callbacks in retired documents remain blocked', () => {
    const pages = roles.map((role) => journeyPort(role));
    for (const page of pages) page.tick();
    for (const page of pages.reverse()) {
      page.sandbox.window.GameTest = {};
      page.tick();
      page.api.goJourney!();
      page.api.renderJourney!();
      expect(page.patch).not.toHaveBeenCalled();
      expect(page.mount).not.toHaveBeenCalled();
      expect(page.route).not.toHaveBeenCalled();
    }
  });
  it('actual failed-source handler stays visible after late catalogue readiness', async () => {
    const f = journeyPort('finance');
    const start = countryContext.indexOf('countryDataReady.catch(()=>');
    const end = countryContext.indexOf('});}', start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const toast = vi.fn();
    await runInNewContext(countryContext.slice(start, end + 3), {
      countryDataReady: Promise.reject(Error('Source unavailable')),
      document: { querySelector: () => f.panel },
      toast,
    });
    f.sandbox.window.GameTest = {};
    f.tick();
    f.api.renderJourney!();
    expect(f.panel.innerHTML).toContain('Official opening data unavailable');
    expect(f.panel.innerHTML).toContain('No sample values were substituted');
    expect(f.patch).not.toHaveBeenCalled();
    expect(f.mount).not.toHaveBeenCalled();
  });
  it('non-country sample navigation and rendering are preserved, not deleted', () => {
    const f = journeyPort('finance', false);
    f.sandbox.window.GameTest = {};
    f.tick();
    expect(f.patch).toHaveBeenCalledOnce();
    expect(f.mount).toHaveBeenCalledOnce();
    expect(f.route).toHaveBeenCalledWith('journey/finance/brief/0');
    expect(f.sandbox.window.JourneyTest).toBeDefined();
  });
  it('country mount/update never accesses the local clock DOM', () => {
    const access = vi.fn(() => {
      throw Error('LOCAL_CLOCK_DOM_REACHED');
    });
    const api = runInNewContext(
      [
        line(worldClock, 'function mountClock('),
        line(worldClock, 'function updateClock('),
        '({mountClock,updateClock})',
      ].join('\n'),
      {
        countryScope: '01',
        window: { GameTest: {} },
        s: { day: 128 },
        document: { querySelector: access },
      },
    ) as Record<string, () => void>;
    api.mountClock!();
    api.updateClock!();
    expect(access).not.toHaveBeenCalled();
  });
  it('non-country sample clock mount is preserved', () => {
    const append = vi.fn(),
      update = vi.fn(),
      el = { setAttribute: vi.fn(), innerHTML: '', id: '' };
    const api = runInNewContext(
      line(worldClock, 'function mountClock(') + ';mountClock',
      {
        countryScope: null,
        window: { GameTest: {} },
        clockMarkup: () => 'Local sample clock',
        updateClock: update,
        document: {
          querySelector: () => null,
          createElement: () => el,
          body: { append },
        },
      },
    ) as () => void;
    api();
    expect(append).toHaveBeenCalledWith(el);
    expect(update).toHaveBeenCalledOnce();
  });
});
