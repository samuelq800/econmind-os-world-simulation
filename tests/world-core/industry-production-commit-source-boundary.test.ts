// Controlled SQL/guard/outcome evidence only: NO real source/native positive.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  acquireWorldWriterLease,
  bindAuthoritativeTransition,
  canonicalSerialize,
  createFinalCommandReceipt,
  createProductionConsumptionPosting,
  createWorldWriterCommitAssertion,
  inventoryPostingId,
  workerId,
  worldWriterLeaseRequest,
  Money,
  parseOpeningSeed,
  parseCanonicalCommand,
  parseAuthoritativeEvent,
  createAuthoritativeTransition,
  createFinancialPostingBatch,
  createFinancialAccount,
  financialPostingBatchId,
  financialPostingLegId,
  financialAccountId,
  legalEntityId,
} from '@econmind/core';
import { createProductionSchemaFixture } from '../support/production-schema-fixture.js';
import { canonicalSerialize as fixtureCanonicalSerialize } from '../../packages/core/src/index.js';
import type { V08AuthoritativeLedgerTransition as FixtureTransition } from '../../packages/core/src/index.js';
import { decodeIndustryProductionRow } from '../../apps/world-worker/src/persistence/industry-production-row-decoder.js';
import {
  AtomicTransitionRepository,
  prepareAtomicTransitionCandidate,
} from '../../apps/world-worker/src/persistence/atomic-transition-repository.js';
import type {
  IndustryProductionCutoffRequest,
  IndustryProductionCutoffObservation,
} from '../../apps/world-worker/src/persistence/industry-production-source-cutoff.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const now = '2026-10-26T00:00:01.000Z';
function localFixture() {
  const raw = createProductionSchemaFixture();
  // Rehydrate canonical data, never clone another Core instance's brands.
  function group(g: FixtureTransition) {
    const {
      canonicalPayload,
      payloadHash: _ph,
      fingerprint: _fp,
      simTime,
      ...c
    } = g.command;
    void _ph;
    void _fp;
    const command = parseCanonicalCommand(
      {
        ...c,
        payload: JSON.parse(canonicalPayload) as unknown,
        simTime: simTime.toCanonicalValue(),
      },
      sha,
    );
    const events = g.transition.events.map((e) => {
      const {
        canonicalPayload,
        payloadHash: _ph,
        fingerprint: _fp,
        simTime,
        ...rest
      } = e;
      void _ph;
      void _fp;
      return parseAuthoritativeEvent(
        {
          ...rest,
          payload: JSON.parse(canonicalPayload) as unknown,
          simTime: simTime.toCanonicalValue(),
        },
        sha,
      );
    });
    const transition = createAuthoritativeTransition({
      command,
      worldVersionBefore: g.transition.worldVersionBefore,
      worldVersionAfter: g.transition.worldVersionAfter,
      events,
    });
    return { command, transition };
  }
  const paid = group(raw.paidLineage);
  const funding = createFinancialPostingBatch(
    {
      ...paid,
      schemaVersion: raw.funding.schemaVersion,
      batchId: financialPostingBatchId(raw.funding.batchId),
      worldId: paid.command.worldId,
      causationCommandId: paid.command.commandId,
      causationEventIds: paid.transition.eventIds,
      worldVersionBefore: paid.transition.worldVersionBefore,
      worldVersionAfter: paid.transition.worldVersionAfter,
      settlementCurrency: raw.funding.settlementCurrency,
      simTime: paid.command.simTime,
      legs: raw.funding.legs.map((l) => ({
        legId: financialPostingLegId(l.legId),
        direction: l.direction,
        account: createFinancialAccount({
          worldId: paid.command.worldId,
          countryId: paid.command.countryId,
          ownerId: legalEntityId(l.account.ownerId),
          accountId: financialAccountId(l.account.accountId),
          accountClass: l.account.accountClass,
          currency: l.account.currency,
          claimId: null,
          counterpartyEntityId: null,
        }),
        counterpartyAccountId:
          l.counterpartyAccountId === null
            ? null
            : financialAccountId(l.counterpartyAccountId),
        amount: Money.from(
          l.amount.toCanonicalValue().amount,
          l.amount.currency,
        ),
      })),
    },
    sha,
  );
  const executed = group(raw.make().lineage);
  const { fingerprint, ...body } = JSON.parse(
    fixtureCanonicalSerialize(raw.make().posting),
  ) as Record<string, unknown>;
  const posting = decodeIndustryProductionRow({
    ...executed,
    row: {
      canonical_payload: body,
      causation_command_id: executed.command.commandId,
      fingerprint,
    },
    sha256Hex: sha,
  });
  return {
    seed: parseOpeningSeed(
      JSON.parse(fixtureCanonicalSerialize(raw.seed)) as unknown,
      sha,
    ),
    funding,
    paidLineage: {
      ...paid,
      inventoryPostings: [],
      financialPostingBatches: [funding],
    },
    made: { ...executed, posting },
  };
}
function fixture(extra = false) {
  const f = localFixture(),
    made = f.made;
  const lease = acquireWorldWriterLease(
    null,
    worldWriterLeaseRequest(
      made.command.worldId,
      workerId('D_BOUNDARY_TEST'),
      '2026-10-26T00:00:00.000Z',
      '2026-10-26T01:00:00.000Z',
    ),
  ).lease;
  const receipt = createFinalCommandReceipt({
    ...made,
    outcome: 'COMMITTED',
    reasonCode: null,
    simTime: made.command.simTime,
    recordedAtReal: now,
  });
  const postings = extra
    ? [
        made.posting,
        createProductionConsumptionPosting(
          {
            ...made,
            postingId: inventoryPostingId('SECOND_POSTING'),
            evidence: made.posting.evidence,
          },
          sha,
        ),
      ]
    : [made.posting];
  const candidate = prepareAtomicTransitionCandidate({
    command: made.command,
    commitAuthorization: null,
    sha256Hex: sha,
    draft: {
      transition: made.transition,
      inventoryPostings: postings,
      financialPostingBatches: [],
      receipt,
      outboxMessages: [],
      currentMaterializations: [],
      authorityKind: 'VERSIONED_AUTOMATIC',
      commitAssertion: createWorldWriterCommitAssertion(lease, '1'),
      observedAtReal: now,
    },
  });
  return { f, made, candidate, receipt };
}
function receiptRow(r: ReturnType<typeof fixture>['receipt']) {
  return {
    world_id: r.worldId,
    command_id: r.commandId,
    idempotency_key: r.idempotencyKey,
    schema_version: r.schemaVersion,
    command_fingerprint: r.commandFingerprint,
    outcome: r.outcome,
    reason_code: r.reasonCode,
    transition_id: r.transitionId,
    world_version_before: r.worldVersionBefore,
    world_version_after: r.worldVersionAfter,
    sim_time: r.simTime.toCanonicalValue(),
    event_ids: r.eventIds,
    recorded_at_real: r.recordedAtReal,
  };
}
function audit(
  f: ReturnType<typeof fixture>,
  r: Readonly<IndustryProductionCutoffRequest>,
): Readonly<IndustryProductionCutoffObservation> {
  const p = r.posting,
    op = p.evidence.operating.payload,
    b = f.f.funding,
    old = f.f.paidLineage.command;
  const resources = [
    {
      targetDatabaseIdentity: 'TEST_DB',
      ownerDomainId: 'TEST_OWNER',
      resourceKind: 'FUNDING',
      canonicalResourceKey: 'TEST_FUNDING',
      aliasIdentity: 'TEST_ALIAS',
      lockMode: 'SHARE',
      observationRevision: '1',
      protectedPredicateRef: 'TEST_PARENT',
      writerProtocolRevision: '1',
      revokerProtocolRevision: '1',
      postlockObservationRef: 'TEST_READ',
    },
  ];
  const original = {
    issuerRef: 'TEST_ISSUER',
    custodyRef: 'TEST_CUSTODY',
    qualificationRecordRef: 'TEST_ORIGINAL',
    qualificationRevision: 'OLD',
    sourceContentHash: `sha256:${sha('original')}`,
    ruleRevision: 'OLD_RULE',
    sourceRevision: 'OLD_SOURCE',
    restrictionRevision: 'OLD_RESTRICTION',
    worldId: r.command.worldId,
    countryId: p.evidence.output.countryId,
    operatorId: op.operatorId,
    commandId: old.commandId,
    commandFingerprint: old.fingerprint,
    batchId: b.batchId,
    batchFingerprint: b.fingerprint,
    costLegId: op.costLegId,
    cashAccountId: 'CASH_TEST',
    expenseAccountId: 'EXPENSE_TEST',
    amount: op.settledCost.amount,
    currency: op.settledCost.currency,
    worldVersionBefore: '0',
    worldVersionAfter: '1',
    eventSequenceBefore: '0',
    eventSequenceAfter: '1',
    simTime: '1000',
    scope: 'ORIGINAL_SETTLEMENT',
    disposition: 'ELIGIBLE',
  };
  const current = {
    issuerRef: 'TEST_CURRENT',
    custodyRef: 'TEST_CUSTODY',
    decisionRef: 'TEST_CURRENT_USE',
    revision: 'NEW',
    sourceContentHash: `sha256:${sha('current')}`,
    sourceRevision: 'NEW_SOURCE',
    correctionRevision: null,
    withdrawalRevision: null,
    ruleRevision: 'NEW_RULE',
    worldId: r.command.worldId,
    countryId: p.evidence.output.countryId,
    operatorId: op.operatorId,
    commandId: r.command.commandId,
    commandFingerprint: r.command.fingerprint,
    ...r.expectedHead,
    simTime: '1000',
    validFromTicks: '0',
    validUntilTicks: '2000',
    fundingBatchId: r.fundingBatchId,
    fundingFingerprint: r.fundingFingerprint,
    costLegId: r.costLegId,
    scope: 'CURRENT_PRODUCTION_USE',
    disposition: 'ALLOWED',
    originalApplicability: 'PRESERVE_ORIGINAL',
  };
  const originalCutoff = {
    beforeWorldVersion: '0',
    afterWorldVersion: '1',
    beforeEventSequence: '0',
    afterEventSequence: '1',
    simTime: '1000',
  };
  const checkedHead = { worldId: r.command.worldId, ...r.expectedHead };
  return {
    schemaVersion: 'industry-production-cutoff-observation-v1',
    fundingMode: 'PRIOR_COMMITTED',
    targetBinding: {
      worldId: r.command.worldId,
      countryId: p.evidence.output.countryId,
      operatorId: op.operatorId,
      facilityRef: op.facilityRef,
      commandId: r.command.commandId,
      commandFingerprint: r.command.fingerprint,
      transitionBinding: JSON.parse(
        canonicalSerialize(bindAuthoritativeTransition(r, sha)),
      ) as unknown,
      postingId: p.postingId,
      postingFingerprint: p.fingerprint,
      expectedHead: r.expectedHead,
      simTime: r.command.simTime.toCanonicalValue(),
    },
    fundingBinding: {
      commandId: old.commandId,
      commandFingerprint: old.fingerprint,
      transitionBinding: JSON.parse(
        canonicalSerialize(bindAuthoritativeTransition(f.f.paidLineage, sha)),
      ) as unknown,
      batchId: b.batchId,
      batchFingerprint: b.fingerprint,
      costLegId: op.costLegId,
      amount: op.settledCost.amount,
      currency: op.settledCost.currency,
      cashAccountId: 'CASH_TEST',
      expenseAccountId: 'EXPENSE_TEST',
    },
    historicalEligibilityWitness: { original, current, originalCutoff },
    currentProductionSourceObservations: p.evidence,
    lockedResources: resources,
    targetPrefixBinding: {
      seedId: f.f.seed.seedId,
      seedFingerprint: f.f.seed.fingerprint,
      originalCutoff,
      checkedHead,
      proposedWorldVersion: '2',
      financialBatches: [{ batchId: b.batchId, fingerprint: b.fingerprint }],
    },
    checkedHead,
    checkedCommandFingerprint: r.command.fingerprint,
  };
}
function protocol(
  f: ReturnType<typeof fixture>,
  options: {
    known?: boolean;
    unknownAck?: boolean;
    failAt?: string;
    head?: string;
    onSource?: (
      tx: SqlExecutor,
      r: Readonly<IndustryProductionCutoffRequest>,
    ) => Promise<unknown>;
  } = {},
) {
  const calls: string[] = [];
  let durable = options.known ? f.receipt : null,
    eventCount = 0;
  let unknownAcknowledgementSent = false;
  const command = f.candidate.command;
  const tx: SqlExecutor = {
    async query<T extends object>(sql: string) {
      calls.push(sql);
      let rows: readonly object[] = [];
      if (sql.includes('from world_v2.command_submission'))
        rows = [
          {
            actor_id: command.actorId,
            auth_subject: command.authSubject,
            command_id: command.commandId,
            command_fingerprint: command.fingerprint,
            command_type: command.commandType,
            canonical_payload: command.canonicalPayload,
            correlation_id: command.correlationId,
            country_id: command.countryId,
            idempotency_key: command.idempotencyKey,
            expected_world_version: command.expectedWorldVersion,
            office_id: command.officeId,
            payload_sha256: command.payloadHash,
            schema_version: command.schemaVersion,
            sim_time: command.simTime.toCanonicalValue(),
            submitted_at_real: command.submittedAtReal,
            world_id: command.worldId,
          },
        ];
      else if (sql.includes('from world_v2.command_receipt'))
        rows = durable ? [receiptRow(durable)] : [];
      else if (sql.includes('world_v2.assert_world_writer_commit_guard'))
        rows = [{ world_version: options.head ?? '1', event_sequence: '1' }];
      if (sql.includes('insert into world_v2.authoritative_event'))
        eventCount++;
      return {
        rows: rows as readonly T[],
        rowCount: sql.startsWith('select') ? rows.length : 1,
      };
    },
  };
  const database: SqlDatabase = {
    async query<T extends object>() {
      calls.push('RECOVERY_READ');
      return {
        rows: (durable ? [receiptRow(durable)] : []) as unknown as readonly T[],
        rowCount: durable ? 1 : 0,
      };
    },
    async transaction(fn) {
      calls.push('BEGIN');
      try {
        const result = await fn(tx);
        durable = f.receipt;
        calls.push('COMMIT');
        if (options.unknownAck && !unknownAcknowledgementSent) {
          unknownAcknowledgementSent = true;
          throw Error('ACK_UNKNOWN');
        }
        return result;
      } catch (e) {
        if (!durable) {
          eventCount = 0;
          calls.push('ROLLBACK_PROTOCOL');
        }
        throw e;
      }
    },
  };
  const repository = new AtomicTransitionRepository({
    database,
    workerId: 'D_BOUNDARY_TEST',
    sha256Hex: sha,
    authorizationGuard: {
      async assertCurrent(executor) {
        expect(executor).toBe(tx);
        calls.push('AUTH');
        if (options.known) throw Error('NO_AUTH_AFTER_RECEIPT');
      },
    },
    faultInjector: {
      async hit(phase) {
        calls.push(`PHASE:${phase}`);
        if (phase === options.failAt) throw Error('INJECTED');
      },
    },
    ...(options.onSource
      ? {
          industryProductionCutoffGuard: {
            async assertCurrentFrom(executor, r) {
              calls.push('SOURCE');
              expect(executor).toBe(tx);
              return (await options.onSource!(
                executor,
                r,
              )) as IndustryProductionCutoffObservation;
            },
          },
        }
      : {}),
  });
  return {
    repository,
    calls,
    get events() {
      return eventCount;
    },
  };
}

describe('Industry actual commit source boundary (controlled protocol only)', () => {
  it('recovers exact old receipt with no current guard or eligibility pass', async () => {
    const f = fixture(),
      p = protocol(f, { known: true });
    expect((await p.repository.commit(f.candidate)).source).toBe(
      'EXISTING_COMMIT',
    );
    expect(
      p.calls.some(
        (s) =>
          s === 'AUTH' ||
          s === 'SOURCE' ||
          s.includes('commit_guard') ||
          s.includes('insert into'),
      ),
    ).toBe(false);
  });
  it('missing guard refuses NEW use after S/L/H/A but before Events', async () => {
    const f = fixture(),
      p = protocol(f);
    await expect(p.repository.commit(f.candidate)).rejects.toThrow(
      'fixed source guard',
    );
    expect(p.calls).toContain('AUTH');
    expect(p.calls).not.toContain('PHASE:BEFORE_EVENTS');
    expect(p.events).toBe(0);
  });
  it('freshly re-resolves after preparation and refuses withdrawal', async () => {
    const f = fixture(),
      p = protocol(f, {
        onSource: async () => {
          throw Error('WITHDRAWN_AFTER_PREPARE');
        },
      });
    await expect(p.repository.commit(f.candidate)).rejects.toThrow(
      'WITHDRAWN_AFTER_PREPARE',
    );
    expect(p.events).toBe(0);
    expect(p.calls.indexOf('SOURCE')).toBeGreaterThan(p.calls.indexOf('AUTH'));
  });
  it('awaits same-executor guard with actual H and no events while pending', async () => {
    const f = fixture();
    let ready!: () => void;
    const started = new Promise<void>((r) => {
      ready = r;
    });
    let release!: () => void;
    const pending = new Promise<void>((r) => {
      release = r;
    });
    const p = protocol(f, {
      onSource: async (_tx, r) => {
        expect(r.expectedHead).toEqual({
          worldVersion: '1',
          eventSequence: '1',
        });
        expect(Object.keys(r).sort()).toEqual(
          [
            'command',
            'costLegId',
            'currentMaterializations',
            'expectedHead',
            'fundingBatchId',
            'fundingFingerprint',
            'posting',
            'transition',
          ].sort(),
        );
        expect(r.currentMaterializations).toBe(
          f.candidate.currentMaterializations,
        );
        ready();
        await pending;
        throw Error('SOURCE_REFUSED');
      },
    });
    const attempt = p.repository.commit(f.candidate);
    try {
      await Promise.race([
        started,
        attempt.then(() => {
          throw Error('Commit finished before the guarded source was released');
        }),
      ]);
      expect(p.events).toBe(0);
      expect(p.calls).not.toContain('PHASE:BEFORE_EVENTS');
    } finally {
      release();
    }
    await expect(attempt).rejects.toThrow('SOURCE_REFUSED');
  });
  it('matching protocol audit preserves existing ordered atomic writes, not native proof', async () => {
    const f = fixture(),
      p = protocol(f, { onSource: async (_tx, r) => audit(f, r) });
    expect((await p.repository.commit(f.candidate)).source).toBe('NEW_COMMIT');
    expect(p.events).toBe(1);
    expect(p.calls.indexOf('SOURCE')).toBeLessThan(
      p.calls.indexOf('PHASE:BEFORE_EVENTS'),
    );
    const phases = [
      'AFTER_EVENTS',
      'AFTER_INVENTORY_POSTINGS',
      'AFTER_FINANCIAL_POSTINGS',
      'AFTER_RECEIPT',
      'AFTER_WORLD_HEAD',
    ];
    expect(phases.map((x) => p.calls.indexOf(`PHASE:${x}`))).toEqual(
      [...phases.map((x) => p.calls.indexOf(`PHASE:${x}`))].sort(
        (a, b) => a - b,
      ),
    );
  });
  it('unknown acknowledgement recovers one exact receipt without redispatch', async () => {
    const f = fixture();
    let guards = 0;
    const p = protocol(f, {
      unknownAck: true,
      onSource: async (_tx, r) => {
        guards++;
        return audit(f, r);
      },
    });
    expect((await p.repository.commit(f.candidate)).source).toBe(
      'RECOVERED_AFTER_UNKNOWN_ACKNOWLEDGEMENT',
    );
    expect((await p.repository.commit(f.candidate)).source).toBe(
      'EXISTING_COMMIT',
    );
    expect(guards).toBe(1);
    expect(p.events).toBe(1);
  });
  it.each([
    'boolean',
    'social',
    'head',
    'command',
    'witness',
    'original',
    'current',
    'sources',
    'resource',
    'extra',
    'getter',
  ])('rejects %s audit before events', async (kind) => {
    const f = fixture();
    let hooks = 0;
    const p = protocol(f, {
      onSource: async (_tx, r) => {
        if (kind === 'boolean') return true;
        const a = JSON.parse(JSON.stringify(audit(f, r))) as Record<
          string,
          unknown
        >;
        if (kind === 'social')
          return {
            status: 'CURRENT_SOURCE_RECHECKED_NOT_AUTHORITY',
            purpose: 'SOCIAL_PLAN',
          };
        if (kind === 'head')
          a.checkedHead = {
            worldId: r.command.worldId,
            worldVersion: '0',
            eventSequence: '0',
          };
        if (kind === 'command')
          a.checkedCommandFingerprint = `sha256:${'a'.repeat(64)}`;
        if (kind === 'witness') a.historicalEligibilityWitness = {};
        const w = a.historicalEligibilityWitness as {
          original: Row;
          current: Row;
        };
        if (kind === 'original') w.original.amount = '7';
        if (kind === 'current') w.current.disposition = 'WITHDRAWN';
        if (kind === 'sources') a.currentProductionSourceObservations = {};
        if (kind === 'resource') a.lockedResources = [];
        if (kind === 'extra') a.allow = true;
        if (kind === 'getter')
          Object.defineProperty(a, 'schemaVersion', {
            get() {
              hooks++;
              throw Error('HOOK');
            },
            enumerable: true,
          });
        return a;
      },
    });
    await expect(p.repository.commit(f.candidate)).rejects.toThrow();
    expect(p.events).toBe(0);
    expect(hooks).toBe(0);
  });
  it('does not validate only a production subset of a larger candidate', async () => {
    const f = fixture(true);
    let called = false;
    const p = protocol(f, {
      onSource: async (_tx, r) => {
        called = true;
        return audit(f, r);
      },
    });
    await expect(p.repository.commit(f.candidate)).rejects.toThrow(
      'complete supported',
    );
    expect(called).toBe(false);
    expect(p.events).toBe(0);
  });
  it('actual stale H refuses before source', async () => {
    const f = fixture();
    let called = false;
    const p = protocol(f, {
      head: '0',
      onSource: async (_tx, r) => {
        called = true;
        return audit(f, r);
      },
    });
    await expect(p.repository.commit(f.candidate)).rejects.toThrow(
      'different WorldVersion',
    );
    expect(called).toBe(false);
  });
  it.each(['AFTER_EVENTS', 'AFTER_RECEIPT', 'BEFORE_TRANSACTION_COMMIT'])(
    'keeps %s failure atomic in the outcome protocol',
    async (failAt) => {
      const f = fixture(),
        p = protocol(f, { failAt, onSource: async (_tx, r) => audit(f, r) });
      await expect(p.repository.commit(f.candidate)).rejects.toThrow(
        'INJECTED',
      );
      expect(p.calls).toContain('ROLLBACK_PROTOCOL');
      expect(p.events).toBe(0);
    },
  );
});
type Row = Record<string, unknown>;
