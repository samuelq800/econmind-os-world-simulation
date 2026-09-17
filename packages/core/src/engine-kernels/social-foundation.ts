import {
  kernelInvalid,
  minimum,
  money,
  nonNegative,
  nonNegativeQuantity,
  ratio,
  render,
  renderMoney,
  renderQuantity,
  unitPrice,
  unitRate,
  wholeQuantity,
  type ExactMoney,
  type ExactQuantity,
  type ExactRatio,
  type ExactUnitPrice,
  type ExactUnitRate,
  type WorldDecimalValue,
} from './common.js';

/**
 * Pure E04--E07 foundation calculations. These records deliberately expose
 * operational capacity and handoffs only: authority, persistence, commands,
 * events, and policy formulae remain outside the Core boundary.
 */
export type SocialFoundationModule =
  'E04_EDUCATION' | 'E05_HEALTHCARE' | 'E06_HOUSING' | 'E07_PUBLIC_SAFETY';

export interface SocialFoundationTraceRequest {
  readonly traceId: string;
  readonly calculationVersion: string;
}

export interface SocialFoundationTransition {
  readonly stateId: string;
  readonly metric: string;
  readonly before: ExactQuantity;
  readonly after: ExactQuantity;
}

export interface SocialFoundationReplayTrace {
  readonly traceId: string;
  readonly calculationVersion: string;
  readonly module: SocialFoundationModule;
  readonly inputIds: readonly string[];
  readonly outputIds: readonly string[];
  readonly transitions: readonly SocialFoundationTransition[];
}

const FOUNDATION_ID = /^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u;
const METRIC = /^[a-z][a-z0-9_]{0,63}$/u;

function foundationId(value: string, label: string): string {
  if (!FOUNDATION_ID.test(value)) {
    kernelInvalid(`${label} must be a canonical foundation identifier`);
  }
  return value;
}

function requiredMetric(value: string): string {
  if (!METRIC.test(value)) kernelInvalid('Trace metric must be canonical');
  return value;
}

function distinctIds(
  values: readonly string[],
  label: string,
): readonly string[] {
  const result = values.map((value) => foundationId(value, label));
  if (new Set(result).size !== result.length) {
    kernelInvalid(`${label} must not repeat an identifier`);
  }
  return Object.freeze(result);
}

function whole(
  value: ExactQuantity,
  expectedUnit: string,
  label: string,
): WorldDecimalValue {
  return wholeQuantity(value, expectedUnit, label).amount;
}

function wholeResult(
  value: WorldDecimalValue,
  expectedUnit: string,
  label: string,
): WorldDecimalValue {
  if (value.isNegative() || !value.isInteger()) {
    kernelInvalid(
      `${label} must resolve to a whole non-negative ${expectedUnit}`,
    );
  }
  return value;
}

function time(
  value: ExactQuantity,
  expectedUnit: 'sim_day' | 'sim_millisecond',
  label: string,
): WorldDecimalValue {
  return nonNegativeQuantity(value, expectedUnit, label).amount;
}

function nonNegativeMoney(value: ExactMoney, label: string): ExactMoney {
  const parsed = money(value, label);
  if (parsed.amount.isNegative())
    kernelInvalid(`${label} must be non-negative`);
  return renderMoney(parsed.amount, parsed.currency);
}

function transition(
  stateId: string,
  metric: string,
  before: WorldDecimalValue,
  after: WorldDecimalValue,
  unit: string,
): SocialFoundationTransition {
  if (before.isNegative() || after.isNegative()) {
    kernelInvalid(`Trace transition ${metric} cannot be negative`);
  }
  return Object.freeze({
    stateId: foundationId(stateId, 'Trace stateId'),
    metric: requiredMetric(metric),
    before: renderQuantity(before, unit),
    after: renderQuantity(after, unit),
  });
}

function replayTrace(
  module: SocialFoundationModule,
  request: SocialFoundationTraceRequest,
  inputIds: readonly string[],
  outputIds: readonly string[],
  transitions: readonly SocialFoundationTransition[],
): SocialFoundationReplayTrace {
  return Object.freeze({
    traceId: foundationId(request.traceId, 'traceId'),
    calculationVersion: foundationId(
      request.calculationVersion,
      'calculationVersion',
    ),
    module,
    inputIds: distinctIds(inputIds, 'Trace inputIds'),
    outputIds: distinctIds(outputIds, 'Trace outputIds'),
    transitions: Object.freeze([...transitions]),
  });
}

export type EducationLevel = 'BASIC' | 'VOCATIONAL' | 'HIGHER';
export type EducationSkill = 'MEDIUM' | 'HIGH';

export interface EducationFoundationInput {
  readonly trace: SocialFoundationTraceRequest;
  readonly outcomeId: string;
  readonly nextCohortId: string;
  readonly enrollmentRequestId: string;
  readonly applicantPool: {
    readonly applicantPoolId: string;
    readonly applicants: ExactQuantity;
  };
  readonly capacity: {
    readonly teacherWorkforceId: string;
    readonly teachers: ExactQuantity;
    readonly facilityId: string;
    readonly seats: ExactQuantity;
    readonly budgetCapacityId: string;
    readonly budgetSupportedSeats: ExactQuantity;
    readonly studentsPerTeacher: ExactUnitRate;
  };
  readonly cohort: {
    readonly cohortId: string;
    readonly trainingProgrammeId: string;
    readonly level: EducationLevel;
    readonly specialisationId: string | null;
    readonly enrolled: ExactQuantity;
    readonly cumulativeGraduates: ExactQuantity;
    readonly elapsedDuration: ExactQuantity;
    readonly requiredDuration: ExactQuantity;
  };
  readonly newEnrollment: ExactQuantity;
  readonly graduation: {
    readonly dropoutRate: ExactRatio;
    readonly completionRate: ExactRatio;
  };
  readonly skillTarget: {
    readonly handoffId: string;
    readonly labourSkillStockId: string;
    readonly skill: EducationSkill;
    readonly before: ExactQuantity;
  } | null;
}

export interface EducationSkillHandoff {
  readonly handoffId: string;
  readonly trainingProgrammeId: string;
  readonly cohortId: string;
  readonly targetSkillStockId: string;
  readonly skill: EducationSkill;
  readonly graduatesTransferred: ExactQuantity;
  readonly before: ExactQuantity;
  readonly after: ExactQuantity;
}

export interface EducationFoundationResult {
  readonly outcomeId: string;
  readonly capacity: {
    readonly teacherSupportedSeats: ExactQuantity;
    readonly actualSeats: ExactQuantity;
  };
  readonly admitted: ExactQuantity;
  readonly graduates: ExactQuantity;
  readonly nextCohort: {
    readonly cohortId: string;
    readonly enrolled: ExactQuantity;
    readonly cumulativeGraduates: ExactQuantity;
  };
  readonly skillHandoff: EducationSkillHandoff | null;
  /** Education itself cannot emit an instantaneous productivity modifier. */
  readonly directProductivityEffect: null;
  readonly trace: SocialFoundationReplayTrace;
}

/**
 * A caller must present each real person pool once before allocating it to a
 * social service. This catches double occupation without inventing a staffing
 * formula or taking ownership of the labour ledger.
 */
export function assertSocialFoundationPersonnelAllocation(input: {
  readonly allocations: readonly {
    readonly personPoolId: string;
    readonly availablePeople: ExactQuantity;
    readonly assignedPeople: ExactQuantity;
  }[];
}): void {
  if (input.allocations.length === 0) {
    kernelInvalid('Personnel allocation requires at least one person pool');
  }
  const personPoolIds = distinctIds(
    input.allocations.map((allocation) => allocation.personPoolId),
    'Personnel allocation personPoolIds',
  );
  for (const [index, allocation] of input.allocations.entries()) {
    const available = whole(
      allocation.availablePeople,
      'person',
      `allocations[${index}].availablePeople`,
    );
    const assigned = whole(
      allocation.assignedPeople,
      'person',
      `allocations[${index}].assignedPeople`,
    );
    if (assigned.greaterThan(available)) {
      kernelInvalid(
        `Personnel allocation ${personPoolIds[index]} exceeds its real person pool`,
      );
    }
  }
}

export function calculateEducationFoundation(
  input: EducationFoundationInput,
): EducationFoundationResult {
  const applicants = whole(
    input.applicantPool.applicants,
    'person',
    'applicants',
  );
  const teachers = whole(input.capacity.teachers, 'person', 'teachers');
  const seats = whole(input.capacity.seats, 'person', 'seats');
  const budgetSeats = whole(
    input.capacity.budgetSupportedSeats,
    'person',
    'budgetSupportedSeats',
  );
  const studentsPerTeacher = unitRate(
    input.capacity.studentsPerTeacher,
    'person',
    'person',
    'studentsPerTeacher',
  );
  const teacherSeats = wholeResult(
    teachers.times(studentsPerTeacher),
    'person',
    'teacherSupportedSeats',
  );
  const actualSeats = minimum(
    [seats, teacherSeats, budgetSeats],
    'education actual seats',
  );
  const enrolled = whole(input.cohort.enrolled, 'person', 'cohort.enrolled');
  if (enrolled.greaterThan(actualSeats)) {
    kernelInvalid(
      'Cohort enrollment cannot exceed actual teacher and seat capacity',
    );
  }
  const requestedEnrollment = whole(
    input.newEnrollment,
    'person',
    'newEnrollment',
  );
  const availableSlots = actualSeats.minus(enrolled);
  if (
    requestedEnrollment.greaterThan(applicants) ||
    requestedEnrollment.greaterThan(availableSlots)
  ) {
    kernelInvalid(
      'New enrollment must be covered by applicants and actual capacity',
    );
  }
  const elapsedDuration = time(
    input.cohort.elapsedDuration,
    'sim_day',
    'cohort.elapsedDuration',
  );
  const requiredDuration = time(
    input.cohort.requiredDuration,
    'sim_day',
    'cohort.requiredDuration',
  );
  if (requiredDuration.isZero())
    kernelInvalid('cohort.requiredDuration must be positive');
  const dropoutRate = ratio(input.graduation.dropoutRate, 'dropoutRate');
  const completionRate = ratio(
    input.graduation.completionRate,
    'completionRate',
  );
  if (!['BASIC', 'VOCATIONAL', 'HIGHER'].includes(input.cohort.level)) {
    kernelInvalid('cohort.level must be BASIC, VOCATIONAL, or HIGHER');
  }
  const graduates = elapsedDuration.greaterThanOrEqualTo(requiredDuration)
    ? wholeResult(
        enrolled
          .times(nonNegative('1', 'one').minus(dropoutRate))
          .times(completionRate),
        'person',
        'graduates',
      )
    : nonNegative('0', 'zero graduates');
  const cumulativeGraduates = whole(
    input.cohort.cumulativeGraduates,
    'person',
    'cohort.cumulativeGraduates',
  );
  const nextEnrolled = enrolled.minus(graduates).plus(requestedEnrollment);
  const nextCumulativeGraduates = cumulativeGraduates.plus(graduates);

  if (input.cohort.level === 'BASIC') {
    if (input.cohort.specialisationId !== null || input.skillTarget !== null) {
      kernelInvalid(
        'Basic education cannot claim a vocational or higher skill handoff',
      );
    }
  } else {
    if (input.cohort.specialisationId === null) {
      kernelInvalid(
        'Vocational and higher cohorts require an explicit specialisation',
      );
    }
    foundationId(input.cohort.specialisationId, 'cohort.specialisationId');
  }

  let skillHandoff: EducationSkillHandoff | null = null;
  if (graduates.isZero()) {
    if (input.skillTarget !== null) {
      kernelInvalid('A skill handoff requires actual graduates');
    }
  } else {
    if (input.skillTarget === null) {
      kernelInvalid(
        'Vocational and higher graduates require an explicit skill handoff',
      );
    }
    const expectedSkill =
      input.cohort.level === 'VOCATIONAL' ? 'MEDIUM' : 'HIGH';
    if (input.skillTarget.skill !== expectedSkill) {
      kernelInvalid('Skill handoff must match the completed programme level');
    }
    const before = whole(
      input.skillTarget.before,
      'person',
      'skillTarget.before',
    );
    skillHandoff = Object.freeze({
      handoffId: foundationId(
        input.skillTarget.handoffId,
        'skillTarget.handoffId',
      ),
      trainingProgrammeId: foundationId(
        input.cohort.trainingProgrammeId,
        'cohort.trainingProgrammeId',
      ),
      cohortId: foundationId(input.cohort.cohortId, 'cohort.cohortId'),
      targetSkillStockId: foundationId(
        input.skillTarget.labourSkillStockId,
        'skillTarget.labourSkillStockId',
      ),
      skill: input.skillTarget.skill,
      graduatesTransferred: renderQuantity(graduates, 'person'),
      before: renderQuantity(before, 'person'),
      after: renderQuantity(before.plus(graduates), 'person'),
    });
  }

  const inputIds = [
    input.enrollmentRequestId,
    input.applicantPool.applicantPoolId,
    input.capacity.teacherWorkforceId,
    input.capacity.facilityId,
    input.capacity.budgetCapacityId,
    input.cohort.cohortId,
    input.cohort.trainingProgrammeId,
    ...(input.cohort.specialisationId === null
      ? []
      : [input.cohort.specialisationId]),
    ...(input.skillTarget === null
      ? []
      : [input.skillTarget.labourSkillStockId]),
  ];
  const outputIds = [
    input.outcomeId,
    input.nextCohortId,
    ...(skillHandoff === null ? [] : [skillHandoff.handoffId]),
  ];
  const transitions: SocialFoundationTransition[] = [
    transition(
      input.cohort.cohortId,
      'enrollment',
      enrolled,
      nextEnrolled,
      'person',
    ),
    transition(
      input.cohort.cohortId,
      'cumulative_graduates',
      cumulativeGraduates,
      nextCumulativeGraduates,
      'person',
    ),
  ];
  if (skillHandoff !== null) {
    transitions.push(
      transition(
        skillHandoff.targetSkillStockId,
        'skilled_personnel',
        whole(skillHandoff.before, 'person', 'skill handoff before'),
        whole(skillHandoff.after, 'person', 'skill handoff after'),
        'person',
      ),
    );
  }
  return Object.freeze({
    outcomeId: foundationId(input.outcomeId, 'outcomeId'),
    capacity: Object.freeze({
      teacherSupportedSeats: renderQuantity(teacherSeats, 'person'),
      actualSeats: renderQuantity(actualSeats, 'person'),
    }),
    admitted: renderQuantity(requestedEnrollment, 'person'),
    graduates: renderQuantity(graduates, 'person'),
    nextCohort: Object.freeze({
      cohortId: foundationId(input.nextCohortId, 'nextCohortId'),
      enrolled: renderQuantity(nextEnrolled, 'person'),
      cumulativeGraduates: renderQuantity(nextCumulativeGraduates, 'person'),
    }),
    skillHandoff,
    directProductivityEffect: null,
    trace: replayTrace(
      'E04_EDUCATION',
      input.trace,
      inputIds,
      outputIds,
      transitions,
    ),
  });
}

export interface HealthcareFoundationInput {
  readonly trace: SocialFoundationTraceRequest;
  readonly outcomeId: string;
  readonly deliveredCareId: string;
  readonly serviceRequestId: string;
  readonly backlog: {
    readonly backlogStateId: string;
    readonly priorBacklog: ExactQuantity;
  };
  readonly demand: {
    readonly demandId: string;
    readonly newDemand: ExactQuantity;
  };
  readonly staff: {
    readonly workforceId: string;
    readonly staffedPeople: ExactQuantity;
    readonly careCapacity: ExactQuantity;
  };
  readonly facility: {
    readonly facilityId: string;
    readonly careCapacity: ExactQuantity;
    readonly bedStateId: string;
    readonly totalBeds: ExactQuantity;
    readonly occupiedBeds: ExactQuantity;
  };
  readonly medicalSupply: {
    readonly inventoryId: string;
    readonly availableMedicalDoses: ExactQuantity;
    readonly careCapacity: ExactQuantity;
  };
  readonly budget: {
    readonly budgetId: string;
    readonly observedOperatingBudget: ExactMoney;
    readonly careCapacity: ExactQuantity;
  };
}

export interface HealthcareFoundationResult {
  readonly outcomeId: string;
  readonly deliveredCare: ExactQuantity;
  readonly unmetCare: ExactQuantity;
  readonly nextBacklog: ExactQuantity;
  readonly bedOccupancy: ExactRatio | null;
  readonly facilityProcurementInterface: {
    readonly facilityId: string;
    readonly inventoryId: string;
    readonly unmetCare: ExactQuantity;
  };
  /** No health-status or population modifier is inferred from a budget. */
  readonly directHealthEffect: null;
  readonly observedOperatingBudget: ExactMoney;
  readonly trace: SocialFoundationReplayTrace;
}

export function calculateHealthcareFoundation(
  input: HealthcareFoundationInput,
): HealthcareFoundationResult {
  const backlog = whole(input.backlog.priorBacklog, 'case', 'priorBacklog');
  const newDemand = whole(input.demand.newDemand, 'case', 'newDemand');
  const staff = whole(input.staff.staffedPeople, 'person', 'staffedPeople');
  const staffCapacity = whole(
    input.staff.careCapacity,
    'case',
    'staff.careCapacity',
  );
  const facilityCapacity = whole(
    input.facility.careCapacity,
    'case',
    'facility.careCapacity',
  );
  const doses = whole(
    input.medicalSupply.availableMedicalDoses,
    'medical_dose',
    'availableMedicalDoses',
  );
  const supplyCapacity = whole(
    input.medicalSupply.careCapacity,
    'case',
    'medicalSupply.careCapacity',
  );
  const budgetCapacity = whole(
    input.budget.careCapacity,
    'case',
    'budget.careCapacity',
  );
  if (staff.isZero() && !staffCapacity.isZero()) {
    kernelInvalid('No staffed people cannot claim care capacity');
  }
  if (doses.isZero() && !supplyCapacity.isZero()) {
    kernelInvalid('No medical doses cannot claim care capacity');
  }
  const totalBeds = whole(input.facility.totalBeds, 'bed', 'totalBeds');
  const occupiedBeds = whole(
    input.facility.occupiedBeds,
    'bed',
    'occupiedBeds',
  );
  if (occupiedBeds.greaterThan(totalBeds)) {
    kernelInvalid('Occupied beds cannot exceed total beds');
  }
  const totalNeed = backlog.plus(newDemand);
  const delivered = minimum(
    [
      totalNeed,
      staffCapacity,
      facilityCapacity,
      supplyCapacity,
      budgetCapacity,
    ],
    'delivered care',
  );
  const nextBacklog = totalNeed.minus(delivered);
  const observedOperatingBudget = nonNegativeMoney(
    input.budget.observedOperatingBudget,
    'observedOperatingBudget',
  );
  return Object.freeze({
    outcomeId: foundationId(input.outcomeId, 'outcomeId'),
    deliveredCare: renderQuantity(delivered, 'case'),
    unmetCare: renderQuantity(nextBacklog, 'case'),
    nextBacklog: renderQuantity(nextBacklog, 'case'),
    bedOccupancy: totalBeds.isZero()
      ? null
      : Object.freeze({
          amount: render(occupiedBeds.dividedBy(totalBeds)),
          unit: 'ratio',
        }),
    facilityProcurementInterface: Object.freeze({
      facilityId: foundationId(input.facility.facilityId, 'facilityId'),
      inventoryId: foundationId(input.medicalSupply.inventoryId, 'inventoryId'),
      unmetCare: renderQuantity(nextBacklog, 'case'),
    }),
    directHealthEffect: null,
    observedOperatingBudget,
    trace: replayTrace(
      'E05_HEALTHCARE',
      input.trace,
      [
        input.serviceRequestId,
        input.backlog.backlogStateId,
        input.demand.demandId,
        input.staff.workforceId,
        input.facility.facilityId,
        input.facility.bedStateId,
        input.medicalSupply.inventoryId,
        input.budget.budgetId,
      ],
      [input.outcomeId, input.deliveredCareId],
      [
        transition(
          input.backlog.backlogStateId,
          'care_backlog',
          backlog,
          nextBacklog,
          'case',
        ),
        transition(
          input.deliveredCareId,
          'delivered_care',
          nonNegative('0', 'delivered care before'),
          delivered,
          'case',
        ),
      ],
    ),
  });
}

export type HousingCommissionStatus = 'NOT_COMMISSIONED' | 'COMMISSIONED';

export interface HousingFoundationInput {
  readonly trace: SocialFoundationTraceRequest;
  readonly outcomeId: string;
  readonly nextHousingStockId: string;
  readonly stock: {
    readonly housingStockId: string;
    readonly totalUnits: ExactQuantity;
    readonly habitableUnits: ExactQuantity;
    readonly occupiedUnits: ExactQuantity;
  };
  readonly demand: {
    readonly householdDemandId: string;
    readonly householdDemand: ExactQuantity;
    readonly temporaryProjectDemandId: string;
    readonly temporaryProjectDemand: ExactQuantity;
    readonly migrationDemandId: string;
    readonly migrationDemand: ExactQuantity;
  };
  readonly rent: {
    readonly rentStateId: string;
    readonly observedRent: ExactUnitPrice;
    readonly rentRuleVersion: string;
  };
  readonly subsidy: {
    readonly subsidyId: string;
    readonly programmeId: string;
    readonly amount: ExactMoney;
  };
  readonly commission: {
    readonly commissionId: string;
    readonly projectId: string;
    readonly status: HousingCommissionStatus;
    readonly commissionedAt: ExactQuantity;
    readonly newHabitableUnits: ExactQuantity;
  };
}

export interface HousingFoundationResult {
  readonly outcomeId: string;
  readonly nextHousingStockId: string;
  readonly stock: {
    readonly totalUnits: ExactQuantity;
    readonly habitableUnits: ExactQuantity;
    readonly occupiedUnits: ExactQuantity;
    readonly vacantUnits: ExactQuantity;
  };
  readonly totalDemand: ExactQuantity;
  readonly housingGap: ExactQuantity;
  readonly occupancyRate: ExactRatio | null;
  readonly observedRent: ExactUnitPrice;
  readonly observedSubsidy: ExactMoney;
  readonly supplyAddedByCompletedCommission: ExactQuantity;
  readonly trace: SocialFoundationReplayTrace;
}

export function calculateHousingFoundation(
  input: HousingFoundationInput,
): HousingFoundationResult {
  const totalUnits = whole(
    input.stock.totalUnits,
    'housing_unit',
    'totalUnits',
  );
  const habitableUnits = whole(
    input.stock.habitableUnits,
    'housing_unit',
    'habitableUnits',
  );
  const occupiedUnits = whole(
    input.stock.occupiedUnits,
    'housing_unit',
    'occupiedUnits',
  );
  if (
    habitableUnits.greaterThan(totalUnits) ||
    occupiedUnits.greaterThan(habitableUnits)
  ) {
    kernelInvalid('Housing stock must satisfy occupied <= habitable <= total');
  }
  const householdDemand = whole(
    input.demand.householdDemand,
    'housing_unit',
    'householdDemand',
  );
  const projectDemand = whole(
    input.demand.temporaryProjectDemand,
    'housing_unit',
    'temporaryProjectDemand',
  );
  const migrationDemand = whole(
    input.demand.migrationDemand,
    'housing_unit',
    'migrationDemand',
  );
  const commissionedAt = time(
    input.commission.commissionedAt,
    'sim_day',
    'commissionedAt',
  );
  const commissionedUnits = whole(
    input.commission.newHabitableUnits,
    'housing_unit',
    'newHabitableUnits',
  );
  if (!['NOT_COMMISSIONED', 'COMMISSIONED'].includes(input.commission.status)) {
    kernelInvalid('commission.status must be NOT_COMMISSIONED or COMMISSIONED');
  }
  if (
    input.commission.status === 'NOT_COMMISSIONED' &&
    !commissionedUnits.isZero()
  ) {
    kernelInvalid(
      'Only an explicit completed commission can add housing units',
    );
  }
  if (input.commission.status === 'COMMISSIONED' && commissionedAt.isZero()) {
    kernelInvalid(
      'A completed commission requires an explicit positive completion time',
    );
  }
  const nextTotalUnits = totalUnits.plus(commissionedUnits);
  const nextHabitableUnits = habitableUnits.plus(commissionedUnits);
  const vacantUnits = nextHabitableUnits.minus(occupiedUnits);
  const totalDemand = householdDemand.plus(projectDemand).plus(migrationDemand);
  const gap = totalDemand.greaterThan(nextHabitableUnits)
    ? totalDemand.minus(nextHabitableUnits)
    : nonNegative('0', 'zero housing gap');
  const rent = unitPrice(
    input.rent.observedRent,
    'housing_unit',
    'observedRent',
  );
  const observedRent: ExactUnitPrice = Object.freeze({
    amount: render(rent.amount),
    currency: rent.currency,
    perUnit: rent.perUnit,
  });
  const observedSubsidy = nonNegativeMoney(
    input.subsidy.amount,
    'subsidy.amount',
  );
  return Object.freeze({
    outcomeId: foundationId(input.outcomeId, 'outcomeId'),
    nextHousingStockId: foundationId(
      input.nextHousingStockId,
      'nextHousingStockId',
    ),
    stock: Object.freeze({
      totalUnits: renderQuantity(nextTotalUnits, 'housing_unit'),
      habitableUnits: renderQuantity(nextHabitableUnits, 'housing_unit'),
      occupiedUnits: renderQuantity(occupiedUnits, 'housing_unit'),
      vacantUnits: renderQuantity(vacantUnits, 'housing_unit'),
    }),
    totalDemand: renderQuantity(totalDemand, 'housing_unit'),
    housingGap: renderQuantity(gap, 'housing_unit'),
    occupancyRate: nextHabitableUnits.isZero()
      ? null
      : Object.freeze({
          amount: render(occupiedUnits.dividedBy(nextHabitableUnits)),
          unit: 'ratio',
        }),
    observedRent,
    observedSubsidy,
    supplyAddedByCompletedCommission: renderQuantity(
      commissionedUnits,
      'housing_unit',
    ),
    trace: replayTrace(
      'E06_HOUSING',
      input.trace,
      [
        input.stock.housingStockId,
        input.demand.householdDemandId,
        input.demand.temporaryProjectDemandId,
        input.demand.migrationDemandId,
        input.rent.rentStateId,
        input.rent.rentRuleVersion,
        input.subsidy.subsidyId,
        input.subsidy.programmeId,
        input.commission.commissionId,
        input.commission.projectId,
      ],
      [input.outcomeId, input.nextHousingStockId],
      [
        transition(
          input.stock.housingStockId,
          'total_units',
          totalUnits,
          nextTotalUnits,
          'housing_unit',
        ),
        transition(
          input.stock.housingStockId,
          'habitable_units',
          habitableUnits,
          nextHabitableUnits,
          'housing_unit',
        ),
      ],
    ),
  });
}

export interface SafetyFoundationInput {
  readonly trace: SocialFoundationTraceRequest;
  readonly outcomeId: string;
  readonly deploymentOutcomeId: string;
  readonly population: {
    readonly populationStateId: string;
    readonly population: ExactQuantity;
  };
  readonly workforce: {
    readonly workforceId: string;
    readonly employedPeople: ExactQuantity;
    readonly alreadyDeployedPeople: ExactQuantity;
    readonly unavailablePeople: ExactQuantity;
  };
  readonly incidents: {
    readonly incidentRegisterId: string;
    readonly recordedIncidents: ExactQuantity;
  };
  readonly backlog: {
    readonly backlogStateId: string;
    readonly priorBacklog: ExactQuantity;
  };
  readonly intake: {
    readonly intakeId: string;
    readonly newCases: ExactQuantity;
  };
  readonly deployment: {
    readonly deploymentId: string;
    readonly requestedPeople: ExactQuantity;
    readonly handlingCapacity: ExactQuantity;
    readonly duration: ExactQuantity;
  };
  readonly funding: {
    readonly budgetId: string;
    readonly observedOperatingBudget: ExactMoney;
  };
  readonly simulationTime: {
    readonly timeStateId: string;
    readonly now: ExactQuantity;
  };
  readonly emergency:
    | { readonly requested: false; readonly authority: null }
    | {
        readonly requested: true;
        readonly authority: {
          readonly authorityId: string;
          readonly captainApprovalId: string;
          readonly status: 'ACTIVE' | 'EXPIRED';
          readonly issuedAt: ExactQuantity;
          readonly expiresAt: ExactQuantity;
        };
      };
}

export interface SafetyFoundationResult {
  readonly outcomeId: string;
  readonly availableBeforeDeployment: ExactQuantity;
  readonly availableAfterDeployment: ExactQuantity;
  readonly deployedPeople: ExactQuantity;
  readonly resolvedCases: ExactQuantity;
  readonly nextBacklog: ExactQuantity;
  readonly recordedIncidentRatePer100000People: ExactQuantity | null;
  readonly emergencyAuthorityAccepted: boolean;
  /** Funding is observed; this Core module emits no direct stability change. */
  readonly directStabilityEffect: null;
  readonly observedOperatingBudget: ExactMoney;
  readonly trace: SocialFoundationReplayTrace;
}

export function calculateSafetyFoundation(
  input: SafetyFoundationInput,
): SafetyFoundationResult {
  const population = whole(input.population.population, 'person', 'population');
  const employed = whole(
    input.workforce.employedPeople,
    'person',
    'employedPeople',
  );
  const alreadyDeployed = whole(
    input.workforce.alreadyDeployedPeople,
    'person',
    'alreadyDeployedPeople',
  );
  const unavailable = whole(
    input.workforce.unavailablePeople,
    'person',
    'unavailablePeople',
  );
  const available = employed.minus(alreadyDeployed).minus(unavailable);
  if (available.isNegative())
    kernelInvalid('Safety workforce allocation exceeds employed people');
  const requested = whole(
    input.deployment.requestedPeople,
    'person',
    'requestedPeople',
  );
  if (requested.greaterThan(available)) {
    kernelInvalid('Safety deployment cannot exceed available personnel');
  }
  const handlingCapacity = whole(
    input.deployment.handlingCapacity,
    'case',
    'handlingCapacity',
  );
  if (requested.isZero() && !handlingCapacity.isZero()) {
    kernelInvalid('No deployed personnel cannot claim case handling capacity');
  }
  const duration = time(
    input.deployment.duration,
    'sim_day',
    'deployment.duration',
  );
  if (duration.isZero() && !requested.isZero()) {
    kernelInvalid(
      'A personnel deployment requires an explicit positive duration',
    );
  }
  const incidents = whole(
    input.incidents.recordedIncidents,
    'incident',
    'recordedIncidents',
  );
  const priorBacklog = whole(
    input.backlog.priorBacklog,
    'case',
    'priorBacklog',
  );
  const newCases = whole(input.intake.newCases, 'case', 'newCases');
  const totalCases = priorBacklog.plus(newCases);
  const resolved = minimum([totalCases, handlingCapacity], 'resolved cases');
  const nextBacklog = totalCases.minus(resolved);
  const availableAfter = available.minus(requested);
  const deployedAfter = alreadyDeployed.plus(requested);
  const now = time(
    input.simulationTime.now,
    'sim_millisecond',
    'simulationTime.now',
  );
  let emergencyAuthorityAccepted = false;
  let authorityIds: string[] = [];
  if (input.emergency.requested) {
    const authority = input.emergency.authority;
    const issuedAt = time(
      authority.issuedAt,
      'sim_millisecond',
      'authority.issuedAt',
    );
    const expiresAt = time(
      authority.expiresAt,
      'sim_millisecond',
      'authority.expiresAt',
    );
    if (
      authority.status !== 'ACTIVE' ||
      now.lessThan(issuedAt) ||
      now.greaterThanOrEqualTo(expiresAt)
    ) {
      kernelInvalid(
        'Emergency action requires active, unexpired Captain authority',
      );
    }
    emergencyAuthorityAccepted = true;
    authorityIds = [authority.authorityId, authority.captainApprovalId];
  }
  const incidentRate = population.isZero()
    ? null
    : renderQuantity(
        incidents.times(100000).dividedBy(population),
        'incident_per_100000_person',
      );
  const observedOperatingBudget = nonNegativeMoney(
    input.funding.observedOperatingBudget,
    'funding.observedOperatingBudget',
  );
  return Object.freeze({
    outcomeId: foundationId(input.outcomeId, 'outcomeId'),
    availableBeforeDeployment: renderQuantity(available, 'person'),
    availableAfterDeployment: renderQuantity(availableAfter, 'person'),
    deployedPeople: renderQuantity(deployedAfter, 'person'),
    resolvedCases: renderQuantity(resolved, 'case'),
    nextBacklog: renderQuantity(nextBacklog, 'case'),
    recordedIncidentRatePer100000People: incidentRate,
    emergencyAuthorityAccepted,
    directStabilityEffect: null,
    observedOperatingBudget,
    trace: replayTrace(
      'E07_PUBLIC_SAFETY',
      input.trace,
      [
        input.population.populationStateId,
        input.workforce.workforceId,
        input.incidents.incidentRegisterId,
        input.backlog.backlogStateId,
        input.intake.intakeId,
        input.deployment.deploymentId,
        input.funding.budgetId,
        input.simulationTime.timeStateId,
        ...authorityIds,
      ],
      [input.outcomeId, input.deploymentOutcomeId],
      [
        transition(
          input.workforce.workforceId,
          'available_personnel',
          available,
          availableAfter,
          'person',
        ),
        transition(
          input.workforce.workforceId,
          'deployed_personnel',
          alreadyDeployed,
          deployedAfter,
          'person',
        ),
        transition(
          input.backlog.backlogStateId,
          'case_backlog',
          priorBacklog,
          nextBacklog,
          'case',
        ),
        transition(
          input.deploymentOutcomeId,
          'resolved_cases',
          nonNegative('0', 'resolved cases before'),
          resolved,
          'case',
        ),
      ],
    ),
  });
}
