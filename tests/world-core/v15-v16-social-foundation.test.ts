import { describe, expect, it } from 'vitest';
import {
  assertSocialFoundationReplayEvidence,
  calculateEducationFoundation,
  calculateHealthcareFoundation,
  calculateHousingFoundation,
  calculateSafetyFoundation,
  createSocialFoundationFact,
} from '../../packages/core/src/index.js';

const q = (amount: string, unit: string) => ({ amount, unit }) as const;
const person = (amount: string) => q(amount, 'person');
const caseCount = (amount: string) => q(amount, 'case');
const unit = (amount: string) => q(amount, 'housing_unit');
const day = (amount: string) => q(amount, 'sim_day');
const ms = (amount: string) => q(amount, 'sim_millisecond');
const money = (amount: string) => ({ amount, currency: 'GCU' }) as const;
const TRACE = {
  traceId: 'SOCIAL_TRACE_01',
  calculationVersion: 'V15_V16_FOUNDATION_02',
  lineageId: 'SOCIAL_LINEAGE_01',
  sourceVersion: 'SOCIAL_SOURCE_VERSION_01',
  snapshotId: 'SOCIAL_SNAPSHOT_01',
  snapshotAt: ms('100'),
} as const;
function fact<T>(factId: string, payload: T) {
  return createSocialFoundationFact({
    trace: TRACE,
    factId,
    sourceId: `SOURCE_${factId}`,
    predecessorFactIds: [`PREDECESSOR_${factId}`],
    payload,
  });
}
function education() {
  return {
    trace: TRACE,
    outcomeId: 'EDUCATION_OUTCOME_01',
    nextCohortId: 'COHORT_NEXT_01',
    applicantPool: fact('APPLICANT_FACT_01', {
      applicantPoolId: 'APPLICANT_POOL_01',
      applicants: person('100'),
    }),
    capacity: fact('EDUCATION_CAPACITY_FACT_01', {
      teacherWorkforceId: 'TEACHER_WORKFORCE_01',
      teachers: person('2'),
      facilityId: 'SCHOOL_01',
      seats: person('50'),
      budgetCapacityId: 'EDUCATION_BUDGET_01',
      budgetSupportedSeats: person('30'),
      teacherSupportedSeats: person('20'),
      availableEnrollmentCapacity: person('20'),
    }),
    cohort: fact('EDUCATION_COHORT_FACT_01', {
      cohortId: 'COHORT_01',
      trainingProgrammeId: 'TRAINING_PROGRAMME_01',
      level: 'VOCATIONAL' as const,
      specialisationId: 'MANUFACTURING_01',
      enrolled: person('10'),
      cumulativeGraduates: person('7'),
      elapsedDuration: day('10'),
      requiredDuration: day('10'),
    }),
    outcome: fact('EDUCATION_OUTCOME_FACT_01', {
      admitted: person('5'),
      graduates: person('4'),
    }),
    skillTarget: fact('EDUCATION_SKILL_FACT_01', {
      handoffId: 'SKILL_HANDOFF_01',
      labourSkillStockId: 'MEDIUM_SKILL_STOCK_01',
      skill: 'MEDIUM' as const,
      before: person('40'),
    }),
  };
}

describe('V15–V16 social foundation', () => {
  it('uses explicit education capacity/outcome facts and never formula-selected rates', () => {
    const input = education();
    expect(calculateEducationFoundation(input)).toMatchObject({
      capacity: { actualSeats: person('20') },
      admitted: person('5'),
      graduates: person('4'),
      nextCohort: { enrolled: person('11'), cumulativeGraduates: person('11') },
      skillHandoff: { before: person('40'), after: person('44') },
      directProductivityEffect: null,
    });
    const early = education();
    early.cohort = fact('EDUCATION_COHORT_FACT_02', {
      ...early.cohort.payload,
      elapsedDuration: day('9.5'),
    });
    expect(() => calculateEducationFoundation(early)).toThrow(
      'requires the explicit programme duration',
    );
    const noCapacity = education();
    noCapacity.capacity = fact('EDUCATION_CAPACITY_FACT_02', {
      ...noCapacity.capacity.payload,
      teachers: person('0'),
      seats: person('0'),
      teacherSupportedSeats: person('0'),
      availableEnrollmentCapacity: person('0'),
    });
    noCapacity.cohort = fact('EDUCATION_COHORT_FACT_03', {
      ...noCapacity.cohort.payload,
      enrolled: person('0'),
    });
    noCapacity.outcome = fact('EDUCATION_OUTCOME_FACT_02', {
      admitted: person('0'),
      graduates: person('0'),
    });
    noCapacity.skillTarget = null;
    expect(calculateEducationFoundation(noCapacity).graduates).toEqual(
      person('0'),
    );
  });

  it('keeps healthcare, housing, and safety physical boundaries intact', () => {
    const health = calculateHealthcareFoundation({
      trace: TRACE,
      outcomeId: 'HEALTH_OUTCOME_01',
      deliveredCareId: 'DELIVERED_CARE_01',
      backlog: fact('HEALTH_BACKLOG_FACT_01', {
        backlogStateId: 'HEALTH_BACKLOG_01',
        priorBacklog: caseCount('4'),
      }),
      demand: fact('HEALTH_DEMAND_FACT_01', {
        demandId: 'HEALTH_DEMAND_01',
        newDemand: caseCount('6'),
      }),
      staff: fact('HEALTH_STAFF_FACT_01', {
        workforceId: 'HEALTH_WORKFORCE_01',
        staffedPeople: person('2'),
        careCapacity: caseCount('8'),
      }),
      facility: fact('HEALTH_FACILITY_FACT_01', {
        facilityId: 'HOSPITAL_01',
        careCapacity: caseCount('9'),
        bedStateId: 'BEDS_01',
        totalBeds: q('10', 'bed'),
        occupiedBeds: q('4', 'bed'),
      }),
      medicalSupply: fact('HEALTH_SUPPLY_FACT_01', {
        inventoryId: 'MEDICINE_01',
        availableMedicalDoses: q('10', 'medical_dose'),
        careCapacity: caseCount('5'),
      }),
      budget: fact('HEALTH_BUDGET_FACT_01', {
        budgetId: 'HEALTH_BUDGET_01',
        observedOperatingBudget: money('1000000'),
        careCapacity: caseCount('100'),
      }),
    });
    expect(health).toMatchObject({
      deliveredCare: caseCount('5'),
      nextBacklog: caseCount('5'),
      directHealthEffect: null,
    });
    const housingInput = {
      trace: TRACE,
      outcomeId: 'HOUSING_OUTCOME_01',
      nextHousingStockId: 'HOUSING_STOCK_NEXT_01',
      stock: fact('HOUSING_STOCK_FACT_01', {
        housingStockId: 'HOUSING_STOCK_01',
        totalUnits: unit('10'),
        habitableUnits: unit('8'),
        occupiedUnits: unit('7'),
      }),
      demand: fact('HOUSING_DEMAND_FACT_01', {
        householdDemandId: 'HOUSEHOLD_DEMAND_01',
        householdDemand: unit('9'),
        temporaryProjectDemandId: 'PROJECT_DEMAND_01',
        temporaryProjectDemand: unit('1'),
        migrationDemandId: 'MIGRATION_DEMAND_01',
        migrationDemand: unit('2'),
      }),
      rent: fact('RENT_FACT_01', {
        rentStateId: 'RENT_01',
        observedRent: {
          amount: '12.5',
          currency: 'GCU',
          perUnit: 'housing_unit',
        },
        rentRuleVersion: 'RENT_RULE_01',
      }),
      subsidy: fact('SUBSIDY_FACT_01', {
        subsidyId: 'SUBSIDY_01',
        programmeId: 'HOUSING_PROGRAMME_01',
        amount: money('1000000'),
      }),
      commission: fact('COMMISSION_FACT_01', {
        commissionId: 'COMMISSION_01',
        projectId: 'PROJECT_01',
        status: 'NOT_COMMISSIONED' as const,
        commissionedAt: day('0'),
        newHabitableUnits: unit('0'),
      }),
    };
    const housing = calculateHousingFoundation(housingInput);
    expect(housing).toMatchObject({
      stock: { totalUnits: unit('10') },
      housingGap: unit('4'),
      supplyAddedByCompletedCommission: unit('0'),
    });
    expect(
      calculateHousingFoundation({
        ...housingInput,
        commission: fact('COMMISSION_FACT_02', {
          commissionId: 'COMMISSION_02',
          projectId: 'PROJECT_02',
          status: 'COMMISSIONED' as const,
          commissionedAt: day('1'),
          newHabitableUnits: unit('3'),
        }),
      }),
    ).toMatchObject({
      stock: { totalUnits: unit('13'), habitableUnits: unit('11') },
      supplyAddedByCompletedCommission: unit('3'),
    });
    const safetyInput = {
      trace: TRACE,
      outcomeId: 'SAFETY_OUTCOME_01',
      deploymentOutcomeId: 'SAFETY_DEPLOYMENT_OUTCOME_01',
      population: fact('POPULATION_FACT_01', {
        populationStateId: 'POPULATION_01',
        population: person('1000'),
      }),
      workforce: fact('WORKFORCE_FACT_01', {
        workforceId: 'SAFETY_WORKFORCE_01',
        employedPeople: person('10'),
        alreadyDeployedPeople: person('2'),
        unavailablePeople: person('1'),
      }),
      incidents: fact('INCIDENT_FACT_01', {
        incidentRegisterId: 'INCIDENTS_01',
        recordedIncidents: q('12', 'incident'),
        observedIncidentRatePer100000People: q(
          '1200',
          'incident_per_100000_person',
        ),
      }),
      backlog: fact('SAFETY_BACKLOG_FACT_01', {
        backlogStateId: 'SAFETY_BACKLOG_01',
        priorBacklog: caseCount('5'),
      }),
      intake: fact('INTAKE_FACT_01', {
        intakeId: 'INTAKE_01',
        newCases: caseCount('6'),
      }),
      deployment: fact('DEPLOYMENT_FACT_01', {
        deploymentId: 'DEPLOYMENT_01',
        requestedPeople: person('3'),
        handlingCapacity: caseCount('4'),
        duration: day('1'),
      }),
      funding: fact('FUNDING_FACT_01', {
        budgetId: 'SAFETY_BUDGET_01',
        observedOperatingBudget: money('1000000'),
      }),
      simulationTime: fact('TIME_FACT_01', {
        timeStateId: 'TIME_01',
        now: ms('100'),
      }),
      emergency: fact('EMERGENCY_FACT_01', {
        requested: false as const,
        authority: null,
      }),
    };
    const safety = calculateSafetyFoundation(safetyInput);
    expect(safety).toMatchObject({
      resolvedCases: caseCount('4'),
      nextBacklog: caseCount('7'),
      recordedIncidentRatePer100000People: q(
        '1200',
        'incident_per_100000_person',
      ),
      directStabilityEffect: null,
    });
    expect(() =>
      calculateSafetyFoundation({
        ...safetyInput,
        emergency: fact('EMERGENCY_FACT_02', {
          requested: true as const,
          authority: {
            authorityId: 'EMERGENCY_AUTHORITY_01',
            captainApprovalId: 'CAPTAIN_APPROVAL_01',
            status: 'EXPIRED' as const,
            issuedAt: ms('1'),
            expiresAt: ms('100'),
          },
        }),
      }),
    ).toThrow('active, unexpired Captain authority');
  });

  it('fails closed on forged, stale, and mixed replay evidence', () => {
    const input = education();
    const result = calculateEducationFoundation(input);
    const facts = [
      input.applicantPool,
      input.capacity,
      input.cohort,
      input.outcome,
      input.skillTarget!,
    ];
    expect(() =>
      assertSocialFoundationReplayEvidence(result.trace, facts),
    ).not.toThrow();
    const forged = {
      ...input.applicantPool,
      payload: { ...input.applicantPool.payload, applicants: person('101') },
    };
    expect(() =>
      calculateEducationFoundation({ ...input, applicantPool: forged }),
    ).toThrow('canonical payload evidence');
    const stale = { ...input.capacity, sourceVersion: 'STALE_VERSION_01' };
    expect(() =>
      calculateEducationFoundation({ ...input, capacity: stale }),
    ).toThrow('stale or mixed lineage');
    const mixed = { ...input.capacity, sourceId: 'MIXED_SOURCE_01' };
    expect(() =>
      assertSocialFoundationReplayEvidence(result.trace, [
        input.applicantPool,
        mixed,
        input.cohort,
        input.outcome,
        input.skillTarget!,
      ]),
    ).toThrow('does not exactly equal');
  });
});
