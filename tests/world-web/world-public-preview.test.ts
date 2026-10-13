import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { createElement } from '../../apps/world-web/node_modules/react';
import { renderToStaticMarkup } from '../../apps/world-web/node_modules/react-dom/server';
import {
  WorldExplorer,
  ExactOfficialValue,
  OfficialFacilityFacts,
  OfficialSourceDetails,
  OfficialSourceState,
  currentExplorerSource,
  requestExplorerCountry,
  officialFacilityPoint,
  containedCountrySceneFrame,
  type ExplorerCountryBinding,
} from '../../apps/world-web/src/map-explorer/WorldExplorer.js';
import {
  createOfficialExplorerCountryLoader,
  type OfficialExplorerCountry,
  type OfficialExplorerCountryLoadResult,
  type OfficialExplorerCountryLoadState,
} from '../../apps/world-web/src/official-data/official-explorer-country.js';

import { afterEach, describe, expect, it, vi } from 'vitest';

const runtimeApp = readFileSync('apps/world-web/src/App.tsx', 'utf8');
const atlasPage = readFileSync(
  'apps/world-web/src/map-explorer/WorldExplorer.tsx',
  'utf8',
);
const commandPage = readFileSync('apps/world-web/command.html', 'utf8');
const viteConfig = readFileSync('apps/world-web/vite.config.ts', 'utf8');
const deploymentWorkflow = readFileSync(
  '.github/workflows/deploy-world-web.yml',
  'utf8',
);
const candidateWorkflow = readFileSync(
  '.github/workflows/world-web-atlas-candidate.yml',
  'utf8',
);
const landingPage = readFileSync('apps/world-web/index.html', 'utf8');

describe('public World preview deployment', () => {
  it('bounds desktop country height while allowing mobile document flow and long field values', () => {
    const css = readFileSync(
      'apps/world-web/src/map-explorer/world-explorer.css',
      'utf8',
    );
    const country =
      /:root \.world-explorer\.explorer-country-view\s*\{([^}]*)\}/.exec(
        css,
      )?.[1];
    expect(country).toContain('height: max(650px, 100dvh);');
    expect(country).toContain('flex: none;');
    const mobile = css.slice(css.indexOf('@media (max-width: 900px)'));
    expect(mobile).toMatch(
      /:root \.world-explorer\.explorer-country-view\s*\{[^}]*height: auto;/,
    );
    expect(mobile).toContain(
      'grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);',
    );
    expect(css).toMatch(
      /\.facility-inspector dd\s*\{[^}]*overflow-wrap: anywhere;/,
    );
  });

  it('moves complete facility status into click-open details instead of covering the scene with cards', async () => {
    const css = readFileSync(
      'apps/world-web/src/map-explorer/world-explorer.css',
      'utf8',
    );
    const label = /\.explorer-site \.site-label\s*\{([^}]*)\}/.exec(css)?.[1];
    const status = /\.explorer-site \.site-label em\s*\{([^}]*)\}/.exec(
      css,
    )?.[1];
    expect(label).toContain('min-width: 0;');
    expect(status).toContain('white-space: normal;');
    expect(status).toContain('overflow-wrap: anywhere;');
    expect(status).not.toMatch(
      /overflow:\s*hidden|text-overflow|line-clamp|display:\s*none/,
    );
    const data = await officialCountry('54');
    const facts = renderToStaticMarkup(
      createElement(OfficialFacilityFacts, { data, index: 0 }),
    );
    expect(facts).toContain(data.facilities[0]!.record.lifecycle);
    expect(facts).toContain(data.facilities[0]!.id);
    const markup = renderCountry('54', { kind: 'ready', data });
    expect(markup).not.toContain('class="explorer-site');
    expect(markup).not.toContain('class="explorer-leaders');
  });

  it('opens the atlas at the root and retains the selected national page', () => {
    expect(runtimeApp).toContain('atlas === null');
    expect(runtimeApp).toContain('<WorldExplorer />');
    expect(atlasPage).toContain('data-mosaic-country={territory.number}');
    expect(atlasPage).toContain('visibleDetailMaps.map((map) =>');
    expect(atlasPage).toContain('放大后按需叠加 70 国地理细图');
    expect(runtimeApp).toContain('Open national command');
    expect(runtimeApp).toContain('./command.html');
    expect(runtimeApp).toContain('does not connect to World State');
    expect(runtimeApp).not.toContain('fetch(');
    expect(runtimeApp).not.toContain('@econmind/core');
    expect(commandPage).toContain('/src/prototype/main.tsx');
    expect(commandPage).toContain('noindex,nofollow');
  });

  it('builds both public HTML entries and deploys only static web output', () => {
    expect(viteConfig).toContain("resolve(worldWebRoot, 'command.html')");
    expect(viteConfig).toContain("'/econmind-os-world-simulation/'");
    expect(deploymentWorkflow).toContain('workflow_dispatch:');
    expect(deploymentWorkflow).toContain('      - main');
    expect(landingPage).toContain('<div id="root"></div>');
    expect(landingPage).toContain('src="/src/main.tsx"');
    expect(landingPage).toContain(
      'season1-immersive/?role=finance&amp;country=01#country',
    );
    expect(landingPage).not.toContain('http-equiv="refresh"');
    expect(deploymentWorkflow).toContain(
      'pnpm --filter @econmind/world-web build',
    );
    expect(deploymentWorkflow).toContain('path: apps/world-web/dist');
    expect(deploymentWorkflow).not.toContain('SUPABASE');
    expect(deploymentWorkflow).not.toContain('WORLD_API_');
  });

  it('keeps atlas candidate CI separate from Pages deployment', () => {
    expect(candidateWorkflow).toContain('pull_request:');
    expect(candidateWorkflow).toContain('contents: read');
    expect(candidateWorkflow).toContain('pnpm install --frozen-lockfile');
    expect(candidateWorkflow).toContain('pnpm test:authoritative-ui');
    expect(candidateWorkflow).not.toContain('deploy-pages');
    expect(candidateWorkflow).not.toContain('SUPABASE');
    expect(candidateWorkflow).not.toContain('secrets.');
  });

  it('builds and validates assets using the configured Pages site path before upload', () => {
    const configure = deploymentWorkflow.indexOf(
      '      - name: Configure Pages',
    );
    const build = deploymentWorkflow.indexOf(
      '      - name: Build the non-authoritative World web preview',
    );
    const validate = deploymentWorkflow.indexOf(
      '      - name: Verify static assets against the configured Pages path',
    );
    const upload = deploymentWorkflow.indexOf(
      '      - name: Upload static World preview',
    );
    expect(configure).toBeGreaterThan(-1);
    expect(build).toBeGreaterThan(configure);
    expect(validate).toBeGreaterThan(build);
    expect(upload).toBeGreaterThan(validate);
    expect(deploymentWorkflow.slice(configure, build)).toContain('id: pages');
    for (const step of [
      deploymentWorkflow.slice(build, validate),
      deploymentWorkflow.slice(validate, upload),
    ]) {
      expect(step).toContain(
        'WORLD_WEB_PUBLIC_BASE_PATH: ${{ steps.pages.outputs.base_path }}/',
      );
    }
    expect(deploymentWorkflow).not.toContain('vars.WORLD_WEB_PUBLIC_BASE_PATH');
    expect(deploymentWorkflow).toContain(
      'node scripts/check-world-web-public-base.mjs "$WORLD_WEB_PUBLIC_BASE_PATH"',
    );
  });
});

const officialLoader = () =>
  createOfficialExplorerCountryLoader({
    baseUrl: 'https://fixture.invalid/world/',
    crypto: webcrypto as unknown as Pick<Crypto, 'subtle'>,
    fetcher: (async (url) =>
      new Response(
        readFileSync(
          `apps/world-web/public/season1-immersive/countries/data/${/(\d{2})\.json$/.exec(String(url))![1]}.json`,
        ),
        { headers: { 'content-type': 'application/json' } },
      )) as typeof fetch,
  });
async function officialCountry(
  number: string,
): Promise<OfficialExplorerCountry> {
  const result = await officialLoader().load(number);
  if (result.kind !== 'ready')
    throw Error(`${number}: ${JSON.stringify(result)}`);
  return result.data;
}
function renderCountry(
  number: string,
  state: OfficialExplorerCountryLoadState,
  bindingCountry = `visual-territory-${number}`,
) {
  vi.stubGlobal('window', {
    location: { search: `?atlas=explorer&country=${number}&view=scene` },
  });
  return renderToStaticMarkup(
    createElement(WorldExplorer, {
      initialOfficialSource: { countryId: bindingCountry, state },
    }),
  );
}

describe('atlas official opening numbers and complete facility records', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(Array.from({ length: 70 }, (_, i) => String(i + 1).padStart(2, '0')))(
    'separates country %s HD illustration from all geographic overlays and preserves its full directory',
    async (number) => {
      const data = await officialCountry(number);
      const markup = renderCountry(number, { kind: 'ready', data });
      expect(markup).toContain(`data-country-scene="${number}"`);
      expect(markup).toContain('preserveAspectRatio="xMidYMid meet"');
      expect(markup).toContain('data-explorer-view="scene"');
      expect(markup).not.toContain('data-explorer-geography="true"');
      expect(markup).not.toContain('data-regional-terrain="true"');
      expect(markup).not.toContain('data-distance-fade="country-outline"');
      const caption = markup.match(
        /class="explorer-map-caption[^>]*>(.*?)<\/div>/s,
      )?.[1];
      expect(caption?.includes(' km')).toBe(false);
      expect(caption?.includes('<b>')).toBe(false);
      expect(markup).toContain('非地理比例');
      expect(markup).toContain('>高清场景</button>');
      expect(markup).toContain('>地理地图</button>');
      // Country identity and controls occupy normal flow before the canvas.
      expect(markup.indexOf('explorer-country-heading')).toBeLessThan(
        markup.indexOf('class="explorer-viewport'),
      );
      expect(markup).not.toContain(
        'class="explorer-heading explorer-floating"',
      );
      expect(markup.match(/data-official-facility=/g)).toHaveLength(
        data.facilities.length,
      );
      if (number === '58')
        expect(markup).not.toContain('class="explorer-facility-dot');
    },
  );

  it.each(['01', '32', '38', '54', '58', '70'])(
    'opens country %s on its unchanged original illustration by default',
    (number) => {
      vi.stubGlobal('window', {
        location: { search: `?atlas=explorer&country=${number}` },
      });
      const markup = renderToStaticMarkup(createElement(WorldExplorer));
      expect(markup).toContain(`data-country-scene="${number}"`);
      expect(markup).toContain('data-explorer-view="scene"');
      expect(markup).toContain('preserveAspectRatio="xMidYMid meet"');
      expect(markup).not.toContain('data-explorer-geography="true"');
      expect(markup).toContain('展开国家资料');
    },
  );

  it('keeps canonical geography as an explicit country view', () => {
    vi.stubGlobal('window', {
      location: { search: '?atlas=explorer&country=54&view=geography' },
    });
    const markup = renderToStaticMarkup(createElement(WorldExplorer));
    expect(markup).toContain('data-explorer-view="geography"');
    expect(markup).toContain('data-explorer-geography="true"');
    expect(markup).toContain('data-distance-fade="country-outline"');
    expect(markup).not.toContain('data-country-scene=');
    expect(markup).toContain('展开国家资料');
  });

  it('retains actual geography in the overview rather than removing it globally', () => {
    vi.stubGlobal('window', { location: { search: '?atlas=explorer' } });
    const markup = renderToStaticMarkup(createElement(WorldExplorer));
    expect(markup).toContain('data-explorer-geography="true"');
    expect(markup).toContain('data-explorer-view="geography"');
    expect(markup).toContain('data-country="visual-territory-54"');
    expect(markup).not.toContain('data-country-scene=');
    expect(markup).toContain(' km');
  });

  it.each(['01', '70'])(
    'shows exact %s source population, facilities, deposits and regions',
    async (number) => {
      const data = await officialCountry(number);
      const markup = renderCountry(number, { kind: 'ready', data });
      expect(markup).toContain(
        data.officialSource!.fields['/profile/population']!.exact,
      );
      expect(markup).toContain('STATIC_BASELINE');
      expect(markup).toContain('非实时 World State');
      expect(markup).toContain('图内旧文字不是数值来源');
      expect(markup).not.toContain('情景人口');
      expect(markup).not.toContain('精确值缺失');
      expect([...markup.matchAll(/data-official-facility="/g)]).toHaveLength(
        number === '01' ? 16 : 14,
      );
      for (const resource of data.resources)
        expect(markup).toContain(`data-resource-id="${resource.id}"`);
      for (const region of data.regions)
        expect(markup).toContain(`data-region-id="${region.id}"`);
      for (let index = 0; index < data.facilities.length; index++) {
        const inspector = renderToStaticMarkup(
          createElement(OfficialFacilityFacts, { data, index }),
        );
        expect(inspector).toContain('operational:false');
        expect(inspector).toContain(data.facilities[index]!.record.lifecycle);
        for (const key of [
          'estimatedCapacity',
          'requiredWorkers',
          'requiredPowerMW',
          'requiredWaterM3Day',
          'maintenanceGcuDay',
          'equipmentUnits',
          'constructionSimDays',
        ]) {
          const path = `/facilities/${index}/record/${key}`;
          expect(inspector).toContain(`data-source-field="${path}"`);
          expect(inspector).toContain(data.officialSource!.fields[path]!.exact);
        }
      }
    },
  );

  it('maps Korra anchors to the actual square image, not its wider frame', async () => {
    const data = await officialCountry('63');
    expect(data.frame).toEqual([286.9, 514.9, 200.2, 192.2]);
    const image = containedCountrySceneFrame(data.frame);
    expect(image[0]).toBeCloseTo(290.9, 10);
    expect(image.slice(1)).toEqual([514.9, 192.2, 192.2]);
    const port = data.facilities.find((site) => site.id === 'P06')!;
    expect(port.anchor).toEqual([0.56, 0.64]);
    expect(officialFacilityPoint(port, data.frame)[0]).toBeCloseTo(398.532, 10);
    expect(officialFacilityPoint(port, data.frame)[1]).toBeCloseTo(637.908, 10);
    const gas = data.facilities.find((site) => site.id === 'SF287')!;
    expect(gas.anchor).toEqual([0.83, 0.51]);
    expect(officialFacilityPoint(gas)).toBe(gas.point);
    expect(officialFacilityPoint(gas, data.frame)[0]).toBeCloseTo(450.426, 10);
    expect(officialFacilityPoint(gas, data.frame)[1]).toBeCloseTo(612.922, 10);
    // Independent review's old whole-container counterexample stays explicit.
    expect(data.frame[0] + 0.83 * data.frame[2] - 450.426).toBeCloseTo(
      2.64,
      10,
    );
    const markup = renderCountry('63', { kind: 'ready', data });
    const rendered = markup.match(
      /<image[^>]*data-country-scene="63"[^>]*>/,
    )![0];
    expect(rendered).toContain('width="192.2"');
    expect(rendered).toContain('height="192.2"');
    expect(rendered).toContain('preserveAspectRatio="xMidYMid meet"');
    const squareControl = await officialCountry('38');
    expect(containedCountrySceneFrame(squareControl.frame)).toEqual(
      squareControl.frame,
    );
  });

  it('keeps centered square placement for wide, tall and already-square frames', () => {
    expect(containedCountrySceneFrame([10, 20, 200, 100])).toEqual([
      60, 20, 100, 100,
    ]);
    expect(containedCountrySceneFrame([10, 20, 100, 200])).toEqual([
      10, 70, 100, 100,
    ]);
    expect(containedCountrySceneFrame([10, 20, 100, 100])).toEqual([
      10, 20, 100, 100,
    ]);
  });

  it('renders all 1374 source facilities, not only the 350 development subset', async () => {
    const ids = new Set<string>();
    let nullAnchors = 0;
    for (let index = 1; index <= 70; index++) {
      const number = String(index).padStart(2, '0');
      const data = await officialCountry(number);
      const markup = renderCountry(number, { kind: 'ready', data });
      const directory = [
        ...markup.matchAll(/data-official-facility="([^"]+)"/g),
      ].map((match) => match[1]);
      expect(directory).toEqual(data.facilities.map((site) => site.id));
      for (const site of data.facilities) {
        expect(ids.has(site.id)).toBe(false);
        ids.add(site.id);
        if (site.anchor === null) {
          nullAnchors++;
          expect(officialFacilityPoint(site, data.frame)).toBe(site.point);
        } else {
          const side = Math.min(data.frame[2], data.frame[3]);
          expect(officialFacilityPoint(site, data.frame)).toEqual([
            data.frame[0] + (data.frame[2] - side) / 2 + site.anchor[0] * side,
            data.frame[1] + (data.frame[3] - side) / 2 + site.anchor[1] * side,
          ]);
        }
      }
      expect(markup).not.toContain('精确值缺失');
    }
    expect(ids.size).toBe(1374);
    expect(nullAnchors).toBe(986);
  });

  it.each<OfficialExplorerCountryLoadState>([
    { kind: 'loading' },
    { kind: 'missing', reason: 'COUNTRY_FILE_MISSING' },
    { kind: 'error', reason: 'SOURCE_HASH_MISMATCH' },
    { kind: 'stale', reason: 'READ_ABORTED' },
  ])('hides all numeric/detail fallback for source state $kind', (state) => {
    const markup = renderCountry('70', state);
    expect(markup).not.toContain('data-official-facility=');
    expect(markup).not.toContain('data-source-field=');
    expect(markup).not.toContain('情景人口');
    expect(markup).toContain('官方开局数据');
    expect(markup).toContain('role="status"');
    expect(markup).toContain(`data-source-state="${state.kind}"`);
    expect(markup).toContain('重新读取本国来源（只读）');
  });

  it.each<OfficialExplorerCountryLoadState>([{ kind: 'idle' }])(
    'does not offer a retry without a selected country',
    (state) => {
      const markup = renderToStaticMarkup(
        createElement(OfficialSourceState, { state, onRetry: vi.fn() }),
      );
      expect(markup).not.toContain('<button');
    },
  );

  it('exposes native keyboard/touch source details without relying on hover titles', async () => {
    const data = await officialCountry('70');
    const path = '/facilities/0/record/estimatedCapacity';
    const field = data.officialSource.fields[path]!;
    const markup = renderToStaticMarkup(
      createElement(OfficialSourceDetails, { data, prefix: '/facilities/0/' }),
    );
    expect(markup).toContain('<details');
    expect(markup).toContain('<summary>数字来源与版本');
    expect(markup).toContain(`data-source-detail="${path}"`);
    expect(markup).not.toContain('data-source-detail="/facilities/1/');
    for (const key of [
      'dataset',
      'rowId',
      'field',
      'sourcePointer',
      'exact',
      'rawToken',
      'unit',
      'unitBasis',
      'nature',
    ] as const) {
      expect(markup).toContain(`<dt>${key}</dt>`);
      const encoded = renderToStaticMarkup(
        createElement('dd', null, field[key]),
      );
      expect(markup).toContain(encoded);
    }
    expect(markup).toContain(
      data.officialSource.datasets[field.dataset]!.sha256,
    );
    expect(markup).not.toContain('title=');
  });

  it('retries the same country with an immediate loading state and discards the aborted attempt', async () => {
    const data = await officialCountry('70');
    const attempts: {
      signal: AbortSignal;
      resolve: (state: OfficialExplorerCountryLoadResult) => void;
    }[] = [];
    const loader = {
      load: vi.fn(
        (_id: string, options?: { signal?: AbortSignal }) =>
          new Promise<OfficialExplorerCountryLoadResult>((resolve) => {
            attempts.push({ signal: options!.signal!, resolve });
          }),
      ),
    };
    const published: ExplorerCountryBinding[] = [];
    const publish = (binding: ExplorerCountryBinding) =>
      published.push(binding);
    const cancelOld = requestExplorerCountry(data.id, loader, publish);
    cancelOld();
    const cancelRetry = requestExplorerCountry(data.id, loader, publish);
    expect(attempts[0]!.signal.aborted).toBe(true);
    expect(attempts[1]!.signal.aborted).toBe(false);
    expect(loader.load.mock.calls.map(([id]) => id)).toEqual([
      data.id,
      data.id,
    ]);
    expect(published.at(-1)).toEqual({
      countryId: data.id,
      state: { kind: 'loading' },
    });
    attempts[0]!.resolve({ kind: 'error', reason: 'SOURCE_HASH_MISMATCH' });
    await Promise.resolve();
    expect(published.at(-1)!.state.kind).toBe('loading');
    attempts[1]!.resolve({ kind: 'ready', data });
    await Promise.resolve();
    expect(published.at(-1)).toEqual({
      countryId: data.id,
      state: { kind: 'ready', data },
    });
    cancelRetry();
  });

  it('immediately hides ready country01 when switching to70, even before effect cleanup', async () => {
    const data = await officialCountry('01');
    expect(
      currentExplorerSource('visual-territory-70', {
        countryId: 'visual-territory-70',
        state: { kind: 'ready', data },
      }),
    ).toEqual({ kind: 'error', reason: 'SOURCE_INVALID' });
    expect(
      currentExplorerSource('visual-territory-70', {
        countryId: data.id,
        state: { kind: 'ready', data },
      }),
    ).toEqual({ kind: 'loading' });
    const markup = renderCountry('70', { kind: 'ready', data }, data.id);
    expect(markup).not.toContain('data-official-facility=');
    expect(markup).not.toContain(
      data.officialSource!.fields['/profile/population']!.exact,
    );
  });

  it('does not load 70 country bodies for the unselected world overview', () => {
    const loader = { load: vi.fn() };
    const published: ExplorerCountryBinding[] = [];
    const cancel = requestExplorerCountry('', loader, (binding) =>
      published.push(binding),
    );
    expect(loader.load).not.toHaveBeenCalled();
    expect(published).toEqual([{ countryId: '', state: { kind: 'idle' } }]);
    cancel();
  });

  it('cancels old requests so out-of-order completion cannot replace the selected country', async () => {
    const one = await officialCountry('01'),
      seventy = await officialCountry('70');
    const pending = new Map<
      string,
      (result: OfficialExplorerCountryLoadResult) => void
    >();
    const loader = {
      load: vi.fn(
        (id: string) =>
          new Promise<OfficialExplorerCountryLoadResult>((resolve) =>
            pending.set(id, resolve),
          ),
      ),
    };
    const published: ExplorerCountryBinding[] = [];
    const cancelOne = requestExplorerCountry(one.id, loader, (binding) =>
      published.push(binding),
    );
    cancelOne();
    const cancelSeventy = requestExplorerCountry(
      seventy.id,
      loader,
      (binding) => published.push(binding),
    );
    pending.get(seventy.id)!({ kind: 'ready', data: seventy });
    await Promise.resolve();
    pending.get(one.id)!({ kind: 'ready', data: one });
    await Promise.resolve();
    expect(published.at(-1)).toEqual({
      countryId: seventy.id,
      state: { kind: 'ready', data: seventy },
    });
    expect(
      published.filter(
        (binding) =>
          binding.countryId === one.id && binding.state.kind === 'ready',
      ),
    ).toHaveLength(0);
    cancelSeventy();
  });

  it('renders exact decimal text without Number conversion and never fills absent provenance', async () => {
    const raw = await officialCountry('70');
    const path = '/facilities/0/record/estimatedCapacity';
    const data = {
      ...raw,
      officialSource: {
        ...raw.officialSource!,
        fields: {
          ...raw.officialSource!.fields,
          [path]: {
            ...raw.officialSource!.fields[path]!,
            exact: '557.013500000000000000001',
            rawToken: '5.57013500000000000000001e2',
          },
        },
      },
    };
    const exact = renderToStaticMarkup(
      createElement(ExactOfficialValue, { data, path }),
    );
    expect(exact).toContain('557.013500000000000000001');
    expect(exact).toContain('raw=5.57013500000000000000001e2');
    const absent = renderToStaticMarkup(
      createElement(ExactOfficialValue, {
        data: {
          ...raw,
          officialSource: undefined,
        } as unknown as OfficialExplorerCountry,
        path,
      }),
    );
    expect(absent).toContain('精确值缺失');
    expect(absent).not.toContain('557.0135');
  });
});

describe('atlas country-operation gateway', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ['01', '01', 'Avenor'],
    ['visual-territory-01', '01', 'Avenor'],
    ['70', '70', 'Rhea'],
    ['visual-territory-70', '70', 'Rhea'],
    ['', '01', '默认国家 01 · Avenor'],
    ['unknown-country', '01', '默认国家 01 · Avenor'],
  ])('maps selected country %s to national page %s', (id, number, label) => {
    vi.stubGlobal('window', {
      location: { search: id ? `?atlas=explorer&country=${id}` : '' },
    });
    const markup = renderToStaticMarkup(createElement(WorldExplorer));
    const link = markup.match(
      /<a\b[^>]*class="old-atlas explorer-national-link"[^>]*>/,
    )?.[0];
    expect(link).toBeDefined();
    expect(link).toContain(
      `href="./season1-immersive/?role=finance&amp;country=${number}#country"`,
    );
    expect(link).toContain(label);
  });
});
