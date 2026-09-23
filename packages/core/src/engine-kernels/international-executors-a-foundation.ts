import { assertWorldDecimalResult } from '../numeric/world-decimal.js';
import { COMMODITY_REGISTRY } from '../registries/fixed-catalog.js';
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
  nonNegative,
  nonNegativeQuantity,
  positive,
  quantity,
  renderMoney,
  renderQuantity,
  type ExactMoney,
  type ExactQuantity,
  type WorldDecimalValue,
} from './common.js';
import type { InternationalContractFoundationSnapshot } from './international-contract-foundation.js';

/** Five composable effect calculations; no authoritative execution or posting. */
export const INTERNATIONAL_EXECUTORS_A_FOUNDATION_STATUS =
  'FOUNDATION_IMPLEMENTED_UNVERIFIED' as const;

export type InternationalExecutorAFact<T> = FoundationFact<T>;
export type InternationalExecutorATrace = FoundationTraceRequest;
export type ExecutorAKind =
  | 'COMMODITY_AGREEMENT'
  | 'FDI'
  | 'SOVEREIGN_LOAN'
  | 'INFRASTRUCTURE_FINANCE'
  | 'RESOURCE_DEVELOPMENT';

export interface ExecutorAContext {
  readonly executionRef: string;
  readonly contractRef: string;
  readonly contractStateRef: string;
  readonly contractVersionRef: string;
  readonly fromPartyRef: string;
  readonly toPartyRef: string;
  readonly executedAt: ExactQuantity;
  /** Caller-attested uniqueness witness; the authoritative writer persists it. */
  readonly previouslyAppliedExecutionRefs: readonly string[];
}

export interface ExecutorATransition {
  readonly transitionRef: string;
  readonly domain:
    | 'CASH'
    | 'GOODS'
    | 'DEBT_ASSET'
    | 'DEBT_LIABILITY'
    | 'EQUITY_ASSET'
    | 'EQUITY_LIABILITY'
    | 'RESOURCE_RIGHT';
  readonly ownerRef: string;
  readonly causalFactRefs: readonly string[];
  readonly before: ExactMoney | ExactQuantity;
  readonly delta: ExactMoney | ExactQuantity;
  readonly after: ExactMoney | ExactQuantity;
}

export interface ExecutorAReplayProof {
  readonly module: 'V22_2_EXECUTOR_A';
  readonly kind: ExecutorAKind;
  readonly traceRef: string;
  readonly calculationVersion: string;
  readonly snapshot: FoundationSnapshotBinding;
  readonly snapshotAt: ExactQuantity;
  readonly inputFacts: readonly FoundationFactBinding[];
  readonly outputRef: string;
  readonly canonicalOutput: string;
  /** Canonical SHA-256 preimage, not a stored digest or commit receipt. */
  readonly hashInput: string;
}

export interface ExecutorAResult<T> {
  readonly foundationStatus: typeof INTERNATIONAL_EXECUTORS_A_FOUNDATION_STATUS;
  readonly kind: ExecutorAKind;
  readonly after: T;
  readonly transitions: readonly ExecutorATransition[];
  readonly replayProof: ExecutorAReplayProof;
}

export interface CommodityAgreementTerms extends ExecutorAContext {
  readonly commodityId: string;
  readonly goodsQuantity: ExactQuantity;
  readonly cashPayment: ExactMoney;
  readonly deliveryEvidenceRef: string;
  readonly paymentEvidenceRef: string;
}

export interface CommodityAgreementState {
  readonly sellerPartyRef: string;
  readonly buyerPartyRef: string;
  readonly commodityId: string;
  readonly sellerCommittedGoods: ExactQuantity;
  readonly buyerReceivedGoods: ExactQuantity;
  readonly buyerCash: ExactMoney;
  readonly sellerCash: ExactMoney;
}

export interface FdiTerms extends ExecutorAContext {
  readonly cashContribution: ExactMoney;
  readonly issuedShares: ExactQuantity;
  readonly ownershipInstrumentRef: string;
}

export interface FdiState {
  readonly investorPartyRef: string;
  readonly targetPartyRef: string;
  readonly investorCash: ExactMoney;
  readonly targetCash: ExactMoney;
  readonly totalIssuedShares: ExactQuantity;
  readonly foreignInvestorShares: ExactQuantity;
  readonly domesticHolderShares: ExactQuantity;
}

export interface SovereignLoanTerms extends ExecutorAContext {
  readonly principal: ExactMoney;
  readonly debtInstrumentRef: string;
}

export interface SovereignLoanState {
  readonly lenderPartyRef: string;
  readonly borrowerPartyRef: string;
  readonly lenderCash: ExactMoney;
  readonly borrowerCash: ExactMoney;
  readonly lenderLoanAsset: ExactMoney;
  readonly borrowerLoanLiability: ExactMoney;
}

export interface InfrastructureFinanceTerms extends ExecutorAContext {
  readonly mode: 'DEBT' | 'EQUITY';
  readonly cashContribution: ExactMoney;
  readonly claimIncrease: ExactMoney | null;
  readonly issuedShares: ExactQuantity | null;
  readonly projectRef: string;
}

export interface InfrastructureFinanceState {
  readonly financierPartyRef: string;
  readonly projectPartyRef: string;
  readonly financierCash: ExactMoney;
  readonly projectCash: ExactMoney;
  readonly financierDebtAsset: ExactMoney;
  readonly projectDebtLiability: ExactMoney;
  readonly totalIssuedShares: ExactQuantity;
  readonly financierShares: ExactQuantity;
  readonly domesticHolderShares: ExactQuantity;
}

export interface ResourceDevelopmentTerms extends ExecutorAContext {
  readonly cashContribution: ExactMoney;
  readonly rightShareTransferred: ExactQuantity;
  readonly resourceAssetRef: string;
  readonly developmentRightRef: string;
}

export interface ResourceDevelopmentState {
  readonly foreignPartyRef: string;
  readonly hostPartyRef: string;
  readonly resourceAssetRef: string;
  readonly foreignCash: ExactMoney;
  readonly hostCash: ExactMoney;
  readonly foreignRightShare: ExactQuantity;
  readonly hostRightShare: ExactQuantity;
  /** Remains unchanged: a right transfer never creates geological resource. */
  readonly geologicalEndowment: ExactQuantity;
}

const REFERENCE = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u;

function ref(value: string, label: string): string {
  if (!REFERENCE.test(value))
    kernelInvalid(`${label} must be a stable reference`);
  return value;
}

function tick(value: ExactQuantity, label: string): WorldDecimalValue {
  const parsed = nonNegativeQuantity(value, 'sim_millisecond', label).amount;
  if (!parsed.isInteger())
    kernelInvalid(`${label} must be an integer sim_millisecond tick`);
  return parsed;
}

function canonicalMoney(value: ExactMoney, label: string): ExactMoney {
  const parsed = money(value, label);
  if (parsed.currency !== 'GCU' || parsed.amount.isNegative()) {
    kernelInvalid(`${label} must be non-negative GCU`);
  }
  return renderMoney(parsed.amount, 'GCU');
}

function canonicalQuantity(
  value: ExactQuantity,
  unit: string,
  label: string,
): ExactQuantity {
  const parsed = quantity(value, label);
  if (parsed.unit !== unit || parsed.amount.isNegative())
    kernelInvalid(`${label} must be non-negative ${unit}`);
  return renderQuantity(parsed.amount, unit);
}

function positiveMoney(value: ExactMoney, label: string): WorldDecimalValue {
  return positive(canonicalMoney(value, label).amount, label);
}

function positiveQuantity(
  value: ExactQuantity,
  unit: string,
  label: string,
): WorldDecimalValue {
  return positive(canonicalQuantity(value, unit, label).amount, label);
}

function commodityUnit(id: string): string {
  if (!COMMODITY_REGISTRY.has(id))
    kernelInvalid(
      'Commodity agreement must use one of the 12 fixed commodities',
    );
  const item = COMMODITY_REGISTRY.get(id);
  if (!('unit' in item) || typeof item.unit !== 'string')
    kernelInvalid('Commodity has no canonical unit');
  return item.unit;
}

function boundedRight(value: ExactQuantity, label: string): WorldDecimalValue {
  const parsed = nonNegativeQuantity(value, 'right_share', label).amount;
  if (parsed.greaterThan(1)) kernelInvalid(`${label} must be a share in [0,1]`);
  return parsed;
}

function pairedIdentity(
  left: WorldDecimalValue,
  right: WorldDecimalValue,
  label: string,
): void {
  if (!left.equals(right)) kernelInvalid(`${label} must balance on both sides`);
}

function shareIdentity(
  total: ExactQuantity,
  foreign: ExactQuantity,
  domestic: ExactQuantity,
): void {
  const totalAmount = nonNegativeQuantity(
    total,
    'share',
    'total issued shares',
  ).amount;
  const foreignAmount = nonNegativeQuantity(
    foreign,
    'share',
    'foreign shares',
  ).amount;
  const domesticAmount = nonNegativeQuantity(
    domestic,
    'share',
    'domestic shares',
  ).amount;
  if (!totalAmount.equals(domesticAmount.plus(foreignAmount))) {
    kernelInvalid('Issued shares must equal domestic plus foreign holdings');
  }
}

function commonContext(
  trace: InternationalExecutorATrace,
  contractFact: InternationalExecutorAFact<InternationalContractFoundationSnapshot>,
  termsFact: InternationalExecutorAFact<ExecutorAContext>,
  expectedActivity: string,
): {
  readonly terms: ExecutorAContext;
  readonly causalFactRefs: readonly string[];
} {
  const contract = foundationFactPayload(trace, contractFact, 'contract');
  const terms = foundationFactPayload(trace, termsFact, 'terms');
  if (
    contract.status !== 'ACTIVE' ||
    contract.activityType !== expectedActivity
  ) {
    kernelInvalid('Executor requires the matching ACTIVE contract activity');
  }
  const contractRef = ref(contract.contractRef, 'contract.contractRef');
  const stateRef = ref(contract.stateRef, 'contract.stateRef');
  const versionRef = ref(contract.versionRef, 'contract.versionRef');
  if (contract.activeSignedVersionRef !== versionRef)
    kernelInvalid('Executor requires the exact active signed contract version');
  if (
    contractRef !== ref(terms.contractRef, 'terms.contractRef') ||
    stateRef !== ref(terms.contractStateRef, 'terms.contractStateRef') ||
    versionRef !== ref(terms.contractVersionRef, 'terms.contractVersionRef')
  )
    kernelInvalid(
      'Execution must bind contract, state and signed version exactly',
    );
  if (
    !contract.structuredTerms.some(
      (term) => term.valueFactRef === termsFact.factRef,
    )
  ) {
    kernelInvalid(
      'Execution terms fact must be referenced by structured contract terms',
    );
  }
  if (!termsFact.predecessorFactRefs.includes(contractFact.factRef)) {
    kernelInvalid('Execution terms must descend from the contract fact');
  }
  const from = ref(terms.fromPartyRef, 'terms.fromPartyRef');
  const to = ref(terms.toPartyRef, 'terms.toPartyRef');
  if (
    from === to ||
    !contract.partyRefs.includes(from) ||
    !contract.partyRefs.includes(to)
  ) {
    kernelInvalid('Execution parties must be distinct contract parties');
  }
  if (
    contract.requiredOfficeRefs.length === 0 ||
    contract.approvals.length !== contract.requiredOfficeRefs.length ||
    contract.approvals.some(
      (approval) =>
        approval.status !== 'APPROVED' ||
        approval.versionRef !== versionRef ||
        approval.decisionRef === null,
    ) ||
    contract.requiredOfficeRefs.some(
      (officeRef) =>
        !contract.approvals.some(
          (approval) => approval.officeRef === officeRef,
        ),
    )
  ) {
    kernelInvalid(
      'ACTIVE contract must carry complete current-version approvals',
    );
  }
  const executionRef = ref(terms.executionRef, 'terms.executionRef');
  const previous = terms.previouslyAppliedExecutionRefs.map((value, index) =>
    ref(value, `previous executions[${index}]`),
  );
  if (
    new Set(previous).size !== previous.length ||
    previous.includes(executionRef)
  ) {
    kernelInvalid(
      'Execution reference already applied or prior witness is duplicated',
    );
  }
  if (
    !tick(terms.executedAt, 'terms.executedAt').equals(
      tick(trace.snapshotAt, 'trace.snapshotAt'),
    )
  ) {
    kernelInvalid('Execution time must equal the replay snapshot tick');
  }
  return Object.freeze({
    terms,
    causalFactRefs: Object.freeze([contractFact.factRef, termsFact.factRef]),
  });
}

function moneyTransition(input: {
  readonly executionRef: string;
  readonly field: string;
  readonly domain: ExecutorATransition['domain'];
  readonly ownerRef: string;
  readonly causalFactRefs: readonly string[];
  readonly before: ExactMoney;
  readonly change: WorldDecimalValue;
}): ExecutorATransition {
  const before = canonicalMoney(input.before, `${input.field}.before`);
  const after = assertWorldDecimalResult(
    nonNegative(before.amount, 'before').plus(input.change),
  );
  if (after.isNegative())
    kernelInvalid(`${input.field} has insufficient cash or asset balance`);
  return Object.freeze({
    transitionRef: ref(`${input.executionRef}.${input.field}`, 'transitionRef'),
    domain: input.domain,
    ownerRef: ref(input.ownerRef, 'transition owner'),
    causalFactRefs: Object.freeze([...input.causalFactRefs]),
    before,
    delta: renderMoney(input.change, 'GCU'),
    after: renderMoney(after, 'GCU'),
  });
}

function quantityTransition(input: {
  readonly executionRef: string;
  readonly field: string;
  readonly domain: ExecutorATransition['domain'];
  readonly ownerRef: string;
  readonly causalFactRefs: readonly string[];
  readonly before: ExactQuantity;
  readonly change: WorldDecimalValue;
  readonly unit: string;
}): ExecutorATransition {
  const before = canonicalQuantity(
    input.before,
    input.unit,
    `${input.field}.before`,
  );
  const after = assertWorldDecimalResult(
    nonNegative(before.amount, 'before').plus(input.change),
  );
  if (after.isNegative())
    kernelInvalid(`${input.field} has insufficient goods or rights`);
  return Object.freeze({
    transitionRef: ref(`${input.executionRef}.${input.field}`, 'transitionRef'),
    domain: input.domain,
    ownerRef: ref(input.ownerRef, 'transition owner'),
    causalFactRefs: Object.freeze([...input.causalFactRefs]),
    before,
    delta: renderQuantity(input.change, input.unit),
    after: renderQuantity(after, input.unit),
  });
}

function pairedCash(input: {
  readonly executionRef: string;
  readonly fromRef: string;
  readonly toRef: string;
  readonly from: ExactMoney;
  readonly to: ExactMoney;
  readonly amount: ExactMoney;
  readonly causalFactRefs: readonly string[];
}): readonly [ExecutorATransition, ExecutorATransition] {
  const amount = positiveMoney(input.amount, 'cash amount');
  return Object.freeze([
    moneyTransition({
      executionRef: input.executionRef,
      field: 'cash.from',
      domain: 'CASH',
      ownerRef: input.fromRef,
      causalFactRefs: input.causalFactRefs,
      before: input.from,
      change: amount.negated(),
    }),
    moneyTransition({
      executionRef: input.executionRef,
      field: 'cash.to',
      domain: 'CASH',
      ownerRef: input.toRef,
      causalFactRefs: input.causalFactRefs,
      before: input.to,
      change: amount,
    }),
  ]);
}

function proof<T>(input: {
  readonly kind: ExecutorAKind;
  readonly trace: InternationalExecutorATrace;
  readonly contractFact: InternationalExecutorAFact<InternationalContractFoundationSnapshot>;
  readonly termsFact: InternationalExecutorAFact<unknown>;
  readonly stateFact: InternationalExecutorAFact<T>;
  readonly outputRef: string;
  readonly after: T;
  readonly transitions: readonly ExecutorATransition[];
}): ExecutorAResult<T> {
  const facts: readonly FoundationFact<unknown>[] = [
    input.contractFact,
    input.termsFact,
    input.stateFact,
  ];
  const inputFacts = Object.freeze(
    facts.map((fact, index) =>
      foundationFactBinding(input.trace, fact, `proof.fact[${index}]`),
    ),
  );
  if (
    new Set(inputFacts.map((fact) => fact.factRef)).size !== inputFacts.length
  )
    kernelInvalid('Executor fact references must be unique');
  const outputRef = ref(input.outputRef, 'outputRef');
  if (inputFacts.some((fact) => fact.factRef === outputRef))
    kernelInvalid('Output reference must differ from input facts');
  const transitionRefs = input.transitions.map((item) => item.transitionRef);
  if (new Set(transitionRefs).size !== transitionRefs.length)
    kernelInvalid('Effect transition references must be unique');
  const transitions = Object.freeze([...input.transitions]);
  const proofBody = {
    module: 'V22_2_EXECUTOR_A' as const,
    kind: input.kind,
    traceRef: ref(input.trace.traceRef, 'traceRef'),
    calculationVersion: ref(
      input.trace.calculationVersion,
      'calculationVersion',
    ),
    snapshot: inputFacts[0]!.snapshot,
    snapshotAt: inputFacts[0]!.observedAt,
    inputFacts,
    outputRef,
    canonicalOutput: canonicalSerialize({ after: input.after, transitions }),
  };
  return Object.freeze({
    foundationStatus: INTERNATIONAL_EXECUTORS_A_FOUNDATION_STATUS,
    kind: input.kind,
    after: Object.freeze(input.after),
    transitions,
    replayProof: Object.freeze({
      ...proofBody,
      hashInput: canonicalHashInput(proofBody),
    }),
  });
}

function factRefs(
  contractRef: string,
  termsRef: string,
  stateRef: string,
): readonly string[] {
  return Object.freeze([contractRef, termsRef, stateRef]);
}

/** Candidate R082 goods and money pair; no customs, title or posting is committed. */
export function prepareCommodityAgreement(input: {
  readonly trace: InternationalExecutorATrace;
  readonly contractFact: InternationalExecutorAFact<InternationalContractFoundationSnapshot>;
  readonly termsFact: InternationalExecutorAFact<CommodityAgreementTerms>;
  readonly stateFact: InternationalExecutorAFact<CommodityAgreementState>;
  readonly outputRef: string;
}): ExecutorAResult<CommodityAgreementState> {
  commonContext(
    input.trace,
    input.contractFact,
    input.termsFact,
    'Commodity Supply Agreement',
  );
  const terms = input.termsFact.payload;
  const state = foundationFactPayload(
    input.trace,
    input.stateFact,
    'commodity state',
  );
  if (
    ref(state.sellerPartyRef, 'sellerPartyRef') !== terms.fromPartyRef ||
    ref(state.buyerPartyRef, 'buyerPartyRef') !== terms.toPartyRef
  )
    kernelInvalid('Commodity parties must match the contract execution');
  if (state.commodityId !== terms.commodityId)
    kernelInvalid('Commodity IDs must match');
  const unit = commodityUnit(terms.commodityId);
  ref(terms.deliveryEvidenceRef, 'deliveryEvidenceRef');
  ref(terms.paymentEvidenceRef, 'paymentEvidenceRef');
  if (terms.deliveryEvidenceRef === terms.paymentEvidenceRef)
    kernelInvalid('Delivery and payment evidence must be distinct');
  const amount = positiveQuantity(terms.goodsQuantity, unit, 'goods quantity');
  const refs = factRefs(
    input.contractFact.factRef,
    input.termsFact.factRef,
    input.stateFact.factRef,
  );
  const cash = pairedCash({
    executionRef: terms.executionRef,
    fromRef: terms.toPartyRef,
    toRef: terms.fromPartyRef,
    from: state.buyerCash,
    to: state.sellerCash,
    amount: terms.cashPayment,
    causalFactRefs: refs,
  });
  const goods = Object.freeze([
    quantityTransition({
      executionRef: terms.executionRef,
      field: 'goods.seller',
      domain: 'GOODS',
      ownerRef: terms.fromPartyRef,
      causalFactRefs: refs,
      before: state.sellerCommittedGoods,
      change: amount.negated(),
      unit,
    }),
    quantityTransition({
      executionRef: terms.executionRef,
      field: 'goods.buyer',
      domain: 'GOODS',
      ownerRef: terms.toPartyRef,
      causalFactRefs: refs,
      before: state.buyerReceivedGoods,
      change: amount,
      unit,
    }),
  ]);
  const transitions = Object.freeze([...cash, ...goods]);
  return proof({
    kind: 'COMMODITY_AGREEMENT',
    trace: input.trace,
    contractFact: input.contractFact,
    termsFact: input.termsFact,
    stateFact: input.stateFact,
    outputRef: input.outputRef,
    after: Object.freeze({
      ...state,
      sellerCommittedGoods: goods[0]!.after as ExactQuantity,
      buyerReceivedGoods: goods[1]!.after as ExactQuantity,
      buyerCash: cash[0]!.after as ExactMoney,
      sellerCash: cash[1]!.after as ExactMoney,
    }),
    transitions,
  });
}

/** Candidate R083 foreign cash plus issued-share ownership, without FDI policy. */
export function prepareFdi(input: {
  readonly trace: InternationalExecutorATrace;
  readonly contractFact: InternationalExecutorAFact<InternationalContractFoundationSnapshot>;
  readonly termsFact: InternationalExecutorAFact<FdiTerms>;
  readonly stateFact: InternationalExecutorAFact<FdiState>;
  readonly outputRef: string;
}): ExecutorAResult<FdiState> {
  commonContext(
    input.trace,
    input.contractFact,
    input.termsFact,
    'Foreign Direct Investment',
  );
  const terms = input.termsFact.payload;
  const state = foundationFactPayload(
    input.trace,
    input.stateFact,
    'FDI state',
  );
  if (
    ref(state.investorPartyRef, 'investorPartyRef') !== terms.fromPartyRef ||
    ref(state.targetPartyRef, 'targetPartyRef') !== terms.toPartyRef
  )
    kernelInvalid('FDI parties must match the contract execution');
  ref(terms.ownershipInstrumentRef, 'ownershipInstrumentRef');
  shareIdentity(
    state.totalIssuedShares,
    state.foreignInvestorShares,
    state.domesticHolderShares,
  );
  const shares = positiveQuantity(terms.issuedShares, 'share', 'issuedShares');
  const refs = factRefs(
    input.contractFact.factRef,
    input.termsFact.factRef,
    input.stateFact.factRef,
  );
  const cash = pairedCash({
    executionRef: terms.executionRef,
    fromRef: terms.fromPartyRef,
    toRef: terms.toPartyRef,
    from: state.investorCash,
    to: state.targetCash,
    amount: terms.cashContribution,
    causalFactRefs: refs,
  });
  const total = quantityTransition({
    executionRef: terms.executionRef,
    field: 'equity.issuer',
    domain: 'EQUITY_LIABILITY',
    ownerRef: terms.toPartyRef,
    causalFactRefs: refs,
    before: state.totalIssuedShares,
    change: shares,
    unit: 'share',
  });
  const foreign = quantityTransition({
    executionRef: terms.executionRef,
    field: 'equity.investor',
    domain: 'EQUITY_ASSET',
    ownerRef: terms.fromPartyRef,
    causalFactRefs: refs,
    before: state.foreignInvestorShares,
    change: shares,
    unit: 'share',
  });
  const after = Object.freeze({
    ...state,
    investorCash: cash[0]!.after as ExactMoney,
    targetCash: cash[1]!.after as ExactMoney,
    totalIssuedShares: total.after as ExactQuantity,
    foreignInvestorShares: foreign.after as ExactQuantity,
    domesticHolderShares: canonicalQuantity(
      state.domesticHolderShares,
      'share',
      'domestic shares',
    ),
  });
  shareIdentity(
    after.totalIssuedShares,
    after.foreignInvestorShares,
    after.domesticHolderShares,
  );
  return proof({
    kind: 'FDI',
    trace: input.trace,
    contractFact: input.contractFact,
    termsFact: input.termsFact,
    stateFact: input.stateFact,
    outputRef: input.outputRef,
    after,
    transitions: [cash[0]!, cash[1]!, total, foreign],
  });
}

/** Candidate R084 cash and exactly paired lender asset/borrower liability. */
export function prepareSovereignLoan(input: {
  readonly trace: InternationalExecutorATrace;
  readonly contractFact: InternationalExecutorAFact<InternationalContractFoundationSnapshot>;
  readonly termsFact: InternationalExecutorAFact<SovereignLoanTerms>;
  readonly stateFact: InternationalExecutorAFact<SovereignLoanState>;
  readonly outputRef: string;
}): ExecutorAResult<SovereignLoanState> {
  commonContext(
    input.trace,
    input.contractFact,
    input.termsFact,
    'Sovereign Loan',
  );
  const terms = input.termsFact.payload;
  const state = foundationFactPayload(
    input.trace,
    input.stateFact,
    'sovereign loan state',
  );
  if (
    ref(state.lenderPartyRef, 'lenderPartyRef') !== terms.fromPartyRef ||
    ref(state.borrowerPartyRef, 'borrowerPartyRef') !== terms.toPartyRef
  )
    kernelInvalid('Loan parties must match the contract execution');
  ref(terms.debtInstrumentRef, 'debtInstrumentRef');
  pairedIdentity(
    nonNegative(
      canonicalMoney(state.lenderLoanAsset, 'lender asset').amount,
      'lender asset',
    ),
    nonNegative(
      canonicalMoney(state.borrowerLoanLiability, 'borrower liability').amount,
      'borrower liability',
    ),
    'Bilateral sovereign debt',
  );
  const principal = positiveMoney(terms.principal, 'principal');
  const refs = factRefs(
    input.contractFact.factRef,
    input.termsFact.factRef,
    input.stateFact.factRef,
  );
  const cash = pairedCash({
    executionRef: terms.executionRef,
    fromRef: terms.fromPartyRef,
    toRef: terms.toPartyRef,
    from: state.lenderCash,
    to: state.borrowerCash,
    amount: terms.principal,
    causalFactRefs: refs,
  });
  const asset = moneyTransition({
    executionRef: terms.executionRef,
    field: 'loan.lender_asset',
    domain: 'DEBT_ASSET',
    ownerRef: terms.fromPartyRef,
    causalFactRefs: refs,
    before: state.lenderLoanAsset,
    change: principal,
  });
  const liability = moneyTransition({
    executionRef: terms.executionRef,
    field: 'loan.borrower_liability',
    domain: 'DEBT_LIABILITY',
    ownerRef: terms.toPartyRef,
    causalFactRefs: refs,
    before: state.borrowerLoanLiability,
    change: principal,
  });
  pairedIdentity(
    nonNegative((asset.after as ExactMoney).amount, 'asset after'),
    nonNegative((liability.after as ExactMoney).amount, 'liability after'),
    'Bilateral sovereign debt',
  );
  return proof({
    kind: 'SOVEREIGN_LOAN',
    trace: input.trace,
    contractFact: input.contractFact,
    termsFact: input.termsFact,
    stateFact: input.stateFact,
    outputRef: input.outputRef,
    after: Object.freeze({
      ...state,
      lenderCash: cash[0]!.after as ExactMoney,
      borrowerCash: cash[1]!.after as ExactMoney,
      lenderLoanAsset: asset.after as ExactMoney,
      borrowerLoanLiability: liability.after as ExactMoney,
    }),
    transitions: [cash[0]!, cash[1]!, asset, liability],
  });
}

/** Caller-selected debt or equity funding; no financing mode is inferred. */
export function prepareInfrastructureFinance(input: {
  readonly trace: InternationalExecutorATrace;
  readonly contractFact: InternationalExecutorAFact<InternationalContractFoundationSnapshot>;
  readonly termsFact: InternationalExecutorAFact<InfrastructureFinanceTerms>;
  readonly stateFact: InternationalExecutorAFact<InfrastructureFinanceState>;
  readonly outputRef: string;
}): ExecutorAResult<InfrastructureFinanceState> {
  commonContext(
    input.trace,
    input.contractFact,
    input.termsFact,
    'Infrastructure Finance',
  );
  const terms = input.termsFact.payload;
  const state = foundationFactPayload(
    input.trace,
    input.stateFact,
    'infrastructure state',
  );
  if (
    ref(state.financierPartyRef, 'financierPartyRef') !== terms.fromPartyRef ||
    ref(state.projectPartyRef, 'projectPartyRef') !== terms.toPartyRef
  )
    kernelInvalid('Infrastructure parties must match the contract execution');
  ref(terms.projectRef, 'projectRef');
  if (terms.mode !== 'DEBT' && terms.mode !== 'EQUITY')
    kernelInvalid('Infrastructure finance mode must be DEBT or EQUITY');
  pairedIdentity(
    nonNegative(
      canonicalMoney(state.financierDebtAsset, 'financier debt').amount,
      'financier debt',
    ),
    nonNegative(
      canonicalMoney(state.projectDebtLiability, 'project debt').amount,
      'project debt',
    ),
    'Infrastructure debt',
  );
  shareIdentity(
    state.totalIssuedShares,
    state.financierShares,
    state.domesticHolderShares,
  );
  const refs = factRefs(
    input.contractFact.factRef,
    input.termsFact.factRef,
    input.stateFact.factRef,
  );
  const cash = pairedCash({
    executionRef: terms.executionRef,
    fromRef: terms.fromPartyRef,
    toRef: terms.toPartyRef,
    from: state.financierCash,
    to: state.projectCash,
    amount: terms.cashContribution,
    causalFactRefs: refs,
  });
  if (terms.mode === 'DEBT') {
    if (terms.claimIncrease === null || terms.issuedShares !== null)
      kernelInvalid(
        'Debt finance requires claim increase and no issued shares',
      );
    const amount = positiveMoney(terms.claimIncrease, 'infrastructure claim');
    const asset = moneyTransition({
      executionRef: terms.executionRef,
      field: 'infrastructure.asset',
      domain: 'DEBT_ASSET',
      ownerRef: terms.fromPartyRef,
      causalFactRefs: refs,
      before: state.financierDebtAsset,
      change: amount,
    });
    const liability = moneyTransition({
      executionRef: terms.executionRef,
      field: 'infrastructure.liability',
      domain: 'DEBT_LIABILITY',
      ownerRef: terms.toPartyRef,
      causalFactRefs: refs,
      before: state.projectDebtLiability,
      change: amount,
    });
    const after = Object.freeze({
      ...state,
      financierCash: cash[0]!.after as ExactMoney,
      projectCash: cash[1]!.after as ExactMoney,
      financierDebtAsset: asset.after as ExactMoney,
      projectDebtLiability: liability.after as ExactMoney,
    });
    return proof({
      kind: 'INFRASTRUCTURE_FINANCE',
      trace: input.trace,
      contractFact: input.contractFact,
      termsFact: input.termsFact,
      stateFact: input.stateFact,
      outputRef: input.outputRef,
      after,
      transitions: [cash[0]!, cash[1]!, asset, liability],
    });
  }
  if (terms.issuedShares === null || terms.claimIncrease !== null)
    kernelInvalid('Equity finance requires issued shares and no debt claim');
  const shares = positiveQuantity(
    terms.issuedShares,
    'share',
    'infrastructure shares',
  );
  const issued = quantityTransition({
    executionRef: terms.executionRef,
    field: 'infrastructure.issued_shares',
    domain: 'EQUITY_LIABILITY',
    ownerRef: terms.toPartyRef,
    causalFactRefs: refs,
    before: state.totalIssuedShares,
    change: shares,
    unit: 'share',
  });
  const owned = quantityTransition({
    executionRef: terms.executionRef,
    field: 'infrastructure.financier_shares',
    domain: 'EQUITY_ASSET',
    ownerRef: terms.fromPartyRef,
    causalFactRefs: refs,
    before: state.financierShares,
    change: shares,
    unit: 'share',
  });
  const after = Object.freeze({
    ...state,
    financierCash: cash[0]!.after as ExactMoney,
    projectCash: cash[1]!.after as ExactMoney,
    totalIssuedShares: issued.after as ExactQuantity,
    financierShares: owned.after as ExactQuantity,
    domesticHolderShares: canonicalQuantity(
      state.domesticHolderShares,
      'share',
      'domestic shares',
    ),
  });
  shareIdentity(
    after.totalIssuedShares,
    after.financierShares,
    after.domesticHolderShares,
  );
  return proof({
    kind: 'INFRASTRUCTURE_FINANCE',
    trace: input.trace,
    contractFact: input.contractFact,
    termsFact: input.termsFact,
    stateFact: input.stateFact,
    outputRef: input.outputRef,
    after,
    transitions: [cash[0]!, cash[1]!, issued, owned],
  });
}

/** Cash and bounded right transfer; geological resource remains unchanged. */
export function prepareResourceDevelopment(input: {
  readonly trace: InternationalExecutorATrace;
  readonly contractFact: InternationalExecutorAFact<InternationalContractFoundationSnapshot>;
  readonly termsFact: InternationalExecutorAFact<ResourceDevelopmentTerms>;
  readonly stateFact: InternationalExecutorAFact<ResourceDevelopmentState>;
  readonly outputRef: string;
}): ExecutorAResult<ResourceDevelopmentState> {
  commonContext(
    input.trace,
    input.contractFact,
    input.termsFact,
    'Resource Development Agreement',
  );
  const terms = input.termsFact.payload;
  const state = foundationFactPayload(
    input.trace,
    input.stateFact,
    'resource state',
  );
  if (
    ref(state.foreignPartyRef, 'foreignPartyRef') !== terms.fromPartyRef ||
    ref(state.hostPartyRef, 'hostPartyRef') !== terms.toPartyRef
  )
    kernelInvalid('Resource parties must match the contract execution');
  if (
    ref(state.resourceAssetRef, 'state.resourceAssetRef') !==
    ref(terms.resourceAssetRef, 'terms.resourceAssetRef')
  )
    kernelInvalid('Resource asset reference must match');
  ref(terms.developmentRightRef, 'developmentRightRef');
  const foreignBefore = boundedRight(state.foreignRightShare, 'foreign rights');
  const hostBefore = boundedRight(state.hostRightShare, 'host rights');
  pairedIdentity(
    assertWorldDecimalResult(foreignBefore.plus(hostBefore)),
    nonNegative('1', 'whole rights'),
    'Total resource rights',
  );
  const share = positiveQuantity(
    terms.rightShareTransferred,
    'right_share',
    'transferred rights',
  );
  if (share.greaterThan(1) || share.greaterThan(hostBefore))
    kernelInvalid('Resource right transfer exceeds host share');
  const stock = quantity(state.geologicalEndowment, 'geologicalEndowment');
  canonicalQuantity(
    state.geologicalEndowment,
    stock.unit,
    'geologicalEndowment',
  );
  const refs = factRefs(
    input.contractFact.factRef,
    input.termsFact.factRef,
    input.stateFact.factRef,
  );
  const cash = pairedCash({
    executionRef: terms.executionRef,
    fromRef: terms.fromPartyRef,
    toRef: terms.toPartyRef,
    from: state.foreignCash,
    to: state.hostCash,
    amount: terms.cashContribution,
    causalFactRefs: refs,
  });
  const host = quantityTransition({
    executionRef: terms.executionRef,
    field: 'rights.host',
    domain: 'RESOURCE_RIGHT',
    ownerRef: terms.toPartyRef,
    causalFactRefs: refs,
    before: state.hostRightShare,
    change: share.negated(),
    unit: 'right_share',
  });
  const foreign = quantityTransition({
    executionRef: terms.executionRef,
    field: 'rights.foreign',
    domain: 'RESOURCE_RIGHT',
    ownerRef: terms.fromPartyRef,
    causalFactRefs: refs,
    before: state.foreignRightShare,
    change: share,
    unit: 'right_share',
  });
  const after = Object.freeze({
    ...state,
    foreignCash: cash[0]!.after as ExactMoney,
    hostCash: cash[1]!.after as ExactMoney,
    hostRightShare: host.after as ExactQuantity,
    foreignRightShare: foreign.after as ExactQuantity,
    geologicalEndowment: renderQuantity(stock.amount, stock.unit),
  });
  pairedIdentity(
    assertWorldDecimalResult(
      boundedRight(after.hostRightShare, 'host rights after').plus(
        boundedRight(after.foreignRightShare, 'foreign rights after'),
      ),
    ),
    nonNegative('1', 'whole rights'),
    'Total resource rights',
  );
  return proof({
    kind: 'RESOURCE_DEVELOPMENT',
    trace: input.trace,
    contractFact: input.contractFact,
    termsFact: input.termsFact,
    stateFact: input.stateFact,
    outputRef: input.outputRef,
    after,
    transitions: [cash[0]!, cash[1]!, host, foreign],
  });
}

/** Rebinds inputs and proof preimage; product writers must also enforce idempotency. */
export function assertExecutorAReplayEvidence(
  proof: ExecutorAReplayProof,
  facts: readonly InternationalExecutorAFact<unknown>[],
): void {
  const trace: InternationalExecutorATrace = {
    traceRef: proof.traceRef,
    calculationVersion: proof.calculationVersion,
    snapshot: proof.snapshot,
    snapshotAt: proof.snapshotAt,
  };
  const rebound = facts.map((fact, index) =>
    foundationFactBinding(trace, fact, `replay.fact[${index}]`),
  );
  const { hashInput, ...proofBody } = proof;
  if (
    canonicalSerialize(rebound) !== canonicalSerialize(proof.inputFacts) ||
    canonicalHashInput(proofBody) !== hashInput
  ) {
    kernelInvalid('Executor A replay proof does not match supplied facts');
  }
}
