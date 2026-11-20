/** Finite t0 utility purchase options and raw-water rights. Neither potential
 * allocation nor a generated permission is actual electricity/water delivery. */
import { createHash } from 'node:crypto';
import {
  canonicalSerialize,
  createGregorianWaterCalendarBinding,
  gregorianWaterPeriod,
  SimTime,
} from '@econmind/core';
import { buildOfficialPhysicalOpeningAdoption } from './official-physical-opening-adoption.js';
import { buildOfficialWaterOpeningAdoption } from './official-water-opening-adoption.js';
import {
  consumeLabourSocialOpeningAdoption,
  type OfficialLabourSocialOpeningAdoption,
} from './official-labour-social-opening-adoption.js';
import {
  consumePostwarSocialServiceGenesis,
  postwarSocialServiceFundingPurpose,
  type PostwarSocialServiceGenesis,
} from './postwar-social-service-genesis.js';
import type { OfficialOpeningSourceBytes } from './official-opening-decision-reconciliation.js';

export const POSTWAR_UTILITY_POLICY_PATH =
  'config/postwar-genesis/utilities.v1.json';
export const POSTWAR_UTILITY_POLICY_SHA256 =
  '27bbb6a7fddc97b83b74cc4f3ef13455a3238f1998d10c34016123ba19cf6872';
export const POSTWAR_UTILITY_POLICY_VERSION = 'POSTWAR_UTILITIES_20261028_V1';
type Kind = 'BASIC_EDUCATION' | 'HOSPITAL';
type Utility = 'WATER' | 'POWER';
type Rational = { n: bigint; d: bigint };
export interface UtilityRational {
  readonly numerator: string;
  readonly denominator: string;
}
export interface PostwarUtilitySourceReference {
  readonly path: string;
  readonly pointer: string;
  readonly sha256: string;
}
export interface PostwarUtilityBlocker {
  readonly code: string;
  readonly objectId: string;
  readonly detail: string;
}
export interface PostwarUtilityAccount {
  readonly accountRef: string;
  readonly utility: Utility;
  readonly unit: 'm3' | 'MWh';
  readonly countryId: string;
  readonly locationId: string | null;
  readonly physicalObjectId: string;
  readonly basinRef: string | null;
  readonly ownerId: string;
  readonly beneficiaryId: string;
  readonly sourceAvailable: UtilityRational;
  readonly availableAmount: string;
  readonly sourceReferences: readonly PostwarUtilitySourceReference[];
  readonly authority:
    | 'GENERATED_GOV_RAW_WATER_RIGHT_FROM_UNALLOCATED_LOCAL_SURPLUS'
    | 'GENERATED_OP_TO_GOV_FINITE_STORAGE_PURCHASE_OPTION';
  readonly validity: Readonly<{
    fromSimulationTicks: '0';
    untilSimulationTicks: '86400000';
  }>;
  readonly actualDelivered: '0';
  readonly blockers: readonly PostwarUtilityBlocker[];
  readonly basis: Readonly<
    Record<string, string | UtilityRational | readonly string[]>
  >;
}
export interface PostwarUtilityRequest {
  readonly requestId: string;
  readonly countryId: string;
  readonly locationId: string;
  readonly serviceAssetId: string;
  readonly kind: Kind;
  readonly utility: Utility;
  readonly count: string;
}
export interface PostwarUtilityGrant extends PostwarUtilityRequest {
  readonly accountRef: string;
  readonly ownerId: string;
  readonly beneficiaryId: string;
  readonly recipeAmount: string;
  readonly recipeUnit:
    'm3/student-day' | 'm3/case' | 'MWh/student-day' | 'MWh/case';
  readonly potentialCount: string;
  readonly reservedPhysicalAmount: string;
  readonly actualOperationalCount: string;
  readonly availabilityClassification: 'GENERATED_POLICY_NOT_OBSERVED_NETWORK_OR_WATER_QUALITY';
  /** First-day capacity cost ceiling, not an accrued/paid bill or a second cash reservation. */
  readonly operatingCostGcu: string;
  readonly operatingPurposeId: string;
  readonly operatingFundingBasis: 'EXISTING_SOCIAL_NON_PAYROLL_OPERATING_ALLOCATION_NO_EXTRA_GRANT';
  readonly actualDelivered: '0';
  readonly blockers: readonly PostwarUtilityBlocker[];
}
export interface PostwarUtilityAvailability {
  readonly countryId: string;
  readonly locationId: string;
  readonly powerConnectionBps: string;
  readonly waterTreatmentBps: string;
  readonly qualityCompliantShareBps: string;
  readonly classification: 'GENERATED_POLICY_NOT_OBSERVED_NETWORK_OR_WATER_QUALITY';
  readonly sourceReferences: readonly PostwarUtilitySourceReference[];
  readonly basis: Readonly<{
    settlementAccess: string;
    droughtExposure: string;
    floodExposure: string;
    stormExposure: string;
    stockBufferDays: string;
  }>;
}
export interface PostwarUtilityInputs {
  readonly schemaVersion: 'postwar-utility-inputs-v1';
  readonly worldId: string;
  readonly seedId: string;
  readonly openingGregorianTimestamp: string;
  readonly calendar: Readonly<{ month: string; daysInMonth: string }>;
  readonly policyVersion: typeof POSTWAR_UTILITY_POLICY_VERSION;
  readonly policySHA256: string;
  readonly sourceChecksumsSha256: string;
  readonly sourceFingerprint: string;
  readonly physicalManifestHash: string;
  readonly waterManifestHash: string;
  readonly accounts: readonly PostwarUtilityAccount[];
  readonly requests: readonly PostwarUtilityRequest[];
  readonly initialAvailability: readonly PostwarUtilityAvailability[];
  readonly preservedWaterConflicts: readonly Readonly<{
    countryId: string;
    locationId: string;
    field: string;
    detail: string;
  }>[];
  readonly actualWaterDelivered: '0';
  readonly actualPowerDelivered: '0';
  readonly paymentsCreated: false;
  readonly sourceAdmitted: false;
}
export interface PostwarUtilityAllocation {
  readonly schemaVersion: 'postwar-utility-allocation-v1';
  readonly sourceFingerprint: string;
  readonly fingerprint: string;
  readonly grants: readonly PostwarUtilityGrant[];
  readonly accounts: readonly Readonly<{
    accountRef: string;
    utility: Utility;
    unit: 'm3' | 'MWh';
    availableAmount: string;
    reservedAmount: string;
    remainingAmount: string;
    sourceEnergyReservedMWh: UtilityRational | null;
    sourceEnergyUnreservedMWh: UtilityRational | null;
  }>[];
  readonly regions: readonly Readonly<{
    countryId: string;
    locationId: string;
    potentialEducationWaterStudentDays: string;
    potentialEducationPowerStudentDays: string;
    potentialWaterEpisodes: string;
    potentialPowerEpisodes: string;
    operationalWaterEpisodes: string;
    operationalPowerEpisodes: string;
    operationalEducationWaterStudentDays: string;
    operationalEducationPowerStudentDays: string;
  }>[];
  readonly actualDelivered: '0';
  readonly paymentsCreated: false;
}
const prepared = new WeakSet<object>(),
  plans = new WeakSet<object>();
const socialByInput = new WeakMap<object, PostwarSocialServiceGenesis>();
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const hash = (value: unknown) => sha(canonicalSerialize(value));
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const SCALE = 1_000_000n;
const zero: Rational = { n: 0n, d: 1n };
function invalid(reason: string): never {
  throw Error(`POSTWAR_UTILITIES: ${reason}`);
}
function decimal(value: unknown): Rational {
  if (
    typeof value !== 'string' ||
    !/^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(value) ||
    value.replace('.', '').length > 120
  )
    invalid('Exact nonnegative source quantity required');
  const [whole, fraction = ''] = value.split('.');
  return { n: BigInt(whole! + fraction), d: 10n ** BigInt(fraction.length) };
}
function whole(value: string): bigint {
  if (!/^(?:0|[1-9]\d*)$/u.test(value)) invalid('Whole service count required');
  return BigInt(value);
}
const add = (a: Rational, b: Rational): Rational => ({
  n: a.n * b.d + b.n * a.d,
  d: a.d * b.d,
});
const sub = (a: Rational, b: Rational): Rational => ({
  n: a.n * b.d - b.n * a.d,
  d: a.d * b.d,
});
const mul = (a: Rational, b: Rational): Rational => ({
  n: a.n * b.n,
  d: a.d * b.d,
});
const min = (a: Rational, b: Rational) => (a.n * b.d < b.n * a.d ? a : b);
const positive = (a: Rational) => (a.n < 0n ? zero : a);
function gcd(a: bigint, b: bigint): bigint {
  while (b) [a, b] = [b, a % b];
  return a;
}
function rational(a: Rational): UtilityRational {
  const g = gcd(a.n, a.d);
  return { numerator: (a.n / g).toString(), denominator: (a.d / g).toString() };
}
const fromRational = (a: UtilityRational): Rational => ({
  n: BigInt(a.numerator),
  d: BigInt(a.denominator),
});
const micros = (a: Rational) => {
  if (a.n < 0n) invalid('Negative utility availability');
  return (a.n * SCALE) / a.d;
};
function amount(a: bigint): string {
  const whole = a / SCALE,
    fraction = (a % SCALE).toString().padStart(6, '0').replace(/0+$/u, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
const recipes = {
  BASIC_EDUCATION: { WATER: '0.025', POWER: '0.002' },
  HOSPITAL: { WATER: '0.2', POWER: '0.02' },
} as const;
export function consumePostwarUtilityInputs(
  value: PostwarUtilityInputs,
): PostwarUtilityInputs {
  if (!prepared.has(value)) invalid('Issued source utility inputs required');
  return value;
}
export function consumePostwarUtilityAllocation(
  value: PostwarUtilityAllocation,
): PostwarUtilityAllocation {
  if (!plans.has(value)) invalid('Issued global utility allocation required');
  return value;
}

export function createPostwarUtilityInputs(input: {
  readonly sourceBytes: OfficialOpeningSourceBytes;
  readonly ownerDecisionBytes: string;
  readonly adoption: OfficialLabourSocialOpeningAdoption;
  readonly social: PostwarSocialServiceGenesis;
  readonly worldId: string;
  readonly seedId: string;
  readonly openingGregorianTimestamp: string;
  readonly policyBytes: string;
}): PostwarUtilityInputs {
  consumeLabourSocialOpeningAdoption(input.adoption);
  const social = consumePostwarSocialServiceGenesis(input.social);
  if (
    social.worldId !== input.worldId ||
    social.seedId !== input.seedId ||
    social.sourceChecksumsSha256 !== input.adoption.sourceChecksumsSha256
  )
    invalid('Mixed world/seed/source scope');
  if (sha(input.policyBytes) !== POSTWAR_UTILITY_POLICY_SHA256)
    invalid('Pinned generated utility policy required');
  if (
    !/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/u.test(input.openingGregorianTimestamp)
  )
    invalid('Explicit midnight Gregorian opening anchor required');
  const calendar = createGregorianWaterCalendarBinding({
    sourceRef: `sha256:${POSTWAR_UTILITY_POLICY_SHA256}`,
    anchorSimulationTimestamp: SimTime.fromTicks('0'),
    anchorGregorianTimestamp: input.openingGregorianTimestamp,
  });
  const period = gregorianWaterPeriod(calendar, SimTime.fromTicks('0'));
  const physical = buildOfficialPhysicalOpeningAdoption({
    sourceBytes: input.sourceBytes,
    ownerDecisionBytes: input.ownerDecisionBytes,
  });
  const water = buildOfficialWaterOpeningAdoption({
    sourceBytes: input.sourceBytes,
    ownerDecisionBytes: input.ownerDecisionBytes,
  });
  const mapping = JSON.parse(input.sourceBytes.mappingBytes) as {
    mappings: {
      regions: readonly {
        normalizedRegionId: string;
        sourceRegionId: string;
        coreCountryId: string;
        sourceCountryId: string;
      }[];
    };
    records: {
      seasonalWater: readonly {
        normalizedRegionId: string;
        source: Record<string, unknown>;
      }[];
    };
  };
  const seasonal = mapping.records.seasonalWater;
  const accounts: PostwarUtilityAccount[] = [];
  const gov = (countryId: string) => {
    const rows = input.adoption.employers.filter(
      (row) => row.countryId === countryId && row.role === 'GOV',
    );
    if (rows.length !== 1)
      invalid('Unique existing public beneficiary required');
    return rows[0]!.employerId;
  };
  const reference = (
    dataset: string,
    pointer: string,
  ): PostwarUtilitySourceReference => {
    const row = water.sourceBindings.find((entry) =>
      entry.path.endsWith(`/data/${dataset}.json`),
    );
    if (row) return { ...row, pointer };
    const path = `data/${dataset}.json`,
      bytes = input.sourceBytes.datasets[path];
    if (bytes === undefined)
      invalid('Verified utility dataset provenance missing');
    // Both genuine opening constructors above inspected every selected byte.
    return {
      path: `artifacts/world-balanced-candidate-v1/${path}`,
      sha256: sha(bytes),
      pointer,
    };
  };
  const parse = JSON.parse as (
    bytes: string,
    reviver: (
      key: string,
      value: unknown,
      context: { source?: string },
    ) => unknown,
  ) => unknown;
  const rows = (name: string) =>
    parse(
      input.sourceBytes.datasets[`data/${name}.json`]!,
      (_key, value, context) =>
        typeof value === 'number' ? context.source : value,
    ) as Record<string, unknown>[];
  const countries = rows('countries'),
    sourceRegions = rows('regions');
  const boundedRatio = (value: unknown) => {
    const result = decimal(value);
    if (result.n > result.d)
      invalid('Source access/hazard ratio outside unit range');
    return result;
  };
  const weighted = (value: Rational, weight: bigint) =>
    (value.n * weight) / value.d;
  const clamp = (value: bigint, low: bigint, high: bigint) =>
    value < low ? low : value > high ? high : value;
  const initialAvailability: PostwarUtilityAvailability[] = social.regions.map(
    (region) => {
      const bindings = mapping.mappings.regions.filter(
        (entry) =>
          entry.normalizedRegionId === region.locationId &&
          entry.coreCountryId === region.countryId,
      );
      if (bindings.length !== 1)
        invalid('Explicit source/Core utility region binding required');
      const binding = bindings[0]!,
        regionIndex = sourceRegions.findIndex(
          (entry) =>
            entry.id === binding.sourceRegionId &&
            entry.countryId === binding.sourceCountryId,
        ),
        countryIndex = countries.findIndex(
          (entry) => entry.id === binding.sourceCountryId,
        );
      const raw = sourceRegions[regionIndex],
        country = countries[countryIndex];
      if (
        !raw ||
        !country ||
        raw.natural === null ||
        typeof raw.natural !== 'object'
      )
        invalid('Selected natural/access/stock-buffer utility inputs required');
      const natural = raw.natural as Record<string, unknown>,
        access = boundedRatio(raw.settlementAccess),
        drought = boundedRatio(natural.droughtExposure),
        flood = boundedRatio(natural.floodExposure),
        storm = boundedRatio(natural.stormExposure);
      const hazard = [drought, flood, storm].reduce(
        (largest, value) =>
          value.n * largest.d > largest.n * value.d ? value : largest,
        zero,
      );
      const buffer = decimal(country.stockBufferDays),
        capped = min(buffer, decimal('90')),
        bufferRatio = { n: capped.n, d: capped.d * 90n };
      return {
        countryId: region.countryId,
        locationId: region.locationId,
        powerConnectionBps: clamp(
          2500n +
            weighted(access, 3500n) +
            weighted(bufferRatio, 1500n) -
            weighted(hazard, 1500n),
          2000n,
          8000n,
        ).toString(),
        waterTreatmentBps: clamp(
          2500n +
            weighted(access, 3500n) +
            weighted(bufferRatio, 1000n) -
            weighted(hazard, 1500n),
          1500n,
          7500n,
        ).toString(),
        qualityCompliantShareBps: clamp(
          6000n +
            weighted(access, 2000n) -
            weighted(drought, 1500n) -
            weighted(flood, 1500n),
          3500n,
          9000n,
        ).toString(),
        classification:
          'GENERATED_POLICY_NOT_OBSERVED_NETWORK_OR_WATER_QUALITY',
        sourceReferences: [
          reference('regions', `/${regionIndex}/settlementAccess`),
          reference('regions', `/${regionIndex}/natural`),
          reference('countries', `/${countryIndex}/stockBufferDays`),
          {
            path: POSTWAR_UTILITY_POLICY_PATH,
            pointer: '/generatedInitialAvailability',
            sha256: POSTWAR_UTILITY_POLICY_SHA256,
          },
        ],
        basis: {
          settlementAccess: String(raw.settlementAccess),
          droughtExposure: String(natural.droughtExposure),
          floodExposure: String(natural.floodExposure),
          stormExposure: String(natural.stormExposure),
          stockBufferDays: String(country.stockBufferDays),
        },
      };
    },
  );
  for (const row of water.allocations) {
    const seasons = seasonal.filter(
      (entry) => entry.normalizedRegionId === row.regionRef,
    );
    const basin = water.basins.find((entry) => entry.basinRef === row.basinRef);
    if (seasons.length !== 1 || !basin)
      invalid('Unique local seasonal runoff and basin required');
    const months = seasons[0]!.source.monthlyRunoffM3Proposal;
    if (!Array.isArray(months) || months.length !== 12)
      invalid('Twelve exact local monthly runoff values required');
    const monthly = decimal(months[Number(period.month) - 1]);
    const reserve = decimal(basin.ecologicalReserveShare);
    if (reserve.n > reserve.d)
      invalid('Ecological reserve exceeds basin water');
    const afterEcology = mul(monthly, sub({ n: 1n, d: 1n }, reserve));
    const daily = {
      n: afterEcology.n,
      d: afterEcology.d * BigInt(period.daysInMonth),
    };
    const originalRights = row.rights.reduce(
      (sum, right) => add(sum, decimal(right.quotaPerDay.amount)),
      zero,
    );
    const declared = decimal(row.source.allocatedM3Day);
    const existing =
      originalRights.n * declared.d > declared.n * originalRights.d
        ? originalRights
        : declared;
    const surplus = positive(
      min(
        min(
          sub(daily, existing),
          sub(decimal(row.source.availableM3Day), existing),
        ),
        decimal(row.source.remainingM3Day),
      ),
    );
    const available = amount(micros(surplus));
    const accountRef = `PW_WATER_${hash([input.worldId, input.seedId, row.regionRef, period.year, period.month, period.gregorianTimestamp]).toUpperCase()}`;
    const blockers: PostwarUtilityBlocker[] = [
      {
        code: 'GENERATED_T0_TREATMENT_CAPACITY_NOT_ACTUAL_WATER_DELIVERY',
        objectId: row.regionRef,
        detail:
          'Finite treatment and quality shares are new scenario policy, not observed raw-source water quality. Abstraction, treatment, delivery and their operating payments have not occurred.',
      },
    ];
    if (micros(surplus) === 0n)
      blockers.push({
        code: 'NO_UNALLOCATED_LOCAL_WATER_AFTER_ECOLOGY_AND_EXISTING_QUOTAS',
        objectId: row.regionRef,
        detail:
          'Original household/agriculture/industry quotas stay intact; no new public amount can be claimed from them.',
      });
    accounts.push({
      accountRef,
      utility: 'WATER',
      unit: 'm3',
      countryId: row.countryRef,
      locationId: row.regionRef,
      physicalObjectId: `PUBLIC_RAW_WATER_RIGHT_${row.regionRef}`,
      basinRef: row.basinRef,
      ownerId: gov(row.countryRef),
      beneficiaryId: gov(row.countryRef),
      sourceAvailable: rational(surplus),
      availableAmount: available,
      sourceReferences: [
        row.sourceBinding,
        reference(
          'seasonal-water',
          `/${seasonal.indexOf(seasons[0]!)}/monthlyRunoffM3Proposal/${Number(period.month) - 1}`,
        ),
        {
          path: POSTWAR_UTILITY_POLICY_PATH,
          pointer: '/water',
          sha256: POSTWAR_UTILITY_POLICY_SHA256,
        },
      ],
      authority: 'GENERATED_GOV_RAW_WATER_RIGHT_FROM_UNALLOCATED_LOCAL_SURPLUS',
      validity: { fromSimulationTicks: '0', untilSimulationTicks: '86400000' },
      actualDelivered: '0',
      blockers,
      basis: {
        monthlyRunoffM3: rational(monthly),
        ecologicalReserveShare: basin.ecologicalReserveShare,
        daysInGregorianMonth: period.daysInMonth,
        monthlyAfterEcologyM3: rational(afterEcology),
        originalQuotaPerDayM3: rational(existing),
        sourceRemainingM3Day: String(row.source.remainingM3Day),
        originalRightRefs: row.rights.map((right) => right.rightRef),
        deliveryStatus:
          'GENERATED_LIMITED_LOCAL_TREATMENT_AVAILABLE_ACTUAL_DELIVERY_ZERO',
      },
    });
  }
  // Local positive headroom is additionally capped by the whole shared basin.
  // A deficit in another source region must not disappear through max(0,...).
  for (const basin of water.basins) {
    const members = accounts.filter(
      (account) => account.basinRef === basin.basinRef,
    );
    if (members.length !== basin.sourceRegionRefs.length)
      invalid('Incomplete shared basin denominator');
    const sum = (field: string) =>
      members.reduce(
        (total, account) =>
          add(total, fromRational(account.basis[field] as UtilityRational)),
        zero,
      );
    const monthlyAfterEcology = sum('monthlyAfterEcologyM3');
    const existing = sum('originalQuotaPerDayM3');
    const basinHeadroom = positive(
      sub(
        {
          n: monthlyAfterEcology.n,
          d: monthlyAfterEcology.d * BigInt(period.daysInMonth),
        },
        existing,
      ),
    );
    const localSum = members.reduce(
      (total, account) => add(total, fromRational(account.sourceAvailable)),
      zero,
    );
    const budget = min(basinHeadroom, localSum);
    for (const account of members) {
      const local = fromRational(account.sourceAvailable);
      const apportioned =
        localSum.n === 0n
          ? zero
          : {
              n: local.n * budget.n * localSum.d,
              d: local.d * budget.d * localSum.n,
            };
      const blockers = [...account.blockers];
      if (basinHeadroom.n === 0n)
        blockers.push({
          code: 'BASIN_ORIGINAL_QUOTAS_EXHAUST_POST_ECOLOGY_RUNOFF',
          objectId: basin.basinRef,
          detail:
            'No additional public right is available from this shared basin; original rights are preserved and their conflicts remain visible.',
        });
      accounts[accounts.indexOf(account)] = {
        ...account,
        sourceAvailable: rational(apportioned),
        availableAmount: amount(micros(apportioned)),
        blockers,
        basis: {
          ...account.basis,
          localSourceHeadroomM3: rational(local),
          basinMonthlyAfterEcologyM3: rational(monthlyAfterEcology),
          basinOriginalQuotaPerDayM3: rational(existing),
          basinUnallocatedPerDayM3: rational(basinHeadroom),
        },
      };
    }
  }
  for (const row of physical.power) {
    const facility = physical.facilities.find(
      (entry) => entry.id === row.storageFacilityId,
    );
    const grid = physical.facilities.find(
      (entry) => entry.id === row.gridFacilityId,
    );
    if (
      !row.openingStorage ||
      !facility ||
      !grid ||
      facility.status !== 'ADOPTED_BUILT' ||
      grid.status !== 'ADOPTED_BUILT' ||
      !facility.titleHolderId
    )
      invalid(
        `SOURCE_BLOCKED:${row.countryId}:matching adopted storage/grid and owner required`,
      );
    const stored = decimal(row.openingStorage.stateOfCharge.amount);
    const share = mul(stored, decimal('0.1'));
    const efficiency = decimal('0.85');
    const loss = decimal(row.source.lossFraction);
    if (loss.n >= loss.d)
      invalid('Source route loss leaves no valid efficiency');
    const route = sub({ n: 1n, d: 1n }, loss);
    const rateLimit = mul(decimal(row.source.storageDischargeMW), decimal('6'));
    const gridLimit = mul(decimal(grid.source.capacity), decimal('6'));
    const recipientPotential = mul(
      min(min(mul(share, efficiency), rateLimit), gridLimit),
      route,
    );
    accounts.push({
      accountRef: `PW_ENERGY_${hash([input.worldId, input.seedId, facility.id, POSTWAR_UTILITY_POLICY_SHA256]).toUpperCase()}`,
      utility: 'POWER',
      unit: 'MWh',
      countryId: row.countryId,
      locationId: null,
      physicalObjectId: facility.id,
      basinRef: null,
      ownerId: facility.titleHolderId,
      beneficiaryId: gov(row.countryId),
      sourceAvailable: rational(recipientPotential),
      availableAmount: amount(micros(recipientPotential)),
      sourceReferences: [
        row.binding,
        facility.binding,
        grid.binding,
        {
          path: POSTWAR_UTILITY_POLICY_PATH,
          pointer: '/power',
          sha256: POSTWAR_UTILITY_POLICY_SHA256,
        },
      ],
      authority: 'GENERATED_OP_TO_GOV_FINITE_STORAGE_PURCHASE_OPTION',
      validity: { fromSimulationTicks: '0', untilSimulationTicks: '86400000' },
      actualDelivered: '0',
      blockers: [
        {
          code: 'STORAGE_DISCHARGE_ROUTE_AND_PAYMENT_NOT_EXECUTED',
          objectId: facility.id,
          detail:
            'The OP retains title. A new bounded local public branch is available under generated scenario policy; this does not rewrite the source candidate grid status, discharge stored energy, or record a payment.',
        },
      ],
      basis: {
        energyCapacityMWh: row.openingStorage.energyCapacity.amount,
        initialStoredEnergyMWh: row.openingStorage.stateOfCharge.amount,
        publicOptionSourceEnergyMWh: rational(share),
        scenarioDischargeEfficiency: '0.85',
        sourceStorageEfficiencyUnassigned: String(row.source.storageEfficiency),
        purchaseCondition:
          'PAYMENT_AND_AUTHORIZED_DISCHARGE_BEFORE_ANY_DELIVERY',
        sourceLossFraction: String(row.source.lossFraction),
        sourceDischargeMW: String(row.source.storageDischargeMW),
        maximumDischargeHours: '6',
        routeEfficiency: rational(mul(efficiency, route)),
        sourceGridFacility: grid.id,
        sourceGenerationStatus: String(row.source.status),
        generatedLocalBranchStatus:
          'GENERATED_LIMITED_T0_PUBLIC_BRANCH_AVAILABLE',
        generatedOrChargedEnergyMWh: '0',
      },
    });
  }
  if (
    accounts.length !== 192 ||
    new Set(accounts.map((row) => row.accountRef)).size !== 192
  )
    invalid('Exact unique 122 water / 70 storage account denominator required');
  const requests: PostwarUtilityRequest[] = [];
  for (const region of social.regions) {
    for (const kind of ['BASIC_EDUCATION', 'HOSPITAL'] as const) {
      const alias = input.adoption.capacities.filter(
        (entry) =>
          entry.core.countryId === region.countryId &&
          entry.core.locationId === region.locationId &&
          entry.core.kind ===
            (kind === 'HOSPITAL' ? 'HEALTHCARE' : 'EDUCATION'),
      );
      if (alias.length !== 1)
        invalid('Unique adopted social service asset required');
      const count =
        kind === 'HOSPITAL'
          ? region.healthcare.newDemand
          : region.studentCohorts
              .reduce(
                (sum, cohort) => sum + whole(cohort.desiredEnrollment),
                0n,
              )
              .toString();
      for (const utility of ['WATER', 'POWER'] as const)
        requests.push({
          requestId: `PW_UTILITY_${hash([input.worldId, input.seedId, alias[0]!.core.assetId, utility, kind]).toUpperCase()}`,
          countryId: region.countryId,
          locationId: region.locationId,
          serviceAssetId: alias[0]!.core.assetId,
          kind,
          utility,
          count,
        });
    }
  }
  const body: Omit<PostwarUtilityInputs, 'sourceFingerprint'> = {
    schemaVersion: 'postwar-utility-inputs-v1' as const,
    worldId: input.worldId,
    seedId: input.seedId,
    openingGregorianTimestamp: input.openingGregorianTimestamp,
    calendar: { month: period.month, daysInMonth: period.daysInMonth },
    policyVersion: POSTWAR_UTILITY_POLICY_VERSION,
    policySHA256: POSTWAR_UTILITY_POLICY_SHA256,
    sourceChecksumsSha256: input.adoption.sourceChecksumsSha256,
    physicalManifestHash: physical.manifestHash,
    waterManifestHash: water.manifestHash,
    accounts,
    requests,
    initialAvailability,
    preservedWaterConflicts: water.allocations.flatMap((row) =>
      row.gaps
        .filter((gap) => gap.code === 'SOURCE_CONFLICT')
        .map((gap) => ({
          countryId: row.countryRef,
          locationId: row.regionRef,
          field: gap.field,
          detail: gap.detail,
        })),
    ),
    actualWaterDelivered: '0' as const,
    actualPowerDelivered: '0' as const,
    paymentsCreated: false as const,
    sourceAdmitted: false as const,
  };
  const result: PostwarUtilityInputs = freeze({
    ...body,
    sourceFingerprint: `sha256:${hash(body)}`,
  });
  prepared.add(result);
  socialByInput.set(result, social);
  return result;
}

/** Exactly one whole-world plan. The caller adopts a single fingerprint; repeat
 * calculation is deterministic and never debits a separate utility ledger. */
export function allocatePostwarUtilityInputs(
  inputs: PostwarUtilityInputs,
  requests: readonly PostwarUtilityRequest[] = inputs.requests,
): PostwarUtilityAllocation {
  consumePostwarUtilityInputs(inputs);
  const social = socialByInput.get(inputs)!;
  const seen = new Set<string>();
  for (const request of requests) {
    if (seen.has(request.requestId)) invalid('Duplicate utility purpose');
    seen.add(request.requestId);
    whole(request.count);
    const original = inputs.requests.find(
      (entry) => entry.requestId === request.requestId,
    );
    if (
      !original ||
      original.countryId !== request.countryId ||
      original.locationId !== request.locationId ||
      original.serviceAssetId !== request.serviceAssetId ||
      original.kind !== request.kind ||
      original.utility !== request.utility ||
      whole(request.count) > whole(original.count)
    )
      invalid(
        'Foreign scope/asset/recipe or demand exceeds prepared source bound',
      );
  }
  const grants: PostwarUtilityGrant[] = [];
  const accounts = inputs.accounts.map((account) => {
    const rows = requests
      .filter(
        (request) =>
          request.utility === account.utility &&
          request.countryId === account.countryId &&
          (account.locationId === null ||
            request.locationId === account.locationId),
      )
      .map((request) => ({
        request,
        per: micros(decimal(recipes[request.kind][request.utility])),
      }));
    const available = micros(decimal(account.availableAmount));
    const demand = rows.reduce(
      (sum, row) => sum + whole(row.request.count) * row.per,
      0n,
    );
    const envelope = available < demand ? available : demand;
    let reserved = 0n;
    for (const row of rows.sort((a, b) =>
      compare(a.request.requestId, b.request.requestId),
    )) {
      const proportional = demand
        ? (envelope * whole(row.request.count) * row.per) / demand
        : 0n;
      const count = proportional / row.per,
        used = count * row.per;
      const profile = inputs.initialAvailability.find(
        (entry) =>
          entry.countryId === row.request.countryId &&
          entry.locationId === row.request.locationId,
      )!;
      if (!profile) invalid('Missing generated initial utility profile');
      const operational =
        row.request.utility === 'POWER'
          ? (count * BigInt(profile.powerConnectionBps)) / 10000n
          : (count *
              BigInt(profile.waterTreatmentBps) *
              BigInt(profile.qualityCompliantShareBps)) /
            100000000n;
      const tariff = decimal(row.request.utility === 'POWER' ? '80' : '0.02');
      const costNumerator = operational * row.per * tariff.n;
      if (costNumerator % tariff.d !== 0n)
        invalid('Generated utility cost exceeds exact micro-GCU carrier');
      reserved += used;
      grants.push({
        ...row.request,
        accountRef: account.accountRef,
        ownerId: account.ownerId,
        beneficiaryId: account.beneficiaryId,
        recipeAmount: recipes[row.request.kind][row.request.utility],
        recipeUnit:
          `${account.unit}/${row.request.kind === 'HOSPITAL' ? 'case' : 'student-day'}` as PostwarUtilityGrant['recipeUnit'],
        potentialCount: count.toString(),
        reservedPhysicalAmount: amount(used),
        actualOperationalCount: operational.toString(),
        availabilityClassification:
          'GENERATED_POLICY_NOT_OBSERVED_NETWORK_OR_WATER_QUALITY',
        operatingCostGcu: amount(costNumerator / tariff.d),
        operatingPurposeId: postwarSocialServiceFundingPurpose(
          social,
          row.request.locationId,
          row.request.kind === 'HOSPITAL' ? 'HOSPITAL' : 'EDUCATION',
        ),
        operatingFundingBasis:
          'EXISTING_SOCIAL_NON_PAYROLL_OPERATING_ALLOCATION_NO_EXTRA_GRANT',
        actualDelivered: '0',
        blockers: account.blockers,
      });
    }
    if (reserved > available) invalid('Global utility account oversupply');
    let sourceEnergyReservedMWh: UtilityRational | null = null,
      sourceEnergyUnreservedMWh: UtilityRational | null = null;
    if (account.utility === 'POWER') {
      const route = fromRational(
        account.basis.routeEfficiency as UtilityRational,
      );
      const debit = { n: reserved * route.d, d: SCALE * route.n };
      const original = decimal(account.basis.initialStoredEnergyMWh);
      const remaining = sub(original, debit);
      if (
        remaining.n < 0n ||
        debit.n *
          fromRational(
            account.basis.publicOptionSourceEnergyMWh as UtilityRational,
          ).d >
          fromRational(
            account.basis.publicOptionSourceEnergyMWh as UtilityRational,
          ).n *
            debit.d
      )
        invalid('Source stored energy over-reservation');
      sourceEnergyReservedMWh = rational(debit);
      sourceEnergyUnreservedMWh = rational(remaining);
    }
    return {
      accountRef: account.accountRef,
      utility: account.utility,
      unit: account.unit,
      availableAmount: account.availableAmount,
      reservedAmount: amount(reserved),
      remainingAmount: amount(available - reserved),
      sourceEnergyReservedMWh,
      sourceEnergyUnreservedMWh,
    };
  });
  grants.sort((a, b) => compare(a.requestId, b.requestId));
  const regions = social.regions.map((region) => {
    const count = (
      kind: Kind,
      utility: Utility,
      field: 'potentialCount' | 'actualOperationalCount' = 'potentialCount',
    ) =>
      grants.find(
        (grant) =>
          grant.locationId === region.locationId &&
          grant.kind === kind &&
          grant.utility === utility,
      )?.[field] ?? '0';
    return {
      countryId: region.countryId,
      locationId: region.locationId,
      potentialEducationWaterStudentDays: count('BASIC_EDUCATION', 'WATER'),
      potentialEducationPowerStudentDays: count('BASIC_EDUCATION', 'POWER'),
      potentialWaterEpisodes: count('HOSPITAL', 'WATER'),
      potentialPowerEpisodes: count('HOSPITAL', 'POWER'),
      operationalWaterEpisodes: count(
        'HOSPITAL',
        'WATER',
        'actualOperationalCount',
      ),
      operationalPowerEpisodes: count(
        'HOSPITAL',
        'POWER',
        'actualOperationalCount',
      ),
      operationalEducationWaterStudentDays: count(
        'BASIC_EDUCATION',
        'WATER',
        'actualOperationalCount',
      ),
      operationalEducationPowerStudentDays: count(
        'BASIC_EDUCATION',
        'POWER',
        'actualOperationalCount',
      ),
    };
  });
  const body = {
    schemaVersion: 'postwar-utility-allocation-v1' as const,
    sourceFingerprint: inputs.sourceFingerprint,
    grants,
    accounts,
    regions,
    actualDelivered: '0' as const,
    paymentsCreated: false as const,
  };
  const plan: PostwarUtilityAllocation = freeze({
    ...body,
    fingerprint: `sha256:${hash(body)}`,
  });
  plans.add(plan);
  return plan;
}
