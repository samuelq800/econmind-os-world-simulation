import {
  boundedRatioOrNull,
  decimal,
  factor,
  kernelInvalid,
  maximum,
  minimum,
  nonNegative,
  ratioOrNull,
  render,
  type ExactDecimal,
  type WorldDecimalValue,
} from './common.js';

export interface PopulationCohorts {
  readonly children0To15: ExactDecimal;
  readonly workingAge16To64: ExactDecimal;
  readonly retired65Plus: ExactDecimal;
}

export interface PopulationFlows {
  readonly births: ExactDecimal;
  readonly childDeaths: ExactDecimal;
  readonly workingAgeDeaths: ExactDecimal;
  readonly retiredDeaths: ExactDecimal;
  readonly childImmigration: ExactDecimal;
  readonly workingAgeImmigration: ExactDecimal;
  readonly retiredImmigration: ExactDecimal;
  readonly childEmigration: ExactDecimal;
  readonly workingAgeEmigration: ExactDecimal;
  readonly retiredEmigration: ExactDecimal;
  readonly ageIntoWorkingAge: ExactDecimal;
  readonly ageIntoRetirement: ExactDecimal;
}

export interface PopulationTransitionResult {
  readonly cohorts: PopulationCohorts;
  readonly previousTotal: ExactDecimal;
  readonly nextTotal: ExactDecimal;
  readonly netMigration: ExactDecimal;
  readonly dependencyRatio: ExactDecimal | null;
}

function cohortValues(
  input: PopulationCohorts,
  label: string,
): readonly WorldDecimalValue[] {
  return [
    nonNegative(input.children0To15, `${label}.children0To15`),
    nonNegative(input.workingAge16To64, `${label}.workingAge16To64`),
    nonNegative(input.retired65Plus, `${label}.retired65Plus`),
  ];
}

export function totalPopulation(input: PopulationCohorts): ExactDecimal {
  return render(
    cohortValues(input, 'cohorts').reduce((total, value) => total.plus(value)),
  );
}

/** Implements the documented population identity and explicit cohort roll only. */
export function transitionPopulation(
  previous: PopulationCohorts,
  flows: PopulationFlows,
): PopulationTransitionResult {
  const values = cohortValues(previous, 'previous');
  const children = values[0]!;
  const workingAge = values[1]!;
  const retired = values[2]!;
  const births = nonNegative(flows.births, 'births');
  const childDeaths = nonNegative(flows.childDeaths, 'childDeaths');
  const workingDeaths = nonNegative(flows.workingAgeDeaths, 'workingAgeDeaths');
  const retiredDeaths = nonNegative(flows.retiredDeaths, 'retiredDeaths');
  const childImmigration = nonNegative(
    flows.childImmigration,
    'childImmigration',
  );
  const workingImmigration = nonNegative(
    flows.workingAgeImmigration,
    'workingAgeImmigration',
  );
  const retiredImmigration = nonNegative(
    flows.retiredImmigration,
    'retiredImmigration',
  );
  const childEmigration = nonNegative(flows.childEmigration, 'childEmigration');
  const workingEmigration = nonNegative(
    flows.workingAgeEmigration,
    'workingAgeEmigration',
  );
  const retiredEmigration = nonNegative(
    flows.retiredEmigration,
    'retiredEmigration',
  );
  const intoWorking = nonNegative(flows.ageIntoWorkingAge, 'ageIntoWorkingAge');
  const intoRetirement = nonNegative(
    flows.ageIntoRetirement,
    'ageIntoRetirement',
  );
  const nextChildren = children
    .plus(births)
    .plus(childImmigration)
    .minus(childDeaths)
    .minus(childEmigration)
    .minus(intoWorking);
  const nextWorking = workingAge
    .plus(workingImmigration)
    .plus(intoWorking)
    .minus(workingDeaths)
    .minus(workingEmigration)
    .minus(intoRetirement);
  const nextRetired = retired
    .plus(retiredImmigration)
    .plus(intoRetirement)
    .minus(retiredDeaths)
    .minus(retiredEmigration);
  if (
    nextChildren.isNegative() ||
    nextWorking.isNegative() ||
    nextRetired.isNegative()
  ) {
    kernelInvalid('Population transition would create a negative cohort');
  }
  const previousTotal = children.plus(workingAge).plus(retired);
  const nextTotal = nextChildren.plus(nextWorking).plus(nextRetired);
  const expectedTotal = previousTotal
    .plus(births)
    .minus(childDeaths)
    .minus(workingDeaths)
    .minus(retiredDeaths)
    .plus(childImmigration)
    .plus(workingImmigration)
    .plus(retiredImmigration)
    .minus(childEmigration)
    .minus(workingEmigration)
    .minus(retiredEmigration);
  if (!nextTotal.equals(expectedTotal))
    kernelInvalid('Population identity does not reconcile');
  return Object.freeze({
    cohorts: Object.freeze({
      children0To15: render(nextChildren),
      workingAge16To64: render(nextWorking),
      retired65Plus: render(nextRetired),
    }),
    previousTotal: render(previousTotal),
    nextTotal: render(nextTotal),
    netMigration: render(
      childImmigration
        .plus(workingImmigration)
        .plus(retiredImmigration)
        .minus(childEmigration)
        .minus(workingEmigration)
        .minus(retiredEmigration),
    ),
    dependencyRatio: ratioOrNull(nextChildren.plus(nextRetired), nextWorking),
  });
}

export interface LabourMetricsInput {
  readonly employed: ExactDecimal;
  readonly unemployedSearching: ExactDecimal;
  readonly workingAgePopulation: ExactDecimal;
  readonly requiredWorkers: ExactDecimal;
  readonly availableWorkers: ExactDecimal;
}

export function calculateLabourMetrics(input: LabourMetricsInput) {
  const employed = nonNegative(input.employed, 'employed');
  const unemployed = nonNegative(
    input.unemployedSearching,
    'unemployedSearching',
  );
  const workingAge = nonNegative(
    input.workingAgePopulation,
    'workingAgePopulation',
  );
  const required = nonNegative(input.requiredWorkers, 'requiredWorkers');
  const available = nonNegative(input.availableWorkers, 'availableWorkers');
  const labourForce = employed.plus(unemployed);
  return Object.freeze({
    labourForce: render(labourForce),
    labourForceParticipationRate: ratioOrNull(labourForce, workingAge),
    unemploymentRate: ratioOrNull(unemployed, labourForce),
    vacancy: render(
      maximum([required.minus(employed), decimal('0', 'zero')], 'vacancy'),
    ),
    skillGap: render(required.minus(available)),
    labourAvailability: boundedRatioOrNull(available, required),
  });
}

export interface LabourMatchInput {
  readonly unemployedSupply: ExactDecimal;
  readonly vacancyDemand: ExactDecimal;
  readonly matchingCapacity: ExactDecimal;
  readonly skillMatches: boolean;
  readonly locationMatches: boolean;
  readonly offeredWageMeetsMinimum: boolean;
}

/** Matches only explicitly compatible workers; it never manufactures a worker. */
export function calculateLabourMatch(input: LabourMatchInput) {
  const supply = nonNegative(input.unemployedSupply, 'unemployedSupply');
  const demand = nonNegative(input.vacancyDemand, 'vacancyDemand');
  const capacity = nonNegative(input.matchingCapacity, 'matchingCapacity');
  const eligible =
    input.skillMatches &&
    input.locationMatches &&
    input.offeredWageMeetsMinimum;
  const matched = eligible
    ? minimum([supply, demand, capacity], 'labour match')
    : decimal('0', 'zero');
  return Object.freeze({
    matched: render(matched),
    remainingUnemployed: render(supply.minus(matched)),
    remainingVacancies: render(demand.minus(matched)),
    reason: eligible ? null : 'INCOMPATIBLE_SKILL_LOCATION_OR_WAGE',
  });
}

/** Verifies that sector and public-service allocations consume one employment pool. */
export function assertEmploymentAllocation(input: {
  readonly aggregateEmployed: ExactDecimal;
  readonly sectorEmployment: readonly ExactDecimal[];
  readonly publicServiceEmployment: readonly ExactDecimal[];
}): void {
  const aggregate = nonNegative(input.aggregateEmployed, 'aggregateEmployed');
  const allocated = [
    ...input.sectorEmployment,
    ...input.publicServiceEmployment,
  ].reduce(
    (sum, value) => sum.plus(nonNegative(value, 'employment allocation')),
    decimal('0', 'zero'),
  );
  if (!allocated.equals(aggregate))
    kernelInvalid(
      'Sector and public-service employment must equal aggregate employed',
    );
}

export interface EducationOutcomeInput {
  readonly applicants: ExactDecimal;
  readonly seats: ExactDecimal;
  readonly teacherSupportedSeats: ExactDecimal;
  readonly budgetSupportedSeats: ExactDecimal;
  readonly enrolled: ExactDecimal;
  readonly dropoutRate: ExactDecimal;
  readonly completionRate: ExactDecimal;
  readonly durationReached: boolean;
}

/** E04: seats, teachers and budget all constrain enrolment; graduation uses SimTime eligibility supplied by caller. */
export function calculateEducationOutcome(input: EducationOutcomeInput) {
  const enrollment = minimum(
    [
      nonNegative(input.applicants, 'applicants'),
      nonNegative(input.seats, 'seats'),
      nonNegative(input.teacherSupportedSeats, 'teacherSupportedSeats'),
      nonNegative(input.budgetSupportedSeats, 'budgetSupportedSeats'),
    ],
    'education enrollment',
  );
  const enrolled = nonNegative(input.enrolled, 'enrolled');
  const graduates = input.durationReached
    ? enrolled
        .times(
          decimal('1', 'one').minus(factor(input.dropoutRate, 'dropoutRate')),
        )
        .times(factor(input.completionRate, 'completionRate'))
    : decimal('0', 'zero');
  return Object.freeze({
    actualEnrollment: render(enrollment),
    applicantsNotEnrolled: render(
      nonNegative(input.applicants, 'applicants').minus(enrollment),
    ),
    graduates: render(graduates),
    skillTransition: graduates.isZero()
      ? null
      : 'CALLER_MUST_POST_VOCATIONAL_OR_HIGHER_TRANSITION',
  });
}

export function deriveEducationSkillHandoff(input: {
  readonly level: 'BASIC' | 'VOCATIONAL' | 'HIGHER';
  readonly graduates: ExactDecimal;
}): Readonly<{
  readonly skill: 'MEDIUM' | 'HIGH' | null;
  readonly count: ExactDecimal;
}> {
  const count = nonNegative(input.graduates, 'graduates');
  return Object.freeze({
    skill:
      input.level === 'VOCATIONAL'
        ? 'MEDIUM'
        : input.level === 'HIGHER'
          ? 'HIGH'
          : null,
    count: render(count),
  });
}

export interface HealthcareDeliveryInput {
  readonly newDemand: ExactDecimal;
  readonly priorBacklog: ExactDecimal;
  readonly staffCapacity: ExactDecimal;
  readonly facilityCapacity: ExactDecimal;
  readonly supplyCapacity: ExactDecimal;
  readonly budgetCapacity: ExactDecimal;
}

export function calculateHealthcareDelivery(input: HealthcareDeliveryInput) {
  const totalDemand = nonNegative(input.newDemand, 'newDemand').plus(
    nonNegative(input.priorBacklog, 'priorBacklog'),
  );
  const delivered = minimum(
    [
      totalDemand,
      nonNegative(input.staffCapacity, 'staffCapacity'),
      nonNegative(input.facilityCapacity, 'facilityCapacity'),
      nonNegative(input.supplyCapacity, 'supplyCapacity'),
      nonNegative(input.budgetCapacity, 'budgetCapacity'),
    ],
    'healthcare delivery',
  );
  return Object.freeze({
    deliveredCare: render(delivered),
    nextBacklog: render(totalDemand.minus(delivered)),
  });
}

export function calculateBedOccupancy(
  occupiedBeds: ExactDecimal,
  availableBeds: ExactDecimal,
): ExactDecimal | null {
  const occupied = nonNegative(occupiedBeds, 'occupiedBeds');
  const available = nonNegative(availableBeds, 'availableBeds');
  if (occupied.greaterThan(available))
    kernelInvalid('Occupied beds cannot exceed available beds');
  return ratioOrNull(occupied, available);
}

export interface HousingMetricsInput {
  readonly householdDemand: ExactDecimal;
  readonly habitableUnits: ExactDecimal;
  readonly vacantHabitableUnits: ExactDecimal;
  readonly housingCost: ExactDecimal;
  readonly disposableIncome: ExactDecimal;
}

export function calculateHousingMetrics(input: HousingMetricsInput) {
  const demand = nonNegative(input.householdDemand, 'householdDemand');
  const habitable = nonNegative(input.habitableUnits, 'habitableUnits');
  const vacant = nonNegative(
    input.vacantHabitableUnits,
    'vacantHabitableUnits',
  );
  if (vacant.greaterThan(habitable))
    kernelInvalid('Vacant units cannot exceed habitable units');
  const cost = nonNegative(input.housingCost, 'housingCost');
  const income = nonNegative(input.disposableIncome, 'disposableIncome');
  const netGap = demand.minus(habitable);
  return Object.freeze({
    netHousingGap: render(netGap),
    unmetHousingUnits: render(
      maximum([netGap, decimal('0', 'zero')], 'unmet housing units'),
    ),
    vacancyRate: ratioOrNull(vacant, habitable),
    housingBurden: ratioOrNull(cost, income),
  });
}

export interface SafetyMetricsInput {
  readonly employedStaff: ExactDecimal;
  readonly deployedStaff: ExactDecimal;
  readonly unavailableStaff: ExactDecimal;
  readonly recordedIncidents: ExactDecimal;
  readonly population: ExactDecimal;
  readonly priorBacklog: ExactDecimal;
  readonly newCases: ExactDecimal;
  readonly resolvedCases: ExactDecimal;
  readonly casesHandled: ExactDecimal;
}

export function calculateSafetyMetrics(input: SafetyMetricsInput) {
  const employed = nonNegative(input.employedStaff, 'employedStaff');
  const deployed = nonNegative(input.deployedStaff, 'deployedStaff');
  const unavailable = nonNegative(input.unavailableStaff, 'unavailableStaff');
  const available = employed.minus(deployed).minus(unavailable);
  if (available.isNegative())
    kernelInvalid('Public-safety deployment exceeds employed staff');
  const prior = nonNegative(input.priorBacklog, 'priorBacklog');
  const newCases = nonNegative(input.newCases, 'newCases');
  const resolved = nonNegative(input.resolvedCases, 'resolvedCases');
  const backlog = prior.plus(newCases).minus(resolved);
  if (backlog.isNegative())
    kernelInvalid('Resolved cases cannot exceed available backlog');
  return Object.freeze({
    availableStaff: render(available),
    crimeRatePer100k: ratioOrNull(
      nonNegative(input.recordedIncidents, 'recordedIncidents').times(100000),
      nonNegative(input.population, 'population'),
    ),
    caseClearanceRate: ratioOrNull(
      resolved,
      nonNegative(input.casesHandled, 'casesHandled'),
    ),
    nextBacklog: render(backlog),
  });
}

export function allocateSafetyDeployment(input: {
  readonly availableStaff: ExactDecimal;
  readonly requestedStaff: ExactDecimal;
}): Readonly<{
  readonly deployed: ExactDecimal;
  readonly remainingAvailable: ExactDecimal;
}> {
  const available = nonNegative(input.availableStaff, 'availableStaff');
  const requested = nonNegative(input.requestedStaff, 'requestedStaff');
  if (requested.greaterThan(available))
    kernelInvalid('Safety deployment exceeds available staff');
  return Object.freeze({
    deployed: render(requested),
    remainingAvailable: render(available.minus(requested)),
  });
}
