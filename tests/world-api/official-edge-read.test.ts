import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import {
  OFFICIAL_COUNTRY_PACKAGE_ID,
  OFFICIAL_COUNTRY_SELECTION_SHA256,
  OFFICIAL_COUNTRIES_SHA256,
  OFFICIAL_COUNTRY_SOURCE_QUERY,
  type OfficialCountrySqlReader,
} from '../../apps/world-api/src/integration/official-country-baseline.js';
import { readOfficialEdgeDatabaseConfig } from '../../apps/world-api/src/integration/official-edge-database-config.js';
import {
  OFFICIAL_EDGE_FUNCTION_PREFIX,
  OFFICIAL_EDGE_INTERNAL_PREFIX,
  createOfficialEdgeFetchHandler,
} from '../../apps/world-api/src/integration/official-edge-fetch-adapter.js';
import { OFFICIAL_DATASETS } from '../../apps/world-api/src/integration/official-dataset-registry.js';
import { OFFICIAL_DATASET_SOURCE_QUERY } from '../../apps/world-api/src/integration/official-dataset-source.js';
import { createRoleScopedOfficialCountryReader } from '../../apps/world-api/src/integration/official-country-role-reader.js';
import officialSnapshotEdge from '../../supabase/functions/world-v2-official-read/index.js';

const origin = 'https://samuelq800.github.io';
const base = `https://vimksjrhaxdpnkvgsavz.supabase.co${OFFICIAL_EDGE_FUNCTION_PREFIX}`;
const artifact = new URL(
  '../../artifacts/world-balanced-candidate-v1/',
  import.meta.url,
);
const sha256 = (content: string) =>
  createHash('sha256').update(content).digest('hex');

describe('snapshot Edge publication origin configuration', () => {
  const url = `${base}/v1/world-data/map-assets?limit=1`;
  const approved = [
    'https://samuelq800.github.io',
    'https://world.econmind.group',
  ];

  it.each(approved)(
    'allows credential-free GET and OPTIONS from %s',
    async (browserOrigin) => {
      // Exercise the actual deployable entry, not a separately copied allowlist.
      const response = await officialSnapshotEdge.fetch(
        new Request(url, { headers: { origin: browserOrigin } }),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('access-control-allow-origin')).toBe(
        browserOrigin,
      );
      expect(
        response.headers.get('access-control-allow-credentials'),
      ).toBeNull();
      expect(response.headers.get('x-world-source-transport')).toBe(
        'HASH_PINNED_IMMUTABLE_SOURCE_SNAPSHOT',
      );
      expect(await response.json()).toMatchObject({
        liveWorldState: false,
        returned: 1,
      });
      const preflight = await officialSnapshotEdge.fetch(
        new Request(url, {
          method: 'OPTIONS',
          headers: {
            origin: browserOrigin,
            'access-control-request-method': 'GET',
            'access-control-request-headers': 'Accept',
          },
        }),
      );
      expect(preflight.status).toBe(204);
      expect(preflight.headers.get('access-control-allow-origin')).toBe(
        browserOrigin,
      );
      expect(preflight.headers.get('access-control-allow-methods')).toBe(
        'GET, HEAD',
      );
      expect(
        preflight.headers.get('access-control-allow-credentials'),
      ).toBeNull();
    },
  );

  it.each([
    'http://world.econmind.group',
    'http://samuelq800.github.io',
    'https://evil.invalid',
    'https://world.econmind.group.evil.invalid',
    'https://evilworld.econmind.group',
    'https://world.econmind.group/',
    'https://user:password@world.econmind.group',
    'null',
  ])('denies browser access and preflight from %s', async (browserOrigin) => {
    const response = await officialSnapshotEdge.fetch(
      new Request(url, { headers: { origin: browserOrigin } }),
    );
    // Public GET remains public; browser permission is withheld.
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(response.headers.get('access-control-allow-credentials')).toBeNull();
    const preflight = await officialSnapshotEdge.fetch(
      new Request(url, {
        method: 'OPTIONS',
        headers: {
          origin: browserOrigin,
          'access-control-request-method': 'GET',
        },
      }),
    );
    expect(preflight.status).toBe(403);
    expect(preflight.headers.get('access-control-allow-origin')).toBeNull();
  });

  it.each(approved)(
    'rejects credential-header preflights from %s',
    async (browserOrigin) => {
      for (const credentialHeader of [
        'Authorization',
        'Cookie',
        'Accept, Authorization',
      ]) {
        const response = await officialSnapshotEdge.fetch(
          new Request(url, {
            method: 'OPTIONS',
            headers: {
              origin: browserOrigin,
              'access-control-request-method': 'GET',
              'access-control-request-headers': credentialHeader,
            },
          }),
        );
        expect(response.status).toBe(403);
        expect(response.headers.get('access-control-allow-origin')).toBeNull();
        expect(
          response.headers.get('access-control-allow-credentials'),
        ).toBeNull();
      }
    },
  );
});

const environment = {
  WORLD_DATABASE_URL:
    'postgresql://world_v2_api_login.vimksjrhaxdpnkvgsavz:synthetic@aws-0-us-west-1.pooler.supabase.com:6543/postgres?sslmode=require',
  WORLD_API_DB_LOGIN_ROLE: 'world_v2_api_login',
  WORLD_API_DB_READER_ROLE: 'world_v2_api_reader',
  WORLD_DATABASE_FINGERPRINT: 'world-v2-production',
  WORLD_DATABASE_NAMESPACE: 'world_v2',
  WORLD_DATABASE_MUTATION_MODE: 'disabled',
};

function sourceReader(): OfficialCountrySqlReader & {
  readonly query: ReturnType<typeof vi.fn>;
} {
  const query = vi.fn(async (sql: string, values: readonly string[]) => {
    if (sql === OFFICIAL_COUNTRY_SOURCE_QUERY) {
      const content = readFileSync(
        new URL('data/countries.json', artifact),
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
    const content = readFileSync(new URL(spec!.sourcePath, artifact), 'utf8');
    return {
      rows: [
        {
          bundle_id: OFFICIAL_COUNTRY_PACKAGE_ID,
          package_manifest_sha256: OFFICIAL_COUNTRY_SELECTION_SHA256,
          source_status: 'IMPLEMENTED_UNVERIFIED_CANDIDATE',
          activation_allowed: false,
          artifact_path: spec!.storagePath,
          content_sha256: sha256(content),
          content_utf8: content,
        },
      ],
    };
  });
  return { query };
}

describe('public official-source Supabase Edge boundary', () => {
  it('pins the production project, dedicated pooler login, TLS and read-only environment', () => {
    expect(readOfficialEdgeDatabaseConfig(environment)).toMatchObject({
      loginRole: 'world_v2_api_login',
      readerRole: 'world_v2_api_reader',
    });
    for (const changed of [
      { WORLD_DATABASE_URL: undefined },
      {
        WORLD_DATABASE_URL: environment.WORLD_DATABASE_URL.replace(
          'world_v2_api_login.',
          'postgres.',
        ),
      },
      {
        WORLD_DATABASE_URL: environment.WORLD_DATABASE_URL.replace(
          'vimksjrhaxdpnkvgsavz',
          'otherprojectrefxxxxxx',
        ),
      },
      {
        WORLD_DATABASE_URL: environment.WORLD_DATABASE_URL.replace(
          ':6543/',
          ':5432/',
        ),
      },
      {
        WORLD_DATABASE_URL: environment.WORLD_DATABASE_URL.replace(
          'sslmode=require',
          'sslmode=disable',
        ),
      },
      {
        WORLD_DATABASE_URL: environment.WORLD_DATABASE_URL.replace(
          'pooler.supabase.com',
          'example.com',
        ),
      },
      { WORLD_API_DB_READER_ROLE: 'service_role' },
      { WORLD_DATABASE_MUTATION_MODE: 'enabled' },
      { WORLD_DATABASE_FINGERPRINT: 'world-v2-staging' },
    ])
      expect(() =>
        readOfficialEdgeDatabaseConfig({ ...environment, ...changed }),
      ).toThrow('OFFICIAL_EDGE_DATABASE_CONFIGURATION_INVALID');
  });

  it('reuses countries, 34 dataset and map metadata contracts without live World routes', async () => {
    const reader = sourceReader();
    const handle = createOfficialEdgeFetchHandler({
      reader,
      allowedOrigins: [origin],
    });
    const countries = await handle(
      new Request(`${base}/v1/world-data/countries`, { headers: { origin } }),
    );
    expect(countries.status).toBe(200);
    expect(countries.headers.get('access-control-allow-origin')).toBe(origin);
    expect(await countries.json()).toMatchObject({
      countryCount: 70,
      liveWorldState: false,
    });
    const detail = await handle(
      new Request(`${base}/v1/world-data/countries/visual-territory-01`),
    );
    expect(await detail.json()).toMatchObject({
      countryId: 'visual-territory-01',
      liveWorldState: false,
    });
    const catalog = await handle(new Request(`${base}/v1/world-data/datasets`));
    expect(await catalog.json()).toMatchObject({
      datasetCount: 34,
      liveWorldState: false,
    });
    const changes = await handle(
      new Request(`${base}/v1/world-data/datasets/changes?limit=1`),
    );
    expect(changes.status).toBe(200);
    const changeBody = await changes.json();
    expect(changeBody).toMatchObject({
      dataset: 'changes',
      returned: 1,
      liveWorldState: false,
    });
    expect(typeof changeBody.items[0].transferredKm2).toBe('string');
    const maps = await handle(
      new Request(`${base}/v1/world-data/map-assets?limit=1`),
    );
    expect(await maps.json()).toMatchObject({
      totalPackageFiles: 203,
      returned: 1,
      liveWorldState: false,
    });
    expect(reader.query).toHaveBeenCalledTimes(3);
    const internalMap = await handle(
      new Request(
        `https://internal.invalid${OFFICIAL_EDGE_INTERNAL_PREFIX}/v1/world-data/map-assets?limit=1`,
      ),
    );
    expect(internalMap.status).toBe(200);
  });

  it('keeps HEAD and exact-origin GET/HEAD preflight semantics', async () => {
    const reader = sourceReader();
    const handle = createOfficialEdgeFetchHandler({
      reader,
      allowedOrigins: [origin],
    });
    const url = `${base}/v1/world-data/map-assets`;
    const head = await handle(
      new Request(url, { method: 'HEAD', headers: { origin } }),
    );
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
    expect(head.headers.get('content-length')).not.toBeNull();
    const preflight = await handle(
      new Request(url, {
        method: 'OPTIONS',
        headers: {
          origin,
          'access-control-request-method': 'GET',
          'access-control-request-headers': 'Accept',
        },
      }),
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-methods')).toBe(
      'GET, HEAD',
    );
    const denied = await handle(
      new Request(url, {
        method: 'OPTIONS',
        headers: {
          origin: 'https://evil.invalid',
          'access-control-request-method': 'GET',
        },
      }),
    );
    expect(denied.status).toBe(403);
    expect(reader.query).not.toHaveBeenCalled();
  });

  it('rejects unsupported paths, methods, selectors and body before any database query', async () => {
    const reader = sourceReader();
    const handle = createOfficialEdgeFetchHandler({
      reader,
      allowedOrigins: [origin],
    });
    for (const [suffix, method, status] of [
      ['/v1/worlds/FAKE', 'GET', 404],
      ['/v1/world-data/countries?worldId=FAKE', 'GET', 400],
      ['/v1/world-data/datasets/unknown', 'GET', 404],
      ['/v1/world-data/datasets/regions?limit=51', 'GET', 400],
      ['/v1/world-data/map-assets?path=private', 'GET', 400],
      ['/v1/world-data/countries', 'POST', 405],
    ] as const) {
      expect(
        (await handle(new Request(`${base}${suffix}`, { method }))).status,
      ).toBe(status);
    }
    expect(reader.query).not.toHaveBeenCalled();
  });

  it('fails closed without leaking database diagnostics or broadening CORS', async () => {
    const query = vi.fn(async () => {
      throw new Error('private connection string and SQL detail');
    });
    const handle = createOfficialEdgeFetchHandler({
      reader: { query },
      allowedOrigins: [origin],
    });
    const response = await handle(
      new Request(`${base}/v1/world-data/countries`, {
        headers: { origin: 'https://other.invalid' },
      }),
    );
    expect(response.status).toBe(503);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(await response.text()).toContain('SOURCE_UNAVAILABLE');
    expect(query).toHaveBeenCalledOnce();
    const body = await handle(
      new Request(`${base}/v1/world-data/countries`, {
        headers: { 'content-length': '2' },
      }),
    );
    expect(body.status).toBe(400);
    expect(query).toHaveBeenCalledOnce();
  });

  it('permits only fixed SQL under a bounded transaction-local reader role', async () => {
    const calls: string[] = [];
    const release = vi.fn();
    const scoped = createRoleScopedOfficialCountryReader(
      {
        connect: async () => ({
          query: async (text) => {
            calls.push(text);
            return { rows: [] };
          },
          release,
        }),
      },
      { statementTimeoutMillis: 5_000 },
    );
    await scoped.query(OFFICIAL_COUNTRY_SOURCE_QUERY, [
      OFFICIAL_COUNTRY_PACKAGE_ID,
      OFFICIAL_DATASETS.find((item) => item.slug === 'countries')!.storagePath,
    ]);
    expect(calls).toEqual([
      'begin read only',
      'set local role world_v2_api_reader',
      'set local statement_timeout = 5000',
      OFFICIAL_COUNTRY_SOURCE_QUERY,
      'commit',
    ]);
    expect(release).toHaveBeenCalledOnce();
    await expect(
      scoped.query('select * from world_v2.command', []),
    ).rejects.toThrow('OFFICIAL_COUNTRY_FIXED_QUERY_REQUIRED');
  });
});
