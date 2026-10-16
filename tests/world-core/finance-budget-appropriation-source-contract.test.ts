import { describe, expect, it } from 'vitest';
import {
  BUDGET_INERT_FLAGS,
  planBudgetAppropriation,
} from '../../packages/core/src/commands/finance-budget-appropriation.js';
import { checkBudgetAppropriationCarrier } from '../../apps/world-worker/src/persistence/finance-budget-appropriation-source-contract.js';

// Independent inert fixture, not a product source constructor or shared test import.
function fixture() {
  const scope = {
    worldId: 'WORLD_A',
    countryId: 'COUNTRY_A',
    entityRef: 'ENTITY_A',
    envelopeRef: 'ENVELOPE_A',
    effectivePeriodRef: 'PERIOD_A',
  };
  const binding = {
    operation: 'APPROVE_NEW_LINE',
    scope,
    currency: 'GCU',
    amount: '20',
    envelopeRevisionRef: 'ENVELOPE_V1',
    lineRef: 'LINE_A',
    revisionRef: 'APPROPRIATION_V1',
    predecessorRevisionRef: null,
  };
  const head = { worldVersion: '2', eventSequence: '4', simTime: '8' };
  const intent = {
    schemaVersion: 'inert-budget-intent-v1',
    commandId: 'COMMAND_A',
    idempotencyKey: 'KEY_A',
    actorRef: 'ACTOR_A',
    authSubjectRef: 'SUBJECT_A',
    authorizationVersion: 'AUTH_V1',
    office: 'FINANCE',
    expectedHead: head,
    payload: binding,
  };
  const context = {
    head,
    source: {
      producerRef: 'DECLARED_PRODUCER',
      sourceId: 'DECLARED_SOURCE',
      revision: 'SOURCE_V1',
      records: [] as unknown[],
    },
    identity: {
      scope,
      lineRef: 'LINE_A',
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
      binding,
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
      version: 'APPROPRIATION_V1',
      ruleRef: 'RULE_A',
      ruleRevision: 'RULE_V1',
      binding,
      status: 'APPROVED',
      requiredOffices: ['FINANCE'],
      signatures: [
        {
          office: 'FINANCE',
          actorRef: 'ACTOR_A',
          authSubjectRef: 'SUBJECT_A',
          authorizationVersion: 'AUTH_V1',
          proposalRef: 'PROPOSAL_A',
          proposalVersion: 'APPROPRIATION_V1',
          ruleRevision: 'RULE_V1',
          binding,
          decision: 'APPROVED',
          signedAt: '2026-10-16T00:00:00.000Z',
        },
      ],
      sourceRef: 'SRC_APPROVAL',
    },
    envelope: {
      scope,
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
      binding,
      coveredLineRefs: [],
      lines: [],
    },
    slots: {
      coveredEnvelopeRefs: ['ENVELOPE_A'],
      coveredLineRefs: ['LINE_A'],
      entries: [{ scope, lineRef: null, currency: 'GCU' }],
      sourceRef: 'SRC_SLOTS',
      revision: 'SLOTS_V1',
    },
    origin: {
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
  };
  const source = (
    declaration: Record<string, unknown>,
    kind: string,
    subjectRef: string,
    subjectRevision: string,
  ) => ({
    ref: declaration.sourceRef,
    kind,
    subjectRef,
    subjectRevision,
    binding,
    head,
    declaration: Object.fromEntries(
      Object.entries(declaration).filter(([key]) => key !== 'sourceRef'),
    ),
  });
  context.source.records = [
    source(context.identity, 'IDENTITY', 'LINE_A', 'IDENTITY_V1'),
    source(context.period, 'PERIOD', 'PERIOD_A', 'PERIOD_V1'),
    source(context.policy, 'APPROVAL_RULE', 'RULE_A', 'RULE_V1'),
    source(context.approval, 'APPROVAL_SET', 'SET_A', 'APPROPRIATION_V1'),
    source(context.envelope, 'ENVELOPE', 'ENVELOPE_A', 'ENVELOPE_V1'),
    source(
      context.allocation,
      'ALLOCATION_RULE',
      'ALLOCATION_RULE',
      'ALLOCATION_V1',
    ),
    source(context.slots, 'EMPTY_SET', 'LINE_A', 'SLOTS_V1'),
    source(context.origin, 'LEGACY_DISPOSITION', 'LINE_A', 'LEGACY_V1'),
  ];
  return {
    schemaVersion: 'inert-budget-plan-v1',
    evidenceClass: 'TEST_ONLY',
    intent,
    identityCoverage: {
      worldId: 'WORLD_A',
      commandIds: ['COMMAND_A'],
      idempotencyKeys: ['KEY_A'],
    },
    identities: [] as unknown[],
    context: context as typeof context | null,
  };
}
const carrier = (request: ReturnType<typeof fixture>) => ({
  schemaVersion: 'inert-budget-carrier-v1',
  evidenceClass: 'TEST_ONLY',
  mode: 'PLAN',
  request,
  result: planBudgetAppropriation(request),
});

describe('D-P0 unadmitted carrier: 2 positive and 4 negative cases', () => {
  it('P07 reconstructs exact proposed sources without issuing authority', () => {
    const result = checkBudgetAppropriationCarrier(carrier(fixture()));
    expect(result).toMatchObject({
      ...BUDGET_INERT_FLAGS,
      kind: 'INERT_CARRIER_CONSISTENT',
      result: { ...BUDGET_INERT_FLAGS, kind: 'INERT_PROPOSED' },
    });
    if (result.kind !== 'INERT_CARRIER_CONSISTENT')
      throw Error('expected inert consistency');
    expect(result.sourceCrosswalk.map((s) => s.sourceKind)).toEqual([
      'BUDGET_LINE_CREATION',
      'APPROPRIATION',
      'BUDGET_LINE_INITIALIZATION',
      'LEGACY_DISPOSITION',
    ]);
    expect(
      result.sourceCrosswalk.every(
        (s) =>
          s.entityRef === 'ENTITY_A' && s.effectivePeriodRef === 'PERIOD_A',
      ),
    ).toBe(true);
    expect(Object.isFrozen(result.sourceCrosswalk)).toBe(true);
  });
  it('P08 preserves duplicate reference and false flags without new context', () => {
    const request = fixture();
    request.identities = [
      { intent: structuredClone(request.intent), originalPlanRef: 'OLD_PLAN' },
    ];
    request.context = null;
    expect(checkBudgetAppropriationCarrier(carrier(request))).toMatchObject({
      ...BUDGET_INERT_FLAGS,
      kind: 'INERT_CARRIER_CONSISTENT',
      result: {
        ...BUDGET_INERT_FLAGS,
        kind: 'INERT_DUPLICATE',
        originalPlanRef: 'OLD_PLAN',
        eventIntents: [],
      },
      sourceCrosswalk: [],
    });
  });
  it('N13 rejects caller-forged authority on a consistent-looking result', () => {
    const input = carrier(fixture());
    expect(
      checkBudgetAppropriationCarrier({
        ...input,
        result: { ...input.result, sourceAdmitted: true },
      }),
    ).toEqual({
      ...BUDGET_INERT_FLAGS,
      kind: 'INERT_REJECTED',
      code: 'CARRIER_RESULT_MISMATCH',
    });
  });
  it('N14 rejects extra carrier fields rather than admitting a READY shortcut', () => {
    expect(
      checkBudgetAppropriationCarrier({ ...carrier(fixture()), READY: true }),
    ).toEqual({
      ...BUDGET_INERT_FLAGS,
      kind: 'INERT_REJECTED',
      code: 'CARRIER_SCHEMA_INVALID',
    });
  });
  it('N15 rejects omitted source coverage and does not invent an empty set', () => {
    const request = fixture();
    request.context!.slots.coveredLineRefs = [];
    // Keep source declaration equal: this is a semantically incomplete, not stale-hash, input.
    const declaration = (
      request.context!.source.records as Record<string, unknown>[]
    ).find((s) => s.kind === 'EMPTY_SET')!;
    declaration.declaration = Object.fromEntries(
      Object.entries(request.context!.slots).filter(
        ([key]) => key !== 'sourceRef',
      ),
    );
    const result = checkBudgetAppropriationCarrier(carrier(request));
    expect(result).toMatchObject({
      ...BUDGET_INERT_FLAGS,
      kind: 'INERT_CARRIER_CONSISTENT',
      result: {
        ...BUDGET_INERT_FLAGS,
        kind: 'INERT_MISSING_INPUT',
        code: 'SLOT_COVERAGE',
      },
      sourceCrosswalk: [],
    });
  });
  it('N16 rejects unknown payload fields and preserves all denial flags', () => {
    const request = fixture();
    const malformed = {
      ...request,
      intent: {
        ...request.intent,
        payload: { ...request.intent.payload, fakeHistory: [] },
      },
    };
    const result = planBudgetAppropriation(malformed);
    expect(result).toMatchObject({
      ...BUDGET_INERT_FLAGS,
      kind: 'INERT_REJECTED',
      code: 'UNKNOWN_FIELD',
    });
    expect(
      checkBudgetAppropriationCarrier({
        ...carrier(request),
        request: malformed,
        result,
      }),
    ).toMatchObject({
      ...BUDGET_INERT_FLAGS,
      kind: 'INERT_CARRIER_CONSISTENT',
      sourceCrosswalk: [],
    });
  });
});
