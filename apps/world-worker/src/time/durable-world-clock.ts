// Worker-private P1/P2 TEST_ONLY mechanics. No runtime exports, timer or cutoff API.
import { PostgresTransactionError } from '../persistence/postgres-sql-database.js';
import type { SqlDatabase, SqlExecutor } from '../persistence/sql-database.js';
import {
  CLOCK_MAX_RECORDS,
  clockFail,
  clockInteger,
  clockTimestamp,
  deriveClockRecord,
  parseClockBinding,
  parseClockIntent,
  replayClockRecords,
  type ClockRecord,
  type ClockHead,
} from './clock-contracts.js';

export const REAL_PUBLISHER_NON_BYPASS = 'NOT_PROVEN' as const;
export function createUnregisteredDurableWorldClock() {
  const deny = async () =>
    Object.freeze({
      status: 'DENIED' as const,
      reason: 'REAL_CLOCK_SOURCE_AND_CONTROL_AUTHORITY_NOT_REGISTERED' as const,
      writes: 0 as const,
    });
  return Object.freeze({ apply: deny, read: deny, recover: deny });
}
export type ClockFailureOutcome =
  'NOT_STARTED' | 'ROLLED_BACK' | 'UNKNOWN' | 'COMMITTED';
export class DurableClockError extends Error {
  constructor(
    readonly outcome: ClockFailureOutcome,
    readonly cleanup: 'NOT_KNOWN_INCOMPLETE' | 'CLEANUP_INCOMPLETE',
    readonly committedRecord: Readonly<ClockRecord> | null,
    cause: unknown,
  ) {
    super(`ISOLATED_CLOCK_${outcome}_HALTED`, { cause });
    this.name = 'DurableClockError';
  }
}
/** Trusted fixture transport may retain a real COMMIT ACK even if release fails.
 * Ordinary PostgresSqlDatabase release exceptions lack phase proof -> UNKNOWN.
 * This is NOT a source/control authority permit. */
export class ClockKnownCommitCleanupFailure extends Error {
  constructor(cause: unknown) {
    super('CLOCK_KNOWN_COMMIT_CLEANUP_INCOMPLETE', { cause });
  }
}
interface HeadRow {
  revision: string;
  record_hash: string;
  state_bytes: string;
  anchor_real_ms: string;
  binding_bytes: string;
}
interface InputRow {
  sequence: string;
  operation_id: string;
  record_hash: string;
  original_bytes: string;
}
interface SourceRow {
  reference: string;
  kind: string;
  original_bytes: string;
}
export type ClockFaultPoint =
  | 'BEFORE_JOURNAL'
  | 'AFTER_JOURNAL'
  | 'BEFORE_HEAD'
  | 'AFTER_HEAD'
  | 'BEFORE_COMMIT'
  | 'AFTER_COMMIT';
interface ClockFixtureConfiguration {
  readonly database: SqlDatabase;
  readonly bindingBytes: string;
  readonly fault?: (point: ClockFaultPoint) => Promise<void>;
}
/** Explicitly TEST_ONLY, not an authentication mechanism. Its fixture role can
 * DML K and is reported as such. The real factory above remains unconditionally
 * default-denied regardless of caller-created JSON/hash/brands.
 * Fixed source lookup, not an injected always-true authority resolver.
 */
export function createTestOnlyDurableWorldClock(
  input: ClockFixtureConfiguration,
) {
  const binding = parseClockBinding(input.bindingBytes);
  const bindingBytes = input.bindingBytes;
  const database = input.database;
  const hit = input.fault ?? (async () => undefined);
  let halted = false;
  let inFlight = false;
  const world = binding.worldId;

  async function source(
    sql: SqlExecutor,
    refs: readonly string[],
    lock: boolean,
  ) {
    const rows = (
      await sql.query<SourceRow>(
        `select reference,kind,original_bytes from world_v2.isolated_clock_test_source
       where world_id=$1 and environment='TEST_ONLY_ISOLATED'
         and reference=any($2::text[]) order by reference collate "C" ${lock ? 'for share' : ''}`,
        [world, refs],
      )
    ).rows;
    if (
      rows.length !== refs.length ||
      new Set(rows.map((r) => r.reference)).size !== refs.length
    )
      clockFail('CLOCK_IMMUTABLE_SOURCE_MISSING');
    return rows;
  }
  async function current(sql: SqlExecutor, lock: boolean) {
    const rows = (
      await sql.query<HeadRow>(
        `select clock_revision::text as revision,record_hash,state_bytes,
       anchor_real_ms::text,binding_bytes from world_v2.isolated_clock_head
       where world_id=$1 ${lock ? 'for update' : ''}`,
        [world],
      )
    ).rows;
    if (rows.length > 1) clockFail('CLOCK_HEAD_CARDINALITY');
    return rows[0] ?? null;
  }
  async function lineage(sql: SqlExecutor, row: HeadRow | null) {
    const stored = (
      await sql.query<InputRow>(
        `select sequence::text,operation_id,record_hash,original_bytes
       from world_v2.isolated_clock_input where world_id=$1 order by sequence limit $2`,
        [world, CLOCK_MAX_RECORDS + 1],
      )
    ).rows;
    const replayed = replayClockRecords(
      bindingBytes,
      stored.map((r) => r.original_bytes),
    );
    if ((row === null) !== (stored.length === 0))
      clockFail('CLOCK_HEAD_LINEAGE_MISMATCH');
    for (const [i, record] of replayed.entries()) {
      const s = stored[i]!;
      if (
        s.sequence !== record.head.revision ||
        s.operation_id !== record.intent.operationId ||
        s.record_hash !== record.recordHash
      )
        clockFail('CLOCK_JOURNAL_COLUMNS_MISMATCH');
    }
    const refs = [
      binding.baseGenesisRef,
      ...new Set(replayed.map((r) => r.intent.sourceRef)),
    ];
    const originals = await source(sql, refs, false);
    const base = originals.find((r) => r.reference === binding.baseGenesisRef);
    if (base?.kind !== 'BASE' || base.original_bytes !== bindingBytes)
      clockFail('CLOCK_BASE_SOURCE_CHANGED');
    for (const record of replayed) {
      const original = originals.find(
        (r) => r.reference === record.intent.sourceRef,
      );
      if (
        original?.kind !== 'OBSERVATION' ||
        original.original_bytes !== record.sourceBytes
      )
        clockFail('CLOCK_OBSERVATION_SOURCE_CHANGED');
    }
    const last = replayed.at(-1);
    if (
      last &&
      (row?.binding_bytes !== bindingBytes ||
        row.revision !== last.head.revision ||
        row.record_hash !== last.recordHash ||
        row.state_bytes !== last.head.stateBytes ||
        row.anchor_real_ms !== last.head.anchorRealMs)
    )
      clockFail('CLOCK_MATERIALIZATION_BYTES_MISMATCH');
    return replayed;
  }
  async function observed(sql: SqlExecutor) {
    const result = await sql.query<{ observed: string }>(`select
      to_char(date_trunc('milliseconds',clock_timestamp()) at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as observed`);
    if (result.rows.length !== 1) clockFail('CLOCK_OBSERVATION_CARDINALITY');
    return clockTimestamp(result.rows[0]!.observed);
  }
  async function guard(
    sql: SqlExecutor,
    intent: ReturnType<typeof parseClockIntent>,
    at: string,
  ) {
    const rows = (
      await sql.query<{ world_version: string; event_sequence: string }>(
        `select world_version::text,event_sequence::text from
       world_v2.assert_world_writer_commit_guard($1,$2,$3::bigint,$4::bigint,$5::timestamptz)`,
        [
          world,
          intent.holderId,
          intent.fencingToken,
          intent.expectedWorldVersion,
          at,
        ],
      )
    ).rows;
    if (
      rows.length !== 1 ||
      rows[0]?.world_version !== intent.expectedWorldVersion
    )
      clockFail('CLOCK_GUARD_CARDINALITY');
    clockInteger(rows[0].event_sequence);
    return rows[0].event_sequence;
  }
  async function apply(intentBytes: string) {
    if (halted || inFlight) clockFail('CLOCK_ADAPTER_HALTED_OR_BUSY');
    const intent = parseClockIntent(intentBytes, binding); // no writes on shape refusal
    let completed: Readonly<ClockRecord> | null = null;
    let acknowledged = false;
    inFlight = true;
    try {
      const result = await database.transaction(async (sql) => {
        await sql.query('set transaction isolation level read committed');
        const firstSequence = await guard(sql, intent, await observed(sql)); // actual L -> H
        const originals = await source(
          sql,
          [binding.baseGenesisRef, intent.sourceRef],
          true,
        );
        if (
          originals.find((r) => r.reference === binding.baseGenesisRef)
            ?.original_bytes !== bindingBytes ||
          originals.find((r) => r.reference === binding.baseGenesisRef)
            ?.kind !== 'BASE'
        )
          clockFail('CLOCK_BASE_SOURCE_CHANGED');
        const observation = originals.find(
          (r) => r.reference === intent.sourceRef,
        );
        if (observation?.kind !== 'OBSERVATION')
          clockFail('CLOCK_SOURCE_KIND_INVALID');
        const head = await current(sql, true); // K is last potentially blocking acquisition
        const records = await lineage(sql, head); // immutable reads, no later row locks
        const fresh = await observed(sql);
        if ((await guard(sql, intent, fresh)) !== firstSequence)
          clockFail('CLOCK_HEAD_CHANGED');
        const existing = records.find(
          (r) => r.intent.operationId === intent.operationId,
        );
        if (existing) {
          // Full original intent and immutable bytes, not resampled active interval.
          const original = JSON.parse(existing.originalBytes) as {
            intentBytes: string;
          };
          if (
            original.intentBytes !== intentBytes ||
            existing.sourceBytes !== observation.original_bytes
          )
            clockFail('CLOCK_OPERATION_INTENT_CONFLICT');
          completed = existing;
          return Object.freeze({
            status: 'EXISTING' as const,
            record: existing,
          });
        }
        if (records.length >= CLOCK_MAX_RECORDS)
          clockFail('CLOCK_REPLAY_BOUND_EXCEEDED');
        const previous: ClockHead | null = head
          ? {
              revision: head.revision,
              recordHash: head.record_hash,
              stateBytes: head.state_bytes,
              anchorRealMs: head.anchor_real_ms,
            }
          : null;
        const next = deriveClockRecord({
          bindingBytes,
          intentBytes,
          sourceBytes: observation.original_bytes,
          previous,
          leaseObservedAtReal: fresh,
        });
        await hit('BEFORE_JOURNAL');
        const append = await sql.query(
          `insert into world_v2.isolated_clock_input
          (world_id,sequence,operation_id,record_hash,original_bytes)
          values($1,$2::bigint,$3,$4,$5)`,
          [
            world,
            next.head.revision,
            intent.operationId,
            next.recordHash,
            next.originalBytes,
          ],
        );
        if (append.rowCount !== 1) clockFail('CLOCK_APPEND_CARDINALITY');
        await hit('AFTER_JOURNAL');
        await hit('BEFORE_HEAD');
        const changed = head
          ? await sql.query(
              `update world_v2.isolated_clock_head set clock_revision=$2::bigint,
            record_hash=$3,state_bytes=$4,anchor_real_ms=$5::bigint
            where world_id=$1 and clock_revision=$6::bigint and record_hash=$7
              and binding_bytes=$8`,
              [
                world,
                next.head.revision,
                next.recordHash,
                next.head.stateBytes,
                next.head.anchorRealMs,
                head.revision,
                head.record_hash,
                bindingBytes,
              ],
            )
          : await sql.query(
              `insert into world_v2.isolated_clock_head
            (world_id,clock_revision,record_hash,state_bytes,anchor_real_ms,binding_bytes)
            values($1,$2::bigint,$3,$4,$5::bigint,$6)`,
              [
                world,
                next.head.revision,
                next.recordHash,
                next.head.stateBytes,
                next.head.anchorRealMs,
                bindingBytes,
              ],
            );
        if (changed.rowCount !== 1) clockFail('CLOCK_HEAD_CAS_FAILED');
        await hit('AFTER_HEAD');
        // Re-read both representations before COMMIT; no mutation of economic H.
        await lineage(sql, await current(sql, false));
        await hit('BEFORE_COMMIT');
        completed = next;
        return Object.freeze({ status: 'APPLIED' as const, record: next });
      });
      acknowledged = true;
      await hit('AFTER_COMMIT');
      return result;
    } catch (cause) {
      halted = true;
      const known =
        acknowledged || cause instanceof ClockKnownCommitCleanupFailure;
      const outcome: ClockFailureOutcome = known
        ? 'COMMITTED'
        : cause instanceof PostgresTransactionError &&
            ['NOT_STARTED', 'ROLLED_BACK'].includes(cause.outcome)
          ? (cause.outcome as 'NOT_STARTED' | 'ROLLED_BACK')
          : 'UNKNOWN';
      throw new DurableClockError(
        outcome,
        known ? 'CLEANUP_INCOMPLETE' : 'NOT_KNOWN_INCOMPLETE',
        known ? completed : null,
        cause,
      );
    } finally {
      inFlight = false;
    }
  }
  async function recover(intentBytes: string) {
    if (inFlight) clockFail('CLOCK_ADAPTER_BUSY');
    const intent = parseClockIntent(intentBytes, binding);
    // Fresh single read-only MVCC snapshot, not unrelated pooled queries.
    try {
      return await database.transaction(async (sql) => {
        await sql.query(
          'set transaction isolation level repeatable read read only',
        );
        const head = await current(sql, false);
        const records = await lineage(sql, head);
        const record = records.find(
          (r) => r.intent.operationId === intent.operationId,
        );
        if (!record)
          return Object.freeze({
            status: 'UNKNOWN_NOT_RECORDED' as const,
            record: null,
            current: head,
          });
        if (
          (JSON.parse(record.originalBytes) as { intentBytes: string })
            .intentBytes !== intentBytes
        )
          clockFail('CLOCK_OPERATION_INTENT_CONFLICT');
        return Object.freeze({
          status:
            head?.revision === record.head.revision
              ? ('RECORDED_CURRENT' as const)
              : ('RECORDED_SUPERSEDED' as const),
          record,
          current: head,
        });
      });
    } catch (cause) {
      halted = true;
      throw cause;
    }
  }
  return Object.freeze({
    classification: 'TEST_ONLY_NOT_AUTHORITY' as const,
    apply,
    recover,
    status: () =>
      Object.freeze({
        halted,
        inFlight,
        realPublisherNonBypass: REAL_PUBLISHER_NON_BYPASS,
      }),
  });
}
