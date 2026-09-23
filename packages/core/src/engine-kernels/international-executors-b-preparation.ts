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
  addMoney,
  kernelInvalid,
  money,
  nonNegative,
  nonNegativeQuantity,
  positive,
  quantity,
  ratio,
  renderMoney,
  renderQuantity,
  subtractMoney,
  type ExactMoney,
  type ExactQuantity,
  type ExactRatio,
} from './common.js';
import {
  INTERNATIONAL_SUBTYPE_MATRIX,
  validateInternationalActivityType,
  type InternationalActivityType,
  type InternationalSubtypeId,
} from './international-contract-foundation.js';

/** V22.3 parallel preparation only: V22.2 remains a missing hard dependency. */
export const INTERNATIONAL_EXECUTORS_B_PREPARATION_STATUS =
  'PREPARATION_ONLY' as const;

export type InternationalExecutorBPreparationCoverage =
  | 'EXACT_TRANSFER_PREPARATION'
  | 'STRUCTURED_VALIDATION_PREPARATION'
  | 'TYPE_ONLY_PENDING_V22_2';

export interface InternationalExecutorBPreparationCoverageEntry {
  readonly subtypeId: InternationalSubtypeId;
  readonly activityType: InternationalActivityType;
  readonly coverage: InternationalExecutorBPreparationCoverage;
  readonly evidenceRef: string | null;
}

const COVERAGE_BY_SUBTYPE: Readonly<
  Record<InternationalSubtypeId, InternationalExecutorBPreparationCoverage>
> = Object.freeze({
  'INT-01': 'TYPE_ONLY_PENDING_V22_2',
  'INT-02': 'EXACT_TRANSFER_PREPARATION',
  'INT-03': 'TYPE_ONLY_PENDING_V22_2',
  'INT-04': 'TYPE_ONLY_PENDING_V22_2',
  'INT-05': 'TYPE_ONLY_PENDING_V22_2',
  'INT-06': 'TYPE_ONLY_PENDING_V22_2',
  'INT-07': 'EXACT_TRANSFER_PREPARATION',
  'INT-08': 'STRUCTURED_VALIDATION_PREPARATION',
  'INT-09': 'STRUCTURED_VALIDATION_PREPARATION',
  'INT-10': 'STRUCTURED_VALIDATION_PREPARATION',
  'INT-11': 'STRUCTURED_VALIDATION_PREPARATION',
  'INT-12': 'STRUCTURED_VALIDATION_PREPARATION',
  'INT-13': 'EXACT_TRANSFER_PREPARATION',
  'INT-14': 'STRUCTURED_VALIDATION_PREPARATION',
  'INT-15': 'EXACT_TRANSFER_PREPARATION',
  'INT-16': 'EXACT_TRANSFER_PREPARATION',
  'INT-17': 'EXACT_TRANSFER_PREPARATION',
  'INT-18': 'TYPE_ONLY_PENDING_V22_2',
  'INT-19': 'EXACT_TRANSFER_PREPARATION',
  'INT-20': 'EXACT_TRANSFER_PREPARATION',
  'INT-21': 'STRUCTURED_VALIDATION_PREPARATION',
  'INT-22': 'STRUCTURED_VALIDATION_PREPARATION',
  'INT-23': 'EXACT_TRANSFER_PREPARATION',
});

const EVIDENCE_BY_SUBTYPE: Readonly<
  Partial<Record<InternationalSubtypeId, string>>
> = Object.freeze({
  'INT-02': 'calculateTechnologyLicencePreparation',
  'INT-07': 'calculateJointProjectPreparation',
  'INT-08': 'validateTreatyPreparation',
  'INT-09': 'validateTreatyPreparation',
  'INT-10': 'validateTreatyPreparation',
  'INT-11': 'validateTreatyPreparation',
  'INT-12': 'validateTreatyPreparation',
  'INT-13': 'calculateReserveSwapPreparation',
  'INT-14': 'validateSanctionPackagePreparation',
  'INT-15': 'calculateGrantAidPreparation',
  'INT-16': 'calculateCommodityAidPreparation',
  'INT-17': 'calculateEmergencyConcessionalLoanPreparation',
  'INT-19': 'calculateTechnicalAssistancePreparation',
  'INT-20': 'calculateProjectReconstructionAidPreparation',
  'INT-21': 'validateInternationalTenderPreparation',
  'INT-22': 'validateStrategicPartnershipPreparation',
  'INT-23': 'calculateTradeDisputeCompensationPreparation',
});

export const INTERNATIONAL_EXECUTORS_B_PREPARATION_COVERAGE = Object.freeze(
  INTERNATIONAL_SUBTYPE_MATRIX.map((entry) =>
    Object.freeze({
      subtypeId: entry.subtypeId,
      activityType: entry.activityType,
      coverage: COVERAGE_BY_SUBTYPE[entry.subtypeId],
      evidenceRef: EVIDENCE_BY_SUBTYPE[entry.subtypeId] ?? null,
    }),
  ),
);

export type InternationalExecutorBPreparationModule =
  | 'V22_3_TECHNOLOGY_LICENCE'
  | 'V22_3_JOINT_PROJECT'
  | 'V22_3_TREATY_VALIDATION'
  | 'V22_3_RESERVE_SWAP'
  | 'V22_3_SANCTION_VALIDATION'
  | 'V22_3_GRANT_AID'
  | 'V22_3_COMMODITY_AID'
  | 'V22_3_CONCESSIONAL_LOAN'
  | 'V22_3_TECHNICAL_ASSISTANCE'
  | 'V22_3_RECONSTRUCTION_AID'
  | 'V22_3_TENDER_VALIDATION'
  | 'V22_3_STRATEGIC_PARTNERSHIP_VALIDATION'
  | 'V22_3_DISPUTE_COMPENSATION';

export interface ExecutorBMoneyTransition {
  readonly kind: 'MONEY';
  readonly transitionRef: string;
  readonly inputRefs: readonly string[];
  readonly outputRef: string;
  readonly before: ExactMoney;
  readonly delta: ExactMoney;
  readonly after: ExactMoney;
}

export interface ExecutorBQuantityTransition {
  readonly kind: 'QUANTITY';
  readonly transitionRef: string;
  readonly inputRefs: readonly string[];
  readonly outputRef: string;
  readonly before: ExactQuantity;
  readonly delta: ExactQuantity;
  readonly after: ExactQuantity;
}

export type ExecutorBExactTransition =
  ExecutorBMoneyTransition | ExecutorBQuantityTransition;

export interface InternationalExecutorBReplayProof {
  readonly module: InternationalExecutorBPreparationModule;
  readonly traceRef: string;
  readonly calculationVersion: string;
  readonly snapshot: FoundationSnapshotBinding;
  readonly snapshotAt: ExactQuantity;
  readonly activityType: InternationalActivityType;
  readonly inputFactRefs: readonly string[];
  readonly inputFacts: readonly FoundationFactBinding[];
  readonly outputRef: string;
  readonly outputCanonical: string;
  readonly transitions: readonly ExecutorBExactTransition[];
  readonly hashInput: string;
}

export interface InternationalExecutorBPreparationResult<TOutput = unknown> {
  readonly preparationStatus: typeof INTERNATIONAL_EXECUTORS_B_PREPARATION_STATUS;
  readonly activityType: InternationalActivityType;
  readonly outputRef: string;
  readonly output: TOutput;
  readonly producedFactRefs: readonly string[];
  readonly validatedReferences: readonly string[];
  readonly transitions: readonly ExecutorBExactTransition[];
  readonly replayProof: InternationalExecutorBReplayProof;
}

export type InternationalExecutorBFact<T> = FoundationFact<T>;
export type InternationalExecutorBTraceRequest = FoundationTraceRequest;

export interface CashAccountSnapshot {
  readonly accountRef: string;
  readonly ownerRef: string;
  readonly balance: ExactMoney;
}

export interface InventoryAccountSnapshot {
  readonly accountRef: string;
  readonly ownerRef: string;
  readonly commodityRef: string;
  readonly available: ExactQuantity;
}

export interface DebtPositionSnapshot {
  readonly positionRef: string;
  readonly ownerRef: string;
  readonly counterpartyRef: string;
  readonly side: 'RECEIVABLE' | 'PAYABLE';
  readonly principal: ExactMoney;
}

export interface ServiceCapacitySnapshot {
  readonly capacityRef: string;
  readonly ownerRef: string;
  readonly serviceRef: string;
  readonly available: ExactQuantity;
}

export interface ServiceReceiptSnapshot {
  readonly receiptRef: string;
  readonly ownerRef: string;
  readonly serviceRef: string;
  readonly delivered: ExactQuantity;
}

interface CashTransferRequest {
  readonly executionRef: string;
  readonly contractRef: string;
  readonly activityType: InternationalActivityType;
  readonly payerAccountRef: string;
  readonly payeeAccountRef: string;
  readonly amount: ExactMoney;
  readonly purposeFactRef: string;
  readonly executedAt: ExactQuantity;
}

export interface TechnologyLicenceExecution extends CashTransferRequest {
  readonly activityType: 'Technology Licence';
  readonly technologyRef: string;
  readonly licenceRightFactRef: string;
  readonly licensorRef: string;
  readonly licenseeRef: string;
}

export interface GrantAidExecution extends CashTransferRequest {
  readonly activityType: 'Grant Aid';
  readonly donorRef: string;
  readonly recipientRef: string;
  readonly grantTermsFactRef: string;
}

export interface ProjectReconstructionAidExecution extends CashTransferRequest {
  readonly activityType: 'Project Reconstruction Aid';
  readonly donorRef: string;
  readonly recipientRef: string;
  readonly projectRef: string;
  readonly useConstraintFactRef: string;
}

export interface TradeDisputeCompensationExecution extends CashTransferRequest {
  readonly activityType: 'Trade Dispute Settlement';
  readonly disputeRef: string;
  readonly settlementFactRef: string;
  readonly remedy: 'COMPENSATION_PAYMENT';
}

export interface JointProjectContribution {
  readonly participantRef: string;
  readonly participantAccountRef: string;
  readonly contribution: ExactMoney;
  readonly ownershipShare: ExactRatio;
  readonly contributionFactRef: string;
}

export interface JointProjectExecution {
  readonly executionRef: string;
  readonly contractRef: string;
  readonly activityType: 'Joint International Project';
  readonly projectRef: string;
  readonly projectAccountRef: string;
  readonly totalCost: ExactMoney;
  readonly contributions: readonly JointProjectContribution[];
  readonly executedAt: ExactQuantity;
}

export interface ReserveSwapExecution {
  readonly executionRef: string;
  readonly contractRef: string;
  readonly activityType: 'Reserve Swap';
  readonly partyARef: string;
  readonly partyBRef: string;
  readonly partyACurrencyAAccountRef: string;
  readonly partyACurrencyBAccountRef: string;
  readonly partyBCurrencyAAccountRef: string;
  readonly partyBCurrencyBAccountRef: string;
  readonly principalA: ExactMoney;
  readonly principalB: ExactMoney;
  readonly partyAReceivableFactRef: string;
  readonly partyAPayableFactRef: string;
  readonly partyBReceivableFactRef: string;
  readonly partyBPayableFactRef: string;
  readonly termsFactRef: string;
  readonly executedAt: ExactQuantity;
}

export interface CommodityAidExecution {
  readonly executionRef: string;
  readonly contractRef: string;
  readonly activityType: 'Commodity Aid';
  readonly donorRef: string;
  readonly recipientRef: string;
  readonly donorAccountRef: string;
  readonly recipientAccountRef: string;
  readonly commodityRef: string;
  readonly quantity: ExactQuantity;
  readonly deliveryFactRef: string;
  readonly executedAt: ExactQuantity;
}

export interface EmergencyConcessionalLoanExecution {
  readonly executionRef: string;
  readonly contractRef: string;
  readonly activityType: 'Emergency Concessional Loan';
  readonly lenderRef: string;
  readonly borrowerRef: string;
  readonly lenderCashAccountRef: string;
  readonly borrowerCashAccountRef: string;
  readonly lenderReceivableRef: string;
  readonly borrowerPayableRef: string;
  readonly principal: ExactMoney;
  readonly concessionalTermsFactRef: string;
  readonly executedAt: ExactQuantity;
}

export interface TechnicalAssistanceExecution {
  readonly executionRef: string;
  readonly contractRef: string;
  readonly activityType: 'Technical Assistance';
  readonly providerRef: string;
  readonly recipientRef: string;
  readonly providerCapacityRef: string;
  readonly recipientReceiptRef: string;
  readonly serviceRef: string;
  readonly delivered: ExactQuantity;
  readonly serviceRightFactRef: string;
  readonly executedAt: ExactQuantity;
}

export type TreatyActivityType =
  | 'Preferential Trade Agreement'
  | 'Free Trade Agreement'
  | 'Customs Cooperation Agreement'
  | 'Sector Market Access Agreement'
  | 'Multilateral Economic Agreement';

export interface TreatyValidationRequest {
  readonly validationRef: string;
  readonly contractRef: string;
  readonly activityType: TreatyActivityType;
  readonly partyRefs: readonly string[];
  readonly tariffScheduleRefs: readonly string[];
  readonly quotaScheduleRefs: readonly string[];
  readonly rulesOfOriginRefs: readonly string[];
  readonly customsRuleRefs: readonly string[];
  readonly sectorRefs: readonly string[];
  readonly marketAccessRefs: readonly string[];
  readonly disputeMechanismRef: string | null;
  readonly effectiveAt: ExactQuantity;
}

export type SanctionMeasure =
  | 'GOODS_IMPORT_BAN'
  | 'GOODS_EXPORT_BAN'
  | 'TECHNOLOGY_LICENCE_BAN'
  | 'TECHNOLOGY_EXPORT_CONTROL'
  | 'NEW_FDI_BAN'
  | 'OWNERSHIP_ACQUISITION_BAN'
  | 'NEW_SOVEREIGN_LOAN_BAN'
  | 'FINANCIAL_TRANSACTION_RESTRICTION'
  | 'ASSET_FREEZE'
  | 'GOVERNMENT_CONTRACT_BAN'
  | 'STRATEGIC_GOODS_EMBARGO';

export interface SanctionPackageValidationRequest {
  readonly validationRef: string;
  readonly contractRef: string;
  readonly activityType: 'Sanction Package';
  readonly imposingPartyRefs: readonly string[];
  readonly targetCountryRef: string;
  readonly measures: readonly SanctionMeasure[];
  readonly targetRefs: readonly string[];
  readonly exemptionRefs: readonly string[];
  readonly requiredApprovalFactRefs: readonly string[];
  readonly startAt: ExactQuantity;
  readonly endConditionFactRef: string;
  readonly grandfatherExistingContracts: boolean;
}

export interface TenderBid {
  readonly bidRef: string;
  readonly bidderRef: string;
  readonly offered: ExactQuantity;
  readonly unitPrice: ExactMoney;
  readonly reliabilityFactRef: string;
  readonly technologyFactRef: string;
}

export interface TenderAward {
  readonly awardRef: string;
  readonly bidRef: string;
  readonly awarded: ExactQuantity;
}

export interface InternationalTenderValidationRequest {
  readonly validationRef: string;
  readonly contractRef: string;
  readonly activityType: 'International Tender';
  readonly tenderRef: string;
  readonly requestingCountryRef: string;
  readonly needFactRef: string;
  readonly required: ExactQuantity;
  readonly maximumUnitPrice: ExactMoney;
  readonly partialAwardAllowed: boolean;
  readonly bids: readonly TenderBid[];
  readonly awards: readonly TenderAward[];
  readonly evaluationRuleFactRef: string;
  readonly evaluatedAt: ExactQuantity;
}

export interface StrategicPartnershipValidationRequest {
  readonly validationRef: string;
  readonly contractRef: string;
  readonly activityType: 'Strategic Economic Partnership';
  readonly partnerRefs: readonly string[];
  readonly strategicScopeRefs: readonly string[];
  readonly componentAgreementRefs: readonly string[];
  readonly governanceFactRef: string;
  readonly captainApprovalFactRef: string;
  readonly reviewedAt: ExactQuantity;
}

const STABLE_REFERENCE = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u;

function stableReference(value: unknown, label: string): string {
  if (typeof value !== 'string' || !STABLE_REFERENCE.test(value)) {
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

function canonicalPayload(value: unknown, label: string): string {
  try {
    return canonicalSerialize(value);
  } catch {
    return kernelInvalid(`${label} must contain canonical data`);
  }
}

function activity(
  value: unknown,
  expected: InternationalActivityType,
): InternationalActivityType {
  const actual = validateInternationalActivityType(value);
  if (actual !== expected) {
    kernelInvalid(`Executor requires ${expected}`);
  }
  return actual;
}

function traceTick(
  trace: InternationalExecutorBTraceRequest,
): ReturnType<typeof nonNegativeQuantity>['amount'] {
  const result = nonNegativeQuantity(
    trace.snapshotAt,
    'sim_millisecond',
    'trace.snapshotAt',
  ).amount;
  if (!result.isInteger()) {
    kernelInvalid('trace.snapshotAt must be an integer simulation tick');
  }
  return result;
}

function boundTick(
  value: ExactQuantity,
  trace: InternationalExecutorBTraceRequest,
  label: string,
): ExactQuantity {
  const result = nonNegativeQuantity(value, 'sim_millisecond', label).amount;
  if (!result.isInteger() || !result.equals(traceTick(trace))) {
    kernelInvalid(`${label} must equal the replay snapshot tick`);
  }
  return renderQuantity(result, 'sim_millisecond');
}

function canonicalMoney(
  value: ExactMoney,
  label: string,
  allowZero = true,
): ExactMoney {
  const parsed = money(value, label);
  if (parsed.amount.isNegative() || (!allowZero && parsed.amount.isZero())) {
    kernelInvalid(
      `${label} must be ${allowZero ? 'non-negative' : 'positive'}`,
    );
  }
  return renderMoney(parsed.amount, parsed.currency);
}

function canonicalQuantity(
  value: ExactQuantity,
  label: string,
  allowZero = true,
): ExactQuantity {
  const parsed = quantity(value, label);
  const amount = allowZero
    ? nonNegative(value.amount, label)
    : positive(value.amount, label);
  return renderQuantity(amount, parsed.unit);
}

function cashAccount(
  value: CashAccountSnapshot,
  label: string,
): CashAccountSnapshot {
  return Object.freeze({
    accountRef: stableReference(value.accountRef, `${label}.accountRef`),
    ownerRef: stableReference(value.ownerRef, `${label}.ownerRef`),
    balance: canonicalMoney(value.balance, `${label}.balance`),
  });
}

function inventoryAccount(
  value: InventoryAccountSnapshot,
  label: string,
): InventoryAccountSnapshot {
  return Object.freeze({
    accountRef: stableReference(value.accountRef, `${label}.accountRef`),
    ownerRef: stableReference(value.ownerRef, `${label}.ownerRef`),
    commodityRef: stableReference(value.commodityRef, `${label}.commodityRef`),
    available: canonicalQuantity(value.available, `${label}.available`),
  });
}

function debtPosition(
  value: DebtPositionSnapshot,
  label: string,
): DebtPositionSnapshot {
  if (value.side !== 'RECEIVABLE' && value.side !== 'PAYABLE') {
    kernelInvalid(`${label}.side must be RECEIVABLE or PAYABLE`);
  }
  return Object.freeze({
    positionRef: stableReference(value.positionRef, `${label}.positionRef`),
    ownerRef: stableReference(value.ownerRef, `${label}.ownerRef`),
    counterpartyRef: stableReference(
      value.counterpartyRef,
      `${label}.counterpartyRef`,
    ),
    side: value.side,
    principal: canonicalMoney(value.principal, `${label}.principal`),
  });
}

function serviceCapacity(
  value: ServiceCapacitySnapshot,
  label: string,
): ServiceCapacitySnapshot {
  return Object.freeze({
    capacityRef: stableReference(value.capacityRef, `${label}.capacityRef`),
    ownerRef: stableReference(value.ownerRef, `${label}.ownerRef`),
    serviceRef: stableReference(value.serviceRef, `${label}.serviceRef`),
    available: canonicalQuantity(value.available, `${label}.available`),
  });
}

function serviceReceipt(
  value: ServiceReceiptSnapshot,
  label: string,
): ServiceReceiptSnapshot {
  return Object.freeze({
    receiptRef: stableReference(value.receiptRef, `${label}.receiptRef`),
    ownerRef: stableReference(value.ownerRef, `${label}.ownerRef`),
    serviceRef: stableReference(value.serviceRef, `${label}.serviceRef`),
    delivered: canonicalQuantity(value.delivered, `${label}.delivered`),
  });
}

function moneyTransition(input: {
  readonly transitionRef: string;
  readonly inputRefs: readonly string[];
  readonly outputRef: string;
  readonly before: ExactMoney;
  readonly delta: ExactMoney;
  readonly after: ExactMoney;
}): ExecutorBMoneyTransition {
  const before = money(input.before, 'money transition.before');
  const delta = money(input.delta, 'money transition.delta');
  const after = money(input.after, 'money transition.after');
  if (
    before.currency !== delta.currency ||
    before.currency !== after.currency ||
    before.amount.isNegative() ||
    after.amount.isNegative() ||
    !before.amount.plus(delta.amount).equals(after.amount)
  ) {
    kernelInvalid('Money transition must exactly conserve one currency');
  }
  return Object.freeze({
    kind: 'MONEY',
    transitionRef: stableReference(input.transitionRef, 'transitionRef'),
    inputRefs: distinctReferences(input.inputRefs, 'transition.inputRefs'),
    outputRef: stableReference(input.outputRef, 'transition.outputRef'),
    before: renderMoney(before.amount, before.currency),
    delta: renderMoney(delta.amount, delta.currency),
    after: renderMoney(after.amount, after.currency),
  });
}

function quantityTransition(input: {
  readonly transitionRef: string;
  readonly inputRefs: readonly string[];
  readonly outputRef: string;
  readonly before: ExactQuantity;
  readonly delta: ExactQuantity;
  readonly after: ExactQuantity;
}): ExecutorBQuantityTransition {
  const before = quantity(input.before, 'quantity transition.before');
  const delta = quantity(input.delta, 'quantity transition.delta');
  const after = quantity(input.after, 'quantity transition.after');
  if (
    before.unit !== delta.unit ||
    before.unit !== after.unit ||
    before.amount.isNegative() ||
    after.amount.isNegative() ||
    !before.amount.plus(delta.amount).equals(after.amount)
  ) {
    kernelInvalid('Quantity transition must exactly conserve one unit');
  }
  return Object.freeze({
    kind: 'QUANTITY',
    transitionRef: stableReference(input.transitionRef, 'transitionRef'),
    inputRefs: distinctReferences(input.inputRefs, 'transition.inputRefs'),
    outputRef: stableReference(input.outputRef, 'transition.outputRef'),
    before: renderQuantity(before.amount, before.unit),
    delta: renderQuantity(delta.amount, delta.unit),
    after: renderQuantity(after.amount, after.unit),
  });
}

function replayProof(input: {
  readonly module: InternationalExecutorBPreparationModule;
  readonly trace: InternationalExecutorBTraceRequest;
  readonly activityType: InternationalActivityType;
  readonly facts: readonly InternationalExecutorBFact<unknown>[];
  readonly outputRef: string;
  readonly output: unknown;
  readonly transitions: readonly ExecutorBExactTransition[];
}): InternationalExecutorBReplayProof {
  const inputFacts = input.facts.map((fact, index) =>
    foundationFactBinding(input.trace, fact, `inputFacts[${index}]`),
  );
  const inputFactRefs = distinctReferences(
    inputFacts.map((fact) => fact.factRef),
    'replay input facts',
  );
  const outputRef = stableReference(input.outputRef, 'outputRef');
  if (inputFactRefs.includes(outputRef)) {
    kernelInvalid('outputRef must differ from every input fact');
  }
  distinctReferences(
    input.transitions.map((transition) => transition.transitionRef),
    'replay transitions',
    false,
  );
  const body = {
    module: input.module,
    traceRef: stableReference(input.trace.traceRef, 'traceRef'),
    calculationVersion: stableReference(
      input.trace.calculationVersion,
      'calculationVersion',
    ),
    snapshot: input.trace.snapshot,
    snapshotAt: renderQuantity(traceTick(input.trace), 'sim_millisecond'),
    activityType: input.activityType,
    inputFactRefs,
    inputFacts: Object.freeze(inputFacts),
    outputRef,
    outputCanonical: canonicalPayload(input.output, 'output'),
    transitions: Object.freeze([...input.transitions]),
  };
  return Object.freeze({ ...body, hashInput: canonicalHashInput(body) });
}

export function assertInternationalExecutorBReplayEvidence(
  proof: InternationalExecutorBReplayProof,
  facts: readonly InternationalExecutorBFact<unknown>[],
): void {
  const trace: InternationalExecutorBTraceRequest = {
    traceRef: proof.traceRef,
    calculationVersion: proof.calculationVersion,
    snapshot: proof.snapshot,
    snapshotAt: proof.snapshotAt,
  };
  const rebound = facts.map((fact, index) =>
    foundationFactBinding(trace, fact, `replay.inputFacts[${index}]`),
  );
  const recomputed = recomputeReplayProof(proof.module, trace, facts);
  if (
    canonicalPayload(rebound, 'replayed facts') !==
      canonicalPayload(proof.inputFacts, 'recorded facts') ||
    canonicalPayload(recomputed, 'recomputed proof') !==
      canonicalPayload(proof, 'recorded proof')
  ) {
    kernelInvalid(
      'Replay evidence does not match recomputed subtype economics',
    );
  }
}

function recomputeReplayProof(
  module: InternationalExecutorBPreparationModule,
  trace: InternationalExecutorBTraceRequest,
  facts: readonly InternationalExecutorBFact<unknown>[],
): InternationalExecutorBReplayProof {
  const count = (expected: number): void => {
    if (facts.length !== expected) {
      kernelInvalid(`${module} replay requires exactly ${expected} facts`);
    }
  };
  const typed = <T>(index: number): InternationalExecutorBFact<T> => {
    const fact = facts[index];
    if (fact === undefined) {
      return kernelInvalid(`${module} replay fact ${index} is missing`);
    }
    return fact as InternationalExecutorBFact<T>;
  };
  switch (module) {
    case 'V22_3_TECHNOLOGY_LICENCE':
      count(3);
      return calculateTechnologyLicencePreparation({
        trace,
        licenseeCashFact: typed<CashAccountSnapshot>(0),
        licensorCashFact: typed<CashAccountSnapshot>(1),
        executionFact: typed<TechnologyLicenceExecution>(2),
      }).replayProof;
    case 'V22_3_JOINT_PROJECT': {
      if (facts.length < 4) {
        kernelInvalid(
          'Joint-project replay requires participant, project and execution facts',
        );
      }
      const projectIndex = facts.length - 2;
      const executionIndex = facts.length - 1;
      return calculateJointProjectPreparation({
        trace,
        participantCashFacts: facts.slice(
          0,
          projectIndex,
        ) as readonly InternationalExecutorBFact<CashAccountSnapshot>[],
        projectCashFact: typed<CashAccountSnapshot>(projectIndex),
        executionFact: typed<JointProjectExecution>(executionIndex),
      }).replayProof;
    }
    case 'V22_3_TREATY_VALIDATION':
      count(1);
      return validateTreatyPreparation({
        trace,
        requestFact: typed<TreatyValidationRequest>(0),
      }).replayProof;
    case 'V22_3_RESERVE_SWAP':
      count(5);
      return calculateReserveSwapPreparation({
        trace,
        partyACurrencyAFact: typed<CashAccountSnapshot>(0),
        partyACurrencyBFact: typed<CashAccountSnapshot>(1),
        partyBCurrencyAFact: typed<CashAccountSnapshot>(2),
        partyBCurrencyBFact: typed<CashAccountSnapshot>(3),
        executionFact: typed<ReserveSwapExecution>(4),
      }).replayProof;
    case 'V22_3_SANCTION_VALIDATION':
      count(1);
      return validateSanctionPackagePreparation({
        trace,
        requestFact: typed<SanctionPackageValidationRequest>(0),
      }).replayProof;
    case 'V22_3_GRANT_AID':
      count(3);
      return calculateGrantAidPreparation({
        trace,
        donorCashFact: typed<CashAccountSnapshot>(0),
        recipientCashFact: typed<CashAccountSnapshot>(1),
        executionFact: typed<GrantAidExecution>(2),
      }).replayProof;
    case 'V22_3_COMMODITY_AID':
      count(3);
      return calculateCommodityAidPreparation({
        trace,
        donorInventoryFact: typed<InventoryAccountSnapshot>(0),
        recipientInventoryFact: typed<InventoryAccountSnapshot>(1),
        executionFact: typed<CommodityAidExecution>(2),
      }).replayProof;
    case 'V22_3_CONCESSIONAL_LOAN':
      count(5);
      return calculateEmergencyConcessionalLoanPreparation({
        trace,
        lenderCashFact: typed<CashAccountSnapshot>(0),
        borrowerCashFact: typed<CashAccountSnapshot>(1),
        lenderReceivableFact: typed<DebtPositionSnapshot>(2),
        borrowerPayableFact: typed<DebtPositionSnapshot>(3),
        executionFact: typed<EmergencyConcessionalLoanExecution>(4),
      }).replayProof;
    case 'V22_3_TECHNICAL_ASSISTANCE':
      count(3);
      return calculateTechnicalAssistancePreparation({
        trace,
        providerCapacityFact: typed<ServiceCapacitySnapshot>(0),
        recipientReceiptFact: typed<ServiceReceiptSnapshot>(1),
        executionFact: typed<TechnicalAssistanceExecution>(2),
      }).replayProof;
    case 'V22_3_RECONSTRUCTION_AID':
      count(3);
      return calculateProjectReconstructionAidPreparation({
        trace,
        donorCashFact: typed<CashAccountSnapshot>(0),
        recipientCashFact: typed<CashAccountSnapshot>(1),
        executionFact: typed<ProjectReconstructionAidExecution>(2),
      }).replayProof;
    case 'V22_3_TENDER_VALIDATION':
      count(1);
      return validateInternationalTenderPreparation({
        trace,
        requestFact: typed<InternationalTenderValidationRequest>(0),
      }).replayProof;
    case 'V22_3_STRATEGIC_PARTNERSHIP_VALIDATION':
      count(1);
      return validateStrategicPartnershipPreparation({
        trace,
        requestFact: typed<StrategicPartnershipValidationRequest>(0),
      }).replayProof;
    case 'V22_3_DISPUTE_COMPENSATION':
      count(3);
      return calculateTradeDisputeCompensationPreparation({
        trace,
        payerCashFact: typed<CashAccountSnapshot>(0),
        injuredPartyCashFact: typed<CashAccountSnapshot>(1),
        executionFact: typed<TradeDisputeCompensationExecution>(2),
      }).replayProof;
    default:
      return kernelInvalid('Unknown Executor B replay module');
  }
}

function result<TOutput>(input: {
  readonly module: InternationalExecutorBPreparationModule;
  readonly trace: InternationalExecutorBTraceRequest;
  readonly activityType: InternationalActivityType;
  readonly facts: readonly InternationalExecutorBFact<unknown>[];
  readonly outputRef: string;
  readonly output: TOutput;
  readonly producedFactRefs: readonly string[];
  readonly validatedReferences: readonly string[];
  readonly transitions: readonly ExecutorBExactTransition[];
}): InternationalExecutorBPreparationResult<TOutput> {
  const producedFactRefs = distinctReferences(
    input.producedFactRefs,
    'produced fact references',
    false,
  );
  const validatedReferences = distinctReferences(
    input.validatedReferences,
    'validated references',
    false,
  );
  return Object.freeze({
    preparationStatus: INTERNATIONAL_EXECUTORS_B_PREPARATION_STATUS,
    activityType: input.activityType,
    outputRef: stableReference(input.outputRef, 'outputRef'),
    output: input.output,
    producedFactRefs,
    validatedReferences,
    transitions: Object.freeze([...input.transitions]),
    replayProof: replayProof(input),
  });
}

export function assertCompleteInternationalExecutorBPreparationCoverage(
  entries: readonly InternationalExecutorBPreparationCoverageEntry[],
): readonly InternationalExecutorBPreparationCoverageEntry[] {
  if (entries.length !== 23) {
    kernelInvalid('Executor B coverage must contain exactly 23 entries');
  }
  const result = entries.map((entry, index) => {
    const expected = INTERNATIONAL_EXECUTORS_B_PREPARATION_COVERAGE[index];
    if (
      expected === undefined ||
      entry.subtypeId !== expected.subtypeId ||
      validateInternationalActivityType(entry.activityType) !==
        expected.activityType ||
      entry.coverage !== expected.coverage ||
      entry.evidenceRef !== expected.evidenceRef
    ) {
      kernelInvalid('Executor B coverage must match the fixed 23-type matrix');
    }
    return Object.freeze({ ...entry });
  });
  return Object.freeze(result);
}

function bilateralCashTransfer<TRequest extends CashTransferRequest>(input: {
  readonly module: InternationalExecutorBPreparationModule;
  readonly expectedActivity: InternationalActivityType;
  readonly trace: InternationalExecutorBTraceRequest;
  readonly payerFact: InternationalExecutorBFact<CashAccountSnapshot>;
  readonly payeeFact: InternationalExecutorBFact<CashAccountSnapshot>;
  readonly requestFact: InternationalExecutorBFact<TRequest>;
  readonly additionalReferences: readonly string[];
}): InternationalExecutorBPreparationResult<{
  readonly payer: CashAccountSnapshot;
  readonly payee: CashAccountSnapshot;
}> {
  const payer = cashAccount(
    foundationFactPayload(input.trace, input.payerFact, 'payer'),
    'payer',
  );
  const payee = cashAccount(
    foundationFactPayload(input.trace, input.payeeFact, 'payee'),
    'payee',
  );
  const request = foundationFactPayload(
    input.trace,
    input.requestFact,
    'cash transfer request',
  );
  const activityType = activity(request.activityType, input.expectedActivity);
  const executionRef = stableReference(
    request.executionRef,
    'request.executionRef',
  );
  stableReference(request.contractRef, 'request.contractRef');
  stableReference(request.purposeFactRef, 'request.purposeFactRef');
  boundTick(request.executedAt, input.trace, 'request.executedAt');
  if (
    stableReference(request.payerAccountRef, 'request.payerAccountRef') !==
      payer.accountRef ||
    stableReference(request.payeeAccountRef, 'request.payeeAccountRef') !==
      payee.accountRef
  ) {
    kernelInvalid('Cash transfer account references must match supplied facts');
  }
  if (
    payer.accountRef === payee.accountRef ||
    payer.ownerRef === payee.ownerRef
  ) {
    kernelInvalid(
      'Cross-country cash transfer requires distinct accounts and owners',
    );
  }
  const amount = canonicalMoney(request.amount, 'request.amount', false);
  const payerMoney = money(payer.balance, 'payer.balance');
  const payeeMoney = money(payee.balance, 'payee.balance');
  const transferMoney = money(amount, 'request.amount');
  if (
    payerMoney.currency !== transferMoney.currency ||
    payeeMoney.currency !== transferMoney.currency
  ) {
    kernelInvalid('Cash transfer currency must match both accounts');
  }
  if (payerMoney.amount.lessThan(transferMoney.amount)) {
    kernelInvalid('Cash transfer payer balance is insufficient');
  }
  const payerAfter = cashAccount(
    {
      ...payer,
      balance: subtractMoney(payer.balance, [amount], 'payer debit'),
    },
    'payerAfter',
  );
  const payeeAfter = cashAccount(
    {
      ...payee,
      balance: addMoney([payee.balance, amount], 'payee credit'),
    },
    'payeeAfter',
  );
  const inputRefs = [
    input.payerFact.factRef,
    input.payeeFact.factRef,
    input.requestFact.factRef,
  ];
  const transitions: readonly ExecutorBMoneyTransition[] = Object.freeze([
    moneyTransition({
      transitionRef: `${executionRef}.payer`,
      inputRefs,
      outputRef: `${executionRef}.payer.after`,
      before: payer.balance,
      delta: renderMoney(
        transferMoney.amount.negated(),
        transferMoney.currency,
      ),
      after: payerAfter.balance,
    }),
    moneyTransition({
      transitionRef: `${executionRef}.payee`,
      inputRefs,
      outputRef: `${executionRef}.payee.after`,
      before: payee.balance,
      delta: amount,
      after: payeeAfter.balance,
    }),
  ]);
  return result({
    module: input.module,
    trace: input.trace,
    activityType,
    facts: [input.payerFact, input.payeeFact, input.requestFact],
    outputRef: `${executionRef}.result`,
    output: Object.freeze({ payer: payerAfter, payee: payeeAfter }),
    producedFactRefs: transitions.map((transition) => transition.outputRef),
    validatedReferences: [
      request.contractRef,
      request.purposeFactRef,
      ...input.additionalReferences,
    ],
    transitions,
  });
}

export function calculateTechnologyLicencePreparation(input: {
  readonly trace: InternationalExecutorBTraceRequest;
  readonly licensorCashFact: InternationalExecutorBFact<CashAccountSnapshot>;
  readonly licenseeCashFact: InternationalExecutorBFact<CashAccountSnapshot>;
  readonly executionFact: InternationalExecutorBFact<TechnologyLicenceExecution>;
}) {
  const execution = foundationFactPayload(
    input.trace,
    input.executionFact,
    'technology licence execution',
  );
  const resultValue = bilateralCashTransfer({
    module: 'V22_3_TECHNOLOGY_LICENCE',
    expectedActivity: 'Technology Licence',
    trace: input.trace,
    payerFact: input.licenseeCashFact,
    payeeFact: input.licensorCashFact,
    requestFact: input.executionFact,
    additionalReferences: [
      stableReference(execution.technologyRef, 'execution.technologyRef'),
      stableReference(
        execution.licenceRightFactRef,
        'execution.licenceRightFactRef',
      ),
    ],
  });
  const licensor = cashAccount(
    foundationFactPayload(input.trace, input.licensorCashFact, 'licensor'),
    'licensor',
  );
  const licensee = cashAccount(
    foundationFactPayload(input.trace, input.licenseeCashFact, 'licensee'),
    'licensee',
  );
  if (
    stableReference(execution.licensorRef, 'execution.licensorRef') !==
      licensor.ownerRef ||
    stableReference(execution.licenseeRef, 'execution.licenseeRef') !==
      licensee.ownerRef
  ) {
    kernelInvalid('Technology licence parties must match supplied accounts');
  }
  return resultValue;
}

export function calculateGrantAidPreparation(input: {
  readonly trace: InternationalExecutorBTraceRequest;
  readonly donorCashFact: InternationalExecutorBFact<CashAccountSnapshot>;
  readonly recipientCashFact: InternationalExecutorBFact<CashAccountSnapshot>;
  readonly executionFact: InternationalExecutorBFact<GrantAidExecution>;
}) {
  const execution = foundationFactPayload(
    input.trace,
    input.executionFact,
    'grant aid execution',
  );
  const donor = cashAccount(
    foundationFactPayload(input.trace, input.donorCashFact, 'donor'),
    'donor',
  );
  const recipient = cashAccount(
    foundationFactPayload(input.trace, input.recipientCashFact, 'recipient'),
    'recipient',
  );
  if (
    stableReference(execution.donorRef, 'execution.donorRef') !==
      donor.ownerRef ||
    stableReference(execution.recipientRef, 'execution.recipientRef') !==
      recipient.ownerRef
  ) {
    kernelInvalid('Grant aid parties must match supplied accounts');
  }
  return bilateralCashTransfer({
    module: 'V22_3_GRANT_AID',
    expectedActivity: 'Grant Aid',
    trace: input.trace,
    payerFact: input.donorCashFact,
    payeeFact: input.recipientCashFact,
    requestFact: input.executionFact,
    additionalReferences: [
      stableReference(
        execution.grantTermsFactRef,
        'execution.grantTermsFactRef',
      ),
    ],
  });
}

export function calculateProjectReconstructionAidPreparation(input: {
  readonly trace: InternationalExecutorBTraceRequest;
  readonly donorCashFact: InternationalExecutorBFact<CashAccountSnapshot>;
  readonly recipientCashFact: InternationalExecutorBFact<CashAccountSnapshot>;
  readonly executionFact: InternationalExecutorBFact<ProjectReconstructionAidExecution>;
}) {
  const execution = foundationFactPayload(
    input.trace,
    input.executionFact,
    'reconstruction aid execution',
  );
  const donor = cashAccount(
    foundationFactPayload(input.trace, input.donorCashFact, 'donor'),
    'donor',
  );
  const recipient = cashAccount(
    foundationFactPayload(input.trace, input.recipientCashFact, 'recipient'),
    'recipient',
  );
  if (
    stableReference(execution.donorRef, 'execution.donorRef') !==
      donor.ownerRef ||
    stableReference(execution.recipientRef, 'execution.recipientRef') !==
      recipient.ownerRef
  ) {
    kernelInvalid('Reconstruction aid parties must match supplied accounts');
  }
  return bilateralCashTransfer({
    module: 'V22_3_RECONSTRUCTION_AID',
    expectedActivity: 'Project Reconstruction Aid',
    trace: input.trace,
    payerFact: input.donorCashFact,
    payeeFact: input.recipientCashFact,
    requestFact: input.executionFact,
    additionalReferences: [
      stableReference(execution.projectRef, 'execution.projectRef'),
      stableReference(
        execution.useConstraintFactRef,
        'execution.useConstraintFactRef',
      ),
    ],
  });
}

export function calculateTradeDisputeCompensationPreparation(input: {
  readonly trace: InternationalExecutorBTraceRequest;
  readonly payerCashFact: InternationalExecutorBFact<CashAccountSnapshot>;
  readonly injuredPartyCashFact: InternationalExecutorBFact<CashAccountSnapshot>;
  readonly executionFact: InternationalExecutorBFact<TradeDisputeCompensationExecution>;
}) {
  const execution = foundationFactPayload(
    input.trace,
    input.executionFact,
    'dispute compensation execution',
  );
  if (execution.remedy !== 'COMPENSATION_PAYMENT') {
    kernelInvalid('Dispute transfer supports only COMPENSATION_PAYMENT');
  }
  return bilateralCashTransfer({
    module: 'V22_3_DISPUTE_COMPENSATION',
    expectedActivity: 'Trade Dispute Settlement',
    trace: input.trace,
    payerFact: input.payerCashFact,
    payeeFact: input.injuredPartyCashFact,
    requestFact: input.executionFact,
    additionalReferences: [
      stableReference(execution.disputeRef, 'execution.disputeRef'),
      stableReference(
        execution.settlementFactRef,
        'execution.settlementFactRef',
      ),
    ],
  });
}

export function calculateJointProjectPreparation(input: {
  readonly trace: InternationalExecutorBTraceRequest;
  readonly participantCashFacts: readonly InternationalExecutorBFact<CashAccountSnapshot>[];
  readonly projectCashFact: InternationalExecutorBFact<CashAccountSnapshot>;
  readonly executionFact: InternationalExecutorBFact<JointProjectExecution>;
}) {
  const execution = foundationFactPayload(
    input.trace,
    input.executionFact,
    'joint project execution',
  );
  const activityType = activity(
    execution.activityType,
    'Joint International Project',
  );
  const executionRef = stableReference(execution.executionRef, 'executionRef');
  stableReference(execution.contractRef, 'contractRef');
  stableReference(execution.projectRef, 'projectRef');
  boundTick(execution.executedAt, input.trace, 'executedAt');
  if (execution.contributions.length < 2) {
    kernelInvalid('Joint project requires at least two country contributions');
  }
  if (input.participantCashFacts.length !== execution.contributions.length) {
    kernelInvalid('Every joint-project contribution requires one account fact');
  }
  const project = cashAccount(
    foundationFactPayload(
      input.trace,
      input.projectCashFact,
      'project account',
    ),
    'project account',
  );
  if (
    stableReference(execution.projectAccountRef, 'projectAccountRef') !==
    project.accountRef
  ) {
    kernelInvalid('Joint-project account reference must match its fact');
  }
  const totalCost = canonicalMoney(execution.totalCost, 'totalCost', false);
  const normalized = execution.contributions.map((contribution, index) => {
    const accountFact = input.participantCashFacts[index];
    if (accountFact === undefined) {
      return kernelInvalid('Missing joint-project participant account fact');
    }
    const account = cashAccount(
      foundationFactPayload(input.trace, accountFact, `participant[${index}]`),
      `participant[${index}]`,
    );
    const participantRef = stableReference(
      contribution.participantRef,
      `contributions[${index}].participantRef`,
    );
    if (
      participantRef !== account.ownerRef ||
      stableReference(
        contribution.participantAccountRef,
        `contributions[${index}].participantAccountRef`,
      ) !== account.accountRef
    ) {
      kernelInvalid('Joint-project contribution must match its account fact');
    }
    const amount = canonicalMoney(
      contribution.contribution,
      `contributions[${index}].contribution`,
      false,
    );
    if (
      amount.currency !== totalCost.currency ||
      amount.currency !== account.balance.currency
    ) {
      kernelInvalid(
        'Joint-project contributions must use the project currency',
      );
    }
    const share = ratio(
      contribution.ownershipShare,
      `contributions[${index}].ownershipShare`,
    );
    stableReference(
      contribution.contributionFactRef,
      `contributions[${index}].contributionFactRef`,
    );
    if (
      money(account.balance, 'participant balance').amount.lessThan(
        money(amount, 'contribution').amount,
      )
    ) {
      kernelInvalid('Joint-project participant balance is insufficient');
    }
    return { accountFact, account, contribution, amount, share };
  });
  distinctReferences(
    normalized.map((entry) => entry.account.accountRef),
    'joint-project participant accounts',
  );
  if (
    normalized.some((entry) => entry.account.accountRef === project.accountRef)
  ) {
    kernelInvalid(
      'Joint-project receiving account must differ from every participant account',
    );
  }
  const contributionTotal = addMoney(
    normalized.map((entry) => entry.amount),
    'joint-project contribution total',
  );
  if (contributionTotal.amount !== totalCost.amount) {
    kernelInvalid('Joint-project contributions must exactly equal total cost');
  }
  const shareTotal = normalized.reduce(
    (sum, entry) => sum.plus(entry.share),
    nonNegative('0', 'zero'),
  );
  if (!shareTotal.equals(1)) {
    kernelInvalid('Joint-project ownership shares must sum exactly to one');
  }
  if (project.balance.currency !== totalCost.currency) {
    kernelInvalid('Joint-project account must use the project currency');
  }
  const inputRefs = [
    ...input.participantCashFacts.map((fact) => fact.factRef),
    input.projectCashFact.factRef,
    input.executionFact.factRef,
  ];
  const participantOutputs = normalized.map((entry, index) =>
    cashAccount(
      {
        ...entry.account,
        balance: subtractMoney(
          entry.account.balance,
          [entry.amount],
          `participant[${index}] debit`,
        ),
      },
      `participantAfter[${index}]`,
    ),
  );
  const projectAfter = cashAccount(
    {
      ...project,
      balance: addMoney([project.balance, totalCost], 'project credit'),
    },
    'projectAfter',
  );
  const transitions: ExecutorBMoneyTransition[] = normalized.map(
    (entry, index) =>
      moneyTransition({
        transitionRef: `${executionRef}.participant.${index + 1}`,
        inputRefs,
        outputRef: `${executionRef}.participant.${index + 1}.after`,
        before: entry.account.balance,
        delta: renderMoney(
          money(entry.amount, 'contribution').amount.negated(),
          entry.amount.currency,
        ),
        after: participantOutputs[index]!.balance,
      }),
  );
  transitions.push(
    moneyTransition({
      transitionRef: `${executionRef}.project`,
      inputRefs,
      outputRef: `${executionRef}.project.after`,
      before: project.balance,
      delta: totalCost,
      after: projectAfter.balance,
    }),
  );
  return result({
    module: 'V22_3_JOINT_PROJECT',
    trace: input.trace,
    activityType,
    facts: [
      ...input.participantCashFacts,
      input.projectCashFact,
      input.executionFact,
    ],
    outputRef: `${executionRef}.result`,
    output: Object.freeze({
      participants: participantOutputs,
      project: projectAfter,
    }),
    producedFactRefs: transitions.map((transition) => transition.outputRef),
    validatedReferences: [
      execution.contractRef,
      execution.projectRef,
      ...execution.contributions.map((item) => item.contributionFactRef),
    ],
    transitions,
  });
}

function reserveAccount(
  fact: InternationalExecutorBFact<CashAccountSnapshot>,
  trace: InternationalExecutorBTraceRequest,
  expectedOwner: string,
  expectedRef: string,
  currency: string,
  label: string,
): CashAccountSnapshot {
  const account = cashAccount(foundationFactPayload(trace, fact, label), label);
  if (
    account.ownerRef !== expectedOwner ||
    account.accountRef !== expectedRef ||
    account.balance.currency !== currency
  ) {
    kernelInvalid(`${label} must match owner, reference and currency`);
  }
  return account;
}

export function calculateReserveSwapPreparation(input: {
  readonly trace: InternationalExecutorBTraceRequest;
  readonly partyACurrencyAFact: InternationalExecutorBFact<CashAccountSnapshot>;
  readonly partyACurrencyBFact: InternationalExecutorBFact<CashAccountSnapshot>;
  readonly partyBCurrencyAFact: InternationalExecutorBFact<CashAccountSnapshot>;
  readonly partyBCurrencyBFact: InternationalExecutorBFact<CashAccountSnapshot>;
  readonly executionFact: InternationalExecutorBFact<ReserveSwapExecution>;
}) {
  const request = foundationFactPayload(
    input.trace,
    input.executionFact,
    'reserve swap execution',
  );
  const activityType = activity(request.activityType, 'Reserve Swap');
  const executionRef = stableReference(request.executionRef, 'executionRef');
  stableReference(request.contractRef, 'contractRef');
  const partyARef = stableReference(request.partyARef, 'partyARef');
  const partyBRef = stableReference(request.partyBRef, 'partyBRef');
  if (partyARef === partyBRef) {
    kernelInvalid('Reserve swap requires distinct counterparties');
  }
  boundTick(request.executedAt, input.trace, 'executedAt');
  const principalA = canonicalMoney(request.principalA, 'principalA', false);
  const principalB = canonicalMoney(request.principalB, 'principalB', false);
  if (principalA.currency === principalB.currency) {
    kernelInvalid('Reserve swap requires two distinct currencies');
  }
  const refs = {
    aA: stableReference(
      request.partyACurrencyAAccountRef,
      'partyACurrencyAAccountRef',
    ),
    aB: stableReference(
      request.partyACurrencyBAccountRef,
      'partyACurrencyBAccountRef',
    ),
    bA: stableReference(
      request.partyBCurrencyAAccountRef,
      'partyBCurrencyAAccountRef',
    ),
    bB: stableReference(
      request.partyBCurrencyBAccountRef,
      'partyBCurrencyBAccountRef',
    ),
  };
  const aA = reserveAccount(
    input.partyACurrencyAFact,
    input.trace,
    partyARef,
    refs.aA,
    principalA.currency,
    'party A currency A',
  );
  const aB = reserveAccount(
    input.partyACurrencyBFact,
    input.trace,
    partyARef,
    refs.aB,
    principalB.currency,
    'party A currency B',
  );
  const bA = reserveAccount(
    input.partyBCurrencyAFact,
    input.trace,
    partyBRef,
    refs.bA,
    principalA.currency,
    'party B currency A',
  );
  const bB = reserveAccount(
    input.partyBCurrencyBFact,
    input.trace,
    partyBRef,
    refs.bB,
    principalB.currency,
    'party B currency B',
  );
  if (
    money(aA.balance, 'aA balance').amount.lessThan(
      money(principalA, 'principal A').amount,
    ) ||
    money(bB.balance, 'bB balance').amount.lessThan(
      money(principalB, 'principal B').amount,
    )
  ) {
    kernelInvalid('Reserve swap source reserve is insufficient');
  }
  const inputRefs = [
    input.partyACurrencyAFact.factRef,
    input.partyACurrencyBFact.factRef,
    input.partyBCurrencyAFact.factRef,
    input.partyBCurrencyBFact.factRef,
    input.executionFact.factRef,
  ];
  const after = {
    partyACurrencyA: {
      ...aA,
      balance: subtractMoney(
        aA.balance,
        [principalA],
        'party A currency A debit',
      ),
    },
    partyACurrencyB: {
      ...aB,
      balance: addMoney([aB.balance, principalB], 'party A currency B credit'),
    },
    partyBCurrencyA: {
      ...bA,
      balance: addMoney([bA.balance, principalA], 'party B currency A credit'),
    },
    partyBCurrencyB: {
      ...bB,
      balance: subtractMoney(
        bB.balance,
        [principalB],
        'party B currency B debit',
      ),
    },
  };
  const transitions = Object.freeze([
    moneyTransition({
      transitionRef: `${executionRef}.a.currencyA`,
      inputRefs,
      outputRef: `${executionRef}.a.currencyA.after`,
      before: aA.balance,
      delta: renderMoney(
        money(principalA, 'principal A').amount.negated(),
        principalA.currency,
      ),
      after: after.partyACurrencyA.balance,
    }),
    moneyTransition({
      transitionRef: `${executionRef}.a.currencyB`,
      inputRefs,
      outputRef: `${executionRef}.a.currencyB.after`,
      before: aB.balance,
      delta: principalB,
      after: after.partyACurrencyB.balance,
    }),
    moneyTransition({
      transitionRef: `${executionRef}.b.currencyA`,
      inputRefs,
      outputRef: `${executionRef}.b.currencyA.after`,
      before: bA.balance,
      delta: principalA,
      after: after.partyBCurrencyA.balance,
    }),
    moneyTransition({
      transitionRef: `${executionRef}.b.currencyB`,
      inputRefs,
      outputRef: `${executionRef}.b.currencyB.after`,
      before: bB.balance,
      delta: renderMoney(
        money(principalB, 'principal B').amount.negated(),
        principalB.currency,
      ),
      after: after.partyBCurrencyB.balance,
    }),
  ]);
  const claimRefs = distinctReferences(
    [
      request.partyAReceivableFactRef,
      request.partyAPayableFactRef,
      request.partyBReceivableFactRef,
      request.partyBPayableFactRef,
    ],
    'reserve swap claim references',
  );
  return result({
    module: 'V22_3_RESERVE_SWAP',
    trace: input.trace,
    activityType,
    facts: [
      input.partyACurrencyAFact,
      input.partyACurrencyBFact,
      input.partyBCurrencyAFact,
      input.partyBCurrencyBFact,
      input.executionFact,
    ],
    outputRef: `${executionRef}.result`,
    output: Object.freeze(after),
    producedFactRefs: transitions.map((transition) => transition.outputRef),
    validatedReferences: [
      request.contractRef,
      request.termsFactRef,
      ...claimRefs,
    ],
    transitions,
  });
}

export function calculateCommodityAidPreparation(input: {
  readonly trace: InternationalExecutorBTraceRequest;
  readonly donorInventoryFact: InternationalExecutorBFact<InventoryAccountSnapshot>;
  readonly recipientInventoryFact: InternationalExecutorBFact<InventoryAccountSnapshot>;
  readonly executionFact: InternationalExecutorBFact<CommodityAidExecution>;
}) {
  const donor = inventoryAccount(
    foundationFactPayload(
      input.trace,
      input.donorInventoryFact,
      'donor inventory',
    ),
    'donor inventory',
  );
  const recipient = inventoryAccount(
    foundationFactPayload(
      input.trace,
      input.recipientInventoryFact,
      'recipient inventory',
    ),
    'recipient inventory',
  );
  const request = foundationFactPayload(
    input.trace,
    input.executionFact,
    'commodity aid execution',
  );
  const activityType = activity(request.activityType, 'Commodity Aid');
  const executionRef = stableReference(request.executionRef, 'executionRef');
  stableReference(request.contractRef, 'contractRef');
  if (
    stableReference(request.donorRef, 'donorRef') !== donor.ownerRef ||
    stableReference(request.recipientRef, 'recipientRef') !==
      recipient.ownerRef ||
    stableReference(request.donorAccountRef, 'donorAccountRef') !==
      donor.accountRef ||
    stableReference(request.recipientAccountRef, 'recipientAccountRef') !==
      recipient.accountRef ||
    stableReference(request.commodityRef, 'commodityRef') !==
      donor.commodityRef ||
    donor.commodityRef !== recipient.commodityRef
  ) {
    kernelInvalid(
      'Commodity aid facts must match parties, accounts and commodity',
    );
  }
  boundTick(request.executedAt, input.trace, 'executedAt');
  const transferred = canonicalQuantity(request.quantity, 'quantity', false);
  const donorAvailable = quantity(donor.available, 'donor available');
  const recipientAvailable = quantity(
    recipient.available,
    'recipient available',
  );
  const amount = quantity(transferred, 'transferred');
  if (
    donorAvailable.unit !== amount.unit ||
    recipientAvailable.unit !== amount.unit
  ) {
    kernelInvalid('Commodity aid units must match both inventories');
  }
  if (donorAvailable.amount.lessThan(amount.amount)) {
    kernelInvalid('Commodity aid donor inventory is insufficient');
  }
  const donorAfter = renderQuantity(
    donorAvailable.amount.minus(amount.amount),
    amount.unit,
  );
  const recipientAfter = renderQuantity(
    recipientAvailable.amount.plus(amount.amount),
    amount.unit,
  );
  const inputRefs = [
    input.donorInventoryFact.factRef,
    input.recipientInventoryFact.factRef,
    input.executionFact.factRef,
  ];
  const transitions = Object.freeze([
    quantityTransition({
      transitionRef: `${executionRef}.donor`,
      inputRefs,
      outputRef: `${executionRef}.donor.after`,
      before: donor.available,
      delta: renderQuantity(amount.amount.negated(), amount.unit),
      after: donorAfter,
    }),
    quantityTransition({
      transitionRef: `${executionRef}.recipient`,
      inputRefs,
      outputRef: `${executionRef}.recipient.after`,
      before: recipient.available,
      delta: transferred,
      after: recipientAfter,
    }),
  ]);
  return result({
    module: 'V22_3_COMMODITY_AID',
    trace: input.trace,
    activityType,
    facts: [
      input.donorInventoryFact,
      input.recipientInventoryFact,
      input.executionFact,
    ],
    outputRef: `${executionRef}.result`,
    output: Object.freeze({
      donor: { ...donor, available: donorAfter },
      recipient: { ...recipient, available: recipientAfter },
    }),
    producedFactRefs: transitions.map((transition) => transition.outputRef),
    validatedReferences: [request.contractRef, request.deliveryFactRef],
    transitions,
  });
}

export function calculateEmergencyConcessionalLoanPreparation(input: {
  readonly trace: InternationalExecutorBTraceRequest;
  readonly lenderCashFact: InternationalExecutorBFact<CashAccountSnapshot>;
  readonly borrowerCashFact: InternationalExecutorBFact<CashAccountSnapshot>;
  readonly lenderReceivableFact: InternationalExecutorBFact<DebtPositionSnapshot>;
  readonly borrowerPayableFact: InternationalExecutorBFact<DebtPositionSnapshot>;
  readonly executionFact: InternationalExecutorBFact<EmergencyConcessionalLoanExecution>;
}) {
  const lenderCash = cashAccount(
    foundationFactPayload(input.trace, input.lenderCashFact, 'lender cash'),
    'lender cash',
  );
  const borrowerCash = cashAccount(
    foundationFactPayload(input.trace, input.borrowerCashFact, 'borrower cash'),
    'borrower cash',
  );
  const receivable = debtPosition(
    foundationFactPayload(
      input.trace,
      input.lenderReceivableFact,
      'lender receivable',
    ),
    'lender receivable',
  );
  const payable = debtPosition(
    foundationFactPayload(
      input.trace,
      input.borrowerPayableFact,
      'borrower payable',
    ),
    'borrower payable',
  );
  const request = foundationFactPayload(
    input.trace,
    input.executionFact,
    'concessional loan execution',
  );
  const activityType = activity(
    request.activityType,
    'Emergency Concessional Loan',
  );
  const executionRef = stableReference(request.executionRef, 'executionRef');
  const lenderRef = stableReference(request.lenderRef, 'lenderRef');
  const borrowerRef = stableReference(request.borrowerRef, 'borrowerRef');
  if (
    lenderRef === borrowerRef ||
    lenderCash.ownerRef !== lenderRef ||
    borrowerCash.ownerRef !== borrowerRef ||
    receivable.ownerRef !== lenderRef ||
    receivable.counterpartyRef !== borrowerRef ||
    receivable.side !== 'RECEIVABLE' ||
    payable.ownerRef !== borrowerRef ||
    payable.counterpartyRef !== lenderRef ||
    payable.side !== 'PAYABLE' ||
    request.lenderCashAccountRef !== lenderCash.accountRef ||
    request.borrowerCashAccountRef !== borrowerCash.accountRef ||
    request.lenderReceivableRef !== receivable.positionRef ||
    request.borrowerPayableRef !== payable.positionRef
  ) {
    kernelInvalid(
      'Concessional loan facts must form matching bilateral positions',
    );
  }
  stableReference(request.contractRef, 'contractRef');
  stableReference(request.concessionalTermsFactRef, 'concessionalTermsFactRef');
  boundTick(request.executedAt, input.trace, 'executedAt');
  const principal = canonicalMoney(request.principal, 'principal', false);
  for (const value of [
    lenderCash.balance,
    borrowerCash.balance,
    receivable.principal,
    payable.principal,
  ]) {
    if (value.currency !== principal.currency)
      kernelInvalid('Concessional loan currency must match every position');
  }
  if (
    money(lenderCash.balance, 'lender balance').amount.lessThan(
      money(principal, 'principal').amount,
    )
  ) {
    kernelInvalid('Concessional lender cash is insufficient');
  }
  if (receivable.principal.amount !== payable.principal.amount) {
    kernelInvalid('Existing bilateral debt positions must reconcile');
  }
  const inputRefs = [
    input.lenderCashFact.factRef,
    input.borrowerCashFact.factRef,
    input.lenderReceivableFact.factRef,
    input.borrowerPayableFact.factRef,
    input.executionFact.factRef,
  ];
  const lenderCashAfter = subtractMoney(
    lenderCash.balance,
    [principal],
    'lender cash debit',
  );
  const borrowerCashAfter = addMoney(
    [borrowerCash.balance, principal],
    'borrower cash credit',
  );
  const receivableAfter = addMoney(
    [receivable.principal, principal],
    'receivable increase',
  );
  const payableAfter = addMoney(
    [payable.principal, principal],
    'payable increase',
  );
  const deltaNegative = renderMoney(
    money(principal, 'principal').amount.negated(),
    principal.currency,
  );
  const transitions = Object.freeze([
    moneyTransition({
      transitionRef: `${executionRef}.lender.cash`,
      inputRefs,
      outputRef: `${executionRef}.lender.cash.after`,
      before: lenderCash.balance,
      delta: deltaNegative,
      after: lenderCashAfter,
    }),
    moneyTransition({
      transitionRef: `${executionRef}.borrower.cash`,
      inputRefs,
      outputRef: `${executionRef}.borrower.cash.after`,
      before: borrowerCash.balance,
      delta: principal,
      after: borrowerCashAfter,
    }),
    moneyTransition({
      transitionRef: `${executionRef}.lender.receivable`,
      inputRefs,
      outputRef: `${executionRef}.lender.receivable.after`,
      before: receivable.principal,
      delta: principal,
      after: receivableAfter,
    }),
    moneyTransition({
      transitionRef: `${executionRef}.borrower.payable`,
      inputRefs,
      outputRef: `${executionRef}.borrower.payable.after`,
      before: payable.principal,
      delta: principal,
      after: payableAfter,
    }),
  ]);
  return result({
    module: 'V22_3_CONCESSIONAL_LOAN',
    trace: input.trace,
    activityType,
    facts: [
      input.lenderCashFact,
      input.borrowerCashFact,
      input.lenderReceivableFact,
      input.borrowerPayableFact,
      input.executionFact,
    ],
    outputRef: `${executionRef}.result`,
    output: Object.freeze({
      lenderCash: { ...lenderCash, balance: lenderCashAfter },
      borrowerCash: { ...borrowerCash, balance: borrowerCashAfter },
      lenderReceivable: { ...receivable, principal: receivableAfter },
      borrowerPayable: { ...payable, principal: payableAfter },
    }),
    producedFactRefs: transitions.map((transition) => transition.outputRef),
    validatedReferences: [
      request.contractRef,
      request.concessionalTermsFactRef,
    ],
    transitions,
  });
}

export function calculateTechnicalAssistancePreparation(input: {
  readonly trace: InternationalExecutorBTraceRequest;
  readonly providerCapacityFact: InternationalExecutorBFact<ServiceCapacitySnapshot>;
  readonly recipientReceiptFact: InternationalExecutorBFact<ServiceReceiptSnapshot>;
  readonly executionFact: InternationalExecutorBFact<TechnicalAssistanceExecution>;
}) {
  const capacity = serviceCapacity(
    foundationFactPayload(
      input.trace,
      input.providerCapacityFact,
      'provider capacity',
    ),
    'provider capacity',
  );
  const receipt = serviceReceipt(
    foundationFactPayload(
      input.trace,
      input.recipientReceiptFact,
      'recipient receipt',
    ),
    'recipient receipt',
  );
  const request = foundationFactPayload(
    input.trace,
    input.executionFact,
    'technical assistance execution',
  );
  const activityType = activity(request.activityType, 'Technical Assistance');
  const executionRef = stableReference(request.executionRef, 'executionRef');
  if (
    stableReference(request.providerRef, 'providerRef') !== capacity.ownerRef ||
    stableReference(request.recipientRef, 'recipientRef') !==
      receipt.ownerRef ||
    request.providerCapacityRef !== capacity.capacityRef ||
    request.recipientReceiptRef !== receipt.receiptRef ||
    stableReference(request.serviceRef, 'serviceRef') !== capacity.serviceRef ||
    capacity.serviceRef !== receipt.serviceRef
  ) {
    kernelInvalid('Technical assistance facts must match service and parties');
  }
  stableReference(request.contractRef, 'contractRef');
  stableReference(request.serviceRightFactRef, 'serviceRightFactRef');
  boundTick(request.executedAt, input.trace, 'executedAt');
  const delivered = canonicalQuantity(request.delivered, 'delivered', false);
  const available = quantity(capacity.available, 'capacity.available');
  const priorDelivered = quantity(receipt.delivered, 'receipt.delivered');
  const amount = quantity(delivered, 'delivered');
  if (available.unit !== amount.unit || priorDelivered.unit !== amount.unit) {
    kernelInvalid('Technical assistance units must match');
  }
  if (available.amount.lessThan(amount.amount)) {
    kernelInvalid('Technical assistance provider capacity is insufficient');
  }
  const availableAfter = renderQuantity(
    available.amount.minus(amount.amount),
    amount.unit,
  );
  const deliveredAfter = renderQuantity(
    priorDelivered.amount.plus(amount.amount),
    amount.unit,
  );
  const inputRefs = [
    input.providerCapacityFact.factRef,
    input.recipientReceiptFact.factRef,
    input.executionFact.factRef,
  ];
  const transitions = Object.freeze([
    quantityTransition({
      transitionRef: `${executionRef}.provider`,
      inputRefs,
      outputRef: `${executionRef}.provider.after`,
      before: capacity.available,
      delta: renderQuantity(amount.amount.negated(), amount.unit),
      after: availableAfter,
    }),
    quantityTransition({
      transitionRef: `${executionRef}.recipient`,
      inputRefs,
      outputRef: `${executionRef}.recipient.after`,
      before: receipt.delivered,
      delta: delivered,
      after: deliveredAfter,
    }),
  ]);
  return result({
    module: 'V22_3_TECHNICAL_ASSISTANCE',
    trace: input.trace,
    activityType,
    facts: [
      input.providerCapacityFact,
      input.recipientReceiptFact,
      input.executionFact,
    ],
    outputRef: `${executionRef}.result`,
    output: Object.freeze({
      provider: { ...capacity, available: availableAfter },
      recipient: { ...receipt, delivered: deliveredAfter },
    }),
    producedFactRefs: transitions.map((transition) => transition.outputRef),
    validatedReferences: [request.contractRef, request.serviceRightFactRef],
    transitions,
  });
}

function validationResult<T>(input: {
  readonly module: InternationalExecutorBPreparationModule;
  readonly trace: InternationalExecutorBTraceRequest;
  readonly activityType: InternationalActivityType;
  readonly fact: InternationalExecutorBFact<unknown>;
  readonly outputRef: string;
  readonly output: T;
  readonly references: readonly string[];
}): InternationalExecutorBPreparationResult<T> {
  return result({
    module: input.module,
    trace: input.trace,
    activityType: input.activityType,
    facts: [input.fact],
    outputRef: input.outputRef,
    output: input.output,
    producedFactRefs: [],
    validatedReferences: input.references,
    transitions: [],
  });
}

export function validateTreatyPreparation(input: {
  readonly trace: InternationalExecutorBTraceRequest;
  readonly requestFact: InternationalExecutorBFact<TreatyValidationRequest>;
}) {
  const request = foundationFactPayload(
    input.trace,
    input.requestFact,
    'treaty validation',
  );
  const allowed = new Set<InternationalActivityType>([
    'Preferential Trade Agreement',
    'Free Trade Agreement',
    'Customs Cooperation Agreement',
    'Sector Market Access Agreement',
    'Multilateral Economic Agreement',
  ]);
  const activityType = validateInternationalActivityType(request.activityType);
  if (!allowed.has(activityType))
    kernelInvalid('Treaty validator requires a treaty activity type');
  const validationRef = stableReference(request.validationRef, 'validationRef');
  const contractRef = stableReference(request.contractRef, 'contractRef');
  const partyRefs = distinctReferences(request.partyRefs, 'partyRefs');
  if (
    partyRefs.length < 2 ||
    (activityType === 'Multilateral Economic Agreement' && partyRefs.length < 3)
  ) {
    kernelInvalid(
      'Treaty requires the correct bilateral or multilateral party count',
    );
  }
  const groups = {
    tariff: distinctReferences(
      request.tariffScheduleRefs,
      'tariffScheduleRefs',
      false,
    ),
    quota: distinctReferences(
      request.quotaScheduleRefs,
      'quotaScheduleRefs',
      false,
    ),
    origin: distinctReferences(
      request.rulesOfOriginRefs,
      'rulesOfOriginRefs',
      false,
    ),
    customs: distinctReferences(
      request.customsRuleRefs,
      'customsRuleRefs',
      false,
    ),
    sectors: distinctReferences(request.sectorRefs, 'sectorRefs', false),
    access: distinctReferences(
      request.marketAccessRefs,
      'marketAccessRefs',
      false,
    ),
  };
  const dispute =
    request.disputeMechanismRef === null
      ? null
      : stableReference(request.disputeMechanismRef, 'disputeMechanismRef');
  boundTick(request.effectiveAt, input.trace, 'effectiveAt');
  if (
    activityType === 'Preferential Trade Agreement' &&
    (groups.tariff.length === 0 || groups.customs.length === 0)
  )
    kernelInvalid('PTA requires tariff and customs references');
  if (
    activityType === 'Free Trade Agreement' &&
    (groups.tariff.length === 0 ||
      groups.quota.length === 0 ||
      groups.origin.length === 0 ||
      groups.access.length === 0 ||
      dispute === null)
  )
    kernelInvalid(
      'FTA requires tariff, quota, origin, access and dispute references',
    );
  if (
    activityType === 'Customs Cooperation Agreement' &&
    groups.customs.length === 0
  )
    kernelInvalid('Customs agreement requires customs-rule references');
  if (
    activityType === 'Sector Market Access Agreement' &&
    (groups.sectors.length === 0 || groups.access.length === 0)
  )
    kernelInvalid(
      'Sector access agreement requires sector and access references',
    );
  const componentRefs = [
    ...groups.tariff,
    ...groups.quota,
    ...groups.origin,
    ...groups.customs,
    ...groups.sectors,
    ...groups.access,
    ...(dispute === null ? [] : [dispute]),
  ];
  if (
    activityType === 'Multilateral Economic Agreement' &&
    componentRefs.length === 0
  )
    kernelInvalid('Multilateral agreement requires component references');
  return validationResult({
    module: 'V22_3_TREATY_VALIDATION',
    trace: input.trace,
    activityType,
    fact: input.requestFact,
    outputRef: `${validationRef}.result`,
    output: Object.freeze({
      validationRef,
      contractRef,
      partyRefs,
      ...groups,
      disputeMechanismRef: dispute,
    }),
    references: [contractRef, ...partyRefs, ...componentRefs],
  });
}

const SANCTION_MEASURES = new Set<SanctionMeasure>([
  'GOODS_IMPORT_BAN',
  'GOODS_EXPORT_BAN',
  'TECHNOLOGY_LICENCE_BAN',
  'TECHNOLOGY_EXPORT_CONTROL',
  'NEW_FDI_BAN',
  'OWNERSHIP_ACQUISITION_BAN',
  'NEW_SOVEREIGN_LOAN_BAN',
  'FINANCIAL_TRANSACTION_RESTRICTION',
  'ASSET_FREEZE',
  'GOVERNMENT_CONTRACT_BAN',
  'STRATEGIC_GOODS_EMBARGO',
]);

export function validateSanctionPackagePreparation(input: {
  readonly trace: InternationalExecutorBTraceRequest;
  readonly requestFact: InternationalExecutorBFact<SanctionPackageValidationRequest>;
}) {
  const request = foundationFactPayload(
    input.trace,
    input.requestFact,
    'sanction validation',
  );
  const activityType = activity(request.activityType, 'Sanction Package');
  if (Object.hasOwn(request, 'intensity'))
    kernelInvalid('Sanction Package must not contain abstract intensity');
  const validationRef = stableReference(request.validationRef, 'validationRef');
  const contractRef = stableReference(request.contractRef, 'contractRef');
  const imposingPartyRefs = distinctReferences(
    request.imposingPartyRefs,
    'imposingPartyRefs',
  );
  const targetCountryRef = stableReference(
    request.targetCountryRef,
    'targetCountryRef',
  );
  if (imposingPartyRefs.includes(targetCountryRef))
    kernelInvalid('Sanction target cannot be an imposing party');
  if (
    request.measures.length === 0 ||
    request.measures.some((measure) => !SANCTION_MEASURES.has(measure))
  )
    kernelInvalid('Sanction Package requires enumerated concrete measures');
  if (new Set(request.measures).size !== request.measures.length)
    kernelInvalid('Sanction measures must be unique');
  const targetRefs = distinctReferences(request.targetRefs, 'targetRefs');
  const exemptionRefs = distinctReferences(
    request.exemptionRefs,
    'exemptionRefs',
    false,
  );
  const approvalRefs = distinctReferences(
    request.requiredApprovalFactRefs,
    'requiredApprovalFactRefs',
  );
  boundTick(request.startAt, input.trace, 'startAt');
  const endConditionFactRef = stableReference(
    request.endConditionFactRef,
    'endConditionFactRef',
  );
  if (typeof request.grandfatherExistingContracts !== 'boolean')
    kernelInvalid('grandfatherExistingContracts must be boolean');
  return validationResult({
    module: 'V22_3_SANCTION_VALIDATION',
    trace: input.trace,
    activityType,
    fact: input.requestFact,
    outputRef: `${validationRef}.result`,
    output: Object.freeze({
      validationRef,
      contractRef,
      imposingPartyRefs,
      targetCountryRef,
      measures: Object.freeze([...request.measures]),
      targetRefs,
      exemptionRefs,
      approvalRefs,
      endConditionFactRef,
      grandfatherExistingContracts: request.grandfatherExistingContracts,
    }),
    references: [
      contractRef,
      ...imposingPartyRefs,
      targetCountryRef,
      ...targetRefs,
      ...exemptionRefs,
      ...approvalRefs,
      endConditionFactRef,
    ],
  });
}

export function validateInternationalTenderPreparation(input: {
  readonly trace: InternationalExecutorBTraceRequest;
  readonly requestFact: InternationalExecutorBFact<InternationalTenderValidationRequest>;
}) {
  const request = foundationFactPayload(
    input.trace,
    input.requestFact,
    'tender validation',
  );
  const activityType = activity(request.activityType, 'International Tender');
  const validationRef = stableReference(request.validationRef, 'validationRef');
  const contractRef = stableReference(request.contractRef, 'contractRef');
  const tenderRef = stableReference(request.tenderRef, 'tenderRef');
  const requestingCountryRef = stableReference(
    request.requestingCountryRef,
    'requestingCountryRef',
  );
  const needFactRef = stableReference(request.needFactRef, 'needFactRef');
  const required = canonicalQuantity(request.required, 'required', false);
  const maximumUnitPrice = canonicalMoney(
    request.maximumUnitPrice,
    'maximumUnitPrice',
    false,
  );
  if (typeof request.partialAwardAllowed !== 'boolean')
    kernelInvalid('partialAwardAllowed must be boolean');
  if (request.bids.length === 0 || request.awards.length === 0)
    kernelInvalid('Tender validation requires bids and awards');
  const bids = request.bids.map((bid, index) => {
    const offered = canonicalQuantity(
      bid.offered,
      `bids[${index}].offered`,
      false,
    );
    const unitPrice = canonicalMoney(
      bid.unitPrice,
      `bids[${index}].unitPrice`,
      false,
    );
    if (
      offered.unit !== required.unit ||
      unitPrice.currency !== maximumUnitPrice.currency ||
      money(unitPrice, 'unit price').amount.greaterThan(
        money(maximumUnitPrice, 'maximum unit price').amount,
      )
    )
      kernelInvalid(
        'Tender bid violates quantity unit, currency or maximum price',
      );
    return Object.freeze({
      bidRef: stableReference(bid.bidRef, `bids[${index}].bidRef`),
      bidderRef: stableReference(bid.bidderRef, `bids[${index}].bidderRef`),
      offered,
      unitPrice,
      reliabilityFactRef: stableReference(
        bid.reliabilityFactRef,
        `bids[${index}].reliabilityFactRef`,
      ),
      technologyFactRef: stableReference(
        bid.technologyFactRef,
        `bids[${index}].technologyFactRef`,
      ),
    });
  });
  distinctReferences(
    bids.map((bid) => bid.bidRef),
    'bid references',
  );
  distinctReferences(
    bids.map((bid) => bid.bidderRef),
    'bidder references',
  );
  if (bids.some((bid) => bid.bidderRef === requestingCountryRef)) {
    kernelInvalid('International tender bidder must differ from requester');
  }
  const awardedByBid = new Map<string, ReturnType<typeof nonNegative>>();
  const awards = request.awards.map((award, index) => {
    const bidRef = stableReference(award.bidRef, `awards[${index}].bidRef`);
    const bid = bids.find((candidate) => candidate.bidRef === bidRef);
    if (bid === undefined)
      kernelInvalid('Tender award must reference a supplied bid');
    const awarded = canonicalQuantity(
      award.awarded,
      `awards[${index}].awarded`,
      false,
    );
    if (awarded.unit !== required.unit)
      kernelInvalid('Tender award unit must match requirement');
    const prior = awardedByBid.get(bidRef) ?? nonNegative('0', 'zero');
    const next = prior.plus(quantity(awarded, 'awarded').amount);
    if (next.greaterThan(quantity(bid.offered, 'bid offered').amount))
      kernelInvalid('Tender award exceeds its bid');
    awardedByBid.set(bidRef, next);
    return Object.freeze({
      awardRef: stableReference(award.awardRef, `awards[${index}].awardRef`),
      bidRef,
      awarded,
    });
  });
  distinctReferences(
    awards.map((award) => award.awardRef),
    'award references',
  );
  const totalAwarded = awards.reduce(
    (sum, award) => sum.plus(quantity(award.awarded, 'award').amount),
    nonNegative('0', 'zero'),
  );
  const requiredAmount = quantity(required, 'required').amount;
  if (
    totalAwarded.greaterThan(requiredAmount) ||
    (!request.partialAwardAllowed && !totalAwarded.equals(requiredAmount))
  )
    kernelInvalid(
      'Tender awards must respect required quantity and partial-award rule',
    );
  const evaluationRuleFactRef = stableReference(
    request.evaluationRuleFactRef,
    'evaluationRuleFactRef',
  );
  boundTick(request.evaluatedAt, input.trace, 'evaluatedAt');
  return validationResult({
    module: 'V22_3_TENDER_VALIDATION',
    trace: input.trace,
    activityType,
    fact: input.requestFact,
    outputRef: `${validationRef}.result`,
    output: Object.freeze({
      validationRef,
      contractRef,
      tenderRef,
      requestingCountryRef,
      required,
      maximumUnitPrice,
      bids: Object.freeze(bids),
      awards: Object.freeze(awards),
      totalAwarded: renderQuantity(totalAwarded, required.unit),
    }),
    references: [
      contractRef,
      tenderRef,
      requestingCountryRef,
      needFactRef,
      evaluationRuleFactRef,
      ...bids.flatMap((bid) => [
        bid.bidRef,
        bid.reliabilityFactRef,
        bid.technologyFactRef,
      ]),
      ...awards.map((award) => award.awardRef),
    ],
  });
}

export function validateStrategicPartnershipPreparation(input: {
  readonly trace: InternationalExecutorBTraceRequest;
  readonly requestFact: InternationalExecutorBFact<StrategicPartnershipValidationRequest>;
}) {
  const request = foundationFactPayload(
    input.trace,
    input.requestFact,
    'strategic partnership validation',
  );
  const activityType = activity(
    request.activityType,
    'Strategic Economic Partnership',
  );
  if (Object.hasOwn(request, 'buff') || Object.hasOwn(request, 'directEffect'))
    kernelInvalid(
      'Strategic partnership must not contain an abstract buff or direct effect',
    );
  const validationRef = stableReference(request.validationRef, 'validationRef');
  const contractRef = stableReference(request.contractRef, 'contractRef');
  const partnerRefs = distinctReferences(request.partnerRefs, 'partnerRefs');
  if (partnerRefs.length < 2)
    kernelInvalid('Strategic partnership requires at least two partners');
  const strategicScopeRefs = distinctReferences(
    request.strategicScopeRefs,
    'strategicScopeRefs',
  );
  const componentAgreementRefs = distinctReferences(
    request.componentAgreementRefs,
    'componentAgreementRefs',
  );
  const governanceFactRef = stableReference(
    request.governanceFactRef,
    'governanceFactRef',
  );
  const captainApprovalFactRef = stableReference(
    request.captainApprovalFactRef,
    'captainApprovalFactRef',
  );
  boundTick(request.reviewedAt, input.trace, 'reviewedAt');
  return validationResult({
    module: 'V22_3_STRATEGIC_PARTNERSHIP_VALIDATION',
    trace: input.trace,
    activityType,
    fact: input.requestFact,
    outputRef: `${validationRef}.result`,
    output: Object.freeze({
      validationRef,
      contractRef,
      partnerRefs,
      strategicScopeRefs,
      componentAgreementRefs,
      governanceFactRef,
      captainApprovalFactRef,
    }),
    references: [
      contractRef,
      ...partnerRefs,
      ...strategicScopeRefs,
      ...componentAgreementRefs,
      governanceFactRef,
      captainApprovalFactRef,
    ],
  });
}
