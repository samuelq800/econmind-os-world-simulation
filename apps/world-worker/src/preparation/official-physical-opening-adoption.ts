/** SERVER-owned, non-activating adoption/consumer boundary. The real Owner
 * decision fixes policy; public/request approval flags are not accepted.
 * No World, SQL, Clock, inventory, cash, licence or runtime is created here. */
import { createHash } from 'node:crypto';
import {
  canonicalSerialize,
  nonNegative,
  ratio,
  renderQuantity,
  kernelInvalid,
  assertWorldDecimalResult,
  GEOLOGICAL_RESOURCE_UNITS,
  transitionEnergyStorage,
  calculateV13EnergyAllocation,
  createFoundationFact,
  foundationFactBinding,
  projectApprovedNestedOpeningResource,
  type ExactQuantity,
  type GeologicalResourceId,
  type ResourcePoolState,
  type StorageTransitionInput,
  type V13EnergyAllocationInput,
} from '@econmind/core';
import {
  inspectOfficialOpeningDecisionSource,
  type OfficialOpeningSourceBytes,
} from './official-opening-decision-reconciliation.js';

export const PHYSICAL_OWNER_DECISION_SHA256 =
  '57bfdec38a9a400991cb26362a99d33d7a81c8e6258c03460185e51501fb5ac5';
export const OPENING_ELECTRICITY_PRIORITY = Object.freeze([
  'CRITICAL_PUBLIC_INFRASTRUCTURE',
  'HOUSEHOLDS',
  'STRATEGIC_INDUSTRY',
  'MINING',
  'HEAVY_INDUSTRY',
  'GENERAL_INDUSTRY',
] as const);
type Priority = (typeof OPENING_ELECTRICITY_PRIORITY)[number];
type R = Readonly<Record<string, unknown>>;
export interface PhysicalOpeningGap {
  readonly countryId: string;
  readonly objectId: string;
  readonly field: string;
  readonly code: 'SOURCE_MISSING' | 'SOURCE_CONFLICT';
  readonly consumer: string;
  readonly detail: string;
}
export interface PhysicalSourceBinding {
  readonly path: string;
  readonly sha256: string;
  readonly pointer: string;
  readonly ownerDecision: typeof PHYSICAL_OWNER_DECISION_SHA256;
}
export interface AdoptedOpeningFacility {
  readonly id: string;
  readonly countryId: string;
  readonly regionId: string;
  readonly status: 'ADOPTED_BUILT' | 'NOT_ADOPTED_UNBUILT';
  readonly commissioning: 'UNRESOLVED' | 'NOT_BUILT';
  readonly titleHolderId: string | null;
  readonly riskBearerId: string | null;
  readonly operatorId: string | null;
  readonly operatingReady: false;
  readonly source: R;
  readonly binding: PhysicalSourceBinding;
  readonly gaps: readonly PhysicalOpeningGap[];
}
export interface AdoptedOpeningDeposit {
  readonly id: string;
  readonly countryId: string;
  readonly source: R;
  readonly binding: PhysicalSourceBinding;
  readonly state: ResourcePoolState | null;
  readonly sovereignHolderId: string;
  /** Limited candidate scope only: no mining operation is permitted without
   * the named actual technology/permit/staff/input facts. */
  readonly conditionalOperatorScope: Readonly<{
    facilityId: string;
    beneficiaryId: string;
    developedLimit: ExactQuantity;
    extractionLimitPerDay: ExactQuantity;
    executable: false;
  }> | null;
  readonly gaps: readonly PhysicalOpeningGap[];
}
export interface AdoptedOpeningPower {
  readonly id: string;
  readonly countryId: string;
  readonly source: R;
  readonly binding: PhysicalSourceBinding;
  readonly solarFacilityId: string | null;
  readonly windFacilityId: string | null;
  readonly gridFacilityId: string | null;
  readonly storageFacilityId: string | null;
  /** The existing Core storage transition carrier, not Batteries inventory. */
  readonly openingStorage: Readonly<
    Pick<StorageTransitionInput, 'stateOfCharge' | 'energyCapacity'>
  > | null;
  readonly energized: false;
  readonly gaps: readonly PhysicalOpeningGap[];
}
export interface OfficialPhysicalOpeningAdoption {
  readonly status: 'DECISION_ADOPTED_PHYSICAL_PREPARATION';
  readonly sourceFingerprint: string;
  readonly ownerDecisionSha256: typeof PHYSICAL_OWNER_DECISION_SHA256;
  readonly facilities: readonly AdoptedOpeningFacility[];
  readonly deposits: readonly AdoptedOpeningDeposit[];
  readonly power: readonly AdoptedOpeningPower[];
  readonly runtimeEnabled: false;
  readonly seedAdmitted: false;
  readonly manifestHash: string;
}
const branded = new WeakSet<object>();
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function rec(value: unknown): R {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected validated source record');
  return value as R;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0)
    throw new Error(
      'Expected explicit source text, not a numeric/default value',
    );
  return value;
}
function entity(country: string, role: 'GOVERNMENT' | 'OPERATOR') {
  return `ENTITY_${role}_${country.slice(-2)}`;
}
function gap(
  countryId: string,
  objectId: string,
  field: string,
  consumer: string,
  detail: string,
  code: PhysicalOpeningGap['code'] = 'SOURCE_MISSING',
) {
  return { countryId, objectId, field, code, consumer, detail } as const;
}
function facilityGaps(country: string, id: string) {
  return [
    'commissioningEvidence',
    'operatingPermission',
    'technologyRights',
    'recipeCoefficients',
    'actualStaffing',
    'maintenanceFunding',
    'inputAvailability',
    'deliveredPower',
    'deliveredWater',
    'logisticsAvailability',
  ].map((field) =>
    gap(
      country,
      id,
      field,
      'V13ProductionInput/V14ProjectLifecycleInput',
      'Built/source requirement is not an actual operating fact; no default supplied',
    ),
  );
}

/** Consumes E's actual pinned source validator and C's actual mapped records.
 * Matching Owner bytes identify the human-adopted exact policy, not a new
 * approval mechanism. The returned manifest cannot authorize persistence. */
export function buildOfficialPhysicalOpeningAdoption(input: {
  readonly sourceBytes: OfficialOpeningSourceBytes;
  readonly ownerDecisionBytes: string;
}): OfficialPhysicalOpeningAdoption {
  if (sha(input.ownerDecisionBytes) !== PHYSICAL_OWNER_DECISION_SHA256)
    throw new Error(
      'SOURCE_DRIFT: exact adopted Owner decision bytes required',
    );
  const inspected = inspectOfficialOpeningDecisionSource(input.sourceBytes);
  if (inspected.source === null)
    throw new Error(JSON.stringify(inspected.blockers));
  const mapping = rec(JSON.parse(input.sourceBytes.mappingBytes));
  const records = rec(mapping.records);
  const mappedRows = (name: string) => {
    const rows = records[name];
    if (!Array.isArray(rows)) throw new Error(`Missing mapped ${name}`);
    return rows.map(rec);
  };
  const bind = (dataset: string, index: number): PhysicalSourceBinding => {
    const domain = inspected.source.domains.find((d) => d.dataset === dataset);
    if (!domain) throw new Error(`Missing verified domain ${dataset}`);
    return {
      path: `artifacts/world-balanced-candidate-v1/${domain.sourcePath}`,
      sha256: domain.sourceSha256,
      pointer: `/${index}`,
      ownerDecision: PHYSICAL_OWNER_DECISION_SHA256,
    };
  };
  const facilities: AdoptedOpeningFacility[] = mappedRows('facilities').map(
    (m, i) => {
      const source = rec(m.source),
        id = text(source.id),
        countryId = text(m.coreCountryId);
      const unbuilt = source.constructionStatusProposal === 'UNBUILT_OPTION';
      if (
        !unbuilt &&
        source.constructionStatusProposal !== 'OPENING_EXISTING_ASSET'
      )
        throw new Error(`${id}: unknown source construction state`);
      // The fixed source has no separately approved foreign/title/risk records.
      // Do not turn the source's proposal ownerId=GOV into blanket nationalization.
      // Fixed MASTER catalog PROJECT-36 is Public Housing; PROJECT-37 Worker
      // Housing/ordinary household stock is deliberately not included.
      const publicAsset = [
        'PROJECT-31',
        'PROJECT-34',
        'PROJECT-35',
        'PROJECT-36',
      ].includes(String(source.projectId));
      const commercial =
        /^PROJECT-(?:0[1-6]|1[013-8]|2[1356])$/u.test(
          String(source.projectId),
        ) || source.commodityId === 'GRAIN';
      const holder = unbuilt
        ? null
        : publicAsset
          ? entity(countryId, 'GOVERNMENT')
          : commercial
            ? entity(countryId, 'OPERATOR')
            : null;
      const gaps = unbuilt ? [] : facilityGaps(countryId, id);
      if (!unbuilt && holder === null)
        gaps.push(
          gap(
            countryId,
            id,
            'titleHolderId/riskBearerId',
            'FacilityOpening',
            'No approved ownership category; ordinary housing is not default GOV',
          ),
        );
      return {
        id,
        countryId,
        regionId: text(m.normalizedRegionId),
        status: unbuilt ? 'NOT_ADOPTED_UNBUILT' : 'ADOPTED_BUILT',
        commissioning: unbuilt ? 'NOT_BUILT' : 'UNRESOLVED',
        titleHolderId: holder,
        riskBearerId: holder,
        operatorId: holder,
        operatingReady: false,
        source,
        binding: bind('facilities', i),
        gaps,
      };
    },
  );
  const deposits: AdoptedOpeningDeposit[] = mappedRows('deposits').map(
    (m, i) => {
      const source = rec(m.source),
        id = text(source.id),
        countryId = text(m.coreCountryId);
      const resourceId = text(source.commodityId) as GeologicalResourceId;
      const gaps: PhysicalOpeningGap[] = [];
      let state: ResourcePoolState | null = null;
      try {
        state = projectApprovedNestedOpeningResource({
          resourceId,
          unit: text(source.unit),
          initialGeological: text(source.initialGeological),
          cumulativeExtracted: text(source.cumulativeExtracted),
          remainingGeological: text(source.remainingGeological),
          discoveredRemaining: text(source.discoveredRemaining),
          recoverableRemaining: text(source.recoverableRemaining),
          developedRemaining: text(source.developedRemaining),
          originRef: `OPEN_${id}_${bind('deposits', i).sha256.slice(0, 16).toUpperCase()}`,
        });
      } catch (error) {
        gaps.push(
          gap(
            countryId,
            id,
            source.unit !== GEOLOGICAL_RESOURCE_UNITS[resourceId]
              ? 'unit'
              : 'nestedRemaining',
            'createResourcePoolState',
            String(error),
            'SOURCE_CONFLICT',
          ),
        );
      }
      const linked = facilities.filter(
        (f) =>
          f.status === 'ADOPTED_BUILT' &&
          f.countryId === countryId &&
          f.source.depositId === id &&
          f.source.commodityId === resourceId,
      );
      let scope: AdoptedOpeningDeposit['conditionalOperatorScope'] = null;
      if (linked.length !== 1) {
        gaps.push(
          gap(
            countryId,
            id,
            'qualifiedExistingExtractionFacility',
            'extractToCommodityInventory',
            `Expected one explicit built depositId/commodity link; found ${linked.length}`,
          ),
        );
      } else {
        const f = linked[0]!;
        const unit = text(source.unit);
        if (f.source.capacityUnit !== `${unit}/sim-day`) {
          gaps.push(
            gap(
              countryId,
              id,
              'facility.capacityUnit',
              'extractToCommodityInventory',
              'Source deposit/linked facility rate units differ',
              'SOURCE_CONFLICT',
            ),
          );
        } else {
          const cap = nonNegative(
            text(source.extractionCapacityPerDay),
            'extractionCapacityPerDay',
          );
          const facilityCap = nonNegative(
            text(f.source.capacity),
            'facility capacity',
          );
          scope = {
            facilityId: f.id,
            beneficiaryId: entity(countryId, 'OPERATOR'),
            developedLimit: { amount: text(source.developedRemaining), unit },
            extractionLimitPerDay: renderQuantity(
              cap.lessThan(facilityCap) ? cap : facilityCap,
              `${unit}/sim-day`,
            ),
            executable: false,
          };
          gaps.push(
            ...f.gaps.map((g) => ({
              ...g,
              objectId: id,
              field: `facility:${f.id}/${g.field}`,
              consumer: 'extractToCommodityInventory',
            })),
          );
        }
      }
      return {
        id,
        countryId,
        source,
        binding: bind('deposits', i),
        state,
        sovereignHolderId: entity(countryId, 'GOVERNMENT'),
        conditionalOperatorScope: scope,
        gaps,
      };
    },
  );
  const power: AdoptedOpeningPower[] = mappedRows('power').map((m, i) => {
    const source = rec(m.source),
      id = text(source.id),
      countryId = text(m.coreCountryId);
    const gaps: PhysicalOpeningGap[] = [];
    const link = (
      projectId: string,
      field: string,
      unit: string,
      capacityField: string | null,
    ) => {
      const list = facilities.filter(
        (f) =>
          f.countryId === countryId &&
          f.status === 'ADOPTED_BUILT' &&
          f.source.projectId === projectId,
      );
      if (list.length !== 1) {
        gaps.push(
          gap(
            countryId,
            id,
            field,
            'V13EnergyAllocationInput',
            `Expected unique adopted ${projectId}; found ${list.length}`,
            'SOURCE_CONFLICT',
          ),
        );
        return null;
      }
      const f = list[0]!;
      if (
        f.source.capacityUnit !== unit ||
        (capacityField !== null &&
          !nonNegative(text(f.source.capacity), 'facility capacity').equals(
            nonNegative(text(source[capacityField]), capacityField),
          ))
      ) {
        gaps.push(
          gap(
            countryId,
            id,
            `${field}/capacity`,
            'V13EnergyAllocationInput',
            'Adopted facility/source grid unit or exact capacity differs',
            'SOURCE_CONFLICT',
          ),
        );
        return null;
      }
      return f.id;
    };
    const solarFacilityId = link(
      'PROJECT-10',
      'solarFacilityId',
      'MW',
      'solarMW',
    );
    const windFacilityId = link('PROJECT-11', 'windFacilityId', 'MW', 'windMW');
    const storageFacilityId = link(
      'PROJECT-13',
      'storageFacilityId',
      'MWh',
      'storageMWh',
    );
    const gridFacilityId = link('PROJECT-23', 'gridFacilityId', 'MW', null);
    let openingStorage: AdoptedOpeningPower['openingStorage'] = null;
    if (storageFacilityId !== null) {
      const capacity = nonNegative(text(source.storageMWh), 'storageMWh');
      const soc = ratio(
        { amount: text(source.openingStateOfChargeFraction), unit: 'ratio' },
        'initialSOC',
      );
      openingStorage = {
        energyCapacity: renderQuantity(capacity, 'MWh'),
        stateOfCharge: renderQuantity(
          assertWorldDecimalResult(capacity.times(soc)),
          'MWh',
        ),
      };
    }
    for (const field of [
      'energizationEvidence',
      'gridConnectionAvailability',
      'fuelEnergyPerMWh',
      'technologyEfficiency',
      'operatingHours',
      'chargeEfficiency',
      'dischargeEfficiency',
      'peakDemand',
      'qualifiedDemand',
    ])
      gaps.push(
        gap(
          countryId,
          id,
          field,
          'V13EnergyAllocationInput/StorageTransitionInput',
          'Capacity/SOC/average proposal does not supply this actual runtime fact',
        ),
      );
    return {
      id,
      countryId,
      source,
      binding: bind('power', i),
      solarFacilityId,
      windFacilityId,
      gridFacilityId,
      storageFacilityId,
      openingStorage,
      energized: false,
      gaps,
    };
  });
  const body: Omit<OfficialPhysicalOpeningAdoption, 'manifestHash'> = {
    status: 'DECISION_ADOPTED_PHYSICAL_PREPARATION' as const,
    sourceFingerprint: text(mapping.mappingFingerprint),
    ownerDecisionSha256: PHYSICAL_OWNER_DECISION_SHA256,
    facilities,
    deposits,
    power,
    runtimeEnabled: false as const,
    seedAdmitted: false as const,
  };
  const result = freeze({
    ...body,
    manifestHash: sha(canonicalSerialize(body)),
  });
  branded.add(result);
  return result;
}
function powerOf(manifest: OfficialPhysicalOpeningAdoption, countryId: string) {
  if (!branded.has(manifest)) throw new Error('Unverified physical manifest');
  const p = manifest.power.find((p) => p.countryId === countryId);
  if (!p) throw new Error('Country not in fixed physical manifest');
  return p;
}

/** Actual Core consumer, PREVIEW ONLY. Explicit future input facts are not
 * fabricated from planning quantities. No operating permission is awarded. */
export function previewOfficialOpeningStorage(input: {
  readonly manifest: OfficialPhysicalOpeningAdoption;
  readonly countryId: string;
  readonly transition: Omit<
    StorageTransitionInput,
    'stateOfCharge' | 'energyCapacity'
  >;
  readonly durationHours: ExactQuantity;
}) {
  const p = powerOf(input.manifest, input.countryId);
  if (!p.openingStorage)
    throw new Error('SOURCE_MISSING: adopted storage device/capacity/SOC');
  if (input.durationHours.unit !== 'hour')
    kernelInvalid('Explicit duration must use hour');
  const hours = nonNegative(input.durationHours.amount, 'durationHours');
  const limit = nonNegative(
    text(p.source.storageDischargeMW),
    'storageDischargeMW',
  ).times(hours);
  if (
    nonNegative(
      input.transition.requestedDischargeToGrid.amount,
      'discharge',
    ).greaterThan(limit)
  )
    kernelInvalid('Requested discharge exceeds source MW times explicit hours');
  // Source has no charge-power limit: a charging preview must not guess one.
  if (
    !nonNegative(
      input.transition.requestedChargeFromGrid.amount,
      'charge',
    ).isZero()
  )
    throw new Error('SOURCE_MISSING: storage charge power limit');
  return freeze({
    runtimeEnabled: false as const,
    storageFacilityId: p.storageFacilityId,
    binding: p.binding,
    result: transitionEnergyStorage({
      ...p.openingStorage,
      ...input.transition,
    }),
  });
}

/** Core computes generation/fuel/grid/category shortages. This adapter only
 * applies the adopted same-priority proportional split, exactly or rejects. */
export function previewOfficialOpeningElectricity(input: {
  readonly manifest: OfficialPhysicalOpeningAdoption;
  readonly countryId: string;
  readonly energy: V13EnergyAllocationInput;
  readonly demands: readonly Readonly<{
    id: string;
    priority: Priority;
    requested: ExactQuantity;
  }>[];
}) {
  const p = powerOf(input.manifest, input.countryId);
  if (!p.solarFacilityId || !p.windFacilityId || !p.gridFacilityId)
    throw new Error('SOURCE_MISSING: adopted generation/grid links');
  const generation = input.energy.generation.payload;
  const solar = generation.generationRef === p.solarFacilityId;
  if (!solar && generation.generationRef !== p.windFacilityId)
    kernelInvalid(
      'Generation must reference this country adopted solar/wind facility',
    );
  const sourceCapacity = text(p.source[solar ? 'solarMW' : 'windMW']);
  if (
    generation.availableCapacity.unit !== 'MW' ||
    nonNegative(
      generation.availableCapacity.amount,
      'availableCapacity',
    ).greaterThan(nonNegative(sourceCapacity, 'sourceCapacity'))
  )
    kernelInvalid('Available generation exceeds adopted source equipment');
  if (
    generation.capacityFactor.amount !==
    text(p.source[solar ? 'solarCapacityFactor' : 'windCapacityFactor'])
  )
    kernelInvalid('Capacity factor differs from exact source');
  if (input.energy.grid.payload.gridRef !== p.id)
    kernelInvalid('Wrong source grid');
  if (
    input.demands.length === 0 ||
    new Set(input.demands.map((d) => d.id)).size !== input.demands.length
  )
    kernelInvalid('Explicit nonempty unique qualified demands required');
  for (const d of input.demands) {
    if (
      !OPENING_ELECTRICITY_PRIORITY.includes(d.priority) ||
      d.requested.unit !== 'MWh'
    )
      kernelInvalid('Demand category/unit not in adopted policy');
    nonNegative(d.requested.amount, 'requested');
  }
  const categories = OPENING_ELECTRICITY_PRIORITY.flatMap((category, i) => {
    const ds = input.demands.filter((d) => d.priority === category);
    if (ds.length === 0) return [];
    const total = ds.reduce(
      (sum, d) => sum.plus(nonNegative(d.requested.amount, 'demand')),
      nonNegative('0', 'additive identity'),
    );
    return [
      {
        allocationRef: `OPEN_POWER_${input.countryId}_${i + 1}`,
        downstreamDemandRef: `OPEN_DEMAND_${input.countryId}_${i + 1}`,
        priority: String(i + 1),
        requested: renderQuantity(total, 'MWh'),
      },
    ];
  });
  foundationFactBinding(
    input.energy.trace,
    input.energy.allocationPlan,
    'allocationPlan predecessor',
  );
  const plan = createFoundationFact({
    trace: input.energy.trace,
    factRef: `OPEN_PLAN_${input.countryId}`,
    sourceRef: `OWNER_D04_4_${PHYSICAL_OWNER_DECISION_SHA256.slice(0, 16)}`,
    predecessorFactRefs: [input.energy.allocationPlan.factRef],
    payload: {
      allocationPlanRef: `OPEN_PLAN_${input.countryId}`,
      allocations: categories,
    },
  });
  const result = calculateV13EnergyAllocation({
    ...input.energy,
    allocationPlan: plan,
  });
  const allocations = input.demands.map((d) => {
    const index = OPENING_ELECTRICITY_PRIORITY.indexOf(d.priority);
    const line = result.allocations.find(
      (l) => l.allocationRef === `OPEN_POWER_${input.countryId}_${index + 1}`,
    )!;
    const total = categories.find(
      (c) => c.allocationRef === line.allocationRef,
    )!.requested;
    const requested = nonNegative(d.requested.amount, 'requested');
    const delivered = nonNegative(line.delivered.amount, 'delivered');
    const denominator = nonNegative(total.amount, 'total');
    const share = denominator.isZero()
      ? nonNegative('0', 'empty demand')
      : assertWorldDecimalResult(
          delivered.times(requested).dividedBy(denominator),
        );
    if (!share.times(denominator).equals(delivered.times(requested)))
      kernelInvalid(
        'Proportional allocation has no exact representable decimal; no rounding allowed',
      );
    return {
      id: d.id,
      priority: d.priority,
      requested: d.requested,
      delivered: renderQuantity(share, 'MWh'),
    };
  });
  return freeze({
    runtimeEnabled: false as const,
    source: p.binding,
    result,
    allocations,
  });
}
