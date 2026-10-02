import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createOfficialEdgeFetchHandler } from '../../apps/world-api/src/integration/official-edge-fetch-adapter.js';
import { OFFICIAL_EXPLORER_SOURCE } from '../../apps/world-web/src/official-data/official-explorer-country-manifest.js';
import { OFFICIAL_SOURCE_CATALOG_IDENTITIES } from '../../apps/world-web/src/official-data/official-source-status-registry.js';
import {
  createOfficialSourceStatusSession,
  officialSourceCatalogUrl,
  verifyOfficialSourceCatalog,
} from '../../apps/world-web/src/official-data/official-source-status-catalog.js';

const config = {
  apiBaseUrl: 'https://edge.example/functions/v1/world-v2-official-read/',
};
let catalog: Record<string, unknown> & { datasets: Record<string, unknown>[] };
beforeAll(async () => {
  const query = vi.fn(async () => {
    throw new Error('Catalog must not read economic rows');
  });
  const handler = createOfficialEdgeFetchHandler({
    reader: { query },
    allowedOrigins: ['https://pages.example'],
  });
  const response = await handler(
    new Request(new URL('v1/world-data/datasets', config.apiBaseUrl), {
      headers: { origin: 'https://pages.example' },
    }),
  );
  expect(response.status).toBe(200);
  catalog = (await response.json()) as typeof catalog;
  expect(query).not.toHaveBeenCalled();
});
afterEach(() => vi.useRealTimers());

const waitForKind = async (
  session: ReturnType<typeof createOfficialSourceStatusSession>,
  kind: string,
) => {
  await vi.waitFor(() => expect(session.getSnapshot().kind).toBe(kind));
};

describe('official source catalog identities', () => {
  it('uses exactly the 34 local selected JSON identities from the frozen checksum file', () => {
    const raw = readFileSync(
      'artifacts/world-balanced-candidate-v1/CHECKSUMS.json',
    );
    expect(createHash('sha256').update(raw).digest('hex')).toBe(
      OFFICIAL_EXPLORER_SOURCE.selectionChecksumSha256,
    );
    const selected = JSON.parse(raw.toString()) as {
      path: string;
      sha256: string;
      bytes: number;
    }[];
    const data = selected.filter((row) =>
      /^data\/[^/]+\.json$/u.test(row.path),
    );
    expect(OFFICIAL_SOURCE_CATALOG_IDENTITIES).toHaveLength(34);
    expect(
      OFFICIAL_SOURCE_CATALOG_IDENTITIES.map((row) => ({
        path: row.sourcePath,
        sha256: row.sha256,
        bytes: row.bytes,
      })),
    ).toEqual(data);
    expect(verifyOfficialSourceCatalog(catalog)).toBe(true);
  });
  it.each([
    ['packageId', 'different-package'],
    ['selectionChecksumSha256', '0'.repeat(64)],
    ['datasetCount', 33],
    ['liveWorldState', true],
    ['ok', false],
    ['dataNature', 'LIVE_WORLD'],
  ])('rejects top-level %s mismatch', (key, value) => {
    expect(verifyOfficialSourceCatalog({ ...catalog, [key]: value })).toBe(
      false,
    );
  });
  it.each([
    ['dataset', 'unknown'],
    ['sourceSha256', '0'.repeat(64)],
    ['sourceBytes', 0],
    ['sourcePath', '../other.json'],
    ['sourceKind', 'ARRAY_WRONG'],
    ['packageId', 'other'],
    ['selectionChecksumSha256', '1'.repeat(64)],
    ['liveWorldState', true],
    ['proposalFieldsAreExecuted', true],
    ['numericEncoding', 'FLOAT_APPROXIMATE'],
    ['unitTreatment', 'CONVERTED_UNITS'],
  ])('rejects dataset %s mismatch', (key, value) => {
    const changed = structuredClone(catalog);
    changed.datasets[0]![key] = value;
    expect(verifyOfficialSourceCatalog(changed)).toBe(false);
  });
  it('rejects missing, duplicate and additional identities even when the count claims 34', () => {
    expect(
      verifyOfficialSourceCatalog({
        ...catalog,
        datasets: catalog.datasets.slice(1),
      }),
    ).toBe(false);
    expect(
      verifyOfficialSourceCatalog({
        ...catalog,
        datasets: [catalog.datasets[0], ...catalog.datasets.slice(0, 33)],
      }),
    ).toBe(false);
    expect(
      verifyOfficialSourceCatalog({
        ...catalog,
        datasets: [...catalog.datasets, catalog.datasets[0]],
      }),
    ).toBe(false);
  });
  it('accepts a reordered catalog without relying on key or row order', () => {
    expect(
      verifyOfficialSourceCatalog({
        ...catalog,
        datasets: [...catalog.datasets].reverse(),
      }),
    ).toBe(true);
  });
});

describe('one credential-free bounded catalog read', () => {
  it.each([undefined, null])(
    'does not read when publication config is absent',
    (input) => {
      const fetcher = vi.fn();
      const session = createOfficialSourceStatusSession(input, fetcher);
      expect(session.getSnapshot().kind).toBe('NOT_CONFIGURED');
      session.subscribe(vi.fn())();
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it.each([
    {},
    { apiOrigin: 'https://edge.example' },
    { apiBaseUrl: config.apiBaseUrl, token: 'synthetic' },
    { apiBaseUrl: 'http://edge.example/functions/v1/world-v2-official-read/' },
    { apiBaseUrl: config.apiBaseUrl + '?token=synthetic' },
    {
      apiBaseUrl:
        'https://user:pass@edge.example/functions/v1/world-v2-official-read/',
    },
    { apiBaseUrl: 'https://edge.example/functions/v1/other/' },
  ])('rejects invalid config without a request', (input) => {
    expect(officialSourceCatalogUrl(input)).toBeNull();
    const fetcher = vi.fn();
    const session = createOfficialSourceStatusSession(input, fetcher);
    session.subscribe(vi.fn())();
    expect(session.getSnapshot().kind).toBe('UNAVAILABLE');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('verifies actual merged Edge metadata with one GET and survives StrictMode resubscription', async () => {
    const fetcher = vi.fn(async (...args: Parameters<typeof fetch>) => {
      expect(args[0]).toBeInstanceOf(URL);
      return Response.json(catalog);
    });
    const session = createOfficialSourceStatusSession(config, fetcher);
    expect(session.getSnapshot().kind).toBe('LOADING');
    const first = session.subscribe(vi.fn());
    first();
    const stop = session.subscribe(vi.fn());
    await waitForKind(session, 'SELECTED_SOURCE_CATALOG_VERIFIED');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      config.apiBaseUrl + 'v1/world-data/datasets',
    );
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      headers: { accept: 'application/json' },
    });
    stop();
  });
  it.each([
    [
      'wrong catalog hash',
      () =>
        Response.json({ ...catalog, selectionChecksumSha256: '0'.repeat(64) }),
    ],
    ['unavailable HTTP', () => Response.json({ ok: false }, { status: 503 })],
    [
      'wrong MIME',
      () =>
        new Response(JSON.stringify(catalog), {
          headers: { 'content-type': 'text/html' },
        }),
    ],
    [
      'oversized body',
      () =>
        new Response(' '.repeat(128001), {
          headers: { 'content-type': 'application/json' },
        }),
    ],
    [
      'invalid JSON',
      () =>
        new Response('{broken', {
          headers: { 'content-type': 'application/json' },
        }),
    ],
  ])(
    'remains unavailable for %s without a fallback or retry',
    async (_label, response) => {
      const fetcher = vi.fn(async () => response());
      const session = createOfficialSourceStatusSession(config, fetcher);
      const stop = session.subscribe(vi.fn());
      await waitForKind(session, 'UNAVAILABLE');
      expect(fetcher).toHaveBeenCalledTimes(1);
      stop();
    },
  );
  it('retires a timed-out transport and ignores its late success without polling', async () => {
    vi.useFakeTimers();
    let resolve!: (value: Response) => void;
    const fetcher = vi.fn((...args: Parameters<typeof fetch>) => {
      expect(args[0]).toBeInstanceOf(URL);
      return new Promise<Response>((done) => {
        resolve = done;
      });
    });
    const session = createOfficialSourceStatusSession(config, fetcher);
    const stop = session.subscribe(vi.fn());
    await vi.advanceTimersByTimeAsync(5001);
    expect(session.getSnapshot().kind).toBe('UNAVAILABLE');
    expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    resolve(Response.json(catalog));
    await vi.advanceTimersByTimeAsync(60000);
    expect(session.getSnapshot().kind).toBe('UNAVAILABLE');
    expect(fetcher).toHaveBeenCalledTimes(1);
    stop();
  });
  it('cancels a stalled response body at the same timeout', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const fetcher = vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('{'));
            },
            cancel,
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
    );
    const session = createOfficialSourceStatusSession(config, fetcher);
    const stop = session.subscribe(vi.fn());
    await vi.advanceTimersByTimeAsync(5001);
    expect(session.getSnapshot().kind).toBe('UNAVAILABLE');
    expect(cancel).toHaveBeenCalled();
    stop();
  });
  it('aborts a real unmount and never republishes the retired reply', async () => {
    let resolve!: (value: Response) => void;
    const fetcher = vi.fn((...args: Parameters<typeof fetch>) => {
      expect(args[0]).toBeInstanceOf(URL);
      return new Promise<Response>((done) => {
        resolve = done;
      });
    });
    const session = createOfficialSourceStatusSession(config, fetcher);
    const observer = vi.fn();
    const stop = session.subscribe(observer);
    stop();
    await Promise.resolve();
    expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    resolve(Response.json(catalog));
    await new Promise((done) => setTimeout(done, 10));
    expect(observer).not.toHaveBeenCalled();
    expect(session.getSnapshot().kind).not.toBe(
      'SELECTED_SOURCE_CATALOG_VERIFIED',
    );
  });
});
