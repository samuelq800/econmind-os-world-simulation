// Synthetic source and SQL protocols only. Positive tests exercise the actual
// existing conditional Core kernel; they do not establish source admission,
// persisted authorization, native locks, receipts or production readiness.
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  COMMAND_SCHEMA_VERSION,
  authSubject,
  authorizeOfficeCapability,
  countryId,
  officeId,
  parseCanonicalCommand,
  teamId,
  worldId,
  type AuthorizedOfficeContext,
} from '@econmind/core';
import {
  BUDGET_DOMAIN_SCHEMAS as schemas,
  computeBudgetSourceDomain,
  type BudgetDomainState,
} from '@econmind/core/finance-budget-conditional-contract';
import { createFinanceBudgetCommandComposition } from '../../apps/world-worker/src/preparation/finance-budget-command-composition.js';
import {
  withFinanceBudgetRuntimeSourceFrom,
  type FinanceBudgetRuntimeSourcePort,
  type FinanceBudgetSourceSnapshot,
} from '../../apps/world-worker/src/persistence/finance-budget-runtime-source.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';

const WORLD = worldId('WORLD_BUDGET_RUNTIME_TEST');
const COUNTRY = countryId('COUNTRY_BUDGET_RUNTIME_TEST');
const SUBJECT = authSubject('11111111-1111-4111-8111-111111111111');
const AT = '2026-10-28T12:00:00.000Z';
const ENV = { ECONMIND_ENV: 'local', NODE_ENV: 'test', VITEST: 'true' };
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
type Data = Record<string, unknown>;
const row = (value: unknown) => value as Data;

function coreFixture(
  operation: 'SET_ENVELOPE' | 'APPROVE_NEW_LINE',
  state: BudgetDomainState,
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
    amount: operation === 'SET_ENVELOPE' ? '1000' : '125.000000000000000001',
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
    schemaVersion: schemas.context,
    evidenceClass: 'TEST_ONLY',
    scope: structuredClone(payload.scope),
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
          .find((envelope) => envelope.scope.envelopeRef === 'ENVELOPE_TEST')
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
  const command = {
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
    payload,
  };
  return { schemaVersion: schemas.evaluation, command, context, state };
}

async function fixture(
  operation: 'SET_ENVELOPE' | 'APPROVE_NEW_LINE' = 'SET_ENVELOPE',
) {
  let state: BudgetDomainState = {
    schemaVersion: schemas.state,
    worldId: WORLD,
    worldVersion: '0',
    eventSequence: '0',
    envelopes: [],
    history: [],
  };
  const steps: unknown[] = [];
  if (operation === 'APPROVE_NEW_LINE') {
    const cap = coreFixture('SET_ENVELOPE', state),
      result = computeBudgetSourceDomain(cap);
    if (result.kind !== 'CONDITIONAL_DOMAIN_CHANGE')
      throw Error(JSON.stringify(result));
    steps.push({
      kind: 'BUDGET_TEST_FIXTURE',
      command: cap.command,
      context: cap.context,
      eventIntents: result.eventIntents,
    });
    state = result.nextState;
  }
  const original = coreFixture(operation, state);
  const command = parseCanonicalCommand(
    {
      ...original.command,
      schemaVersion: COMMAND_SCHEMA_VERSION,
      actorId: 'ACTOR_TEST',
      authSubject: SUBJECT,
      simTime: '10',
      correlationId: 'CORRELATION_TEST',
      submittedAtReal: AT,
    },
    sha,
  );
  const membership = {
    authSubject: SUBJECT,
    worldId: WORLD,
    countryId: COUNTRY,
    teamId: teamId('TEAM_BUDGET_TEST'),
    authorizationVersion: 'AUTH_REV_TEST',
    officeAssignments: [officeId('FINANCE')],
    active: true,
    suspended: false,
    isWorldAdmin: false,
    negotiationPartyIds: [],
  };
  const authorization = await authorizeOfficeCapability({
    principal: {
      authSubject: SUBJECT,
      facts: { user_id: SUBJECT, display_name: null, school_id: null },
      token: {
        subject: SUBJECT,
        issuer: 'urn:test-only',
        audience: 'test-only',
        issuedAt: AT,
        expiresAt: AT,
      },
    },
    resolver: {
      resolveCurrentIdentity: async () => SUBJECT,
      resolveCurrentMembership: async () => membership,
    },
    worldId: WORLD,
    requestedCountryId: COUNTRY,
    requestedOfficeId: officeId('FINANCE'),
    capability: 'FINANCE_BUDGET',
  });
  const trace: string[] = [];
  const held = {
    world_version: state.worldVersion,
    event_sequence: state.eventSequence,
  };
  const transaction: SqlExecutor = {
    async query<Row extends object>(sql: string) {
      trace.push(sql);
      if (!/^select .+from world_v2\.world_head .+for share$/u.test(sql))
        throw Error('ONLY_HELD_HEAD_READ_ALLOWED');
      return { rows: [{ ...held }] as unknown as readonly Row[], rowCount: 1 };
    },
  };
  const replay = {
    schemaVersion: schemas.replay,
    worldId: WORLD,
    steps,
    expectedHead: {
      worldVersion: state.worldVersion,
      eventSequence: state.eventSequence,
    },
  };
  let observedRequest: unknown;
  let sourceCalls = 0;
  const port: FinanceBudgetRuntimeSourcePort = {
    async withSnapshotFrom(executor, request, consume) {
      expect(executor).toBe(transaction);
      observedRequest = request;
      sourceCalls++;
      return consume({
        schemaVersion: 'finance-budget-conditional-source-snapshot-v1',
        evidenceClass: 'TEST_ONLY',
        sourceId: 'SOURCE_BUDGET_TEST',
        sourceRevision: 'SOURCE_REV_TEST',
        requestBinding: request,
        context: original.context,
        replay,
      });
    },
  };
  return {
    command,
    authorization,
    original,
    transaction,
    port,
    replay,
    state,
    held,
    membership,
    trace,
    sourceCalls: () => sourceCalls,
    observedRequest: () => observedRequest,
  };
}

describe('Finance source to existing conditional domain draft composition', () => {
  it.each(['SET_ENVELOPE', 'APPROVE_NEW_LINE'] as const)(
    'executes source replay and Core %s semantics without issuing runtime authority',
    async (operation) => {
      const f = await fixture(operation);
      const composition = createFinanceBudgetCommandComposition({
        source: f.port,
        environment: ENV,
      });
      const prepared = await composition.prepareFrom(f);
      expect(prepared.kind).toBe('CONDITIONAL_DRAFT_PREPARED');
      if (prepared.kind !== 'CONDITIONAL_DRAFT_PREPARED')
        throw Error(JSON.stringify(prepared));
      const expected = computeBudgetSourceDomain(f.original);
      expect(prepared.domain).toEqual(expected);
      expect(prepared).toMatchObject({
        productionAuthority: false,
        sourceAdmitted: false,
        runtimeConnected: false,
        evidenceClass: 'TEST_ONLY',
      });
      expect(prepared).not.toHaveProperty('transition');
      expect(prepared).not.toHaveProperty('receipt');
      expect(prepared.domain.eventIntents.map((intent) => intent.kind)).toEqual(
        operation === 'SET_ENVELOPE'
          ? ['BUDGET_ENVELOPE_SET']
          : [
              'BUDGET_LINE_CREATED',
              'BUDGET_APPROPRIATED',
              'BUDGET_LINE_INITIALIZED',
            ],
      );
      expect(prepared.domain.nextState.worldVersion).toBe(
        (BigInt(f.state.worldVersion) + 1n).toString(),
      );
      expect(f.sourceCalls()).toBe(1);
      expect(f.trace).toHaveLength(2);
      expect(row(f.observedRequest())).not.toHaveProperty('payload');
      expect(row(f.observedRequest())).not.toHaveProperty('amount');
      if (operation === 'APPROVE_NEW_LINE')
        expect(prepared.domain.nextState.envelopes[0]?.lines[0]).toMatchObject({
          appropriation: { amount: '125.000000000000000001', currency: 'XAA' },
          initialPaid: '0',
          initialReserved: '0',
          initialOutstanding: '0',
          origin: 'NEW_NO_IMPORTED_STATE_TEST_FIXTURE',
        });
    },
  );

  it('missing source and production evidence remain explicit default denials without reading head or claiming a command', async () => {
    const f = await fixture();
    expect(
      await createFinanceBudgetCommandComposition({
        environment: ENV,
      }).prepareFrom(f),
    ).toMatchObject({
      kind: 'SOURCE_MISSING',
      missing: ['FINANCE_BUDGET_SERVER_SOURCE'],
    });
    expect(
      await createFinanceBudgetCommandComposition({
        source: f.port,
        environment: { ECONMIND_ENV: 'production', NODE_ENV: 'production' },
      }).prepareFrom(f),
    ).toMatchObject({
      kind: 'SOURCE_MISSING',
      missing: ['CORE_NATIVE_BUDGET_EVIDENCE_AND_STORED_EVENT_CONTRACT'],
    });
    expect(f.trace).toEqual([]);
    expect(f.sourceCalls()).toBe(0);
  });

  it('uses source proposal/approval declarations independently of incoming amount and refuses mismatched intent', async () => {
    const f = await fixture();
    f.original.context.proposal.payload.amount = '1001';
    const result = await createFinanceBudgetCommandComposition({
      source: f.port,
      environment: ENV,
    }).prepareFrom(f);
    expect(result).toMatchObject({
      kind: 'CONDITIONAL_PREPARATION_DENIED',
      code: 'BINDING_MISMATCH',
    });
    expect(result).not.toHaveProperty('domain');
  });

  it('never uses a nextState/cache in place of complete source replay', async () => {
    const f = await fixture('APPROVE_NEW_LINE');
    f.replay.steps = [];
    expect(
      await createFinanceBudgetCommandComposition({
        source: f.port,
        environment: ENV,
      }).prepareFrom(f),
    ).toMatchObject({
      kind: 'CONDITIONAL_PREPARATION_DENIED',
      code: 'REPLAY_BINDING_MISMATCH',
    });
  });

  it('denies missing conditional policy facts through the actual Core kernel', async () => {
    const f = await fixture();
    f.original.context.policy.applicability.pop();
    expect(
      await createFinanceBudgetCommandComposition({
        source: f.port,
        environment: ENV,
      }).prepareFrom(f),
    ).toMatchObject({ kind: 'CONDITIONAL_PREPARATION_DENIED' });
  });

  it('rejects unissued authorization, changed revision and changed held World head', async () => {
    const f = await fixture();
    const composition = createFinanceBudgetCommandComposition({
      source: f.port,
      environment: ENV,
    });
    await expect(
      composition.prepareFrom({
        ...f,
        authorization: { ...f.authorization } as AuthorizedOfficeContext,
      }),
    ).rejects.toThrow('Server-issued');
    f.membership.authorizationVersion = 'CHANGED';
    await expect(composition.prepareFrom(f)).rejects.toThrow(
      'authority changed',
    );
    f.membership.authorizationVersion = 'AUTH_REV_TEST';
    f.held.world_version = '1';
    await expect(composition.prepareFrom(f)).rejects.toThrow(
      'World head changed',
    );
    expect(f.sourceCalls()).toBe(0);
  });

  it('rechecks head and current authorization after awaited source consumption', async () => {
    for (const change of ['head', 'authorization'] as const) {
      const f = await fixture();
      await expect(
        withFinanceBudgetRuntimeSourceFrom(
          { ...f, source: f.port, environment: ENV },
          async () => {
            if (change === 'head') f.held.event_sequence = '1';
            else f.membership.active = false;
            return 'NOT_A_COMMIT';
          },
        ),
      ).rejects.toThrow();
    }
  });

  it('rejects a source that returns a result without consuming the exact awaited scope', async () => {
    const f = await fixture();
    const never = vi.fn(async () => 'NOT_CALLED');
    const source: FinanceBudgetRuntimeSourcePort = {
      async withSnapshotFrom() {
        throw Error('Source unavailable');
      },
    };
    await expect(
      withFinanceBudgetRuntimeSourceFrom(
        { ...f, source, environment: ENV },
        never,
      ),
    ).rejects.toThrow('Source unavailable');
    expect(never).not.toHaveBeenCalled();
  });

  it('preserves explicit source MISSING and rejects forged source admission tags', async () => {
    const f = await fixture();
    const missing: FinanceBudgetRuntimeSourcePort = {
      async withSnapshotFrom(_tx, _request, consume) {
        return consume({
          status: 'MISSING',
          missing: ['ORIGINAL_BUDGET_POLICY'],
        });
      },
    };
    expect(
      await createFinanceBudgetCommandComposition({
        source: missing,
        environment: ENV,
      }).prepareFrom(f),
    ).toMatchObject({
      kind: 'SOURCE_MISSING',
      missing: ['ORIGINAL_BUDGET_POLICY'],
    });
    const bad: FinanceBudgetRuntimeSourcePort = {
      async withSnapshotFrom(_tx, request, consume) {
        return consume({
          schemaVersion: 'finance-budget-conditional-source-snapshot-v1',
          evidenceClass: 'ADMITTED' as 'TEST_ONLY',
          sourceId: 'SOURCE_TEST',
          sourceRevision: 'SOURCE_REV_TEST',
          requestBinding: request,
          context: f.original.context,
          replay: f.replay,
        } satisfies FinanceBudgetSourceSnapshot);
      },
    };
    await expect(
      createFinanceBudgetCommandComposition({
        source: bad,
        environment: ENV,
      }).prepareFrom(f),
    ).rejects.toThrow('identity/current cutoff differs');
  });

  it('rejects skipped or duplicate source callbacks and cloned return values', async () => {
    const f = await fixture();
    const zero: FinanceBudgetRuntimeSourcePort = {
      async withSnapshotFrom<Result>() {
        return Object.freeze({}) as Result;
      },
    };
    const duplicate: FinanceBudgetRuntimeSourcePort = {
      async withSnapshotFrom(tx, request, consume) {
        return f.port.withSnapshotFrom(tx, request, async (snapshot) => {
          await consume(snapshot);
          return consume(snapshot);
        });
      },
    };
    const cloned: FinanceBudgetRuntimeSourcePort = {
      async withSnapshotFrom(tx, request, consume) {
        const result = await f.port.withSnapshotFrom(tx, request, consume);
        return structuredClone(result);
      },
    };
    for (const source of [zero, duplicate, cloned]) {
      await expect(
        createFinanceBudgetCommandComposition({
          source,
          environment: ENV,
        }).prepareFrom(f),
      ).rejects.toThrow(/callback|exact result/u);
    }
  });

  it('expires the source consumption callback after its owning scope returns', async () => {
    const f = await fixture();
    let escaped: (() => Promise<unknown>) | undefined;
    const source: FinanceBudgetRuntimeSourcePort = {
      async withSnapshotFrom(tx, request, consume) {
        return f.port.withSnapshotFrom(tx, request, async (snapshot) => {
          escaped = () => consume(snapshot);
          return consume(snapshot);
        });
      },
    };
    expect(
      await createFinanceBudgetCommandComposition({
        source,
        environment: ENV,
      }).prepareFrom(f),
    ).toMatchObject({ kind: 'CONDITIONAL_DRAFT_PREPARED' });
    expect(escaped).toBeDefined();
    await expect(escaped!()).rejects.toThrow('callback lifetime/count differs');
  });

  it('rejects another country or authorization revision in the source-owned request binding', async () => {
    for (const change of [
      { countryId: 'COUNTRY_OTHER_TEST' },
      { authorizationRevision: 'AUTH_OLD_TEST' },
    ]) {
      const f = await fixture();
      const source: FinanceBudgetRuntimeSourcePort = {
        async withSnapshotFrom(tx, request, consume) {
          return f.port.withSnapshotFrom(tx, request, async (snapshot) => {
            if (!('schemaVersion' in snapshot))
              throw Error('Expected source fixture');
            return consume({
              ...snapshot,
              requestBinding: { ...request, ...change },
            });
          });
        },
      };
      await expect(
        createFinanceBudgetCommandComposition({
          source,
          environment: ENV,
        }).prepareFrom(f),
      ).rejects.toThrow('identity/current cutoff differs');
    }
  });
});
