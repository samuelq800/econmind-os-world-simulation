/** Fixed-source, SERVER-owned preparation. No grant command, SQL, World,
 * inventory, live Clock or actual water delivery is enabled here. */
import { createHash } from 'node:crypto';
import {
  canonicalSerialize,
  nonNegative,
  kernelInvalid,
  renderQuantity,
  createWaterRight,
  createWaterAllocationState,
  allocateWaterPeriod,
  gregorianWaterPeriod,
  volumeFromDecimal,
  sumWater,
  waterVolumeAsQuantity,
  foundationFactPayload,
  SimTime,
  type WaterRight,
  type WaterPurpose,
  type WaterAllocationState,
  type WaterOperation,
  type GregorianWaterCalendarBinding,
  type FoundationFact,
  type FoundationTraceRequest,
} from '@econmind/core';
import {
  inspectOfficialOpeningDecisionSource,
  type OfficialOpeningSourceBytes,
} from './official-opening-decision-reconciliation.js';
import { PHYSICAL_OWNER_DECISION_SHA256 } from './official-physical-opening-adoption.js';

type R = Readonly<Record<string, unknown>>;
export interface WaterOpeningGap {
  readonly countryRef: string;
  readonly regionRef: string | null;
  readonly field: string;
  readonly code: 'SOURCE_MISSING' | 'SOURCE_CONFLICT';
  readonly detail: string;
}
export interface AdoptedWaterAllocationBasis {
  readonly countryRef: string;
  readonly regionRef: string;
  readonly basinRef: string;
  readonly source: R;
  readonly sourceBinding: Readonly<{
    path: string;
    sha256: string;
    pointer: string;
  }>;
  readonly status: 'CONFLICT' | 'ADOPTED_BASIS_NOT_OPERATING';
  readonly domesticAlias: Readonly<{
    allocationExact: string;
    socialExact: string | null;
    differenceExact: string | null;
  }>;
  readonly rights: readonly WaterRight[];
  readonly gaps: readonly WaterOpeningGap[];
}
export interface AdoptedWaterBasin {
  readonly basinRef: string;
  readonly source: R;
  readonly sourceRegionRefs: readonly string[];
  readonly countryRefs: readonly string[];
  /** Sum of distinct source regional runoff contributions, never annual basin
   * inflow plus those same contributions, and never copied per country. */
  readonly monthlyRunoffM3: readonly string[];
  readonly ecologicalReserveShare: string;
}
export interface OfficialWaterOpeningAdoption {
  readonly status: 'ADOPTED_WATER_BASIS_PREPARATION_ONLY';
  readonly ownerDecisionSha256: string;
  readonly sourceFingerprint: string;
  readonly sourceBindings: readonly Readonly<{
    path: string;
    sha256: string;
  }>[];
  readonly allocations: readonly AdoptedWaterAllocationBasis[];
  readonly basins: readonly AdoptedWaterBasin[];
  readonly countries: readonly Readonly<{
    countryRef: string;
    gaps: readonly WaterOpeningGap[];
  }>[];
  readonly runtimeEnabled: false;
  readonly seedAdmitted: false;
  readonly manifestHash: string;
}
function rec(v: unknown): R {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    throw new Error('Explicit mapped source record required');
  return v as R;
}
function text(v: unknown): string {
  if (typeof v !== 'string' || !v.length)
    throw new Error('Explicit source string required; missing is not zero');
  return v;
}
function array(v: unknown): readonly unknown[] {
  if (!Array.isArray(v)) throw new Error('Explicit source array required');
  return v;
}
function freeze<T>(v: T): T {
  if (v !== null && typeof v === 'object') {
    for (const child of Object.values(v)) freeze(child);
    Object.freeze(v);
  }
  return v;
}
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const manifests = new WeakSet<object>();
const consumerStates = new WeakMap<object, OfficialWaterOpeningAdoption>();
function assertManifest(manifest: OfficialWaterOpeningAdoption) {
  if (!manifests.has(manifest)) throw new Error('Unverified water manifest');
}
function missing(
  countryRef: string,
  regionRef: string | null,
  field: string,
  detail: string,
): WaterOpeningGap {
  return { countryRef, regionRef, field, code: 'SOURCE_MISSING', detail };
}
export function buildOfficialWaterOpeningAdoption(input: {
  readonly sourceBytes: OfficialOpeningSourceBytes;
  readonly ownerDecisionBytes: string;
}): OfficialWaterOpeningAdoption {
  if (sha(input.ownerDecisionBytes) !== PHYSICAL_OWNER_DECISION_SHA256)
    throw new Error('SOURCE_DRIFT: exact adopted Owner decision required');
  const inspected = inspectOfficialOpeningDecisionSource(input.sourceBytes);
  if (!inspected.source) throw new Error(JSON.stringify(inspected.blockers));
  const mapping = rec(JSON.parse(input.sourceBytes.mappingBytes));
  const records = rec(mapping.records);
  const entityProposals = array(rec(mapping.mappings).entityProposals).map(rec);
  const rows = (name: string) => array(records[name]).map(rec);
  const seasonal = rows('seasonalWater'),
    regions = rows('climateAndRegions'),
    social = rows('populationServices');
  const dataset = rows('allOfficialDatasets').find(
    (r) => r.dataset === 'geography',
  );
  if (!dataset) throw new Error('Source geography missing');
  const geography = rec(rec(array(dataset.records)[0]).source);
  const basinSources = array(geography.basins).map(rec);
  if (new Set(basinSources.map((b) => text(b.id))).size !== basinSources.length)
    throw new Error('Duplicate basin source');
  const domain = (name: string) => {
    const d = inspected.source!.domains.find((d) => d.dataset === name);
    if (!d) throw new Error(`Missing inspected domain ${name}`);
    return {
      path: `artifacts/world-balanced-candidate-v1/${d.sourcePath}`,
      sha256: d.sourceSha256,
    };
  };
  const allocations: AdoptedWaterAllocationBasis[] = rows(
    'waterAllocations',
  ).map((r, index) => {
    const s = rec(r.source),
      countryRef = text(r.coreCountryId),
      regionRef = text(r.normalizedRegionId),
      basinRef = text(s.basinId);
    const gaps: WaterOpeningGap[] = [];
    const conflict = (field: string, detail: string) =>
      gaps.push({
        countryRef,
        regionRef,
        field,
        detail,
        code: 'SOURCE_CONFLICT',
      });
    const region = regions.filter((x) => x.normalizedRegionId === regionRef),
      season = seasonal.filter((x) => x.normalizedRegionId === regionRef),
      services = social.filter((x) => x.normalizedRegionId === regionRef);
    const basin = basinSources.find((b) => b.id === basinRef);
    if (
      !basin ||
      region.length !== 1 ||
      season.length !== 1 ||
      region[0]!.coreCountryId !== countryRef ||
      season[0]!.coreCountryId !== countryRef ||
      rec(region[0]!.source).basinId !== basinRef ||
      rec(season[0]!.source).basinId !== basinRef ||
      !array(basin.regionIds).includes(text(r.sourceRegionId)) ||
      !array(basin.countryIds).includes(text(r.sourceCountryId))
    )
      conflict(
        'basin/region/country',
        'Source basin, region and country bindings must agree exactly',
      );
    if (s.rightsStatus !== 'ALLOCATION_PROPOSAL_NOT_GRANTED')
      conflict(
        'rightsStatus',
        'Unexpected source status; source is preserved, adoption is separate',
      );
    const componentSum = nonNegative(text(s.domesticM3Day), 'domestic')
      .plus(text(s.agricultureM3Day))
      .plus(text(s.industryM3Day));
    if (!componentSum.equals(text(s.allocatedM3Day)))
      conflict(
        'allocatedM3Day',
        `Exact component sum ${componentSum.toFixed()} differs from source aggregate ${text(s.allocatedM3Day)}`,
      );
    if (
      !nonNegative(text(s.availableM3Day), 'available')
        .minus(text(s.allocatedM3Day))
        .equals(text(s.remainingM3Day))
    )
      conflict(
        'remainingM3Day',
        'Source available - allocated differs exactly from source remaining',
      );
    if (
      nonNegative(text(s.allocatedM3Day), 'allocated').greaterThan(
        text(s.availableM3Day),
      )
    )
      conflict(
        'availableM3Day',
        'Source nominal quota exceeds source available flow',
      );
    if (
      nonNegative(text(s.allocatedM3Day), 'allocated').greaterThan(
        nonNegative(text(s.drySeasonAvailableM3Day), 'dry season supply'),
      )
    )
      conflict(
        'drySeasonAvailableM3Day',
        'Source nominal quotas exceed the declared dry-season ceiling; exact curtailed delivery is required, not a full-supply grant',
      );
    const socialExact =
      services.length === 1
        ? text(rec(services[0]!.source).waterDomesticM3Day)
        : null;
    const difference =
      socialExact === null
        ? null
        : nonNegative(text(s.domesticM3Day), 'allocation alias').minus(
            socialExact,
          );
    if (difference !== null && !difference.isZero())
      conflict(
        'domesticAlias',
        'Exact allocation and social aliases differ; neither is silently replaced',
      );
    if (socialExact === null)
      gaps.push(
        missing(
          countryRef,
          regionRef,
          'socialDomesticAlias',
          'No unique source domestic alias',
        ),
      );
    const bindings = { ...domain('water-allocations'), pointer: `/${index}` };
    const purposes: readonly [WaterPurpose, string, string][] = [
      ['DOMESTIC', 'domesticM3Day', 'HOUSEHOLDS'],
      ['FOOD_AGRICULTURE', 'agricultureM3Day', 'OPERATOR'],
      ['OTHER_INDUSTRY', 'industryM3Day', 'OPERATOR'],
    ];
    const rights = purposes.map(([purpose, field, aggregate]) => {
      const entities = entityProposals.filter(
        (e) =>
          e.coreCountryId === countryRef &&
          e.role === (aggregate === 'OPERATOR' ? 'OP' : aggregate),
      );
      if (typeof s.holderId !== 'string' && entities.length !== 1)
        throw new Error(
          'SOURCE_CONFLICT: no unique existing mapped aggregate holder',
        );
      const holderRef =
        typeof s.holderId === 'string'
          ? s.holderId
          : text(entities[0]!.proposedCoreLegalEntityId);
      return createWaterRight({
        rightRef: `WATER_${regionRef}_${purpose}`,
        countryRef,
        regionRef,
        basinRef,
        holderRef,
        purpose,
        quotaPerDay: { amount: text(s[field]), unit: 'm3/sim-day' },
        sourceRef: `SOURCE_WATER_${index}`,
        validity: null,
      });
    });
    for (const field of [
      'grantValidity',
      'treatmentFacility',
      'networkCapacity',
      'operatingPermission',
      'pumpingPower',
      'rawWaterQuality',
    ])
      gaps.push(
        missing(
          countryRef,
          regionRef,
          field,
          'No approved actual operating fact in fixed allocation source',
        ),
      );
    return {
      countryRef,
      regionRef,
      basinRef,
      source: s,
      sourceBinding: bindings,
      status: gaps.some((g) => g.code === 'SOURCE_CONFLICT')
        ? 'CONFLICT'
        : 'ADOPTED_BASIS_NOT_OPERATING',
      domesticAlias: {
        allocationExact: text(s.domesticM3Day),
        socialExact,
        differenceExact:
          difference === null
            ? null
            : renderQuantity(difference, 'm3/sim-day').amount,
      },
      rights,
      gaps,
    };
  });
  if (new Set(allocations.map((r) => r.regionRef)).size !== allocations.length)
    throw new Error('Duplicate regional water allocation');
  const basinRefs = [...new Set(allocations.map((r) => r.basinRef))].sort();
  const basins: AdoptedWaterBasin[] = basinRefs.map((basinRef) => {
    const source = basinSources.find((b) => b.id === basinRef);
    if (!source) throw new Error(`SOURCE_CONFLICT: missing basin ${basinRef}`);
    const contribution = seasonal.filter(
      (r) => rec(r.source).basinId === basinRef,
    );
    if (
      !contribution.length ||
      new Set(contribution.map((r) => r.normalizedRegionId)).size !==
        contribution.length ||
      contribution.some(
        (r) => array(rec(r.source).monthlyRunoffM3Proposal).length !== 12,
      )
    )
      throw new Error('Missing/duplicate/invalid seasonal contribution');
    const reserves = [
      ...new Set(
        contribution.map((r) => text(rec(r.source).ecologicalReserveShare)),
      ),
    ];
    if (reserves.length !== 1)
      throw new Error(
        'SOURCE_CONFLICT: basin ecological reserves differ; no averaging',
      );
    const monthlyRunoffM3 = Array.from({ length: 12 }, (_, month) => {
      const amount = waterVolumeAsQuantity(
        sumWater(
          contribution.map((r) =>
            volumeFromDecimal(
              text(array(rec(r.source).monthlyRunoffM3Proposal)[month]),
            ),
          ),
        ),
      );
      if (!amount)
        throw new Error(
          'SOURCE_CONFLICT: exact aggregated monthly volume exceeds decimal carrier',
        );
      return amount.amount;
    });
    return {
      basinRef,
      source,
      sourceRegionRefs: contribution
        .map((r) => text(r.normalizedRegionId))
        .sort(),
      countryRefs: [
        ...new Set(contribution.map((r) => text(r.coreCountryId))),
      ].sort(),
      monthlyRunoffM3,
      ecologicalReserveShare: reserves[0]!,
    };
  });
  const countries = inspected.source.countryIds.map((countryRef) => ({
    countryRef,
    gaps: [
      ...allocations
        .filter((r) => r.countryRef === countryRef)
        .flatMap((r) => r.gaps),
      missing(
        countryRef,
        null,
        'GregorianSimulationAnchor',
        'Gregorian 1-12 month rule adopted, but no actual season simulation/Gregorian timestamp anchor in fixed package',
      ),
      missing(
        countryRef,
        null,
        'criticalPublicWaterRight',
        'Public-service quota is not separately declared; do not split household source quota or duplicate it as GOV supply',
      ),
      missing(
        countryRef,
        null,
        'basinOperatingCoordination',
        'Shared basin budget requires all authorized consumers in a single writer/atomic operation, not independent per-country copies',
      ),
    ],
  }));
  const body: Omit<OfficialWaterOpeningAdoption, 'manifestHash'> = {
    status: 'ADOPTED_WATER_BASIS_PREPARATION_ONLY',
    ownerDecisionSha256: PHYSICAL_OWNER_DECISION_SHA256,
    sourceFingerprint: text(mapping.mappingFingerprint),
    sourceBindings: [
      'water-allocations',
      'seasonal-water',
      'geography',
      'population-services',
      'entities',
    ].map(domain),
    allocations,
    basins,
    countries,
    runtimeEnabled: false,
    seedAdmitted: false,
  };
  const manifest = freeze({
    ...body,
    manifestHash: sha(canonicalSerialize(body)),
  });
  manifests.add(manifest);
  return manifest;
}
/** Actual Core constructor consumer. Supplied FoundationFacts must belong to
 * the authoritative snapshot; this still does not prove legal authorization
 * or enable production. A qualified grant cannot override a source conflict. */
export function createOfficialOpeningWaterState(input: {
  readonly manifest: OfficialWaterOpeningAdoption;
  readonly basinRef: string;
  readonly trace: FoundationTraceRequest;
  readonly simulationTimestamp: SimTime;
  readonly calendar: FoundationFact<GregorianWaterCalendarBinding>;
  readonly grant: FoundationFact<
    Readonly<{
      originRef: string;
      validities: readonly Readonly<{
        rightRef: string;
        fromTicks: string;
        untilTicks: string;
      }>[];
    }>
  >;
}): WaterAllocationState {
  assertManifest(input.manifest);
  if (
    input.trace.snapshotAt.unit !== 'sim_millisecond' ||
    input.trace.snapshotAt.amount !==
      input.simulationTimestamp.toCanonicalValue()
  )
    kernelInvalid('Water clock must match actual snapshot timestamp');
  const calendar = foundationFactPayload(
    input.trace,
    input.calendar,
    'water calendar',
  );
  const grant = foundationFactPayload(input.trace, input.grant, 'water grant');
  if (
    !grant.validities.length ||
    new Set(grant.validities.map((g) => g.rightRef)).size !==
      grant.validities.length
  )
    kernelInvalid('Explicit unique scoped grants required');
  const basin = input.manifest.basins.find(
    (b) => b.basinRef === input.basinRef,
  );
  if (!basin) kernelInvalid('Basin is not in fixed water manifest');
  const rights = grant.validities.map((g) => {
    const row = input.manifest.allocations.find((r) =>
      r.rights.some((right) => right.rightRef === g.rightRef),
    );
    const basis = row?.rights.find((r) => r.rightRef === g.rightRef);
    if (
      !row ||
      !basis ||
      row.basinRef !== input.basinRef ||
      row.status === 'CONFLICT'
    )
      kernelInvalid(
        'Grant targets unresolved source conflict or foreign basin',
      );
    return createWaterRight({
      ...basis,
      validity: { fromTicks: g.fromTicks, untilTicks: g.untilTicks },
    });
  });
  const period = gregorianWaterPeriod(calendar, input.simulationTimestamp);
  const state = createWaterAllocationState({
    originRef: grant.originRef,
    basinRef: basin.basinRef,
    calendar,
    openingTimestamp: input.simulationTimestamp,
    monthlyRunoffM3:
      basin.monthlyRunoffM3[
        ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'].indexOf(
          period.month,
        )
      ]!,
    ecologicalReserveShare: {
      amount: basin.ecologicalReserveShare,
      unit: 'ratio',
    },
    rights,
  });
  consumerStates.set(state, input.manifest);
  return state;
}
export function previewOfficialOpeningWater(input: {
  readonly manifest: OfficialWaterOpeningAdoption;
  readonly state: WaterAllocationState;
  readonly trace: FoundationTraceRequest;
  readonly operation: FoundationFact<
    Omit<WaterOperation, 'until'> & Readonly<{ untilTicks: string }>
  >;
}) {
  assertManifest(input.manifest);
  if (consumerStates.get(input.state) !== input.manifest)
    kernelInvalid('Water state not bound to this actual source consumer');
  const op = foundationFactPayload(
    input.trace,
    input.operation,
    'water operation',
  );
  if (
    input.trace.snapshotAt.unit !== 'sim_millisecond' ||
    input.trace.snapshotAt.amount !== input.state.cursorTicks
  )
    kernelInvalid('Water operation must read actual cursor snapshot time');
  const result = allocateWaterPeriod(input.state, {
    ...op,
    until: SimTime.fromTicks(op.untilTicks),
  });
  consumerStates.set(result.state, input.manifest);
  return freeze({
    runtimeEnabled: false as const,
    seedAdmitted: false as const,
    manifestHash: input.manifest.manifestHash,
    ...result,
    decimalDeliveries: result.record.deliveries.map((d) => ({
      demandRef: d.demandRef,
      delivered: waterVolumeAsQuantity(d.delivered),
      gap:
        waterVolumeAsQuantity(d.delivered) === null
          ? ('EXACT_DECIMAL_NOT_REPRESENTABLE' as const)
          : null,
    })),
  });
}
