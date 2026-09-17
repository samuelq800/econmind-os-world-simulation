import { describe, expect, it } from 'vitest';

import {
  assertFxInternationalFoundationReplayEvidence,
  calculateExternalDebtOperation,
  calculateFxConversion,
  calculateOfficialInterventionAndSterilization,
  calculatePrivateFxSettlement,
  createFoundationFact,
  indexCountryFxRates,
  lockHistoricalFxCashSettlement,
  revalueHistoricalFxCashSettlement,
  type CountryFxRate,
  type FoundationTraceRequest,
  type FxFoundationFact,
  type FxRoundingDecision,
  type LockedHistoricalFxCashSettlement,
} from '../../packages/core/src/index.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);
const MONEY = (amount: string, currency: string) =>
  ({ amount, currency }) as const;

const TRACE: FoundationTraceRequest = {
  traceRef: 'TRACE.V20.1',
  calculationVersion: 'V20_FOUNDATION.1',
  snapshot: {
    lineageRef: 'LINEAGE.WORLD.20',
    sourceVersion: 'WORLD_VERSION.20',
    snapshotRef: 'SNAPSHOT.WORLD.20',
    snapshotHash: HASH_A,
    predecessorSnapshotHash: HASH_B,
  },
  snapshotAt: { amount: '20000', unit: 'sim_millisecond' },
};

const RATE: CountryFxRate = {
  rateRef: 'RATE.A.20000',
  rateVersion: 'FX_RATE.1',
  countryRef: 'COUNTRY.A',
  localCurrency: 'LCA',
  globalCurrency: 'GCU',
  globalPerLocalUnit: '1.25',
  valuationAt: { amount: '20000', unit: 'sim_millisecond' },
};

const ROUNDING: FxRoundingDecision = {
  roundingDecisionRef: 'ROUNDING.FX.1',
  roundingVersion: 'ROUNDING.1',
  quantum: '0.01',
  mode: 'HALF_UP',
  valuationAt: { amount: '20000', unit: 'sim_millisecond' },
};

function fact<T>(
  trace: FoundationTraceRequest,
  factRef: string,
  payload: T,
): FxFoundationFact<T> {
  return createFoundationFact({
    trace,
    factRef,
    sourceRef: `SOURCE.${factRef}`,
    predecessorFactRefs: ['GENESIS.WORLD.20'],
    payload,
  });
}

function rateFact(trace = TRACE, payload: CountryFxRate = RATE) {
  return fact(trace, 'FACT.RATE.A', payload);
}

function roundingFact(trace = TRACE, payload: FxRoundingDecision = ROUNDING) {
  return fact(trace, 'FACT.ROUNDING.1', payload);
}

function conversionFact(
  trace = TRACE,
  payload = {
    conversionRef: 'CONVERSION.1',
    conversionVersion: 'CONVERSION.1',
    countryRef: 'COUNTRY.A',
    direction: 'LC_TO_GCU' as const,
    amount: MONEY('20', 'LCA'),
    rateRef: 'RATE.A.20000',
    roundingDecisionRef: 'ROUNDING.FX.1',
    valuationAt: { amount: '20000', unit: 'sim_millisecond' } as const,
  },
) {
  return fact(trace, 'FACT.CONVERSION.1', payload);
}

describe('V20.1 LC/GCU FX foundation', () => {
  it('uses one country-to-GCU quote with explicit rate, rounding decision and simulation time', () => {
    const rate = rateFact();
    const rounding = roundingFact();
    const conversion = conversionFact();
    const result = calculateFxConversion({
      trace: TRACE,
      rateFact: rate,
      roundingFact: rounding,
      conversionFact: conversion,
      outputRef: 'OUT.FX.1',
    });

    expect(result).toMatchObject({
      sourceAmount: MONEY('20', 'LCA'),
      convertedAmount: MONEY('25', 'GCU'),
      rateRef: 'RATE.A.20000',
      roundingDecisionRef: 'ROUNDING.FX.1',
      valuationAt: { amount: '20000', unit: 'sim_millisecond' },
    });
    expect(
      indexCountryFxRates({ trace: TRACE, rateFacts: [rate] }).get('COUNTRY.A'),
    ).toMatchObject({
      globalCurrency: 'GCU',
      localCurrency: 'LCA',
    });
    assertFxInternationalFoundationReplayEvidence(result.replayProof, [
      rate,
      rounding,
      conversion,
    ]);
    expect('authoritativeRateTable' in result).toBe(false);

    expect(() =>
      calculateFxConversion({
        trace: TRACE,
        rateFact: rate,
        roundingFact: rounding,
        conversionFact: conversionFact(TRACE, {
          ...conversion.payload,
          rateRef: 'RATE.UNRELATED',
        }),
        outputRef: 'OUT.FX.BAD.RATE',
      }),
    ).toThrow('rateRef');
    expect(() =>
      calculateFxConversion({
        trace: TRACE,
        rateFact: rate,
        roundingFact: rounding,
        conversionFact: conversionFact(TRACE, {
          ...conversion.payload,
          roundingDecisionRef: 'ROUNDING.UNRELATED',
        }),
        outputRef: 'OUT.FX.BAD.ROUNDING',
      }),
    ).toThrow('roundingDecisionRef');
    expect(() =>
      calculateFxConversion({
        trace: TRACE,
        rateFact: rate,
        roundingFact: undefined as never,
        conversionFact: conversion,
        outputRef: 'OUT.FX.NO.ROUNDING',
      }),
    ).toThrow();
    expect(() =>
      indexCountryFxRates({
        trace: TRACE,
        rateFacts: [rate, fact(TRACE, 'FACT.RATE.A.DUP', RATE)],
      }),
    ).toThrow('only one authoritative LC/GCU rate');
  });

  it('rejects forged or stale lineage, rounding-time and currency mismatches', () => {
    const rate = rateFact();
    const rounding = roundingFact();
    const conversion = conversionFact();
    const forged = {
      ...rate,
      payload: { ...RATE, globalPerLocalUnit: '99' },
    };
    expect(() =>
      calculateFxConversion({
        trace: TRACE,
        rateFact: forged,
        roundingFact: rounding,
        conversionFact: conversion,
        outputRef: 'OUT.FX.FORGED',
      }),
    ).toThrow('canonical payload');
    const staleTrace: FoundationTraceRequest = {
      ...TRACE,
      snapshot: {
        ...TRACE.snapshot,
        snapshotRef: 'SNAPSHOT.WORLD.19',
        snapshotHash: HASH_C,
      },
    };
    expect(() =>
      calculateFxConversion({
        trace: TRACE,
        rateFact: rateFact(staleTrace),
        roundingFact: rounding,
        conversionFact: conversion,
        outputRef: 'OUT.FX.STALE',
      }),
    ).toThrow('mixed lineage');
    expect(() =>
      calculateFxConversion({
        trace: TRACE,
        rateFact: rate,
        roundingFact: roundingFact(TRACE, {
          ...ROUNDING,
          valuationAt: { amount: '20001', unit: 'sim_millisecond' },
        }),
        conversionFact: conversion,
        outputRef: 'OUT.FX.BAD.TIME',
      }),
    ).toThrow('valuationAt');
    expect(() =>
      calculateFxConversion({
        trace: TRACE,
        rateFact: rate,
        roundingFact: rounding,
        conversionFact: conversionFact(TRACE, {
          ...conversion.payload,
          amount: MONEY('20', 'LCB'),
        }),
        outputRef: 'OUT.FX.BAD.CURRENCY',
      }),
    ).toThrow('currency');
  });
});

describe('V20.2 private, external-finance and official facts', () => {
  it('settles a private import only through private balances and rejects double settlement', () => {
    const rate = rateFact();
    const rounding = roundingFact();
    const conversion = conversionFact();
    const payer = fact(TRACE, 'FACT.PRIVATE.PAYER', {
      accountRef: 'PRIVATE.PAYER',
      countryRef: 'COUNTRY.A',
      ownerRef: 'FIRM.A',
      localCurrency: 'LCA',
      privateLocalBalance: MONEY('100', 'LCA'),
      privateGcuBalance: MONEY('0', 'GCU'),
    });
    const dealer = fact(TRACE, 'FACT.PRIVATE.DEALER', {
      accountRef: 'PRIVATE.DEALER',
      countryRef: 'COUNTRY.A',
      ownerRef: 'DEALER.A',
      localCurrency: 'LCA',
      privateLocalBalance: MONEY('10', 'LCA'),
      privateGcuBalance: MONEY('100', 'GCU'),
    });
    const payee = fact(TRACE, 'FACT.PRIVATE.PAYEE', {
      accountRef: 'PRIVATE.PAYEE',
      countryRef: 'COUNTRY.B',
      ownerRef: 'FIRM.B',
      localCurrency: 'LCB',
      privateLocalBalance: MONEY('0', 'LCB'),
      privateGcuBalance: MONEY('10', 'GCU'),
    });
    const request = {
      settlementRef: 'PRIVATE.SETTLEMENT.1',
      settlementVersion: 'PRIVATE.FX.1',
      payerCountryRef: 'COUNTRY.A',
      payeeCountryRef: 'COUNTRY.B',
      payerAccountRef: 'PRIVATE.PAYER',
      dealerAccountRef: 'PRIVATE.DEALER',
      payeeAccountRef: 'PRIVATE.PAYEE',
      conversionRef: 'CONVERSION.1',
      purpose: 'IMPORT' as const,
      previouslySettledRefs: [],
      settlementAt: { amount: '20000', unit: 'sim_millisecond' } as const,
    };
    const settlement = fact(TRACE, 'FACT.PRIVATE.SETTLEMENT', request);
    const result = calculatePrivateFxSettlement({
      trace: TRACE,
      rateFact: rate,
      roundingFact: rounding,
      conversionFact: conversion,
      payerFact: payer,
      dealerFact: dealer,
      payeeFact: payee,
      settlementFact: settlement,
      outputRef: 'OUT.PRIVATE.1',
    });
    expect(result.payer.privateLocalBalance).toEqual(MONEY('80', 'LCA'));
    expect(result.dealer.privateLocalBalance).toEqual(MONEY('30', 'LCA'));
    expect(result.dealer.privateGcuBalance).toEqual(MONEY('75', 'GCU'));
    expect(result.payee.privateGcuBalance).toEqual(MONEY('35', 'GCU'));
    expect('officialGcuReserves' in result).toBe(false);
    expect(() =>
      calculatePrivateFxSettlement({
        trace: TRACE,
        rateFact: rate,
        roundingFact: rounding,
        conversionFact: conversion,
        payerFact: fact(TRACE, 'FACT.PRIVATE.PAYER.OFFICIAL', {
          ...payer.payload,
          officialGcuReserves: MONEY('1000', 'GCU'),
        }),
        dealerFact: dealer,
        payeeFact: payee,
        settlementFact: settlement,
        outputRef: 'OUT.PRIVATE.OFFICIAL.CONFUSION',
      }),
    ).toThrow('must not contain official reserve fields');
    expect(() =>
      calculatePrivateFxSettlement({
        trace: TRACE,
        rateFact: rate,
        roundingFact: rounding,
        conversionFact: conversion,
        payerFact: payer,
        dealerFact: dealer,
        payeeFact: payee,
        settlementFact: fact(TRACE, 'FACT.PRIVATE.SETTLEMENT.COUNTRY', {
          ...request,
          payeeCountryRef: 'COUNTRY.A',
        }),
        outputRef: 'OUT.PRIVATE.COUNTRY.MISMATCH',
      }),
    ).toThrow('requires distinct matching payer and payee countries');
    expect(() =>
      calculatePrivateFxSettlement({
        trace: TRACE,
        rateFact: rate,
        roundingFact: rounding,
        conversionFact: conversion,
        payerFact: payer,
        dealerFact: dealer,
        payeeFact: payee,
        settlementFact: fact(TRACE, 'FACT.PRIVATE.SETTLEMENT.DUP', {
          ...request,
          previouslySettledRefs: ['PRIVATE.SETTLEMENT.1'],
        }),
        outputRef: 'OUT.PRIVATE.DUP',
      }),
    ).toThrow('already has a caller-owned uniqueness witness');
  });

  it('keeps bilateral external debt reconciled and keeps official intervention separate', () => {
    const creditor = fact(TRACE, 'FACT.DEBT.CREDITOR', {
      countryRef: 'COUNTRY.A',
      externalDebtAssets: MONEY('50', 'GCU'),
      externalDebtLiabilities: MONEY('0', 'GCU'),
    });
    const debtor = fact(TRACE, 'FACT.DEBT.DEBTOR', {
      countryRef: 'COUNTRY.B',
      externalDebtAssets: MONEY('0', 'GCU'),
      externalDebtLiabilities: MONEY('50', 'GCU'),
    });
    const operation = fact(TRACE, 'FACT.DEBT.DRAW', {
      debtRef: 'DEBT.A.B.1',
      operationRef: 'DEBT.A.B.DRAW.1',
      operationVersion: 'DEBT.1',
      creditorCountryRef: 'COUNTRY.A',
      debtorCountryRef: 'COUNTRY.B',
      direction: 'DRAW' as const,
      amount: MONEY('10', 'GCU'),
      previouslyAppliedOperationRefs: [],
      settlementAt: { amount: '20000', unit: 'sim_millisecond' } as const,
    });
    const debt = calculateExternalDebtOperation({
      trace: TRACE,
      creditorFact: creditor,
      debtorFact: debtor,
      operationFact: operation,
      outputRef: 'OUT.DEBT.1',
    });
    expect(debt.creditor.externalDebtAssets).toEqual(MONEY('60', 'GCU'));
    expect(debt.debtor.externalDebtLiabilities).toEqual(MONEY('60', 'GCU'));
    expect(() =>
      calculateExternalDebtOperation({
        trace: TRACE,
        creditorFact: creditor,
        debtorFact: fact(TRACE, 'FACT.DEBT.IMBALANCED', {
          ...debtor.payload,
          externalDebtLiabilities: MONEY('49', 'GCU'),
        }),
        operationFact: operation,
        outputRef: 'OUT.DEBT.IMBALANCED',
      }),
    ).toThrow('must reconcile before operation');

    const official = calculateOfficialInterventionAndSterilization({
      trace: TRACE,
      officialFact: fact(TRACE, 'FACT.OFFICIAL', {
        countryRef: 'COUNTRY.A',
        localCurrency: 'LCA',
        officialGcuReserves: MONEY('100', 'GCU'),
        officialLocalLiquidity: MONEY('200', 'LCA'),
        sterilizationInstruments: MONEY('25', 'LCA'),
      }),
      interventionFact: fact(TRACE, 'FACT.INTERVENTION', {
        interventionRef: 'INTERVENTION.1',
        interventionVersion: 'INTERVENTION.1',
        countryRef: 'COUNTRY.A',
        gcuReserveDelta: MONEY('-10', 'GCU'),
        localLiquidityDelta: MONEY('-5', 'LCA'),
        interventionAt: { amount: '20000', unit: 'sim_millisecond' } as const,
      }),
      sterilizationFact: fact(TRACE, 'FACT.STERILIZATION', {
        sterilizationRef: 'STERILIZATION.1',
        sterilizationVersion: 'STERILIZATION.1',
        countryRef: 'COUNTRY.A',
        localLiquidityDelta: MONEY('-5', 'LCA'),
        instrumentDelta: MONEY('5', 'LCA'),
        sterilizationAt: { amount: '20000', unit: 'sim_millisecond' } as const,
      }),
      outputRef: 'OUT.OFFICIAL.1',
    });
    expect(official.official).toMatchObject({
      officialGcuReserves: MONEY('90', 'GCU'),
      officialLocalLiquidity: MONEY('190', 'LCA'),
      sterilizationInstruments: MONEY('30', 'LCA'),
    });
  });
});

describe('V20.3 historical cash and separate revaluation', () => {
  it('locks execution cash, derives a separate mark, and rejects a historical-rate rewrite', () => {
    const execution = lockHistoricalFxCashSettlement({
      trace: TRACE,
      rateFact: rateFact(),
      roundingFact: roundingFact(),
      conversionFact: conversionFact(TRACE, {
        ...conversionFact().payload,
        amount: MONEY('100', 'LCA'),
      }),
      settlementFact: fact(TRACE, 'FACT.HISTORICAL.EXECUTION', {
        tradeRef: 'TRADE.1',
        settlementRef: 'HISTORICAL.SETTLEMENT.1',
        executionVersion: 'HISTORICAL.1',
        payerCountryRef: 'COUNTRY.A',
        payeeCountryRef: 'COUNTRY.B',
        conversionRef: 'CONVERSION.1',
        executedAt: { amount: '20000', unit: 'sim_millisecond' } as const,
      }),
      outputRef: 'OUT.HISTORICAL.EXECUTION',
    });
    expect(execution.lockedSettlement.lockedGcuCash).toEqual(
      MONEY('125', 'GCU'),
    );

    const valuationTrace: FoundationTraceRequest = {
      ...TRACE,
      traceRef: 'TRACE.V20.2',
      calculationVersion: 'V20_FOUNDATION.2',
      snapshot: {
        ...TRACE.snapshot,
        sourceVersion: 'WORLD_VERSION.21',
        snapshotRef: 'SNAPSHOT.WORLD.21',
        snapshotHash: HASH_C,
        predecessorSnapshotHash: HASH_A,
      },
      snapshotAt: { amount: '21000', unit: 'sim_millisecond' },
    };
    const currentRate: CountryFxRate = {
      ...RATE,
      rateRef: 'RATE.A.21000',
      rateVersion: 'FX_RATE.2',
      globalPerLocalUnit: '2',
      valuationAt: { amount: '21000', unit: 'sim_millisecond' },
    };
    const currentRounding: FxRoundingDecision = {
      ...ROUNDING,
      roundingDecisionRef: 'ROUNDING.FX.2',
      roundingVersion: 'ROUNDING.2',
      valuationAt: { amount: '21000', unit: 'sim_millisecond' },
    };
    const result = revalueHistoricalFxCashSettlement({
      trace: valuationTrace,
      lockedSettlementFact: fact<LockedHistoricalFxCashSettlement>(
        valuationTrace,
        'FACT.HISTORICAL.LOCKED',
        execution.lockedSettlement,
      ),
      currentRateFact: fact(valuationTrace, 'FACT.RATE.A.21000', currentRate),
      currentRoundingFact: fact(
        valuationTrace,
        'FACT.ROUNDING.2',
        currentRounding,
      ),
      revaluationFact: fact(valuationTrace, 'FACT.HISTORICAL.REVALUATION', {
        revaluationRef: 'REVALUATION.1',
        revaluationVersion: 'REVALUATION.1',
        settlementRef: 'HISTORICAL.SETTLEMENT.1',
        valuationAt: { amount: '21000', unit: 'sim_millisecond' } as const,
      }),
      outputRef: 'OUT.HISTORICAL.REVALUATION',
    });
    expect(result.lockedSettlement.lockedGcuCash).toEqual(MONEY('125', 'GCU'));
    expect(result.currentMarkedGcuValue).toEqual(MONEY('200', 'GCU'));
    expect(result.revaluationTrace.delta).toEqual(MONEY('75', 'GCU'));
    expect(() =>
      revalueHistoricalFxCashSettlement({
        trace: valuationTrace,
        lockedSettlementFact: fact<LockedHistoricalFxCashSettlement>(
          valuationTrace,
          'FACT.HISTORICAL.REWRITTEN',
          { ...execution.lockedSettlement, lockedGcuCash: MONEY('200', 'GCU') },
        ),
        currentRateFact: fact(
          valuationTrace,
          'FACT.RATE.A.21000.2',
          currentRate,
        ),
        currentRoundingFact: fact(
          valuationTrace,
          'FACT.ROUNDING.2.2',
          currentRounding,
        ),
        revaluationFact: fact(valuationTrace, 'FACT.HISTORICAL.REVALUATION.2', {
          revaluationRef: 'REVALUATION.2',
          revaluationVersion: 'REVALUATION.1',
          settlementRef: 'HISTORICAL.SETTLEMENT.1',
          valuationAt: { amount: '21000', unit: 'sim_millisecond' } as const,
        }),
        outputRef: 'OUT.HISTORICAL.REWRITTEN',
      }),
    ).toThrow('Locked historical cash');
  });
});
