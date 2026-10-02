import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { OFFICIAL_DATASETS } from '../../apps/world-api/src/integration/official-dataset-registry.js';
import {
  OFFICIAL_DATASET_SOURCE_QUERY,
  readOfficialDatasetSource,
} from '../../apps/world-api/src/integration/official-dataset-source.js';
import {
  OFFICIAL_COUNTRY_PACKAGE_ID,
  OFFICIAL_COUNTRY_SOURCE_QUERY,
  OFFICIAL_COUNTRY_SOURCE_STORAGE_PATH,
  readOfficialCountries,
} from '../../apps/world-api/src/integration/official-country-baseline.js';
import {
  createOfficialSourceSnapshotReader,
  OFFICIAL_SOURCE_PUBLIC_BASE,
} from '../../apps/world-api/src/integration/official-source-snapshot-reader.js';
import { createOfficialEdgeFetchHandler } from '../../apps/world-api/src/integration/official-edge-fetch-adapter.js';

const root = new URL(
  '../../artifacts/world-balanced-candidate-v1/',
  import.meta.url,
);
const fetcher = vi.fn(async (url: string, init: RequestInit) => {
  expect(init).toMatchObject({
    method: 'GET',
    redirect: 'error',
    credentials: 'omit',
    headers: { accept: 'application/json' },
  });
  const spec = OFFICIAL_DATASETS.find(
    (item) => url === `${OFFICIAL_SOURCE_PUBLIC_BASE}/${item.sha256}.json`,
  );
  if (!spec) throw new Error('UNEXPECTED_SOURCE');
  return new Response(readFileSync(new URL(spec.sourcePath, root)), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
});

describe('hash-pinned public source snapshot', () => {
  it('reuses all 34 DTO sources including exact-decimal multi-chunk data', async () => {
    const reader = createOfficialSourceSnapshotReader(fetcher);
    expect(await readOfficialCountries(reader)).toHaveLength(70);
    for (const spec of OFFICIAL_DATASETS) {
      const source = await readOfficialDatasetSource(reader, spec);
      expect(source).toBeDefined();
    }
  });
  it('rejects arbitrary SQL, selectors and package before any fetch', async () => {
    const unused = vi.fn();
    const reader = createOfficialSourceSnapshotReader(unused);
    for (const [sql, values] of [
      [
        'select * from auth.users',
        [OFFICIAL_COUNTRY_PACKAGE_ID, OFFICIAL_COUNTRY_SOURCE_STORAGE_PATH],
      ],
      [
        OFFICIAL_DATASET_SOURCE_QUERY,
        ['another', OFFICIAL_COUNTRY_SOURCE_STORAGE_PATH],
      ],
      [
        OFFICIAL_DATASET_SOURCE_QUERY,
        [OFFICIAL_COUNTRY_PACKAGE_ID, '../../private'],
      ],
    ] as const)
      await expect(reader.query(sql, values)).rejects.toThrow(
        'OFFICIAL_SOURCE_FIXED_QUERY_REQUIRED',
      );
    expect(unused).not.toHaveBeenCalled();
  });
  it('fails closed on missing, changed, oversized, redirected or failed source', async () => {
    const raw = readFileSync(new URL('data/countries.json', root));
    const altered = Buffer.from(raw);
    altered[0] = 32;
    for (const response of [
      new Response(null, { status: 404 }),
      new Response(altered, {
        headers: { 'content-type': 'application/json' },
      }),
      new Response(Buffer.concat([raw, Buffer.from('x')]), {
        headers: { 'content-type': 'application/json' },
      }),
      new Response(raw, { headers: { 'content-type': 'text/plain' } }),
    ]) {
      const reader = createOfficialSourceSnapshotReader(async () => response);
      await expect(
        reader.query(OFFICIAL_COUNTRY_SOURCE_QUERY, [
          OFFICIAL_COUNTRY_PACKAGE_ID,
          OFFICIAL_COUNTRY_SOURCE_STORAGE_PATH,
        ]),
      ).rejects.toThrow();
    }
    const reader = createOfficialSourceSnapshotReader(async () => {
      throw new Error('timeout');
    });
    await expect(readOfficialCountries(reader)).rejects.toThrow(
      'SOURCE_UNAVAILABLE',
    );
  });
  it('retains shaped dataset routes, origin policy and no live-state claim', async () => {
    const handle = createOfficialEdgeFetchHandler({
      reader: createOfficialSourceSnapshotReader(fetcher),
      allowedOrigins: ['https://samuelq800.github.io'],
    });
    const url =
      'https://vimksjrhaxdpnkvgsavz.supabase.co/functions/v1/world-v2-official-read/v1/world-data/datasets/countries?limit=1';
    const response = await handle(
      new Request(url, { headers: { Origin: 'https://samuelq800.github.io' } }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe(
      'https://samuelq800.github.io',
    );
    expect(await response.json()).toMatchObject({
      total: 70,
      returned: 1,
      numericEncoding: 'DECIMAL_STRING_EXACT',
      liveWorldState: false,
      proposalFieldsAreExecuted: false,
    });
  });
});
