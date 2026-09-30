import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  OFFICIAL_COUNTRY_PACKAGE_ID,
  OFFICIAL_COUNTRY_SELECTION_SHA256,
  OFFICIAL_COUNTRIES_SHA256,
  OFFICIAL_COUNTRY_SOURCE_QUERY,
  OFFICIAL_COUNTRY_SOURCE_STORAGE_PATH,
} from '../../apps/world-api/src/integration/official-country-baseline.js';
import {
  OFFICIAL_DATASETS,
  OFFICIAL_DATASET_BY_SLUG,
} from '../../apps/world-api/src/integration/official-dataset-registry.js';
import {
  OFFICIAL_DATASET_SOURCE_QUERY,
  parseLosslessOfficialJson,
  readOfficialDatasetSource,
} from '../../apps/world-api/src/integration/official-dataset-source.js';
import { OFFICIAL_DATASET_LIST_PATH } from '../../apps/world-api/src/integration/official-dataset-route.js';
import { OFFICIAL_MAP_ASSET_LIST_PATH } from '../../apps/world-api/src/integration/official-map-asset-route.js';
import {
  createRoleScopedOfficialCountryReader,
  type ManagedOfficialCountryPool,
} from '../../apps/world-api/src/integration/official-country-postgres.js';
import {
  readApiRuntimeConfig,
  startApiRuntime,
  type RunningApiRuntime,
} from '../../apps/world-api/src/runtime.js';

const root = new URL(
  '../../artifacts/world-balanced-candidate-v1/',
  import.meta.url,
);
const checksums = JSON.parse(
  readFileSync(new URL('CHECKSUMS.json', root), 'utf8'),
) as Array<{ path: string; sha256: string; bytes: number }>;
const byPath = new Map(checksums.map((item) => [item.path, item]));
const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');
function compareLosslessShape(value: unknown, native: unknown): unknown {
  if (typeof native === 'number') {
    expect(typeof value).toBe('string');
    return Number(value);
  }
  if (Array.isArray(native)) {
    expect(Array.isArray(value)).toBe(true);
    return native.map((item, index) =>
      compareLosslessShape((value as unknown[])[index], item),
    );
  }
  if (native !== null && typeof native === 'object') {
    expect(
      value !== null && typeof value === 'object' && !Array.isArray(value),
    ).toBe(true);
    return Object.fromEntries(
      Object.entries(native).map(([key, item]) => [
        key,
        compareLosslessShape((value as Record<string, unknown>)[key], item),
      ]),
    );
  }
  expect(value).toBe(native);
  return value;
}

function chunks(content: string): string[] {
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  for (const character of content) {
    const size = Buffer.byteLength(character);
    if (bytes + size > 150_000 && current !== '') {
      parts.push(current);
      current = '';
      bytes = 0;
    }
    current += character;
    bytes += size;
  }
  if (current !== '') parts.push(current);
  return parts;
}

function fixturePool(
  input: {
    readonly corruptSlug?: string;
    readonly missingSlug?: string;
  } = {},
): ManagedOfficialCountryPool & {
  readonly query: ReturnType<typeof vi.fn>;
  readonly end: ReturnType<typeof vi.fn>;
} {
  const query = vi.fn(async (sql: string, values: readonly string[]) => {
    expect(values[0]).toBe(OFFICIAL_COUNTRY_PACKAGE_ID);
    if (sql === OFFICIAL_COUNTRY_SOURCE_QUERY) {
      expect(values[1]).toBe(OFFICIAL_COUNTRY_SOURCE_STORAGE_PATH);
      const content = readFileSync(
        new URL('data/countries.json', root),
        'utf8',
      );
      return {
        rows: [
          {
            bundle_id: OFFICIAL_COUNTRY_PACKAGE_ID,
            package_manifest_sha256: OFFICIAL_COUNTRY_SELECTION_SHA256,
            source_status: 'IMPLEMENTED_UNVERIFIED_CANDIDATE',
            activation_allowed: false,
            content_sha256: OFFICIAL_COUNTRIES_SHA256,
            content_utf8: content,
          },
        ],
      };
    }
    expect(sql).toBe(OFFICIAL_DATASET_SOURCE_QUERY);
    const spec = OFFICIAL_DATASETS.find(
      (item) => item.storagePath === values[1],
    );
    expect(spec).toBeDefined();
    if (spec?.slug === input.missingSlug) return { rows: [] };
    const content = readFileSync(new URL(spec!.sourcePath, root), 'utf8');
    const parts = chunks(content);
    return {
      rows: parts.map((part, index) => ({
        bundle_id: OFFICIAL_COUNTRY_PACKAGE_ID,
        package_manifest_sha256: OFFICIAL_COUNTRY_SELECTION_SHA256,
        source_status: 'IMPLEMENTED_UNVERIFIED_CANDIDATE',
        activation_allowed: false,
        artifact_path:
          parts.length === 1
            ? spec!.storagePath
            : `${spec!.storagePath}.part${String(index + 1).padStart(4, '0')}`,
        content_sha256: sha256(part),
        content_utf8:
          spec?.slug === input.corruptSlug && index === 0
            ? `${part}corrupt`
            : part,
      })),
    };
  });
  return { query, end: vi.fn(async () => undefined) };
}

const settings: NodeJS.ProcessEnv = {
  ECONMIND_ENV: 'ci',
  WORLD_API_OFFICIAL_COUNTRY_DB_ENABLED: 'true',
  WORLD_API_ALL_DATA_ENABLED: 'true',
  WORLD_DATABASE_URL:
    'postgresql://world_v2_api_login:synthetic@127.0.0.1:5432/world_test',
  WORLD_API_DB_LOGIN_ROLE: 'world_v2_api_login',
  WORLD_API_DB_READER_ROLE: 'world_v2_api_reader',
  WORLD_DATABASE_FINGERPRINT: 'world-v2-ci',
};
const runtimes: RunningApiRuntime[] = [];
afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.shutdown()));
  vi.restoreAllMocks();
});

async function start(pool: ManagedOfficialCountryPool) {
  const runtime = await startApiRuntime(
    { ...readApiRuntimeConfig(settings), port: 0 },
    { officialCountryPool: pool },
  );
  runtimes.push(runtime);
  return runtime;
}

describe('complete selected-source dataset API (injected SQL, not production)', () => {
  it('freezes all 34 JSON datasets to the selected checksums and exact original units', () => {
    const jsonPaths = checksums.filter(
      (item) => item.path.startsWith('data/') && item.path.endsWith('.json'),
    );
    expect(OFFICIAL_DATASETS).toHaveLength(34);
    expect(new Set(OFFICIAL_DATASETS.map((spec) => spec.slug)).size).toBe(34);
    expect(OFFICIAL_DATASETS.map((spec) => spec.sourcePath).sort()).toEqual(
      jsonPaths.map((item) => item.path).sort(),
    );
    for (const spec of OFFICIAL_DATASETS) {
      const expected = byPath.get(spec.sourcePath)!;
      expect(spec.sha256).toBe(expected.sha256);
      expect(spec.bytes).toBe(expected.bytes);
      expect(spec.storagePath).toBe(
        `source/${Buffer.from(spec.sourcePath).toString('hex')}`,
      );
      expect(OFFICIAL_DATASET_BY_SLUG.get(spec.slug)).toBe(spec);
    }
  });

  it('preserves numeric JSON tokens as exact decimal strings without changing quoted text', () => {
    expect(
      parseLosslessOfficialJson(
        '{"integer":12345678901234567890,"tail":-0.000000000000000017,"scientific":1.234e-10,"text":"123 \\"4\\"","flag":true}',
      ),
    ).toEqual({
      integer: '12345678901234567890',
      tail: '-0.000000000000000017',
      scientific: '1.234e-10',
      text: '123 "4"',
      flag: true,
    });
  });

  it(
    'reconstructs and verifies all 34 original DB source files including large split geography',
    { timeout: 30_000 },
    async () => {
      const reader = fixturePool();
      for (const spec of OFFICIAL_DATASETS) {
        const loaded = await readOfficialDatasetSource(reader, spec);
        const original = JSON.parse(
          readFileSync(new URL(spec.sourcePath, root), 'utf8'),
        );
        expect(compareLosslessShape(loaded, original)).toEqual(original);
      }
      expect(reader.query).toHaveBeenCalledTimes(34);
      expect(
        OFFICIAL_DATASETS.find((spec) => spec.slug === 'geography')?.bytes,
      ).toBeGreaterThan(8_000_000);
    },
  );

  it(
    'serves a bounded catalogue, filtered/paged array, object and explicit geography fragments',
    { timeout: 30_000 },
    async () => {
      const reader = fixturePool();
      const runtime = await start(reader);
      const ready = await fetch(`${runtime.origin}/readyz`);
      expect(ready.status).toBe(200);
      expect(await ready.json()).toMatchObject({
        ready: true,
        officialCountryDatabaseReady: true,
      });
      const catalogue = await fetch(
        `${runtime.origin}${OFFICIAL_DATASET_LIST_PATH}`,
      );
      expect(catalogue.status).toBe(200);
      const catalogData = await catalogue.json();
      expect(catalogData).toMatchObject({
        datasetCount: 34,
        liveWorldState: false,
        databaseAvailability: 'VERIFY_PER_REQUEST',
      });
      const facilities = await fetch(
        `${runtime.origin}${OFFICIAL_DATASET_LIST_PATH}/facilities?countryId=visual-territory-01&offset=0&limit=50`,
      );
      expect(facilities.status).toBe(200);
      const facilityData = await facilities.json();
      expect(facilityData).toMatchObject({
        dataset: 'facilities',
        dataNature: 'OFFICIAL_SELECTED_SOURCE_DATASET',
        proposalFieldsAreExecuted: false,
        liveWorldState: false,
        filters: { countryId: 'visual-territory-01' },
      });
      expect(facilityData.items.length).toBeGreaterThan(0);
      expect(
        facilityData.items.every(
          (item: { countryId: string }) =>
            item.countryId === 'visual-territory-01',
        ),
      ).toBe(true);
      expect(
        Buffer.byteLength(JSON.stringify(facilityData)),
      ).toBeLessThanOrEqual(256_000);
      const seasonal = await fetch(
        `${runtime.origin}${OFFICIAL_DATASET_LIST_PATH}/seasonal-water?countryId=visual-territory-01&limit=50`,
      );
      expect(seasonal.status).toBe(200);
      const seasonalData = await seasonal.json();
      const regionCountry = new Map(
        (
          JSON.parse(
            readFileSync(new URL('data/regions.json', root), 'utf8'),
          ) as Array<{ id: string; countryId: string }>
        ).map((region) => [region.id, region.countryId]),
      );
      expect(seasonalData.associations.countryRelation).toBe(
        'regionId -> regions.id -> regions.countryId',
      );
      expect(seasonalData.items.length).toBeGreaterThan(0);
      expect(
        seasonalData.items.every(
          (item: { regionId: string; countryId?: string }) =>
            regionCountry.get(item.regionId) === 'visual-territory-01' &&
            item.countryId === undefined,
        ),
      ).toBe(true);
      const changes = await fetch(
        `${runtime.origin}${OFFICIAL_DATASET_LIST_PATH}/changes?countryId=visual-territory-01&limit=50`,
      );
      expect(changes.status).toBe(200);
      const changesData = await changes.json();
      expect(changesData.associations.countryRelation).toBe(
        'objectId -> regions.id -> regions.countryId',
      );
      expect(changesData.items.length).toBeGreaterThan(0);
      expect(
        changesData.items.every(
          (item: { objectId: string; countryId?: string }) =>
            regionCountry.get(item.objectId) === 'visual-territory-01' &&
            item.countryId === undefined,
        ),
      ).toBe(true);
      const assumptions = await fetch(
        `${runtime.origin}${OFFICIAL_DATASET_LIST_PATH}/assumptions`,
      );
      expect(assumptions.status).toBe(200);
      expect(await assumptions.json()).toMatchObject({
        dataset: 'assumptions',
        sourceKind: 'OBJECT',
        data: { population: expect.any(String) },
      });
      const geoIndex = await fetch(
        `${runtime.origin}${OFFICIAL_DATASET_LIST_PATH}/geography`,
      );
      expect(geoIndex.status).toBe(200);
      expect((await geoIndex.json()).sections).toContain(
        'maritime.territorialPath',
      );
      const geoCountry = await fetch(
        `${runtime.origin}${OFFICIAL_DATASET_LIST_PATH}/geography?section=maritime.countries&countryId=visual-territory-01&limit=1`,
      );
      expect(geoCountry.status).toBe(200);
      expect(await geoCountry.json()).toMatchObject({
        section: 'maritime.countries',
        returned: 1,
        items: [{ id: 'visual-territory-01' }],
      });
      const fragment = await fetch(
        `${runtime.origin}${OFFICIAL_DATASET_LIST_PATH}/geography?section=maritime.territorialPath&fragmentOffset=0&fragmentLength=1024`,
      );
      expect(fragment.status).toBe(200);
      expect(await fragment.json()).toMatchObject({
        section: 'maritime.territorialPath',
        fragmentLength: 1024,
        nextFragmentOffset: 1024,
      });
      const geoMetadata = await fetch(
        `${runtime.origin}${OFFICIAL_DATASET_LIST_PATH}/geography?section=metadata`,
      );
      expect(geoMetadata.status).toBe(200);
      expect(Buffer.byteLength(await geoMetadata.text())).toBeLessThan(256_000);
    },
  );

  it('rejects unknown paths, unsupported filters and missing/corrupt chunks without raw reflection', async () => {
    const reader = fixturePool({ corruptSlug: 'stocks' });
    const runtime = await start(reader);
    const before = reader.query.mock.calls.length;
    for (const path of ['/../../status/decisions.json', '/not-a-dataset'])
      expect(
        (await fetch(`${runtime.origin}${OFFICIAL_DATASET_LIST_PATH}${path}`))
          .status,
      ).toBe(404);
    for (const query of [
      '/facilities?sql=select',
      '/facilities?limit=999999',
      '/facilities?countryId=COUNTRY_01',
      '/commodity-catalog?countryId=visual-territory-01',
      '/geography?section=maritime',
      '/geography?section=maritime.territorialPath&fragmentLength=999999',
      '/facilities?offset=0&offset=1',
    ])
      expect(
        (await fetch(`${runtime.origin}${OFFICIAL_DATASET_LIST_PATH}${query}`))
          .status,
      ).toBe(400);
    expect(reader.query.mock.calls.length).toBe(before);
    const corrupt = await fetch(
      `${runtime.origin}${OFFICIAL_DATASET_LIST_PATH}/stocks`,
    );
    expect(corrupt.status).toBe(502);
    expect(await corrupt.text()).not.toContain('corrupt');
    const missingRuntime = await start(fixturePool({ missingSlug: 'power' }));
    expect(
      (
        await fetch(
          `${missingRuntime.origin}${OFFICIAL_DATASET_LIST_PATH}/power`,
        )
      ).status,
    ).toBe(503);
    expect((await fetch(`${missingRuntime.origin}/readyz`)).status).toBe(503);
    const corruptRegions = await start(fixturePool({ corruptSlug: 'regions' }));
    const brokenRelation = await fetch(
      `${corruptRegions.origin}${OFFICIAL_DATASET_LIST_PATH}/seasonal-water?countryId=visual-territory-01`,
    );
    expect(brokenRelation.status).toBe(502);
  });

  it('catalogues all 203 verified map-package files, only two links per country, without claiming static publication', async () => {
    const reader = fixturePool();
    const runtime = await start(reader);
    const firstPage = await fetch(
      `${runtime.origin}${OFFICIAL_MAP_ASSET_LIST_PATH}?limit=50`,
    );
    expect(firstPage.status).toBe(200);
    expect(await firstPage.json()).toMatchObject({
      totalPackageFiles: 203,
      imageFiles: 160,
      countryAssociatedFiles: 140,
      globalOrSupportFiles: 63,
      returned: 50,
      nextOffset: 50,
      staticPublicationStatus: 'NOT_VERIFIED',
      productionDatabaseStorageStatus: 'NOT_CLAIMED',
      liveWorldState: false,
    });
    const country = await fetch(
      `${runtime.origin}${OFFICIAL_MAP_ASSET_LIST_PATH}?countryId=visual-territory-01`,
    );
    expect(country.status).toBe(200);
    const data = await country.json();
    expect(data.total).toBe(2);
    expect(
      data.assets
        .map((asset: { classification: string }) => asset.classification)
        .sort(),
    ).toEqual(['COUNTRY_DETAIL', 'COUNTRY_SCENE']);
    expect(
      data.assets.every(
        (asset: { publicUrl: null; sourceCountryId: string }) =>
          asset.publicUrl === null &&
          asset.sourceCountryId === 'visual-territory-01',
      ),
    ).toBe(true);
    expect(
      (
        await fetch(
          `${runtime.origin}${OFFICIAL_MAP_ASSET_LIST_PATH}?path=secret`,
        )
      ).status,
    ).toBe(400);
    expect(reader.query).not.toHaveBeenCalled();
  });

  it('keeps all-data routes off unless both explicit flags and dedicated DB config are present', async () => {
    expect(() =>
      readApiRuntimeConfig({
        ...settings,
        WORLD_API_OFFICIAL_COUNTRY_DB_ENABLED: undefined,
      }),
    ).toThrow();
    expect(() =>
      readApiRuntimeConfig({
        ...settings,
        WORLD_API_ALL_DATA_ENABLED: 'maybe',
      }),
    ).toThrow();
    const config = readApiRuntimeConfig({
      ...settings,
      WORLD_API_ALL_DATA_ENABLED: undefined,
    });
    const runtime = await startApiRuntime(
      { ...config, port: 0 },
      { officialCountryPool: fixturePool() },
    );
    runtimes.push(runtime);
    expect(
      (await fetch(`${runtime.origin}${OFFICIAL_DATASET_LIST_PATH}`)).status,
    ).toBe(404);
  });

  it('permits only fixed registry SQL under the read-only role', async () => {
    const release = vi.fn();
    const calls: string[] = [];
    const client = {
      query: vi.fn(async (text: string) => {
        calls.push(text);
        return { rows: [] };
      }),
      release,
    };
    const scoped = createRoleScopedOfficialCountryReader({
      connect: vi.fn(async () => client),
    } as unknown as Parameters<
      typeof createRoleScopedOfficialCountryReader
    >[0]);
    const spec = OFFICIAL_DATASET_BY_SLUG.get('finance')!;
    await scoped.query(OFFICIAL_DATASET_SOURCE_QUERY, [
      OFFICIAL_COUNTRY_PACKAGE_ID,
      spec.storagePath,
    ]);
    expect(calls).toEqual([
      'begin read only',
      'set local role world_v2_api_reader',
      OFFICIAL_DATASET_SOURCE_QUERY,
      'commit',
    ]);
    await expect(
      scoped.query(OFFICIAL_DATASET_SOURCE_QUERY, [
        OFFICIAL_COUNTRY_PACKAGE_ID,
        'source/arbitrary',
      ]),
    ).rejects.toThrow('FIXED_QUERY_REQUIRED');
    expect(release).toHaveBeenCalledOnce();
  });
});
