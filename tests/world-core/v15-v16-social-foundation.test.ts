import { describe, expect, it } from 'vitest';

import {
  assertSocialFoundationPersonnelAllocation,
  calculateEducationFoundation,
  calculateHealthcareFoundation,
  calculateHousingFoundation,
  calculateSafetyFoundation,
} from '../../packages/core/src/index.js';

const MONEY = (amount: string) => ({ amount, currency: 'GCU' }) as const;
const PERSON = (amount: string) => ({ amount, unit: 'person' }) as const;
const CASE = (amount: string) => ({ amount, unit: 'case' }) as const;
const BED = (amount: string) => ({ amount, unit: 'bed' }) as const;
const DOSE = (amount: string) => ({ amount, unit: 'medical_dose' }) as const;
const UNIT = (amount: string) => ({ amount, unit: 'housing_unit' }) as const;
const INCIDENT = (amount: string) => ({ amount, unit: 'incident' }) as const;
const DAY = (amount: string) => ({ amount, unit: 'sim_day' }) as const;
const MILLIS = (amount: string) =>
  ({ amount, unit: 'sim_millisecond' }) as const;
const RATIO = (amount: string) => ({ amount, unit: 'ratio' }) as const;

function educationInput() {
  return {
    trace: { traceId: 'TRACE_E04_01', calculationVersion: 'V15_1_FOUNDATION' },
    outcomeId: 'EDUCATION_OUTCOME_01',
    nextCohortId: 'COHORT_NEXT_01',
    enrollmentRequestId: 'ENROLLMENT_REQUEST_01',
    applicantPool: {
      applicantPoolId: 'APPLICANT_POOL_01',
      applicants: PERSON('100'),
    },
    capacity: {
      teacherWorkforceId: 'TEACHER_WORKFORCE_01',
      teachers: PERSON('2'),
      facilityId: 'SCHOOL_01',
      seats: PERSON('50'),
      budgetCapacityId: 'EDUCATION_BUDGET_CAPACITY_01',
      budgetSupportedSeats: PERSON('30'),
      studentsPerTeacher: {
        amount: '10',
        outputUnit: 'person',
        inputUnit: 'person',
      },
    },
    cohort: {
      cohortId: 'COHORT_01',
      trainingProgrammeId: 'TRAINING_PROGRAMME_01',
      level: 'VOCATIONAL' as const,
      specialisationId: 'MANUFACTURING_01',
      enrolled: PERSON('10'),
      cumulativeGraduates: PERSON('7'),
      elapsedDuration: DAY('10'),
      requiredDuration: DAY('10'),
    },
    newEnrollment: PERSON('5'),
    graduation: { dropoutRate: RATIO('0.2'), completionRate: RATIO('0.5') },
    skillTarget: {
      handoffId: 'SKILL_HANDOFF_01',
      labourSkillStockId: 'MEDIUM_SKILL_STOCK_01',
      skill: 'MEDIUM' as const,
      before: PERSON('40'),
    },
  };
}

function healthcareInput() {
  return {
    trace: { traceId: 'TRACE_E05_01', calculationVersion: 'V15_2_FOUNDATION' },
    outcomeId: 'HEALTH_OUTCOME_01',
    deliveredCareId: 'DELIVERED_CARE_01',
    serviceRequestId: 'HEALTH_SERVICE_REQUEST_01',
    backlog: { backlogStateId: 'HEALTH_BACKLOG_01', priorBacklog: CASE('4') },
    demand: { demandId: 'HEALTH_DEMAND_01', newDemand: CASE('6') },
    staff: {
      workforceId: 'HEALTH_WORKFORCE_01',
      staffedPeople: PERSON('2'),
      careCapacity: CASE('8'),
    },
    facility: {
      facilityId: 'HOSPITAL_01',
      careCapacity: CASE('9'),
      bedStateId: 'HOSPITAL_BEDS_01',
      totalBeds: BED('10'),
      occupiedBeds: BED('4'),
    },
    medicalSupply: {
      inventoryId: 'MEDICAL_INVENTORY_01',
      availableMedicalDoses: DOSE('10'),
      careCapacity: CASE('5'),
    },
    budget: {
      budgetId: 'HEALTH_BUDGET_01',
      observedOperatingBudget: MONEY('100'),
      careCapacity: CASE('100'),
    },
  };
}

function housingInput() {
  return {
    trace: { traceId: 'TRACE_E06_01', calculationVersion: 'V16_1_FOUNDATION' },
    outcomeId: 'HOUSING_OUTCOME_01',
    nextHousingStockId: 'HOUSING_STOCK_NEXT_01',
    stock: {
      housingStockId: 'HOUSING_STOCK_01',
      totalUnits: UNIT('10'),
      habitableUnits: UNIT('8'),
      occupiedUnits: UNIT('7'),
    },
    demand: {
      householdDemandId: 'HOUSEHOLD_DEMAND_01',
      householdDemand: UNIT('9'),
      temporaryProjectDemandId: 'PROJECT_DEMAND_01',
      temporaryProjectDemand: UNIT('1'),
      migrationDemandId: 'MIGRATION_DEMAND_01',
      migrationDemand: UNIT('2'),
    },
    rent: {
      rentStateId: 'RENT_STATE_01',
      observedRent: {
        amount: '12.5',
        currency: 'GCU',
        perUnit: 'housing_unit',
      },
      rentRuleVersion: 'RENT_RULE_01',
    },
    subsidy: {
      subsidyId: 'SUBSIDY_01',
      programmeId: 'HOUSING_PROGRAMME_01',
      amount: MONEY('100'),
    },
    commission: {
      commissionId: 'HOUSING_COMMISSION_01',
      projectId: 'HOUSING_PROJECT_01',
      status: 'NOT_COMMISSIONED' as const,
      commissionedAt: DAY('0'),
      newHabitableUnits: UNIT('0'),
    },
  };
}

function safetyInput() {
  return {
    trace: { traceId: 'TRACE_E07_01', calculationVersion: 'V16_2_FOUNDATION' },
    outcomeId: 'SAFETY_OUTCOME_01',
    deploymentOutcomeId: 'SAFETY_DEPLOYMENT_OUTCOME_01',
    population: {
      populationStateId: 'POPULATION_01',
      population: PERSON('1000'),
    },
    workforce: {
      workforceId: 'SAFETY_WORKFORCE_01',
      employedPeople: PERSON('10'),
      alreadyDeployedPeople: PERSON('2'),
      unavailablePeople: PERSON('1'),
    },
    incidents: {
      incidentRegisterId: 'SAFETY_INCIDENTS_01',
      recordedIncidents: INCIDENT('12'),
    },
    backlog: { backlogStateId: 'SAFETY_BACKLOG_01', priorBacklog: CASE('5') },
    intake: { intakeId: 'SAFETY_INTAKE_01', newCases: CASE('6') },
    deployment: {
      deploymentId: 'SAFETY_DEPLOYMENT_01',
      requestedPeople: PERSON('3'),
      handlingCapacity: CASE('4'),
      duration: DAY('1'),
    },
    funding: {
      budgetId: 'SAFETY_BUDGET_01',
      observedOperatingBudget: MONEY('100'),
    },
    simulationTime: { timeStateId: 'SIM_TIME_01', now: MILLIS('100') },
    emergency: { requested: false as const, authority: null },
  };
}

describe('V15 education foundation', () => {
  it('requires real teachers, seats, duration, and graduates for a skill handoff', () => {
    const result = calculateEducationFoundation(educationInput());

    expect(result).toMatchObject({
      capacity: {
        teacherSupportedSeats: PERSON('20'),
        actualSeats: PERSON('20'),
      },
      admitted: PERSON('5'),
      graduates: PERSON('4'),
      nextCohort: { enrolled: PERSON('11'), cumulativeGraduates: PERSON('11') },
      skillHandoff: {
        graduatesTransferred: PERSON('4'),
        before: PERSON('40'),
        after: PERSON('44'),
      },
      directProductivityEffect: null,
    });
    expect(result.trace).toMatchObject({
      module: 'E04_EDUCATION',
      inputIds: expect.arrayContaining([
        'TEACHER_WORKFORCE_01',
        'TRAINING_PROGRAMME_01',
      ]),
      outputIds: ['EDUCATION_OUTCOME_01', 'COHORT_NEXT_01', 'SKILL_HANDOFF_01'],
    });

    const withoutTeachers = educationInput();
    withoutTeachers.capacity.teachers = PERSON('0');
    withoutTeachers.cohort.enrolled = PERSON('0');
    withoutTeachers.newEnrollment = PERSON('0');
    withoutTeachers.skillTarget = null;
    expect(calculateEducationFoundation(withoutTeachers)).toMatchObject({
      capacity: { actualSeats: PERSON('0') },
      graduates: PERSON('0'),
      skillHandoff: null,
    });
  });

  it('rejects early, unbacked, or non-integral person graduation claims', () => {
    const early = educationInput();
    early.cohort.elapsedDuration = DAY('9.5');
    early.skillTarget = null;
    expect(calculateEducationFoundation(early).graduates).toEqual(PERSON('0'));

    const noSeatForExistingCohort = educationInput();
    noSeatForExistingCohort.capacity.seats = PERSON('0');
    expect(() => calculateEducationFoundation(noSeatForExistingCohort)).toThrow(
      'cannot exceed actual teacher and seat capacity',
    );

    const fractionalGraduates = educationInput();
    fractionalGraduates.graduation = {
      dropoutRate: RATIO('0.1'),
      completionRate: RATIO('0.5'),
    };
    expect(() => calculateEducationFoundation(fractionalGraduates)).toThrow(
      'whole non-negative person',
    );
  });
});

describe('V15 healthcare foundation', () => {
  it('delivers only the intersection of staff, facility, supply, and explicit budget capacity', () => {
    const result = calculateHealthcareFoundation(healthcareInput());
    expect(result).toMatchObject({
      deliveredCare: CASE('5'),
      unmetCare: CASE('5'),
      nextBacklog: CASE('5'),
      bedOccupancy: RATIO('0.4'),
      directHealthEffect: null,
    });
    expect(result.trace.transitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metric: 'care_backlog',
          before: CASE('4'),
          after: CASE('5'),
        }),
      ]),
    );

    const noStaff = healthcareInput();
    noStaff.staff.staffedPeople = PERSON('0');
    noStaff.staff.careCapacity = CASE('0');
    expect(calculateHealthcareFoundation(noStaff)).toMatchObject({
      deliveredCare: CASE('0'),
      nextBacklog: CASE('10'),
      directHealthEffect: null,
    });

    const noMedicine = healthcareInput();
    noMedicine.medicalSupply.availableMedicalDoses = DOSE('0');
    noMedicine.medicalSupply.careCapacity = CASE('0');
    expect(calculateHealthcareFoundation(noMedicine)).toMatchObject({
      deliveredCare: CASE('0'),
      nextBacklog: CASE('10'),
    });
  });

  it('does not turn observed money into a health status result', () => {
    const low = calculateHealthcareFoundation(healthcareInput());
    const highInput = healthcareInput();
    highInput.budget.observedOperatingBudget = MONEY('1000000');
    const high = calculateHealthcareFoundation(highInput);
    expect(high.deliveredCare).toEqual(low.deliveredCare);
    expect(high.nextBacklog).toEqual(low.nextBacklog);
    expect(high.directHealthEffect).toBeNull();
  });
});

describe('V16 housing foundation', () => {
  it('keeps subsidy and rent observation separate from physical housing supply', () => {
    const result = calculateHousingFoundation(housingInput());
    expect(result).toMatchObject({
      stock: {
        totalUnits: UNIT('10'),
        habitableUnits: UNIT('8'),
        occupiedUnits: UNIT('7'),
        vacantUnits: UNIT('1'),
      },
      totalDemand: UNIT('12'),
      housingGap: UNIT('4'),
      occupancyRate: RATIO('0.875'),
      observedRent: {
        amount: '12.5',
        currency: 'GCU',
        perUnit: 'housing_unit',
      },
      observedSubsidy: MONEY('100'),
      supplyAddedByCompletedCommission: UNIT('0'),
    });

    const largerSubsidy = housingInput();
    largerSubsidy.subsidy.amount = MONEY('1000000');
    expect(calculateHousingFoundation(largerSubsidy).stock).toEqual(
      result.stock,
    );

    const commissioned = housingInput();
    commissioned.commission.status = 'COMMISSIONED';
    commissioned.commission.commissionedAt = DAY('1');
    commissioned.commission.newHabitableUnits = UNIT('3');
    expect(calculateHousingFoundation(commissioned)).toMatchObject({
      stock: { totalUnits: UNIT('13'), habitableUnits: UNIT('11') },
      housingGap: UNIT('1'),
      supplyAddedByCompletedCommission: UNIT('3'),
    });
  });

  it('rejects uncommissioned supply claims', () => {
    const uncommissionedSupply = housingInput();
    uncommissionedSupply.commission.newHabitableUnits = UNIT('1');
    expect(() => calculateHousingFoundation(uncommissionedSupply)).toThrow(
      'Only an explicit completed commission',
    );
  });
});

describe('V16 public safety foundation', () => {
  it('conserves real personnel and uses capacity rather than money for case resolution', () => {
    const result = calculateSafetyFoundation(safetyInput());
    expect(result).toMatchObject({
      availableBeforeDeployment: PERSON('7'),
      availableAfterDeployment: PERSON('4'),
      deployedPeople: PERSON('5'),
      resolvedCases: CASE('4'),
      nextBacklog: CASE('7'),
      recordedIncidentRatePer100000People: {
        amount: '1200',
        unit: 'incident_per_100000_person',
      },
      directStabilityEffect: null,
    });

    const highFunding = safetyInput();
    highFunding.funding.observedOperatingBudget = MONEY('1000000');
    const highFundingResult = calculateSafetyFoundation(highFunding);
    expect(highFundingResult.resolvedCases).toEqual(result.resolvedCases);
    expect(highFundingResult.nextBacklog).toEqual(result.nextBacklog);

    assertSocialFoundationPersonnelAllocation({
      allocations: [
        {
          personPoolId: 'EDUCATION_STAFF_01',
          availablePeople: PERSON('10'),
          assignedPeople: PERSON('10'),
        },
        {
          personPoolId: 'HEALTH_STAFF_01',
          availablePeople: PERSON('8'),
          assignedPeople: PERSON('7'),
        },
      ],
    });
    expect(() =>
      assertSocialFoundationPersonnelAllocation({
        allocations: [
          {
            personPoolId: 'SAME_PERSON_POOL_01',
            availablePeople: PERSON('2'),
            assignedPeople: PERSON('1'),
          },
          {
            personPoolId: 'SAME_PERSON_POOL_01',
            availablePeople: PERSON('2'),
            assignedPeople: PERSON('1'),
          },
        ],
      }),
    ).toThrow('must not repeat an identifier');
  });

  it('rejects expired emergency authority and accepts only active Captain authority', () => {
    const expired = safetyInput();
    expired.emergency = {
      requested: true,
      authority: {
        authorityId: 'EMERGENCY_AUTHORITY_01',
        captainApprovalId: 'CAPTAIN_APPROVAL_01',
        status: 'EXPIRED',
        issuedAt: MILLIS('1'),
        expiresAt: MILLIS('100'),
      },
    };
    expect(() => calculateSafetyFoundation(expired)).toThrow(
      'active, unexpired Captain authority',
    );

    const active = safetyInput();
    active.emergency = {
      requested: true,
      authority: {
        authorityId: 'EMERGENCY_AUTHORITY_02',
        captainApprovalId: 'CAPTAIN_APPROVAL_02',
        status: 'ACTIVE',
        issuedAt: MILLIS('1'),
        expiresAt: MILLIS('101'),
      },
    };
    expect(calculateSafetyFoundation(active)).toMatchObject({
      emergencyAuthorityAccepted: true,
      trace: {
        inputIds: expect.arrayContaining([
          'EMERGENCY_AUTHORITY_02',
          'CAPTAIN_APPROVAL_02',
        ]),
      },
    });
  });
});
