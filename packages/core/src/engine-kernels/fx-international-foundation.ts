import {
  canonicalHashInput,
  canonicalSerialize,
} from '../serialization/canonical.js';
import {
  assertWorldDecimalResult,
  WorldDecimal,
} from '../numeric/world-decimal.js';

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
  nonNegative,
  nonNegativeQuantity,
  positive,
  render,
  renderMoney,
  renderQuantity,
  type ExactMoney,
  type ExactQuantity,
  type WorldDecimalValue,
} from './common.js';

/**
 * E17 pure foundation. Every economic choice arrives as an immutable,
 * provenance-bound caller fact. This file is calculation and replay evidence
 * only: it creates no authoritative account, posting, Command, Event,
 * receipt, World State, rate policy, or durable settlement registry.
 */
export const FX_INTERNATIONAL_FOUNDATION_STATUS =
  'FOUNDATION_IMPLEMENTED_UNVERIFIED' as const;

export const FX_GLOBAL_CURRENCY = 'GCU' as const;

export type FxFoundationModule =
  | 'V20_LC_GCU_RATE'
  | 'V20_PRIVATE_FX_SETTLEMENT'
  | 'V20_EXTERNAL_DEBT'
  | 'V20_OFFICIAL_INTERVENTION_STERILIZATION'
  | 'V20_HISTORICAL_CASH_SETTLEMENT'
  | 'V20_HISTORICAL_REVALUATION';

export type FxFoundationFact<T> = FoundationFact<T>;
export type FxFoundationTraceRequest = FoundationTraceRequest;

export type FxRoundingMode = 'HALF_EVEN' | 'HALF_UP' | 'DOWN' | 'UP';

/** An explicit caller decision; no implicit/default rounding exists in Core. */
export interface FxRoundingDecision {
  readonly roundingDecisionRef: string;
  readonly roundingVersion: string;
  /** Caller-supplied positive decimal quantum, for example `0.01`. */
  readonly quantum: string;
  readonly mode: FxRoundingMode;
  readonly valuationAt: ExactQuantity;
}

/** Exactly one LC to GCU quote is permitted for a country in one snapshot. */
export interface CountryFxRate {
  readonly rateRef: string;
  readonly rateVersion: string;
  readonly countryRef: string;
  readonly localCurrency: string;
  readonly globalCurrency: typeof FX_GLOBAL_CURRENCY;
  readonly globalPerLocalUnit: string;
  readonly valuationAt: ExactQuantity;
}

export interface FxConversionRequest {
  readonly conversionRef: string;
  readonly conversionVersion: string;
  readonly countryRef: string;
  readonly direction: 'LC_TO_GCU' | 'GCU_TO_LC';
  readonly amount: ExactMoney;
  readonly rateRef: string;
  readonly roundingDecisionRef: string;
  readonly valuationAt: ExactQuantity;
}

export interface FxMoneyTransition {
  readonly transitionRef: string;
  readonly inputRefs: readonly string[];
  readonly outputRef: string;
  readonly before: ExactMoney;
  readonly delta: ExactMoney;
  readonly after: ExactMoney;
}

export interface FxFoundationReplayProof {
  readonly module: FxFoundationModule;
  readonly traceRef: string;
  readonly calculationVersion: string;
  readonly snapshot: FoundationSnapshotBinding;
  readonly snapshotAt: ExactQuantity;
  readonly inputFactRefs: readonly string[];
  readonly inputFacts: readonly FoundationFactBinding[];
  readonly outputRef: string;
  readonly transitions: readonly FxMoneyTransition[];
  /** Canonical SHA-256 preimage for the later authoritative replay owner. */
  readonly hashInput: string;
}

export interface FxConversionResult {
  readonly foundationStatus: typeof FX_INTERNATIONAL_FOUNDATION_STATUS;
  readonly conversionRef: string;
  readonly countryRef: string;
  readonly sourceAmount: ExactMoney;
  readonly convertedAmount: ExactMoney;
  readonly unroundedAmount: string;
  readonly rateRef: string;
  readonly rateVersion: string;
  readonly roundingDecisionRef: string;
  readonly roundingVersion: string;
  readonly valuationAt: ExactQuantity;
  /** A zero-origin valuation trace, not an authoritative account transition. */
  readonly conversionTrace: FxMoneyTransition;
  readonly replayProof: FxFoundationReplayProof;
}

export interface PrivateFxAccountSnapshot {
  readonly accountRef: string;
  readonly countryRef: string;
  readonly ownerRef: string;
  readonly localCurrency: string;
  readonly privateLocalBalance: ExactMoney;
  readonly privateGcuBalance: ExactMoney;
}

export interface PrivateFxSettlementRequest {
  readonly settlementRef: string;
  readonly settlementVersion: string;
  readonly payerCountryRef: string;
  readonly payeeCountryRef: string;
  readonly payerAccountRef: string;
  readonly dealerAccountRef: string;
  readonly payeeAccountRef: string;
  readonly conversionRef: string;
  /** Classifies a caller fact without selecting its economics in Core. */
  readonly purpose: 'IMPORT' | 'CAPITAL_FLOW' | 'INCOME_REPATRIATION';
  /** A caller-owned scoped uniqueness witness; a later writer persists it. */
  readonly previouslySettledRefs: readonly string[];
  readonly settlementAt: ExactQuantity;
}

export interface PrivateFxSettlementResult {
  readonly foundationStatus: typeof FX_INTERNATIONAL_FOUNDATION_STATUS;
  readonly settlementRef: string;
  readonly payer: PrivateFxAccountSnapshot;
  readonly dealer: PrivateFxAccountSnapshot;
  readonly payee: PrivateFxAccountSnapshot;
  readonly conversion: FxConversionResult;
  readonly transitions: readonly FxMoneyTransition[];
  readonly replayProof: FxFoundationReplayProof;
}

export interface ExternalDebtPositionSnapshot {
  readonly countryRef: string;
  readonly externalDebtAssets: ExactMoney;
  readonly externalDebtLiabilities: ExactMoney;
}

export interface ExternalDebtOperation {
  readonly debtRef: string;
  readonly operationRef: string;
  readonly operationVersion: string;
  readonly creditorCountryRef: string;
  readonly debtorCountryRef: string;
  readonly direction: 'DRAW' | 'REPAYMENT';
  readonly amount: ExactMoney;
  readonly previouslyAppliedOperationRefs: readonly string[];
  readonly settlementAt: ExactQuantity;
}

export interface ExternalDebtResult {
  readonly foundationStatus: typeof FX_INTERNATIONAL_FOUNDATION_STATUS;
  readonly debtRef: string;
  readonly creditor: ExternalDebtPositionSnapshot;
  readonly debtor: ExternalDebtPositionSnapshot;
  readonly transitions: readonly FxMoneyTransition[];
  readonly replayProof: FxFoundationReplayProof;
}

export interface OfficialReserveSnapshot {
  readonly countryRef: string;
  readonly localCurrency: string;
  readonly officialGcuReserves: ExactMoney;
  readonly officialLocalLiquidity: ExactMoney;
  readonly sterilizationInstruments: ExactMoney;
}

/** Amounts and signs are caller facts; Core selects no intervention quantity. */
export interface OfficialInterventionFact {
  readonly interventionRef: string;
  readonly interventionVersion: string;
  readonly countryRef: string;
  readonly gcuReserveDelta: ExactMoney;
  readonly localLiquidityDelta: ExactMoney;
  readonly interventionAt: ExactQuantity;
}

/** Amounts and signs are caller facts; Core selects no sterilization formula. */
export interface SterilizationFact {
  readonly sterilizationRef: string;
  readonly sterilizationVersion: string;
  readonly countryRef: string;
  readonly localLiquidityDelta: ExactMoney;
  readonly instrumentDelta: ExactMoney;
  readonly sterilizationAt: ExactQuantity;
}

export interface OfficialInterventionResult {
  readonly foundationStatus: typeof FX_INTERNATIONAL_FOUNDATION_STATUS;
  readonly official: OfficialReserveSnapshot;
  readonly transitions: readonly FxMoneyTransition[];
  readonly replayProof: FxFoundationReplayProof;
}

export interface HistoricalFxCashSettlementRequest {
  readonly tradeRef: string;
  readonly settlementRef: string;
  readonly executionVersion: string;
  readonly payerCountryRef: string;
  readonly payeeCountryRef: string;
  readonly conversionRef: string;
  readonly executedAt: ExactQuantity;
}

export interface LockedHistoricalFxCashSettlement {
  readonly tradeRef: string;
  readonly settlementRef: string;
  readonly executionVersion: string;
  readonly payerCountryRef: string;
  readonly payeeCountryRef: string;
  readonly domesticCash: ExactMoney;
  readonly lockedGcuCash: ExactMoney;
  readonly lockedRate: CountryFxRate;
  readonly lockedRounding: FxRoundingDecision;
  readonly executedAt: ExactQuantity;
  readonly executionSnapshot: FoundationSnapshotBinding;
}

export interface HistoricalFxRevaluationRequest {
  readonly revaluationRef: string;
  readonly revaluationVersion: string;
  readonly settlementRef: string;
  readonly valuationAt: ExactQuantity;
}

export interface HistoricalFxRevaluationResult {
  readonly foundationStatus: typeof FX_INTERNATIONAL_FOUNDATION_STATUS;
  readonly lockedSettlement: LockedHistoricalFxCashSettlement;
  readonly currentMarkedGcuValue: ExactMoney;
  readonly revaluationTrace: FxMoneyTransition;
  readonly replayProof: FxFoundationReplayProof;
}

const STABLE_REFERENCE = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u;
const SHA256_HEX = /^[a-f0-9]{64}$/u;
const ROUNDING_BY_MODE = Object.freeze({
  HALF_EVEN: WorldDecimal.ROUND_HALF_EVEN,
  HALF_UP: WorldDecimal.ROUND_HALF_UP,
  DOWN: WorldDecimal.ROUND_DOWN,
  UP: WorldDecimal.ROUND_UP,
} as const);
const PRIVATE_SETTLEMENT_PURPOSES = Object.freeze({
  IMPORT: true,
  CAPITAL_FLOW: true,
  INCOME_REPATRIATION: true,
} as const);

function stableReference(value: string, label: string): string {
  if (!STABLE_REFERENCE.test(value)) {
    kernelInvalid(`${label} must be a stable reference`);
  }
  return value;
}

function distinctReferences(
  values: readonly string[],
  label: string,
  requireAtLeastOne = true,
): readonly string[] {
  if (requireAtLeastOne && values.length === 0) {
    kernelInvalid(`${label} requires at least one reference`);
  }
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

function snapshotBinding(
  value: FoundationSnapshotBinding,
  label: string,
): FoundationSnapshotBinding {
  const hash = (candidate: string, field: string): string => {
    if (!SHA256_HEX.test(candidate)) {
      kernelInvalid(`${field} must be a lowercase SHA-256 hex digest`);
    }
    return candidate;
  };
  return Object.freeze({
    lineageRef: stableReference(value.lineageRef, `${label}.lineageRef`),
    sourceVersion: stableReference(
      value.sourceVersion,
      `${label}.sourceVersion`,
    ),
    snapshotRef: stableReference(value.snapshotRef, `${label}.snapshotRef`),
    snapshotHash: hash(value.snapshotHash, `${label}.snapshotHash`),
    predecessorSnapshotHash:
      value.predecessorSnapshotHash === null
        ? null
        : hash(
            value.predecessorSnapshotHash,
            `${label}.predecessorSnapshotHash`,
          ),
  });
}

function traceTick(trace: FxFoundationTraceRequest): WorldDecimalValue {
  const tick = nonNegativeQuantity(
    trace.snapshotAt,
    'sim_millisecond',
    'snapshotAt',
  ).amount;
  if (!tick.isInteger()) {
    kernelInvalid('snapshotAt must be an integer sim_millisecond tick');
  }
  return tick;
}

function boundTick(
  value: ExactQuantity,
  trace: FxFoundationTraceRequest,
  label: string,
): ExactQuantity {
  const tick = nonNegativeQuantity(value, 'sim_millisecond', label).amount;
  if (!tick.isInteger() || !tick.equals(traceTick(trace))) {
    kernelInvalid(
      `${label} must equal the replay snapshot sim_millisecond tick`,
    );
  }
  return renderQuantity(tick, 'sim_millisecond');
}

function exactMoney(
  value: ExactMoney,
  currency: string,
  label: string,
  allowNegative = false,
): ExactMoney {
  const parsed = money(value, label);
  if (parsed.currency !== currency) {
    kernelInvalid(`${label} currency must use ${currency}`);
  }
  if (!allowNegative && parsed.amount.isNegative()) {
    kernelInvalid(`${label} must be non-negative`);
  }
  return renderMoney(parsed.amount, currency);
}

function signedMoney(
  value: ExactMoney,
  currency: string,
  label: string,
): ExactMoney {
  return exactMoney(value, currency, label, true);
}

function transition(input: {
  readonly transitionRef: string;
  readonly inputRefs: readonly string[];
  readonly outputRef: string;
  readonly before: ExactMoney;
  readonly delta: ExactMoney;
  readonly after: ExactMoney;
}): FxMoneyTransition {
  const before = money(input.before, 'transition.before');
  const delta = money(input.delta, 'transition.delta');
  const after = money(input.after, 'transition.after');
  if (
    before.currency !== delta.currency ||
    before.currency !== after.currency ||
    before.amount.isNegative() ||
    after.amount.isNegative() ||
    !before.amount.plus(delta.amount).equals(after.amount)
  ) {
    kernelInvalid(
      'Money transition must conserve currency and before plus delta',
    );
  }
  return Object.freeze({
    transitionRef: stableReference(input.transitionRef, 'transitionRef'),
    inputRefs: distinctReferences(input.inputRefs, 'transition.inputRefs'),
    outputRef: stableReference(input.outputRef, 'transition.outputRef'),
    before: renderMoney(before.amount, before.currency),
    delta: renderMoney(delta.amount, before.currency),
    after: renderMoney(after.amount, before.currency),
  });
}

function normalizedRate(
  value: CountryFxRate,
  trace: FxFoundationTraceRequest,
  label: string,
): CountryFxRate {
  const localCurrency = canonicalCurrency(
    value.localCurrency,
    `${label}.localCurrency`,
  );
  const globalCurrency = canonicalCurrency(
    value.globalCurrency,
    `${label}.globalCurrency`,
  );
  if (globalCurrency !== FX_GLOBAL_CURRENCY) {
    kernelInvalid(`${label}.globalCurrency must use ${FX_GLOBAL_CURRENCY}`);
  }
  return Object.freeze({
    rateRef: stableReference(value.rateRef, `${label}.rateRef`),
    rateVersion: stableReference(value.rateVersion, `${label}.rateVersion`),
    countryRef: stableReference(value.countryRef, `${label}.countryRef`),
    localCurrency,
    globalCurrency: FX_GLOBAL_CURRENCY,
    globalPerLocalUnit: render(
      positive(value.globalPerLocalUnit, `${label}.globalPerLocalUnit`),
    ),
    valuationAt: boundTick(value.valuationAt, trace, `${label}.valuationAt`),
  });
}

function normalizedRounding(
  value: FxRoundingDecision,
  trace: FxFoundationTraceRequest,
  label: string,
): FxRoundingDecision {
  if (!Object.hasOwn(ROUNDING_BY_MODE, value.mode)) {
    kernelInvalid(
      `${label}.mode must be an explicit supported rounding decision`,
    );
  }
  return Object.freeze({
    roundingDecisionRef: stableReference(
      value.roundingDecisionRef,
      `${label}.roundingDecisionRef`,
    ),
    roundingVersion: stableReference(
      value.roundingVersion,
      `${label}.roundingVersion`,
    ),
    quantum: render(positive(value.quantum, `${label}.quantum`)),
    mode: value.mode,
    valuationAt: boundTick(value.valuationAt, trace, `${label}.valuationAt`),
  });
}

function conversionDirection(value: unknown): FxConversionRequest['direction'] {
  if (value === 'LC_TO_GCU' || value === 'GCU_TO_LC') return value;
  return kernelInvalid('Conversion direction must be LC_TO_GCU or GCU_TO_LC');
}

function externalDebtDirection(
  value: unknown,
): ExternalDebtOperation['direction'] {
  if (value === 'DRAW' || value === 'REPAYMENT') return value;
  return kernelInvalid('External debt direction must be DRAW or REPAYMENT');
}

function rounded(
  value: WorldDecimalValue,
  decision: FxRoundingDecision,
): string {
  const quantum = positive(decision.quantum, 'rounding.quantum');
  return render(
    assertWorldDecimalResult(
      value
        .dividedBy(quantum)
        .toNearest('1', ROUNDING_BY_MODE[decision.mode])
        .times(quantum),
    ),
  );
}

function replayProof(input: {
  readonly module: FxFoundationModule;
  readonly trace: FxFoundationTraceRequest;
  readonly facts: readonly FxFoundationFact<unknown>[];
  readonly outputRef: string;
  readonly transitions: readonly FxMoneyTransition[];
}): FxFoundationReplayProof {
  const inputFacts = input.facts.map((fact, index) =>
    foundationFactBinding(input.trace, fact, `inputFacts[${index}]`),
  );
  const inputFactRefs = distinctReferences(
    inputFacts.map((fact) => fact.factRef),
    'inputFactRefs',
  );
  const transitionRefs = distinctReferences(
    input.transitions.map((item) => item.transitionRef),
    'transitionRefs',
    false,
  );
  if (transitionRefs.length !== input.transitions.length) {
    kernelInvalid('Replay transitions must be unique');
  }
  const snapshotAt = renderQuantity(traceTick(input.trace), 'sim_millisecond');
  const outputRef = stableReference(input.outputRef, 'outputRef');
  const result: Omit<FxFoundationReplayProof, 'hashInput'> = {
    module: input.module,
    traceRef: stableReference(input.trace.traceRef, 'traceRef'),
    calculationVersion: stableReference(
      input.trace.calculationVersion,
      'calculationVersion',
    ),
    snapshot: input.trace.snapshot,
    snapshotAt,
    inputFactRefs,
    inputFacts: Object.freeze(inputFacts),
    outputRef,
    transitions: Object.freeze([...input.transitions]),
  };
  return Object.freeze({
    ...result,
    hashInput: canonicalHashInput(result),
  });
}

/** Re-validates every fact and rejects altered proof material during replay. */
export function assertFxInternationalFoundationReplayEvidence(
  proof: FxFoundationReplayProof,
  facts: readonly FxFoundationFact<unknown>[],
): void {
  const trace: FxFoundationTraceRequest = {
    traceRef: proof.traceRef,
    calculationVersion: proof.calculationVersion,
    snapshot: proof.snapshot,
    snapshotAt: proof.snapshotAt,
  };
  const boundFacts = facts.map((fact, index) =>
    foundationFactBinding(trace, fact, `replay.inputFacts[${index}]`),
  );
  if (
    canonicalSerialize(boundFacts) !== canonicalSerialize(proof.inputFacts) ||
    canonicalSerialize(boundFacts.map((fact) => fact.factRef)) !==
      canonicalSerialize(proof.inputFactRefs)
  ) {
    kernelInvalid('Replay evidence does not exactly equal the recorded proof');
  }
  const { hashInput, ...unsignedProof } = proof;
  if (hashInput !== canonicalHashInput(unsignedProof)) {
    kernelInvalid('Replay proof canonical hash input has been altered');
  }
}

/** Indexes the sole LC/GCU quote for each country; no bilateral rate matrix exists. */
export function indexCountryFxRates(input: {
  readonly trace: FxFoundationTraceRequest;
  readonly rateFacts: readonly FxFoundationFact<CountryFxRate>[];
}): ReadonlyMap<string, CountryFxRate> {
  if (input.rateFacts.length === 0) {
    kernelInvalid('At least one country FX rate fact is required');
  }
  const rates = new Map<string, CountryFxRate>();
  for (const [index, fact] of input.rateFacts.entries()) {
    const rate = normalizedRate(
      foundationFactPayload(input.trace, fact, `rateFacts[${index}]`),
      input.trace,
      `rateFacts[${index}]`,
    );
    if (rates.has(rate.countryRef)) {
      kernelInvalid(
        'Each country may have only one authoritative LC/GCU rate per snapshot',
      );
    }
    rates.set(rate.countryRef, rate);
  }
  return rates;
}

function conversionContext(input: {
  readonly trace: FxFoundationTraceRequest;
  readonly rateFact: FxFoundationFact<CountryFxRate>;
  readonly roundingFact: FxFoundationFact<FxRoundingDecision>;
  readonly conversionFact: FxFoundationFact<FxConversionRequest>;
}): {
  readonly rate: CountryFxRate;
  readonly rounding: FxRoundingDecision;
  readonly request: FxConversionRequest;
  readonly sourceAmount: ExactMoney;
  readonly convertedAmount: ExactMoney;
  readonly unroundedAmount: string;
} {
  const request = foundationFactPayload(
    input.trace,
    input.conversionFact,
    'conversion',
  );
  const direction = conversionDirection(request.direction);
  const rate = normalizedRate(
    foundationFactPayload(input.trace, input.rateFact, 'rate'),
    input.trace,
    'rate',
  );
  const rounding = normalizedRounding(
    foundationFactPayload(input.trace, input.roundingFact, 'rounding'),
    input.trace,
    'rounding',
  );
  stableReference(request.conversionRef, 'conversion.conversionRef');
  stableReference(request.conversionVersion, 'conversion.conversionVersion');
  if (
    stableReference(request.countryRef, 'conversion.countryRef') !==
    rate.countryRef
  ) {
    kernelInvalid(
      'Conversion countryRef must match the supplied country FX rate',
    );
  }
  if (stableReference(request.rateRef, 'conversion.rateRef') !== rate.rateRef) {
    kernelInvalid('Conversion rateRef must match the supplied country FX rate');
  }
  if (
    stableReference(
      request.roundingDecisionRef,
      'conversion.roundingDecisionRef',
    ) !== rounding.roundingDecisionRef
  ) {
    kernelInvalid(
      'Conversion roundingDecisionRef must match the supplied explicit rounding decision',
    );
  }
  const valuationAt = boundTick(
    request.valuationAt,
    input.trace,
    'conversion.valuationAt',
  );
  const sourceCurrency =
    direction === 'LC_TO_GCU' ? rate.localCurrency : FX_GLOBAL_CURRENCY;
  const targetCurrency =
    direction === 'LC_TO_GCU' ? FX_GLOBAL_CURRENCY : rate.localCurrency;
  const sourceAmount = exactMoney(
    request.amount,
    sourceCurrency,
    'conversion.amount',
  );
  const rateValue = positive(
    rate.globalPerLocalUnit,
    'rate.globalPerLocalUnit',
  );
  const raw =
    direction === 'LC_TO_GCU'
      ? money(sourceAmount, 'conversion.amount').amount.times(rateValue)
      : money(sourceAmount, 'conversion.amount').amount.dividedBy(rateValue);
  const unroundedAmount = render(assertWorldDecimalResult(raw));
  const convertedAmount = renderMoney(
    nonNegative(rounded(raw, rounding), 'rounded conversion'),
    targetCurrency,
  );
  return Object.freeze({
    rate,
    rounding,
    request: Object.freeze({ ...request, direction, valuationAt }),
    sourceAmount,
    convertedAmount,
    unroundedAmount,
  });
}

/** Converts only with caller-supplied rate, rounding decision, and valuation time. */
export function calculateFxConversion(input: {
  readonly trace: FxFoundationTraceRequest;
  readonly rateFact: FxFoundationFact<CountryFxRate>;
  readonly roundingFact: FxFoundationFact<FxRoundingDecision>;
  readonly conversionFact: FxFoundationFact<FxConversionRequest>;
  readonly outputRef: string;
}): FxConversionResult {
  const context = conversionContext(input);
  const conversionTrace = transition({
    transitionRef: `${context.request.conversionRef}.valuation`,
    inputRefs: [
      input.rateFact.factRef,
      input.roundingFact.factRef,
      input.conversionFact.factRef,
    ],
    outputRef: `${input.outputRef}.converted_amount`,
    before: renderMoney(
      nonNegative('0', 'zero'),
      context.convertedAmount.currency,
    ),
    delta: context.convertedAmount,
    after: context.convertedAmount,
  });
  return Object.freeze({
    foundationStatus: FX_INTERNATIONAL_FOUNDATION_STATUS,
    conversionRef: context.request.conversionRef,
    countryRef: context.rate.countryRef,
    sourceAmount: context.sourceAmount,
    convertedAmount: context.convertedAmount,
    unroundedAmount: context.unroundedAmount,
    rateRef: context.rate.rateRef,
    rateVersion: context.rate.rateVersion,
    roundingDecisionRef: context.rounding.roundingDecisionRef,
    roundingVersion: context.rounding.roundingVersion,
    valuationAt: context.request.valuationAt,
    conversionTrace,
    replayProof: replayProof({
      module: 'V20_LC_GCU_RATE',
      trace: input.trace,
      facts: [input.rateFact, input.roundingFact, input.conversionFact],
      outputRef: input.outputRef,
      transitions: [conversionTrace],
    }),
  });
}

function privateAccount(
  value: PrivateFxAccountSnapshot,
  label: string,
): PrivateFxAccountSnapshot {
  if (
    Object.hasOwn(value, 'officialGcuReserves') ||
    Object.hasOwn(value, 'officialLocalLiquidity') ||
    Object.hasOwn(value, 'sterilizationInstruments')
  ) {
    kernelInvalid(
      'Private FX account facts must not contain official reserve fields',
    );
  }
  const localCurrency = canonicalCurrency(
    value.localCurrency,
    `${label}.localCurrency`,
  );
  return Object.freeze({
    accountRef: stableReference(value.accountRef, `${label}.accountRef`),
    countryRef: stableReference(value.countryRef, `${label}.countryRef`),
    ownerRef: stableReference(value.ownerRef, `${label}.ownerRef`),
    localCurrency,
    privateLocalBalance: exactMoney(
      value.privateLocalBalance,
      localCurrency,
      `${label}.privateLocalBalance`,
    ),
    privateGcuBalance: exactMoney(
      value.privateGcuBalance,
      FX_GLOBAL_CURRENCY,
      `${label}.privateGcuBalance`,
    ),
  });
}

function replacePrivateAccount(
  source: PrivateFxAccountSnapshot,
  patch: Partial<PrivateFxAccountSnapshot>,
): PrivateFxAccountSnapshot {
  return privateAccount({ ...source, ...patch }, 'privateAccount');
}

/**
 * Calculates a private LC-to-GCU import/transfer through private payer and
 * dealer balances. Official reserve data is neither accepted nor returned,
 * so a private import cannot debit an official reserve by construction.
 */
export function calculatePrivateFxSettlement(input: {
  readonly trace: FxFoundationTraceRequest;
  readonly rateFact: FxFoundationFact<CountryFxRate>;
  readonly roundingFact: FxFoundationFact<FxRoundingDecision>;
  readonly conversionFact: FxFoundationFact<FxConversionRequest>;
  readonly payerFact: FxFoundationFact<PrivateFxAccountSnapshot>;
  readonly dealerFact: FxFoundationFact<PrivateFxAccountSnapshot>;
  readonly payeeFact: FxFoundationFact<PrivateFxAccountSnapshot>;
  readonly settlementFact: FxFoundationFact<PrivateFxSettlementRequest>;
  readonly outputRef: string;
}): PrivateFxSettlementResult {
  const context = conversionContext(input);
  if (context.request.direction !== 'LC_TO_GCU') {
    kernelInvalid('Private FX settlement requires an LC_TO_GCU conversion');
  }
  const payer = privateAccount(
    foundationFactPayload(input.trace, input.payerFact, 'payer'),
    'payer',
  );
  const dealer = privateAccount(
    foundationFactPayload(input.trace, input.dealerFact, 'dealer'),
    'dealer',
  );
  const payee = privateAccount(
    foundationFactPayload(input.trace, input.payeeFact, 'payee'),
    'payee',
  );
  const settlement = foundationFactPayload(
    input.trace,
    input.settlementFact,
    'privateSettlement',
  );
  const settlementRef = stableReference(
    settlement.settlementRef,
    'privateSettlement.settlementRef',
  );
  stableReference(
    settlement.settlementVersion,
    'privateSettlement.settlementVersion',
  );
  if (
    stableReference(
      settlement.payerCountryRef,
      'privateSettlement.payerCountryRef',
    ) !== payer.countryRef ||
    stableReference(
      settlement.payeeCountryRef,
      'privateSettlement.payeeCountryRef',
    ) !== payee.countryRef ||
    payer.countryRef === payee.countryRef
  ) {
    kernelInvalid(
      'Private FX settlement requires distinct matching payer and payee countries',
    );
  }
  if (
    stableReference(
      settlement.payerAccountRef,
      'privateSettlement.payerAccountRef',
    ) !== payer.accountRef ||
    stableReference(
      settlement.dealerAccountRef,
      'privateSettlement.dealerAccountRef',
    ) !== dealer.accountRef ||
    stableReference(
      settlement.payeeAccountRef,
      'privateSettlement.payeeAccountRef',
    ) !== payee.accountRef
  ) {
    kernelInvalid(
      'Private FX settlement account references must match supplied private snapshots',
    );
  }
  if (
    stableReference(
      settlement.conversionRef,
      'privateSettlement.conversionRef',
    ) !== context.request.conversionRef
  ) {
    kernelInvalid(
      'Private FX settlement conversionRef must match the supplied conversion',
    );
  }
  if (!Object.hasOwn(PRIVATE_SETTLEMENT_PURPOSES, settlement.purpose)) {
    kernelInvalid('Private FX settlement requires an explicit private purpose');
  }
  if (
    payer.countryRef !== dealer.countryRef ||
    payer.localCurrency !== dealer.localCurrency
  ) {
    kernelInvalid(
      'Private dealer must share the payer country and local currency',
    );
  }
  if (
    payer.accountRef === dealer.accountRef ||
    payer.accountRef === payee.accountRef ||
    dealer.accountRef === payee.accountRef
  ) {
    kernelInvalid(
      'Private FX settlement requires three distinct private accounts',
    );
  }
  const previouslySettledRefs = distinctReferences(
    settlement.previouslySettledRefs,
    'privateSettlement.previouslySettledRefs',
    false,
  );
  if (previouslySettledRefs.includes(settlementRef)) {
    kernelInvalid(
      'Private FX settlement already has a caller-owned uniqueness witness',
    );
  }
  boundTick(
    settlement.settlementAt,
    input.trace,
    'privateSettlement.settlementAt',
  );
  const domesticDebit = money(
    context.sourceAmount,
    'conversion.sourceAmount',
  ).amount;
  const gcuCredit = money(
    context.convertedAmount,
    'conversion.convertedAmount',
  ).amount;
  const payerLocalBefore = money(
    payer.privateLocalBalance,
    'payer.privateLocalBalance',
  ).amount;
  const dealerLocalBefore = money(
    dealer.privateLocalBalance,
    'dealer.privateLocalBalance',
  ).amount;
  const dealerGcuBefore = money(
    dealer.privateGcuBalance,
    'dealer.privateGcuBalance',
  ).amount;
  const payeeGcuBefore = money(
    payee.privateGcuBalance,
    'payee.privateGcuBalance',
  ).amount;
  if (
    payerLocalBefore.lessThan(domesticDebit) ||
    dealerGcuBefore.lessThan(gcuCredit)
  ) {
    kernelInvalid('Private FX settlement has insufficient private balance');
  }
  const nextPayer = replacePrivateAccount(payer, {
    privateLocalBalance: renderMoney(
      payerLocalBefore.minus(domesticDebit),
      payer.localCurrency,
    ),
  });
  const nextDealer = replacePrivateAccount(dealer, {
    privateLocalBalance: renderMoney(
      dealerLocalBefore.plus(domesticDebit),
      dealer.localCurrency,
    ),
    privateGcuBalance: renderMoney(
      dealerGcuBefore.minus(gcuCredit),
      FX_GLOBAL_CURRENCY,
    ),
  });
  const nextPayee = replacePrivateAccount(payee, {
    privateGcuBalance: renderMoney(
      payeeGcuBefore.plus(gcuCredit),
      FX_GLOBAL_CURRENCY,
    ),
  });
  const facts = [
    input.rateFact,
    input.roundingFact,
    input.conversionFact,
    input.payerFact,
    input.dealerFact,
    input.payeeFact,
    input.settlementFact,
  ] as const;
  const inputRefs = facts.map((fact) => fact.factRef);
  const transitions = Object.freeze([
    transition({
      transitionRef: `${settlementRef}.payer.local`,
      inputRefs,
      outputRef: `${input.outputRef}.payer.local`,
      before: payer.privateLocalBalance,
      delta: renderMoney(domesticDebit.negated(), payer.localCurrency),
      after: nextPayer.privateLocalBalance,
    }),
    transition({
      transitionRef: `${settlementRef}.dealer.local`,
      inputRefs,
      outputRef: `${input.outputRef}.dealer.local`,
      before: dealer.privateLocalBalance,
      delta: context.sourceAmount,
      after: nextDealer.privateLocalBalance,
    }),
    transition({
      transitionRef: `${settlementRef}.dealer.gcu`,
      inputRefs,
      outputRef: `${input.outputRef}.dealer.gcu`,
      before: dealer.privateGcuBalance,
      delta: renderMoney(gcuCredit.negated(), FX_GLOBAL_CURRENCY),
      after: nextDealer.privateGcuBalance,
    }),
    transition({
      transitionRef: `${settlementRef}.payee.gcu`,
      inputRefs,
      outputRef: `${input.outputRef}.payee.gcu`,
      before: payee.privateGcuBalance,
      delta: context.convertedAmount,
      after: nextPayee.privateGcuBalance,
    }),
  ]);
  const conversion = calculateFxConversion({
    trace: input.trace,
    rateFact: input.rateFact,
    roundingFact: input.roundingFact,
    conversionFact: input.conversionFact,
    outputRef: `${input.outputRef}.conversion`,
  });
  return Object.freeze({
    foundationStatus: FX_INTERNATIONAL_FOUNDATION_STATUS,
    settlementRef,
    payer: nextPayer,
    dealer: nextDealer,
    payee: nextPayee,
    conversion,
    transitions,
    replayProof: replayProof({
      module: 'V20_PRIVATE_FX_SETTLEMENT',
      trace: input.trace,
      facts,
      outputRef: input.outputRef,
      transitions,
    }),
  });
}

function externalDebtPosition(
  value: ExternalDebtPositionSnapshot,
  label: string,
): ExternalDebtPositionSnapshot {
  const countryRef = stableReference(value.countryRef, `${label}.countryRef`);
  return Object.freeze({
    countryRef,
    externalDebtAssets: exactMoney(
      value.externalDebtAssets,
      FX_GLOBAL_CURRENCY,
      `${label}.externalDebtAssets`,
    ),
    externalDebtLiabilities: exactMoney(
      value.externalDebtLiabilities,
      FX_GLOBAL_CURRENCY,
      `${label}.externalDebtLiabilities`,
    ),
  });
}

function replaceExternalDebtPosition(
  source: ExternalDebtPositionSnapshot,
  patch: Partial<ExternalDebtPositionSnapshot>,
): ExternalDebtPositionSnapshot {
  return externalDebtPosition({ ...source, ...patch }, 'externalDebtPosition');
}

/** Ensures both countries carry the same GCU debt amount before and after an operation. */
export function calculateExternalDebtOperation(input: {
  readonly trace: FxFoundationTraceRequest;
  readonly creditorFact: FxFoundationFact<ExternalDebtPositionSnapshot>;
  readonly debtorFact: FxFoundationFact<ExternalDebtPositionSnapshot>;
  readonly operationFact: FxFoundationFact<ExternalDebtOperation>;
  readonly outputRef: string;
}): ExternalDebtResult {
  const operation = foundationFactPayload(
    input.trace,
    input.operationFact,
    'externalDebtOperation',
  );
  const direction = externalDebtDirection(operation.direction);
  const creditor = externalDebtPosition(
    foundationFactPayload(input.trace, input.creditorFact, 'creditor'),
    'creditor',
  );
  const debtor = externalDebtPosition(
    foundationFactPayload(input.trace, input.debtorFact, 'debtor'),
    'debtor',
  );
  const debtRef = stableReference(
    operation.debtRef,
    'externalDebtOperation.debtRef',
  );
  const operationRef = stableReference(
    operation.operationRef,
    'externalDebtOperation.operationRef',
  );
  stableReference(
    operation.operationVersion,
    'externalDebtOperation.operationVersion',
  );
  if (
    stableReference(
      operation.creditorCountryRef,
      'externalDebtOperation.creditorCountryRef',
    ) !== creditor.countryRef ||
    stableReference(
      operation.debtorCountryRef,
      'externalDebtOperation.debtorCountryRef',
    ) !== debtor.countryRef ||
    creditor.countryRef === debtor.countryRef
  ) {
    kernelInvalid(
      'External debt requires distinct matching creditor and debtor countries',
    );
  }
  const previouslyApplied = distinctReferences(
    operation.previouslyAppliedOperationRefs,
    'externalDebtOperation.previouslyAppliedOperationRefs',
    false,
  );
  if (previouslyApplied.includes(operationRef)) {
    kernelInvalid(
      'External debt operation already has a caller-owned uniqueness witness',
    );
  }
  boundTick(
    operation.settlementAt,
    input.trace,
    'externalDebtOperation.settlementAt',
  );
  const amount = exactMoney(
    operation.amount,
    FX_GLOBAL_CURRENCY,
    'externalDebtOperation.amount',
  );
  const creditorAssets = money(
    creditor.externalDebtAssets,
    'creditor.externalDebtAssets',
  ).amount;
  const debtorLiabilities = money(
    debtor.externalDebtLiabilities,
    'debtor.externalDebtLiabilities',
  ).amount;
  if (!creditorAssets.equals(debtorLiabilities)) {
    kernelInvalid(
      'Bilateral external debt assets and liabilities must reconcile before operation',
    );
  }
  const delta =
    direction === 'DRAW'
      ? money(amount, 'externalDebtOperation.amount').amount
      : money(amount, 'externalDebtOperation.amount').amount.negated();
  if (
    delta.isNegative() &&
    (creditorAssets.lessThan(delta.negated()) ||
      debtorLiabilities.lessThan(delta.negated()))
  ) {
    kernelInvalid(
      'External debt repayment exceeds the reconciled bilateral balance',
    );
  }
  const nextCreditor = replaceExternalDebtPosition(creditor, {
    externalDebtAssets: renderMoney(
      creditorAssets.plus(delta),
      FX_GLOBAL_CURRENCY,
    ),
  });
  const nextDebtor = replaceExternalDebtPosition(debtor, {
    externalDebtLiabilities: renderMoney(
      debtorLiabilities.plus(delta),
      FX_GLOBAL_CURRENCY,
    ),
  });
  if (
    !money(
      nextCreditor.externalDebtAssets,
      'nextCreditor.externalDebtAssets',
    ).amount.equals(
      money(
        nextDebtor.externalDebtLiabilities,
        'nextDebtor.externalDebtLiabilities',
      ).amount,
    )
  ) {
    kernelInvalid(
      'Bilateral external debt assets and liabilities must reconcile after operation',
    );
  }
  const inputRefs = [
    input.creditorFact.factRef,
    input.debtorFact.factRef,
    input.operationFact.factRef,
  ];
  const transitions = Object.freeze([
    transition({
      transitionRef: `${operationRef}.creditor.asset`,
      inputRefs,
      outputRef: `${input.outputRef}.creditor.asset`,
      before: creditor.externalDebtAssets,
      delta: renderMoney(delta, FX_GLOBAL_CURRENCY),
      after: nextCreditor.externalDebtAssets,
    }),
    transition({
      transitionRef: `${operationRef}.debtor.liability`,
      inputRefs,
      outputRef: `${input.outputRef}.debtor.liability`,
      before: debtor.externalDebtLiabilities,
      delta: renderMoney(delta, FX_GLOBAL_CURRENCY),
      after: nextDebtor.externalDebtLiabilities,
    }),
  ]);
  return Object.freeze({
    foundationStatus: FX_INTERNATIONAL_FOUNDATION_STATUS,
    debtRef,
    creditor: nextCreditor,
    debtor: nextDebtor,
    transitions,
    replayProof: replayProof({
      module: 'V20_EXTERNAL_DEBT',
      trace: input.trace,
      facts: [input.creditorFact, input.debtorFact, input.operationFact],
      outputRef: input.outputRef,
      transitions,
    }),
  });
}

function officialReserve(
  value: OfficialReserveSnapshot,
  label: string,
): OfficialReserveSnapshot {
  const localCurrency = canonicalCurrency(
    value.localCurrency,
    `${label}.localCurrency`,
  );
  return Object.freeze({
    countryRef: stableReference(value.countryRef, `${label}.countryRef`),
    localCurrency,
    officialGcuReserves: exactMoney(
      value.officialGcuReserves,
      FX_GLOBAL_CURRENCY,
      `${label}.officialGcuReserves`,
    ),
    officialLocalLiquidity: exactMoney(
      value.officialLocalLiquidity,
      localCurrency,
      `${label}.officialLocalLiquidity`,
    ),
    sterilizationInstruments: exactMoney(
      value.sterilizationInstruments,
      localCurrency,
      `${label}.sterilizationInstruments`,
    ),
  });
}

function replaceOfficialReserve(
  source: OfficialReserveSnapshot,
  patch: Partial<OfficialReserveSnapshot>,
): OfficialReserveSnapshot {
  return officialReserve({ ...source, ...patch }, 'officialReserve');
}

/**
 * Applies caller-declared intervention and sterilization deltas to official
 * facts only. It does not derive a spread, policy rate, capital control, or
 * intervention amount, and is structurally separate from private settlement.
 */
export function calculateOfficialInterventionAndSterilization(input: {
  readonly trace: FxFoundationTraceRequest;
  readonly officialFact: FxFoundationFact<OfficialReserveSnapshot>;
  readonly interventionFact: FxFoundationFact<OfficialInterventionFact>;
  readonly sterilizationFact: FxFoundationFact<SterilizationFact>;
  readonly outputRef: string;
}): OfficialInterventionResult {
  const official = officialReserve(
    foundationFactPayload(input.trace, input.officialFact, 'official'),
    'official',
  );
  const intervention = foundationFactPayload(
    input.trace,
    input.interventionFact,
    'intervention',
  );
  const sterilization = foundationFactPayload(
    input.trace,
    input.sterilizationFact,
    'sterilization',
  );
  const interventionRef = stableReference(
    intervention.interventionRef,
    'intervention.interventionRef',
  );
  stableReference(
    intervention.interventionVersion,
    'intervention.interventionVersion',
  );
  const sterilizationRef = stableReference(
    sterilization.sterilizationRef,
    'sterilization.sterilizationRef',
  );
  stableReference(
    sterilization.sterilizationVersion,
    'sterilization.sterilizationVersion',
  );
  if (
    stableReference(intervention.countryRef, 'intervention.countryRef') !==
      official.countryRef ||
    stableReference(sterilization.countryRef, 'sterilization.countryRef') !==
      official.countryRef
  ) {
    kernelInvalid(
      'Official intervention and sterilization countryRef must match official snapshot',
    );
  }
  boundTick(
    intervention.interventionAt,
    input.trace,
    'intervention.interventionAt',
  );
  boundTick(
    sterilization.sterilizationAt,
    input.trace,
    'sterilization.sterilizationAt',
  );
  const reserveDelta = money(
    signedMoney(
      intervention.gcuReserveDelta,
      FX_GLOBAL_CURRENCY,
      'intervention.gcuReserveDelta',
    ),
    'intervention.gcuReserveDelta',
  ).amount;
  const interventionLiquidityDelta = money(
    signedMoney(
      intervention.localLiquidityDelta,
      official.localCurrency,
      'intervention.localLiquidityDelta',
    ),
    'intervention.localLiquidityDelta',
  ).amount;
  const sterilizationLiquidityDelta = money(
    signedMoney(
      sterilization.localLiquidityDelta,
      official.localCurrency,
      'sterilization.localLiquidityDelta',
    ),
    'sterilization.localLiquidityDelta',
  ).amount;
  const instrumentDelta = money(
    signedMoney(
      sterilization.instrumentDelta,
      official.localCurrency,
      'sterilization.instrumentDelta',
    ),
    'sterilization.instrumentDelta',
  ).amount;
  const reservesBefore = money(
    official.officialGcuReserves,
    'official.officialGcuReserves',
  ).amount;
  const liquidityBefore = money(
    official.officialLocalLiquidity,
    'official.officialLocalLiquidity',
  ).amount;
  const instrumentsBefore = money(
    official.sterilizationInstruments,
    'official.sterilizationInstruments',
  ).amount;
  const reservesAfter = reservesBefore.plus(reserveDelta);
  const liquidityAfter = liquidityBefore
    .plus(interventionLiquidityDelta)
    .plus(sterilizationLiquidityDelta);
  const instrumentsAfter = instrumentsBefore.plus(instrumentDelta);
  if (
    reservesAfter.isNegative() ||
    liquidityAfter.isNegative() ||
    instrumentsAfter.isNegative()
  ) {
    kernelInvalid(
      'Official intervention or sterilization cannot make an official balance negative',
    );
  }
  const next = replaceOfficialReserve(official, {
    officialGcuReserves: renderMoney(reservesAfter, FX_GLOBAL_CURRENCY),
    officialLocalLiquidity: renderMoney(liquidityAfter, official.localCurrency),
    sterilizationInstruments: renderMoney(
      instrumentsAfter,
      official.localCurrency,
    ),
  });
  const inputRefs = [
    input.officialFact.factRef,
    input.interventionFact.factRef,
    input.sterilizationFact.factRef,
  ];
  const transitions = Object.freeze([
    transition({
      transitionRef: `${interventionRef}.official_reserves`,
      inputRefs,
      outputRef: `${input.outputRef}.official_reserves`,
      before: official.officialGcuReserves,
      delta: renderMoney(reserveDelta, FX_GLOBAL_CURRENCY),
      after: next.officialGcuReserves,
    }),
    transition({
      transitionRef: `${interventionRef}.${sterilizationRef}.official_liquidity`,
      inputRefs,
      outputRef: `${input.outputRef}.official_liquidity`,
      before: official.officialLocalLiquidity,
      delta: renderMoney(
        interventionLiquidityDelta.plus(sterilizationLiquidityDelta),
        official.localCurrency,
      ),
      after: next.officialLocalLiquidity,
    }),
    transition({
      transitionRef: `${sterilizationRef}.instruments`,
      inputRefs,
      outputRef: `${input.outputRef}.instruments`,
      before: official.sterilizationInstruments,
      delta: renderMoney(instrumentDelta, official.localCurrency),
      after: next.sterilizationInstruments,
    }),
  ]);
  return Object.freeze({
    foundationStatus: FX_INTERNATIONAL_FOUNDATION_STATUS,
    official: next,
    transitions,
    replayProof: replayProof({
      module: 'V20_OFFICIAL_INTERVENTION_STERILIZATION',
      trace: input.trace,
      facts: [
        input.officialFact,
        input.interventionFact,
        input.sterilizationFact,
      ],
      outputRef: input.outputRef,
      transitions,
    }),
  });
}

function lockedHistoricalSettlement(
  value: LockedHistoricalFxCashSettlement,
  label: string,
): LockedHistoricalFxCashSettlement {
  const executionSnapshot = snapshotBinding(
    value.executionSnapshot,
    `${label}.executionSnapshot`,
  );
  const lockedRate = normalizedRate(
    value.lockedRate,
    {
      traceRef: `${label}.trace`,
      calculationVersion: `${label}.calculation`,
      snapshot: executionSnapshot,
      snapshotAt: value.executedAt,
    },
    `${label}.lockedRate`,
  );
  const lockedRounding = normalizedRounding(
    value.lockedRounding,
    {
      traceRef: `${label}.trace`,
      calculationVersion: `${label}.calculation`,
      snapshot: executionSnapshot,
      snapshotAt: value.executedAt,
    },
    `${label}.lockedRounding`,
  );
  const domesticCash = exactMoney(
    value.domesticCash,
    lockedRate.localCurrency,
    `${label}.domesticCash`,
  );
  const lockedGcuCash = exactMoney(
    value.lockedGcuCash,
    FX_GLOBAL_CURRENCY,
    `${label}.lockedGcuCash`,
  );
  const raw = money(domesticCash, `${label}.domesticCash`).amount.times(
    positive(
      lockedRate.globalPerLocalUnit,
      `${label}.lockedRate.globalPerLocalUnit`,
    ),
  );
  const expected = rounded(raw, lockedRounding);
  if (expected !== lockedGcuCash.amount) {
    kernelInvalid(
      'Locked historical cash must equal its execution rate and explicit rounding decision',
    );
  }
  const payerCountryRef = stableReference(
    value.payerCountryRef,
    `${label}.payerCountryRef`,
  );
  const payeeCountryRef = stableReference(
    value.payeeCountryRef,
    `${label}.payeeCountryRef`,
  );
  if (
    payerCountryRef === payeeCountryRef ||
    payerCountryRef !== lockedRate.countryRef
  ) {
    kernelInvalid(
      'Locked historical cash requires a distinct payee and matching payer rate country',
    );
  }
  return Object.freeze({
    tradeRef: stableReference(value.tradeRef, `${label}.tradeRef`),
    settlementRef: stableReference(
      value.settlementRef,
      `${label}.settlementRef`,
    ),
    executionVersion: stableReference(
      value.executionVersion,
      `${label}.executionVersion`,
    ),
    payerCountryRef,
    payeeCountryRef,
    domesticCash,
    lockedGcuCash,
    lockedRate,
    lockedRounding,
    executedAt: boundTick(
      value.executedAt,
      {
        traceRef: `${label}.trace`,
        calculationVersion: `${label}.calculation`,
        snapshot: executionSnapshot,
        snapshotAt: value.executedAt,
      },
      `${label}.executedAt`,
    ),
    executionSnapshot,
  });
}

/** Locks execution cash at the supplied historical rate; it does not use a current quote. */
export function lockHistoricalFxCashSettlement(input: {
  readonly trace: FxFoundationTraceRequest;
  readonly rateFact: FxFoundationFact<CountryFxRate>;
  readonly roundingFact: FxFoundationFact<FxRoundingDecision>;
  readonly conversionFact: FxFoundationFact<FxConversionRequest>;
  readonly settlementFact: FxFoundationFact<HistoricalFxCashSettlementRequest>;
  readonly outputRef: string;
}): {
  readonly foundationStatus: typeof FX_INTERNATIONAL_FOUNDATION_STATUS;
  readonly lockedSettlement: LockedHistoricalFxCashSettlement;
  readonly cashTrace: FxMoneyTransition;
  readonly replayProof: FxFoundationReplayProof;
} {
  const context = conversionContext(input);
  if (context.request.direction !== 'LC_TO_GCU') {
    kernelInvalid(
      'Historical FX cash settlement requires an LC_TO_GCU execution conversion',
    );
  }
  const settlement = foundationFactPayload(
    input.trace,
    input.settlementFact,
    'historicalSettlement',
  );
  const settlementRef = stableReference(
    settlement.settlementRef,
    'historicalSettlement.settlementRef',
  );
  stableReference(settlement.tradeRef, 'historicalSettlement.tradeRef');
  stableReference(
    settlement.executionVersion,
    'historicalSettlement.executionVersion',
  );
  if (
    stableReference(
      settlement.payerCountryRef,
      'historicalSettlement.payerCountryRef',
    ) !== context.rate.countryRef ||
    stableReference(
      settlement.payeeCountryRef,
      'historicalSettlement.payeeCountryRef',
    ) === context.rate.countryRef
  ) {
    kernelInvalid(
      'Historical FX cash settlement requires a matching payer rate country and distinct payee country',
    );
  }
  if (
    stableReference(
      settlement.conversionRef,
      'historicalSettlement.conversionRef',
    ) !== context.request.conversionRef
  ) {
    kernelInvalid(
      'Historical FX cash settlement conversionRef must match the execution conversion',
    );
  }
  const executedAt = boundTick(
    settlement.executedAt,
    input.trace,
    'historicalSettlement.executedAt',
  );
  const lockedSettlement = lockedHistoricalSettlement(
    {
      tradeRef: settlement.tradeRef,
      settlementRef,
      executionVersion: settlement.executionVersion,
      payerCountryRef: settlement.payerCountryRef,
      payeeCountryRef: settlement.payeeCountryRef,
      domesticCash: context.sourceAmount,
      lockedGcuCash: context.convertedAmount,
      lockedRate: context.rate,
      lockedRounding: context.rounding,
      executedAt,
      executionSnapshot: input.trace.snapshot,
    },
    'lockedHistoricalSettlement',
  );
  const cashTrace = transition({
    transitionRef: `${settlementRef}.locked_cash`,
    inputRefs: [
      input.rateFact.factRef,
      input.roundingFact.factRef,
      input.conversionFact.factRef,
      input.settlementFact.factRef,
    ],
    outputRef: `${input.outputRef}.locked_cash`,
    before: renderMoney(nonNegative('0', 'zero'), FX_GLOBAL_CURRENCY),
    delta: context.convertedAmount,
    after: context.convertedAmount,
  });
  return Object.freeze({
    foundationStatus: FX_INTERNATIONAL_FOUNDATION_STATUS,
    lockedSettlement,
    cashTrace,
    replayProof: replayProof({
      module: 'V20_HISTORICAL_CASH_SETTLEMENT',
      trace: input.trace,
      facts: [
        input.rateFact,
        input.roundingFact,
        input.conversionFact,
        input.settlementFact,
      ],
      outputRef: input.outputRef,
      transitions: [cashTrace],
    }),
  });
}

/**
 * Marks a locked historical cash value using a new explicit quote. The locked
 * cash object is returned unchanged; only the separate revaluation trace moves.
 */
export function revalueHistoricalFxCashSettlement(input: {
  readonly trace: FxFoundationTraceRequest;
  readonly lockedSettlementFact: FxFoundationFact<LockedHistoricalFxCashSettlement>;
  readonly currentRateFact: FxFoundationFact<CountryFxRate>;
  readonly currentRoundingFact: FxFoundationFact<FxRoundingDecision>;
  readonly revaluationFact: FxFoundationFact<HistoricalFxRevaluationRequest>;
  readonly outputRef: string;
}): HistoricalFxRevaluationResult {
  const lockedSettlement = lockedHistoricalSettlement(
    foundationFactPayload(
      input.trace,
      input.lockedSettlementFact,
      'lockedSettlement',
    ),
    'lockedSettlement',
  );
  const currentRate = normalizedRate(
    foundationFactPayload(input.trace, input.currentRateFact, 'currentRate'),
    input.trace,
    'currentRate',
  );
  const currentRounding = normalizedRounding(
    foundationFactPayload(
      input.trace,
      input.currentRoundingFact,
      'currentRounding',
    ),
    input.trace,
    'currentRounding',
  );
  const revaluation = foundationFactPayload(
    input.trace,
    input.revaluationFact,
    'revaluation',
  );
  const revaluationRef = stableReference(
    revaluation.revaluationRef,
    'revaluation.revaluationRef',
  );
  stableReference(
    revaluation.revaluationVersion,
    'revaluation.revaluationVersion',
  );
  if (
    stableReference(revaluation.settlementRef, 'revaluation.settlementRef') !==
    lockedSettlement.settlementRef
  ) {
    kernelInvalid(
      'Revaluation settlementRef must match the locked historical cash settlement',
    );
  }
  boundTick(revaluation.valuationAt, input.trace, 'revaluation.valuationAt');
  if (
    currentRate.countryRef !== lockedSettlement.payerCountryRef ||
    currentRate.localCurrency !== lockedSettlement.domesticCash.currency
  ) {
    kernelInvalid(
      'Current revaluation rate must match the locked payer country and domestic currency',
    );
  }
  const currentMarkedGcuValue = renderMoney(
    nonNegative(
      rounded(
        money(
          lockedSettlement.domesticCash,
          'lockedSettlement.domesticCash',
        ).amount.times(
          positive(
            currentRate.globalPerLocalUnit,
            'currentRate.globalPerLocalUnit',
          ),
        ),
        currentRounding,
      ),
      'current marked GCU value',
    ),
    FX_GLOBAL_CURRENCY,
  );
  const lockedAmount = money(
    lockedSettlement.lockedGcuCash,
    'lockedSettlement.lockedGcuCash',
  ).amount;
  const currentAmount = money(
    currentMarkedGcuValue,
    'currentMarkedGcuValue',
  ).amount;
  const inputRefs = [
    input.lockedSettlementFact.factRef,
    input.currentRateFact.factRef,
    input.currentRoundingFact.factRef,
    input.revaluationFact.factRef,
  ];
  const revaluationTrace = transition({
    transitionRef: `${revaluationRef}.separate_revaluation`,
    inputRefs,
    outputRef: `${input.outputRef}.revaluation`,
    before: lockedSettlement.lockedGcuCash,
    delta: renderMoney(currentAmount.minus(lockedAmount), FX_GLOBAL_CURRENCY),
    after: currentMarkedGcuValue,
  });
  return Object.freeze({
    foundationStatus: FX_INTERNATIONAL_FOUNDATION_STATUS,
    lockedSettlement,
    currentMarkedGcuValue,
    revaluationTrace,
    replayProof: replayProof({
      module: 'V20_HISTORICAL_REVALUATION',
      trace: input.trace,
      facts: [
        input.lockedSettlementFact,
        input.currentRateFact,
        input.currentRoundingFact,
        input.revaluationFact,
      ],
      outputRef: input.outputRef,
      transitions: [revaluationTrace],
    }),
  });
}
