import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { createElement } from '../../apps/world-web/node_modules/react';
import { renderToStaticMarkup } from '../../apps/world-web/node_modules/react-dom/server';
import {
  WorldExplorer,
  ExactOfficialValue,
  OfficialFacilityFacts,
  currentExplorerSource,
  requestExplorerCountry,
  officialFacilityPoint,
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
    location: { search: `?atlas=explorer&country=${number}` },
  });
  return renderToStaticMarkup(
    createElement(WorldExplorer, {
      initialOfficialSource: { countryId: bindingCountry, state },
    }),
  );
}

describe('atlas official opening numbers and complete facility records', () => {
  afterEach(() => vi.unstubAllGlobals());

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
          expect(officialFacilityPoint(site, data.frame)).toEqual([
            data.frame[0] + site.anchor[0] * data.frame[2],
            data.frame[1] + site.anchor[1] * data.frame[3],
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
        data: { ...raw, officialSource: undefined },
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
