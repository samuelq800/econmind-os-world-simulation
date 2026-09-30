import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import type { IncomingMessage, ServerResponse } from 'node:http';

export const OFFICIAL_COUNTRY_PACKAGE_ID = 'BALANCED_2026_09_28_V1';
export const OFFICIAL_COUNTRY_SELECTION_SHA256 =
  '88dd44478f97d2e8893a4f11b3aaf96e256bdb13248aca0d08f097fabe10d315';
export const OFFICIAL_COUNTRIES_SHA256 =
  '5d493e93dfab1425731191ba7491cce47949d176e4769b33fdca48d2d31dba89';
export const OFFICIAL_COUNTRY_LIST_PATH = '/v1/world-data/countries';
export const OFFICIAL_COUNTRY_SOURCE_STORAGE_PATH = `source/${Buffer.from('data/countries.json').toString('hex')}`;
const COUNTRY_ID = /^visual-territory-(?:0[1-9]|[1-6][0-9]|70)$/u;
const MAX_SOURCE_BYTES = 200_000;

export interface OfficialCountrySqlReader {
  query(
    text: string,
    values: readonly string[],
  ): Promise<{ readonly rows: readonly unknown[] }>;
}

export const OFFICIAL_COUNTRY_SOURCE_QUERY = `
select b.bundle_id, b.package_manifest_sha256, b.source_status,
       b.activation_allowed, a.content_sha256, a.content_utf8
from world_v2.country_candidate_bundle as b
join world_v2.country_candidate_artifact as a on a.bundle_id = b.bundle_id
where b.bundle_id = $1 and a.artifact_path = $2
limit 2
`.trim();

interface CountrySource {
  readonly id: string;
  readonly name: string;
  readonly number: string;
  readonly population: number;
  readonly teamAssignment: null;
  readonly [key: string]: unknown;
}

export class OfficialCountryReadFailure extends Error {
  constructor(readonly code: 'SOURCE_UNAVAILABLE' | 'SOURCE_INVALID') {
    super(code);
  }
}

function invalid(): never {
  throw new OfficialCountryReadFailure('SOURCE_INVALID');
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return invalid();
  return value as Record<string, unknown>;
}

/** Revalidates the immutable selected source bytes, not the inert candidate
 * label as World/OpeningSeed authority. No source row is interpreted as live. */
export async function readOfficialCountries(
  reader: OfficialCountrySqlReader,
): Promise<readonly CountrySource[]> {
  let result: { readonly rows: readonly unknown[] };
  try {
    result = await reader.query(OFFICIAL_COUNTRY_SOURCE_QUERY, [
      OFFICIAL_COUNTRY_PACKAGE_ID,
      OFFICIAL_COUNTRY_SOURCE_STORAGE_PATH,
    ]);
  } catch {
    throw new OfficialCountryReadFailure('SOURCE_UNAVAILABLE');
  }
  if (!Array.isArray(result.rows) || result.rows.length === 0)
    throw new OfficialCountryReadFailure('SOURCE_UNAVAILABLE');
  if (result.rows.length !== 1) invalid();
  const row = asRecord(result.rows[0]);
  if (
    row.bundle_id !== OFFICIAL_COUNTRY_PACKAGE_ID ||
    row.package_manifest_sha256 !== OFFICIAL_COUNTRY_SELECTION_SHA256 ||
    row.source_status !== 'IMPLEMENTED_UNVERIFIED_CANDIDATE' ||
    row.activation_allowed !== false ||
    row.content_sha256 !== OFFICIAL_COUNTRIES_SHA256 ||
    typeof row.content_utf8 !== 'string' ||
    Buffer.byteLength(row.content_utf8, 'utf8') > MAX_SOURCE_BYTES ||
    createHash('sha256').update(row.content_utf8, 'utf8').digest('hex') !==
      OFFICIAL_COUNTRIES_SHA256
  )
    invalid();
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.content_utf8);
  } catch {
    invalid();
  }
  if (!Array.isArray(parsed) || parsed.length !== 70) invalid();
  let population = 0;
  for (const [index, item] of parsed.entries()) {
    const country = asRecord(item);
    const id = `visual-territory-${String(index + 1).padStart(2, '0')}`;
    if (
      country.id !== id ||
      country.number !== String(index + 1).padStart(2, '0') ||
      typeof country.name !== 'string' ||
      country.name.length === 0 ||
      !Number.isSafeInteger(country.population) ||
      (country.population as number) <= 0 ||
      country.teamAssignment !== null
    )
      invalid();
    population += country.population as number;
  }
  if (population !== 14_712_146_434) invalid();
  return parsed as readonly CountrySource[];
}

function send(
  response: ServerResponse,
  status: number,
  body: object,
  head: boolean,
): void {
  if (response.destroyed) return;
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'x-content-type-options': 'nosniff',
  });
  response.end(head ? undefined : payload);
}

function sourceMetadata() {
  return {
    schemaVersion: 'official-country-baseline-v1',
    dataNature: 'OFFICIAL_SELECTED_SOURCE_DATASET',
    packageId: OFFICIAL_COUNTRY_PACKAGE_ID,
    selectionChecksumSha256: OFFICIAL_COUNTRY_SELECTION_SHA256,
    countriesSha256: OFFICIAL_COUNTRIES_SHA256,
    sourcePath: 'data/countries.json',
    units: {
      population: 'persons',
      areaKm2: 'km2',
      gcuReference: 'GCU_SCENARIO_ACCOUNTING_UNIT',
    },
    proposalFieldsAreExecuted: false,
    liveWorldState: false,
  } as const;
}

/** Fixed public selected-source route; no World ID, SQL, identity or selector
 * supplied by the client. The authorized live projection route is separate. */
export function createOfficialCountryBaselineRoute(
  reader: OfficialCountrySqlReader,
) {
  return async (
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> => {
    const head = request.method === 'HEAD';
    if (request.method !== 'GET' && !head) {
      response.setHeader('allow', 'GET, HEAD');
      send(
        response,
        405,
        { ok: false, error: { code: 'METHOD_NOT_ALLOWED' } },
        false,
      );
      return;
    }
    const path = request.url ?? '';
    const detailPrefix = `${OFFICIAL_COUNTRY_LIST_PATH}/`;
    const countryId = path.startsWith(detailPrefix)
      ? path.slice(detailPrefix.length)
      : undefined;
    if (
      (path !== OFFICIAL_COUNTRY_LIST_PATH &&
        (countryId === undefined || !COUNTRY_ID.test(countryId))) ||
      request.headers['transfer-encoding'] !== undefined ||
      (request.headers['content-length'] !== undefined &&
        request.headers['content-length'] !== '0')
    ) {
      request.resume();
      send(
        response,
        400,
        { ok: false, error: { code: 'PARAMETERS_NOT_ALLOWED' } },
        head,
      );
      return;
    }
    try {
      const countries = await readOfficialCountries(reader);
      if (countryId !== undefined) {
        const country = countries.find((item) => item.id === countryId);
        if (country === undefined) {
          send(
            response,
            404,
            { ok: false, error: { code: 'COUNTRY_NOT_FOUND' } },
            head,
          );
          return;
        }
        send(
          response,
          200,
          { ok: true, ...sourceMetadata(), countryId, country },
          head,
        );
        return;
      }
      send(
        response,
        200,
        {
          ok: true,
          ...sourceMetadata(),
          countryCount: countries.length,
          countries: countries.map(({ id, name, number, population }) => ({
            id,
            name,
            number,
            population,
          })),
        },
        head,
      );
    } catch (error) {
      const status =
        error instanceof OfficialCountryReadFailure &&
        error.code === 'SOURCE_INVALID'
          ? 502
          : 503;
      send(
        response,
        status,
        {
          ok: false,
          error: {
            code: status === 502 ? 'SOURCE_INVALID' : 'SOURCE_UNAVAILABLE',
          },
        },
        head,
      );
    }
  };
}
