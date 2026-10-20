import { describe, expect, it } from 'vitest';
import {
  BUDGET_DOMAIN_SCHEMAS as schema,
  computeBudgetSourceDomain,
  parseBudgetSourcePayload,
  replayBudgetSourceDomain,
  type BudgetDomainState,
} from '../../packages/core/src/commands/finance-budget-source-transition.js';
import type { FiscalBudgetLineSnapshot } from '../../packages/core/src/engine-kernels/household-fiscal-closure.js';

// All IDs, roles, dates/periods and amounts are synthetic. A positive result
// tests conditional semantics, NOT real sources, grants, approvals or receipts.
type Row = Record<string, unknown>;
const row = (v: unknown) => v as Row;
const copy = <T>(v: T): T => structuredClone(v);
const at = (v: unknown, path: string): Row =>
  path.split('.').reduce((r, k) => row(r[k]), row(v));
const set = (v: unknown, path: string, value: unknown) => {
  const keys = path.split('.'),
    key = keys.pop();
  if (key === undefined) throw new Error('Test path missing');
  const parent = keys.length ? at(v, keys.join('.')) : row(v);
  parent[key] = value;
};
function empty(): BudgetDomainState {
  return {
    schemaVersion: schema.state,
    worldId: 'WORLD_TEST',
    worldVersion: '0',
    eventSequence: '0',
    envelopes: [],
    history: [],
  };
}
function fixture(
  operation: 'SET_ENVELOPE' | 'APPROVE_NEW_LINE',
  state: BudgetDomainState = empty(),
): Row {
  const payload = {
    operation,
    scope: {
      worldId: 'WORLD_TEST',
      countryId: 'COUNTRY_01',
      entityRef: 'GOV_TEST',
      envelopeRef: 'ENVELOPE_TEST',
      effectivePeriodRef: 'FUTURE_PERIOD_TEST',
    },
    currency: 'XAA',
    amount: operation === 'SET_ENVELOPE' ? '1000' : '125',
    envelopeRevisionRef: 'ENVELOPE_REV_TEST',
    lineRef: operation === 'SET_ENVELOPE' ? null : 'LINE_TEST',
    revisionRef:
      operation === 'SET_ENVELOPE' ? 'ENVELOPE_REV_TEST' : 'LINE_REV_TEST',
    predecessorRevisionRef: null,
  };
  const proposal = {
    proposalRef: 'PROPOSAL_TEST',
    proposalVersion: 'PROPOSAL_REV_TEST',
    payload: copy(payload),
    requestingOfficeId: 'FINANCE',
    programmeOwnerOfficeId: 'FINANCE',
    classification: 'ORDINARY_DEPARTMENTAL',
    funding: 'FULL_UNCONDITIONAL',
    purposeRef: 'PURPOSE_TEST',
  };
  return {
    schemaVersion: schema.evaluation,
    command: {
      worldId: 'WORLD_TEST',
      countryId: 'COUNTRY_01',
      officeId: 'FINANCE',
      commandType: 'CORE_FINANCE_BUDGET_APPROPRIATION_V1',
      commandId:
        operation === 'SET_ENVELOPE' ? 'CMD_CAP_TEST' : 'CMD_LINE_TEST',
      idempotencyKey:
        operation === 'SET_ENVELOPE' ? 'KEY_CAP_TEST' : 'KEY_LINE_TEST',
      expectedWorldVersion: state.worldVersion,
      payload,
    },
    context: {
      schemaVersion: schema.context,
      evidenceClass: 'TEST_ONLY',
      scope: copy(payload.scope),
      currency: 'XAA',
      sourceRevision: 'SOURCE_REV_TEST',
      periodRevision: 'PERIOD_REV_TEST',
      intentSimTime: '10',
      authorization: {
        officeId: 'FINANCE',
        capability: 'FINANCE_BUDGET',
        actorRef: 'ACTOR_TEST',
        authorizationVersion: 'AUTH_REV_TEST',
      },
      proposal,
      policy: {
        policyRef: 'POLICY_TEST',
        policyRevision: 'POLICY_REV_TEST',
        policyOwnerOfficeId: 'FINANCE',
        proposalRef: proposal.proposalRef,
        proposalVersion: proposal.proposalVersion,
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
        allocationLineRefs:
          state.envelopes
            .find((e) => e.scope.envelopeRef === 'ENVELOPE_TEST')
            ?.lines.map((l) => l.lineRef) ?? [],
      },
      origin:
        operation === 'SET_ENVELOPE'
          ? null
          : 'NEW_NO_IMPORTED_STATE_TEST_FIXTURE',
      capacity: {
        kind: 'TEST_ONLY_POLICY_NOT_APPLICABLE',
        ruleRef: 'CAPACITY_RULE_TEST',
        ruleRevision: 'CAPACITY_REV_TEST',
        proposalRef: proposal.proposalRef,
        proposalVersion: proposal.proposalVersion,
        inputs: null,
        comparisonRef: null,
        evaluation: null,
      },
    },
    state: copy(state),
  };
}
function success(input: unknown) {
  const result = computeBudgetSourceDomain(input);
  expect(result.kind).toBe('CONDITIONAL_DOMAIN_CHANGE');
  if (result.kind !== 'CONDITIONAL_DOMAIN_CHANGE')
    throw new Error(JSON.stringify(result));
  return result;
}
function envelope(): BudgetDomainState {
  return success(fixture('SET_ENVELOPE')).nextState;
}
function lineFixture(): Row {
  return fixture('APPROVE_NEW_LINE', envelope());
}
function syncPayload(input: Row): void {
  const payload = at(input, 'command').payload;
  at(input, 'context.proposal').payload = copy(payload);
}
function denied(input: unknown, code?: string): void {
  const r = computeBudgetSourceDomain(input);
  expect(r.kind).toBe('DOMAIN_DENIED');
  if (code) expect(r).toMatchObject({ code });
  expect(r).not.toHaveProperty('nextState');
  expect(r).not.toHaveProperty('eventIntents');
}
function step(input: Row): Row {
  const r = success(input);
  return {
    kind: 'BUDGET_TEST_FIXTURE',
    command: copy(input.command),
    context: copy(input.context),
    eventIntents: copy(r.eventIntents),
  };
}
function transcript(): Row {
  const cap = fixture('SET_ENVELOPE');
  const unrelated = {
    kind: 'UNRELATED_TEST_FIXTURE',
    worldId: 'WORLD_TEST',
    worldVersionBefore: '1',
    worldVersionAfter: '2',
    commandId: 'CMD_OTHER_TEST',
    idempotencyKey: 'KEY_OTHER_TEST',
    events: [
      {
        eventType: 'TEST_ONLY_NON_ECONOMIC_EVENT',
        sequence: '2',
        affectedBudgetLineRefs: [],
      },
    ],
  };
  const prefix = {
    schemaVersion: schema.replay,
    worldId: 'WORLD_TEST',
    steps: [step(cap), unrelated],
    expectedHead: { worldVersion: '2', eventSequence: '2' },
  };
  const r = replayBudgetSourceDomain(prefix);
  if (r.kind !== 'CONDITIONAL_DOMAIN_REPLAY')
    throw new Error(JSON.stringify(r));
  const line = fixture('APPROVE_NEW_LINE', r.nextState);
  return {
    ...prefix,
    steps: [...(row(prefix).steps as unknown[]), step(line)],
    expectedHead: { worldVersion: '3', eventSequence: '5' },
  };
}

describe('TEST_ONLY budget domain — no runtime authority', () => {
  it('freezes local schemas, not a stored wire or installed family', () => {
    expect(schema).toEqual({
      evaluation: 'budget-domain-evaluation-v1',
      context: 'budget-domain-context-v1',
      state: 'budget-domain-state-v1',
      intent: 'budget-domain-intent-v1',
      replay: 'budget-domain-replay-v1',
    });
    expect(Object.isFrozen(schema)).toBe(true);
  });
  it('strictly parses the existing eight-key payload and five-key scope', () => {
    const p = parseBudgetSourcePayload(
      at(fixture('SET_ENVELOPE'), 'command').payload,
    );
    expect(Object.keys(p).sort()).toEqual(
      [
        'operation',
        'scope',
        'currency',
        'amount',
        'envelopeRevisionRef',
        'lineRef',
        'revisionRef',
        'predecessorRevisionRef',
      ].sort(),
    );
    expect(Object.keys(p.scope).sort()).toEqual(
      [
        'worldId',
        'countryId',
        'entityRef',
        'envelopeRef',
        'effectivePeriodRef',
      ].sort(),
    );
  });
  it('conditionally sets a fresh cap without cash/postings/receipt', () => {
    const r = success(fixture('SET_ENVELOPE'));
    expect(r.eventIntents.map((e) => e.kind)).toEqual(['BUDGET_ENVELOPE_SET']);
    expect(r.nextState).toMatchObject({
      worldVersion: '1',
      eventSequence: '1',
      envelopes: [{ cap: '1000', currency: 'XAA', lines: [] }],
    });
    expect(Object.keys(r).sort()).toEqual(
      [
        'kind',
        'semanticsOnly',
        'eventIntents',
        'nextState',
        'capacityTrace',
      ].sort(),
    );
    expect(r).not.toHaveProperty('receipt');
    expect(r).not.toHaveProperty('sourceReady');
  });
  it('conditionally creates one line with a complete ordered three-intent group', () => {
    const r = success(lineFixture());
    expect(
      r.eventIntents.map((e) => [
        e.kind,
        e.sequence,
        e.worldVersion,
        e.intentSimTime,
      ]),
    ).toEqual([
      ['BUDGET_LINE_CREATED', '2', '2', '10'],
      ['BUDGET_APPROPRIATED', '3', '2', '10'],
      ['BUDGET_LINE_INITIALIZED', '4', '2', '10'],
    ]);
    expect(r.nextState.envelopes[0]?.lines[0]).toMatchObject({
      appropriation: { amount: '125', currency: 'XAA' },
      initialPaid: '0',
      initialOutstanding: '0',
      initialReserved: '0',
      commitmentHeadRef: null,
      committed: [],
    });
  });
  it('preserves requesting/programme owner separately from fiscal owner and signer', () => {
    const input = lineFixture();
    set(input, 'context.proposal.requestingOfficeId', 'INDUSTRY');
    set(input, 'context.proposal.programmeOwnerOfficeId', 'INDUSTRY');
    const r = success(input),
      context = JSON.parse(r.eventIntents[0]?.canonicalContext ?? 'null');
    expect(context.proposal.programmeOwnerOfficeId).toBe('INDUSTRY');
    expect(context.policy.policyOwnerOfficeId).toBe('FINANCE');
    expect(context.authorization.officeId).toBe('FINANCE');
    expect(context.scope.entityRef).toBe('GOV_TEST');
  });
  it('keeps the existing five-field fiscal snapshot projection shape only', () => {
    const line = success(lineFixture()).nextState.envelopes[0]?.lines[0];
    if (!line) throw new Error('No test line');
    const snapshot: FiscalBudgetLineSnapshot = {
      budgetLineRef: line.lineRef,
      lineage: {
        sourceRef: 'TEST_ONLY',
        sourceVersion: 'TEST_ONLY',
        snapshotRef: 'TEST_ONLY',
        snapshotHash: 'TEST_ONLY',
        predecessorSnapshotHash: null,
      },
      appropriation: line.appropriation,
      commitmentHeadRef: line.commitmentHeadRef,
      committed: line.committed,
    };
    expect(Object.keys(snapshot).sort()).toEqual(
      [
        'budgetLineRef',
        'lineage',
        'appropriation',
        'commitmentHeadRef',
        'committed',
      ].sort(),
    );
    expect(snapshot).not.toHaveProperty('paid');
    expect(snapshot).not.toHaveProperty('cash');
  });
  it('does not mutate or freeze supplied input; returned structures are immutable', () => {
    const input = lineFixture(),
      before = JSON.stringify(input),
      r = success(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(Object.isFrozen(input)).toBe(false);
    expect(
      Object.isFrozen(r.nextState.envelopes[0]?.lines[0]?.appropriation),
    ).toBe(true);
    expect(Object.isFrozen(r.eventIntents[0])).toBe(true);
  });

  it.each([
    ['null context', 'context', null],
    ['absent source revision', 'context.sourceRevision', null],
    ['non-test evidence', 'context.evidenceClass', 'ACTUAL_SOURCE'],
    [
      'wrong context version',
      'context.schemaVersion',
      'budget-domain-context-v2',
    ],
    ['unknown payload trust', 'command.payload.trusted', true],
    ['caller hash', 'command.payload.sourceHash', 'sha256:fake'],
    ['caller approval', 'command.payload.approved', true],
    ['wrong office', 'command.officeId', 'INDUSTRY'],
    ['wrong family', 'command.commandType', 'CORE_OTHER'],
    [
      'wrong capability',
      'context.authorization.capability',
      'FINANCE_TREASURY',
    ],
    [
      'missing grant revision',
      'context.authorization.authorizationVersion',
      null,
    ],
    ['outer world mismatch', 'command.worldId', 'WORLD_OTHER'],
    ['outer country mismatch', 'command.countryId', 'COUNTRY_02'],
    [
      'context period mismatch',
      'context.scope.effectivePeriodRef',
      'PERIOD_OTHER',
    ],
    ['source currency mismatch', 'context.currency', 'GCU'],
    ['stale expected head', 'command.expectedWorldVersion', '0'],
    ['stale source head', 'context.coverage.worldVersion', '0'],
    ['stale source cursor', 'context.coverage.eventSequence', '0'],
    ['missing period revision', 'context.periodRevision', null],
    ['missing policy facts', 'context.policy.factsRef', null],
    ['unknown owner', 'context.proposal.programmeOwnerOfficeId', 'UNKNOWN'],
    ['wrong policy proposal', 'context.policy.proposalRef', 'OTHER_PROPOSAL'],
    [
      'wrong policy revision binding',
      'context.policy.proposalVersion',
      'OTHER_REV',
    ],
    ['partial funding', 'context.proposal.funding', 'PARTIAL'],
    ['conditional funding', 'context.proposal.funding', 'CONDITIONAL'],
    ['project proposal', 'context.proposal.classification', 'PROJECT'],
    ['Captain required', 'context.policy.applicability.0.status', 'REQUIRED'],
    ['Captain unknown', 'context.policy.applicability.0.status', 'UNKNOWN'],
    [
      'other office required',
      'context.policy.applicability.2.status',
      'REQUIRED',
    ],
    ['incomplete allocation', 'context.coverage.allocationCoverage', 'UNKNOWN'],
    ['incomplete slots', 'context.coverage.slotCoverage', 'UNKNOWN'],
    ['imported origin', 'context.origin', 'IMPORTED'],
    ['missing capacity policy', 'context.capacity', null],
    ['wrong capacity proposal', 'context.capacity.proposalRef', 'OTHER'],
    [
      'unsupported predecessor',
      'command.payload.predecessorRevisionRef',
      'OLDER_REV',
    ],
    ['new scope field', 'command.payload.scope.approved', true],
  ])('denies %s', (name, path, value) => {
    void name;
    const input = lineFixture();
    set(input, path, value);
    denied(input);
  });

  it.each([
    '-1',
    '-0',
    '1.0',
    '1.2300',
    '1e2',
    'NaN',
    'Infinity',
    '01',
    '0.000',
    1,
    null,
    '9'.repeat(121),
  ])('rejects noncanonical/out-of-domain amount %s', (amount) => {
    const input = lineFixture();
    set(input, 'command.payload.amount', amount);
    syncPayload(input);
    denied(input);
  });
  it.each(['0', '0.000000000000000001', '1000'])(
    'keeps exact native canonical amount %s',
    (amount) => {
      const input = lineFixture();
      set(input, 'command.payload.amount', amount);
      syncPayload(input);
      expect(
        success(input).nextState.envelopes[0]?.lines[0]?.appropriation.amount,
      ).toBe(amount);
    },
  );
  it('rejects the smallest exact amount above the envelope cap', () => {
    const input = lineFixture();
    set(input, 'command.payload.amount', '1000.000000000000000001');
    syncPayload(input);
    denied(input, 'CAP_EXCEEDED');
  });
  it('includes all previous allocations in a subsequent line decision', () => {
    const first = success(lineFixture()).nextState;
    const second = fixture('APPROVE_NEW_LINE', first);
    set(second, 'command.commandId', 'CMD_SECOND');
    set(second, 'command.idempotencyKey', 'KEY_SECOND');
    set(second, 'command.payload.lineRef', 'LINE_SECOND');
    set(second, 'command.payload.revisionRef', 'REV_SECOND');
    set(second, 'command.payload.amount', '875');
    syncPayload(second);
    expect(success(second).nextState.envelopes[0]?.lines).toHaveLength(2);
    set(second, 'command.payload.amount', '875.000000000000000001');
    syncPayload(second);
    denied(second, 'CAP_EXCEEDED');
    set(second, 'context.coverage.allocationLineRefs', []);
    denied(second, 'BINDING_MISMATCH');
  });
  it('rejects a globally occupied line even outside the current envelope', () => {
    const input = lineFixture();
    set(input, 'context.coverage.globalLineRefs', ['LINE_TEST']);
    denied(input, 'LINE_SLOT_OCCUPIED');
  });
  it('rejects duplicate/incomplete applicability rather than assuming other offices irrelevant', () => {
    const input = lineFixture();
    set(input, 'context.policy.applicability', [
      { officeId: 'CAPTAIN', status: 'NOT_REQUIRED' },
    ]);
    denied(input);
    set(
      input,
      'context.policy.applicability',
      Array.from({ length: 5 }, () => ({
        officeId: 'CAPTAIN',
        status: 'NOT_REQUIRED',
      })),
    );
    denied(input, 'DUPLICATE_IDENTITY');
  });
  it('rejects envelope reuse, stale revision, identity collision and malformed SET tuple', () => {
    denied(fixture('SET_ENVELOPE', envelope()), 'IDEMPOTENCY_CONFLICT');
    const reused = fixture('SET_ENVELOPE', envelope());
    set(reused, 'command.commandId', 'NEW_CAP');
    set(reused, 'command.idempotencyKey', 'NEW_CAP_KEY');
    set(reused, 'command.payload.revisionRef', 'NEW_CAP_REV');
    set(reused, 'command.payload.envelopeRevisionRef', 'NEW_CAP_REV');
    syncPayload(reused);
    denied(reused, 'ENVELOPE_SLOT_OCCUPIED');
    const input = lineFixture();
    set(input, 'command.payload.envelopeRevisionRef', 'STALE_REV');
    syncPayload(input);
    denied(input, 'BINDING_MISMATCH');
    set(input, 'command.payload.envelopeRevisionRef', 'ENVELOPE_REV_TEST');
    set(input, 'command.payload.revisionRef', 'ENVELOPE_REV_TEST');
    syncPayload(input);
    denied(input, 'REVISION_SLOT_OCCUPIED');
    const malformed = fixture('SET_ENVELOPE');
    set(malformed, 'command.payload.lineRef', 'LINE_TEST');
    denied(malformed);
  });
  it('returns a semantic exact duplicate without source reapproval or new intentions', () => {
    const input = lineFixture(),
      first = success(input);
    input.state = first.nextState;
    input.context = null;
    const retry = computeBudgetSourceDomain(input);
    expect(retry).toMatchObject({
      kind: 'CONDITIONAL_DOMAIN_DUPLICATE',
      eventIntents: [],
      nextState: first.nextState,
    });
    set(input, 'command.payload.amount', '126');
    denied(input, 'IDEMPOTENCY_CONFLICT');
  });
  it('rejects changed identity under the same key', () => {
    const input = lineFixture(),
      first = success(input);
    input.state = first.nextState;
    set(input, 'command.commandId', 'CMD_DIFFERENT');
    denied(input, 'IDEMPOTENCY_CONFLICT');
  });
  it('computes existing capacity math without inventing a comparison or clamping', () => {
    const input = lineFixture();
    set(input, 'context.capacity.kind', 'TEST_ONLY_EXTERNAL_RULE_EVALUATED');
    set(input, 'context.capacity.inputs', {
      cash: { amount: '1', currency: 'XAA' },
      feasibleFinancing: { amount: '2', currency: 'XAA' },
      mandatoryPayments: { amount: '4', currency: 'XAA' },
      minimumBuffer: { amount: '5', currency: 'XAA' },
    });
    set(input, 'context.capacity.comparisonRef', 'EXTERNAL_COMPARISON_TEST');
    set(input, 'context.capacity.evaluation', 'SATISFIED_TEST_FIXTURE');
    // A named external test rule may encode stage-specific semantics. This is
    // not proof a negative fiscal capacity permits a real appropriation.
    expect(success(input).capacityTrace).toEqual({
      amount: '-6',
      currency: 'XAA',
    });
    set(input, 'context.capacity.inputs.cash', null);
    denied(input);
  });
  it('rejects unknown/unsatisfied capacity or incomplete same-currency inputs', () => {
    const input = lineFixture();
    set(input, 'context.capacity.kind', 'UNKNOWN');
    denied(input);
    set(input, 'context.capacity.kind', 'TEST_ONLY_EXTERNAL_RULE_EVALUATED');
    set(input, 'context.capacity.inputs', {
      cash: { amount: '0', currency: 'XAA' },
      feasibleFinancing: { amount: '0', currency: 'XAA' },
      mandatoryPayments: { amount: '0', currency: 'XAA' },
      minimumBuffer: { amount: '0', currency: 'GCU' },
    });
    set(input, 'context.capacity.comparisonRef', 'CMP_TEST');
    set(input, 'context.capacity.evaluation', 'SATISFIED_TEST_FIXTURE');
    denied(input);
    set(input, 'context.capacity.inputs.minimumBuffer.currency', 'XAA');
    set(input, 'context.capacity.evaluation', 'UNSATISFIED_TEST_FIXTURE');
    denied(input);
  });
  it.each([
    ['lowercase World', 'command.worldId', 'world_test'],
    ['noncanonical command identity', 'command.commandId', 'Command.test'],
    ['noncanonical idempotency key', 'command.idempotencyKey', 'key.test'],
    ['unsupported amendment', 'command.payload.operation', 'AMEND'],
  ])('rejects %s', (name, path, value) => {
    void name;
    const input = lineFixture();
    set(input, path, value);
    denied(input);
  });
  it('rejects an omitted line even if supplied allocation/slot labels claim complete', () => {
    const input = fixture(
      'APPROVE_NEW_LINE',
      copy(success(lineFixture()).nextState),
    );
    set(input, 'command.commandId', 'NEXT_CMD');
    set(input, 'command.idempotencyKey', 'NEXT_KEY');
    set(input, 'command.payload.lineRef', 'NEXT_LINE');
    set(input, 'command.payload.revisionRef', 'NEXT_REV');
    syncPayload(input);
    set(input, 'state.envelopes.0.lines', []);
    set(input, 'context.coverage.globalLineRefs', []);
    set(input, 'context.coverage.allocationLineRefs', []);
    denied(input, 'BINDING_MISMATCH');
  });
  it.each([
    ['omitted history', 'state.history', []],
    ['invented cap', 'state.envelopes.0.cap', '1001'],
    [
      'wrong history command identity',
      'state.history.0.commandId',
      'OTHER_CMD',
    ],
    ['malformed history text', 'state.history.0.canonicalCommand', 'not-json'],
    ['wrong whole cursor', 'state.eventSequence', '9'],
  ])('denies %s', (name, path, value) => {
    void name;
    const input = lineFixture();
    set(input, path, value);
    denied(input);
  });
  it('denies unsupported commitment history instead of retaining empty commitments', () => {
    const current = success(lineFixture()).nextState,
      input = fixture('APPROVE_NEW_LINE', copy(current));
    set(input, 'state.envelopes.0.lines.0.committed', [
      { amount: { amount: '1', currency: 'XAA' } },
    ]);
    denied(input, 'UNSUPPORTED_COMMITMENT_HISTORY');
  });
});

describe('TEST_ONLY whole-cursor pure replay', () => {
  for (const onlyUnrelated of [false, true]) {
    const inputForWorld = (worldId: string) => ({
      schemaVersion: schema.replay,
      worldId,
      steps: onlyUnrelated
        ? [
            {
              kind: 'UNRELATED_TEST_FIXTURE',
              worldId,
              worldVersionBefore: '0',
              worldVersionAfter: '1',
              commandId: 'OTHER_WORLD_TEST',
              idempotencyKey: 'OTHER_WORLD_KEY_TEST',
              events: [
                {
                  eventType: 'TEST_ONLY_NON_ECONOMIC_EVENT',
                  sequence: '1',
                  affectedBudgetLineRefs: [],
                },
              ],
            },
          ]
        : [],
      expectedHead: {
        worldVersion: onlyUnrelated ? '1' : '0',
        eventSequence: onlyUnrelated ? '1' : '0',
      },
    });
    it(`rejects noncanonical WorldId with onlyUnrelated=${onlyUnrelated}`, () => {
      expect(replayBudgetSourceDomain(inputForWorld('world_test'))).toEqual({
        kind: 'DOMAIN_DENIED',
        semanticsOnly: true,
        code: 'INVALID_IDENTIFIER',
        path: 'replay.worldId',
      });
    });
    it(`accepts canonical WorldId control with onlyUnrelated=${onlyUnrelated}`, () => {
      expect(
        replayBudgetSourceDomain(inputForWorld('WORLD_TEST')),
      ).toMatchObject({
        kind: 'CONDITIONAL_DOMAIN_REPLAY',
        nextState: { worldId: 'WORLD_TEST' },
      });
    });
  }
  it('replays envelope, unrelated World step and line; last budget event need not be head', () => {
    const input = transcript(),
      r = replayBudgetSourceDomain(input);
    expect(r.kind).toBe('CONDITIONAL_DOMAIN_REPLAY');
    if (r.kind !== 'CONDITIONAL_DOMAIN_REPLAY')
      throw new Error(JSON.stringify(r));
    expect(r.nextState).toMatchObject({
      worldVersion: '3',
      eventSequence: '5',
    });
    expect(r.nextState.envelopes[0]?.lines).toHaveLength(1);
    expect(replayBudgetSourceDomain(copy(input))).toEqual(r);
    row(input).steps = [
      ...(row(input).steps as unknown[]),
      {
        kind: 'UNRELATED_TEST_FIXTURE',
        worldId: 'WORLD_TEST',
        worldVersionBefore: '3',
        worldVersionAfter: '4',
        commandId: 'OTHER_2',
        idempotencyKey: 'OTHER_KEY_2',
        events: [
          {
            eventType: 'TEST_ONLY_NON_ECONOMIC_EVENT',
            sequence: '6',
            affectedBudgetLineRefs: [],
          },
        ],
      },
    ];
    input.expectedHead = { worldVersion: '4', eventSequence: '6' };
    expect(replayBudgetSourceDomain(input)).toMatchObject({
      kind: 'CONDITIONAL_DOMAIN_REPLAY',
      nextState: { worldVersion: '4', eventSequence: '6' },
    });
  });
  it.each([
    ['unknown replay version', 'schemaVersion', 'budget-domain-replay-v2'],
    ['omitted whole cursor', 'expectedHead.eventSequence', '6'],
    ['unrelated version gap', 'steps.1.worldVersionBefore', '0'],
    ['unrelated sequence gap', 'steps.1.events.0.sequence', '8'],
    [
      'unknown relevant mutation',
      'steps.1.events.0.eventType',
      'BUDGET_COMMITMENT_CREATED',
    ],
    [
      'payment mutation',
      'steps.1.events.0.eventType',
      'TREASURY_PAYMENT_SETTLED',
    ],
    [
      'unknown event classified unrelated',
      'steps.1.events.0.eventType',
      'SOMETHING_NEW',
    ],
    [
      'relevant affected line',
      'steps.1.events.0.affectedBudgetLineRefs',
      ['LINE_TEST'],
    ],
    [
      'unknown event intent schema',
      'steps.2.eventIntents.0.schemaVersion',
      'budget-domain-intent-v2',
    ],
    ['wrong event order', 'steps.2.eventIntents.0.kind', 'BUDGET_APPROPRIATED'],
    ['wrong event command', 'steps.2.eventIntents.0.commandId', 'CMD_OTHER'],
    ['wrong event sequence', 'steps.2.eventIntents.1.sequence', '99'],
    ['wrong event context', 'steps.2.eventIntents.1.canonicalContext', '{}'],
    ['wrong event World version', 'steps.2.eventIntents.1.worldVersion', '9'],
    ['unknown event field', 'steps.2.eventIntents.0.approved', true],
    ['lost context', 'steps.2.context', null],
  ])('denies %s', (name, path, value) => {
    void name;
    const input = transcript();
    set(input, path, value);
    expect(replayBudgetSourceDomain(input).kind).toBe('DOMAIN_DENIED');
  });
  it('rejects omitted/duplicated event in a budget group', () => {
    const input = transcript(),
      events = at(input, 'steps.2').eventIntents as unknown[];
    events.pop();
    expect(replayBudgetSourceDomain(input).kind).toBe('DOMAIN_DENIED');
    const other = transcript(),
      group = at(other, 'steps.2').eventIntents as unknown[];
    group.push(copy(group[0]));
    expect(replayBudgetSourceDomain(other).kind).toBe('DOMAIN_DENIED');
  });
  it('rejects duplicated transitions, not a second approval', () => {
    const input = transcript(),
      steps = row(input).steps as unknown[];
    steps.push(copy(steps[2]));
    expect(replayBudgetSourceDomain(input)).toMatchObject({
      kind: 'DOMAIN_DENIED',
      code: 'DUPLICATE_REPLAY_STEP',
    });
  });
  it('rejects omitted first budget transition even when cache/state is absent', () => {
    const input = transcript();
    (row(input).steps as unknown[]).shift();
    expect(replayBudgetSourceDomain(input).kind).toBe('DOMAIN_DENIED');
  });
});
