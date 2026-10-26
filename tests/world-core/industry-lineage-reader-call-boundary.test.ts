// Row/protection doubles exercise actual code paths, NOT native/source admission.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  bindAuthoritativeTransition,
  canonicalSerialize,
  createFinalCommandReceipt,
  createOpeningSeed,
  createOpeningSource,
  openingSourceId,
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
  type IndustryPersistenceSchemaReadContextV1,
} from '@econmind/core';
import { createProductionSchemaFixture } from '../support/production-schema-fixture.js';
import { canonicalSerialize as fixtureCanonicalSerialize } from '../../packages/core/src/index.js';
import type { V08AuthoritativeLedgerTransition as FixtureTransition } from '../../packages/core/src/index.js';
import { decodeIndustryProductionRow } from '../../apps/world-worker/src/persistence/industry-production-row-decoder.js';
import { DurableV08LedgerLineageReader } from '../../apps/world-worker/src/persistence/durable-v08-ledger-lineage-reader.js';
import {
  withValidatedCanonicalLineageFrom,
  readValidatedCanonicalLineageFrom,
  type ValidatedCanonicalLineageView,
} from '../../apps/world-worker/src/persistence/validated-canonical-lineage.js';
import {
  ProtectedIndustryProductionGuard,
  type IndustryProductionHistoricalReadGuard,
  type IndustryProductionHistoricalReadRequest,
  type IndustryProductionHistoricalReadObservation,
  type IndustryProductionProtectedSourceAccessor,
} from '../../apps/world-worker/src/persistence/industry-production-source-cutoff.js';
import { IndustryPersistenceCompatibilityProvider } from '../../apps/world-worker/src/persistence/industry-persistence-compatibility.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
type Row = Record<string, unknown>;
function localFixture() {
  const raw = createProductionSchemaFixture();
  // Reconstruct through the SAME @econmind/core instance used by Worker.
  // Never copy SimTime/private brands from the source-level fixture module.
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
    paidLineage: {
      ...paid,
      inventoryPostings: [],
      financialPostingBatches: [funding],
    },
    made: {
      ...executed,
      posting,
      lineage: {
        ...executed,
        inventoryPostings: [posting],
        financialPostingBatches: [],
      },
    },
  };
}
function protocolRows(count = 2, fixtureSeed = false) {
  const f = localFixture(),
    made = f.made;
  const lineage = [f.paidLineage, made.lineage].slice(0, count);
  // Independently constructed SQL-row protocol source; no TEST_FIXTURE object
  // is mutated/retagged/adopted. This source exists ONLY in these row doubles.
  const source = createOpeningSource(
    {
      schemaVersion: 'opening-source-v1',
      sourceId: openingSourceId('SOURCE_TEST_ONLY'),
      sourceKind: 'AUTHORITATIVE_DATASET',
      locator: 'dataset://TEST_ONLY_ROW_PROTOCOL_NOT_ADMITTED',
      sourceVersion: 'TEST_ONLY.1',
      payload: { MOCK_SQL_ONLY: true, sourceAdmitted: false },
    },
    sha,
  );
  const { fingerprint: _ignored, ...intent } = f.seed;
  void _ignored;
  const seed = fixtureSeed
    ? f.seed
    : createOpeningSeed({ ...intent, sources: [source] }, sha);
  const { fingerprint, ...seedIntent } = seed;
  const opening = {
    world_id: seed.worldId,
    seed_id: seed.seedId,
    opening_world_version: '0',
    replay_binding: canonicalSerialize(seed.replayBinding),
    canonical_payload: canonicalSerialize(seedIntent),
    seed_fingerprint: fingerprint,
  };
  const events: Row[] = lineage.flatMap(({ command: c, transition: t }) =>
    t.events.map((e) => ({
      command_actor_id: c.actorId,
      command_auth_subject: c.authSubject,
      command_canonical_payload: c.canonicalPayload,
      command_country_id: c.countryId,
      command_expected_world_version: c.expectedWorldVersion,
      command_fingerprint: c.fingerprint,
      command_id: c.commandId,
      command_idempotency_key: c.idempotencyKey,
      command_office_id: c.officeId,
      command_payload_sha256: c.payloadHash,
      command_schema_version: c.schemaVersion,
      command_sim_time: c.simTime.toCanonicalValue(),
      command_submitted_at_real: c.submittedAtReal,
      command_type: c.commandType,
      command_world_id: c.worldId,
      command_correlation_id: c.correlationId,
      correlation_id: e.correlationId,
      event_canonical_payload: e.canonicalPayload,
      event_causation_command_id: e.causationCommandId,
      event_corrects_event_id: e.correctsEventId,
      event_fingerprint: e.fingerprint,
      event_id: e.eventId,
      event_payload_sha256: e.payloadHash,
      event_recorded_at_real: e.recordedAtReal,
      event_schema_version: e.schemaVersion,
      event_sequence: e.sequence,
      event_sim_time: e.simTime.toCanonicalValue(),
      event_type: e.eventType,
      event_world_id: e.worldId,
      event_world_version: e.worldVersion,
    })),
  );
  const rowsOf = (financial: boolean): Row[] =>
    lineage.flatMap((l) =>
      (financial ? l.financialPostingBatches : l.inventoryPostings).map((p) => {
        const { fingerprint, ...body } = p;
        return {
          causation_command_id: l.command.commandId,
          canonical_payload: canonicalSerialize(body),
          fingerprint,
        };
      }),
    );
  const inventory = rowsOf(false),
    financial = rowsOf(true);
  const receipts: Row[] = lineage.map((l) => {
    const r = createFinalCommandReceipt({
      ...l,
      outcome: 'COMMITTED',
      reasonCode: null,
      simTime: l.command.simTime,
      recordedAtReal: '2026-10-26T00:00:00.000Z',
    });
    return {
      world_id: r.worldId,
      command_id: r.commandId,
      command_fingerprint: r.commandFingerprint,
      schema_version: r.schemaVersion,
      idempotency_key: r.idempotencyKey,
      outcome: r.outcome,
      reason_code: r.reasonCode,
      transition_id: r.transitionId,
      world_version_before: r.worldVersionBefore,
      world_version_after: r.worldVersionAfter,
      sim_time: r.simTime.toCanonicalValue(),
      event_ids: [...r.eventIds],
      recorded_at_real: r.recordedAtReal,
    };
  });
  const trace: string[] = [];
  const tx: SqlExecutor = {
    async query<T extends object>(sql: string, params?: readonly unknown[]) {
      trace.push(sql);
      let rows: readonly Row[];
      if (sql.includes('from world_v2.world_head'))
        rows = [
          { world_version: String(count), event_sequence: String(count) },
        ];
      else if (sql.includes('from world_v2.opening_seed')) rows = [opening];
      else if (sql.includes('from world_v2.authoritative_event event'))
        rows = events;
      else if (sql.includes('from world_v2.inventory_posting'))
        rows = inventory;
      else if (sql.includes('from world_v2.financial_posting_batch'))
        rows = financial;
      else if (sql.includes("outcome = 'COMMITTED'"))
        rows = receipts.map((r) => ({ command_id: r.command_id }));
      else if (sql.includes('from world_v2.command_receipt'))
        rows = receipts.filter((r) => r.command_id === params?.[1]);
      else throw Error('UNEXPECTED_SQL');
      return { rows: rows as readonly T[], rowCount: rows.length };
    },
  };
  const database: SqlDatabase = {
    query: async () => {
      throw Error('POOL_FORBIDDEN');
    },
    transaction: async () => {
      throw Error('NESTED_FORBIDDEN');
    },
  };
  const context: IndustryPersistenceSchemaReadContextV1 = {
    schemaVersion: 'industry-persistence-schema-read-context-v1',
    purpose: 'INDUSTRY_PRODUCTION_CANONICAL_HISTORY_READ',
    worldId: seed.worldId,
    expectedHead: { worldVersion: String(count), eventSequence: String(count) },
    target: {
      targetDeploymentRef: 'TEST_ONLY_TARGET',
      databaseIdentityRef: 'TEST_ONLY_DB',
    },
    build: {
      constructorSourceCommit: 'a'.repeat(40),
      constructorBlobSHA256: 'b'.repeat(64),
      decoderProtocol: 'industry-production-decoder-v1',
      decoderBuildSHA256: 'c'.repeat(64),
    },
  };
  return { f, made, tx, database, context, events, inventory, receipts, trace };
}
function resource(context: IndustryPersistenceSchemaReadContextV1, key = 'R') {
  return {
    targetDatabaseIdentity: context.target.databaseIdentityRef,
    ownerDomainId: key,
    resourceKind: 'TEST_ONLY_RESOURCE',
    canonicalResourceKey: key,
    aliasIdentity: key,
    lockMode: 'SHARE',
    observationRevision: '1',
    protectedPredicateRef: 'TEST_ONLY_PARENT',
    writerProtocolRevision: '1',
    revokerProtocolRevision: '1',
    postlockObservationRef: 'TEST_ONLY_POSTLOCK',
  };
}
function audit(
  r: Readonly<IndustryProductionHistoricalReadRequest>,
): Readonly<IndustryProductionHistoricalReadObservation> {
  return {
    schemaVersion: 'industry-production-historical-read-observation-v1',
    purpose: r.context.purpose,
    worldId: r.context.worldId,
    checkedHead: r.context.expectedHead,
    target: r.context.target,
    build: r.context.build,
    checkedGroups: r.groups.map((g) => ({
      commandFingerprint: g.command.fingerprint,
      transitionBinding: JSON.parse(
        canonicalSerialize(bindAuthoritativeTransition(g, sha)),
      ) as unknown,
      postingIdentities: g.postingIdentities,
    })),
    representationDecision: {
      issuerRef: 'TEST_ONLY_ISSUER',
      custodyRef: 'TEST_ONLY_CUSTODY',
      decisionRef: 'TEST_ONLY_DECISION',
      revision: '1',
      sourceContentHash: `sha256:${'d'.repeat(64)}`,
    },
    lockedResources: [resource(r.context)],
  };
}
function run(
  s: ReturnType<typeof protocolRows>,
  guard?: IndustryProductionHistoricalReadGuard,
  context = s.context,
  consume: (v: ValidatedCanonicalLineageView) => Promise<unknown> = async (v) =>
    readValidatedCanonicalLineageFrom(s.tx, v),
) {
  const reader = new DurableV08LedgerLineageReader({
    database: s.database,
    sha256Hex: sha,
    ...(guard ? { industryReadGuard: guard } : {}),
  });
  return withValidatedCanonicalLineageFrom(
    {
      reader,
      executor: s.tx,
      worldId: s.context.worldId,
      industryReadContext: context,
    },
    consume,
  );
}

describe('Industry actual historical call boundary (protocol evidence only)', () => {
  it.each(['empty', 'stored-command', 'alias'])(
    'runs the real protected orchestration: %s (protocol only)',
    async (kind) => {
      const s = protocolRows(kind === 'stored-command' ? 2 : 0),
        trace: string[] = [];
      const r = resource(s.context, 'A_R'),
        f = resource(s.context, 'Z_F');
      const p = {
        target: s.context.target,
        build: s.context.build,
        representationResources: [r],
        fundingResources: [
          kind === 'alias' ? { ...f, aliasIdentity: r.aliasIdentity } : f,
        ],
      };
      let providers = 0;
      const accessor: IndustryProductionProtectedSourceAccessor = {
        async resolveProtectionFrom(tx) {
          expect(tx).toBe(s.tx);
          trace.push('PLAN');
          return p;
        },
        async acquireResourceFrom(tx, row, rank) {
          expect(tx).toBe(s.tx);
          trace.push(`${rank}:${row.canonicalResourceKey}`);
        },
        async readProtectedPlanFrom(tx) {
          expect(tx).toBe(s.tx);
          trace.push('POSTLOCK');
          return p;
        },
        async readAuthenticatedRepresentationFrom(tx, context) {
          expect(tx).toBe(s.tx);
          trace.push('READ_PURPOSE');
          return {
            context,
            decision: audit({
              context,
              actualHeldHead: {
                worldId: context.worldId,
                ...context.expectedHead,
              },
              groups: [],
            }).representationDecision,
          };
        },
        async readAuthenticatedProductionFrom() {
          throw Error('NO_FRESH_USE_IN_HISTORY');
        },
      };
      const provider = new IndustryPersistenceCompatibilityProvider({
        expectedTarget: s.context.target,
        expectedBuild: s.context.build,
        accessor: {
          async resolveTargetFrom(tx, request) {
            expect(tx).toBe(s.tx);
            providers++;
            expect(request.checkedFor.commandId).toBe(s.made.command.commandId);
            expect(request.checkedFor.commandFingerprint).toBe(
              s.made.command.fingerprint,
            );
            expect(request.checkedFor.head).toEqual(s.context.expectedHead);
            expect(request.checkedFor.simTime).toBe(
              s.made.command.simTime.toCanonicalValue(),
            );
            throw Error('REAL_CATALOG_NOT_SUPPLIED');
          },
          async acquireAdmissionGuardFrom() {
            throw Error('NOT_REACHED');
          },
          async readObservedInputFrom() {
            throw Error('NOT_REACHED');
          },
          async readExpectedInputFrom() {
            throw Error('NOT_REACHED');
          },
        },
      });
      const guard = new ProtectedIndustryProductionGuard({
        accessor,
        compatibilityProvider: provider,
        expectedTarget: s.context.target,
        expectedBuild: s.context.build,
        database: s.database,
        sha256Hex: sha,
      });
      if (kind === 'empty') {
        await run(s, guard);
        expect(providers).toBe(0);
      } else
        await expect(run(s, guard)).rejects.toThrow(
          kind === 'alias' ? 'PLAN_ALIAS' : 'REAL_CATALOG_NOT_SUPPLIED',
        );
      if (kind === 'alias') expect(trace).toEqual(['PLAN']);
      else
        expect(trace.slice(0, 4)).toEqual([
          'PLAN',
          'R:A_R',
          'F:Z_F',
          'POSTLOCK',
        ]);
      if (kind === 'stored-command') expect(providers).toBe(1);
    },
  );
  it('retains legacy production denial without context', async () => {
    const s = protocolRows();
    const reader = new DurableV08LedgerLineageReader({
      database: s.database,
      sha256Hex: sha,
    });
    await expect(
      withValidatedCanonicalLineageFrom(
        { reader, executor: s.tx, worldId: s.context.worldId },
        async () => undefined,
      ),
    ).rejects.toThrow('PRODUCTION_PERSISTENCE_SCHEMA_NOT_ADMITTED');
  });
  it.each([0, 1, 2])(
    'requires the real guard even with %s transitions',
    async (count) => {
      await expect(run(protocolRows(count))).rejects.toThrow(
        'fixed server historical read guard',
      );
    },
  );
  it('empty context invokes guard once with no fake Command/groups', async () => {
    const s = protocolRows(0);
    let calls = 0;
    await run(s, {
      async assertReadFrom(tx, r) {
        expect(tx).toBe(s.tx);
        expect(r.groups).toEqual([]);
        calls++;
        return audit(r);
      },
    });
    expect(calls).toBe(1);
  });
  it('uses genuine full replay/receipt checks and expires the same-executor view', async () => {
    const s = protocolRows();
    let escaped: ValidatedCanonicalLineageView | undefined;
    await run(
      s,
      {
        async assertReadFrom(tx, r) {
          expect(tx).toBe(s.tx);
          return audit(r);
        },
      },
      s.context,
      async (v) => {
        escaped = v;
        const data = readValidatedCanonicalLineageFrom(s.tx, v);
        expect(data.transitions).toHaveLength(2);
        expect(data.ledgers.worldVersion).toBe('2');
        expect(() =>
          readValidatedCanonicalLineageFrom(
            { query: async () => ({ rows: [], rowCount: 0 }) },
            v,
          ),
        ).toThrow('forged');
      },
    );
    expect(() => readValidatedCanonicalLineageFrom(s.tx, escaped!)).toThrow(
      'expired',
    );
    expect(
      s.trace.filter((q) => q.includes('from world_v2.world_head')),
    ).toHaveLength(1);
  });
  it('does not issue a view while protection is pending, then propagates refusal', async () => {
    const s = protocolRows();
    let entered!: () => void;
    const start = new Promise<void>((r) => {
      entered = r;
    });
    let refuse!: (e: Error) => void;
    const pending = new Promise<never>((_, r) => {
      refuse = r;
    });
    let viewed = false;
    const promise = run(
      s,
      {
        async assertReadFrom() {
          entered();
          return pending;
        },
      },
      s.context,
      async () => {
        viewed = true;
      },
    );
    await start;
    expect(viewed).toBe(false);
    refuse(Error('WITHDRAWN'));
    await expect(promise).rejects.toThrow('WITHDRAWN');
    expect(viewed).toBe(false);
  });
  it.each(['world', 'head', 'purpose'])(
    'rejects mismatched %s before invoking guard',
    async (kind) => {
      const s = protocolRows();
      let calls = 0;
      const context = {
        ...s.context,
        ...(kind === 'world'
          ? { worldId: 'OTHER_WORLD' }
          : kind === 'head'
            ? { expectedHead: { worldVersion: '1', eventSequence: '1' } }
            : { purpose: 'INDUSTRY_PRODUCTION_NEW_EFFECT_COMMIT' }),
      } as IndustryPersistenceSchemaReadContextV1;
      await expect(
        run(
          s,
          {
            async assertReadFrom(r, q) {
              void r;
              calls++;
              return audit(q);
            },
          },
          context,
        ),
      ).rejects.toThrow();
      expect(calls).toBe(0);
    },
  );
  it.each([
    'boolean',
    'extra',
    'head',
    'build',
    'target',
    'groups',
    'purpose',
    'getter',
    'proxy',
  ])('rejects %s audit without issuing view', async (kind) => {
    const s = protocolRows();
    let viewed = false,
      hooks = 0;
    await expect(
      run(
        s,
        {
          async assertReadFrom(_tx, r) {
            const a: Record<string, unknown> = { ...audit(r) };
            if (kind === 'boolean')
              return true as unknown as IndustryProductionHistoricalReadObservation;
            if (kind === 'extra') a.allow = true;
            if (kind === 'head')
              a.checkedHead = { worldVersion: '1', eventSequence: '1' };
            if (kind === 'build')
              a.build = {
                ...r.context.build,
                decoderBuildSHA256: 'e'.repeat(64),
              };
            if (kind === 'target')
              a.target = { ...r.context.target, databaseIdentityRef: 'OTHER' };
            if (kind === 'groups') a.checkedGroups = [];
            if (kind === 'purpose') a.purpose = 'SOCIAL_PLAN';
            if (kind === 'getter')
              Object.defineProperty(a, 'purpose', {
                get() {
                  hooks++;
                  return r.context.purpose;
                },
                enumerable: true,
              });
            if (kind === 'proxy')
              a.representationDecision = new Proxy(
                a.representationDecision as object,
                {
                  get() {
                    hooks++;
                    throw Error('HOOK');
                  },
                },
              );
            return a as unknown as IndustryProductionHistoricalReadObservation;
          },
        },
        s.context,
        async () => {
          viewed = true;
        },
      ),
    ).rejects.toThrow();
    expect(viewed).toBe(false);
    expect(hooks).toBe(0);
  });
  it('passes all inventory headers in a production-bearing group before decode', async () => {
    const s = protocolRows(),
      p = JSON.parse(s.inventory[0]!.canonical_payload as string) as Row;
    s.inventory.push({
      causation_command_id: p.causationCommandId,
      fingerprint: `sha256:${'e'.repeat(64)}`,
      canonical_payload: canonicalSerialize({
        ...p,
        schemaVersion: 'inventory-posting-v1',
        operation: 'RESERVE',
        postingId: 'MOVEMENT_HEADER',
      }),
    });
    await expect(
      run(s, {
        async assertReadFrom(_tx, r) {
          expect(r.groups).toHaveLength(1);
          expect(r.groups[0]!.postingIdentities).toHaveLength(2);
          throw Error('STOP_BEFORE_DECODE');
        },
      }),
    ).rejects.toThrow('STOP_BEFORE_DECODE');
  });
  it.each(['unknown', 'mixed'])(
    'rejects %s schema pair before guard',
    async (kind) => {
      const s = protocolRows(),
        p = JSON.parse(s.inventory[0]!.canonical_payload as string) as Row;
      let called = false;
      s.inventory[0]!.canonical_payload = canonicalSerialize({
        ...p,
        ...(kind === 'unknown'
          ? { schemaVersion: 'unknown' }
          : { operation: 'RESERVE' }),
      });
      await expect(
        run(s, {
          async assertReadFrom(_tx, r) {
            called = true;
            return audit(r);
          },
        }),
      ).rejects.toThrow();
      expect(called).toBe(false);
    },
  );
  it('still requires the real production decoder and complete receipt set', async () => {
    const a = protocolRows();
    a.inventory[0]!.fingerprint = `sha256:${'f'.repeat(64)}`;
    await expect(
      run(a, {
        async assertReadFrom(_t, r) {
          return audit(r);
        },
      }),
    ).rejects.toThrow('FINGERPRINT_MISMATCH');
    const b = protocolRows();
    b.receipts.pop();
    await expect(
      run(b, {
        async assertReadFrom(_t, r) {
          return audit(r);
        },
      }),
    ).rejects.toThrow('receipt set');
  });
  it('keeps TEST_FIXTURE opening refusal unchanged', async () => {
    await expect(
      run(protocolRows(2, true), {
        async assertReadFrom(_t, r) {
          return audit(r);
        },
      }),
    ).rejects.toThrow('TEST_FIXTURE');
  });
  it.each(['plan', 'purpose'])(
    'actual guard refuses independently mismatched %s on empty history',
    async (kind) => {
      const s = protocolRows(0),
        trace: string[] = [];
      const p = {
        target: s.context.target,
        build: s.context.build,
        representationResources: [resource(s.context)],
        fundingResources: [],
      };
      const native: IndustryProductionProtectedSourceAccessor = {
        async resolveProtectionFrom() {
          trace.push('PLAN');
          return p;
        },
        async acquireResourceFrom(tx, _r, rank) {
          expect(tx).toBe(s.tx);
          trace.push(rank);
        },
        async readProtectedPlanFrom() {
          trace.push('POSTLOCK');
          return kind === 'plan'
            ? { ...p, representationResources: [resource(s.context, 'OTHER')] }
            : p;
        },
        async readAuthenticatedRepresentationFrom(_tx, context) {
          return {
            context: {
              ...context,
              purpose: 'WRONG',
            } as unknown as typeof context,
            decision: audit({
              context,
              actualHeldHead: {
                worldId: context.worldId,
                ...context.expectedHead,
              },
              groups: [],
            }).representationDecision,
          };
        },
        async readAuthenticatedProductionFrom() {
          throw Error('NOT_CALLED');
        },
      };
      const provider = new IndustryPersistenceCompatibilityProvider({
        accessor: {
          async resolveTargetFrom() {
            throw Error('NO_GROUP_CALL');
          },
          async acquireAdmissionGuardFrom() {
            throw Error('NO_GROUP_CALL');
          },
          async readObservedInputFrom() {
            throw Error('NO_GROUP_CALL');
          },
          async readExpectedInputFrom() {
            throw Error('NO_GROUP_CALL');
          },
        },
        expectedTarget: s.context.target,
        expectedBuild: s.context.build,
      });
      const guard = new ProtectedIndustryProductionGuard({
        accessor: native,
        compatibilityProvider: provider,
        expectedTarget: s.context.target,
        expectedBuild: s.context.build,
        database: s.database,
        sha256Hex: sha,
      });
      await expect(run(s, guard)).rejects.toThrow(
        kind === 'plan' ? 'RESOURCE_PLAN_DRIFT' : 'PURPOSE_MISMATCH',
      );
      expect(trace.slice(0, 3)).toEqual(['PLAN', 'R', 'POSTLOCK']);
    },
  );
});
