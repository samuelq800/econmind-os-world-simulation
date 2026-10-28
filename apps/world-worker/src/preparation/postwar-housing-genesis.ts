/** Deterministic t0 housing carrier. No leases, debt, money, history, I/O or Clock writes. */
import { createHash } from 'node:crypto';
import {
  canonicalSerialize,
  calculateHousingMetrics,
  canonicalDecimal,
  parseWorldDecimal,
  type ExactMoney,
} from '@econmind/core';
import { buildOfficialPhysicalOpeningAdoption } from './official-physical-opening-adoption.js';
import type { OfficialOpeningSourceBytes } from './official-opening-decision-reconciliation.js';
import {
  isPostwarWagePolicy,
  type PostwarWagePolicy,
} from './postwar-wage-policy.js';

export const POSTWAR_HOUSING_POLICY_SHA256 =
  '9adc7d0d94940e7fd7ff453d4b6c0c947f756f31a4a140e189eabd96510c72b7';
const SCALE = 10000n;
const MONEY_SCALE = 1000000n;
type Row = Readonly<Record<string, unknown>>;
const prepared = new WeakSet<object>();
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
function invalid(message: string): never {
  throw new Error(`POSTWAR_HOUSING_INVALID: ${message}`);
}
function record(v: unknown): Row {
  if (v === null || typeof v !== 'object' || Array.isArray(v))
    invalid('source record required');
  return v as Row;
}
function text(v: unknown): string {
  if (typeof v !== 'string' || v.trim() !== v || !v)
    invalid('source text required');
  return v;
}
function whole(v: unknown): bigint {
  const s = text(v).replace(/\.0+$/u, '');
  if (!/^(0|[1-9]\d*)$/u.test(s)) invalid('exact nonnegative integer required');
  return BigInt(s);
}
function bps(v: unknown): bigint {
  const s = text(v);
  if (!/^(0|1)(\.\d+)?$/u.test(s)) invalid('fraction required');
  const [integer, fraction = ''] = s.split('.');
  const value =
    BigInt(integer!) * SCALE + BigInt((fraction + '0000').slice(0, 4));
  if (value > SCALE) invalid('fraction exceeds one');
  return value;
}
function sourceRows(bytes: string | undefined): readonly Row[] {
  if (bytes === undefined) invalid('missing source dataset');
  const parse = JSON.parse as (
    s: string,
    reviver: (k: string, v: unknown, c: { source?: string }) => unknown,
  ) => unknown;
  const value = parse(bytes, (_k, v, c) => {
    if (typeof v !== 'number') return v;
    if (typeof c.source !== 'string') invalid('lossless Node JSON required');
    return c.source;
  });
  if (!Array.isArray(value)) invalid('source array required');
  return value.map(record);
}
const min = (a: bigint, b: bigint) => (a < b ? a : b);
const max = (a: bigint, b: bigint) => (a > b ? a : b);
function deepFreeze<T>(v: T): T {
  if (v !== null && typeof v === 'object') {
    Object.values(v).forEach(deepFreeze);
    Object.freeze(v);
  }
  return v;
}
export interface PostwarHousingCohort {
  readonly id: string;
  readonly tenure:
    'OWNER_OCCUPIER' | 'PRIVATE_RENTER' | 'PUBLIC_RENTER' | 'DISPLACED';
  readonly households: string;
  readonly population: string;
  readonly householdEntityId: string;
}
export interface PostwarHousingRentObligation {
  readonly id: string;
  readonly cohortId: string;
  readonly households: string;
  readonly payerEntityId: string;
  readonly beneficiaryEntityId: string;
  readonly perHousehold: { readonly amount: string; readonly currency: string };
  readonly annualTotal: { readonly amount: string; readonly currency: string };
  readonly period: 'SIM_YEAR';
  readonly effectiveFrom: 'AFTER_T0';
  readonly accruedAtT0: '0';
  readonly paidAtT0: '0';
  readonly outstandingDebtAtT0: '0';
  readonly contractCreated: false;
  readonly rightsClassification: 'GENESIS_RIGHTS_NOT_EXECUTED_LEASE';
  readonly rightsVersion: 'POSTWAR_GENESIS_HOUSING_RIGHTS_V1';
  readonly rightsPolicySha256: string;
  readonly landlordGroupRef: string;
  readonly tenantGroupRef: string;
  readonly settlementPrerequisite: 'CORE_DISTINCT_BENEFICIAL_GROUP_ACCOUNT_SETTLEMENT_CONTRACT';
  readonly settlement:
    | 'REQUIRES_CORE_BENEFICIAL_GROUP_SETTLEMENT'
    | 'REQUIRES_AUTHORIZED_PROSPECTIVE_PUBLIC_RENT_COMMAND';
  readonly rationalPrice: {
    readonly numerator: string;
    readonly denominator: string;
    readonly remainderNumeratorAfterSixDecimalFloor: string;
  };
}
export interface PostwarHousingRegion {
  readonly id: string;
  readonly countryId: string;
  readonly locationId: string;
  readonly sourceFacilityId: string;
  readonly source: {
    readonly population: string;
    readonly households: string;
    readonly totalUnits: string;
    readonly countryPreviousPopulation: string;
    readonly countryPopulation: string;
    readonly countryStockBufferDays: string;
    readonly urbanShareBps: string;
    readonly settlementAccessBps: string;
    readonly floodExposureBps: string;
    readonly stormExposureBps: string;
    readonly references: readonly {
      readonly path: string;
      readonly pointer: string;
      readonly sha256: string;
    }[];
  };
  readonly generated: {
    readonly classification: 'GENERATED_POLICY';
    readonly damageBps: string;
    readonly accessVacancyBps: string;
    readonly renterShareBps: string;
    readonly publicStockShareBps: string;
    readonly policySha256: string;
  };
  readonly stock: {
    readonly totalUnits: string;
    readonly habitableUnits: string;
    readonly uninhabitableUnits: string;
    readonly occupiedUnits: string;
    readonly vacantHabitableUnits: string;
  };
  readonly titles: readonly {
    readonly id: string;
    readonly units: string;
    readonly habitableUnits: string;
    readonly occupiedUnits: string;
    readonly titleHolderId: string;
    readonly riskBearerId: string;
    readonly operatorId: string;
    readonly beneficialOwnerGroupRef: string;
    readonly basis: 'RETAINED_ADOPTED_TITLE' | 'GENERATED_GENESIS_TITLE';
  }[];
  readonly cohorts: readonly PostwarHousingCohort[];
  readonly displacedReasons: {
    readonly preExistingStockDeficit: string;
    readonly postwarUninhabitableStock: string;
    readonly accessFriction: string;
  };
  readonly demand: {
    readonly householdDemand: {
      readonly amount: string;
      readonly unit: 'housing_unit';
    };
    readonly temporaryProjectDemand: {
      readonly amount: '0';
      readonly unit: 'housing_unit';
    };
    readonly migrationDemand: {
      readonly amount: '0';
      readonly unit: 'housing_unit';
    };
  };
  readonly rentObligations: readonly PostwarHousingRentObligation[];
  readonly monetary: {
    readonly currency: string;
    readonly period: 'SIM_YEAR';
    readonly fxVersion: string;
    readonly localCurrencyPerGcu: string;
    readonly meanAnnualWageLC: {
      readonly numerator: string;
      readonly denominator: string;
    };
    readonly sourceReferences: readonly {
      readonly path: string;
      readonly pointer: string;
      readonly sha256: string;
    }[];
  };
}
export interface PostwarHousingGenesis {
  readonly schemaVersion: 'postwar-housing-genesis.v1';
  readonly classification: 'GENERATED_POLICY_BOUND_TO_PINNED_SOURCE';
  readonly policySha256: string;
  readonly wagePolicySha256: string;
  readonly sourceFingerprint: string;
  readonly fingerprint: string;
  readonly regions: readonly PostwarHousingRegion[];
  readonly totals: Readonly<
    Record<
      | 'population'
      | 'households'
      | 'totalUnits'
      | 'habitableUnits'
      | 'uninhabitableUnits'
      | 'occupiedUnits'
      | 'vacantHabitableUnits'
      | 'ownerOccupierHouseholds'
      | 'renterHouseholds'
      | 'displacedHouseholds',
      string
    >
  >;
  readonly generatedLeaseCount: '0';
  readonly t0FinancialPostings: readonly [];
  readonly t0HistoricalRentPayments: readonly [];
}
export function isPostwarHousingGenesis(
  v: unknown,
): v is PostwarHousingGenesis {
  return typeof v === 'object' && v !== null && prepared.has(v);
}

/** Sources are pinned by the existing adopter; policy and wages must be their real server-owned carriers. */
export function buildPostwarHousingGenesis(input: {
  readonly sourceBytes: OfficialOpeningSourceBytes;
  readonly ownerDecisionBytes: string;
  readonly policyBytes: string;
  readonly wagePolicy: PostwarWagePolicy;
}): PostwarHousingGenesis {
  if (hash(input.policyBytes) !== POSTWAR_HOUSING_POLICY_SHA256)
    invalid('versioned policy bytes differ');
  if (!isPostwarWagePolicy(input.wagePolicy)) invalid('untrusted wage policy');
  const physical = buildOfficialPhysicalOpeningAdoption(input);
  if (
    input.wagePolicy.sourceChecksumsSha256 !==
    hash(input.sourceBytes.checksumsBytes)
  )
    invalid('mixed wage/source package');
  const policy = JSON.parse(input.policyBytes) as {
    damage: {
      baseBps: number;
      stockBufferReferenceDays: number;
      stockBufferDeficitWeightBps: number;
      hazardWeightBps: number;
      accessDeficitWeightBps: number;
      maximumBps: number;
    };
    accessVacancy: { baseBps: number; accessDeficitWeightBps: number };
    tenure: {
      renterBaseBps: number;
      renterUrbanWeightBps: number;
      publicStockBaseBps: number;
      publicStockUrbanWeightBps: number;
    };
    rent: { privateMeanWageBps: number; publicMeanWageBps: number };
  };
  const dataset = (name: string) =>
    sourceRows(input.sourceBytes.datasets[`data/${name}.json`]);
  const countryRows = dataset('countries'),
    regionRows = dataset('regions'),
    serviceRows = dataset('population-services');
  const countries = new Map(countryRows.map((r, i) => [text(r.id), { r, i }]));
  const wages = new Map(
    input.wagePolicy.countries.map((w) => [w.countryId, w]),
  );
  // The branded wage carrier intentionally uses a null-prototype lookup map.
  // Canonicalize its inert transport DTO; all monetary/count values remain exact strings.
  const wagePolicySha256 = hash(
    canonicalSerialize(JSON.parse(JSON.stringify(input.wagePolicy))),
  );
  const regionSources = new Map(
    regionRows.map((r, i) => [text(r.id), { r, i }]),
  );
  const facilities = physical.facilities.filter(
    (f) => f.status === 'ADOPTED_BUILT' && f.source.projectId === 'PROJECT-36',
  );
  if (
    facilities.length !== 122 ||
    countryRows.length !== 70 ||
    regionRows.length !== 122 ||
    serviceRows.length !== 122
  )
    invalid('selected 70-country/122-region scope differs');
  const reference = (name: string, index: number) => ({
    path: `artifacts/world-balanced-candidate-v1/data/${name}.json`,
    pointer: `/${index}`,
    sha256: hash(input.sourceBytes.datasets[`data/${name}.json`]!),
  });
  const seen = new Set<string>();
  const regions: PostwarHousingRegion[] = [];
  for (const [serviceIndex, service] of serviceRows.entries()) {
    const sourceRegionId = text(service.regionId),
      sourceCountryId = text(service.countryId);
    const regionEntry = regionSources.get(sourceRegionId),
      countryEntry = countries.get(sourceCountryId);
    if (!regionEntry || !countryEntry || seen.has(sourceRegionId))
      invalid('orphan/duplicate housing source');
    seen.add(sourceRegionId);
    const r = regionEntry.r,
      country = countryEntry.r,
      initial = record(r.initial),
      natural = record(r.natural);
    if (r.countryId !== sourceCountryId) invalid('region country differs');
    const aliases = facilities.filter(
      (f) =>
        f.source.regionId === sourceRegionId &&
        f.source.countryId === sourceCountryId,
    );
    if (aliases.length !== 1) invalid('housing facility alias must be unique');
    const facility = aliases[0]!,
      countryId = facility.countryId,
      locationId = facility.regionId;
    const wage = wages.get(countryId);
    if (!wage) invalid('missing actual wage/FX binding');
    const population = whole(service.population),
      households = whole(service.households),
      units = whole(service.housingUnits);
    if (
      population !== whole(initial.population) ||
      households !== whole(initial.households) ||
      units !== whole(initial.housingUnits) ||
      units !== whole(facility.source.capacity)
    )
      invalid('housing/population source aliases differ');
    if (households === 0n || units === 0n || population < households)
      invalid('household/population basis invalid');
    const currentPop = whole(country.population),
      previousPop = whole(country.previousPopulation);
    if (previousPop === 0n) invalid('country postwar population basis differs');
    // previousPopulation is an earlier candidate distribution, never casualty evidence.
    const bufferDays = text(country.stockBufferDays);
    if (!/^(0|[1-9]\d*)(\.\d+)?$/u.test(bufferDays))
      invalid('exact stock-buffer days required');
    const [bufferWhole, bufferFraction = ''] = bufferDays.split('.');
    const bufferDenominator = 10n ** BigInt(bufferFraction.length);
    const bufferNumerator = BigInt(bufferWhole! + bufferFraction);
    const bufferReference = BigInt(policy.damage.stockBufferReferenceDays);
    const bufferShortfallBps =
      (max(bufferReference * bufferDenominator - bufferNumerator, 0n) * SCALE) /
      (bufferReference * bufferDenominator);
    const urbanBps = bps(record(r.humanGeography).scenarioUrbanShare),
      accessBps = bps(r.settlementAccess);
    const floodBps = bps(natural.floodExposure),
      stormBps = bps(natural.stormExposure);
    const damageBps = min(
      BigInt(policy.damage.maximumBps),
      BigInt(policy.damage.baseBps) +
        (bufferShortfallBps *
          BigInt(policy.damage.stockBufferDeficitWeightBps)) /
          SCALE +
        (max(floodBps, stormBps) * BigInt(policy.damage.hazardWeightBps)) /
          SCALE +
        ((SCALE - accessBps) * BigInt(policy.damage.accessDeficitWeightBps)) /
          SCALE,
    );
    const vacancyBps =
      BigInt(policy.accessVacancy.baseBps) +
      ((SCALE - accessBps) *
        BigInt(policy.accessVacancy.accessDeficitWeightBps)) /
        SCALE;
    const renterBps =
      BigInt(policy.tenure.renterBaseBps) +
      (urbanBps * BigInt(policy.tenure.renterUrbanWeightBps)) / SCALE;
    const publicBps =
      BigInt(policy.tenure.publicStockBaseBps) +
      (urbanBps * BigInt(policy.tenure.publicStockUrbanWeightBps)) / SCALE;
    const uninhabitable = (units * damageBps) / SCALE,
      habitable = units - uninhabitable;
    const occupied = min(
        households,
        habitable - (habitable * vacancyBps) / SCALE,
      ),
      vacant = habitable - occupied;
    const renters = (occupied * renterBps) / SCALE,
      ownerOccupiers = occupied - renters,
      displaced = households - occupied;
    const suffix = countryId.slice(-2),
      hh = `ENTITY_HOUSEHOLDS_${suffix}`,
      gov = `ENTITY_GOVERNMENT_${suffix}`;
    const retained = facility.titleHolderId !== null;
    // A verified previously adopted title always wins. Never turn a raw GOV proposal into one.
    if (retained && (!facility.riskBearerId || !facility.operatorId))
      invalid('existing title lacks risk/operator originals');
    const publicUnits = retained
      ? facility.titleHolderId === gov
        ? units
        : 0n
      : (units * publicBps) / SCALE;
    const publicHabitable = (habitable * publicUnits) / units;
    const publicRenters = min(renters, publicHabitable),
      privateRenters = renters - publicRenters;
    if (retained)
      invalid(
        'retained portfolio requires explicit tenure records before generating cohorts',
      );
    const id = `POSTWAR_HOUSING_${locationId}`;
    const counts = [ownerOccupiers, privateRenters, publicRenters, displaced];
    // Largest remainder avoids silently assigning all rounding people to displaced households.
    const people = counts.map((count) => (population * count) / households);
    const remainders = counts
      .map((count, index) => ({
        index,
        remainder: (population * count) % households,
      }))
      .sort((a, b) =>
        a.remainder === b.remainder
          ? a.index - b.index
          : a.remainder > b.remainder
            ? -1
            : 1,
      );
    let remaining = population - people.reduce((a, b) => a + b, 0n);
    for (const item of remainders)
      if (remaining > 0n) {
        people[item.index] = people[item.index]! + 1n;
        remaining--;
      }
    const tenures = [
      'OWNER_OCCUPIER',
      'PRIVATE_RENTER',
      'PUBLIC_RENTER',
      'DISPLACED',
    ] as const;
    const cohorts = counts.map((count, i): PostwarHousingCohort => ({
      id: `${id}_${tenures[i]}`,
      tenure: tenures[i]!,
      households: count.toString(),
      population: people[i]!.toString(),
      householdEntityId: hh,
    }));
    const titles: PostwarHousingRegion['titles'] = retained
      ? [
          {
            id: `${id}_RETAINED_TITLE`,
            units: units.toString(),
            habitableUnits: habitable.toString(),
            occupiedUnits: occupied.toString(),
            titleHolderId: facility.titleHolderId!,
            riskBearerId: facility.riskBearerId!,
            operatorId: facility.operatorId!,
            beneficialOwnerGroupRef: facility.titleHolderId!,
            basis: 'RETAINED_ADOPTED_TITLE',
          },
        ]
      : [
          {
            id: `${id}_PRIVATE_TITLE`,
            units: (units - publicUnits).toString(),
            habitableUnits: (habitable - publicHabitable).toString(),
            occupiedUnits: (occupied - publicRenters).toString(),
            titleHolderId: hh,
            riskBearerId: hh,
            operatorId: hh,
            beneficialOwnerGroupRef: cohorts[0]!.id,
            basis: 'GENERATED_GENESIS_TITLE',
          },
          {
            id: `${id}_PUBLIC_TITLE`,
            units: publicUnits.toString(),
            habitableUnits: publicHabitable.toString(),
            occupiedUnits: publicRenters.toString(),
            titleHolderId: gov,
            riskBearerId: gov,
            operatorId: gov,
            beneficialOwnerGroupRef: gov,
            basis: 'GENERATED_GENESIS_TITLE',
          },
        ];
    const obligations: PostwarHousingRentObligation[] = [];
    for (const [index, burden, beneficiary, settlement] of [
      [
        1,
        policy.rent.privateMeanWageBps,
        hh,
        'REQUIRES_CORE_BENEFICIAL_GROUP_SETTLEMENT',
      ],
      [
        2,
        policy.rent.publicMeanWageBps,
        gov,
        'REQUIRES_AUTHORIZED_PROSPECTIVE_PUBLIC_RENT_COMMAND',
      ],
    ] as const) {
      const count = counts[index]!;
      if (count === 0n) continue;
      const mean = wage.meanAnnualWageLC,
        numerator = whole(mean.numerator) * BigInt(burden),
        denominator = whole(mean.denominator) * SCALE;
      if (numerator === 0n || denominator === 0n)
        invalid('positive annual wage required');
      const micro = (numerator * MONEY_SCALE) / denominator;
      if (micro === 0n) invalid('rent rounds to zero');
      const money = (amount: bigint) => {
        const raw = `${amount / MONEY_SCALE}.${(amount % MONEY_SCALE).toString().padStart(6, '0')}`;
        return raw.replace(/\.?0+$/u, '');
      };
      obligations.push({
        id: `${cohorts[index]!.id}_RENT_V1`,
        cohortId: cohorts[index]!.id,
        households: count.toString(),
        payerEntityId: hh,
        beneficiaryEntityId: beneficiary,
        perHousehold: { amount: money(micro), currency: wage.currency },
        annualTotal: { amount: money(micro * count), currency: wage.currency },
        period: 'SIM_YEAR',
        effectiveFrom: 'AFTER_T0',
        accruedAtT0: '0',
        paidAtT0: '0',
        outstandingDebtAtT0: '0',
        contractCreated: false,
        rightsClassification: 'GENESIS_RIGHTS_NOT_EXECUTED_LEASE',
        rightsVersion: 'POSTWAR_GENESIS_HOUSING_RIGHTS_V1',
        rightsPolicySha256: POSTWAR_HOUSING_POLICY_SHA256,
        // Beneficial groups partition existing HOUSEHOLDS; no new legal party or population.
        landlordGroupRef: index === 1 ? cohorts[0]!.id : gov,
        tenantGroupRef: cohorts[index]!.id,
        settlementPrerequisite:
          'CORE_DISTINCT_BENEFICIAL_GROUP_ACCOUNT_SETTLEMENT_CONTRACT',
        settlement,
        rationalPrice: {
          numerator: numerator.toString(),
          denominator: denominator.toString(),
          remainderNumeratorAfterSixDecimalFloor: (
            (numerator * MONEY_SCALE) %
            denominator
          ).toString(),
        },
      });
    }
    const baselineGap = max(households - units, 0n),
      disasterGap = max(households - habitable, 0n) - baselineGap;
    const region: PostwarHousingRegion = {
      id,
      countryId,
      locationId,
      sourceFacilityId: facility.id,
      source: {
        population: population.toString(),
        households: households.toString(),
        totalUnits: units.toString(),
        countryPreviousPopulation: previousPop.toString(),
        countryPopulation: currentPop.toString(),
        countryStockBufferDays: bufferDays,
        urbanShareBps: urbanBps.toString(),
        settlementAccessBps: accessBps.toString(),
        floodExposureBps: floodBps.toString(),
        stormExposureBps: stormBps.toString(),
        references: [
          reference('population-services', serviceIndex),
          reference('regions', regionEntry.i),
          reference('countries', countryEntry.i),
          {
            path: facility.binding.path,
            pointer: facility.binding.pointer,
            sha256: facility.binding.sha256,
          },
        ],
      },
      generated: {
        classification: 'GENERATED_POLICY',
        damageBps: damageBps.toString(),
        accessVacancyBps: vacancyBps.toString(),
        renterShareBps: renterBps.toString(),
        publicStockShareBps: publicBps.toString(),
        policySha256: POSTWAR_HOUSING_POLICY_SHA256,
      },
      stock: {
        totalUnits: units.toString(),
        habitableUnits: habitable.toString(),
        uninhabitableUnits: uninhabitable.toString(),
        occupiedUnits: occupied.toString(),
        vacantHabitableUnits: vacant.toString(),
      },
      titles,
      cohorts,
      displacedReasons: {
        preExistingStockDeficit: baselineGap.toString(),
        postwarUninhabitableStock: disasterGap.toString(),
        accessFriction: (displaced - baselineGap - disasterGap).toString(),
      },
      demand: {
        householdDemand: {
          amount: households.toString(),
          unit: 'housing_unit',
        },
        temporaryProjectDemand: { amount: '0', unit: 'housing_unit' },
        migrationDemand: { amount: '0', unit: 'housing_unit' },
      },
      rentObligations: obligations,
      monetary: {
        currency: wage.currency,
        period: wage.period,
        fxVersion: wage.fxVersion,
        localCurrencyPerGcu: wage.localCurrencyPerGcu,
        meanAnnualWageLC: wage.meanAnnualWageLC,
        sourceReferences: wage.sourceReferences,
      },
    };
    if (
      titles.some(
        (t) =>
          whole(t.occupiedUnits) > whole(t.habitableUnits) ||
          whole(t.habitableUnits) > whole(t.units),
      )
    )
      invalid('title capacity allocation exceeds original stock');
    regions.push(region);
  }
  regions.sort((a, b) => a.locationId.localeCompare(b.locationId));
  const total = (read: (r: PostwarHousingRegion) => string) =>
    regions.reduce((n, r) => n + whole(read(r)), 0n).toString();
  const countTenure = (
    r: PostwarHousingRegion,
    tenure: PostwarHousingCohort['tenure'],
  ) => r.cohorts.find((c) => c.tenure === tenure)!.households;
  const carrier = {
    schemaVersion: 'postwar-housing-genesis.v1' as const,
    classification: 'GENERATED_POLICY_BOUND_TO_PINNED_SOURCE' as const,
    policySha256: POSTWAR_HOUSING_POLICY_SHA256,
    wagePolicySha256,
    sourceFingerprint: physical.sourceFingerprint,
    regions,
    totals: {
      population: total((r) => r.source.population),
      households: total((r) => r.source.households),
      totalUnits: total((r) => r.stock.totalUnits),
      habitableUnits: total((r) => r.stock.habitableUnits),
      uninhabitableUnits: total((r) => r.stock.uninhabitableUnits),
      occupiedUnits: total((r) => r.stock.occupiedUnits),
      vacantHabitableUnits: total((r) => r.stock.vacantHabitableUnits),
      ownerOccupierHouseholds: total((r) => countTenure(r, 'OWNER_OCCUPIER')),
      renterHouseholds: total((r) =>
        (
          whole(countTenure(r, 'PRIVATE_RENTER')) +
          whole(countTenure(r, 'PUBLIC_RENTER'))
        ).toString(),
      ),
      displacedHouseholds: total((r) => countTenure(r, 'DISPLACED')),
    },
    generatedLeaseCount: '0' as const,
    t0FinancialPostings: [] as const,
    t0HistoricalRentPayments: [] as const,
  };
  const result = deepFreeze({
    ...carrier,
    fingerprint: hash(canonicalSerialize(carrier)),
  });
  prepared.add(result);
  return result;
}

/** Existing Core housing metrics consume this carrier without treating displaced people as new migration demand. */
export function consumePostwarHousingMetrics(
  genesis: PostwarHousingGenesis,
  locationId: string,
  annualRegionDisposableIncome: ExactMoney,
) {
  if (!isPostwarHousingGenesis(genesis)) invalid('untrusted housing genesis');
  const r = genesis.regions.find((region) => region.locationId === locationId);
  if (!r) invalid('unknown region');
  const cost = canonicalDecimal(
    r.rentObligations.reduce(
      (n, rent) => n.plus(parseWorldDecimal(rent.annualTotal.amount)),
      parseWorldDecimal('0'),
    ),
  );
  return calculateHousingMetrics({
    householdDemand: r.demand.householdDemand,
    habitableUnits: { amount: r.stock.habitableUnits, unit: 'housing_unit' },
    vacantHabitableUnits: {
      amount: r.stock.vacantHabitableUnits,
      unit: 'housing_unit',
    },
    housingCost: { amount: cost, currency: r.monetary.currency },
    disposableIncome: annualRegionDisposableIncome,
  });
}
