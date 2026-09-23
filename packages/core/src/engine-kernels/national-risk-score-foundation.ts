import { DomainError } from '../errors.js';
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
} from './foundation-provenance.js';
import {
  kernelInvalid,
  decimal,
  money,
  nonNegative,
  nonNegativeQuantity,
  render,
  renderMoney,
  renderQuantity,
  type ExactMoney,
  type ExactQuantity,
  type WorldDecimalValue,
} from './common.js';
import {
  NationalAccountsReconciliationError,
  type NationalAccountsBasis,
} from './national-accounts-production-foundation.js';
import {
  prepareExpenditureCurrentAccount,
  prepareFixedBasketCpi,
  type CurrentAccountInput,
  type FixedBasketCpiInput,
} from './national-accounts-reconciliation-foundation.js';

/** Risk and score are derived read-only candidates, never economic inputs. */
export const NATIONAL_RISK_SCORE_STATUS = 'PREPARATION_ONLY' as const;
export type AccountMetricRef =
  'PRODUCTION_GDP' | 'CURRENT_ACCOUNT' | 'CPI_COST_CHANGE';

export interface AccountMetricStatement {
  readonly kind: 'ACCOUNT_DERIVED_METRIC';
  readonly basis: NationalAccountsBasis;
  readonly metricRef: AccountMetricRef;
  readonly initialValue: ExactMoney;
  readonly currentValue: ExactMoney;
  readonly initialVersionRef: string;
  readonly initialReceiptRef: string;
  readonly currentSourceFactRef: string;
  readonly currentReceiptRef: string;
}

export interface RiskRule {
  readonly riskRef: string;
  readonly metricRef: AccountMetricRef;
  readonly comparison: 'ABOVE_OR_EQUAL' | 'BELOW_OR_EQUAL';
  readonly threshold: ExactMoney;
  readonly ruleReceiptRef: string;
}

export interface RiskPolicyStatement {
  readonly kind: 'CANDIDATE_RISK_POLICY';
  readonly basis: NationalAccountsBasis;
  readonly policyVersionRef: string;
  readonly policyReceiptRef: string;
  readonly rules: readonly RiskRule[];
}

export interface ScoreTerm {
  readonly metricRef: AccountMetricRef;
  readonly direction: 'HIGHER_BETTER' | 'LOWER_BETTER';
  readonly slopePointsPerCurrencyUnit: string;
  readonly termReceiptRef: string;
}

export interface ScoreGuardrail {
  readonly riskRef: string;
  readonly cap: ExactQuantity;
  readonly guardrailReceiptRef: string;
}

export interface ScorePolicyStatement {
  readonly kind: 'CANDIDATE_SCORE_POLICY';
  readonly basis: NationalAccountsBasis;
  readonly candidateScoreVersionRef: string;
  readonly policyReceiptRef: string;
  readonly baseScore: ExactQuantity;
  readonly terms: readonly ScoreTerm[];
  readonly guardrails: readonly ScoreGuardrail[];
}

export interface RiskExplanation {
  readonly riskRef: string;
  readonly metricRef: AccountMetricRef;
  readonly comparison: RiskRule['comparison'];
  readonly actual: ExactMoney;
  readonly threshold: ExactMoney;
  readonly actualMinusThreshold: ExactMoney;
  readonly triggered: boolean;
  readonly metricFactRef: string;
  readonly riskPolicyFactRef: string;
  readonly sourceFactRef: string;
  readonly currentReceiptRef: string;
  readonly ruleReceiptRef: string;
}

export interface ScoreContribution {
  readonly metricRef: AccountMetricRef;
  readonly metricFactRef: string;
  readonly initialReceiptRef: string;
  readonly currentReceiptRef: string;
  readonly termReceiptRef: string;
  readonly initialValue: ExactMoney;
  readonly currentValue: ExactMoney;
  readonly currentMinusInitial: ExactMoney;
  readonly slopePointsPerCurrencyUnit: string;
  readonly direction: ScoreTerm['direction'];
  readonly points: ExactQuantity;
}

export interface AccountErrorCandidate {
  readonly status: 'ACCOUNT_ERROR';
  readonly score: null;
  readonly riskFlags: readonly [];
  readonly diagnostic: {
    readonly code: string;
    readonly message: string;
    readonly productionGdp?: ExactMoney;
    readonly expenditureGdp?: ExactMoney;
    readonly difference?: ExactMoney;
  };
  readonly hashInput: string;
}

export interface RiskScoreCandidate {
  readonly status: typeof NATIONAL_RISK_SCORE_STATUS;
  readonly basis: NationalAccountsBasis;
  readonly candidateScoreVersionRef: string;
  readonly riskPolicyVersionRef: string;
  readonly riskFlags: readonly RiskExplanation[];
  readonly scoreContributions: readonly ScoreContribution[];
  readonly baseScore: ExactQuantity;
  readonly scoreBeforeGuardrails: ExactQuantity;
  readonly guardrailReduction: ExactQuantity;
  readonly candidateScore: ExactQuantity;
  readonly accountSourceHashInputs: {
    readonly currentAccount: string;
    readonly cpi: string;
  };
  readonly inputFacts: readonly FoundationFactBinding[];
  readonly hashInput: string;
}

export type RiskScorePreparation = AccountErrorCandidate | RiskScoreCandidate;

export interface RiskScoreInput {
  readonly currentAccountInput: CurrentAccountInput;
  readonly cpiInput: FixedBasketCpiInput;
  readonly metricFacts: readonly FoundationFact<AccountMetricStatement>[];
  readonly riskPolicyFact: FoundationFact<RiskPolicyStatement>;
  readonly scorePolicyFact: FoundationFact<ScorePolicyStatement>;
}

const REF = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u;
const METRICS: readonly AccountMetricRef[] = [
  'PRODUCTION_GDP',
  'CURRENT_ACCOUNT',
  'CPI_COST_CHANGE',
];

function ref(value: string, label: string): string {
  if (!REF.test(value)) kernelInvalid(`${label} must be a stable reference`);
  return value;
}

function sameBasis(
  expected: NationalAccountsBasis,
  actual: NationalAccountsBasis,
  label: string,
): void {
  if (canonicalSerialize(expected) !== canonicalSerialize(actual))
    kernelInvalid(`${label} country, period, currency or version mismatch`);
}

function amount(
  value: ExactMoney,
  currency: string,
  label: string,
): WorldDecimalValue {
  const parsed = money(value, label);
  if (parsed.currency !== currency) kernelInvalid(`${label} currency mismatch`);
  return parsed.amount;
}

function points(value: ExactQuantity, label: string): WorldDecimalValue {
  const parsed = nonNegativeQuantity(value, 'score_point', label).amount;
  if (parsed.greaterThan(100))
    kernelInvalid(`${label} must not exceed 100 score points`);
  return parsed;
}

function exactRefs(
  declared: readonly string[],
  expected: readonly string[],
  label: string,
): void {
  const refs = declared.map((value) => ref(value, label));
  if (
    new Set(refs).size !== refs.length ||
    canonicalSerialize([...refs].sort()) !==
      canonicalSerialize([...expected].sort())
  )
    kernelInvalid(`${label} must match the complete causal predecessor set`);
}

function accountError(
  error: NationalAccountsReconciliationError | DomainError,
): AccountErrorCandidate {
  const diagnostic =
    error instanceof NationalAccountsReconciliationError
      ? Object.freeze({
          code: error.code,
          message: error.message,
          productionGdp: error.productionGdp,
          expenditureGdp: error.expenditureGdp,
          difference: error.difference,
        })
      : Object.freeze({ code: error.code, message: error.message });
  const body = Object.freeze({
    status: 'ACCOUNT_ERROR' as const,
    score: null,
    riskFlags: Object.freeze([]) as readonly [],
    diagnostic,
  });
  return Object.freeze({ ...body, hashInput: canonicalHashInput(body) });
}

/** Account errors isolate score/risk; policy errors after account validation fail closed. */
export function prepareNationalRiskScore(
  input: RiskScoreInput,
): RiskScorePreparation {
  let currentAccount: ReturnType<typeof prepareExpenditureCurrentAccount>;
  let cpi: ReturnType<typeof prepareFixedBasketCpi>;
  let basis: NationalAccountsBasis;
  let accountFactRefs: Set<string>;
  try {
    currentAccount = prepareExpenditureCurrentAccount(
      input.currentAccountInput,
    );
    cpi = prepareFixedBasketCpi(input.cpiInput);
    const accountTrace = input.currentAccountInput.trace;
    if (
      canonicalSerialize(accountTrace.snapshot) !==
        canonicalSerialize(input.cpiInput.trace.snapshot) ||
      canonicalSerialize(accountTrace.snapshotAt) !==
        canonicalSerialize(input.cpiInput.trace.snapshotAt)
    )
      kernelInvalid(
        'Risk/score inputs must share one snapshot and simulation tick',
      );
    basis = currentAccount.basis;
    sameBasis(basis, cpi.basis, 'CPI');
    const contributionTotal = cpi.contributions.reduce(
      (sum, line) =>
        assertWorldDecimalResult(
          sum.plus(amount(line.costChange, basis.currency, 'CPI contribution')),
        ),
      nonNegative('0', 'zero'),
    );
    if (
      !contributionTotal.equals(
        amount(cpi.headlineCostChange, basis.currency, 'CPI headline'),
      ) ||
      cpi.contributions.some(
        (line) =>
          line.contributionToHeadlineInflation.denominator !==
          cpi.headlineInflation.denominator,
      )
    )
      kernelInvalid('CPI contributions must reconcile exactly to headline');
    const accountRefs = [
      input.currentAccountInput.completenessFact.factRef,
      ...input.currentAccountInput.sectorFacts.map((fact) => fact.factRef),
      ...input.currentAccountInput.productTaxFacts.map((fact) => fact.factRef),
      ...input.currentAccountInput.productSubsidyFacts.map(
        (fact) => fact.factRef,
      ),
      input.currentAccountInput.expenditureFact.factRef,
      input.currentAccountInput.eligibilityFact.factRef,
      input.currentAccountInput.externalClosureFact.factRef,
      ...input.currentAccountInput.externalFlowFacts.map(
        (fact) => fact.factRef,
      ),
      input.cpiInput.closureFact.factRef,
      ...input.cpiInput.categoryFacts.map((fact) => fact.factRef),
    ];
    accountFactRefs = new Set(accountRefs);
    if (accountFactRefs.size !== accountRefs.length)
      kernelInvalid('Account and CPI facts must not reuse fact references');
  } catch (error) {
    if (
      error instanceof NationalAccountsReconciliationError ||
      error instanceof DomainError
    )
      return accountError(error);
    throw error;
  }
  const trace = input.currentAccountInput.trace;
  if (input.metricFacts.length !== METRICS.length)
    kernelInvalid('Risk/score requires the three account-bound metrics');
  const sortedMetrics = [...input.metricFacts].sort((left, right) =>
    left.factRef.localeCompare(right.factRef),
  );
  const metricRefs = sortedMetrics.map((fact) =>
    ref(fact.factRef, 'metric fact'),
  );
  if (new Set(metricRefs).size !== metricRefs.length)
    kernelInvalid('Metric fact references must be unique');
  const riskPolicy = foundationFactPayload(
    trace,
    input.riskPolicyFact,
    'risk policy',
  );
  const scorePolicy = foundationFactPayload(
    trace,
    input.scorePolicyFact,
    'score policy',
  );
  if (
    riskPolicy.kind !== 'CANDIDATE_RISK_POLICY' ||
    scorePolicy.kind !== 'CANDIDATE_SCORE_POLICY'
  )
    kernelInvalid('Risk and score policies must be explicit candidate facts');
  sameBasis(basis, riskPolicy.basis, 'risk policy');
  sameBasis(basis, scorePolicy.basis, 'score policy');
  exactRefs(
    input.riskPolicyFact.predecessorFactRefs,
    metricRefs,
    'risk policy predecessors',
  );
  exactRefs(
    input.scorePolicyFact.predecessorFactRefs,
    [input.riskPolicyFact.factRef, ...metricRefs],
    'score policy predecessors',
  );
  const evidenceFacts: readonly FoundationFact<unknown>[] = [
    ...sortedMetrics,
    input.riskPolicyFact,
    input.scorePolicyFact,
  ];
  const inputFacts = Object.freeze(
    evidenceFacts.map((fact, index) =>
      foundationFactBinding(trace, fact, `risk-score.fact[${index}]`),
    ),
  );
  if (
    new Set(inputFacts.map((fact) => fact.factRef)).size !== inputFacts.length
  )
    kernelInvalid('Risk/score source fact references must be unique');
  if (inputFacts.some((fact) => accountFactRefs.has(fact.factRef)))
    kernelInvalid(
      'Risk/score policy or metric fact reuses an account source fact reference',
    );
  ref(riskPolicy.policyVersionRef, 'risk policy version');
  ref(riskPolicy.policyReceiptRef, 'risk policy receipt');
  const candidateScoreVersionRef = ref(
    scorePolicy.candidateScoreVersionRef,
    'candidate score version',
  );
  ref(scorePolicy.policyReceiptRef, 'score policy receipt');
  const sourceExpectations = {
    PRODUCTION_GDP: {
      value: currentAccount.expenditureReconciliation.productionGdp,
      factRef: input.currentAccountInput.completenessFact.factRef,
      receiptRef:
        input.currentAccountInput.completenessFact.payload.closureReceiptRef,
    },
    CURRENT_ACCOUNT: {
      value: currentAccount.currentAccount,
      factRef: input.currentAccountInput.externalClosureFact.factRef,
      receiptRef:
        input.currentAccountInput.externalClosureFact.payload.closureReceiptRef,
    },
    CPI_COST_CHANGE: {
      value: cpi.headlineCostChange,
      factRef: input.cpiInput.closureFact.factRef,
      receiptRef: input.cpiInput.closureFact.payload.closureReceiptRef,
    },
  } as const;
  const metrics = new Map<
    AccountMetricRef,
    {
      readonly fact: FoundationFact<AccountMetricStatement>;
      readonly payload: AccountMetricStatement;
      readonly current: WorldDecimalValue;
      readonly initial: WorldDecimalValue;
    }
  >();
  for (const fact of sortedMetrics) {
    const payload = foundationFactPayload(trace, fact, 'account metric');
    if (
      payload.kind !== 'ACCOUNT_DERIVED_METRIC' ||
      !METRICS.includes(payload.metricRef) ||
      metrics.has(payload.metricRef)
    )
      kernelInvalid('Risk/score metric family must be complete and unique');
    sameBasis(basis, payload.basis, 'account metric');
    const expected = sourceExpectations[payload.metricRef];
    if (
      ref(payload.currentSourceFactRef, 'current source fact') !==
        expected.factRef ||
      ref(payload.currentReceiptRef, 'current receipt') !==
        expected.receiptRef ||
      !amount(payload.currentValue, basis.currency, 'current metric').equals(
        amount(expected.value, basis.currency, 'recomputed account'),
      )
    )
      kernelInvalid(
        'Metric must equal the recomputed account/CPI quantity and closure receipt',
      );
    ref(payload.initialVersionRef, 'initial version');
    ref(payload.initialReceiptRef, 'initial receipt');
    metrics.set(payload.metricRef, {
      fact,
      payload,
      current: amount(payload.currentValue, basis.currency, 'current metric'),
      initial: amount(payload.initialValue, basis.currency, 'initial metric'),
    });
  }
  if (METRICS.some((metric) => !metrics.has(metric)))
    kernelInvalid('Risk/score account metric is missing');
  const risks = riskPolicy.rules
    .map((rule) => {
      const riskRef = ref(rule.riskRef, 'riskRef');
      const metric = metrics.get(rule.metricRef);
      if (!metric) kernelInvalid('Risk rule requires a bound account metric');
      const threshold = amount(
        rule.threshold,
        basis.currency,
        'risk threshold',
      );
      if (
        rule.comparison !== 'ABOVE_OR_EQUAL' &&
        rule.comparison !== 'BELOW_OR_EQUAL'
      )
        kernelInvalid('Risk comparison must be explicit');
      return Object.freeze({
        riskRef,
        metricRef: rule.metricRef,
        comparison: rule.comparison,
        actual: renderMoney(metric.current, basis.currency),
        threshold: renderMoney(threshold, basis.currency),
        actualMinusThreshold: renderMoney(
          assertWorldDecimalResult(metric.current.minus(threshold)),
          basis.currency,
        ),
        triggered:
          rule.comparison === 'ABOVE_OR_EQUAL'
            ? metric.current.greaterThanOrEqualTo(threshold)
            : metric.current.lessThanOrEqualTo(threshold),
        metricFactRef: metric.fact.factRef,
        riskPolicyFactRef: input.riskPolicyFact.factRef,
        sourceFactRef: metric.payload.currentSourceFactRef,
        currentReceiptRef: metric.payload.currentReceiptRef,
        ruleReceiptRef: ref(rule.ruleReceiptRef, 'risk rule receipt'),
      });
    })
    .sort((left, right) => left.riskRef.localeCompare(right.riskRef));
  if (new Set(risks.map((risk) => risk.riskRef)).size !== risks.length)
    kernelInvalid('Risk references must be unique');
  if (scorePolicy.terms.length !== METRICS.length)
    kernelInvalid('Score policy needs one term per account metric');
  const seenTerms = new Set<AccountMetricRef>();
  const scoreContributions = scorePolicy.terms
    .map((term) => {
      const metric = metrics.get(term.metricRef);
      if (!metric || seenTerms.has(term.metricRef))
        kernelInvalid('Score terms must map each account metric exactly once');
      seenTerms.add(term.metricRef);
      if (
        term.direction !== 'HIGHER_BETTER' &&
        term.direction !== 'LOWER_BETTER'
      )
        kernelInvalid('Score direction must be explicit');
      const slope = nonNegative(term.slopePointsPerCurrencyUnit, 'score slope');
      const delta = assertWorldDecimalResult(
        metric.current.minus(metric.initial),
      );
      const signed =
        term.direction === 'HIGHER_BETTER' ? delta : delta.negated();
      const contribution = assertWorldDecimalResult(signed.times(slope));
      return Object.freeze({
        metricRef: term.metricRef,
        metricFactRef: metric.fact.factRef,
        initialReceiptRef: metric.payload.initialReceiptRef,
        currentReceiptRef: metric.payload.currentReceiptRef,
        termReceiptRef: ref(term.termReceiptRef, 'score term receipt'),
        initialValue: renderMoney(metric.initial, basis.currency),
        currentValue: renderMoney(metric.current, basis.currency),
        currentMinusInitial: renderMoney(delta, basis.currency),
        slopePointsPerCurrencyUnit: render(slope),
        direction: term.direction,
        points: renderQuantity(contribution, 'score_point'),
      });
    })
    .sort((left, right) => left.metricRef.localeCompare(right.metricRef));
  const base = points(scorePolicy.baseScore, 'base score');
  const raw = scoreContributions.reduce(
    (total, line) =>
      assertWorldDecimalResult(
        total.plus(decimal(line.points.amount, 'score contribution')),
      ),
    base,
  );
  if (raw.isNegative() || raw.greaterThan(100))
    kernelInvalid(
      'Candidate score outside [0,100]; policy must not hide clipping',
    );
  let capped = raw;
  const seenGuardrails = new Set<string>();
  for (const guardrail of scorePolicy.guardrails) {
    const riskRef = ref(guardrail.riskRef, 'guardrail risk');
    if (seenGuardrails.has(riskRef))
      kernelInvalid('Guardrail risk must be unique');
    seenGuardrails.add(riskRef);
    const risk = risks.find((item) => item.riskRef === riskRef);
    if (!risk) kernelInvalid('Guardrail must reference a defined risk');
    ref(guardrail.guardrailReceiptRef, 'guardrail receipt');
    const cap = points(guardrail.cap, 'guardrail cap');
    if (risk.triggered && cap.lessThan(capped)) capped = cap;
  }
  const output = Object.freeze({
    status: NATIONAL_RISK_SCORE_STATUS,
    basis,
    candidateScoreVersionRef,
    riskPolicyVersionRef: riskPolicy.policyVersionRef,
    riskFlags: Object.freeze(risks),
    scoreContributions: Object.freeze(scoreContributions),
    baseScore: renderQuantity(base, 'score_point'),
    scoreBeforeGuardrails: renderQuantity(raw, 'score_point'),
    guardrailReduction: renderQuantity(
      assertWorldDecimalResult(raw.minus(capped)),
      'score_point',
    ),
    candidateScore: renderQuantity(capped, 'score_point'),
    accountSourceHashInputs: Object.freeze({
      currentAccount: currentAccount.hashInput,
      cpi: cpi.hashInput,
    }),
    inputFacts,
  });
  return Object.freeze({ ...output, hashInput: canonicalHashInput(output) });
}

export function assertNationalRiskScoreReplay(
  input: RiskScoreInput,
  expected: RiskScorePreparation,
): void {
  if (
    canonicalSerialize(prepareNationalRiskScore(input)) !==
    canonicalSerialize(expected)
  )
    kernelInvalid('Risk/score replay does not match supplied facts');
}
