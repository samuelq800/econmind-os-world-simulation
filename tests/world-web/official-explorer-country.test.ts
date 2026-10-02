import { webcrypto, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createOfficialExplorerCountryLoader,
  validateOfficialExplorerCountryPayload,
} from '../../apps/world-web/src/official-data/official-explorer-country.js';
import {
  OFFICIAL_EXPLORER_COUNTRY_FILES,
  OFFICIAL_EXPLORER_SUMMARY,
} from '../../apps/world-web/src/official-data/official-explorer-country-manifest.js';

const root = new URL(
  '../../apps/world-web/public/season1-immersive/countries/data/',
  import.meta.url,
);
const bytes = (number = '01') => readFileSync(new URL(`${number}.json`, root));
const payload = (number = '01') => JSON.parse(bytes(number).toString('utf8'));
const crypto = webcrypto as unknown as Pick<Crypto, 'subtle'>;
const baseUrl = 'https://pages.example/world/';
const response = (value = bytes()) =>
  new Response(value, { headers: { 'content-type': 'application/json' } });
const makeLoader = (fetcher: typeof fetch) =>
  createOfficialExplorerCountryLoader({ fetcher, crypto, baseUrl });
afterEach(() => vi.useRealTimers());

describe('official selected-source explorer lazy country adapter', () => {
  it('validates and preserves every owned record in all 70 generated country files', async () => {
    const fetcher = vi.fn(async (url: URL | RequestInfo) =>
      response(bytes(/(\d{2})\.json$/.exec(String(url))![1]!)),
    ) as unknown as typeof fetch;
    const loader = makeLoader(fetcher);
    let population = 0,
      facilities = 0,
      resources = 0,
      regions = 0,
      nullAnchors = 0;
    for (const [number, spec] of Object.entries(
      OFFICIAL_EXPLORER_COUNTRY_FILES,
    )) {
      const raw = payload(number);
      expect(validateOfficialExplorerCountryPayload(raw, number), number).toBe(
        true,
      );
      const result = await loader.load(`visual-territory-${number}`);
      expect(result.kind, number).toBe('ready');
      if (result.kind !== 'ready')
        throw Error(`${number}: ${JSON.stringify(result)}`);
      const data = result.data;
      expect(data.facilities).toEqual(raw.facilities);
      expect(data.resources).toEqual(raw.resources);
      expect(data.regions).toEqual(raw.regions);
      expect(data.profile).toEqual(raw.profile);
      expect(data.officialOpening).toEqual(raw.officialOpening);
      expect(data.officialSource).toEqual(raw.officialSource);
      expect(data.source).toMatchObject({
        kind: 'selected-source-display',
        countryFileSha256: spec.sha256,
        liveWorldState: false,
        proposalFieldsAreExecuted: false,
        worldId: null,
        openingSeedCommitted: false,
      });
      expect(createHash('sha256').update(bytes(number)).digest('hex')).toBe(
        spec.sha256,
      );
      expect(Object.isFrozen(data.facilities[0]?.record)).toBe(true);
      population += data.population;
      facilities += data.facilities.length;
      resources += data.resources.length;
      regions += data.regions.length;
      nullAnchors += data.facilities.filter((f) => f.anchor === null).length;
    }
    expect({ population, facilities, resources, regions, nullAnchors }).toEqual(
      {
        population: 14712146434,
        facilities: 1374,
        resources: 240,
        regions: 122,
        nullAnchors: 986,
      },
    );
    expect(OFFICIAL_EXPLORER_SUMMARY).toMatchObject({
      countriesExact: '70',
      populationExact: String(population),
      facilitiesExact: String(facilities),
      resourcesExact: String(resources),
      regionsExact: String(regions),
      liveWorldState: false,
    });
    expect(fetcher).toHaveBeenCalledTimes(70);
  });

  it('loads only one requested country under the application base, without credentials or row cache', async () => {
    const fetcher = vi.fn(async () => response()) as unknown as typeof fetch;
    const loader = makeLoader(fetcher);
    expect((await loader.load('01')).kind).toBe('ready');
    expect((await loader.load('visual-territory-01')).kind).toBe('ready');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(vi.mocked(fetcher).mock.calls[0]![0])).toBe(
      `${baseUrl}season1-immersive/countries/data/01.json`,
    );
    expect(vi.mocked(fetcher).mock.calls[0]![1]).toMatchObject({
      method: 'GET',
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    });
  });

  it.each([
    '1',
    '00',
    '71',
    'visual-territory-1',
    'visual-territory-71',
    '01?role=finance',
    '../01',
  ])('rejects invalid identity %s before fetching', async (reference) => {
    const fetcher = vi.fn() as unknown as typeof fetch;
    expect(await makeLoader(fetcher).load(reference)).toEqual({
      kind: 'error',
      reason: 'COUNTRY_ID_INVALID',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    (x: ReturnType<typeof payload>) => {
      x.id = 'visual-territory-02';
    },
    (x: ReturnType<typeof payload>) => {
      x.sourceStatus = 'LIVE_WORLD_STATE';
    },
    (x: ReturnType<typeof payload>) => {
      x.officialOpening.countriesSha256 = '0'.repeat(64);
    },
    (x: ReturnType<typeof payload>) => {
      x.officialOpening.openingSeedCommitted = true;
    },
    (x: ReturnType<typeof payload>) => {
      x.officialOpening.worldId = 'world';
    },
    (x: ReturnType<typeof payload>) => {
      delete x.profile.bankReservesGcu;
    },
    (x: ReturnType<typeof payload>) => {
      x.facilities[0].record.estimatedCapacity = undefined;
    },
    (x: ReturnType<typeof payload>) => {
      x.facilities[0].record.countryId = 'visual-territory-02';
    },
    (x: ReturnType<typeof payload>) => {
      x.facilities[1].id = x.facilities[0].id;
    },
    (x: ReturnType<typeof payload>) => {
      x.facilities[0].anchor = [1.1, 0.5];
    },
    (x: ReturnType<typeof payload>) => {
      x.facilities[0].resourceId = 'NOT_A_RESOURCE';
    },
    (x: ReturnType<typeof payload>) => {
      x.resources[0].deposit.recoverableRemaining = null;
    },
    (x: ReturnType<typeof payload>) => {
      x.resources[0].deposit.regionId = 'another-country-region';
    },
    (x: ReturnType<typeof payload>) => {
      x.regions[0].initial.population += 1;
    },
    (x: ReturnType<typeof payload>) => {
      x.officialOpening.stocks[0].countryId = 'visual-territory-02';
    },
    (x: ReturnType<typeof payload>) => {
      x.officialSource = { authority: 'LIVE_WORLD_STATE' };
    },
    (x: ReturnType<typeof payload>) => {
      delete x.officialSource;
    },
    (x: ReturnType<typeof payload>) => {
      x.officialSource.sourceChecksumsSha256 = '0'.repeat(64);
    },
    (x: ReturnType<typeof payload>) => {
      delete x.officialSource.fields['/profile/population'].exact;
    },
  ])(
    'rejects missing/wrong source, country or record structure (%#)',
    (mutate) => {
      const raw = payload();
      mutate(raw);
      expect(validateOfficialExplorerCountryPayload(raw, '01')).toBe(false);
    },
  );

  it('rejects changed file bytes even when source identity labels remain correct', async () => {
    const tampered = Buffer.from(
      bytes().toString('utf8').replace('Avenor', 'Xvenor'),
    );
    expect(
      await makeLoader(
        vi.fn(async () => response(tampered)) as unknown as typeof fetch,
      ).load('01'),
    ).toEqual({ kind: 'error', reason: 'SOURCE_HASH_MISMATCH' });
  });

  it('does not combine a valid old country with a new missing or unavailable country', async () => {
    const fetcher = vi.fn(async (url: URL | RequestInfo) =>
      String(url).endsWith('01.json')
        ? response()
        : new Response(null, { status: 404 }),
    ) as unknown as typeof fetch;
    const loader = makeLoader(fetcher);
    expect((await loader.load('01')).kind).toBe('ready');
    expect(await loader.load('02')).toEqual({
      kind: 'missing',
      reason: 'COUNTRY_FILE_MISSING',
    });
    expect(
      await makeLoader(
        vi.fn(
          async () =>
            new Response('<html>', {
              headers: { 'content-type': 'text/html' },
            }),
        ) as unknown as typeof fetch,
      ).load('01'),
    ).toEqual({ kind: 'error', reason: 'SOURCE_UNAVAILABLE' });
  });

  it('bounds oversized and truncated files before accepting a DTO', async () => {
    expect(
      await makeLoader(
        vi.fn(async () =>
          response(Buffer.concat([bytes(), Buffer.from(' ')])),
        ) as unknown as typeof fetch,
      ).load('01'),
    ).toEqual({ kind: 'error', reason: 'SOURCE_TOO_LARGE' });
    expect(
      await makeLoader(
        vi.fn(async () =>
          response(bytes().subarray(1)),
        ) as unknown as typeof fetch,
      ).load('01'),
    ).toEqual({ kind: 'error', reason: 'SOURCE_HASH_MISMATCH' });
  });

  it('retires an aborted read even when fetch ignores abort, without contaminating a later selection', async () => {
    let resolve: ((value: Response) => void) | undefined;
    const fetcher = vi.fn((url: URL | RequestInfo) =>
      String(url).endsWith('01.json')
        ? new Promise<Response>((r) => {
            resolve = r;
          })
        : Promise.resolve(response(bytes('02'))),
    ) as unknown as typeof fetch;
    const loader = makeLoader(fetcher),
      controller = new AbortController();
    const old = loader.load('01', { signal: controller.signal });
    controller.abort();
    expect(await old).toEqual({ kind: 'stale', reason: 'READ_ABORTED' });
    resolve?.(response());
    const result = await loader.load('02');
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready')
      expect(result.data.id).toBe('visual-territory-02');
  });

  it('bounds a hung fetch by deadline and clears the owned timer', async () => {
    vi.useFakeTimers();
    const pending = makeLoader(
      vi.fn(() => new Promise<Response>(() => {})) as unknown as typeof fetch,
    ).load('01');
    await vi.advanceTimersByTimeAsync(5000);
    expect(await pending).toEqual({ kind: 'error', reason: 'READ_TIMEOUT' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels a stalled response body when the selection is retired', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ pull() {}, cancel });
    const fetcher = vi.fn(
      async () =>
        new Response(body, { headers: { 'content-type': 'application/json' } }),
    ) as unknown as typeof fetch;
    const controller = new AbortController();
    const pending = makeLoader(fetcher).load('01', {
      signal: controller.signal,
    });
    await Promise.resolve();
    await Promise.resolve();
    controller.abort();
    expect(await pending).toEqual({ kind: 'stale', reason: 'READ_ABORTED' });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('rejects invalid bases, absent crypto and an already cancelled read without requesting data', async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;
    const invalid = createOfficialExplorerCountryLoader({
      fetcher,
      crypto,
      baseUrl: 'https://user:secret@pages.example/',
    });
    expect(await invalid.load('01')).toEqual({
      kind: 'error',
      reason: 'BASE_URL_INVALID',
    });
    const noCrypto = createOfficialExplorerCountryLoader({
      fetcher,
      baseUrl,
      crypto: {} as Pick<Crypto, 'subtle'>,
    });
    expect(await noCrypto.load('01')).toEqual({
      kind: 'error',
      reason: 'CRYPTO_UNAVAILABLE',
    });
    expect(
      await makeLoader(fetcher).load('01', { signal: AbortSignal.abort() }),
    ).toEqual({ kind: 'stale', reason: 'READ_ABORTED' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
