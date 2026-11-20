import { createHash } from 'node:crypto';
import {
  allocateOpeningPeopleLargestRemainder,
  parseWorldDecimal,
  SIMULATION_DAYS_PER_YEAR,
} from '@econmind/core';
import {
  consumeLabourSocialOpeningAdoption,
  type OfficialLabourSocialOpeningAdoption,
} from './official-labour-social-opening-adoption.js';
import {
  isVerifiedOfficialOpeningDecisionSource,
  type VerifiedOfficialOpeningSource,
} from './official-opening-decision-reconciliation.js';
import {
  consumePostwarSocialServiceGenesis,
  type PostwarSocialServiceGenesis,
} from './postwar-social-service-genesis.js';
import {
  isPostwarWagePolicy,
  type PostwarWagePolicy,
} from './postwar-wage-policy.js';
import {
  consumePostwarLabourGenesis,
  type PostwarLabourDemand,
  type PostwarLabourGenesisPreparation,
} from './postwar-labour-genesis.js';

const POLICY_VERSION = 'POSTWAR_PUBLIC_SAFETY_V1';
const FUNCTIONS = {
  POLICE_OFFICER: ['MEDIUM', 'HIGH'],
  INVESTIGATIVE: ['MEDIUM', 'HIGH'],
  PUBLIC_ORDER: ['MEDIUM'],
  CIVIL_EMERGENCY: ['MEDIUM', 'HIGH'],
  COMMUNITY_SAFETY: ['MEDIUM'],
  ADMIN_SUPPORT: ['LOW', 'MEDIUM'],
} as const;
type SafetyFunction = keyof typeof FUNCTIONS;
type Skill = 'LOW' | 'MEDIUM' | 'HIGH';
type Row = Readonly<Record<string, unknown>>;
interface Policy {
  readonly policyVersion: typeof POLICY_VERSION;
  readonly initialWindowSimDays: string;
  readonly policePer100000People: string;
  readonly maxOtherDomesticServicesShareBps: string;
  readonly postwarPressureBps: string;
  readonly stockBufferStressPressureBps: string;
  readonly stockBufferReferenceDays: string;
  readonly unemploymentPressureBps: string;
  readonly urbanPressureBps: string;
  readonly hazardPressureBps: string;
  readonly accessDeficitPressureBps: string;
  readonly seedJitterBps: string;
  readonly applicationsPerAdministratorPerWindow: string;
  readonly caseHandlingPerOfficerPerWindow: string;
  readonly functions: readonly {
    readonly function: SafetyFunction;
    readonly skill: Skill;
    readonly shareBps: string;
    readonly footCapacityBps: string;
  }[];
  readonly incidents: readonly {
    readonly category: string;
    readonly per100000People: string;
    readonly severity: string;
    readonly requiredFunction: SafetyFunction;
    readonly requiredStaffPerCase: string;
  }[];
  readonly programmes: readonly {
    readonly type: string;
    readonly populationBasis: 'UNEMPLOYED' | 'POPULATION' | 'NON_WORKING_AGE';
    readonly eligibleBps: string;
    readonly applicationBps: string;
    readonly annualWageReplacementBps: string;
    readonly durationSimDays: string;
  }[];
}
export interface PostwarSafetySourceReference {
  readonly namespace: 'DATASET' | 'GENERATED_POLICY';
  readonly path: string;
  readonly pointer: string;
  readonly sha256: string;
}
export interface PostwarSafetyPopulationLineage {
  readonly countryId: string;
  readonly locationId: string;
  readonly sourceCountryId: string;
  readonly sourceRegionId: string;
  readonly population: string;
  readonly workingAge: string;
  readonly regionUnemployed: string;
  readonly unemploymentBinding:
    'PREPARATION_MODELLED_PARTITION' | 'SHARED_LABOUR_FINALIZED_PARTITION';
  readonly sourcePopulationPointer: string;
  readonly relationship: 'SUBSET_OF_EXISTING_POPULATION_NOT_ADDITIONAL_PEOPLE';
}
export interface PostwarIncidentCohort {
  readonly cohortId: string;
  readonly countryId: string;
  readonly locationId: string;
  readonly category: string;
  readonly count: string;
  readonly ordinalStart: '0';
  readonly openedAtSimDay: '0';
  readonly severity: string;
  readonly requiredFunction: SafetyFunction;
  readonly requiredStaffPerCase: string;
  readonly status: 'OPEN';
  readonly resolvedCases: '0';
  readonly responseTimeSimDays: null;
  readonly historicalIncidentEventsGenerated: false;
  readonly provenance: 'GENERATED_POLICY';
  readonly populationLineage: PostwarSafetyPopulationLineage;
  readonly sourceReferences: readonly PostwarSafetySourceReference[];
}
export interface PostwarWelfareProgramme {
  readonly programmeId: string;
  readonly cohortId: string;
  readonly countryId: string;
  readonly locationId: string;
  readonly programmeType: string;
  readonly eligibilityRule: {
    readonly populationBasis: 'UNEMPLOYED' | 'POPULATION' | 'NON_WORKING_AGE';
    readonly generatedEligibilityBps: string;
    readonly pressureBps: string;
    readonly interpretation: 'MODELLED_GENESIS_ELIGIBILITY_NOT_OBSERVED_PERSONAL_HISTORY';
  };
  readonly eligible: string;
  readonly applied: string;
  readonly verified: '0';
  readonly approved: '0';
  readonly scheduled: '0';
  readonly paid: '0';
  readonly paymentEventsGenerated: false;
  readonly benefitAmount: null;
  readonly benefitCurrency: null;
  readonly paymentFrequencySimDays: string;
  readonly durationSimDays: string;
  readonly annualWageReplacementBps: string;
  readonly status: 'APPLICATION_BACKLOG_REQUIRES_STAFF_AND_FUNDING';
  readonly populationAccounting: 'PROGRAMME_ELIGIBILITY_MAY_OVERLAP_NOT_UNIQUE_PEOPLE';
  readonly provenance: 'GENERATED_POLICY';
  readonly populationLineage: PostwarSafetyPopulationLineage;
  readonly sourceReferences: readonly PostwarSafetySourceReference[];
}
export interface PostwarPublicSafetyGenesis {
  readonly schemaVersion: 'postwar-public-safety-genesis-v1';
  readonly status: 'GENERATED_DEMANDS_AND_QUEUES_NOT_ADMITTED';
  readonly worldId: string;
  readonly seed: string;
  readonly policyVersion: typeof POLICY_VERSION;
  readonly policySHA256: string;
  readonly fingerprint: string;
  readonly sourcePackageId: string;
  readonly sourceChecksumsSHA256: string;
  readonly demands: readonly PostwarLabourDemand[];
  readonly positions: readonly {
    readonly positionId: string;
    readonly countryId: string;
    readonly locationId: string;
    readonly function: SafetyFunction | 'WELFARE_ADMINISTRATION';
    readonly footCapacityBps: string;
  }[];
  readonly regions: readonly {
    readonly lineage: PostwarSafetyPopulationLineage;
    readonly pressureBps: string;
    readonly stockBufferStressBps: string;
    readonly sourceReferences: readonly PostwarSafetySourceReference[];
  }[];
  readonly incidents: readonly PostwarIncidentCohort[];
  readonly programmes: readonly PostwarWelfareProgramme[];
  readonly summary: Readonly<{
    countries: 70;
    regions: 122;
    requiredPolice: string;
    requiredWelfareAdministrators: string;
    openCases: string;
    programmeEligibilityOccurrences: string;
    applications: string;
    paid: '0';
  }>;
  readonly generatedPaymentOrHiringEvents: false;
  readonly runtimeAdmitted: false;
}
interface PreparationState {
  source: VerifiedOfficialOpeningSource;
  adoption: OfficialLabourSocialOpeningAdoption;
  policy: Policy;
  sourceCountryByCore: ReadonlyMap<string, string>;
}
const issued = new WeakMap<PostwarPublicSafetyGenesis, PreparationState>();
function invalid(message: string): never {
  throw new Error(`Postwar public safety: ${message}`);
}
function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
function row(value: unknown): Row {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    invalid('Record required');
  return value as Row;
}
function rows(value: unknown): readonly Row[] {
  if (!Array.isArray(value)) invalid('Rows required');
  return value.map(row);
}
function text(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 512 ||
    value.trim() !== value
  )
    invalid('Canonical text required');
  return value;
}
function whole(value: unknown): bigint {
  const valueText = text(value);
  if (!/^(?:0|[1-9][0-9]*)$/u.test(valueText)) invalid('Whole count required');
  return BigInt(valueText);
}
function decimal(value: unknown) {
  const result = parseWorldDecimal(text(value));
  if (result.isNegative() || !result.isFinite())
    invalid('Non-negative exact decimal required');
  return result;
}
function scaled(value: unknown, scale = 10000n): bigint {
  return BigInt(decimal(value).mul(scale.toString()).floor().toFixed(0));
}
function min(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}
function sum(values: readonly string[]): string {
  return values.reduce((total, value) => total + whole(value), 0n).toString();
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}
function lossless(bytes: string): unknown {
  const parse = JSON.parse as (
    input: string,
    reviver: (
      key: string,
      value: unknown,
      context: { source?: string },
    ) => unknown,
  ) => unknown;
  return parse(bytes, (_key, value, context) => {
    if (typeof value !== 'number') return value;
    if (!context?.source) invalid('Pinned lossless JSON required');
    return context.source;
  });
}
function stable(
  scope: readonly string[],
  kind: string,
  ...parts: readonly string[]
): string {
  return `PW_${kind}_${hash(JSON.stringify([...scope, kind, ...parts])).toUpperCase()}`;
}
function allocate(
  total: bigint,
  demands: readonly { id: string; weight: bigint; capacity: bigint }[],
): ReadonlyMap<string, bigint> {
  const result = allocateOpeningPeopleLargestRemainder({
    total: total.toString(),
    demands: demands.map((item) => ({
      id: item.id,
      weight: item.weight.toString(),
      capacity: item.capacity.toString(),
    })),
  });
  if (result.unmatched !== '0') invalid('Unmatched generated partition');
  return new Map(
    result.assignments.map((item) => [item.id, BigInt(item.count)]),
  );
}
function readPolicy(bytes: string): Policy {
  const raw = row(JSON.parse(bytes));
  if (
    raw.schemaVersion !== 'postwar-public-safety-policy-v1' ||
    raw.policyVersion !== POLICY_VERSION ||
    raw.provenance !== 'GENERATED_POLICY' ||
    raw.ownerInstructionRef !== '2026-10-28T14:27:54Z'
  )
    invalid('Versioned GENERATED_POLICY required');
  if (raw.initialWindowSimDays !== '30')
    invalid('V1 funding and payment window must be 30 simulation days');
  const parameters = [
    'initialWindowSimDays',
    'policePer100000People',
    'maxOtherDomesticServicesShareBps',
    'postwarPressureBps',
    'stockBufferStressPressureBps',
    'stockBufferReferenceDays',
    'unemploymentPressureBps',
    'urbanPressureBps',
    'hazardPressureBps',
    'accessDeficitPressureBps',
    'seedJitterBps',
    'applicationsPerAdministratorPerWindow',
    'caseHandlingPerOfficerPerWindow',
  ];
  for (const key of parameters)
    if (whole(raw[key]) === 0n || whole(raw[key]) > 10000n)
      invalid('Policy parameter out of range');
  const functions = rows(raw.functions);
  if (
    functions.length !== 10 ||
    sum(functions.map((item) => text(item.shareBps))) !== '10000' ||
    new Set(functions.map((item) => `${item.function}/${item.skill}`)).size !==
      10
  )
    invalid('Function shares must partition personnel');
  for (const item of functions) {
    const skills = FUNCTIONS[text(item.function) as SafetyFunction] as
      readonly string[] | undefined;
    if (
      !skills?.includes(text(item.skill)) ||
      whole(item.shareBps) === 0n ||
      whole(item.footCapacityBps) > 10000n
    )
      invalid('Unsupported police function/skill');
  }
  const incidents = rows(raw.incidents);
  if (
    incidents.length !== 6 ||
    new Set(incidents.map((item) => item.category)).size !== 6
  )
    invalid('Six bounded incident categories required');
  for (const item of incidents)
    if (
      !Object.hasOwn(FUNCTIONS, text(item.requiredFunction)) ||
      whole(item.per100000People) === 0n ||
      whole(item.per100000People) > 10000n ||
      whole(item.requiredStaffPerCase) === 0n ||
      whole(item.requiredStaffPerCase) > 100n ||
      !['MEDIUM', 'HIGH'].includes(text(item.severity))
    )
      invalid('Incident policy invalid');
  const programmes = rows(raw.programmes);
  if (
    programmes.length !== 9 ||
    new Set(programmes.map((item) => item.type)).size !== 9
  )
    invalid('Nine welfare programmes required');
  for (const item of programmes) {
    if (
      !['UNEMPLOYED', 'POPULATION', 'NON_WORKING_AGE'].includes(
        text(item.populationBasis),
      )
    )
      invalid('Unknown eligibility population basis');
    for (const key of [
      'eligibleBps',
      'applicationBps',
      'annualWageReplacementBps',
    ])
      if (whole(item[key]) === 0n || whole(item[key]) > 10000n)
        invalid('Welfare ratio invalid');
    if (
      whole(item.durationSimDays) === 0n ||
      whole(item.durationSimDays) > 3650n
    )
      invalid('Welfare duration invalid');
  }
  return raw as unknown as Policy;
}

/** Deterministic authored genesis, deliberately distinct from preserved source
 * facts. Produces no employment, payments, commands, database writes or admission. */
export function createPostwarPublicSafetyGenesis(input: {
  readonly worldId: string;
  readonly seed: string;
  readonly policyBytes: string;
  readonly source: VerifiedOfficialOpeningSource;
  readonly adoption: OfficialLabourSocialOpeningAdoption;
  readonly mappingBytes: string;
  readonly countriesBytes: string;
  readonly regionsBytes: string;
}): PostwarPublicSafetyGenesis {
  if (!isVerifiedOfficialOpeningDecisionSource(input.source))
    invalid('Verified source required');
  consumeLabourSocialOpeningAdoption(input.adoption);
  if (
    input.adoption.sourceChecksumsSha256 !==
      input.source.pins.checksumsSha256 ||
    hash(input.mappingBytes) !== input.source.pins.mappingSha256
  )
    invalid('Source/adoption/mapping mismatch');
  const policy = readPolicy(input.policyBytes),
    policySHA256 = hash(input.policyBytes);
  const worldId = text(input.worldId),
    seed = text(input.seed),
    scope = [worldId, seed, policySHA256, input.source.pins.checksumsSha256];
  const sourceRows = (name: string, bytes: string) => {
    const domain = input.source.domains.find(
      (item) => item.sourcePath === `data/${name}.json`,
    );
    if (
      !domain ||
      hash(bytes) !== domain.sourceSha256 ||
      Buffer.byteLength(bytes, 'utf8') !== domain.sourceBytes
    )
      invalid('Source bytes differ from selected package');
    return { values: rows(lossless(bytes)), sha256: domain.sourceSha256 };
  };
  const countries = sourceRows('countries', input.countriesBytes),
    regionSource = sourceRows('regions', input.regionsBytes);
  const mappings = row(row(lossless(input.mappingBytes)).mappings),
    countryMappings = rows(mappings.countries),
    regionMappings = rows(mappings.regions);
  const byCountry = new Map(
    countries.values.map((item, index) => [text(item.id), { item, index }]),
  );
  const sourceCountryByCore = new Map(
    countryMappings.map((item) => [
      text(item.coreCountryId),
      text(item.sourceCountryId),
    ]),
  );
  const regionMap = new Map(
    regionMappings.map((item) => [text(item.sourceRegionId), item]),
  );
  if (
    countries.values.length !== 70 ||
    regionSource.values.length !== 122 ||
    sourceCountryByCore.size !== 70 ||
    regionMap.size !== 122
  )
    invalid('Selected source grain differs');
  const policyRef: PostwarSafetySourceReference = {
    namespace: 'GENERATED_POLICY',
    path: 'config/postwar-genesis/public-safety.v1.json',
    pointer: '',
    sha256: policySHA256,
  };
  const regionInputs = regionSource.values
    .map((item, index) => {
      const mapping = regionMap.get(text(item.id));
      if (
        !mapping ||
        mapping.sourceCountryId !== item.countryId ||
        sourceCountryByCore.get(text(mapping.coreCountryId)) !== item.countryId
      )
        invalid('Region/country join mismatch');
      const initial = row(item.initial),
        natural = row(item.natural),
        country = byCountry.get(text(item.countryId));
      if (!country) invalid('Unknown source country');
      const countryId = text(mapping.coreCountryId),
        locationId = text(mapping.normalizedRegionId);
      const population = whole(initial.population),
        workingAge = whole(initial.workingAge);
      if (
        workingAge > population ||
        !input.adoption.populationAvailability.some(
          (entry) =>
            entry.countryId === countryId &&
            entry.locationId === locationId &&
            whole(entry.workingAgeAvailable) === workingAge,
        )
      )
        invalid('Population lineage mismatch');
      const employment = input.adoption.employmentTargets.find(
        (entry) => entry.countryId === countryId,
      );
      if (!employment) invalid('Country labour source missing');
      // previousPopulation is a prior candidate revision, never a casualty
      // series. Reconstruction stress uses actual selected inventory buffers.
      const referenceBuffer = decimal(policy.stockBufferReferenceDays);
      const sourceBuffer = decimal(country.item.stockBufferDays);
      const stockBufferStress = sourceBuffer.greaterThanOrEqualTo(
        referenceBuffer,
      )
        ? 0n
        : BigInt(
            referenceBuffer
              .minus(sourceBuffer)
              .mul('10000')
              .div(referenceBuffer)
              .floor()
              .toFixed(0),
          );
      const unemployment =
        (whole(employment.unemployed) * 10000n) / whole(employment.labourForce);
      const urban = scaled(country.item.urbanShare),
        access = scaled(item.settlementAccess);
      const hazard =
        (scaled(natural.droughtExposure) +
          scaled(natural.floodExposure) +
          scaled(natural.stormExposure)) /
        3n;
      if ([urban, access, hazard].some((value) => value > 10000n))
        invalid('Source ratios outside bounds');
      const jitterRange = whole(policy.seedJitterBps);
      const jitter =
        (BigInt(
          `0x${hash(JSON.stringify([...scope, countryId, locationId])).slice(0, 12)}`,
        ) %
          (2n * jitterRange + 1n)) -
        jitterRange;
      const pressure =
        10000n +
        whole(policy.postwarPressureBps) +
        (stockBufferStress * whole(policy.stockBufferStressPressureBps)) /
          10000n +
        (unemployment * whole(policy.unemploymentPressureBps)) / 10000n +
        (urban * whole(policy.urbanPressureBps)) / 10000n +
        (hazard * whole(policy.hazardPressureBps)) / 10000n +
        ((10000n - access) * whole(policy.accessDeficitPressureBps)) / 10000n +
        jitter;
      const references: PostwarSafetySourceReference[] = [
        {
          namespace: 'DATASET',
          path: 'data/regions.json',
          pointer: `/${index}`,
          sha256: regionSource.sha256,
        },
        {
          namespace: 'DATASET',
          path: 'data/countries.json',
          pointer: `/${country.index}/stockBufferDays`,
          sha256: countries.sha256,
        },
        {
          namespace: 'DATASET',
          path: 'data/employment.json',
          pointer: employment.sourcePointer,
          sha256: input.adoption.sourceProvenance.find(
            (entry) => entry.dataset === 'employment',
          )!.sha256,
        },
        policyRef,
      ];
      return {
        countryId,
        locationId,
        sourceCountryId: text(item.countryId),
        sourceRegionId: text(item.id),
        population,
        workingAge,
        pressure,
        stockBufferStress,
        references,
        sourcePopulationPointer: `/${index}/initial/population`,
        employment,
      };
    })
    .sort((a, b) =>
      a.locationId < b.locationId ? -1 : a.locationId > b.locationId ? 1 : 0,
    );
  const regionalUnemployment = new Map<string, bigint>();
  for (const countryId of input.adoption.countryIds) {
    const selected = regionInputs.filter(
      (region) => region.countryId === countryId,
    );
    const country = byCountry.get(sourceCountryByCore.get(countryId)!)!;
    if (
      sum(selected.map((region) => region.population.toString())) !==
      text(country.item.population)
    )
      invalid('Regional population does not conserve country');
    const unemployed = whole(selected[0]!.employment.unemployed);
    for (const [id, count] of allocate(
      unemployed,
      selected.map((region) => ({
        id: region.locationId,
        weight: region.workingAge,
        capacity: region.workingAge,
      })),
    ))
      regionalUnemployment.set(id, count);
  }
  const regions: PostwarPublicSafetyGenesis['regions'][number][] = [],
    incidents: PostwarIncidentCohort[] = [],
    programmes: PostwarWelfareProgramme[] = [];
  const desired: {
    id: string;
    countryId: string;
    locationId: string;
    count: bigint;
    administration: boolean;
  }[] = [];
  for (const region of regionInputs) {
    const unemployed = regionalUnemployment.get(region.locationId)!;
    const lineage: PostwarSafetyPopulationLineage = {
      countryId: region.countryId,
      locationId: region.locationId,
      sourceCountryId: region.sourceCountryId,
      sourceRegionId: region.sourceRegionId,
      population: region.population.toString(),
      workingAge: region.workingAge.toString(),
      regionUnemployed: unemployed.toString(),
      unemploymentBinding: 'PREPARATION_MODELLED_PARTITION',
      sourcePopulationPointer: region.sourcePopulationPointer,
      relationship: 'SUBSET_OF_EXISTING_POPULATION_NOT_ADDITIONAL_PEOPLE',
    };
    regions.push({
      lineage,
      pressureBps: region.pressure.toString(),
      stockBufferStressBps: region.stockBufferStress.toString(),
      sourceReferences: region.references,
    });
    for (const specification of policy.incidents) {
      const count =
        (region.population *
          whole(specification.per100000People) *
          region.pressure) /
        100000n /
        10000n;
      incidents.push({
        cohortId: stable(
          scope,
          'INCIDENT',
          region.locationId,
          specification.category,
        ),
        countryId: region.countryId,
        locationId: region.locationId,
        category: specification.category,
        count: (count > 0n ? count : 1n).toString(),
        ordinalStart: '0',
        openedAtSimDay: '0',
        severity: specification.severity,
        requiredFunction: specification.requiredFunction,
        requiredStaffPerCase: specification.requiredStaffPerCase,
        status: 'OPEN',
        resolvedCases: '0',
        responseTimeSimDays: null,
        historicalIncidentEventsGenerated: false,
        provenance: 'GENERATED_POLICY',
        populationLineage: lineage,
        sourceReferences: region.references,
      });
    }
    let applications = 0n;
    for (const specification of policy.programmes) {
      const population =
        specification.populationBasis === 'UNEMPLOYED'
          ? unemployed
          : specification.populationBasis === 'NON_WORKING_AGE'
            ? region.population - region.workingAge
            : region.population;
      const eligiblePressure =
        specification.populationBasis === 'NON_WORKING_AGE'
          ? 10000n
          : region.pressure;
      const eligible = min(
        population,
        (population * whole(specification.eligibleBps) * eligiblePressure) /
          10000n /
          10000n,
      );
      const applied = (eligible * whole(specification.applicationBps)) / 10000n;
      applications += applied;
      programmes.push({
        programmeId: stable(
          scope,
          'PROGRAMME',
          region.locationId,
          specification.type,
        ),
        cohortId: stable(
          scope,
          'ELIGIBILITY',
          region.locationId,
          specification.type,
        ),
        countryId: region.countryId,
        locationId: region.locationId,
        programmeType: specification.type,
        eligibilityRule: {
          populationBasis: specification.populationBasis,
          generatedEligibilityBps: specification.eligibleBps,
          pressureBps: eligiblePressure.toString(),
          interpretation:
            'MODELLED_GENESIS_ELIGIBILITY_NOT_OBSERVED_PERSONAL_HISTORY',
        },
        eligible: eligible.toString(),
        applied: applied.toString(),
        verified: '0',
        approved: '0',
        scheduled: '0',
        paid: '0',
        paymentEventsGenerated: false,
        benefitAmount: null,
        benefitCurrency: null,
        paymentFrequencySimDays: policy.initialWindowSimDays,
        durationSimDays: specification.durationSimDays,
        annualWageReplacementBps: specification.annualWageReplacementBps,
        status: 'APPLICATION_BACKLOG_REQUIRES_STAFF_AND_FUNDING',
        populationAccounting:
          'PROGRAMME_ELIGIBILITY_MAY_OVERLAP_NOT_UNIQUE_PEOPLE',
        provenance: 'GENERATED_POLICY',
        populationLineage: lineage,
        sourceReferences: region.references,
      });
    }
    desired.push({
      id: `POLICE_${region.locationId}`,
      countryId: region.countryId,
      locationId: region.locationId,
      count:
        (region.population *
          whole(policy.policePer100000People) *
          region.pressure) /
        100000n /
        10000n,
      administration: false,
    });
    const throughput = whole(policy.applicationsPerAdministratorPerWindow);
    desired.push({
      id: `WELFARE_${region.locationId}`,
      countryId: region.countryId,
      locationId: region.locationId,
      count: (applications + throughput - 1n) / throughput,
      administration: true,
    });
  }
  const assigned = new Map<string, bigint>();
  for (const countryId of input.adoption.countryIds) {
    const employment = input.adoption.employmentTargets.find(
      (entry) => entry.countryId === countryId,
    )!;
    const items = desired.filter((item) => item.countryId === countryId);
    const total = items.reduce((value, item) => value + item.count, 0n),
      limit =
        (whole(employment.otherDomesticServices) *
          whole(policy.maxOtherDomesticServicesShareBps)) /
        10000n;
    for (const [id, count] of allocate(
      min(total, limit),
      items.map((item) => ({
        id: item.id,
        weight: item.count,
        capacity: item.count,
      })),
    ))
      assigned.set(id, count);
  }
  const demands: PostwarLabourDemand[] = [],
    positions: PostwarPublicSafetyGenesis['positions'][number][] = [];
  for (const item of desired) {
    const region = regionInputs.find(
      (entry) => entry.locationId === item.locationId,
    )!;
    const employer = input.adoption.employers.find(
      (entry) => entry.countryId === item.countryId && entry.role === 'GOV',
    );
    if (!employer) invalid('Existing GOV employer required');
    const functions = item.administration
      ? [
          {
            function: 'WELFARE_ADMINISTRATION' as const,
            skill: 'MEDIUM' as const,
            shareBps: '10000',
            footCapacityBps: '10000',
          },
        ]
      : policy.functions;
    const count = assigned.get(item.id)!;
    const split = allocate(
      count,
      functions.map((fn) => ({
        id: `${fn.function}_${fn.skill}`,
        weight: whole(fn.shareBps),
        capacity: count,
      })),
    );
    for (const fn of functions) {
      const requiredCount = split.get(`${fn.function}_${fn.skill}`)!.toString();
      const positionId = stable(
        scope,
        'POSITION',
        item.locationId,
        fn.function,
        fn.skill,
      );
      demands.push({
        positionId,
        countryId: item.countryId,
        locationId: item.locationId,
        skill: fn.skill,
        owner: 'PUBLIC_SERVICE',
        classificationId: item.administration
          ? 'PUBLIC_ADMINISTRATION'
          : 'PUBLIC_SAFETY',
        requiredCount,
        sourceWeight: requiredCount,
        employerId: employer.employerId,
        employerRole: 'GOV',
        occupation: 'GENERAL',
        sourceBucket: 'OTHER_DOMESTIC_SERVICES',
        sourceObjectId: region.sourceRegionId,
        policyVersion: POLICY_VERSION,
        provenance: 'GENERATED_POLICY',
      });
      positions.push({
        positionId,
        countryId: item.countryId,
        locationId: item.locationId,
        function: fn.function,
        footCapacityBps: fn.footCapacityBps,
      });
    }
  }
  const output: PostwarPublicSafetyGenesis = freeze({
    schemaVersion: 'postwar-public-safety-genesis-v1',
    status: 'GENERATED_DEMANDS_AND_QUEUES_NOT_ADMITTED',
    worldId,
    seed,
    policyVersion: POLICY_VERSION,
    policySHA256,
    fingerprint: hash(
      JSON.stringify({ scope, demands, incidents, programmes }),
    ),
    sourcePackageId: input.source.pins.packageId,
    sourceChecksumsSHA256: input.source.pins.checksumsSha256,
    demands,
    positions,
    regions,
    incidents,
    programmes,
    summary: {
      countries: 70,
      regions: 122,
      requiredPolice: sum(
        demands
          .filter((item) => item.classificationId === 'PUBLIC_SAFETY')
          .map((item) => item.requiredCount),
      ),
      requiredWelfareAdministrators: sum(
        demands
          .filter((item) => item.classificationId === 'PUBLIC_ADMINISTRATION')
          .map((item) => item.requiredCount),
      ),
      openCases: sum(incidents.map((item) => item.count)),
      programmeEligibilityOccurrences: sum(
        programmes.map((item) => item.eligible),
      ),
      applications: sum(programmes.map((item) => item.applied)),
      paid: '0',
    },
    generatedPaymentOrHiringEvents: false,
    runtimeAdmitted: false,
  });
  issued.set(output, {
    source: input.source,
    adoption: input.adoption,
    policy,
    sourceCountryByCore,
  });
  return output;
}

/** Bounded cohort expansion: retries derive the same case identity; no queue write. */
export function postwarIncidentCaseId(
  genesis: PostwarPublicSafetyGenesis,
  cohortId: string,
  ordinal: string,
): string {
  if (!issued.has(genesis)) invalid('Constructor-owned genesis required');
  const cohort = genesis.incidents.find((item) => item.cohortId === cohortId);
  if (!cohort || whole(ordinal) >= whole(cohort.count))
    invalid('Incident ordinal outside cohort');
  return `PW_CASE_${hash(JSON.stringify([cohortId, ordinal])).toUpperCase()}`;
}

export interface PostwarPublicSafetyFundingInput {
  readonly balances: readonly Readonly<{
    countryId: string;
    payerEntityId: string;
    accountRef: string;
    currency: string;
    availableAmount: string;
    sourceBalanceRef: string;
  }>[];
  readonly allocations: readonly Readonly<{
    purposeId: string;
    fundingRef: string;
    countryId: string;
    payerEntityId: string;
    accountRef: string;
    currency: string;
    amount: string;
    period: 'SIM_DAY' | 'SIM_30_DAYS';
    sourceBalanceRef: string;
  }>[];
}
export interface PostwarFinalizedSafetyPosition {
  readonly positionId: string;
  readonly countryId: string;
  readonly locationId: string;
  readonly function: SafetyFunction | 'WELFARE_ADMINISTRATION';
  readonly requiredCount: string;
  readonly filledCount: string;
  readonly fundedCount: string;
  readonly deployedCount: '0';
  readonly unavailableCount: string;
  readonly availableCount: string;
  readonly vacancies: string;
  readonly wageAmount: string;
  readonly wageCurrency: string;
  readonly wagePeriod: 'SIM_YEAR';
  readonly wageVersion: string;
  readonly payrollPerPersonPerWindow: string;
  readonly payrollPerPersonPerSimDay: string;
  readonly payrollFundingPeriod: 'SIM_DAY' | 'SIM_30_DAYS' | null;
  readonly payrollCoverageSimDays: string;
  readonly payrollFundingRef: string | null;
  readonly personRange: {
    readonly poolId: string;
    readonly startOrdinal: string;
    readonly count: string;
  };
  readonly equipmentStatus: 'NO_EXCLUSIVE_GOV_EQUIPMENT_BOUND_FOOT_ONLY';
  readonly equipmentReady: false;
  readonly potentialCaseEffortPerWindow: string;
  readonly potentialCaseEffortPerSimDay: string;
}
export interface PostwarFinalizedWelfareProgramme extends Omit<
  PostwarWelfareProgramme,
  | 'verified'
  | 'approved'
  | 'scheduled'
  | 'benefitAmount'
  | 'benefitCurrency'
  | 'status'
> {
  readonly verified: string;
  readonly approved: string;
  readonly scheduled: string;
  readonly benefitAmount: string;
  readonly benefitCurrency: string;
  readonly pendingApplications: string;
  readonly scheduledUnpaidRecipients: string;
  readonly delayedRecipients: '0';
  readonly actualPaidCost: '0';
  readonly fundingRef: string | null;
  readonly dueSimDay: string;
  readonly initialObligationId: string | null;
  readonly status:
    'SCHEDULED_UNPAID' | 'AWAITING_FUNDING' | 'AWAITING_ADMINISTRATION';
}
export interface PostwarFinalizedPublicSafetyGenesis {
  readonly schemaVersion: 'postwar-finalized-public-safety-genesis-v1';
  readonly fingerprint: string;
  readonly preparationFingerprint: string;
  readonly worldId: string;
  readonly policyVersion: typeof POLICY_VERSION;
  readonly status: 'CONSTRAINED_GENESIS_NOT_ADMITTED';
  readonly staffing: readonly PostwarFinalizedSafetyPosition[];
  readonly incidents: readonly PostwarIncidentCohort[];
  readonly programmes: readonly PostwarFinalizedWelfareProgramme[];
  readonly deploymentCapacity: readonly {
    readonly countryId: string;
    readonly locationId: string;
    readonly availablePersonnel: string;
    readonly potentialCaseEffortPerWindow: string;
    readonly potentialCaseEffortPerSimDay: string;
    readonly state: 'UNAVAILABLE' | 'LIMITED_FOOT_SERVICE';
    readonly fullEquipmentReady: false;
  }[];
  readonly localFundingReservationsValidated: true;
  readonly crossServiceFundingAuthority: 'EXTERNAL_GLOBAL_ALLOCATOR_REQUIRED';
  readonly moneyCreated: false;
  readonly wagesOrBenefitsPaid: false;
  readonly paymentEventsGenerated: false;
  readonly hiringEventsGenerated: false;
  readonly runtimeAdmitted: false;
}
const finalized = new WeakSet<object>();
const MONEY_QUANTUM = 1000000n;
function moneyMicros(value: string): bigint {
  const matched = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,6}))?$/u.exec(value);
  if (!matched) invalid('Exact money with at most six decimal places required');
  return (
    BigInt(matched[1]!) * MONEY_QUANTUM +
    BigInt((matched[2] ?? '').padEnd(6, '0'))
  );
}
function fromMicros(value: bigint): string {
  const amount = value / MONEY_QUANTUM,
    fraction = (value % MONEY_QUANTUM)
      .toString()
      .padStart(6, '0')
      .replace(/0+$/u, '');
  return fraction ? `${amount}.${fraction}` : amount.toString();
}
/** Uses genuine shared labour allocation and wage policy. Funding inputs belong
 * to the server's global allocator; this module rechecks its own reservations
 * against actual selected GOV funds, and cannot certify other services' spend.
 * All t0 benefits remain unpaid. No OP stock is duplicated as police equipment. */
export function finalizePostwarPublicSafetyGenesis(input: {
  readonly genesis: PostwarPublicSafetyGenesis;
  readonly labour: PostwarLabourGenesisPreparation;
  readonly social: PostwarSocialServiceGenesis;
  readonly wages: PostwarWagePolicy;
  readonly funding: PostwarPublicSafetyFundingInput;
}): PostwarFinalizedPublicSafetyGenesis {
  const privateState = issued.get(input.genesis);
  if (!privateState) invalid('Constructor-owned genesis required');
  const labour = consumePostwarLabourGenesis(input.labour);
  const social = consumePostwarSocialServiceGenesis(input.social);
  if (
    social.worldId !== input.genesis.worldId ||
    social.seedId !== input.genesis.seed ||
    social.sourceChecksumsSha256 !== input.genesis.sourceChecksumsSHA256
  )
    invalid('Social population scope differs');
  if (!isPostwarWagePolicy(input.wages))
    invalid('Genuine wage policy required');
  if (input.wages.sourceChecksumsSha256 !== input.genesis.sourceChecksumsSHA256)
    invalid('Wage source differs');
  const { adoption, source, policy, sourceCountryByCore } = privateState;
  if (labour.sourceChecksumsSha256 !== input.genesis.sourceChecksumsSHA256)
    invalid('Labour source differs');
  const actualRegions = new Map(
    labour.regions.map((region) => [region.locationId, region]),
  );
  const actualLineage = (
    lineage: PostwarSafetyPopulationLineage,
  ): PostwarSafetyPopulationLineage => {
    const actual = actualRegions.get(lineage.locationId);
    if (
      !actual ||
      actual.countryId !== lineage.countryId ||
      actual.sourceRegionId !== lineage.sourceRegionId ||
      actual.population !== lineage.population ||
      actual.workingAge !== lineage.workingAge
    )
      invalid('Shared population lineage differs');
    return {
      ...lineage,
      regionUnemployed: actual.unemployed,
      unemploymentBinding: 'SHARED_LABOUR_FINALIZED_PARTITION',
    };
  };
  const boundProgrammes = input.genesis.programmes.map(
    (programme): PostwarWelfareProgramme => {
      const lineage = actualLineage(programme.populationLineage);
      const specification = policy.programmes.find(
        (item) => item.type === programme.programmeType,
      )!;
      const demography = social.regions.find(
        (region) => region.locationId === programme.locationId,
      )?.demography;
      if (
        !demography ||
        demography.population !== lineage.population ||
        demography.workingAge !== lineage.workingAge
      )
        invalid('Shared age cohorts differ');
      let eligible = whole(programme.eligible);
      if (programme.eligibilityRule.populationBasis === 'UNEMPLOYED') {
        const unemployed = whole(lineage.regionUnemployed);
        eligible = min(
          unemployed,
          (unemployed *
            whole(programme.eligibilityRule.generatedEligibilityBps) *
            whole(programme.eligibilityRule.pressureBps)) /
            10000n /
            10000n,
        );
      } else if (programme.programmeType === 'PENSION')
        eligible = min(eligible, whole(demography.elderly));
      else if (programme.programmeType === 'FAMILY_CHILD_SUPPORT')
        eligible = min(eligible, whole(demography.children));
      return {
        ...programme,
        eligible: eligible.toString(),
        applied: (
          (eligible * whole(specification.applicationBps)) /
          10000n
        ).toString(),
        populationLineage: lineage,
      };
    },
  );
  const annualDays = whole(SIMULATION_DAYS_PER_YEAR),
    windowDays = whole(policy.initialWindowSimDays);
  const knownPurposes = new Set([
    ...input.genesis.demands.map((position) => position.positionId),
    ...input.genesis.programmes.map((programme) => programme.programmeId),
  ]);
  const balances = new Map<
    string,
    PostwarPublicSafetyFundingInput['balances'][number]
  >();
  const countryAvailable = new Map<string, string>();
  for (const balance of input.funding.balances) {
    for (const value of [
      balance.accountRef,
      balance.sourceBalanceRef,
      balance.currency,
    ])
      text(value);
    const employer = adoption.employers.find(
      (entry) => entry.countryId === balance.countryId && entry.role === 'GOV',
    );
    const wageCountry = input.wages.countries.find(
      (entry) => entry.countryId === balance.countryId,
    );
    const financeIndex = source.financeOriginals.findIndex(
      (entry) => entry.countryId === sourceCountryByCore.get(balance.countryId),
    );
    if (
      !employer ||
      !wageCountry ||
      employer.employerId !== balance.payerEntityId ||
      wageCountry.currency !== balance.currency ||
      financeIndex < 0 ||
      balance.sourceBalanceRef !==
        `data/finance.json#/${financeIndex}/treasuryCentralBankBalance`
    )
      invalid(
        'Funding must reference the same selected GOV balance and bound local currency',
      );
    const key = JSON.stringify([
      balance.countryId,
      balance.accountRef,
      balance.currency,
    ]);
    if (balances.has(key)) invalid('Duplicate funding account');
    balances.set(key, balance);
    const available = decimal(balance.availableAmount);
    countryAvailable.set(
      balance.countryId,
      decimal(countryAvailable.get(balance.countryId) ?? '0')
        .plus(available)
        .toFixed(),
    );
    const sourceAmount = decimal(
      source.financeOriginals[financeIndex]!.treasuryCentralBankBalance,
    ).mul(wageCountry.localCurrencyPerGcu);
    if (
      decimal(countryAvailable.get(balance.countryId)!).greaterThan(
        sourceAmount,
      )
    )
      invalid('Available GOV funding exceeds existing source balance');
  }
  const grants = new Map<
    string,
    PostwarPublicSafetyFundingInput['allocations'][number]
  >();
  const reserved = new Map<string, bigint>(),
    fundingRefs = new Set<string>();
  for (const grant of input.funding.allocations) {
    const key = JSON.stringify([
        grant.countryId,
        grant.accountRef,
        grant.currency,
      ]),
      balance = balances.get(key);
    if (
      !balance ||
      !knownPurposes.has(grant.purposeId) ||
      grants.has(grant.purposeId) ||
      fundingRefs.has(text(grant.fundingRef)) ||
      !['SIM_DAY', 'SIM_30_DAYS'].includes(grant.period) ||
      grant.payerEntityId !== balance.payerEntityId ||
      grant.sourceBalanceRef !== balance.sourceBalanceRef
    )
      invalid('Unbound, duplicate or wrong-period funding reservation');
    const ownerCountry =
      input.genesis.demands.find((item) => item.positionId === grant.purposeId)
        ?.countryId ??
      input.genesis.programmes.find(
        (item) => item.programmeId === grant.purposeId,
      )?.countryId;
    if (
      input.genesis.programmes.some(
        (item) => item.programmeId === grant.purposeId,
      ) &&
      grant.period !== 'SIM_30_DAYS'
    )
      invalid('Welfare requires its 30-simulation-day window');
    if (ownerCountry !== grant.countryId)
      invalid('Cross-country funding purpose');
    reserved.set(key, (reserved.get(key) ?? 0n) + moneyMicros(grant.amount));
    if (
      parseWorldDecimal(reserved.get(key)!.toString()).greaterThan(
        decimal(balance.availableAmount).mul(MONEY_QUANTUM.toString()),
      )
    )
      invalid('Reservations overdraw existing GOV funds');
    grants.set(grant.purposeId, grant);
    fundingRefs.add(grant.fundingRef);
  }
  const positionsById = new Map(
    labour.positions.map((position) => [position.positionId, position]),
  );
  const staffing: PostwarFinalizedSafetyPosition[] = input.genesis.demands.map(
    (demand) => {
      const position = positionsById.get(demand.positionId),
        metadata = input.genesis.positions.find(
          (entry) => entry.positionId === demand.positionId,
        )!;
      if (
        !position ||
        position.countryId !== demand.countryId ||
        position.locationId !== demand.locationId ||
        position.employerId !== demand.employerId ||
        position.skill !== demand.skill ||
        position.classificationId !== demand.classificationId ||
        position.requiredCount !== demand.requiredCount ||
        position.sourceBucket !== 'OTHER_DOMESTIC_SERVICES'
      )
        invalid('Labour position differs from generated demand');
      const filled = whole(position.filledCount),
        required = whole(demand.requiredCount);
      if (
        filled > required ||
        position.personRange.count !== position.filledCount
      )
        invalid('Shared population allocation mismatch');
      const wage = input.wages.wagesByPositionId[demand.positionId];
      if (!wage || wage.wagePeriod !== 'SIM_YEAR')
        invalid('No genuine wage binding for position');
      const dailyUnitCost = moneyMicros(wage.wageAmount) / annualDays;
      const unitCost = (moneyMicros(wage.wageAmount) * windowDays) / annualDays;
      if (dailyUnitCost === 0n && filled > 0n)
        invalid('Nonzero employee needs positive wage cost');
      const grant = grants.get(demand.positionId);
      if (grant && grant.currency !== wage.wageCurrency)
        invalid('Payroll funding currency mismatch');
      const coverageDays =
        grant?.period === 'SIM_DAY' ? 1n : grant ? windowDays : 0n;
      const coveredUnitCost =
        grant?.period === 'SIM_DAY' ? dailyUnitCost : unitCost;
      const funded =
        grant && coveredUnitCost > 0n
          ? min(filled, moneyMicros(grant.amount) / coveredUnitCost)
          : 0n;
      const effort =
        metadata.function === 'WELFARE_ADMINISTRATION' ||
        metadata.function === 'ADMIN_SUPPORT'
          ? 0n
          : (funded *
              whole(policy.caseHandlingPerOfficerPerWindow) *
              whole(metadata.footCapacityBps)) /
            10000n;
      return {
        positionId: demand.positionId,
        countryId: demand.countryId,
        locationId: demand.locationId,
        function: metadata.function,
        requiredCount: required.toString(),
        filledCount: filled.toString(),
        fundedCount: funded.toString(),
        deployedCount: '0',
        unavailableCount: (filled - funded).toString(),
        availableCount: funded.toString(),
        vacancies: (required - filled).toString(),
        wageAmount: wage.wageAmount,
        wageCurrency: wage.wageCurrency,
        wagePeriod: wage.wagePeriod,
        wageVersion: wage.wageVersion,
        payrollPerPersonPerWindow: fromMicros(unitCost),
        payrollPerPersonPerSimDay: fromMicros(dailyUnitCost),
        payrollFundingPeriod: grant?.period ?? null,
        payrollCoverageSimDays: coverageDays.toString(),
        payrollFundingRef: grant?.fundingRef ?? null,
        personRange: { ...position.personRange },
        equipmentStatus: 'NO_EXCLUSIVE_GOV_EQUIPMENT_BOUND_FOOT_ONLY',
        equipmentReady: false,
        potentialCaseEffortPerWindow: effort.toString(),
        potentialCaseEffortPerSimDay: (effort / windowDays).toString(),
      };
    },
  );
  const verifiedByProgramme = new Map<string, bigint>();
  for (const region of input.genesis.regions) {
    const locationId = region.lineage.locationId;
    const administration = staffing
      .filter(
        (position) =>
          position.locationId === locationId &&
          position.function === 'WELFARE_ADMINISTRATION',
      )
      .reduce((total, position) => total + whole(position.fundedCount), 0n);
    const programmes = boundProgrammes.filter(
      (programme) => programme.locationId === locationId,
    );
    const applications = programmes.reduce(
      (total, programme) => total + whole(programme.applied),
      0n,
    );
    for (const [id, count] of allocate(
      min(
        applications,
        administration * whole(policy.applicationsPerAdministratorPerWindow),
      ),
      programmes.map((programme) => ({
        id: programme.programmeId,
        weight: whole(programme.applied),
        capacity: whole(programme.applied),
      })),
    ))
      verifiedByProgramme.set(id, count);
  }
  const programmes: PostwarFinalizedWelfareProgramme[] = boundProgrammes.map(
    (programme) => {
      const countryWage = input.wages.countries.find(
        (country) => country.countryId === programme.countryId,
      );
      if (!countryWage) invalid('Country wage basis missing');
      const benefit =
        (moneyMicros(countryWage.wagesBySkill.LOW.wageAmount) *
          whole(programme.annualWageReplacementBps) *
          windowDays) /
        10000n /
        annualDays;
      if (benefit === 0n && programme.eligible !== '0')
        invalid(
          'Positive eligible population requires a positive modelled benefit',
        );
      const verified = verifiedByProgramme.get(programme.programmeId)!,
        grant = grants.get(programme.programmeId);
      if (grant && grant.currency !== countryWage.currency)
        invalid('Benefit currency mismatch');
      const approved =
        grant && benefit > 0n
          ? min(verified, moneyMicros(grant.amount) / benefit)
          : 0n;
      return {
        ...programme,
        verified: verified.toString(),
        approved: approved.toString(),
        scheduled: approved.toString(),
        paid: '0',
        benefitAmount: fromMicros(benefit),
        benefitCurrency: countryWage.currency,
        pendingApplications: (whole(programme.applied) - verified).toString(),
        scheduledUnpaidRecipients: approved.toString(),
        delayedRecipients: '0',
        actualPaidCost: '0',
        fundingRef: grant?.fundingRef ?? null,
        dueSimDay: policy.initialWindowSimDays,
        initialObligationId:
          approved > 0n
            ? `PW_OBLIGATION_${hash(JSON.stringify([programme.programmeId, grant!.fundingRef, '0'])).toUpperCase()}`
            : null,
        status:
          approved > 0n
            ? 'SCHEDULED_UNPAID'
            : verified > 0n
              ? 'AWAITING_FUNDING'
              : 'AWAITING_ADMINISTRATION',
      };
    },
  );
  const deploymentCapacity = input.genesis.regions.map((region) => {
    const positions = staffing.filter(
      (position) =>
        position.locationId === region.lineage.locationId &&
        position.function !== 'WELFARE_ADMINISTRATION',
    );
    const available = sum(positions.map((position) => position.availableCount)),
      effort = sum(
        positions.map((position) => position.potentialCaseEffortPerWindow),
      );
    return {
      countryId: region.lineage.countryId,
      locationId: region.lineage.locationId,
      availablePersonnel: available,
      potentialCaseEffortPerWindow: effort,
      potentialCaseEffortPerSimDay: (whole(effort) / windowDays).toString(),
      state:
        effort === '0'
          ? ('UNAVAILABLE' as const)
          : ('LIMITED_FOOT_SERVICE' as const),
      fullEquipmentReady: false as const,
    };
  });
  const output: PostwarFinalizedPublicSafetyGenesis = freeze({
    schemaVersion: 'postwar-finalized-public-safety-genesis-v1',
    fingerprint: hash(
      JSON.stringify({
        preparation: input.genesis.fingerprint,
        staffing,
        programmes,
        deploymentCapacity,
      }),
    ),
    preparationFingerprint: input.genesis.fingerprint,
    worldId: input.genesis.worldId,
    policyVersion: POLICY_VERSION,
    status: 'CONSTRAINED_GENESIS_NOT_ADMITTED',
    staffing,
    incidents: input.genesis.incidents.map((incident) => ({
      ...incident,
      populationLineage: actualLineage(incident.populationLineage),
    })),
    programmes,
    deploymentCapacity,
    localFundingReservationsValidated: true,
    crossServiceFundingAuthority: 'EXTERNAL_GLOBAL_ALLOCATOR_REQUIRED',
    moneyCreated: false,
    wagesOrBenefitsPaid: false,
    paymentEventsGenerated: false,
    hiringEventsGenerated: false,
    runtimeAdmitted: false,
  });
  finalized.add(output);
  return output;
}
export function consumePostwarPublicSafetyGenesis(
  value: PostwarFinalizedPublicSafetyGenesis,
): PostwarFinalizedPublicSafetyGenesis {
  if (!finalized.has(value))
    invalid('Finalizer-owned public safety genesis required');
  return value;
}

/** Extra welfare needs only. All police/admin wages are already part of the
 * shared allocator's position payroll; they must not be reserved a second time. */
export function createPostwarPublicSafetyFundingRequests(input: {
  readonly genesis: PostwarPublicSafetyGenesis;
  readonly labour: PostwarLabourGenesisPreparation;
  readonly social: PostwarSocialServiceGenesis;
  readonly wages: PostwarWagePolicy;
}): readonly Readonly<{
  requestId: string;
  purposeId: string;
  countryId: string;
  locationId: string;
  kind: 'WELFARE';
  currency: string;
  amount: string;
  periodDays: '30';
}>[] {
  const bound = finalizePostwarPublicSafetyGenesis({
    ...input,
    funding: { balances: [], allocations: [] },
  });
  return freeze(
    bound.programmes.map((programme) => ({
      requestId: programme.programmeId,
      purposeId: programme.programmeId,
      countryId: programme.countryId,
      locationId: programme.locationId,
      kind: 'WELFARE' as const,
      currency: programme.benefitCurrency,
      amount: fromMicros(
        moneyMicros(programme.benefitAmount) * whole(programme.applied),
      ),
      periodDays: '30' as const,
    })),
  );
}
