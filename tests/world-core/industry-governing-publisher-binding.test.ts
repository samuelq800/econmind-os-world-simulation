// Actual classes over an empty nonproduction SQL protocol. Not native source,
// adoption, locking, rollback or a production-publication positive.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CURRENT_REPLAY_BINDING,
  COMMAND_SCHEMA_VERSION,
  EVENT_SCHEMA_VERSION,
  PRODUCTION_SETTLED_EVENT_TYPE,
  OPENING_SEED_SCHEMA_VERSION,
  OPENING_SOURCE_SCHEMA_VERSION,
  acquireWorldWriterLease,
  worldWriterLeaseRequest,
  createWorldWriterCommitAssertion,
  canonicalSerialize,
  createOpeningSource,
  createOpeningSeed,
  openingSourceId,
  openingSeedId,
  workerId,
  worldId,
  parseCanonicalCommand,
  parseAuthoritativeEvent,
  createAuthoritativeTransition,
  createFinalCommandReceipt,
} from '@econmind/core';
import { AuthoritativeActivityReadProjectionPublisher } from '../../apps/world-worker/src/projections/authoritative-activity-read-projection-publisher.js';
import { readIndustryOfficeDecisionResultFrom } from '../../apps/world-worker/src/projections/office-decision-result-projector.js';
import { DurableV08LedgerLineageReader } from '../../apps/world-worker/src/persistence/durable-v08-ledger-lineage-reader.js';
import {
  withValidatedCanonicalLineageFrom,
  type ValidatedCanonicalLineageView,
} from '../../apps/world-worker/src/persistence/validated-canonical-lineage.js';
import type { IndustryGoverningCustodyPort } from '../../apps/world-worker/src/projections/industry-production-governing-source.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';
import { assertDecisionResultPayload } from '../../apps/world-api/src/integration/office-decision-result-validator.js';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const WORLD = worldId('WORLD_INDUSTRY_CONSUMER_EMPTY_TEST'),
  WORKER = workerId('WORKER_INDUSTRY_CONSUMER_TEST');
const at = '2026-10-25T08:00:00.000Z';
const scope = {
  worldId: WORLD,
  countryId: 'COUNTRY_01',
  classification: 'OFFICE_PRIVATE' as const,
  officeId: 'INDUSTRY',
};
type Row = Record<string, unknown>;
function protocol(
  input: {
    badLineageHead?: boolean;
    productionLedgerRow?: boolean;
    otherOfficeOnly?: boolean;
  } = {},
) {
  const source = createOpeningSource(
    {
      schemaVersion: OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: openingSourceId('SOURCE_EMPTY_G_INDUSTRY_PROTOCOL'),
      sourceKind: 'AUTHORITATIVE_DATASET',
      locator:
        'dataset://TEST_ONLY_EMPTY_NONPRODUCTION_SQL_PROTOCOL_NOT_ADMITTED',
      sourceVersion: 'TEST_ONLY.1',
      payload: { TEST_ONLY: 'EMPTY_PROTOCOL_NOT_SOURCE_ADMISSION' },
    },
    sha,
  );
  const seed = createOpeningSeed(
    {
      schemaVersion: OPENING_SEED_SCHEMA_VERSION,
      seedId: openingSeedId('SEED_EMPTY_G_INDUSTRY_PROTOCOL'),
      worldId: WORLD,
      openingWorldVersion: '0',
      replayBinding: CURRENT_REPLAY_BINDING,
      sources: [source],
      inventoryEntries: [],
      financialBatches: [],
    },
    sha,
  );
  const { fingerprint: _fingerprint, ...seedIntent } = seed;
  void _fingerprint;
  const queries: string[] = [],
    writes: { classification: string; payload: Row }[] = [];
  let headReads = 0,
    transactions = 0,
    custodyCalls = 0;
  const executor: SqlExecutor = {
    async query<Result>(sql: string, parameters = []) {
      queries.push(sql);
      let rows: unknown[];
      if (sql.includes('assert_world_writer_commit_guard'))
        rows = [{ world_version: '0', event_sequence: '0' }];
      else if (sql.includes('current_commit_authorization'))
        rows = (
          input.otherOfficeOnly ? ['SOCIAL'] : ['INDUSTRY', 'SOCIAL']
        ).map((office_id) => ({ country_id: 'COUNTRY_01', office_id }));
      else if (sql.includes('to_regclass'))
        rows = [{ opening: null, admission: null }];
      else if (sql.includes('from world_v2.world_head')) {
        headReads++;
        rows = [
          {
            world_version: input.badLineageHead && headReads >= 2 ? '1' : '0',
            event_sequence: '0',
          },
        ];
      } else if (sql.includes('from world_v2.opening_seed'))
        rows = [
          {
            world_id: WORLD,
            seed_id: seed.seedId,
            opening_world_version: '0',
            replay_binding: canonicalSerialize(seed.replayBinding),
            canonical_payload: canonicalSerialize(seedIntent),
            seed_fingerprint: seed.fingerprint,
          },
        ];
      else if (
        sql.includes('from world_v2.inventory_posting') &&
        input.productionLedgerRow
      )
        rows = [
          {
            canonical_payload: canonicalSerialize({
              schemaVersion: 'production-consumption-posting-v1',
            }),
            world_version_after: '0',
          },
        ];
      else if (
        sql.includes('from world_v2.authoritative_event') ||
        sql.includes('from world_v2.inventory_posting') ||
        sql.includes('from world_v2.financial_posting_batch') ||
        sql.includes('from world_v2.command_receipt')
      )
        rows = [];
      else if (sql.includes('delete from world_v2.read_projection')) rows = [];
      else if (sql.includes('insert into world_v2.read_projection')) {
        writes.push({
          classification: String(parameters[1]),
          payload: JSON.parse(String(parameters[6])) as Row,
        });
        rows = [];
      } else if (
        sql.includes('count(*)') &&
        sql.includes('from world_v2.read_projection')
      )
        rows = [{ count: '0' }];
      else throw new Error('Unexpected protocol query');
      return { rows: rows as Result[], rowCount: rows.length };
    },
  };
  const database: SqlDatabase = {
    query: async () => {
      throw new Error('Unexpected pool query');
    },
    transaction: async (fn) => {
      transactions++;
      return fn(executor);
    },
  };
  const custody: IndustryGoverningCustodyPort = {
    async withSnapshotFrom() {
      custodyCalls++;
      throw new Error(
        'No genuine production target: custody must not be called',
      );
    },
  };
  const lease = acquireWorldWriterLease(
    null,
    worldWriterLeaseRequest(WORLD, WORKER, at, '2026-10-25T09:00:00.000Z'),
  );
  return {
    executor,
    database,
    queries,
    writes,
    custody,
    assertion: createWorldWriterCommitAssertion(lease.lease, '0'),
    calls: () => ({ transactions, custodyCalls }),
    reader: new DurableV08LedgerLineageReader({ database, sha256Hex: sha }),
  };
}
/** Deliberately invalid production-domain evidence, but genuine canonical
 * Commands/Events/receipts and NO production inventory row. This can exercise
 * the actual reader/selector negative without minting a production view/positive. */
function correctionProtocol(mode: 'related' | 'plain' | 'unrelated') {
  const base = protocol();
  const history: {
    command: ReturnType<typeof parseCanonicalCommand>;
    event: ReturnType<typeof parseAuthoritativeEvent>;
    transition: ReturnType<typeof createAuthoritativeTransition>;
    receipt: ReturnType<typeof createFinalCommandReceipt>;
  }[] = [];
  for (let n = 1; n <= 2; n++) {
    const command = parseCanonicalCommand(
      {
        schemaVersion: COMMAND_SCHEMA_VERSION,
        actorId: 'ACTOR_CANONICAL_NEGATIVE_TEST',
        authSubject: '11111111-1111-4111-8111-111111111111',
        commandId: `COMMAND_CANONICAL_NEGATIVE_${n}`,
        commandType: 'TEST_CANONICAL_ONLY_COMMAND',
        correlationId: 'TRACE_CANONICAL_NEGATIVE',
        countryId: scope.countryId,
        worldId: WORLD,
        officeId: mode === 'unrelated' ? 'SOCIAL' : 'INDUSTRY',
        expectedWorldVersion: String(n - 1),
        idempotencyKey: `IDEM_CANONICAL_NEGATIVE_${n}`,
        simTime: '1000',
        submittedAtReal: at,
        payload: { TEST_ONLY: 'CANONICAL_ONLY_NOT_VALID_PRODUCTION_SOURCE' },
      },
      sha,
    );
    const event = parseAuthoritativeEvent(
      {
        schemaVersion: EVENT_SCHEMA_VERSION,
        eventId: `EVENT_CANONICAL_NEGATIVE_${n}`,
        eventType:
          n === 1 && mode !== 'unrelated'
            ? PRODUCTION_SETTLED_EVENT_TYPE
            : 'TEST_LATER_NONPROJECTABLE_EVENT',
        worldId: WORLD,
        causationCommandId: command.commandId,
        correlationId: command.correlationId,
        worldVersion: String(n),
        sequence: String(n),
        simTime: '1000',
        recordedAtReal: at,
        correctsEventId:
          n === 2 && mode !== 'plain' ? 'EVENT_CANONICAL_NEGATIVE_1' : null,
        payload: { TEST_ONLY: 'NO_PRODUCTION_POSTING_NO_ADMISSION' },
      },
      sha,
    );
    const transition = createAuthoritativeTransition({
      command,
      events: [event],
      worldVersionBefore: String(n - 1),
      worldVersionAfter: String(n),
    });
    const receipt = createFinalCommandReceipt({
      command,
      transition,
      outcome: 'COMMITTED',
      reasonCode: null,
      simTime: command.simTime,
      recordedAtReal: at,
    });
    history.push({ command, event, transition, receipt });
  }
  const executor: SqlExecutor = {
    async query<Result>(sql: string, parameters = []) {
      let rows: unknown[] | undefined;
      if (sql.includes('from world_v2.world_head'))
        rows = [{ world_version: '2', event_sequence: '2' }];
      else if (sql.includes('from world_v2.authoritative_event'))
        rows = history.map(({ command: c, event: e }) => ({
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
        }));
      else if (sql.includes('select command_id from world_v2.command_receipt'))
        rows = history.map((v) => ({ command_id: v.command.commandId }));
      else if (sql.includes('from world_v2.command_receipt'))
        rows = history
          .filter((v) => v.command.commandId === parameters[1])
          .map(({ receipt: r }) => ({
            schema_version: r.schemaVersion,
            world_id: r.worldId,
            command_id: r.commandId,
            idempotency_key: r.idempotencyKey,
            command_fingerprint: r.commandFingerprint,
            outcome: r.outcome,
            reason_code: r.reasonCode,
            transition_id: r.transitionId,
            world_version_before: r.worldVersionBefore,
            world_version_after: r.worldVersionAfter,
            sim_time: r.simTime.toCanonicalValue(),
            event_ids: r.eventIds,
            recorded_at_real: r.recordedAtReal,
          }));
      if (rows === undefined) {
        const result = await base.executor.query(sql, parameters);
        return { ...result, rows: result.rows as Result[] };
      }
      return { rows: rows as Result[], rowCount: rows.length };
    },
  };
  return { ...base, executor };
}

describe('Industry latest correction integrity versus ordinary unavailable', () => {
  it('rejects a related latest correction before nonprojectable manual fallback', async () => {
    const f = correctionProtocol('related');
    await withValidatedCanonicalLineageFrom(
      { reader: f.reader, executor: f.executor, worldId: WORLD },
      async (view) => {
        await expect(
          readIndustryOfficeDecisionResultFrom({
            executor: f.executor,
            view,
            scope,
            custody: f.custody,
            sha256Hex: sha,
          }),
        ).rejects.toThrow('correction');
      },
    );
    expect(f.calls().custodyCalls).toBe(0);
  });
  it('keeps plain nonprojectable manual latest activity unavailable', async () => {
    const f = correctionProtocol('plain');
    await withValidatedCanonicalLineageFrom(
      { reader: f.reader, executor: f.executor, worldId: WORLD },
      async (view) => {
        expect(
          await readIndustryOfficeDecisionResultFrom({
            executor: f.executor,
            view,
            scope,
            custody: f.custody,
            sha256Hex: sha,
          }),
        ).toMatchObject({
          decisionResult: {
            status: 'SOURCE_UNAVAILABLE',
            metrics: [],
            cause: null,
          },
          industryProductionResult: { status: 'NOT_AUTHORIZED' },
        });
      },
    );
    expect(f.calls().custodyCalls).toBe(0);
  });
  it('does not add a global rejection for unrelated nonproduction corrections', async () => {
    const f = correctionProtocol('unrelated');
    await withValidatedCanonicalLineageFrom(
      { reader: f.reader, executor: f.executor, worldId: WORLD },
      async (view) => {
        expect(
          await readIndustryOfficeDecisionResultFrom({
            executor: f.executor,
            view,
            scope,
            custody: f.custody,
            sha256Hex: sha,
          }),
        ).toMatchObject({ decisionResult: { status: 'SOURCE_UNAVAILABLE' } });
      },
    );
    expect(f.calls().custodyCalls).toBe(0);
  });
});

describe('Industry genuine empty consumer and sole publisher binding', () => {
  it('returns no result from the real empty reader-created view, with no custody call', async () => {
    const f = protocol();
    let escaped: ValidatedCanonicalLineageView | undefined;
    await withValidatedCanonicalLineageFrom(
      { reader: f.reader, executor: f.executor, worldId: WORLD },
      async (view) => {
        escaped = view;
        const out = await readIndustryOfficeDecisionResultFrom({
          executor: f.executor,
          view,
          scope,
          custody: f.custody,
          sha256Hex: sha,
        });
        expect(out).toMatchObject({
          decisionResult: {
            status: 'SOURCE_UNAVAILABLE',
            cause: null,
            metrics: [],
          },
          industryProductionResult: { status: 'NOT_AUTHORIZED' },
        });
        await expect(
          readIndustryOfficeDecisionResultFrom({
            executor: { query: f.executor.query },
            view,
            scope,
            custody: f.custody,
            sha256Hex: sha,
          }),
        ).rejects.toThrow('another executor');
        await expect(
          readIndustryOfficeDecisionResultFrom({
            executor: f.executor,
            view,
            scope: { ...scope, officeId: 'SOCIAL' },
            custody: f.custody,
            sha256Hex: sha,
          }),
        ).rejects.toThrow('private Industry');
      },
    );
    await expect(
      readIndustryOfficeDecisionResultFrom({
        executor: f.executor,
        view: escaped!,
        scope,
        custody: f.custody,
        sha256Hex: sha,
      }),
    ).rejects.toThrow('expired');
    await expect(
      readIndustryOfficeDecisionResultFrom({
        executor: f.executor,
        view: {} as ValidatedCanonicalLineageView,
        scope,
        custody: f.custody,
        sha256Hex: sha,
      }),
    ).rejects.toThrow('forged');
    expect(f.calls().custodyCalls).toBe(0);
  });
  it('leaves default source refusal and all v1 carriers unchanged without the explicit binding', async () => {
    const f = protocol(),
      publisher = new AuthoritativeActivityReadProjectionPublisher({
        database: f.database,
        workerId: WORKER,
      });
    await publisher.replace({ assertion: f.assertion, observedAtReal: at });
    expect(f.writes).toHaveLength(3);
    expect(
      f.writes.every(
        (r) => r.payload.schemaVersion === 'world-activity-projection-v1',
      ),
    ).toBe(true);
    expect(
      f.queries.some((s) => s.includes('from world_v2.opening_seed')),
    ).toBe(false);
    expect(f.calls()).toEqual({ transactions: 1, custodyCalls: 0 });
  });
  it('uses an actual same-executor empty prefix before emitting only a paired private Industry v2 unavailable result', async () => {
    const f = protocol(),
      publisher = new AuthoritativeActivityReadProjectionPublisher({
        database: f.database,
        workerId: WORKER,
        industryGoverningCustody: f.custody,
      });
    await publisher.replace({ assertion: f.assertion, observedAtReal: at });
    const industry = f.writes.find(
      (r) => r.payload.officeId === 'INDUSTRY',
    )!.payload;
    const visibility = (industry.ledger as Row).visibility as Row,
      result = industry.decisionResult as Row;
    expect(industry.schemaVersion).toBe('world-activity-projection-v2');
    expect(visibility).toMatchObject({
      schemaVersion: 'economic-read-visibility-v2',
      inventoryDetail: 'NOT_AUTHORIZED',
      countrySummary: 'NOT_AUTHORIZED',
      industryProductionResult: { status: 'NOT_AUTHORIZED' },
    });
    expect(result).toMatchObject({
      status: 'SOURCE_UNAVAILABLE',
      metrics: [],
      cause: null,
    });
    expect(() =>
      assertDecisionResultPayload({
        value: result,
        worldId: WORLD,
        countryId: 'COUNTRY_01',
        officeId: 'INDUSTRY',
        worldVersion: '0',
        eventSequence: '0',
        financialDetail: visibility.financialDetail,
        activitySchema: industry.schemaVersion,
        economicVisibilitySchema: visibility.schemaVersion,
        industryProductionResult: visibility.industryProductionResult,
        lastOfficeActivity: {
          eventCount: '0',
          eventSequence: '0',
          worldVersion: '0',
        },
      }),
    ).not.toThrow();
    expect(
      f.writes
        .filter((r) => r.payload.officeId !== 'INDUSTRY')
        .every(
          (r) => r.payload.schemaVersion === 'world-activity-projection-v1',
        ),
    ).toBe(true);
    expect(f.calls()).toEqual({ transactions: 1, custodyCalls: 0 });
    expect(
      f.queries.findIndex((s) => s.includes('from world_v2.opening_seed')),
    ).toBeLessThan(
      f.queries.findIndex((s) =>
        s.includes('delete from world_v2.read_projection'),
      ),
    );
  });
  it('fails a mixed genuine head before any projection write', async () => {
    const f = protocol({ badLineageHead: true }),
      publisher = new AuthoritativeActivityReadProjectionPublisher({
        database: f.database,
        workerId: WORKER,
        industryGoverningCustody: f.custody,
      });
    await expect(
      publisher.replace({ assertion: f.assertion, observedAtReal: at }),
    ).rejects.toThrow();
    expect(
      f.queries.some((s) => s.includes('delete from world_v2.read_projection')),
    ).toBe(false);
    expect(f.writes).toEqual([]);
  });
  it('retains the actual publisher production-schema denial before the new source branch', async () => {
    const f = protocol({ productionLedgerRow: true }),
      publisher = new AuthoritativeActivityReadProjectionPublisher({
        database: f.database,
        workerId: WORKER,
        industryGoverningCustody: f.custody,
      });
    await expect(
      publisher.replace({ assertion: f.assertion, observedAtReal: at }),
    ).rejects.toThrow('unsupported schema');
    expect(
      f.queries.some((s) => s.includes('from world_v2.opening_seed')),
    ).toBe(false);
    expect(f.writes).toEqual([]);
    expect(f.calls().custodyCalls).toBe(0);
  });
  it('does not create an Industry source read or v2 output when no current Industry scope exists', async () => {
    const f = protocol({ otherOfficeOnly: true }),
      publisher = new AuthoritativeActivityReadProjectionPublisher({
        database: f.database,
        workerId: WORKER,
        industryGoverningCustody: f.custody,
      });
    await publisher.replace({ assertion: f.assertion, observedAtReal: at });
    expect(f.writes).toHaveLength(2);
    expect(
      f.writes.every(
        (r) => r.payload.schemaVersion === 'world-activity-projection-v1',
      ),
    ).toBe(true);
    expect(
      f.queries.some((s) => s.includes('from world_v2.opening_seed')),
    ).toBe(false);
  });
});
