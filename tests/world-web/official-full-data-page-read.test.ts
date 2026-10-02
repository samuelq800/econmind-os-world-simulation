import { readFileSync } from 'node:fs';
import { createContext, runInContext, runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

import { OFFICIAL_DATASETS } from '../../apps/world-api/src/integration/official-dataset-registry.js';

const root = new URL(
  '../../apps/world-web/public/season1-immersive/',
  import.meta.url,
);
const source = readFileSync(new URL('country-context.js', root), 'utf8').split(
  '// National geography and local interaction state',
)[0]!;
const game = readFileSync(new URL('country-game.js', root), 'utf8');
const selectionChecksumSha256 =
  '88dd44478f97d2e8893a4f11b3aaf96e256bdb13248aca0d08f097fabe10d315';

function metadata(slug: string) {
  const spec = OFFICIAL_DATASETS.find((item) => item.slug === slug)!;
  return {
    schemaVersion: 'official-source-dataset-v1',
    dataNature: 'OFFICIAL_SELECTED_SOURCE_DATASET',
    packageId: 'BALANCED_2026_09_28_V1',
    selectionChecksumSha256,
    dataset: slug,
    sourcePath: spec.sourcePath,
    sourceSha256: spec.sha256,
    sourceBytes: spec.bytes,
    sourceKind: spec.kind,
    unitTreatment: 'SOURCE_UNITS_PRESERVED_NO_CONVERSION',
    numericEncoding: 'DECIMAL_STRING_EXACT',
    unitsSourcePath: 'DATA_DICTIONARY.md',
    associations: {
      countryFields: spec.countryFields,
      entityFields: spec.entityFields,
      referenceFields: spec.referenceFields,
      countryRelation:
        slug === 'seasonal-water'
          ? 'regionId -> regions.id -> regions.countryId'
          : slug === 'changes'
            ? 'objectId -> regions.id -> regions.countryId'
            : null,
    },
    proposalFieldsAreExecuted: false,
    liveWorldState: false,
  };
}

const catalogue = {
  ok: true,
  schemaVersion: 'official-source-catalog-v1',
  dataNature: 'OFFICIAL_SELECTED_SOURCE_DATASET',
  packageId: 'BALANCED_2026_09_28_V1',
  selectionChecksumSha256,
  datasetCount: 34,
  databaseAvailability: 'VERIFY_PER_REQUEST',
  liveWorldState: false,
  datasets: OFFICIAL_DATASETS.map((item) => metadata(item.slug)),
};

function page(slug: string, countryId: string | null, items: unknown[] = []) {
  return {
    ok: true,
    ...metadata(slug),
    total: items.length,
    offset: 0,
    filters: { countryId, entityId: null, referenceId: null },
    returned: items.length,
    nextOffset: null,
    items,
  };
}

type ReadSource = {
  createDatasetSession: (
    number: string,
    options?: { fetcher?: typeof fetch; config?: unknown },
  ) => {
    loadCatalogue: () => Promise<Record<string, unknown>>;
    loadDataset: (
      slug: string,
      options?: { offset?: number; limit?: number; section?: string | null },
    ) => Promise<Record<string, unknown>>;
    setCountry: (number: string) => void;
    cancel: () => void;
  };
};

function adapter(): ReadSource {
  const context = {
    URL,
    URLSearchParams,
    TextDecoder,
    AbortController,
    setTimeout,
    clearTimeout,
    EconWorldRead: undefined as ReadSource | undefined,
  };
  runInNewContext(source, context);
  if (!context.EconWorldRead) throw Error('WORLD_READ_SOURCE_NOT_INSTALLED');
  return context.EconWorldRead;
}

describe('official all-data product-page read', () => {
  it('stays disconnected without explicit API origin and makes no request', async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;
    const session = adapter().createDatasetSession('01', {
      fetcher,
      config: null,
    });
    expect(await session.loadCatalogue()).toMatchObject({
      kind: 'NOT_CONNECTED',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('uses A’s 34-entry catalog and exact country-filtered page contract', async () => {
    const fetcher = vi.fn(async (url: URL | RequestInfo) =>
      Response.json(
        String(url).endsWith('/datasets')
          ? catalogue
          : page('finance', 'visual-territory-01', [
              { countryId: 'visual-territory-01', cashRunwayDays: '21.0000' },
            ]),
      ),
    ) as unknown as typeof fetch;
    const session = adapter().createDatasetSession('01', {
      fetcher,
      config: { apiOrigin: 'https://world.example/' },
    });
    expect(await session.loadCatalogue()).toMatchObject({ kind: 'CATALOGUE' });
    const result = await session.loadDataset('finance');
    expect(result).toMatchObject({
      kind: 'PAGE',
      dataset: 'finance',
      total: 1,
      filteredCountryId: 'visual-territory-01',
    });
    expect(result.items).toEqual([
      { countryId: 'visual-territory-01', cashRunwayDays: '21.0000' },
    ]);
    const [url, options] = vi.mocked(fetcher).mock.calls[1]!;
    expect(String(url)).toBe(
      'https://world.example/v1/world-data/datasets/finance?offset=0&limit=20&countryId=visual-territory-01',
    );
    expect(options).toMatchObject({
      method: 'GET',
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('routes all 34 datasets by A’s declared kind and country association', async () => {
    for (const spec of OFFICIAL_DATASETS) {
      const filtered =
        spec.countryFields.length > 0 ||
        ['changes', 'seasonal-water'].includes(spec.slug);
      const response =
        spec.kind === 'ARRAY'
          ? page(spec.slug, filtered ? 'visual-territory-01' : null, [])
          : spec.kind === 'GEOGRAPHY'
            ? {
                ok: true,
                ...metadata(spec.slug),
                sections: ['partition.territories'],
              }
            : { ok: true, ...metadata(spec.slug), data: { source: 'kept' } };
      const fetcher = vi.fn(async (url: URL | RequestInfo) =>
        Response.json(String(url).endsWith('/datasets') ? catalogue : response),
      ) as unknown as typeof fetch;
      const session = adapter().createDatasetSession('01', {
        fetcher,
        config: { apiOrigin: 'https://world.example/' },
      });
      expect(await session.loadCatalogue(), spec.slug).toMatchObject({
        kind: 'CATALOGUE',
      });
      expect(await session.loadDataset(spec.slug), spec.slug).toMatchObject({
        kind:
          spec.kind === 'ARRAY'
            ? 'PAGE'
            : spec.kind === 'GEOGRAPHY'
              ? 'SECTIONS'
              : 'DATA',
      });
      const url = String(vi.mocked(fetcher).mock.calls[1]![0]);
      expect(url, spec.slug).toContain(`/datasets/${spec.slug}`);
      expect(url.includes('countryId='), spec.slug).toBe(
        spec.kind === 'ARRAY' && filtered,
      );
    }
  });

  it('rejects live claims, wrong hashes and numeric coercion without using the rows', async () => {
    for (const mutate of [
      { liveWorldState: true },
      { sourceSha256: '0'.repeat(64) },
      { items: [{ cashRunwayDays: 21 }] },
      {
        items: [{ countryId: 'visual-territory-02', cashRunwayDays: '21' }],
        returned: 1,
        total: 1,
      },
      { nextOffset: 20 },
    ]) {
      const fetcher = vi.fn(async (url: URL | RequestInfo) =>
        Response.json(
          String(url).endsWith('/datasets')
            ? catalogue
            : { ...page('finance', 'visual-territory-01', []), ...mutate },
        ),
      ) as unknown as typeof fetch;
      const session = adapter().createDatasetSession('01', {
        fetcher,
        config: { apiOrigin: 'https://world.example/' },
      });
      expect(await session.loadCatalogue()).toMatchObject({
        kind: 'CATALOGUE',
      });
      expect(await session.loadDataset('finance')).toMatchObject({
        kind: 'INVALID',
      });
    }
  });

  it('retires an old country request and reads the replacement country only', async () => {
    let resolveOld: ((value: Response) => void) | undefined;
    let oldSignal: AbortSignal | undefined;
    const fetcher = vi.fn((url: URL | RequestInfo, options?: RequestInit) => {
      const address = String(url);
      if (address.endsWith('/datasets'))
        return Promise.resolve(Response.json(catalogue));
      if (address.includes('visual-territory-01')) {
        oldSignal = options?.signal ?? undefined;
        return new Promise<Response>((resolve) => {
          resolveOld = resolve;
        });
      }
      return Promise.resolve(
        Response.json(
          page('stocks', 'visual-territory-02', [
            { countryId: 'visual-territory-02', available: '2.500' },
          ]),
        ),
      );
    }) as unknown as typeof fetch;
    const session = adapter().createDatasetSession('01', {
      fetcher,
      config: { apiOrigin: 'https://world.example/' },
    });
    expect(await session.loadCatalogue()).toMatchObject({ kind: 'CATALOGUE' });
    const old = session.loadDataset('stocks');
    session.setCountry('02');
    expect(await session.loadDataset('stocks')).toMatchObject({
      kind: 'INVALID',
      reason: 'DATASET_NOT_IN_CATALOGUE',
    });
    expect(oldSignal?.aborted).toBe(true);
    resolveOld?.(Response.json(page('stocks', 'visual-territory-01')));
    expect(await old).toMatchObject({ kind: 'STALE' });
    expect(await session.loadCatalogue()).toMatchObject({ kind: 'CATALOGUE' });
    expect(await session.loadDataset('stocks')).toMatchObject({
      kind: 'PAGE',
      filteredCountryId: 'visual-territory-02',
    });
  });

  it('invalidates a previous catalogue immediately on refresh and on source mismatch', async () => {
    let fail = false;
    const fetcher = vi.fn(async (url: URL | RequestInfo) => {
      if (String(url).endsWith('/datasets')) {
        if (fail) throw Error('offline');
        return Response.json(catalogue);
      }
      return Response.json({
        ...page('finance', 'visual-territory-01'),
        sourceSha256: '0'.repeat(64),
      });
    }) as unknown as typeof fetch;
    const session = adapter().createDatasetSession('01', {
      fetcher,
      config: {
        apiBaseUrl: 'https://world.example/functions/v1/world-v2-official-read',
      },
    });
    expect(await session.loadCatalogue()).toMatchObject({ kind: 'CATALOGUE' });
    expect(await session.loadDataset('finance')).toMatchObject({
      kind: 'INVALID',
      reason: 'DATASET_MISMATCH',
    });
    expect(await session.loadDataset('stocks')).toMatchObject({
      reason: 'DATASET_NOT_IN_CATALOGUE',
    });
    expect(await session.loadCatalogue()).toMatchObject({ kind: 'CATALOGUE' });
    fail = true;
    const refresh = session.loadCatalogue();
    expect(await session.loadDataset('stocks')).toMatchObject({
      reason: 'DATASET_NOT_IN_CATALOGUE',
    });
    expect(await refresh).toMatchObject({ kind: 'UNAVAILABLE' });
    expect(await session.loadDataset('stocks')).toMatchObject({
      reason: 'DATASET_NOT_IN_CATALOGUE',
    });
  });

  it.each([
    { apiBaseUrl: 'https://world.example/functions/v1/other' },
    {
      apiBaseUrl:
        'https://world.example/functions/v1/world-v2-official-read?token=synthetic',
    },
    { apiBaseUrl: 'http://world.example/' },
    {
      apiBaseUrl: 'https://world.example/',
      apiOrigin: 'https://other.example/',
    },
  ])(
    'does not fetch from an invalid or ambiguous base config',
    async (config) => {
      const fetcher = vi.fn() as unknown as typeof fetch;
      const session = adapter().createDatasetSession('01', { fetcher, config });
      expect(await session.loadCatalogue()).toMatchObject({
        kind: 'INVALID',
        reason: 'API_ORIGIN_INVALID',
      });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it('mounts source status in the existing country game drawer and escapes raw rows', async () => {
    const drawer = {
      hidden: true,
      innerHTML: '',
      style: {} as Record<string, string>,
      querySelector: () => ({ focus: vi.fn() }),
    };
    const loadCatalogue = vi.fn(async () => ({
      kind: 'CATALOGUE',
      datasets: catalogue.datasets,
    }));
    const loadDataset = vi.fn(async () => ({
      kind: 'PAGE',
      dataset: 'finance',
      items: [{ id: 'F01', note: '<script>bad</script>', balance: '3.000' }],
      total: 1,
      nextOffset: null,
      filteredCountryId: 'visual-territory-01',
    }));
    const commands: Record<
      string,
      (button?: { dataset: Record<string, string> }) => unknown
    > = {};
    const context = createContext({
      countryScope: '01',
      role: 'finance',
      contextCountry: { name: 'Avenor' },
      KEY: 'test',
      localStorage: { getItem: () => null, setItem: vi.fn() },
      EconWorldRead: {
        createDatasetSession: () => ({
          loadCatalogue,
          loadDataset,
          cancel: vi.fn(),
        }),
      },
      commands,
      document: {
        querySelector: () => drawer,
        addEventListener: vi.fn(),
      },
      window: { addEventListener: vi.fn(), EconI18n: null },
      setInterval: vi.fn(),
      render: vi.fn(),
      routeFromHash: vi.fn(),
      location: { hash: '' },
      bootHash: '',
      esc: (value: unknown) =>
        String(value).replace(
          /[&<>"']/g,
          (char) =>
            ({
              '&': '&amp;',
              '<': '&lt;',
              '>': '&gt;',
              '"': '&quot;',
              "'": '&#39;',
            })[char]!,
        ),
    });
    runInContext(game, context);
    await commands['country-source']!();
    expect(drawer.innerHTML).toContain('Selected source · Not live World');
    expect(drawer.innerHTML).toContain('data-slug="finance"');
    await commands['country-source-dataset']!({ dataset: { slug: 'finance' } });
    expect(drawer.innerHTML).toContain('Inspect all source fields');
    expect(drawer.innerHTML).toContain('&lt;script&gt;bad&lt;/script&gt;');
    expect(drawer.innerHTML).not.toContain('<script>bad</script>');
    expect(drawer.innerHTML).not.toContain('Confirm allocation');
    expect(loadDataset).toHaveBeenCalledOnce();
  });
});
