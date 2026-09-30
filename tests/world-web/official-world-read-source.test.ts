import { readFileSync } from 'node:fs';
import { createContext, runInContext, runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const root = new URL(
  '../../apps/world-web/public/season1-immersive/',
  import.meta.url,
);
const source = readFileSync(new URL('country-context.js', root), 'utf8').split(
  '// National geography and local interaction state',
)[0]!;
const fullCountryContext = readFileSync(
  new URL('country-context.js', root),
  'utf8',
);
const selectionChecksumSha256 =
  '88dd44478f97d2e8893a4f11b3aaf96e256bdb13248aca0d08f097fabe10d315';
const country = (number = '01') =>
  JSON.parse(
    readFileSync(new URL(`countries/data/${number}.json`, root), 'utf8'),
  ) as Record<string, unknown>;
const officialCountries = JSON.parse(
  readFileSync(
    new URL(
      '../../artifacts/world-balanced-candidate-v1/data/countries.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as Array<Record<string, unknown>>;
const officialCountry = (number = '01') =>
  officialCountries.find((item) => item.number === number)!;

type ReadResult = {
  kind: string;
  country: Record<string, unknown> | null;
  reason: string | null;
  runtime: string;
};
type Source = {
  validCountry: (data: unknown, number: string) => boolean;
  loadCountry: (
    number: string,
    options: { fetcher: typeof fetch; config?: unknown },
  ) => Promise<ReadResult>;
};

function adapter(): Source {
  const context = {
    URL,
    TextDecoder,
    AbortController,
    setTimeout,
    clearTimeout,
    EconWorldRead: undefined as Source | undefined,
  };
  runInNewContext(source, context);
  if (!context.EconWorldRead) throw Error('WORLD_READ_SOURCE_NOT_INSTALLED');
  return context.EconWorldRead;
}

function route(
  data: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
) {
  return {
    ok: true,
    schemaVersion: 'official-country-baseline-v1',
    dataNature: 'OFFICIAL_SELECTED_SOURCE_DATASET',
    packageId: 'BALANCED_2026_09_28_V1',
    selectionChecksumSha256,
    countriesSha256:
      '5d493e93dfab1425731191ba7491cce47949d176e4769b33fdca48d2d31dba89',
    sourcePath: 'data/countries.json',
    countryCount: 70,
    units: {
      population: 'persons',
      areaKm2: 'km2',
      gcuReference: 'GCU_SCENARIO_ACCOUNTING_UNIT',
    },
    proposalFieldsAreExecuted: false,
    liveWorldState: false,
    countryId: data.id,
    country: data,
    ...overrides,
  };
}

function fetcher(
  data: Record<string, unknown>,
  api: unknown = route(officialCountry(data.number as string)),
) {
  return vi.fn(async (url: URL | RequestInfo) =>
    Response.json(String(url).startsWith('countries/data/') ? data : api),
  ) as unknown as typeof fetch;
}

describe('selected World V2 country read adapter', () => {
  it('accepts all 70 frozen country files with stable site and resource IDs', () => {
    const read = adapter();
    for (let i = 1; i <= 70; i += 1) {
      const number = String(i).padStart(2, '0');
      expect(read.validCountry(country(number), number), number).toBe(true);
    }
  });

  it('matches all 70 public country records to the official source-country API shape', async () => {
    const read = adapter();
    for (let i = 1; i <= 70; i += 1) {
      const number = String(i).padStart(2, '0');
      const result = await read.loadCountry(number, {
        fetcher: fetcher(country(number)),
        config: { apiOrigin: 'https://world.example/' },
      });
      expect(result.kind, number).toBe('API_COUNTRY_VERIFIED');
      expect(result.runtime).toBe('NOT_CONNECTED');
    }
  });

  it('defaults to the labelled selected baseline, never a live projection', async () => {
    const data = country();
    const fetch = fetcher(data);
    const result = await adapter().loadCountry('01', { fetcher: fetch });
    expect(result).toMatchObject({
      kind: 'STATIC_BASELINE',
      runtime: 'NOT_CONNECTED',
      reason: null,
    });
    expect(result.country?.id).toBe('visual-territory-01');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('wires the active country page to the selected read result without inventing a seat', async () => {
    const context = createContext({
      URL,
      TextDecoder,
      AbortController,
      setTimeout,
      clearTimeout,
      fetch: fetcher(country()),
      countryScope: '01',
      countryOffice: 'finance',
      role: 'finance',
      roles: { finance: { code: 'FINANCE', name: 'Finance' } },
      commands: { 'save-policy': vi.fn() },
      data: {},
      scene: vi.fn(),
      openModule: vi.fn(),
      toast: vi.fn(),
      setInterval: vi.fn(),
      document: {
        body: { classList: { add: vi.fn(), remove: vi.fn() } },
        querySelector: vi.fn(() => null),
      },
      window: { GameTest: null, CountryGame: null },
    });
    runInContext(fullCountryContext, context);
    await runInContext('countryDataReady', context);
    expect(runInContext('contextCountry.id', context)).toBe(
      'visual-territory-01',
    );
    expect(runInContext('contextCountrySource.kind', context)).toBe(
      'STATIC_BASELINE',
    );
    expect(runInContext('contextCountrySource.runtime', context)).toBe(
      'NOT_CONNECTED',
    );
    expect(context.data).toEqual({});
  });

  it('uses an exact-provenance API response only when it matches the published baseline', async () => {
    const data = country('46');
    const fetch = fetcher(data);
    const result = await adapter().loadCountry('46', {
      fetcher: fetch,
      config: { apiOrigin: 'https://world.example/' },
    });
    expect(result).toMatchObject({
      kind: 'API_COUNTRY_VERIFIED',
      runtime: 'NOT_CONNECTED',
    });
    expect((result.country?.facilities as unknown[]).length).toBeGreaterThan(0);
    expect(fetch).toHaveBeenCalledTimes(2);
    const [url, options] = vi.mocked(fetch).mock.calls[1]!;
    expect(String(url)).toBe(
      'https://world.example/v1/world-data/countries/visual-territory-46',
    );
    expect(options).toMatchObject({
      method: 'GET',
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
    });
  });

  it.each([
    [
      'wrong checksum',
      (data: Record<string, unknown>) =>
        route(data, { selectionChecksumSha256: '0'.repeat(64) }),
    ],
    [
      'wrong country',
      (data: Record<string, unknown>) =>
        route(data, { countryId: 'visual-territory-02' }),
    ],
    [
      'claim of live state',
      (data: Record<string, unknown>) =>
        route(data, { dataNature: 'LIVE_WORLD_PROJECTION' }),
    ],
    [
      'altered population',
      (data: Record<string, unknown>) => route({ ...data, population: 0 }),
    ],
    [
      'invented team assignment',
      (data: Record<string, unknown>) =>
        route({ ...data, teamAssignment: 'TEAM_FAKE' }),
    ],
  ] as const)(
    'keeps selected static data when API has %s',
    async (_label, mutate) => {
      const data = country();
      const result = await adapter().loadCountry('01', {
        fetcher: fetcher(data, mutate(officialCountry())),
        config: { apiOrigin: 'https://world.example/' },
      });
      expect(result).toMatchObject({
        kind: 'STATIC_DISCONNECTED',
        reason: 'API_BASELINE_MISMATCH',
        runtime: 'NOT_CONNECTED',
      });
      expect(result.country?.id).toBe('visual-territory-01');
    },
  );

  it('distinguishes API outage and invalid configuration from missing local baseline', async () => {
    const data = country();
    const offline = vi.fn(async (url: URL | RequestInfo) => {
      if (String(url).startsWith('countries/data/')) return Response.json(data);
      throw Error('offline');
    }) as unknown as typeof fetch;
    expect(
      await adapter().loadCountry('01', {
        fetcher: offline,
        config: { apiOrigin: 'https://world.example/' },
      }),
    ).toMatchObject({ kind: 'STATIC_DISCONNECTED', reason: 'API_UNAVAILABLE' });
    const invalid = fetcher(data);
    expect(
      await adapter().loadCountry('01', {
        fetcher: invalid,
        config: { apiOrigin: 'https://world.example/?token=secret' },
      }),
    ).toMatchObject({
      kind: 'STATIC_DISCONNECTED',
      reason: 'API_ORIGIN_INVALID',
    });
    expect(invalid).toHaveBeenCalledOnce();
    const missing = vi.fn(
      async () => new Response(null, { status: 404 }),
    ) as unknown as typeof fetch;
    expect(
      await adapter().loadCountry('01', { fetcher: missing }),
    ).toMatchObject({
      kind: 'MISSING',
      country: null,
      reason: 'STATIC_BASELINE_UNAVAILABLE',
    });
    expect(
      await adapter().loadCountry('71', { fetcher: missing }),
    ).toMatchObject({
      kind: 'MISSING',
      country: null,
      reason: 'COUNTRY_ID_INVALID',
    });
  });

  it('bounds a broken API payload and retains only labelled static data', async () => {
    const data = country();
    const huge = vi.fn(async (url: URL | RequestInfo) =>
      String(url).startsWith('countries/data/')
        ? Response.json(data)
        : new Response(' '.repeat(512 * 1024 + 1), {
            headers: { 'content-type': 'application/json' },
          }),
    ) as unknown as typeof fetch;
    const result = await adapter().loadCountry('01', {
      fetcher: huge,
      config: { apiOrigin: 'https://world.example/' },
    });
    expect(result).toMatchObject({
      kind: 'STATIC_DISCONNECTED',
      reason: 'API_UNAVAILABLE',
      runtime: 'NOT_CONNECTED',
    });
    expect(result.country?.id).toBe('visual-territory-01');
  });

  it('does not accept a country with a forged committed OpeningSeed or missing metric', async () => {
    const data = country();
    const invalid = {
      ...data,
      officialOpening: {
        ...(data.officialOpening as object),
        openingSeedCommitted: true,
      },
    };
    expect(adapter().validCountry(invalid, '01')).toBe(false);
    const profile = {
      ...(data.profile as object),
      foodAvailableStockTonnes: undefined,
    };
    expect(adapter().validCountry({ ...data, profile }, '01')).toBe(false);
  });
});
