/** Generated postwar t0 carriers for the sole genesis assembler. No persistence,
 * admission, hiring, historical service, graduation, inventory or cash posting. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  canonicalSerialize,
  canonicalDecimal,
  calculateEducationOutcome,
  calculateHealthcareDelivery,
  calculateBedOccupancy,
  parseWorldDecimal,
  type OpeningLabourPositionDemand,
} from '@econmind/core';
import {
  consumeLabourSocialOpeningAdoption,
  type OfficialLabourSocialOpeningAdoption,
} from './official-labour-social-opening-adoption.js';
import { OFFICIAL_OPENING_RECONCILIATION_PINS } from './official-opening-decision-reconciliation.js';
import type { PostwarLabourDemand } from './postwar-labour-genesis.js';
import {
  isPostwarWagePolicy,
  type PostwarWagePolicy,
} from './postwar-wage-policy.js';

type Data = Record<string, unknown>;
const hash = (v: string) => createHash('sha256').update(v).digest('hex');
const issued = new WeakSet<object>();
const finalizedIssued = new WeakSet<object>();
const finalizedPreparations = new WeakMap<
  object,
  PostwarSocialServiceGenesis
>();
function invalid(reason: string): never {
  throw Error(`Postwar social genesis: ${reason}`);
}
function row(v: unknown): Data {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    invalid('record required');
  return v as Data;
}
function n(v: unknown): bigint {
  if (typeof v !== 'string' || !/^(?:0|[1-9]\d{0,18})$/u.test(v))
    invalid('exact nonnegative whole count required');
  return BigInt(v);
}
function text(v: unknown): string {
  if (typeof v !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,127}$/u.test(v))
    invalid('canonical identity required');
  return v;
}
function freeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
const min = (...values: bigint[]) => values.reduce((a, b) => (a < b ? a : b));
const quantity = (amount: bigint, unit: string) => ({
  amount: amount.toString(),
  unit,
});
const jitter = (key: string, max: bigint) =>
  BigInt(`0x${hash(key).slice(0, 12)}`) % (max + 1n);
/** Largest remainders with stable index ties; exact totals, no lost people. */
function distribute(total: bigint, weights: readonly bigint[]): bigint[] {
  if (total < 0n || weights.some((weight) => weight < 0n))
    invalid('negative distribution input');
  const sum = weights.reduce((a, b) => a + b, 0n);
  if (sum === 0n) {
    if (total !== 0n) invalid('no distribution capacity');
    return weights.map(() => 0n);
  }
  const out = weights.map((w) => (total * w) / sum);
  let rest = total - out.reduce((a, b) => a + b, 0n);
  const order = weights
    .map((w, i) => ({ i, remainder: (total * w) % sum }))
    .sort((a, b) =>
      a.remainder === b.remainder
        ? a.i - b.i
        : a.remainder > b.remainder
          ? -1
          : 1,
    );
  for (const item of order) {
    if (!rest) break;
    out[item.i] = out[item.i]! + 1n;
    rest--;
  }
  if (rest) invalid('integer distribution failed');
  return out;
}

export interface PostwarStudentCohort {
  readonly cohortId: string;
  readonly programmeId: string;
  readonly age: string;
  readonly applicants: string;
  readonly desiredEnrollment: string;
  readonly elapsedSimDays: string;
  readonly requiredSimDays: string;
  readonly provenance: 'GENERATED_POLICY';
}
export interface PostwarSocialRegion {
  readonly countryId: string;
  readonly locationId: string;
  readonly schoolAssetId: string;
  readonly hospitalAssetId: string;
  readonly serviceKinds: readonly ['BASIC', 'HOSPITAL'];
  readonly sourceSchoolSeats: string;
  readonly sourceHospitalBeds: string;
  readonly sourceTeachers: string;
  readonly sourceMedicalWorkers: string;
  readonly disruptionBps: string;
  readonly demography: Readonly<{
    population: string;
    workingAge: string;
    labourForce: string;
    children: string;
    elderly: string;
    workingAgeOutsideLabourForce: string;
    hospitalizedWorkingAgeOutsideLabourForce: string;
    hospitalizedElderly: string;
    youth16And17: readonly string[];
    hospitalizedYouth16And17: readonly string[];
    childAges: readonly string[];
    hospitalizedChildrenByAge: readonly string[];
  }>;
  readonly studentCohorts: readonly PostwarStudentCohort[];
  readonly healthcare: Readonly<{
    demandId: string;
    backlogId: string;
    occupiedPatientCohortId: string;
    newDemand: string;
    priorBacklog: string;
    occupiedBeds: string;
    queuedEpisodes: string;
    newDemandByType: Readonly<
      Record<'OUTPATIENT' | 'EMERGENCY' | 'INPATIENT', string>
    >;
    backlogByType: Readonly<
      Record<'OUTPATIENT' | 'EMERGENCY' | 'INPATIENT', string>
    >;
    initialDeliveredEpisodes: '0';
    historicalServiceEvents: readonly [];
  }>;
  readonly provenance: Readonly<{
    kind: 'GENERATED_POLICY';
    policyVersion: string;
    policyFingerprint: string;
    regionsSHA256: string;
    sourceRegionPointer: string;
    sourceSchoolObjectId: string;
    sourceHospitalObjectId: string;
  }>;
}
declare const preparationBrand: unique symbol;
export interface PostwarSocialServiceGenesis {
  readonly [preparationBrand]: true;
  readonly schemaVersion: 'postwar-social-service-genesis-v1';
  readonly status: 'DEMANDS_AND_INITIAL_QUEUES_PREPARED_NOT_STAFFED';
  readonly worldId: string;
  readonly seedId: string;
  readonly policyVersion: string;
  readonly policyFingerprint: string;
  readonly sourcePackageId: string;
  readonly sourceChecksumsSha256: string;
  readonly regions: readonly PostwarSocialRegion[];
  readonly demands: readonly PostwarLabourDemand[];
  readonly fingerprint: string;
  readonly historyEvents: readonly [];
  readonly financialPostings: readonly [];
}
interface Policy {
  schemaVersion: string;
  policyVersion: string;
  provenance: string;
  childrenShareOfNonWorkingAgeBps: string;
  childrenRegionalVariationBps: string;
  baseDisruptionBps: string;
  disruptionJitterBps: string;
  ageWeights0Through15: string[];
  upperSecondaryYouthShareOfWorkingAgeOutsideLabourForceBps: string;
  education: {
    entryAge: string;
    lastSchoolAge: string;
    yearSimDays: string;
    studentsPerFilledQualifiedTeacher: string;
    baseAttendanceBps: string;
    disruptionAttendanceDivisor: string;
    gradeOlderAgePenaltyBps: string;
    programmes: {
      id: string;
      firstAge: string;
      lastAge: string;
      years: string;
    }[];
  };
  healthcare: Record<string, string>;
  operatingCosts: {
    provenance: string;
    educationDailyMeanWageDivisor: string;
    healthcareDailyMeanWageDivisor: string;
    simDaysPerYear: string;
    generatedPriceDecimalPlaces: string;
  };
}
function policyFrom(raw?: unknown): Policy {
  const value = JSON.parse(
    JSON.stringify(
      raw ??
        JSON.parse(
          readFileSync(
            new URL(
              '../../../../config/postwar-genesis/social-services.v1.json',
              import.meta.url,
            ),
            'utf8',
          ),
        ),
    ),
  ) as Policy;
  if (
    value.schemaVersion !== 'postwar-social-services-policy-v1' ||
    value.provenance !== 'GENERATED_POLICY'
  )
    invalid('explicit generated policy required');
  text(value.policyVersion);
  if (
    value.ageWeights0Through15.length !== 16 ||
    value.ageWeights0Through15.some((v) => n(v) === 0n)
  )
    invalid('16 positive child age weights required');
  for (const v of [
    value.childrenShareOfNonWorkingAgeBps,
    value.childrenRegionalVariationBps,
    value.baseDisruptionBps,
    value.disruptionJitterBps,
    ...Object.values(value.healthcare),
  ])
    n(v);
  if (
    n(value.childrenShareOfNonWorkingAgeBps) +
      n(value.childrenRegionalVariationBps) >
      10000n ||
    n(value.childrenShareOfNonWorkingAgeBps) <
      n(value.childrenRegionalVariationBps)
  )
    invalid('children policy exceeds nonworking population');
  if (
    n(value.education.entryAge) !== 6n ||
    n(value.education.lastSchoolAge) !== 17n ||
    n(value.education.yearSimDays) === 0n ||
    n(value.education.studentsPerFilledQualifiedTeacher) === 0n ||
    n(value.education.disruptionAttendanceDivisor) === 0n ||
    n(value.healthcare.extraBacklogDisruptionDivisor) === 0n ||
    n(value.healthcare.dosesPerEpisode) === 0n ||
    value.education.programmes.some((p) => n(p.years) === 0n)
  )
    invalid('invalid BASIC/care policy');
  const h = value.healthcare;
  if (
    [
      'doctorHighBps',
      'nurseHighBps',
      'nurseMediumBps',
      'technicianMediumBps',
      'supportLowBps',
      'supportMediumBps',
    ].reduce((a, k) => a + n(h[k]), 0n) !== 10000n ||
    n(h.supportLowBps) < n(h.doctorDisruptionShiftMaxBps)
  )
    invalid('medical roles do not conserve source staff');
  if (
    n(h.hospitalizedChildrenBps) +
      n(h.hospitalizedAdultsOutsideLabourBps) +
      n(h.hospitalizedElderlyBps) !==
      10000n ||
    n(h.occupiedBedDisruptionDivisor) === 0n
  )
    invalid('patient demographic weights invalid');
  if (
    n(value.upperSecondaryYouthShareOfWorkingAgeOutsideLabourForceBps) > 10000n
  )
    invalid('youth outside non-LF pool');
  if (
    value.operatingCosts.provenance !== 'GENERATED_POLICY' ||
    n(value.operatingCosts.educationDailyMeanWageDivisor) === 0n ||
    n(value.operatingCosts.healthcareDailyMeanWageDivisor) === 0n ||
    value.operatingCosts.simDaysPerYear !== '360' ||
    value.operatingCosts.generatedPriceDecimalPlaces !== '6'
  )
    invalid('invalid operating cost policy');
  for (let age = 6; age <= 17; age++)
    if (
      value.education.programmes.filter(
        (p) => n(p.firstAge) <= BigInt(age) && n(p.lastAge) >= BigInt(age),
      ).length !== 1
    )
      invalid('BASIC programme ages must partition school children');
  return freeze(value);
}
const policies = new WeakMap<object, Policy>();

export function preparePostwarSocialServiceGenesis(input: {
  readonly adoption: OfficialLabourSocialOpeningAdoption;
  readonly mappingBytes: string;
  readonly regionsBytes: string;
  readonly worldId: string;
  readonly seedId: string;
  readonly policy?: unknown;
}): PostwarSocialServiceGenesis {
  consumeLabourSocialOpeningAdoption(input.adoption);
  const { adoption } = input,
    worldId = text(input.worldId),
    seedId = text(input.seedId),
    policy = policyFrom(input.policy);
  const source = adoption.sourceProvenance.find((v) => v.dataset === 'regions');
  if (
    !source ||
    hash(input.regionsBytes) !== source.sha256 ||
    hash(input.mappingBytes) !==
      OFFICIAL_OPENING_RECONCILIATION_PINS.mappingSha256
  )
    invalid('selected region/mapping bytes changed');
  const mapping = row(JSON.parse(input.mappingBytes)).mappings as {
    regions: Data[];
  };
  const parseLossless = JSON.parse as (
    bytes: string,
    reviver: (
      key: string,
      value: unknown,
      context: { source?: string },
    ) => unknown,
  ) => unknown;
  const raw = parseLossless(input.regionsBytes, (_k, v, c) => {
    if (typeof v !== 'number') return v;
    if (typeof c.source !== 'string')
      invalid('lossless Node JSON source required');
    return c.source;
  }) as Data[];
  const policyVersion = policy.policyVersion,
    policyFingerprint = `sha256:${hash(canonicalSerialize(policy))}`;
  const id = (kind: string, location: string, suffix = '') =>
    `POSTWAR_${kind}_${hash(canonicalSerialize({ worldId, seedId, policyVersion, policyFingerprint, location, suffix })).slice(0, 40).toUpperCase()}`;
  const demands: PostwarLabourDemand[] = [];
  const regions = raw.map((r, index): PostwarSocialRegion => {
    const maps = mapping.regions.filter(
      (m) => m.sourceRegionId === r.id && m.sourceCountryId === r.countryId,
    );
    if (maps.length !== 1) invalid('region join is not unique');
    const countryId = String(maps[0]!.coreCountryId),
      locationId = String(maps[0]!.normalizedRegionId),
      initial = row(r.initial);
    const assets = adoption.capacities.filter(
      (a) => a.core.countryId === countryId && a.core.locationId === locationId,
    );
    const school = assets.find((a) => a.sourceProjectId === 'PROJECT-31'),
      hospital = assets.find((a) => a.sourceProjectId === 'PROJECT-35');
    if (
      !school ||
      !hospital ||
      school.requiredStaffTarget === null ||
      hospital.requiredStaffTarget === null
    )
      invalid('existing BASIC school/HOSPITAL aliases required');
    const employers = adoption.employers.filter(
      (e) => e.countryId === countryId && e.role === 'GOV',
    );
    if (employers.length !== 1) invalid('unique public employer required');
    const pop = n(initial.population),
      working = n(initial.workingAge),
      lf = n(initial.labourForce);
    if (lf > working || working > pop) invalid('population bounds invalid');
    const access = parseWorldDecimal(String(r.settlementAccess))
      .times('10000')
      .floor();
    if (access.isNegative() || access.greaterThan('10000'))
      invalid('source access outside range');
    const disruption = min(
      6000n,
      n(policy.baseDisruptionBps) +
        (10000n - BigInt(access.toFixed(0))) / 4n +
        jitter(String(r.id), n(policy.disruptionJitterBps)),
    );
    const childBps =
      n(policy.childrenShareOfNonWorkingAgeBps) +
      jitter(
        `${String(r.id)}:children`,
        n(policy.childrenRegionalVariationBps) * 2n,
      ) -
      n(policy.childrenRegionalVariationBps);
    const children = ((pop - working) * childBps) / 10000n,
      elderly = pop - working - children,
      outsideLF = working - lf;
    const childAges = distribute(children, policy.ageWeights0Through15.map(n));
    const youthTotal =
      (outsideLF *
        n(policy.upperSecondaryYouthShareOfWorkingAgeOutsideLabourForceBps)) /
      10000n;
    const youth = distribute(youthTotal, [1n, 1n]);
    const h = policy.healthcare,
      occupiedBps = min(
        9000n,
        n(h.baseOccupiedBedBps) +
          disruption / n(h.occupiedBedDisruptionDivisor),
      );
    const beds = n(hospital.core.capacity.amount),
      occupied = (beds * occupiedBps) / 10000n;
    const patientAge = distribute(occupied, [
      n(h.hospitalizedChildrenBps),
      n(h.hospitalizedAdultsOutsideLabourBps),
      n(h.hospitalizedElderlyBps),
    ]);
    if (
      patientAge[0]! > children ||
      patientAge[1]! > outsideLF ||
      patientAge[2]! > elderly
    )
      invalid('generated patients exceed exclusive demographic pools');
    const childPatients = distribute(patientAge[0]!, childAges);
    const workingPatients = distribute(patientAge[1]!, [
      ...youth,
      outsideLF - youthTotal,
    ]);
    const schoolAgePopulations = [...childAges, ...youth];
    const schoolAgePatients = [
      ...childPatients,
      ...workingPatients.slice(0, 2),
    ];
    const studentCohorts = schoolAgePopulations
      .slice(6)
      .map((count, offset): PostwarStudentCohort => {
        const age = BigInt(offset + 6),
          applicants = count - schoolAgePatients[offset + 6]!;
        const p = policy.education.programmes.find(
          (p) => n(p.firstAge) <= age && n(p.lastAge) >= age,
        )!;
        const required = n(p.years) * n(policy.education.yearSimDays);
        const elapsed =
          (age - n(p.firstAge)) * n(policy.education.yearSimDays) +
          jitter(
            `${String(r.id)}:${age}`,
            n(policy.education.yearSimDays) - 1n,
          );
        const attendance =
          n(policy.education.baseAttendanceBps) -
          disruption / n(policy.education.disruptionAttendanceDivisor) -
          BigInt(offset) * n(policy.education.gradeOlderAgePenaltyBps);
        if (attendance < 0n || attendance > 10000n || elapsed >= required)
          invalid('generated curriculum/attendance invalid');
        return {
          cohortId: id('STUDENT', locationId, age.toString()),
          programmeId: p.id,
          age: age.toString(),
          applicants: applicants.toString(),
          desiredEnrollment: ((applicants * attendance) / 10000n).toString(),
          elapsedSimDays: elapsed.toString(),
          requiredSimDays: required.toString(),
          provenance: 'GENERATED_POLICY',
        };
      });
    const addDemand = (
      objectId: string,
      occupation: OpeningLabourPositionDemand['occupation'],
      skill: OpeningLabourPositionDemand['skill'],
      classificationId: string,
      count: bigint,
    ) =>
      demands.push({
        positionId: id(
          'POSITION',
          locationId,
          `${objectId}:${occupation}:${skill}`,
        ),
        countryId,
        locationId,
        skill,
        occupation,
        owner: 'PUBLIC_SERVICE',
        classificationId,
        requiredCount: count.toString(),
        sourceWeight: count.toString(),
        employerId: employers[0]!.employerId,
        employerRole: 'GOV',
        sourceBucket: 'EDUCATION_AND_HEALTH',
        sourceObjectId: objectId,
        policyVersion,
        provenance: 'GENERATED_POLICY',
      });
    addDemand(
      school.sourceFacilityId,
      'TEACHER',
      'HIGH',
      'EDUCATION',
      n(school.requiredStaffTarget),
    );
    const shift = (disruption * n(h.doctorDisruptionShiftMaxBps)) / 6000n;
    const counts = distribute(n(hospital.requiredStaffTarget), [
      n(h.doctorHighBps) + shift,
      n(h.nurseHighBps),
      n(h.nurseMediumBps),
      n(h.technicianMediumBps),
      n(h.supportLowBps) - shift,
      n(h.supportMediumBps),
    ]);
    const roles = [
      ['DOCTOR', 'HIGH'],
      ['NURSE', 'HIGH'],
      ['NURSE', 'MEDIUM'],
      ['MEDICAL_TECHNICIAN', 'MEDIUM'],
      ['SUPPORT', 'LOW'],
      ['SUPPORT', 'MEDIUM'],
    ] as const;
    roles.forEach(([occupation, skill], i) =>
      addDemand(
        hospital.sourceFacilityId,
        occupation,
        skill,
        'HEALTHCARE',
        counts[i]!,
      ),
    );
    const reference = n(hospital.dailyMedicalVisitsReference),
      demand =
        (reference * (n(h.baseDemandMultiplierBps) + disruption)) / 10000n;
    const backlogDays =
        n(h.baseBacklogSimDays) +
        disruption / n(h.extraBacklogDisruptionDivisor),
      backlog = demand * backlogDays;
    const emergency = 1000n + disruption / 4n,
      inpatient = 600n + disruption / 10n,
      weights = [10000n - emergency - inpatient, emergency, inpatient];
    const demandTypes = distribute(demand, weights),
      backlogTypes = distribute(backlog, weights);
    return freeze({
      countryId,
      locationId,
      schoolAssetId: school.core.assetId,
      hospitalAssetId: hospital.core.assetId,
      serviceKinds: ['BASIC', 'HOSPITAL'] as const,
      sourceSchoolSeats: school.core.capacity.amount,
      sourceHospitalBeds: beds.toString(),
      sourceTeachers: school.requiredStaffTarget,
      sourceMedicalWorkers: hospital.requiredStaffTarget,
      disruptionBps: disruption.toString(),
      demography: {
        population: pop.toString(),
        workingAge: working.toString(),
        labourForce: lf.toString(),
        children: children.toString(),
        elderly: elderly.toString(),
        workingAgeOutsideLabourForce: outsideLF.toString(),
        hospitalizedWorkingAgeOutsideLabourForce: patientAge[1]!.toString(),
        youth16And17: youth.map(String),
        hospitalizedYouth16And17: workingPatients.slice(0, 2).map(String),
        hospitalizedElderly: patientAge[2]!.toString(),
        childAges: childAges.map(String),
        hospitalizedChildrenByAge: childPatients.map(String),
      },
      studentCohorts,
      healthcare: {
        demandId: id('DEMAND', locationId),
        backlogId: id('BACKLOG', locationId),
        occupiedPatientCohortId: id('PATIENT', locationId),
        newDemand: demand.toString(),
        priorBacklog: backlog.toString(),
        occupiedBeds: occupied.toString(),
        queuedEpisodes: (demand + backlog).toString(),
        newDemandByType: {
          OUTPATIENT: demandTypes[0]!.toString(),
          EMERGENCY: demandTypes[1]!.toString(),
          INPATIENT: demandTypes[2]!.toString(),
        },
        backlogByType: {
          OUTPATIENT: backlogTypes[0]!.toString(),
          EMERGENCY: backlogTypes[1]!.toString(),
          INPATIENT: backlogTypes[2]!.toString(),
        },
        initialDeliveredEpisodes: '0' as const,
        historicalServiceEvents: [] as const,
      },
      provenance: {
        kind: 'GENERATED_POLICY' as const,
        policyVersion,
        policyFingerprint,
        regionsSHA256: source.sha256,
        sourceRegionPointer: `/${index}/initial`,
        sourceSchoolObjectId: school.sourceFacilityId,
        sourceHospitalObjectId: hospital.sourceFacilityId,
      },
    });
  });
  if (
    regions.length !== adoption.populationAvailability.length ||
    new Set(regions.map((r) => r.locationId)).size !== regions.length
  )
    invalid('regional coverage differs');
  const body = {
    schemaVersion: 'postwar-social-service-genesis-v1' as const,
    status: 'DEMANDS_AND_INITIAL_QUEUES_PREPARED_NOT_STAFFED' as const,
    worldId,
    seedId,
    policyVersion,
    policyFingerprint,
    sourcePackageId: adoption.sourcePackageId,
    sourceChecksumsSha256: adoption.sourceChecksumsSha256,
    regions,
    demands,
    historyEvents: [] as const,
    financialPostings: [] as const,
  };
  const result = freeze({
    ...body,
    fingerprint: `sha256:${hash(canonicalSerialize(body))}`,
  }) as unknown as PostwarSocialServiceGenesis;
  issued.add(result);
  policies.set(result, policy);
  return result;
}

export function consumePostwarSocialServiceGenesis(
  value: PostwarSocialServiceGenesis,
): PostwarSocialServiceGenesis {
  if (!issued.has(value))
    invalid('genuine social-service preparation required');
  return value;
}

/** One purpose identity shared by operating inputs and the sole cash allocator. */
export function postwarSocialServiceFundingPurpose(
  input: PostwarSocialServiceGenesis,
  locationId: string,
  service: 'EDUCATION' | 'HOSPITAL',
): string {
  const prepared = consumePostwarSocialServiceGenesis(input);
  if (
    !prepared.regions.some((region) => region.locationId === locationId) ||
    !['EDUCATION', 'HOSPITAL'].includes(service)
  )
    invalid('unknown social operating purpose scope');
  return `POSTWAR_SERVICE_${hash(
    canonicalSerialize({
      worldId: prepared.worldId,
      seedId: prepared.seedId,
      policyFingerprint: prepared.policyFingerprint,
      locationId,
      service,
    }),
  )
    .slice(0, 40)
    .toUpperCase()}`;
}

/** Non-payroll daily requests for the one shared GOV cash allocator. Requested
 * money is not coverage; finalization must use its actually allocated amounts. */
export function createPostwarSocialServiceFundingRequests(
  input: PostwarSocialServiceGenesis,
  wages: PostwarWagePolicy,
) {
  const prepared = consumePostwarSocialServiceGenesis(input);
  if (
    !isPostwarWagePolicy(wages) ||
    wages.sourceChecksumsSha256 !== prepared.sourceChecksumsSha256
  )
    invalid('same-source genuine wage policy required');
  const cost = policies.get(prepared)!.operatingCosts;
  if (
    cost.provenance !== 'GENERATED_POLICY' ||
    cost.simDaysPerYear !== '360' ||
    cost.generatedPriceDecimalPlaces !== '6'
  )
    invalid('generated non-payroll cost/calendar policy differs');
  const unitCostsByCountry = wages.countries.map((country) => {
    const price = (divisor: string) => {
      const financialInteger = (v: string) => {
        if (!/^(?:0|[1-9]\d{0,119})$/u.test(v))
          invalid('exact financial rational integer required');
        return BigInt(v);
      };
      const d =
        financialInteger(country.meanAnnualWageLC.denominator) *
        n(cost.simDaysPerYear) *
        n(divisor);
      if (!d) invalid('operating cost denominator is zero');
      const scaled =
        (financialInteger(country.meanAnnualWageLC.numerator) * 1000000n) / d;
      if (!scaled) invalid('generated unit cost rounds to zero');
      return canonicalDecimal(
        parseWorldDecimal(scaled.toString()).dividedBy('1000000'),
      );
    };
    return {
      countryId: country.countryId,
      currency: country.currency,
      educationUnitCost: price(cost.educationDailyMeanWageDivisor),
      healthcareUnitCost: price(cost.healthcareDailyMeanWageDivisor),
      provenance: 'GENERATED_POLICY' as const,
      wagePolicyVersion: wages.version,
      policyFingerprint: prepared.policyFingerprint,
    };
  });
  const requests = prepared.regions.flatMap((region) => {
    const prices = unitCostsByCountry.find(
      (country) => country.countryId === region.countryId,
    );
    const teacher = prepared.demands.find(
      (d) => d.locationId === region.locationId && d.occupation === 'TEACHER',
    );
    if (!prices || !teacher) invalid('country price/public employer missing');
    const desired = region.studentCohorts.reduce(
      (a, c) => a + n(c.desiredEnrollment),
      0n,
    );
    return (
      [
        ['EDUCATION', desired, prices.educationUnitCost],
        ['HOSPITAL', n(region.healthcare.newDemand), prices.healthcareUnitCost],
      ] as const
    ).map(([service, count, unit]) => {
      const purposeId = postwarSocialServiceFundingPurpose(
        prepared,
        region.locationId,
        service,
      );
      return {
        requestId: purposeId,
        purposeId,
        countryId: region.countryId,
        locationId: region.locationId,
        kind: 'OPERATING' as const,
        currency: prices.currency,
        amount: canonicalDecimal(
          parseWorldDecimal(String(unit)).times(String(count)),
        ),
        periodDays: '1' as const,
        payerEntityId: teacher.employerId,
      };
    });
  });
  return freeze({
    requests,
    unitCostsByCountry,
    sourceChecksumsSha256: prepared.sourceChecksumsSha256,
    policyFingerprint: prepared.policyFingerprint,
    payrollIncluded: false as const,
    cashCreated: false as const,
  });
}

export interface PostwarSocialSupport {
  readonly countryId: string;
  readonly locationId: string;
  readonly currency: string;
  readonly sourceRef: string;
  readonly educationBudgetRef: string;
  readonly educationBudgetAvailable: string;
  readonly educationUnitCost: string;
  readonly educationMaterialSeats: string;
  readonly healthcareBudgetRef: string;
  readonly healthcareBudgetAvailable: string;
  readonly healthcareUnitCost: string;
  readonly medicineDoses: string;
  readonly equipmentEpisodes: string;
  readonly waterEpisodes: string;
  readonly powerEpisodes: string;
  readonly costProvenance: 'GENERATED_POLICY';
}
export interface PostwarSocialCountryBudget {
  readonly countryId: string;
  readonly currency: string;
  readonly sourceRef: string;
  readonly educationAmount: string;
  readonly healthcareAmount: string;
}
export function finalizePostwarSocialServiceGenesis(input: {
  readonly prepared: PostwarSocialServiceGenesis;
  readonly filledPositions: readonly {
    positionId: string;
    countryId: string;
    locationId: string;
    skill: string;
    occupation: string;
    employerId: string;
    filledCount: string;
  }[];
  readonly support: readonly PostwarSocialSupport[];
  readonly countryBudgets: readonly PostwarSocialCountryBudget[];
}) {
  const prepared = consumePostwarSocialServiceGenesis(input.prepared),
    policy = policies.get(prepared)!;
  const positions = new Map(
    input.filledPositions.map((p) => [p.positionId, p]),
  );
  if (positions.size !== input.filledPositions.length)
    invalid('duplicate staffing result');
  for (const d of prepared.demands) {
    const p = positions.get(d.positionId);
    if (
      !p ||
      p.countryId !== d.countryId ||
      p.locationId !== d.locationId ||
      p.skill !== d.skill ||
      p.occupation !== d.occupation ||
      p.employerId !== d.employerId ||
      n(p.filledCount) > n(d.requiredCount)
    )
      invalid('filled staffing differs from actual demand binding');
  }
  if (
    input.support.length !== prepared.regions.length ||
    new Set(input.support.map((s) => s.locationId)).size !==
      input.support.length
  )
    invalid('one finite support record per region required');
  const budgetRefs = new Set<string>(),
    totals = new Map<
      string,
      {
        currency: string;
        education: ReturnType<typeof parseWorldDecimal>;
        health: ReturnType<typeof parseWorldDecimal>;
      }
    >();
  const budgetCapacity = (amount: string, cost: string) => {
    const a = parseWorldDecimal(amount),
      c = parseWorldDecimal(cost);
    if (!a.isFinite() || a.isNegative() || !c.isFinite() || !c.greaterThan(0))
      invalid('nonnegative budget and positive unit cost required');
    return BigInt(a.dividedToIntegerBy(c).toFixed(0));
  };
  const regions = prepared.regions.map((region) => {
    const s = input.support.find(
      (s) =>
        s.locationId === region.locationId && s.countryId === region.countryId,
    );
    if (
      !s ||
      s.costProvenance !== 'GENERATED_POLICY' ||
      !s.sourceRef ||
      !s.currency
    )
      invalid('funded input/cost source missing');
    for (const ref of [s.educationBudgetRef, s.healthcareBudgetRef]) {
      if (!ref || budgetRefs.has(ref)) invalid('budget reference reused');
      budgetRefs.add(ref);
    }
    const totalsForCountry = totals.get(region.countryId) ?? {
      currency: s.currency,
      education: parseWorldDecimal('0'),
      health: parseWorldDecimal('0'),
    };
    if (totalsForCountry.currency !== s.currency)
      invalid('mixed domestic currency');
    totalsForCountry.education = totalsForCountry.education.plus(
      parseWorldDecimal(s.educationBudgetAvailable),
    );
    totalsForCountry.health = totalsForCountry.health.plus(
      parseWorldDecimal(s.healthcareBudgetAvailable),
    );
    totals.set(region.countryId, totalsForCountry);
    const people = (occupation: string) =>
      prepared.demands
        .filter(
          (d) =>
            d.locationId === region.locationId && d.occupation === occupation,
        )
        .reduce((a, d) => a + n(positions.get(d.positionId)!.filledCount), 0n);
    const teachers = people('TEACHER'),
      doctors = people('DOCTOR'),
      nurses = people('NURSE'),
      technicians = people('MEDICAL_TECHNICIAN'),
      support = people('SUPPORT'),
      h = policy.healthcare;
    const desired = region.studentCohorts.reduce(
        (a, c) => a + n(c.desiredEnrollment),
        0n,
      ),
      applicants = region.studentCohorts.reduce(
        (a, c) => a + n(c.applicants),
        0n,
      );
    const educationBudgetSeats = budgetCapacity(
        s.educationBudgetAvailable,
        s.educationUnitCost,
      ),
      educationCapacity = min(
        n(region.sourceSchoolSeats),
        teachers * n(policy.education.studentsPerFilledQualifiedTeacher),
        n(s.educationMaterialSeats),
        educationBudgetSeats,
      ),
      enrolled = min(desired, educationCapacity);
    const education = calculateEducationOutcome({
      applicants: quantity(applicants, 'person'),
      seats: quantity(n(region.sourceSchoolSeats), 'person'),
      teacherSupportedSeats: quantity(
        teachers * n(policy.education.studentsPerFilledQualifiedTeacher),
        'person',
      ),
      budgetSupportedSeats: quantity(
        min(educationBudgetSeats, n(s.educationMaterialSeats)),
        'person',
      ),
      enrolled: quantity(enrolled, 'person'),
      dropoutRate: { amount: '0', unit: 'ratio' },
      completionRate: { amount: '1', unit: 'ratio' },
      durationReached: false,
    });
    const studentCounts = distribute(
      enrolled,
      region.studentCohorts.map((c) => n(c.desiredEnrollment)),
    );
    const staffCapacity = min(
      doctors * n(h.doctorsCasesPerSimDay),
      nurses * n(h.nursesCasesPerSimDay),
      technicians * n(h.techniciansCasesPerSimDay),
      support * n(h.supportCasesPerSimDay),
    );
    const supplyCapacity = min(
        n(s.medicineDoses) / n(h.dosesPerEpisode),
        n(s.equipmentEpisodes),
        n(s.waterEpisodes),
        n(s.powerEpisodes),
      ),
      healthBudgetCapacity = budgetCapacity(
        s.healthcareBudgetAvailable,
        s.healthcareUnitCost,
      ),
      facilityCapacity =
        n(region.sourceHospitalBeds) * n(h.facilityEpisodesPerBedSimDay);
    const potential = calculateHealthcareDelivery({
      newDemand: quantity(n(region.healthcare.newDemand), 'case'),
      priorBacklog: quantity(n(region.healthcare.priorBacklog), 'case'),
      staffCapacity: quantity(staffCapacity, 'case'),
      facilityCapacity: quantity(facilityCapacity, 'case'),
      supplyCapacity: quantity(supplyCapacity, 'case'),
      budgetCapacity: quantity(healthBudgetCapacity, 'case'),
    });
    const staffedBeds = min(
      n(region.sourceHospitalBeds),
      nurses * n(h.nurseBedCapacity),
      doctors * n(h.doctorBedCapacity),
    );
    const staffedOccupiedBeds = min(
      n(region.healthcare.occupiedBeds),
      staffedBeds,
    );
    return freeze({
      countryId: region.countryId,
      locationId: region.locationId,
      staffing: prepared.demands
        .filter((d) => d.locationId === region.locationId)
        .map((d) => ({
          positionId: d.positionId,
          occupation: d.occupation,
          skill: d.skill,
          requiredCount: d.requiredCount,
          filledCount: positions.get(d.positionId)!.filledCount,
        })),
      students: {
        actualEnrollment: education.actualEnrollment.amount,
        waitingOrUnenrolled: (applicants - enrolled).toString(),
        cohorts: region.studentCohorts.map((c, i) => ({
          ...c,
          enrolled: studentCounts[i]!.toString(),
          waiting: (n(c.applicants) - studentCounts[i]!).toString(),
        })),
        capacity: educationCapacity.toString(),
        employedTeachers: teachers.toString(),
      },
      healthcare: {
        ...region.healthcare,
        staffCapacity: staffCapacity.toString(),
        staffedBeds: staffedBeds.toString(),
        staffedOccupiedBeds: staffedOccupiedBeds.toString(),
        occupiedBedsWithoutStaffCoverage: (
          n(region.healthcare.occupiedBeds) - staffedOccupiedBeds
        ).toString(),
        supplyCapacity: supplyCapacity.toString(),
        budgetCapacity: healthBudgetCapacity.toString(),
        potentialEpisodesPerSimDay: potential.deliveredCare.amount,
        occupiedBedsRatio: calculateBedOccupancy(
          quantity(n(region.healthcare.occupiedBeds), 'bed'),
          quantity(n(region.sourceHospitalBeds), 'bed'),
        ),
        deliveredEpisodesAtGenesis: '0',
        queuedEpisodes: region.healthcare.queuedEpisodes,
      },
      funding: {
        ...s,
        educationRequiredPerSimDay: parseWorldDecimal(s.educationUnitCost)
          .times(enrolled.toString())
          .toFixed(),
        healthcarePotentialCostPerSimDay: parseWorldDecimal(
          s.healthcareUnitCost,
        )
          .times(potential.deliveredCare.amount)
          .toFixed(),
      },
      provenance: region.provenance,
    });
  });
  if (
    input.countryBudgets.length !== totals.size ||
    new Set(input.countryBudgets.map((c) => c.countryId)).size !== totals.size
  )
    invalid('unique funded country ceilings required');
  for (const c of input.countryBudgets) {
    const total = totals.get(c.countryId);
    if (
      !total ||
      !c.sourceRef ||
      total.currency !== c.currency ||
      total.education.greaterThan(parseWorldDecimal(c.educationAmount)) ||
      total.health.greaterThan(parseWorldDecimal(c.healthcareAmount))
    )
      invalid('regional budgets exceed country funded ceilings');
  }
  const finalized = freeze({
    schemaVersion: 'postwar-social-services-finalized-v1' as const,
    status: 'CAPACITY_VALIDATED_FOR_GENESIS_ASSEMBLY' as const,
    worldId: prepared.worldId,
    seedId: prepared.seedId,
    policyFingerprint: prepared.policyFingerprint,
    preparedFingerprint: prepared.fingerprint,
    regions,
    historyEvents: [] as const,
    financialPostings: [] as const,
    serviceEvents: [] as const,
    sourceAdmitted: false as const,
  });
  finalizedIssued.add(finalized);
  finalizedPreparations.set(finalized, prepared);
  return finalized;
}

/** Proven capacity calculation, still no admission, persistence or service execution. */
export type PostwarFinalizedSocialServiceGenesis = ReturnType<
  typeof finalizePostwarSocialServiceGenesis
>;
export function consumePostwarFinalizedSocialServiceGenesis(
  value: PostwarFinalizedSocialServiceGenesis,
  expectedPrepared?: PostwarSocialServiceGenesis,
): PostwarFinalizedSocialServiceGenesis {
  if (!finalizedIssued.has(value))
    invalid('genuine finalized social-service result required');
  const prepared = finalizedPreparations.get(value)!;
  consumePostwarSocialServiceGenesis(prepared);
  if (expectedPrepared && expectedPrepared !== prepared)
    invalid('finalized social result belongs to another preparation');
  if (
    value.preparedFingerprint !== prepared.fingerprint ||
    value.worldId !== prepared.worldId ||
    value.seedId !== prepared.seedId ||
    value.policyFingerprint !== prepared.policyFingerprint
  )
    invalid('finalized social preparation binding changed');
  return value;
}
