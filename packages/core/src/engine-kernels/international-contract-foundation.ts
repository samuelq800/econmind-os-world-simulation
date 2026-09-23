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
  nonNegativeQuantity,
  renderQuantity,
  type ExactQuantity,
} from './common.js';

/**
 * E16/V22.1 pure foundation only. This module validates immutable contract
 * facts and returns replayable candidates. It creates no authoritative
 * contract, Command, Event, receipt, right, obligation, posting, or subtype
 * economic effect.
 */
export const INTERNATIONAL_CONTRACT_FOUNDATION_STATUS =
  'FOUNDATION_IMPLEMENTED_UNVERIFIED' as const;

export const INTERNATIONAL_SUBTYPE_FOUNDATION_COVERAGE =
  'TYPE_ONLY_PENDING_ADR_10_AND_V21_3' as const;

export const INTERNATIONAL_SUBTYPE_MATRIX = Object.freeze([
  {
    subtypeId: 'INT-01',
    activityType: 'Commodity Supply Agreement',
    coverage: INTERNATIONAL_SUBTYPE_FOUNDATION_COVERAGE,
  },
  {
    subtypeId: 'INT-02',
    activityType: 'Technology Licence',
    coverage: INTERNATIONAL_SUBTYPE_FOUNDATION_COVERAGE,
  },
  {
    subtypeId: 'INT-03',
    activityType: 'Foreign Direct Investment',
    coverage: INTERNATIONAL_SUBTYPE_FOUNDATION_COVERAGE,
  },
  {
    subtypeId: 'INT-04',
    activityType: 'Sovereign Loan',
    coverage: INTERNATIONAL_SUBTYPE_FOUNDATION_COVERAGE,
  },
  {
    subtypeId: 'INT-05',
    activityType: 'Infrastructure Finance',
    coverage: INTERNATIONAL_SUBTYPE_FOUNDATION_COVERAGE,
  },
  {
    subtypeId: 'INT-06',
    activityType: 'Resource Development Agreement',
    coverage: INTERNATIONAL_SUBTYPE_FOUNDATION_COVERAGE,
  },
  {
    subtypeId: 'INT-07',
    activityType: 'Joint International Project',
    coverage: INTERNATIONAL_SUBTYPE_FOUNDATION_COVERAGE,
  },
  {
    subtypeId: 'INT-08',
    activityType: 'Preferential Trade Agreement',
    coverage: INTERNATIONAL_SUBTYPE_FOUNDATION_COVERAGE,
  },
  {
    subtypeId: 'INT-09',
    activityType: 'Free Trade Agreement',
    coverage: INTERNATIONAL_SUBTYPE_FOUNDATION_COVERAGE,
  },
  {
    subtypeId: 'INT-10',
    activityType: 'Customs Cooperation Agreement',
    coverage: INTERNATIONAL_SUBTYPE_FOUNDATION_COVERAGE,
  },
  {
    subtypeId: 'INT-11',
    activityType: 'Sector Market Access Agreement',
    coverage: INTERNATIONAL_SUBTYPE_FOUNDATION_COVERAGE,
  },
  {
    subtypeId: 'INT-12',
    activityType: 'Multilateral Economic Agreement',
    coverage: INTERNATIONAL_SUBTYPE_FOUNDATION_COVERAGE,
  },
  {
    subtypeId: 'INT-13',
    activityType: 'Reserve Swap',
    coverage: INTERNATIONAL_SUBTYPE_FOUNDATION_COVERAGE,
  },
  {
    subtypeId: 'INT-14',
    activityType: 'Sanction Package',
    coverage: INTERNATIONAL_SUBTYPE_FOUNDATION_COVERAGE,
  },
  {
    subtypeId: 'INT-15',
    activityType: 'Grant Aid',
    coverage: INTERNATIONAL_SUBTYPE_FOUNDATION_COVERAGE,
  },
  {
    subtypeId: 'INT-16',
    activityType: 'Commodity Aid',
    coverage: INTERNATIONAL_SUBTYPE_FOUNDATION_COVERAGE,
  },
  {
    subtypeId: 'INT-17',
    activityType: 'Emergency Concessional Loan',
    coverage: INTERNATIONAL_SUBTYPE_FOUNDATION_COVERAGE,
  },
  {
    subtypeId: 'INT-18',
    activityType: 'Emergency Supply Contract',
    coverage: INTERNATIONAL_SUBTYPE_FOUNDATION_COVERAGE,
  },
  {
    subtypeId: 'INT-19',
    activityType: 'Technical Assistance',
    coverage: INTERNATIONAL_SUBTYPE_FOUNDATION_COVERAGE,
  },
  {
    subtypeId: 'INT-20',
    activityType: 'Project Reconstruction Aid',
    coverage: INTERNATIONAL_SUBTYPE_FOUNDATION_COVERAGE,
  },
  {
    subtypeId: 'INT-21',
    activityType: 'International Tender',
    coverage: INTERNATIONAL_SUBTYPE_FOUNDATION_COVERAGE,
  },
  {
    subtypeId: 'INT-22',
    activityType: 'Strategic Economic Partnership',
    coverage: INTERNATIONAL_SUBTYPE_FOUNDATION_COVERAGE,
  },
  {
    subtypeId: 'INT-23',
    activityType: 'Trade Dispute Settlement',
    coverage: INTERNATIONAL_SUBTYPE_FOUNDATION_COVERAGE,
  },
] as const);

export type InternationalSubtypeId =
  (typeof INTERNATIONAL_SUBTYPE_MATRIX)[number]['subtypeId'];

export type InternationalActivityType =
  (typeof INTERNATIONAL_SUBTYPE_MATRIX)[number]['activityType'];

export interface InternationalSubtypeFoundationDefinition {
  readonly subtypeId: InternationalSubtypeId;
  readonly activityType: InternationalActivityType;
  readonly coverage: typeof INTERNATIONAL_SUBTYPE_FOUNDATION_COVERAGE;
}

export type InternationalContractStatus =
  | 'DRAFT'
  | 'NEGOTIATING'
  | 'SENT'
  | 'COUNTEROFFER'
  | 'AWAITING_INTERNAL_APPROVAL'
  | 'APPROVED'
  | 'SIGNED'
  | 'ACTIVE'
  | 'DELAYED'
  | 'SUSPENDED'
  | 'RENEGOTIATING'
  | 'DISPUTED'
  | 'PARTIALLY_DEFAULTED'
  | 'DEFAULTED'
  | 'COMPLETED'
  | 'TERMINATED'
  | 'EXPIRED';

export type InternationalApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type InternationalVersionAction = 'OFFER' | 'COUNTEROFFER';

export type InternationalLifecycleAction =
  | 'SIGN'
  | 'ACTIVATE'
  | 'REPORT_DELAY'
  | 'CURE_DELAY'
  | 'SUSPEND'
  | 'RESUME'
  | 'START_RENEGOTIATION'
  | 'FILE_DISPUTE'
  | 'SETTLE_DISPUTE'
  | 'REPORT_PARTIAL_DEFAULT'
  | 'REPORT_DEFAULT'
  | 'COMPLETE'
  | 'TERMINATE'
  | 'EXPIRE';

/**
 * A common-kernel term is only a reference to a future versioned subtype fact.
 * Free text cannot occupy `valueFactRef` and is never interpreted as economics.
 */
export interface InternationalStructuredTermReference {
  readonly termRef: string;
  readonly fieldRef: string;
  readonly valueFactRef: string;
  readonly subtypeSchemaVersionRef: string;
}

export interface InternationalApprovalRecord {
  readonly approvalRef: string;
  readonly officeRef: string;
  readonly versionRef: string;
  readonly status: InternationalApprovalStatus;
  readonly decisionRef: string | null;
}

export interface InternationalContractFoundationSnapshot {
  readonly contractRef: string;
  readonly stateRef: string;
  readonly activityType: InternationalActivityType;
  readonly partyRefs: readonly string[];
  readonly versionRef: string;
  readonly version: ExactQuantity;
  readonly status: InternationalContractStatus;
  readonly structuredTerms: readonly InternationalStructuredTermReference[];
  /** Inert context only; never read by a transition or economic executor. */
  readonly noteText: string | null;
  readonly requiredOfficeRefs: readonly string[];
  readonly approvals: readonly InternationalApprovalRecord[];
  /** The version currently signed; it may differ during formal renegotiation. */
  readonly activeSignedVersionRef: string | null;
}

export interface InternationalContractVersionProposal {
  readonly proposalRef: string;
  readonly contractRef: string;
  readonly action: InternationalVersionAction;
  readonly predecessorVersionRef: string;
  readonly nextVersionRef: string;
  readonly nextVersion: ExactQuantity;
  readonly structuredTerms: readonly InternationalStructuredTermReference[];
  readonly noteText: string | null;
}

export interface InternationalApprovalRequest {
  readonly requestRef: string;
  readonly contractRef: string;
  readonly versionRef: string;
  readonly commercialAcceptanceRef: string;
  /** Supplied by a future V21.3/authorization owner; Core invents no offices. */
  readonly requiredOfficeRefs: readonly string[];
}

export interface InternationalApprovalDecision {
  readonly decisionRef: string;
  readonly contractRef: string;
  readonly versionRef: string;
  readonly officeRef: string;
  readonly decision: 'APPROVED' | 'REJECTED';
}

export interface InternationalLifecycleTransitionRequest {
  readonly transitionRef: string;
  readonly contractRef: string;
  readonly predecessorStateRef: string;
  readonly action: InternationalLifecycleAction;
  readonly targetStatus: InternationalContractStatus;
  readonly reasonFactRef: string;
  readonly effectiveAt: ExactQuantity;
  /** Caller-owned retry witness; a later authoritative owner persists it. */
  readonly previouslyAppliedTransitionRefs: readonly string[];
}

export interface InternationalContractStateTrace {
  readonly transitionRef: string;
  readonly inputRefs: readonly string[];
  readonly outputRef: string;
  readonly before: InternationalContractStatus;
  readonly action:
    | InternationalVersionAction
    | InternationalLifecycleAction
    | 'REQUEST_APPROVAL'
    | 'RECORD_APPROVAL';
  readonly after: InternationalContractStatus;
}

export type InternationalContractFoundationModule =
  | 'V22_CONTRACT_VERSION'
  | 'V22_CONTRACT_APPROVAL_REQUEST'
  | 'V22_CONTRACT_APPROVAL_DECISION'
  | 'V22_CONTRACT_LIFECYCLE';

export interface InternationalContractReplayProof {
  readonly module: InternationalContractFoundationModule;
  readonly traceRef: string;
  readonly calculationVersion: string;
  readonly snapshot: FoundationSnapshotBinding;
  readonly snapshotAt: ExactQuantity;
  readonly inputFactRefs: readonly string[];
  readonly inputFacts: readonly FoundationFactBinding[];
  readonly outputFact: FoundationFactBinding;
  readonly quantityTransitions: readonly ExactQuantityTransition[];
  readonly stateTransitions: readonly InternationalContractStateTrace[];
  /** Canonical SHA-256 preimage for a future authoritative replay owner. */
  readonly hashInput: string;
}

export interface InternationalContractFoundationResult {
  readonly foundationStatus: typeof INTERNATIONAL_CONTRACT_FOUNDATION_STATUS;
  readonly snapshot: InternationalContractFoundationSnapshot;
  readonly invalidatedApprovalRefs: readonly string[];
  readonly versionTransition: ExactQuantityTransition;
  readonly stateTransition: InternationalContractStateTrace;
  readonly replayProof: InternationalContractReplayProof;
}

export type InternationalContractFoundationFact<T> = FoundationFact<T>;
export type InternationalContractFoundationTraceRequest =
  FoundationTraceRequest;

const STABLE_REFERENCE = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u;

const CONTRACT_STATUSES = new Set<string>([
  'DRAFT',
  'NEGOTIATING',
  'SENT',
  'COUNTEROFFER',
  'AWAITING_INTERNAL_APPROVAL',
  'APPROVED',
  'SIGNED',
  'ACTIVE',
  'DELAYED',
  'SUSPENDED',
  'RENEGOTIATING',
  'DISPUTED',
  'PARTIALLY_DEFAULTED',
  'DEFAULTED',
  'COMPLETED',
  'TERMINATED',
  'EXPIRED',
]);

const ALL_APPROVED_STATUSES = new Set<InternationalContractStatus>([
  'APPROVED',
  'SIGNED',
  'ACTIVE',
  'DELAYED',
  'SUSPENDED',
  'RENEGOTIATING',
  'DISPUTED',
  'PARTIALLY_DEFAULTED',
  'DEFAULTED',
  'COMPLETED',
  'TERMINATED',
  'EXPIRED',
]);

const SIGNED_VERSION_STATUSES = new Set<InternationalContractStatus>([
  'SIGNED',
  'ACTIVE',
  'DELAYED',
  'SUSPENDED',
  'RENEGOTIATING',
  'DISPUTED',
  'PARTIALLY_DEFAULTED',
  'DEFAULTED',
  'COMPLETED',
  'TERMINATED',
  'EXPIRED',
]);

const ACTIVITY_TYPE_INDEX = new Map<string, InternationalActivityType>(
  INTERNATIONAL_SUBTYPE_MATRIX.map((entry) => [
    entry.activityType,
    entry.activityType,
  ]),
);

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
    return kernelInvalid(`${label} must contain canonical inert data`);
  }
}

function contractVersion(
  value: ExactQuantity,
  label: string,
): ReturnType<typeof nonNegativeQuantity>['amount'] {
  const version = nonNegativeQuantity(value, 'contract_version', label).amount;
  if (!version.isInteger()) {
    kernelInvalid(`${label} must be an integer contract_version`);
  }
  return version;
}

function sameTick(
  value: ExactQuantity,
  trace: InternationalContractFoundationTraceRequest,
  label: string,
): ExactQuantity {
  const actual = nonNegativeQuantity(value, 'sim_millisecond', label).amount;
  const expected = nonNegativeQuantity(
    trace.snapshotAt,
    'sim_millisecond',
    'trace.snapshotAt',
  ).amount;
  if (
    !actual.isInteger() ||
    !expected.isInteger() ||
    !actual.equals(expected)
  ) {
    kernelInvalid(`${label} must equal the replay snapshot tick`);
  }
  return renderQuantity(actual, 'sim_millisecond');
}

export function validateInternationalActivityType(
  value: unknown,
): InternationalActivityType {
  if (typeof value !== 'string') {
    return kernelInvalid('International activity type must be a fixed value');
  }
  const activityType = ACTIVITY_TYPE_INDEX.get(value);
  if (activityType === undefined) {
    kernelInvalid(
      'International activity type is not in the fixed 23-type matrix',
    );
  }
  return activityType;
}

function subtypeId(value: unknown, label: string): InternationalSubtypeId {
  if (typeof value !== 'string') {
    return kernelInvalid(`${label} must be a fixed subtype ID`);
  }
  const match = INTERNATIONAL_SUBTYPE_MATRIX.find(
    (entry) => entry.subtypeId === value,
  );
  if (match === undefined) {
    kernelInvalid(`${label} is not in INT-01 through INT-23`);
  }
  return match.subtypeId;
}

/** Verifies exact, ordered INT-01–INT-23 coverage without claiming executors. */
export function assertCompleteInternationalSubtypeMatrix(
  input: readonly InternationalSubtypeFoundationDefinition[],
): readonly InternationalSubtypeFoundationDefinition[] {
  if (input.length !== INTERNATIONAL_SUBTYPE_MATRIX.length) {
    kernelInvalid(
      'International subtype matrix must contain exactly 23 entries',
    );
  }
  const result = input.map((candidate, index) => {
    const expected = INTERNATIONAL_SUBTYPE_MATRIX[index];
    if (expected === undefined) {
      return kernelInvalid('International subtype matrix index is invalid');
    }
    const canonical = Object.freeze({
      subtypeId: subtypeId(candidate.subtypeId, `subtype[${index}].subtypeId`),
      activityType: validateInternationalActivityType(candidate.activityType),
      coverage: candidate.coverage,
    });
    if (
      canonical.subtypeId !== expected.subtypeId ||
      canonical.activityType !== expected.activityType ||
      canonical.coverage !== INTERNATIONAL_SUBTYPE_FOUNDATION_COVERAGE
    ) {
      kernelInvalid(
        'International subtype matrix must exactly match the fixed Master order',
      );
    }
    return canonical;
  });
  distinctReferences(
    result.map((entry) => entry.subtypeId),
    'international subtype IDs',
  );
  if (
    new Set(result.map((entry) => entry.activityType)).size !== result.length
  ) {
    kernelInvalid('International activity types must be unique');
  }
  return Object.freeze(result);
}

function contractStatus(
  value: unknown,
  label: string,
): InternationalContractStatus {
  if (typeof value !== 'string' || !CONTRACT_STATUSES.has(value)) {
    kernelInvalid(`${label} is not a fixed international contract status`);
  }
  return value as InternationalContractStatus;
}

function approvalStatus(
  value: unknown,
  label: string,
): InternationalApprovalStatus {
  if (value !== 'PENDING' && value !== 'APPROVED' && value !== 'REJECTED') {
    kernelInvalid(`${label} must be PENDING, APPROVED, or REJECTED`);
  }
  return value;
}

function versionAction(value: unknown): InternationalVersionAction {
  if (value !== 'OFFER' && value !== 'COUNTEROFFER') {
    kernelInvalid('Version action must be OFFER or COUNTEROFFER');
  }
  return value;
}

function lifecycleAction(value: unknown): InternationalLifecycleAction {
  const actions = new Set<string>([
    'SIGN',
    'ACTIVATE',
    'REPORT_DELAY',
    'CURE_DELAY',
    'SUSPEND',
    'RESUME',
    'START_RENEGOTIATION',
    'FILE_DISPUTE',
    'SETTLE_DISPUTE',
    'REPORT_PARTIAL_DEFAULT',
    'REPORT_DEFAULT',
    'COMPLETE',
    'TERMINATE',
    'EXPIRE',
  ]);
  if (typeof value !== 'string' || !actions.has(value)) {
    kernelInvalid('Unknown international contract lifecycle action');
  }
  return value as InternationalLifecycleAction;
}

function noteText(value: string | null): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length > 4_000) {
    kernelInvalid('noteText must be inert text no longer than 4000 characters');
  }
  return value;
}

function structuredTerms(
  input: readonly InternationalStructuredTermReference[],
): readonly InternationalStructuredTermReference[] {
  if (input.length === 0) {
    kernelInvalid('At least one structured term reference is required');
  }
  const result = input.map((term, index) =>
    Object.freeze({
      termRef: stableReference(term.termRef, `terms[${index}].termRef`),
      fieldRef: stableReference(term.fieldRef, `terms[${index}].fieldRef`),
      valueFactRef: stableReference(
        term.valueFactRef,
        `terms[${index}].valueFactRef`,
      ),
      subtypeSchemaVersionRef: stableReference(
        term.subtypeSchemaVersionRef,
        `terms[${index}].subtypeSchemaVersionRef`,
      ),
    }),
  );
  distinctReferences(
    result.map((term) => term.termRef),
    'structured term references',
  );
  distinctReferences(
    result.map((term) => term.fieldRef),
    'structured term fields',
  );
  return Object.freeze(result);
}

function approvalRecords(
  input: readonly InternationalApprovalRecord[],
  versionRef: string,
): readonly InternationalApprovalRecord[] {
  const result = input.map((approval, index) => {
    const approvalVersionRef = stableReference(
      approval.versionRef,
      `approvals[${index}].versionRef`,
    );
    if (approvalVersionRef !== versionRef) {
      kernelInvalid('Every approval must bind to the exact current version');
    }
    const status = approvalStatus(
      approval.status,
      `approvals[${index}].status`,
    );
    const decisionRef =
      approval.decisionRef === null
        ? null
        : stableReference(
            approval.decisionRef,
            `approvals[${index}].decisionRef`,
          );
    if ((status === 'PENDING') !== (decisionRef === null)) {
      kernelInvalid(
        'Pending approval must have no decision; final approval must have one',
      );
    }
    return Object.freeze({
      approvalRef: stableReference(
        approval.approvalRef,
        `approvals[${index}].approvalRef`,
      ),
      officeRef: stableReference(
        approval.officeRef,
        `approvals[${index}].officeRef`,
      ),
      versionRef: approvalVersionRef,
      status,
      decisionRef,
    });
  });
  distinctReferences(
    result.map((approval) => approval.approvalRef),
    'approval references',
    false,
  );
  distinctReferences(
    result.map((approval) => approval.officeRef),
    'approval offices',
    false,
  );
  distinctReferences(
    result.flatMap((approval) =>
      approval.decisionRef === null ? [] : [approval.decisionRef],
    ),
    'approval decision references',
    false,
  );
  return Object.freeze(result);
}

function contractSnapshot(
  input: InternationalContractFoundationSnapshot,
  label: string,
): InternationalContractFoundationSnapshot {
  const contractRef = stableReference(
    input.contractRef,
    `${label}.contractRef`,
  );
  const versionRef = stableReference(input.versionRef, `${label}.versionRef`);
  const status = contractStatus(input.status, `${label}.status`);
  const requiredOfficeRefs = distinctReferences(
    input.requiredOfficeRefs,
    `${label}.requiredOfficeRefs`,
    false,
  );
  const approvals = approvalRecords(input.approvals, versionRef);
  if (approvals.length !== requiredOfficeRefs.length) {
    kernelInvalid('Approval records must exactly cover required offices');
  }
  for (const officeRef of requiredOfficeRefs) {
    if (!approvals.some((approval) => approval.officeRef === officeRef)) {
      kernelInvalid('Approval records must exactly cover required offices');
    }
  }
  if (
    (status === 'DRAFT' || status === 'SENT' || status === 'COUNTEROFFER') &&
    approvals.length !== 0
  ) {
    kernelInvalid(`${status} must not retain a predecessor approval round`);
  }
  if (
    status === 'NEGOTIATING' &&
    approvals.length !== 0 &&
    approvals.every((approval) => approval.status !== 'REJECTED')
  ) {
    kernelInvalid('Negotiating approval history must contain a rejection');
  }
  if (status === 'AWAITING_INTERNAL_APPROVAL') {
    if (
      approvals.length === 0 ||
      approvals.some((approval) => approval.status === 'REJECTED') ||
      approvals.every((approval) => approval.status === 'APPROVED')
    ) {
      kernelInvalid(
        'Awaiting approval requires at least one pending, non-rejected approval',
      );
    }
  }
  if (
    ALL_APPROVED_STATUSES.has(status) &&
    (approvals.length === 0 ||
      approvals.some((approval) => approval.status !== 'APPROVED'))
  ) {
    kernelInvalid(`${status} requires all version-bound approvals`);
  }
  const activeSignedVersionRef =
    input.activeSignedVersionRef === null
      ? null
      : stableReference(
          input.activeSignedVersionRef,
          `${label}.activeSignedVersionRef`,
        );
  if (SIGNED_VERSION_STATUSES.has(status) && activeSignedVersionRef === null) {
    kernelInvalid(`${status} requires a signed version reference`);
  }
  const partyRefs = distinctReferences(input.partyRefs, `${label}.partyRefs`);
  if (partyRefs.length < 2) {
    kernelInvalid('International contract requires at least two parties');
  }
  return Object.freeze({
    contractRef,
    stateRef: stableReference(input.stateRef, `${label}.stateRef`),
    activityType: validateInternationalActivityType(input.activityType),
    partyRefs,
    versionRef,
    version: renderQuantity(
      contractVersion(input.version, `${label}.version`),
      'contract_version',
    ),
    status,
    structuredTerms: structuredTerms(input.structuredTerms),
    noteText: noteText(input.noteText),
    requiredOfficeRefs,
    approvals,
    activeSignedVersionRef,
  });
}

function stateTrace(input: {
  readonly transitionRef: string;
  readonly inputRefs: readonly string[];
  readonly outputRef: string;
  readonly before: InternationalContractStatus;
  readonly action: InternationalContractStateTrace['action'];
  readonly after: InternationalContractStatus;
}): InternationalContractStateTrace {
  return Object.freeze({
    transitionRef: stableReference(input.transitionRef, 'state transition'),
    inputRefs: distinctReferences(input.inputRefs, 'state transition inputs'),
    outputRef: stableReference(input.outputRef, 'state transition output'),
    before: contractStatus(input.before, 'state transition before'),
    action: input.action,
    after: contractStatus(input.after, 'state transition after'),
  });
}

function zeroVersionTransition(input: {
  readonly transitionRef: string;
  readonly inputRefs: readonly string[];
  readonly outputRef: string;
  readonly version: ExactQuantity;
}): ExactQuantityTransition {
  return exactQuantityTransition({
    transitionRef: input.transitionRef,
    inputRefs: input.inputRefs,
    outputRef: input.outputRef,
    before: input.version,
    delta: { amount: '0', unit: 'contract_version' },
    after: input.version,
  });
}

function replayProof(input: {
  readonly module: InternationalContractFoundationModule;
  readonly trace: InternationalContractFoundationTraceRequest;
  readonly inputFacts: readonly InternationalContractFoundationFact<unknown>[];
  readonly outputRef: string;
  readonly output: InternationalContractFoundationSnapshot;
  readonly quantityTransitions: readonly ExactQuantityTransition[];
  readonly stateTransitions: readonly InternationalContractStateTrace[];
}): InternationalContractReplayProof {
  const traceRef = stableReference(input.trace.traceRef, 'traceRef');
  const calculationVersion = stableReference(
    input.trace.calculationVersion,
    'calculationVersion',
  );
  const inputFacts = input.inputFacts.map((fact, index) =>
    foundationFactBinding(input.trace, fact, `inputFacts[${index}]`),
  );
  const inputFactRefs = distinctReferences(
    inputFacts.map((fact) => fact.factRef),
    'replay input fact references',
  );
  if (inputFactRefs.includes(input.outputRef)) {
    kernelInvalid(
      'Contract output reference must differ from every input fact',
    );
  }
  const first = inputFacts[0];
  if (first === undefined) {
    return kernelInvalid('Contract replay proof requires input facts');
  }
  const outputFact = Object.freeze({
    factRef: stableReference(input.outputRef, 'outputRef'),
    sourceRef: traceRef,
    predecessorFactRefs: inputFactRefs,
    snapshot: first.snapshot,
    observedAt: first.observedAt,
    canonicalPayload: canonicalPayload(input.output, 'contract output'),
  });
  const quantityTransitions = Object.freeze([...input.quantityTransitions]);
  const stateTransitions = Object.freeze([...input.stateTransitions]);
  const proofBody = {
    module: input.module,
    traceRef,
    calculationVersion,
    snapshot: first.snapshot,
    snapshotAt: first.observedAt,
    inputFacts,
    outputFact,
    quantityTransitions,
    stateTransitions,
  };
  return Object.freeze({
    ...proofBody,
    inputFactRefs,
    hashInput: canonicalHashInput(proofBody),
  });
}

/** Rejects changed, stale, mixed-lineage, or reordered replay evidence. */
export function assertInternationalContractReplayEvidence(
  proof: InternationalContractReplayProof,
  inputFacts: readonly InternationalContractFoundationFact<unknown>[],
): void {
  const trace: InternationalContractFoundationTraceRequest = {
    traceRef: proof.traceRef,
    calculationVersion: proof.calculationVersion,
    snapshot: proof.snapshot,
    snapshotAt: proof.snapshotAt,
  };
  const rebound = inputFacts.map((fact, index) =>
    foundationFactBinding(trace, fact, `replay.inputFacts[${index}]`),
  );
  const proofBody = {
    module: proof.module,
    traceRef: proof.traceRef,
    calculationVersion: proof.calculationVersion,
    snapshot: proof.snapshot,
    snapshotAt: proof.snapshotAt,
    inputFacts: proof.inputFacts,
    outputFact: proof.outputFact,
    quantityTransitions: proof.quantityTransitions,
    stateTransitions: proof.stateTransitions,
  };
  if (
    canonicalPayload(rebound, 'replayed facts') !==
      canonicalPayload(proof.inputFacts, 'recorded facts') ||
    canonicalHashInput(proofBody) !== proof.hashInput
  ) {
    kernelInvalid('Replay evidence does not exactly match the recorded proof');
  }
}

function foundationResult(input: {
  readonly module: InternationalContractFoundationModule;
  readonly trace: InternationalContractFoundationTraceRequest;
  readonly inputFacts: readonly InternationalContractFoundationFact<unknown>[];
  readonly snapshot: InternationalContractFoundationSnapshot;
  readonly invalidatedApprovalRefs?: readonly string[];
  readonly versionTransition: ExactQuantityTransition;
  readonly stateTransition: InternationalContractStateTrace;
}): InternationalContractFoundationResult {
  const snapshot = contractSnapshot(input.snapshot, 'result.snapshot');
  const invalidatedApprovalRefs = distinctReferences(
    input.invalidatedApprovalRefs ?? [],
    'invalidated approval references',
    false,
  );
  return Object.freeze({
    foundationStatus: INTERNATIONAL_CONTRACT_FOUNDATION_STATUS,
    snapshot,
    invalidatedApprovalRefs,
    versionTransition: input.versionTransition,
    stateTransition: input.stateTransition,
    replayProof: replayProof({
      module: input.module,
      trace: input.trace,
      inputFacts: input.inputFacts,
      outputRef: snapshot.stateRef,
      output: snapshot,
      quantityTransitions: [input.versionTransition],
      stateTransitions: [input.stateTransition],
    }),
  });
}

/**
 * Creates the next immutable offer/counteroffer version. Any approval attached
 * to the predecessor version is returned as invalidated and never copied.
 */
export function createInternationalContractVersion(input: {
  readonly trace: InternationalContractFoundationTraceRequest;
  readonly currentFact: InternationalContractFoundationFact<InternationalContractFoundationSnapshot>;
  readonly proposalFact: InternationalContractFoundationFact<InternationalContractVersionProposal>;
}): InternationalContractFoundationResult {
  const current = contractSnapshot(
    foundationFactPayload(input.trace, input.currentFact, 'current contract'),
    'current contract',
  );
  const rawProposal = foundationFactPayload(
    input.trace,
    input.proposalFact,
    'version proposal',
  );
  const proposalRef = stableReference(
    rawProposal.proposalRef,
    'version proposal.proposalRef',
  );
  if (proposalRef === current.stateRef) {
    kernelInvalid('Version proposal must create a new state reference');
  }
  const action = versionAction(rawProposal.action);
  if (
    stableReference(rawProposal.contractRef, 'version proposal.contractRef') !==
    current.contractRef
  ) {
    kernelInvalid('Version proposal contractRef must match current contract');
  }
  if (
    stableReference(
      rawProposal.predecessorVersionRef,
      'version proposal.predecessorVersionRef',
    ) !== current.versionRef
  ) {
    kernelInvalid('Version proposal must name the exact predecessor version');
  }
  const nextVersionRef = stableReference(
    rawProposal.nextVersionRef,
    'version proposal.nextVersionRef',
  );
  if (nextVersionRef === current.versionRef) {
    kernelInvalid(
      'Next version reference must differ from predecessor version',
    );
  }
  const beforeVersion = contractVersion(current.version, 'current version');
  const nextVersion = contractVersion(
    rawProposal.nextVersion,
    'version proposal.nextVersion',
  );
  if (!nextVersion.equals(beforeVersion.plus(1))) {
    kernelInvalid('Contract version must increase by exactly one');
  }
  const allowed =
    action === 'OFFER'
      ? current.status === 'DRAFT' || current.status === 'NEGOTIATING'
      : new Set<InternationalContractStatus>([
          'SENT',
          'COUNTEROFFER',
          'AWAITING_INTERNAL_APPROVAL',
          'APPROVED',
          'RENEGOTIATING',
        ]).has(current.status);
  if (!allowed) {
    kernelInvalid(`${action} is not allowed from ${current.status}`);
  }
  const after: InternationalContractStatus =
    action === 'OFFER' ? 'SENT' : 'COUNTEROFFER';
  const snapshot: InternationalContractFoundationSnapshot = {
    ...current,
    stateRef: proposalRef,
    versionRef: nextVersionRef,
    version: renderQuantity(nextVersion, 'contract_version'),
    status: after,
    structuredTerms: structuredTerms(rawProposal.structuredTerms),
    noteText: noteText(rawProposal.noteText),
    requiredOfficeRefs: [],
    approvals: [],
  };
  const inputRefs = [input.currentFact.factRef, input.proposalFact.factRef];
  const versionTransition = exactQuantityTransition({
    transitionRef: `${proposalRef}.version`,
    inputRefs,
    outputRef: nextVersionRef,
    before: current.version,
    delta: { amount: '1', unit: 'contract_version' },
    after: snapshot.version,
  });
  const stateTransition = stateTrace({
    transitionRef: proposalRef,
    inputRefs,
    outputRef: proposalRef,
    before: current.status,
    action,
    after,
  });
  return foundationResult({
    module: 'V22_CONTRACT_VERSION',
    trace: input.trace,
    inputFacts: [input.currentFact, input.proposalFact],
    snapshot,
    invalidatedApprovalRefs: current.approvals.map(
      (approval) => approval.approvalRef,
    ),
    versionTransition,
    stateTransition,
  });
}

/** Opens a version-bound office approval round after commercial acceptance. */
export function requestInternationalContractApproval(input: {
  readonly trace: InternationalContractFoundationTraceRequest;
  readonly currentFact: InternationalContractFoundationFact<InternationalContractFoundationSnapshot>;
  readonly requestFact: InternationalContractFoundationFact<InternationalApprovalRequest>;
}): InternationalContractFoundationResult {
  const current = contractSnapshot(
    foundationFactPayload(input.trace, input.currentFact, 'current contract'),
    'current contract',
  );
  const request = foundationFactPayload(
    input.trace,
    input.requestFact,
    'approval request',
  );
  const requestRef = stableReference(
    request.requestRef,
    'approval request.requestRef',
  );
  if (requestRef === current.stateRef) {
    kernelInvalid('Approval request must create a new state reference');
  }
  if (
    stableReference(request.contractRef, 'approval request.contractRef') !==
      current.contractRef ||
    stableReference(request.versionRef, 'approval request.versionRef') !==
      current.versionRef
  ) {
    kernelInvalid('Approval request must bind the exact contract version');
  }
  stableReference(
    request.commercialAcceptanceRef,
    'approval request.commercialAcceptanceRef',
  );
  if (current.status !== 'SENT' && current.status !== 'COUNTEROFFER') {
    kernelInvalid(`Approval request is not allowed from ${current.status}`);
  }
  if (
    current.requiredOfficeRefs.length !== 0 ||
    current.approvals.length !== 0
  ) {
    kernelInvalid('Current version already contains an approval round');
  }
  const requiredOfficeRefs = distinctReferences(
    request.requiredOfficeRefs,
    'approval request.requiredOfficeRefs',
  );
  const approvals = requiredOfficeRefs.map((officeRef) =>
    Object.freeze({
      approvalRef: stableReference(
        `${requestRef}:${officeRef}`,
        'generated approvalRef',
      ),
      officeRef,
      versionRef: current.versionRef,
      status: 'PENDING' as const,
      decisionRef: null,
    }),
  );
  const snapshot: InternationalContractFoundationSnapshot = {
    ...current,
    stateRef: requestRef,
    status: 'AWAITING_INTERNAL_APPROVAL',
    requiredOfficeRefs,
    approvals,
  };
  const inputRefs = [input.currentFact.factRef, input.requestFact.factRef];
  const versionTransition = zeroVersionTransition({
    transitionRef: `${requestRef}.version`,
    inputRefs,
    outputRef: current.versionRef,
    version: current.version,
  });
  const stateTransition = stateTrace({
    transitionRef: requestRef,
    inputRefs,
    outputRef: requestRef,
    before: current.status,
    action: 'REQUEST_APPROVAL',
    after: 'AWAITING_INTERNAL_APPROVAL',
  });
  return foundationResult({
    module: 'V22_CONTRACT_APPROVAL_REQUEST',
    trace: input.trace,
    inputFacts: [input.currentFact, input.requestFact],
    snapshot,
    versionTransition,
    stateTransition,
  });
}

/** Records one decision against one pending office and one exact version. */
export function recordInternationalContractApproval(input: {
  readonly trace: InternationalContractFoundationTraceRequest;
  readonly currentFact: InternationalContractFoundationFact<InternationalContractFoundationSnapshot>;
  readonly decisionFact: InternationalContractFoundationFact<InternationalApprovalDecision>;
}): InternationalContractFoundationResult {
  const current = contractSnapshot(
    foundationFactPayload(input.trace, input.currentFact, 'current contract'),
    'current contract',
  );
  const rawDecision = foundationFactPayload(
    input.trace,
    input.decisionFact,
    'approval decision',
  );
  const decisionRef = stableReference(
    rawDecision.decisionRef,
    'approval decision.decisionRef',
  );
  if (decisionRef === current.stateRef) {
    kernelInvalid('Approval decision must create a new state reference');
  }
  if (
    stableReference(
      rawDecision.contractRef,
      'approval decision.contractRef',
    ) !== current.contractRef ||
    stableReference(rawDecision.versionRef, 'approval decision.versionRef') !==
      current.versionRef
  ) {
    kernelInvalid('Approval decision must bind the exact contract version');
  }
  if (current.status !== 'AWAITING_INTERNAL_APPROVAL') {
    kernelInvalid(`Approval decision is not allowed from ${current.status}`);
  }
  const officeRef = stableReference(
    rawDecision.officeRef,
    'approval decision.officeRef',
  );
  const decision = approvalStatus(
    rawDecision.decision,
    'approval decision.decision',
  );
  if (decision === 'PENDING') {
    kernelInvalid('Approval decision must be APPROVED or REJECTED');
  }
  const target = current.approvals.find(
    (approval) => approval.officeRef === officeRef,
  );
  if (target === undefined || target.status !== 'PENDING') {
    kernelInvalid('Approval decision must target one pending required office');
  }
  const approvals = current.approvals.map((approval) =>
    approval.officeRef === officeRef
      ? Object.freeze({ ...approval, status: decision, decisionRef })
      : approval,
  );
  const after: InternationalContractStatus =
    decision === 'REJECTED'
      ? 'NEGOTIATING'
      : approvals.every((approval) => approval.status === 'APPROVED')
        ? 'APPROVED'
        : 'AWAITING_INTERNAL_APPROVAL';
  const snapshot: InternationalContractFoundationSnapshot = {
    ...current,
    stateRef: decisionRef,
    status: after,
    approvals,
  };
  const inputRefs = [input.currentFact.factRef, input.decisionFact.factRef];
  const versionTransition = zeroVersionTransition({
    transitionRef: `${decisionRef}.version`,
    inputRefs,
    outputRef: current.versionRef,
    version: current.version,
  });
  const stateTransition = stateTrace({
    transitionRef: decisionRef,
    inputRefs,
    outputRef: decisionRef,
    before: current.status,
    action: 'RECORD_APPROVAL',
    after,
  });
  return foundationResult({
    module: 'V22_CONTRACT_APPROVAL_DECISION',
    trace: input.trace,
    inputFacts: [input.currentFact, input.decisionFact],
    snapshot,
    versionTransition,
    stateTransition,
  });
}

const LIFECYCLE_EDGES: Readonly<
  Record<
    InternationalLifecycleAction,
    readonly (readonly [
      InternationalContractStatus,
      InternationalContractStatus,
    ])[]
  >
> = Object.freeze({
  SIGN: [['APPROVED', 'SIGNED']],
  ACTIVATE: [['SIGNED', 'ACTIVE']],
  REPORT_DELAY: [['ACTIVE', 'DELAYED']],
  CURE_DELAY: [['DELAYED', 'ACTIVE']],
  SUSPEND: [
    ['ACTIVE', 'SUSPENDED'],
    ['DELAYED', 'SUSPENDED'],
    ['RENEGOTIATING', 'SUSPENDED'],
    ['DISPUTED', 'SUSPENDED'],
    ['PARTIALLY_DEFAULTED', 'SUSPENDED'],
  ],
  RESUME: [['SUSPENDED', 'ACTIVE']],
  START_RENEGOTIATION: [
    ['ACTIVE', 'RENEGOTIATING'],
    ['DELAYED', 'RENEGOTIATING'],
    ['SUSPENDED', 'RENEGOTIATING'],
    ['DISPUTED', 'RENEGOTIATING'],
    ['PARTIALLY_DEFAULTED', 'RENEGOTIATING'],
    ['DEFAULTED', 'RENEGOTIATING'],
  ],
  FILE_DISPUTE: [
    ['ACTIVE', 'DISPUTED'],
    ['DELAYED', 'DISPUTED'],
    ['SUSPENDED', 'DISPUTED'],
    ['RENEGOTIATING', 'DISPUTED'],
    ['PARTIALLY_DEFAULTED', 'DISPUTED'],
    ['DEFAULTED', 'DISPUTED'],
  ],
  SETTLE_DISPUTE: [
    ['DISPUTED', 'ACTIVE'],
    ['DISPUTED', 'TERMINATED'],
  ],
  REPORT_PARTIAL_DEFAULT: [
    ['ACTIVE', 'PARTIALLY_DEFAULTED'],
    ['DELAYED', 'PARTIALLY_DEFAULTED'],
    ['DISPUTED', 'PARTIALLY_DEFAULTED'],
  ],
  REPORT_DEFAULT: [
    ['ACTIVE', 'DEFAULTED'],
    ['DELAYED', 'DEFAULTED'],
    ['SUSPENDED', 'DEFAULTED'],
    ['RENEGOTIATING', 'DEFAULTED'],
    ['DISPUTED', 'DEFAULTED'],
    ['PARTIALLY_DEFAULTED', 'DEFAULTED'],
  ],
  COMPLETE: [
    ['ACTIVE', 'COMPLETED'],
    ['DELAYED', 'COMPLETED'],
  ],
  TERMINATE: [
    ['SIGNED', 'TERMINATED'],
    ['ACTIVE', 'TERMINATED'],
    ['DELAYED', 'TERMINATED'],
    ['SUSPENDED', 'TERMINATED'],
    ['RENEGOTIATING', 'TERMINATED'],
    ['DISPUTED', 'TERMINATED'],
    ['PARTIALLY_DEFAULTED', 'TERMINATED'],
    ['DEFAULTED', 'TERMINATED'],
  ],
  EXPIRE: [
    ['SIGNED', 'EXPIRED'],
    ['ACTIVE', 'EXPIRED'],
    ['DELAYED', 'EXPIRED'],
    ['SUSPENDED', 'EXPIRED'],
    ['RENEGOTIATING', 'EXPIRED'],
    ['DISPUTED', 'EXPIRED'],
    ['PARTIALLY_DEFAULTED', 'EXPIRED'],
    ['DEFAULTED', 'EXPIRED'],
  ],
});

/** Applies one explicit non-economic lifecycle edge with an idempotency witness. */
export function transitionInternationalContractLifecycle(input: {
  readonly trace: InternationalContractFoundationTraceRequest;
  readonly currentFact: InternationalContractFoundationFact<InternationalContractFoundationSnapshot>;
  readonly transitionFact: InternationalContractFoundationFact<InternationalLifecycleTransitionRequest>;
}): InternationalContractFoundationResult {
  const current = contractSnapshot(
    foundationFactPayload(input.trace, input.currentFact, 'current contract'),
    'current contract',
  );
  const request = foundationFactPayload(
    input.trace,
    input.transitionFact,
    'lifecycle transition',
  );
  const transitionRef = stableReference(
    request.transitionRef,
    'lifecycle transition.transitionRef',
  );
  if (transitionRef === current.stateRef) {
    kernelInvalid('Lifecycle transition must create a new state reference');
  }
  if (
    stableReference(request.contractRef, 'lifecycle transition.contractRef') !==
      current.contractRef ||
    stableReference(
      request.predecessorStateRef,
      'lifecycle transition.predecessorStateRef',
    ) !== current.stateRef
  ) {
    kernelInvalid('Lifecycle transition must bind the exact predecessor state');
  }
  const action = lifecycleAction(request.action);
  const targetStatus = contractStatus(
    request.targetStatus,
    'lifecycle transition.targetStatus',
  );
  stableReference(request.reasonFactRef, 'lifecycle transition.reasonFactRef');
  sameTick(
    request.effectiveAt,
    input.trace,
    'lifecycle transition.effectiveAt',
  );
  const previouslyAppliedTransitionRefs = distinctReferences(
    request.previouslyAppliedTransitionRefs,
    'lifecycle transition.previouslyAppliedTransitionRefs',
    false,
  );
  if (previouslyAppliedTransitionRefs.includes(transitionRef)) {
    kernelInvalid('Lifecycle transition was already applied by caller witness');
  }
  const allowed = LIFECYCLE_EDGES[action].some(
    ([before, after]) => before === current.status && after === targetStatus,
  );
  if (!allowed) {
    kernelInvalid(`${action} cannot move ${current.status} to ${targetStatus}`);
  }
  if (
    action === 'SIGN' &&
    (current.approvals.length === 0 ||
      current.approvals.some((approval) => approval.status !== 'APPROVED'))
  ) {
    kernelInvalid('Signing requires all approvals for the exact version');
  }
  if (
    action === 'ACTIVATE' &&
    current.activeSignedVersionRef !== current.versionRef
  ) {
    kernelInvalid('Activation requires the exact current version to be signed');
  }
  const snapshot: InternationalContractFoundationSnapshot = {
    ...current,
    stateRef: transitionRef,
    status: targetStatus,
    activeSignedVersionRef:
      action === 'SIGN' ? current.versionRef : current.activeSignedVersionRef,
  };
  const inputRefs = [input.currentFact.factRef, input.transitionFact.factRef];
  const versionTransition = zeroVersionTransition({
    transitionRef: `${transitionRef}.version`,
    inputRefs,
    outputRef: current.versionRef,
    version: current.version,
  });
  const stateTransition = stateTrace({
    transitionRef,
    inputRefs,
    outputRef: transitionRef,
    before: current.status,
    action,
    after: targetStatus,
  });
  return foundationResult({
    module: 'V22_CONTRACT_LIFECYCLE',
    trace: input.trace,
    inputFacts: [input.currentFact, input.transitionFact],
    snapshot,
    versionTransition,
    stateTransition,
  });
}
