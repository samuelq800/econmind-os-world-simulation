import { DomainError } from '../errors.js';
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
  nonNegativeQuantity,
  renderQuantity,
  type ExactQuantity,
  type WorldDecimalValue,
} from './common.js';

/** Caller-fact preparation only; API/RLS remains the real secrecy boundary. */
export const GOVERNANCE_BRIEF_FOUNDATION_STATUS = 'PREPARATION_ONLY' as const;
const DENIED_BRIEF = Object.freeze({ status: 'DENIED' as const });
const REF = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u;

export interface CabinetBriefStatement {
  readonly briefRef: string;
  readonly worldRef: string;
  readonly seasonRef: string;
  readonly countryRef: string;
  readonly versionRef: string;
  readonly classification: 'CABINET_INTERNAL' | 'CABINET_RESTRICTED';
  readonly scopeOfficeRefs: readonly string[];
  readonly requiredGrantRef: string | null;
  readonly title: string;
  readonly body: string;
  readonly sourceReceiptRef: string;
}

export interface BriefViewerStatement {
  readonly actorRef: string;
  readonly worldRef: string;
  readonly seasonRef: string;
  readonly countryRef: string;
  readonly authenticated: boolean;
  readonly cabinetMembershipRef: string | null;
  readonly officeRefs: readonly string[];
  readonly serverAuthorizationRef: string | null;
}

export interface BriefGrantStatement {
  readonly grantRef: string;
  readonly briefRef: string;
  readonly briefVersionRef: string;
  readonly actorRef: string;
  readonly officeRef: string;
  readonly allowed: boolean;
  readonly validFrom: ExactQuantity;
  readonly expiresAt: ExactQuantity;
  readonly sourceReceiptRef: string;
}

export interface AuthorizedBriefProjection {
  readonly status: 'AUTHORIZED_CANDIDATE';
  readonly foundationStatus: typeof GOVERNANCE_BRIEF_FOUNDATION_STATUS;
  readonly briefRef: string;
  readonly versionRef: string;
  readonly classification: CabinetBriefStatement['classification'];
  readonly title: string;
  readonly body: string;
  readonly sourceReceiptRef: string;
  readonly inputFacts: readonly FoundationFactBinding[];
  readonly hashInput: string;
}

export type BriefProjection = typeof DENIED_BRIEF | AuthorizedBriefProjection;

export interface BriefProjectionInput {
  readonly trace: FoundationTraceRequest;
  readonly briefFact: FoundationFact<CabinetBriefStatement>;
  readonly viewerFact: FoundationFact<BriefViewerStatement>;
  readonly grantFact: FoundationFact<BriefGrantStatement> | null;
}

export interface PolicyStatement {
  readonly policyRef: string;
  readonly versionRef: string;
  readonly worldRef: string;
  readonly seasonRef: string;
  readonly countryRef: string;
  readonly ownerOfficeRef: string;
  readonly commandRef: string;
  readonly targetRef: string;
  readonly direction: 'INCREASE' | 'DECREASE' | 'HOLD';
  readonly exclusiveResourceRef: string | null;
  readonly effectiveFrom: ExactQuantity;
  readonly effectiveUntil: ExactQuantity;
  readonly sourceReceiptRef: string;
}

export interface PolicyConflict {
  readonly kind: 'TARGET_DIRECTION_CONFLICT' | 'EXCLUSIVE_RESOURCE_CONFLICT';
  readonly leftPolicyRef: string;
  readonly rightPolicyRef: string;
  readonly leftFactRef: string;
  readonly rightFactRef: string;
  readonly leftReceiptRef: string;
  readonly rightReceiptRef: string;
  readonly targetOrResourceRef: string;
  readonly overlapFrom: ExactQuantity;
  readonly overlapUntil: ExactQuantity;
}

export interface PolicyConflictResult {
  readonly status: typeof GOVERNANCE_BRIEF_FOUNDATION_STATUS;
  readonly conflicts: readonly PolicyConflict[];
  readonly inputFacts: readonly FoundationFactBinding[];
  readonly hashInput: string;
}

export interface ResponsibilityDecisionStatement {
  readonly decisionRef: string;
  readonly actionRef: string;
  readonly actorRef: string;
  readonly officeRef: string;
  readonly worldRef: string;
  readonly seasonRef: string;
  readonly countryRef: string;
  readonly versionRef: string;
  readonly decisionAt: ExactQuantity;
  readonly outcome: 'APPROVED' | 'REJECTED' | 'EXECUTED';
  readonly sourceReceiptRef: string;
}

export interface ResponsibilityLogCandidate {
  readonly entryRef: string;
  readonly decisionRef: string;
  readonly actionRef: string;
  readonly actorRef: string;
  readonly officeRef: string;
  readonly versionRef: string;
  readonly decisionAt: ExactQuantity;
  readonly outcome: ResponsibilityDecisionStatement['outcome'];
  readonly sourceFactRef: string;
  readonly sourceReceiptRef: string;
}

export interface ResponsibilityLogResult {
  readonly status: typeof GOVERNANCE_BRIEF_FOUNDATION_STATUS;
  readonly entries: readonly ResponsibilityLogCandidate[];
  readonly inputFacts: readonly FoundationFactBinding[];
  readonly hashInput: string;
}

export interface TemporaryPowerStatement {
  readonly grantRef: string;
  readonly grantVersionRef: string;
  readonly actorRef: string;
  readonly officeRef: string;
  readonly scopeRef: string;
  readonly worldRef: string;
  readonly seasonRef: string;
  readonly countryRef: string;
  readonly crisisRef: string;
  readonly issuedAt: ExactQuantity;
  readonly expiresAt: ExactQuantity;
  readonly approvalRef: string;
  readonly serverAuthorizationRef: string;
  readonly sourceReceiptRef: string;
}

export interface CrisisLifecycleStatement {
  readonly crisisRef: string;
  readonly versionRef: string;
  readonly worldRef: string;
  readonly seasonRef: string;
  readonly countryRef: string;
  readonly status: 'ACTIVE' | 'ENDED';
  readonly endedAt: ExactQuantity | null;
  readonly sourceReceiptRef: string;
}

export interface TemporaryPowerResult {
  readonly status: typeof GOVERNANCE_BRIEF_FOUNDATION_STATUS;
  readonly temporalEligibility: 'NOT_YET_ACTIVE' | 'ACTIVE' | 'EXPIRED';
  readonly grantRef: string;
  readonly grantVersionRef: string;
  readonly evaluatedAt: ExactQuantity;
  readonly effectiveUntil: ExactQuantity;
  readonly expiryCause: 'TIME_LIMIT' | 'CRISIS_ENDED';
  readonly sourceFactRefs: readonly string[];
  readonly sourceReceiptRefs: readonly string[];
  readonly inputFacts: readonly FoundationFactBinding[];
  readonly hashInput: string;
}

export interface TemporaryPowerInput {
  readonly trace: FoundationTraceRequest;
  readonly grantFact: FoundationFact<TemporaryPowerStatement>;
  readonly crisisFact: FoundationFact<CrisisLifecycleStatement>;
}

function ref(value: string, label: string): string {
  if (!REF.test(value)) kernelInvalid(`${label} must be a stable reference`);
  return value;
}

function compareRef(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function tick(value: ExactQuantity, label: string): WorldDecimalValue {
  const amount = nonNegativeQuantity(value, 'sim_millisecond', label).amount;
  if (!amount.isInteger())
    kernelInvalid(`${label} must be an integer simulation-millisecond tick`);
  return amount;
}

function bindings(
  trace: FoundationTraceRequest,
  facts: readonly FoundationFact<unknown>[],
): readonly FoundationFactBinding[] {
  const result = facts.map((fact, index) =>
    foundationFactBinding(trace, fact, `governance.fact[${index}]`),
  );
  if (new Set(result.map((fact) => fact.factRef)).size !== result.length)
    kernelInvalid('Governance source fact references must be unique');
  return Object.freeze(result);
}

function stableRefs(
  values: readonly string[],
  label: string,
): readonly string[] {
  const normalized = values.map((value) => ref(value, label));
  if (new Set(normalized).size !== normalized.length)
    kernelInvalid(`${label} must be unique`);
  return normalized;
}

function exactKeys(
  value: object,
  allowed: readonly string[],
  label: string,
): void {
  if (
    canonicalSerialize(Object.keys(value).sort()) !==
    canonicalSerialize([...allowed].sort())
  )
    kernelInvalid(`${label} must contain only the declared metadata fields`);
}

/** A denial intentionally returns no brief identifier, content or hash preimage. */
export function prepareCabinetBriefProjection(
  input: BriefProjectionInput,
): BriefProjection {
  try {
    const brief = foundationFactPayload(
      input.trace,
      input.briefFact,
      'cabinet brief',
    );
    const viewer = foundationFactPayload(
      input.trace,
      input.viewerFact,
      'brief viewer',
    );
    const now = tick(input.trace.snapshotAt, 'brief snapshot time');
    if (
      brief.classification !== 'CABINET_INTERNAL' &&
      brief.classification !== 'CABINET_RESTRICTED'
    )
      return DENIED_BRIEF;
    if (
      viewer.authenticated !== true ||
      viewer.cabinetMembershipRef === null ||
      viewer.serverAuthorizationRef === null
    )
      return DENIED_BRIEF;
    if (
      brief.worldRef !== viewer.worldRef ||
      brief.seasonRef !== viewer.seasonRef ||
      brief.countryRef !== viewer.countryRef
    )
      return DENIED_BRIEF;
    ref(viewer.actorRef, 'viewer actor');
    ref(viewer.cabinetMembershipRef, 'cabinet membership');
    ref(viewer.serverAuthorizationRef, 'server authorization');
    const scope = stableRefs(brief.scopeOfficeRefs, 'brief scope');
    const offices = stableRefs(viewer.officeRefs, 'viewer office');
    if (scope.length === 0 || !scope.some((office) => offices.includes(office)))
      return DENIED_BRIEF;
    const briefRef = ref(brief.briefRef, 'briefRef');
    const versionRef = ref(brief.versionRef, 'briefVersionRef');
    ref(brief.sourceReceiptRef, 'brief source receipt');
    let evidence: readonly FoundationFact<unknown>[] = [
      input.briefFact,
      input.viewerFact,
    ];
    if (brief.classification === 'CABINET_RESTRICTED') {
      if (brief.requiredGrantRef === null || input.grantFact === null)
        return DENIED_BRIEF;
      ref(brief.requiredGrantRef, 'requiredGrantRef');
      const grant = foundationFactPayload(
        input.trace,
        input.grantFact,
        'brief grant',
      );
      ref(grant.grantRef, 'grantRef');
      ref(grant.briefRef, 'grant briefRef');
      ref(grant.briefVersionRef, 'grant briefVersionRef');
      ref(grant.actorRef, 'grant actorRef');
      ref(grant.officeRef, 'grant officeRef');
      if (
        grant.grantRef !== brief.requiredGrantRef ||
        grant.briefRef !== briefRef ||
        grant.briefVersionRef !== versionRef ||
        grant.actorRef !== viewer.actorRef ||
        grant.allowed !== true ||
        !offices.includes(grant.officeRef) ||
        !scope.includes(grant.officeRef)
      )
        return DENIED_BRIEF;
      if (
        !input.grantFact.predecessorFactRefs.includes(
          input.briefFact.factRef,
        ) ||
        !input.grantFact.predecessorFactRefs.includes(input.viewerFact.factRef)
      )
        return DENIED_BRIEF;
      if (!(
        tick(grant.validFrom, 'grant validFrom').lessThanOrEqualTo(now) &&
        now.lessThan(tick(grant.expiresAt, 'grant expiresAt'))
      ))
        return DENIED_BRIEF;
      ref(grant.sourceReceiptRef, 'grant source receipt');
      evidence = [input.briefFact, input.viewerFact, input.grantFact];
    } else if (brief.requiredGrantRef !== null || input.grantFact !== null) {
      return DENIED_BRIEF;
    }
    if (
      typeof brief.title !== 'string' ||
      typeof brief.body !== 'string' ||
      brief.title.length === 0 ||
      brief.body.length === 0
    )
      return DENIED_BRIEF;
    const inputFacts = bindings(input.trace, evidence);
    const output = Object.freeze({
      status: 'AUTHORIZED_CANDIDATE' as const,
      foundationStatus: GOVERNANCE_BRIEF_FOUNDATION_STATUS,
      briefRef,
      versionRef,
      classification: brief.classification,
      title: brief.title,
      body: brief.body,
      sourceReceiptRef: brief.sourceReceiptRef,
      inputFacts,
    });
    return Object.freeze({ ...output, hashInput: canonicalHashInput(output) });
  } catch (error) {
    if (error instanceof DomainError) return DENIED_BRIEF;
    throw error;
  }
}

export function assertBriefProjectionReplay(
  input: BriefProjectionInput,
  expected: BriefProjection,
): void {
  if (
    canonicalSerialize(prepareCabinetBriefProjection(input)) !==
    canonicalSerialize(expected)
  )
    kernelInvalid('Brief projection replay does not match supplied facts');
}

function quantityTick(value: WorldDecimalValue): ExactQuantity {
  return renderQuantity(value, 'sim_millisecond');
}

function later(
  left: WorldDecimalValue,
  right: WorldDecimalValue,
): WorldDecimalValue {
  return left.lessThan(right) ? right : left;
}

function earlier(
  left: WorldDecimalValue,
  right: WorldDecimalValue,
): WorldDecimalValue {
  return left.lessThan(right) ? left : right;
}

function validatePolicy(value: PolicyStatement): void {
  for (const [label, candidate] of Object.entries({
    policyRef: value.policyRef,
    versionRef: value.versionRef,
    worldRef: value.worldRef,
    seasonRef: value.seasonRef,
    countryRef: value.countryRef,
    ownerOfficeRef: value.ownerOfficeRef,
    commandRef: value.commandRef,
    targetRef: value.targetRef,
    sourceReceiptRef: value.sourceReceiptRef,
  }))
    ref(candidate, label);
  if (value.exclusiveResourceRef !== null)
    ref(value.exclusiveResourceRef, 'exclusiveResourceRef');
  if (!['INCREASE', 'DECREASE', 'HOLD'].includes(value.direction))
    kernelInvalid('Policy direction is invalid');
  if (
    !tick(value.effectiveFrom, 'policy effectiveFrom').lessThan(
      tick(value.effectiveUntil, 'policy effectiveUntil'),
    )
  )
    kernelInvalid('Policy interval must be nonempty');
}

/** Detects explicit competing policy facts without choosing a winner or executing a policy. */
export function detectPolicyConflicts(input: {
  readonly trace: FoundationTraceRequest;
  readonly policyFacts: readonly FoundationFact<PolicyStatement>[];
}): PolicyConflictResult {
  const facts = [...input.policyFacts].sort((a, b) =>
    compareRef(a.factRef, b.factRef),
  );
  const policies = facts.map((fact) => {
    const value = foundationFactPayload(input.trace, fact, 'policy');
    validatePolicy(value);
    return { fact, value };
  });
  if (
    new Set(policies.map(({ value }) => value.policyRef)).size !==
    policies.length
  )
    kernelInvalid('Policy references must be unique');
  const inputFacts = bindings(input.trace, facts);
  policies.sort((a, b) => compareRef(a.value.policyRef, b.value.policyRef));
  const conflicts: PolicyConflict[] = [];
  for (let leftIndex = 0; leftIndex < policies.length; leftIndex += 1) {
    const left = policies[leftIndex];
    if (left === undefined) continue;
    for (const right of policies.slice(leftIndex + 1)) {
      if (
        left.value.worldRef !== right.value.worldRef ||
        left.value.seasonRef !== right.value.seasonRef ||
        left.value.countryRef !== right.value.countryRef
      )
        continue;
      const overlapFrom = later(
        tick(left.value.effectiveFrom, 'left effectiveFrom'),
        tick(right.value.effectiveFrom, 'right effectiveFrom'),
      );
      const overlapUntil = earlier(
        tick(left.value.effectiveUntil, 'left effectiveUntil'),
        tick(right.value.effectiveUntil, 'right effectiveUntil'),
      );
      if (!overlapFrom.lessThan(overlapUntil)) continue;
      const common = {
        leftPolicyRef: left.value.policyRef,
        rightPolicyRef: right.value.policyRef,
        leftFactRef: left.fact.factRef,
        rightFactRef: right.fact.factRef,
        leftReceiptRef: left.value.sourceReceiptRef,
        rightReceiptRef: right.value.sourceReceiptRef,
        overlapFrom: quantityTick(overlapFrom),
        overlapUntil: quantityTick(overlapUntil),
      };
      if (
        left.value.targetRef === right.value.targetRef &&
        left.value.direction !== right.value.direction
      )
        conflicts.push(
          Object.freeze({
            kind: 'TARGET_DIRECTION_CONFLICT',
            ...common,
            targetOrResourceRef: left.value.targetRef,
          }),
        );
      if (
        left.value.exclusiveResourceRef !== null &&
        left.value.exclusiveResourceRef === right.value.exclusiveResourceRef
      )
        conflicts.push(
          Object.freeze({
            kind: 'EXCLUSIVE_RESOURCE_CONFLICT',
            ...common,
            targetOrResourceRef: left.value.exclusiveResourceRef,
          }),
        );
    }
  }
  const output = Object.freeze({
    status: GOVERNANCE_BRIEF_FOUNDATION_STATUS,
    conflicts: Object.freeze(conflicts),
    inputFacts,
  });
  return Object.freeze({ ...output, hashInput: canonicalHashInput(output) });
}

export function assertPolicyConflictReplay(
  input: Parameters<typeof detectPolicyConflicts>[0],
  expected: PolicyConflictResult,
): void {
  if (
    canonicalSerialize(detectPolicyConflicts(input)) !==
    canonicalSerialize(expected)
  )
    kernelInvalid('Policy conflict replay does not match supplied facts');
}

/** Produces only an audit candidate; the authoritative audit writer remains elsewhere. */
export function prepareResponsibilityLog(input: {
  readonly trace: FoundationTraceRequest;
  readonly decisionFacts: readonly FoundationFact<ResponsibilityDecisionStatement>[];
}): ResponsibilityLogResult {
  const facts = [...input.decisionFacts].sort((a, b) =>
    compareRef(a.factRef, b.factRef),
  );
  const decisions = facts.map((fact) => {
    const value = foundationFactPayload(
      input.trace,
      fact,
      'responsibility decision',
    );
    // A binding serializes the whole payload; reject covert brief/body fields.
    exactKeys(
      value,
      [
        'decisionRef',
        'actionRef',
        'actorRef',
        'officeRef',
        'worldRef',
        'seasonRef',
        'countryRef',
        'versionRef',
        'decisionAt',
        'outcome',
        'sourceReceiptRef',
      ],
      'responsibility decision',
    );
    exactKeys(
      value.decisionAt,
      ['amount', 'unit'],
      'responsibility decisionAt',
    );
    for (const [label, candidate] of Object.entries({
      decisionRef: value.decisionRef,
      actionRef: value.actionRef,
      actorRef: value.actorRef,
      officeRef: value.officeRef,
      worldRef: value.worldRef,
      seasonRef: value.seasonRef,
      countryRef: value.countryRef,
      versionRef: value.versionRef,
      sourceReceiptRef: value.sourceReceiptRef,
    }))
      ref(candidate, label);
    if (!['APPROVED', 'REJECTED', 'EXECUTED'].includes(value.outcome))
      kernelInvalid('Responsibility outcome is invalid');
    if (
      tick(input.trace.snapshotAt, 'snapshotAt').lessThan(
        tick(value.decisionAt, 'decisionAt'),
      )
    )
      kernelInvalid('Decision cannot occur after snapshot');
    return { fact, value };
  });
  if (
    new Set(decisions.map(({ value }) => value.decisionRef)).size !==
    decisions.length
  )
    kernelInvalid('Decision references must be unique');
  const inputFacts = bindings(input.trace, facts);
  decisions.sort((a, b) => {
    const aTime = tick(a.value.decisionAt, 'decisionAt');
    const bTime = tick(b.value.decisionAt, 'decisionAt');
    return aTime.lessThan(bTime)
      ? -1
      : bTime.lessThan(aTime)
        ? 1
        : compareRef(a.value.decisionRef, b.value.decisionRef);
  });
  const entries = decisions.map(({ fact, value }) =>
    Object.freeze({
      entryRef: `Responsibility:${value.decisionRef}`,
      decisionRef: value.decisionRef,
      actionRef: value.actionRef,
      actorRef: value.actorRef,
      officeRef: value.officeRef,
      versionRef: value.versionRef,
      decisionAt: value.decisionAt,
      outcome: value.outcome,
      sourceFactRef: fact.factRef,
      sourceReceiptRef: value.sourceReceiptRef,
    }),
  );
  const output = Object.freeze({
    status: GOVERNANCE_BRIEF_FOUNDATION_STATUS,
    entries: Object.freeze(entries),
    inputFacts,
  });
  return Object.freeze({ ...output, hashInput: canonicalHashInput(output) });
}

export function assertResponsibilityLogReplay(
  input: Parameters<typeof prepareResponsibilityLog>[0],
  expected: ResponsibilityLogResult,
): void {
  if (
    canonicalSerialize(prepareResponsibilityLog(input)) !==
    canonicalSerialize(expected)
  )
    kernelInvalid('Responsibility log replay does not match supplied facts');
}

/** Temporal eligibility only: this never replaces server-side identity/office/approval checks. */
export function evaluateTemporaryPower(
  input: TemporaryPowerInput,
): TemporaryPowerResult {
  const grant = foundationFactPayload(
    input.trace,
    input.grantFact,
    'temporary power grant',
  );
  const crisis = foundationFactPayload(
    input.trace,
    input.crisisFact,
    'crisis lifecycle',
  );
  for (const [label, candidate] of Object.entries({
    grantRef: grant.grantRef,
    grantVersionRef: grant.grantVersionRef,
    actorRef: grant.actorRef,
    officeRef: grant.officeRef,
    scopeRef: grant.scopeRef,
    worldRef: grant.worldRef,
    seasonRef: grant.seasonRef,
    countryRef: grant.countryRef,
    crisisRef: grant.crisisRef,
    approvalRef: grant.approvalRef,
    serverAuthorizationRef: grant.serverAuthorizationRef,
    grantReceiptRef: grant.sourceReceiptRef,
    crisisVersionRef: crisis.versionRef,
    crisisReceiptRef: crisis.sourceReceiptRef,
  }))
    ref(candidate, label);
  if (
    grant.crisisRef !== crisis.crisisRef ||
    grant.worldRef !== crisis.worldRef ||
    grant.seasonRef !== crisis.seasonRef ||
    grant.countryRef !== crisis.countryRef
  )
    kernelInvalid('Temporary power and crisis must share scope');
  const issued = tick(grant.issuedAt, 'grant issuedAt');
  const expires = tick(grant.expiresAt, 'grant expiresAt');
  const now = tick(input.trace.snapshotAt, 'snapshotAt');
  if (!issued.lessThan(expires))
    kernelInvalid('Temporary power interval must be nonempty');
  if (crisis.status !== 'ACTIVE' && crisis.status !== 'ENDED')
    kernelInvalid('Crisis lifecycle status is invalid');
  if (crisis.status === 'ACTIVE' && crisis.endedAt !== null)
    kernelInvalid('Active crisis cannot have endedAt');
  if (crisis.status === 'ENDED' && crisis.endedAt === null)
    kernelInvalid('Ended crisis requires endedAt');
  const ended =
    crisis.endedAt === null ? null : tick(crisis.endedAt, 'crisis endedAt');
  if (ended !== null && (ended.lessThan(issued) || now.lessThan(ended)))
    kernelInvalid('Crisis end must follow grant issue and precede snapshot');
  const effectiveUntil = ended === null ? expires : earlier(expires, ended);
  const expiryCause =
    ended !== null && ended.lessThan(expires)
      ? ('CRISIS_ENDED' as const)
      : ('TIME_LIMIT' as const);
  const temporalEligibility = now.lessThan(issued)
    ? ('NOT_YET_ACTIVE' as const)
    : now.lessThan(effectiveUntil)
      ? ('ACTIVE' as const)
      : ('EXPIRED' as const);
  const inputFacts = bindings(input.trace, [input.grantFact, input.crisisFact]);
  const output = Object.freeze({
    status: GOVERNANCE_BRIEF_FOUNDATION_STATUS,
    temporalEligibility,
    grantRef: grant.grantRef,
    grantVersionRef: grant.grantVersionRef,
    evaluatedAt: quantityTick(now),
    effectiveUntil: quantityTick(effectiveUntil),
    expiryCause,
    sourceFactRefs: Object.freeze([
      input.grantFact.factRef,
      input.crisisFact.factRef,
    ]),
    sourceReceiptRefs: Object.freeze([
      grant.sourceReceiptRef,
      crisis.sourceReceiptRef,
    ]),
    inputFacts,
  });
  return Object.freeze({ ...output, hashInput: canonicalHashInput(output) });
}

export function assertTemporaryPowerReplay(
  input: TemporaryPowerInput,
  expected: TemporaryPowerResult,
): void {
  if (
    canonicalSerialize(evaluateTemporaryPower(input)) !==
    canonicalSerialize(expected)
  )
    kernelInvalid('Temporary power replay does not match supplied facts');
}
