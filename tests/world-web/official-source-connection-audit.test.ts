import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import {
  auditOfficialSourceConnection,
  createOfficialConnectionRequester,
  OFFICIAL_CONNECTION_BASE,
  OFFICIAL_CONNECTION_ORIGIN,
  parseOfficialConnectionArguments,
  prepareOfficialSourceConnection,
  reconstructOfficialDataset,
  verifyOfficialCountryConnection,
  verifyOfficialRegionAssociations,
} from '../../scripts/official-source-connection-audit.mjs';
import {
  OFFICIAL_COUNTRY_PACKAGE_ID,
  OFFICIAL_COUNTRY_SELECTION_SHA256,
  OFFICIAL_COUNTRY_SOURCE_QUERY,
} from '../../supabase/functions/world-v2-official-read/lib/official-country-baseline.js';
import { OFFICIAL_DATASETS } from '../../supabase/functions/world-v2-official-read/lib/official-dataset-registry.js';
import { OFFICIAL_DATASET_SOURCE_QUERY } from '../../supabase/functions/world-v2-official-read/lib/official-dataset-source.js';
import { createOfficialEdgeFetchHandler } from '../../supabase/functions/world-v2-official-read/lib/official-edge-fetch-adapter.js';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const artifactRoot = new URL(
  '../../artifacts/world-balanced-candidate-v1/',
  import.meta.url,
);
const sha256 = (value: string | Buffer) =>
  createHash('sha256').update(value).digest('hex');
type Prepared = Awaited<ReturnType<typeof prepareOfficialSourceConnection>>;
type Spec = (typeof OFFICIAL_DATASETS)[number];
let prepared: Prepared;

/** Local frozen source bytes behind the existing handler; no network, SDK,
 * database, competing DTO implementation or replacement numeric parser. */
function fixtureTransport() {
  const rowsByPath = new Map<string, object[]>();
  for (const spec of OFFICIAL_DATASETS) {
    const bytes = readFileSync(new URL(spec.sourcePath, artifactRoot));
    const rows = [];
    let offset = 0;
    while (offset < bytes.length) {
      let end = Math.min(offset + 140_000, bytes.length);
      while (end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end--;
      const content = bytes.subarray(offset, end).toString('utf8');
      const chunked = bytes.length > 140_000;
      rows.push({
        bundle_id: OFFICIAL_COUNTRY_PACKAGE_ID,
        package_manifest_sha256: OFFICIAL_COUNTRY_SELECTION_SHA256,
        source_status: 'IMPLEMENTED_UNVERIFIED_CANDIDATE',
        activation_allowed: false,
        artifact_path: chunked
          ? `${spec.storagePath}.part${String(rows.length + 1).padStart(4, '0')}`
          : spec.storagePath,
        content_sha256: sha256(content),
        content_utf8: content,
      });
      offset = end;
    }
    rowsByPath.set(spec.storagePath, rows);
  }
  const handle = createOfficialEdgeFetchHandler({
    allowedOrigins: [OFFICIAL_CONNECTION_ORIGIN],
    reader: {
      query: async (sql: string, values: readonly string[]) => {
        if (sql === OFFICIAL_COUNTRY_SOURCE_QUERY) {
          const content = readFileSync(
            new URL('data/countries.json', artifactRoot),
            'utf8',
          );
          return {
            rows: [
              {
                bundle_id: OFFICIAL_COUNTRY_PACKAGE_ID,
                package_manifest_sha256: OFFICIAL_COUNTRY_SELECTION_SHA256,
                source_status: 'IMPLEMENTED_UNVERIFIED_CANDIDATE',
                activation_allowed: false,
                content_sha256: sha256(content),
                content_utf8: content,
              },
            ],
          };
        }
        expect(sql).toBe(OFFICIAL_DATASET_SOURCE_QUERY);
        const rows = rowsByPath.get(values[1]!);
        expect(rows).toBeDefined();
        return { rows: rows! };
      },
    },
  });
  return vi.fn(async (url: string, init: RequestInit) => {
    expect(url.startsWith(`${OFFICIAL_CONNECTION_BASE}/v1/world-data/`)).toBe(
      true,
    );
    expect(init).toMatchObject({
      method: 'GET',
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
    });
    return handle(new Request(url, init));
  });
}

type Mutation = (body: Record<string, unknown>, url: URL) => void;
function mutatedTransport(mutate: Mutation) {
  const transport = fixtureTransport();
  return async (url: string, init: RequestInit) => {
    const response = await transport(url, init);
    expect(response.status).toBe(200);
    const body = await response.json();
    mutate(body, new URL(url));
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: response.headers,
    });
  };
}

const spec = (slug: string): Spec =>
  OFFICIAL_DATASETS.find((value) => value.slug === slug)!;

describe('bounded official-source connection acceptance (fixtures only)', () => {
  beforeAll(async () => {
    prepared = await prepareOfficialSourceConnection(repositoryRoot);
  });

  it('verifies all 87 local originals and selected authority without configuration writes or GET', () => {
    expect(prepared.plan).toMatchObject({
      status: 'PREPARED_NOT_EXECUTED',
      localRawArtifactsVerified: 87,
      structuredDatasetsExpected: 34,
      countriesExpected: 70,
      remoteGetPerformed: false,
      configActivation: 'NOT_PERFORMED',
      liveWorldState: false,
      proofBoundary: { remoteRawArtifactBytes: 'NOT_EXPOSED_BY_EXISTING_DTO' },
    });
  });

  it('defaults to plan and requires both external release and root notice references before network binding', () => {
    expect(parseOfficialConnectionArguments([])).toEqual({ execute: false });
    expect(parseOfficialConnectionArguments(['--plan'])).toEqual({
      execute: false,
    });
    for (const args of [
      ['--execute'],
      ['--execute', '--release-go', 'E-SHA'],
      ['--plan', '--execute'],
      ['--execute', '--release-go', '', '--root-authorization', 'root'],
    ])
      expect(() => parseOfficialConnectionArguments(args)).toThrow(
        'OFFICIAL_CONNECTION_',
      );
    expect(
      parseOfficialConnectionArguments([
        '--execute',
        '--release-go',
        'E-SHA',
        '--root-authorization',
        'root-notice',
      ]),
    ).toMatchObject({
      execute: true,
      releaseGoReference: 'E-SHA',
      rootAuthorizationReference: 'root-notice',
    });
  });

  it('reconstructs all 34 exact trees, 70 countries and all region-only country joins using the existing DTO handler', async () => {
    const transport = fixtureTransport();
    const result = await auditOfficialSourceConnection(prepared, transport);
    expect(result).toMatchObject({
      status: 'FIXTURE_PASS',
      executionMode: 'FIXTURE',
      remoteGetPerformed: false,
      structuredDatasetsReconstructed: 34,
      countriesVerified: 70,
      populationVerified: '14712146434',
      countryAssociationChecks: 210,
      liveWorldState: false,
      proposalFieldsAreExecuted: false,
    });
    expect(result.requests).toBe(transport.mock.calls.length);
    expect(result.requests).toBeLessThan(1_000);
  }, 120_000);

  it('rejects catalog omission, wrong hash and a live claim without completing acceptance', async () => {
    for (const mutate of [
      (body: Record<string, unknown>) => {
        body.datasetCount = 33;
      },
      (body: Record<string, unknown>) => {
        (body.datasets as Record<string, unknown>[])[0]!.sourceSha256 =
          '0'.repeat(64);
      },
      (body: Record<string, unknown>) => {
        body.liveWorldState = true;
      },
    ])
      await expect(
        auditOfficialSourceConnection(prepared, mutatedTransport(mutate)),
      ).rejects.toThrow('OFFICIAL_CONNECTION_');
  });

  it('rejects missing rows, repeated cursors, total drift, numeric conversion and invented dates', async () => {
    for (const mutate of [
      (body: Record<string, unknown>) => {
        body.returned = 0;
        body.items = [];
      },
      (body: Record<string, unknown>) => {
        body.nextOffset = 0;
      },
      (body: Record<string, unknown>) => {
        if (body.offset !== 0) body.total = 121;
      },
    ])
      await expect(
        reconstructOfficialDataset(
          createOfficialConnectionRequester(mutatedTransport(mutate)),
          spec('regions'),
        ),
      ).rejects.toThrow('OFFICIAL_CONNECTION_');
    for (const [slug, field, replacement] of [
      ['changes', 'transferredKm2', 1],
      ['changes', 'effectiveDate', '2099-01-01'],
    ] as const) {
      await expect(
        auditOfficialSourceConnection(
          prepared,
          mutatedTransport((body, url) => {
            if (url.pathname.endsWith(`/datasets/${slug}`))
              (body.items as Record<string, unknown>[])[0]![field] =
                replacement;
          }),
        ),
      ).rejects.toThrow('EXACT_TREE:changes');
    }
  });

  it('rejects wrong-country detail, population and provenance without fallback', async () => {
    for (const mutate of [
      (body: Record<string, unknown>) => {
        body.countryId = 'visual-territory-70';
      },
      (body: Record<string, unknown>) => {
        (body.country as Record<string, unknown>).population = 1;
      },
      (body: Record<string, unknown>) => {
        body.countriesSha256 = '0'.repeat(64);
      },
    ])
      await expect(
        verifyOfficialCountryConnection(
          prepared,
          createOfficialConnectionRequester(
            mutatedTransport((body, url) => {
              if (url.pathname.endsWith('/countries/visual-territory-01'))
                mutate(body);
            }),
          ),
        ),
      ).rejects.toThrow('OFFICIAL_CONNECTION_');
  });

  it('rejects missing country-linked changes and seasonal water instead of substituting direct country fields', async () => {
    for (const slug of ['changes', 'seasonal-water']) {
      let removed = false;
      await expect(
        verifyOfficialRegionAssociations(
          prepared.expected,
          prepared.countries,
          createOfficialConnectionRequester(
            mutatedTransport((body, url) => {
              const rows = body.items as unknown[];
              if (
                !removed &&
                url.pathname.endsWith(`/datasets/${slug}`) &&
                url.searchParams.has('countryId') &&
                rows.length > 0
              ) {
                rows.pop();
                body.returned = rows.length;
                body.total = rows.length;
                body.nextOffset = null;
                removed = true;
              }
            }),
          ),
        ),
      ).rejects.toThrow(`COUNTRY_ASSOCIATION:${slug}`);
      expect(removed).toBe(true);
    }
  });

  it('rejects corrupted geography fragment hashes and stalled fragments', async () => {
    for (const mutate of [
      (body: Record<string, unknown>) => {
        body.fragmentSha256 = '0'.repeat(64);
      },
      (body: Record<string, unknown>) => {
        body.fragment = '';
        body.fragmentLength = 0;
        body.fragmentSha256 = sha256('');
      },
    ])
      await expect(
        reconstructOfficialDataset(
          createOfficialConnectionRequester(
            mutatedTransport((body, url) => {
              if (url.searchParams.has('fragmentOffset')) mutate(body);
            }),
          ),
          spec('geography'),
        ),
      ).rejects.toThrow('OFFICIAL_CONNECTION_');
  });

  it('fails closed on outages, wrong CORS, oversized payloads and a bounded request budget', async () => {
    const request = '/v1/world-data/datasets';
    await expect(
      createOfficialConnectionRequester(
        async () => new Response('private diagnostics', { status: 503 }),
      ).get(request),
    ).rejects.toThrow('HTTP_STATUS:503');
    const headers = {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'access-control-allow-origin': OFFICIAL_CONNECTION_ORIGIN,
      vary: 'Origin',
    };
    await expect(
      createOfficialConnectionRequester(
        async () =>
          new Response('{}', {
            headers: { ...headers, 'access-control-allow-origin': '*' },
          }),
      ).get(request),
    ).rejects.toThrow('CORS_ORIGIN');
    await expect(
      createOfficialConnectionRequester(
        async () => new Response(' '.repeat(256_001), { headers }),
      ).get(request),
    ).rejects.toThrow('RESPONSE_TOO_LARGE');
    const transport = fixtureTransport();
    const bounded = createOfficialConnectionRequester(transport, {
      requestLimit: 1,
    });
    await bounded.get(request);
    await expect(bounded.get(request)).rejects.toThrow('REQUEST_BUDGET');
    expect(transport).toHaveBeenCalledOnce();
  });
});
