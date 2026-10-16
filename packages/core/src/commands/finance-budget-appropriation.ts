import { Money } from '../numeric/money.js';
import { canonicalSerialize } from '../serialization/canonical.js';

/** Declaration checking only. No signature, source admission or execution authority. */
export const BUDGET_INERT_FLAGS = Object.freeze({
  productionAuthority: false,
  sourceAdmitted: false,
  runtimeConnected: false,
} as const);
export type BudgetEvidenceClass = 'UNADMITTED_INERT_INPUT' | 'TEST_ONLY';
type Flags = typeof BUDGET_INERT_FLAGS;
export interface BudgetScope {
  readonly worldId: string;
  readonly countryId: string;
  readonly entityRef: string;
  readonly envelopeRef: string;
  readonly effectivePeriodRef: string;
}
export interface BudgetHead {
  readonly worldVersion: string;
  readonly eventSequence: string;
  readonly simTime: string;
}
export interface BudgetPayload {
  readonly operation: 'SET_ENVELOPE' | 'APPROVE_NEW_LINE';
  readonly scope: BudgetScope;
  readonly currency: string;
  readonly amount: string;
  readonly envelopeRevisionRef: string;
  readonly lineRef: string | null;
  readonly revisionRef: string;
  readonly predecessorRevisionRef: string | null;
}
export interface BudgetIntent {
  readonly schemaVersion: 'inert-budget-intent-v1';
  readonly commandId: string;
  readonly idempotencyKey: string;
  readonly actorRef: string;
  readonly authSubjectRef: string;
  readonly authorizationVersion: string;
  readonly office: 'FINANCE';
  readonly expectedHead: BudgetHead;
  readonly payload: BudgetPayload;
}
export type BudgetRecordKind =
  | 'ENVELOPE_REVISION'
  | 'BUDGET_LINE_CREATION'
  | 'APPROPRIATION'
  | 'BUDGET_LINE_INITIALIZATION'
  | 'LEGACY_DISPOSITION';
export interface BudgetDeclarationBinding {
  readonly producerRef: string;
  readonly sourceId: string;
  readonly sourceRevision: string;
  readonly approvalRuleRef: string;
  readonly approvalRuleRevision: string;
  readonly approvalSetRef: string;
  readonly proposalRef: string;
  readonly proposalVersion: string;
  /** Full validated declaration content, not a caller-selected hash or permission. */
  readonly canonicalContext: string;
}
export interface BudgetProposedRecord {
  readonly proposedRecordRef: string;
  readonly kind: BudgetRecordKind;
  readonly subjectRef: string;
  readonly subjectRevision: string;
  readonly binding: BudgetPayload;
  readonly declarationBinding: BudgetDeclarationBinding;
  readonly proposedEventRef: string;
  readonly proposedAt: BudgetHead;
  readonly proposedSourceRef: string;
  readonly initialPaid: '0' | null;
  readonly initialOutstanding: '0' | null;
  readonly initialReserved: '0' | null;
  readonly legacyDisposition: 'NO_IMPORTED_STATE_IN_THIS_LINE' | null;
}
export interface BudgetProposedEvent {
  readonly proposedEventRef: string;
  readonly kind:
    | 'BUDGET_ENVELOPE_SET'
    | 'BUDGET_LINE_CREATED'
    | 'BUDGET_APPROPRIATED'
    | 'BUDGET_LINE_INITIALIZED';
  readonly proposedAt: BudgetHead;
  readonly causationCommandId: string;
  readonly recordRefs: readonly string[];
}
export interface BudgetProposedSource {
  readonly proposedSourceRef: string;
  readonly producerRef: 'INERT_BUDGET_PRODUCER_V1';
  readonly kind: BudgetRecordKind;
  readonly subjectRef: string;
  readonly subjectRevision: string;
  readonly binding: BudgetPayload;
  readonly bindingRef: string;
  readonly declarationBinding: BudgetDeclarationBinding;
  readonly amount: string | null;
  readonly proposedEventRef: string;
  readonly proposedAt: BudgetHead;
}
export type BudgetInertResult = Flags &
  (
    | Readonly<{
        kind: 'INERT_PROPOSED';
        evidenceClass: BudgetEvidenceClass;
        planRef: string;
        intent: BudgetIntent;
        records: readonly BudgetProposedRecord[];
        eventIntents: readonly BudgetProposedEvent[];
        sourceDeclarations: readonly BudgetProposedSource[];
      }>
    | Readonly<{
        kind: 'INERT_DUPLICATE';
        evidenceClass: BudgetEvidenceClass;
        originalPlanRef: string;
        originalIntent: BudgetIntent;
        eventIntents: readonly [];
      }>
    | Readonly<{
        kind: 'INERT_HISTORY_CONSISTENT';
        evidenceClass: BudgetEvidenceClass;
        currentRevisionRef: string;
        cutoff: BudgetHead;
        eventIntents: readonly [];
      }>
    | Readonly<{
        kind: 'INERT_MISSING_INPUT' | 'INERT_REJECTED' | 'INERT_UNSUPPORTED';
        code: string;
        path: string;
      }>
  );

type Row = Record<string, unknown>;
type FailureKind =
  'INERT_MISSING_INPUT' | 'INERT_REJECTED' | 'INERT_UNSUPPORTED';
class InvalidDeclaration extends Error {
  constructor(
    readonly kind: FailureKind,
    readonly code: string,
    readonly path: string,
  ) {
    super(code);
  }
}
function fail(
  code: string,
  path: string,
  kind: FailureKind = 'INERT_REJECTED',
): never {
  throw new InvalidDeclaration(kind, code, path);
}
function missing(code: string, path: string): never {
  return fail(code, path, 'INERT_MISSING_INPUT');
}
function unsupported(code: string, path: string): never {
  return fail(code, path, 'INERT_UNSUPPORTED');
}
function object(value: unknown, keys: readonly string[], path: string): Row {
  if (value === null) missing('REQUIRED_DECLARATION', path);
  if (typeof value !== 'object' || Array.isArray(value))
    fail('EXPECTED_RECORD', path);
  const row = value as Row;
  if (Object.keys(row).some((key) => !keys.includes(key)))
    fail('UNKNOWN_FIELD', path);
  for (const key of keys)
    if (!Object.hasOwn(row, key)) missing('REQUIRED_FIELD', `${path}.${key}`);
  return row;
}
function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail('EXPECTED_ARRAY', path);
  return value;
}
function ref(value: unknown, path: string): string {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z][A-Za-z0-9._:-]{0,95}$/u.test(value)
  )
    fail('INVALID_REFERENCE', path);
  return value;
}
function integer(value: unknown, path: string): string {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d*)$/u.test(value))
    fail('INVALID_HEAD', path);
  return value;
}
function choice<T extends string>(
  value: unknown,
  choices: readonly T[],
  path: string,
): T {
  if (typeof value !== 'string' || !choices.includes(value as T))
    fail('INVALID_TAG', path);
  return value as T;
}
function equal(a: unknown, b: unknown, path: string): void {
  if (canonicalSerialize(a) !== canonicalSerialize(b))
    fail('BINDING_MISMATCH', path);
}
function unique(values: readonly string[], path: string): void {
  if (new Set(values).size !== values.length) fail('DUPLICATE_IDENTITY', path);
}
function refs(value: unknown, path: string): string[] {
  const values = array(value, path).map((v, i) => ref(v, `${path}.${i}`));
  unique(values, path);
  return values;
}
function scope(value: unknown, path: string): BudgetScope {
  const r = object(
    value,
    ['worldId', 'countryId', 'entityRef', 'envelopeRef', 'effectivePeriodRef'],
    path,
  );
  return {
    worldId: ref(r.worldId, path),
    countryId: ref(r.countryId, path),
    entityRef: ref(r.entityRef, path),
    envelopeRef: ref(r.envelopeRef, path),
    effectivePeriodRef: ref(r.effectivePeriodRef, path),
  };
}
function head(value: unknown, path: string): BudgetHead {
  const r = object(value, ['worldVersion', 'eventSequence', 'simTime'], path);
  return {
    worldVersion: integer(r.worldVersion, path),
    eventSequence: integer(r.eventSequence, path),
    simTime: integer(r.simTime, path),
  };
}
function money(amount: unknown, currency: unknown, path: string): Money {
  if (typeof amount !== 'string' || typeof currency !== 'string')
    fail('EXACT_MONEY_REQUIRED', path);
  const parsed = Money.from(amount, currency);
  if (parsed.amount.isNegative() || parsed.toCanonicalValue().amount !== amount)
    fail('NON_CANONICAL_MONEY', path);
  return parsed;
}
function payload(value: unknown, path: string): BudgetPayload {
  const r = object(
    value,
    [
      'operation',
      'scope',
      'currency',
      'amount',
      'envelopeRevisionRef',
      'lineRef',
      'revisionRef',
      'predecessorRevisionRef',
    ],
    path,
  );
  const operation = choice(
    r.operation,
    ['SET_ENVELOPE', 'APPROVE_NEW_LINE'],
    path,
  );
  const m = money(r.amount, r.currency, path).toCanonicalValue();
  const lineRef = r.lineRef === null ? null : ref(r.lineRef, path);
  if ((operation === 'SET_ENVELOPE') !== (lineRef === null))
    fail('SUBJECT_SHAPE_MISMATCH', path);
  return {
    operation,
    scope: scope(r.scope, `${path}.scope`),
    ...m,
    envelopeRevisionRef: ref(r.envelopeRevisionRef, path),
    lineRef,
    revisionRef: ref(r.revisionRef, path),
    predecessorRevisionRef:
      r.predecessorRevisionRef === null
        ? null
        : ref(r.predecessorRevisionRef, path),
  };
}
function intent(value: unknown, path: string): BudgetIntent {
  const r = object(
    value,
    [
      'schemaVersion',
      'commandId',
      'idempotencyKey',
      'actorRef',
      'authSubjectRef',
      'authorizationVersion',
      'office',
      'expectedHead',
      'payload',
    ],
    path,
  );
  return {
    schemaVersion: choice(r.schemaVersion, ['inert-budget-intent-v1'], path),
    commandId: ref(r.commandId, path),
    idempotencyKey: ref(r.idempotencyKey, path),
    actorRef: ref(r.actorRef, path),
    authSubjectRef: ref(r.authSubjectRef, path),
    authorizationVersion: ref(r.authorizationVersion, path),
    office: choice(r.office, ['FINANCE'], path),
    expectedHead: head(r.expectedHead, path),
    payload: payload(r.payload, `${path}.payload`),
  };
}
function evidence(value: unknown): BudgetEvidenceClass {
  return choice(
    value,
    ['UNADMITTED_INERT_INPUT', 'TEST_ONLY'],
    'evidenceClass',
  );
}

const sourceKinds = [
  'IDENTITY',
  'PERIOD',
  'ALLOCATION_RULE',
  'APPROVAL_RULE',
  'APPROVAL_SET',
  'ENVELOPE',
  'LEGACY_DISPOSITION',
  'EMPTY_SET',
] as const;
/** All refs below are inert declarations; matching them is not source admission. */
function validateContext(
  i: BudgetIntent,
  input: unknown,
  historical = false,
): void {
  const p = i.payload;
  const c = object(
    input,
    [
      'head',
      'source',
      'identity',
      'period',
      'policy',
      'approval',
      'envelope',
      'allocation',
      'slots',
      'origin',
    ],
    'context',
  );
  equal(head(c.head, 'context.head'), i.expectedHead, 'context.head');
  const src = object(
    c.source,
    ['producerRef', 'sourceId', 'revision', 'records'],
    'context.source',
  );
  ref(src.producerRef, 'source.producerRef');
  ref(src.sourceId, 'source.sourceId');
  ref(src.revision, 'source.revision');
  const sources = array(src.records, 'source.records').map((v) => {
    const s = object(
      v,
      [
        'ref',
        'kind',
        'subjectRef',
        'subjectRevision',
        'binding',
        'head',
        'declaration',
      ],
      'source.record',
    );
    ref(s.ref, 'source.record.ref');
    choice(s.kind, sourceKinds, 'source.record.kind');
    ref(s.subjectRef, 'source.subjectRef');
    ref(s.subjectRevision, 'source.subjectRevision');
    equal(payload(s.binding, 'source.binding'), p, 'source.binding');
    equal(head(s.head, 'source.head'), i.expectedHead, 'source.head');
    return s;
  });
  unique(
    sources.map((s) => String(s.ref)),
    'source.records',
  );
  const used = new Set<string>();
  const source = (
    value: unknown,
    kind: (typeof sourceKinds)[number],
    subject: string,
    revision: string,
    declaration: Row,
  ) => {
    const id = ref(value, `source.${kind}`);
    const s = sources.find((item) => item.ref === id);
    if (!s) missing('SOURCE_REFERENCE_MISSING', id);
    equal(
      [s.kind, s.subjectRef, s.subjectRevision],
      [kind, subject, revision],
      id,
    );
    equal(
      s.declaration,
      Object.fromEntries(
        Object.entries(declaration).filter(([key]) => key !== 'sourceRef'),
      ),
      `${id}.declaration`,
    );
    used.add(id);
  };
  const id = object(
    c.identity,
    ['scope', 'lineRef', 'sourceRef', 'revision'],
    'identity',
  );
  equal(scope(id.scope, 'identity.scope'), p.scope, 'identity.scope');
  equal(id.lineRef, p.lineRef, 'identity.lineRef');
  source(
    id.sourceRef,
    'IDENTITY',
    p.lineRef ?? p.scope.envelopeRef,
    ref(id.revision, 'identity.revision'),
    id,
  );
  const period = object(
    c.period,
    ['effectivePeriodRef', 'applicability', 'ruleRef', 'sourceRef', 'revision'],
    'period',
  );
  equal(period.effectivePeriodRef, p.scope.effectivePeriodRef, 'period.ref');
  ref(period.ruleRef, 'period.ruleRef');
  source(
    period.sourceRef,
    'PERIOD',
    p.scope.effectivePeriodRef,
    ref(period.revision, 'period.revision'),
    period,
  );
  if (
    choice(
      period.applicability,
      ['APPLICABLE', 'NOT_APPLICABLE', 'UNKNOWN'],
      'period.applicability',
    ) !== 'APPLICABLE'
  )
    missing('PERIOD_APPLICABILITY', 'period.applicability');

  const policy = object(
    c.policy,
    [
      'ruleRef',
      'revision',
      'sourceRef',
      'binding',
      'classification',
      'captain',
      'dependencies',
      'zeroAmount',
    ],
    'policy',
  );
  const ruleRef = ref(policy.ruleRef, 'policy.ruleRef'),
    ruleRevision = ref(policy.revision, 'policy.revision');
  source(policy.sourceRef, 'APPROVAL_RULE', ruleRef, ruleRevision, policy);
  equal(payload(policy.binding, 'policy.binding'), p, 'policy.binding');
  const classification = choice(
    policy.classification,
    ['ORDINARY_DEPARTMENTAL', 'PROJECT', 'UNKNOWN'],
    'policy.classification',
  );
  if (classification === 'UNKNOWN')
    missing('SUBJECT_CLASSIFICATION', 'policy.classification');
  if (classification === 'PROJECT')
    unsupported('PROJECT_APPROVAL_NOT_SUPPORTED', 'policy.classification');
  const deps = object(
    policy.dependencies,
    ['PROJECT', 'INDUSTRY', 'SOCIAL', 'TRADE', 'CENTRAL_BANK'],
    'policy.dependencies',
  );
  for (const [office, value] of Object.entries(deps)) {
    const applicability = choice(
      value,
      ['REQUIRED', 'NOT_REQUIRED', 'UNKNOWN'],
      `dependencies.${office}`,
    );
    if (applicability === 'UNKNOWN') missing('OFFICE_APPLICABILITY', office);
    if (applicability === 'REQUIRED')
      unsupported('OTHER_OFFICE_NOT_SUPPORTED', office);
  }
  const captain = choice(
    policy.captain,
    ['REQUIRED', 'NOT_REQUIRED', 'UNKNOWN'],
    'policy.captain',
  );
  if (captain === 'UNKNOWN') missing('CAPTAIN_APPLICABILITY', 'policy.captain');
  const zero = choice(
    policy.zeroAmount,
    ['ALLOWED', 'FORBIDDEN', 'UNKNOWN'],
    'policy.zeroAmount',
  );
  if (zero === 'UNKNOWN') missing('ZERO_AMOUNT_RULE', 'policy.zeroAmount');
  if (zero === 'FORBIDDEN' && p.amount === '0')
    fail('ZERO_AMOUNT_FORBIDDEN', 'payload.amount');

  const approval = object(
    c.approval,
    [
      'setRef',
      'proposalRef',
      'version',
      'ruleRef',
      'ruleRevision',
      'binding',
      'status',
      'requiredOffices',
      'signatures',
      'sourceRef',
    ],
    'approval',
  );
  const setRef = ref(approval.setRef, 'approval.setRef');
  ref(approval.proposalRef, 'approval.proposalRef');
  equal(
    [approval.ruleRef, approval.ruleRevision],
    [ruleRef, ruleRevision],
    'approval.rule',
  );
  equal(payload(approval.binding, 'approval.binding'), p, 'approval.binding');
  equal(approval.version, p.revisionRef, 'approval.version');
  source(approval.sourceRef, 'APPROVAL_SET', setRef, p.revisionRef, approval);
  const status = choice(
    approval.status,
    [
      'APPROVED',
      'REQUESTED',
      'PENDING',
      'REJECTED',
      'INVALIDATED',
      'SUPERSEDED',
      'CONDITIONAL',
      'PARTIAL',
    ],
    'approval.status',
  );
  if (status === 'CONDITIONAL' || status === 'PARTIAL')
    unsupported('CONDITIONAL_PARTIAL_NOT_SUPPORTED', 'approval.status');
  if (status !== 'APPROVED')
    fail('UNAPPROVED_APPROPRIATION', 'approval.status');
  const offices = refs(approval.requiredOffices, 'approval.requiredOffices');
  equal(
    offices,
    captain === 'REQUIRED' ? ['FINANCE', 'CAPTAIN'] : ['FINANCE'],
    'approval.requiredOffices',
  );
  const signatures = array(approval.signatures, 'approval.signatures').map(
    (value) => {
      const s = object(
        value,
        [
          'office',
          'actorRef',
          'authSubjectRef',
          'authorizationVersion',
          'proposalRef',
          'proposalVersion',
          'ruleRevision',
          'binding',
          'decision',
          'signedAt',
        ],
        'signature',
      );
      const office = choice(
        s.office,
        ['FINANCE', 'CAPTAIN'],
        'signature.office',
      );
      ref(s.actorRef, 'signature.actorRef');
      ref(s.authSubjectRef, 'signature.authSubjectRef');
      ref(s.authorizationVersion, 'signature.authorizationVersion');
      equal(
        [s.proposalRef, s.proposalVersion, s.ruleRevision, s.decision],
        [approval.proposalRef, approval.version, ruleRevision, 'APPROVED'],
        'signature.proposal',
      );
      equal(payload(s.binding, 'signature.binding'), p, 'signature.binding');
      if (
        typeof s.signedAt !== 'string' ||
        !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(s.signedAt)
      )
        fail('SIGNATURE_TIME_DECLARATION', 'signature.signedAt');
      if (office === 'FINANCE')
        equal(
          [s.actorRef, s.authSubjectRef, s.authorizationVersion],
          [i.actorRef, i.authSubjectRef, i.authorizationVersion],
          'signature.financeIdentity',
        );
      return office;
    },
  );
  unique(signatures, 'approval.signatures');
  equal([...signatures].sort(), [...offices].sort(), 'approval.signatures');

  const allocation = object(
    c.allocation,
    [
      'kind',
      'ruleRef',
      'revision',
      'sourceRef',
      'binding',
      'coveredLineRefs',
      'lines',
    ],
    'allocation',
  );
  const allocationRule = ref(allocation.ruleRef, 'allocation.ruleRef');
  source(
    allocation.sourceRef,
    'ALLOCATION_RULE',
    allocationRule,
    ref(allocation.revision, 'allocation.revision'),
    allocation,
  );
  equal(
    payload(allocation.binding, 'allocation.binding'),
    p,
    'allocation.binding',
  );
  const allocationKind = choice(
    allocation.kind,
    ['COMPLETE_ENVELOPE_CAP', 'NOT_APPLICABLE', 'UNKNOWN'],
    'allocation.kind',
  );
  if (allocationKind === 'UNKNOWN')
    missing('ALLOCATION_RULE', 'allocation.kind');
  const covered = refs(
    allocation.coveredLineRefs,
    'allocation.coveredLineRefs',
  );
  const lines = array(allocation.lines, 'allocation.lines').map((value) => {
    const line = object(
      value,
      ['lineRef', 'revisionRef', 'amount', 'currency'],
      'allocation.line',
    );
    ref(line.revisionRef, 'allocation.revisionRef');
    return {
      lineRef: ref(line.lineRef, 'allocation.lineRef'),
      amount: money(line.amount, line.currency, 'allocation.amount'),
    };
  });
  unique(
    lines.map((line) => line.lineRef),
    'allocation.lines',
  );
  equal(
    [...covered].sort(),
    lines.map((line) => line.lineRef).sort(),
    'allocation.coverage',
  );
  if (p.lineRef !== null && covered.includes(p.lineRef) && !historical)
    fail('LINE_ALREADY_ALLOCATED', 'allocation.coverage');
  if (p.operation === 'SET_ENVELOPE') {
    if (c.envelope !== null || covered.length !== 0 || lines.length !== 0)
      unsupported('UNSUPPORTED_APPROVED_AMENDMENT', 'context.envelope');
    equal(p.envelopeRevisionRef, p.revisionRef, 'envelope.revision');
  } else {
    const envelope = object(
      c.envelope,
      ['scope', 'revisionRef', 'amount', 'currency', 'sourceRef'],
      'envelope',
    );
    equal(scope(envelope.scope, 'envelope.scope'), p.scope, 'envelope.scope');
    equal(envelope.revisionRef, p.envelopeRevisionRef, 'envelope.revision');
    source(
      envelope.sourceRef,
      'ENVELOPE',
      p.scope.envelopeRef,
      p.envelopeRevisionRef,
      envelope,
    );
    const cap = money(envelope.amount, envelope.currency, 'envelope.amount');
    equal(cap.currency, p.currency, 'envelope.currency');
    if (allocationKind === 'COMPLETE_ENVELOPE_CAP') {
      let allocated = Money.from(p.amount, p.currency);
      for (const line of lines) {
        if (historical && line.lineRef === p.lineRef) {
          equal(
            line.amount.toCanonicalValue(),
            { amount: p.amount, currency: p.currency },
            'allocation.historicalLine',
          );
          continue;
        }
        allocated = allocated.add(line.amount);
      }
      if (allocated.amount.greaterThan(cap.amount))
        fail('ENVELOPE_ALLOCATION_EXCEEDED', 'allocation');
    } else if (covered.length !== 0)
      fail('NOT_APPLICABLE_HAS_ALLOCATIONS', 'allocation');
  }

  const slots = object(
    c.slots,
    [
      'coveredEnvelopeRefs',
      'coveredLineRefs',
      'entries',
      'sourceRef',
      'revision',
    ],
    'slots',
  );
  source(
    slots.sourceRef,
    'EMPTY_SET',
    p.lineRef ?? p.scope.envelopeRef,
    ref(slots.revision, 'slots.revision'),
    slots,
  );
  const envelopeCoverage = refs(
    slots.coveredEnvelopeRefs,
    'slots.coveredEnvelopeRefs',
  );
  const lineCoverage = refs(slots.coveredLineRefs, 'slots.coveredLineRefs');
  if (
    !envelopeCoverage.includes(p.scope.envelopeRef) ||
    (p.lineRef !== null && !lineCoverage.includes(p.lineRef))
  )
    missing('SLOT_COVERAGE', 'slots');
  const entries = array(slots.entries, 'slots.entries').map((value) => {
    const entry = object(value, ['scope', 'lineRef', 'currency'], 'slot');
    const s = scope(entry.scope, 'slot.scope');
    if (s.worldId !== p.scope.worldId) fail('SLOT_WORLD_MISMATCH', 'slots');
    const lineRef =
      entry.lineRef === null ? null : ref(entry.lineRef, 'slot.lineRef');
    const currency = money('0', entry.currency, 'slot.currency').currency;
    return { scope: s, lineRef, currency };
  });
  unique(
    entries.map((entry) => canonicalSerialize([entry.scope, entry.lineRef])),
    'slots.entries',
  );
  unique(
    entries
      .filter((entry) => entry.lineRef !== null)
      .map((entry) => String(entry.lineRef)),
    'slots.lineRefs',
  );
  const targetScope = canonicalSerialize(p.scope);
  // Immutable identity applies to both history and creation. Currency is a
  // property of the governed envelope slot, not a global World constraint.
  for (const entry of entries) {
    const sameScope = canonicalSerialize(entry.scope) === targetScope;
    if (sameScope) equal(entry.currency, p.currency, 'slot.currency');
    if (p.lineRef !== null && entry.lineRef === p.lineRef && !sameScope)
      fail('SLOT_ALREADY_EXISTS', 'slots');
  }
  if (
    historical &&
    !entries.some(
      (entry) =>
        entry.lineRef === p.lineRef &&
        canonicalSerialize(entry.scope) === targetScope,
    )
  )
    missing('HISTORICAL_SLOT_IDENTITY', 'slots');
  if (
    p.operation === 'APPROVE_NEW_LINE' &&
    allocationKind === 'COMPLETE_ENVELOPE_CAP'
  )
    equal(
      [...covered].sort(),
      entries
        .filter(
          (entry) =>
            entry.lineRef !== null &&
            canonicalSerialize(entry.scope) === targetScope,
        )
        .map((entry) => entry.lineRef)
        .sort(),
      'allocation.slotCoverage',
    );
  if (
    !historical &&
    entries.some((entry) =>
      p.lineRef === null
        ? canonicalSerialize(entry.scope) === targetScope
        : entry.lineRef === p.lineRef,
    )
  )
    fail('SLOT_ALREADY_EXISTS', 'slots');

  if (!historical && p.operation === 'APPROVE_NEW_LINE') {
    const origin = object(
      c.origin,
      [
        'kind',
        'creationRef',
        'initializationRef',
        'legacyRef',
        'sourceRef',
        'revision',
        'initialPaid',
        'initialOutstanding',
        'initialReserved',
      ],
      'origin',
    );
    const kind = choice(
      origin.kind,
      ['NO_IMPORTED_STATE_IN_THIS_LINE', 'CARRIED_HISTORY', 'UNKNOWN'],
      'origin.kind',
    );
    if (kind === 'UNKNOWN') missing('LEGACY_DISPOSITION', 'origin.kind');
    if (kind === 'CARRIED_HISTORY')
      unsupported('IMPORTED_STATE_NOT_SUPPORTED', 'origin.kind');
    for (const key of ['creationRef', 'initializationRef', 'legacyRef'])
      ref(origin[key], `origin.${key}`);
    unique(
      [
        String(origin.creationRef),
        String(origin.initializationRef),
        String(origin.legacyRef),
      ],
      'origin',
    );
    source(
      origin.sourceRef,
      'LEGACY_DISPOSITION',
      p.lineRef!,
      ref(origin.revision, 'origin.revision'),
      origin,
    );
    equal(
      [origin.initialPaid, origin.initialOutstanding, origin.initialReserved],
      ['0', '0', '0'],
      'origin.initialPCR',
    );
  } else if (c.origin !== null) fail('UNEXPECTED_ORIGIN', 'origin');
  if (used.size !== sources.length)
    fail('UNASSIGNED_SOURCE_RECORD', 'source.records');
}

function safely(run: () => BudgetInertResult): BudgetInertResult {
  try {
    return deepFreeze(run());
  } catch (error) {
    return Object.freeze({
      ...BUDGET_INERT_FLAGS,
      kind: error instanceof InvalidDeclaration ? error.kind : 'INERT_REJECTED',
      code:
        error instanceof InvalidDeclaration
          ? error.code
          : 'INVALID_INERT_DECLARATION',
      path: error instanceof InvalidDeclaration ? error.path : 'input',
    });
  }
}
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}
function normalize(input: unknown): unknown {
  return JSON.parse(canonicalSerialize(input)) as unknown;
}

/** No global family registration; hashes, source refs and approvals remain declarations. */
export function planBudgetAppropriation(input: unknown): BudgetInertResult {
  return safely(() => {
    const r = object(
      normalize(input),
      [
        'schemaVersion',
        'evidenceClass',
        'intent',
        'identityCoverage',
        'identities',
        'context',
      ],
      'input',
    );
    choice(r.schemaVersion, ['inert-budget-plan-v1'], 'schemaVersion');
    const e = evidence(r.evidenceClass),
      i = intent(r.intent, 'intent'),
      p = i.payload;
    const coverage = object(
      r.identityCoverage,
      ['worldId', 'commandIds', 'idempotencyKeys'],
      'identityCoverage',
    );
    equal(coverage.worldId, p.scope.worldId, 'identityCoverage.worldId');
    const commandIds = refs(coverage.commandIds, 'identityCoverage.commandIds'),
      keys = refs(coverage.idempotencyKeys, 'identityCoverage.idempotencyKeys');
    const originals = array(r.identities, 'identities').map((value) => {
      const row = object(value, ['intent', 'originalPlanRef'], 'identity');
      return {
        intent: intent(row.intent, 'identity.intent'),
        originalPlanRef: ref(row.originalPlanRef, 'identity.originalPlanRef'),
      };
    });
    unique(
      originals.map(
        (o) => `${o.intent.payload.scope.worldId}:${o.intent.commandId}`,
      ),
      'identities.commandIds',
    );
    unique(
      originals.map(
        (o) => `${o.intent.payload.scope.worldId}:${o.intent.idempotencyKey}`,
      ),
      'identities.keys',
    );
    for (const original of originals) {
      if (
        original.intent.payload.scope.worldId !== p.scope.worldId ||
        !commandIds.includes(original.intent.commandId) ||
        !keys.includes(original.intent.idempotencyKey)
      )
        fail('IDENTITY_OUTSIDE_COVERAGE', 'identities');
    }
    if (!commandIds.includes(i.commandId) || !keys.includes(i.idempotencyKey))
      missing('IDENTITY_COVERAGE', 'identityCoverage');
    const matches = originals.filter(
      (o) =>
        o.intent.commandId === i.commandId ||
        o.intent.idempotencyKey === i.idempotencyKey,
    );
    if (
      matches.some(
        (o) => canonicalSerialize(o.intent) !== canonicalSerialize(i),
      ) ||
      matches.length > 1
    )
      fail('IDEMPOTENCY_CONFLICT', 'identities');
    if (matches[0])
      return {
        ...BUDGET_INERT_FLAGS,
        kind: 'INERT_DUPLICATE',
        evidenceClass: e,
        originalPlanRef: matches[0].originalPlanRef,
        originalIntent: matches[0].intent,
        eventIntents: [],
      };
    if (p.predecessorRevisionRef !== null)
      unsupported(
        'UNSUPPORTED_APPROVED_AMENDMENT',
        'intent.payload.predecessorRevisionRef',
      );
    validateContext(i, r.context);
    const planRef = `${i.commandId}:PLAN`;
    const eventKinds: BudgetProposedEvent['kind'][] =
      p.operation === 'SET_ENVELOPE'
        ? ['BUDGET_ENVELOPE_SET']
        : [
            'BUDGET_LINE_CREATED',
            'BUDGET_APPROPRIATED',
            'BUDGET_LINE_INITIALIZED',
          ];
    const eventIntents: BudgetProposedEvent[] = eventKinds.map(
      (kind, index) => ({
        proposedEventRef: `${i.commandId}:${kind}`,
        kind,
        proposedAt: {
          worldVersion: (BigInt(i.expectedHead.worldVersion) + 1n).toString(),
          eventSequence: (
            BigInt(i.expectedHead.eventSequence) +
            BigInt(index) +
            1n
          ).toString(),
          simTime: i.expectedHead.simTime,
        },
        causationCommandId: i.commandId,
        recordRefs: [],
      }),
    );
    const c = r.context as Row;
    const origin = c.origin as Row | null;
    const source = c.source as Row,
      policy = c.policy as Row,
      approval = c.approval as Row;
    const declarationBinding: BudgetDeclarationBinding = {
      producerRef: String(source.producerRef),
      sourceId: String(source.sourceId),
      sourceRevision: String(source.revision),
      approvalRuleRef: String(policy.ruleRef),
      approvalRuleRevision: String(policy.revision),
      approvalSetRef: String(approval.setRef),
      proposalRef: String(approval.proposalRef),
      proposalVersion: String(approval.version),
      canonicalContext: canonicalSerialize(c),
    };
    const kinds: BudgetRecordKind[] =
      p.operation === 'SET_ENVELOPE'
        ? ['ENVELOPE_REVISION']
        : [
            'BUDGET_LINE_CREATION',
            'APPROPRIATION',
            'BUDGET_LINE_INITIALIZATION',
            'LEGACY_DISPOSITION',
          ];
    const records = kinds.map((kind): BudgetProposedRecord => {
      const eventIndex =
        kind === 'APPROPRIATION'
          ? 1
          : kind === 'BUDGET_LINE_INITIALIZATION' ||
              kind === 'LEGACY_DISPOSITION'
            ? 2
            : 0;
      const event = eventIntents[eventIndex]!;
      const recordRef =
        kind === 'BUDGET_LINE_CREATION'
          ? String(origin!.creationRef)
          : kind === 'BUDGET_LINE_INITIALIZATION'
            ? String(origin!.initializationRef)
            : kind === 'LEGACY_DISPOSITION'
              ? String(origin!.legacyRef)
              : p.revisionRef;
      return {
        proposedRecordRef: recordRef,
        kind,
        subjectRef: p.lineRef ?? p.scope.envelopeRef,
        subjectRevision: p.revisionRef,
        binding: p,
        declarationBinding,
        proposedEventRef: event.proposedEventRef,
        proposedAt: event.proposedAt,
        proposedSourceRef: `${recordRef}:SOURCE`,
        initialPaid: kind === 'BUDGET_LINE_INITIALIZATION' ? '0' : null,
        initialOutstanding: kind === 'BUDGET_LINE_INITIALIZATION' ? '0' : null,
        initialReserved: kind === 'BUDGET_LINE_INITIALIZATION' ? '0' : null,
        legacyDisposition:
          kind === 'LEGACY_DISPOSITION'
            ? 'NO_IMPORTED_STATE_IN_THIS_LINE'
            : null,
      };
    });
    unique(
      records.map((record) => record.proposedRecordRef),
      'proposedRecords',
    );
    const events = eventIntents.map((event) => ({
      ...event,
      recordRefs: records
        .filter((record) => record.proposedEventRef === event.proposedEventRef)
        .map((record) => record.proposedRecordRef),
    }));
    const sourceDeclarations = records.map((record): BudgetProposedSource => ({
      proposedSourceRef: record.proposedSourceRef,
      producerRef: 'INERT_BUDGET_PRODUCER_V1',
      kind: record.kind,
      subjectRef: record.subjectRef,
      subjectRevision: record.subjectRevision,
      binding: p,
      bindingRef:
        record.kind === 'LEGACY_DISPOSITION'
          ? 'NO_IMPORTED_STATE_IN_THIS_LINE'
          : record.proposedRecordRef,
      declarationBinding,
      amount:
        record.kind === 'APPROPRIATION' || record.kind === 'ENVELOPE_REVISION'
          ? p.amount
          : null,
      proposedEventRef: record.proposedEventRef,
      proposedAt: record.proposedAt,
    }));
    return {
      ...BUDGET_INERT_FLAGS,
      kind: 'INERT_PROPOSED',
      evidenceClass: e,
      planRef,
      intent: i,
      records,
      eventIntents: events,
      sourceDeclarations,
    };
  });
}

/** Checks historical declarations only; never applies an approved amendment/import. */
export function checkBudgetAppropriationHistory(
  input: unknown,
): BudgetInertResult {
  return safely(() => {
    const r = object(
      normalize(input),
      [
        'schemaVersion',
        'evidenceClass',
        'scope',
        'currency',
        'cutoff',
        'revisions',
      ],
      'history',
    );
    choice(r.schemaVersion, ['inert-budget-history-v1'], 'schemaVersion');
    const e = evidence(r.evidenceClass),
      s = scope(r.scope, 'history.scope'),
      cutoff = head(r.cutoff, 'history.cutoff');
    money('0', r.currency, 'history.currency');
    const revisions = array(r.revisions, 'history.revisions');
    if (revisions.length === 0) missing('HISTORY_ORIGIN', 'history.revisions');
    let previous: BudgetIntent | null = null;
    const ids: string[] = [],
      commands: string[] = [],
      keys: string[] = [];
    for (const item of revisions) {
      const revision = object(item, ['intent', 'context'], 'history.revision'),
        i = intent(revision.intent, 'history.intent');
      equal(i.payload.scope, s, 'history.scope');
      equal(i.payload.currency, r.currency, 'history.currency');
      if (i.payload.operation !== 'APPROVE_NEW_LINE')
        fail('HISTORY_SUBJECT_KIND', 'history.intent');
      equal(
        i.payload.predecessorRevisionRef,
        previous?.payload.revisionRef ?? null,
        'history.predecessor',
      );
      if (previous !== null) {
        equal(i.payload.lineRef, previous.payload.lineRef, 'history.lineRef');
        if (
          BigInt(i.expectedHead.worldVersion) <=
            BigInt(previous.expectedHead.worldVersion) ||
          BigInt(i.expectedHead.eventSequence) <=
            BigInt(previous.expectedHead.eventSequence) ||
          BigInt(i.expectedHead.simTime) < BigInt(previous.expectedHead.simTime)
        )
          fail('HISTORY_ORDER', 'history.head');
      }
      if (
        BigInt(i.expectedHead.worldVersion) > BigInt(cutoff.worldVersion) ||
        BigInt(i.expectedHead.eventSequence) > BigInt(cutoff.eventSequence) ||
        BigInt(i.expectedHead.simTime) > BigInt(cutoff.simTime)
      )
        fail('HISTORY_AFTER_CUTOFF', 'history.cutoff');
      validateContext(i, revision.context, true);
      ids.push(i.payload.revisionRef);
      commands.push(i.commandId);
      keys.push(i.idempotencyKey);
      previous = i;
    }
    unique(ids, 'history.revisions');
    unique(commands, 'history.commandIds');
    unique(keys, 'history.keys');
    if (
      canonicalSerialize(previous!.expectedHead) !== canonicalSerialize(cutoff)
    )
      missing('HISTORY_CUTOFF_COVERAGE', 'history.cutoff');
    return {
      ...BUDGET_INERT_FLAGS,
      kind: 'INERT_HISTORY_CONSISTENT',
      evidenceClass: e,
      currentRevisionRef: previous!.payload.revisionRef,
      cutoff,
      eventIntents: [],
    };
  });
}
