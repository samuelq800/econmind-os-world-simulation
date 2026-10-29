/** Complete bounded durable frames for the fixed first-day Treasury FX host.
 * No caller rows, family filtering, skipped effects, or ledger authority. */
import { createHash } from 'node:crypto';
import {
  DomainError,
  DOMAIN_ERROR_CODES,
  canonicalSerialize,
  createAuthoritativeTransition,
  createFinalCommandReceipt,
  parseAuthoritativeEvent,
  type CanonicalCommand,
} from '@econmind/core';
import { DurableV08LedgerLineageReader } from './durable-v08-ledger-lineage-reader.js';
import { readFinalReceiptFrom } from './atomic-transition-repository.js';
import type { SqlDatabase, SqlExecutor } from './sql-database.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function invalid(s: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    'POSTWAR_DAY_ONE_FX_HISTORY:' + s,
  );
}
function text(v: unknown): string {
  if (typeof v !== 'string' || !v || v.trim() !== v)
    invalid('CANONICAL_DURABLE_TEXT_REQUIRED');
  return v;
}
const time = (v: unknown) => (v instanceof Date ? v.toISOString() : text(v));
const integer = (v: unknown) => {
  const s =
    typeof v === 'bigint' || typeof v === 'number' ? String(v) : text(v);
  if (!/^(0|[1-9]\d*)$/u.test(s)) invalid('CANONICAL_CURSOR_REQUIRED');
  return s;
};
export async function readPostwarDayOneFxHistoryFrom(input: {
  readonly executor: SqlExecutor;
  readonly database: SqlDatabase;
  readonly worldId: string;
  readonly expectedWorldVersion: string | null;
}) {
  const tx = input.executor;
  const h = await tx.query<{ world_version: string; event_sequence: string }>(
    'select world_version::text,event_sequence::text from world_v2.world_head where world_id=$1 for share',
    [input.worldId],
  );
  if (
    h.rows.length !== 1 ||
    h.rows[0]!.world_version !== input.expectedWorldVersion
  )
    invalid('ACTUAL_EXPECTED_HEAD_REQUIRED');
  const head = h.rows[0]!;
  if (
    BigInt(integer(head.world_version)) > 256n ||
    BigInt(integer(head.event_sequence)) > 256n
  )
    invalid('BOUNDED_PREFIX_CAPACITY_EXCEEDED');
  const inv = await tx.query<{ present: boolean }>(
    'select exists(select 1 from world_v2.inventory_posting where world_id=$1)as present',
    [input.worldId],
  );
  if (inv.rows.length !== 1 || inv.rows[0]!.present !== false)
    invalid('INVENTORY_EFFECT_NOT_SUPPORTED');
  const e = await tx.query<Record<string, unknown>>(
    'select event_id,event_type,schema_version,world_id,causation_command_id,correlation_id,world_version::text,event_sequence::text as sequence,sim_time::text,recorded_at_real,corrects_event_id,canonical_payload,payload_sha256,event_fingerprint from world_v2.authoritative_event where world_id=$1 and octet_length(canonical_payload)<=65536 order by event_sequence limit 257',
    [input.worldId],
  );
  if (e.rows.length !== Number(head.event_sequence) || e.rows.length > 256)
    invalid('COMPLETE_BOUNDED_PREFIX_REQUIRED');
  const durable = new DurableV08LedgerLineageReader({
    database: input.database,
    sha256Hex: sha,
  });
  const groups = new Map<
    string,
    {
      command: CanonicalCommand;
      events: ReturnType<typeof parseAuthoritativeEvent>[];
    }
  >();
  let bytes = 0;
  for (const r of e.rows) {
    const id = text(r.causation_command_id);
    let group = groups.get(id);
    if (!group) {
      const b = await tx.query<{ present: boolean }>(
        'select exists(select 1 from world_v2.command_submission where world_id=$1 and command_id=$2 and octet_length(canonical_payload)<=16384)as present',
        [input.worldId, id],
      );
      if (b.rows.length !== 1 || b.rows[0]!.present !== true)
        invalid('BOUNDED_COMMAND_REQUIRED');
      const command = await durable.readCommandFrom(tx, input.worldId, id);
      bytes += Buffer.byteLength(command.canonicalPayload);
      group = { command, events: [] };
      groups.set(id, group);
    }
    const payload = text(r.canonical_payload);
    bytes += Buffer.byteLength(payload);
    if (bytes > 2097152) invalid('PREFIX_BYTE_CAPACITY_EXCEEDED');
    const body: unknown = JSON.parse(payload);
    if (canonicalSerialize(body) !== payload) invalid('NONCANONICAL_EVENT');
    const event = parseAuthoritativeEvent(
      {
        schemaVersion: text(r.schema_version),
        eventId: text(r.event_id),
        eventType: text(r.event_type),
        worldId: text(r.world_id),
        causationCommandId: id,
        correlationId: text(r.correlation_id),
        worldVersion: integer(r.world_version),
        sequence: integer(r.sequence),
        simTime: integer(r.sim_time),
        recordedAtReal: time(r.recorded_at_real),
        correctsEventId:
          r.corrects_event_id === null ? null : text(r.corrects_event_id),
        payload: body,
      },
      sha,
    );
    if (
      event.payloadHash !== r.payload_sha256 ||
      event.fingerprint !== r.event_fingerprint
    )
      invalid('EVENT_HASH_MISMATCH');
    group.events.push(event);
  }
  const postings = await tx.query<{
    causation_command_id: string;
    canonical_payload: string;
    fingerprint: string;
  }>(
    'select causation_command_id,canonical_payload,batch_fingerprint as fingerprint from world_v2.financial_posting_batch where world_id=$1 and octet_length(canonical_payload)<=131072 order by world_version_after,batch_id limit 513',
    [input.worldId],
  );
  const count = await tx.query<{ count: string }>(
    'select count(*)::text as count from world_v2.financial_posting_batch where world_id=$1',
    [input.worldId],
  );
  if (
    count.rows.length !== 1 ||
    count.rows[0]!.count !== String(postings.rows.length) ||
    postings.rows.length > 512
  )
    invalid('COMPLETE_BOUNDED_POSTINGS_REQUIRED');
  for (const p of postings.rows) {
    if (!groups.has(p.causation_command_id)) invalid('ORPHAN_POSTING');
    bytes += Buffer.byteLength(text(p.canonical_payload));
    if (bytes > 2097152) invalid('PREFIX_BYTE_CAPACITY_EXCEEDED');
  }
  const frames = [];
  let version = 0n,
    seq = 0n;
  for (const g of groups.values()) {
    if (g.command.expectedWorldVersion !== String(version))
      invalid('CONTIGUOUS_VERSION_REQUIRED');
    for (const ev of g.events)
      if (
        ev.sequence !== String(++seq) ||
        ev.worldVersion !== String(version + 1n)
      )
        invalid('CONTIGUOUS_EVENT_SEQUENCE_REQUIRED');
    const transition = createAuthoritativeTransition({
      command: g.command,
      events: g.events,
      worldVersionBefore: String(version),
      worldVersionAfter: String(++version),
    });
    const receipt = await readFinalReceiptFrom(tx, g.command);
    if (!receipt || receipt.outcome !== 'COMMITTED')
      invalid('COMMITTED_RECEIPT_REQUIRED');
    const expected = createFinalCommandReceipt({
      command: g.command,
      transition,
      outcome: 'COMMITTED',
      reasonCode: null,
      simTime: g.command.simTime,
      recordedAtReal: receipt.recordedAtReal,
    });
    if (canonicalSerialize(receipt) !== canonicalSerialize(expected))
      invalid('CANONICAL_RECEIPT_REQUIRED');
    frames.push(
      Object.freeze({
        ...g,
        transition,
        receipt,
        inventoryPostings: Object.freeze([]),
        financialPostingRows: Object.freeze(
          postings.rows.filter(
            (p) => p.causation_command_id === g.command.commandId,
          ),
        ),
      }),
    );
  }
  const committed = await tx.query<{ command_id: string }>(
    "select command_id from world_v2.command_receipt where world_id=$1 and outcome='COMMITTED'order by world_version_after,command_id limit 257",
    [input.worldId],
  );
  if (
    version !== BigInt(head.world_version) ||
    seq !== BigInt(head.event_sequence) ||
    committed.rows.length !== frames.length ||
    new Set(committed.rows.map((r) => r.command_id)).size !== frames.length ||
    frames.some(
      (f) => !committed.rows.some((r) => r.command_id === f.command.commandId),
    )
  )
    invalid('EXACT_COMPLETE_HEAD_AND_RECEIPTS_REQUIRED');
  return Object.freeze({
    head: Object.freeze({
      worldId: input.worldId,
      worldVersion: head.world_version,
      eventSequence: head.event_sequence,
    }),
    frames: Object.freeze(frames),
  });
}
export type PostwarDayOneFxHistory = Awaited<
  ReturnType<typeof readPostwarDayOneFxHistoryFrom>
>;
