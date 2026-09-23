import { describe, expect, it } from 'vitest';

import {
  createFoundationFact,
  type FoundationFact,
} from '../../packages/core/src/engine-kernels/foundation-provenance.js';
import {
  NationalAccountsReconciliationError,
  type ExpenditureStatement,
  type NationalAccountsBasis,
  type NationalAccountsProductionInput,
  type PeriodCompletenessStatement,
  type SectorProductionStatement,
} from '../../packages/core/src/engine-kernels/national-accounts-production-foundation.js';
import {
  assertCurrentAccountReplay,
  assertFixedBasketCpiReplay,
  prepareExpenditureCurrentAccount,
  prepareFixedBasketCpi,
  type CurrentAccountInput,
  type ExpenditureEligibilityStatement,
  type ExternalFlowClosureStatement,
  type ExternalFlowStatement,
  type FixedBasketClosureStatement,
  type FixedBasketCpiInput,
  type FixedBasketPriceStatement,
  type CpiCategory,
} from '../../packages/core/src/engine-kernels/national-accounts-reconciliation-foundation.js';

const trace = {
  traceRef: 'TRACE.V23.2',
  calculationVersion: 'NATIONAL.ACCOUNTS.2',
  snapshot: {
    lineageRef: 'LINEAGE.WORLD.23',
    sourceVersion: 'WORLD_VERSION.23',
    snapshotRef: 'SNAPSHOT.WORLD.23',
    snapshotHash: 'a'.repeat(64),
    predecessorSnapshotHash: 'b'.repeat(64),
  },
  snapshotAt: { amount: '2000', unit: 'sim_millisecond' },
} as const;
const money = (amount: string, currency = 'GCU') => ({ amount, currency });
const basis: NationalAccountsBasis = {
  countryRef: 'COUNTRY.A',
  periodRef: 'PERIOD.2',
  startInclusive: { amount: '1000', unit: 'sim_millisecond' },
  endExclusive: { amount: '2000', unit: 'sim_millisecond' },
  currency: 'GCU',
  accountingVersionRef: 'ACCOUNTING.2',
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

function production(): NationalAccountsProductionInput {
  const sector: SectorProductionStatement = {
    kind: 'SETTLED_REAL_PRODUCTION',
    basis,
    sectorRef: 'SECTOR.A',
    grossOutputValue: money('145'),
    intermediateConsumptionValue: money('0'),
    grossOutputReceiptRef: 'RECEIPT.OUTPUT',
    intermediateConsumptionReceiptRef: 'RECEIPT.INPUT.ZERO',
  };
  const sectorFact = fact('FACT.SECTOR', sector);
  const closure: PeriodCompletenessStatement = {
    kind: 'PERIOD_SOURCES_COMPLETE',
    basis,
    closureReceiptRef: 'RECEIPT.PRODUCTION.CLOSURE',
    sectorFactRefs: [sectorFact.factRef],
    productTaxFactRefs: [],
    productSubsidyFactRefs: [],
  };
  return {
    trace,
    completenessFact: fact('FACT.PRODUCTION.CLOSURE', closure, [
      sectorFact.factRef,
    ]),
    sectorFacts: [sectorFact],
    productTaxFacts: [],
    productSubsidyFacts: [],
  };
}

function expenditure(): FoundationFact<ExpenditureStatement> {
  return fact('FACT.EXPENDITURE', {
    kind: 'SETTLED_EXPENDITURE_RECONCILIATION',
    basis,
    components: [
      {
        category: 'C',
        amount: money('100'),
        receiptRef: 'RECEIPT.C',
        realization: 'FINAL_USE_SETTLED',
      },
      {
        category: 'I',
        amount: money('25'),
        receiptRef: 'RECEIPT.I',
        realization: 'FINAL_USE_SETTLED',
      },
      {
        category: 'G',
        amount: money('10'),
        receiptRef: 'RECEIPT.G',
        realization: 'FINAL_USE_SETTLED',
      },
      {
        category: 'X',
        amount: money('30'),
        receiptRef: 'RECEIPT.X',
        realization: 'DELIVERED_OWNERSHIP_TRANSFER',
      },
      {
        category: 'M',
        amount: money('20'),
        receiptRef: 'RECEIPT.M',
        realization: 'DELIVERED_OWNERSHIP_TRANSFER',
      },
    ],
  });
}

function currentAccount(): CurrentAccountInput {
  const expenditureFact = expenditure();
  const eligibility: ExpenditureEligibilityStatement = {
    kind: 'COMPLETE_FINAL_EXPENDITURE_ELIGIBILITY',
    basis,
    lines: [
      {
        category: 'C',
        amount: money('100'),
        receiptRef: 'RECEIPT.C',
        sourceKind: 'FINAL_HOUSEHOLD_CONSUMPTION_SETTLED',
      },
      {
        category: 'I',
        amount: money('25'),
        receiptRef: 'RECEIPT.I',
        sourceKind: 'REAL_CAPITAL_FORMATION_SETTLED',
      },
      {
        category: 'G',
        amount: money('10'),
        receiptRef: 'RECEIPT.G',
        sourceKind: 'PUBLIC_SERVICE_CONSUMPTION_SETTLED',
      },
      {
        category: 'X',
        amount: money('30'),
        receiptRef: 'RECEIPT.X',
        sourceKind: 'DELIVERED_EXPORT_OWNERSHIP_TRANSFER',
      },
      {
        category: 'M',
        amount: money('20'),
        receiptRef: 'RECEIPT.M',
        sourceKind: 'DELIVERED_IMPORT_OWNERSHIP_TRANSFER',
      },
    ],
  };
  const externalFlowFacts: FoundationFact<ExternalFlowStatement>[] = [
    fact('FACT.PRIMARY.IN', {
      kind: 'SETTLED_PRIMARY_INCOME',
      direction: 'INFLOW',
      basis,
      amount: money('5'),
      receiptRef: 'RECEIPT.PRIMARY.IN',
    }),
    fact('FACT.PRIMARY.OUT', {
      kind: 'SETTLED_PRIMARY_INCOME',
      direction: 'OUTFLOW',
      basis,
      amount: money('2'),
      receiptRef: 'RECEIPT.PRIMARY.OUT',
    }),
    fact('FACT.TRANSFER.IN', {
      kind: 'SETTLED_SECONDARY_TRANSFER',
      direction: 'INFLOW',
      basis,
      amount: money('3'),
      receiptRef: 'RECEIPT.TRANSFER.IN',
    }),
    fact('FACT.TRANSFER.OUT', {
      kind: 'SETTLED_SECONDARY_TRANSFER',
      direction: 'OUTFLOW',
      basis,
      amount: money('4'),
      receiptRef: 'RECEIPT.TRANSFER.OUT',
    }),
  ];
  const closure: ExternalFlowClosureStatement = {
    kind: 'COMPLETE_EXTERNAL_INCOME_AND_TRANSFER_FLOWS',
    basis,
    closureReceiptRef: 'RECEIPT.EXTERNAL.CLOSURE',
    flowFactRefs: externalFlowFacts.map((item) => item.factRef),
  };
  return {
    ...production(),
    expenditureFact,
    eligibilityFact: fact('FACT.ELIGIBILITY', eligibility, [
      expenditureFact.factRef,
    ]),
    externalClosureFact: fact('FACT.EXTERNAL.CLOSURE', closure, [
      expenditureFact.factRef,
      ...closure.flowFactRefs,
    ]),
    externalFlowFacts,
  };
}

const categories: readonly CpiCategory[] = [
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
  const categoryFacts = categories.map((category, index) => {
    const payload: FixedBasketPriceStatement = {
      kind: 'FIXED_BASKET_OBSERVED_PRICES',
      basis,
      basketVersionRef: 'BASKET.1',
      previousPeriodRef: 'PERIOD.1',
      category,
      fixedQuantity: { amount: '1', unit: 'unit' },
      basePrice: price(basePrices[index]!),
      previousPrice: price(basePrices[index]!),
      currentPrice: price(currentPrices[index]!),
      basketReceiptRef: `RECEIPT.BASKET.${category}`,
      basePriceReceiptRef: `RECEIPT.BASE.${category}`,
      previousPriceReceiptRef: `RECEIPT.PREVIOUS.${category}`,
      currentPriceReceiptRef: `RECEIPT.CURRENT.${category}`,
    };
    return fact(`FACT.CPI.${category}`, payload);
  });
  const closure: FixedBasketClosureStatement = {
    kind: 'COMPLETE_FIXED_BASKET',
    basis,
    basketVersionRef: 'BASKET.1',
    previousPeriodRef: 'PERIOD.1',
    closureReceiptRef: 'RECEIPT.CPI.CLOSURE',
    categoryFactRefs: categoryFacts.map((item) => item.factRef),
  };
  return {
    trace,
    closureFact: fact('FACT.CPI.CLOSURE', closure, closure.categoryFactRefs),
    categoryFacts,
  };
}

describe('V23.2 pure accounts reconciliation', () => {
  it('reuses production GDP and adds trade, primary income and secondary transfers once', () => {
    const input = currentAccount();
    const result = prepareExpenditureCurrentAccount(input);
    expect(result.status).toBe('PREPARATION_ONLY');
    expect(result.expenditureReconciliation.productionGdp).toEqual(
      money('145'),
    );
    expect(result.expenditureReconciliation.expenditureGdp).toEqual(
      money('145'),
    );
    expect(result.tradeBalance).toEqual(money('10'));
    expect(result.netPrimaryIncome).toEqual(money('3'));
    expect(result.netSecondaryTransfers).toEqual(money('-1'));
    expect(result.currentAccount).toEqual(money('12'));
    assertCurrentAccountReplay(input, result);
    expect(() =>
      assertCurrentAccountReplay(input, {
        ...result,
        currentAccount: money('999'),
      }),
    ).toThrow();
  });

  it('rejects GDP mismatch without averaging or mutating production GDP', () => {
    const input = currentAccount();
    const changed = refact(input.expenditureFact, {
      ...input.expenditureFact.payload,
      components: input.expenditureFact.payload.components.map((item) =>
        item.category === 'C' ? { ...item, amount: money('101') } : item,
      ),
    });
    expect(() =>
      prepareExpenditureCurrentAccount({ ...input, expenditureFact: changed }),
    ).toThrow(NationalAccountsReconciliationError);
  });

  it('rejects transfer, intermediate and mere project approval as final GDP use', () => {
    const input = currentAccount();
    for (const category of ['C', 'I', 'G'] as const) {
      const changed = refact(input.eligibilityFact, {
        ...input.eligibilityFact.payload,
        lines: input.eligibilityFact.payload.lines.map((line) =>
          line.category === category
            ? { ...line, sourceKind: 'TRANSFER' as typeof line.sourceKind }
            : line,
        ),
      });
      expect(() =>
        prepareExpenditureCurrentAccount({
          ...input,
          eligibilityFact: changed,
        }),
      ).toThrow();
    }
  });

  it('rejects stale period, missing flow closure and duplicate external receipts', () => {
    const input = currentAccount();
    const stale = refact(input.externalFlowFacts[0]!, {
      ...input.externalFlowFacts[0]!.payload,
      basis: { ...basis, periodRef: 'PERIOD.OLD' },
    });
    expect(() =>
      prepareExpenditureCurrentAccount({
        ...input,
        externalFlowFacts: [stale, ...input.externalFlowFacts.slice(1)],
      }),
    ).toThrow();
    expect(() =>
      prepareExpenditureCurrentAccount({
        ...input,
        externalFlowFacts: input.externalFlowFacts.slice(0, 3),
      }),
    ).toThrow();
    const duplicate = refact(input.externalFlowFacts[1]!, {
      ...input.externalFlowFacts[1]!.payload,
      receiptRef: input.externalFlowFacts[0]!.payload.receiptRef,
    });
    expect(() =>
      prepareExpenditureCurrentAccount({
        ...input,
        externalFlowFacts: [
          input.externalFlowFacts[0]!,
          duplicate,
          ...input.externalFlowFacts.slice(2),
        ],
      }),
    ).toThrow();
    const reusedProductionRef = fact(
      input.sectorFacts[0]!.factRef,
      input.eligibilityFact.payload,
      [input.expenditureFact.factRef],
    );
    expect(() =>
      prepareExpenditureCurrentAccount({
        ...input,
        eligibilityFact: reusedProductionRef,
      }),
    ).toThrow();
  });

  it('allows explicit complete zero external flows without inventing transfer value', () => {
    const input = currentAccount();
    const emptyClosure = refact(input.externalClosureFact, {
      ...input.externalClosureFact.payload,
      flowFactRefs: [],
    });
    const zeroClosure = fact(emptyClosure.factRef, emptyClosure.payload, [
      input.expenditureFact.factRef,
    ]);
    const result = prepareExpenditureCurrentAccount({
      ...input,
      externalClosureFact: zeroClosure,
      externalFlowFacts: [],
    });
    expect(result.currentAccount).toEqual(money('10'));
  });

  it('computes fixed-basket CPI and exactly additive contribution fractions', () => {
    const input = cpi();
    const result = prepareFixedBasketCpi(input);
    expect(result.baseBasketCost).toEqual(money('150'));
    expect(result.previousBasketCost).toEqual(money('150'));
    expect(result.currentBasketCost).toEqual(money('155'));
    expect(result.headlineCostChange).toEqual(money('5'));
    expect(result.previousCpiIndexTimes100).toEqual({
      numerator: '15000',
      denominator: '150',
    });
    expect(result.currentCpiIndexTimes100).toEqual({
      numerator: '15500',
      denominator: '150',
    });
    expect(result.headlineInflation).toEqual({
      numerator: '5',
      denominator: '150',
    });
    expect(
      result.contributions.map(
        (line) => line.contributionToHeadlineInflation.numerator,
      ),
    ).toEqual(['1', '2', '-1', '0', '3']);
    expect(
      result.contributions.every(
        (line) => line.contributionToHeadlineInflation.denominator === '150',
      ),
    ).toBe(true);
    assertFixedBasketCpiReplay(input, result);
    expect(
      prepareFixedBasketCpi({
        ...input,
        categoryFacts: [...input.categoryFacts].reverse(),
      }),
    ).toEqual(result);
  });

  it('rejects missing category, basket-version drift, price unit mismatch and zero base', () => {
    const input = cpi();
    expect(() =>
      prepareFixedBasketCpi({
        ...input,
        categoryFacts: input.categoryFacts.slice(0, 4),
      }),
    ).toThrow();
    const drift = refact(input.categoryFacts[0]!, {
      ...input.categoryFacts[0]!.payload,
      basketVersionRef: 'BASKET.OLD',
    });
    expect(() =>
      prepareFixedBasketCpi({
        ...input,
        categoryFacts: [drift, ...input.categoryFacts.slice(1)],
      }),
    ).toThrow();
    const wrongUnit = refact(input.categoryFacts[0]!, {
      ...input.categoryFacts[0]!.payload,
      currentPrice: { ...price('11'), perUnit: 'tonne' },
    });
    expect(() =>
      prepareFixedBasketCpi({
        ...input,
        categoryFacts: [wrongUnit, ...input.categoryFacts.slice(1)],
      }),
    ).toThrow();
    const zeroFacts = input.categoryFacts.map((item) =>
      refact(item, { ...item.payload, basePrice: price('0') }),
    );
    expect(() =>
      prepareFixedBasketCpi({ ...input, categoryFacts: zeroFacts }),
    ).toThrow();
  });

  it('detects forged CPI facts and rewritten replay result', () => {
    const input = cpi();
    const result = prepareFixedBasketCpi(input);
    const forged = {
      ...input.categoryFacts[0]!,
      payload: {
        ...input.categoryFacts[0]!.payload,
        currentPrice: price('999'),
      },
    };
    expect(() =>
      prepareFixedBasketCpi({
        ...input,
        categoryFacts: [forged, ...input.categoryFacts.slice(1)],
      }),
    ).toThrow();
    expect(() =>
      assertFixedBasketCpiReplay(input, {
        ...result,
        headlineCostChange: money('999'),
      }),
    ).toThrow();
  });
});
