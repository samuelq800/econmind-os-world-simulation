import { createHash, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  CountryOpeningFacts,
  CountryOpeningFactsLoader,
  openingPublicPaths,
  openingRecordGroups,
  requestOpeningFacts,
} from '../../apps/world-web/src/map-explorer/CountryOpeningFacts.js';
import {
  ExactOfficialValue,
  OfficialSourceDetails,
} from '../../apps/world-web/src/official-data/OfficialSourceValue.js';
import {
  createOfficialExplorerCountryLoader,
  type OfficialExplorerCountry,
  type OfficialExplorerCountryLoadResult,
  type OfficialExplorerCountryLoadState,
} from '../../apps/world-web/src/official-data/official-explorer-country.js';
import { OFFICIAL_EXPLORER_COUNTRY_FILES } from '../../apps/world-web/src/official-data/official-explorer-country-manifest.js';

const dataRoot = new URL(
  '../../apps/world-web/public/season1-immersive/countries/data/',
  import.meta.url,
);
const bytes = (number: string) =>
  readFileSync(new URL(`${number}.json`, dataRoot));
const loader = createOfficialExplorerCountryLoader({
  baseUrl: 'https://example.test/world/',
  crypto: webcrypto as unknown as Pick<Crypto, 'subtle'>,
  fetcher: async (url) =>
    new Response(bytes(/(\d{2})\.json$/.exec(String(url))![1]!), {
      headers: { 'content-type': 'application/json' },
    }),
});
async function load(number: string) {
  const result = await loader.load(number);
  if (result.kind !== 'ready') throw new Error(`${number}:${result.kind}`);
  return result.data;
}
const render = (data: OfficialExplorerCountry, locale: 'en' | 'zh') =>
  renderToStaticMarkup(createElement(CountryOpeningFacts, { data, locale }));

describe('public country opening dossier', () => {
  it('covers all 70 verified sources with exact population and independent record counts', async () => {
    let population = 0n,
      resourcePoints = 0,
      facilityRecords = 0,
      regions = 0;
    for (const [number, spec] of Object.entries(
      OFFICIAL_EXPLORER_COUNTRY_FILES,
    )) {
      const data = await load(number);
      expect(createHash('sha256').update(bytes(number)).digest('hex')).toBe(
        spec.sha256,
      );
      const populationToken =
        data.officialSource.fields['/profile/population']!;
      expect(populationToken.unit).toBe('person');
      population += BigInt(populationToken.exact);
      resourcePoints += data.resources.length;
      facilityRecords += data.facilities.length;
      regions += data.regions.length;
      expect(data.resources.length).toBe(spec.resources);
      expect(data.facilities.length).toBe(spec.facilities);
      expect(data.regions.length).toBe(spec.regions);
      expect(
        openingRecordGroups(data.facilities).reduce(
          (sum, [, count]) => sum + count,
          0,
        ),
      ).toBe(spec.facilities);
      for (const locale of ['en', 'zh'] as const) {
        const html = render(data, locale);
        expect(html).toContain(`data-opening-country="${number}"`);
        expect(html).toContain(populationToken.exact);
        expect(html).toContain(
          `data-opening-count="resources">${spec.resources}`,
        );
        expect(html).toContain(
          `data-opening-count="facilities">${spec.facilities}`,
        );
        expect(html).toContain(`data-opening-count="regions">${spec.regions}`);
        expect(html).toContain('BALANCED_2026_09_28_V1');
        expect(html).toContain(
          locale === 'en' ? 'Not live World State' : '非实时 World State',
        );
        expect(html).not.toMatch(
          /treasuryCentralBankBalance|bankDeposits|bankReserves|bankLoans|bankEquity|dailyIncome|historicalDebt|\/officialOpening\/finance/,
        );
      }
      for (const path of openingPublicPaths(data)) {
        const field = data.officialSource.fields[path];
        expect(field, `${number}:${path}`).toBeDefined();
        expect(field?.exact, `${number}:${path}`).toMatch(/^-?\d+(?:\.\d+)?$/);
        expect(data.officialSource.datasets[field!.dataset]?.sha256).toMatch(
          /^[a-f0-9]{64}$/,
        );
      }
    }
    expect({
      population: String(population),
      resourcePoints,
      facilityRecords,
      regions,
    }).toEqual({
      population: '14712146434',
      resourcePoints: 240,
      facilityRecords: 1374,
      regions: 122,
    });
  });
  it('keeps exact zero distinct from absent provenance and never fills a display float', async () => {
    const data = await load('01'),
      path = '/profile/population';
    const withZero = {
      ...data,
      profile: { ...data.profile, population: 999999 },
      officialSource: {
        ...data.officialSource,
        fields: {
          ...data.officialSource.fields,
          [path]: {
            ...data.officialSource.fields[path]!,
            exact: '0',
            rawToken: '0',
          },
        },
      },
    };
    expect(render(withZero, 'en')).toContain('>0</span>');
    const fields = { ...data.officialSource.fields };
    delete fields[path];
    const missing = render(
      { ...withZero, officialSource: { ...data.officialSource, fields } },
      'en',
    );
    expect(missing).toContain('Exact source value unavailable');
    expect(missing).not.toContain('999999');
    expect(
      render(
        { ...withZero, officialSource: { ...data.officialSource, fields } },
        'zh',
      ),
    ).toContain('精确值缺失');
  });
  it('retains unrounded decimal tokens, source unit, nature and raw provenance', async () => {
    const data = await load('70'),
      path = '/resources/0/deposit/remainingGeological';
    const field = data.officialSource.fields[path]!;
    const changed = {
      ...data,
      officialSource: {
        ...data.officialSource,
        fields: {
          ...data.officialSource.fields,
          [path]: {
            ...field,
            exact: '9007199254740993.000000001',
            rawToken: '9.007199254740993000000001e15',
          },
        },
      },
    };
    const html = renderToStaticMarkup(
      createElement(ExactOfficialValue, {
        data: changed,
        path,
        locale: 'en',
        showUnit: true,
      }),
    );
    expect(html).toContain('9007199254740993.000000001');
    expect(html).toContain(field.unit);
    expect(html).toContain('raw=9.007199254740993000000001e15');
    expect(html).toContain(field.nature);
  });
  it('limits public source disclosure to explicit public paths even when private profile values exist', async () => {
    const data = await load('01');
    const html = renderToStaticMarkup(
      createElement(OfficialSourceDetails, {
        data,
        paths: openingPublicPaths(data),
        locale: 'en',
      }),
    );
    expect(html).toContain('/profile/population');
    expect(html).not.toContain('/profile/bank');
    expect(html).not.toContain('/profile/treasury');
    expect(html).not.toContain('/officialOpening/finance');
    expect(html).toContain(data.source.countryFileSha256);
  });
  it('renders the public entry loading state instead of placeholder counts', () => {
    const html = renderToStaticMarkup(
      createElement(CountryOpeningFactsLoader, {
        reference: '01',
        locale: 'en',
        onLocaleChange: () => {},
      }),
    );
    expect(html).toContain('Reading this country');
    expect(html).not.toContain('data-opening-count');
  });
  it('clears immediately, aborts on switch, ignores late country results and preserves the new country', async () => {
    const one = await load('01'),
      seventy = await load('70');
    const pending = new Map<
      string,
      (r: OfficialExplorerCountryLoadResult) => void
    >();
    const signals: AbortSignal[] = [];
    const fake = {
      load: vi.fn((ref: string, request?: { signal?: AbortSignal }) => {
        signals.push(request!.signal!);
        return new Promise<OfficialExplorerCountryLoadResult>((resolve) =>
          pending.set(ref, resolve),
        );
      }),
    };
    const first: OfficialExplorerCountryLoadState[] = [],
      second: OfficialExplorerCountryLoadState[] = [];
    const cancel = requestOpeningFacts('01', fake, (r) => first.push(r));
    expect(first).toEqual([{ kind: 'loading' }]);
    cancel();
    expect(signals[0]?.aborted).toBe(true);
    const cancelTwo = requestOpeningFacts('70', fake, (r) => second.push(r));
    pending.get('70')!({ kind: 'ready', data: seventy });
    await Promise.resolve();
    pending.get('01')!({ kind: 'ready', data: one });
    await Promise.resolve();
    expect(first).toEqual([{ kind: 'loading' }]);
    expect(second.at(-1)).toEqual({ kind: 'ready', data: seventy });
    cancelTwo();
  });
  it('rejects mismatched country identity and surfaces failures without an old-country fallback', async () => {
    const data = await load('70');
    const states: OfficialExplorerCountryLoadState[] = [];
    const cancel = requestOpeningFacts(
      '01',
      { load: async () => ({ kind: 'ready', data }) },
      (r) => states.push(r),
    );
    await Promise.resolve();
    expect(states.at(-1)).toEqual({ kind: 'error', reason: 'SOURCE_INVALID' });
    cancel();
    const errors: OfficialExplorerCountryLoadState[] = [];
    const cancelError = requestOpeningFacts(
      '01',
      {
        load: async () => {
          throw new Error('network unavailable');
        },
      },
      (r) => errors.push(r),
    );
    await Promise.resolve();
    expect(errors).toEqual([
      { kind: 'loading' },
      { kind: 'error', reason: 'SOURCE_UNAVAILABLE' },
    ]);
    cancelError();
  });
});
