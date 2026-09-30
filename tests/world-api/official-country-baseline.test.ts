import { readFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  OFFICIAL_COUNTRY_LIST_PATH,
  OFFICIAL_COUNTRY_PACKAGE_ID,
  OFFICIAL_COUNTRY_SELECTION_SHA256,
  OFFICIAL_COUNTRIES_SHA256,
  OFFICIAL_COUNTRY_SOURCE_QUERY,
  OFFICIAL_COUNTRY_SOURCE_STORAGE_PATH,
} from '../../apps/world-api/src/integration/official-country-baseline.js';
import { createRoleScopedOfficialCountryReader } from '../../apps/world-api/src/integration/official-country-postgres.js';
import {
  readApiRuntimeConfig,
  startApiRuntime,
  type RunningApiRuntime,
} from '../../apps/world-api/src/runtime.js';
import type { ManagedOfficialCountryPool } from '../../apps/world-api/src/integration/official-country-postgres.js';

const source = await readFile(
  new URL(
    '../../artifacts/world-balanced-candidate-v1/data/countries.json',
    import.meta.url,
  ),
  'utf8',
);
const expectedPath = `source/${Buffer.from('data/countries.json').toString('hex')}`;
const databaseSettings: NodeJS.ProcessEnv = {
  ECONMIND_ENV: 'ci',
  WORLD_API_OFFICIAL_COUNTRY_DB_ENABLED: 'true',
  WORLD_DATABASE_URL:
    'postgresql://world_v2_api_login:synthetic@127.0.0.1:5432/world_test',
  WORLD_API_DB_LOGIN_ROLE: 'world_v2_api_login',
  WORLD_API_DB_READER_ROLE: 'world_v2_api_reader',
  WORLD_DATABASE_FINGERPRINT: 'world-v2-ci',
  WORLD_DATABASE_NAMESPACE: 'world_v2',
  WORLD_DATABASE_MUTATION_MODE: 'disabled',
};

function sourceRow(content = source) {
  return {
    bundle_id: OFFICIAL_COUNTRY_PACKAGE_ID,
    package_manifest_sha256: OFFICIAL_COUNTRY_SELECTION_SHA256,
    source_status: 'IMPLEMENTED_UNVERIFIED_CANDIDATE',
    activation_allowed: false,
    content_sha256: OFFICIAL_COUNTRIES_SHA256,
    content_utf8: content,
  };
}

function pool(
  rows: readonly unknown[] = [sourceRow()],
): ManagedOfficialCountryPool & {
  query: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
} {
  return {
    query: vi.fn(async () => ({ rows })),
    end: vi.fn(async () => undefined),
  };
}

const runtimes: RunningApiRuntime[] = [];
afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.shutdown()));
  vi.restoreAllMocks();
});

async function start(reader: ManagedOfficialCountryPool) {
  const runtime = await startApiRuntime(
    { ...readApiRuntimeConfig(databaseSettings), port: 0 },
    { officialCountryPool: reader },
  );
  runtimes.push(runtime);
  return runtime;
}

async function raw(origin: string, path: string, method: string, body = '') {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const request = httpRequest(
      `${origin}${path}`,
      { method, headers: { 'content-length': Buffer.byteLength(body) } },
      (response) => {
        let payload = '';
        response.on('data', (part) => {
          payload += String(part);
        });
        response.on('end', () =>
          resolve({ status: response.statusCode!, body: payload }),
        );
      },
    );
    request.on('error', reject);
    request.end(body);
  });
}

describe('official selected country database read, not live World', () => {
  it('stays off by default and rejects invalid/privileged database configuration', async () => {
    expect(
      readApiRuntimeConfig({ ECONMIND_ENV: 'ci' }).officialCountryDatabase,
    ).toBeUndefined();
    for (const settings of [
      { ...databaseSettings, WORLD_DATABASE_URL: undefined },
      {
        ...databaseSettings,
        WORLD_DATABASE_FINGERPRINT: 'world-v2-production',
      },
      { ...databaseSettings, WORLD_API_DB_READER_ROLE: 'postgres' },
      { ...databaseSettings, WORLD_API_DB_LOGIN_ROLE: 'postgres' },
      {
        ...databaseSettings,
        WORLD_DATABASE_URL:
          'postgresql://world_v2_api_login:synthetic@outside.invalid/db',
      },
      { ...databaseSettings, WORLD_API_OFFICIAL_COUNTRY_DB_ENABLED: 'maybe' },
    ])
      expect(() => readApiRuntimeConfig(settings)).toThrow();
    const runtime = await startApiRuntime({
      environment: 'ci',
      host: '127.0.0.1',
      port: 0,
      shutdownGraceMs: 500,
    });
    runtimes.push(runtime);
    expect(
      (await fetch(`${runtime.origin}${OFFICIAL_COUNTRY_LIST_PATH}`)).status,
    ).toBe(404);
    expect((await fetch(`${runtime.origin}/readyz`)).status).toBe(200);
  });

  it('reads exact selected bytes from the fixed SQL, validates source and returns clear public baseline', async () => {
    const reader = pool();
    const runtime = await start(reader);
    expect((await fetch(`${runtime.origin}/healthz`)).status).toBe(200);
    const ready = await fetch(`${runtime.origin}/readyz`);
    expect(ready.status).toBe(200);
    expect(await ready.json()).toMatchObject({
      officialCountryDatabaseReady: true,
      ready: true,
    });
    const list = await fetch(`${runtime.origin}${OFFICIAL_COUNTRY_LIST_PATH}`);
    expect(list.status).toBe(200);
    const listJson = await list.json();
    expect(listJson).toMatchObject({
      ok: true,
      schemaVersion: 'official-country-baseline-v1',
      dataNature: 'OFFICIAL_SELECTED_SOURCE_DATASET',
      packageId: OFFICIAL_COUNTRY_PACKAGE_ID,
      selectionChecksumSha256: OFFICIAL_COUNTRY_SELECTION_SHA256,
      countriesSha256: OFFICIAL_COUNTRIES_SHA256,
      countryCount: 70,
      liveWorldState: false,
      proposalFieldsAreExecuted: false,
    });
    expect(listJson.countries[0]).toMatchObject({
      id: 'visual-territory-01',
      name: 'Avenor',
    });
    expect(listJson.countries).toHaveLength(70);
    expect(JSON.stringify(listJson)).not.toMatch(
      /worldVersion|eventSequence|openingSeed/i,
    );
    const detail = await fetch(
      `${runtime.origin}${OFFICIAL_COUNTRY_LIST_PATH}/visual-territory-01`,
    );
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({
      countryId: 'visual-territory-01',
      country: {
        id: 'visual-territory-01',
        name: 'Avenor',
        teamAssignment: null,
      },
      liveWorldState: false,
    });
    for (const call of reader.query.mock.calls) {
      expect(call).toEqual([
        OFFICIAL_COUNTRY_SOURCE_QUERY,
        [OFFICIAL_COUNTRY_PACKAGE_ID, expectedPath],
      ]);
    }
    expect(list.headers.get('cache-control')).toBe('no-store');
  });

  it('rejects selectors/body/unsupported methods before querying and does not expose a live World route', async () => {
    const reader = pool();
    const runtime = await start(reader);
    for (const suffix of [
      '?worldId=FAKE',
      '?countryId=visual-territory-02',
      '/COUNTRY_01',
    ]) {
      const response = await fetch(
        `${runtime.origin}${OFFICIAL_COUNTRY_LIST_PATH}${suffix}`,
      );
      expect(response.status).toBe(400);
    }
    expect(
      (await raw(runtime.origin, OFFICIAL_COUNTRY_LIST_PATH, 'POST')).status,
    ).toBe(405);
    expect(
      (await raw(runtime.origin, OFFICIAL_COUNTRY_LIST_PATH, 'GET', '{}'))
        .status,
    ).toBe(400);
    expect(
      (await fetch(`${runtime.origin}/v1/worlds/FAKE/countries/COUNTRY_01`))
        .status,
    ).toBe(404);
    expect(reader.query).not.toHaveBeenCalled();
  });

  it('fails closed on missing, corrupt and unavailable database source without leaking diagnostics', async () => {
    for (const [reader, expected] of [
      [pool([]), 503],
      [pool([{ ...sourceRow(), package_manifest_sha256: 'wrong' }]), 502],
      [pool([{ ...sourceRow(), content_utf8: 'private database error' }]), 502],
    ] as const) {
      const runtime = await start(reader);
      expect((await fetch(`${runtime.origin}/readyz`)).status).toBe(503);
      const response = await fetch(
        `${runtime.origin}${OFFICIAL_COUNTRY_LIST_PATH}`,
      );
      expect(response.status).toBe(expected);
      const body = await response.text();
      expect(body).not.toContain('private database error');
      expect(body).not.toContain('postgres');
    }
    const failing = pool();
    failing.query.mockRejectedValue(new Error('private postgres DSN'));
    const runtime = await start(failing);
    expect((await fetch(`${runtime.origin}/readyz`)).status).toBe(503);
    expect(
      (await fetch(`${runtime.origin}${OFFICIAL_COUNTRY_LIST_PATH}`)).status,
    ).toBe(503);
  });

  it('closes the managed database pool on shutdown', async () => {
    const reader = pool();
    const runtime = await start(reader);
    await runtime.shutdown();
    expect(reader.end).toHaveBeenCalledOnce();
  });

  it('sets only the fixed NOLOGIN role in a read-only transaction and rolls back on failure', async () => {
    const calls: Array<[string, readonly string[] | undefined]> = [];
    const release = vi.fn();
    const client = {
      query: vi.fn(async (sql: string, values?: readonly string[]) => {
        calls.push([sql, values]);
        return { rows: [{ ok: true }] };
      }),
      release,
    };
    const connect = vi.fn(async () => client);
    const scoped = createRoleScopedOfficialCountryReader({
      connect,
    } as unknown as Parameters<
      typeof createRoleScopedOfficialCountryReader
    >[0]);
    await expect(
      scoped.query(OFFICIAL_COUNTRY_SOURCE_QUERY, [
        OFFICIAL_COUNTRY_PACKAGE_ID,
        OFFICIAL_COUNTRY_SOURCE_STORAGE_PATH,
      ]),
    ).resolves.toEqual({ rows: [{ ok: true }] });
    expect(calls).toEqual([
      ['begin read only', undefined],
      ['set local role world_v2_api_reader', undefined],
      [
        OFFICIAL_COUNTRY_SOURCE_QUERY,
        [OFFICIAL_COUNTRY_PACKAGE_ID, OFFICIAL_COUNTRY_SOURCE_STORAGE_PATH],
      ],
      ['commit', undefined],
    ]);
    expect(release).toHaveBeenCalledOnce();
    calls.length = 0;
    client.query
      .mockImplementationOnce(async (sql: string) => {
        calls.push([sql, undefined]);
        return { rows: [] };
      })
      .mockImplementationOnce(async () => {
        throw new Error('role denied');
      });
    await expect(scoped.query('select arbitrary', [])).rejects.toThrow(
      'OFFICIAL_COUNTRY_FIXED_QUERY_REQUIRED',
    );
    expect(connect).toHaveBeenCalledOnce();
    await expect(
      scoped.query(OFFICIAL_COUNTRY_SOURCE_QUERY, [
        OFFICIAL_COUNTRY_PACKAGE_ID,
        OFFICIAL_COUNTRY_SOURCE_STORAGE_PATH,
      ]),
    ).rejects.toThrow('role denied');
    expect(calls.map(([sql]) => sql)).toEqual(['begin read only', 'rollback']);
    expect(release).toHaveBeenCalledTimes(2);
  });
});
