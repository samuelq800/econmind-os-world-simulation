// Pure serializer/dispatcher fixtures. Canonical event and candidate receipt
// construction does not prove admitted sources, actual policy, DB COMMIT or a
// registered production reducer. No database, Clock or host is started here.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  COMMAND_SCHEMA_VERSION,
  EVENT_SCHEMA_VERSION,
  CAPTAIN_POLITICAL_CAPITAL_COMMAND,
  CAPTAIN_POLITICAL_CAPITAL_PAYLOAD_SCHEMA,
  POLITICAL_CAPITAL_BUCKETS,
  captainPoliticalCapitalSourceHash,
  createAuthoritativeTransition,
  createFinalCommandReceipt,
  createFoundationFact,
  parseAuthoritativeEvent,
  parseCanonicalCommand,
  prepareCaptainPoliticalCapitalEvent,
  authSubject,
  authorizeOfficeCapability,
  worldId,
  countryId,
  officeId,
  teamId,
  type CanonicalCommand,
  type CaptainPoliticalCapitalSourceSnapshot,
  type FoundationTraceRequest,
  type PoliticalCapitalSnapshot,
} from '@econmind/core';
import {
  BUDGET_DOMAIN_SCHEMAS,
  type BudgetDomainState,
} from '@econmind/core/finance-budget-conditional-contract';
import {
  FINANCE_BUDGET_EVENT_TYPES,
  prepareFinanceBudgetEventWire,
  replayFinanceBudgetEventWire,
  type FinanceBudgetEventWireFrame,
} from '@econmind/core/finance-budget-event-wire-contract';
import { createFinanceBudgetCommandComposition } from '../../apps/world-worker/src/preparation/finance-budget-command-composition.js';
import type { FinanceBudgetRuntimeSourcePort } from '../../apps/world-worker/src/persistence/finance-budget-runtime-source.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';

const WORLD = 'WORLD_BUDGET_WIRE_TEST';
const COUNTRY = 'COUNTRY_BUDGET_WIRE_TEST';
const SUBJECT = '11111111-1111-4111-8111-111111111111';
const AT = '2026-10-28T12:00:00.000Z';
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const FP = `sha256:${sha('TEST_ONLY_SOURCE_READ')}`;
const empty = (): BudgetDomainState => ({
  schemaVersion: BUDGET_DOMAIN_SCHEMAS.state,
  worldId: WORLD,
  worldVersion: '0',
  eventSequence: '0',
  envelopes: [],
  history: [],
});
type Data = Record<string, unknown>;

function input(
  operation: 'SET_ENVELOPE' | 'APPROVE_NEW_LINE',
  state = empty(),
) {
  const payload = {
    operation,
    scope: {
      worldId: WORLD,
      countryId: COUNTRY,
      entityRef: 'ENTITY_TEST',
      envelopeRef: 'ENVELOPE_TEST',
      effectivePeriodRef: 'PERIOD_TEST',
    },
    currency: 'XAA',
    amount:
      operation === 'SET_ENVELOPE'
        ? '1000000000000000000.000000000000000003'
        : '9007199254740993.000000000000000001',
    envelopeRevisionRef: 'ENVELOPE_REV_TEST',
    lineRef: operation === 'SET_ENVELOPE' ? null : 'LINE_TEST',
    revisionRef:
      operation === 'SET_ENVELOPE' ? 'ENVELOPE_REV_TEST' : 'LINE_REV_TEST',
    predecessorRevisionRef: null,
  };
  const proposal = {
    proposalRef: 'PROPOSAL_TEST',
    proposalVersion: 'PROPOSAL_REV_TEST',
    payload: structuredClone(payload),
    requestingOfficeId: 'FINANCE',
    programmeOwnerOfficeId: 'FINANCE',
    classification: 'ORDINARY_DEPARTMENTAL',
    funding: 'FULL_UNCONDITIONAL',
    purposeRef: 'PURPOSE_TEST',
  };
  const context = {
    schemaVersion: BUDGET_DOMAIN_SCHEMAS.context,
    evidenceClass: 'TEST_ONLY',
    scope: payload.scope,
    currency: payload.currency,
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
      envelopeRefs: state.envelopes.map(
        (envelope) => envelope.scope.envelopeRef,
      ),
      globalLineRefs: state.envelopes.flatMap((envelope) =>
        envelope.lines.map((line) => line.lineRef),
      ),
      allocationLineRefs:
        state.envelopes
          .find(
            (envelope) =>
              envelope.scope.envelopeRef === payload.scope.envelopeRef,
          )
          ?.lines.map((line) => line.lineRef) ?? [],
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
  };
  const command = parseCanonicalCommand(
    {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      worldId: WORLD,
      countryId: COUNTRY,
      officeId: 'FINANCE',
      commandType: 'CORE_FINANCE_BUDGET_APPROPRIATION_V1',
      commandId:
        operation === 'SET_ENVELOPE'
          ? 'COMMAND_ENVELOPE_TEST'
          : 'COMMAND_LINE_TEST',
      idempotencyKey:
        operation === 'SET_ENVELOPE' ? 'KEY_ENVELOPE_TEST' : 'KEY_LINE_TEST',
      expectedWorldVersion: state.worldVersion,
      actorId: 'ACTOR_TEST',
      authSubject: SUBJECT,
      simTime: '10',
      correlationId: 'CORRELATION_TEST',
      submittedAtReal: AT,
      payload,
    },
    sha,
  );
  return {
    command,
    state,
    context,
    sourceReadFingerprint: FP,
    recordedAtReal: AT,
    sha256Hex: sha,
  };
}
function prepared(
  operation: 'SET_ENVELOPE' | 'APPROVE_NEW_LINE',
  state = empty(),
) {
  const original = input(operation, state),
    wire = prepareFinanceBudgetEventWire(original);
  if (wire.kind !== 'BUDGET_EVENT_WIRE_PREPARED')
    throw Error(JSON.stringify(wire));
  const frame: FinanceBudgetEventWireFrame = {
    command: original.command,
    transition: wire.transition,
    receipt: wire.receiptCandidate,
    inventoryPostings: [],
    financialPostingBatches: [],
  };
  return { original, wire, frame };
}
function replay(
  frames: readonly FinanceBudgetEventWireFrame[],
  worldVersion: string,
  eventSequence: string,
) {
  return replayFinanceBudgetEventWire({
    worldId: WORLD,
    origin: {
      kind: 'EMPTY_BUDGET_ORIGIN_DECLARATION',
      worldId: WORLD,
      openingWorldVersion: '0',
      openingEventSequence: '0',
      sourceReadFingerprint: FP,
    },
    frames,
    expectedHead: { worldVersion, eventSequence },
    sha256Hex: sha,
  });
}
function genericFrame(
  command: CanonicalCommand,
  eventType: string,
): FinanceBudgetEventWireFrame {
  const event = parseAuthoritativeEvent(
    {
      schemaVersion: EVENT_SCHEMA_VERSION,
      worldId: WORLD,
      eventType,
      eventId: 'EVENT_UNKNOWN_ECONOMIC_TEST',
      causationCommandId: command.commandId,
      correlationId: command.correlationId,
      worldVersion: '1',
      sequence: '1',
      simTime: '10',
      recordedAtReal: AT,
      correctsEventId: null,
      payload: {},
    },
    sha,
  );
  const transition = createAuthoritativeTransition({
    command,
    worldVersionBefore: '0',
    worldVersionAfter: '1',
    events: [event],
  });
  return {
    command,
    transition,
    receipt: createFinalCommandReceipt({
      command,
      transition,
      outcome: 'COMMITTED',
      reasonCode: null,
      simTime: command.simTime,
      recordedAtReal: AT,
    }),
    inventoryPostings: [],
    financialPostingBatches: [],
  };
}

function capitalFrame(
  state: BudgetDomainState,
  options: {
    countryId?: string;
    idempotencyKey?: string | null;
    commandId?: string;
    eventId?: string;
  } = {},
): FinanceBudgetEventWireFrame {
  const quantity = (amount: string) => ({ amount, unit: 'political_capital' });
  const capitalCountry = options.countryId ?? COUNTRY;
  const command = parseCanonicalCommand(
    {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      worldId: WORLD,
      countryId: capitalCountry,
      officeId: 'CAPTAIN',
      commandType: CAPTAIN_POLITICAL_CAPITAL_COMMAND,
      commandId: options.commandId ?? 'COMMAND_CAPITAL_TEST',
      idempotencyKey:
        options.idempotencyKey === undefined
          ? 'KEY_CAPITAL_TEST'
          : options.idempotencyKey,
      expectedWorldVersion: state.worldVersion,
      actorId: 'ACTOR_TEST',
      authSubject: SUBJECT,
      simTime: '10',
      correlationId: 'CORRELATION_TEST',
      submittedAtReal: AT,
      payload: {
        schemaVersion: CAPTAIN_POLITICAL_CAPITAL_PAYLOAD_SCHEMA,
        fromBucket: 'FISCAL_REFORM',
        toBucket: 'INDUSTRIAL_STRATEGY',
        amount: quantity('1'),
        reasonFactRef: 'FACT.TEST.REASON',
      },
    },
    sha,
  );
  const capital: PoliticalCapitalSnapshot = {
    capitalRef: 'CAPITAL.TEST',
    countryRef: capitalCountry,
    opening: quantity('90'),
    generated: quantity('10'),
    total: quantity('100'),
    available: quantity('80'),
    spent: quantity('20'),
    closing: quantity('80'),
    buckets: POLITICAL_CAPITAL_BUCKETS.map((bucket, index) => ({
      bucket,
      balance: quantity(
        ['10.25', '15.75', '10', '10', '10', '10', '14'][index]!,
      ),
    })),
  };
  const trace: FoundationTraceRequest = {
    traceRef: 'TRACE.TEST.CAPITAL',
    calculationVersion: 'TEST_ONLY_CAPITAL_V1',
    snapshot: {
      lineageRef: WORLD,
      sourceVersion: `WORLD_VERSION_${state.worldVersion}`,
      snapshotRef: 'SNAPSHOT.TEST.CAPITAL',
      snapshotHash: 'a'.repeat(64),
      predecessorSnapshotHash: 'b'.repeat(64),
    },
    snapshotAt: { amount: '10', unit: 'sim_millisecond' },
  };
  const facts = (bound: FoundationTraceRequest) => ({
    capitalFact: createFoundationFact({
      trace: bound,
      factRef: 'FACT.TEST.CAPITAL',
      sourceRef: 'SOURCE.TEST.CAPITAL',
      predecessorFactRefs: ['EVENT.TEST.CAPITAL.ORIGIN'],
      payload: capital,
    }),
    reasonFact: createFoundationFact({
      trace: bound,
      factRef: 'FACT.TEST.REASON',
      sourceRef: 'SOURCE.TEST.CABINET',
      predecessorFactRefs: ['EVENT.TEST.REASON.ORIGIN'],
      payload: {
        countryRef: capitalCountry,
        recordRef: 'REASON.TEST',
        reason: 'TEST_ONLY transfer, no Budget effect.',
      },
    }),
  });
  const scope = {
    worldId: WORLD,
    countryId: capitalCountry,
    worldVersion: state.worldVersion,
    lastEventSequence: state.eventSequence,
  };
  const bound = {
    ...trace,
    snapshot: {
      ...trace.snapshot,
      snapshotHash: captainPoliticalCapitalSourceHash(
        { ...scope, ...facts(trace) },
        sha,
      ),
    },
  };
  const source: CaptainPoliticalCapitalSourceSnapshot = {
    ...scope,
    trace: bound,
    ...facts(bound),
  };
  const { event } = prepareCaptainPoliticalCapitalEvent({
    command,
    source,
    eventId: options.eventId ?? 'EVENT_CAPITAL_TEST',
    recordedAtReal: AT,
    sha256Hex: sha,
  });
  const transition = createAuthoritativeTransition({
    command,
    worldVersionBefore: state.worldVersion,
    worldVersionAfter: event.worldVersion,
    events: [event],
  });
  return {
    command,
    transition,
    receipt: createFinalCommandReceipt({
      command,
      transition,
      outcome: 'COMMITTED',
      reasonCode: null,
      simTime: command.simTime,
      recordedAtReal: AT,
    }),
    inventoryPostings: [],
    financialPostingBatches: [],
  };
}

describe('Finance canonical event serializer engineering', () => {
  it('emits fixed 1/3 event groups with exact amounts and one WorldVersion advance', () => {
    const cap = prepared('SET_ENVELOPE'),
      line = prepared('APPROVE_NEW_LINE', cap.wire.nextState);
    expect(cap.wire.transition.events.map((event) => event.eventType)).toEqual([
      FINANCE_BUDGET_EVENT_TYPES.BUDGET_ENVELOPE_SET,
    ]);
    expect(
      line.wire.transition.events.map((event) => [
        event.eventType,
        event.sequence,
        event.worldVersion,
      ]),
    ).toEqual([
      [FINANCE_BUDGET_EVENT_TYPES.BUDGET_LINE_CREATED, '2', '2'],
      [FINANCE_BUDGET_EVENT_TYPES.BUDGET_APPROPRIATED, '3', '2'],
      [FINANCE_BUDGET_EVENT_TYPES.BUDGET_LINE_INITIALIZED, '4', '2'],
    ]);
    expect(line.wire.nextState.envelopes[0]?.lines[0]).toMatchObject({
      appropriation: {
        amount: '9007199254740993.000000000000000001',
        currency: 'XAA',
      },
      initialPaid: '0',
      initialReserved: '0',
      initialOutstanding: '0',
    });
    expect(line.wire).toMatchObject({
      wireOnly: true,
      sourceAdmitted: false,
      productionAuthority: false,
    });
    expect(replay([cap.frame, line.frame], '2', '4').nextState).toEqual(
      line.wire.nextState,
    );
  });

  it('keeps deterministic identities and existing event fingerprint treatment of audit timestamps', () => {
    const f = input('SET_ENVELOPE'),
      a = prepareFinanceBudgetEventWire(f),
      b = prepareFinanceBudgetEventWire({
        ...f,
        recordedAtReal: '2026-10-28T12:01:00.000Z',
      });
    if (
      a.kind !== 'BUDGET_EVENT_WIRE_PREPARED' ||
      b.kind !== 'BUDGET_EVENT_WIRE_PREPARED'
    )
      throw Error('Expected wire');
    expect(a.transition.eventIds).toEqual(b.transition.eventIds);
    expect(a.transition.events[0]?.fingerprint).toBe(
      b.transition.events[0]?.fingerprint,
    );
    expect(a.receiptCandidate.recordedAtReal).not.toBe(
      b.receiptCandidate.recordedAtReal,
    );
  });

  it('keeps missing policy facts denied and never invents a default threshold or approval', () => {
    const f = input('SET_ENVELOPE');
    f.context.policy.applicability.pop();
    expect(prepareFinanceBudgetEventWire(f)).toMatchObject({
      kind: 'BUDGET_EVENT_WIRE_DENIED',
      sourceAdmitted: false,
    });
    expect(() =>
      prepareFinanceBudgetEventWire({
        ...input('SET_ENVELOPE'),
        sourceReadFingerprint: 'ADMITTED',
      }),
    ).toThrow('fingerprint required');
  });
});

describe('Finance complete canonical frame dispatcher', () => {
  it('preserves a foreign Captain null key at the tail and before a later Budget group', () => {
    const cap = prepared('SET_ENVELOPE');
    const foreign = capitalFrame(cap.wire.nextState, {
      countryId: 'COUNTRY_FOREIGN_TEST',
      idempotencyKey: null,
    });
    const tail = replay([cap.frame, foreign], '2', '2');
    expect(tail.nextState.envelopes).toEqual(cap.wire.nextState.envelopes);
    expect(tail.nextState.history[1]?.idempotencyKey).toBeNull();
    const line = prepared('APPROVE_NEW_LINE', tail.nextState);
    const result = replay([cap.frame, foreign, line.frame], '3', '5');
    expect(result.nextState).toEqual(line.wire.nextState);
    expect(result.nextState.history[1]?.idempotencyKey).toBeNull();
    expect(foreign.command.idempotencyKey).toBeNull();
  });

  it('does not treat two absent foreign keys as duplicates but still rejects duplicate command IDs', () => {
    const first = capitalFrame(empty(), {
      countryId: 'COUNTRY_FOREIGN_ONE',
      idempotencyKey: null,
    });
    const afterFirst = replay([first], '1', '1');
    const second = capitalFrame(afterFirst.nextState, {
      countryId: 'COUNTRY_FOREIGN_TWO',
      idempotencyKey: null,
      commandId: 'COMMAND_CAPITAL_TWO',
      eventId: 'EVENT_CAPITAL_TWO',
    });
    const result = replay([first, second], '2', '2');
    expect(
      result.nextState.history.map((entry) => entry.idempotencyKey),
    ).toEqual([null, null]);
    const cap = prepared('SET_ENVELOPE', result.nextState);
    expect(replay([first, second, cap.frame], '3', '3').nextState).toEqual(
      cap.wire.nextState,
    );
    const duplicate = capitalFrame(afterFirst.nextState, {
      countryId: 'COUNTRY_FOREIGN_TWO',
      idempotencyKey: null,
      eventId: 'EVENT_CAPITAL_DUPLICATE',
    });
    expect(() => replay([first, duplicate], '2', '2')).toThrow(
      'Duplicate whole-replay command identity',
    );
  });

  it('continues to require an idempotency key for every Budget command', () => {
    const f = input('SET_ENVELOPE'),
      c = f.command;
    const command = parseCanonicalCommand(
      {
        schemaVersion: c.schemaVersion,
        worldId: c.worldId,
        countryId: c.countryId,
        officeId: c.officeId,
        commandType: c.commandType,
        commandId: c.commandId,
        idempotencyKey: null,
        expectedWorldVersion: c.expectedWorldVersion,
        actorId: c.actorId,
        authSubject: c.authSubject,
        simTime: c.simTime.toCanonicalValue(),
        correlationId: c.correlationId,
        submittedAtReal: c.submittedAtReal,
        payload: JSON.parse(c.canonicalPayload),
      },
      sha,
    );
    expect(() => prepareFinanceBudgetEventWire({ ...f, command })).toThrow(
      'Canonical discretionary Finance budget command required',
    );
  });

  it('advances every canonical world step even when the latest step has no Budget effect', () => {
    const cap = prepared('SET_ENVELOPE'),
      capital = capitalFrame(cap.wire.nextState);
    const afterCapital = replay([cap.frame, capital], '2', '2');
    expect(afterCapital.nextState.envelopes).toEqual(
      cap.wire.nextState.envelopes,
    );
    expect(afterCapital.checkedCommandCount).toBe(2);
    const line = prepared('APPROVE_NEW_LINE', afterCapital.nextState);
    expect(
      replay([cap.frame, capital, line.frame], '3', '5').nextState,
    ).toEqual(line.wire.nextState);
  });

  it('rejects omitted history, duplicate frames, wrong final head and hidden postings', () => {
    const cap = prepared('SET_ENVELOPE'),
      line = prepared('APPROVE_NEW_LINE', cap.wire.nextState);
    expect(() => replay([line.frame], '2', '4')).toThrow(
      'frame/head/receipt differs',
    );
    expect(() => replay([cap.frame, cap.frame], '2', '2')).toThrow();
    expect(() => replay([cap.frame], '2', '1')).toThrow(
      'requested global head',
    );
    expect(() =>
      replay([{ ...cap.frame, financialPostingBatches: [{}] }], '1', '1'),
    ).toThrow('hide economic postings');
  });

  it('rejects re-signed payload changes even when canonical envelope fingerprints are valid', () => {
    const f = prepared('SET_ENVELOPE'),
      old = f.frame.transition.events[0]!;
    const payload = JSON.parse(old.canonicalPayload) as Data;
    payload.intentIndex = '9';
    const changed = parseAuthoritativeEvent(
      {
        schemaVersion: old.schemaVersion,
        worldId: old.worldId,
        eventType: old.eventType,
        eventId: old.eventId,
        causationCommandId: old.causationCommandId,
        correlationId: old.correlationId,
        worldVersion: old.worldVersion,
        sequence: old.sequence,
        simTime: old.simTime.toCanonicalValue(),
        recordedAtReal: old.recordedAtReal,
        correctsEventId: null,
        payload,
      },
      sha,
    );
    const transition = createAuthoritativeTransition({
      command: f.original.command,
      worldVersionBefore: '0',
      worldVersionAfter: '1',
      events: [changed],
    });
    expect(() =>
      replay(
        [
          {
            ...f.frame,
            transition,
            receipt: createFinalCommandReceipt({
              command: f.original.command,
              transition,
              outcome: 'COMMITTED',
              reasonCode: null,
              simTime: f.original.command.simTime,
              recordedAtReal: AT,
            }),
          },
        ],
        '1',
        '1',
      ),
    ).toThrow('exact economic replay');
  });

  it('refuses unknown economic families rather than silently treating them as unrelated', () => {
    const original = input('SET_ENVELOPE').command;
    const command = parseCanonicalCommand(
      {
        schemaVersion: original.schemaVersion,
        worldId: original.worldId,
        countryId: original.countryId,
        officeId: 'FINANCE',
        commandType: 'UNHANDLED_FISCAL_PAYMENT_TEST',
        commandId: original.commandId,
        idempotencyKey: original.idempotencyKey,
        expectedWorldVersion: '0',
        actorId: original.actorId,
        authSubject: original.authSubject,
        simTime: '10',
        correlationId: original.correlationId,
        submittedAtReal: AT,
        payload: {},
      },
      sha,
    );
    expect(() =>
      replay([genericFrame(command, 'FISCAL_PAYMENT_SETTLED_TEST')], '1', '1'),
    ).toThrow('No versioned Budget effect handler');
  });

  it('requires an explicit origin declaration instead of inferring zero opening Budget from absence', () => {
    expect(() =>
      replayFinanceBudgetEventWire({
        worldId: WORLD,
        origin: undefined as never,
        frames: [],
        expectedHead: { worldVersion: '0', eventSequence: '0' },
        sha256Hex: sha,
      }),
    ).toThrow('Closed canonical record');
    expect(replay([], '0', '0')).toMatchObject({
      sourceAdmitted: false,
      productionAuthority: false,
    });
  });
});

describe('Finance worker source to canonical wire candidate', () => {
  it('uses the same source scope and keeps policy/source admission separate from serialization', async () => {
    const f = input('SET_ENVELOPE'),
      subject = authSubject(SUBJECT);
    const authorization = await authorizeOfficeCapability({
      principal: {
        authSubject: subject,
        facts: { user_id: subject, display_name: null, school_id: null },
        token: {
          subject,
          issuer: 'urn:test-only',
          audience: 'test-only',
          issuedAt: AT,
          expiresAt: AT,
        },
      },
      resolver: {
        resolveCurrentIdentity: async () => subject,
        resolveCurrentMembership: async () => ({
          authSubject: subject,
          worldId: worldId(WORLD),
          countryId: countryId(COUNTRY),
          teamId: teamId('TEAM_TEST'),
          authorizationVersion: 'AUTH_REV_TEST',
          officeAssignments: [officeId('FINANCE')],
          active: true,
          suspended: false,
          isWorldAdmin: false,
          negotiationPartyIds: [],
        }),
      },
      worldId: worldId(WORLD),
      requestedCountryId: countryId(COUNTRY),
      requestedOfficeId: officeId('FINANCE'),
      capability: 'FINANCE_BUDGET',
    });
    let headReads = 0,
      sourceCalls = 0;
    const transaction: SqlExecutor = {
      async query<Row extends object>(sql: string) {
        expect(sql).toContain('for share');
        headReads++;
        return {
          rows: [
            { world_version: '0', event_sequence: '0' },
          ] as unknown as readonly Row[],
          rowCount: 1,
        };
      },
    };
    const source: FinanceBudgetRuntimeSourcePort = {
      async withSnapshotFrom(tx, request, consume) {
        expect(tx).toBe(transaction);
        sourceCalls++;
        return consume({
          schemaVersion: 'finance-budget-conditional-source-snapshot-v1',
          evidenceClass: 'TEST_ONLY',
          sourceId: 'SOURCE_TEST',
          sourceRevision: 'SOURCE_REV_TEST',
          requestBinding: request,
          context: f.context,
          replay: {
            schemaVersion: BUDGET_DOMAIN_SCHEMAS.replay,
            worldId: WORLD,
            steps: [],
            expectedHead: { worldVersion: '0', eventSequence: '0' },
          },
        });
      },
    };
    const composition = createFinanceBudgetCommandComposition({
      source,
      environment: { ECONMIND_ENV: 'local', NODE_ENV: 'test', VITEST: 'true' },
    });
    const result = await composition.prepareEventWireFrom({
      transaction,
      command: f.command,
      authorization,
      recordedAtReal: AT,
    });
    expect(result.kind).toBe('CONDITIONAL_DRAFT_PREPARED');
    if (result.kind !== 'CONDITIONAL_DRAFT_PREPARED')
      throw Error(JSON.stringify(result));
    expect(result.eventWire.transition.events[0]?.eventType).toBe(
      FINANCE_BUDGET_EVENT_TYPES.BUDGET_ENVELOPE_SET,
    );
    expect(result.eventWire.nextState).toEqual(result.domain.nextState);
    expect(result).toMatchObject({
      sourceAdmitted: false,
      productionAuthority: false,
      runtimeConnected: false,
    });
    expect(headReads).toBe(2);
    expect(sourceCalls).toBe(1);
    expect(
      await createFinanceBudgetCommandComposition({
        source,
        environment: { ECONMIND_ENV: 'production', NODE_ENV: 'production' },
      }).prepareEventWireFrom({
        transaction,
        command: f.command,
        authorization,
        recordedAtReal: AT,
      }),
    ).toMatchObject({ kind: 'SOURCE_MISSING' });
  });
});
