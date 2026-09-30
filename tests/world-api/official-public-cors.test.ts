import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  OFFICIAL_COUNTRY_LIST_PATH,
  OFFICIAL_COUNTRY_PACKAGE_ID,
  OFFICIAL_COUNTRY_SELECTION_SHA256,
  OFFICIAL_COUNTRIES_SHA256,
} from '../../apps/world-api/src/integration/official-country-baseline.js';
import type { ManagedOfficialCountryPool } from '../../apps/world-api/src/integration/official-country-postgres.js';
import { OFFICIAL_DATASET_LIST_PATH } from '../../apps/world-api/src/integration/official-dataset-route.js';
import { OFFICIAL_MAP_ASSET_LIST_PATH } from '../../apps/world-api/src/integration/official-map-asset-route.js';
import {
  readApiRuntimeConfig,
  startApiRuntime,
  type RunningApiRuntime,
} from '../../apps/world-api/src/runtime.js';

const pagesOrigin = 'https://samuelq800.github.io';
const countries = readFileSync(
  new URL(
    '../../artifacts/world-balanced-candidate-v1/data/countries.json',
    import.meta.url,
  ),
  'utf8',
);
const databaseSettings: NodeJS.ProcessEnv = {
  ECONMIND_ENV: 'ci',
  WORLD_API_OFFICIAL_COUNTRY_DB_ENABLED: 'true',
  WORLD_API_ALL_DATA_ENABLED: 'true',
  WORLD_DATABASE_URL:
    'postgresql://world_v2_api_login:synthetic@127.0.0.1:5432/world_test',
  WORLD_API_DB_LOGIN_ROLE: 'world_v2_api_login',
  WORLD_API_DB_READER_ROLE: 'world_v2_api_reader',
  WORLD_DATABASE_FINGERPRINT: 'world-v2-ci',
};

function pool(): ManagedOfficialCountryPool {
  return {
    query: vi.fn(async () => ({
      rows: [
        {
          bundle_id: OFFICIAL_COUNTRY_PACKAGE_ID,
          package_manifest_sha256: OFFICIAL_COUNTRY_SELECTION_SHA256,
          source_status: 'IMPLEMENTED_UNVERIFIED_CANDIDATE',
          activation_allowed: false,
          content_sha256: OFFICIAL_COUNTRIES_SHA256,
          content_utf8: countries,
        },
      ],
    })),
    end: vi.fn(async () => undefined),
  };
}

const runtimes: RunningApiRuntime[] = [];
afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.shutdown()));
  vi.restoreAllMocks();
});

async function start(origins?: string) {
  const config = readApiRuntimeConfig({
    ...databaseSettings,
    ...(origins === undefined
      ? {}
      : { WORLD_API_OFFICIAL_PUBLIC_ORIGINS: origins }),
  });
  const runtime = await startApiRuntime(
    { ...config, port: 0 },
    { officialCountryPool: pool() },
  );
  runtimes.push(runtime);
  return runtime;
}

function corsHeaders(origin: string, method = 'GET') {
  return { Origin: origin, 'Access-Control-Request-Method': method };
}

describe('official public source CORS is opt-in and route-scoped', () => {
  it('accepts only exact canonical configured origins, with local HTTP limited to loopback', () => {
    expect(
      readApiRuntimeConfig({
        ECONMIND_ENV: 'production',
        WORLD_API_OFFICIAL_PUBLIC_ORIGINS: pagesOrigin,
      }).officialPublicCorsOrigins,
    ).toEqual([pagesOrigin]);
    expect(
      readApiRuntimeConfig({
        ECONMIND_ENV: 'ci',
        WORLD_API_OFFICIAL_PUBLIC_ORIGINS: 'http://127.0.0.1:4100',
      }).officialPublicCorsOrigins,
    ).toEqual(['http://127.0.0.1:4100']);
    for (const origin of [
      '',
      '*',
      'null',
      `${pagesOrigin}/`,
      `${pagesOrigin}/path`,
      `${pagesOrigin}?key=value`,
      'https://user:password@samuelq800.github.io',
      'https://SAMUELQ800.github.io',
      `${pagesOrigin},${pagesOrigin}`,
      'http://public.example',
      'https://public.example,',
    ])
      expect(() =>
        readApiRuntimeConfig({
          ECONMIND_ENV: 'production',
          WORLD_API_OFFICIAL_PUBLIC_ORIGINS: origin,
        }),
      ).toThrow('WORLD_API_OFFICIAL_PUBLIC_ORIGINS is invalid');
  });

  it('leaves existing routes unchanged when the allowlist is absent', async () => {
    const runtime = await start();
    const response = await fetch(
      `${runtime.origin}${OFFICIAL_COUNTRY_LIST_PATH}`,
      { headers: { Origin: pagesOrigin } },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(response.headers.get('vary')).toBeNull();
    const preflight = await fetch(
      `${runtime.origin}${OFFICIAL_COUNTRY_LIST_PATH}`,
      { method: 'OPTIONS', headers: corsHeaders(pagesOrigin) },
    );
    expect(preflight.status).toBe(405);
    expect(preflight.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('allows exact-origin GET/HEAD and bounded preflight only on enabled public source routes', async () => {
    const runtime = await start(pagesOrigin);
    for (const path of [
      OFFICIAL_COUNTRY_LIST_PATH,
      OFFICIAL_DATASET_LIST_PATH,
      OFFICIAL_MAP_ASSET_LIST_PATH,
    ]) {
      const response = await fetch(`${runtime.origin}${path}`, {
        headers: { Origin: pagesOrigin },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('access-control-allow-origin')).toBe(
        pagesOrigin,
      );
      expect(response.headers.get('vary')).toBe('Origin');
      expect(
        response.headers.get('access-control-allow-credentials'),
      ).toBeNull();
      const preflight = await fetch(`${runtime.origin}${path}`, {
        method: 'OPTIONS',
        headers: corsHeaders(pagesOrigin),
      });
      expect(preflight.status).toBe(204);
      expect(preflight.headers.get('access-control-allow-origin')).toBe(
        pagesOrigin,
      );
      expect(preflight.headers.get('access-control-allow-methods')).toBe(
        'GET, HEAD',
      );
      expect(preflight.headers.get('access-control-allow-headers')).toBeNull();
      expect(preflight.headers.get('vary')).toContain('Origin');
    }
    const head = await fetch(`${runtime.origin}${OFFICIAL_COUNTRY_LIST_PATH}`, {
      method: 'HEAD',
      headers: { Origin: pagesOrigin },
    });
    expect(head.status).toBe(200);
    expect(head.headers.get('access-control-allow-origin')).toBe(pagesOrigin);
    expect(await head.text()).toBe('');
    const acceptPreflight = await fetch(
      `${runtime.origin}${OFFICIAL_COUNTRY_LIST_PATH}`,
      {
        method: 'OPTIONS',
        headers: {
          ...corsHeaders(pagesOrigin),
          'Access-Control-Request-Headers': 'accept',
        },
      },
    );
    expect(acceptPreflight.status).toBe(204);
    expect(acceptPreflight.headers.get('access-control-allow-headers')).toBe(
      'Accept',
    );
  });

  it('does not grant disallowed, opaque or malformed origins, broad methods/headers or private routes', async () => {
    const runtime = await start(pagesOrigin);
    for (const origin of [
      'https://other.example',
      'null',
      `${pagesOrigin}/path`,
      `${pagesOrigin}.other.example`,
      `${pagesOrigin},https://other.example`,
    ]) {
      const response = await fetch(
        `${runtime.origin}${OFFICIAL_COUNTRY_LIST_PATH}`,
        { headers: { Origin: origin } },
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('access-control-allow-origin')).toBeNull();
      expect(response.headers.get('vary')).toBe('Origin');
      const preflight = await fetch(
        `${runtime.origin}${OFFICIAL_COUNTRY_LIST_PATH}`,
        { method: 'OPTIONS', headers: corsHeaders(origin) },
      );
      expect(preflight.status).toBe(403);
      expect(preflight.headers.get('access-control-allow-origin')).toBeNull();
    }
    for (const headers of [
      corsHeaders(pagesOrigin, 'POST'),
      {
        ...corsHeaders(pagesOrigin),
        'Access-Control-Request-Headers': 'authorization',
      },
      {
        ...corsHeaders(pagesOrigin),
        'Access-Control-Request-Headers': 'content-type',
      },
    ]) {
      const preflight = await fetch(
        `${runtime.origin}${OFFICIAL_COUNTRY_LIST_PATH}`,
        { method: 'OPTIONS', headers },
      );
      expect(preflight.status).toBe(403);
      expect(preflight.headers.get('access-control-allow-origin')).toBeNull();
    }
    const noOrigin = await fetch(
      `${runtime.origin}${OFFICIAL_COUNTRY_LIST_PATH}`,
    );
    expect(noOrigin.status).toBe(200);
    expect(noOrigin.headers.get('access-control-allow-origin')).toBeNull();
    const noOriginOptions = await fetch(
      `${runtime.origin}${OFFICIAL_COUNTRY_LIST_PATH}`,
      { method: 'OPTIONS' },
    );
    expect(noOriginOptions.status).toBe(405);
    for (const path of ['/healthz', '/readyz', '/v1/season1/my-team']) {
      const response = await fetch(`${runtime.origin}${path}`, {
        headers: { Origin: pagesOrigin },
      });
      expect(response.headers.get('access-control-allow-origin')).toBeNull();
      expect(response.headers.get('vary')).toBeNull();
    }
    const post = await fetch(`${runtime.origin}${OFFICIAL_COUNTRY_LIST_PATH}`, {
      method: 'POST',
      headers: { Origin: pagesOrigin },
    });
    expect(post.status).toBe(405);
    expect(post.headers.get('access-control-allow-origin')).toBeNull();
  });
});
