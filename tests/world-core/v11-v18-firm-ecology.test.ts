import { describe, expect, it } from 'vitest';

import {
  assessFirmDistress,
  calculateFirmEntryExit,
  calculateFirmFailureEffects,
  calculateFirmSelection,
  calculateSoeSoftBudgetConstraint,
  calculateStartupFormation,
} from '../../packages/core/src/index.js';

const MONEY = (amount: string) => ({ amount, currency: 'GCU' }) as const;
const QUANTITY = (amount: string, unit: string) => ({ amount, unit }) as const;
const RATIO = (amount: string) => ({ amount, unit: 'ratio' }) as const;

describe('V11–V18 Firm Ecology preparation', () => {
  it('quantifies discrete entry/exit and its capacity, labour and margin transmission', () => {
    expect(
      calculateFirmEntryExit({
        currentFirmCount: QUANTITY('10', 'firm'),
        averageProfitPerFirm: MONEY('13'),
        entryProfitThresholdPerFirm: MONEY('10'),
        exitProfitThresholdPerFirm: MONEY('0'),
        entryFirmsPerCurrency: { amount: '0.5', currency: 'GCU' },
        exitFirmsPerCurrency: { amount: '0.5', currency: 'GCU' },
        currentCapacity: QUANTITY('100', 'tonne_per_period'),
        capacityPerFirm: {
          amount: '12',
          outputUnit: 'tonne_per_period',
          inputUnit: 'firm',
        },
        currentEmployment: QUANTITY('100', 'person'),
        jobsPerFirm: { amount: '8', outputUnit: 'person', inputUnit: 'firm' },
        currentMargin: QUANTITY('20', 'percentage_point'),
        marginCompressionPerNewFirm: {
          amount: '0.5',
          outputUnit: 'percentage_point',
          inputUnit: 'firm',
        },
      }),
    ).toMatchObject({
      firmEntries: QUANTITY('1', 'firm'),
      firmExits: QUANTITY('0', 'firm'),
      nextFirmCount: QUANTITY('11', 'firm'),
      capacityDelta: QUANTITY('12', 'tonne_per_period'),
      nextCapacity: QUANTITY('112', 'tonne_per_period'),
      employmentDelta: QUANTITY('8', 'person'),
      nextEmployment: QUANTITY('108', 'person'),
      marginDelta: QUANTITY('-0.5', 'percentage_point'),
      nextMargin: QUANTITY('19.5', 'percentage_point'),
    });
  });

  it('separates cash-flow stress, default, insolvency, liquidation and their exact spillovers', () => {
    expect(
      assessFirmDistress({
        cashAvailable: MONEY('2'),
        operatingCashFlowBeforeDebtService: MONEY('-1'),
        debtServiceDue: MONEY('5'),
        liquidatableAssets: MONEY('8'),
        totalLiabilities: MONEY('10'),
        directive: 'NONE',
      }),
    ).toMatchObject({
      condition: 'INSOLVENT',
      cashAvailableForDebtService: MONEY('1'),
      debtServiceShortfall: MONEY('4'),
      netWorth: MONEY('-2'),
    });

    const liquidation = assessFirmDistress({
      cashAvailable: MONEY('0'),
      operatingCashFlowBeforeDebtService: MONEY('0'),
      debtServiceDue: MONEY('10'),
      liquidatableAssets: MONEY('4'),
      totalLiabilities: MONEY('12'),
      directive: 'LIQUIDATE',
    });
    expect(liquidation.condition).toBe('LIQUIDATION');
    expect(
      calculateFirmFailureEffects({
        assessment: liquidation,
        workforce: QUANTITY('15', 'person'),
        liquidatableAssetBookValue: MONEY('20'),
        supplierTradeCredit: MONEY('6'),
        bankDebt: MONEY('12'),
        layoffFraction: RATIO('0.4'),
        assetRecoveryFraction: RATIO('0.5'),
        supplierNonpaymentFraction: RATIO('0.5'),
        bankNplFraction: RATIO('0.25'),
      }),
    ).toEqual({
      layoffs: QUANTITY('6', 'person'),
      retainedWorkforce: QUANTITY('9', 'person'),
      liquidatedAssetRecovery: MONEY('10'),
      supplierLosses: MONEY('3'),
      bankNpl: MONEY('3'),
    });
  });

  it('prices an energy shock against each firm and exposes the selection effect', () => {
    expect(
      calculateFirmSelection({
        firms: [
          {
            firmId: 'efficient-firm',
            profitBeforeEnergyShock: MONEY('20'),
            energyUse: QUANTITY('2', 'megawatt_hour'),
            productivity: QUANTITY('10', 'tonne_per_person_period'),
          },
          {
            firmId: 'energy-intensive-firm',
            profitBeforeEnergyShock: MONEY('20'),
            energyUse: QUANTITY('20', 'megawatt_hour'),
            productivity: QUANTITY('2', 'tonne_per_person_period'),
          },
        ],
        energyPriceIncrease: {
          amount: '1',
          currency: 'GCU',
          perUnit: 'megawatt_hour',
        },
        exitProfitThresholdPerFirm: MONEY('5'),
      }),
    ).toMatchObject({
      exitingFirmCount: QUANTITY('1', 'firm'),
      survivingFirmCount: QUANTITY('1', 'firm'),
      averageProductivityBefore: QUANTITY('6', 'tonne_per_person_period'),
      averageProductivityAfter: QUANTITY('10', 'tonne_per_person_period'),
      outcomes: [
        {
          firmId: 'efficient-firm',
          additionalEnergyCost: MONEY('2'),
          profitAfterEnergyShock: MONEY('18'),
          exits: false,
        },
        {
          firmId: 'energy-intensive-firm',
          additionalEnergyCost: MONEY('20'),
          profitAfterEnergyShock: MONEY('0'),
          exits: true,
        },
      ],
    });
  });

  it('converts founder, finance, market and permit capacities into a startup cohort', () => {
    expect(
      calculateStartupFormation({
        qualifiedFounders: QUANTITY('10', 'person'),
        seedFinanceAvailable: MONEY('900'),
        minimumSeedFinancePerStartup: MONEY('200'),
        marketOpportunitySlots: QUANTITY('8', 'opportunity'),
        institutionalProcessingSlots: QUANTITY('5', 'permit'),
        formationRate: RATIO('0.75'),
        jobsPerStartup: {
          amount: '4',
          outputUnit: 'person',
          inputUnit: 'firm',
        },
        innovationPerStartup: {
          amount: '2',
          outputUnit: 'patent_per_period',
          inputUnit: 'firm',
        },
        earlyFailureRate: RATIO('0.5'),
        scaleUpRate: RATIO('0.5'),
      }),
    ).toEqual({
      financeConstrainedStartupCapacity: QUANTITY('4', 'firm'),
      eligibleFounderCapacity: QUANTITY('4', 'person'),
      startupsFormed: QUANTITY('3', 'firm'),
      earlyStartupFailures: QUANTITY('1', 'firm'),
      survivingStartups: QUANTITY('2', 'firm'),
      scaleUpFirms: QUANTITY('1', 'firm'),
      startupEmploymentAdded: QUANTITY('12', 'person'),
      entrepreneurialInnovationAdded: QUANTITY('6', 'patent_per_period'),
      seedFinanceCommitted: MONEY('600'),
      seedFinanceRemaining: MONEY('300'),
    });
  });

  it('accounts for SOE guarantees, rollover lending, factor lock-in and uncovered loss', () => {
    expect(
      calculateSoeSoftBudgetConstraint({
        operatingLoss: MONEY('100'),
        governmentGuaranteeCapacity: MONEY('30'),
        bankRolloverCreditCapacity: MONEY('50'),
        capitalLocked: MONEY('40'),
        labourLocked: QUANTITY('10', 'person'),
      }),
    ).toEqual({
      governmentGuaranteeDrawn: MONEY('30'),
      bankRolloverCreditDrawn: MONEY('50'),
      uncoveredLoss: MONEY('20'),
      futureFiscalLiability: MONEY('30'),
      capitalLocked: MONEY('40'),
      labourLocked: QUANTITY('10', 'person'),
      continuationStatus: 'EXIT_OR_RESTRUCTURING_REQUIRED',
    });
  });

  it('rejects fractional firm/person stocks and mismatched physical price units', () => {
    expect(() =>
      calculateFirmEntryExit({
        currentFirmCount: QUANTITY('1.5', 'firm'),
        averageProfitPerFirm: MONEY('1'),
        entryProfitThresholdPerFirm: MONEY('1'),
        exitProfitThresholdPerFirm: MONEY('0'),
        entryFirmsPerCurrency: { amount: '0', currency: 'GCU' },
        exitFirmsPerCurrency: { amount: '0', currency: 'GCU' },
        currentCapacity: QUANTITY('1', 'tonne_per_period'),
        capacityPerFirm: {
          amount: '1',
          outputUnit: 'tonne_per_period',
          inputUnit: 'firm',
        },
        currentEmployment: QUANTITY('1', 'person'),
        jobsPerFirm: { amount: '1', outputUnit: 'person', inputUnit: 'firm' },
        currentMargin: QUANTITY('1', 'percentage_point'),
        marginCompressionPerNewFirm: {
          amount: '0',
          outputUnit: 'percentage_point',
          inputUnit: 'firm',
        },
      }),
    ).toThrow('whole firm count');
    expect(() =>
      calculateFirmSelection({
        firms: [
          {
            firmId: 'firm-a',
            profitBeforeEnergyShock: MONEY('1'),
            energyUse: QUANTITY('1', 'megawatt_hour'),
            productivity: QUANTITY('1', 'output_per_person'),
          },
        ],
        energyPriceIncrease: {
          amount: '1',
          currency: 'GCU',
          perUnit: 'litre',
        },
        exitProfitThresholdPerFirm: MONEY('0'),
      }),
    ).toThrow('energyUse unit must be litre');
  });
});
