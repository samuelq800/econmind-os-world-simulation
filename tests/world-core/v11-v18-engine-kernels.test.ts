import { describe, expect, it } from 'vitest';

import {
  assessTreasuryPayment,
  allocateSafetyDeployment,
  assertEmploymentAllocation,
  calculateAvailableFiscalCapacity,
  calculateBedOccupancy,
  calculateDebtStock,
  calculateEducationOutcome,
  calculateEnergyGeneration,
  calculateGuaranteeExposure,
  calculateHealthcareDelivery,
  calculateHouseholdCashflow,
  calculateHouseholdSaving,
  calculateHousingMetrics,
  calculateLabourMatch,
  calculateLabourMetrics,
  calculatePayrollTax,
  calculatePersonalIncomeTax,
  calculateProductionOutcome,
  calculateProjectFundingGap,
  calculateProductionInputConsumption,
  calculateProjectProgress,
  calculateRemainingProjectInputs,
  calculateResearchProgress,
  calculateSafetyMetrics,
  calculateReserveMargin,
  calculateValueAdded,
  canStartProject,
  canUseTechnologyForNewBuild,
  deriveEducationSkillHandoff,
  reconcileElectricityBalance,
  reconcileInventory,
  reserveUsableInventory,
  transitionPopulation,
  transitionEnergyStorage,
  transitionResourceLayer,
} from '../../packages/core/src/index.js';

const MONEY = (amount: string) => ({ amount, currency: 'GCU' }) as const;
const TONNES = (amount: string) => ({ amount, unit: 'tonne' }) as const;

describe('E02 population and E03 labour kernels', () => {
  it('closes cohort identity and only matches compatible, actual workers', () => {
    expect(
      transitionPopulation(
        { children0To15: '10', workingAge16To64: '20', retired65Plus: '5' },
        {
          births: '2',
          childDeaths: '1',
          workingAgeDeaths: '0',
          retiredDeaths: '0',
          childImmigration: '0',
          workingAgeImmigration: '2',
          retiredImmigration: '0',
          childEmigration: '0',
          workingAgeEmigration: '1',
          retiredEmigration: '0',
          ageIntoWorkingAge: '1',
          ageIntoRetirement: '0',
        },
      ),
    ).toMatchObject({
      cohorts: {
        children0To15: '10',
        workingAge16To64: '22',
        retired65Plus: '5',
      },
      previousTotal: '35',
      nextTotal: '37',
      netMigration: '1',
    });
    expect(
      calculateLabourMetrics({
        employed: '8',
        unemployedSearching: '2',
        workingAgePopulation: '20',
        requiredWorkers: '12',
        availableWorkers: '9',
      }),
    ).toMatchObject({
      labourForce: '10',
      vacancy: '4',
      skillGap: '3',
      unemploymentRate: '0.2',
    });
    expect(
      calculateLabourMatch({
        unemployedSupply: '6',
        vacancyDemand: '5',
        matchingCapacity: '3',
        skillMatches: true,
        locationMatches: true,
        offeredWageMeetsMinimum: true,
      }),
    ).toMatchObject({
      matched: '3',
      remainingUnemployed: '3',
      remainingVacancies: '2',
    });
    expect(
      calculateLabourMatch({
        unemployedSupply: '6',
        vacancyDemand: '5',
        matchingCapacity: '3',
        skillMatches: false,
        locationMatches: true,
        offeredWageMeetsMinimum: true,
      }),
    ).toMatchObject({
      matched: '0',
      reason: 'INCOMPATIBLE_SKILL_LOCATION_OR_WAGE',
    });
    expect(() =>
      assertEmploymentAllocation({
        aggregateEmployed: '10',
        sectorEmployment: ['6'],
        publicServiceEmployment: ['3'],
      }),
    ).toThrow('must equal aggregate employed');
  });
});

describe('E04-E07 public-service kernels', () => {
  it('enforces education, care, housing and police real capacity', () => {
    expect(
      calculateEducationOutcome({
        applicants: '100',
        seats: '80',
        teacherSupportedSeats: '60',
        budgetSupportedSeats: '70',
        enrolled: '60',
        dropoutRate: '0.1',
        completionRate: '0.5',
        durationReached: true,
      }),
    ).toMatchObject({
      actualEnrollment: '60',
      applicantsNotEnrolled: '40',
      graduates: '27',
    });
    expect(
      deriveEducationSkillHandoff({ level: 'VOCATIONAL', graduates: '27' }),
    ).toEqual({ skill: 'MEDIUM', count: '27' });
    expect(
      calculateHealthcareDelivery({
        newDemand: '20',
        priorBacklog: '10',
        staffCapacity: '25',
        facilityCapacity: '15',
        supplyCapacity: '18',
        budgetCapacity: '16',
      }),
    ).toEqual({ deliveredCare: '15', nextBacklog: '15' });
    expect(calculateBedOccupancy('5', '10')).toBe('0.5');
    expect(
      calculateHousingMetrics({
        householdDemand: '13',
        habitableUnits: '10',
        vacantHabitableUnits: '2',
        housingCost: '30',
        disposableIncome: '100',
      }),
    ).toMatchObject({
      netHousingGap: '3',
      unmetHousingUnits: '3',
      vacancyRate: '0.2',
      housingBurden: '0.3',
    });
    expect(
      calculateSafetyMetrics({
        employedStaff: '20',
        deployedStaff: '8',
        unavailableStaff: '2',
        recordedIncidents: '50',
        population: '10000',
        priorBacklog: '9',
        newCases: '4',
        resolvedCases: '5',
        casesHandled: '10',
      }),
    ).toMatchObject({
      availableStaff: '10',
      crimeRatePer100k: '500',
      caseClearanceRate: '0.5',
      nextBacklog: '8',
    });
    expect(() =>
      calculateSafetyMetrics({
        employedStaff: '5',
        deployedStaff: '4',
        unavailableStaff: '2',
        recordedIncidents: '0',
        population: '1',
        priorBacklog: '0',
        newCases: '0',
        resolvedCases: '0',
        casesHandled: '0',
      }),
    ).toThrow('deployment exceeds');
    expect(
      allocateSafetyDeployment({ availableStaff: '4', requestedStaff: '3' }),
    ).toEqual({
      deployed: '3',
      remainingAvailable: '1',
    });
  });
});

describe('E08 resource/inventory, E09 energy, and E10 production kernels', () => {
  it('conserves physical resource layers and inventory', () => {
    const initial = {
      undiscovered: '50',
      discovered: '20',
      recoverable: '10',
      developed: '10',
      extractedCumulative: '10',
    } as const;
    expect(
      transitionResourceLayer({
        initialEndowment: '100',
        layers: initial,
        from: 'UNDISCOVERED',
        to: 'DISCOVERED',
        amount: '5',
      }),
    ).toMatchObject({ undiscovered: '45', discovered: '25' });
    expect(
      reconcileInventory({
        opening: TONNES('10'),
        production: TONNES('5'),
        deliveredImports: TONNES('2'),
        domesticUse: TONNES('4'),
        deliveredExports: TONNES('3'),
        losses: TONNES('1'),
      }),
    ).toEqual(TONNES('9'));
    expect(
      reserveUsableInventory({
        buckets: {
          usable: TONNES('7'),
          strategic: TONNES('2'),
          reservedForContract: TONNES('1'),
          inTransit: TONNES('0'),
        },
        amount: TONNES('3'),
      }),
    ).toMatchObject({ usable: TONNES('4'), reservedForContract: TONNES('4') });
    expect(() =>
      transitionResourceLayer({
        initialEndowment: '100',
        layers: initial,
        from: 'UNDISCOVERED',
        to: 'RECOVERABLE',
        amount: '1',
      }),
    ).toThrow('one documented lifecycle step');
  });

  it('preserves MW/MWh separation and scales production by the weakest bottleneck', () => {
    expect(
      calculateEnergyGeneration({
        availableCapacity: { amount: '10', unit: 'MW' },
        capacityFactor: '0.5',
        hours: '2',
        fuelEnergyPerMWh: { amount: '2', unit: 'MMBtu' },
        technologyEfficiency: '0.5',
      }),
    ).toEqual({
      generated: { amount: '10', unit: 'MWh' },
      fuelBurn: { amount: '40', unit: 'MMBtu' },
    });
    expect(
      reconcileElectricityBalance({
        generation: { amount: '10', unit: 'MWh' },
        storageDischarge: { amount: '2', unit: 'MWh' },
        imports: { amount: '1', unit: 'MWh' },
        storageCharge: { amount: '1', unit: 'MWh' },
        gridLosses: { amount: '1', unit: 'MWh' },
        exports: { amount: '2', unit: 'MWh' },
      }),
    ).toEqual({ amount: '9', unit: 'MWh' });
    expect(
      calculateReserveMargin(
        { amount: '120', unit: 'MW' },
        { amount: '100', unit: 'MW' },
      ),
    ).toBe('0.2');
    expect(
      transitionEnergyStorage({
        stateOfCharge: { amount: '5', unit: 'MWh' },
        energyCapacity: { amount: '10', unit: 'MWh' },
        requestedChargeFromGrid: { amount: '10', unit: 'MWh' },
        requestedDischargeToGrid: { amount: '0', unit: 'MWh' },
        chargeEfficiency: '0.5',
        dischargeEfficiency: '0.5',
      }),
    ).toMatchObject({
      nextStateOfCharge: { amount: '10', unit: 'MWh' },
      actualChargeFromGrid: { amount: '10', unit: 'MWh' },
    });
    expect(
      calculateProductionOutcome({
        operationalCapacity: TONNES('100'),
        targetUtilisation: '0.8',
        productivity: '1',
        inputAvailability: [
          { available: TONNES('10'), required: TONNES('20') },
        ],
        energyAvailability: '0.75',
        labourAvailability: '0.9',
        logisticsAvailability: '1',
      }),
    ).toMatchObject({
      potentialOutput: TONNES('80'),
      actualOutput: TONNES('40'),
      bottleneckFactor: '0.5',
    });
    expect(
      calculateProductionInputConsumption(TONNES('4'), [
        { inputUnit: 'barrel', amountPerUnitOutput: '2' },
      ]),
    ).toEqual([{ amount: '8', unit: 'barrel' }]);
    expect(calculateValueAdded(MONEY('100'), MONEY('60'))).toEqual(MONEY('40'));
  });
});

describe('E11-E12 technology and project kernels', () => {
  it('keeps rights distinct from progress and requires all project prerequisites', () => {
    expect(
      calculateResearchProgress({
        accumulatedOutput: '2',
        requiredOutput: '10',
        fundingFactor: '2',
        humanCapitalFactor: '3',
        equipmentAvailability: '0.5',
        existingTechnologyBase: '1',
        researchEfficiency: '1',
      }),
    ).toEqual({
      periodResearchOutput: '3',
      accumulatedResearchOutput: '5',
      progress: '0.5',
      complete: false,
    });
    expect(
      canUseTechnologyForNewBuild({
        state: 'LICENSED',
        licenceUnexpired: true,
        productionLimitSatisfied: true,
        requiredPrerequisitesSatisfied: true,
      }),
    ).toBe(true);
    expect(
      canUseTechnologyForNewBuild({
        state: 'LICENSED',
        licenceUnexpired: false,
        productionLimitSatisfied: true,
        requiredPrerequisitesSatisfied: true,
      }),
    ).toBe(false);
    expect(
      canStartProject({
        fundingSecured: true,
        materialsReserved: true,
        workforceAvailable: true,
        technologyRightValid: true,
        approvalsValidForVersion: true,
      }),
    ).toBe(true);
    expect(
      calculateProjectProgress({
        plannedIncrement: '10',
        fundingReleasedFactor: '0.8',
        materialsDeliveredFactor: '0.5',
        labourAvailableFactor: '0.9',
        oversightCapacityFactor: '1',
      }),
    ).toEqual({ progressIncrement: '5', bottleneckFactor: '0.5' });
    expect(calculateProjectFundingGap(MONEY('100'), MONEY('60'))).toEqual(
      MONEY('40'),
    );
    expect(calculateRemainingProjectInputs('10', '3', '4')).toBe('3');
  });
});

describe('E13 household and E14 fiscal kernels', () => {
  it('uses only paid transfers and keeps Treasury cash distinct from budget obligations', () => {
    const cashflow = calculateHouseholdCashflow({
      wageIncome: MONEY('100'),
      capitalIncome: MONEY('10'),
      paidTransfers: MONEY('5'),
      directTaxes: MONEY('20'),
      newCredit: MONEY('30'),
      debtService: MONEY('20'),
      foodCost: MONEY('20'),
      energyCost: MONEY('10'),
      housingCost: MONEY('30'),
      basicConsumptionCost: MONEY('10'),
    });
    expect(cashflow).toMatchObject({
      grossIncome: MONEY('115'),
      disposableIncome: MONEY('95'),
      disposableResources: MONEY('105'),
      essentialLivingCost: MONEY('70'),
      realMargin: MONEY('25'),
    });
    expect(
      calculateHouseholdSaving(cashflow.disposableResources, MONEY('60')),
    ).toEqual(MONEY('45'));
    expect(
      calculatePersonalIncomeTax({
        taxableIncome: MONEY('100'),
        allowances: MONEY('10'),
        bands: [
          { upperBound: '50', marginalRate: '0.1' },
          { upperBound: null, marginalRate: '0.2' },
        ],
      }),
    ).toEqual(MONEY('13'));
    expect(calculatePayrollTax(MONEY('100'), '0.1', MONEY('4'))).toEqual(
      MONEY('6'),
    );
    expect(
      calculateDebtStock({
        priorDebt: MONEY('100'),
        newBorrowing: MONEY('20'),
        principalRepaid: MONEY('10'),
        recognisedRestructuring: MONEY('5'),
      }),
    ).toEqual(MONEY('115'));
    expect(
      calculateAvailableFiscalCapacity({
        cash: MONEY('50'),
        feasibleFinancing: MONEY('20'),
        mandatoryPayments: MONEY('30'),
        minimumBuffer: MONEY('10'),
      }),
    ).toEqual(MONEY('30'));
    expect(calculateGuaranteeExposure(MONEY('100'), MONEY('80'))).toEqual(
      MONEY('80'),
    );
    expect(assessTreasuryPayment(MONEY('50'), MONEY('70'))).toEqual({
      canPayInFull: false,
      cashShortfall: MONEY('20'),
    });
  });
});
