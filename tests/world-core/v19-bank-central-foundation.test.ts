import { describe, expect, it } from 'vitest';

import {
  DOMAIN_ERROR_CODES,
  assertBankCentralFoundationReplayEvidence,
  calculateEmergencyLiquidityAssistance,
  calculateLoanOrigination,
  calculateLoanRepayment,
  calculateNplRecognition,
  calculateOpenMarketOperation,
  calculateRegularRefinancingDraw,
  createFoundationFact,
  deriveBankCompliance,
  deriveMonetaryAggregates,
  type BankCentralFact,
  type CentralBankLedgerSnapshot,
  type CommercialBankLedgerSnapshot,
  type FoundationTraceRequest,
} from '../../packages/core/src/index.js';

const MONEY = (amount: string, currency = 'GCU') =>
  ({ amount, currency }) as const;
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

const TRACE: FoundationTraceRequest = {
  traceRef: 'TRACE.V19.1',
  calculationVersion: 'V19_FOUNDATION.1',
  snapshot: {
    lineageRef: 'LINEAGE.WORLD.19',
    sourceVersion: 'WORLD_VERSION.19',
    snapshotRef: 'SNAPSHOT.WORLD.19',
    snapshotHash: HASH_A,
    predecessorSnapshotHash: HASH_B,
  },
  snapshotAt: { amount: '19000', unit: 'sim_millisecond' },
};

const BANK: CommercialBankLedgerSnapshot = {
  bankRef: 'BANK.NATIONAL.1',
  centralBankRef: 'CENTRAL_BANK.1',
  currency: 'GCU',
  reservesAtCentralBank: MONEY('100'),
  settlementCash: MONEY('10'),
  loanAssets: MONEY('200'),
  governmentSecurities: MONEY('40'),
  otherAssets: MONEY('0'),
  demandDeposits: MONEY('150'),
  savingsDeposits: MONEY('50'),
  timeDeposits: MONEY('10'),
  wholesaleFunding: MONEY('20'),
  centralBankRefinancingBorrowing: MONEY('20'),
  centralBankEmergencyLiquidityBorrowing: MONEY('0'),
  otherLiabilities: MONEY('0'),
  equity: MONEY('100'),
  nonPerformingLoans: MONEY('10'),
};

const CENTRAL_BANK: CentralBankLedgerSnapshot = {
  centralBankRef: 'CENTRAL_BANK.1',
  commercialBankRef: 'BANK.NATIONAL.1',
  currency: 'GCU',
  governmentSecurities: MONEY('40'),
  regularRefinancingLoans: MONEY('20'),
  emergencyLiquidityLoans: MONEY('0'),
  otherAssets: MONEY('440'),
  currencyInCirculation: MONEY('50'),
  commercialBankReserves: MONEY('100'),
  treasuryDeposits: MONEY('20'),
  centralBankBills: MONEY('30'),
  otherLiabilities: MONEY('0'),
  equity: MONEY('300'),
};

function fact<T>(factRef: string, payload: T): BankCentralFact<T> {
  return createFoundationFact({
    trace: TRACE,
    factRef,
    sourceRef: `SOURCE.${factRef}`,
    predecessorFactRefs: ['GENESIS.WORLD.19'],
    payload,
  });
}

function bankFact(payload: CommercialBankLedgerSnapshot = BANK) {
  return fact('FACT.BANK.1', payload);
}

function centralBankFact(payload: CentralBankLedgerSnapshot = CENTRAL_BANK) {
  return fact('FACT.CENTRAL_BANK.1', payload);
}

const COMPLIANCE = {
  bankRef: 'BANK.NATIONAL.1',
  reserveRequirementFactRef: 'RESERVE_RULE.1',
  capitalRequirementFactRef: 'CAPITAL_RULE.1',
  requiredReserves: MONEY('120'),
  requiredCapital: MONEY('80'),
} as const;

const COLLATERAL = {
  centralBankRef: 'CENTRAL_BANK.1',
  bankRef: 'BANK.NATIONAL.1',
  facilityRef: 'FACILITY.1',
  collateralRef: 'COLLATERAL.1',
  eligibilityRuleRef: 'COLLATERAL_RULE.1',
  eligibleValueAfterHaircut: MONEY('25'),
  remainingFacilityCapacity: MONEY('20'),
} as const;

const DRAW = {
  centralBankRef: 'CENTRAL_BANK.1',
  bankRef: 'BANK.NATIONAL.1',
  facilityRef: 'FACILITY.1',
  drawRef: 'DRAW.1',
  principal: MONEY('20'),
} as const;

describe('V19 commercial banking foundation', () => {
  it('creates and repays paired loan-asset and deposit-liability traces without a second ledger', () => {
    const source = bankFact();
    const origin = fact('FACT.ORIGINATION.1', {
      bankRef: 'BANK.NATIONAL.1',
      loanRef: 'LOAN.1',
      borrowerRef: 'BORROWER.1',
      principal: MONEY('25'),
    });
    const originated = calculateLoanOrigination({
      trace: TRACE,
      commercialBankFact: source,
      originationFact: origin,
      outputRef: 'OUTCOME.LOAN.ORIGINATION.1',
    });
    expect(originated).toMatchObject({
      commercialBank: {
        loanAssets: MONEY('225'),
        demandDeposits: MONEY('175'),
      },
      loanAssetTrace: {
        before: MONEY('200'),
        delta: MONEY('25'),
        after: MONEY('225'),
      },
      demandDepositTrace: {
        before: MONEY('150'),
        delta: MONEY('25'),
        after: MONEY('175'),
      },
    });
    expect('authoritativePosting' in originated).toBe(false);
    assertBankCentralFoundationReplayEvidence(originated.replayProof, [
      source,
      origin,
    ]);

    const repaymentBank = fact('FACT.BANK.2', originated.commercialBank);
    const repayment = fact('FACT.REPAYMENT.1', {
      bankRef: 'BANK.NATIONAL.1',
      loanRef: 'LOAN.1',
      borrowerRef: 'BORROWER.1',
      principal: MONEY('25'),
      mode: 'DEPOSIT_CANCELLATION' as const,
    });
    const repaid = calculateLoanRepayment({
      trace: TRACE,
      commercialBankFact: repaymentBank,
      repaymentFact: repayment,
      outputRef: 'OUTCOME.LOAN.REPAYMENT.1',
    });
    expect(repaid.commercialBank).toMatchObject({
      loanAssets: MONEY('200'),
      demandDeposits: MONEY('150'),
    });
    expect(repaid.counterpartyTrace).toMatchObject({ delta: MONEY('-25') });
  });

  it('keeps NPL bounded by loan assets and fails closed for insufficient deposits or mismatched currency/bank', () => {
    const source = bankFact();
    const npl = calculateNplRecognition({
      trace: TRACE,
      commercialBankFact: source,
      nplFact: fact('FACT.NPL.1', {
        bankRef: 'BANK.NATIONAL.1',
        loanRef: 'LOAN.1',
        classificationRef: 'NPL_CLASS.1',
        nplIncrease: MONEY('20'),
      }),
      outputRef: 'OUTCOME.NPL.1',
    });
    expect(npl.commercialBank.nonPerformingLoans).toEqual(MONEY('30'));
    expect(() =>
      calculateNplRecognition({
        trace: TRACE,
        commercialBankFact: source,
        nplFact: fact('FACT.NPL.OVER', {
          bankRef: 'BANK.NATIONAL.1',
          loanRef: 'LOAN.1',
          classificationRef: 'NPL_CLASS.OVER',
          nplIncrease: MONEY('191'),
        }),
        outputRef: 'OUTCOME.NPL.OVER',
      }),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.ENGINE_KERNEL_INVALID,
      }),
    );
    expect(() =>
      calculateLoanRepayment({
        trace: TRACE,
        commercialBankFact: source,
        repaymentFact: fact('FACT.REPAY.INSUFFICIENT', {
          bankRef: 'BANK.NATIONAL.1',
          loanRef: 'LOAN.1',
          borrowerRef: 'BORROWER.1',
          principal: MONEY('151'),
          mode: 'DEPOSIT_CANCELLATION' as const,
        }),
        outputRef: 'OUTCOME.REPAY.INSUFFICIENT',
      }),
    ).toThrow('insufficient deposits');
    expect(() =>
      calculateLoanOrigination({
        trace: TRACE,
        commercialBankFact: source,
        originationFact: fact('FACT.ORIGINATION.BAD', {
          bankRef: 'BANK.OTHER.1',
          loanRef: 'LOAN.OTHER.1',
          borrowerRef: 'BORROWER.1',
          principal: MONEY('1', 'USD'),
        }),
        outputRef: 'OUTCOME.ORIGINATION.BAD',
      }),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.ENGINE_KERNEL_INVALID,
      }),
    );
  });
});

describe('V19 Central Bank foundation', () => {
  it('derives liquidity/capital shortfalls from caller facts and keeps ELA liquidity-only', () => {
    const bank = bankFact();
    const compliance = fact('FACT.COMPLIANCE.1', COMPLIANCE);
    const shortfall = deriveBankCompliance({
      trace: TRACE,
      commercialBankFact: bank,
      complianceFact: compliance,
      outputRef: 'OUTCOME.COMPLIANCE.1',
    });
    expect(shortfall).toMatchObject({
      reserveShortfall: MONEY('20'),
      capitalShortfall: MONEY('0'),
      liquidityShortfall: true,
      capitalShortfallExists: false,
    });
    const ela = calculateEmergencyLiquidityAssistance({
      trace: TRACE,
      commercialBankFact: bank,
      centralBankFact: centralBankFact(),
      complianceFact: compliance,
      collateralFact: fact('FACT.COLLATERAL.1', COLLATERAL),
      drawFact: fact('FACT.ELA_DRAW.1', DRAW),
      outputRef: 'OUTCOME.ELA.1',
    });
    expect(ela).toMatchObject({
      commercialBank: {
        reservesAtCentralBank: MONEY('120'),
        centralBankEmergencyLiquidityBorrowing: MONEY('20'),
        equity: MONEY('100'),
      },
      centralBank: {
        commercialBankReserves: MONEY('120'),
        emergencyLiquidityLoans: MONEY('20'),
      },
    });
    expect(ela.commercialBankTraces).toHaveLength(2);
    expect(ela.centralBankTraces).toHaveLength(2);

    const negativeEquity = {
      ...BANK,
      otherLiabilities: MONEY('110'),
      equity: MONEY('-10'),
    } as const;
    expect(() =>
      calculateEmergencyLiquidityAssistance({
        trace: TRACE,
        commercialBankFact: bankFact(negativeEquity),
        centralBankFact: centralBankFact(),
        complianceFact: fact('FACT.COMPLIANCE.NEGATIVE_EQUITY', {
          ...COMPLIANCE,
          requiredCapital: MONEY('0'),
        }),
        collateralFact: fact('FACT.COLLATERAL.NEGATIVE_EQUITY', COLLATERAL),
        drawFact: fact('FACT.ELA_DRAW.NEGATIVE_EQUITY', DRAW),
        outputRef: 'OUTCOME.ELA.NEGATIVE_EQUITY',
      }),
    ).toThrow('cannot repair a capital shortfall or negative equity');
  });

  it('posts refinancing and OMO symmetrically, with collateral, reserve, and security failures', () => {
    const refinancing = calculateRegularRefinancingDraw({
      trace: TRACE,
      commercialBankFact: bankFact(),
      centralBankFact: centralBankFact(),
      collateralFact: fact('FACT.COLLATERAL.REFINANCE', COLLATERAL),
      drawFact: fact('FACT.REFINANCE_DRAW.1', DRAW),
      outputRef: 'OUTCOME.REFINANCE.1',
    });
    expect(refinancing).toMatchObject({
      commercialBank: {
        reservesAtCentralBank: MONEY('120'),
        centralBankRefinancingBorrowing: MONEY('40'),
      },
      centralBank: {
        commercialBankReserves: MONEY('120'),
        regularRefinancingLoans: MONEY('40'),
      },
    });
    expect(() =>
      calculateRegularRefinancingDraw({
        trace: TRACE,
        commercialBankFact: bankFact(),
        centralBankFact: centralBankFact(),
        collateralFact: fact('FACT.COLLATERAL.INSUFFICIENT', {
          ...COLLATERAL,
          eligibleValueAfterHaircut: MONEY('19'),
        }),
        drawFact: fact('FACT.REFINANCE_DRAW.INSUFFICIENT', DRAW),
        outputRef: 'OUTCOME.REFINANCE.INSUFFICIENT',
      }),
    ).toThrow('exceeds eligible collateral or facility capacity');

    const buy = calculateOpenMarketOperation({
      trace: TRACE,
      commercialBankFact: bankFact(),
      centralBankFact: centralBankFact(),
      operationFact: fact('FACT.OMO.BUY', {
        centralBankRef: 'CENTRAL_BANK.1',
        bankRef: 'BANK.NATIONAL.1',
        operationRef: 'OMO.BUY.1',
        securityRef: 'SECURITY.1',
        direction: 'BUY_GOVERNMENT_SECURITIES' as const,
        settlementAmount: MONEY('10'),
      }),
      outputRef: 'OUTCOME.OMO.BUY',
    });
    expect(buy).toMatchObject({
      commercialBank: {
        governmentSecurities: MONEY('30'),
        reservesAtCentralBank: MONEY('110'),
      },
      centralBank: {
        governmentSecurities: MONEY('50'),
        commercialBankReserves: MONEY('110'),
      },
    });
    expect(() =>
      calculateOpenMarketOperation({
        trace: TRACE,
        commercialBankFact: bankFact({
          ...BANK,
          governmentSecurities: MONEY('5'),
          otherAssets: MONEY('35'),
        }),
        centralBankFact: centralBankFact(),
        operationFact: fact('FACT.OMO.NO_SECURITY', {
          centralBankRef: 'CENTRAL_BANK.1',
          bankRef: 'BANK.NATIONAL.1',
          operationRef: 'OMO.NO_SECURITY',
          securityRef: 'SECURITY.1',
          direction: 'BUY_GOVERNMENT_SECURITIES' as const,
          settlementAmount: MONEY('10'),
        }),
        outputRef: 'OUTCOME.OMO.NO_SECURITY',
      }),
    ).toThrow('insufficient government securities');
  });

  it('derives M1/M2 only from ledger facts and rejects cross-bank, forged, stale, mixed, and duplicate replay evidence', () => {
    const bank = bankFact();
    const central = centralBankFact();
    const aggregates = deriveMonetaryAggregates({
      trace: TRACE,
      commercialBankFact: bank,
      centralBankFact: central,
      outputRef: 'OUTCOME.AGGREGATES.1',
    });
    expect(aggregates).toMatchObject({
      monetaryBase: MONEY('150'),
      m1: MONEY('200'),
      m2: MONEY('260'),
    });
    expect('m1Input' in aggregates).toBe(false);
    assertBankCentralFoundationReplayEvidence(aggregates.replayProof, [
      bank,
      central,
    ]);
    expect(() =>
      assertBankCentralFoundationReplayEvidence(aggregates.replayProof, [
        bank,
        bank,
      ]),
    ).toThrow('non-empty and unique');
    expect(() =>
      assertBankCentralFoundationReplayEvidence(aggregates.replayProof, [
        { ...bank, payload: { ...bank.payload, loanAssets: MONEY('201') } },
        central,
      ]),
    ).toThrow('canonical payload evidence');
    expect(() =>
      deriveMonetaryAggregates({
        trace: TRACE,
        commercialBankFact: bank,
        centralBankFact: centralBankFact({
          ...CENTRAL_BANK,
          commercialBankRef: 'BANK.OTHER.1',
        }),
        outputRef: 'OUTCOME.AGGREGATES.CROSS_BANK',
      }),
    ).toThrow('do not reconcile');
    expect(() =>
      deriveMonetaryAggregates({
        trace: TRACE,
        commercialBankFact: {
          ...bank,
          snapshot: { ...bank.snapshot, sourceVersion: 'WORLD_VERSION.STALE' },
        },
        centralBankFact: central,
        outputRef: 'OUTCOME.AGGREGATES.STALE',
      }),
    ).toThrow('mixed lineage/version/snapshot evidence');
  });
});
