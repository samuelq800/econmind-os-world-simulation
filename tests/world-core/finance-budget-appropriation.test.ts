import { describe, expect, it } from 'vitest';
import {
  BUDGET_INERT_FLAGS,
  checkBudgetAppropriationHistory,
  planBudgetAppropriation,
} from '../../packages/core/src/commands/finance-budget-appropriation.js';
import { checkBudgetAppropriationCarrier } from '../../apps/world-worker/src/persistence/finance-budget-appropriation-source-contract.js';

type Row = Record<string, unknown>;
const row = (value: unknown) => value as Row;
const copy = <T>(value: T): T => structuredClone(value);
function at(input: Row, path: string): Row {
  return path
    .split('.')
    .reduce<Row>((current, key) => row(current[key]), input);
}
function sync(input: Row): Row {
  const i = at(input, 'intent'),
    p = row(i.payload),
    s = row(p.scope),
    c = at(input, 'context');
  const declarations: [string, string, unknown, unknown][] = [
    [
      'identity',
      'IDENTITY',
      p.lineRef ?? s.envelopeRef,
      row(c.identity).revision,
    ],
    ['period', 'PERIOD', s.effectivePeriodRef, row(c.period).revision],
    ['policy', 'APPROVAL_RULE', row(c.policy).ruleRef, row(c.policy).revision],
    ['approval', 'APPROVAL_SET', row(c.approval).setRef, p.revisionRef],
    [
      'allocation',
      'ALLOCATION_RULE',
      row(c.allocation).ruleRef,
      row(c.allocation).revision,
    ],
    ['slots', 'EMPTY_SET', p.lineRef ?? s.envelopeRef, row(c.slots).revision],
  ];
  if (c.envelope !== null)
    declarations.push([
      'envelope',
      'ENVELOPE',
      s.envelopeRef,
      p.envelopeRevisionRef,
    ]);
  if (c.origin !== null)
    declarations.push([
      'origin',
      'LEGACY_DISPOSITION',
      p.lineRef,
      row(c.origin).revision,
    ]);
  row(c.source).records = declarations.map(
    ([key, kind, subjectRef, subjectRevision]) => {
      const declaration = row(c[key]);
      return {
        ref: declaration.sourceRef,
        kind,
        subjectRef,
        subjectRevision,
        binding: copy(p),
        head: copy(i.expectedHead),
        declaration: Object.fromEntries(
          Object.entries(copy(declaration)).filter(([k]) => k !== 'sourceRef'),
        ),
      };
    },
  );
  return input;
}
function fixture(
  operation: 'SET_ENVELOPE' | 'APPROVE_NEW_LINE' = 'APPROVE_NEW_LINE',
): Row {
  const scope = {
    worldId: 'WORLD_A',
    countryId: 'COUNTRY_A',
    entityRef: 'ENTITY_A',
    envelopeRef: 'ENVELOPE_A',
    effectivePeriodRef: 'PERIOD_A',
  };
  const payload = {
    operation,
    scope,
    currency: 'GCU',
    amount: '25.5',
    envelopeRevisionRef: 'ENVELOPE_V1',
    lineRef: operation === 'SET_ENVELOPE' ? null : 'LINE_A',
    revisionRef:
      operation === 'SET_ENVELOPE' ? 'ENVELOPE_V1' : 'APPROPRIATION_V1',
    predecessorRevisionRef: null,
  };
  const intent = {
    schemaVersion: 'inert-budget-intent-v1',
    commandId: 'COMMAND_A',
    idempotencyKey: 'KEY_A',
    actorRef: 'ACTOR_A',
    authSubjectRef: 'SUBJECT_A',
    authorizationVersion: 'AUTH_V1',
    office: 'FINANCE',
    expectedHead: { worldVersion: '4', eventSequence: '8', simTime: '10' },
    payload,
  };
  const signature = {
    office: 'FINANCE',
    actorRef: 'ACTOR_A',
    authSubjectRef: 'SUBJECT_A',
    authorizationVersion: 'AUTH_V1',
    proposalRef: 'PROPOSAL_A',
    proposalVersion: payload.revisionRef,
    ruleRevision: 'RULE_V1',
    binding: copy(payload),
    decision: 'APPROVED',
    signedAt: '2026-10-16T00:00:00.000Z',
  };
  return sync({
    schemaVersion: 'inert-budget-plan-v1',
    evidenceClass: 'TEST_ONLY',
    intent,
    identityCoverage: {
      worldId: 'WORLD_A',
      commandIds: ['COMMAND_A'],
      idempotencyKeys: ['KEY_A'],
    },
    identities: [],
    context: {
      head: copy(intent.expectedHead),
      source: {
        producerRef: 'DECLARED_PRODUCER',
        sourceId: 'DECLARED_SOURCE',
        revision: 'SOURCE_V1',
        records: [],
      },
      identity: {
        scope: copy(scope),
        lineRef: payload.lineRef,
        sourceRef: 'SRC_IDENTITY',
        revision: 'IDENTITY_V1',
      },
      period: {
        effectivePeriodRef: 'PERIOD_A',
        applicability: 'APPLICABLE',
        ruleRef: 'PERIOD_RULE',
        sourceRef: 'SRC_PERIOD',
        revision: 'PERIOD_V1',
      },
      policy: {
        ruleRef: 'RULE_A',
        revision: 'RULE_V1',
        sourceRef: 'SRC_RULE',
        binding: copy(payload),
        classification: 'ORDINARY_DEPARTMENTAL',
        captain: 'NOT_REQUIRED',
        dependencies: {
          PROJECT: 'NOT_REQUIRED',
          INDUSTRY: 'NOT_REQUIRED',
          SOCIAL: 'NOT_REQUIRED',
          TRADE: 'NOT_REQUIRED',
          CENTRAL_BANK: 'NOT_REQUIRED',
        },
        zeroAmount: 'FORBIDDEN',
      },
      approval: {
        setRef: 'SET_A',
        proposalRef: 'PROPOSAL_A',
        version: payload.revisionRef,
        ruleRef: 'RULE_A',
        ruleRevision: 'RULE_V1',
        binding: copy(payload),
        status: 'APPROVED',
        requiredOffices: ['FINANCE'],
        signatures: [signature],
        sourceRef: 'SRC_APPROVAL',
      },
      envelope:
        operation === 'SET_ENVELOPE'
          ? null
          : {
              scope: copy(scope),
              revisionRef: 'ENVELOPE_V1',
              amount: '100',
              currency: 'GCU',
              sourceRef: 'SRC_ENVELOPE',
            },
      allocation: {
        kind: 'COMPLETE_ENVELOPE_CAP',
        ruleRef: 'ALLOCATION_RULE',
        revision: 'ALLOCATION_V1',
        sourceRef: 'SRC_ALLOCATION',
        binding: copy(payload),
        coveredLineRefs: [],
        lines: [],
      },
      slots: {
        coveredEnvelopeRefs: ['ENVELOPE_A'],
        coveredLineRefs: operation === 'SET_ENVELOPE' ? [] : ['LINE_A'],
        entries:
          operation === 'SET_ENVELOPE'
            ? []
            : [{ scope: copy(scope), lineRef: null, currency: 'GCU' }],
        sourceRef: 'SRC_SLOTS',
        revision: 'SLOTS_V1',
      },
      origin:
        operation === 'SET_ENVELOPE'
          ? null
          : {
              kind: 'NO_IMPORTED_STATE_IN_THIS_LINE',
              creationRef: 'CREATION_A',
              initializationRef: 'INIT_A',
              legacyRef: 'LEGACY_A',
              sourceRef: 'SRC_LEGACY',
              revision: 'LEGACY_V1',
              initialPaid: '0',
              initialOutstanding: '0',
              initialReserved: '0',
            },
    },
  });
}
function expectFailure(input: Row, kind: string, code: string) {
  expect(planBudgetAppropriation(input)).toMatchObject({
    ...BUDGET_INERT_FLAGS,
    kind,
    code,
  });
}

describe('D-P0 budget pure declarations: 6 positive and 12 negative cases', () => {
  it('P01 plans a first envelope without a line or cash effect', () => {
    const result = planBudgetAppropriation(fixture('SET_ENVELOPE'));
    expect(result).toMatchObject({
      ...BUDGET_INERT_FLAGS,
      kind: 'INERT_PROPOSED',
    });
    if (result.kind !== 'INERT_PROPOSED') throw Error('expected inert plan');
    expect(result.records.map((r) => r.kind)).toEqual(['ENVELOPE_REVISION']);
    expect(result.eventIntents).toHaveLength(1);
  });
  it('P02 plans atomic single-line records and exact ordered proposed heads', () => {
    const input = fixture(),
      result = planBudgetAppropriation(input);
    expect(result).toMatchObject({
      ...BUDGET_INERT_FLAGS,
      kind: 'INERT_PROPOSED',
    });
    if (result.kind !== 'INERT_PROPOSED') throw Error('expected inert plan');
    expect(result.records.map((r) => r.kind)).toEqual([
      'BUDGET_LINE_CREATION',
      'APPROPRIATION',
      'BUDGET_LINE_INITIALIZATION',
      'LEGACY_DISPOSITION',
    ]);
    expect(result.eventIntents.map((e) => e.proposedAt)).toEqual(
      ['9', '10', '11'].map((eventSequence) => ({
        worldVersion: '5',
        eventSequence,
        simTime: '10',
      })),
    );
    expect(result.records[2]).toMatchObject({
      initialPaid: '0',
      initialOutstanding: '0',
      initialReserved: '0',
    });
    expect(Object.isFrozen(result.records[0]!.binding.scope)).toBe(true);
    expect(at(input, 'intent.payload').amount).toBe('25.5');
  });
  it('P03 requires distinct Finance/Captain signatures even for the same person', () => {
    const input = fixture(),
      c = at(input, 'context'),
      approval = row(c.approval);
    row(c.policy).captain = 'REQUIRED';
    approval.requiredOffices = ['FINANCE', 'CAPTAIN'];
    const signatures = approval.signatures as Row[];
    signatures.push({ ...copy(signatures[0]!), office: 'CAPTAIN' });
    expect(planBudgetAppropriation(sync(input))).toMatchObject({
      ...BUDGET_INERT_FLAGS,
      kind: 'INERT_PROPOSED',
    });
  });
  it('P04 recovers the exact original inert reference before new context preflight', () => {
    const input = fixture();
    input.identities = [
      { intent: copy(input.intent), originalPlanRef: 'OLD_PLAN' },
    ];
    input.context = null;
    expect(planBudgetAppropriation(input)).toEqual({
      ...BUDGET_INERT_FLAGS,
      kind: 'INERT_DUPLICATE',
      evidenceClass: 'TEST_ONLY',
      originalPlanRef: 'OLD_PLAN',
      originalIntent: input.intent,
      eventIntents: [],
    });
  });
  it('P05 checks a historical revision chain without applying an amendment', () => {
    const first = fixture(),
      second = fixture();
    const secondIntent = at(second, 'intent'),
      secondPayload = row(secondIntent.payload);
    secondIntent.commandId = 'COMMAND_B';
    secondIntent.idempotencyKey = 'KEY_B';
    secondIntent.expectedHead = {
      worldVersion: '5',
      eventSequence: '9',
      simTime: '11',
    };
    secondPayload.predecessorRevisionRef = 'APPROPRIATION_V1';
    secondPayload.revisionRef = 'APPROPRIATION_V2';
    for (const input of [first, second]) {
      const i = at(input, 'intent'),
        p = row(i.payload),
        c = at(input, 'context');
      c.head = copy(i.expectedHead);
      c.origin = null;
      row(c.policy).binding = copy(p);
      row(c.allocation).binding = copy(p);
      const a = row(c.approval);
      a.version = p.revisionRef;
      a.binding = copy(p);
      for (const sig of a.signatures as Row[]) {
        sig.proposalVersion = p.revisionRef;
        sig.binding = copy(p);
      }
      row(c.slots).entries = [
        { scope: copy(p.scope), lineRef: 'LINE_A', currency: 'GCU' },
      ];
      row(c.allocation).coveredLineRefs = ['LINE_A'];
      row(c.allocation).lines = [
        {
          lineRef: 'LINE_A',
          revisionRef: p.revisionRef,
          amount: p.amount,
          currency: 'GCU',
        },
      ];
      sync(input);
    }
    expect(
      checkBudgetAppropriationHistory({
        schemaVersion: 'inert-budget-history-v1',
        evidenceClass: 'TEST_ONLY',
        scope: at(first, 'intent.payload').scope,
        currency: 'GCU',
        cutoff: secondIntent.expectedHead,
        revisions: [first, second].map((r) => ({
          intent: r.intent,
          context: r.context,
        })),
      }),
    ).toMatchObject({
      ...BUDGET_INERT_FLAGS,
      kind: 'INERT_HISTORY_CONSISTENT',
      currentRevisionRef: 'APPROPRIATION_V2',
      eventIntents: [],
    });
  });
  it('P06 checks complete governed allocations with exact decimals at the cap', () => {
    const input = fixture(),
      c = at(input, 'context');
    row(c.allocation).coveredLineRefs = ['LINE_OTHER'];
    row(c.allocation).lines = [
      {
        lineRef: 'LINE_OTHER',
        revisionRef: 'OTHER_V1',
        amount: '74.5',
        currency: 'GCU',
      },
    ];
    (row(c.slots).entries as unknown[]).push({
      scope: copy(at(input, 'intent.payload').scope),
      lineRef: 'LINE_OTHER',
      currency: 'GCU',
    });
    expect(planBudgetAppropriation(sync(input))).toMatchObject({
      ...BUDGET_INERT_FLAGS,
      kind: 'INERT_PROPOSED',
    });
  });
  it('N01 rejects rebinding an existing world line to another envelope', () => {
    const input = fixture(),
      scope = copy(at(input, 'intent.payload.scope'));
    scope.envelopeRef = 'OTHER_ENVELOPE';
    (at(input, 'context.slots').entries as unknown[]).push({
      scope,
      lineRef: 'LINE_A',
      currency: 'GCU',
    });
    expectFailure(sync(input), 'INERT_REJECTED', 'SLOT_ALREADY_EXISTS');
  });
  it('N02 rejects an envelope currency mismatch', () => {
    const input = fixture();
    at(input, 'context.envelope').currency = 'USD';
    expectFailure(sync(input), 'INERT_REJECTED', 'BINDING_MISMATCH');
  });
  it('N03 requires sourced period applicability', () => {
    const input = fixture();
    at(input, 'context.period').applicability = 'UNKNOWN';
    expectFailure(sync(input), 'INERT_MISSING_INPUT', 'PERIOD_APPLICABILITY');
  });
  it('N04 does not execute approved amendments through first creation', () => {
    const input = fixture();
    at(input, 'intent.payload').predecessorRevisionRef = 'OLD_REVISION';
    expectFailure(input, 'INERT_UNSUPPORTED', 'UNSUPPORTED_APPROVED_AMENDMENT');
  });
  it('N05 never relabels a project as an ordinary two-Office case', () => {
    const input = fixture();
    at(input, 'context.policy').classification = 'PROJECT';
    expectFailure(
      sync(input),
      'INERT_UNSUPPORTED',
      'PROJECT_APPROVAL_NOT_SUPPORTED',
    );
  });
  it('N06 requires an explicit zero amount rule even for a nonzero request', () => {
    const input = fixture();
    at(input, 'context.policy').zeroAmount = 'UNKNOWN';
    expectFailure(sync(input), 'INERT_MISSING_INPUT', 'ZERO_AMOUNT_RULE');
  });
  it('N07 missing Captain applicability is not NOT_REQUIRED', () => {
    const input = fixture();
    at(input, 'context.policy').captain = 'UNKNOWN';
    expectFailure(sync(input), 'INERT_MISSING_INPUT', 'CAPTAIN_APPLICABILITY');
  });
  it('N08 Requested is never approved A', () => {
    const input = fixture();
    at(input, 'context.approval').status = 'REQUESTED';
    expectFailure(sync(input), 'INERT_REJECTED', 'UNAPPROVED_APPROPRIATION');
  });
  it('N09 conditional approval has no unconditional fallback', () => {
    const input = fixture();
    at(input, 'context.approval').status = 'CONDITIONAL';
    expectFailure(
      sync(input),
      'INERT_UNSUPPORTED',
      'CONDITIONAL_PARTIAL_NOT_SUPPORTED',
    );
  });
  it('N10 rejects old signatures after material content changes', () => {
    const input = fixture(),
      signature = (at(input, 'context.approval').signatures as Row[])[0]!;
    row(signature.binding).amount = '24.5';
    expectFailure(sync(input), 'INERT_REJECTED', 'BINDING_MISMATCH');
  });
  it('N11 conflicts on original identity with different full intent', () => {
    const input = fixture(),
      original = copy(input.intent);
    row(row(original).payload).amount = '26.5';
    input.identities = [{ intent: original, originalPlanRef: 'OLD_PLAN' }];
    input.context = null;
    expectFailure(input, 'INERT_REJECTED', 'IDEMPOTENCY_CONFLICT');
  });
  it('N12 never makes an empty baseline from carried imported state', () => {
    const input = fixture();
    at(input, 'context.origin').kind = 'CARRIED_HISTORY';
    expectFailure(
      sync(input),
      'INERT_UNSUPPORTED',
      'IMPORTED_STATE_NOT_SUPPORTED',
    );
  });
});

describe('E implementation review: two local boundary regressions', () => {
  it('R01 rejects historical world-line rebinding in Core and HISTORY carrier', () => {
    const input = fixture(),
      p = at(input, 'intent.payload'),
      c = at(input, 'context'),
      conflictingScope = copy(row(p.scope));
    conflictingScope.envelopeRef = 'OTHER_ENVELOPE';
    c.origin = null;
    row(c.slots).coveredEnvelopeRefs = ['ENVELOPE_A', 'OTHER_ENVELOPE'];
    row(c.slots).entries = [
      { scope: conflictingScope, lineRef: 'LINE_A', currency: 'GCU' },
    ];
    sync(input);
    const request = {
      schemaVersion: 'inert-budget-history-v1',
      evidenceClass: 'TEST_ONLY',
      scope: p.scope,
      currency: 'GCU',
      cutoff: at(input, 'intent').expectedHead,
      revisions: [{ intent: input.intent, context: input.context }],
    };
    const result = checkBudgetAppropriationHistory(request);
    expect(result).toMatchObject({
      ...BUDGET_INERT_FLAGS,
      kind: 'INERT_REJECTED',
      code: 'SLOT_ALREADY_EXISTS',
    });
    const carrier = {
      schemaVersion: 'inert-budget-carrier-v1',
      evidenceClass: 'TEST_ONLY',
      mode: 'HISTORY',
      request,
      result,
    };
    expect(checkBudgetAppropriationCarrier(carrier)).toMatchObject({
      ...BUDGET_INERT_FLAGS,
      kind: 'INERT_CARRIER_CONSISTENT',
      result,
      sourceCrosswalk: [],
    });
    expect(
      checkBudgetAppropriationCarrier({
        ...carrier,
        result: {
          ...BUDGET_INERT_FLAGS,
          kind: 'INERT_HISTORY_CONSISTENT',
          evidenceClass: 'TEST_ONLY',
          currentRevisionRef: p.revisionRef,
          cutoff: request.cutoff,
          eventIntents: [],
        },
      }),
    ).toEqual({
      ...BUDGET_INERT_FLAGS,
      kind: 'INERT_REJECTED',
      code: 'CARRIER_RESULT_MISMATCH',
    });
  });
  it('R02 accepts unrelated USD slots but preserves syntax and target currency guards', () => {
    const input = fixture(),
      c = at(input, 'context'),
      unrelatedScope = copy(at(input, 'intent.payload.scope'));
    unrelatedScope.envelopeRef = 'OTHER_ENVELOPE';
    row(c.slots).coveredEnvelopeRefs = ['ENVELOPE_A', 'OTHER_ENVELOPE'];
    row(c.slots).coveredLineRefs = ['LINE_A', 'OTHER_LINE'];
    const foreignEntry = {
      scope: unrelatedScope,
      lineRef: 'OTHER_LINE',
      currency: 'USD',
    };
    (row(c.slots).entries as unknown[]).push(foreignEntry);
    const result = planBudgetAppropriation(sync(input));
    expect(result).toMatchObject({
      ...BUDGET_INERT_FLAGS,
      kind: 'INERT_PROPOSED',
    });
    expect(
      checkBudgetAppropriationCarrier({
        schemaVersion: 'inert-budget-carrier-v1',
        evidenceClass: 'TEST_ONLY',
        mode: 'PLAN',
        request: input,
        result,
      }),
    ).toMatchObject({
      ...BUDGET_INERT_FLAGS,
      kind: 'INERT_CARRIER_CONSISTENT',
      result: { ...BUDGET_INERT_FLAGS, kind: 'INERT_PROPOSED' },
    });
    foreignEntry.currency = 'US';
    expect(planBudgetAppropriation(sync(input))).toMatchObject({
      ...BUDGET_INERT_FLAGS,
      kind: 'INERT_REJECTED',
    });
    foreignEntry.currency = 'USD';
    foreignEntry.scope = copy(at(input, 'intent.payload.scope'));
    expectFailure(sync(input), 'INERT_REJECTED', 'BINDING_MISMATCH');
    foreignEntry.scope = unrelatedScope;
    foreignEntry.lineRef = 'LINE_A';
    expectFailure(sync(input), 'INERT_REJECTED', 'SLOT_ALREADY_EXISTS');
  });
});
