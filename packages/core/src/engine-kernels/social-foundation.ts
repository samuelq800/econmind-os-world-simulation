import {
  kernelInvalid,
  minimum,
  money,
  nonNegative,
  nonNegativeQuantity,
  render,
  renderMoney,
  renderQuantity,
  unitPrice,
  wholeQuantity,
  type ExactMoney,
  type ExactQuantity,
  type ExactRatio,
  type ExactUnitPrice,
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
  readonly lineageId: string;
  readonly sourceVersion: string;
  readonly snapshotId: string;
  readonly snapshotAt: ExactQuantity;
}

/** A caller-owned source fact with its exact payload evidence. */
export interface SocialFoundationFact<T> {
  readonly factId: string;
  readonly sourceId: string;
  readonly predecessorFactIds: readonly string[];
  readonly lineageId: string;
  readonly sourceVersion: string;
  readonly snapshotId: string;
  readonly observedAt: ExactQuantity;
  readonly payload: T;
  readonly canonicalPayload: string;
}

export interface SocialFoundationFactBinding {
  readonly factId: string;
  readonly sourceId: string;
  readonly predecessorFactIds: readonly string[];
  readonly lineageId: string;
  readonly sourceVersion: string;
  readonly snapshotId: string;
  readonly observedAt: ExactQuantity;
  readonly canonicalPayload: string;
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
  readonly lineageId: string;
  readonly sourceVersion: string;
  readonly snapshotId: string;
  readonly snapshotAt: ExactQuantity;
  readonly module: SocialFoundationModule;
  readonly inputIds: readonly string[];
  readonly outputIds: readonly string[];
  readonly inputFacts: readonly SocialFoundationFactBinding[];
  readonly resultFacts: readonly SocialFoundationFactBinding[];
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

function canonicalPayload(value: unknown): string {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === 'number' || typeof value === 'undefined') {
    kernelInvalid('Fact payload must not contain a non-canonical primitive');
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalPayload(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    const keys = Object.keys(object).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${canonicalPayload(object[key])}`)
      .join(',')}}`;
  }
  kernelInvalid('Fact payload must be canonical JSON data');
}

function traceContext(request: SocialFoundationTraceRequest): {
  readonly traceId: string;
  readonly calculationVersion: string;
  readonly lineageId: string;
  readonly sourceVersion: string;
  readonly snapshotId: string;
  readonly snapshotAt: WorldDecimalValue;
} {
  return Object.freeze({
    traceId: foundationId(request.traceId, 'traceId'),
    calculationVersion: foundationId(
      request.calculationVersion,
      'calculationVersion',
    ),
    lineageId: foundationId(request.lineageId, 'lineageId'),
    sourceVersion: foundationId(request.sourceVersion, 'sourceVersion'),
    snapshotId: foundationId(request.snapshotId, 'snapshotId'),
    snapshotAt: time(request.snapshotAt, 'sim_millisecond', 'snapshotAt'),
  });
}

function factBinding<T>(
  request: SocialFoundationTraceRequest,
  fact: SocialFoundationFact<T>,
  label: string,
): SocialFoundationFactBinding {
  const context = traceContext(request);
  const factId = foundationId(fact.factId, `${label}.factId`);
  const sourceId = foundationId(fact.sourceId, `${label}.sourceId`);
  const predecessors = distinctIds(
    fact.predecessorFactIds,
    `${label}.predecessorFactIds`,
  );
  if (predecessors.length === 0) {
    kernelInvalid(`${label}.predecessorFactIds must be explicit`);
  }
  if (
    fact.lineageId !== context.lineageId ||
    fact.sourceVersion !== context.sourceVersion ||
    fact.snapshotId !== context.snapshotId
  ) {
    kernelInvalid(
      `${label} has stale or mixed lineage/version/snapshot evidence`,
    );
  }
  const observedAt = time(
    fact.observedAt,
    'sim_millisecond',
    `${label}.observedAt`,
  );
  if (!observedAt.equals(context.snapshotAt)) {
    kernelInvalid(`${label} observedAt must equal the replay snapshot time`);
  }
  const payload = canonicalPayload(fact.payload);
  if (payload !== fact.canonicalPayload) {
    kernelInvalid(
      `${label} canonical payload evidence does not match its fact`,
    );
  }
  return Object.freeze({
    factId,
    sourceId,
    predecessorFactIds: predecessors,
    lineageId: context.lineageId,
    sourceVersion: context.sourceVersion,
    snapshotId: context.snapshotId,
    observedAt: renderQuantity(observedAt, 'sim_millisecond'),
    canonicalPayload: payload,
  });
}

function payloadOf<T>(
  request: SocialFoundationTraceRequest,
  fact: SocialFoundationFact<T>,
  label: string,
): T {
  factBinding(request, fact, label);
  return fact.payload;
}

/** Creates immutable caller-supplied evidence; calculations verify it again. */
export function createSocialFoundationFact<T>(input: {
  readonly trace: SocialFoundationTraceRequest;
  readonly factId: string;
  readonly sourceId: string;
  readonly predecessorFactIds: readonly string[];
  readonly payload: T;
}): SocialFoundationFact<T> {
  const context = traceContext(input.trace);
  const result: SocialFoundationFact<T> = {
    factId: foundationId(input.factId, 'factId'),
    sourceId: foundationId(input.sourceId, 'sourceId'),
    predecessorFactIds: distinctIds(
      input.predecessorFactIds,
      'predecessorFactIds',
    ),
    lineageId: context.lineageId,
    sourceVersion: context.sourceVersion,
    snapshotId: context.snapshotId,
    observedAt: renderQuantity(context.snapshotAt, 'sim_millisecond'),
    payload: input.payload,
    canonicalPayload: canonicalPayload(input.payload),
  };
  factBinding(input.trace, result, 'created fact');
  return Object.freeze(result);
}

function whole(
  value: ExactQuantity,
  expectedUnit: string,
  label: string,
): WorldDecimalValue {
  return wholeQuantity(value, expectedUnit, label).amount;
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
  inputFacts: readonly SocialFoundationFact<unknown>[],
  resultPayloads: readonly {
    readonly factId: string;
    readonly payload: unknown;
  }[],
  transitions: readonly SocialFoundationTransition[],
): SocialFoundationReplayTrace {
  const context = traceContext(request);
  const inputBindings = inputFacts.map((fact, index) =>
    factBinding(request, fact, `inputFacts[${index}]`),
  );
  const inputIds = distinctIds(
    inputBindings.map((fact) => fact.factId),
    'Trace inputIds',
  );
  const resultFacts = resultPayloads.map(({ factId, payload }) =>
    Object.freeze({
      factId: foundationId(factId, 'result factId'),
      sourceId: context.traceId,
      predecessorFactIds: inputIds,
      lineageId: context.lineageId,
      sourceVersion: context.sourceVersion,
      snapshotId: context.snapshotId,
      observedAt: renderQuantity(context.snapshotAt, 'sim_millisecond'),
      canonicalPayload: canonicalPayload(payload),
    }),
  );
  const outputIds = distinctIds(
    resultFacts.map((fact) => fact.factId),
    'Trace outputIds',
  );
  return Object.freeze({
    traceId: context.traceId,
    calculationVersion: context.calculationVersion,
    lineageId: context.lineageId,
    sourceVersion: context.sourceVersion,
    snapshotId: context.snapshotId,
    snapshotAt: renderQuantity(context.snapshotAt, 'sim_millisecond'),
    module,
    inputIds,
    outputIds,
    inputFacts: Object.freeze(inputBindings),
    resultFacts: Object.freeze(resultFacts),
    transitions: Object.freeze([...transitions]),
  });
}

/** Rejects any forged, stale, mixed-lineage, or payload-divergent replay input. */
export function assertSocialFoundationReplayEvidence(
  trace: SocialFoundationReplayTrace,
  inputFacts: readonly SocialFoundationFact<unknown>[],
): void {
  const request: SocialFoundationTraceRequest = {
    traceId: trace.traceId,
    calculationVersion: trace.calculationVersion,
    lineageId: trace.lineageId,
    sourceVersion: trace.sourceVersion,
    snapshotId: trace.snapshotId,
    snapshotAt: trace.snapshotAt,
  };
  const replayed = inputFacts.map((fact, index) =>
    factBinding(request, fact, `replay inputFacts[${index}]`),
  );
  if (
    canonicalPayload(replayed) !== canonicalPayload(trace.inputFacts) ||
    canonicalPayload(trace.outputIds) !==
      canonicalPayload(trace.resultFacts.map((fact) => fact.factId))
  ) {
    kernelInvalid('Replay evidence does not exactly equal the recorded trace');
  }
}

export type EducationLevel = 'BASIC' | 'VOCATIONAL' | 'HIGHER';
export type EducationSkill = 'MEDIUM' | 'HIGH';

export interface EducationFoundationInput {
  readonly trace: SocialFoundationTraceRequest;
  readonly outcomeId: string;
  readonly nextCohortId: string;
  readonly applicantPool: SocialFoundationFact<{
    readonly applicantPoolId: string;
    readonly applicants: ExactQuantity;
  }>;
  readonly capacity: SocialFoundationFact<{
    readonly teacherWorkforceId: string;
    readonly teachers: ExactQuantity;
    readonly facilityId: string;
    readonly seats: ExactQuantity;
    readonly budgetCapacityId: string;
    readonly budgetSupportedSeats: ExactQuantity;
    /** Caller-selected, policy-owned capacity fact; never derived in Core. */
    readonly teacherSupportedSeats: ExactQuantity;
    readonly availableEnrollmentCapacity: ExactQuantity;
  }>;
  readonly cohort: SocialFoundationFact<{
    readonly cohortId: string;
    readonly trainingProgrammeId: string;
    readonly level: EducationLevel;
    readonly specialisationId: string | null;
    readonly enrolled: ExactQuantity;
    readonly cumulativeGraduates: ExactQuantity;
    readonly elapsedDuration: ExactQuantity;
    readonly requiredDuration: ExactQuantity;
  }>;
  /** Caller-selected, policy-owned admissions/graduation outcome fact. */
  readonly outcome: SocialFoundationFact<{
    readonly admitted: ExactQuantity;
    readonly graduates: ExactQuantity;
  }>;
  readonly skillTarget: SocialFoundationFact<{
    readonly handoffId: string;
    readonly labourSkillStockId: string;
    readonly skill: EducationSkill;
    readonly before: ExactQuantity;
  }> | null;
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
  readonly trace: SocialFoundationTraceRequest;
  readonly allocations: readonly SocialFoundationFact<{
    readonly personPoolId: string;
    readonly availablePeople: ExactQuantity;
    readonly assignedPeople: ExactQuantity;
  }>[];
}): void {
  if (input.allocations.length === 0) {
    kernelInvalid('Personnel allocation requires at least one person pool');
  }
  const personPoolIds = distinctIds(
    input.allocations.map(
      (allocation, index) =>
        payloadOf(input.trace, allocation, `allocations[${index}]`)
          .personPoolId,
    ),
    'Personnel allocation personPoolIds',
  );
  for (const [index, allocation] of input.allocations.entries()) {
    const payload = payloadOf(input.trace, allocation, `allocations[${index}]`);
    const available = whole(
      payload.availablePeople,
      'person',
      `allocations[${index}].availablePeople`,
    );
    const assigned = whole(
      payload.assignedPeople,
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
  const applicantPool = payloadOf(
    input.trace,
    input.applicantPool,
    'applicantPool',
  );
  const capacity = payloadOf(input.trace, input.capacity, 'capacity');
  const cohort = payloadOf(input.trace, input.cohort, 'cohort');
  const outcome = payloadOf(input.trace, input.outcome, 'outcome');
  const skillTarget =
    input.skillTarget === null
      ? null
      : payloadOf(input.trace, input.skillTarget, 'skillTarget');
  const applicants = whole(applicantPool.applicants, 'person', 'applicants');
  const teachers = whole(capacity.teachers, 'person', 'teachers');
  const seats = whole(capacity.seats, 'person', 'seats');
  const budgetSeats = whole(
    capacity.budgetSupportedSeats,
    'person',
    'budgetSupportedSeats',
  );
  const teacherSeats = whole(
    capacity.teacherSupportedSeats,
    'person',
    'teacherSupportedSeats',
  );
  const actualSeats = whole(
    capacity.availableEnrollmentCapacity,
    'person',
    'availableEnrollmentCapacity',
  );
  if (
    actualSeats.greaterThan(seats) ||
    actualSeats.greaterThan(teacherSeats) ||
    actualSeats.greaterThan(budgetSeats)
  ) {
    kernelInvalid(
      'Enrollment capacity fact cannot exceed its stated real constraints',
    );
  }
  if ((teachers.isZero() || seats.isZero()) && !actualSeats.isZero()) {
    kernelInvalid('No teacher or seat cannot claim enrollment capacity');
  }
  const enrolled = whole(cohort.enrolled, 'person', 'cohort.enrolled');
  if (enrolled.greaterThan(actualSeats)) {
    kernelInvalid(
      'Cohort enrollment cannot exceed actual teacher and seat capacity',
    );
  }
  const requestedEnrollment = whole(
    outcome.admitted,
    'person',
    'outcome.admitted',
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
    cohort.elapsedDuration,
    'sim_day',
    'cohort.elapsedDuration',
  );
  const requiredDuration = time(
    cohort.requiredDuration,
    'sim_day',
    'cohort.requiredDuration',
  );
  if (requiredDuration.isZero())
    kernelInvalid('cohort.requiredDuration must be positive');
  if (!['BASIC', 'VOCATIONAL', 'HIGHER'].includes(cohort.level)) {
    kernelInvalid('cohort.level must be BASIC, VOCATIONAL, or HIGHER');
  }
  const graduates = whole(outcome.graduates, 'person', 'outcome.graduates');
  if (graduates.greaterThan(enrolled)) {
    kernelInvalid('Graduation outcome cannot exceed enrolled people');
  }
  if (elapsedDuration.lessThan(requiredDuration) && !graduates.isZero()) {
    kernelInvalid(
      'Graduation outcome requires the explicit programme duration',
    );
  }
  const cumulativeGraduates = whole(
    cohort.cumulativeGraduates,
    'person',
    'cohort.cumulativeGraduates',
  );
  const nextEnrolled = enrolled.minus(graduates).plus(requestedEnrollment);
  const nextCumulativeGraduates = cumulativeGraduates.plus(graduates);

  if (cohort.level === 'BASIC') {
    if (cohort.specialisationId !== null || skillTarget !== null) {
      kernelInvalid(
        'Basic education cannot claim a vocational or higher skill handoff',
      );
    }
  } else {
    if (cohort.specialisationId === null) {
      kernelInvalid(
        'Vocational and higher cohorts require an explicit specialisation',
      );
    }
    foundationId(cohort.specialisationId, 'cohort.specialisationId');
  }

  let skillHandoff: EducationSkillHandoff | null = null;
  if (graduates.isZero()) {
    if (skillTarget !== null) {
      kernelInvalid('A skill handoff requires actual graduates');
    }
  } else {
    if (skillTarget === null) {
      kernelInvalid(
        'Vocational and higher graduates require an explicit skill handoff',
      );
    }
    const expectedSkill = cohort.level === 'VOCATIONAL' ? 'MEDIUM' : 'HIGH';
    if (skillTarget.skill !== expectedSkill) {
      kernelInvalid('Skill handoff must match the completed programme level');
    }
    const before = whole(skillTarget.before, 'person', 'skillTarget.before');
    skillHandoff = Object.freeze({
      handoffId: foundationId(skillTarget.handoffId, 'skillTarget.handoffId'),
      trainingProgrammeId: foundationId(
        cohort.trainingProgrammeId,
        'cohort.trainingProgrammeId',
      ),
      cohortId: foundationId(cohort.cohortId, 'cohort.cohortId'),
      targetSkillStockId: foundationId(
        skillTarget.labourSkillStockId,
        'skillTarget.labourSkillStockId',
      ),
      skill: skillTarget.skill,
      graduatesTransferred: renderQuantity(graduates, 'person'),
      before: renderQuantity(before, 'person'),
      after: renderQuantity(before.plus(graduates), 'person'),
    });
  }

  const transitions: SocialFoundationTransition[] = [
    transition(cohort.cohortId, 'enrollment', enrolled, nextEnrolled, 'person'),
    transition(
      cohort.cohortId,
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
      [
        input.applicantPool,
        input.capacity,
        input.cohort,
        input.outcome,
        ...(input.skillTarget === null ? [] : [input.skillTarget]),
      ],
      [
        {
          factId: input.outcomeId,
          payload: {
            admitted: renderQuantity(requestedEnrollment, 'person'),
            graduates: renderQuantity(graduates, 'person'),
          },
        },
        {
          factId: input.nextCohortId,
          payload: {
            enrolled: renderQuantity(nextEnrolled, 'person'),
            cumulativeGraduates: renderQuantity(
              nextCumulativeGraduates,
              'person',
            ),
          },
        },
        ...(skillHandoff === null
          ? []
          : [{ factId: skillHandoff.handoffId, payload: skillHandoff }]),
      ],
      transitions,
    ),
  });
}

export interface HealthcareFoundationInput {
  readonly trace: SocialFoundationTraceRequest;
  readonly outcomeId: string;
  readonly deliveredCareId: string;
  readonly backlog: SocialFoundationFact<{
    readonly backlogStateId: string;
    readonly priorBacklog: ExactQuantity;
  }>;
  readonly demand: SocialFoundationFact<{
    readonly demandId: string;
    readonly newDemand: ExactQuantity;
  }>;
  readonly staff: SocialFoundationFact<{
    readonly workforceId: string;
    readonly staffedPeople: ExactQuantity;
    readonly careCapacity: ExactQuantity;
  }>;
  readonly facility: SocialFoundationFact<{
    readonly facilityId: string;
    readonly careCapacity: ExactQuantity;
    readonly bedStateId: string;
    readonly totalBeds: ExactQuantity;
    readonly occupiedBeds: ExactQuantity;
  }>;
  readonly medicalSupply: SocialFoundationFact<{
    readonly inventoryId: string;
    readonly availableMedicalDoses: ExactQuantity;
    readonly careCapacity: ExactQuantity;
  }>;
  readonly budget: SocialFoundationFact<{
    readonly budgetId: string;
    readonly observedOperatingBudget: ExactMoney;
    readonly careCapacity: ExactQuantity;
  }>;
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
  const backlogFact = payloadOf(input.trace, input.backlog, 'backlog');
  const demand = payloadOf(input.trace, input.demand, 'demand');
  const staffFact = payloadOf(input.trace, input.staff, 'staff');
  const facility = payloadOf(input.trace, input.facility, 'facility');
  const medicalSupply = payloadOf(
    input.trace,
    input.medicalSupply,
    'medicalSupply',
  );
  const budget = payloadOf(input.trace, input.budget, 'budget');
  const backlog = whole(backlogFact.priorBacklog, 'case', 'priorBacklog');
  const newDemand = whole(demand.newDemand, 'case', 'newDemand');
  const staff = whole(staffFact.staffedPeople, 'person', 'staffedPeople');
  const staffCapacity = whole(
    staffFact.careCapacity,
    'case',
    'staff.careCapacity',
  );
  const facilityCapacity = whole(
    facility.careCapacity,
    'case',
    'facility.careCapacity',
  );
  const doses = whole(
    medicalSupply.availableMedicalDoses,
    'medical_dose',
    'availableMedicalDoses',
  );
  const supplyCapacity = whole(
    medicalSupply.careCapacity,
    'case',
    'medicalSupply.careCapacity',
  );
  const budgetCapacity = whole(
    budget.careCapacity,
    'case',
    'budget.careCapacity',
  );
  if (staff.isZero() && !staffCapacity.isZero()) {
    kernelInvalid('No staffed people cannot claim care capacity');
  }
  if (doses.isZero() && !supplyCapacity.isZero()) {
    kernelInvalid('No medical doses cannot claim care capacity');
  }
  const totalBeds = whole(facility.totalBeds, 'bed', 'totalBeds');
  const occupiedBeds = whole(facility.occupiedBeds, 'bed', 'occupiedBeds');
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
    budget.observedOperatingBudget,
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
      facilityId: foundationId(facility.facilityId, 'facilityId'),
      inventoryId: foundationId(medicalSupply.inventoryId, 'inventoryId'),
      unmetCare: renderQuantity(nextBacklog, 'case'),
    }),
    directHealthEffect: null,
    observedOperatingBudget,
    trace: replayTrace(
      'E05_HEALTHCARE',
      input.trace,
      [
        input.backlog,
        input.demand,
        input.staff,
        input.facility,
        input.medicalSupply,
        input.budget,
      ],
      [
        {
          factId: input.outcomeId,
          payload: {
            deliveredCare: renderQuantity(delivered, 'case'),
            nextBacklog: renderQuantity(nextBacklog, 'case'),
          },
        },
        {
          factId: input.deliveredCareId,
          payload: renderQuantity(delivered, 'case'),
        },
      ],
      [
        transition(
          backlogFact.backlogStateId,
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
  readonly stock: SocialFoundationFact<{
    readonly housingStockId: string;
    readonly totalUnits: ExactQuantity;
    readonly habitableUnits: ExactQuantity;
    readonly occupiedUnits: ExactQuantity;
  }>;
  readonly demand: SocialFoundationFact<{
    readonly householdDemandId: string;
    readonly householdDemand: ExactQuantity;
    readonly temporaryProjectDemandId: string;
    readonly temporaryProjectDemand: ExactQuantity;
    readonly migrationDemandId: string;
    readonly migrationDemand: ExactQuantity;
  }>;
  readonly rent: SocialFoundationFact<{
    readonly rentStateId: string;
    readonly observedRent: ExactUnitPrice;
    readonly rentRuleVersion: string;
  }>;
  readonly subsidy: SocialFoundationFact<{
    readonly subsidyId: string;
    readonly programmeId: string;
    readonly amount: ExactMoney;
  }>;
  readonly commission: SocialFoundationFact<{
    readonly commissionId: string;
    readonly projectId: string;
    readonly status: HousingCommissionStatus;
    readonly commissionedAt: ExactQuantity;
    readonly newHabitableUnits: ExactQuantity;
  }>;
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
  const stock = payloadOf(input.trace, input.stock, 'stock');
  const demand = payloadOf(input.trace, input.demand, 'demand');
  const rentFact = payloadOf(input.trace, input.rent, 'rent');
  const subsidy = payloadOf(input.trace, input.subsidy, 'subsidy');
  const commission = payloadOf(input.trace, input.commission, 'commission');
  const totalUnits = whole(stock.totalUnits, 'housing_unit', 'totalUnits');
  const habitableUnits = whole(
    stock.habitableUnits,
    'housing_unit',
    'habitableUnits',
  );
  const occupiedUnits = whole(
    stock.occupiedUnits,
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
    demand.householdDemand,
    'housing_unit',
    'householdDemand',
  );
  const projectDemand = whole(
    demand.temporaryProjectDemand,
    'housing_unit',
    'temporaryProjectDemand',
  );
  const migrationDemand = whole(
    demand.migrationDemand,
    'housing_unit',
    'migrationDemand',
  );
  const commissionedAt = time(
    commission.commissionedAt,
    'sim_day',
    'commissionedAt',
  );
  const commissionedUnits = whole(
    commission.newHabitableUnits,
    'housing_unit',
    'newHabitableUnits',
  );
  if (!['NOT_COMMISSIONED', 'COMMISSIONED'].includes(commission.status)) {
    kernelInvalid('commission.status must be NOT_COMMISSIONED or COMMISSIONED');
  }
  if (commission.status === 'NOT_COMMISSIONED' && !commissionedUnits.isZero()) {
    kernelInvalid(
      'Only an explicit completed commission can add housing units',
    );
  }
  if (commission.status === 'COMMISSIONED' && commissionedAt.isZero()) {
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
  const rent = unitPrice(rentFact.observedRent, 'housing_unit', 'observedRent');
  const observedRent: ExactUnitPrice = Object.freeze({
    amount: render(rent.amount),
    currency: rent.currency,
    perUnit: rent.perUnit,
  });
  const observedSubsidy = nonNegativeMoney(subsidy.amount, 'subsidy.amount');
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
      [input.stock, input.demand, input.rent, input.subsidy, input.commission],
      [
        {
          factId: input.outcomeId,
          payload: {
            totalDemand: renderQuantity(totalDemand, 'housing_unit'),
            housingGap: renderQuantity(gap, 'housing_unit'),
            observedRent,
            observedSubsidy,
          },
        },
        {
          factId: input.nextHousingStockId,
          payload: {
            totalUnits: renderQuantity(nextTotalUnits, 'housing_unit'),
            habitableUnits: renderQuantity(nextHabitableUnits, 'housing_unit'),
            occupiedUnits: renderQuantity(occupiedUnits, 'housing_unit'),
          },
        },
      ],
      [
        transition(
          stock.housingStockId,
          'total_units',
          totalUnits,
          nextTotalUnits,
          'housing_unit',
        ),
        transition(
          stock.housingStockId,
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
  readonly population: SocialFoundationFact<{
    readonly populationStateId: string;
    readonly population: ExactQuantity;
  }>;
  readonly workforce: SocialFoundationFact<{
    readonly workforceId: string;
    readonly employedPeople: ExactQuantity;
    readonly alreadyDeployedPeople: ExactQuantity;
    readonly unavailablePeople: ExactQuantity;
  }>;
  readonly incidents: SocialFoundationFact<{
    readonly incidentRegisterId: string;
    readonly recordedIncidents: ExactQuantity;
    /** Caller-observed rate; this Core module never selects a scaling formula. */
    readonly observedIncidentRatePer100000People: ExactQuantity | null;
  }>;
  readonly backlog: SocialFoundationFact<{
    readonly backlogStateId: string;
    readonly priorBacklog: ExactQuantity;
  }>;
  readonly intake: SocialFoundationFact<{
    readonly intakeId: string;
    readonly newCases: ExactQuantity;
  }>;
  readonly deployment: SocialFoundationFact<{
    readonly deploymentId: string;
    readonly requestedPeople: ExactQuantity;
    readonly handlingCapacity: ExactQuantity;
    readonly duration: ExactQuantity;
  }>;
  readonly funding: SocialFoundationFact<{
    readonly budgetId: string;
    readonly observedOperatingBudget: ExactMoney;
  }>;
  readonly simulationTime: SocialFoundationFact<{
    readonly timeStateId: string;
    readonly now: ExactQuantity;
  }>;
  readonly emergency: SocialFoundationFact<
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
      }
  >;
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
  const populationFact = payloadOf(input.trace, input.population, 'population');
  const workforce = payloadOf(input.trace, input.workforce, 'workforce');
  const incidentsFact = payloadOf(input.trace, input.incidents, 'incidents');
  const backlogFact = payloadOf(input.trace, input.backlog, 'backlog');
  const intake = payloadOf(input.trace, input.intake, 'intake');
  const deployment = payloadOf(input.trace, input.deployment, 'deployment');
  const funding = payloadOf(input.trace, input.funding, 'funding');
  const simulationTime = payloadOf(
    input.trace,
    input.simulationTime,
    'simulationTime',
  );
  const emergency = payloadOf(input.trace, input.emergency, 'emergency');
  whole(populationFact.population, 'person', 'population');
  const employed = whole(workforce.employedPeople, 'person', 'employedPeople');
  const alreadyDeployed = whole(
    workforce.alreadyDeployedPeople,
    'person',
    'alreadyDeployedPeople',
  );
  const unavailable = whole(
    workforce.unavailablePeople,
    'person',
    'unavailablePeople',
  );
  const available = employed.minus(alreadyDeployed).minus(unavailable);
  if (available.isNegative())
    kernelInvalid('Safety workforce allocation exceeds employed people');
  const requested = whole(
    deployment.requestedPeople,
    'person',
    'requestedPeople',
  );
  if (requested.greaterThan(available)) {
    kernelInvalid('Safety deployment cannot exceed available personnel');
  }
  const handlingCapacity = whole(
    deployment.handlingCapacity,
    'case',
    'handlingCapacity',
  );
  if (requested.isZero() && !handlingCapacity.isZero()) {
    kernelInvalid('No deployed personnel cannot claim case handling capacity');
  }
  const duration = time(deployment.duration, 'sim_day', 'deployment.duration');
  if (duration.isZero() && !requested.isZero()) {
    kernelInvalid(
      'A personnel deployment requires an explicit positive duration',
    );
  }
  whole(incidentsFact.recordedIncidents, 'incident', 'recordedIncidents');
  const priorBacklog = whole(backlogFact.priorBacklog, 'case', 'priorBacklog');
  const newCases = whole(intake.newCases, 'case', 'newCases');
  const totalCases = priorBacklog.plus(newCases);
  const resolved = minimum([totalCases, handlingCapacity], 'resolved cases');
  const nextBacklog = totalCases.minus(resolved);
  const availableAfter = available.minus(requested);
  const deployedAfter = alreadyDeployed.plus(requested);
  const now = time(simulationTime.now, 'sim_millisecond', 'simulationTime.now');
  let emergencyAuthorityAccepted = false;
  if (emergency.requested) {
    const authority = emergency.authority;
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
  }
  const incidentRate = incidentsFact.observedIncidentRatePer100000People;
  if (incidentRate !== null) {
    nonNegativeQuantity(
      incidentRate,
      'incident_per_100000_person',
      'observedIncidentRatePer100000People',
    );
  }
  const observedOperatingBudget = nonNegativeMoney(
    funding.observedOperatingBudget,
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
        input.population,
        input.workforce,
        input.incidents,
        input.backlog,
        input.intake,
        input.deployment,
        input.funding,
        input.simulationTime,
        input.emergency,
      ],
      [
        {
          factId: input.outcomeId,
          payload: {
            availableAfterDeployment: renderQuantity(availableAfter, 'person'),
            nextBacklog: renderQuantity(nextBacklog, 'case'),
            observedIncidentRatePer100000People: incidentRate,
          },
        },
        {
          factId: input.deploymentOutcomeId,
          payload: {
            deployedPeople: renderQuantity(deployedAfter, 'person'),
            resolvedCases: renderQuantity(resolved, 'case'),
          },
        },
      ],
      [
        transition(
          workforce.workforceId,
          'available_personnel',
          available,
          availableAfter,
          'person',
        ),
        transition(
          workforce.workforceId,
          'deployed_personnel',
          alreadyDeployed,
          deployedAfter,
          'person',
        ),
        transition(
          backlogFact.backlogStateId,
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
