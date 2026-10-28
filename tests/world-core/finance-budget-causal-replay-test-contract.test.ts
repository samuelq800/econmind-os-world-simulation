import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  checkBudgetCausalReplayForTest,
  type BudgetCausalReplayTestResult,
} from '../../packages/core/src/commands/finance-budget-causal-replay-test-contract.js';
import {
  BUDGET_DOMAIN_SCHEMAS as schema,
  computeBudgetSourceDomain,
  replayBudgetSourceDomain,
  type BudgetDomainState,
} from '../../packages/core/src/commands/finance-budget-source-transition.js';
import {
  COMMAND_SCHEMA_VERSION,
  parseCanonicalCommand,
  type CanonicalCommand,
} from '../../packages/core/src/commands/command.js';
import {
  createAuthoritativeTransition,
  createFinalCommandReceipt,
  type AuthoritativeTransition,
  type FinalCommandReceipt,
} from '../../packages/core/src/commands/receipt.js';
import {
  EVENT_SCHEMA_VERSION,
  parseAuthoritativeEvent,
  type AuthoritativeEvent,
} from '../../packages/core/src/events/event.js';
import { SimTime } from '../../packages/core/src/numeric/sim-time.js';
import { canonicalSerialize } from '../../packages/core/src/serialization/canonical.js';
import { createManualOfficeCommandComposition } from '../../apps/world-worker/src/preparation/manual-office-command-composition.js';
import { parseCanonicalCommand as parseRuntimeCommand } from '@econmind/core';

// Every source/policy/approval/origin and COMMITTED receipt below is synthetic.
// These controls prove TEST_ONLY correspondence, never actual budget execution.
type Row = Record<string, unknown>;
type Frame = {
  command: CanonicalCommand;
  transition: AuthoritativeTransition;
  receipt: FinalCommandReceipt;
};
interface Fixture {
  schemaVersion: string;
  evidenceClass: string;
  replay: Row;
  frames: Frame[];
}
const WORLD = 'WORLD_TEST_BUDGET';
const ACTOR = 'ACTOR_TEST_FINANCE';
const AT = '2026-10-23T00:00:00.000Z';
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const row = (value: unknown) => value as Row;
const copy = <T>(value: T): T => structuredClone(value);
function at(value: unknown, path: string): Row {
  return path.split('.').reduce((r, key) => row(r[key]), row(value));
}
function set(value: unknown, path: string, replacement: unknown): void {
  const parts = path.split('.');
  const key = parts.pop()!;
  const parent = parts.length ? at(value, parts.join('.')) : row(value);
  parent[key] = replacement;
}
function empty(): BudgetDomainState {
  return {
    schemaVersion: schema.state,
    worldId: WORLD,
    worldVersion: '0',
    eventSequence: '0',
    envelopes: [],
    history: [],
  };
}
function budget(
  state: BudgetDomainState,
  index: number,
  amount: string,
  envelope = false,
) {
  const payload = {
    operation: envelope ? 'SET_ENVELOPE' : 'APPROVE_NEW_LINE',
    scope: {
      worldId: WORLD,
      countryId: 'COUNTRY_01',
      entityRef: 'GOV_TEST',
      envelopeRef: 'ENVELOPE_TEST',
      effectivePeriodRef: 'PERIOD_TEST',
    },
    currency: 'XZZ',
    amount,
    envelopeRevisionRef: 'ENVELOPE_REV_TEST',
    lineRef: envelope ? null : `LINE_TEST_${index}`,
    revisionRef: envelope ? 'ENVELOPE_REV_TEST' : `LINE_REV_TEST_${index}`,
    predecessorRevisionRef: null,
  };
  const command = {
    worldId: WORLD,
    countryId: 'COUNTRY_01',
    officeId: 'FINANCE',
    commandType: 'CORE_FINANCE_BUDGET_APPROPRIATION_V1',
    commandId: `CMD_TEST_${index}`,
    idempotencyKey: `KEY_TEST_${index}`,
    expectedWorldVersion: state.worldVersion,
    payload,
  };
  const context = {
    schemaVersion: schema.context,
    evidenceClass: 'TEST_ONLY',
    scope: copy(payload.scope),
    currency: 'XZZ',
    sourceRevision: 'SOURCE_REV_TEST',
    periodRevision: 'PERIOD_REV_TEST',
    intentSimTime: '10',
    authorization: {
      officeId: 'FINANCE',
      capability: 'FINANCE_BUDGET',
      actorRef: ACTOR,
      authorizationVersion: 'AUTH_REV_TEST',
    },
    proposal: {
      proposalRef: `PROPOSAL_TEST_${index}`,
      proposalVersion: 'PROPOSAL_REV_TEST',
      payload: copy(payload),
      requestingOfficeId: 'FINANCE',
      programmeOwnerOfficeId: 'FINANCE',
      classification: 'ORDINARY_DEPARTMENTAL',
      funding: 'FULL_UNCONDITIONAL',
      purposeRef: 'PURPOSE_TEST',
    },
    policy: {
      policyRef: 'POLICY_TEST',
      policyRevision: 'POLICY_REV_TEST',
      policyOwnerOfficeId: 'FINANCE',
      proposalRef: `PROPOSAL_TEST_${index}`,
      proposalVersion: 'PROPOSAL_REV_TEST',
      factsRef: 'FACTS_TEST',
      factsVersion: 'FACTS_REV_TEST',
      applicability: [
        'CAPTAIN',
        'CENTRAL_BANK',
        'INDUSTRY',
        'SOCIAL',
        'TRADE',
      ].map((officeId) => ({ officeId, status: 'NOT_REQUIRED' })),
    },
    coverage: {
      worldVersion: state.worldVersion,
      eventSequence: state.eventSequence,
      allocationCoverage: 'COMPLETE_TEST_FIXTURE',
      slotCoverage: 'COMPLETE_TEST_FIXTURE',
      envelopeRefs: state.envelopes.map((e) => e.scope.envelopeRef),
      globalLineRefs: state.envelopes.flatMap((e) =>
        e.lines.map((l) => l.lineRef),
      ),
      allocationLineRefs: state.envelopes[0]?.lines.map((l) => l.lineRef) ?? [],
    },
    origin: envelope ? null : 'NEW_NO_IMPORTED_STATE_TEST_FIXTURE',
    capacity: {
      kind: 'TEST_ONLY_POLICY_NOT_APPLICABLE',
      ruleRef: 'CAPACITY_RULE_TEST',
      ruleRevision: 'CAPACITY_REV_TEST',
      proposalRef: `PROPOSAL_TEST_${index}`,
      proposalVersion: 'PROPOSAL_REV_TEST',
      inputs: null,
      comparisonRef: null,
      evaluation: null,
    },
  };
  const result = computeBudgetSourceDomain({
    schemaVersion: schema.evaluation,
    command,
    context,
    state,
  });
  if (result.kind !== 'CONDITIONAL_DOMAIN_CHANGE')
    throw new Error(JSON.stringify(result));
  return {
    step: {
      kind: 'BUDGET_TEST_FIXTURE',
      command,
      context,
      eventIntents: copy(result.eventIntents),
    },
    state: result.nextState,
  };
}
function commandInput(command: CanonicalCommand): Row {
  return {
    schemaVersion: command.schemaVersion,
    worldId: command.worldId,
    actorId: command.actorId,
    authSubject: command.authSubject,
    countryId: command.countryId,
    officeId: command.officeId,
    commandType: command.commandType,
    commandId: command.commandId,
    idempotencyKey: command.idempotencyKey,
    expectedWorldVersion: command.expectedWorldVersion,
    simTime: command.simTime.toCanonicalValue(),
    correlationId: command.correlationId,
    submittedAtReal: command.submittedAtReal,
    payload: JSON.parse(command.canonicalPayload) as unknown,
  };
}
function eventInput(event: AuthoritativeEvent): Row {
  return {
    schemaVersion: event.schemaVersion,
    worldId: event.worldId,
    causationCommandId: event.causationCommandId,
    correlationId: event.correlationId,
    correctsEventId: event.correctsEventId,
    eventId: event.eventId,
    eventType: event.eventType,
    payload: JSON.parse(event.canonicalPayload) as unknown,
    recordedAtReal: event.recordedAtReal,
    sequence: event.sequence,
    simTime: event.simTime.toCanonicalValue(),
    worldVersion: event.worldVersion,
  };
}
function frameFor(step: Row, i: number): Frame {
  const isBudget = step.kind === 'BUDGET_TEST_FIXTURE';
  const c = isBudget ? row(step.command) : step;
  const command = parseCanonicalCommand(
    {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      worldId: WORLD,
      actorId: ACTOR,
      authSubject: '11111111-1111-4111-8111-111111111111',
      countryId: 'COUNTRY_01',
      officeId: isBudget ? 'FINANCE' : null,
      commandType: isBudget ? c.commandType : 'TEST_ONLY_NON_ECONOMIC_COMMAND',
      commandId: c.commandId,
      idempotencyKey: c.idempotencyKey,
      expectedWorldVersion: isBudget
        ? c.expectedWorldVersion
        : c.worldVersionBefore,
      simTime: '10',
      correlationId: `COR_TEST_${i}`,
      submittedAtReal: AT,
      payload: isBudget ? c.payload : { affectedBudgetLineRefs: [] },
    },
    sha,
  );
  const payloads = (isBudget ? step.eventIntents : step.events) as Row[];
  const events = payloads.map((payload, j) =>
    parseAuthoritativeEvent(
      {
        schemaVersion: EVENT_SCHEMA_VERSION,
        worldId: WORLD,
        causationCommandId: command.commandId,
        correlationId: command.correlationId,
        correctsEventId: null,
        eventId: `EVENT_TEST_${i}_${j}`,
        eventType: isBudget
          ? 'TEST_ONLY_BUDGET_DOMAIN_INTENT'
          : 'TEST_ONLY_NON_ECONOMIC_EVENT',
        payload: isBudget ? payload : { affectedBudgetLineRefs: [] },
        recordedAtReal: AT,
        sequence: payload.sequence,
        simTime: '10',
        worldVersion: (BigInt(command.expectedWorldVersion!) + 1n).toString(),
      },
      sha,
    ),
  );
  return framed(command, events);
}
function framed(
  command: CanonicalCommand,
  events: readonly AuthoritativeEvent[],
): Frame {
  const transition = createAuthoritativeTransition({
    command,
    worldVersionBefore: command.expectedWorldVersion!,
    worldVersionAfter: (BigInt(command.expectedWorldVersion!) + 1n).toString(),
    events,
  });
  return {
    command,
    transition,
    receipt: createFinalCommandReceipt({
      command,
      outcome: 'COMMITTED',
      reasonCode: null,
      transition,
      simTime: command.simTime,
      recordedAtReal: AT,
    }),
  };
}
function other(version: string, sequence: string, suffix: string): Row {
  return {
    kind: 'UNRELATED_TEST_FIXTURE',
    worldId: WORLD,
    worldVersionBefore: version,
    worldVersionAfter: (BigInt(version) + 1n).toString(),
    commandId: `CMD_OTHER_${suffix}`,
    idempotencyKey: `KEY_OTHER_${suffix}`,
    events: [
      {
        eventType: 'TEST_ONLY_NON_ECONOMIC_EVENT',
        sequence: (BigInt(sequence) + 1n).toString(),
        affectedBudgetLineRefs: [],
      },
    ],
  };
}
function fixture(trailing = false): Fixture {
  const cap = budget(empty(), 0, '100', true);
  const middle = other('1', '1', 'MIDDLE');
  const prefix = {
    schemaVersion: schema.replay,
    worldId: WORLD,
    steps: [cap.step, middle],
    expectedHead: { worldVersion: '2', eventSequence: '2' },
  };
  const replayed = replayBudgetSourceDomain(prefix);
  if (replayed.kind !== 'CONDITIONAL_DOMAIN_REPLAY')
    throw new Error(JSON.stringify(replayed));
  const first = budget(replayed.nextState, 2, '60');
  const second = budget(first.state, 3, '40');
  const steps: Row[] = [...prefix.steps, first.step, second.step];
  if (trailing) steps.push(other('4', '8', 'TRAILING'));
  return {
    schemaVersion: 'budget-causal-replay-test-v1',
    evidenceClass: 'TEST_ONLY',
    replay: {
      ...prefix,
      steps,
      expectedHead: {
        worldVersion: trailing ? '5' : '4',
        eventSequence: trailing ? '9' : '8',
      },
    },
    frames: steps.map(frameFor),
  };
}
function check(input: unknown): BudgetCausalReplayTestResult {
  const result = checkBudgetCausalReplayForTest(input, sha);
  expect(result).toMatchObject({
    evidenceClass: 'TEST_ONLY',
    semanticsOnly: true,
    productionAuthority: false,
    sourceAdmitted: false,
    runtimeConnected: false,
  });
  for (const key of [
    'nextState',
    'source',
    'receipt',
    'transition',
    'candidate',
    'permission',
    'outbox',
    'cache',
  ])
    expect(result).not.toHaveProperty(key);
  return result;
}
function denied(input: unknown, code?: string): void {
  const result = check(input);
  expect(result.kind).toBe('TEST_ONLY_BUDGET_CAUSAL_REPLAY_DENIED');
  if (result.kind !== 'TEST_ONLY_BUDGET_CAUSAL_REPLAY_DENIED')
    throw new Error('Expected denial');
  if (code) expect(result.code).toBe(code);
  expect(result.path.length).toBeGreaterThan(0);
}
function editEvent(input: Fixture, i: number, j: number, edit: Row): void {
  const frame = input.frames[i]!;
  const events = frame.transition.events.map((event, index) =>
    index === j
      ? parseAuthoritativeEvent({ ...eventInput(event), ...edit }, sha)
      : event,
  );
  input.frames[i] = framed(frame.command, events);
}

describe('TEST_ONLY budget canonical correspondence — no runtime authority', () => {
  it('FB-C01: binds cap100, unrelated and60+40 lines as4frames/8events', () => {
    const result = check(fixture());
    expect(result).toMatchObject({
      kind: 'TEST_ONLY_BUDGET_CAUSAL_REPLAY_MATCH',
      checkedCommandCount: 4,
      checkedEventCount: 8,
      head: { worldVersion: '4', eventSequence: '8' },
    });
    if (result.kind !== 'TEST_ONLY_BUDGET_CAUSAL_REPLAY_MATCH')
      throw new Error(JSON.stringify(result));
    expect(result.groups.map((g) => g.intentKinds)).toEqual([
      ['BUDGET_ENVELOPE_SET'],
      [],
      ['BUDGET_LINE_CREATED', 'BUDGET_APPROPRIATED', 'BUDGET_LINE_INITIALIZED'],
      ['BUDGET_LINE_CREATED', 'BUDGET_APPROPRIATED', 'BUDGET_LINE_INITIALIZED'],
    ]);
  });
  it('FB-C02: fresh actual Core objects and standard SHA replay identically', () => {
    const a = fixture(),
      b = fixture();
    expect(a.frames[0]!.command).not.toBe(b.frames[0]!.command);
    expect(check(a).kind).toBe('TEST_ONLY_BUDGET_CAUSAL_REPLAY_MATCH');
    expect(check(a)).toEqual(check(b));
  });
  it('FB-C03: retains the trailing unrelated global frontier', () => {
    expect(check(fixture(true))).toMatchObject({
      kind: 'TEST_ONLY_BUDGET_CAUSAL_REPLAY_MATCH',
      head: { worldVersion: '5', eventSequence: '9' },
      checkedCommandCount: 5,
      checkedEventCount: 9,
    });
  });
  it('FB-C04: explicit fixture zero origin only; omitted nonzero head denies', () => {
    const input = {
      schemaVersion: 'budget-causal-replay-test-v1',
      evidenceClass: 'TEST_ONLY',
      replay: {
        schemaVersion: schema.replay,
        worldId: WORLD,
        steps: [],
        expectedHead: { worldVersion: '0', eventSequence: '0' },
      },
      frames: [],
    };
    expect(check(input)).toMatchObject({
      kind: 'TEST_ONLY_BUDGET_CAUSAL_REPLAY_MATCH',
      checkedEventCount: 0,
    });
    input.replay.expectedHead.eventSequence = '1';
    denied(input);
  });
  it.each([
    null,
    {},
    'SOURCE_ADMITTED',
    'UNADMITTED_INERT_INPUT',
    'actual-source',
  ])('FB-C05: denies missing/actual evidence %s', (evidence) => {
    const input = fixture();
    set(input, 'evidenceClass', evidence);
    denied(input, 'TEST_EVIDENCE_CLASS_REQUIRED');
  });
  it.each([
    'missing discriminator',
    'unknown key',
    'missing frame field',
    'wrong schema',
    'non-array frames',
  ])('FB-C05: rejects %s', (variant) => {
    const input = fixture();
    if (variant === 'missing discriminator') delete row(input).evidenceClass;
    if (variant === 'unknown key') set(input, 'approved', true);
    if (variant === 'missing frame field') delete row(input.frames[0]).receipt;
    if (variant === 'wrong schema')
      input.schemaVersion = 'budget-real-source-v1';
    if (variant === 'non-array frames') set(input, 'frames', {});
    denied(input, 'TEST_CONTRACT_INVALID');
  });
  it.each([
    'fingerprint',
    'payloadHash',
    'canonicalPayload',
    'actorId',
    'countryId',
    'officeId',
    'commandType',
    'expectedWorldVersion',
  ])('FB-C06: rejects altered canonical Command %s', (field) => {
    const input = fixture();
    input.frames[0]!.command = {
      ...input.frames[0]!.command,
      [field]: field === 'canonicalPayload' ? '{}' : 'CHANGED_TEST',
    } as CanonicalCommand;
    denied(input);
  });
  it.each([
    'actorId',
    'simTime',
    'entityRef',
    'effectivePeriodRef',
    'currency',
    'amount',
    'idempotencyKey',
  ])('FB-C07: internally canonical but local mismatch %s', (field) => {
    const input = fixture(),
      frame = input.frames[2]!;
    const raw = commandInput(frame.command),
      payload = row(raw.payload);
    if (field === 'actorId') raw.actorId = 'OTHER_ACTOR_TEST';
    else if (field === 'simTime') raw.simTime = '11';
    else if (field === 'idempotencyKey') raw.idempotencyKey = 'OTHER_KEY_TEST';
    else if (field === 'entityRef' || field === 'effectivePeriodRef')
      row(payload.scope)[field] = 'OTHER_TEST';
    else payload[field] = field === 'amount' ? '59' : 'XXX';
    const command = parseCanonicalCommand(raw, sha);
    const events = frame.transition.events.map((e) =>
      parseAuthoritativeEvent(
        { ...eventInput(e), simTime: command.simTime.toCanonicalValue() },
        sha,
      ),
    );
    input.frames[2] = framed(command, events);
    denied(input, 'FRAME_BINDING_MISMATCH');
  });
  it.each(['missing', 'extra', 'reordered'])(
    'FB-C08: denies %s line Event group',
    (variant) => {
      const input = fixture(),
        frame = input.frames[2]!,
        original = frame.transition.events;
      const events =
        variant === 'missing'
          ? original.slice(0, 2)
          : variant === 'extra'
            ? [
                ...original,
                parseAuthoritativeEvent(
                  {
                    ...eventInput(original[2]!),
                    eventId: 'EXTRA_TEST_EVENT',
                    sequence: '6',
                  },
                  sha,
                ),
              ]
            : [...original].reverse();
      input.frames[2] = {
        ...frame,
        transition: {
          ...frame.transition,
          events,
          eventIds: events.map((e) => e.eventId),
        },
      };
      denied(input);
    },
  );
  it('FB-C08: duplicate Event identity across valid transitions denies', () => {
    const input = fixture();
    editEvent(input, 2, 0, {
      eventId: input.frames[0]!.transition.eventIds[0],
    });
    denied(input, 'IDENTITY_REUSED');
  });
  it.each([
    'payload',
    'correlationId',
    'correctsEventId',
    'simTime',
    'sequence',
    'worldVersion',
    'causationCommandId',
  ])('FB-C09: rejects canonical Event mismatch %s', (field) => {
    const input = fixture();
    const event = input.frames[0]!.transition.events[0]!;
    const edit = {
      [field]:
        field === 'payload'
          ? { changed: true }
          : field === 'simTime'
            ? '11'
            : field === 'sequence' || field === 'worldVersion'
              ? '2'
              : 'OTHER_TEST',
    };
    const changed = parseAuthoritativeEvent(
      { ...eventInput(event), ...edit },
      sha,
    );
    const frame = input.frames[0]!;
    input.frames[0] = {
      ...frame,
      transition: {
        ...frame.transition,
        events: [changed],
        eventIds: [changed.eventId],
      },
    };
    denied(input);
  });
  it('FB-C09: forged Event hash is not repaired from matching text', () => {
    const input = fixture(),
      frame = input.frames[0]!,
      event = frame.transition.events[0]!;
    input.frames[0] = {
      ...frame,
      transition: {
        ...frame.transition,
        events: [{ ...event, payloadHash: `sha256:${'0'.repeat(64)}` }],
      },
    };
    denied(input, 'CANONICAL_EVIDENCE_INVALID');
  });
  it.each([
    'outcome',
    'commandId',
    'idempotencyKey',
    'commandFingerprint',
    'eventIds',
    'worldVersionAfter',
    'simTime',
    'reasonCode',
    'recordedAtReal',
  ])('FB-C10: rejects receipt mismatch %s', (field) => {
    const input = fixture(),
      frame = input.frames[0]!;
    const value =
      field === 'outcome'
        ? 'REJECTED'
        : field === 'eventIds'
          ? []
          : field === 'simTime'
            ? SimTime.fromTicks('11')
            : field === 'worldVersionAfter'
              ? '2'
              : 'OTHER_TEST';
    frame.receipt = { ...frame.receipt, [field]: value } as FinalCommandReceipt;
    denied(input);
  });
  it('FB-C10: same Command but different key denies (strict AND)', () => {
    const input = fixture(),
      frame = input.frames[0]!;
    frame.receipt = {
      ...frame.receipt,
      idempotencyKey: input.frames[2]!.command.idempotencyKey,
    };
    denied(input, 'RECEIPT_BINDING_MISMATCH');
  });
  it.each(['first', 'middle', 'trailing', 'orphan'])(
    'FB-C11: denies omitted/orphan frame %s',
    (variant) => {
      const input = fixture(true);
      if (variant === 'orphan') input.frames.push(input.frames[0]!);
      else
        input.frames.splice(
          variant === 'first' ? 0 : variant === 'middle' ? 2 : 4,
          1,
        );
      denied(input, 'FRAME_COUNT_MISMATCH');
    },
  );
  it('FB-C11: changed global head and missing whole local transition deny', () => {
    const input = fixture();
    set(input, 'replay.expectedHead.eventSequence', '9');
    denied(input);
    const otherInput = fixture();
    (otherInput.replay.steps as Row[]).shift();
    otherInput.frames.shift();
    denied(otherInput);
  });
  it.each([
    'BUDGET_COMMITMENT_CREATED',
    'BUDGET_PAYMENT_SETTLED',
    'BUDGET_RESERVATION_CREATED',
    'UNKNOWN_ECONOMIC_EVENT',
  ])('FB-C12: never silently skips unrelated %s', (eventType) => {
    const input = fixture();
    editEvent(input, 1, 0, { eventType });
    denied(input, 'UNSUPPORTED_TEST_EVENT');
  });
  it('FB-C12: arbitrary canonical unrelated Command payload is denied', () => {
    const input = fixture(),
      frame = input.frames[1]!;
    const command = parseCanonicalCommand(
      {
        ...commandInput(frame.command),
        payload: { affectedBudgetLineRefs: [], cash: '100' },
      },
      sha,
    );
    input.frames[1] = framed(command, frame.transition.events);
    denied(input, 'UNSUPPORTED_TEST_EVENT');
  });
  it.each([
    'BUDGET_ENVELOPE_SET',
    'INDUSTRY_PRODUCTION_SETTLED',
    'BUDGET_APPROPRIATED',
  ])('FB-C13: no official-looking event wire %s', (eventType) => {
    const input = fixture();
    editEvent(input, 0, 0, { eventType });
    denied(input, 'UNSUPPORTED_TEST_EVENT');
  });
  it.each([
    ['cap exceeded', 'replay.steps.3.command.payload.amount', '41'],
    [
      'scope mismatch',
      'replay.steps.2.context.scope.effectivePeriodRef',
      'OTHER_PERIOD_TEST',
    ],
    ['missing origin', 'replay.steps.2.context.origin', null],
    [
      'incomplete coverage',
      'replay.steps.3.context.coverage.globalLineRefs',
      [],
    ],
    [
      'unsupported policy',
      'replay.steps.2.context.proposal.classification',
      'SPECIAL',
    ],
    [
      'unsupported approval',
      'replay.steps.2.context.policy.applicability.0.status',
      'APPROVED',
    ],
  ])('FB-C14: delegates domain denial %s', (_label, path, value) => {
    const input = fixture();
    set(input, String(path), value);
    if (path === 'replay.steps.3.command.payload.amount')
      set(input, 'replay.steps.3.context.proposal.payload.amount', value);
    const result = check(input);
    expect(result.kind).toBe('TEST_ONLY_BUDGET_CAUSAL_REPLAY_DENIED');
    if (result.kind === 'TEST_ONLY_BUDGET_CAUSAL_REPLAY_DENIED')
      expect(result.code).toMatch(/^DOMAIN_/u);
    if (
      _label === 'cap exceeded' &&
      result.kind === 'TEST_ONLY_BUDGET_CAUSAL_REPLAY_DENIED'
    )
      expect(result.code).toBe('DOMAIN_CAP_EXCEEDED');
  });
  it('FB-C15: local duplicate as a second canonical frame is no second approval', () => {
    const input = fixture();
    (input.replay.steps as Row[]).push(copy((input.replay.steps as Row[])[0]!));
    input.frames.push(input.frames[0]!);
    denied(input);
  });
  it('FB-C16: owns recursively immutable output without freezing caller inputs', () => {
    const input = fixture(),
      before = canonicalSerialize(input);
    const result = check(input);
    expect(result.kind).toBe('TEST_ONLY_BUDGET_CAUSAL_REPLAY_MATCH');
    expect(canonicalSerialize(input)).toBe(before);
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(input.frames)).toBe(false);
    expect(Object.isFrozen(at(input, 'replay.steps.0.context'))).toBe(false);
    if (result.kind !== 'TEST_ONLY_BUDGET_CAUSAL_REPLAY_MATCH')
      throw new Error('Expected match');
    const snapshot = JSON.stringify(result);
    set(input, 'replay.steps.0.context.authorization.actorRef', 'CHANGED_TEST');
    input.frames[0] = input.frames[1]!;
    expect(JSON.stringify(result)).toBe(snapshot);
    expect(Object.isFrozen(result.groups)).toBe(true);
    expect(Object.isFrozen(result.groups[0]!.eventIds)).toBe(true);
    expect(() => set(result, 'groups.0.eventIds.0', 'MUTATED_TEST')).toThrow();
    expect(() => set(result, 'head.eventSequence', '99')).toThrow();
  });
  it('FB-C17: test-only replay stays private and missing native budget custody still refuses', () => {
    const read = (path: string) =>
      readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
    for (const path of [
      'packages/core/src/index.ts',
      'packages/core/package.json',
      'apps/world-worker/src/preparation/manual-office-command-composition.ts',
      'apps/world-worker/src/preparation/durable-command-consumption.ts',
    ])
      expect(read(path)).not.toContain(
        'finance-budget-causal-replay-test-contract',
      );
    let databaseCalls = 0;
    const database = {
      async query() {
        databaseCalls++;
        throw Error('NOT_REACHED');
      },
      async transaction() {
        databaseCalls++;
        throw Error('NOT_REACHED');
      },
    };
    expect(
      createManualOfficeCommandComposition({
        command: parseRuntimeCommand(
          commandInput(fixture().frames[0]!.command),
          sha,
        ),
        database,
        workerId: 'WORKER_TEST_BUDGET_GUARD',
        sha256Hex: sha,
        readers: {},
      }),
    ).toBeNull();
    expect(databaseCalls).toBe(0);
    expect(
      read('apps/world-worker/src/preparation/durable-command-consumption.ts'),
    ).toContain(
      "return blocked('SOURCE_RUNTIME_UNAVAILABLE', command.commandId);",
    );
  });
});
