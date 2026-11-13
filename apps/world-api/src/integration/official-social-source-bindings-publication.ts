import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  OFFICIAL_COUNTRY_PACKAGE_ID,
  OFFICIAL_COUNTRY_SELECTION_SHA256,
} from './official-country-baseline.js';
import { OFFICIAL_DATASET_BY_SLUG } from './official-dataset-registry.js';
import { parseLosslessOfficialJson } from './official-dataset-source.js';
import {
  OFFICIAL_SOCIAL_BINDINGS_NATURE,
  OFFICIAL_SOCIAL_BINDINGS_PATH,
  OFFICIAL_SOCIAL_BINDINGS_SCHEMA,
  type PublicSocialBindingRow,
  type PublicSocialBindingSubfield,
  type PublicSocialBindingsMetadata,
  type PublicSocialBindingsPage,
  type PublicSocialSourceReference,
  type SocialBindingValue,
} from './official-social-source-bindings-dto.js';

const MAPPING_PATH =
  'docs/reports/world-connection/C_OFFICIAL_WORLD_OPENING_MAPPING.json';
const MAPPING_SHA256 =
  'd2811910a9021e68fabe894504701d6dc8d88e362fc2354b0c826e3446456253';
const OWNER_PATH =
  'docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISIONS.original.md';
const OWNER_SHA256 =
  '57bfdec38a9a400991cb26362a99d33d7a81c8e6258c03460185e51501fb5ac5';
const RECEIPT_SHA256 =
  '2c06c4bd1157a2d245143190c4d17b0499b5d09f42159a414846d0f9bcb8d99e';
const DATASET_NAMES = [
  'employment',
  'population-services',
  'regions',
  'facilities',
];
const MODULE_NAMES = [
  'owner-non-host-source-adoption',
  'official-labour-social-opening-adoption',
  'official-social-staffing-targets',
  'official-social-operating-source-bindings',
];
const SHA256 = /^[a-f0-9]{64}$/u;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const MAX_ARTIFACT_BYTES = 16_000_000;
const MAX_RESPONSE_BYTES = 256_000;
const publications = new WeakSet<object>();

export interface OfficialSocialBindingsPublication {
  readonly metadata: PublicSocialBindingsMetadata;
  readonly rows: readonly PublicSocialBindingRow[];
}
function invalid(): never {
  throw new Error('SOCIAL_BINDING_SOURCE_INVALID');
}
function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    invalid();
  return value as Record<string, unknown>;
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) invalid();
  return value;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 2048) invalid();
  return value;
}
function nullableText(value: unknown): string | null {
  return value === null ? null : text(value);
}
function digestText(value: unknown): string {
  const result = text(value);
  if (!SHA256.test(result)) invalid();
  return result;
}
async function sha256(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes));
  return Array.from(new Uint8Array(hash), (value) =>
    value.toString(16).padStart(2, '0'),
  ).join('');
}
function json(bytes: Uint8Array): Record<string, unknown> {
  try {
    return record(JSON.parse(decoder.decode(bytes)));
  } catch {
    return invalid();
  }
}
function pointer(root: unknown, path: unknown): unknown {
  if (typeof path !== 'string' || !path.startsWith('/') || path.length > 2048)
    invalid();
  let value = root;
  for (const part of path.slice(1).split('/')) {
    if (/~(?:[^01]|$)/u.test(part)) invalid();
    const key = part.replace(/~1/gu, '/').replace(/~0/gu, '~');
    if (
      value === null ||
      typeof value !== 'object' ||
      !Object.hasOwn(value, key)
    )
      invalid();
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}
function publicValue(value: unknown): SocialBindingValue {
  if (value === null || typeof value === 'string') return value;
  const object = record(value);
  const keys = Object.keys(object).sort().join(',');
  if (!['HIGH,LOW,MEDIUM', 'amount,unit'].includes(keys)) invalid();
  return Object.freeze(
    Object.fromEntries(
      Object.entries(object).map(([key, item]) => [key, text(item)]),
    ),
  );
}
function freezeTree<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) freezeTree(item);
    Object.freeze(value);
  }
  return value;
}

/** Explicit server bootstrap only. No filesystem, environment, HTTP loading,
 * Worker import, source admission, database call or mutable publication cache.
 * The expected artifact digest must come from trusted server configuration.
 * Four independently pinned raw datasets are needed to check real JSON pointers
 * and distinguish exact leaf values from merely inspected parent records. */
export async function loadOfficialSocialBindingsPublication(input: {
  readonly artifactBytes: Uint8Array;
  readonly expectedArtifactSHA256: string;
  readonly mappingBytes: Uint8Array;
  readonly datasetBytes: Readonly<Record<string, Uint8Array>>;
}): Promise<OfficialSocialBindingsPublication> {
  // Own the bytes before the first await: the hash must identify exactly what
  // is subsequently parsed, even if a bootstrap caller reuses its input buffers.
  const artifactBytes = Uint8Array.from(input.artifactBytes);
  const mappingBytes = Uint8Array.from(input.mappingBytes);
  const datasetBytes = Object.fromEntries(
    DATASET_NAMES.map((name) => {
      const value = input.datasetBytes[name];
      if (!value) invalid();
      return [name, Uint8Array.from(value)];
    }),
  );
  if (
    artifactBytes.byteLength < 1 ||
    artifactBytes.byteLength > MAX_ARTIFACT_BYTES ||
    !SHA256.test(input.expectedArtifactSHA256)
  )
    invalid();
  const artifactHash = await sha256(artifactBytes);
  if (
    artifactHash !== input.expectedArtifactSHA256 ||
    (await sha256(mappingBytes)) !== MAPPING_SHA256
  )
    invalid();
  const artifact = json(artifactBytes);
  const mapping = record(json(mappingBytes).mappings);
  if (
    artifact.schemaVersion !== 'official-social-source-bindings-inventory-v1' ||
    artifact.status !== 'SOURCE_MAPPING_PARTIAL_NOT_OPERATIONAL'
  )
    invalid();
  const capabilities = record(artifact.capabilities);
  for (const name of [
    'sourceBytesChanged',
    'sourceAdmitted',
    'actualEmploymentCreated',
    'queueOrServiceStateInvented',
    'runtimeConnected',
    'databaseAccessPerformed',
    'WorldClock',
  ])
    if (capabilities[name] !== false) invalid();
  const source = record(artifact.source);
  if (
    source.packageId !== OFFICIAL_COUNTRY_PACKAGE_ID ||
    source.checksumsSHA256 !== OFFICIAL_COUNTRY_SELECTION_SHA256 ||
    record(source.mapping).path !== MAPPING_PATH ||
    record(source.mapping).sha256 !== MAPPING_SHA256 ||
    record(source.ownerOriginal).path !== OWNER_PATH ||
    record(source.ownerOriginal).sha256 !== OWNER_SHA256 ||
    record(source.ownerReceipt).sha256 !== RECEIPT_SHA256
  )
    invalid();
  const adoption = record(source.adoptionBinding);
  if (
    adoption.path !== 'official-labour-social-opening-adoption' ||
    adoption.meaning !== 'DERIVED_BINDING_NOT_ORIGINAL_OR_ADMISSION' ||
    !/^sha256:[a-f0-9]{64}$/u.test(text(adoption.fingerprint))
  )
    invalid();
  const datasets = new Map<string, { value: unknown; sha256: string }>();
  const provenance = list(source.provenance);
  if (provenance.length !== DATASET_NAMES.length) invalid();
  for (const name of DATASET_NAMES) {
    const spec = OFFICIAL_DATASET_BY_SLUG.get(name)!;
    const bytes = datasetBytes[name];
    const refs = provenance.map(record).filter((item) => item.dataset === name);
    if (
      !bytes ||
      bytes.byteLength !== spec.bytes ||
      (await sha256(bytes)) !== spec.sha256 ||
      refs.length !== 1 ||
      refs[0]!.sha256 !== spec.sha256 ||
      refs[0]!.bytes !== spec.bytes
    )
      invalid();
    datasets.set(`artifacts/world-balanced-candidate-v1/${spec.sourcePath}`, {
      value: parseLosslessOfficialJson(decoder.decode(bytes)),
      sha256: spec.sha256,
    });
  }
  const countryMap = new Map<string, Record<string, unknown>>();
  const regionMap = new Map<string, Record<string, unknown>>();
  const entityMap = new Map<string, Record<string, unknown>>();
  for (const [name, key, map] of [
    ['countries', 'coreCountryId', countryMap],
    ['regions', 'normalizedRegionId', regionMap],
    ['entityProposals', 'proposedCoreLegalEntityId', entityMap],
  ] as const) {
    for (const raw of list(mapping[name])) {
      const row = record(raw),
        id = text(row[key]);
      if (map.has(id)) invalid();
      map.set(id, row);
    }
  }
  if (
    countryMap.size !== 70 ||
    regionMap.size !== 122 ||
    entityMap.size !== 350
  )
    invalid();
  const statuses = { KNOWN: 0, DERIVED: 0, MISSING: 0, CONFLICT: 0 };
  const origins = { ALREADY_MAPPED: 0, NEWLY_WIRED: 0, UNBOUND: 0 };
  function subfield(raw: unknown): PublicSocialBindingSubfield {
    const field = record(raw);
    const status = text(field.status) as keyof typeof statuses;
    const origin = text(field.mappingOrigin) as keyof typeof origins;
    if (!Object.hasOwn(statuses, status) || !Object.hasOwn(origins, origin))
      invalid();
    statuses[status]++;
    origins[origin]++;
    const value = publicValue(field.value);
    if (status === 'MISSING' && (value !== null || origin !== 'UNBOUND'))
      invalid();
    const refs = list(field.sourceReferences);
    if (!refs.length) invalid();
    const references: PublicSocialSourceReference[] = refs.map((rawRef) => {
      const ref = record(rawRef),
        namespace = text(
          ref.namespace,
        ) as PublicSocialSourceReference['namespace'];
      const path = text(ref.path),
        pathPointer = nullableText(ref.pointer);
      let relation: PublicSocialSourceReference['relation'] =
        status === 'MISSING' ? 'CHECKED_PARENT_RECORD' : 'DERIVATION_INPUT';
      if (namespace === 'DATASET') {
        const dataset = datasets.get(path);
        if (!dataset || ref.sha256 !== dataset.sha256) invalid();
        const resolved = pointer(dataset.value, pathPointer);
        if (
          status === 'MISSING' &&
          ref.relation === undefined &&
          (resolved === null || typeof resolved !== 'object')
        )
          relation = 'DERIVATION_INPUT';
        const matches = JSON.stringify(resolved) === JSON.stringify(value);
        if (
          ref.relation === 'EXACT_SOURCE_VALUE' ||
          (ref.relation === undefined && status === 'KNOWN')
        ) {
          if (!matches) invalid();
          relation = 'EXACT_SOURCE_VALUE';
        } else if (ref.relation !== undefined) {
          if (
            !['DERIVATION_INPUT', 'CHECKED_PARENT_RECORD'].includes(
              text(ref.relation),
            )
          )
            invalid();
          relation = ref.relation as typeof relation;
        }
        if (
          relation === 'EXACT_SOURCE_VALUE' &&
          resolved !== null &&
          typeof resolved === 'object'
        )
          invalid();
        if (
          relation === 'CHECKED_PARENT_RECORD' &&
          (resolved === null || typeof resolved !== 'object')
        )
          invalid();
      } else if (namespace === 'MAPPING') {
        if (path !== MAPPING_PATH || ref.sha256 !== MAPPING_SHA256) invalid();
        pointer({ mappings: mapping }, pathPointer);
      } else if (namespace === 'OWNER_RULE') {
        if (
          path !== OWNER_PATH ||
          ref.sha256 !== OWNER_SHA256 ||
          (pathPointer !== null && pathPointer !== '5.5')
        )
          invalid();
      } else if (namespace === 'ADOPTION') {
        if (
          path !== adoption.path ||
          ref.sha256 !== null ||
          pathPointer === null ||
          !pathPointer.startsWith('/')
        )
          invalid();
      } else invalid();
      return {
        namespace,
        path: namespace === 'OWNER_RULE' ? 'D04_OWNER_RULE' : path,
        pointer: pathPointer,
        sha256: nullableText(ref.sha256),
        relation,
      };
    });
    return {
      field: text(field.field),
      status,
      value,
      mappingOrigin: origin,
      sourceReferences: references,
      absenceClaimScope:
        status === 'MISSING'
          ? 'INSPECTED_SOURCE_PARENTS_ONLY_NOT_GLOBAL_ABSENCE'
          : null,
    };
  }
  const keys = new Set<string>();
  const rows = list(artifact.rows).map((raw): PublicSocialBindingRow => {
    const row = record(raw),
      original = record(row.originalGap);
    const countryId = text(row.countryId),
      locationId = nullableText(row.locationId),
      economicEntityId = nullableText(row.economicEntityId);
    const country = countryMap.get(countryId),
      region = locationId === null ? null : regionMap.get(locationId),
      entity =
        economicEntityId === null ? null : entityMap.get(economicEntityId);
    if (
      !country ||
      row.sourceCountryId !== country.sourceCountryId ||
      (locationId !== null &&
        (!region ||
          region.coreCountryId !== countryId ||
          region.sourceCountryId !== country.sourceCountryId)) ||
      (economicEntityId !== null &&
        (!entity ||
          entity.coreCountryId !== countryId ||
          entity.sourceCountryId !== country.sourceCountryId)) ||
      row.sourceRegionId !== (region?.sourceRegionId ?? null) ||
      row.sourceEconomicEntityId !== (entity?.sourceEntityId ?? null) ||
      row.sourcePackageId !== OFFICIAL_COUNTRY_PACKAGE_ID ||
      row.sourceVersion !== OFFICIAL_COUNTRY_SELECTION_SHA256 ||
      row.fullyClosed !== false
    )
      invalid();
    const gapKey = JSON.stringify([
      countryId,
      locationId,
      row.sourceObjectId,
      row.field,
    ]);
    if (
      row.gapKey !== gapKey ||
      keys.has(gapKey) ||
      original.countryId !== countryId ||
      original.locationId !== locationId ||
      original.sourceObjectId !== row.sourceObjectId ||
      original.field !== row.field
    )
      invalid();
    keys.add(gapKey);
    const originalDataset = datasets.get(
      `artifacts/world-balanced-candidate-v1/${text(original.sourcePath)}`,
    );
    if (!originalDataset) invalid();
    const sourceObject = record(
      pointer(originalDataset.value, original.sourcePointer),
    );
    if (
      sourceObject.countryId !== country.sourceCountryId ||
      (locationId === null
        ? row.sourceObjectId !== country.sourceCountryId
        : sourceObject.id !== row.sourceObjectId ||
          sourceObject.regionId !== region?.sourceRegionId)
    )
      invalid();
    const subfields = list(row.subfields).map(subfield);
    if (
      !subfields.length ||
      new Set(subfields.map((field) => field.field)).size !==
        subfields.length ||
      subfields.every(
        (field) => field.status === 'KNOWN' || field.status === 'DERIVED',
      )
    )
      invalid();
    const kind = text(row.serviceKind) as PublicSocialBindingRow['serviceKind'];
    if (
      ![
        'COUNTRY_AGGREGATE',
        'BASIC_EDUCATION',
        'HOSPITAL',
        'ORDINARY_HOUSING',
      ].includes(kind) ||
      (kind === 'COUNTRY_AGGREGATE') !== (locationId === null) ||
      (locationId !== null &&
        sourceObject.projectId !==
          (
            {
              BASIC_EDUCATION: 'PROJECT-31',
              HOSPITAL: 'PROJECT-35',
              ORDINARY_HOUSING: 'PROJECT-36',
            } as Record<string, string>
          )[kind])
    )
      invalid();
    return {
      gapKey,
      countryId,
      sourceCountryId: text(country.sourceCountryId),
      locationId,
      sourceRegionId: nullableText(row.sourceRegionId),
      economicEntityId,
      sourceEconomicEntityId: nullableText(row.sourceEconomicEntityId),
      sourceObjectId: text(row.sourceObjectId),
      field: text(row.field),
      fieldFamily: text(row.fieldFamily),
      serviceKind: kind,
      sourceProjectId:
        locationId === null ? null : text(sourceObject.projectId),
      serviceGrain: (
        {
          COUNTRY_AGGREGATE: 'COUNTRY_AGGREGATE',
          BASIC_EDUCATION: 'REGIONAL_EDUCATION_AGGREGATE',
          HOSPITAL: 'REGIONAL_HOSPITAL_AGGREGATE',
          ORDINARY_HOUSING: 'REGIONAL_HOUSING_AGGREGATE',
        } as const
      )[kind],
      originalGapCode: text(original.code),
      subfields,
      fullyClosed: false,
    };
  });
  const summary = record(artifact.summary);
  if (
    rows.length !== 1066 ||
    summary.originalCompositeGaps !== 1066 ||
    summary.fullyClosedCompositeGaps !== 0 ||
    summary.unresolvedCompositeGaps !== 1066 ||
    summary.newRawSourceValuesIntroduced !== 0
  )
    invalid();
  for (const [counts, rawCounts] of [
    [statuses, summary.subfieldsByStatus],
    [origins, summary.subfieldsByMappingOrigin],
  ] as const)
    for (const [name, count] of Object.entries(counts))
      if (record(rawCounts)[name] !== count) invalid();
  const modules = list(source.modules);
  if (modules.length !== MODULE_NAMES.length) invalid();
  const derivations = MODULE_NAMES.map((name) => {
    const matches = modules
      .map(record)
      .filter(
        (item) =>
          item.source === `apps/world-worker/src/preparation/${name}.ts`,
      );
    if (
      matches.length !== 1 ||
      matches[0]!.output !== `apps/world-worker/dist/preparation/${name}.js`
    )
      invalid();
    return {
      module: name,
      sourceSHA256: digestText(matches[0]!.sourceSHA256),
      outputSHA256: digestText(matches[0]!.outputSHA256),
    };
  });
  const publication: OfficialSocialBindingsPublication = freezeTree({
    metadata: {
      schemaVersion: OFFICIAL_SOCIAL_BINDINGS_SCHEMA,
      dataNature: OFFICIAL_SOCIAL_BINDINGS_NATURE,
      bindingFingerprint: `sha256:${artifactHash}`,
      packageId: OFFICIAL_COUNTRY_PACKAGE_ID,
      checksumsSHA256: OFFICIAL_COUNTRY_SELECTION_SHA256,
      mappingSHA256: MAPPING_SHA256,
      ownerRuleSHA256: OWNER_SHA256,
      ownerReceiptSHA256: RECEIPT_SHA256,
      adoptionFingerprint: text(adoption.fingerprint),
      derivations,
      originalCompositeGaps: 1066,
      fullyClosedCompositeGaps: 0,
      unresolvedCompositeGaps: 1066,
      newRawSourceValuesIntroduced: 0,
      entityReferencesAreExecuted: false,
      sourceAdmitted: false,
      liveWorldState: false,
      operationalService: false,
      deployed: false,
    },
    rows,
  });
  publications.add(publication);
  return publication;
}

/** Already-loaded immutable publication only: request paths never load sources. */
export function createOfficialSocialBindingsRoute(
  publication: OfficialSocialBindingsPublication | null = null,
) {
  if (publication !== null && !publications.has(publication)) invalid();
  return (request: IncomingMessage, response: ServerResponse): void => {
    const send = (status: number, value: unknown) => {
      const payload = JSON.stringify(value);
      response.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'content-length': String(encoder.encode(payload).byteLength),
      });
      response.end(request.method === 'HEAD' ? undefined : payload);
    };
    const fail = (status: number, code: string) =>
      send(status, { ok: false, error: { code } });
    if (request.method !== 'GET' && request.method !== 'HEAD')
      return fail(405, 'METHOD_NOT_ALLOWED');
    const url = new URL(request.url ?? '/', 'http://official.invalid');
    if (url.pathname !== OFFICIAL_SOCIAL_BINDINGS_PATH)
      return fail(404, 'NOT_FOUND');
    const allowed = ['countryId', 'offset', 'limit', 'bindingFingerprint'];
    if (
      [...url.searchParams.keys()].some(
        (key) =>
          !allowed.includes(key) || url.searchParams.getAll(key).length !== 1,
      )
    )
      return fail(400, 'PARAMETERS_NOT_ALLOWED');
    const countryId = url.searchParams.get('countryId');
    const offsetText = url.searchParams.get('offset') ?? '0',
      limitText = url.searchParams.get('limit') ?? '20';
    if (
      (countryId !== null &&
        !/^visual-territory-(?:0[1-9]|[1-6][0-9]|70)$/u.test(countryId)) ||
      !/^(?:0|[1-9][0-9]{0,5})$/u.test(offsetText) ||
      !/^[1-9][0-9]?$/u.test(limitText) ||
      Number(limitText) > 50
    )
      return fail(400, 'PARAMETERS_NOT_ALLOWED');
    const expectedVersion = url.searchParams.get('bindingFingerprint');
    if (
      expectedVersion !== null &&
      !/^sha256:[a-f0-9]{64}$/u.test(expectedVersion)
    )
      return fail(400, 'PARAMETERS_NOT_ALLOWED');
    if (publication === null) return fail(503, 'SOURCE_BINDING_UNAVAILABLE');
    if (
      expectedVersion !== null &&
      expectedVersion !== publication.metadata.bindingFingerprint
    )
      return fail(409, 'STALE_BINDING_VERSION');
    const offset = Number(offsetText),
      limit = Number(limitText);
    // Continuation pages must pin the generated binding version, not raw checksum.
    if (offset > 0 && expectedVersion === null)
      return fail(400, 'BINDING_VERSION_REQUIRED');
    const rows =
      countryId === null
        ? publication.rows
        : publication.rows.filter((row) => row.sourceCountryId === countryId);
    let returned = Math.min(limit, Math.max(0, rows.length - offset));
    let page: PublicSocialBindingsPage;
    do {
      page = {
        ...publication.metadata,
        ok: true,
        status: returned === 0 ? 'EMPTY' : 'AVAILABLE',
        page: {
          offset,
          limit,
          returned,
          total: rows.length,
          nextOffset:
            offset + returned < rows.length ? offset + returned : null,
        },
        rows: rows.slice(offset, offset + returned),
      };
      if (encoder.encode(JSON.stringify(page)).byteLength <= MAX_RESPONSE_BYTES)
        return send(200, page);
      returned--;
    } while (returned > 0);
    return fail(503, 'SOURCE_BINDING_RESPONSE_TOO_LARGE');
  };
}
