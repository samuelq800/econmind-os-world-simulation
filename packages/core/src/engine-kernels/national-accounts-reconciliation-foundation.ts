import { assertWorldDecimalResult } from '../numeric/world-decimal.js';
import {
  canonicalHashInput,
  canonicalSerialize,
} from '../serialization/canonical.js';

import {
  foundationFactBinding,
  foundationFactPayload,
  type FoundationFact,
  type FoundationFactBinding,
  type FoundationTraceRequest,
} from './foundation-provenance.js';
import {
  kernelInvalid,
  money,
  nonNegative,
  nonNegativeQuantity,
  quantity,
  render,
  renderMoney,
  type ExactMoney,
  type ExactQuantity,
  type ExactUnitPrice,
  type WorldDecimalValue,
} from './common.js';
import {
  compareExpenditureGdp,
  type ExpenditureCategory,
  type ExpenditureStatement,
  type NationalAccountsBasis,
  type NationalAccountsProductionInput,
  type NationalAccountsReconciliationResult,
} from './national-accounts-production-foundation.js';

/** V23.2 contract calculations only; no authoritative account publication. */
export const NATIONAL_ACCOUNTS_RECONCILIATION_STATUS =
  'PREPARATION_ONLY' as const;

export type ExpenditureSourceKind =
  | 'FINAL_HOUSEHOLD_CONSUMPTION_SETTLED'
  | 'REAL_CAPITAL_FORMATION_SETTLED'
  | 'PUBLIC_SERVICE_CONSUMPTION_SETTLED'
  | 'DELIVERED_EXPORT_OWNERSHIP_TRANSFER'
  | 'DELIVERED_IMPORT_OWNERSHIP_TRANSFER';

export interface ExpenditureEligibilityLine {
  readonly category: ExpenditureCategory;
  readonly amount: ExactMoney;
  readonly receiptRef: string;
  readonly sourceKind: ExpenditureSourceKind;
}

export interface ExpenditureEligibilityStatement {
  readonly kind: 'COMPLETE_FINAL_EXPENDITURE_ELIGIBILITY';
  readonly basis: NationalAccountsBasis;
  readonly lines: readonly ExpenditureEligibilityLine[];
}

export interface ExternalFlowStatement {
  readonly kind: 'SETTLED_PRIMARY_INCOME' | 'SETTLED_SECONDARY_TRANSFER';
  readonly direction: 'INFLOW' | 'OUTFLOW';
  readonly basis: NationalAccountsBasis;
  readonly amount: ExactMoney;
  readonly receiptRef: string;
}

export interface ExternalFlowClosureStatement {
  readonly kind: 'COMPLETE_EXTERNAL_INCOME_AND_TRANSFER_FLOWS';
  readonly basis: NationalAccountsBasis;
  readonly closureReceiptRef: string;
  readonly flowFactRefs: readonly string[];
}

export interface CurrentAccountLine {
  readonly sourceFactRef: string;
  readonly receiptRef: string;
  readonly kind: ExternalFlowStatement['kind'];
  readonly direction: ExternalFlowStatement['direction'];
  readonly amount: ExactMoney;
}

export interface CurrentAccountResult {
  readonly status: typeof NATIONAL_ACCOUNTS_RECONCILIATION_STATUS;
  readonly basis: NationalAccountsBasis;
  readonly expenditureReconciliation: NationalAccountsReconciliationResult;
  readonly tradeBalance: ExactMoney;
  readonly netPrimaryIncome: ExactMoney;
  readonly netSecondaryTransfers: ExactMoney;
  readonly currentAccount: ExactMoney;
  readonly externalFlows: readonly CurrentAccountLine[];
  readonly inputFacts: readonly FoundationFactBinding[];
  readonly hashInput: string;
}

export interface CurrentAccountInput extends NationalAccountsProductionInput {
  readonly expenditureFact: FoundationFact<ExpenditureStatement>;
  readonly eligibilityFact: FoundationFact<ExpenditureEligibilityStatement>;
  readonly externalClosureFact: FoundationFact<ExternalFlowClosureStatement>;
  readonly externalFlowFacts: readonly FoundationFact<ExternalFlowStatement>[];
}

export type CpiCategory =
  'FOOD' | 'ENERGY' | 'HOUSING' | 'GENERAL_GOODS' | 'SERVICES';

export interface FixedBasketPriceStatement {
  readonly kind: 'FIXED_BASKET_OBSERVED_PRICES';
  readonly basis: NationalAccountsBasis;
  readonly basketVersionRef: string;
  readonly previousPeriodRef: string;
  readonly category: CpiCategory;
  readonly fixedQuantity: ExactQuantity;
  readonly basePrice: ExactUnitPrice;
  readonly previousPrice: ExactUnitPrice;
  readonly currentPrice: ExactUnitPrice;
  readonly basketReceiptRef: string;
  readonly basePriceReceiptRef: string;
  readonly previousPriceReceiptRef: string;
  readonly currentPriceReceiptRef: string;
}

export interface FixedBasketClosureStatement {
  readonly kind: 'COMPLETE_FIXED_BASKET';
  readonly basis: NationalAccountsBasis;
  readonly basketVersionRef: string;
  readonly previousPeriodRef: string;
  readonly closureReceiptRef: string;
  readonly categoryFactRefs: readonly string[];
}

export interface ExactFraction {
  /** Numerator and denominator share the same monetary unit. No rounding. */
  readonly numerator: string;
  readonly denominator: string;
}

export interface CpiContributionLine {
  readonly category: CpiCategory;
  readonly sourceFactRef: string;
  readonly basketReceiptRef: string;
  readonly basePriceReceiptRef: string;
  readonly previousPriceReceiptRef: string;
  readonly currentPriceReceiptRef: string;
  readonly baseCost: ExactMoney;
  readonly previousCost: ExactMoney;
  readonly currentCost: ExactMoney;
  readonly costChange: ExactMoney;
  readonly contributionToHeadlineInflation: ExactFraction;
}

export interface FixedBasketCpiResult {
  readonly status: typeof NATIONAL_ACCOUNTS_RECONCILIATION_STATUS;
  readonly basis: NationalAccountsBasis;
  readonly basketVersionRef: string;
  readonly previousPeriodRef: string;
  readonly contributions: readonly CpiContributionLine[];
  readonly baseBasketCost: ExactMoney;
  readonly previousBasketCost: ExactMoney;
  readonly currentBasketCost: ExactMoney;
  readonly headlineCostChange: ExactMoney;
  readonly previousCpiIndexTimes100: ExactFraction;
  readonly currentCpiIndexTimes100: ExactFraction;
  readonly headlineInflation: ExactFraction;
  readonly inputFacts: readonly FoundationFactBinding[];
  readonly hashInput: string;
}

export interface FixedBasketCpiInput {
  readonly trace: FoundationTraceRequest;
  readonly closureFact: FoundationFact<FixedBasketClosureStatement>;
  readonly categoryFacts: readonly FoundationFact<FixedBasketPriceStatement>[];
}

const REF = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u;
const EXPENDITURE_CATEGORIES: readonly ExpenditureCategory[] = [
  'C',
  'I',
  'G',
  'X',
  'M',
];
const CPI_CATEGORIES: readonly CpiCategory[] = [
  'FOOD',
  'ENERGY',
  'HOUSING',
  'GENERAL_GOODS',
  'SERVICES',
];
const ELIGIBLE_SOURCE: Record<ExpenditureCategory, ExpenditureSourceKind> = {
  C: 'FINAL_HOUSEHOLD_CONSUMPTION_SETTLED',
  I: 'REAL_CAPITAL_FORMATION_SETTLED',
  G: 'PUBLIC_SERVICE_CONSUMPTION_SETTLED',
  X: 'DELIVERED_EXPORT_OWNERSHIP_TRANSFER',
  M: 'DELIVERED_IMPORT_OWNERSHIP_TRANSFER',
};

function ref(value: string, label: string): string {
  if (!REF.test(value)) kernelInvalid(`${label} must be a stable reference`);
  return value;
}

function tick(value: ExactQuantity, label: string): WorldDecimalValue {
  const parsed = nonNegativeQuantity(value, 'sim_millisecond', label).amount;
  if (!parsed.isInteger())
    kernelInvalid(`${label} must be an integer simulation tick`);
  return parsed;
}

function basisForTrace(
  trace: FoundationTraceRequest,
  value: NationalAccountsBasis,
): NationalAccountsBasis {
  const start = tick(value.startInclusive, 'period start');
  const end = tick(value.endExclusive, 'period end');
  if (
    !end.greaterThan(start) ||
    end.greaterThan(tick(trace.snapshotAt, 'snapshot tick'))
  )
    kernelInvalid('Period must be non-empty and closed by the snapshot');
  if (!/^[A-Z]{3}$/u.test(value.currency))
    kernelInvalid('National accounts currency must be canonical');
  return Object.freeze({
    countryRef: ref(value.countryRef, 'countryRef'),
    periodRef: ref(value.periodRef, 'periodRef'),
    startInclusive: Object.freeze({
      amount: start.toFixed(),
      unit: 'sim_millisecond',
    }),
    endExclusive: Object.freeze({
      amount: end.toFixed(),
      unit: 'sim_millisecond',
    }),
    currency: value.currency,
    accountingVersionRef: ref(
      value.accountingVersionRef,
      'accountingVersionRef',
    ),
  });
}

function sameBasis(
  trace: FoundationTraceRequest,
  expected: NationalAccountsBasis,
  actual: NationalAccountsBasis,
  label: string,
): void {
  if (
    canonicalSerialize(expected) !==
    canonicalSerialize(basisForTrace(trace, actual))
  )
    kernelInvalid(`${label} country, period, currency or version mismatch`);
}

function nonNegativeMoney(
  value: ExactMoney,
  currency: string,
  label: string,
): WorldDecimalValue {
  const parsed = money(value, label);
  if (parsed.currency !== currency || parsed.amount.isNegative())
    kernelInvalid(`${label} must be non-negative ${currency}`);
  return parsed.amount;
}

function factSet<T>(
  facts: readonly FoundationFact<T>[],
): readonly FoundationFact<T>[] {
  return [...facts].sort((left, right) =>
    left.factRef.localeCompare(right.factRef),
  );
}

function exactRefs(
  declared: readonly string[],
  actual: readonly string[],
  label: string,
): void {
  const normalized = declared.map((value) => ref(value, label));
  if (
    new Set(normalized).size !== normalized.length ||
    canonicalSerialize([...normalized].sort()) !==
      canonicalSerialize([...actual].sort())
  )
    kernelInvalid(`${label} does not match the complete source set`);
}

function bindings(
  trace: FoundationTraceRequest,
  facts: readonly FoundationFact<unknown>[],
): readonly FoundationFactBinding[] {
  const result = facts.map((fact, index) =>
    foundationFactBinding(trace, fact, `V23.2.fact[${index}]`),
  );
  if (new Set(result.map((fact) => fact.factRef)).size !== result.length)
    kernelInvalid('V23.2 input fact references must be unique');
  return Object.freeze(result);
}

/** C+I+G+X-M reuses V23.1; BOP adds income and transfers only afterward. */
export function prepareExpenditureCurrentAccount(
  input: CurrentAccountInput,
): CurrentAccountResult {
  const reconciliation = compareExpenditureGdp(input);
  const basis = basisForTrace(input.trace, reconciliation.basis);
  const expenditure = foundationFactPayload(
    input.trace,
    input.expenditureFact,
    'expenditure',
  );
  const eligibility = foundationFactPayload(
    input.trace,
    input.eligibilityFact,
    'eligibility',
  );
  if (eligibility.kind !== 'COMPLETE_FINAL_EXPENDITURE_ELIGIBILITY')
    kernelInvalid('Final expenditure eligibility must be complete');
  sameBasis(input.trace, basis, eligibility.basis, 'eligibility');
  if (
    !input.eligibilityFact.predecessorFactRefs.includes(
      input.expenditureFact.factRef,
    )
  )
    kernelInvalid('Eligibility must descend from the expenditure fact');
  if (eligibility.lines.length !== EXPENDITURE_CATEGORIES.length)
    kernelInvalid('Eligibility must cover exactly C, I, G, X and M');
  const seen = new Set<ExpenditureCategory>();
  for (const line of eligibility.lines) {
    if (
      !EXPENDITURE_CATEGORIES.includes(line.category) ||
      seen.has(line.category)
    )
      kernelInvalid('Eligibility categories must be unique and complete');
    seen.add(line.category);
    if (line.sourceKind !== ELIGIBLE_SOURCE[line.category])
      kernelInvalid(
        'Transfer, intermediate input, approval, commissioning, contract or shipment is not final GDP expenditure',
      );
    const expenditureLine = expenditure.components.find(
      (item) => item.category === line.category,
    );
    if (
      !expenditureLine ||
      expenditureLine.receiptRef !==
        ref(line.receiptRef, 'eligibility receipt') ||
      !nonNegativeMoney(
        line.amount,
        basis.currency,
        'eligible expenditure',
      ).equals(
        nonNegativeMoney(expenditureLine.amount, basis.currency, 'expenditure'),
      )
    )
      kernelInvalid('Eligibility must bind exact category amount and receipt');
  }
  const closure = foundationFactPayload(
    input.trace,
    input.externalClosureFact,
    'external-flow closure',
  );
  if (closure.kind !== 'COMPLETE_EXTERNAL_INCOME_AND_TRANSFER_FLOWS')
    kernelInvalid('External-flow completeness evidence is required');
  sameBasis(input.trace, basis, closure.basis, 'external-flow closure');
  ref(closure.closureReceiptRef, 'external-flow closure receipt');
  const ordered = factSet(input.externalFlowFacts);
  const flowRefs = ordered.map((fact) =>
    ref(fact.factRef, 'external flow fact'),
  );
  exactRefs(closure.flowFactRefs, flowRefs, 'external-flow declaration');
  exactRefs(
    input.externalClosureFact.predecessorFactRefs,
    [input.expenditureFact.factRef, ...flowRefs],
    'external-flow closure predecessors',
  );
  const allBindings = bindings(input.trace, [
    input.expenditureFact,
    input.eligibilityFact,
    input.externalClosureFact,
    ...ordered,
  ]);
  const productionRefs = new Set([
    input.completenessFact.factRef,
    ...input.sectorFacts.map((fact) => fact.factRef),
    ...input.productTaxFacts.map((fact) => fact.factRef),
    ...input.productSubsidyFacts.map((fact) => fact.factRef),
  ]);
  if (allBindings.some((fact) => productionRefs.has(fact.factRef)))
    kernelInvalid(
      'V23.2 source facts must not reuse production fact references',
    );
  const usedReceipts = new Set<string>();
  const flows = ordered.map((fact) => {
    const payload = foundationFactPayload(input.trace, fact, 'external flow');
    if (
      payload.kind !== 'SETTLED_PRIMARY_INCOME' &&
      payload.kind !== 'SETTLED_SECONDARY_TRANSFER'
    )
      kernelInvalid(
        'Only settled primary income or secondary transfer enters current account',
      );
    if (payload.direction !== 'INFLOW' && payload.direction !== 'OUTFLOW')
      kernelInvalid('External flow direction must be explicit');
    sameBasis(input.trace, basis, payload.basis, 'external flow');
    const receiptRef = ref(payload.receiptRef, 'external-flow receipt');
    if (usedReceipts.has(receiptRef))
      kernelInvalid('External-flow receipt counted twice');
    usedReceipts.add(receiptRef);
    return Object.freeze({
      sourceFactRef: fact.factRef,
      receiptRef,
      kind: payload.kind,
      direction: payload.direction,
      amount: renderMoney(
        nonNegativeMoney(payload.amount, basis.currency, 'external flow'),
        basis.currency,
      ),
    });
  });
  const sumNet = (kind: ExternalFlowStatement['kind']): WorldDecimalValue =>
    flows
      .filter((flow) => flow.kind === kind)
      .reduce(
        (total, flow) =>
          assertWorldDecimalResult(
            flow.direction === 'INFLOW'
              ? total.plus(money(flow.amount, 'inflow').amount)
              : total.minus(money(flow.amount, 'outflow').amount),
          ),
        nonNegative('0', 'zero'),
      );
  const x = nonNegativeMoney(
    expenditure.components.find((item) => item.category === 'X')!.amount,
    basis.currency,
    'exports',
  );
  const m = nonNegativeMoney(
    expenditure.components.find((item) => item.category === 'M')!.amount,
    basis.currency,
    'imports',
  );
  const trade = assertWorldDecimalResult(x.minus(m));
  const primary = sumNet('SETTLED_PRIMARY_INCOME');
  const secondary = sumNet('SETTLED_SECONDARY_TRANSFER');
  const output = Object.freeze({
    status: NATIONAL_ACCOUNTS_RECONCILIATION_STATUS,
    basis,
    expenditureReconciliation: reconciliation,
    tradeBalance: renderMoney(trade, basis.currency),
    netPrimaryIncome: renderMoney(primary, basis.currency),
    netSecondaryTransfers: renderMoney(secondary, basis.currency),
    currentAccount: renderMoney(
      assertWorldDecimalResult(trade.plus(primary).plus(secondary)),
      basis.currency,
    ),
    externalFlows: Object.freeze(flows),
    inputFacts: allBindings,
  });
  return Object.freeze({ ...output, hashInput: canonicalHashInput(output) });
}

export function assertCurrentAccountReplay(
  input: CurrentAccountInput,
  expected: CurrentAccountResult,
): void {
  if (
    canonicalSerialize(prepareExpenditureCurrentAccount(input)) !==
    canonicalSerialize(expected)
  )
    kernelInvalid('Current-account replay does not match supplied facts');
}

function observedPriceCost(
  price: ExactUnitPrice,
  fixedQuantity: ExactQuantity,
  currency: string,
  label: string,
): WorldDecimalValue {
  const units = quantity(fixedQuantity, `${label} fixed quantity`);
  if (!units.amount.greaterThan(0))
    kernelInvalid('Fixed basket quantities must be positive');
  if (price.currency !== currency || price.perUnit !== units.unit)
    kernelInvalid(`${label} price currency or physical unit mismatch`);
  const priceAmount = nonNegative(price.amount, `${label} price`);
  return assertWorldDecimalResult(units.amount.times(priceAmount));
}

function fraction(
  numerator: WorldDecimalValue,
  denominator: WorldDecimalValue,
): ExactFraction {
  if (!denominator.greaterThan(0))
    kernelInvalid('CPI ratio denominator must be positive');
  return Object.freeze({
    numerator: render(assertWorldDecimalResult(numerator)),
    denominator: render(assertWorldDecimalResult(denominator)),
  });
}

/** Fixed-basket CPI and exactly additive accounting contributions, no rounding. */
export function prepareFixedBasketCpi(
  input: FixedBasketCpiInput,
): FixedBasketCpiResult {
  const closure = foundationFactPayload(
    input.trace,
    input.closureFact,
    'CPI closure',
  );
  if (closure.kind !== 'COMPLETE_FIXED_BASKET')
    kernelInvalid('CPI requires a complete fixed basket');
  const basis = basisForTrace(input.trace, closure.basis);
  const basketVersionRef = ref(closure.basketVersionRef, 'basketVersionRef');
  const previousPeriodRef = ref(closure.previousPeriodRef, 'previousPeriodRef');
  if (previousPeriodRef === basis.periodRef)
    kernelInvalid('CPI previous and current periods must differ');
  ref(closure.closureReceiptRef, 'CPI closure receipt');
  if (input.categoryFacts.length !== CPI_CATEGORIES.length)
    kernelInvalid('CPI requires exactly five fixed basket categories');
  const orderedFacts = factSet(input.categoryFacts);
  const categoryRefs = orderedFacts.map((fact) =>
    ref(fact.factRef, 'CPI category fact'),
  );
  exactRefs(closure.categoryFactRefs, categoryRefs, 'CPI category declaration');
  exactRefs(
    input.closureFact.predecessorFactRefs,
    categoryRefs,
    'CPI closure predecessors',
  );
  const allBindings = bindings(input.trace, [
    input.closureFact,
    ...orderedFacts,
  ]);
  const byCategory = new Map<
    CpiCategory,
    {
      readonly fact: FoundationFact<FixedBasketPriceStatement>;
      readonly payload: FixedBasketPriceStatement;
      readonly base: WorldDecimalValue;
      readonly previous: WorldDecimalValue;
      readonly current: WorldDecimalValue;
    }
  >();
  for (const fact of orderedFacts) {
    const payload = foundationFactPayload(input.trace, fact, 'CPI price');
    if (payload.kind !== 'FIXED_BASKET_OBSERVED_PRICES')
      kernelInvalid('CPI price facts must be observed fixed-basket prices');
    sameBasis(input.trace, basis, payload.basis, 'CPI price');
    if (
      payload.basketVersionRef !== basketVersionRef ||
      payload.previousPeriodRef !== previousPeriodRef
    )
      kernelInvalid('CPI basket or previous-period version mismatch');
    if (
      !CPI_CATEGORIES.includes(payload.category) ||
      byCategory.has(payload.category)
    )
      kernelInvalid('CPI categories must be unique and complete');
    for (const receipt of [
      payload.basketReceiptRef,
      payload.basePriceReceiptRef,
      payload.previousPriceReceiptRef,
      payload.currentPriceReceiptRef,
    ])
      ref(receipt, 'CPI source receipt');
    byCategory.set(payload.category, {
      fact,
      payload,
      base: observedPriceCost(
        payload.basePrice,
        payload.fixedQuantity,
        basis.currency,
        'base',
      ),
      previous: observedPriceCost(
        payload.previousPrice,
        payload.fixedQuantity,
        basis.currency,
        'previous',
      ),
      current: observedPriceCost(
        payload.currentPrice,
        payload.fixedQuantity,
        basis.currency,
        'current',
      ),
    });
  }
  if (CPI_CATEGORIES.some((category) => !byCategory.has(category)))
    kernelInvalid('CPI fixed basket category is missing');
  const total = (period: 'base' | 'previous' | 'current'): WorldDecimalValue =>
    CPI_CATEGORIES.reduce(
      (sum, category) =>
        assertWorldDecimalResult(sum.plus(byCategory.get(category)![period])),
      nonNegative('0', 'zero'),
    );
  const baseCost = total('base');
  const previousCost = total('previous');
  const currentCost = total('current');
  if (!baseCost.greaterThan(0) || !previousCost.greaterThan(0))
    kernelInvalid('CPI base and previous basket costs must be positive');
  const contributions = CPI_CATEGORIES.map((category) => {
    const item = byCategory.get(category)!;
    const delta = assertWorldDecimalResult(item.current.minus(item.previous));
    return Object.freeze({
      category,
      sourceFactRef: item.fact.factRef,
      basketReceiptRef: item.payload.basketReceiptRef,
      basePriceReceiptRef: item.payload.basePriceReceiptRef,
      previousPriceReceiptRef: item.payload.previousPriceReceiptRef,
      currentPriceReceiptRef: item.payload.currentPriceReceiptRef,
      baseCost: renderMoney(item.base, basis.currency),
      previousCost: renderMoney(item.previous, basis.currency),
      currentCost: renderMoney(item.current, basis.currency),
      costChange: renderMoney(delta, basis.currency),
      contributionToHeadlineInflation: fraction(delta, previousCost),
    });
  });
  const headlineDelta = assertWorldDecimalResult(
    currentCost.minus(previousCost),
  );
  const contributionsTotal = contributions.reduce(
    (sum, line) =>
      assertWorldDecimalResult(
        sum.plus(money(line.costChange, 'CPI contribution').amount),
      ),
    nonNegative('0', 'zero'),
  );
  if (!contributionsTotal.equals(headlineDelta))
    kernelInvalid('CPI contributions do not sum to headline change');
  const output = Object.freeze({
    status: NATIONAL_ACCOUNTS_RECONCILIATION_STATUS,
    basis,
    basketVersionRef,
    previousPeriodRef,
    contributions: Object.freeze(contributions),
    baseBasketCost: renderMoney(baseCost, basis.currency),
    previousBasketCost: renderMoney(previousCost, basis.currency),
    currentBasketCost: renderMoney(currentCost, basis.currency),
    headlineCostChange: renderMoney(headlineDelta, basis.currency),
    previousCpiIndexTimes100: fraction(
      assertWorldDecimalResult(previousCost.times(100)),
      baseCost,
    ),
    currentCpiIndexTimes100: fraction(
      assertWorldDecimalResult(currentCost.times(100)),
      baseCost,
    ),
    headlineInflation: fraction(headlineDelta, previousCost),
    inputFacts: allBindings,
  });
  return Object.freeze({ ...output, hashInput: canonicalHashInput(output) });
}

export function assertFixedBasketCpiReplay(
  input: FixedBasketCpiInput,
  expected: FixedBasketCpiResult,
): void {
  if (
    canonicalSerialize(prepareFixedBasketCpi(input)) !==
    canonicalSerialize(expected)
  )
    kernelInvalid('Fixed-basket CPI replay does not match supplied facts');
}
