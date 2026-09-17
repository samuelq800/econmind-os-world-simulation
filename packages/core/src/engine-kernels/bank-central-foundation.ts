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
  decimal,
  kernelInvalid,
  maximum,
  money,
  nonNegative,
  positive,
  renderMoney,
  type ExactMoney,
  type WorldDecimalValue,
} from './common.js';

/**
 * E15 pure foundation. It verifies caller-owned immutable Banking and Central
 * Bank facts and produces exact calculation traces only. It never creates an
 * authoritative account, posting, command, Event, receipt, or durable state.
 */
export const BANK_CENTRAL_FOUNDATION_STATUS =
  'FOUNDATION_IMPLEMENTED_UNVERIFIED' as const;

export type V19FoundationModule =
  | 'V19_LOAN_ORIGINATION'
  | 'V19_LOAN_REPAYMENT'
  | 'V19_NPL_RECOGNITION'
  | 'V19_BANK_COMPLIANCE'
  | 'V19_REFINANCING'
  | 'V19_EMERGENCY_LIQUIDITY'
  | 'V19_OPEN_MARKET_OPERATION'
  | 'V19_MONETARY_AGGREGATES';

export type BankCentralFact<T> = FoundationFact<T>;
export type BankCentralTraceRequest = FoundationTraceRequest;

export interface CommercialBankLedgerSnapshot {
  readonly bankRef: string;
  readonly centralBankRef: string;
  readonly currency: string;
  readonly reservesAtCentralBank: ExactMoney;
  readonly settlementCash: ExactMoney;
  readonly loanAssets: ExactMoney;
  readonly governmentSecurities: ExactMoney;
  readonly otherAssets: ExactMoney;
  readonly demandDeposits: ExactMoney;
  readonly savingsDeposits: ExactMoney;
  readonly timeDeposits: ExactMoney;
  readonly wholesaleFunding: ExactMoney;
  readonly centralBankRefinancingBorrowing: ExactMoney;
  readonly centralBankEmergencyLiquidityBorrowing: ExactMoney;
  readonly otherLiabilities: ExactMoney;
  /** Equity is signed: losses may make it negative. */
  readonly equity: ExactMoney;
  /** Classification only; it is bounded by the existing loan asset. */
  readonly nonPerformingLoans: ExactMoney;
}

export interface CentralBankLedgerSnapshot {
  readonly centralBankRef: string;
  /** V19 models the constitutionally specified national aggregate sector. */
  readonly commercialBankRef: string;
  readonly currency: string;
  readonly governmentSecurities: ExactMoney;
  readonly regularRefinancingLoans: ExactMoney;
  readonly emergencyLiquidityLoans: ExactMoney;
  readonly otherAssets: ExactMoney;
  readonly currencyInCirculation: ExactMoney;
  readonly commercialBankReserves: ExactMoney;
  readonly treasuryDeposits: ExactMoney;
  readonly centralBankBills: ExactMoney;
  readonly otherLiabilities: ExactMoney;
  /** Equity is signed: losses may make it negative. */
  readonly equity: ExactMoney;
}

export interface ExactMoneyTransition {
  readonly traceRef: string;
  readonly inputRefs: readonly string[];
  readonly outputRef: string;
  readonly before: ExactMoney;
  readonly delta: ExactMoney;
  readonly after: ExactMoney;
}

export interface ExactMoneyDerivation {
  readonly derivationRef: string;
  readonly inputRefs: readonly string[];
  readonly value: ExactMoney;
}

export interface BankCentralFoundationReplayProof {
  readonly module: V19FoundationModule;
  readonly traceRef: string;
  readonly calculationVersion: string;
  readonly snapshot: FoundationSnapshotBinding;
  readonly snapshotAt: FoundationTraceRequest['snapshotAt'];
  readonly inputFacts: readonly FoundationFactBinding[];
  readonly inputFactRefs: readonly string[];
  readonly outputRef: string;
  readonly transitions: readonly ExactMoneyTransition[];
  readonly derivations: readonly ExactMoneyDerivation[];
  /** Canonical SHA-256 preimage for a future authoritative replay owner. */
  readonly hashInput: string;
}

export interface LoanOriginationFact {
  readonly bankRef: string;
  readonly loanRef: string;
  readonly borrowerRef: string;
  readonly principal: ExactMoney;
}

export interface LoanRepaymentFact {
  readonly bankRef: string;
  readonly loanRef: string;
  readonly borrowerRef: string;
  readonly principal: ExactMoney;
  /** Explicitly distinguishes money destruction from a settlement-asset transfer. */
  readonly mode: 'DEPOSIT_CANCELLATION' | 'SETTLEMENT_ASSET_TRANSFER';
}

export interface NplRecognitionFact {
  readonly bankRef: string;
  readonly loanRef: string;
  readonly classificationRef: string;
  readonly nplIncrease: ExactMoney;
}

/** All regulatory values are supplied facts; this module does not choose ratios. */
export interface BankComplianceFact {
  readonly bankRef: string;
  readonly reserveRequirementFactRef: string;
  readonly capitalRequirementFactRef: string;
  readonly requiredReserves: ExactMoney;
  readonly requiredCapital: ExactMoney;
}

/** Collateral eligibility and valuation are caller facts, not a haircut formula here. */
export interface EligibleCollateralFact {
  readonly centralBankRef: string;
  readonly bankRef: string;
  readonly facilityRef: string;
  readonly collateralRef: string;
  readonly eligibilityRuleRef: string;
  readonly eligibleValueAfterHaircut: ExactMoney;
  readonly remainingFacilityCapacity: ExactMoney;
}

export interface CentralBankDrawRequestFact {
  readonly centralBankRef: string;
  readonly bankRef: string;
  readonly facilityRef: string;
  readonly drawRef: string;
  readonly principal: ExactMoney;
}

export interface OpenMarketOperationFact {
  readonly centralBankRef: string;
  readonly bankRef: string;
  readonly operationRef: string;
  readonly securityRef: string;
  readonly direction:
    'BUY_GOVERNMENT_SECURITIES' | 'SELL_GOVERNMENT_SECURITIES';
  /** Exact caller-supplied settlement amount; no price or yield is derived. */
  readonly settlementAmount: ExactMoney;
}

export interface LoanOriginationResult {
  readonly foundationStatus: typeof BANK_CENTRAL_FOUNDATION_STATUS;
  readonly commercialBank: CommercialBankLedgerSnapshot;
  readonly loanAssetTrace: ExactMoneyTransition;
  readonly demandDepositTrace: ExactMoneyTransition;
  readonly replayProof: BankCentralFoundationReplayProof;
}

export interface LoanRepaymentResult {
  readonly foundationStatus: typeof BANK_CENTRAL_FOUNDATION_STATUS;
  readonly commercialBank: CommercialBankLedgerSnapshot;
  readonly loanAssetTrace: ExactMoneyTransition;
  readonly counterpartyTrace: ExactMoneyTransition;
  readonly replayProof: BankCentralFoundationReplayProof;
}

export interface NplRecognitionResult {
  readonly foundationStatus: typeof BANK_CENTRAL_FOUNDATION_STATUS;
  readonly commercialBank: CommercialBankLedgerSnapshot;
  readonly nplTrace: ExactMoneyTransition;
  readonly replayProof: BankCentralFoundationReplayProof;
}

export interface BankComplianceResult {
  readonly foundationStatus: typeof BANK_CENTRAL_FOUNDATION_STATUS;
  readonly reserveShortfall: ExactMoney;
  readonly capitalShortfall: ExactMoney;
  readonly liquidityShortfall: boolean;
  readonly capitalShortfallExists: boolean;
  readonly replayProof: BankCentralFoundationReplayProof;
}

export interface CentralBankToolResult {
  readonly foundationStatus: typeof BANK_CENTRAL_FOUNDATION_STATUS;
  readonly commercialBank: CommercialBankLedgerSnapshot;
  readonly centralBank: CentralBankLedgerSnapshot;
  readonly commercialBankTraces: readonly ExactMoneyTransition[];
  readonly centralBankTraces: readonly ExactMoneyTransition[];
  readonly replayProof: BankCentralFoundationReplayProof;
}

export interface MonetaryAggregates {
  readonly foundationStatus: typeof BANK_CENTRAL_FOUNDATION_STATUS;
  readonly currencyInCirculation: ExactMoney;
  readonly commercialBankReserves: ExactMoney;
  readonly monetaryBase: ExactMoney;
  readonly demandDeposits: ExactMoney;
  readonly savingsAndTimeDeposits: ExactMoney;
  readonly m1: ExactMoney;
  readonly m2: ExactMoney;
  readonly derivations: readonly ExactMoneyDerivation[];
  readonly replayProof: BankCentralFoundationReplayProof;
}

const STABLE_REFERENCE = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u;

function stableReference(value: string, label: string): string {
  if (!STABLE_REFERENCE.test(value)) {
    kernelInvalid(`${label} must be a stable reference`);
  }
  return value;
}

function stableReferences(
  values: readonly string[],
  label: string,
): readonly string[] {
  if (values.length === 0)
    kernelInvalid(`${label} requires an input reference`);
  const result = values.map((value, index) =>
    stableReference(value, `${label}[${index}]`),
  );
  if (new Set(result).size !== result.length) {
    kernelInvalid(`${label} must not repeat a reference`);
  }
  return Object.freeze(result);
}

function canonicalCurrency(value: string, label: string): string {
  return money({ amount: '0', currency: value }, label).currency;
}

function signedMoney(
  value: ExactMoney,
  currency: string,
  label: string,
): ExactMoney {
  const parsed = money(value, label);
  if (parsed.currency !== currency)
    kernelInvalid(`${label} currency must match`);
  return renderMoney(parsed.amount, currency);
}

function nonNegativeMoney(
  value: ExactMoney,
  currency: string,
  label: string,
): ExactMoney {
  const normalized = signedMoney(value, currency, label);
  nonNegative(normalized.amount, label);
  return normalized;
}

function positiveMoney(
  value: ExactMoney,
  currency: string,
  label: string,
): ExactMoney {
  const normalized = nonNegativeMoney(value, currency, label);
  positive(normalized.amount, label);
  return normalized;
}

function amount(value: ExactMoney, label: string): WorldDecimalValue {
  return money(value, label).amount;
}

function total(
  values: readonly ExactMoney[],
  label: string,
): WorldDecimalValue {
  return values.reduce(
    (sum, value, index) => sum.plus(amount(value, `${label}[${index}]`)),
    decimal('0', `${label} zero`),
  );
}

function withMoney(currency: string, value: WorldDecimalValue): ExactMoney {
  return renderMoney(value, currency);
}

function commercialBankSnapshot(
  input: CommercialBankLedgerSnapshot,
  label: string,
): CommercialBankLedgerSnapshot {
  const currency = canonicalCurrency(input.currency, `${label}.currency`);
  const bankRef = stableReference(input.bankRef, `${label}.bankRef`);
  const centralBankRef = stableReference(
    input.centralBankRef,
    `${label}.centralBankRef`,
  );
  const reservesAtCentralBank = nonNegativeMoney(
    input.reservesAtCentralBank,
    currency,
    `${label}.reservesAtCentralBank`,
  );
  const settlementCash = nonNegativeMoney(
    input.settlementCash,
    currency,
    `${label}.settlementCash`,
  );
  const loanAssets = nonNegativeMoney(
    input.loanAssets,
    currency,
    `${label}.loanAssets`,
  );
  const governmentSecurities = nonNegativeMoney(
    input.governmentSecurities,
    currency,
    `${label}.governmentSecurities`,
  );
  const otherAssets = nonNegativeMoney(
    input.otherAssets,
    currency,
    `${label}.otherAssets`,
  );
  const demandDeposits = nonNegativeMoney(
    input.demandDeposits,
    currency,
    `${label}.demandDeposits`,
  );
  const savingsDeposits = nonNegativeMoney(
    input.savingsDeposits,
    currency,
    `${label}.savingsDeposits`,
  );
  const timeDeposits = nonNegativeMoney(
    input.timeDeposits,
    currency,
    `${label}.timeDeposits`,
  );
  const wholesaleFunding = nonNegativeMoney(
    input.wholesaleFunding,
    currency,
    `${label}.wholesaleFunding`,
  );
  const centralBankRefinancingBorrowing = nonNegativeMoney(
    input.centralBankRefinancingBorrowing,
    currency,
    `${label}.centralBankRefinancingBorrowing`,
  );
  const centralBankEmergencyLiquidityBorrowing = nonNegativeMoney(
    input.centralBankEmergencyLiquidityBorrowing,
    currency,
    `${label}.centralBankEmergencyLiquidityBorrowing`,
  );
  const otherLiabilities = nonNegativeMoney(
    input.otherLiabilities,
    currency,
    `${label}.otherLiabilities`,
  );
  const equity = signedMoney(input.equity, currency, `${label}.equity`);
  const nonPerformingLoans = nonNegativeMoney(
    input.nonPerformingLoans,
    currency,
    `${label}.nonPerformingLoans`,
  );
  if (
    amount(nonPerformingLoans, 'npl').greaterThan(amount(loanAssets, 'loans'))
  ) {
    kernelInvalid(`${label}.nonPerformingLoans cannot exceed loanAssets`);
  }
  const assets = total(
    [
      reservesAtCentralBank,
      settlementCash,
      loanAssets,
      governmentSecurities,
      otherAssets,
    ],
    `${label}.assets`,
  );
  const liabilitiesAndEquity = total(
    [
      demandDeposits,
      savingsDeposits,
      timeDeposits,
      wholesaleFunding,
      centralBankRefinancingBorrowing,
      centralBankEmergencyLiquidityBorrowing,
      otherLiabilities,
      equity,
    ],
    `${label}.liabilitiesAndEquity`,
  );
  if (!assets.equals(liabilitiesAndEquity)) {
    kernelInvalid(`${label} must satisfy assets = liabilities + equity`);
  }
  return Object.freeze({
    bankRef,
    centralBankRef,
    currency,
    reservesAtCentralBank,
    settlementCash,
    loanAssets,
    governmentSecurities,
    otherAssets,
    demandDeposits,
    savingsDeposits,
    timeDeposits,
    wholesaleFunding,
    centralBankRefinancingBorrowing,
    centralBankEmergencyLiquidityBorrowing,
    otherLiabilities,
    equity,
    nonPerformingLoans,
  });
}

function centralBankSnapshot(
  input: CentralBankLedgerSnapshot,
  label: string,
): CentralBankLedgerSnapshot {
  const currency = canonicalCurrency(input.currency, `${label}.currency`);
  const centralBankRef = stableReference(
    input.centralBankRef,
    `${label}.centralBankRef`,
  );
  const commercialBankRef = stableReference(
    input.commercialBankRef,
    `${label}.commercialBankRef`,
  );
  const governmentSecurities = nonNegativeMoney(
    input.governmentSecurities,
    currency,
    `${label}.governmentSecurities`,
  );
  const regularRefinancingLoans = nonNegativeMoney(
    input.regularRefinancingLoans,
    currency,
    `${label}.regularRefinancingLoans`,
  );
  const emergencyLiquidityLoans = nonNegativeMoney(
    input.emergencyLiquidityLoans,
    currency,
    `${label}.emergencyLiquidityLoans`,
  );
  const otherAssets = nonNegativeMoney(
    input.otherAssets,
    currency,
    `${label}.otherAssets`,
  );
  const currencyInCirculation = nonNegativeMoney(
    input.currencyInCirculation,
    currency,
    `${label}.currencyInCirculation`,
  );
  const commercialBankReserves = nonNegativeMoney(
    input.commercialBankReserves,
    currency,
    `${label}.commercialBankReserves`,
  );
  const treasuryDeposits = nonNegativeMoney(
    input.treasuryDeposits,
    currency,
    `${label}.treasuryDeposits`,
  );
  const centralBankBills = nonNegativeMoney(
    input.centralBankBills,
    currency,
    `${label}.centralBankBills`,
  );
  const otherLiabilities = nonNegativeMoney(
    input.otherLiabilities,
    currency,
    `${label}.otherLiabilities`,
  );
  const equity = signedMoney(input.equity, currency, `${label}.equity`);
  const assets = total(
    [
      governmentSecurities,
      regularRefinancingLoans,
      emergencyLiquidityLoans,
      otherAssets,
    ],
    `${label}.assets`,
  );
  const liabilitiesAndEquity = total(
    [
      currencyInCirculation,
      commercialBankReserves,
      treasuryDeposits,
      centralBankBills,
      otherLiabilities,
      equity,
    ],
    `${label}.liabilitiesAndEquity`,
  );
  if (!assets.equals(liabilitiesAndEquity)) {
    kernelInvalid(`${label} must satisfy assets = liabilities + equity`);
  }
  return Object.freeze({
    centralBankRef,
    commercialBankRef,
    currency,
    governmentSecurities,
    regularRefinancingLoans,
    emergencyLiquidityLoans,
    otherAssets,
    currencyInCirculation,
    commercialBankReserves,
    treasuryDeposits,
    centralBankBills,
    otherLiabilities,
    equity,
  });
}

function transition(input: {
  readonly traceRef: string;
  readonly inputRefs: readonly string[];
  readonly outputRef: string;
  readonly before: ExactMoney;
  readonly delta: ExactMoney;
  readonly after: ExactMoney;
}): ExactMoneyTransition {
  const before = money(input.before, 'transition.before');
  const delta = money(input.delta, 'transition.delta');
  const after = money(input.after, 'transition.after');
  if (
    before.currency !== delta.currency ||
    before.currency !== after.currency ||
    !before.amount.plus(delta.amount).equals(after.amount)
  ) {
    kernelInvalid(
      'Money transition must conserve currency and before plus delta',
    );
  }
  return Object.freeze({
    traceRef: stableReference(input.traceRef, 'transition.traceRef'),
    inputRefs: stableReferences(input.inputRefs, 'transition.inputRefs'),
    outputRef: stableReference(input.outputRef, 'transition.outputRef'),
    before: renderMoney(before.amount, before.currency),
    delta: renderMoney(delta.amount, before.currency),
    after: renderMoney(after.amount, before.currency),
  });
}

function derivation(input: {
  readonly derivationRef: string;
  readonly inputRefs: readonly string[];
  readonly value: ExactMoney;
}): ExactMoneyDerivation {
  const value = money(input.value, 'derivation.value');
  return Object.freeze({
    derivationRef: stableReference(
      input.derivationRef,
      'derivation.derivationRef',
    ),
    inputRefs: stableReferences(input.inputRefs, 'derivation.inputRefs'),
    value: renderMoney(value.amount, value.currency),
  });
}

function factPayload<T>(
  trace: BankCentralTraceRequest,
  fact: BankCentralFact<T>,
  label: string,
): T {
  return foundationFactPayload(trace, fact, label);
}

function inputBindings(
  trace: BankCentralTraceRequest,
  facts: readonly BankCentralFact<unknown>[],
): readonly FoundationFactBinding[] {
  const bindings = facts.map((fact, index) =>
    foundationFactBinding(trace, fact, `inputFacts[${index}]`),
  );
  const refs = bindings.map((fact) => fact.factRef);
  if (refs.length === 0 || new Set(refs).size !== refs.length) {
    kernelInvalid('Foundation input facts must be non-empty and unique');
  }
  return Object.freeze(bindings);
}

function replayProof(input: {
  readonly module: V19FoundationModule;
  readonly trace: BankCentralTraceRequest;
  readonly facts: readonly BankCentralFact<unknown>[];
  readonly outputRef: string;
  readonly transitions?: readonly ExactMoneyTransition[];
  readonly derivations?: readonly ExactMoneyDerivation[];
}): BankCentralFoundationReplayProof {
  const bindings = inputBindings(input.trace, input.facts);
  const transitionRefs = (input.transitions ?? []).map((item) => item.traceRef);
  const derivationRefs = (input.derivations ?? []).map(
    (item) => item.derivationRef,
  );
  if (
    new Set(transitionRefs).size !== transitionRefs.length ||
    new Set(derivationRefs).size !== derivationRefs.length
  ) {
    kernelInvalid('Foundation replay traces must be unique');
  }
  const traceRef = stableReference(input.trace.traceRef, 'replay.traceRef');
  const calculationVersion = stableReference(
    input.trace.calculationVersion,
    'replay.calculationVersion',
  );
  const outputRef = stableReference(input.outputRef, 'replay.outputRef');
  return Object.freeze({
    module: input.module,
    traceRef,
    calculationVersion,
    snapshot: input.trace.snapshot,
    snapshotAt: input.trace.snapshotAt,
    inputFacts: bindings,
    inputFactRefs: Object.freeze(bindings.map((item) => item.factRef)),
    outputRef,
    transitions: Object.freeze([...(input.transitions ?? [])]),
    derivations: Object.freeze([...(input.derivations ?? [])]),
    hashInput: canonicalHashInput({
      module: input.module,
      traceRef,
      calculationVersion,
      snapshot: input.trace.snapshot,
      snapshotAt: input.trace.snapshotAt,
      inputFacts: bindings,
      outputRef,
      transitions: input.transitions ?? [],
      derivations: input.derivations ?? [],
    }),
  });
}

/** Rejects altered, stale, mixed-lineage, missing, or duplicate replay facts. */
export function assertBankCentralFoundationReplayEvidence(
  proof: BankCentralFoundationReplayProof,
  facts: readonly BankCentralFact<unknown>[],
): void {
  const trace: BankCentralTraceRequest = {
    traceRef: proof.traceRef,
    calculationVersion: proof.calculationVersion,
    snapshot: proof.snapshot,
    snapshotAt: proof.snapshotAt,
  };
  const replayed = inputBindings(trace, facts);
  if (
    canonicalSerialize(replayed) !== canonicalSerialize(proof.inputFacts) ||
    canonicalSerialize(replayed.map((item) => item.factRef)) !==
      canonicalSerialize(proof.inputFactRefs)
  ) {
    kernelInvalid('Replay evidence does not exactly equal the recorded proof');
  }
}

function commercialBankFact(
  trace: BankCentralTraceRequest,
  fact: BankCentralFact<CommercialBankLedgerSnapshot>,
  label: string,
): CommercialBankLedgerSnapshot {
  return commercialBankSnapshot(factPayload(trace, fact, label), label);
}

function centralBankFact(
  trace: BankCentralTraceRequest,
  fact: BankCentralFact<CentralBankLedgerSnapshot>,
  label: string,
): CentralBankLedgerSnapshot {
  return centralBankSnapshot(factPayload(trace, fact, label), label);
}

function ensureReserveReconciliation(
  bank: CommercialBankLedgerSnapshot,
  centralBank: CentralBankLedgerSnapshot,
): void {
  if (
    bank.bankRef !== centralBank.commercialBankRef ||
    bank.centralBankRef !== centralBank.centralBankRef ||
    bank.currency !== centralBank.currency ||
    !amount(bank.reservesAtCentralBank, 'bank reserves').equals(
      amount(centralBank.commercialBankReserves, 'central reserves'),
    )
  ) {
    kernelInvalid(
      'Commercial bank and Central Bank reserve facts do not reconcile',
    );
  }
}

function replaceCommercialBank(
  before: CommercialBankLedgerSnapshot,
  patch: Partial<CommercialBankLedgerSnapshot>,
): CommercialBankLedgerSnapshot {
  return commercialBankSnapshot(
    { ...before, ...patch },
    'commercialBank after',
  );
}

function replaceCentralBank(
  before: CentralBankLedgerSnapshot,
  patch: Partial<CentralBankLedgerSnapshot>,
): CentralBankLedgerSnapshot {
  return centralBankSnapshot({ ...before, ...patch }, 'centralBank after');
}

function requestPrincipal(
  value: ExactMoney,
  currency: string,
  label: string,
): ExactMoney {
  return positiveMoney(value, currency, label);
}

/** Loan creation always adds an equal loan asset and demand-deposit liability. */
export function calculateLoanOrigination(input: {
  readonly trace: BankCentralTraceRequest;
  readonly commercialBankFact: BankCentralFact<CommercialBankLedgerSnapshot>;
  readonly originationFact: BankCentralFact<LoanOriginationFact>;
  readonly outputRef: string;
}): LoanOriginationResult {
  const bank = commercialBankFact(
    input.trace,
    input.commercialBankFact,
    'commercialBank',
  );
  const request = factPayload(
    input.trace,
    input.originationFact,
    'origination',
  );
  if (
    stableReference(request.bankRef, 'origination.bankRef') !== bank.bankRef
  ) {
    kernelInvalid('Loan origination bankRef must match the bank ledger');
  }
  stableReference(request.loanRef, 'origination.loanRef');
  stableReference(request.borrowerRef, 'origination.borrowerRef');
  const principal = requestPrincipal(
    request.principal,
    bank.currency,
    'origination.principal',
  );
  const next = replaceCommercialBank(bank, {
    loanAssets: withMoney(
      bank.currency,
      amount(bank.loanAssets, 'loan assets').plus(
        amount(principal, 'principal'),
      ),
    ),
    demandDeposits: withMoney(
      bank.currency,
      amount(bank.demandDeposits, 'demand deposits').plus(
        amount(principal, 'principal'),
      ),
    ),
  });
  const refs = [
    input.commercialBankFact.factRef,
    input.originationFact.factRef,
  ];
  const loanAssetTrace = transition({
    traceRef: `${request.loanRef}.loan_asset.origination`,
    inputRefs: refs,
    outputRef: `${input.outputRef}.loan_asset`,
    before: bank.loanAssets,
    delta: principal,
    after: next.loanAssets,
  });
  const demandDepositTrace = transition({
    traceRef: `${request.loanRef}.demand_deposit.origination`,
    inputRefs: refs,
    outputRef: `${input.outputRef}.demand_deposit`,
    before: bank.demandDeposits,
    delta: principal,
    after: next.demandDeposits,
  });
  return Object.freeze({
    foundationStatus: BANK_CENTRAL_FOUNDATION_STATUS,
    commercialBank: next,
    loanAssetTrace,
    demandDepositTrace,
    replayProof: replayProof({
      module: 'V19_LOAN_ORIGINATION',
      trace: input.trace,
      facts: [input.commercialBankFact, input.originationFact],
      outputRef: input.outputRef,
      transitions: [loanAssetTrace, demandDepositTrace],
    }),
  });
}

/** Repayment is explicit: either paired deposit cancellation or asset transfer. */
export function calculateLoanRepayment(input: {
  readonly trace: BankCentralTraceRequest;
  readonly commercialBankFact: BankCentralFact<CommercialBankLedgerSnapshot>;
  readonly repaymentFact: BankCentralFact<LoanRepaymentFact>;
  readonly outputRef: string;
}): LoanRepaymentResult {
  const bank = commercialBankFact(
    input.trace,
    input.commercialBankFact,
    'commercialBank',
  );
  const request = factPayload(input.trace, input.repaymentFact, 'repayment');
  if (stableReference(request.bankRef, 'repayment.bankRef') !== bank.bankRef) {
    kernelInvalid('Loan repayment bankRef must match the bank ledger');
  }
  stableReference(request.loanRef, 'repayment.loanRef');
  stableReference(request.borrowerRef, 'repayment.borrowerRef');
  if (
    request.mode !== 'DEPOSIT_CANCELLATION' &&
    request.mode !== 'SETTLEMENT_ASSET_TRANSFER'
  ) {
    kernelInvalid('Loan repayment mode is invalid');
  }
  const principal = requestPrincipal(
    request.principal,
    bank.currency,
    'repayment.principal',
  );
  if (
    amount(principal, 'principal').greaterThan(
      amount(bank.loanAssets, 'loan assets'),
    )
  ) {
    kernelInvalid('Loan repayment cannot exceed outstanding loan assets');
  }
  if (
    request.mode === 'DEPOSIT_CANCELLATION' &&
    amount(principal, 'principal').greaterThan(
      amount(bank.demandDeposits, 'deposits'),
    )
  ) {
    kernelInvalid('Deposit-cancellation repayment has insufficient deposits');
  }
  const next =
    request.mode === 'DEPOSIT_CANCELLATION'
      ? replaceCommercialBank(bank, {
          loanAssets: withMoney(
            bank.currency,
            amount(bank.loanAssets, 'loan assets').minus(
              amount(principal, 'principal'),
            ),
          ),
          demandDeposits: withMoney(
            bank.currency,
            amount(bank.demandDeposits, 'deposits').minus(
              amount(principal, 'principal'),
            ),
          ),
        })
      : replaceCommercialBank(bank, {
          loanAssets: withMoney(
            bank.currency,
            amount(bank.loanAssets, 'loan assets').minus(
              amount(principal, 'principal'),
            ),
          ),
          settlementCash: withMoney(
            bank.currency,
            amount(bank.settlementCash, 'settlement cash').plus(
              amount(principal, 'principal'),
            ),
          ),
        });
  const refs = [input.commercialBankFact.factRef, input.repaymentFact.factRef];
  const loanAssetTrace = transition({
    traceRef: `${request.loanRef}.loan_asset.repayment`,
    inputRefs: refs,
    outputRef: `${input.outputRef}.loan_asset`,
    before: bank.loanAssets,
    delta: withMoney(bank.currency, amount(principal, 'principal').negated()),
    after: next.loanAssets,
  });
  const counterpartyTrace =
    request.mode === 'DEPOSIT_CANCELLATION'
      ? transition({
          traceRef: `${request.loanRef}.demand_deposit.repayment`,
          inputRefs: refs,
          outputRef: `${input.outputRef}.demand_deposit`,
          before: bank.demandDeposits,
          delta: withMoney(
            bank.currency,
            amount(principal, 'principal').negated(),
          ),
          after: next.demandDeposits,
        })
      : transition({
          traceRef: `${request.loanRef}.settlement_cash.repayment`,
          inputRefs: refs,
          outputRef: `${input.outputRef}.settlement_cash`,
          before: bank.settlementCash,
          delta: principal,
          after: next.settlementCash,
        });
  return Object.freeze({
    foundationStatus: BANK_CENTRAL_FOUNDATION_STATUS,
    commercialBank: next,
    loanAssetTrace,
    counterpartyTrace,
    replayProof: replayProof({
      module: 'V19_LOAN_REPAYMENT',
      trace: input.trace,
      facts: [input.commercialBankFact, input.repaymentFact],
      outputRef: input.outputRef,
      transitions: [loanAssetTrace, counterpartyTrace],
    }),
  });
}

/** NPL recognition is a bounded classification; it cannot create or erase loans. */
export function calculateNplRecognition(input: {
  readonly trace: BankCentralTraceRequest;
  readonly commercialBankFact: BankCentralFact<CommercialBankLedgerSnapshot>;
  readonly nplFact: BankCentralFact<NplRecognitionFact>;
  readonly outputRef: string;
}): NplRecognitionResult {
  const bank = commercialBankFact(
    input.trace,
    input.commercialBankFact,
    'commercialBank',
  );
  const request = factPayload(input.trace, input.nplFact, 'npl');
  if (stableReference(request.bankRef, 'npl.bankRef') !== bank.bankRef) {
    kernelInvalid('NPL recognition bankRef must match the bank ledger');
  }
  stableReference(request.loanRef, 'npl.loanRef');
  stableReference(request.classificationRef, 'npl.classificationRef');
  const increase = positiveMoney(
    request.nplIncrease,
    bank.currency,
    'npl.increase',
  );
  const after = amount(bank.nonPerformingLoans, 'npl').plus(
    amount(increase, 'npl increase'),
  );
  if (after.greaterThan(amount(bank.loanAssets, 'loan assets'))) {
    kernelInvalid('NPL recognition cannot exceed loan assets');
  }
  const next = replaceCommercialBank(bank, {
    nonPerformingLoans: withMoney(bank.currency, after),
  });
  const nplTrace = transition({
    traceRef: `${request.loanRef}.npl.recognition`,
    inputRefs: [input.commercialBankFact.factRef, input.nplFact.factRef],
    outputRef: `${input.outputRef}.npl`,
    before: bank.nonPerformingLoans,
    delta: increase,
    after: next.nonPerformingLoans,
  });
  return Object.freeze({
    foundationStatus: BANK_CENTRAL_FOUNDATION_STATUS,
    commercialBank: next,
    nplTrace,
    replayProof: replayProof({
      module: 'V19_NPL_RECOGNITION',
      trace: input.trace,
      facts: [input.commercialBankFact, input.nplFact],
      outputRef: input.outputRef,
      transitions: [nplTrace],
    }),
  });
}

/** Derives compliance from ledger facts and caller-supplied requirements only. */
export function deriveBankCompliance(input: {
  readonly trace: BankCentralTraceRequest;
  readonly commercialBankFact: BankCentralFact<CommercialBankLedgerSnapshot>;
  readonly complianceFact: BankCentralFact<BankComplianceFact>;
  readonly outputRef: string;
}): BankComplianceResult {
  const bank = commercialBankFact(
    input.trace,
    input.commercialBankFact,
    'commercialBank',
  );
  const compliance = factPayload(
    input.trace,
    input.complianceFact,
    'compliance',
  );
  if (
    stableReference(compliance.bankRef, 'compliance.bankRef') !== bank.bankRef
  ) {
    kernelInvalid('Compliance bankRef must match the bank ledger');
  }
  stableReference(
    compliance.reserveRequirementFactRef,
    'reserveRequirementFactRef',
  );
  stableReference(
    compliance.capitalRequirementFactRef,
    'capitalRequirementFactRef',
  );
  const requiredReserves = nonNegativeMoney(
    compliance.requiredReserves,
    bank.currency,
    'requiredReserves',
  );
  const requiredCapital = nonNegativeMoney(
    compliance.requiredCapital,
    bank.currency,
    'requiredCapital',
  );
  const reserveShortfall = withMoney(
    bank.currency,
    maximum(
      [
        amount(requiredReserves, 'required reserves').minus(
          amount(bank.reservesAtCentralBank, 'reserves'),
        ),
        decimal('0', 'zero'),
      ],
      'reserve shortfall',
    ),
  );
  const capitalShortfall = withMoney(
    bank.currency,
    maximum(
      [
        amount(requiredCapital, 'required capital').minus(
          amount(bank.equity, 'equity'),
        ),
        decimal('0', 'zero'),
      ],
      'capital shortfall',
    ),
  );
  const derivations = [
    derivation({
      derivationRef: `${input.outputRef}.reserve_shortfall`,
      inputRefs: [
        input.commercialBankFact.factRef,
        input.complianceFact.factRef,
      ],
      value: reserveShortfall,
    }),
    derivation({
      derivationRef: `${input.outputRef}.capital_shortfall`,
      inputRefs: [
        input.commercialBankFact.factRef,
        input.complianceFact.factRef,
      ],
      value: capitalShortfall,
    }),
  ];
  return Object.freeze({
    foundationStatus: BANK_CENTRAL_FOUNDATION_STATUS,
    reserveShortfall,
    capitalShortfall,
    liquidityShortfall: !amount(reserveShortfall, 'reserve shortfall').isZero(),
    capitalShortfallExists: !amount(
      capitalShortfall,
      'capital shortfall',
    ).isZero(),
    replayProof: replayProof({
      module: 'V19_BANK_COMPLIANCE',
      trace: input.trace,
      facts: [input.commercialBankFact, input.complianceFact],
      outputRef: input.outputRef,
      derivations,
    }),
  });
}

function collateral(
  trace: BankCentralTraceRequest,
  fact: BankCentralFact<EligibleCollateralFact>,
  bank: CommercialBankLedgerSnapshot,
  central: CentralBankLedgerSnapshot,
  label: string,
): EligibleCollateralFact {
  const value = factPayload(trace, fact, label);
  if (
    stableReference(value.centralBankRef, `${label}.centralBankRef`) !==
      central.centralBankRef ||
    stableReference(value.bankRef, `${label}.bankRef`) !== bank.bankRef
  ) {
    kernelInvalid(
      `${label} must bind the supplied commercial and Central Bank facts`,
    );
  }
  stableReference(value.facilityRef, `${label}.facilityRef`);
  stableReference(value.collateralRef, `${label}.collateralRef`);
  stableReference(value.eligibilityRuleRef, `${label}.eligibilityRuleRef`);
  return Object.freeze({
    ...value,
    eligibleValueAfterHaircut: nonNegativeMoney(
      value.eligibleValueAfterHaircut,
      bank.currency,
      `${label}.eligibleValueAfterHaircut`,
    ),
    remainingFacilityCapacity: nonNegativeMoney(
      value.remainingFacilityCapacity,
      bank.currency,
      `${label}.remainingFacilityCapacity`,
    ),
  });
}

function drawRequest(
  trace: BankCentralTraceRequest,
  fact: BankCentralFact<CentralBankDrawRequestFact>,
  bank: CommercialBankLedgerSnapshot,
  central: CentralBankLedgerSnapshot,
  expectedFacilityRef: string,
  label: string,
): CentralBankDrawRequestFact {
  const value = factPayload(trace, fact, label);
  if (
    stableReference(value.centralBankRef, `${label}.centralBankRef`) !==
      central.centralBankRef ||
    stableReference(value.bankRef, `${label}.bankRef`) !== bank.bankRef ||
    stableReference(value.facilityRef, `${label}.facilityRef`) !==
      expectedFacilityRef
  ) {
    kernelInvalid(
      `${label} does not bind the requested facility and ledger owners`,
    );
  }
  return Object.freeze({
    ...value,
    drawRef: stableReference(value.drawRef, `${label}.drawRef`),
    principal: positiveMoney(
      value.principal,
      bank.currency,
      `${label}.principal`,
    ),
  });
}

function ensureEligibleDraw(
  request: CentralBankDrawRequestFact,
  collateralFact: EligibleCollateralFact,
): void {
  const principal = amount(request.principal, 'draw principal');
  if (
    principal.greaterThan(
      amount(collateralFact.eligibleValueAfterHaircut, 'eligible collateral'),
    ) ||
    principal.greaterThan(
      amount(collateralFact.remainingFacilityCapacity, 'facility capacity'),
    )
  ) {
    kernelInvalid(
      'Central Bank draw exceeds eligible collateral or facility capacity',
    );
  }
}

/** Regular refinancing posts matched Central Bank loan/reserve and bank borrowing/reserve facts. */
export function calculateRegularRefinancingDraw(input: {
  readonly trace: BankCentralTraceRequest;
  readonly commercialBankFact: BankCentralFact<CommercialBankLedgerSnapshot>;
  readonly centralBankFact: BankCentralFact<CentralBankLedgerSnapshot>;
  readonly collateralFact: BankCentralFact<EligibleCollateralFact>;
  readonly drawFact: BankCentralFact<CentralBankDrawRequestFact>;
  readonly outputRef: string;
}): CentralBankToolResult {
  const bank = commercialBankFact(
    input.trace,
    input.commercialBankFact,
    'commercialBank',
  );
  const central = centralBankFact(
    input.trace,
    input.centralBankFact,
    'centralBank',
  );
  ensureReserveReconciliation(bank, central);
  const collateralFact = collateral(
    input.trace,
    input.collateralFact,
    bank,
    central,
    'collateral',
  );
  const request = drawRequest(
    input.trace,
    input.drawFact,
    bank,
    central,
    collateralFact.facilityRef,
    'refinancing draw',
  );
  ensureEligibleDraw(request, collateralFact);
  const principal = request.principal;
  const nextBank = replaceCommercialBank(bank, {
    reservesAtCentralBank: withMoney(
      bank.currency,
      amount(bank.reservesAtCentralBank, 'bank reserves').plus(
        amount(principal, 'principal'),
      ),
    ),
    centralBankRefinancingBorrowing: withMoney(
      bank.currency,
      amount(bank.centralBankRefinancingBorrowing, 'bank refinancing').plus(
        amount(principal, 'principal'),
      ),
    ),
  });
  const nextCentral = replaceCentralBank(central, {
    regularRefinancingLoans: withMoney(
      central.currency,
      amount(central.regularRefinancingLoans, 'cb refinancing loans').plus(
        amount(principal, 'principal'),
      ),
    ),
    commercialBankReserves: withMoney(
      central.currency,
      amount(central.commercialBankReserves, 'cb reserves').plus(
        amount(principal, 'principal'),
      ),
    ),
  });
  ensureReserveReconciliation(nextBank, nextCentral);
  const refs = [
    input.commercialBankFact.factRef,
    input.centralBankFact.factRef,
    input.collateralFact.factRef,
    input.drawFact.factRef,
  ];
  const commercialBankTraces = [
    transition({
      traceRef: `${request.drawRef}.bank_reserves`,
      inputRefs: refs,
      outputRef: `${input.outputRef}.bank_reserves`,
      before: bank.reservesAtCentralBank,
      delta: principal,
      after: nextBank.reservesAtCentralBank,
    }),
    transition({
      traceRef: `${request.drawRef}.bank_refinancing`,
      inputRefs: refs,
      outputRef: `${input.outputRef}.bank_refinancing`,
      before: bank.centralBankRefinancingBorrowing,
      delta: principal,
      after: nextBank.centralBankRefinancingBorrowing,
    }),
  ];
  const centralBankTraces = [
    transition({
      traceRef: `${request.drawRef}.cb_refinancing_loan`,
      inputRefs: refs,
      outputRef: `${input.outputRef}.cb_refinancing_loan`,
      before: central.regularRefinancingLoans,
      delta: principal,
      after: nextCentral.regularRefinancingLoans,
    }),
    transition({
      traceRef: `${request.drawRef}.cb_bank_reserves`,
      inputRefs: refs,
      outputRef: `${input.outputRef}.cb_bank_reserves`,
      before: central.commercialBankReserves,
      delta: principal,
      after: nextCentral.commercialBankReserves,
    }),
  ];
  return Object.freeze({
    foundationStatus: BANK_CENTRAL_FOUNDATION_STATUS,
    commercialBank: nextBank,
    centralBank: nextCentral,
    commercialBankTraces: Object.freeze(commercialBankTraces),
    centralBankTraces: Object.freeze(centralBankTraces),
    replayProof: replayProof({
      module: 'V19_REFINANCING',
      trace: input.trace,
      facts: [
        input.commercialBankFact,
        input.centralBankFact,
        input.collateralFact,
        input.drawFact,
      ],
      outputRef: input.outputRef,
      transitions: [...commercialBankTraces, ...centralBankTraces],
    }),
  });
}

/** ELA is liquidity-only: capital shortfall or negative equity rejects the draw. */
export function calculateEmergencyLiquidityAssistance(input: {
  readonly trace: BankCentralTraceRequest;
  readonly commercialBankFact: BankCentralFact<CommercialBankLedgerSnapshot>;
  readonly centralBankFact: BankCentralFact<CentralBankLedgerSnapshot>;
  readonly complianceFact: BankCentralFact<BankComplianceFact>;
  readonly collateralFact: BankCentralFact<EligibleCollateralFact>;
  readonly drawFact: BankCentralFact<CentralBankDrawRequestFact>;
  readonly outputRef: string;
}): CentralBankToolResult {
  const bank = commercialBankFact(
    input.trace,
    input.commercialBankFact,
    'commercialBank',
  );
  const central = centralBankFact(
    input.trace,
    input.centralBankFact,
    'centralBank',
  );
  ensureReserveReconciliation(bank, central);
  const compliance = deriveBankCompliance({
    trace: input.trace,
    commercialBankFact: input.commercialBankFact,
    complianceFact: input.complianceFact,
    outputRef: `${input.outputRef}.compliance`,
  });
  if (!compliance.liquidityShortfall) {
    kernelInvalid('ELA requires a positive liquidity shortfall');
  }
  if (
    compliance.capitalShortfallExists ||
    amount(bank.equity, 'bank equity').isNegative()
  ) {
    kernelInvalid('ELA cannot repair a capital shortfall or negative equity');
  }
  const collateralFact = collateral(
    input.trace,
    input.collateralFact,
    bank,
    central,
    'ela collateral',
  );
  const request = drawRequest(
    input.trace,
    input.drawFact,
    bank,
    central,
    collateralFact.facilityRef,
    'ela draw',
  );
  ensureEligibleDraw(request, collateralFact);
  const principal = request.principal;
  if (
    amount(principal, 'ela principal').greaterThan(
      amount(compliance.reserveShortfall, 'reserve shortfall'),
    )
  ) {
    kernelInvalid(
      'ELA principal cannot exceed the explicit liquidity shortfall',
    );
  }
  const nextBank = replaceCommercialBank(bank, {
    reservesAtCentralBank: withMoney(
      bank.currency,
      amount(bank.reservesAtCentralBank, 'bank reserves').plus(
        amount(principal, 'principal'),
      ),
    ),
    centralBankEmergencyLiquidityBorrowing: withMoney(
      bank.currency,
      amount(
        bank.centralBankEmergencyLiquidityBorrowing,
        'bank ela borrowing',
      ).plus(amount(principal, 'principal')),
    ),
  });
  const nextCentral = replaceCentralBank(central, {
    emergencyLiquidityLoans: withMoney(
      central.currency,
      amount(central.emergencyLiquidityLoans, 'cb ela loans').plus(
        amount(principal, 'principal'),
      ),
    ),
    commercialBankReserves: withMoney(
      central.currency,
      amount(central.commercialBankReserves, 'cb reserves').plus(
        amount(principal, 'principal'),
      ),
    ),
  });
  ensureReserveReconciliation(nextBank, nextCentral);
  const refs = [
    input.commercialBankFact.factRef,
    input.centralBankFact.factRef,
    input.complianceFact.factRef,
    input.collateralFact.factRef,
    input.drawFact.factRef,
  ];
  const commercialBankTraces = [
    transition({
      traceRef: `${request.drawRef}.bank_reserves`,
      inputRefs: refs,
      outputRef: `${input.outputRef}.bank_reserves`,
      before: bank.reservesAtCentralBank,
      delta: principal,
      after: nextBank.reservesAtCentralBank,
    }),
    transition({
      traceRef: `${request.drawRef}.bank_ela_borrowing`,
      inputRefs: refs,
      outputRef: `${input.outputRef}.bank_ela_borrowing`,
      before: bank.centralBankEmergencyLiquidityBorrowing,
      delta: principal,
      after: nextBank.centralBankEmergencyLiquidityBorrowing,
    }),
  ];
  const centralBankTraces = [
    transition({
      traceRef: `${request.drawRef}.cb_ela_loan`,
      inputRefs: refs,
      outputRef: `${input.outputRef}.cb_ela_loan`,
      before: central.emergencyLiquidityLoans,
      delta: principal,
      after: nextCentral.emergencyLiquidityLoans,
    }),
    transition({
      traceRef: `${request.drawRef}.cb_bank_reserves`,
      inputRefs: refs,
      outputRef: `${input.outputRef}.cb_bank_reserves`,
      before: central.commercialBankReserves,
      delta: principal,
      after: nextCentral.commercialBankReserves,
    }),
  ];
  return Object.freeze({
    foundationStatus: BANK_CENTRAL_FOUNDATION_STATUS,
    commercialBank: nextBank,
    centralBank: nextCentral,
    commercialBankTraces: Object.freeze(commercialBankTraces),
    centralBankTraces: Object.freeze(centralBankTraces),
    replayProof: replayProof({
      module: 'V19_EMERGENCY_LIQUIDITY',
      trace: input.trace,
      facts: [
        input.commercialBankFact,
        input.centralBankFact,
        input.complianceFact,
        input.collateralFact,
        input.drawFact,
      ],
      outputRef: input.outputRef,
      transitions: [...commercialBankTraces, ...centralBankTraces],
    }),
  });
}

/** OMO transfers the same exact security and reserve amount across both balance sheets. */
export function calculateOpenMarketOperation(input: {
  readonly trace: BankCentralTraceRequest;
  readonly commercialBankFact: BankCentralFact<CommercialBankLedgerSnapshot>;
  readonly centralBankFact: BankCentralFact<CentralBankLedgerSnapshot>;
  readonly operationFact: BankCentralFact<OpenMarketOperationFact>;
  readonly outputRef: string;
}): CentralBankToolResult {
  const bank = commercialBankFact(
    input.trace,
    input.commercialBankFact,
    'commercialBank',
  );
  const central = centralBankFact(
    input.trace,
    input.centralBankFact,
    'centralBank',
  );
  ensureReserveReconciliation(bank, central);
  const operation = factPayload(
    input.trace,
    input.operationFact,
    'omo operation',
  );
  if (
    stableReference(operation.centralBankRef, 'omo.centralBankRef') !==
      central.centralBankRef ||
    stableReference(operation.bankRef, 'omo.bankRef') !== bank.bankRef
  ) {
    kernelInvalid('OMO operation must bind the supplied ledger owners');
  }
  stableReference(operation.operationRef, 'omo.operationRef');
  stableReference(operation.securityRef, 'omo.securityRef');
  if (
    operation.direction !== 'BUY_GOVERNMENT_SECURITIES' &&
    operation.direction !== 'SELL_GOVERNMENT_SECURITIES'
  ) {
    kernelInvalid('OMO direction is invalid');
  }
  const value = positiveMoney(
    operation.settlementAmount,
    bank.currency,
    'omo.settlementAmount',
  );
  const buying = operation.direction === 'BUY_GOVERNMENT_SECURITIES';
  const sellerSecurities = buying
    ? bank.governmentSecurities
    : central.governmentSecurities;
  const payerReserves = buying ? null : bank.reservesAtCentralBank;
  if (
    amount(value, 'omo value').greaterThan(
      amount(sellerSecurities, 'seller securities'),
    )
  ) {
    kernelInvalid('OMO seller has insufficient government securities');
  }
  if (
    payerReserves !== null &&
    amount(value, 'omo value').greaterThan(
      amount(payerReserves, 'bank reserves'),
    )
  ) {
    kernelInvalid('OMO sale would make commercial bank reserves negative');
  }
  const signed = buying
    ? amount(value, 'omo value')
    : amount(value, 'omo value').negated();
  const nextBank = replaceCommercialBank(bank, {
    governmentSecurities: withMoney(
      bank.currency,
      amount(bank.governmentSecurities, 'bank securities').minus(signed),
    ),
    reservesAtCentralBank: withMoney(
      bank.currency,
      amount(bank.reservesAtCentralBank, 'bank reserves').plus(signed),
    ),
  });
  const nextCentral = replaceCentralBank(central, {
    governmentSecurities: withMoney(
      central.currency,
      amount(central.governmentSecurities, 'cb securities').plus(signed),
    ),
    commercialBankReserves: withMoney(
      central.currency,
      amount(central.commercialBankReserves, 'cb reserves').plus(signed),
    ),
  });
  ensureReserveReconciliation(nextBank, nextCentral);
  const refs = [
    input.commercialBankFact.factRef,
    input.centralBankFact.factRef,
    input.operationFact.factRef,
  ];
  const bankSecurityDelta = withMoney(bank.currency, signed.negated());
  const bankReserveDelta = withMoney(bank.currency, signed);
  const centralSecurityDelta = withMoney(central.currency, signed);
  const centralReserveDelta = withMoney(central.currency, signed);
  const commercialBankTraces = [
    transition({
      traceRef: `${operation.operationRef}.bank_securities`,
      inputRefs: refs,
      outputRef: `${input.outputRef}.bank_securities`,
      before: bank.governmentSecurities,
      delta: bankSecurityDelta,
      after: nextBank.governmentSecurities,
    }),
    transition({
      traceRef: `${operation.operationRef}.bank_reserves`,
      inputRefs: refs,
      outputRef: `${input.outputRef}.bank_reserves`,
      before: bank.reservesAtCentralBank,
      delta: bankReserveDelta,
      after: nextBank.reservesAtCentralBank,
    }),
  ];
  const centralBankTraces = [
    transition({
      traceRef: `${operation.operationRef}.cb_securities`,
      inputRefs: refs,
      outputRef: `${input.outputRef}.cb_securities`,
      before: central.governmentSecurities,
      delta: centralSecurityDelta,
      after: nextCentral.governmentSecurities,
    }),
    transition({
      traceRef: `${operation.operationRef}.cb_bank_reserves`,
      inputRefs: refs,
      outputRef: `${input.outputRef}.cb_bank_reserves`,
      before: central.commercialBankReserves,
      delta: centralReserveDelta,
      after: nextCentral.commercialBankReserves,
    }),
  ];
  return Object.freeze({
    foundationStatus: BANK_CENTRAL_FOUNDATION_STATUS,
    commercialBank: nextBank,
    centralBank: nextCentral,
    commercialBankTraces: Object.freeze(commercialBankTraces),
    centralBankTraces: Object.freeze(centralBankTraces),
    replayProof: replayProof({
      module: 'V19_OPEN_MARKET_OPERATION',
      trace: input.trace,
      facts: [
        input.commercialBankFact,
        input.centralBankFact,
        input.operationFact,
      ],
      outputRef: input.outputRef,
      transitions: [...commercialBankTraces, ...centralBankTraces],
    }),
  });
}

/** M1/M2 are read-only derivations from ledger facts, never supplied aggregate state. */
export function deriveMonetaryAggregates(input: {
  readonly trace: BankCentralTraceRequest;
  readonly commercialBankFact: BankCentralFact<CommercialBankLedgerSnapshot>;
  readonly centralBankFact: BankCentralFact<CentralBankLedgerSnapshot>;
  readonly outputRef: string;
}): MonetaryAggregates {
  const bank = commercialBankFact(
    input.trace,
    input.commercialBankFact,
    'commercialBank',
  );
  const central = centralBankFact(
    input.trace,
    input.centralBankFact,
    'centralBank',
  );
  ensureReserveReconciliation(bank, central);
  const currency = bank.currency;
  const demandDeposits = bank.demandDeposits;
  const savingsAndTimeDeposits = withMoney(
    currency,
    amount(bank.savingsDeposits, 'savings deposits').plus(
      amount(bank.timeDeposits, 'time deposits'),
    ),
  );
  const monetaryBase = withMoney(
    currency,
    amount(central.currencyInCirculation, 'currency in circulation').plus(
      amount(central.commercialBankReserves, 'bank reserves'),
    ),
  );
  const m1 = withMoney(
    currency,
    amount(central.currencyInCirculation, 'currency in circulation').plus(
      amount(demandDeposits, 'demand deposits'),
    ),
  );
  const m2 = withMoney(
    currency,
    amount(m1, 'm1').plus(
      amount(savingsAndTimeDeposits, 'savings time deposits'),
    ),
  );
  const refs = [
    input.commercialBankFact.factRef,
    input.centralBankFact.factRef,
  ];
  const derivations = [
    derivation({
      derivationRef: `${input.outputRef}.monetary_base`,
      inputRefs: refs,
      value: monetaryBase,
    }),
    derivation({
      derivationRef: `${input.outputRef}.m1`,
      inputRefs: refs,
      value: m1,
    }),
    derivation({
      derivationRef: `${input.outputRef}.m2`,
      inputRefs: refs,
      value: m2,
    }),
  ];
  return Object.freeze({
    foundationStatus: BANK_CENTRAL_FOUNDATION_STATUS,
    currencyInCirculation: central.currencyInCirculation,
    commercialBankReserves: central.commercialBankReserves,
    monetaryBase,
    demandDeposits,
    savingsAndTimeDeposits,
    m1,
    m2,
    derivations: Object.freeze(derivations),
    replayProof: replayProof({
      module: 'V19_MONETARY_AGGREGATES',
      trace: input.trace,
      facts: [input.commercialBankFact, input.centralBankFact],
      outputRef: input.outputRef,
      derivations,
    }),
  });
}
