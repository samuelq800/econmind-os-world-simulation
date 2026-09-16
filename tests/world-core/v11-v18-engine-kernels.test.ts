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
  assertCurrenciesBoundToInternational,
  convertToInternationalSettlementMoney,
  indexInternationalCurrencyBindings,
  calculateSafetyMetrics,
  calculateReserveMargin,
  calculateValueAdded,
  canStartProject,
  canUseTechnologyForNewBuild,
  deriveEducationSkillHandoff,
  reconcileElectricityBalance,
  reconcileInventory,
  reserveUsableInventory,
  settleCrossBorderPayment,
  settleCrossBorderPaymentFromBindings,
  transitionPopulation,
  transitionEnergyStorage,
  transitionResourceLayer,
} from '../../packages/core/src/index.js';

const MONEY = (amount: string) => ({ amount, currency: 'GCU' }) as const;
const TONNES = (amount: string) => ({ amount, unit: 'tonne' }) as const;
const PERSON = (amount: string) => ({ amount, unit: 'person' }) as const;
const CASE = (amount: string) => ({ amount, unit: 'case' }) as const;
const BED = (amount: string) => ({ amount, unit: 'bed' }) as const;
const HOUSING_UNIT = (amount: string) =>
  ({ amount, unit: 'housing_unit' }) as const;
const INCIDENT = (amount: string) => ({ amount, unit: 'incident' }) as const;
const RATIO = (amount: string) => ({ amount, unit: 'ratio' }) as const;
const HOUR = (amount: string) => ({ amount, unit: 'hour' }) as const;
const PERIOD = (amount: string) => ({ amount, unit: 'period' }) as const;

describe('E02 population and E03 labour kernels', () => {
  it('closes cohort identity and only matches compatible, actual workers', () => {
    expect(
      transitionPopulation(
        {
          children0To15: PERSON('10'),
          workingAge16To64: PERSON('20'),
          retired65Plus: PERSON('5'),
        },
        {
          births: PERSON('2'),
          childDeaths: PERSON('1'),
          workingAgeDeaths: PERSON('0'),
          retiredDeaths: PERSON('0'),
          childImmigration: PERSON('0'),
          workingAgeImmigration: PERSON('2'),
          retiredImmigration: PERSON('0'),
          childEmigration: PERSON('0'),
          workingAgeEmigration: PERSON('1'),
          retiredEmigration: PERSON('0'),
          ageIntoWorkingAge: PERSON('1'),
          ageIntoRetirement: PERSON('0'),
        },
      ),
    ).toMatchObject({
      cohorts: {
        children0To15: PERSON('10'),
        workingAge16To64: PERSON('22'),
        retired65Plus: PERSON('5'),
      },
      previousTotal: PERSON('35'),
      nextTotal: PERSON('37'),
      netMigration: PERSON('1'),
    });
    expect(
      calculateLabourMetrics({
        employed: PERSON('8'),
        unemployedSearching: PERSON('2'),
        workingAgePopulation: PERSON('20'),
        requiredWorkers: PERSON('12'),
        availableWorkers: PERSON('9'),
      }),
    ).toMatchObject({
      labourForce: PERSON('10'),
      vacancy: PERSON('4'),
      skillGap: PERSON('3'),
      unemploymentRate: RATIO('0.2'),
    });
    expect(
      calculateLabourMatch({
        unemployedSupply: PERSON('6'),
        vacancyDemand: PERSON('5'),
        matchingCapacity: PERSON('3'),
        skillMatches: true,
        locationMatches: true,
        offeredWageMeetsMinimum: true,
      }),
    ).toMatchObject({
      matched: PERSON('3'),
      remainingUnemployed: PERSON('3'),
      remainingVacancies: PERSON('2'),
    });
    expect(
      calculateLabourMatch({
        unemployedSupply: PERSON('6'),
        vacancyDemand: PERSON('5'),
        matchingCapacity: PERSON('3'),
        skillMatches: false,
        locationMatches: true,
        offeredWageMeetsMinimum: true,
      }),
    ).toMatchObject({
      matched: PERSON('0'),
      reason: 'INCOMPATIBLE_SKILL_LOCATION_OR_WAGE',
    });
    expect(() =>
      assertEmploymentAllocation({
        aggregateEmployed: PERSON('10'),
        sectorEmployment: [PERSON('6')],
        publicServiceEmployment: [PERSON('3')],
      }),
    ).toThrow('must equal aggregate employed');
  });
});

describe('E04-E07 public-service kernels', () => {
  it('enforces education, care, housing and police real capacity', () => {
    expect(
      calculateEducationOutcome({
        applicants: PERSON('100'),
        seats: PERSON('80'),
        teacherSupportedSeats: PERSON('60'),
        budgetSupportedSeats: PERSON('70'),
        enrolled: PERSON('60'),
        dropoutRate: RATIO('0.1'),
        completionRate: RATIO('0.5'),
        durationReached: true,
      }),
    ).toMatchObject({
      actualEnrollment: PERSON('60'),
      applicantsNotEnrolled: PERSON('40'),
      graduates: PERSON('27'),
    });
    expect(
      deriveEducationSkillHandoff({
        level: 'VOCATIONAL',
        graduates: PERSON('27'),
      }),
    ).toEqual({ skill: 'MEDIUM', count: PERSON('27') });
    expect(
      calculateHealthcareDelivery({
        newDemand: CASE('20'),
        priorBacklog: CASE('10'),
        staffCapacity: CASE('25'),
        facilityCapacity: CASE('15'),
        supplyCapacity: CASE('18'),
        budgetCapacity: CASE('16'),
      }),
    ).toEqual({ deliveredCare: CASE('15'), nextBacklog: CASE('15') });
    expect(calculateBedOccupancy(BED('5'), BED('10'))).toEqual(RATIO('0.5'));
    expect(
      calculateHousingMetrics({
        householdDemand: HOUSING_UNIT('13'),
        habitableUnits: HOUSING_UNIT('10'),
        vacantHabitableUnits: HOUSING_UNIT('2'),
        housingCost: MONEY('30'),
        disposableIncome: MONEY('100'),
      }),
    ).toMatchObject({
      netHousingGap: HOUSING_UNIT('3'),
      unmetHousingUnits: HOUSING_UNIT('3'),
      vacancyRate: RATIO('0.2'),
      housingBurden: {
        amount: '0.3',
        outputUnit: 'GCU',
        inputUnit: 'GCU',
      },
    });
    expect(
      calculateSafetyMetrics({
        employedStaff: PERSON('20'),
        deployedStaff: PERSON('8'),
        unavailableStaff: PERSON('2'),
        recordedIncidents: INCIDENT('50'),
        population: PERSON('10000'),
        priorBacklog: CASE('9'),
        newCases: CASE('4'),
        resolvedCases: CASE('5'),
        casesHandled: CASE('10'),
      }),
    ).toMatchObject({
      availableStaff: PERSON('10'),
      crimeRatePer100k: { amount: '500', unit: 'incident_per_100k_person' },
      caseClearanceRate: RATIO('0.5'),
      nextBacklog: CASE('8'),
    });
    expect(() =>
      calculateSafetyMetrics({
        employedStaff: PERSON('5'),
        deployedStaff: PERSON('4'),
        unavailableStaff: PERSON('2'),
        recordedIncidents: INCIDENT('0'),
        population: PERSON('1'),
        priorBacklog: CASE('0'),
        newCases: CASE('0'),
        resolvedCases: CASE('0'),
        casesHandled: CASE('0'),
      }),
    ).toThrow('deployment exceeds');
    expect(
      allocateSafetyDeployment({
        availableStaff: PERSON('4'),
        requestedStaff: PERSON('3'),
      }),
    ).toEqual({
      deployed: PERSON('3'),
      remainingAvailable: PERSON('1'),
    });
  });
});

describe('E08 resource/inventory, E09 energy, and E10 production kernels', () => {
  it('conserves physical resource layers and inventory', () => {
    const initial = {
      undiscovered: TONNES('50'),
      discovered: TONNES('20'),
      recoverable: TONNES('10'),
      developed: TONNES('10'),
      extractedCumulative: TONNES('10'),
    } as const;
    expect(
      transitionResourceLayer({
        initialEndowment: TONNES('100'),
        layers: initial,
        from: 'UNDISCOVERED',
        to: 'DISCOVERED',
        amount: TONNES('5'),
      }),
    ).toMatchObject({ undiscovered: TONNES('45'), discovered: TONNES('25') });
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
        initialEndowment: TONNES('100'),
        layers: initial,
        from: 'UNDISCOVERED',
        to: 'RECOVERABLE',
        amount: TONNES('1'),
      }),
    ).toThrow('one documented lifecycle step');
  });

  it('preserves MW/MWh separation and scales production by the weakest bottleneck', () => {
    expect(
      calculateEnergyGeneration({
        availableCapacity: { amount: '10', unit: 'MW' },
        capacityFactor: RATIO('0.5'),
        hours: HOUR('2'),
        fuelEnergyPerMWh: {
          amount: '2',
          outputUnit: 'MMBtu',
          inputUnit: 'MWh',
        },
        technologyEfficiency: RATIO('0.5'),
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
    ).toEqual({ amount: '0.2', unit: 'MW_per_MW' });
    expect(
      transitionEnergyStorage({
        stateOfCharge: { amount: '5', unit: 'MWh' },
        energyCapacity: { amount: '10', unit: 'MWh' },
        requestedChargeFromGrid: { amount: '10', unit: 'MWh' },
        requestedDischargeToGrid: { amount: '0', unit: 'MWh' },
        chargeEfficiency: RATIO('0.5'),
        dischargeEfficiency: RATIO('0.5'),
      }),
    ).toMatchObject({
      nextStateOfCharge: { amount: '10', unit: 'MWh' },
      actualChargeFromGrid: { amount: '10', unit: 'MWh' },
    });
    expect(
      calculateProductionOutcome({
        operationalCapacity: {
          amount: '100',
          outputUnit: 'tonne',
          inputUnit: 'period',
        },
        operatingDuration: PERIOD('1'),
        targetUtilisation: RATIO('0.8'),
        productivity: {
          amount: '1',
          outputUnit: 'tonne',
          inputUnit: 'tonne',
        },
        inputAvailability: [
          { available: TONNES('10'), required: TONNES('20') },
        ],
        energyAvailability: RATIO('0.75'),
        labourAvailability: RATIO('0.9'),
        logisticsAvailability: RATIO('1'),
      }),
    ).toMatchObject({
      potentialOutput: TONNES('80'),
      actualOutput: TONNES('40'),
      bottleneckFactor: RATIO('0.5'),
    });
    expect(
      calculateProductionInputConsumption(TONNES('4'), [
        {
          inputPerOutput: {
            amount: '2',
            outputUnit: 'barrel',
            inputUnit: 'tonne',
          },
        },
      ]),
    ).toEqual([{ amount: '8', unit: 'barrel' }]);
    expect(calculateValueAdded(MONEY('100'), MONEY('60'))).toEqual(MONEY('40'));
  });
});

describe('E11-E12 technology and project kernels', () => {
  it('keeps rights distinct from progress and requires all project prerequisites', () => {
    expect(
      calculateResearchProgress({
        accumulatedOutput: { amount: '2', unit: 'research_point' },
        requiredOutput: { amount: '10', unit: 'research_point' },
        researchLabourHours: { amount: '6', unit: 'research_labour_hour' },
        fundingAvailability: RATIO('1'),
        equipmentAvailability: RATIO('0.5'),
        researchOutputPerLabourHour: {
          amount: '1',
          outputUnit: 'research_point',
          inputUnit: 'research_labour_hour',
        },
        researchEfficiency: RATIO('1'),
      }),
    ).toEqual({
      periodResearchOutput: { amount: '3', unit: 'research_point' },
      accumulatedResearchOutput: { amount: '5', unit: 'research_point' },
      progress: RATIO('0.5'),
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
        plannedIncrement: { amount: '10', unit: 'project_progress_point' },
        fundingReleasedFactor: RATIO('0.8'),
        materialsDeliveredFactor: RATIO('0.5'),
        labourAvailableFactor: RATIO('0.9'),
        oversightCapacityFactor: RATIO('1'),
      }),
    ).toEqual({
      progressIncrement: { amount: '5', unit: 'project_progress_point' },
      bottleneckFactor: RATIO('0.5'),
    });
    expect(calculateProjectFundingGap(MONEY('100'), MONEY('60'))).toEqual(
      MONEY('40'),
    );
    expect(
      calculateRemainingProjectInputs(TONNES('10'), TONNES('3'), TONNES('4')),
    ).toEqual(TONNES('3'));
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
          { upperBound: MONEY('50'), marginalRate: RATIO('0.1') },
          { upperBound: null, marginalRate: RATIO('0.2') },
        ],
      }),
    ).toEqual(MONEY('13'));
    expect(calculatePayrollTax(MONEY('100'), RATIO('0.1'), MONEY('4'))).toEqual(
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

describe('E17 international settlement preparation', () => {
  it('converts every cross-border debit through a versioned common currency', () => {
    const localBinding = {
      localCurrency: 'LCA',
      internationalCurrency: 'ICU',
      internationalPerLocalUnit: '0.25',
      effectivePeriod: 7,
      version: 'fx-7.1',
    } as const;
    const foreignBinding = {
      localCurrency: 'LCB',
      internationalCurrency: 'ICU',
      internationalPerLocalUnit: '2',
      effectivePeriod: 7,
      version: 'fx-7.1',
    } as const;
    expect(
      indexInternationalCurrencyBindings([localBinding, foreignBinding]).size,
    ).toBe(2);
    expect(() =>
      assertCurrenciesBoundToInternational(
        ['LCA', 'LCB'],
        [localBinding, foreignBinding],
      ),
    ).not.toThrow();
    expect(
      convertToInternationalSettlementMoney({
        amount: { amount: '40', currency: 'LCA' },
        binding: localBinding,
      }),
    ).toEqual({ amount: '10', currency: 'ICU' });
    expect(
      settleCrossBorderPaymentFromBindings({
        payerCountry: 'country-a',
        payeeCountry: 'country-b',
        payerAmount: { amount: '40', currency: 'LCA' },
        currencyBindings: [localBinding, foreignBinding],
      }),
    ).toEqual({
      payerCountry: 'country-a',
      payeeCountry: 'country-b',
      payerDomesticDebit: { amount: '40', currency: 'LCA' },
      internationalSettlement: { amount: '10', currency: 'ICU' },
      bindingVersion: 'fx-7.1',
      effectivePeriod: 7,
    });
  });

  it('rejects missing bindings, currency mismatches, and domestic payments', () => {
    const binding = {
      localCurrency: 'LCA',
      internationalCurrency: 'ICU',
      internationalPerLocalUnit: '1',
      effectivePeriod: 7,
      version: 'fx-7.1',
    } as const;
    expect(() => indexInternationalCurrencyBindings([])).toThrow(
      'binding is required',
    );
    expect(() =>
      assertCurrenciesBoundToInternational(['LCA', 'LCB'], [binding]),
    ).toThrow('LCB has no international currency binding');
    expect(() =>
      convertToInternationalSettlementMoney({
        amount: { amount: '1', currency: 'LCB' },
        binding,
      }),
    ).toThrow('must match its local binding');
    expect(() =>
      settleCrossBorderPayment({
        payerCountry: 'country-a',
        payeeCountry: 'country-a',
        payerAmount: { amount: '1', currency: 'LCA' },
        payerBinding: binding,
      }),
    ).toThrow('requires different countries');
    expect(() =>
      indexInternationalCurrencyBindings([
        binding,
        { ...binding, localCurrency: 'LCB', version: 'fx-7.2' },
      ]),
    ).toThrow('must share a version');
    expect(() =>
      indexInternationalCurrencyBindings([
        { ...binding, internationalCurrency: 'USD' },
      ]),
    ).toThrow('internationalCurrency must use ICU');
  });
});

describe('unit and discrete-stock invariants', () => {
  it('rejects the previously accepted fractional people and excess enrolment', () => {
    expect(() =>
      transitionPopulation(
        {
          children0To15: PERSON('1'),
          workingAge16To64: PERSON('1'),
          retired65Plus: PERSON('1'),
        },
        {
          births: PERSON('0.5'),
          childDeaths: PERSON('0'),
          workingAgeDeaths: PERSON('0'),
          retiredDeaths: PERSON('0'),
          childImmigration: PERSON('0'),
          workingAgeImmigration: PERSON('0'),
          retiredImmigration: PERSON('0'),
          childEmigration: PERSON('0'),
          workingAgeEmigration: PERSON('0'),
          retiredEmigration: PERSON('0'),
          ageIntoWorkingAge: PERSON('0'),
          ageIntoRetirement: PERSON('0'),
        },
      ),
    ).toThrow('whole person count');
    expect(() =>
      calculateEducationOutcome({
        applicants: PERSON('100'),
        seats: PERSON('2'),
        teacherSupportedSeats: PERSON('2'),
        budgetSupportedSeats: PERSON('2'),
        enrolled: PERSON('10'),
        dropoutRate: RATIO('0'),
        completionRate: RATIO('1'),
        durationReached: true,
      }),
    ).toThrow('cannot exceed actual enrollment capacity');
  });

  it('rejects a person as fuel and currency as physical production capacity', () => {
    expect(() =>
      calculateEnergyGeneration({
        availableCapacity: { amount: '10', unit: 'MW' },
        capacityFactor: RATIO('0.5'),
        hours: HOUR('2'),
        fuelEnergyPerMWh: {
          amount: '2',
          outputUnit: 'person',
          inputUnit: 'MWh',
        },
        technologyEfficiency: RATIO('0.5'),
      }),
    ).toThrow('physical commodity or energy unit');
    expect(() =>
      calculateProductionOutcome({
        operationalCapacity: {
          amount: '10',
          outputUnit: 'GCU',
          inputUnit: 'period',
        },
        operatingDuration: PERIOD('1'),
        targetUtilisation: RATIO('1'),
        productivity: { amount: '1', outputUnit: 'GCU', inputUnit: 'GCU' },
        inputAvailability: [],
        energyAvailability: RATIO('1'),
        labourAvailability: RATIO('1'),
        logisticsAvailability: RATIO('1'),
      }),
    ).toThrow('physical commodity or energy unit');
  });

  it('keeps unbounded burden and dependency measures out of bounded ratios', () => {
    expect(
      calculateHousingMetrics({
        householdDemand: HOUSING_UNIT('1'),
        habitableUnits: HOUSING_UNIT('1'),
        vacantHabitableUnits: HOUSING_UNIT('0'),
        housingCost: MONEY('150'),
        disposableIncome: MONEY('100'),
      }).housingBurden,
    ).toEqual({ amount: '1.5', outputUnit: 'GCU', inputUnit: 'GCU' });
    expect(() =>
      calculateLabourMetrics({
        employed: PERSON('6'),
        unemployedSearching: PERSON('5'),
        workingAgePopulation: PERSON('10'),
        requiredWorkers: PERSON('10'),
        availableWorkers: PERSON('10'),
      }),
    ).toThrow('Labour force cannot exceed working-age population');
  });
});
