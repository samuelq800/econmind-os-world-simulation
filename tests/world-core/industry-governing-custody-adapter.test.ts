/** SQL/owner protocol doubles only. No native adoption, governing original or admission positive. */
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import {
  bindAuthoritativeTransition,
  canonicalSerialize,
  canonicalHashInput,
  canonicalSha256,
} from '@econmind/core';
import {
  canonicalSerialize as wire,
  createFinalCommandReceipt,
  createOpeningSeed,
  createOpeningSource,
  openingSourceId,
} from '../../packages/core/src/index.js';
import { createProductionSchemaFixture } from '../support/production-schema-fixture.js';
import {
  IndustryGoverningCustodyAdapter,
  type IndustryGoverningProtectedOwner,
} from '../../apps/world-worker/src/projections/industry-governing-custody-adapter.js';
import type { IndustryGoverningSnapshotRequest } from '../../apps/world-worker/src/projections/industry-production-governing-source.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
type Row = Record<string, unknown>;
function protocol() {
  const f = createProductionSchemaFixture(),
    made = f.make();
  const groups = [f.paidLineage, made.lineage];
  // Independent inert row-protocol dataset, not a retagged/adopted TEST_FIXTURE
  // object. These rows never enter a real database or an admitted source owner.
  const openingSource = createOpeningSource(
    {
      schemaVersion: 'opening-source-v1',
      sourceId: openingSourceId(f.seed.sources[0]!.sourceId),
      sourceKind: 'AUTHORITATIVE_DATASET',
      locator: 'dataset://TEST_ONLY_CUSTODY_ROW_PROTOCOL_NOT_ADMITTED',
      sourceVersion: 'TEST_ONLY.1',
      payload: { TEST_ONLY: 'SQL_PROTOCOL_NOT_SOURCE_ADMISSION' },
    },
    sha,
  );
  const { fingerprint: ignored, ...intent } = f.seed;
  void ignored;
  const seed = createOpeningSeed({ ...intent, sources: [openingSource] }, sha);
  const { fingerprint, ...seedIntent } = seed;
  const opening = {
    world_id: seed.worldId,
    seed_id: seed.seedId,
    opening_world_version: '0',
    replay_binding: wire(seed.replayBinding),
    canonical_payload: wire(seedIntent),
    seed_fingerprint: fingerprint,
  };
  const events: Row[] = groups.flatMap(({ command: c, transition: t }) =>
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
  const postingRows = (financial: boolean) =>
    groups.flatMap((g) =>
      (financial ? g.financialPostingBatches : g.inventoryPostings).map((p) => {
        const { fingerprint, ...body } = p;
        return {
          causation_command_id: g.command.commandId,
          canonical_payload: wire(body),
          fingerprint,
        };
      }),
    );
  const receipts = groups.map((g) => {
    const r = createFinalCommandReceipt({
      ...g,
      outcome: 'COMMITTED',
      reasonCode: null,
      simTime: g.command.simTime,
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
  const profile = {
    target: {
      targetDeploymentRef: 'TEST_ONLY_CUSTODY_TARGET',
      databaseIdentityRef: 'TEST_ONLY_CUSTODY_DB',
    },
    build: {
      constructorSourceCommit: 'a'.repeat(40),
      constructorBlobSHA256: 'b'.repeat(64),
      decoderProtocol: 'industry-production-decoder-v1' as const,
      decoderBuildSHA256: 'c'.repeat(64),
    },
  };
  const request: IndustryGoverningSnapshotRequest = {
    publicationHead: {
      worldId: seed.worldId,
      worldVersion: '2',
      eventSequence: '2',
    },
    worldBinding: {
      seedId: seed.seedId,
      seedFingerprint: seed.fingerprint,
      modelVersion: seed.replayBinding.modelVersion,
      replayBindingFingerprint: canonicalSha256(
        canonicalHashInput(seed.replayBinding),
        sha,
      ),
    },
    scope: {
      worldId: seed.worldId,
      countryId: made.lineage.command.countryId,
      classification: 'OFFICE_PRIVATE',
      officeId: 'INDUSTRY',
    },
    purpose: 'INDUSTRY_COMMITTED_PRODUCTION_OUTPUT_AFTER_ONLY',
    targetHistory: {
      commandId: made.lineage.command.commandId,
      commandFingerprint: made.lineage.command.fingerprint,
      eventId: made.lineage.transition.events[0]!.eventId,
      eventFingerprint: made.lineage.transition.events[0]!.fingerprint,
      postingId: made.posting.postingId,
      postingFingerprint: made.posting.fingerprint,
    },
  };
  const trace: string[] = [];
  let transaction = '101',
    databaseName = 'test_only_custody',
    head = '2';
  const inventory = postingRows(false),
    financial = postingRows(true);
  const tx: SqlExecutor = {
    async query<T extends object>(
      sql: string,
      params: readonly unknown[] = [],
    ) {
      trace.push(sql);
      let rows: readonly Row[];
      if (sql.includes('pg_current_xact_id()'))
        rows = [
          {
            backend_pid: '11',
            transaction_id: transaction,
            database_name: databaseName,
          },
        ];
      else if (sql.includes('from world_v2.world_head'))
        rows = [{ world_version: head, event_sequence: head }];
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
        rows = receipts.filter((r) => r.command_id === params[1]);
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
  const guard = vi.fn<IndustryGoverningProtectedOwner['assertReadFrom']>(
    async (executor, r) => {
      expect(executor).toBe(tx);
      expect(r.context.target).toEqual(profile.target);
      expect(r.context.build).toEqual(profile.build);
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
          decisionRef: 'TEST_ONLY_READ_DECISION',
          revision: '1',
          sourceContentHash: `sha256:${'d'.repeat(64)}`,
        },
        lockedResources: [
          {
            targetDatabaseIdentity: r.context.target.databaseIdentityRef,
            ownerDomainId: 'TEST_ONLY_DOMAIN',
            resourceKind: 'TEST_ONLY_RESOURCE',
            canonicalResourceKey: 'TEST_ONLY_KEY',
            aliasIdentity: 'TEST_ONLY_ALIAS',
            lockMode: 'SHARE',
            observationRevision: '1',
            protectedPredicateRef: 'TEST_ONLY_PARENT',
            writerProtocolRevision: '1',
            revokerProtocolRevision: '1',
            postlockObservationRef: 'TEST_ONLY_POSTLOCK',
          },
        ],
      };
    },
  );
  const snapshot = Object.freeze({
    kind: 'INERT_TEST_PROTOCOL_NOT_A_GOVERNING_SNAPSHOT',
  });
  const source = vi.fn();
  const owner: IndustryGoverningProtectedOwner = {
    assertReadFrom: guard,
    async withSnapshotFrom(executor, r, consume) {
      source(executor, r);
      return consume(snapshot);
    },
  };
  const adapter = (configured = owner) =>
    new IndustryGoverningCustodyAdapter({
      database,
      expectedDatabaseName: 'test_only_custody',
      ...profile,
      owner: configured,
    });
  return {
    tx,
    profile,
    database,
    request,
    owner,
    adapter,
    trace,
    guard,
    source,
    snapshot,
    opening,
    events,
    setTransaction: (v: string) => {
      transaction = v;
    },
    setDatabase: (v: string) => {
      databaseName = v;
    },
    setHead: (v: string) => {
      head = v;
    },
  };
}

describe('Industry governing protected composition (SQL doubles, not native admission)', () => {
  it('rejects real embedded SQL autocommit and reaches fail-closed missing durable schema only inside an actual transaction', async () => {
    const p = protocol();
    const db = new PGlite();
    const statements: string[] = [];
    try {
      const databaseName = (
        await db.query<{ name: string }>('select current_database() as name')
      ).rows[0]!.name;
      const adapter = new IndustryGoverningCustodyAdapter({
        database: p.database,
        expectedDatabaseName: databaseName,
        ...p.profile,
        owner: p.owner,
      });
      const executor = (connection: Pick<PGlite, 'query'>): SqlExecutor => ({
        async query<T extends object>(
          sql: string,
          values: readonly unknown[] = [],
        ) {
          statements.push(sql);
          const result = await connection.query<T>(sql, [...values]);
          return { rows: result.rows, rowCount: result.rows.length };
        },
      });
      await expect(
        adapter.withSnapshotFrom(executor(db), p.request, async () => null),
      ).rejects.toThrow('OWNING_TRANSACTION_CHANGED');
      expect(statements).toHaveLength(2);
      statements.length = 0;
      await expect(
        db.transaction(async (transaction) =>
          adapter.withSnapshotFrom(
            executor(transaction),
            p.request,
            async () => null,
          ),
        ),
      ).rejects.toThrow('world_v2.world_head');
      expect(statements).toHaveLength(3);
      expect(p.guard).not.toHaveBeenCalled();
      expect(p.source).not.toHaveBeenCalled();
    } finally {
      await db.close();
    }
  }, 60_000);
  it('requires the missing authentic shared owner instead of installing a default or admitting source flags', () => {
    const p = protocol();
    expect(
      () =>
        new IndustryGoverningCustodyAdapter({
          database: p.database,
          expectedDatabaseName: 'test_only_custody',
          ...p.profile,
          owner: null,
        }),
    ).toThrow('AUTHENTIC_GOVERNING_PROTECTED_OWNER_REQUIRED');
    expect(p.trace).toEqual([]);
  });
  it('uses the real reader/guard/constructor prefix and passed transaction before and after one awaited protocol snapshot', async () => {
    const p = protocol();
    const result = { protocolOnly: true };
    await expect(
      p.adapter().withSnapshotFrom(p.tx, p.request, async (snapshot) => {
        expect(snapshot).toBe(p.snapshot);
        expect(p.guard).toHaveBeenCalledTimes(1);
        return result;
      }),
    ).resolves.toBe(result);
    expect(p.guard).toHaveBeenCalledTimes(2);
    expect(p.source).toHaveBeenCalledOnce();
    expect(p.source).toHaveBeenCalledWith(p.tx, p.request);
    expect(
      p.trace.filter((sql) => sql.includes('from world_v2.world_head')),
    ).toHaveLength(2);
    expect(p.trace.every((sql) => /^\s*select\b/iu.test(sql))).toBe(true);
    expect(
      p.trace
        .filter((sql) => sql.includes('world_head'))
        .every((sql) => sql.includes('for share')),
    ).toBe(true);
    expect(result).not.toHaveProperty('native');
    expect(result).not.toHaveProperty('sourceAdmitted');
  });
  it('denies autocommit/pool executor identity changes before reading lineage or invoking custody', async () => {
    const p = protocol();
    let n = 0;
    const tx: SqlExecutor = {
      async query<T extends object>() {
        n++;
        return {
          rows: [
            {
              backend_pid: '11',
              transaction_id: String(n),
              database_name: 'test_only_custody',
            },
          ] as unknown as readonly T[],
          rowCount: 1,
        };
      },
    };
    await expect(
      p.adapter().withSnapshotFrom(tx, p.request, async () => null),
    ).rejects.toThrow('OWNING_TRANSACTION_CHANGED');
    expect(p.guard).not.toHaveBeenCalled();
    expect(p.source).not.toHaveBeenCalled();
    expect(n).toBe(2);
  });
  it('denies a different actual database and caller-supplied native/view/snapshot flags', async () => {
    const p = protocol();
    p.setDatabase('other_database');
    await expect(
      p.adapter().withSnapshotFrom(p.tx, p.request, async () => null),
    ).rejects.toThrow('ACTUAL_DATABASE_TRANSACTION_REQUIRED');
    p.trace.length = 0;
    await expect(
      p
        .adapter()
        .withSnapshotFrom(
          p.tx,
          { ...p.request, native: true } as IndustryGoverningSnapshotRequest,
          async () => null,
        ),
    ).rejects.toThrow('CLOSED_RECORD_REQUIRED');
    expect(p.trace).toEqual([]);
    expect(p.source).not.toHaveBeenCalled();
  });
  it('denies changed actual head, seed or exact production cause before custody access', async () => {
    for (const change of ['head', 'seed', 'cause', 'absent'] as const) {
      const p = protocol();
      const request = JSON.parse(
        JSON.stringify(p.request),
      ) as IndustryGoverningSnapshotRequest;
      if (change === 'head') p.setHead('3');
      if (change === 'seed')
        Object.assign(request.worldBinding, {
          seedFingerprint: `sha256:${'e'.repeat(64)}`,
        });
      if (change === 'cause')
        Object.assign(request.targetHistory, {
          postingFingerprint: `sha256:${'e'.repeat(64)}`,
        });
      if (change === 'absent')
        Object.assign(request.targetHistory, {
          postingId: 'POSTING_MISSING_TEST',
        });
      await expect(
        p.adapter().withSnapshotFrom(p.tx, request, async () => null),
      ).rejects.toThrow();
      expect(p.source).not.toHaveBeenCalled();
    }
  });
  it('does not consult governing originals when the configured history guard refuses', async () => {
    const p = protocol();
    p.guard.mockRejectedValue(
      Error('ORIGINAL_REPRESENTATION_ADMISSION_MISSING'),
    );
    await expect(
      p.adapter().withSnapshotFrom(p.tx, p.request, async () => null),
    ).rejects.toThrow('ORIGINAL_REPRESENTATION_ADMISSION_MISSING');
    expect(p.source).not.toHaveBeenCalled();
  });
  it('rechecks transaction and actual prefix after consume while owner resources are still held', async () => {
    for (const change of ['transaction', 'head'] as const) {
      const p = protocol();
      await expect(
        p.adapter().withSnapshotFrom(p.tx, p.request, async () => {
          if (change === 'transaction') p.setTransaction('102');
          else p.setHead('3');
          return null;
        }),
      ).rejects.toThrow();
      expect(p.source).toHaveBeenCalledOnce();
    }
  });
  it('refuses a replaced owner return, duplicate callback and same-transaction reentry', async () => {
    const p = protocol();
    const replaced: IndustryGoverningProtectedOwner = {
      ...p.owner,
      async withSnapshotFrom(_tx, _request, consume) {
        await consume(p.snapshot);
        return {} as never;
      },
    };
    await expect(
      p.adapter(replaced).withSnapshotFrom(p.tx, p.request, async () => ({})),
    ).rejects.toThrow('GOVERNING_OWNER_MUST_AWAIT_OWN_CALLBACK');
    const duplicate: IndustryGoverningProtectedOwner = {
      ...p.owner,
      async withSnapshotFrom(_tx, _request, consume) {
        await consume(p.snapshot);
        return consume(p.snapshot);
      },
    };
    await expect(
      p.adapter(duplicate).withSnapshotFrom(p.tx, p.request, async () => null),
    ).rejects.toThrow('GOVERNING_OWNER_CALLBACK_LIFETIME');
    const adapter = p.adapter();
    await expect(
      adapter.withSnapshotFrom(p.tx, p.request, async () =>
        adapter.withSnapshotFrom(p.tx, p.request, async () => null),
      ),
    ).rejects.toThrow('REENTRANT_GOVERNING_CUSTODY');
  });
  it('expires an unawaited owner callback before it can expose snapshot bytes', async () => {
    const p = protocol();
    let pending: Promise<unknown> | undefined;
    const consume = vi.fn(async () => null);
    const escaped: IndustryGoverningProtectedOwner = {
      ...p.owner,
      async withSnapshotFrom(_tx, _request, callback) {
        pending = callback(p.snapshot);
        void pending.catch(() => undefined);
        return {} as never;
      },
    };
    await expect(
      p.adapter(escaped).withSnapshotFrom(p.tx, p.request, consume),
    ).rejects.toThrow('GOVERNING_OWNER_MUST_AWAIT_OWN_CALLBACK');
    await expect(pending).rejects.toThrow();
    expect(consume).not.toHaveBeenCalled();
  });
});
