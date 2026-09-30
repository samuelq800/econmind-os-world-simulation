import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  OFFICIAL_COUNTRY_PACKAGE_ID,
  OFFICIAL_COUNTRY_SELECTION_SHA256,
  type OfficialCountrySqlReader,
} from './official-country-baseline.js';
import {
  OFFICIAL_DATASETS,
  OFFICIAL_DATASET_BY_SLUG,
  type OfficialDatasetSpec,
} from './official-dataset-registry.js';
import {
  OfficialDatasetFailure,
  readOfficialDatasetSource,
} from './official-dataset-source.js';

export const OFFICIAL_DATASET_LIST_PATH = '/v1/world-data/datasets';
const COUNTRY_ID = /^visual-territory-(?:0[1-9]|[1-6][0-9]|70)$/u;
const ENTITY_ID = /^[A-Z][A-Z0-9_-]{0,63}$/u;
const REFERENCE_ID = /^[A-Za-z][A-Za-z0-9_-]{0,100}$/u;
const INTEGER = /^(?:0|[1-9][0-9]{0,6})$/u;
const MAX_RESPONSE_BYTES = 256_000;
const MAX_PAGE_LIMIT = 50;
const MAX_FRAGMENT_LENGTH = 65_536;

const GEOGRAPHY_SECTIONS = Object.freeze([
  'metadata',
  'partition.territories',
  'partition.coverage',
  'partition.coastPath',
  'climates',
  'physical',
  'currents',
  'maritime.countries',
  'maritime.territorialPath',
  'maritime.eezPath',
  'maritime.highSeasPath',
  'maritime.overlapPath',
  'maritime.territorialOverlapPath',
  'maritime.oceanPath',
  'maritime.areas',
  'maritime.assumptions',
  'maritime.sources',
  'basins',
  'backgroundResources',
] as const);
type GeographySection = (typeof GEOGRAPHY_SECTIONS)[number];
const GEOGRAPHY_SECTION_SET = new Set<string>(GEOGRAPHY_SECTIONS);
const GEOGRAPHY_ARRAY_SECTIONS = new Set<string>([
  'partition.territories',
  'climates',
  'physical',
  'currents',
  'maritime.countries',
  'maritime.assumptions',
  'maritime.sources',
  'basins',
  'backgroundResources',
]);
const GEOGRAPHY_STRING_SECTIONS = new Set<string>([
  'partition.coastPath',
  'maritime.territorialPath',
  'maritime.eezPath',
  'maritime.highSeasPath',
  'maritime.overlapPath',
  'maritime.territorialOverlapPath',
  'maritime.oceanPath',
]);

function metadata(spec: OfficialDatasetSpec) {
  return {
    schemaVersion: 'official-source-dataset-v1',
    dataNature: 'OFFICIAL_SELECTED_SOURCE_DATASET',
    packageId: OFFICIAL_COUNTRY_PACKAGE_ID,
    selectionChecksumSha256: OFFICIAL_COUNTRY_SELECTION_SHA256,
    dataset: spec.slug,
    sourcePath: spec.sourcePath,
    sourceSha256: spec.sha256,
    sourceBytes: spec.bytes,
    sourceKind: spec.kind,
    unitTreatment: 'SOURCE_UNITS_PRESERVED_NO_CONVERSION',
    numericEncoding: 'DECIMAL_STRING_EXACT',
    unitsSourcePath: 'DATA_DICTIONARY.md',
    associations: {
      countryFields: spec.countryFields,
      entityFields: spec.entityFields,
      referenceFields: spec.referenceFields,
      countryRelation:
        spec.slug === 'seasonal-water'
          ? 'regionId -> regions.id -> regions.countryId'
          : spec.slug === 'changes'
            ? 'objectId -> regions.id -> regions.countryId'
            : null,
    },
    proposalFieldsAreExecuted: false,
    liveWorldState: false,
  } as const;
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

function queryParameters(request: IncomingMessage): URLSearchParams | null {
  try {
    const parsed = new URL(request.url ?? '', 'http://world-api.invalid');
    const keys = [...parsed.searchParams.keys()];
    if (new Set(keys).size !== keys.length) return null;
    return parsed.searchParams;
  } catch {
    return null;
  }
}

function integer(
  value: string | null,
  fallback: number,
  max: number,
): number | null {
  if (value === null) return fallback;
  if (!INTEGER.test(value)) return null;
  const parsed = Number(value);
  return parsed <= max ? parsed : null;
}

function fieldsMatch(
  value: unknown,
  fields: readonly string[],
  target: string,
): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return false;
  const row = value as Record<string, unknown>;
  return fields.some(
    (field) =>
      row[field] === target ||
      (Array.isArray(row[field]) && (row[field] as unknown[]).includes(target)),
  );
}

function arrayPage(input: {
  readonly values: readonly unknown[];
  readonly spec: OfficialDatasetSpec;
  readonly params: URLSearchParams;
  readonly section?: GeographySection;
  readonly countryFields?: readonly string[];
  readonly referenceFields?: readonly string[];
  readonly countryRelatedRegionIds?: ReadonlySet<string>;
}): object | null {
  const { params, spec } = input;
  const keys = [...params.keys()];
  if (
    keys.some(
      (key) =>
        ![
          'offset',
          'limit',
          'countryId',
          'entityId',
          'referenceId',
          'section',
        ].includes(key),
    )
  )
    return null;
  if (
    (input.section === undefined && params.has('section')) ||
    (input.section !== undefined && params.get('section') !== input.section)
  )
    return null;
  const offset = integer(params.get('offset'), 0, 1_000_000);
  const limit = integer(params.get('limit'), 20, MAX_PAGE_LIMIT);
  if (offset === null || limit === null || limit < 1) return null;
  const countryId = params.get('countryId');
  const entityId = params.get('entityId');
  const referenceId = params.get('referenceId');
  const countryFields = input.countryFields ?? spec.countryFields;
  const referenceFields = input.referenceFields ?? spec.referenceFields;
  if (
    (countryId !== null &&
      (!COUNTRY_ID.test(countryId) ||
        (countryFields.length === 0 &&
          spec.slug !== 'seasonal-water' &&
          spec.slug !== 'changes'))) ||
    (entityId !== null &&
      (!ENTITY_ID.test(entityId) || spec.entityFields.length === 0)) ||
    (referenceId !== null &&
      (!REFERENCE_ID.test(referenceId) || referenceFields.length === 0))
  )
    return null;
  const filtered = input.values.filter(
    (row) =>
      (countryId === null ||
        (spec.slug === 'seasonal-water' || spec.slug === 'changes'
          ? input.countryRelatedRegionIds?.has(
              (row as Record<string, unknown>)[
                spec.slug === 'changes' ? 'objectId' : 'regionId'
              ] as string,
            ) === true
          : fieldsMatch(row, countryFields, countryId))) &&
      (entityId === null || fieldsMatch(row, spec.entityFields, entityId)) &&
      (referenceId === null || fieldsMatch(row, referenceFields, referenceId)),
  );
  const items = filtered.slice(offset, offset + limit);
  const base = {
    ok: true,
    ...metadata(spec),
    ...(input.section === undefined ? {} : { section: input.section }),
    total: filtered.length,
    offset,
    filters: { countryId, entityId, referenceId },
  };
  while (
    items.length > 0 &&
    Buffer.byteLength(JSON.stringify({ ...base, items })) > MAX_RESPONSE_BYTES
  )
    items.pop();
  if (items.length === 0 && offset < filtered.length) return null;
  const nextOffset =
    offset + items.length < filtered.length ? offset + items.length : null;
  return { ...base, returned: items.length, nextOffset, items };
}

function geographyValue(
  root: Record<string, unknown>,
  section: GeographySection,
): unknown {
  if (section === 'metadata') {
    const partition = root.partition as Record<string, unknown>;
    const maritime = root.maritime as Record<string, unknown>;
    if (
      !partition ||
      !maritime ||
      typeof partition !== 'object' ||
      typeof maritime !== 'object'
    )
      throw new OfficialDatasetFailure('SOURCE_INVALID');
    const scalar = (value: Record<string, unknown>) =>
      Object.fromEntries(
        Object.entries(value).filter(
          ([, item]) =>
            item === null ||
            (['string', 'number', 'boolean'].includes(typeof item) &&
              Buffer.byteLength(JSON.stringify(item)) <= 1_024),
        ),
      );
    return { partition: scalar(partition), maritime: scalar(maritime) };
  }
  const keys = section.split('.');
  let value: unknown = root;
  for (const key of keys) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
      throw new OfficialDatasetFailure('SOURCE_INVALID');
    value = (value as Record<string, unknown>)[key];
  }
  if (value === undefined) throw new OfficialDatasetFailure('SOURCE_INVALID');
  return value;
}

function geographyResponse(
  spec: OfficialDatasetSpec,
  value: Record<string, unknown>,
  params: URLSearchParams,
): object | null {
  const section = params.get('section');
  if (section === null) {
    if ([...params.keys()].length !== 0) return null;
    return { ok: true, ...metadata(spec), sections: GEOGRAPHY_SECTIONS };
  }
  if (!GEOGRAPHY_SECTION_SET.has(section)) return null;
  const selected = section as GeographySection;
  const data = geographyValue(value, selected);
  if (Array.isArray(data)) {
    const countryFields =
      selected === 'partition.territories' || selected === 'maritime.countries'
        ? ['id']
        : selected === 'basins'
          ? ['countryIds']
          : selected === 'backgroundResources'
            ? ['countryId']
            : [];
    const referenceFields = selected === 'basins' ? ['regionIds'] : [];
    return arrayPage({
      values: data,
      spec,
      params,
      section: selected,
      countryFields,
      referenceFields,
    });
  }
  if (typeof data === 'string') {
    if (
      [...params.keys()].some(
        (key) => !['section', 'fragmentOffset', 'fragmentLength'].includes(key),
      ) ||
      Buffer.byteLength(data, 'utf8') !== data.length
    )
      return null;
    const fragmentOffset = integer(params.get('fragmentOffset'), 0, 2_000_000);
    const fragmentLength = integer(
      params.get('fragmentLength'),
      MAX_FRAGMENT_LENGTH,
      MAX_FRAGMENT_LENGTH,
    );
    if (
      fragmentOffset === null ||
      fragmentLength === null ||
      fragmentLength < 1
    )
      return null;
    const fragment = data.slice(
      fragmentOffset,
      fragmentOffset + fragmentLength,
    );
    return {
      ok: true,
      ...metadata(spec),
      section: selected,
      fragmentOffset,
      fragmentLength: fragment.length,
      totalLength: data.length,
      nextFragmentOffset:
        fragmentOffset + fragment.length < data.length
          ? fragmentOffset + fragment.length
          : null,
      fragmentSha256: createHash('sha256').update(fragment).digest('hex'),
      fragment,
    };
  }
  if (
    [...params.keys()].some((key) => key !== 'section') ||
    data === null ||
    typeof data !== 'object' ||
    Array.isArray(data)
  )
    return null;
  return { ok: true, ...metadata(spec), section: selected, data };
}

function validParamsBeforeRead(
  spec: OfficialDatasetSpec,
  params: URLSearchParams,
): boolean {
  if (spec.kind === 'OBJECT') return [...params.keys()].length === 0;
  if (spec.kind === 'ARRAY')
    return arrayPage({ values: [], spec, params }) !== null;
  const section = params.get('section');
  if (section === null) return [...params.keys()].length === 0;
  if (!GEOGRAPHY_SECTION_SET.has(section)) return false;
  if (GEOGRAPHY_ARRAY_SECTIONS.has(section)) {
    const countryFields =
      section === 'partition.territories' || section === 'maritime.countries'
        ? ['id']
        : section === 'basins'
          ? ['countryIds']
          : section === 'backgroundResources'
            ? ['countryId']
            : [];
    const referenceFields = section === 'basins' ? ['regionIds'] : [];
    return (
      arrayPage({
        values: [],
        spec,
        params,
        section: section as GeographySection,
        countryFields,
        referenceFields,
      }) !== null
    );
  }
  if (GEOGRAPHY_STRING_SECTIONS.has(section)) {
    return (
      [...params.keys()].every((key) =>
        ['section', 'fragmentOffset', 'fragmentLength'].includes(key),
      ) &&
      integer(params.get('fragmentOffset'), 0, 2_000_000) !== null &&
      (integer(
        params.get('fragmentLength'),
        MAX_FRAGMENT_LENGTH,
        MAX_FRAGMENT_LENGTH,
      ) ?? 0) > 0
    );
  }
  return [...params.keys()].every((key) => key === 'section');
}

async function countryRelatedRegionIds(
  reader: OfficialCountrySqlReader,
  values: readonly unknown[],
  countryId: string,
  referenceField: 'regionId' | 'objectId',
): Promise<ReadonlySet<string>> {
  const regionSpec = OFFICIAL_DATASET_BY_SLUG.get('regions');
  if (regionSpec === undefined)
    throw new OfficialDatasetFailure('SOURCE_INVALID');
  const regions = await readOfficialDatasetSource(reader, regionSpec);
  if (!Array.isArray(regions))
    throw new OfficialDatasetFailure('SOURCE_INVALID');
  const regionCountry = new Map<string, string>();
  for (const value of regions) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
      throw new OfficialDatasetFailure('SOURCE_INVALID');
    const row = value as Record<string, unknown>;
    if (
      typeof row.id !== 'string' ||
      typeof row.countryId !== 'string' ||
      !COUNTRY_ID.test(row.countryId) ||
      regionCountry.has(row.id)
    )
      throw new OfficialDatasetFailure('SOURCE_INVALID');
    regionCountry.set(row.id, row.countryId);
  }
  for (const value of values) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
      throw new OfficialDatasetFailure('SOURCE_INVALID');
    const regionId = (value as Record<string, unknown>)[referenceField];
    if (typeof regionId !== 'string' || !regionCountry.has(regionId))
      throw new OfficialDatasetFailure('SOURCE_INVALID');
  }
  return new Set(
    [...regionCountry]
      .filter(([, linkedCountryId]) => linkedCountryId === countryId)
      .map(([regionId]) => regionId),
  );
}

/** No arbitrary artifact path, JSON pointer, SQL, World identity or mutable
 * runtime projection is accepted from HTTP. */
export function createOfficialDatasetRoute(reader: OfficialCountrySqlReader) {
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
    if (
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
    const params = queryParameters(request);
    if (params === null) {
      send(
        response,
        400,
        { ok: false, error: { code: 'PARAMETERS_NOT_ALLOWED' } },
        head,
      );
      return;
    }
    const path = request.url?.split('?', 1)[0];
    if (path === OFFICIAL_DATASET_LIST_PATH) {
      if ([...params.keys()].length !== 0) {
        send(
          response,
          400,
          { ok: false, error: { code: 'PARAMETERS_NOT_ALLOWED' } },
          head,
        );
        return;
      }
      send(
        response,
        200,
        {
          ok: true,
          schemaVersion: 'official-source-catalog-v1',
          dataNature: 'OFFICIAL_SELECTED_SOURCE_DATASET',
          packageId: OFFICIAL_COUNTRY_PACKAGE_ID,
          selectionChecksumSha256: OFFICIAL_COUNTRY_SELECTION_SHA256,
          datasetCount: OFFICIAL_DATASETS.length,
          databaseAvailability: 'VERIFY_PER_REQUEST',
          liveWorldState: false,
          datasets: OFFICIAL_DATASETS.map((spec) => metadata(spec)),
        },
        head,
      );
      return;
    }
    const slug = path?.startsWith(`${OFFICIAL_DATASET_LIST_PATH}/`)
      ? path.slice(OFFICIAL_DATASET_LIST_PATH.length + 1)
      : undefined;
    const spec =
      slug === undefined ? undefined : OFFICIAL_DATASET_BY_SLUG.get(slug);
    if (spec === undefined) {
      send(
        response,
        404,
        { ok: false, error: { code: 'DATASET_NOT_FOUND' } },
        head,
      );
      return;
    }
    if (!validParamsBeforeRead(spec, params)) {
      send(
        response,
        400,
        { ok: false, error: { code: 'PARAMETERS_NOT_ALLOWED' } },
        head,
      );
      return;
    }
    try {
      const source = await readOfficialDatasetSource(reader, spec);
      const relatedRegionIds =
        (spec.slug === 'seasonal-water' || spec.slug === 'changes') &&
        params.has('countryId')
          ? await countryRelatedRegionIds(
              reader,
              source as unknown[],
              params.get('countryId')!,
              spec.slug === 'changes' ? 'objectId' : 'regionId',
            )
          : undefined;
      const body =
        spec.kind === 'ARRAY'
          ? arrayPage({
              values: source as unknown[],
              spec,
              params,
              ...(relatedRegionIds === undefined
                ? {}
                : { countryRelatedRegionIds: relatedRegionIds }),
            })
          : spec.kind === 'GEOGRAPHY'
            ? geographyResponse(spec, source as Record<string, unknown>, params)
            : [...params.keys()].length === 0
              ? { ok: true, ...metadata(spec), data: source }
              : null;
      if (body === null) {
        send(
          response,
          400,
          { ok: false, error: { code: 'PARAMETERS_NOT_ALLOWED' } },
          head,
        );
        return;
      }
      if (Buffer.byteLength(JSON.stringify(body)) > MAX_RESPONSE_BYTES) {
        send(
          response,
          413,
          { ok: false, error: { code: 'RESPONSE_TOO_LARGE' } },
          head,
        );
        return;
      }
      send(response, 200, body, head);
    } catch (error) {
      const status =
        error instanceof OfficialDatasetFailure &&
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
