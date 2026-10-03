import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  OFFICIAL_DATASETS,
  type OfficialDatasetSpec,
} from '../../apps/world-api/src/integration/official-dataset-registry.js';
import {
  OFFICIAL_DATASET_SOURCE_QUERY,
  readOfficialDatasetSource,
  registerOfficialSnapshotSourceStore,
  OFFICIAL_SNAPSHOT_CACHE_LIMITS,
} from '../../apps/world-api/src/integration/official-dataset-source.js';
import {
  OFFICIAL_COUNTRY_PACKAGE_ID,
  OFFICIAL_COUNTRY_SOURCE_QUERY,
  OFFICIAL_COUNTRY_SOURCE_STORAGE_PATH,
  readOfficialCountries,
  type OfficialCountrySqlReader,
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

function fixture(
  content: string,
  slug = 'small',
): {
  raw: Buffer;
  spec: OfficialDatasetSpec;
} {
  const raw = Buffer.from(content);
  return {
    raw,
    spec: {
      ...OFFICIAL_DATASETS[0]!,
      slug,
      sourcePath: `data/${slug}.json`,
      storagePath: `data/${slug}.json`,
      bytes: raw.length,
      sha256: createHash('sha256').update(raw).digest('hex'),
      kind: 'OBJECT',
    },
  };
}

describe('bounded verified snapshot store (normal small fixtures)', () => {
  const reader = (): OfficialCountrySqlReader => ({ query: vi.fn() });

  it('coalesces identical loads, preserves lexical values and freezes nested data', async () => {
    const data = fixture(
      '{"nested":{"decimal":0.10000000000000001,"negative":-0,"exponent":1e-3,"nature":"ILLUSTRATIVE","unit":"tonne","text":"12 2026-10-03"}}',
    );
    const load = vi.fn(async () => data.raw);
    const source = reader();
    registerOfficialSnapshotSourceStore(source, load);
    const [first, second] = await Promise.all([
      readOfficialDatasetSource(source, data.spec),
      readOfficialDatasetSource(source, data.spec),
    ]);
    expect(first).toBe(second);
    expect(load).toHaveBeenCalledTimes(1);
    expect(first).toEqual({
      nested: {
        decimal: '0.10000000000000001',
        negative: '-0',
        exponent: '1e-3',
        nature: 'ILLUSTRATIVE',
        unit: 'tonne',
        text: '12 2026-10-03',
      },
    });
    const nested = (first as { nested: Record<string, string> }).nested;
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(nested)).toBe(true);
    expect(() => {
      nested.decimal = '999';
    }).toThrow();
    expect(await readOfficialDatasetSource(source, data.spec)).toBe(first);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not retain failed fetch, size, hash, UTF-8, parse or shape results', async () => {
    const good = fixture('{"ok":1}');
    const malformed = fixture('{"ok":');
    const utf8 = fixture('{}');
    utf8.raw[0] = 255;
    const utf8Spec = {
      ...utf8.spec,
      sha256: createHash('sha256').update(utf8.raw).digest('hex'),
    };
    for (const [raw, spec] of [
      [Buffer.from('{"ok":2}'), good.spec],
      [Buffer.concat([good.raw, Buffer.from('x')]), good.spec],
      [malformed.raw, malformed.spec],
      [utf8.raw, utf8Spec],
      [good.raw, { ...good.spec, kind: 'ARRAY' as const }],
    ] as const) {
      const source = reader();
      const load = vi
        .fn()
        .mockResolvedValueOnce(raw)
        .mockResolvedValue(good.raw);
      registerOfficialSnapshotSourceStore(source, load);
      await expect(readOfficialDatasetSource(source, spec)).rejects.toThrow(
        'SOURCE_INVALID',
      );
      await expect(
        readOfficialDatasetSource(source, good.spec),
      ).resolves.toEqual({ ok: '1' });
      expect(load).toHaveBeenCalledTimes(2);
    }
    const source = reader();
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(good.raw);
    registerOfficialSnapshotSourceStore(source, load);
    const failed = await Promise.allSettled([
      readOfficialDatasetSource(source, good.spec),
      readOfficialDatasetSource(source, good.spec),
    ]);
    expect(failed.map((item) => item.status)).toEqual(['rejected', 'rejected']);
    expect(load).toHaveBeenCalledTimes(1);
    await expect(readOfficialDatasetSource(source, good.spec)).resolves.toEqual(
      { ok: '1' },
    );
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('separates reader, dataset, source identity and kind', async () => {
    const a = fixture('{"value":1}', 'a');
    const b = fixture('{"value":2}', 'b');
    const source = reader();
    const load = vi.fn(async (spec: OfficialDatasetSpec) =>
      spec.sha256 === b.spec.sha256 ? b.raw : a.raw,
    );
    registerOfficialSnapshotSourceStore(source, load);
    expect(await readOfficialDatasetSource(source, a.spec)).toEqual({
      value: '1',
    });
    expect(await readOfficialDatasetSource(source, b.spec)).toEqual({
      value: '2',
    });
    await readOfficialDatasetSource(source, {
      ...a.spec,
      storagePath: 'other.json',
    });
    await readOfficialDatasetSource(source, {
      ...a.spec,
      sourcePath: 'other.json',
    });
    await expect(
      readOfficialDatasetSource(source, { ...a.spec, kind: 'ARRAY' }),
    ).rejects.toThrow('SOURCE_INVALID');
    await expect(
      readOfficialDatasetSource(source, { ...a.spec, bytes: a.spec.bytes + 1 }),
    ).rejects.toThrow('SOURCE_INVALID');
    expect(load).toHaveBeenCalledTimes(6);
    const other = reader();
    registerOfficialSnapshotSourceStore(other, load);
    await readOfficialDatasetSource(other, a.spec);
    expect(load).toHaveBeenCalledTimes(7);
  });

  it('bounds entries, retained source/value accounting and normal concurrent loads', async () => {
    const a = fixture('{"a":1}', 'a');
    const b = fixture('{"b":2}', 'b');
    const c = fixture('{"c":3}', 'c');
    for (const limits of [
      { entries: 1 },
      { sourceBytes: a.raw.length },
      { valueBytes: 1 },
    ]) {
      const source = reader();
      const load = vi.fn(async (spec: OfficialDatasetSpec) =>
        spec.slug === 'a' ? a.raw : b.raw,
      );
      registerOfficialSnapshotSourceStore(source, load, limits);
      await readOfficialDatasetSource(source, a.spec);
      await readOfficialDatasetSource(source, b.spec);
      await readOfficialDatasetSource(source, a.spec);
      expect(load).toHaveBeenCalledTimes(3);
    }
    const source = reader();
    let release!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const load = vi.fn(async (spec: OfficialDatasetSpec) => {
      await wait;
      return spec.slug === 'a' ? a.raw : b.raw;
    });
    registerOfficialSnapshotSourceStore(source, load);
    const first = readOfficialDatasetSource(source, a.spec);
    const second = readOfficialDatasetSource(source, b.spec);
    await expect(readOfficialDatasetSource(source, c.spec)).rejects.toThrow(
      'SOURCE_UNAVAILABLE',
    );
    release();
    expect(await first).toEqual({ a: '1' });
    expect(await second).toEqual({ b: '2' });
    expect(load).toHaveBeenCalledTimes(2);
    expect(() =>
      registerOfficialSnapshotSourceStore(reader(), load, {
        entries: OFFICIAL_SNAPSHOT_CACHE_LIMITS.entries + 1,
      }),
    ).toThrow('SNAPSHOT_CACHE_LIMIT_INVALID');
  });

  it('does not cache generic SQL readers', async () => {
    const data = fixture('{"ok":1}');
    const query = vi.fn(async () => ({
      rows: [
        {
          bundle_id: OFFICIAL_COUNTRY_PACKAGE_ID,
          package_manifest_sha256:
            '88dd44478f97d2e8893a4f11b3aaf96e256bdb13248aca0d08f097fabe10d315',
          source_status: 'IMPLEMENTED_UNVERIFIED_CANDIDATE',
          activation_allowed: false,
          artifact_path: data.spec.storagePath,
          content_sha256: data.spec.sha256,
          content_utf8: data.raw.toString('utf8'),
        },
      ],
    }));
    const source = { query };
    await readOfficialDatasetSource(source, data.spec);
    await readOfficialDatasetSource(source, data.spec);
    expect(query).toHaveBeenCalledTimes(2);
  });
  it('evicts the least recently used identity, not a recently touched entry', async () => {
    const fixtures = [
      fixture('{"a":1}', 'a'),
      fixture('{"b":2}', 'b'),
      fixture('{"c":3}', 'c'),
    ];
    const source = reader();
    const load = vi.fn(
      async (spec: OfficialDatasetSpec) =>
        fixtures.find((item) => item.spec.slug === spec.slug)!.raw,
    );
    registerOfficialSnapshotSourceStore(source, load, { entries: 2 });
    const [a, b, c] = fixtures;
    await readOfficialDatasetSource(source, a!.spec);
    await readOfficialDatasetSource(source, b!.spec);
    await readOfficialDatasetSource(source, a!.spec);
    await readOfficialDatasetSource(source, c!.spec);
    await readOfficialDatasetSource(source, a!.spec);
    expect(load).toHaveBeenCalledTimes(3);
    await readOfficialDatasetSource(source, b!.spec);
    expect(load).toHaveBeenCalledTimes(4);
  });
});

describe('hash-pinned public source snapshot', () => {
  it('reuses only verified snapshot bytes and retries a failed load on a later request', async () => {
    const spec = OFFICIAL_DATASETS.find((item) => item.slug === 'coverage')!;
    const raw = readFileSync(new URL(spec.sourcePath, root));
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(Buffer.from('{}'), {
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockImplementation(
        async () =>
          new Response(raw, {
            headers: { 'content-type': 'application/json' },
          }),
      );
    const reader = createOfficialSourceSnapshotReader(fetch);
    await expect(readOfficialDatasetSource(reader, spec)).rejects.toThrow();
    const valid = await readOfficialDatasetSource(reader, spec);
    expect(await readOfficialDatasetSource(reader, spec)).toBe(valid);
    expect(Object.isFrozen(valid)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
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
