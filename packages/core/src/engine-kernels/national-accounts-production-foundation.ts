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
  type FoundationSnapshotBinding,
  type FoundationTraceRequest,
} from './foundation-provenance.js';
import {
  kernelInvalid,
  money,
  nonNegativeQuantity,
  renderMoney,
  type ExactMoney,
  type ExactQuantity,
  type WorldDecimalValue,
} from './common.js';

/** Preparation only: V23.1 cannot own a product GDP state before its gates. */
export const NATIONAL_ACCOUNTS_PRODUCTION_STATUS = 'PREPARATION_ONLY' as const;

export interface NationalAccountsBasis {
  readonly countryRef: string;
  readonly periodRef: string;
  readonly startInclusive: ExactQuantity;
  readonly endExclusive: ExactQuantity;
  readonly currency: string;
  readonly accountingVersionRef: string;
}

export interface PeriodCompletenessStatement {
  readonly kind: 'PERIOD_SOURCES_COMPLETE';
  readonly basis: NationalAccountsBasis;
  readonly closureReceiptRef: string;
  readonly sectorFactRefs: readonly string[];
  readonly productTaxFactRefs: readonly string[];
  readonly productSubsidyFactRefs: readonly string[];
}

export interface SectorProductionStatement {
  readonly kind: 'SETTLED_REAL_PRODUCTION';
  readonly basis: NationalAccountsBasis;
  readonly sectorRef: string;
  readonly grossOutputValue: ExactMoney;
  readonly intermediateConsumptionValue: ExactMoney;
  readonly grossOutputReceiptRef: string;
  readonly intermediateConsumptionReceiptRef: string;
}

export interface ProductFiscalStatement {
  readonly kind: 'SETTLED_PRODUCT_TAX' | 'SETTLED_PRODUCT_SUBSIDY';
  readonly basis: NationalAccountsBasis;
  readonly amount: ExactMoney;
  readonly receiptRef: string;
}

export interface SectorValueAddedLine {
  readonly sectorRef: string;
  readonly grossOutputValue: ExactMoney;
  readonly intermediateConsumptionValue: ExactMoney;
  readonly valueAdded: ExactMoney;
  readonly sourceFactRef: string;
  readonly grossOutputReceiptRef: string;
  readonly intermediateConsumptionReceiptRef: string;
}

export interface ProductFiscalLine {
  readonly amount: ExactMoney;
  readonly sourceFactRef: string;
  readonly receiptRef: string;
}

export interface NationalAccountsProductionProof {
  readonly module: 'V23_1_PRODUCTION_GDP';
  readonly traceRef: string;
  readonly calculationVersion: string;
  readonly snapshot: FoundationSnapshotBinding;
  readonly snapshotAt: ExactQuantity;
  readonly basis: NationalAccountsBasis;
  readonly inputFacts: readonly FoundationFactBinding[];
  readonly canonicalOutput: string;
  /** Canonical SHA-256 preimage, not a persisted digest or writer receipt. */
  readonly hashInput: string;
}

export interface NationalAccountsProductionInput {
  readonly trace: FoundationTraceRequest;
  readonly completenessFact: FoundationFact<PeriodCompletenessStatement>;
  readonly sectorFacts: readonly FoundationFact<SectorProductionStatement>[];
  readonly productTaxFacts: readonly FoundationFact<ProductFiscalStatement>[];
  readonly productSubsidyFacts: readonly FoundationFact<ProductFiscalStatement>[];
}

export interface NationalAccountsProductionResult {
  readonly status: typeof NATIONAL_ACCOUNTS_PRODUCTION_STATUS;
  readonly basis: NationalAccountsBasis;
  readonly sectorValueAdded: readonly SectorValueAddedLine[];
  readonly productTaxes: readonly ProductFiscalLine[];
  readonly productSubsidies: readonly ProductFiscalLine[];
  readonly totalSectorValueAdded: ExactMoney;
  readonly totalProductTaxes: ExactMoney;
  readonly totalProductSubsidies: ExactMoney;
  /** Only production GDP is the primary candidate value. */
  readonly productionGdp: ExactMoney;
  readonly proof: NationalAccountsProductionProof;
}

export type ExpenditureCategory = 'C' | 'I' | 'G' | 'X' | 'M';

export interface ExpenditureComponent {
  readonly category: ExpenditureCategory;
  readonly amount: ExactMoney;
  readonly receiptRef: string;
  readonly realization: 'FINAL_USE_SETTLED' | 'DELIVERED_OWNERSHIP_TRANSFER';
}

export interface ExpenditureStatement {
  readonly kind: 'SETTLED_EXPENDITURE_RECONCILIATION';
  readonly basis: NationalAccountsBasis;
  readonly components: readonly ExpenditureComponent[];
}

export interface NationalAccountsReconciliationResult {
  readonly status: 'RECONCILED';
  readonly basis: NationalAccountsBasis;
  readonly productionGdp: ExactMoney;
  readonly expenditureGdp: ExactMoney;
  readonly difference: ExactMoney;
  readonly expenditureFactRef: string;
  readonly componentReceipts: readonly string[];
  readonly hashInput: string;
}

export class NationalAccountsReconciliationError extends Error {
  readonly code = 'NATIONAL_ACCOUNTS_RECONCILIATION_ERROR';
  constructor(
    readonly productionGdp: ExactMoney,
    readonly expenditureGdp: ExactMoney,
    readonly difference: ExactMoney,
  ) {
    super(
      `Production GDP ${productionGdp.amount} ${productionGdp.currency} differs from expenditure GDP ${expenditureGdp.amount} ${expenditureGdp.currency} by ${difference.amount}; neither value was overwritten or averaged`,
    );
    this.name = 'NationalAccountsReconciliationError';
  }
}

const STABLE_REFERENCE = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u;
const CATEGORIES: readonly ExpenditureCategory[] = ['C', 'I', 'G', 'X', 'M'];

function reference(value: string, label: string): string {
  if (!STABLE_REFERENCE.test(value))
    kernelInvalid(`${label} must be a stable reference`);
  return value;
}

function tick(value: ExactQuantity, label: string): WorldDecimalValue {
  const amount = nonNegativeQuantity(value, 'sim_millisecond', label).amount;
  if (!amount.isInteger())
    kernelInvalid(`${label} must be an integer simulation tick`);
  return amount;
}

function checkedBasis(value: NationalAccountsBasis): NationalAccountsBasis {
  const start = tick(value.startInclusive, 'period start');
  const end = tick(value.endExclusive, 'period end');
  if (!end.greaterThan(start))
    kernelInvalid('National accounts period must be non-empty');
  if (!/^[A-Z]{3}$/u.test(value.currency))
    kernelInvalid('National accounts currency must be canonical');
  return Object.freeze({
    countryRef: reference(value.countryRef, 'countryRef'),
    periodRef: reference(value.periodRef, 'periodRef'),
    startInclusive: Object.freeze({
      amount: start.toFixed(),
      unit: 'sim_millisecond',
    }),
    endExclusive: Object.freeze({
      amount: end.toFixed(),
      unit: 'sim_millisecond',
    }),
    currency: value.currency,
    accountingVersionRef: reference(
      value.accountingVersionRef,
      'accountingVersionRef',
    ),
  });
}

function sameBasis(
  expected: NationalAccountsBasis,
  actual: NationalAccountsBasis,
  label: string,
): void {
  if (
    canonicalSerialize(expected) !== canonicalSerialize(checkedBasis(actual))
  ) {
    kernelInvalid(
      `${label} country, period, currency or accounting version does not match`,
    );
  }
}

function nonNegativeMoney(
  value: ExactMoney,
  currency: string,
  label: string,
): WorldDecimalValue {
  const parsed = money(value, label);
  if (parsed.currency !== currency || parsed.amount.isNegative()) {
    kernelInvalid(`${label} must be non-negative ${currency}`);
  }
  return parsed.amount;
}

function factRefs(
  facts: readonly FoundationFact<unknown>[],
  label: string,
): readonly string[] {
  const refs = facts.map((fact) => reference(fact.factRef, label));
  if (new Set(refs).size !== refs.length)
    kernelInvalid(`${label} contains duplicate fact references`);
  return Object.freeze(refs.sort());
}

function declarationMatches(
  declared: readonly string[],
  actual: readonly string[],
  label: string,
): void {
  const values = declared.map((value) => reference(value, label));
  if (
    new Set(values).size !== values.length ||
    canonicalSerialize([...values].sort()) !== canonicalSerialize(actual)
  ) {
    kernelInvalid(`${label} does not match the closed source fact set`);
  }
}

function uniqueReceipt(
  receipt: string,
  used: Set<string>,
  label: string,
): string {
  const value = reference(receipt, label);
  if (used.has(value))
    kernelInvalid(`Duplicate national-accounts source receipt ${value}`);
  used.add(value);
  return value;
}

function sortedFacts<T>(
  facts: readonly FoundationFact<T>[],
): readonly FoundationFact<T>[] {
  return [...facts].sort((left, right) =>
    left.factRef.localeCompare(right.factRef),
  );
}

/** Pure candidate for the single production-approach GDP algorithm. */
export function prepareProductionGdp(
  input: NationalAccountsProductionInput,
): NationalAccountsProductionResult {
  const closure = foundationFactPayload(
    input.trace,
    input.completenessFact,
    'period completeness',
  );
  if (closure.kind !== 'PERIOD_SOURCES_COMPLETE')
    kernelInvalid('A complete period source statement is required');
  const basis = checkedBasis(closure.basis);
  if (
    tick(basis.endExclusive, 'period end').greaterThan(
      tick(input.trace.snapshotAt, 'snapshot tick'),
    )
  )
    kernelInvalid(
      'National accounts period cannot end after the source snapshot',
    );
  if (input.sectorFacts.length === 0)
    kernelInvalid(
      'Production GDP needs a non-empty declared sector source set',
    );
  declarationMatches(
    closure.sectorFactRefs,
    factRefs(input.sectorFacts, 'sector fact'),
    'sector declaration',
  );
  declarationMatches(
    closure.productTaxFactRefs,
    factRefs(input.productTaxFacts, 'tax fact'),
    'tax declaration',
  );
  declarationMatches(
    closure.productSubsidyFactRefs,
    factRefs(input.productSubsidyFacts, 'subsidy fact'),
    'subsidy declaration',
  );
  declarationMatches(
    input.completenessFact.predecessorFactRefs,
    [
      ...factRefs(input.sectorFacts, 'sector fact'),
      ...factRefs(input.productTaxFacts, 'tax fact'),
      ...factRefs(input.productSubsidyFacts, 'subsidy fact'),
    ].sort(),
    'closure predecessors',
  );
  const facts: readonly FoundationFact<unknown>[] = [
    input.completenessFact,
    ...sortedFacts(input.sectorFacts),
    ...sortedFacts(input.productTaxFacts),
    ...sortedFacts(input.productSubsidyFacts),
  ];
  const bindings = Object.freeze(
    facts.map((fact, index) =>
      foundationFactBinding(input.trace, fact, `production.fact[${index}]`),
    ),
  );
  if (new Set(bindings.map((fact) => fact.factRef)).size !== bindings.length)
    kernelInvalid('Production facts overlap across source classes');
  reference(closure.closureReceiptRef, 'closure receipt');
  const grossReceipts = new Set<string>();
  const intermediateReceipts = new Set<string>();
  const taxReceipts = new Set<string>();
  const subsidyReceipts = new Set<string>();
  const sectors = sortedFacts(input.sectorFacts)
    .map((fact) => {
      const payload = foundationFactPayload(
        input.trace,
        fact,
        'sector production',
      );
      if (payload.kind !== 'SETTLED_REAL_PRODUCTION')
        kernelInvalid(
          'Only settled real production can enter sector value added',
        );
      sameBasis(basis, payload.basis, 'sector production');
      const gross = nonNegativeMoney(
        payload.grossOutputValue,
        basis.currency,
        'gross output',
      );
      const intermediate = nonNegativeMoney(
        payload.intermediateConsumptionValue,
        basis.currency,
        'intermediate consumption',
      );
      return Object.freeze({
        sectorRef: reference(payload.sectorRef, 'sectorRef'),
        grossOutputValue: renderMoney(gross, basis.currency),
        intermediateConsumptionValue: renderMoney(intermediate, basis.currency),
        valueAdded: renderMoney(
          assertWorldDecimalResult(gross.minus(intermediate)),
          basis.currency,
        ),
        sourceFactRef: fact.factRef,
        grossOutputReceiptRef: uniqueReceipt(
          payload.grossOutputReceiptRef,
          grossReceipts,
          'gross output receipt',
        ),
        intermediateConsumptionReceiptRef: uniqueReceipt(
          payload.intermediateConsumptionReceiptRef,
          intermediateReceipts,
          'intermediate consumption receipt',
        ),
      });
    })
    .sort((left, right) => left.sectorRef.localeCompare(right.sectorRef));
  if (new Set(sectors.map((row) => row.sectorRef)).size !== sectors.length)
    kernelInvalid('Sector value added must have one row per sector');
  const fiscal = (
    factsToCheck: readonly FoundationFact<ProductFiscalStatement>[],
    expected: ProductFiscalStatement['kind'],
    usedReceipts: Set<string>,
  ): readonly ProductFiscalLine[] =>
    Object.freeze(
      sortedFacts(factsToCheck).map((fact) => {
        const payload = foundationFactPayload(input.trace, fact, expected);
        if (payload.kind !== expected)
          kernelInvalid(`Expected ${expected} receipt`);
        sameBasis(basis, payload.basis, expected);
        return Object.freeze({
          amount: renderMoney(
            nonNegativeMoney(payload.amount, basis.currency, expected),
            basis.currency,
          ),
          sourceFactRef: fact.factRef,
          receiptRef: uniqueReceipt(payload.receiptRef, usedReceipts, expected),
        });
      }),
    );
  const taxes = fiscal(
    input.productTaxFacts,
    'SETTLED_PRODUCT_TAX',
    taxReceipts,
  );
  const subsidies = fiscal(
    input.productSubsidyFacts,
    'SETTLED_PRODUCT_SUBSIDY',
    subsidyReceipts,
  );
  const sum = (amounts: readonly ExactMoney[]): WorldDecimalValue =>
    amounts.reduce(
      (total, item) =>
        assertWorldDecimalResult(total.plus(money(item, 'sum').amount)),
      nonNegativeMoney(
        { amount: '0', currency: basis.currency },
        basis.currency,
        'zero',
      ),
    );
  const valueAddedTotal = sum(sectors.map((row) => row.valueAdded));
  const taxTotal = sum(taxes.map((row) => row.amount));
  const subsidyTotal = sum(subsidies.map((row) => row.amount));
  const output = Object.freeze({
    basis,
    sectorValueAdded: Object.freeze(sectors),
    productTaxes: taxes,
    productSubsidies: subsidies,
    totalSectorValueAdded: renderMoney(valueAddedTotal, basis.currency),
    totalProductTaxes: renderMoney(taxTotal, basis.currency),
    totalProductSubsidies: renderMoney(subsidyTotal, basis.currency),
    productionGdp: renderMoney(
      assertWorldDecimalResult(
        valueAddedTotal.plus(taxTotal).minus(subsidyTotal),
      ),
      basis.currency,
    ),
  });
  const proofBody = Object.freeze({
    module: 'V23_1_PRODUCTION_GDP' as const,
    traceRef: reference(input.trace.traceRef, 'traceRef'),
    calculationVersion: reference(
      input.trace.calculationVersion,
      'calculationVersion',
    ),
    snapshot: bindings[0]!.snapshot,
    snapshotAt: bindings[0]!.observedAt,
    basis,
    inputFacts: bindings,
    canonicalOutput: canonicalSerialize(output),
  });
  return Object.freeze({
    status: NATIONAL_ACCOUNTS_PRODUCTION_STATUS,
    ...output,
    proof: Object.freeze({
      ...proofBody,
      hashInput: canonicalHashInput(proofBody),
    }),
  });
}

/** Recompute from supplied facts; a serialized proof alone is never authority. */
export function assertProductionGdpReplay(
  input: NationalAccountsProductionInput,
  expected: NationalAccountsProductionProof,
): void {
  const actual = prepareProductionGdp(input).proof;
  if (canonicalSerialize(actual) !== canonicalSerialize(expected))
    kernelInvalid(
      'Production GDP replay evidence does not match supplied facts',
    );
}

/** V23.2 will own persisted reconciliation; this only compares supplied facts. */
export function compareExpenditureGdp(
  input: NationalAccountsProductionInput & {
    readonly expenditureFact: FoundationFact<ExpenditureStatement>;
  },
): NationalAccountsReconciliationResult {
  const production = prepareProductionGdp(input);
  const expenditure = foundationFactPayload(
    input.trace,
    input.expenditureFact,
    'expenditure',
  );
  if (expenditure.kind !== 'SETTLED_EXPENDITURE_RECONCILIATION')
    kernelInvalid(
      'Expenditure reconciliation requires settled aggregate evidence',
    );
  sameBasis(production.basis, expenditure.basis, 'expenditure');
  const binding = foundationFactBinding(
    input.trace,
    input.expenditureFact,
    'expenditure',
  );
  if (
    production.proof.inputFacts.some((fact) => fact.factRef === binding.factRef)
  )
    kernelInvalid('Expenditure fact must differ from production facts');
  if (expenditure.components.length !== CATEGORIES.length)
    kernelInvalid('Expenditure reconciliation requires C, I, G, X and M');
  const components = new Map<ExpenditureCategory, WorldDecimalValue>();
  for (const component of expenditure.components) {
    if (
      !CATEGORIES.includes(component.category) ||
      components.has(component.category)
    )
      kernelInvalid('Expenditure categories must each appear exactly once');
    const expectedRealization =
      component.category === 'X' || component.category === 'M'
        ? 'DELIVERED_OWNERSHIP_TRANSFER'
        : 'FINAL_USE_SETTLED';
    if (component.realization !== expectedRealization)
      kernelInvalid(
        'Expenditure flow has not reached the required final-use or delivery boundary',
      );
    components.set(
      component.category,
      nonNegativeMoney(
        component.amount,
        production.basis.currency,
        component.category,
      ),
    );
    reference(component.receiptRef, 'expenditure receipt');
  }
  if (CATEGORIES.some((category) => !components.has(category)))
    kernelInvalid('Expenditure reconciliation has a missing category');
  const amount = assertWorldDecimalResult(
    components
      .get('C')!
      .plus(components.get('I')!)
      .plus(components.get('G')!)
      .plus(components.get('X')!)
      .minus(components.get('M')!),
  );
  const expenditureGdp = renderMoney(amount, production.basis.currency);
  const difference = renderMoney(
    assertWorldDecimalResult(
      money(production.productionGdp, 'production GDP').amount.minus(amount),
    ),
    production.basis.currency,
  );
  if (!money(difference, 'GDP difference').amount.isZero())
    throw new NationalAccountsReconciliationError(
      production.productionGdp,
      expenditureGdp,
      difference,
    );
  const body = Object.freeze({
    status: 'RECONCILED' as const,
    basis: production.basis,
    productionGdp: production.productionGdp,
    expenditureGdp,
    difference,
    expenditureFactRef: binding.factRef,
    componentReceipts: Object.freeze(
      CATEGORIES.map(
        (category) =>
          expenditure.components.find((item) => item.category === category)!
            .receiptRef,
      ),
    ),
  });
  return Object.freeze({
    ...body,
    hashInput: canonicalHashInput({
      productionProof: production.proof,
      expenditureBinding: binding,
      output: body,
    }),
  });
}
