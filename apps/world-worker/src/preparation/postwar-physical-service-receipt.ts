/** Persistable physical evidence over the existing sole seed. Readback repeats
 * fixed-source calculations; neither JSON hashes nor labels grant authority. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  canonicalSerialize,
  canonicalDecimal,
  parseOpeningSeed,
  type OpeningSeed,
} from '@econmind/core';
import { isVerifiedOfficialOpeningDecisionSource } from './official-opening-decision-reconciliation.js';
import { createOfficialLabourSocialOpeningAdoption } from './official-labour-social-opening-adoption.js';
import {
  preparePostwarSocialServiceGenesis,
  consumePostwarSocialServiceGenesis,
  type PostwarSocialServiceGenesis,
} from './postwar-social-service-genesis.js';
import {
  createPostwarUtilityInputs,
  allocatePostwarUtilityInputs,
  consumePostwarUtilityInputs,
  consumePostwarUtilityAllocation,
  type PostwarUtilityInputs,
  type PostwarUtilityAllocation,
} from './postwar-utility-inputs.js';
import {
  buildPostwarOperatingSupplies,
  allocatePostwarOperatingSupplies,
  appendPostwarOperatingSupplies,
  isPostwarOperatingSupplies,
  consumePostwarSupplyAllocation,
  type PostwarOperatingSupplies,
  type PostwarSupplyAllocation,
} from './postwar-operating-supplies.js';
import type { loadPostwarSourceContext } from './postwar-source-context.js';

export type PostwarPhysicalSourceContext = Pick<
  Awaited<ReturnType<typeof loadPostwarSourceContext>>,
  | 'sourceBytes'
  | 'source'
  | 'ownerOriginalBytes'
  | 'ownerReceiptBytes'
  | 'labourSocial'
  | 'mappingBytes'
  | 'countriesBytes'
  | 'regionsBytes'
>;
export interface PostwarPhysicalReceiptDocument {
  readonly documentId: string;
  readonly path: string;
  readonly sha256: string;
  readonly bytes: string;
  readonly provenanceKind: 'GENERATED_POLICY';
}
export interface PostwarPhysicalReceiptRegion {
  readonly countryId: string;
  readonly locationId: string;
  readonly waterEpisodes: string;
  readonly powerEpisodes: string;
  readonly educationWaterStudentDays: string;
  readonly educationPowerStudentDays: string;
  readonly medicineDoses: string;
  readonly educationMaterialSeats: string;
  readonly medicineEntryId: string;
  readonly schoolMaterialEntryId: string;
  readonly utilityRequestIds: readonly string[];
}
export interface PostwarPhysicalServiceReceipt {
  readonly schemaVersion: 'postwar-physical-service-receipt-v1';
  readonly worldId: string;
  readonly seedId: string;
  readonly openingGregorianTimestamp: string;
  readonly policyDocumentId: string;
  readonly policySha256: string;
  readonly sourceChecksumsSha256: string;
  readonly mappingSha256: string;
  readonly ownerOriginalSha256: string;
  readonly ownerReceiptSha256: string;
  readonly socialPolicyFingerprint: string;
  readonly sourceReferences: readonly Readonly<{
    dataset: string;
    path: string;
    sha256: string;
  }>[];
  readonly utility: Readonly<{
    inputs: PostwarUtilityInputs;
    allocation: PostwarUtilityAllocation;
    accountsHash: string;
    grantsHash: string;
  }>;
  readonly supplies: Readonly<{
    sourceId: string;
    sourceHash: string;
    fingerprint: string;
    policySha256: string;
    stocks: readonly Readonly<{
      kind: string;
      countryId: string;
      locationId: string;
      serviceAssetId: string;
      entryId: string;
      commodityId: string;
      unit: string;
      ownerId: string;
      accountHash: string;
      originalQuantity: string;
      allocatedFirstDay: string;
      remainingQuantity: string;
      coverageSimDays: string;
    }>[];
    stockHash: string;
    plan: PostwarSupplyAllocation;
    grantsHash: string;
  }>;
  readonly regions: readonly PostwarPhysicalReceiptRegion[];
  readonly fingerprint: string;
  readonly newInventoryEntriesAdded: false;
  readonly originalWaterOrEnergyIncreased: false;
  readonly actualDeliveryOrPaymentCreated: false;
}
type Policies = Readonly<{
  utilities: string;
  supplies: string;
  social?: string;
}>;
type StoredPolicies = Readonly<{
  utilities: string;
  supplies: string;
  social: string;
}>;
const SOCIAL_POLICY_SHA256 =
  'f6f326111e51b1b1b9ffb301468d83c60c5f92839bc7175167c7cf501be8bc22';
const receipts = new WeakSet<object>();
const sha = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
const hash = (value: unknown) => sha(canonicalSerialize(value));
function invalid(reason: string): never {
  throw Error(`POSTWAR_PHYSICAL_RECEIPT: ${reason}`);
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    invalid('Record required');
  return value as Record<string, unknown>;
}
function same(actual: unknown, expected: unknown, label: string): void {
  if (canonicalSerialize(actual) !== canonicalSerialize(expected))
    invalid(label);
}
function normalizedPolicies(value: Policies): StoredPolicies {
  const social =
    value.social ??
    readFileSync(
      new URL(
        '../../../../config/postwar-genesis/social-services.v1.json',
        import.meta.url,
      ),
      'utf8',
    );
  if (sha(social) !== SOCIAL_POLICY_SHA256)
    invalid('Pinned social initialization policy required');
  return { utilities: value.utilities, supplies: value.supplies, social };
}
function whole(value: unknown): bigint {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d*)$/u.test(value))
    invalid('Whole physical service capacity required');
  return BigInt(value);
}
function validateServiceClaims(
  carrier: Record<string, unknown>,
  derived: ReturnType<typeof rederive>,
  receipt: PostwarPhysicalServiceReceipt,
  policies: StoredPolicies,
): void {
  const raw = record(carrier.facts).services;
  if (!Array.isArray(raw))
    invalid('Persisted physical service claims required');
  const services = raw.map(record),
    schoolMaterialRecipe = record(
      record(JSON.parse(policies.supplies)).schoolMaterials,
    ).unitsPerSeatSimDay;
  const medicineRecipe = record(
    record(JSON.parse(policies.social)).healthcare,
  ).dosesPerEpisode;
  if (whole(schoolMaterialRecipe) === 0n || whole(medicineRecipe) === 0n)
    invalid('Positive service consumption recipe required');
  const physical = services.filter(
    (service) => service.kind === 'SCHOOL' || service.kind === 'MEDICAL',
  );
  if (physical.length !== 244)
    invalid('Exactly 122 source school and hospital physical claims required');
  const used = new Set<string>();
  for (const region of derived.social.regions) {
    const bounds = receipt.regions.find(
      (row) => row.locationId === region.locationId,
    )!;
    for (const kind of ['SCHOOL', 'MEDICAL'] as const) {
      const serviceId =
        kind === 'SCHOOL' ? region.schoolAssetId : region.hospitalAssetId;
      const matches = physical.filter(
        (service) =>
          service.serviceId === serviceId &&
          service.kind === kind &&
          service.regionId === region.locationId,
      );
      if (matches.length !== 1)
        invalid(
          'Physical service identity/location does not match actual adopted asset',
        );
      const service = matches[0]!,
        stock = receipt.supplies.stocks.find(
          (row) =>
            row.serviceAssetId === serviceId &&
            row.kind === (kind === 'SCHOOL' ? 'SCHOOL_MATERIALS' : 'MEDICINE'),
        )!;
      const limits =
        kind === 'SCHOOL'
          ? [
              bounds.educationMaterialSeats,
              bounds.educationWaterStudentDays,
              bounds.educationPowerStudentDays,
            ]
          : [
              (whole(bounds.medicineDoses) / whole(medicineRecipe)).toString(),
              bounds.waterEpisodes,
              bounds.powerEpisodes,
            ];
      const cap = limits.map(whole).reduce((a, b) => (a < b ? a : b));
      if (
        whole(service.capacityCount) > cap ||
        whole(service.allocatedCount) > whole(service.capacityCount)
      )
        invalid(
          'Persisted service exceeds recomputed global physical capacity',
        );
      const references = Array.isArray(service.capacityBounds)
        ? service.capacityBounds.map(record)
        : [];
      const bound = references.filter(
        (row) =>
          row.reference ===
          (kind === 'SCHOOL'
            ? 'FUNDED_MATERIAL_AND_UTILITY_SEATS'
            : 'FINITE_SUPPLY_AND_UTILITIES'),
      );
      if (
        bound.length !== 1 ||
        whole(bound[0]!.count) > cap ||
        whole(service.capacityCount) > whole(bound[0]!.count)
      )
        invalid(
          'Persisted physical bound must reference the same finite global plan',
        );
      if (
        !Array.isArray(service.inputAllocations) ||
        service.inputAllocations.length !== 1
      )
        invalid(
          'Exactly one first-day physical input grant per source service required',
        );
      const grant = derived.supplyAllocations.grants.find(
        (row) => row.entryId === stock.entryId,
      )!;
      same(
        service.inputAllocations[0],
        {
          allocationId: grant.allocationId,
          sourceId: grant.sourceId,
          entryId: grant.entryId,
          commodityId: grant.commodityId,
          unit: grant.unit,
          quantity: grant.quantity,
          unitsPerService: String(
            kind === 'SCHOOL' ? schoolMaterialRecipe : medicineRecipe,
          ),
        },
        'Service input reference differs from the sole actual first-day stock plan',
      );
      if (used.has(grant.allocationId))
        invalid('A physical first-day grant cannot serve two services');
      used.add(grant.allocationId);
    }
  }
  for (const service of services.filter(
    (row) => row.kind !== 'SCHOOL' && row.kind !== 'MEDICAL',
  )) {
    if (
      Array.isArray(service.inputAllocations) &&
      service.inputAllocations
        .map(record)
        .some((row) =>
          derived.supplyAllocations.grants.some(
            (grant) =>
              grant.allocationId === row.allocationId ||
              grant.entryId === row.entryId,
          ),
        )
    )
      invalid('Physical service stock re-used by a foreign service');
  }
}
function policyDocument(
  worldId: string,
  seedId: string,
  policies: StoredPolicies,
): PostwarPhysicalReceiptDocument {
  const bytes = canonicalSerialize({
    schemaVersion: 'postwar-physical-service-policy-v1',
    provenanceKind: 'GENERATED_POLICY',
    worldId,
    seedId,
    policies,
  });
  return {
    documentId: `POSTWAR_PHYSICAL_POLICY_${sha(bytes).toUpperCase()}`,
    path: 'generated/postwar-physical-service-policy.v1.json',
    sha256: sha(bytes),
    bytes,
    provenanceKind: 'GENERATED_POLICY',
  };
}
function rederive(input: {
  context: PostwarPhysicalSourceContext;
  worldId: string;
  seedId: string;
  openingGregorianTimestamp: string;
  policies: StoredPolicies;
  seed: OpeningSeed;
}) {
  const { context } = input;
  if (!isVerifiedOfficialOpeningDecisionSource(context.source))
    invalid('Actual verified source context required');
  const datasets = context.sourceBytes.datasets;
  const adoption = createOfficialLabourSocialOpeningAdoption({
    source: context.source,
    mappingBytes: context.sourceBytes.mappingBytes,
    ownerOriginalBytes: context.ownerOriginalBytes,
    ownerReceiptBytes: context.ownerReceiptBytes,
    datasets: {
      employment: datasets['data/employment.json']!,
      'population-services': datasets['data/population-services.json']!,
      regions: datasets['data/regions.json']!,
      facilities: datasets['data/facilities.json']!,
    },
  });
  const social = preparePostwarSocialServiceGenesis({
    adoption,
    mappingBytes: context.sourceBytes.mappingBytes,
    regionsBytes: datasets['data/regions.json']!,
    worldId: input.worldId,
    seedId: input.seedId,
    policy: JSON.parse(input.policies.social),
  });
  const utilities = createPostwarUtilityInputs({
    sourceBytes: context.sourceBytes,
    ownerDecisionBytes: context.ownerOriginalBytes,
    adoption,
    social,
    worldId: input.worldId,
    seedId: input.seedId,
    openingGregorianTimestamp: input.openingGregorianTimestamp,
    policyBytes: input.policies.utilities,
  });
  const utilityAllocations = allocatePostwarUtilityInputs(utilities);
  const supplies = buildPostwarOperatingSupplies({
    source: context.source,
    adoption,
    mappingBytes: context.sourceBytes.mappingBytes,
    countriesBytes: datasets['data/countries.json']!,
    regionsBytes: datasets['data/regions.json']!,
    worldId: input.worldId,
    seedId: input.seedId,
    policyBytes: input.policies.supplies,
  });
  const supplyAllocations = allocatePostwarOperatingSupplies(
    supplies,
    supplies.stocks.map((stock) => ({
      allocationId: `POSTWAR_FIRST_DAY_${stock.entry.entryId}`,
      consumerRef: stock.serviceAssetId,
      worldId: input.worldId,
      countryId: stock.countryId,
      locationId: stock.locationId,
      serviceAssetId: stock.serviceAssetId,
      sourceId: supplies.source.sourceId,
      entryId: stock.entry.entryId,
      commodityId: stock.entry.account.commodityId,
      unit: stock.entry.quantity.unit,
      quantity: stock.dailyBasis,
    })),
  );
  if (
    input.seed.worldId !== input.worldId ||
    input.seed.seedId !== input.seedId
  )
    invalid('Actual seed/world scope differs');
  // The existing idempotent assembler checks exact source, every entry/account,
  // duplicate supplementary commodities, owner and original stock quantities.
  // A missing stock would append a new entry: this read validator rejects it.
  const unchanged = appendPostwarOperatingSupplies(input.seed, supplies);
  same(
    unchanged,
    input.seed,
    'Actual seed lacks the sole exact supply source/stocks',
  );
  return {
    adoption,
    social,
    utilities,
    utilityAllocations,
    supplies,
    supplyAllocations,
  };
}
function receiptFrom(input: {
  context: PostwarPhysicalSourceContext;
  worldId: string;
  seedId: string;
  openingGregorianTimestamp: string;
  policyDocument: PostwarPhysicalReceiptDocument;
  derived: ReturnType<typeof rederive>;
}): PostwarPhysicalServiceReceipt {
  const { derived } = input;
  const stocks = derived.supplies.stocks.map((stock) => {
    const grant = derived.supplyAllocations.grants.find(
      (row) => row.entryId === stock.entry.entryId,
    );
    const remaining = derived.supplyAllocations.remaining.find(
      (row) => row.entryId === stock.entry.entryId,
    );
    if (!grant || !remaining)
      invalid('Incomplete single first-day supply plan');
    return {
      kind: stock.kind,
      countryId: stock.countryId,
      locationId: stock.locationId,
      serviceAssetId: stock.serviceAssetId,
      entryId: stock.entry.entryId,
      commodityId: stock.entry.account.commodityId,
      unit: stock.entry.quantity.unit,
      ownerId: stock.entry.account.titleHolderId,
      accountHash: `sha256:${hash(stock.entry.account)}`,
      originalQuantity: canonicalDecimal(stock.entry.quantity.amount),
      allocatedFirstDay: grant.quantity,
      remainingQuantity: remaining.amount,
      coverageSimDays: stock.coverageSimDays,
    };
  });
  const policyBodies = record(
    record(JSON.parse(input.policyDocument.bytes)).policies,
  );
  const supplyPolicy = record(JSON.parse(String(policyBodies.supplies)));
  const materialsPerStudent = BigInt(
    String(record(supplyPolicy.schoolMaterials).unitsPerSeatSimDay),
  );
  if (materialsPerStudent <= 0n)
    invalid('Positive finite material recipe required');
  const regions = derived.utilityAllocations.regions.map(
    (region): PostwarPhysicalReceiptRegion => {
      const medicine = stocks.find(
          (stock) =>
            stock.locationId === region.locationId && stock.kind === 'MEDICINE',
        ),
        school = stocks.find(
          (stock) =>
            stock.locationId === region.locationId &&
            stock.kind === 'SCHOOL_MATERIALS',
        );
      if (!medicine || !school)
        invalid('Unique school/hospital inventory grain required');
      return {
        countryId: region.countryId,
        locationId: region.locationId,
        waterEpisodes: region.operationalWaterEpisodes,
        powerEpisodes: region.operationalPowerEpisodes,
        educationWaterStudentDays: region.operationalEducationWaterStudentDays,
        educationPowerStudentDays: region.operationalEducationPowerStudentDays,
        medicineDoses: medicine.allocatedFirstDay,
        educationMaterialSeats: (
          BigInt(school.allocatedFirstDay) / materialsPerStudent
        ).toString(),
        medicineEntryId: medicine.entryId,
        schoolMaterialEntryId: school.entryId,
        utilityRequestIds: derived.utilityAllocations.grants
          .filter((grant) => grant.locationId === region.locationId)
          .map((grant) => grant.requestId),
      };
    },
  );
  const body = {
    schemaVersion: 'postwar-physical-service-receipt-v1' as const,
    worldId: input.worldId,
    seedId: input.seedId,
    openingGregorianTimestamp: input.openingGregorianTimestamp,
    policyDocumentId: input.policyDocument.documentId,
    policySha256: input.policyDocument.sha256,
    sourceChecksumsSha256: input.context.source.pins.checksumsSha256,
    mappingSha256: input.context.source.pins.mappingSha256,
    ownerOriginalSha256: sha(input.context.ownerOriginalBytes),
    ownerReceiptSha256: sha(input.context.ownerReceiptBytes),
    socialPolicyFingerprint: derived.social.policyFingerprint,
    sourceReferences: input.context.source.domains
      .filter((domain) =>
        [
          'countries',
          'regions',
          'facilities',
          'power',
          'seasonal-water',
          'water-allocations',
          'geography',
          'population-services',
          'employment',
          'entities',
        ].includes(domain.dataset),
      )
      .map((domain) => ({
        dataset: domain.dataset,
        path: domain.sourcePath,
        sha256: domain.sourceSha256,
      })),
    utility: {
      inputs: derived.utilities,
      allocation: derived.utilityAllocations,
      accountsHash: `sha256:${hash(derived.utilities.accounts)}`,
      grantsHash: `sha256:${hash(derived.utilityAllocations.grants)}`,
    },
    supplies: {
      sourceId: derived.supplies.source.sourceId,
      sourceHash: `sha256:${hash(derived.supplies.source)}`,
      fingerprint: derived.supplies.fingerprint,
      policySha256: derived.supplies.policySha256,
      stocks,
      stockHash: `sha256:${hash(stocks)}`,
      plan: derived.supplyAllocations,
      grantsHash: `sha256:${hash(derived.supplyAllocations.grants)}`,
    },
    regions,
    newInventoryEntriesAdded: false as const,
    originalWaterOrEnergyIncreased: false as const,
    actualDeliveryOrPaymentCreated: false as const,
  };
  const receipt: PostwarPhysicalServiceReceipt = freeze({
    ...body,
    fingerprint: `sha256:${hash(body)}`,
  });
  receipts.add(receipt);
  return receipt;
}
export function consumePostwarPhysicalServiceReceipt(
  receipt: PostwarPhysicalServiceReceipt,
): PostwarPhysicalServiceReceipt {
  if (!receipts.has(receipt)) invalid('Recomputed physical receipt required');
  return receipt;
}

export function createPostwarPhysicalServiceReceipt(input: {
  readonly context: PostwarPhysicalSourceContext;
  readonly social: PostwarSocialServiceGenesis;
  readonly utilities: PostwarUtilityInputs;
  readonly utilityAllocations: PostwarUtilityAllocation;
  readonly supplies: PostwarOperatingSupplies;
  readonly supplyAllocations: PostwarSupplyAllocation;
  readonly suppliesSeed: OpeningSeed;
  readonly worldId: string;
  readonly seedId: string;
  readonly openingGregorianTimestamp: string;
  readonly policyBytes: Policies;
}): Readonly<{
  receipt: PostwarPhysicalServiceReceipt;
  documents: readonly PostwarPhysicalReceiptDocument[];
  receiptDocumentId: string;
  regions: readonly PostwarPhysicalReceiptRegion[];
}> {
  consumePostwarSocialServiceGenesis(input.social);
  consumePostwarUtilityInputs(input.utilities);
  consumePostwarUtilityAllocation(input.utilityAllocations);
  if (!isPostwarOperatingSupplies(input.supplies))
    invalid('Genuine supply preparation required');
  consumePostwarSupplyAllocation(input.supplies, input.supplyAllocations);
  const policies = normalizedPolicies(input.policyBytes),
    policy = policyDocument(input.worldId, input.seedId, policies);
  const seed = parseOpeningSeed(
    JSON.parse(canonicalSerialize(input.suppliesSeed)),
    sha,
  );
  const derived = rederive({
    context: input.context,
    worldId: input.worldId,
    seedId: input.seedId,
    openingGregorianTimestamp: input.openingGregorianTimestamp,
    policies,
    seed,
  });
  for (const [actual, expected] of [
    [input.social, derived.social],
    [input.utilities, derived.utilities],
    [input.utilityAllocations, derived.utilityAllocations],
    [input.supplies, derived.supplies],
    [input.supplyAllocations, derived.supplyAllocations],
  ])
    same(
      actual,
      expected,
      'Prepared physical state differs from actual source/policy derivation',
    );
  const receipt = receiptFrom({
    context: input.context,
    worldId: input.worldId,
    seedId: input.seedId,
    openingGregorianTimestamp: input.openingGregorianTimestamp,
    policyDocument: policy,
    derived,
  });
  const bytes = canonicalSerialize(receipt),
    document = {
      documentId: `POSTWAR_PHYSICAL_RECEIPT_${sha(bytes).toUpperCase()}`,
      path: 'generated/postwar-physical-service-receipt.v1.json',
      sha256: sha(bytes),
      bytes,
      provenanceKind: 'GENERATED_POLICY' as const,
    };
  return freeze({
    receipt,
    documents: [policy, document],
    receiptDocumentId: document.documentId,
    regions: receipt.regions,
  });
}

/** An actual pinned source context remains a server dependency. No full raw
 * source bundle, duplicate stocks or water/energy increments enter the seed. */
export function validatePostwarPhysicalServiceReceiptFromSeed(input: {
  readonly seed: unknown;
  readonly documentId: string;
  readonly context: PostwarPhysicalSourceContext;
}): PostwarPhysicalServiceReceipt {
  const seed = parseOpeningSeed(
    JSON.parse(canonicalSerialize(input.seed)),
    sha,
  );
  const sources = seed.sources.filter(
    (source) =>
      record(JSON.parse(source.canonicalPayload)).schemaVersion ===
      'postwar-operating-genesis-seed-source-v1',
  );
  if (
    sources.length !== 1 ||
    sources[0]!.sourceKind !== 'DOCUMENTED_ASSUMPTION'
  )
    invalid('Exactly one documented operating seed source required');
  const carrier = record(
    record(JSON.parse(sources[0]!.canonicalPayload)).carrier,
  );
  if (
    carrier.physicalServiceReceiptDocumentId !== input.documentId ||
    !Array.isArray(carrier.documents)
  )
    invalid('Receipt must be bound by the sole operating carrier');
  const docs = carrier.documents.map(record);
  const load = (documentId: unknown) => {
    if (typeof documentId !== 'string') invalid('Document identity required');
    const matches = docs.filter((doc) => doc.documentId === documentId);
    if (
      matches.length !== 1 ||
      matches[0]!.provenanceKind !== 'GENERATED_POLICY' ||
      typeof matches[0]!.bytes !== 'string' ||
      sha(matches[0]!.bytes as string) !== matches[0]!.sha256
    )
      invalid('Exact unique physical evidence document/hash required');
    return matches[0]!;
  };
  const receiptDocument = load(input.documentId),
    stored = record(JSON.parse(receiptDocument.bytes as string));
  if (
    stored.schemaVersion !== 'postwar-physical-service-receipt-v1' ||
    stored.worldId !== seed.worldId ||
    stored.seedId !== seed.seedId ||
    typeof stored.openingGregorianTimestamp !== 'string'
  )
    invalid('Physical receipt schema/world/seed differs');
  const rawPolicy = load(stored.policyDocumentId),
    policyBody = record(JSON.parse(rawPolicy.bytes as string));
  if (
    policyBody.schemaVersion !== 'postwar-physical-service-policy-v1' ||
    policyBody.worldId !== seed.worldId ||
    policyBody.seedId !== seed.seedId
  )
    invalid('Physical policy document scope differs');
  const raw = record(policyBody.policies);
  if (
    typeof raw.utilities !== 'string' ||
    typeof raw.supplies !== 'string' ||
    typeof raw.social !== 'string'
  )
    invalid('Exact persisted raw policies required');
  const policies = normalizedPolicies({
    utilities: raw.utilities,
    supplies: raw.supplies,
    social: raw.social,
  });
  const policy = policyDocument(seed.worldId, seed.seedId, policies);
  same(rawPolicy, policy, 'Canonical physical policy document differs');
  const derived = rederive({
    context: input.context,
    worldId: seed.worldId,
    seedId: seed.seedId,
    openingGregorianTimestamp: stored.openingGregorianTimestamp,
    policies,
    seed,
  });
  const receipt = receiptFrom({
    context: input.context,
    worldId: seed.worldId,
    seedId: seed.seedId,
    openingGregorianTimestamp: stored.openingGregorianTimestamp,
    policyDocument: policy,
    derived,
  });
  same(
    stored,
    receipt,
    'Physical receipt does not match source, seed stocks and whole global plans',
  );
  const canonicalBytes = canonicalSerialize(receipt);
  same(
    receiptDocument,
    {
      documentId: `POSTWAR_PHYSICAL_RECEIPT_${sha(canonicalBytes).toUpperCase()}`,
      path: 'generated/postwar-physical-service-receipt.v1.json',
      sha256: sha(canonicalBytes),
      bytes: canonicalBytes,
      provenanceKind: 'GENERATED_POLICY',
    },
    'Canonical physical receipt document differs',
  );
  validateServiceClaims(carrier, derived, receipt, policies);
  return receipt;
}
