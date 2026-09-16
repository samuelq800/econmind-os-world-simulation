import {
  decimal,
  kernelInvalid,
  maximum,
  minimum,
  money,
  ratio,
  render,
  renderQuantity,
  renderUnitRate,
  type ExactMoney,
  type ExactQuantity,
  type ExactRatio,
  type ExactUnitRate,
  type WorldDecimalValue,
  wholeQuantity,
} from './common.js';

export interface PopulationCohorts {
  readonly children0To15: ExactQuantity;
  readonly workingAge16To64: ExactQuantity;
  readonly retired65Plus: ExactQuantity;
}

export interface PopulationFlows {
  readonly births: ExactQuantity;
  readonly childDeaths: ExactQuantity;
  readonly workingAgeDeaths: ExactQuantity;
  readonly retiredDeaths: ExactQuantity;
  readonly childImmigration: ExactQuantity;
  readonly workingAgeImmigration: ExactQuantity;
  readonly retiredImmigration: ExactQuantity;
  readonly childEmigration: ExactQuantity;
  readonly workingAgeEmigration: ExactQuantity;
  readonly retiredEmigration: ExactQuantity;
  readonly ageIntoWorkingAge: ExactQuantity;
  readonly ageIntoRetirement: ExactQuantity;
}

export interface PopulationTransitionResult {
  readonly cohorts: PopulationCohorts;
  readonly previousTotal: ExactQuantity;
  readonly nextTotal: ExactQuantity;
  readonly netMigration: ExactQuantity;
  readonly dependencyRatio: ExactUnitRate | null;
}

function person(value: ExactQuantity, label: string): WorldDecimalValue {
  return wholeQuantity(value, 'person', label).amount;
}

function ratioResult(
  numerator: WorldDecimalValue,
  denominator: WorldDecimalValue,
): ExactRatio | null {
  return denominator.isZero()
    ? null
    : Object.freeze({
        amount: render(numerator.dividedBy(denominator)),
        unit: 'ratio',
      });
}

function unitRateResult(
  numerator: WorldDecimalValue,
  denominator: WorldDecimalValue,
  outputUnit: string,
  inputUnit: string,
): ExactUnitRate | null {
  return denominator.isZero()
    ? null
    : renderUnitRate(numerator.dividedBy(denominator), outputUnit, inputUnit);
}

export function totalPopulation(input: PopulationCohorts): ExactQuantity {
  return renderQuantity(
    person(input.children0To15, 'children0To15')
      .plus(person(input.workingAge16To64, 'workingAge16To64'))
      .plus(person(input.retired65Plus, 'retired65Plus')),
    'person',
  );
}

/** Implements the cohort identity with whole, unit-labelled people only. */
export function transitionPopulation(
  previous: PopulationCohorts,
  flows: PopulationFlows,
): PopulationTransitionResult {
  const children = person(previous.children0To15, 'previous.children0To15');
  const working = person(
    previous.workingAge16To64,
    'previous.workingAge16To64',
  );
  const retired = person(previous.retired65Plus, 'previous.retired65Plus');
  const births = person(flows.births, 'births');
  const childDeaths = person(flows.childDeaths, 'childDeaths');
  const workingDeaths = person(flows.workingAgeDeaths, 'workingAgeDeaths');
  const retiredDeaths = person(flows.retiredDeaths, 'retiredDeaths');
  const childImmigration = person(flows.childImmigration, 'childImmigration');
  const workingImmigration = person(
    flows.workingAgeImmigration,
    'workingAgeImmigration',
  );
  const retiredImmigration = person(
    flows.retiredImmigration,
    'retiredImmigration',
  );
  const childEmigration = person(flows.childEmigration, 'childEmigration');
  const workingEmigration = person(
    flows.workingAgeEmigration,
    'workingAgeEmigration',
  );
  const retiredEmigration = person(
    flows.retiredEmigration,
    'retiredEmigration',
  );
  const intoWorking = person(flows.ageIntoWorkingAge, 'ageIntoWorkingAge');
  const intoRetirement = person(flows.ageIntoRetirement, 'ageIntoRetirement');
  const nextChildren = children
    .plus(births)
    .plus(childImmigration)
    .minus(childDeaths)
    .minus(childEmigration)
    .minus(intoWorking);
  const nextWorking = working
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
  const previousTotal = children.plus(working).plus(retired);
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
      children0To15: renderQuantity(nextChildren, 'person'),
      workingAge16To64: renderQuantity(nextWorking, 'person'),
      retired65Plus: renderQuantity(nextRetired, 'person'),
    }),
    previousTotal: renderQuantity(previousTotal, 'person'),
    nextTotal: renderQuantity(nextTotal, 'person'),
    netMigration: renderQuantity(
      childImmigration
        .plus(workingImmigration)
        .plus(retiredImmigration)
        .minus(childEmigration)
        .minus(workingEmigration)
        .minus(retiredEmigration),
      'person',
    ),
    dependencyRatio: unitRateResult(
      nextChildren.plus(nextRetired),
      nextWorking,
      'person',
      'person',
    ),
  });
}

export interface LabourMetricsInput {
  readonly employed: ExactQuantity;
  readonly unemployedSearching: ExactQuantity;
  readonly workingAgePopulation: ExactQuantity;
  readonly requiredWorkers: ExactQuantity;
  readonly availableWorkers: ExactQuantity;
}

export function calculateLabourMetrics(input: LabourMetricsInput) {
  const employed = person(input.employed, 'employed');
  const unemployed = person(input.unemployedSearching, 'unemployedSearching');
  const workingAge = person(input.workingAgePopulation, 'workingAgePopulation');
  const required = person(input.requiredWorkers, 'requiredWorkers');
  const available = person(input.availableWorkers, 'availableWorkers');
  const labourForce = employed.plus(unemployed);
  if (labourForce.greaterThan(workingAge)) {
    kernelInvalid('Labour force cannot exceed working-age population');
  }
  return Object.freeze({
    labourForce: renderQuantity(labourForce, 'person'),
    labourForceParticipationRate: ratioResult(labourForce, workingAge),
    unemploymentRate: ratioResult(unemployed, labourForce),
    vacancy: renderQuantity(
      maximum([required.minus(employed), decimal('0', 'zero')], 'vacancy'),
      'person',
    ),
    skillGap: renderQuantity(
      maximum([required.minus(available), decimal('0', 'zero')], 'skill gap'),
      'person',
    ),
    skillSurplus: renderQuantity(
      maximum(
        [available.minus(required), decimal('0', 'zero')],
        'skill surplus',
      ),
      'person',
    ),
    labourAvailability: ratioResult(
      minimum([available, required], 'available workers'),
      required,
    ),
  });
}

export interface LabourMatchInput {
  readonly unemployedSupply: ExactQuantity;
  readonly vacancyDemand: ExactQuantity;
  readonly matchingCapacity: ExactQuantity;
  readonly skillMatches: boolean;
  readonly locationMatches: boolean;
  readonly offeredWageMeetsMinimum: boolean;
}

export function calculateLabourMatch(input: LabourMatchInput) {
  const supply = person(input.unemployedSupply, 'unemployedSupply');
  const demand = person(input.vacancyDemand, 'vacancyDemand');
  const capacity = person(input.matchingCapacity, 'matchingCapacity');
  const eligible =
    input.skillMatches &&
    input.locationMatches &&
    input.offeredWageMeetsMinimum;
  const matched = eligible
    ? minimum([supply, demand, capacity], 'labour match')
    : decimal('0', 'zero');
  return Object.freeze({
    matched: renderQuantity(matched, 'person'),
    remainingUnemployed: renderQuantity(supply.minus(matched), 'person'),
    remainingVacancies: renderQuantity(demand.minus(matched), 'person'),
    reason: eligible ? null : 'INCOMPATIBLE_SKILL_LOCATION_OR_WAGE',
  });
}

export function assertEmploymentAllocation(input: {
  readonly aggregateEmployed: ExactQuantity;
  readonly sectorEmployment: readonly ExactQuantity[];
  readonly publicServiceEmployment: readonly ExactQuantity[];
}): void {
  const aggregate = person(input.aggregateEmployed, 'aggregateEmployed');
  const allocated = [
    ...input.sectorEmployment,
    ...input.publicServiceEmployment,
  ].reduce(
    (sum, value) => sum.plus(person(value, 'employment allocation')),
    decimal('0', 'zero'),
  );
  if (!allocated.equals(aggregate)) {
    kernelInvalid(
      'Sector and public-service employment must equal aggregate employed',
    );
  }
}

export interface EducationOutcomeInput {
  readonly applicants: ExactQuantity;
  readonly seats: ExactQuantity;
  readonly teacherSupportedSeats: ExactQuantity;
  readonly budgetSupportedSeats: ExactQuantity;
  readonly enrolled: ExactQuantity;
  readonly dropoutRate: ExactRatio;
  readonly completionRate: ExactRatio;
  readonly durationReached: boolean;
}

export function calculateEducationOutcome(input: EducationOutcomeInput) {
  const applicants = person(input.applicants, 'applicants');
  const enrollmentCapacity = minimum(
    [
      applicants,
      person(input.seats, 'seats'),
      person(input.teacherSupportedSeats, 'teacherSupportedSeats'),
      person(input.budgetSupportedSeats, 'budgetSupportedSeats'),
    ],
    'education enrollment',
  );
  const enrolled = person(input.enrolled, 'enrolled');
  if (enrolled.greaterThan(enrollmentCapacity)) {
    kernelInvalid('Enrolled students cannot exceed actual enrollment capacity');
  }
  const graduates = input.durationReached
    ? enrolled
        .times(
          decimal('1', 'one').minus(ratio(input.dropoutRate, 'dropoutRate')),
        )
        .times(ratio(input.completionRate, 'completionRate'))
    : decimal('0', 'zero');
  if (!graduates.isInteger()) {
    kernelInvalid('Education outcome requires a whole graduate count');
  }
  return Object.freeze({
    actualEnrollment: renderQuantity(enrolled, 'person'),
    enrollmentCapacity: renderQuantity(enrollmentCapacity, 'person'),
    applicantsNotEnrolled: renderQuantity(applicants.minus(enrolled), 'person'),
    graduates: renderQuantity(graduates, 'person'),
    skillTransition: graduates.isZero()
      ? null
      : 'CALLER_MUST_POST_VOCATIONAL_OR_HIGHER_TRANSITION',
  });
}

export function deriveEducationSkillHandoff(input: {
  readonly level: 'BASIC' | 'VOCATIONAL' | 'HIGHER';
  readonly graduates: ExactQuantity;
}): Readonly<{
  readonly skill: 'MEDIUM' | 'HIGH' | null;
  readonly count: ExactQuantity;
}> {
  const count = person(input.graduates, 'graduates');
  return Object.freeze({
    skill:
      input.level === 'VOCATIONAL'
        ? 'MEDIUM'
        : input.level === 'HIGHER'
          ? 'HIGH'
          : null,
    count: renderQuantity(count, 'person'),
  });
}

export interface HealthcareDeliveryInput {
  readonly newDemand: ExactQuantity;
  readonly priorBacklog: ExactQuantity;
  readonly staffCapacity: ExactQuantity;
  readonly facilityCapacity: ExactQuantity;
  readonly supplyCapacity: ExactQuantity;
  readonly budgetCapacity: ExactQuantity;
}

export function calculateHealthcareDelivery(input: HealthcareDeliveryInput) {
  const totalDemand = wholeQuantity(
    input.newDemand,
    'case',
    'newDemand',
  ).amount.plus(
    wholeQuantity(input.priorBacklog, 'case', 'priorBacklog').amount,
  );
  const delivered = minimum(
    [
      totalDemand,
      wholeQuantity(input.staffCapacity, 'case', 'staffCapacity').amount,
      wholeQuantity(input.facilityCapacity, 'case', 'facilityCapacity').amount,
      wholeQuantity(input.supplyCapacity, 'case', 'supplyCapacity').amount,
      wholeQuantity(input.budgetCapacity, 'case', 'budgetCapacity').amount,
    ],
    'healthcare delivery',
  );
  return Object.freeze({
    deliveredCare: renderQuantity(delivered, 'case'),
    nextBacklog: renderQuantity(totalDemand.minus(delivered), 'case'),
  });
}

export function calculateBedOccupancy(
  occupiedBeds: ExactQuantity,
  availableBeds: ExactQuantity,
): ExactRatio | null {
  const occupied = wholeQuantity(occupiedBeds, 'bed', 'occupiedBeds').amount;
  const available = wholeQuantity(availableBeds, 'bed', 'availableBeds').amount;
  if (occupied.greaterThan(available)) {
    kernelInvalid('Occupied beds cannot exceed available beds');
  }
  return ratioResult(occupied, available);
}

export interface HousingMetricsInput {
  readonly householdDemand: ExactQuantity;
  readonly habitableUnits: ExactQuantity;
  readonly vacantHabitableUnits: ExactQuantity;
  readonly housingCost: ExactMoney;
  readonly disposableIncome: ExactMoney;
}

export function calculateHousingMetrics(input: HousingMetricsInput) {
  const demand = wholeQuantity(
    input.householdDemand,
    'housing_unit',
    'householdDemand',
  ).amount;
  const habitable = wholeQuantity(
    input.habitableUnits,
    'housing_unit',
    'habitableUnits',
  ).amount;
  const vacant = wholeQuantity(
    input.vacantHabitableUnits,
    'housing_unit',
    'vacantHabitableUnits',
  ).amount;
  if (vacant.greaterThan(habitable)) {
    kernelInvalid('Vacant units cannot exceed habitable units');
  }
  const housingCost = money(input.housingCost, 'housingCost');
  const disposableIncome = money(input.disposableIncome, 'disposableIncome');
  if (housingCost.currency !== disposableIncome.currency) {
    kernelInvalid('Housing cost and disposable income currencies must match');
  }
  if (housingCost.amount.isNegative() || disposableIncome.amount.isNegative()) {
    kernelInvalid('Housing cost and disposable income must be non-negative');
  }
  const cost = housingCost.amount;
  const income = disposableIncome.amount;
  const netGap = demand.minus(habitable);
  return Object.freeze({
    netHousingGap: Object.freeze({
      amount: render(netGap),
      unit: 'housing_unit',
    }),
    unmetHousingUnits: renderQuantity(
      maximum([netGap, decimal('0', 'zero')], 'unmet housing units'),
      'housing_unit',
    ),
    vacancyRate: ratioResult(vacant, habitable),
    housingBurden: unitRateResult(
      cost,
      income,
      housingCost.currency,
      disposableIncome.currency,
    ),
  });
}

export interface SafetyMetricsInput {
  readonly employedStaff: ExactQuantity;
  readonly deployedStaff: ExactQuantity;
  readonly unavailableStaff: ExactQuantity;
  readonly recordedIncidents: ExactQuantity;
  readonly population: ExactQuantity;
  readonly priorBacklog: ExactQuantity;
  readonly newCases: ExactQuantity;
  readonly resolvedCases: ExactQuantity;
  readonly casesHandled: ExactQuantity;
}

export function calculateSafetyMetrics(input: SafetyMetricsInput) {
  const employed = person(input.employedStaff, 'employedStaff');
  const deployed = person(input.deployedStaff, 'deployedStaff');
  const unavailable = person(input.unavailableStaff, 'unavailableStaff');
  const available = employed.minus(deployed).minus(unavailable);
  if (available.isNegative()) {
    kernelInvalid('Public-safety deployment exceeds employed staff');
  }
  const prior = wholeQuantity(
    input.priorBacklog,
    'case',
    'priorBacklog',
  ).amount;
  const newCases = wholeQuantity(input.newCases, 'case', 'newCases').amount;
  const resolved = wholeQuantity(
    input.resolvedCases,
    'case',
    'resolvedCases',
  ).amount;
  const backlog = prior.plus(newCases).minus(resolved);
  if (backlog.isNegative()) {
    kernelInvalid('Resolved cases cannot exceed available backlog');
  }
  const incidents = wholeQuantity(
    input.recordedIncidents,
    'incident',
    'recordedIncidents',
  ).amount;
  const population = person(input.population, 'population');
  const handled = wholeQuantity(
    input.casesHandled,
    'case',
    'casesHandled',
  ).amount;
  if (resolved.greaterThan(handled)) {
    kernelInvalid('Resolved cases cannot exceed cases handled');
  }
  return Object.freeze({
    availableStaff: renderQuantity(available, 'person'),
    crimeRatePer100k: population.isZero()
      ? null
      : Object.freeze({
          amount: render(incidents.times(100000).dividedBy(population)),
          unit: 'incident_per_100k_person',
        }),
    caseClearanceRate: ratioResult(resolved, handled),
    nextBacklog: renderQuantity(backlog, 'case'),
  });
}

export function allocateSafetyDeployment(input: {
  readonly availableStaff: ExactQuantity;
  readonly requestedStaff: ExactQuantity;
}): Readonly<{
  readonly deployed: ExactQuantity;
  readonly remainingAvailable: ExactQuantity;
}> {
  const available = person(input.availableStaff, 'availableStaff');
  const requested = person(input.requestedStaff, 'requestedStaff');
  if (requested.greaterThan(available)) {
    kernelInvalid('Safety deployment exceeds available staff');
  }
  return Object.freeze({
    deployed: renderQuantity(requested, 'person'),
    remainingAvailable: renderQuantity(available.minus(requested), 'person'),
  });
}
