import { DomainError } from '../errors.js';
import { Money } from '../numeric/money.js';
import {
  worldId as parseWorldId,
  countryId as parseCountryId,
  commandId as parseCommandId,
  idempotencyKey as parseKey,
} from '../ids.js';
import { canonicalSerialize } from '../serialization/canonical.js';
import { OFFICE_DEFINITIONS } from '../authorization/offices.js';
import { calculateAvailableFiscalCapacity } from '../engine-kernels/technology-project-household-fiscal.js';
import type { ExactMoney } from '../engine-kernels/common.js';
import type {
  BudgetPayload,
  BudgetScope,
} from './finance-budget-appropriation.js';

/**
 * Unregistered pure semantics only. These LOCAL schemas are not the approved
 * stored-event wire format, a source carrier, authorization, or a commit API.
 * Every positive computation is conditional on TEST_ONLY supplied facts. A
 * later closed server composition must independently admit sources, resolve
 * current grants/policy, classify real history, and enforce its atomic guard.
 */
export const BUDGET_DOMAIN_SCHEMAS = Object.freeze({
  evaluation: 'budget-domain-evaluation-v1',
  context: 'budget-domain-context-v1',
  state: 'budget-domain-state-v1',
  intent: 'budget-domain-intent-v1',
  replay: 'budget-domain-replay-v1',
} as const);

const FAMILY = 'CORE_FINANCE_BUDGET_APPROPRIATION_V1';
const OFFICES = Object.keys(OFFICE_DEFINITIONS);
type Row = Record<string, unknown>;

export interface BudgetDomainCommand {
  readonly worldId: string;
  readonly countryId: string;
  readonly officeId: 'FINANCE';
  readonly commandType: typeof FAMILY;
  readonly commandId: string;
  readonly idempotencyKey: string;
  readonly expectedWorldVersion: string;
  readonly payload: BudgetPayload;
}

export interface BudgetDomainLine {
  readonly lineRef: string;
  readonly revisionRef: string;
  readonly appropriation: ExactMoney;
  readonly origin: 'NEW_NO_IMPORTED_STATE_TEST_FIXTURE';
  readonly initialPaid: '0';
  readonly initialOutstanding: '0';
  readonly initialReserved: '0';
  readonly commitmentHeadRef: null;
  readonly committed: readonly [];
}

export interface BudgetDomainEnvelope {
  readonly scope: BudgetScope;
  readonly currency: string;
  readonly revisionRef: string;
  readonly cap: string;
  readonly lines: readonly BudgetDomainLine[];
}

export interface BudgetDomainState {
  readonly schemaVersion: typeof BUDGET_DOMAIN_SCHEMAS.state;
  readonly worldId: string;
  readonly worldVersion: string;
  readonly eventSequence: string;
  readonly envelopes: readonly BudgetDomainEnvelope[];
  /** Derived replay identity index, not a durable receipt/dedupe store. */
  readonly history: readonly Readonly<{
    commandId: string;
    idempotencyKey: string;
    canonicalCommand: string;
  }>[];
}

export interface BudgetDomainIntent {
  readonly schemaVersion: typeof BUDGET_DOMAIN_SCHEMAS.intent;
  readonly kind:
    | 'BUDGET_ENVELOPE_SET'
    | 'BUDGET_LINE_CREATED'
    | 'BUDGET_APPROPRIATED'
    | 'BUDGET_LINE_INITIALIZED';
  readonly commandId: string;
  readonly canonicalCommand: string;
  readonly canonicalContext: string;
  readonly worldVersion: string;
  readonly sequence: string;
  readonly intentSimTime: string;
}

interface Context {
  readonly canonicalContext: string;
  readonly intentSimTime: string;
  readonly capacityTrace: ExactMoney | null;
}

export type BudgetDomainResult =
  | Readonly<{
      kind: 'CONDITIONAL_DOMAIN_CHANGE';
      semanticsOnly: true;
      eventIntents: readonly BudgetDomainIntent[];
      nextState: BudgetDomainState;
      capacityTrace: ExactMoney | null;
    }>
  | Readonly<{
      kind: 'CONDITIONAL_DOMAIN_DUPLICATE';
      semanticsOnly: true;
      eventIntents: readonly [];
      nextState: BudgetDomainState;
    }>
  | Readonly<{
      kind: 'DOMAIN_DENIED';
      semanticsOnly: true;
      code: string;
      path: string;
    }>;

class Invalid extends Error {
  constructor(
    readonly code: string,
    readonly path: string,
  ) {
    super(code);
  }
}
function fail(code: string, path: string): never {
  throw new Invalid(code, path);
}
function record(value: unknown, keys: readonly string[], path: string): Row {
  if (value === null || value === undefined) fail('MISSING_INPUT', path);
  if (typeof value !== 'object' || Array.isArray(value))
    fail('EXPECTED_RECORD', path);
  const row = value as Row;
  if (Object.keys(row).some((k) => !keys.includes(k)))
    fail('UNKNOWN_FIELD', path);
  for (const key of keys)
    if (!Object.hasOwn(row, key)) fail('MISSING_INPUT', `${path}.${key}`);
  return row;
}
function list(value: unknown, path: string): unknown[] {
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
function id(
  value: unknown,
  path: string,
  parse: (v: string) => string,
): string {
  const text = ref(value, path);
  try {
    return parse(text);
  } catch (error) {
    if (error instanceof DomainError) fail('INVALID_IDENTIFIER', path);
    throw error;
  }
}
function integer(value: unknown, path: string): string {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d*)$/u.test(value))
    fail('INVALID_INTEGER', path);
  return value;
}
function equal(a: unknown, b: unknown, path: string): void {
  if (canonicalSerialize(a) !== canonicalSerialize(b))
    fail('BINDING_MISMATCH', path);
}
function tag(value: unknown, expected: string | null, path: string): void {
  if (value !== expected) fail('UNSUPPORTED_OR_UNKNOWN', path);
}
function unique(values: readonly string[], path: string): void {
  if (new Set(values).size !== values.length) fail('DUPLICATE_IDENTITY', path);
}
function setEqual(
  a: readonly string[],
  b: readonly string[],
  path: string,
): void {
  unique(a, path);
  unique(b, path);
  equal([...a].sort(), [...b].sort(), path);
}
function money(amount: unknown, currency: unknown, path: string): Money {
  if (typeof amount !== 'string' || typeof currency !== 'string')
    fail('MISSING_EXACT_MONEY', path);
  try {
    const result = Money.from(amount, currency);
    if (
      result.amount.isNegative() ||
      result.toCanonicalValue().amount !== amount
    )
      fail('NONCANONICAL_MONEY', path);
    return result;
  } catch (error) {
    if (error instanceof DomainError) fail('INVALID_MONEY', path);
    throw error;
  }
}
function exactMoney(
  value: unknown,
  currency: string,
  path: string,
): ExactMoney {
  const row = record(value, ['amount', 'currency'], path);
  equal(row.currency, currency, `${path}.currency`);
  return money(row.amount, row.currency, path).toCanonicalValue();
}
function scope(value: unknown, path: string): BudgetScope {
  const row = record(
    value,
    ['worldId', 'countryId', 'entityRef', 'envelopeRef', 'effectivePeriodRef'],
    path,
  );
  return {
    worldId: id(row.worldId, `${path}.worldId`, parseWorldId),
    countryId: id(row.countryId, `${path}.countryId`, parseCountryId),
    entityRef: ref(row.entityRef, `${path}.entityRef`),
    envelopeRef: ref(row.envelopeRef, `${path}.envelopeRef`),
    effectivePeriodRef: ref(
      row.effectivePeriodRef,
      `${path}.effectivePeriodRef`,
    ),
  };
}

/** Strict existing eight-key payload, not a new transport registration. */
export function parseBudgetSourcePayload(value: unknown): BudgetPayload {
  const p = record(
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
    'payload',
  );
  if (p.operation !== 'SET_ENVELOPE' && p.operation !== 'APPROVE_NEW_LINE')
    fail('UNSUPPORTED_OPERATION', 'payload.operation');
  const s = scope(p.scope, 'payload.scope');
  const amount = money(
    p.amount,
    p.currency,
    'payload.amount',
  ).toCanonicalValue();
  const envelopeRevisionRef = ref(
    p.envelopeRevisionRef,
    'payload.envelopeRevisionRef',
  );
  const revisionRef = ref(p.revisionRef, 'payload.revisionRef');
  tag(p.predecessorRevisionRef, null, 'payload.predecessorRevisionRef');
  const lineRef =
    p.operation === 'SET_ENVELOPE' ? null : ref(p.lineRef, 'payload.lineRef');
  if (p.operation === 'SET_ENVELOPE') {
    tag(p.lineRef, null, 'payload.lineRef');
    equal(envelopeRevisionRef, revisionRef, 'payload.revisionRef');
  }
  return {
    operation: p.operation,
    scope: s,
    ...amount,
    envelopeRevisionRef,
    lineRef,
    revisionRef,
    predecessorRevisionRef: null,
  };
}
function command(value: unknown): BudgetDomainCommand {
  const c = record(
    value,
    [
      'worldId',
      'countryId',
      'officeId',
      'commandType',
      'commandId',
      'idempotencyKey',
      'expectedWorldVersion',
      'payload',
    ],
    'command',
  );
  tag(c.officeId, 'FINANCE', 'command.officeId');
  tag(c.commandType, FAMILY, 'command.commandType');
  const payload = parseBudgetSourcePayload(c.payload);
  const worldId = id(c.worldId, 'command.worldId', parseWorldId),
    countryId = id(c.countryId, 'command.countryId', parseCountryId);
  equal(worldId, payload.scope.worldId, 'command.worldId');
  equal(countryId, payload.scope.countryId, 'command.countryId');
  return {
    worldId,
    countryId,
    officeId: 'FINANCE',
    commandType: FAMILY,
    commandId: id(c.commandId, 'command.commandId', parseCommandId),
    idempotencyKey: id(c.idempotencyKey, 'command.idempotencyKey', parseKey),
    expectedWorldVersion: integer(
      c.expectedWorldVersion,
      'command.expectedWorldVersion',
    ),
    payload,
  };
}
function applyPayload(
  envelopes: readonly BudgetDomainEnvelope[],
  p: BudgetPayload,
): readonly BudgetDomainEnvelope[] {
  if (
    envelopes
      .flatMap((e) => [e.revisionRef, ...e.lines.map((l) => l.revisionRef)])
      .includes(p.revisionRef)
  )
    fail('REVISION_SLOT_OCCUPIED', 'payload.revisionRef');
  const index = envelopes.findIndex(
    (e) => e.scope.envelopeRef === p.scope.envelopeRef,
  );
  if (p.operation === 'SET_ENVELOPE') {
    if (index !== -1)
      fail('ENVELOPE_SLOT_OCCUPIED', 'payload.scope.envelopeRef');
    return [
      ...envelopes,
      {
        scope: p.scope,
        currency: p.currency,
        revisionRef: p.revisionRef,
        cap: p.amount,
        lines: [],
      },
    ];
  }
  const current = envelopes[index];
  if (current === undefined) fail('MISSING_ENVELOPE', 'state.envelopes');
  equal(current.scope, p.scope, 'envelope.scope');
  equal(current.currency, p.currency, 'envelope.currency');
  equal(current.revisionRef, p.envelopeRevisionRef, 'envelope.revisionRef');
  if (p.lineRef === null) fail('MISSING_LINE', 'payload.lineRef');
  if (envelopes.some((e) => e.lines.some((l) => l.lineRef === p.lineRef)))
    fail('LINE_SLOT_OCCUPIED', 'payload.lineRef');
  const sum = current.lines.reduce(
    (a, l) => a.add(Money.from(l.appropriation.amount, p.currency)),
    Money.from(p.amount, p.currency),
  );
  if (sum.amount.greaterThan(Money.from(current.cap, p.currency).amount))
    fail('CAP_EXCEEDED', 'payload.amount');
  const line: BudgetDomainLine = {
    lineRef: p.lineRef,
    revisionRef: p.revisionRef,
    appropriation: { amount: p.amount, currency: p.currency },
    origin: 'NEW_NO_IMPORTED_STATE_TEST_FIXTURE',
    initialPaid: '0',
    initialOutstanding: '0',
    initialReserved: '0',
    commitmentHeadRef: null,
    committed: [],
  };
  return envelopes.map((e, i) =>
    i === index ? { ...current, lines: [...current.lines, line] } : e,
  );
}
function unrelated(
  raw: unknown,
  worldId: string,
  version: string,
  sequence: string,
  path: string,
): Row {
  const step = record(
    raw,
    [
      'kind',
      'worldId',
      'worldVersionBefore',
      'worldVersionAfter',
      'commandId',
      'idempotencyKey',
      'events',
    ],
    path,
  );
  tag(step.kind, 'UNRELATED_TEST_FIXTURE', `${path}.kind`);
  equal(step.worldId, worldId, `${path}.worldId`);
  equal(step.worldVersionBefore, version, `${path}.worldVersionBefore`);
  equal(
    step.worldVersionAfter,
    (BigInt(version) + 1n).toString(),
    `${path}.worldVersionAfter`,
  );
  id(step.commandId, `${path}.commandId`, parseCommandId);
  id(step.idempotencyKey, `${path}.idempotencyKey`, parseKey);
  const events = list(step.events, `${path}.events`);
  if (!events.length) fail('MISSING_EVENTS', path);
  for (const [j, value] of events.entries()) {
    const e = record(
      value,
      ['eventType', 'sequence', 'affectedBudgetLineRefs'],
      `${path}.events.${j}`,
    );
    tag(
      e.eventType,
      'TEST_ONLY_NON_ECONOMIC_EVENT',
      `${path}.events.${j}.eventType`,
    );
    equal(
      e.sequence,
      (BigInt(sequence) + BigInt(j) + 1n).toString(),
      `${path}.events.${j}.sequence`,
    );
    equal(
      e.affectedBudgetLineRefs,
      [],
      `${path}.events.${j}.affectedBudgetLineRefs`,
    );
  }
  return step;
}
function canonicalValue(text: string, path: string): unknown {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    fail('INVALID_CANONICAL_COMMAND', path);
  }
  equal(text, canonicalSerialize(value), path);
  return value;
}
function state(value: unknown): BudgetDomainState {
  const s = record(
    value,
    [
      'schemaVersion',
      'worldId',
      'worldVersion',
      'eventSequence',
      'envelopes',
      'history',
    ],
    'state',
  );
  tag(s.schemaVersion, BUDGET_DOMAIN_SCHEMAS.state, 'state.schemaVersion');
  const worldId = id(s.worldId, 'state.worldId', parseWorldId);
  const envelopes = list(s.envelopes, 'state.envelopes').map(
    (value, i): BudgetDomainEnvelope => {
      const p = `state.envelopes.${i}`,
        e = record(
          value,
          ['scope', 'currency', 'revisionRef', 'cap', 'lines'],
          p,
        );
      const bound = scope(e.scope, `${p}.scope`);
      equal(bound.worldId, worldId, `${p}.worldId`);
      const cap = money(e.cap, e.currency, `${p}.cap`).toCanonicalValue();
      const lines = list(e.lines, `${p}.lines`).map(
        (value, j): BudgetDomainLine => {
          const q = `${p}.lines.${j}`,
            l = record(
              value,
              [
                'lineRef',
                'revisionRef',
                'appropriation',
                'origin',
                'initialPaid',
                'initialOutstanding',
                'initialReserved',
                'commitmentHeadRef',
                'committed',
              ],
              q,
            );
          tag(l.origin, 'NEW_NO_IMPORTED_STATE_TEST_FIXTURE', `${q}.origin`);
          for (const k of [
            'initialPaid',
            'initialOutstanding',
            'initialReserved',
          ])
            tag(l[k], '0', `${q}.${k}`);
          tag(l.commitmentHeadRef, null, `${q}.commitmentHeadRef`);
          if (list(l.committed, `${q}.committed`).length)
            fail('UNSUPPORTED_COMMITMENT_HISTORY', q);
          return {
            lineRef: ref(l.lineRef, `${q}.lineRef`),
            revisionRef: ref(l.revisionRef, `${q}.revisionRef`),
            appropriation: exactMoney(
              l.appropriation,
              cap.currency,
              `${q}.appropriation`,
            ),
            origin: 'NEW_NO_IMPORTED_STATE_TEST_FIXTURE',
            initialPaid: '0',
            initialOutstanding: '0',
            initialReserved: '0',
            commitmentHeadRef: null,
            committed: [],
          };
        },
      );
      const total = lines.reduce(
        (a, l) =>
          a.add(money(l.appropriation.amount, l.appropriation.currency, p)),
        Money.from('0', cap.currency),
      );
      if (total.amount.greaterThan(money(cap.amount, cap.currency, p).amount))
        fail('CAP_EXCEEDED', p);
      return {
        scope: bound,
        currency: cap.currency,
        revisionRef: ref(e.revisionRef, `${p}.revisionRef`),
        cap: cap.amount,
        lines,
      };
    },
  );
  unique(
    envelopes.map((e) => e.scope.envelopeRef),
    'state.envelopes',
  );
  unique(
    envelopes.flatMap((e) => e.lines.map((l) => l.lineRef)),
    'state.lines',
  );
  unique(
    envelopes.flatMap((e) => [
      e.revisionRef,
      ...e.lines.map((l) => l.revisionRef),
    ]),
    'state.revisions',
  );
  const history = list(s.history, 'state.history').map((value, i) => {
    const p = `state.history.${i}`,
      h = record(value, ['commandId', 'idempotencyKey', 'canonicalCommand'], p);
    if (
      typeof h.canonicalCommand !== 'string' ||
      h.canonicalCommand.length === 0
    )
      fail('INVALID_CANONICAL_COMMAND', p);
    return {
      commandId: id(h.commandId, `${p}.commandId`, parseCommandId),
      idempotencyKey: id(h.idempotencyKey, `${p}.idempotencyKey`, parseKey),
      canonicalCommand: h.canonicalCommand,
    };
  });
  unique(
    history.map((h) => h.commandId),
    'state.history.commandId',
  );
  unique(
    history.map((h) => h.idempotencyKey),
    'state.history.key',
  );
  // A caller's complete-coverage label cannot hide a line already present in
  // this supplied fixture history. Rebuild every supported state mutation.
  let derived: readonly BudgetDomainEnvelope[] = [],
    cursor = 0n;
  for (const [i, h] of history.entries()) {
    const path = `state.history.${i}`,
      value = canonicalValue(h.canonicalCommand, path);
    if (
      value !== null &&
      typeof value === 'object' &&
      (value as Row).kind === 'UNRELATED_TEST_FIXTURE'
    ) {
      const step = unrelated(
        value,
        worldId,
        String(i),
        cursor.toString(),
        path,
      );
      equal(step.commandId, h.commandId, `${path}.commandId`);
      equal(step.idempotencyKey, h.idempotencyKey, `${path}.idempotencyKey`);
      cursor += BigInt(list(step.events, path).length);
    } else {
      const c = command(value);
      equal(c.worldId, worldId, `${path}.worldId`);
      equal(c.expectedWorldVersion, String(i), `${path}.worldVersion`);
      equal(c.commandId, h.commandId, `${path}.commandId`);
      equal(c.idempotencyKey, h.idempotencyKey, `${path}.idempotencyKey`);
      equal(canonicalSerialize(c), h.canonicalCommand, path);
      derived = applyPayload(derived, c.payload);
      cursor += c.payload.operation === 'SET_ENVELOPE' ? 1n : 3n;
    }
  }
  equal(derived, envelopes, 'state.envelopes.history');
  equal(
    s.worldVersion,
    BigInt(history.length).toString(),
    'state.worldVersion.history',
  );
  equal(s.eventSequence, cursor.toString(), 'state.eventSequence.history');
  return {
    schemaVersion: BUDGET_DOMAIN_SCHEMAS.state,
    worldId,
    worldVersion: integer(s.worldVersion, 'state.worldVersion'),
    eventSequence: integer(s.eventSequence, 'state.eventSequence'),
    envelopes,
    history,
  };
}
function office(value: unknown, path: string): string {
  const id = ref(value, path);
  if (!OFFICES.includes(id)) fail('UNKNOWN_OFFICE', path);
  return id;
}
function context(
  value: unknown,
  c: BudgetDomainCommand,
  s: BudgetDomainState,
): Context {
  const x = record(
    value,
    [
      'schemaVersion',
      'evidenceClass',
      'scope',
      'currency',
      'sourceRevision',
      'periodRevision',
      'intentSimTime',
      'authorization',
      'proposal',
      'policy',
      'coverage',
      'origin',
      'capacity',
    ],
    'context',
  );
  tag(x.schemaVersion, BUDGET_DOMAIN_SCHEMAS.context, 'context.schemaVersion');
  tag(x.evidenceClass, 'TEST_ONLY', 'context.evidenceClass');
  equal(scope(x.scope, 'context.scope'), c.payload.scope, 'context.scope');
  equal(x.currency, c.payload.currency, 'context.currency');
  ref(x.sourceRevision, 'context.sourceRevision');
  ref(x.periodRevision, 'context.periodRevision');
  const intentSimTime = integer(x.intentSimTime, 'context.intentSimTime');
  const auth = record(
    x.authorization,
    ['officeId', 'capability', 'actorRef', 'authorizationVersion'],
    'context.authorization',
  );
  tag(auth.officeId, 'FINANCE', 'context.authorization.officeId');
  tag(auth.capability, 'FINANCE_BUDGET', 'context.authorization.capability');
  ref(auth.actorRef, 'context.authorization.actorRef');
  ref(auth.authorizationVersion, 'context.authorization.authorizationVersion');
  const proposal = record(
    x.proposal,
    [
      'proposalRef',
      'proposalVersion',
      'payload',
      'requestingOfficeId',
      'programmeOwnerOfficeId',
      'classification',
      'funding',
      'purposeRef',
    ],
    'context.proposal',
  );
  ref(proposal.proposalRef, 'context.proposal.proposalRef');
  ref(proposal.proposalVersion, 'context.proposal.proposalVersion');
  equal(
    parseBudgetSourcePayload(proposal.payload),
    c.payload,
    'context.proposal.payload',
  );
  office(proposal.requestingOfficeId, 'context.proposal.requestingOfficeId');
  office(
    proposal.programmeOwnerOfficeId,
    'context.proposal.programmeOwnerOfficeId',
  );
  tag(
    proposal.classification,
    'ORDINARY_DEPARTMENTAL',
    'context.proposal.classification',
  );
  tag(proposal.funding, 'FULL_UNCONDITIONAL', 'context.proposal.funding');
  ref(proposal.purposeRef, 'context.proposal.purposeRef');
  if (c.payload.operation === 'SET_ENVELOPE')
    tag(
      proposal.requestingOfficeId,
      'FINANCE',
      'context.proposal.requestingOfficeId',
    );
  const policy = record(
    x.policy,
    [
      'policyRef',
      'policyRevision',
      'policyOwnerOfficeId',
      'proposalRef',
      'proposalVersion',
      'factsRef',
      'factsVersion',
      'applicability',
    ],
    'context.policy',
  );
  ref(policy.policyRef, 'context.policy.policyRef');
  ref(policy.policyRevision, 'context.policy.policyRevision');
  tag(
    policy.policyOwnerOfficeId,
    'FINANCE',
    'context.policy.policyOwnerOfficeId',
  );
  equal(policy.proposalRef, proposal.proposalRef, 'context.policy.proposalRef');
  equal(
    policy.proposalVersion,
    proposal.proposalVersion,
    'context.policy.proposalVersion',
  );
  ref(policy.factsRef, 'context.policy.factsRef');
  ref(policy.factsVersion, 'context.policy.factsVersion');
  const applicability = list(
    policy.applicability,
    'context.policy.applicability',
  ).map((value, i) => {
    const p = `context.policy.applicability.${i}`,
      a = record(value, ['officeId', 'status'], p);
    const id = office(a.officeId, `${p}.officeId`);
    tag(a.status, 'NOT_REQUIRED', `${p}.status`);
    return id;
  });
  setEqual(
    applicability,
    OFFICES.filter((o) => o !== 'FINANCE'),
    'context.policy.applicability',
  );
  const coverage = record(
    x.coverage,
    [
      'worldVersion',
      'eventSequence',
      'allocationCoverage',
      'slotCoverage',
      'envelopeRefs',
      'globalLineRefs',
      'allocationLineRefs',
    ],
    'context.coverage',
  );
  equal(coverage.worldVersion, s.worldVersion, 'context.coverage.worldVersion');
  equal(
    coverage.eventSequence,
    s.eventSequence,
    'context.coverage.eventSequence',
  );
  tag(
    coverage.allocationCoverage,
    'COMPLETE_TEST_FIXTURE',
    'context.coverage.allocationCoverage',
  );
  tag(
    coverage.slotCoverage,
    'COMPLETE_TEST_FIXTURE',
    'context.coverage.slotCoverage',
  );
  const refs = (v: unknown, p: string) =>
    list(v, p).map((r, i) => ref(r, `${p}.${i}`));
  setEqual(
    refs(coverage.envelopeRefs, 'context.coverage.envelopeRefs'),
    s.envelopes.map((e) => e.scope.envelopeRef),
    'context.coverage.envelopeRefs',
  );
  const globalLines = refs(
    coverage.globalLineRefs,
    'context.coverage.globalLineRefs',
  );
  unique(globalLines, 'context.coverage.globalLineRefs');
  for (const l of s.envelopes.flatMap((e) => e.lines))
    if (!globalLines.includes(l.lineRef))
      fail(
        'INCOMPLETE_GLOBAL_SLOT_COVERAGE',
        'context.coverage.globalLineRefs',
      );
  if (c.payload.lineRef !== null && globalLines.includes(c.payload.lineRef))
    fail('LINE_SLOT_OCCUPIED', 'payload.lineRef');
  const envelope = s.envelopes.find(
    (e) => e.scope.envelopeRef === c.payload.scope.envelopeRef,
  );
  setEqual(
    refs(coverage.allocationLineRefs, 'context.coverage.allocationLineRefs'),
    envelope?.lines.map((l) => l.lineRef) ?? [],
    'context.coverage.allocationLineRefs',
  );
  tag(
    x.origin,
    c.payload.operation === 'APPROVE_NEW_LINE'
      ? 'NEW_NO_IMPORTED_STATE_TEST_FIXTURE'
      : null,
    'context.origin',
  );
  const capacity = record(
    x.capacity,
    [
      'kind',
      'ruleRef',
      'ruleRevision',
      'proposalRef',
      'proposalVersion',
      'inputs',
      'comparisonRef',
      'evaluation',
    ],
    'context.capacity',
  );
  ref(capacity.ruleRef, 'context.capacity.ruleRef');
  ref(capacity.ruleRevision, 'context.capacity.ruleRevision');
  equal(
    capacity.proposalRef,
    proposal.proposalRef,
    'context.capacity.proposalRef',
  );
  equal(
    capacity.proposalVersion,
    proposal.proposalVersion,
    'context.capacity.proposalVersion',
  );
  let capacityTrace: ExactMoney | null = null;
  if (capacity.kind === 'TEST_ONLY_POLICY_NOT_APPLICABLE') {
    tag(capacity.inputs, null, 'context.capacity.inputs');
    tag(capacity.comparisonRef, null, 'context.capacity.comparisonRef');
    tag(capacity.evaluation, null, 'context.capacity.evaluation');
  } else {
    tag(
      capacity.kind,
      'TEST_ONLY_EXTERNAL_RULE_EVALUATED',
      'context.capacity.kind',
    );
    const inputs = record(
      capacity.inputs,
      ['cash', 'feasibleFinancing', 'mandatoryPayments', 'minimumBuffer'],
      'context.capacity.inputs',
    );
    capacityTrace = calculateAvailableFiscalCapacity({
      cash: exactMoney(inputs.cash, c.payload.currency, 'capacity.cash'),
      feasibleFinancing: exactMoney(
        inputs.feasibleFinancing,
        c.payload.currency,
        'capacity.feasibleFinancing',
      ),
      mandatoryPayments: exactMoney(
        inputs.mandatoryPayments,
        c.payload.currency,
        'capacity.mandatoryPayments',
      ),
      minimumBuffer: exactMoney(
        inputs.minimumBuffer,
        c.payload.currency,
        'capacity.minimumBuffer',
      ),
    });
    ref(capacity.comparisonRef, 'context.capacity.comparisonRef');
    tag(
      capacity.evaluation,
      'SATISFIED_TEST_FIXTURE',
      'context.capacity.evaluation',
    );
    // No new amount/capacity comparison is invented here. The fixture's named
    // external rule is conditional; this does not approve/admit that policy.
  }
  return {
    canonicalContext: canonicalSerialize(x),
    intentSimTime,
    capacityTrace,
  };
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function denial(error: unknown): BudgetDomainResult {
  if (error instanceof Invalid)
    return freeze({
      kind: 'DOMAIN_DENIED',
      semanticsOnly: true,
      code: error.code,
      path: error.path,
    });
  if (error instanceof DomainError)
    return freeze({
      kind: 'DOMAIN_DENIED',
      semanticsOnly: true,
      code: 'EXACT_ARITHMETIC_REJECTED',
      path: 'money',
    });
  throw error;
}

/** Pure conditional evaluation; never invokes an authorization/source callback. */
export function computeBudgetSourceDomain(input: unknown): BudgetDomainResult {
  try {
    const r = record(
      input,
      ['schemaVersion', 'command', 'context', 'state'],
      'evaluation',
    );
    tag(
      r.schemaVersion,
      BUDGET_DOMAIN_SCHEMAS.evaluation,
      'evaluation.schemaVersion',
    );
    const c = command(r.command),
      s = state(r.state);
    equal(s.worldId, c.worldId, 'state.worldId');
    const canonicalCommand = canonicalSerialize(c);
    const old = s.history.filter(
      (h) =>
        h.commandId === c.commandId || h.idempotencyKey === c.idempotencyKey,
    );
    if (old.length) {
      if (old.length !== 1 || old[0]?.canonicalCommand !== canonicalCommand)
        fail('IDEMPOTENCY_CONFLICT', 'command');
      // A semantic duplicate only. Actual authorized receipt recovery belongs
      // to the existing repository, before any new-effect source reapproval.
      return freeze({
        kind: 'CONDITIONAL_DOMAIN_DUPLICATE',
        semanticsOnly: true,
        eventIntents: [],
        nextState: s,
      });
    }
    equal(
      c.expectedWorldVersion,
      s.worldVersion,
      'command.expectedWorldVersion',
    );
    const x = context(r.context, c, s),
      p = c.payload;
    const envelopes = applyPayload(s.envelopes, p);
    const kinds: BudgetDomainIntent['kind'][] =
      p.operation === 'SET_ENVELOPE'
        ? ['BUDGET_ENVELOPE_SET']
        : [
            'BUDGET_LINE_CREATED',
            'BUDGET_APPROPRIATED',
            'BUDGET_LINE_INITIALIZED',
          ];
    const worldVersion = (BigInt(s.worldVersion) + 1n).toString();
    const eventIntents = kinds.map((kind, i): BudgetDomainIntent => ({
      schemaVersion: BUDGET_DOMAIN_SCHEMAS.intent,
      kind,
      commandId: c.commandId,
      canonicalCommand,
      canonicalContext: x.canonicalContext,
      worldVersion,
      sequence: (BigInt(s.eventSequence) + BigInt(i) + 1n).toString(),
      intentSimTime: x.intentSimTime,
    }));
    const nextState: BudgetDomainState = {
      ...s,
      worldVersion,
      eventSequence: (
        BigInt(s.eventSequence) + BigInt(kinds.length)
      ).toString(),
      envelopes,
      history: [
        ...s.history,
        {
          commandId: c.commandId,
          idempotencyKey: c.idempotencyKey,
          canonicalCommand,
        },
      ],
    };
    return freeze({
      kind: 'CONDITIONAL_DOMAIN_CHANGE',
      semanticsOnly: true,
      eventIntents,
      nextState,
      capacityTrace: x.capacityTrace,
    });
  } catch (error) {
    return denial(error);
  }
}

/**
 * Replay LOCAL fixtures from an explicit empty origin. No SQL, canonical
 * stored history reader, event admission or source-ready snapshot is supplied.
 * Only the named non-economic fixture is understood as unrelated; arbitrary
 * financial/payment/commitment events MUST NOT be silently skipped.
 */
export function replayBudgetSourceDomain(input: unknown):
  | Readonly<{
      kind: 'CONDITIONAL_DOMAIN_REPLAY';
      semanticsOnly: true;
      nextState: BudgetDomainState;
    }>
  | Extract<BudgetDomainResult, { kind: 'DOMAIN_DENIED' }> {
  try {
    const r = record(
      input,
      ['schemaVersion', 'worldId', 'steps', 'expectedHead'],
      'replay',
    );
    tag(r.schemaVersion, BUDGET_DOMAIN_SCHEMAS.replay, 'replay.schemaVersion');
    let s: BudgetDomainState = {
      schemaVersion: BUDGET_DOMAIN_SCHEMAS.state,
      worldId: id(r.worldId, 'replay.worldId', parseWorldId),
      worldVersion: '0',
      eventSequence: '0',
      envelopes: [],
      history: [],
    };
    for (const [i, raw] of list(r.steps, 'replay.steps').entries()) {
      const path = `replay.steps.${i}`;
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw))
        fail('EXPECTED_RECORD', path);
      const kind = (raw as Row).kind;
      if (kind === 'BUDGET_TEST_FIXTURE') {
        const step = record(
          raw,
          ['kind', 'command', 'context', 'eventIntents'],
          path,
        );
        const result = computeBudgetSourceDomain({
          schemaVersion: BUDGET_DOMAIN_SCHEMAS.evaluation,
          command: step.command,
          context: step.context,
          state: s,
        });
        if (result.kind === 'DOMAIN_DENIED')
          fail(result.code, `${path}.${result.path}`);
        if (result.kind !== 'CONDITIONAL_DOMAIN_CHANGE')
          fail('DUPLICATE_REPLAY_STEP', path);
        equal(step.eventIntents, result.eventIntents, `${path}.eventIntents`);
        s = result.nextState;
      } else {
        const step = unrelated(
          raw,
          s.worldId,
          s.worldVersion,
          s.eventSequence,
          path,
        );
        const commandId = ref(step.commandId, `${path}.commandId`),
          idempotencyKey = ref(step.idempotencyKey, `${path}.idempotencyKey`);
        if (
          s.history.some(
            (h) =>
              h.commandId === commandId || h.idempotencyKey === idempotencyKey,
          )
        )
          fail('DUPLICATE_REPLAY_STEP', path);
        const events = list(step.events, `${path}.events`);
        s = {
          ...s,
          worldVersion: (BigInt(s.worldVersion) + 1n).toString(),
          eventSequence: (
            BigInt(s.eventSequence) + BigInt(events.length)
          ).toString(),
          history: [
            ...s.history,
            {
              commandId,
              idempotencyKey,
              canonicalCommand: canonicalSerialize(step),
            },
          ],
        };
      }
    }
    const expected = record(
      r.expectedHead,
      ['worldVersion', 'eventSequence'],
      'replay.expectedHead',
    );
    equal(
      expected.worldVersion,
      s.worldVersion,
      'replay.expectedHead.worldVersion',
    );
    equal(
      expected.eventSequence,
      s.eventSequence,
      'replay.expectedHead.eventSequence',
    );
    return freeze({
      kind: 'CONDITIONAL_DOMAIN_REPLAY',
      semanticsOnly: true,
      nextState: s,
    });
  } catch (error) {
    const result = denial(error);
    if (result.kind === 'DOMAIN_DENIED') return result;
    throw error;
  }
}
