import {
  canonicalHashInput,
  canonicalSerialize,
} from '../serialization/canonical.js';

import {
  exactQuantityTransition,
  foundationFactBinding,
  foundationFactPayload,
  type ExactQuantityTransition,
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
  quantity,
  renderMoney,
  renderQuantity,
  type ExactMoney,
  type ExactQuantity,
} from './common.js';

export const CAPTAIN_GOVERNANCE_PREPARATION_STATUS =
  'PREPARATION_ONLY_DEPENDENCIES_OPEN' as const;

export const CAPTAIN_STRATEGIES = Object.freeze([
  'EXPORT_LED_INDUSTRIALISATION',
  'TECHNOLOGY_LEADERSHIP',
  'RESOURCE_POWER',
  'GREEN_TRANSITION',
  'DOMESTIC_CONSUMPTION_ECONOMY',
  'FINANCIAL_SERVICES_HUB',
  'STRATEGIC_SELF_SUFFICIENCY',
  'SOCIAL_DEVELOPMENT',
  'INFRASTRUCTURE_LED_GROWTH',
] as const);

export const CAPTAIN_PRIORITIES = Object.freeze([
  'ECONOMIC_GROWTH',
  'PRICE_STABILITY',
  'EMPLOYMENT',
  'FISCAL_SUSTAINABILITY',
  'EXTERNAL_STABILITY',
  'POVERTY_REDUCTION',
  'ENERGY_SECURITY',
  'FOOD_SECURITY',
  'PRODUCTIVITY',
  'GREEN_TRANSITION',
  'FINANCIAL_STABILITY',
  'NATIONAL_SECURITY',
] as const);

export const CAPTAIN_OFFICES = Object.freeze([
  'CAPTAIN',
  'FINANCE',
  'TRADE',
  'INDUSTRY',
  'CENTRAL_BANK',
  'SOCIAL',
] as const);

export const POLITICAL_CAPITAL_BUCKETS = Object.freeze([
  'FISCAL_REFORM',
  'INDUSTRIAL_STRATEGY',
  'TRADE_NEGOTIATIONS',
  'SOCIAL_REFORM_PROTECTION',
  'STRATEGIC_PROJECT_SUPPORT',
  'CRISIS_RESPONSE',
  'UNALLOCATED_CRISIS_RESERVE',
] as const);

export type CaptainStrategy = (typeof CAPTAIN_STRATEGIES)[number];
export type CaptainPriority = (typeof CAPTAIN_PRIORITIES)[number];
export type CaptainOffice = (typeof CAPTAIN_OFFICES)[number];
export type PoliticalCapitalBucket = (typeof POLITICAL_CAPITAL_BUCKETS)[number];

export interface PoliticalCapitalBucketBalance {
  readonly bucket: PoliticalCapitalBucket;
  readonly balance: ExactQuantity;
}

export interface PoliticalCapitalSnapshot {
  readonly capitalRef: string;
  readonly countryRef: string;
  readonly opening: ExactQuantity;
  readonly generated: ExactQuantity;
  readonly total: ExactQuantity;
  readonly available: ExactQuantity;
  readonly spent: ExactQuantity;
  readonly closing: ExactQuantity;
  readonly buckets: readonly PoliticalCapitalBucketBalance[];
}

export interface NationalStrategySnapshot {
  readonly strategyRef: string;
  readonly countryRef: string;
  readonly primary: CaptainStrategy;
  readonly supporting: CaptainStrategy | null;
  readonly status: 'ACTIVE' | 'SUSPENDED_FOR_CRISIS';
  readonly effectiveAt: ExactQuantity;
  readonly reviewAt: ExactQuantity;
}

export type StrategyAction =
  | 'MAINTAIN'
  | 'CHANGE_SUPPORTING'
  | 'CHANGE_PRIMARY'
  | 'SUSPEND_FOR_CRISIS'
  | 'RESUME_AFTER_CRISIS';

export interface StrategyChangeRequest {
  readonly actionRef: string;
  readonly countryRef: string;
  readonly action: StrategyAction;
  readonly nextPrimary: CaptainStrategy;
  readonly nextSupporting: CaptainStrategy | null;
  readonly reasonFactRef: string;
  readonly crisisFactRef: string | null;
  readonly politicalCapitalBucket: PoliticalCapitalBucket;
  readonly politicalCapitalCost: ExactQuantity;
  readonly effectiveAt: ExactQuantity;
  readonly reviewAt: ExactQuantity;
}

export interface NationalPrioritySnapshot {
  readonly priorityRef: string;
  readonly countryRef: string;
  readonly primary: CaptainPriority;
  readonly secondary: CaptainPriority;
  readonly effectiveAt: ExactQuantity;
}

export type PriorityChangeReason =
  | 'EXTERNAL_SHOCK'
  | 'CRISIS'
  | 'TARGET_ACHIEVED'
  | 'DETERIORATION'
  | 'STRATEGY_ALIGNMENT'
  | 'OTHER';

export interface PriorityChangeRequest {
  readonly actionRef: string;
  readonly countryRef: string;
  readonly nextPrimary: CaptainPriority;
  readonly nextSecondary: CaptainPriority;
  readonly reason: PriorityChangeReason;
  readonly reasonFactRef: string;
  readonly politicalCapitalBucket: PoliticalCapitalBucket;
  readonly politicalCapitalCost: ExactQuantity;
  readonly effectiveAt: ExactQuantity;
}

export type CabinetAgendaCategory =
  | 'INFLATION'
  | 'EMPLOYMENT'
  | 'FISCAL'
  | 'TRADE'
  | 'INDUSTRY'
  | 'ENERGY'
  | 'FOOD'
  | 'SOCIAL'
  | 'FINANCIAL'
  | 'SECURITY'
  | 'ENVIRONMENT'
  | 'OTHER';

export type CabinetAgendaPriority = 'STRATEGIC' | 'HIGH' | 'MEDIUM';
export type CabinetAgendaStatus =
  'DRAFT' | 'ACTIVE' | 'UNDER_REVIEW' | 'RESOLVED' | 'ABANDONED';

export interface CabinetAgendaIssue {
  readonly issueRef: string;
  readonly titleRef: string;
  readonly category: CabinetAgendaCategory;
  readonly priority: CabinetAgendaPriority;
  readonly problemFactRef: string;
  readonly targetFactRef: string;
  readonly leadOffice: CaptainOffice;
  readonly supportingOffices: readonly CaptainOffice[];
  readonly constraintFactRefs: readonly string[];
  readonly targetAt: ExactQuantity | null;
  readonly requiresProposal: boolean;
  readonly status: CabinetAgendaStatus;
  readonly notesRef: string | null;
}

export interface CabinetAgendaSnapshot {
  readonly agendaRef: string;
  readonly countryRef: string;
  readonly issues: readonly CabinetAgendaIssue[];
}

export type CabinetAgendaAction =
  'CREATE' | 'EDIT' | 'MARK_UNDER_REVIEW' | 'RESOLVE' | 'ABANDON' | 'REOPEN';

export interface CabinetAgendaChangeRequest {
  readonly actionRef: string;
  readonly countryRef: string;
  readonly action: CabinetAgendaAction;
  readonly issue: CabinetAgendaIssue;
  readonly politicalCapitalBucket: PoliticalCapitalBucket;
  readonly politicalCapitalCost: ExactQuantity;
  readonly effectiveAt: ExactQuantity;
}

export type CabinetProposalStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'REVISION_REQUESTED'
  | 'VOTING'
  | 'APPROVED'
  | 'REJECTED'
  | 'WITHDRAWN'
  | 'IMPLEMENTING'
  | 'CLOSED';

export interface CabinetProposalSnapshot {
  readonly proposalRef: string;
  readonly countryRef: string;
  readonly version: ExactQuantity;
  readonly status: CabinetProposalStatus;
  readonly ownerOffice: CaptainOffice;
  readonly supportingOffices: readonly CaptainOffice[];
  readonly agendaIssueRef: string;
  readonly objectiveFactRef: string;
  readonly settingsFactRef: string;
  readonly fiscalCost: ExactMoney;
  readonly fxCost: ExactMoney;
  readonly politicalCost: ExactQuantity;
  readonly administrativeBurden: ExactQuantity;
  readonly commodityRequirementFactRefs: readonly string[];
  readonly labourRequirementFactRefs: readonly string[];
  readonly technologyPrerequisiteFactRefs: readonly string[];
  readonly riskFactRefs: readonly string[];
  readonly dependencyFactRefs: readonly string[];
  readonly requiredApprovalOffices: readonly CaptainOffice[];
  readonly optionalSupportOffices: readonly CaptainOffice[];
}

export type CaptainProposalDecision =
  | 'APPROVE'
  | 'REJECT'
  | 'REQUEST_REVISION'
  | 'REQUEST_JOINT_PACKAGE'
  | 'CALL_CABINET_VOTE';

export interface ProposalApprovalBinding {
  readonly office: CaptainOffice;
  readonly proposalVersion: ExactQuantity;
  readonly approvalFactRef: string;
}

export interface CaptainProposalDecisionRequest {
  readonly decisionRef: string;
  readonly countryRef: string;
  readonly proposalRef: string;
  readonly proposalVersion: ExactQuantity;
  readonly decision: CaptainProposalDecision;
  readonly reasonFactRef: string;
  readonly approvalBindings: readonly ProposalApprovalBinding[];
  readonly revisionRequestFactRef: string | null;
  readonly additionalOfficeRefs: readonly CaptainOffice[];
  readonly cabinetVoteFactRef: string | null;
  readonly politicalCapitalBucket: PoliticalCapitalBucket;
  readonly politicalCapitalCost: ExactQuantity;
  readonly decidedAt: ExactQuantity;
}

export interface PoliticalCapitalAllocationRequest {
  readonly allocationRef: string;
  readonly countryRef: string;
  readonly fromBucket: PoliticalCapitalBucket;
  readonly toBucket: PoliticalCapitalBucket;
  readonly amount: ExactQuantity;
  readonly reasonFactRef: string;
  readonly effectiveAt: ExactQuantity;
}

export type CommitmentStatementType =
  | 'POLICY_ANNOUNCEMENT'
  | 'CRISIS_ADDRESS'
  | 'STRATEGIC_ANNOUNCEMENT'
  | 'INTERNATIONAL_STATEMENT'
  | 'REFORM_EXPLANATION'
  | 'PERFORMANCE_UPDATE';

export type CommitmentLevel = 'CAUTIOUS' | 'FIRM' | 'EXPLICIT_TARGET';

export interface GovernmentCommitmentRequest {
  readonly commitmentRef: string;
  readonly countryRef: string;
  readonly statementType: CommitmentStatementType;
  readonly level: CommitmentLevel;
  readonly issueFactRef: string;
  readonly targetMetricRef: string | null;
  readonly targetDirectionRef: string | null;
  readonly targetValue: ExactQuantity | null;
  readonly deadlineAt: ExactQuantity | null;
  readonly linkedPolicyFactRef: string | null;
  readonly linkedStrategyOrPriorityRef: string;
  readonly politicalCapitalBucket: PoliticalCapitalBucket;
  readonly politicalCapitalCost: ExactQuantity;
  readonly announcedAt: ExactQuantity;
}

export type CabinetConflictType =
  | 'FISCAL_EXPANSION_VS_MONETARY_TIGHTENING'
  | 'CARBON_COST_VS_LOW_ENERGY_PRICE'
  | 'CAPITAL_CONTROLS_VS_FDI_ATTRACTION'
  | 'EXPORT_RESTRICTION_VS_TRADE_FX'
  | 'MINIMUM_WAGE_VS_LOW_SKILL_EMPLOYMENT'
  | 'INDUSTRIAL_SUBSIDY_VS_FISCAL_SUSTAINABILITY'
  | 'INFRASTRUCTURE_VS_DEBT_INFLATION'
  | 'RESERVE_DEFENCE_VS_RESERVE_ADEQUACY'
  | 'WELFARE_EXPANSION_VS_FISCAL_SPACE'
  | 'AUTOMATION_VS_LABOUR_DISPLACEMENT'
  | 'SELF_SUFFICIENCY_VS_IMPORT_EFFICIENCY'
  | 'INDUSTRIAL_EXPANSION_VS_CAPACITY';

export interface CabinetConflictSnapshot {
  readonly conflictRef: string;
  readonly countryRef: string;
  readonly type: CabinetConflictType;
  readonly officeRefs: readonly CaptainOffice[];
  readonly sourceFactRefs: readonly string[];
}

export type CabinetCoordinationAction =
  | 'ACCEPT_TRADE_OFF'
  | 'REQUEST_COORDINATION'
  | 'ADD_TO_AGENDA'
  | 'REQUEST_JOINT_PACKAGE'
  | 'REQUEST_PROPOSAL_REVISION'
  | 'CONVENE_CABINET_VOTE';

export interface CabinetCoordinationRequest {
  readonly coordinationRef: string;
  readonly countryRef: string;
  readonly conflictRef: string;
  readonly action: CabinetCoordinationAction;
  readonly participatingOffices: readonly CaptainOffice[];
  readonly agendaIssueRef: string | null;
  readonly proposalRef: string | null;
  readonly reasonFactRef: string;
  readonly politicalCapitalBucket: PoliticalCapitalBucket;
  readonly politicalCapitalCost: ExactQuantity;
  readonly coordinatedAt: ExactQuantity;
}

export type CaptainGovernancePreparationModule =
  | 'V24_1_STRATEGY'
  | 'V24_1_PRIORITY'
  | 'V24_1_AGENDA'
  | 'V24_1_PROPOSAL_DECISION'
  | 'V24_1_POLITICAL_CAPITAL_ALLOCATION'
  | 'V24_1_COMMITMENT'
  | 'V24_1_COORDINATION';

export interface CaptainGovernanceReplayProof {
  readonly module: CaptainGovernancePreparationModule;
  readonly traceRef: string;
  readonly calculationVersion: string;
  readonly snapshot: FoundationSnapshotBinding;
  readonly snapshotAt: ExactQuantity;
  readonly inputFactRefs: readonly string[];
  readonly inputFacts: readonly FoundationFactBinding[];
  readonly outputRef: string;
  readonly outputCanonical: string;
  readonly transitions: readonly ExactQuantityTransition[];
  readonly hashInput: string;
}

export interface CaptainGovernancePreparationResult<TOutput = unknown> {
  readonly preparationStatus: typeof CAPTAIN_GOVERNANCE_PREPARATION_STATUS;
  readonly outputRef: string;
  readonly output: TOutput;
  readonly transitions: readonly ExactQuantityTransition[];
  readonly replayProof: CaptainGovernanceReplayProof;
  readonly authoritativeEconomicMutation: false;
}

export type CaptainGovernanceFact<T> = FoundationFact<T>;
export type CaptainGovernanceTraceRequest = FoundationTraceRequest;

const STABLE_REFERENCE = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u;
const STRATEGY_SET = new Set<string>(CAPTAIN_STRATEGIES);
const PRIORITY_SET = new Set<string>(CAPTAIN_PRIORITIES);
const OFFICE_SET = new Set<string>(CAPTAIN_OFFICES);
const BUCKET_SET = new Set<string>(POLITICAL_CAPITAL_BUCKETS);
const FORBIDDEN_MUTATION_FIELDS = Object.freeze([
  'taxRateAfter',
  'policyRateAfter',
  'productionAfter',
  'inventoryAfter',
  'gdpAfter',
  'productivityAfter',
  'tradeBalanceAfter',
  'moneySupplyAfter',
  'credibilityEffect',
  'publicSupportEffect',
] as const);

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

function enumValue<T extends string>(
  value: unknown,
  allowed: ReadonlySet<string>,
  label: string,
): T {
  if (typeof value !== 'string' || !allowed.has(value)) {
    kernelInvalid(`${label} is not a fixed value`);
  }
  return value as T;
}

function strategy(value: unknown, label: string): CaptainStrategy {
  return enumValue(value, STRATEGY_SET, label);
}

function priority(value: unknown, label: string): CaptainPriority {
  return enumValue(value, PRIORITY_SET, label);
}

function office(value: unknown, label: string): CaptainOffice {
  return enumValue(value, OFFICE_SET, label);
}

function bucket(value: unknown, label: string): PoliticalCapitalBucket {
  return enumValue(value, BUCKET_SET, label);
}

function offices(
  values: readonly CaptainOffice[],
  label: string,
  requireAtLeastOne = false,
): readonly CaptainOffice[] {
  if (requireAtLeastOne && values.length === 0) {
    kernelInvalid(`${label} requires at least one office`);
  }
  const result = values.map((value, index) =>
    office(value, `${label}[${index}]`),
  );
  if (new Set(result).size !== result.length) {
    kernelInvalid(`${label} must not repeat an office`);
  }
  return Object.freeze(result);
}

function rejectForbiddenEconomicMutation(value: unknown, label: string): void {
  if (typeof value !== 'object' || value === null) return;
  for (const field of FORBIDDEN_MUTATION_FIELDS) {
    if (Object.hasOwn(value, field)) {
      kernelInvalid(
        `${label} must not contain direct economic mutation ${field}`,
      );
    }
  }
}

function canonicalPayload(value: unknown, label: string): string {
  try {
    return canonicalSerialize(value);
  } catch {
    return kernelInvalid(`${label} must contain canonical data`);
  }
}

function capitalQuantity(
  value: ExactQuantity,
  label: string,
): ReturnType<typeof nonNegativeQuantity>['amount'] {
  return nonNegativeQuantity(value, 'political_capital', label).amount;
}

function tick(
  value: ExactQuantity,
  label: string,
): ReturnType<typeof nonNegativeQuantity>['amount'] {
  const parsed = nonNegativeQuantity(value, 'sim_millisecond', label).amount;
  if (!parsed.isInteger()) kernelInvalid(`${label} must be an integer tick`);
  return parsed;
}

function boundTick(
  value: ExactQuantity,
  trace: CaptainGovernanceTraceRequest,
  label: string,
): ExactQuantity {
  const actual = tick(value, label);
  const expected = tick(trace.snapshotAt, 'trace.snapshotAt');
  if (!actual.equals(expected)) {
    kernelInvalid(`${label} must equal the replay snapshot tick`);
  }
  return renderQuantity(actual, 'sim_millisecond');
}

function futureTick(
  value: ExactQuantity,
  trace: CaptainGovernanceTraceRequest,
  label: string,
): ExactQuantity {
  const actual = tick(value, label);
  if (!actual.greaterThan(tick(trace.snapshotAt, 'trace.snapshotAt'))) {
    kernelInvalid(`${label} must be after the replay snapshot tick`);
  }
  return renderQuantity(actual, 'sim_millisecond');
}

function capitalSnapshot(
  value: PoliticalCapitalSnapshot,
  label: string,
): PoliticalCapitalSnapshot {
  if (value.buckets.length !== POLITICAL_CAPITAL_BUCKETS.length) {
    kernelInvalid(`${label}.buckets must contain all seven fixed buckets`);
  }
  const buckets = value.buckets.map((entry, index) => {
    const expected = POLITICAL_CAPITAL_BUCKETS[index];
    const actual = bucket(entry.bucket, `${label}.buckets[${index}].bucket`);
    if (actual !== expected) {
      kernelInvalid(`${label}.buckets must use the fixed bucket order`);
    }
    return Object.freeze({
      bucket: actual,
      balance: renderQuantity(
        capitalQuantity(entry.balance, `${label}.buckets[${index}].balance`),
        'political_capital',
      ),
    });
  });
  const opening = capitalQuantity(value.opening, `${label}.opening`);
  const generated = capitalQuantity(value.generated, `${label}.generated`);
  const total = capitalQuantity(value.total, `${label}.total`);
  const available = capitalQuantity(value.available, `${label}.available`);
  const spent = capitalQuantity(value.spent, `${label}.spent`);
  const closing = capitalQuantity(value.closing, `${label}.closing`);
  const bucketTotal = buckets.reduce(
    (sum, entry) => sum.plus(capitalQuantity(entry.balance, 'bucket balance')),
    nonNegative('0', 'zero'),
  );
  if (
    !opening.plus(generated).equals(total) ||
    !bucketTotal.equals(available) ||
    !available.plus(spent).equals(total) ||
    !closing.equals(available)
  ) {
    kernelInvalid(
      `${label} must conserve opening + generated = total = available + spent, closing = available, and available = buckets`,
    );
  }
  return Object.freeze({
    capitalRef: stableReference(value.capitalRef, `${label}.capitalRef`),
    countryRef: stableReference(value.countryRef, `${label}.countryRef`),
    opening: renderQuantity(opening, 'political_capital'),
    generated: renderQuantity(generated, 'political_capital'),
    total: renderQuantity(total, 'political_capital'),
    available: renderQuantity(available, 'political_capital'),
    spent: renderQuantity(spent, 'political_capital'),
    closing: renderQuantity(closing, 'political_capital'),
    buckets: Object.freeze(buckets),
  });
}

function replaceBucket(
  snapshot: PoliticalCapitalSnapshot,
  target: PoliticalCapitalBucket,
  nextAmount: ReturnType<typeof nonNegative>,
): readonly PoliticalCapitalBucketBalance[] {
  return Object.freeze(
    snapshot.buckets.map((entry) =>
      entry.bucket === target
        ? Object.freeze({
            bucket: entry.bucket,
            balance: renderQuantity(nextAmount, 'political_capital'),
          })
        : entry,
    ),
  );
}

function applyPoliticalCost(input: {
  readonly snapshot: PoliticalCapitalSnapshot;
  readonly cost: ExactQuantity;
  readonly bucket: PoliticalCapitalBucket;
  readonly actionRef: string;
  readonly inputRefs: readonly string[];
}): {
  readonly capital: PoliticalCapitalSnapshot;
  readonly transitions: readonly ExactQuantityTransition[];
} {
  const cost = capitalQuantity(input.cost, 'politicalCapitalCost');
  const target = input.snapshot.buckets.find(
    (entry) => entry.bucket === input.bucket,
  );
  if (target === undefined)
    kernelInvalid('Political-capital bucket is missing');
  const bucketBefore = capitalQuantity(target.balance, 'bucket balance');
  const availableBefore = capitalQuantity(
    input.snapshot.available,
    'capital available',
  );
  const spentBefore = capitalQuantity(input.snapshot.spent, 'capital spent');
  if (bucketBefore.lessThan(cost)) {
    kernelInvalid('Political-capital bucket is insufficient');
  }
  const capital = capitalSnapshot(
    {
      ...input.snapshot,
      available: renderQuantity(
        availableBefore.minus(cost),
        'political_capital',
      ),
      spent: renderQuantity(spentBefore.plus(cost), 'political_capital'),
      closing: renderQuantity(availableBefore.minus(cost), 'political_capital'),
      buckets: replaceBucket(
        input.snapshot,
        input.bucket,
        bucketBefore.minus(cost),
      ),
    },
    'capitalAfter',
  );
  const negative = renderQuantity(cost.negated(), 'political_capital');
  const positiveCost = renderQuantity(cost, 'political_capital');
  return Object.freeze({
    capital,
    transitions: Object.freeze([
      exactQuantityTransition({
        transitionRef: `${input.actionRef}.capital.bucket`,
        inputRefs: input.inputRefs,
        outputRef: `${input.actionRef}.capital.bucket.after`,
        before: target.balance,
        delta: negative,
        after: capital.buckets.find((entry) => entry.bucket === input.bucket)!
          .balance,
      }),
      exactQuantityTransition({
        transitionRef: `${input.actionRef}.capital.available`,
        inputRefs: input.inputRefs,
        outputRef: `${input.actionRef}.capital.available.after`,
        before: input.snapshot.available,
        delta: negative,
        after: capital.available,
      }),
      exactQuantityTransition({
        transitionRef: `${input.actionRef}.capital.closing`,
        inputRefs: input.inputRefs,
        outputRef: `${input.actionRef}.capital.closing.after`,
        before: input.snapshot.closing,
        delta: negative,
        after: capital.closing,
      }),
      exactQuantityTransition({
        transitionRef: `${input.actionRef}.capital.spent`,
        inputRefs: input.inputRefs,
        outputRef: `${input.actionRef}.capital.spent.after`,
        before: input.snapshot.spent,
        delta: positiveCost,
        after: capital.spent,
      }),
    ]),
  });
}

function strategySnapshot(
  value: NationalStrategySnapshot,
  label: string,
): NationalStrategySnapshot {
  const primary = strategy(value.primary, `${label}.primary`);
  const supporting =
    value.supporting === null
      ? null
      : strategy(value.supporting, `${label}.supporting`);
  if (supporting === primary) {
    kernelInvalid(`${label} supporting strategy must differ from primary`);
  }
  if (value.status !== 'ACTIVE' && value.status !== 'SUSPENDED_FOR_CRISIS') {
    kernelInvalid(`${label}.status is invalid`);
  }
  return Object.freeze({
    strategyRef: stableReference(value.strategyRef, `${label}.strategyRef`),
    countryRef: stableReference(value.countryRef, `${label}.countryRef`),
    primary,
    supporting,
    status: value.status,
    effectiveAt: renderQuantity(
      tick(value.effectiveAt, `${label}.effectiveAt`),
      'sim_millisecond',
    ),
    reviewAt: renderQuantity(
      tick(value.reviewAt, `${label}.reviewAt`),
      'sim_millisecond',
    ),
  });
}

function prioritySnapshot(
  value: NationalPrioritySnapshot,
  label: string,
): NationalPrioritySnapshot {
  const primary = priority(value.primary, `${label}.primary`);
  const secondary = priority(value.secondary, `${label}.secondary`);
  if (primary === secondary) {
    kernelInvalid(`${label} primary and secondary priorities must differ`);
  }
  return Object.freeze({
    priorityRef: stableReference(value.priorityRef, `${label}.priorityRef`),
    countryRef: stableReference(value.countryRef, `${label}.countryRef`),
    primary,
    secondary,
    effectiveAt: renderQuantity(
      tick(value.effectiveAt, `${label}.effectiveAt`),
      'sim_millisecond',
    ),
  });
}

const AGENDA_CATEGORIES = new Set<string>([
  'INFLATION',
  'EMPLOYMENT',
  'FISCAL',
  'TRADE',
  'INDUSTRY',
  'ENERGY',
  'FOOD',
  'SOCIAL',
  'FINANCIAL',
  'SECURITY',
  'ENVIRONMENT',
  'OTHER',
]);
const AGENDA_PRIORITIES = new Set<string>(['STRATEGIC', 'HIGH', 'MEDIUM']);
const AGENDA_STATUSES = new Set<string>([
  'DRAFT',
  'ACTIVE',
  'UNDER_REVIEW',
  'RESOLVED',
  'ABANDONED',
]);

function agendaIssue(
  value: CabinetAgendaIssue,
  label: string,
): CabinetAgendaIssue {
  const leadOffice = office(value.leadOffice, `${label}.leadOffice`);
  const supportingOffices = offices(
    value.supportingOffices,
    `${label}.supportingOffices`,
  );
  if (supportingOffices.includes(leadOffice)) {
    kernelInvalid(`${label} lead office cannot also be supporting`);
  }
  if (supportingOffices.length > 5) {
    kernelInvalid(`${label} supports at most five offices`);
  }
  if (typeof value.requiresProposal !== 'boolean') {
    kernelInvalid(`${label}.requiresProposal must be boolean`);
  }
  return Object.freeze({
    issueRef: stableReference(value.issueRef, `${label}.issueRef`),
    titleRef: stableReference(value.titleRef, `${label}.titleRef`),
    category: enumValue<CabinetAgendaCategory>(
      value.category,
      AGENDA_CATEGORIES,
      `${label}.category`,
    ),
    priority: enumValue<CabinetAgendaPriority>(
      value.priority,
      AGENDA_PRIORITIES,
      `${label}.priority`,
    ),
    problemFactRef: stableReference(
      value.problemFactRef,
      `${label}.problemFactRef`,
    ),
    targetFactRef: stableReference(
      value.targetFactRef,
      `${label}.targetFactRef`,
    ),
    leadOffice,
    supportingOffices,
    constraintFactRefs: distinctReferences(
      value.constraintFactRefs,
      `${label}.constraintFactRefs`,
      false,
    ),
    targetAt:
      value.targetAt === null
        ? null
        : renderQuantity(
            tick(value.targetAt, `${label}.targetAt`),
            'sim_millisecond',
          ),
    requiresProposal: value.requiresProposal,
    status: enumValue<CabinetAgendaStatus>(
      value.status,
      AGENDA_STATUSES,
      `${label}.status`,
    ),
    notesRef:
      value.notesRef === null
        ? null
        : stableReference(value.notesRef, `${label}.notesRef`),
  });
}

function agendaSnapshot(
  value: CabinetAgendaSnapshot,
  label: string,
): CabinetAgendaSnapshot {
  const issues = value.issues.map((issue, index) =>
    agendaIssue(issue, `${label}.issues[${index}]`),
  );
  distinctReferences(
    issues.map((issue) => issue.issueRef),
    `${label}.issueRefs`,
    false,
  );
  if (
    issues.filter(
      (issue) => issue.status === 'ACTIVE' || issue.status === 'UNDER_REVIEW',
    ).length > 3
  ) {
    kernelInvalid('Cabinet agenda permits at most three active issues');
  }
  return Object.freeze({
    agendaRef: stableReference(value.agendaRef, `${label}.agendaRef`),
    countryRef: stableReference(value.countryRef, `${label}.countryRef`),
    issues: Object.freeze(issues),
  });
}

function proposalSnapshot(
  value: CabinetProposalSnapshot,
  label: string,
): CabinetProposalSnapshot {
  const version = nonNegativeQuantity(
    value.version,
    'proposal_version',
    `${label}.version`,
  ).amount;
  if (!version.isInteger())
    kernelInvalid(`${label}.version must be an integer`);
  const ownerOffice = office(value.ownerOffice, `${label}.ownerOffice`);
  const supportingOffices = offices(
    value.supportingOffices,
    `${label}.supportingOffices`,
  );
  if (supportingOffices.includes(ownerOffice)) {
    kernelInvalid(`${label} owner cannot also be supporting`);
  }
  const statusSet = new Set<string>([
    'DRAFT',
    'SUBMITTED',
    'REVISION_REQUESTED',
    'VOTING',
    'APPROVED',
    'REJECTED',
    'WITHDRAWN',
    'IMPLEMENTING',
    'CLOSED',
  ]);
  const exactMoney = (value: ExactMoney, field: string): ExactMoney => {
    const parsed = money(value, field);
    return renderMoney(nonNegative(value.amount, field), parsed.currency);
  };
  return Object.freeze({
    proposalRef: stableReference(value.proposalRef, `${label}.proposalRef`),
    countryRef: stableReference(value.countryRef, `${label}.countryRef`),
    version: renderQuantity(version, 'proposal_version'),
    status: enumValue<CabinetProposalStatus>(
      value.status,
      statusSet,
      `${label}.status`,
    ),
    ownerOffice,
    supportingOffices,
    agendaIssueRef: stableReference(
      value.agendaIssueRef,
      `${label}.agendaIssueRef`,
    ),
    objectiveFactRef: stableReference(
      value.objectiveFactRef,
      `${label}.objectiveFactRef`,
    ),
    settingsFactRef: stableReference(
      value.settingsFactRef,
      `${label}.settingsFactRef`,
    ),
    fiscalCost: exactMoney(value.fiscalCost, `${label}.fiscalCost`),
    fxCost: exactMoney(value.fxCost, `${label}.fxCost`),
    politicalCost: renderQuantity(
      capitalQuantity(value.politicalCost, `${label}.politicalCost`),
      'political_capital',
    ),
    administrativeBurden: renderQuantity(
      nonNegativeQuantity(
        value.administrativeBurden,
        'administrative_capacity',
        `${label}.administrativeBurden`,
      ).amount,
      'administrative_capacity',
    ),
    commodityRequirementFactRefs: distinctReferences(
      value.commodityRequirementFactRefs,
      `${label}.commodityRequirementFactRefs`,
      false,
    ),
    labourRequirementFactRefs: distinctReferences(
      value.labourRequirementFactRefs,
      `${label}.labourRequirementFactRefs`,
      false,
    ),
    technologyPrerequisiteFactRefs: distinctReferences(
      value.technologyPrerequisiteFactRefs,
      `${label}.technologyPrerequisiteFactRefs`,
      false,
    ),
    riskFactRefs: distinctReferences(
      value.riskFactRefs,
      `${label}.riskFactRefs`,
      false,
    ),
    dependencyFactRefs: distinctReferences(
      value.dependencyFactRefs,
      `${label}.dependencyFactRefs`,
      false,
    ),
    requiredApprovalOffices: offices(
      value.requiredApprovalOffices,
      `${label}.requiredApprovalOffices`,
      true,
    ),
    optionalSupportOffices: offices(
      value.optionalSupportOffices,
      `${label}.optionalSupportOffices`,
    ),
  });
}

function replayProof(input: {
  readonly module: CaptainGovernancePreparationModule;
  readonly trace: CaptainGovernanceTraceRequest;
  readonly facts: readonly CaptainGovernanceFact<unknown>[];
  readonly outputRef: string;
  readonly output: unknown;
  readonly transitions: readonly ExactQuantityTransition[];
}): CaptainGovernanceReplayProof {
  const inputFacts = input.facts.map((fact, index) =>
    foundationFactBinding(input.trace, fact, `inputFacts[${index}]`),
  );
  const inputFactRefs = distinctReferences(
    inputFacts.map((fact) => fact.factRef),
    'inputFactRefs',
  );
  const outputRef = stableReference(input.outputRef, 'outputRef');
  if (inputFactRefs.includes(outputRef)) {
    kernelInvalid('outputRef must differ from input facts');
  }
  distinctReferences(
    input.transitions.map((transition) => transition.transitionRef),
    'transitionRefs',
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
    snapshotAt: renderQuantity(
      tick(input.trace.snapshotAt, 'snapshotAt'),
      'sim_millisecond',
    ),
    inputFactRefs,
    inputFacts: Object.freeze(inputFacts),
    outputRef,
    outputCanonical: canonicalPayload(input.output, 'output'),
    transitions: Object.freeze([...input.transitions]),
  };
  return Object.freeze({ ...body, hashInput: canonicalHashInput(body) });
}

function result<T>(input: {
  readonly module: CaptainGovernancePreparationModule;
  readonly trace: CaptainGovernanceTraceRequest;
  readonly facts: readonly CaptainGovernanceFact<unknown>[];
  readonly outputRef: string;
  readonly output: T;
  readonly transitions: readonly ExactQuantityTransition[];
}): CaptainGovernancePreparationResult<T> {
  return Object.freeze({
    preparationStatus: CAPTAIN_GOVERNANCE_PREPARATION_STATUS,
    outputRef: stableReference(input.outputRef, 'outputRef'),
    output: input.output,
    transitions: Object.freeze([...input.transitions]),
    replayProof: replayProof(input),
    authoritativeEconomicMutation: false,
  });
}

export function prepareCaptainStrategyChange(input: {
  readonly trace: CaptainGovernanceTraceRequest;
  readonly strategyFact: CaptainGovernanceFact<NationalStrategySnapshot>;
  readonly capitalFact: CaptainGovernanceFact<PoliticalCapitalSnapshot>;
  readonly requestFact: CaptainGovernanceFact<StrategyChangeRequest>;
}) {
  const current = strategySnapshot(
    foundationFactPayload(input.trace, input.strategyFact, 'strategy'),
    'strategy',
  );
  const capital = capitalSnapshot(
    foundationFactPayload(input.trace, input.capitalFact, 'capital'),
    'capital',
  );
  const request = foundationFactPayload(
    input.trace,
    input.requestFact,
    'strategy request',
  );
  rejectForbiddenEconomicMutation(request, 'strategy request');
  const actionRef = stableReference(request.actionRef, 'actionRef');
  const countryRef = stableReference(request.countryRef, 'countryRef');
  if (countryRef !== current.countryRef || countryRef !== capital.countryRef) {
    kernelInvalid('Strategy, capital and request country must match');
  }
  const actions = new Set<string>([
    'MAINTAIN',
    'CHANGE_SUPPORTING',
    'CHANGE_PRIMARY',
    'SUSPEND_FOR_CRISIS',
    'RESUME_AFTER_CRISIS',
  ]);
  const action = enumValue<StrategyAction>(request.action, actions, 'action');
  const nextPrimary = strategy(request.nextPrimary, 'nextPrimary');
  const nextSupporting =
    request.nextSupporting === null
      ? null
      : strategy(request.nextSupporting, 'nextSupporting');
  if (nextPrimary === nextSupporting) {
    kernelInvalid('Supporting strategy must differ from primary');
  }
  const cost = capitalQuantity(
    request.politicalCapitalCost,
    'politicalCapitalCost',
  );
  stableReference(request.reasonFactRef, 'reasonFactRef');
  boundTick(request.effectiveAt, input.trace, 'effectiveAt');
  const reviewAt = futureTick(request.reviewAt, input.trace, 'reviewAt');
  let nextStatus = current.status;
  if (action === 'MAINTAIN') {
    if (
      nextPrimary !== current.primary ||
      nextSupporting !== current.supporting ||
      !cost.isZero()
    ) {
      kernelInvalid(
        'Maintain strategy cannot change strategy or spend capital',
      );
    }
  } else if (action === 'CHANGE_SUPPORTING') {
    if (
      nextPrimary !== current.primary ||
      nextSupporting === current.supporting
    ) {
      kernelInvalid(
        'Supporting-strategy change must only change supporting strategy',
      );
    }
  } else if (action === 'CHANGE_PRIMARY') {
    if (nextPrimary === current.primary || cost.isZero()) {
      kernelInvalid(
        'Primary-strategy change requires a new primary and positive cost',
      );
    }
  } else if (action === 'SUSPEND_FOR_CRISIS') {
    if (
      current.status !== 'ACTIVE' ||
      request.crisisFactRef === null ||
      nextPrimary !== current.primary ||
      nextSupporting !== current.supporting
    ) {
      kernelInvalid(
        'Crisis suspension requires active unchanged strategy and crisis fact',
      );
    }
    stableReference(request.crisisFactRef, 'crisisFactRef');
    nextStatus = 'SUSPENDED_FOR_CRISIS';
  } else {
    if (
      current.status !== 'SUSPENDED_FOR_CRISIS' ||
      request.crisisFactRef === null ||
      nextPrimary !== current.primary ||
      nextSupporting !== current.supporting
    ) {
      kernelInvalid(
        'Crisis resume requires suspended unchanged strategy and crisis fact',
      );
    }
    stableReference(request.crisisFactRef, 'crisisFactRef');
    nextStatus = 'ACTIVE';
  }
  const inputRefs = [
    input.strategyFact.factRef,
    input.capitalFact.factRef,
    input.requestFact.factRef,
  ];
  const costResult = applyPoliticalCost({
    snapshot: capital,
    cost: request.politicalCapitalCost,
    bucket: bucket(request.politicalCapitalBucket, 'politicalCapitalBucket'),
    actionRef,
    inputRefs,
  });
  const strategyAfter = strategySnapshot(
    {
      strategyRef: actionRef,
      countryRef,
      primary: nextPrimary,
      supporting: nextSupporting,
      status: nextStatus,
      effectiveAt: request.effectiveAt,
      reviewAt,
    },
    'strategyAfter',
  );
  return result({
    module: 'V24_1_STRATEGY',
    trace: input.trace,
    facts: [input.strategyFact, input.capitalFact, input.requestFact],
    outputRef: `${actionRef}.result`,
    output: Object.freeze({
      strategy: strategyAfter,
      capital: costResult.capital,
    }),
    transitions: costResult.transitions,
  });
}

export function prepareCaptainPriorityChange(input: {
  readonly trace: CaptainGovernanceTraceRequest;
  readonly priorityFact: CaptainGovernanceFact<NationalPrioritySnapshot>;
  readonly capitalFact: CaptainGovernanceFact<PoliticalCapitalSnapshot>;
  readonly requestFact: CaptainGovernanceFact<PriorityChangeRequest>;
}) {
  const current = prioritySnapshot(
    foundationFactPayload(input.trace, input.priorityFact, 'priority'),
    'priority',
  );
  const capital = capitalSnapshot(
    foundationFactPayload(input.trace, input.capitalFact, 'capital'),
    'capital',
  );
  const request = foundationFactPayload(
    input.trace,
    input.requestFact,
    'priority request',
  );
  rejectForbiddenEconomicMutation(request, 'priority request');
  const actionRef = stableReference(request.actionRef, 'actionRef');
  const countryRef = stableReference(request.countryRef, 'countryRef');
  if (countryRef !== current.countryRef || countryRef !== capital.countryRef)
    kernelInvalid('Priority, capital and request country must match');
  const nextPrimary = priority(request.nextPrimary, 'nextPrimary');
  const nextSecondary = priority(request.nextSecondary, 'nextSecondary');
  if (nextPrimary === nextSecondary)
    kernelInvalid('Primary and secondary priorities must differ');
  if (nextPrimary === current.primary && nextSecondary === current.secondary) {
    kernelInvalid('Priority change must alter primary or secondary priority');
  }
  const reasons = new Set<string>([
    'EXTERNAL_SHOCK',
    'CRISIS',
    'TARGET_ACHIEVED',
    'DETERIORATION',
    'STRATEGY_ALIGNMENT',
    'OTHER',
  ]);
  enumValue<PriorityChangeReason>(request.reason, reasons, 'reason');
  stableReference(request.reasonFactRef, 'reasonFactRef');
  boundTick(request.effectiveAt, input.trace, 'effectiveAt');
  const inputRefs = [
    input.priorityFact.factRef,
    input.capitalFact.factRef,
    input.requestFact.factRef,
  ];
  const costResult = applyPoliticalCost({
    snapshot: capital,
    cost: request.politicalCapitalCost,
    bucket: bucket(request.politicalCapitalBucket, 'politicalCapitalBucket'),
    actionRef,
    inputRefs,
  });
  const priorityAfter = prioritySnapshot(
    {
      priorityRef: actionRef,
      countryRef,
      primary: nextPrimary,
      secondary: nextSecondary,
      effectiveAt: request.effectiveAt,
    },
    'priorityAfter',
  );
  return result({
    module: 'V24_1_PRIORITY',
    trace: input.trace,
    facts: [input.priorityFact, input.capitalFact, input.requestFact],
    outputRef: `${actionRef}.result`,
    output: Object.freeze({
      priority: priorityAfter,
      capital: costResult.capital,
    }),
    transitions: costResult.transitions,
  });
}

export function prepareCabinetAgendaChange(input: {
  readonly trace: CaptainGovernanceTraceRequest;
  readonly agendaFact: CaptainGovernanceFact<CabinetAgendaSnapshot>;
  readonly capitalFact: CaptainGovernanceFact<PoliticalCapitalSnapshot>;
  readonly requestFact: CaptainGovernanceFact<CabinetAgendaChangeRequest>;
}) {
  const current = agendaSnapshot(
    foundationFactPayload(input.trace, input.agendaFact, 'agenda'),
    'agenda',
  );
  const capital = capitalSnapshot(
    foundationFactPayload(input.trace, input.capitalFact, 'capital'),
    'capital',
  );
  const request = foundationFactPayload(
    input.trace,
    input.requestFact,
    'agenda request',
  );
  rejectForbiddenEconomicMutation(request, 'agenda request');
  const actionRef = stableReference(request.actionRef, 'actionRef');
  const countryRef = stableReference(request.countryRef, 'countryRef');
  if (countryRef !== current.countryRef || countryRef !== capital.countryRef)
    kernelInvalid('Agenda, capital and request country must match');
  const actions = new Set<string>([
    'CREATE',
    'EDIT',
    'MARK_UNDER_REVIEW',
    'RESOLVE',
    'ABANDON',
    'REOPEN',
  ]);
  const action = enumValue<CabinetAgendaAction>(
    request.action,
    actions,
    'action',
  );
  const requestedIssue = agendaIssue(request.issue, 'request.issue');
  const existingIndex = current.issues.findIndex(
    (issue) => issue.issueRef === requestedIssue.issueRef,
  );
  if (action === 'CREATE' && existingIndex !== -1)
    kernelInvalid('Agenda CREATE requires a new issue');
  if (action !== 'CREATE' && existingIndex === -1)
    kernelInvalid(`${action} requires an existing issue`);
  if (
    action === 'CREATE' &&
    requestedIssue.status !== 'DRAFT' &&
    requestedIssue.status !== 'ACTIVE'
  ) {
    kernelInvalid('Agenda CREATE requires DRAFT or ACTIVE status');
  }
  const existingIssue =
    existingIndex === -1 ? undefined : current.issues[existingIndex];
  if (
    action === 'EDIT' &&
    existingIssue !== undefined &&
    requestedIssue.status !== existingIssue.status
  ) {
    kernelInvalid('Agenda EDIT cannot bypass a dedicated status action');
  }
  const expectedStatus: Partial<
    Record<CabinetAgendaAction, CabinetAgendaStatus>
  > = {
    MARK_UNDER_REVIEW: 'UNDER_REVIEW',
    RESOLVE: 'RESOLVED',
    ABANDON: 'ABANDONED',
    REOPEN: 'ACTIVE',
  };
  const status = expectedStatus[action];
  if (status !== undefined && requestedIssue.status !== status)
    kernelInvalid(`${action} requires ${status} status`);
  const issues =
    action === 'CREATE'
      ? [...current.issues, requestedIssue]
      : current.issues.map((issue, index) =>
          index === existingIndex ? requestedIssue : issue,
        );
  const agendaAfter = agendaSnapshot(
    { agendaRef: actionRef, countryRef, issues },
    'agendaAfter',
  );
  boundTick(request.effectiveAt, input.trace, 'effectiveAt');
  const inputRefs = [
    input.agendaFact.factRef,
    input.capitalFact.factRef,
    input.requestFact.factRef,
  ];
  const costResult = applyPoliticalCost({
    snapshot: capital,
    cost: request.politicalCapitalCost,
    bucket: bucket(request.politicalCapitalBucket, 'politicalCapitalBucket'),
    actionRef,
    inputRefs,
  });
  return result({
    module: 'V24_1_AGENDA',
    trace: input.trace,
    facts: [input.agendaFact, input.capitalFact, input.requestFact],
    outputRef: `${actionRef}.result`,
    output: Object.freeze({ agenda: agendaAfter, capital: costResult.capital }),
    transitions: costResult.transitions,
  });
}

function sameExactQuantity(left: ExactQuantity, right: ExactQuantity): boolean {
  const a = quantity(left, 'left quantity');
  const b = quantity(right, 'right quantity');
  return a.unit === b.unit && a.amount.equals(b.amount);
}

export function prepareCaptainProposalDecision(input: {
  readonly trace: CaptainGovernanceTraceRequest;
  readonly proposalFact: CaptainGovernanceFact<CabinetProposalSnapshot>;
  readonly capitalFact: CaptainGovernanceFact<PoliticalCapitalSnapshot>;
  readonly requestFact: CaptainGovernanceFact<CaptainProposalDecisionRequest>;
}) {
  const proposal = proposalSnapshot(
    foundationFactPayload(input.trace, input.proposalFact, 'proposal'),
    'proposal',
  );
  const capital = capitalSnapshot(
    foundationFactPayload(input.trace, input.capitalFact, 'capital'),
    'capital',
  );
  const request = foundationFactPayload(
    input.trace,
    input.requestFact,
    'proposal decision request',
  );
  rejectForbiddenEconomicMutation(request, 'proposal decision request');
  const decisionRef = stableReference(request.decisionRef, 'decisionRef');
  const countryRef = stableReference(request.countryRef, 'countryRef');
  if (
    countryRef !== proposal.countryRef ||
    countryRef !== capital.countryRef ||
    stableReference(request.proposalRef, 'proposalRef') !==
      proposal.proposalRef ||
    !sameExactQuantity(request.proposalVersion, proposal.version)
  )
    kernelInvalid(
      'Proposal decision must bind exact country, proposal and version',
    );
  if (proposal.status !== 'SUBMITTED' && proposal.status !== 'VOTING')
    kernelInvalid('Captain decision requires submitted or voting proposal');
  const decisions = new Set<string>([
    'APPROVE',
    'REJECT',
    'REQUEST_REVISION',
    'REQUEST_JOINT_PACKAGE',
    'CALL_CABINET_VOTE',
  ]);
  const decision = enumValue<CaptainProposalDecision>(
    request.decision,
    decisions,
    'decision',
  );
  stableReference(request.reasonFactRef, 'reasonFactRef');
  boundTick(request.decidedAt, input.trace, 'decidedAt');
  const approvalBindings = request.approvalBindings.map((binding, index) =>
    Object.freeze({
      office: office(binding.office, `approvalBindings[${index}].office`),
      proposalVersion: renderQuantity(
        nonNegativeQuantity(
          binding.proposalVersion,
          'proposal_version',
          `approvalBindings[${index}].proposalVersion`,
        ).amount,
        'proposal_version',
      ),
      approvalFactRef: stableReference(
        binding.approvalFactRef,
        `approvalBindings[${index}].approvalFactRef`,
      ),
    }),
  );
  offices(
    approvalBindings.map((binding) => binding.office),
    'approval binding offices',
  );
  if (
    approvalBindings.some(
      (binding) =>
        !sameExactQuantity(binding.proposalVersion, proposal.version),
    )
  )
    kernelInvalid('Every approval must bind the exact proposal version');
  if (decision === 'APPROVE') {
    if (
      proposal.requiredApprovalOffices.some(
        (required) =>
          !approvalBindings.some((binding) => binding.office === required),
      )
    )
      kernelInvalid(
        'Approval decision requires every required office approval',
      );
  }
  const additionalOfficeRefs = offices(
    request.additionalOfficeRefs,
    'additionalOfficeRefs',
  );
  if (
    decision === 'REQUEST_REVISION' &&
    request.revisionRequestFactRef === null
  )
    kernelInvalid('Revision decision requires revision request fact');
  if (request.revisionRequestFactRef !== null)
    stableReference(request.revisionRequestFactRef, 'revisionRequestFactRef');
  if (decision === 'REQUEST_JOINT_PACKAGE' && additionalOfficeRefs.length === 0)
    kernelInvalid('Joint package requires additional offices');
  if (decision === 'CALL_CABINET_VOTE' && request.cabinetVoteFactRef === null)
    kernelInvalid('Cabinet vote decision requires vote fact');
  if (request.cabinetVoteFactRef !== null)
    stableReference(request.cabinetVoteFactRef, 'cabinetVoteFactRef');
  const inputRefs = [
    input.proposalFact.factRef,
    input.capitalFact.factRef,
    input.requestFact.factRef,
  ];
  const costResult = applyPoliticalCost({
    snapshot: capital,
    cost: request.politicalCapitalCost,
    bucket: bucket(request.politicalCapitalBucket, 'politicalCapitalBucket'),
    actionRef: decisionRef,
    inputRefs,
  });
  const decisionCandidate = Object.freeze({
    decisionRef,
    countryRef,
    proposalRef: proposal.proposalRef,
    proposalVersion: proposal.version,
    decision,
    reasonFactRef: request.reasonFactRef,
    approvalBindings: Object.freeze(approvalBindings),
    revisionRequestFactRef: request.revisionRequestFactRef,
    additionalOfficeRefs,
    cabinetVoteFactRef: request.cabinetVoteFactRef,
    decidedAt: request.decidedAt,
    ownerSettingsFactRef: proposal.settingsFactRef,
    authoritativeOwnerMutation: false as const,
  });
  return result({
    module: 'V24_1_PROPOSAL_DECISION',
    trace: input.trace,
    facts: [input.proposalFact, input.capitalFact, input.requestFact],
    outputRef: `${decisionRef}.result`,
    output: Object.freeze({
      decision: decisionCandidate,
      proposal,
      capital: costResult.capital,
    }),
    transitions: costResult.transitions,
  });
}

export function preparePoliticalCapitalAllocation(input: {
  readonly trace: CaptainGovernanceTraceRequest;
  readonly capitalFact: CaptainGovernanceFact<PoliticalCapitalSnapshot>;
  readonly requestFact: CaptainGovernanceFact<PoliticalCapitalAllocationRequest>;
}) {
  const capital = capitalSnapshot(
    foundationFactPayload(input.trace, input.capitalFact, 'capital'),
    'capital',
  );
  const request = foundationFactPayload(
    input.trace,
    input.requestFact,
    'allocation request',
  );
  rejectForbiddenEconomicMutation(request, 'allocation request');
  const allocationRef = stableReference(request.allocationRef, 'allocationRef');
  if (stableReference(request.countryRef, 'countryRef') !== capital.countryRef)
    kernelInvalid('Allocation country must match capital');
  const fromBucket = bucket(request.fromBucket, 'fromBucket');
  const toBucket = bucket(request.toBucket, 'toBucket');
  if (fromBucket === toBucket)
    kernelInvalid('Political-capital allocation requires distinct buckets');
  const amount = capitalQuantity(request.amount, 'amount');
  if (amount.isZero())
    kernelInvalid('Political-capital allocation amount must be positive');
  const from = capital.buckets.find((entry) => entry.bucket === fromBucket)!;
  const to = capital.buckets.find((entry) => entry.bucket === toBucket)!;
  const fromAmount = capitalQuantity(from.balance, 'from balance');
  const toAmount = capitalQuantity(to.balance, 'to balance');
  if (fromAmount.lessThan(amount))
    kernelInvalid('Political-capital source bucket is insufficient');
  stableReference(request.reasonFactRef, 'reasonFactRef');
  boundTick(request.effectiveAt, input.trace, 'effectiveAt');
  let nextBuckets = replaceBucket(
    capital,
    fromBucket,
    fromAmount.minus(amount),
  );
  nextBuckets = Object.freeze(
    nextBuckets.map((entry) =>
      entry.bucket === toBucket
        ? Object.freeze({
            bucket: entry.bucket,
            balance: renderQuantity(toAmount.plus(amount), 'political_capital'),
          })
        : entry,
    ),
  );
  const capitalAfter = capitalSnapshot(
    { ...capital, buckets: nextBuckets },
    'capitalAfter',
  );
  const inputRefs = [input.capitalFact.factRef, input.requestFact.factRef];
  const transitions = Object.freeze([
    exactQuantityTransition({
      transitionRef: `${allocationRef}.from`,
      inputRefs,
      outputRef: `${allocationRef}.from.after`,
      before: from.balance,
      delta: renderQuantity(amount.negated(), 'political_capital'),
      after: capitalAfter.buckets.find((entry) => entry.bucket === fromBucket)!
        .balance,
    }),
    exactQuantityTransition({
      transitionRef: `${allocationRef}.to`,
      inputRefs,
      outputRef: `${allocationRef}.to.after`,
      before: to.balance,
      delta: renderQuantity(amount, 'political_capital'),
      after: capitalAfter.buckets.find((entry) => entry.bucket === toBucket)!
        .balance,
    }),
  ]);
  return result({
    module: 'V24_1_POLITICAL_CAPITAL_ALLOCATION',
    trace: input.trace,
    facts: [input.capitalFact, input.requestFact],
    outputRef: `${allocationRef}.result`,
    output: Object.freeze({
      capital: capitalAfter,
      allocation: Object.freeze({
        allocationRef,
        fromBucket,
        toBucket,
        amount: request.amount,
        reasonFactRef: request.reasonFactRef,
      }),
    }),
    transitions,
  });
}

export function prepareGovernmentCommitment(input: {
  readonly trace: CaptainGovernanceTraceRequest;
  readonly capitalFact: CaptainGovernanceFact<PoliticalCapitalSnapshot>;
  readonly requestFact: CaptainGovernanceFact<GovernmentCommitmentRequest>;
}) {
  const capital = capitalSnapshot(
    foundationFactPayload(input.trace, input.capitalFact, 'capital'),
    'capital',
  );
  const request = foundationFactPayload(
    input.trace,
    input.requestFact,
    'commitment request',
  );
  rejectForbiddenEconomicMutation(request, 'commitment request');
  const commitmentRef = stableReference(request.commitmentRef, 'commitmentRef');
  const countryRef = stableReference(request.countryRef, 'countryRef');
  if (countryRef !== capital.countryRef)
    kernelInvalid('Commitment country must match capital');
  const statementTypes = new Set<string>([
    'POLICY_ANNOUNCEMENT',
    'CRISIS_ADDRESS',
    'STRATEGIC_ANNOUNCEMENT',
    'INTERNATIONAL_STATEMENT',
    'REFORM_EXPLANATION',
    'PERFORMANCE_UPDATE',
  ]);
  const levels = new Set<string>(['CAUTIOUS', 'FIRM', 'EXPLICIT_TARGET']);
  const statementType = enumValue<CommitmentStatementType>(
    request.statementType,
    statementTypes,
    'statementType',
  );
  const level = enumValue<CommitmentLevel>(request.level, levels, 'level');
  stableReference(request.issueFactRef, 'issueFactRef');
  stableReference(
    request.linkedStrategyOrPriorityRef,
    'linkedStrategyOrPriorityRef',
  );
  if (request.linkedPolicyFactRef !== null)
    stableReference(request.linkedPolicyFactRef, 'linkedPolicyFactRef');
  if (
    level === 'CAUTIOUS' &&
    (request.targetMetricRef !== null ||
      request.targetDirectionRef !== null ||
      request.targetValue !== null ||
      request.deadlineAt !== null)
  )
    kernelInvalid(
      'Cautious commitment cannot contain numeric target or deadline',
    );
  if (
    level === 'FIRM' &&
    (request.targetMetricRef === null || request.targetDirectionRef === null)
  )
    kernelInvalid('Firm commitment requires metric and direction references');
  if (
    level === 'EXPLICIT_TARGET' &&
    (request.targetMetricRef === null ||
      request.targetDirectionRef === null ||
      request.targetValue === null ||
      request.deadlineAt === null)
  )
    kernelInvalid(
      'Explicit target requires metric, direction, value and deadline',
    );
  if (request.targetMetricRef !== null)
    stableReference(request.targetMetricRef, 'targetMetricRef');
  if (request.targetDirectionRef !== null)
    stableReference(request.targetDirectionRef, 'targetDirectionRef');
  const targetValue =
    request.targetValue === null
      ? null
      : renderQuantity(
          quantity(request.targetValue, 'targetValue').amount,
          quantity(request.targetValue, 'targetValue').unit,
        );
  const deadlineAt =
    request.deadlineAt === null
      ? null
      : futureTick(request.deadlineAt, input.trace, 'deadlineAt');
  boundTick(request.announcedAt, input.trace, 'announcedAt');
  const inputRefs = [input.capitalFact.factRef, input.requestFact.factRef];
  const costResult = applyPoliticalCost({
    snapshot: capital,
    cost: request.politicalCapitalCost,
    bucket: bucket(request.politicalCapitalBucket, 'politicalCapitalBucket'),
    actionRef: commitmentRef,
    inputRefs,
  });
  const commitment = Object.freeze({
    commitmentRef,
    countryRef,
    statementType,
    level,
    issueFactRef: request.issueFactRef,
    targetMetricRef: request.targetMetricRef,
    targetDirectionRef: request.targetDirectionRef,
    targetValue,
    deadlineAt,
    linkedPolicyFactRef: request.linkedPolicyFactRef,
    linkedStrategyOrPriorityRef: request.linkedStrategyOrPriorityRef,
    status: 'ACTIVE' as const,
  });
  return result({
    module: 'V24_1_COMMITMENT',
    trace: input.trace,
    facts: [input.capitalFact, input.requestFact],
    outputRef: `${commitmentRef}.result`,
    output: Object.freeze({ commitment, capital: costResult.capital }),
    transitions: costResult.transitions,
  });
}

export function prepareCabinetCoordination(input: {
  readonly trace: CaptainGovernanceTraceRequest;
  readonly conflictFact: CaptainGovernanceFact<CabinetConflictSnapshot>;
  readonly capitalFact: CaptainGovernanceFact<PoliticalCapitalSnapshot>;
  readonly requestFact: CaptainGovernanceFact<CabinetCoordinationRequest>;
}) {
  const conflict = foundationFactPayload(
    input.trace,
    input.conflictFact,
    'conflict',
  );
  const capital = capitalSnapshot(
    foundationFactPayload(input.trace, input.capitalFact, 'capital'),
    'capital',
  );
  const request = foundationFactPayload(
    input.trace,
    input.requestFact,
    'coordination request',
  );
  rejectForbiddenEconomicMutation(request, 'coordination request');
  const conflictTypes = new Set<string>([
    'FISCAL_EXPANSION_VS_MONETARY_TIGHTENING',
    'CARBON_COST_VS_LOW_ENERGY_PRICE',
    'CAPITAL_CONTROLS_VS_FDI_ATTRACTION',
    'EXPORT_RESTRICTION_VS_TRADE_FX',
    'MINIMUM_WAGE_VS_LOW_SKILL_EMPLOYMENT',
    'INDUSTRIAL_SUBSIDY_VS_FISCAL_SUSTAINABILITY',
    'INFRASTRUCTURE_VS_DEBT_INFLATION',
    'RESERVE_DEFENCE_VS_RESERVE_ADEQUACY',
    'WELFARE_EXPANSION_VS_FISCAL_SPACE',
    'AUTOMATION_VS_LABOUR_DISPLACEMENT',
    'SELF_SUFFICIENCY_VS_IMPORT_EFFICIENCY',
    'INDUSTRIAL_EXPANSION_VS_CAPACITY',
  ]);
  const normalizedConflict = Object.freeze({
    conflictRef: stableReference(conflict.conflictRef, 'conflictRef'),
    countryRef: stableReference(conflict.countryRef, 'conflict.countryRef'),
    type: enumValue<CabinetConflictType>(
      conflict.type,
      conflictTypes,
      'conflict.type',
    ),
    officeRefs: offices(conflict.officeRefs, 'conflict.officeRefs', true),
    sourceFactRefs: distinctReferences(
      conflict.sourceFactRefs,
      'conflict.sourceFactRefs',
    ),
  });
  if (normalizedConflict.officeRefs.length < 2)
    kernelInvalid('Cabinet conflict requires at least two offices');
  const coordinationRef = stableReference(
    request.coordinationRef,
    'coordinationRef',
  );
  const countryRef = stableReference(request.countryRef, 'countryRef');
  if (
    countryRef !== capital.countryRef ||
    countryRef !== normalizedConflict.countryRef ||
    stableReference(request.conflictRef, 'request.conflictRef') !==
      normalizedConflict.conflictRef
  )
    kernelInvalid('Coordination must bind conflict, capital and country');
  const actions = new Set<string>([
    'ACCEPT_TRADE_OFF',
    'REQUEST_COORDINATION',
    'ADD_TO_AGENDA',
    'REQUEST_JOINT_PACKAGE',
    'REQUEST_PROPOSAL_REVISION',
    'CONVENE_CABINET_VOTE',
  ]);
  const action = enumValue<CabinetCoordinationAction>(
    request.action,
    actions,
    'action',
  );
  const participatingOffices = offices(
    request.participatingOffices,
    'participatingOffices',
    true,
  );
  if (
    participatingOffices.some(
      (item) => !normalizedConflict.officeRefs.includes(item),
    )
  )
    kernelInvalid('Coordination offices must belong to the conflict');
  if (action === 'ADD_TO_AGENDA' && request.agendaIssueRef === null)
    kernelInvalid('ADD_TO_AGENDA requires agenda issue reference');
  if (
    (action === 'REQUEST_JOINT_PACKAGE' ||
      action === 'REQUEST_PROPOSAL_REVISION' ||
      action === 'CONVENE_CABINET_VOTE') &&
    request.proposalRef === null
  )
    kernelInvalid(`${action} requires proposal reference`);
  if (request.agendaIssueRef !== null)
    stableReference(request.agendaIssueRef, 'agendaIssueRef');
  if (request.proposalRef !== null)
    stableReference(request.proposalRef, 'proposalRef');
  stableReference(request.reasonFactRef, 'reasonFactRef');
  boundTick(request.coordinatedAt, input.trace, 'coordinatedAt');
  const inputRefs = [
    input.conflictFact.factRef,
    input.capitalFact.factRef,
    input.requestFact.factRef,
  ];
  const costResult = applyPoliticalCost({
    snapshot: capital,
    cost: request.politicalCapitalCost,
    bucket: bucket(request.politicalCapitalBucket, 'politicalCapitalBucket'),
    actionRef: coordinationRef,
    inputRefs,
  });
  const coordination = Object.freeze({
    coordinationRef,
    countryRef,
    conflictRef: normalizedConflict.conflictRef,
    action,
    participatingOffices,
    agendaIssueRef: request.agendaIssueRef,
    proposalRef: request.proposalRef,
    reasonFactRef: request.reasonFactRef,
    coordinatedAt: request.coordinatedAt,
    officePolicyMutations: Object.freeze([]),
  });
  return result({
    module: 'V24_1_COORDINATION',
    trace: input.trace,
    facts: [input.conflictFact, input.capitalFact, input.requestFact],
    outputRef: `${coordinationRef}.result`,
    output: Object.freeze({
      coordination,
      conflict: normalizedConflict,
      capital: costResult.capital,
    }),
    transitions: costResult.transitions,
  });
}

function recomputeProof(
  module: CaptainGovernancePreparationModule,
  trace: CaptainGovernanceTraceRequest,
  facts: readonly CaptainGovernanceFact<unknown>[],
): CaptainGovernanceReplayProof {
  const count = (expected: number): void => {
    if (facts.length !== expected)
      kernelInvalid(`${module} replay requires ${expected} facts`);
  };
  const typed = <T>(index: number): CaptainGovernanceFact<T> => {
    const fact = facts[index];
    if (fact === undefined)
      return kernelInvalid(`${module} replay fact is missing`);
    return fact as CaptainGovernanceFact<T>;
  };
  switch (module) {
    case 'V24_1_STRATEGY':
      count(3);
      return prepareCaptainStrategyChange({
        trace,
        strategyFact: typed(0),
        capitalFact: typed(1),
        requestFact: typed(2),
      }).replayProof;
    case 'V24_1_PRIORITY':
      count(3);
      return prepareCaptainPriorityChange({
        trace,
        priorityFact: typed(0),
        capitalFact: typed(1),
        requestFact: typed(2),
      }).replayProof;
    case 'V24_1_AGENDA':
      count(3);
      return prepareCabinetAgendaChange({
        trace,
        agendaFact: typed(0),
        capitalFact: typed(1),
        requestFact: typed(2),
      }).replayProof;
    case 'V24_1_PROPOSAL_DECISION':
      count(3);
      return prepareCaptainProposalDecision({
        trace,
        proposalFact: typed(0),
        capitalFact: typed(1),
        requestFact: typed(2),
      }).replayProof;
    case 'V24_1_POLITICAL_CAPITAL_ALLOCATION':
      count(2);
      return preparePoliticalCapitalAllocation({
        trace,
        capitalFact: typed(0),
        requestFact: typed(1),
      }).replayProof;
    case 'V24_1_COMMITMENT':
      count(2);
      return prepareGovernmentCommitment({
        trace,
        capitalFact: typed(0),
        requestFact: typed(1),
      }).replayProof;
    case 'V24_1_COORDINATION':
      count(3);
      return prepareCabinetCoordination({
        trace,
        conflictFact: typed(0),
        capitalFact: typed(1),
        requestFact: typed(2),
      }).replayProof;
    default:
      return kernelInvalid('Unknown Captain governance replay module');
  }
}

export function assertCaptainGovernanceReplayEvidence(
  proof: CaptainGovernanceReplayProof,
  facts: readonly CaptainGovernanceFact<unknown>[],
): void {
  const trace: CaptainGovernanceTraceRequest = {
    traceRef: proof.traceRef,
    calculationVersion: proof.calculationVersion,
    snapshot: proof.snapshot,
    snapshotAt: proof.snapshotAt,
  };
  const rebound = facts.map((fact, index) =>
    foundationFactBinding(trace, fact, `replay.inputFacts[${index}]`),
  );
  const recomputed = recomputeProof(proof.module, trace, facts);
  if (
    canonicalPayload(rebound, 'replayed facts') !==
      canonicalPayload(proof.inputFacts, 'recorded facts') ||
    canonicalPayload(recomputed, 'recomputed proof') !==
      canonicalPayload(proof, 'recorded proof')
  )
    kernelInvalid('Captain governance replay does not match recomputed result');
}
