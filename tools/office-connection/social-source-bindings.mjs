/** Pure selected-source inventory. Never publishes sources, admission or state. */
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const ownerPath =
  'docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISIONS.original.md';
const receiptPath =
  'docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISION_RECEIPT.json';
const mappingPath =
  'docs/reports/world-connection/C_OFFICIAL_WORLD_OPENING_MAPPING.json';
const datasetRoot = 'artifacts/world-balanced-candidate-v1/data';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const read = (relative) => readFile(path.join(root, relative), 'utf8');
const gapKey = (gap) =>
  JSON.stringify([
    gap.countryId,
    gap.locationId,
    gap.sourceObjectId,
    gap.field,
  ]);
function invalid(message) {
  throw Error(`SOCIAL_SOURCE_INVENTORY: ${message}`);
}
function field(value, fallbackReferences) {
  const status = value.status ?? value.classification;
  if (!['KNOWN', 'DERIVED', 'MISSING', 'CONFLICT'].includes(status))
    invalid('unsupported subfield classification');
  if (
    typeof value.field !== 'string' ||
    !value.field ||
    !Array.isArray(value.sourceReferences)
  )
    invalid('subfield and source references required');
  if (!value.sourceReferences.length && ['KNOWN', 'DERIVED'].includes(status))
    invalid('known/derived field lacks provenance');
  const sourceReferences = (
    value.sourceReferences.length
      ? value.sourceReferences
      : fallbackReferences.map((ref) => ({
          ...ref,
          relation: 'CHECKED_PARENT_RECORD',
        }))
  ).map((reference) => {
    const namespace =
      reference.namespace ??
      reference.kind ??
      (reference.path.startsWith('data/') ? 'DATASET' : 'OWNER_RULE');
    if (!['DATASET', 'ADOPTION', 'MAPPING', 'OWNER_RULE'].includes(namespace))
      invalid('unknown source-reference namespace');
    if (
      typeof reference.path !== 'string' ||
      !reference.path ||
      (reference.pointer !== null && typeof reference.pointer !== 'string') ||
      (reference.sha256 !== null &&
        (typeof reference.sha256 !== 'string' ||
          !/^[a-f0-9]{64}$/u.test(reference.sha256))) ||
      (reference.sha256 === null && namespace !== 'ADOPTION')
    )
      invalid(
        'exact source path/pointer/hash or explicit derived-adoption reference required',
      );
    return {
      ...reference,
      namespace,
      path: reference.path.startsWith('data/')
        ? `artifacts/world-balanced-candidate-v1/${reference.path}`
        : reference.path,
    };
  });
  const alreadyMapped =
    value.alreadyMapped === true || value.connection === 'ALREADY_MAPPED';
  return {
    field: value.field,
    status,
    value: value.value,
    mappingOrigin: alreadyMapped
      ? 'ALREADY_MAPPED'
      : ['KNOWN', 'DERIVED'].includes(status)
        ? 'NEWLY_WIRED'
        : 'UNBOUND',
    sourceReferences,
    adoptionPointer: value.adoptionPointer ?? null,
    absenceClaimScope:
      status === 'MISSING'
        ? 'INSPECTED_SOURCE_PARENTS_ONLY_NOT_GLOBAL_ABSENCE'
        : null,
    normativeSourceUnits: value.normativeSourceUnits ?? [],
    detail: value.detail ?? null,
  };
}

/** Classification aggregation only; this cannot issue runtime/source authority. */
export function summarizeSocialSourceRows(rows) {
  const keys = new Set();
  const statuses = { KNOWN: 0, DERIVED: 0, MISSING: 0, CONFLICT: 0 };
  const origins = { ALREADY_MAPPED: 0, NEWLY_WIRED: 0, UNBOUND: 0 };
  let closed = 0;
  for (const row of rows) {
    const key = gapKey(row.originalGap);
    if (keys.has(key)) invalid('duplicate original composite gap');
    keys.add(key);
    if (!Array.isArray(row.subfields) || !row.subfields.length)
      invalid('empty subfield inventory cannot close a gap');
    let fullyClosed = true;
    for (const subfield of row.subfields) {
      if (
        !Object.hasOwn(statuses, subfield.status) ||
        !Object.hasOwn(origins, subfield.mappingOrigin)
      )
        invalid('unknown classification/origin');
      statuses[subfield.status]++;
      origins[subfield.mappingOrigin]++;
      fullyClosed &&= ['KNOWN', 'DERIVED'].includes(subfield.status);
    }
    if (row.fullyClosed !== fullyClosed)
      invalid('composite closure contradicts residual subfields');
    if (fullyClosed) closed++;
  }
  return {
    originalCompositeGaps: rows.length,
    fullyClosedCompositeGaps: closed,
    unresolvedCompositeGaps: rows.length - closed,
    subfieldsByStatus: statuses,
    subfieldsByMappingOrigin: origins,
    newRawSourceValuesIntroduced: 0,
  };
}

export function parseSocialSourceArguments(args) {
  if (!args.length) return '--summary';
  if (args.length === 1 && ['--plan', '--summary', '--check'].includes(args[0]))
    return args[0];
  invalid(
    'use --plan, --summary or --check; source/host/result/mutation overrides are forbidden',
  );
}

async function compiled(name) {
  const source = `apps/world-worker/src/preparation/${name}.ts`;
  const output = `apps/world-worker/dist/preparation/${name}.js`;
  const [sourceStat, outputStat] = await Promise.all([
    stat(path.join(root, source)),
    stat(path.join(root, output)),
  ]);
  if (sourceStat.mtimeMs > outputStat.mtimeMs)
    invalid(`build required for ${name}; stale compiled module refused`);
  return {
    module: await import(pathToFileURL(path.join(root, output)).href),
    identity: {
      source,
      sourceSHA256: hash(await read(source)),
      output,
      outputSHA256: hash(await read(output)),
    },
  };
}

export async function inspectSocialSourceBindings() {
  if (arguments.length)
    invalid('fixed repository inputs only; overrides are forbidden');
  const [adoptionModule, baseModule, staffingModule, operatingModule] =
    await Promise.all([
      compiled('owner-non-host-source-adoption'),
      compiled('official-labour-social-opening-adoption'),
      compiled('official-social-staffing-targets'),
      compiled('official-social-operating-source-bindings'),
    ]);
  const [ownerOriginalBytes, ownerReceiptBytes, mappingBytes] =
    await Promise.all([read(ownerPath), read(receiptPath), read(mappingPath)]);
  const adopted = await adoptionModule.module.loadOwnerNonHostSourceAdoption({
    repositoryRoot: root,
    ownerDocumentPath: path.join(root, ownerPath),
    rootReceiptPath: path.join(root, receiptPath),
    scope: { environment: 'NON_ACTIVATED_PREPARATION', worldId: null },
  });
  const datasets = Object.fromEntries(
    await Promise.all(
      ['employment', 'population-services', 'regions', 'facilities'].map(
        async (name) => [name, await read(`${datasetRoot}/${name}.json`)],
      ),
    ),
  );
  const adoption = baseModule.module.createOfficialLabourSocialOpeningAdoption({
    source: adopted.source,
    mappingBytes,
    ownerOriginalBytes,
    ownerReceiptBytes,
    datasets,
  });
  const staffing =
    staffingModule.module.createOfficialSocialStaffingTargets(adoption);
  const operating =
    operatingModule.module.createOfficialSocialOperatingSourceBindings(
      adoption,
    );
  // These bytes were verified by the genuine adoption constructor above.
  // Preserve the explicit source/Core joins; never reverse-engineer an ID.
  const mappings = JSON.parse(mappingBytes).mappings;
  const idMappings = {
    countries: mappings.countries.map((row) => ({
      countryId: row.coreCountryId,
      sourceCountryId: row.sourceCountryId,
    })),
    regions: mappings.regions.map((row) => ({
      countryId: row.coreCountryId,
      sourceCountryId: row.sourceCountryId,
      locationId: row.normalizedRegionId,
      sourceRegionId: row.sourceRegionId,
    })),
    entities: mappings.entityProposals.map((row) => ({
      countryId: row.coreCountryId,
      sourceCountryId: row.sourceCountryId,
      economicEntityId: row.proposedCoreLegalEntityId,
      sourceEconomicEntityId: row.sourceEntityId,
      role: row.role,
    })),
  };
  const countriesByCore = new Map(
    idMappings.countries.map((row) => [row.countryId, row]),
  );
  const regionsByCore = new Map(
    idMappings.regions.map((row) => [row.locationId, row]),
  );
  const entitiesByCore = new Map(
    idMappings.entities.map((row) => [row.economicEntityId, row]),
  );
  if (
    countriesByCore.size !== idMappings.countries.length ||
    regionsByCore.size !== idMappings.regions.length ||
    entitiesByCore.size !== idMappings.entities.length
  )
    invalid('ambiguous source/Core mapping');
  const originals = new Map(adoption.gaps.map((gap) => [gapKey(gap), gap]));
  if (originals.size !== adoption.gaps.length)
    invalid('branded adoption contains duplicate gap identities');
  const rows = new Map();
  const add = (originalGap, economicEntityId, rawFields, family) => {
    const key = gapKey(originalGap);
    if (!originals.has(key) || rows.has(key))
      invalid('foreign or duplicate module gap');
    const dataset = originalGap.sourcePath
      .replace(/^data\//u, '')
      .replace(/\.json$/u, '');
    const source = adoption.sourceProvenance.find(
      (item) => item.dataset === dataset,
    );
    if (!source) invalid('original gap source provenance missing');
    const fallbackReferences = [
      {
        kind: 'DATASET',
        path: `${datasetRoot}/${dataset}.json`,
        pointer: originalGap.sourcePointer,
        sha256: source.sha256,
      },
    ];
    const subfields = rawFields.map((value) =>
      field(value, fallbackReferences),
    );
    const country = countriesByCore.get(originalGap.countryId);
    const region =
      originalGap.locationId === null
        ? null
        : regionsByCore.get(originalGap.locationId);
    const entity =
      economicEntityId === null ? null : entitiesByCore.get(economicEntityId);
    if (
      !country ||
      (originalGap.locationId !== null &&
        (!region ||
          region.countryId !== originalGap.countryId ||
          region.sourceCountryId !== country.sourceCountryId)) ||
      (economicEntityId !== null &&
        (!entity || entity.countryId !== originalGap.countryId))
    )
      invalid('source/Core scope mapping mismatch');
    if (
      !subfields.length ||
      new Set(subfields.map((s) => s.field)).size !== subfields.length
    )
      invalid('empty/duplicate module subfields');
    rows.set(key, {
      gapKey: key,
      countryId: originalGap.countryId,
      sourceCountryId: country.sourceCountryId,
      economicEntityId,
      sourceEconomicEntityId: entity?.sourceEconomicEntityId ?? null,
      locationId: originalGap.locationId,
      sourceRegionId: region?.sourceRegionId ?? null,
      sourceObjectId: originalGap.sourceObjectId,
      field: originalGap.field,
      fieldFamily: family,
      serviceKind:
        originalGap.locationId === null
          ? 'COUNTRY_AGGREGATE'
          : ({
              'PROJECT-31': 'BASIC_EDUCATION',
              'PROJECT-35': 'HOSPITAL',
              'PROJECT-36': 'ORDINARY_HOUSING',
            }[
              adoption.capacities.find(
                (asset) =>
                  asset.sourceFacilityId === originalGap.sourceObjectId,
              )?.sourceProjectId
            ] ?? invalid('unknown source service grain')),
      sourcePackageId: adoption.sourcePackageId,
      sourceVersion: adoption.sourceChecksumsSha256,
      originalGap,
      subfields,
      fullyClosed: subfields.every((s) =>
        ['KNOWN', 'DERIVED'].includes(s.status),
      ),
    });
  };
  for (const record of operating.records)
    add(
      record.originalGap,
      record.economicEntityId,
      record.subfields,
      record.field === 'staffingByOccupationAndSkill'
        ? `HOSPITAL:${record.field}`
        : record.field,
    );
  for (const record of staffing.records) {
    const originalGap = adoption.gaps.find(
      (gap) =>
        gap.countryId === record.countryId &&
        gap.locationId === record.locationId &&
        gap.sourceObjectId === record.sourceObjectId &&
        gap.field === record.originalGapField,
    );
    if (!originalGap) invalid('teacher target lacks its exact original gap');
    add(
      originalGap,
      record.positionDemand.employerId,
      record.subfields,
      `BASIC_EDUCATION:${record.originalGapField}`,
    );
  }
  const sourceHash = (dataset) =>
    adoption.sourceProvenance.find((row) => row.dataset === dataset)?.sha256 ??
    invalid('missing source hash');
  const sourceReference = (dataset, pointer) => ({
    kind: 'DATASET',
    path: `${datasetRoot}/${dataset}.json`,
    pointer,
    sha256: sourceHash(dataset),
  });
  for (const gap of adoption.gaps) {
    if (rows.has(gapKey(gap))) continue;
    if (gap.field !== 'titleAndTenure')
      invalid('unclassified original gap remains');
    const capacity = adoption.capacities.find(
      (asset) =>
        asset.sourceFacilityId === gap.sourceObjectId &&
        asset.core.kind === 'HOUSING',
    );
    if (!capacity) invalid('housing gap lacks its source-bound asset');
    const facilityRef = sourceReference('facilities', capacity.sourcePointer);
    const serviceRef = sourceReference(
      'population-services',
      capacity.servicePointer,
    );
    const capacityIndex = adoption.capacities.indexOf(capacity);
    const derived = (name, value, pointer) => ({
      field: name,
      status: 'DERIVED',
      value,
      alreadyMapped: true,
      sourceReferences: [
        {
          namespace: 'ADOPTION',
          path: 'official-labour-social-opening-adoption',
          pointer: `/capacities/${capacityIndex}/${pointer}`,
          sha256: null,
        },
        { ...facilityRef, relation: 'CHECKED_PARENT_RECORD' },
        { ...serviceRef, relation: 'CHECKED_PARENT_RECORD' },
      ],
    });
    const known = (name, value, refs) => ({
      field: name,
      status: 'KNOWN',
      value,
      alreadyMapped: true,
      sourceReferences: refs,
    });
    const missing = (name) => ({
      field: name,
      status: 'MISSING',
      value: null,
      alreadyMapped: false,
      sourceReferences: [facilityRef, serviceRef],
      detail:
        'Ordinary aggregate housing, source GOV/OP proposals and capacity do not establish actual title, tenure or appointed operator.',
    });
    add(
      gap,
      null,
      [
        derived('assetId', capacity.core.assetId, 'core/assetId'),
        derived('locationId', capacity.core.locationId, 'core/locationId'),
        derived('housingUnitCapacity', capacity.core.capacity, 'core/capacity'),
        known('householdsReference', capacity.householdsReference, [
          sourceReference(
            'population-services',
            `${capacity.servicePointer}/households`,
          ),
        ]),
        known('sourceOwnerProposal', capacity.sourceOwnerProposal, [
          sourceReference('facilities', `${capacity.sourcePointer}/ownerId`),
        ]),
        known('sourceOperatorProposal', capacity.sourceOperatorProposal, [
          sourceReference('facilities', `${capacity.sourcePointer}/operatorId`),
        ]),
        missing('actualTitleHolderId'),
        missing('actualRiskBearerId'),
        missing('titleAndTenure'),
        missing('actualOperatorId'),
      ],
      'ORDINARY_HOUSING:titleAndTenure',
    );
  }
  const inventory = adoption.gaps.map((gap) => rows.get(gapKey(gap)));
  const summary = summarizeSocialSourceRows(inventory);
  const byCode = Object.fromEntries(
    [...new Set(adoption.gaps.map((gap) => gap.code))]
      .sort()
      .map((code) => [
        code,
        adoption.gaps.filter((gap) => gap.code === code).length,
      ]),
  );
  return {
    schemaVersion: 'official-social-source-bindings-inventory-v1',
    status: summary.unresolvedCompositeGaps
      ? 'SOURCE_MAPPING_PARTIAL_NOT_OPERATIONAL'
      : 'SOURCE_MAPPING_COMPLETE_NOT_ADMISSION',
    classification: 'READ_ONLY_BRANDED_ADOPTION_AND_SOURCE_BINDINGS',
    capabilities: {
      sourceBytesChanged: false,
      sourceAdmitted: false,
      actualEmploymentCreated: false,
      queueOrServiceStateInvented: false,
      runtimeConnected: false,
      databaseAccessPerformed: false,
      WorldClock: false,
    },
    source: {
      adoptionBinding: {
        path: 'official-labour-social-opening-adoption',
        fingerprint: `sha256:${hash(JSON.stringify(adoption))}`,
        meaning: 'DERIVED_BINDING_NOT_ORIGINAL_OR_ADMISSION',
      },
      packageId: adoption.sourcePackageId,
      checksumsSHA256: adoption.sourceChecksumsSha256,
      provenance: adoption.sourceProvenance,
      ownerOriginal: { path: ownerPath, sha256: hash(ownerOriginalBytes) },
      ownerReceipt: { path: receiptPath, sha256: hash(ownerReceiptBytes) },
      mapping: { path: mappingPath, sha256: hash(mappingBytes) },
      modules: [
        adoptionModule,
        baseModule,
        staffingModule,
        operatingModule,
      ].map((value) => value.identity),
    },
    denominator: {
      economies: adoption.countryIds.length,
      sourceCountryObjects: new Set(
        adoption.gaps
          .filter((gap) => gap.locationId === null)
          .map((gap) => gap.sourceObjectId),
      ).size,
      sourceFacilityObjects: new Set(
        adoption.gaps
          .filter((gap) => gap.locationId !== null)
          .map((gap) => gap.sourceObjectId),
      ).size,
      regions: adoption.populationAvailability.length,
      boundEconomicEntityReferences: new Set(
        inventory
          .map((row) => row.economicEntityId)
          .filter((id) => typeof id === 'string'),
      ).size,
      unresolvedEconomicEntityRows: inventory.filter(
        (row) => row.economicEntityId === null,
      ).length,
      originalCompositeGapRows: adoption.gaps.length,
      fieldFamilies: new Set(inventory.map((row) => row.fieldFamily)).size,
    },
    summary: {
      ...summary,
      byOriginalGapCode: byCode,
      countingRule:
        'Subfields are per-original-gap occurrences; repeated shared references are not unique source facts. NEWLY_WIRED means new carrier/derivation, never a new raw original or operational acceptance.',
    },
    moduleStatuses: { staffing: staffing.status, operating: operating.status },
    idMappings,
    rows: inventory,
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const mode = parseSocialSourceArguments(process.argv.slice(2));
    const report = await inspectSocialSourceBindings();
    const { rows: _rows, idMappings: _ids, ...summary } = report;
    void _rows;
    summary.idMappingCounts = Object.fromEntries(
      Object.entries(_ids).map(([kind, values]) => [kind, values.length]),
    );
    process.stdout.write(
      `${JSON.stringify(mode === '--summary' ? summary : report, null, 2)}\n`,
    );
    process.exitCode =
      mode === '--check' && report.summary.unresolvedCompositeGaps ? 2 : 0;
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({ schemaVersion: 'official-social-source-bindings-inventory-v1', status: 'INVENTORY_UNAVAILABLE', sourceAdmitted: false, databaseAccessPerformed: false, WorldClock: false, error: error.message })}\n`,
    );
    process.exitCode = 2;
  }
}
