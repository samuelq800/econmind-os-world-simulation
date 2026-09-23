import { describe, expect, it } from 'vitest';

import {
  createFoundationFact,
  type FoundationFact,
} from '../../packages/core/src/engine-kernels/foundation-provenance.js';
import {
  type ExpenditureStatement,
  type NationalAccountsBasis,
  type PeriodCompletenessStatement,
  type SectorProductionStatement,
} from '../../packages/core/src/engine-kernels/national-accounts-production-foundation.js';
import {
  type CurrentAccountInput,
  type ExpenditureEligibilityStatement,
  type ExternalFlowClosureStatement,
  type FixedBasketCpiInput,
  type FixedBasketClosureStatement,
  type FixedBasketPriceStatement,
  type CpiCategory,
} from '../../packages/core/src/engine-kernels/national-accounts-reconciliation-foundation.js';
import {
  assertNationalRiskScoreReplay,
  prepareNationalRiskScore,
  type AccountMetricStatement,
  type RiskPolicyStatement,
  type RiskScoreInput,
  type ScorePolicyStatement,
} from '../../packages/core/src/engine-kernels/national-risk-score-foundation.js';

const trace = {
  traceRef: 'TRACE.V23.3',
  calculationVersion: 'RISK.SCORE.CANDIDATE.1',
  snapshot: {
    lineageRef: 'LINEAGE.WORLD.23',
    sourceVersion: 'WORLD_VERSION.23',
    snapshotRef: 'SNAPSHOT.WORLD.23',
    snapshotHash: 'a'.repeat(64),
    predecessorSnapshotHash: 'b'.repeat(64),
  },
  snapshotAt: { amount: '3000', unit: 'sim_millisecond' },
} as const;
const cash = (amount: string, currency = 'GCU') => ({ amount, currency });
const point = (amount: string) => ({ amount, unit: 'score_point' });
const basis: NationalAccountsBasis = {
  countryRef: 'COUNTRY.A',
  periodRef: 'PERIOD.3',
  startInclusive: { amount: '2000', unit: 'sim_millisecond' },
  endExclusive: { amount: '3000', unit: 'sim_millisecond' },
  currency: 'GCU',
  accountingVersionRef: 'ACCOUNTING.3',
};

function fact<T>(
  factRef: string,
  payload: T,
  predecessors: readonly string[] = ['GENESIS.WORLD.23'],
): FoundationFact<T> {
  return createFoundationFact({
    trace,
    factRef,
    sourceRef: `SOURCE.${factRef}`,
    predecessorFactRefs: predecessors,
    payload,
  });
}

function refact<T>(prior: FoundationFact<T>, payload: T): FoundationFact<T> {
  return fact(prior.factRef, payload, prior.predecessorFactRefs);
}

function accounts(): CurrentAccountInput {
  const sector: SectorProductionStatement = {
    kind: 'SETTLED_REAL_PRODUCTION',
    basis,
    sectorRef: 'SECTOR.A',
    grossOutputValue: cash('145'),
    intermediateConsumptionValue: cash('0'),
    grossOutputReceiptRef: 'RECEIPT.GROSS',
    intermediateConsumptionReceiptRef: 'RECEIPT.INPUT.ZERO',
  };
  const sectorFact = fact('FACT.SECTOR', sector);
  const productionClosure: PeriodCompletenessStatement = {
    kind: 'PERIOD_SOURCES_COMPLETE',
    basis,
    closureReceiptRef: 'RECEIPT.PRODUCTION.CLOSURE',
    sectorFactRefs: [sectorFact.factRef],
    productTaxFactRefs: [],
    productSubsidyFactRefs: [],
  };
  const expenditure: ExpenditureStatement = {
    kind: 'SETTLED_EXPENDITURE_RECONCILIATION',
    basis,
    components: [
      {
        category: 'C',
        amount: cash('100'),
        receiptRef: 'RECEIPT.C',
        realization: 'FINAL_USE_SETTLED',
      },
      {
        category: 'I',
        amount: cash('25'),
        receiptRef: 'RECEIPT.I',
        realization: 'FINAL_USE_SETTLED',
      },
      {
        category: 'G',
        amount: cash('10'),
        receiptRef: 'RECEIPT.G',
        realization: 'FINAL_USE_SETTLED',
      },
      {
        category: 'X',
        amount: cash('30'),
        receiptRef: 'RECEIPT.X',
        realization: 'DELIVERED_OWNERSHIP_TRANSFER',
      },
      {
        category: 'M',
        amount: cash('20'),
        receiptRef: 'RECEIPT.M',
        realization: 'DELIVERED_OWNERSHIP_TRANSFER',
      },
    ],
  };
  const expenditureFact = fact('FACT.EXPENDITURE', expenditure);
  const eligibility: ExpenditureEligibilityStatement = {
    kind: 'COMPLETE_FINAL_EXPENDITURE_ELIGIBILITY',
    basis,
    lines: [
      {
        category: 'C',
        amount: cash('100'),
        receiptRef: 'RECEIPT.C',
        sourceKind: 'FINAL_HOUSEHOLD_CONSUMPTION_SETTLED',
      },
      {
        category: 'I',
        amount: cash('25'),
        receiptRef: 'RECEIPT.I',
        sourceKind: 'REAL_CAPITAL_FORMATION_SETTLED',
      },
      {
        category: 'G',
        amount: cash('10'),
        receiptRef: 'RECEIPT.G',
        sourceKind: 'PUBLIC_SERVICE_CONSUMPTION_SETTLED',
      },
      {
        category: 'X',
        amount: cash('30'),
        receiptRef: 'RECEIPT.X',
        sourceKind: 'DELIVERED_EXPORT_OWNERSHIP_TRANSFER',
      },
      {
        category: 'M',
        amount: cash('20'),
        receiptRef: 'RECEIPT.M',
        sourceKind: 'DELIVERED_IMPORT_OWNERSHIP_TRANSFER',
      },
    ],
  };
  const externalClosure: ExternalFlowClosureStatement = {
    kind: 'COMPLETE_EXTERNAL_INCOME_AND_TRANSFER_FLOWS',
    basis,
    closureReceiptRef: 'RECEIPT.CA.CLOSURE',
    flowFactRefs: [],
  };
  return {
    trace,
    completenessFact: fact('FACT.PRODUCTION.CLOSURE', productionClosure, [
      sectorFact.factRef,
    ]),
    sectorFacts: [sectorFact],
    productTaxFacts: [],
    productSubsidyFacts: [],
    expenditureFact,
    eligibilityFact: fact('FACT.ELIGIBILITY', eligibility, [
      expenditureFact.factRef,
    ]),
    externalClosureFact: fact('FACT.CA.CLOSURE', externalClosure, [
      expenditureFact.factRef,
    ]),
    externalFlowFacts: [],
  };
}

const cpiCategories: readonly CpiCategory[] = [
  'FOOD',
  'ENERGY',
  'HOUSING',
  'GENERAL_GOODS',
  'SERVICES',
];
const basePrices = ['10', '20', '30', '40', '50'];
const currentPrices = ['11', '22', '29', '40', '53'];
const price = (amount: string) => ({
  amount,
  currency: 'GCU',
  perUnit: 'unit',
});

function cpi(): FixedBasketCpiInput {
  const categoryFacts = cpiCategories.map((category, index) => {
    const payload: FixedBasketPriceStatement = {
      kind: 'FIXED_BASKET_OBSERVED_PRICES',
      basis,
      basketVersionRef: 'BASKET.1',
      previousPeriodRef: 'PERIOD.2',
      category,
      fixedQuantity: { amount: '1', unit: 'unit' },
      basePrice: price(basePrices[index]!),
      previousPrice: price(basePrices[index]!),
      currentPrice: price(currentPrices[index]!),
      basketReceiptRef: `RECEIPT.BASKET.${category}`,
      basePriceReceiptRef: `RECEIPT.BASE.${category}`,
      previousPriceReceiptRef: `RECEIPT.PREV.${category}`,
      currentPriceReceiptRef: `RECEIPT.CURRENT.${category}`,
    };
    return fact(`FACT.CPI.${category}`, payload);
  });
  const closure: FixedBasketClosureStatement = {
    kind: 'COMPLETE_FIXED_BASKET',
    basis,
    basketVersionRef: 'BASKET.1',
    previousPeriodRef: 'PERIOD.2',
    closureReceiptRef: 'RECEIPT.CPI.CLOSURE',
    categoryFactRefs: categoryFacts.map((item) => item.factRef),
  };
  return {
    trace,
    closureFact: fact('FACT.CPI.CLOSURE', closure, closure.categoryFactRefs),
    categoryFacts,
  };
}

function input(): RiskScoreInput {
  const currentAccountInput = accounts();
  const cpiInput = cpi();
  const metricFacts: FoundationFact<AccountMetricStatement>[] = [
    fact('FACT.METRIC.GDP', {
      kind: 'ACCOUNT_DERIVED_METRIC',
      basis,
      metricRef: 'PRODUCTION_GDP',
      initialValue: cash('140'),
      currentValue: cash('145'),
      initialVersionRef: 'INITIAL.1',
      initialReceiptRef: 'RECEIPT.INITIAL.GDP',
      currentSourceFactRef: currentAccountInput.completenessFact.factRef,
      currentReceiptRef:
        currentAccountInput.completenessFact.payload.closureReceiptRef,
    }),
    fact('FACT.METRIC.CA', {
      kind: 'ACCOUNT_DERIVED_METRIC',
      basis,
      metricRef: 'CURRENT_ACCOUNT',
      initialValue: cash('8'),
      currentValue: cash('10'),
      initialVersionRef: 'INITIAL.1',
      initialReceiptRef: 'RECEIPT.INITIAL.CA',
      currentSourceFactRef: currentAccountInput.externalClosureFact.factRef,
      currentReceiptRef:
        currentAccountInput.externalClosureFact.payload.closureReceiptRef,
    }),
    fact('FACT.METRIC.CPI', {
      kind: 'ACCOUNT_DERIVED_METRIC',
      basis,
      metricRef: 'CPI_COST_CHANGE',
      initialValue: cash('0'),
      currentValue: cash('5'),
      initialVersionRef: 'INITIAL.1',
      initialReceiptRef: 'RECEIPT.INITIAL.CPI',
      currentSourceFactRef: cpiInput.closureFact.factRef,
      currentReceiptRef: cpiInput.closureFact.payload.closureReceiptRef,
    }),
  ];
  const riskPolicy: RiskPolicyStatement = {
    kind: 'CANDIDATE_RISK_POLICY',
    basis,
    policyVersionRef: 'RISK.POLICY.1',
    policyReceiptRef: 'RECEIPT.RISK.POLICY',
    rules: [
      {
        riskRef: 'RISK.PRICE.SPIKE',
        metricRef: 'CPI_COST_CHANGE',
        comparison: 'ABOVE_OR_EQUAL',
        threshold: cash('4'),
        ruleReceiptRef: 'RECEIPT.RISK.PRICE',
      },
      {
        riskRef: 'RISK.EXTERNAL.DEFICIT',
        metricRef: 'CURRENT_ACCOUNT',
        comparison: 'BELOW_OR_EQUAL',
        threshold: cash('0'),
        ruleReceiptRef: 'RECEIPT.RISK.CA',
      },
    ],
  };
  const riskPolicyFact = fact(
    'FACT.RISK.POLICY',
    riskPolicy,
    metricFacts.map((item) => item.factRef),
  );
  const scorePolicy: ScorePolicyStatement = {
    kind: 'CANDIDATE_SCORE_POLICY',
    basis,
    candidateScoreVersionRef: 'SCORE.CANDIDATE.1',
    policyReceiptRef: 'RECEIPT.SCORE.POLICY',
    baseScore: point('50'),
    terms: [
      {
        metricRef: 'PRODUCTION_GDP',
        direction: 'HIGHER_BETTER',
        slopePointsPerCurrencyUnit: '1',
        termReceiptRef: 'RECEIPT.SCORE.GDP',
      },
      {
        metricRef: 'CURRENT_ACCOUNT',
        direction: 'HIGHER_BETTER',
        slopePointsPerCurrencyUnit: '1',
        termReceiptRef: 'RECEIPT.SCORE.CA',
      },
      {
        metricRef: 'CPI_COST_CHANGE',
        direction: 'LOWER_BETTER',
        slopePointsPerCurrencyUnit: '1',
        termReceiptRef: 'RECEIPT.SCORE.CPI',
      },
    ],
    guardrails: [
      {
        riskRef: 'RISK.PRICE.SPIKE',
        cap: point('45'),
        guardrailReceiptRef: 'RECEIPT.GUARDRAIL.PRICE',
      },
    ],
  };
  return {
    currentAccountInput,
    cpiInput,
    metricFacts,
    riskPolicyFact,
    scorePolicyFact: fact('FACT.SCORE.POLICY', scorePolicy, [
      riskPolicyFact.factRef,
      ...metricFacts.map((item) => item.factRef),
    ]),
  };
}

describe('V23.3 risk/score pure Core preparation', () => {
  it('binds account values and computes traceable contributions, risk explanations and downward cap', () => {
    const request = input();
    const result = prepareNationalRiskScore(request);
    expect(result.status).toBe('PREPARATION_ONLY');
    if (result.status !== 'PREPARATION_ONLY')
      throw new Error('Expected candidate score');
    expect(result.candidateScoreVersionRef).toBe('SCORE.CANDIDATE.1');
    expect(result.scoreContributions.map((item) => item.points.amount)).toEqual(
      ['-5', '2', '5'],
    );
    expect(result.scoreBeforeGuardrails).toEqual(point('52'));
    expect(result.guardrailReduction).toEqual(point('7'));
    expect(result.candidateScore).toEqual(point('45'));
    expect(
      result.riskFlags.find((item) => item.riskRef === 'RISK.PRICE.SPIKE'),
    ).toMatchObject({
      actual: cash('5'),
      threshold: cash('4'),
      actualMinusThreshold: cash('1'),
      triggered: true,
      metricFactRef: 'FACT.METRIC.CPI',
      currentReceiptRef: 'RECEIPT.CPI.CLOSURE',
    });
    assertNationalRiskScoreReplay(request, result);
    expect(prepareNationalRiskScore(request)).toEqual(result);
  });

  it('isolates GDP mismatch from all risk and score outputs', () => {
    const request = input();
    const prior = request.currentAccountInput.expenditureFact;
    const changed = refact(prior, {
      ...prior.payload,
      components: prior.payload.components.map((item) =>
        item.category === 'C' ? { ...item, amount: cash('101') } : item,
      ),
    });
    const result = prepareNationalRiskScore({
      ...request,
      currentAccountInput: {
        ...request.currentAccountInput,
        expenditureFact: changed,
      },
    });
    expect(result.status).toBe('ACCOUNT_ERROR');
    if (result.status !== 'ACCOUNT_ERROR')
      throw new Error('Expected account error');
    expect(result.score).toBeNull();
    expect(result.riskFlags).toEqual([]);
    expect(result.diagnostic).toMatchObject({
      productionGdp: cash('145'),
      expenditureGdp: cash('146'),
      difference: cash('-1'),
    });
  });

  it('isolates invalid CPI source facts without fabricating a score', () => {
    const request = input();
    const result = prepareNationalRiskScore({
      ...request,
      cpiInput: {
        ...request.cpiInput,
        categoryFacts: request.cpiInput.categoryFacts.slice(0, 4),
      },
    });
    expect(result.status).toBe('ACCOUNT_ERROR');
    if (result.status !== 'ACCOUNT_ERROR')
      throw new Error('Expected account error');
    expect(result.score).toBeNull();
    expect(result.riskFlags).toEqual([]);
  });

  it('isolates mixed account snapshots and duplicate account fact references', () => {
    const request = input();
    const mixed = {
      ...request.cpiInput,
      trace: {
        ...request.cpiInput.trace,
        snapshot: { ...trace.snapshot, snapshotHash: 'c'.repeat(64) },
      },
    };
    const mixedResult = prepareNationalRiskScore({
      ...request,
      cpiInput: mixed,
    });
    expect(mixedResult.status).toBe('ACCOUNT_ERROR');
    const reused = {
      ...request.cpiInput,
      closureFact: fact(
        request.currentAccountInput.completenessFact.factRef,
        request.cpiInput.closureFact.payload,
        request.cpiInput.closureFact.predecessorFactRefs,
      ),
    };
    expect(
      prepareNationalRiskScore({ ...request, cpiInput: reused }).status,
    ).toBe('ACCOUNT_ERROR');
  });

  it('rejects fabricated account metric even with a valid caller fact envelope', () => {
    const request = input();
    const changed = refact(request.metricFacts[0]!, {
      ...request.metricFacts[0]!.payload,
      currentValue: cash('999'),
    });
    expect(() =>
      prepareNationalRiskScore({
        ...request,
        metricFacts: [changed, ...request.metricFacts.slice(1)],
      }),
    ).toThrow();
  });

  it('keeps policy failures out of account-error classification', () => {
    const request = input();
    const changed = refact(request.scorePolicyFact, {
      ...request.scorePolicyFact.payload,
      baseScore: point('101'),
    });
    expect(() =>
      prepareNationalRiskScore({ ...request, scorePolicyFact: changed }),
    ).toThrow();
  });

  it('rejects stale policy version/period lineage and unbound risk reference', () => {
    const request = input();
    const stale = refact(request.riskPolicyFact, {
      ...request.riskPolicyFact.payload,
      basis: { ...basis, periodRef: 'PERIOD.OLD' },
    });
    expect(() =>
      prepareNationalRiskScore({ ...request, riskPolicyFact: stale }),
    ).toThrow();
    const unbound = refact(request.scorePolicyFact, {
      ...request.scorePolicyFact.payload,
      guardrails: [
        {
          riskRef: 'RISK.UNKNOWN',
          cap: point('45'),
          guardrailReceiptRef: 'RECEIPT.UNKNOWN',
        },
      ],
    });
    expect(() =>
      prepareNationalRiskScore({ ...request, scorePolicyFact: unbound }),
    ).toThrow();
  });

  it('rejects forged risk/score replay output with unchanged source facts', () => {
    const request = input();
    const result = prepareNationalRiskScore(request);
    if (result.status !== 'PREPARATION_ONLY')
      throw new Error('Expected candidate score');
    expect(() =>
      assertNationalRiskScoreReplay(request, {
        ...result,
        candidateScore: point('99'),
      }),
    ).toThrow();
  });
});
