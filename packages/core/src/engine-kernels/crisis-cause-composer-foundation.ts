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
  nonNegativeQuantity,
  quantity,
  renderMoney,
  renderQuantity,
  type ExactMoney,
  type ExactQuantity,
  type WorldDecimalValue,
} from './common.js';

/** No Event Kernel execution, clock mutation, or Admin authorization here. */
export const CRISIS_CAUSE_COMPOSER_STATUS = 'PREPARATION_ONLY' as const;

export type CrisisActionKind =
  'START_CRISIS' | 'END_CRISIS' | 'PAUSE_WORLD' | 'RESUME_WORLD';
export type CrisisLifecycleStatus = 'INACTIVE' | 'ACTIVE' | 'ENDED';
export type CandidateClockMode = 'RUNNING' | 'PAUSED';

export interface CrisisStateSnapshot {
  readonly worldRef: string;
  readonly seasonRef: string;
  readonly crisisRef: string;
  readonly stateVersionRef: string;
  readonly seasonStatus: 'ACTIVE' | 'ENDED';
  readonly lifecycleStatus: CrisisLifecycleStatus;
  readonly clockMode: CandidateClockMode;
  readonly atSimTime: ExactQuantity;
  readonly appliedActionRefs: readonly string[];
  /** Causal history: END never automatically heals an engine-owned field. */
  readonly causeFactRefs: readonly string[];
}

export interface CrisisActionStatement {
  readonly actionRef: string;
  readonly actionVersionRef: string;
  readonly action: CrisisActionKind;
  readonly worldRef: string;
  readonly seasonRef: string;
  readonly crisisRef: string;
  readonly expectedStateVersionRef: string;
  readonly nextStateVersionRef: string;
  readonly atSimTime: ExactQuantity;
  readonly reasonRef: string;
  readonly causeFactRefs: readonly string[];
}

export interface CrisisApproval {
  readonly approvalRef: string;
  readonly requirementRef: string;
  readonly versionRef: string;
  readonly actorRef: string;
  readonly status: 'APPROVED' | 'REJECTED' | 'PENDING';
  readonly decisionRef: string | null;
}

export interface CrisisAuthorizationStatement {
  readonly actionRef: string;
  readonly actionVersionRef: string;
  readonly actorRef: string;
  readonly worldRef: string;
  readonly seasonRef: string;
  readonly serverAuthorizationRef: string;
  readonly membershipRef: string;
  readonly adminEntitlementRef: string;
  readonly decision: 'AUTHORIZED' | 'DENIED';
  readonly requiredApprovalRefs: readonly string[];
  readonly approvals: readonly CrisisApproval[];
}

export type CrisisCauseKind =
  | 'RESOURCE_EXTRACTION_OUTAGE'
  | 'ENERGY_GENERATION_OUTAGE'
  | 'PRODUCTION_CAPACITY_DAMAGE'
  | 'INFRASTRUCTURE_SERVICE_DAMAGE'
  | 'HEALTHCARE_DEMAND_SURGE'
  | 'BANKING_ASSET_LOSS'
  | 'TRADE_ROUTE_DISRUPTION'
  | 'FX_PRIVATE_FLOW_DISRUPTION'
  | 'PUBLIC_SAFETY_DEMAND_SURGE'
  | 'TECHNOLOGY_RESEARCH_DISRUPTION'
  | 'POPULATION_DISPLACEMENT';

export type CrisisCauseField =
  | 'EXTRACTION_CAPACITY'
  | 'GENERATION_CAPACITY'
  | 'PRODUCTION_CAPACITY'
  | 'INFRASTRUCTURE_SERVICE_CAPACITY'
  | 'HEALTHCARE_DEMAND'
  | 'LOAN_ASSET_VALUE'
  | 'TRADE_ROUTE_THROUGHPUT'
  | 'PRIVATE_CAPITAL_FLOW_CAPACITY'
  | 'PUBLIC_SAFETY_DEMAND'
  | 'RESEARCH_CAPACITY'
  | 'RESIDENT_POPULATION';

export interface CrisisCauseStatement {
  readonly causeRef: string;
  readonly actionRef: string;
  readonly kind: CrisisCauseKind;
  readonly targetField: CrisisCauseField;
  readonly targetOwnerRef: string;
  readonly targetObjectRef: string;
  readonly before: ExactMoney | ExactQuantity;
  readonly delta: ExactMoney | ExactQuantity;
  readonly sourceReceiptRef: string;
  /** Mandatory for population displacement; never inferred from a score. */
  readonly scenarioEvidenceRef: string | null;
}

export interface CrisisCauseTransition {
  readonly transitionRef: string;
  readonly causeRef: string;
  readonly kind: CrisisCauseKind;
  readonly targetField: CrisisCauseField;
  readonly targetOwnerRef: string;
  readonly targetObjectRef: string;
  readonly before: ExactMoney | ExactQuantity;
  readonly delta: ExactMoney | ExactQuantity;
  readonly after: ExactMoney | ExactQuantity;
  readonly causalFactRefs: readonly string[];
  readonly sourceReceiptRef: string;
  readonly scenarioEvidenceRef: string | null;
}

export interface CrisisCandidateEvent {
  readonly eventRef: string;
  readonly kind:
    | 'CRISIS_START_REQUESTED'
    | 'CRISIS_END_REQUESTED'
    | 'CLOCK_PAUSE_REQUESTED'
    | 'CLOCK_RESUME_REQUESTED'
    | 'SHOCK_CAUSE_REQUESTED';
  readonly dueSimTime: ExactQuantity;
  readonly actionRef: string;
  readonly causeRef: string | null;
  readonly causalFactRefs: readonly string[];
}

export interface CrisisComposerResult {
  readonly status: typeof CRISIS_CAUSE_COMPOSER_STATUS;
  readonly action: CrisisActionKind;
  readonly before: CrisisStateSnapshot;
  readonly afterCandidate: CrisisStateSnapshot;
  readonly causeTransitions: readonly CrisisCauseTransition[];
  readonly candidateEvents: readonly CrisisCandidateEvent[];
  readonly inputFacts: readonly FoundationFactBinding[];
  readonly hashInput: string;
}

export interface CrisisComposerInput {
  readonly trace: FoundationTraceRequest;
  readonly stateFact: FoundationFact<CrisisStateSnapshot>;
  readonly actionFact: FoundationFact<CrisisActionStatement>;
  readonly authorizationFact: FoundationFact<CrisisAuthorizationStatement>;
  readonly causeFacts: readonly FoundationFact<CrisisCauseStatement>[];
}

const REF = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u;
const CAUSE_SCHEMA: Record<
  CrisisCauseKind,
  {
    readonly field: CrisisCauseField;
    readonly valueKind: 'MONEY' | 'QUANTITY';
    readonly direction: 'LOSS' | 'SURGE';
  }
> = {
  RESOURCE_EXTRACTION_OUTAGE: {
    field: 'EXTRACTION_CAPACITY',
    valueKind: 'QUANTITY',
    direction: 'LOSS',
  },
  ENERGY_GENERATION_OUTAGE: {
    field: 'GENERATION_CAPACITY',
    valueKind: 'QUANTITY',
    direction: 'LOSS',
  },
  PRODUCTION_CAPACITY_DAMAGE: {
    field: 'PRODUCTION_CAPACITY',
    valueKind: 'QUANTITY',
    direction: 'LOSS',
  },
  INFRASTRUCTURE_SERVICE_DAMAGE: {
    field: 'INFRASTRUCTURE_SERVICE_CAPACITY',
    valueKind: 'QUANTITY',
    direction: 'LOSS',
  },
  HEALTHCARE_DEMAND_SURGE: {
    field: 'HEALTHCARE_DEMAND',
    valueKind: 'QUANTITY',
    direction: 'SURGE',
  },
  BANKING_ASSET_LOSS: {
    field: 'LOAN_ASSET_VALUE',
    valueKind: 'MONEY',
    direction: 'LOSS',
  },
  TRADE_ROUTE_DISRUPTION: {
    field: 'TRADE_ROUTE_THROUGHPUT',
    valueKind: 'QUANTITY',
    direction: 'LOSS',
  },
  FX_PRIVATE_FLOW_DISRUPTION: {
    field: 'PRIVATE_CAPITAL_FLOW_CAPACITY',
    valueKind: 'MONEY',
    direction: 'LOSS',
  },
  PUBLIC_SAFETY_DEMAND_SURGE: {
    field: 'PUBLIC_SAFETY_DEMAND',
    valueKind: 'QUANTITY',
    direction: 'SURGE',
  },
  TECHNOLOGY_RESEARCH_DISRUPTION: {
    field: 'RESEARCH_CAPACITY',
    valueKind: 'QUANTITY',
    direction: 'LOSS',
  },
  POPULATION_DISPLACEMENT: {
    field: 'RESIDENT_POPULATION',
    valueKind: 'QUANTITY',
    direction: 'LOSS',
  },
};

function ref(value: string, label: string): string {
  if (!REF.test(value)) kernelInvalid(`${label} must be a stable reference`);
  return value;
}

function tick(value: ExactQuantity, label: string): WorldDecimalValue {
  const amount = nonNegativeQuantity(value, 'sim_millisecond', label).amount;
  if (!amount.isInteger())
    kernelInvalid(`${label} must be an integer simulation-millisecond tick`);
  return amount;
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
    kernelInvalid(`${label} must match the exact causal fact set`);
}

function causeTransition(
  actionRef: string,
  fact: FoundationFact<CrisisCauseStatement>,
  trace: FoundationTraceRequest,
  causalFactRefs: readonly string[],
): CrisisCauseTransition {
  const cause = foundationFactPayload(trace, fact, 'crisis cause');
  const schema = CAUSE_SCHEMA[cause.kind];
  if (!schema || cause.targetField !== schema.field)
    kernelInvalid(
      'Cause must target an allowed bottom-layer field, never GDP, inflation or score',
    );
  if (cause.actionRef !== actionRef)
    kernelInvalid('Cause must bind the exact action');
  const causeRef = ref(cause.causeRef, 'causeRef');
  const targetOwnerRef = ref(cause.targetOwnerRef, 'targetOwnerRef');
  const targetObjectRef = ref(cause.targetObjectRef, 'targetObjectRef');
  const sourceReceiptRef = ref(cause.sourceReceiptRef, 'cause source receipt');
  if (cause.kind === 'POPULATION_DISPLACEMENT') {
    if (cause.scenarioEvidenceRef === null)
      kernelInvalid(
        'Population displacement requires explicit scenario evidence',
      );
    ref(cause.scenarioEvidenceRef, 'scenarioEvidenceRef');
  } else if (cause.scenarioEvidenceRef !== null)
    ref(cause.scenarioEvidenceRef, 'scenarioEvidenceRef');
  let before: ExactMoney | ExactQuantity;
  let delta: ExactMoney | ExactQuantity;
  let after: ExactMoney | ExactQuantity;
  let beforeAmount: WorldDecimalValue;
  let deltaAmount: WorldDecimalValue;
  if (schema.valueKind === 'MONEY') {
    if (!('currency' in cause.before) || !('currency' in cause.delta))
      kernelInvalid('Financial shock requires exact Money');
    const prior = money(cause.before, 'cause before');
    const change = money(cause.delta, 'cause delta');
    if (prior.currency !== change.currency)
      kernelInvalid('Cause Money currencies must match');
    beforeAmount = prior.amount;
    deltaAmount = change.amount;
    before = renderMoney(beforeAmount, prior.currency);
    delta = renderMoney(deltaAmount, prior.currency);
    after = renderMoney(
      assertWorldDecimalResult(beforeAmount.plus(deltaAmount)),
      prior.currency,
    );
  } else {
    if (!('unit' in cause.before) || !('unit' in cause.delta))
      kernelInvalid('Physical shock requires exact Quantity');
    const prior = quantity(cause.before, 'cause before');
    const change = quantity(cause.delta, 'cause delta');
    if (prior.unit !== change.unit)
      kernelInvalid('Cause Quantity units must match');
    beforeAmount = prior.amount;
    deltaAmount = change.amount;
    before = renderQuantity(beforeAmount, prior.unit);
    delta = renderQuantity(deltaAmount, prior.unit);
    after = renderQuantity(
      assertWorldDecimalResult(beforeAmount.plus(deltaAmount)),
      prior.unit,
    );
  }
  if (beforeAmount.isNegative() || beforeAmount.plus(deltaAmount).isNegative())
    kernelInvalid('Shock cannot create negative stock or capacity');
  if (schema.direction === 'LOSS' && !deltaAmount.isNegative())
    kernelInvalid('Loss/outage cause must reduce its bottom-layer variable');
  if (schema.direction === 'SURGE' && !deltaAmount.greaterThan(0))
    kernelInvalid('Demand-surge cause must increase its bottom-layer variable');
  return Object.freeze({
    transitionRef: ref(`${actionRef}.${causeRef}`, 'cause transition'),
    causeRef,
    kind: cause.kind,
    targetField: cause.targetField,
    targetOwnerRef,
    targetObjectRef,
    before,
    delta,
    after,
    causalFactRefs: Object.freeze([...causalFactRefs, fact.factRef]),
    sourceReceiptRef,
    scenarioEvidenceRef: cause.scenarioEvidenceRef,
  });
}

/** Proposes cause-layer and lifecycle events; the authoritative writer decides execution. */
export function prepareCrisisCauseAction(
  input: CrisisComposerInput,
): CrisisComposerResult {
  const state = foundationFactPayload(
    input.trace,
    input.stateFact,
    'crisis state',
  );
  const action = foundationFactPayload(
    input.trace,
    input.actionFact,
    'crisis action',
  );
  const authority = foundationFactPayload(
    input.trace,
    input.authorizationFact,
    'crisis authorization',
  );
  const actionRef = ref(action.actionRef, 'actionRef');
  if (
    state.seasonStatus !== 'ACTIVE' ||
    !['INACTIVE', 'ACTIVE', 'ENDED'].includes(state.lifecycleStatus) ||
    !['RUNNING', 'PAUSED'].includes(state.clockMode)
  )
    kernelInvalid(
      'Admin crisis action requires a valid active season and clock state',
    );
  const actionVersionRef = ref(action.actionVersionRef, 'actionVersionRef');
  if (
    action.worldRef !== ref(state.worldRef, 'state world') ||
    action.worldRef !== ref(authority.worldRef, 'authorization world') ||
    action.seasonRef !== ref(state.seasonRef, 'state season') ||
    action.seasonRef !== ref(authority.seasonRef, 'authorization season') ||
    action.crisisRef !== ref(state.crisisRef, 'state crisis')
  )
    kernelInvalid('Action, authorization and crisis state identity must match');
  if (
    action.expectedStateVersionRef !==
      ref(state.stateVersionRef, 'state version') ||
    action.nextStateVersionRef === action.expectedStateVersionRef
  )
    kernelInvalid(
      'Action must advance the exact expected crisis state version',
    );
  ref(action.nextStateVersionRef, 'nextStateVersionRef');
  ref(action.reasonRef, 'reasonRef');
  if (
    authority.actionRef !== actionRef ||
    authority.actionVersionRef !== actionVersionRef ||
    authority.decision !== 'AUTHORIZED'
  )
    kernelInvalid('Version-bound server authorization is required');
  ref(authority.actorRef, 'admin actor');
  ref(authority.serverAuthorizationRef, 'server authorization');
  ref(authority.membershipRef, 'season membership');
  ref(authority.adminEntitlementRef, 'admin entitlement');
  const stateTick = tick(state.atSimTime, 'state SimTime');
  if (
    !stateTick.equals(tick(action.atSimTime, 'action SimTime')) ||
    !stateTick.equals(tick(input.trace.snapshotAt, 'snapshot SimTime'))
  )
    kernelInvalid('Action must use the frozen authoritative snapshot SimTime');
  const priorActions = state.appliedActionRefs.map((value) =>
    ref(value, 'applied action'),
  );
  if (
    new Set(priorActions).size !== priorActions.length ||
    priorActions.includes(actionRef)
  )
    kernelInvalid('Crisis action already applied or action witness duplicated');
  const priorCauses = state.causeFactRefs.map((value) =>
    ref(value, 'prior cause'),
  );
  if (new Set(priorCauses).size !== priorCauses.length)
    kernelInvalid('Prior cause references must be unique');
  if (
    authority.requiredApprovalRefs.length === 0 ||
    authority.requiredApprovalRefs.length !== authority.approvals.length
  )
    kernelInvalid('Admin action requires an explicit complete approval set');
  const required = authority.requiredApprovalRefs.map((value) =>
    ref(value, 'approval requirement'),
  );
  if (new Set(required).size !== required.length)
    kernelInvalid('Approval requirements must be unique');
  const approved = authority.approvals.map((approval) => {
    ref(approval.approvalRef, 'approvalRef');
    ref(approval.actorRef, 'approval actor');
    if (
      approval.status !== 'APPROVED' ||
      approval.versionRef !== actionVersionRef ||
      approval.decisionRef === null
    )
      kernelInvalid(
        'Only current-version approved decisions satisfy an Admin action',
      );
    ref(approval.decisionRef, 'approval decision');
    return ref(approval.requirementRef, 'approval requirement');
  });
  if (
    new Set(authority.approvals.map((approval) => approval.approvalRef))
      .size !== authority.approvals.length
  )
    kernelInvalid('Each approval must have a distinct decision record');
  exactRefs(approved, required, 'approvals');
  const orderedCauses = [...input.causeFacts].sort((left, right) =>
    left.factRef.localeCompare(right.factRef),
  );
  const causeRefs = orderedCauses.map((fact) =>
    ref(fact.factRef, 'cause fact'),
  );
  exactRefs(action.causeFactRefs, causeRefs, 'action cause facts');
  exactRefs(
    input.actionFact.predecessorFactRefs,
    [input.stateFact.factRef, input.authorizationFact.factRef, ...causeRefs],
    'action predecessors',
  );
  const facts: readonly FoundationFact<unknown>[] = [
    input.stateFact,
    input.authorizationFact,
    input.actionFact,
    ...orderedCauses,
  ];
  const inputFacts = Object.freeze(
    facts.map((fact, index) =>
      foundationFactBinding(input.trace, fact, `crisis.fact[${index}]`),
    ),
  );
  if (
    new Set(inputFacts.map((fact) => fact.factRef)).size !== inputFacts.length
  )
    kernelInvalid('Crisis input fact references must be unique');
  let lifecycleStatus = state.lifecycleStatus;
  let clockMode = state.clockMode;
  let transitions: readonly CrisisCauseTransition[] = [];
  let eventKind: CrisisCandidateEvent['kind'];
  switch (action.action) {
    case 'START_CRISIS':
      if (
        state.lifecycleStatus !== 'INACTIVE' ||
        state.clockMode !== 'RUNNING' ||
        orderedCauses.length === 0
      )
        kernelInvalid(
          'Crisis start requires inactive state, RUNNING clock and explicit causes',
        );
      lifecycleStatus = 'ACTIVE';
      eventKind = 'CRISIS_START_REQUESTED';
      {
        // One target has one evolving stock/capacity. Fact-ref order is the
        // deterministic application order; a later source must witness the
        // exact result of the preceding source, not reuse its old balance.
        const lastByTarget = new Map<string, ExactMoney | ExactQuantity>();
        const sequenced: CrisisCauseTransition[] = [];
        for (const fact of orderedCauses) {
          const transition = causeTransition(actionRef, fact, input.trace, [
            input.stateFact.factRef,
            input.authorizationFact.factRef,
            input.actionFact.factRef,
          ]);
          const target = canonicalSerialize([
            transition.targetOwnerRef,
            transition.targetObjectRef,
            transition.targetField,
          ]);
          const previous = lastByTarget.get(target);
          if (
            previous !== undefined &&
            canonicalSerialize(transition.before) !==
              canonicalSerialize(previous)
          )
            kernelInvalid(
              'Same-target crisis causes must form an exact before-to-after chain',
            );
          lastByTarget.set(target, transition.after);
          sequenced.push(transition);
        }
        transitions = Object.freeze(sequenced);
      }
      if (
        new Set(transitions.map((item) => item.causeRef)).size !==
          transitions.length ||
        causeRefs.some((item) => priorCauses.includes(item))
      )
        kernelInvalid('Crisis cause identities must be unique');
      if (
        new Set(transitions.map((item) => item.sourceReceiptRef)).size !==
        transitions.length
      )
        kernelInvalid('Cause receipts must not be counted twice');
      break;
    case 'END_CRISIS':
      if (
        state.lifecycleStatus !== 'ACTIVE' ||
        state.clockMode !== 'RUNNING' ||
        priorCauses.length === 0 ||
        orderedCauses.length !== 0
      )
        kernelInvalid(
          'Crisis end requires ACTIVE state and no new cause or paused execution',
        );
      lifecycleStatus = 'ENDED';
      eventKind = 'CRISIS_END_REQUESTED';
      break;
    case 'PAUSE_WORLD':
      if (state.clockMode !== 'RUNNING' || orderedCauses.length !== 0)
        kernelInvalid('Pause requires RUNNING clock and no new shock cause');
      clockMode = 'PAUSED';
      eventKind = 'CLOCK_PAUSE_REQUESTED';
      break;
    case 'RESUME_WORLD':
      if (state.clockMode !== 'PAUSED' || orderedCauses.length !== 0)
        kernelInvalid('Resume requires PAUSED clock and no new shock cause');
      clockMode = 'RUNNING';
      eventKind = 'CLOCK_RESUME_REQUESTED';
      break;
    default:
      return kernelInvalid('Unsupported Admin crisis action');
  }
  const causal = Object.freeze([
    input.stateFact.factRef,
    input.authorizationFact.factRef,
    input.actionFact.factRef,
  ]);
  const events: CrisisCandidateEvent[] = [
    {
      eventRef: ref(`${actionRef}.LIFECYCLE`, 'lifecycle eventRef'),
      kind: eventKind,
      dueSimTime: renderQuantity(stateTick, 'sim_millisecond'),
      actionRef,
      causeRef: null,
      causalFactRefs: causal,
    },
  ];
  for (const transition of transitions)
    events.push({
      eventRef: ref(
        `${actionRef}.${transition.causeRef}.CAUSE`,
        'cause eventRef',
      ),
      kind: 'SHOCK_CAUSE_REQUESTED',
      dueSimTime: renderQuantity(stateTick, 'sim_millisecond'),
      actionRef,
      causeRef: transition.causeRef,
      causalFactRefs: transition.causalFactRefs,
    });
  const afterCandidate: CrisisStateSnapshot = Object.freeze({
    ...state,
    stateVersionRef: action.nextStateVersionRef,
    lifecycleStatus,
    clockMode,
    atSimTime: renderQuantity(stateTick, 'sim_millisecond'),
    appliedActionRefs: Object.freeze([...priorActions, actionRef]),
    causeFactRefs: Object.freeze([...priorCauses, ...causeRefs]),
  });
  const body = Object.freeze({
    status: CRISIS_CAUSE_COMPOSER_STATUS,
    action: action.action,
    before: state,
    afterCandidate,
    causeTransitions: Object.freeze([...transitions]),
    candidateEvents: Object.freeze(events),
    inputFacts,
  });
  return Object.freeze({ ...body, hashInput: canonicalHashInput(body) });
}

export function assertCrisisCauseReplay(
  input: CrisisComposerInput,
  expected: CrisisComposerResult,
): void {
  if (
    canonicalSerialize(prepareCrisisCauseAction(input)) !==
    canonicalSerialize(expected)
  )
    kernelInvalid('Crisis cause replay does not match supplied facts');
}
