import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

import { loadBalancedCountryCandidate } from './balanced-country-candidate-intake.mjs';
import { configurePage } from './configure-official-page-read.mjs';
import {
  OFFICIAL_COUNTRY_PACKAGE_ID,
  OFFICIAL_COUNTRY_SELECTION_SHA256,
  OFFICIAL_COUNTRIES_SHA256,
} from '../supabase/functions/world-v2-official-read/lib/official-country-baseline.js';
import { OFFICIAL_DATASETS } from '../supabase/functions/world-v2-official-read/lib/official-dataset-registry.js';
import { parseLosslessOfficialJson } from '../supabase/functions/world-v2-official-read/lib/official-dataset-source.js';

export const OFFICIAL_CONNECTION_BASE =
  'https://vimksjrhaxdpnkvgsavz.supabase.co/functions/v1/world-v2-official-read';
export const OFFICIAL_CONNECTION_ORIGIN = 'https://samuelq800.github.io';
const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const sections = {
  metadata: 'object',
  'partition.territories': 'array',
  'partition.coverage': 'object',
  'partition.coastPath': 'string',
  climates: 'array',
  physical: 'array',
  currents: 'array',
  'maritime.countries': 'array',
  'maritime.territorialPath': 'string',
  'maritime.eezPath': 'string',
  'maritime.highSeasPath': 'string',
  'maritime.overlapPath': 'string',
  'maritime.territorialOverlapPath': 'string',
  'maritime.oceanPath': 'string',
  'maritime.areas': 'object',
  'maritime.assumptions': 'array',
  'maritime.sources': 'array',
  basins: 'array',
  backgroundResources: 'array',
};

function requireThat(value, code) {
  if (!value) throw new Error(`OFFICIAL_CONNECTION_${code}`);
}

function exact(actual, expected, code) {
  requireThat(isDeepStrictEqual(actual, expected), code);
}

function fields(body, expected, code) {
  requireThat(body !== null && typeof body === 'object', code);
  for (const [key, value] of Object.entries(expected))
    exact(body[key], value, `${code}:${key}`);
}

function selectedMetadata(schemaVersion) {
  return {
    schemaVersion,
    dataNature: 'OFFICIAL_SELECTED_SOURCE_DATASET',
    packageId: OFFICIAL_COUNTRY_PACKAGE_ID,
    selectionChecksumSha256: OFFICIAL_COUNTRY_SELECTION_SHA256,
    liveWorldState: false,
  };
}

function datasetMetadata(spec) {
  return {
    ...selectedMetadata('official-source-dataset-v1'),
    dataset: spec.slug,
    sourcePath: spec.sourcePath,
    sourceSha256: spec.sha256,
    sourceBytes: spec.bytes,
    sourceKind: spec.kind,
    unitTreatment: 'SOURCE_UNITS_PRESERVED_NO_CONVERSION',
    numericEncoding: 'DECIMAL_STRING_EXACT',
    unitsSourcePath: 'DATA_DICTIONARY.md',
    proposalFieldsAreExecuted: false,
    associations: {
      countryFields: spec.countryFields,
      entityFields: spec.entityFields,
      referenceFields: spec.referenceFields,
      countryRelation:
        spec.slug === 'changes'
          ? 'objectId -> regions.id -> regions.countryId'
          : spec.slug === 'seasonal-water'
            ? 'regionId -> regions.id -> regions.countryId'
            : null,
    },
  };
}

const countryMetadata = {
  ...selectedMetadata('official-country-baseline-v1'),
  countriesSha256: OFFICIAL_COUNTRIES_SHA256,
  sourcePath: 'data/countries.json',
  units: {
    population: 'persons',
    areaKm2: 'km2',
    gcuReference: 'GCU_SCENARIO_ACCOUNTING_UNIT',
  },
  proposalFieldsAreExecuted: false,
};

/** Read-only local verification. Reuse the pinned intake and lossless parser;
 * neither historic candidate labels nor source data become live World state. */
export async function prepareOfficialSourceConnection(root = repositoryRoot) {
  const candidate = await loadBalancedCountryCandidate(root);
  const selection = JSON.parse(
    await readFile(path.join(root, 'status/world-data-selection.json'), 'utf8'),
  );
  fields(
    selection,
    { decision: 'OWNER_SELECTED_OFFICIAL_WORLD_V2_DATA_BASELINE' },
    'LOCAL_DECISION',
  );
  fields(
    selection.interpretation,
    { authority: 'OFFICIAL_SELECTED_SOURCE_DATASET' },
    'LOCAL_AUTHORITY',
  );
  fields(
    selection.balancedData,
    {
      packageId: OFFICIAL_COUNTRY_PACKAGE_ID,
      path: 'artifacts/world-balanced-candidate-v1',
      checksumsSha256: OFFICIAL_COUNTRY_SELECTION_SHA256,
      checksumEntries: 86,
      countriesSha256: OFFICIAL_COUNTRIES_SHA256,
      countryCount: 70,
      populationTotal: 14_712_146_434,
    },
    'LOCAL_SELECTION',
  );
  exact(
    candidate.manifestSha256,
    OFFICIAL_COUNTRY_SELECTION_SHA256,
    'LOCAL_MANIFEST',
  );
  exact(candidate.artifacts.length, 87, 'LOCAL_ARTIFACT_COUNT');
  exact(OFFICIAL_DATASETS.length, 34, 'LOCAL_REGISTRY_COUNT');
  const artifacts = new Map(
    candidate.artifacts.map((value) => [value.sourcePath, value]),
  );
  const expected = new Map();
  for (const spec of OFFICIAL_DATASETS) {
    const artifact = artifacts.get(spec.sourcePath);
    requireThat(artifact !== undefined, `LOCAL_SOURCE_MISSING:${spec.slug}`);
    exact(artifact.sha256, spec.sha256, `LOCAL_SOURCE_HASH:${spec.slug}`);
    exact(
      Buffer.byteLength(artifact.content),
      spec.bytes,
      `LOCAL_SOURCE_BYTES:${spec.slug}`,
    );
    expected.set(spec.slug, parseLosslessOfficialJson(artifact.content));
  }
  const countries = JSON.parse(artifacts.get('data/countries.json').content);
  const html = await readFile(
    path.join(root, 'apps/world-web/public/season1-immersive/index.html'),
    'utf8',
  );
  const configured = configurePage(html, OFFICIAL_CONNECTION_BASE);
  requireThat(
    configured.includes(`"apiBaseUrl":"${OFFICIAL_CONNECTION_BASE}/"`),
    'CONFIG_EDGE_PATH',
  );
  const workflow = await readFile(
    path.join(root, '.github/workflows/deploy-world-web.yml'),
    'utf8',
  );
  requireThat(
    workflow.includes(
      'WORLD_OFFICIAL_READ_BASE_URL: ${{ vars.WORLD_OFFICIAL_READ_BASE_URL }}',
    ),
    'CONFIG_VARIABLE_PATH',
  );
  return {
    expected,
    countries,
    plan: {
      status: 'PREPARED_NOT_EXECUTED',
      endpoint: OFFICIAL_CONNECTION_BASE,
      packageId: OFFICIAL_COUNTRY_PACKAGE_ID,
      selectionChecksumSha256: candidate.manifestSha256,
      localRawArtifactsVerified: 87,
      structuredDatasetsExpected: 34,
      countriesExpected: 70,
      populationExpected: candidate.population,
      configPath:
        'WORLD_OFFICIAL_READ_BASE_URL -> configure-official-page-read -> apiBaseUrl',
      configActivation: 'NOT_PERFORMED',
      remoteGetPerformed: false,
      releasePrerequisite:
        'Endpoint RELEASE_GO and explicit Control Tower read-acceptance notification',
      proofBoundary: {
        localRawBytesAndHashes: 'VERIFIED_87',
        remoteStructuredTrees: 'NOT_RUN_34',
        remoteRawArtifactBytes: 'NOT_EXPOSED_BY_EXISTING_DTO',
        other53RemoteArtifacts: 'NOT_EXPOSED_BY_STRUCTURED_ROUTES',
        browserPageConnectivity: 'NOT_TESTED',
      },
      liveWorldState: false,
      proposalFieldsAreExecuted: false,
    },
  };
}

/** No default fetch: fixtures must inject a transport; only the guarded CLI
 * below binds network fetch after human release/notification prerequisites. */
export function createOfficialConnectionRequester(
  fetcher,
  {
    requestLimit = 1_000,
    deadlineMillis = 10 * 60_000,
    requestTimeoutMillis = 30_000,
  } = {},
) {
  requireThat(typeof fetcher === 'function', 'TRANSPORT_REQUIRED');
  for (const limit of [requestLimit, deadlineMillis, requestTimeoutMillis])
    requireThat(Number.isSafeInteger(limit) && limit > 0, 'INVALID_BOUND');
  const deadline = Date.now() + deadlineMillis;
  let requests = 0;
  return {
    get count() {
      return requests;
    },
    async get(suffix) {
      requireThat(
        suffix.startsWith('/v1/world-data/') && !suffix.includes('..'),
        'PATH_NOT_ALLOWED',
      );
      requireThat(
        ++requests <= requestLimit && Date.now() < deadline,
        'REQUEST_BUDGET',
      );
      const response = await fetcher(`${OFFICIAL_CONNECTION_BASE}${suffix}`, {
        method: 'GET',
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        headers: {
          Accept: 'application/json',
          Origin: OFFICIAL_CONNECTION_ORIGIN,
        },
        signal: AbortSignal.timeout(
          Math.min(requestTimeoutMillis, deadline - Date.now()),
        ),
      });
      requireThat(response.status === 200, `HTTP_STATUS:${response.status}`);
      requireThat(
        response.headers.get('access-control-allow-origin') ===
          OFFICIAL_CONNECTION_ORIGIN,
        'CORS_ORIGIN',
      );
      requireThat(
        response.headers
          .get('vary')
          ?.split(',')
          .some((item) => item.trim().toLowerCase() === 'origin'),
        'CORS_VARY',
      );
      requireThat(
        response.headers.get('cache-control') === 'no-store',
        'CACHE_POLICY',
      );
      requireThat(
        response.headers.get('content-type')?.startsWith('application/json'),
        'CONTENT_TYPE',
      );
      requireThat(response.body !== null, 'EMPTY_BODY');
      const reader = response.body.getReader();
      const chunks = [];
      let bytes = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          requireThat(bytes <= 256_000, 'RESPONSE_TOO_LARGE');
          chunks.push(Buffer.from(chunk.value));
        }
      } catch (error) {
        await reader.cancel().catch(() => {});
        throw error;
      } finally {
        reader.releaseLock();
      }
      requireThat(Date.now() < deadline, 'REQUEST_BUDGET');
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        throw new Error('OFFICIAL_CONNECTION_INVALID_JSON');
      }
      exact(body.ok, true, 'BODY_NOT_OK');
      return body;
    },
  };
}

async function readPage(requester, spec, selectors = {}) {
  const items = [];
  let offset = 0;
  let total;
  while (true) {
    const params = new URLSearchParams({
      ...selectors,
      offset: String(offset),
      limit: '50',
    });
    const body = await requester.get(
      `/v1/world-data/datasets/${spec.slug}?${params}`,
    );
    fields(
      body,
      {
        ...datasetMetadata(spec),
        offset,
        filters: {
          countryId: selectors.countryId ?? null,
          entityId: null,
          referenceId: null,
        },
        ...(selectors.section ? { section: selectors.section } : {}),
      },
      `PAGE:${spec.slug}`,
    );
    requireThat(
      Number.isSafeInteger(body.total) &&
        body.total >= 0 &&
        body.total <= 1_000_000,
      'PAGE_TOTAL',
    );
    if (total === undefined) total = body.total;
    exact(body.total, total, 'PAGE_TOTAL_CHANGED');
    requireThat(
      Array.isArray(body.items) && body.items.length <= 50,
      'PAGE_ITEMS',
    );
    exact(body.returned, body.items.length, 'PAGE_RETURNED');
    requireThat(offset + body.returned <= total, 'PAGE_OVERFLOW');
    requireThat(body.returned > 0 || offset === total, 'PAGE_NO_PROGRESS');
    items.push(...body.items);
    offset += body.returned;
    exact(body.nextOffset, offset < total ? offset : null, 'PAGE_CURSOR');
    if (body.nextOffset === null) return items;
  }
}

async function readFragments(requester, spec, section) {
  const fragments = [];
  let offset = 0;
  let total;
  while (true) {
    const params = new URLSearchParams({
      section,
      fragmentOffset: String(offset),
      fragmentLength: '65536',
    });
    const body = await requester.get(
      `/v1/world-data/datasets/${spec.slug}?${params}`,
    );
    fields(
      body,
      { ...datasetMetadata(spec), section, fragmentOffset: offset },
      'FRAGMENT_METADATA',
    );
    requireThat(
      typeof body.fragment === 'string' &&
        Buffer.byteLength(body.fragment) === body.fragment.length,
      'FRAGMENT_ENCODING',
    );
    requireThat(
      Number.isSafeInteger(body.totalLength) &&
        body.totalLength >= 0 &&
        body.totalLength <= 2_000_000,
      'FRAGMENT_TOTAL',
    );
    if (total === undefined) total = body.totalLength;
    exact(body.totalLength, total, 'FRAGMENT_TOTAL_CHANGED');
    exact(body.fragmentLength, body.fragment.length, 'FRAGMENT_LENGTH');
    requireThat(
      body.fragmentLength <= 65_536 && offset + body.fragmentLength <= total,
      'FRAGMENT_OVERFLOW',
    );
    requireThat(
      body.fragmentLength > 0 || offset === total,
      'FRAGMENT_NO_PROGRESS',
    );
    exact(body.fragmentSha256, sha256(body.fragment), 'FRAGMENT_HASH');
    fragments.push(body.fragment);
    offset += body.fragmentLength;
    exact(
      body.nextFragmentOffset,
      offset < total ? offset : null,
      'FRAGMENT_CURSOR',
    );
    if (body.nextFragmentOffset === null) return fragments.join('');
  }
}

/** Reconstruct exclusively from received sections, never from the local tree.
 * Exact equality below therefore detects omitted fields, rows and precision. */
export async function reconstructOfficialDataset(requester, spec) {
  if (spec.kind === 'ARRAY') return readPage(requester, spec);
  const body = await requester.get(`/v1/world-data/datasets/${spec.slug}`);
  fields(body, datasetMetadata(spec), `DATASET:${spec.slug}`);
  if (spec.kind === 'OBJECT') {
    requireThat(
      body.data !== null &&
        typeof body.data === 'object' &&
        !Array.isArray(body.data),
      'OBJECT_DATA',
    );
    return body.data;
  }
  exact(body.sections, Object.keys(sections), 'GEOGRAPHY_SECTIONS');
  const metadata = await requester.get(
    '/v1/world-data/datasets/geography?section=metadata',
  );
  fields(
    metadata,
    { ...datasetMetadata(spec), section: 'metadata' },
    'GEOGRAPHY_METADATA',
  );
  requireThat(
    metadata.data?.partition && metadata.data?.maritime,
    'GEOGRAPHY_METADATA_DATA',
  );
  const root = {
    partition: { ...metadata.data.partition },
    maritime: { ...metadata.data.maritime },
  };
  for (const [section, type] of Object.entries(sections)) {
    if (section === 'metadata') continue;
    let value;
    if (type === 'array') value = await readPage(requester, spec, { section });
    else if (type === 'string')
      value = await readFragments(requester, spec, section);
    else {
      const sectionBody = await requester.get(
        `/v1/world-data/datasets/geography?section=${section}`,
      );
      fields(
        sectionBody,
        { ...datasetMetadata(spec), section },
        'GEOGRAPHY_OBJECT',
      );
      requireThat(
        sectionBody.data !== null &&
          typeof sectionBody.data === 'object' &&
          !Array.isArray(sectionBody.data),
        'GEOGRAPHY_OBJECT_DATA',
      );
      value = sectionBody.data;
    }
    const [first, second] = section.split('.');
    if (second === undefined) root[first] = value;
    else root[first][second] = value;
  }
  return root;
}

export async function auditOfficialSourceConnection(
  prepared,
  fetcher,
  options = {},
) {
  const executionMode = options.executionMode ?? 'FIXTURE';
  requireThat(
    ['FIXTURE', 'AUTHORIZED_RELEASE_READ'].includes(executionMode),
    'EXECUTION_MODE',
  );
  const requester = createOfficialConnectionRequester(fetcher, options);
  const catalog = await requester.get('/v1/world-data/datasets');
  fields(
    catalog,
    {
      ...selectedMetadata('official-source-catalog-v1'),
      datasetCount: 34,
      databaseAvailability: 'VERIFY_PER_REQUEST',
    },
    'CATALOG',
  );
  requireThat(
    Array.isArray(catalog.datasets) && catalog.datasets.length === 34,
    'CATALOG_COUNT',
  );
  exact(
    catalog.datasets.map((item) => item.dataset),
    OFFICIAL_DATASETS.map((spec) => spec.slug),
    'CATALOG_IDENTITIES',
  );
  for (const [index, spec] of OFFICIAL_DATASETS.entries())
    fields(
      catalog.datasets[index],
      datasetMetadata(spec),
      `CATALOG_METADATA:${spec.slug}`,
    );
  const reconstructed = new Map();
  for (const spec of OFFICIAL_DATASETS) {
    const actual = await reconstructOfficialDataset(requester, spec);
    exact(actual, prepared.expected.get(spec.slug), `EXACT_TREE:${spec.slug}`);
    reconstructed.set(spec.slug, actual);
  }
  const population = await verifyOfficialCountryConnection(prepared, requester);
  const associationChecks = await verifyOfficialRegionAssociations(
    reconstructed,
    prepared.countries,
    requester,
  );
  return {
    ...prepared.plan,
    status:
      executionMode === 'FIXTURE'
        ? 'FIXTURE_PASS'
        : 'SOURCE_DTO_ACCEPTANCE_PASS',
    executionMode,
    remoteGetPerformed: executionMode === 'AUTHORIZED_RELEASE_READ',
    requests: requester.count,
    structuredDatasetsReconstructed: reconstructed.size,
    countriesVerified: prepared.countries.length,
    populationVerified: population.toString(),
    countryAssociationChecks: associationChecks,
    proofBoundary: {
      ...prepared.plan.proofBoundary,
      remoteStructuredTrees:
        executionMode === 'AUTHORIZED_RELEASE_READ'
          ? 'EXACT_LOSSLESS_EQUALITY_34'
          : 'NOT_RUN_34',
      remoteDeclaredBytesAndHashes:
        executionMode === 'AUTHORIZED_RELEASE_READ'
          ? 'MATCH_LOCAL_ORIGINALS_34_NOT_REMOTE_RAW_BYTE_HASHING'
          : 'NOT_RUN_34',
      countryIdentityPopulationProvenance:
        executionMode === 'AUTHORIZED_RELEASE_READ'
          ? 'VERIFIED_70'
          : 'FIXTURE_VERIFIED_70',
      regionOnlyAssociationCoverage:
        executionMode === 'AUTHORIZED_RELEASE_READ'
          ? 'ALL_70_COUNTRIES_CHANGES_SEASONAL_WATER_AND_REGIONS'
          : 'FIXTURE_ALL_70_COUNTRIES_CHANGES_SEASONAL_WATER_AND_REGIONS',
      ...(executionMode === 'FIXTURE'
        ? { fixtureStructuredTrees: 'EXACT_LOSSLESS_EQUALITY_34' }
        : {}),
    },
  };
}

export async function verifyOfficialCountryConnection(prepared, requester) {
  const list = await requester.get('/v1/world-data/countries');
  fields(list, { ...countryMetadata, countryCount: 70 }, 'COUNTRY_LIST');
  exact(
    list.countries,
    prepared.countries.map(({ id, name, number, population }) => ({
      id,
      name,
      number,
      population,
    })),
    'COUNTRY_IDENTITIES',
  );
  const population = list.countries.reduce((sum, country) => {
    requireThat(
      Number.isSafeInteger(country.population) && country.population > 0,
      'POPULATION_INTEGER',
    );
    return sum + BigInt(country.population);
  }, 0n);
  exact(population, 14_712_146_434n, 'POPULATION_TOTAL');
  for (const country of prepared.countries) {
    const detail = await requester.get(
      `/v1/world-data/countries/${country.id}`,
    );
    fields(
      detail,
      { ...countryMetadata, countryId: country.id },
      'COUNTRY_DETAIL',
    );
    exact(detail.country, country, `COUNTRY_RECORD:${country.id}`);
  }
  return population;
}

export async function verifyOfficialRegionAssociations(
  reconstructed,
  countries,
  requester,
) {
  const ids = new Set(countries.map((country) => country.id));
  const regionCountry = new Map();
  for (const region of reconstructed.get('regions')) {
    requireThat(
      typeof region.id === 'string' &&
        ids.has(region.countryId) &&
        !regionCountry.has(region.id),
      'REGION_IDENTITY',
    );
    regionCountry.set(region.id, region.countryId);
  }
  let associationChecks = 0;
  for (const slug of ['regions', 'changes', 'seasonal-water']) {
    const spec = OFFICIAL_DATASETS.find((value) => value.slug === slug);
    const rows = reconstructed.get(slug);
    const field = slug === 'changes' ? 'objectId' : 'regionId';
    if (slug !== 'regions')
      for (const row of rows)
        requireThat(regionCountry.has(row[field]), `REGION_REFERENCE:${slug}`);
    for (const countryId of ids) {
      const expected = rows.filter(
        (row) =>
          (slug === 'regions'
            ? row.countryId
            : regionCountry.get(row[field])) === countryId,
      );
      const actual = await readPage(requester, spec, { countryId });
      exact(actual, expected, `COUNTRY_ASSOCIATION:${slug}:${countryId}`);
      associationChecks++;
    }
  }
  return associationChecks;
}

/** Flags are an operator acknowledgement of external authority, not an approval
 * mechanism. No network is allowed by default, --plan, missing or unknown args. */
export function parseOfficialConnectionArguments(args) {
  if (args.length === 0 || isDeepStrictEqual(args, ['--plan']))
    return { execute: false };
  requireThat(
    args.length === 5 &&
      args[0] === '--execute' &&
      args[1] === '--release-go' &&
      args[3] === '--root-authorization',
    'EXECUTION_AUTHORITY_REQUIRED',
  );
  for (const value of [args[2], args[4]])
    requireThat(
      typeof value === 'string' &&
        /^[A-Za-z0-9][A-Za-z0-9_./:#-]{0,255}$/u.test(value),
      'AUTHORITY_REFERENCE_REQUIRED',
    );
  return {
    execute: true,
    releaseGoReference: args[2],
    rootAuthorizationReference: args[4],
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const authority = parseOfficialConnectionArguments(process.argv.slice(2));
    const prepared = await prepareOfficialSourceConnection();
    const result = authority.execute
      ? {
          ...(await auditOfficialSourceConnection(prepared, globalThis.fetch, {
            executionMode: 'AUTHORIZED_RELEASE_READ',
          })),
          authority,
        }
      : prepared.plan;
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    // Never print transport/database messages, returned bodies or credentials.
    const code =
      error instanceof Error &&
      /^OFFICIAL_CONNECTION_[A-Za-z0-9_:.-]+$/u.test(error.message)
        ? error.message
        : 'OFFICIAL_CONNECTION_CHECK_FAILED';
    process.stdout.write(
      `${JSON.stringify({ status: 'FAIL', code, liveWorldState: false, complete: false })}\n`,
    );
    process.exitCode = 1;
  }
}
