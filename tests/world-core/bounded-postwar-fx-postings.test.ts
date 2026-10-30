/** Actual TEST_ONLY Core FX settlement -> canonical SQL bytes -> bounded
 * readonly frame decoder. This is data reconstruction, not PG/source admission. */
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
// Serialize the fixture's source-Core classes with that same Core issuer.
// Only canonical bytes cross into the Worker/dist decoder below.
import { canonicalSerialize } from '../../packages/core/src/index.js';
import {
  mixedFinancialFixture,
  mixedFxFrame,
} from '../support/finance-social-fx-replay-fixture.js';
import { readBoundedPostwarSocialFramesFrom } from '../../apps/world-worker/src/persistence/bounded-postwar-social-lineage.js';
import { readBoundedPostwarFinancialPostingRowsFrom } from '../../apps/world-worker/src/persistence/bounded-postwar-fx-postings.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';
let frame: Awaited<ReturnType<typeof mixedFxFrame>>;
beforeAll(async () => {
  const original = mixedFinancialFixture();
  frame = await mixedFxFrame({
    financial: original.financial,
    original,
    sequence: '1',
    identity: 'BOUNDED_CODEC',
    treasuryReservedAmount: '900',
    bankGcuReservedAmount: '10',
  });
});
function transport() {
  const c = frame.command,
    r = frame.receipt;
  const postings: {
    causation_command_id: string;
    canonical_payload: string;
    fingerprint: string;
  }[] = frame.financialPostingBatches.map((batch) => {
    const { fingerprint, ...intent } = batch;
    return {
      causation_command_id: c.commandId,
      canonical_payload: canonicalSerialize(intent),
      fingerprint,
    };
  });
  const events = frame.events.map((e) => ({
    event_id: e.eventId,
    event_type: e.eventType,
    schema_version: e.schemaVersion,
    world_id: e.worldId,
    causation_command_id: e.causationCommandId,
    correlation_id: e.correlationId,
    world_version: e.worldVersion,
    sequence: e.sequence,
    sim_time: e.simTime.toCanonicalValue(),
    recorded_at_real: e.recordedAtReal,
    corrects_event_id: e.correctsEventId,
    canonical_payload: e.canonicalPayload,
    payload_sha256: e.payloadHash,
    event_fingerprint: e.fingerprint,
  }));
  const statements: string[] = [];
  const query: SqlExecutor['query'] = async <Row extends object>(
    sql: string,
  ) => {
    statements.push(sql);
    let rows: unknown[];
    if (sql.includes('lock_social_operating_lineage_head'))
      rows = [{ world_version: '1', event_sequence: '1' }];
    else if (sql.includes('as financial'))
      rows = [{ financial: true, inventory: false }];
    else if (sql.includes('count(*)'))
      rows = [{ count: String(postings.length) }];
    else if (sql.includes('from world_v2.financial_posting_batch'))
      rows = postings;
    else if (sql.startsWith('select event_id,event_type')) rows = events;
    else if (
      sql.startsWith('select exists(select 1 from world_v2.command_submission')
    )
      rows = [{ present: true }];
    else if (sql.includes('as command_actor_id'))
      rows = [
        {
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
          correlation_id: c.correlationId,
        },
      ];
    else if (sql.includes("outcome='COMMITTED'"))
      rows = [{ command_id: c.commandId }];
    else if (sql.includes('from world_v2.command_receipt'))
      rows = [
        {
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
        },
      ];
    else throw Error('UNEXPECTED_PROTOCOL_SQL:' + sql);
    return { rows: rows as Row[], rowCount: rows.length };
  };
  const executor: SqlExecutor = { query };
  const database: SqlDatabase = {
    query,
    transaction: async (consume) => consume(executor),
  };
  return {
    postings,
    events,
    statements,
    executor,
    read: () =>
      readBoundedPostwarSocialFramesFrom({
        executor,
        database,
        worldId: c.worldId,
        countryId: c.countryId,
      }),
  };
}
describe('complete bounded actual FX posting sets', () => {
  it('executes the read against the actual official financial table DDL and fingerprint column', async () => {
    const source = await readFile(
      new URL(
        '../../database/migrations/artifacts/0007_world_v2_atomic_transition_facts.sql',
        import.meta.url,
      ),
      'utf8',
    );
    const start = source.indexOf(
      'create table world_v2.financial_posting_batch (',
    );
    const end = source.indexOf('\n);', start);
    if (start < 0 || end < 0)
      throw Error('OFFICIAL_FINANCIAL_TABLE_DDL_REQUIRED');
    const db = new PGlite();
    try {
      // Only the FK target is a protocol fixture; the financial table's entire
      // exact DDL/columns/checks below come from the immutable migration.
      await db.exec(
        'create schema world_v2; create table world_v2.command_submission(world_id text,command_id text,primary key(world_id,command_id));',
      );
      await db.exec(source.slice(start, end + 4));
      const executor: SqlExecutor = {
        query: async <Row extends object>(sql, parameters = []) => {
          const result = await db.query<Row>(sql, [...parameters]);
          return { rows: result.rows, rowCount: result.rows.length };
        },
      };
      expect(
        await readBoundedPostwarFinancialPostingRowsFrom(
          executor,
          frame.command.worldId,
        ),
      ).toEqual({ rows: [], bytes: 0 });
    } finally {
      await db.close();
    }
  });

  it('decodes actual two-currency/six-leg Core batches with immutable hashes and readonly SQL', async () => {
    const h = transport(),
      value = await h.read();
    expect(value.frames).toHaveLength(1);
    expect(
      value.frames[0]!.financialPostingBatches.map((b) => b.fingerprint).sort(),
    ).toEqual(frame.financialPostingBatches.map((b) => b.fingerprint).sort());
    expect(
      value.frames[0]!.financialPostingBatches.reduce(
        (n, b) => n + b.legs.length,
        0,
      ),
    ).toBe(6);
    expect(value.prefixBytes).toBeGreaterThan(
      h.postings.reduce(
        (n, r) => n + Buffer.byteLength(r.canonical_payload),
        0,
      ),
    );
    expect(h.statements.join('\n')).not.toMatch(
      /opening_seed|for share|\b(insert|update|delete)\b/iu,
    );
  });
  it.each([
    'MISSING',
    'FINGERPRINT',
    'CANONICAL_BYTES',
    'ORPHAN',
    'UNKNOWN_EVENT',
  ])(
    'rejects %s rather than dropping/rebasing an actual effect',
    async (kind) => {
      const h = transport();
      if (kind === 'MISSING') h.postings.pop();
      if (kind === 'FINGERPRINT')
        h.postings[0]!.fingerprint = 'sha256:' + '1'.repeat(64);
      if (kind === 'CANONICAL_BYTES') h.postings[0]!.canonical_payload += ' ';
      if (kind === 'ORPHAN')
        h.postings.push({
          ...h.postings[0]!,
          causation_command_id: 'COMMAND_ORPHAN',
        });
      if (kind === 'UNKNOWN_EVENT')
        h.events[0]!.event_type = 'UNKNOWN_POSTING_EVENT';
      await expect(h.read()).rejects.toThrow();
    },
  );
  it('enforces full batch row counts and byte bounds independently of prefix parsing', async () => {
    for (const mode of ['COUNT', 'OVERSIZE', 'FILTERED'] as const) {
      const tx: SqlExecutor = {
        query: async <Row extends object>(sql: string) => {
          const rows = sql.includes('count(*)')
            ? [{ count: mode === 'COUNT' ? '513' : '1' }]
            : mode === 'FILTERED'
              ? []
              : [
                  {
                    causation_command_id: 'COMMAND_TEST_ONLY',
                    canonical_payload: 'x'.repeat(65537),
                    fingerprint: 'sha256:' + '1'.repeat(64),
                  },
                ];
          return { rows: rows as Row[], rowCount: rows.length };
        },
      };
      await expect(
        readBoundedPostwarFinancialPostingRowsFrom(tx, frame.command.worldId),
      ).rejects.toThrow('bounded');
    }
  });
});
