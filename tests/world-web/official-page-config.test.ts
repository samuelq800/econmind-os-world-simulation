import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

import { configurePage } from '../../scripts/configure-official-page-read.mjs';
import {
  OFFICIAL_COUNTRY_SOURCE_QUERY,
  OFFICIAL_COUNTRY_PACKAGE_ID,
  OFFICIAL_COUNTRY_SELECTION_SHA256,
} from '../../apps/world-api/src/integration/official-country-baseline.js';
import { OFFICIAL_DATASETS } from '../../apps/world-api/src/integration/official-dataset-registry.js';
import { OFFICIAL_DATASET_SOURCE_QUERY } from '../../apps/world-api/src/integration/official-dataset-source.js';
import { createOfficialEdgeFetchHandler } from '../../apps/world-api/src/integration/official-edge-fetch-adapter.js';

const root = new URL(
  '../../apps/world-web/public/season1-immersive/',
  import.meta.url,
);
const html = readFileSync(new URL('index.html', root), 'utf8');
const adapterSource = readFileSync(
  new URL('country-context.js', root),
  'utf8',
).split('// National geography and local interaction state')[0]!;
const base = 'https://edge.example/functions/v1/world-v2-official-read';
type Result = { kind: string; runtime?: string };
type Reader = {
  loadCountry: (
    number: string,
    options: { fetcher: typeof fetch },
  ) => Promise<Result>;
  createDatasetSession: (
    number: string,
    options: { fetcher: typeof fetch },
  ) => {
    loadCatalogue: () => Promise<Result>;
    loadDataset: (slug: string) => Promise<Result>;
  };
};

function reader(configured: string): Reader {
  const configScript =
    configured.match(
      /<script>(window\.__ECONMIND_WORLD_READ_CONFIG__[\s\S]*?)<\/script>/,
    )?.[1] ?? '';
  const context = {
    URL,
    URLSearchParams,
    TextDecoder,
    AbortController,
    setTimeout,
    clearTimeout,
    EconWorldRead: undefined as Reader | undefined,
  };
  runInNewContext(
    `const window=globalThis;${configScript}\n${adapterSource}`,
    context,
  );
  return context.EconWorldRead!;
}

describe('six-role official-source page configuration', () => {
  it('keeps the authoritative public HTML unchanged when no verified endpoint is supplied', () => {
    expect(configurePage(html, undefined)).toBe(html);
    expect(configurePage(configurePage(html, base), '')).toBe(html);
  });

  it('injects a frozen public base before the adapter, with an idempotent replacement', () => {
    const configured = configurePage(html, base);
    expect(configurePage(configured, base)).toBe(configured);
    expect(configured).toContain(`"apiBaseUrl":"${base}/"`);
    expect(
      configured.indexOf('window.__ECONMIND_WORLD_READ_CONFIG__'),
    ).toBeLessThan(configured.indexOf('src="country-context.js"'));
    expect(
      configurePage(
        configured,
        base.replace('edge.example', 'replacement.example'),
      ),
    ).not.toContain('edge.example');
    const countryEntry = readFileSync(
      new URL('countries/country-entry.js', root),
      'utf8',
    );
    for (const role of [
      'captain',
      'finance',
      'central_bank',
      'industry',
      'trade',
      'social',
    ]) {
      const replace = vi.fn();
      runInNewContext(countryEntry, {
        URL,
        URLSearchParams,
        location: { search: `?role=${role}`, replace },
        document: {
          body: { dataset: { country: '01' } },
          currentScript: {
            src: 'https://pages.example/season1-immersive/countries/country-entry.js',
          },
        },
      });
      expect(replace).toHaveBeenCalledWith(
        `https://pages.example/season1-immersive/?role=${role}&country=01#country`,
      );
    }
  });

  it.each([
    'not a URL',
    'http://edge.example/functions/v1/world-v2-official-read',
    'https://user:password@edge.example/functions/v1/world-v2-official-read',
    `${base}?token=synthetic`,
    `${base}#fragment`,
    'https://edge.example/',
    'https://edge.example/functions/v1/other-function',
  ])(
    'rejects invalid or credential-bearing publication config: %s',
    (address) => {
      expect(() => configurePage(html, address)).toThrow();
    },
  );

  it('fails a build if the adapter injection anchor is absent or duplicated', () => {
    expect(() => configurePage('', base)).toThrow(
      'OFFICIAL_READ_SCRIPT_ANCHOR_INVALID',
    );
    expect(() =>
      configurePage(html + '<script src="country-context.js"></script>', base),
    ).toThrow('OFFICIAL_READ_SCRIPT_ANCHOR_INVALID');
  });

  it('consumes real merged Edge DTOs from immutable source bytes for country and all 34 datasets', async () => {
    const artifact = new URL(
      '../../artifacts/world-balanced-candidate-v1/',
      import.meta.url,
    );
    const query = vi.fn(async (sql: string, values: readonly string[]) => {
      const spec =
        sql === OFFICIAL_COUNTRY_SOURCE_QUERY
          ? { sourcePath: 'data/countries.json', storagePath: values[1] }
          : OFFICIAL_DATASETS.find((item) => item.storagePath === values[1])!;
      expect([
        OFFICIAL_COUNTRY_SOURCE_QUERY,
        OFFICIAL_DATASET_SOURCE_QUERY,
      ]).toContain(sql);
      expect(spec).toBeDefined();
      const content = readFileSync(new URL(spec.sourcePath, artifact), 'utf8');
      // Match the production chunk contract, including the large source files.
      const bytes = Buffer.from(content);
      const parts: string[] = [];
      for (let start = 0; start < bytes.length;) {
        let end = Math.min(
          start + (sql === OFFICIAL_COUNTRY_SOURCE_QUERY ? 200_000 : 140_000),
          bytes.length,
        );
        while (end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end -= 1;
        parts.push(bytes.subarray(start, end).toString('utf8'));
        start = end;
      }
      return {
        rows: parts.map((part, index) => ({
          bundle_id: OFFICIAL_COUNTRY_PACKAGE_ID,
          package_manifest_sha256: OFFICIAL_COUNTRY_SELECTION_SHA256,
          source_status: 'IMPLEMENTED_UNVERIFIED_CANDIDATE',
          activation_allowed: false,
          artifact_path:
            parts.length === 1
              ? spec.storagePath
              : `${spec.storagePath}.part${String(index + 1).padStart(4, '0')}`,
          content_sha256: createHash('sha256').update(part).digest('hex'),
          content_utf8: part,
        })),
      };
    });
    const handler = createOfficialEdgeFetchHandler({
      reader: { query },
      allowedOrigins: ['https://pages.example'],
    });
    const fetcher = vi.fn(
      async (url: URL | RequestInfo, options?: RequestInit) => {
        if (String(url).startsWith('countries/data/'))
          return Response.json(
            JSON.parse(readFileSync(new URL(String(url), root), 'utf8')),
          );
        expect(String(url)).toMatch(
          /^https:\/\/edge\.example\/functions\/v1\/world-v2-official-read\/v1\/world-data\//,
        );
        expect(options).toMatchObject({
          method: 'GET',
          credentials: 'omit',
          cache: 'no-store',
          redirect: 'error',
        });
        const response = await handler(
          new Request(String(url), {
            ...options,
            headers: { ...options?.headers, origin: 'https://pages.example' },
          }),
        );
        expect(response.headers.get('access-control-allow-origin')).toBe(
          'https://pages.example',
        );
        return response;
      },
    ) as unknown as typeof fetch;
    const read = reader(configurePage(html, base));
    expect(await read.loadCountry('01', { fetcher })).toMatchObject({
      kind: 'API_COUNTRY_VERIFIED',
      runtime: 'NOT_CONNECTED',
    });
    const session = read.createDatasetSession('01', { fetcher });
    expect(await session.loadCatalogue()).toMatchObject({ kind: 'CATALOGUE' });
    for (const spec of OFFICIAL_DATASETS) {
      expect((await session.loadDataset(spec.slug)).kind, spec.slug).toBe(
        spec.kind === 'ARRAY'
          ? 'PAGE'
          : spec.kind === 'OBJECT'
            ? 'DATA'
            : 'SECTIONS',
      );
    }
    expect(query).toHaveBeenCalled();
  });
});
