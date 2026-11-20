/** Fixed bounded complete Budget-only SQL replay; no seed hydration or source/commit authority. */
import { createHash } from 'node:crypto';
import {
  DomainError,
  DOMAIN_ERROR_CODES,
  canonicalSerialize,
  parseAuthoritativeEvent,
  createAuthoritativeTransition,
  validateFinalReceiptForCommand,
  type CanonicalCommand,
} from '@econmind/core';
import {
  FINANCE_NATIVE_BUDGET_EVENT_TYPES,
  replayFinanceNativeBudgetHistory,
} from '@econmind/core/finance-budget-native';
import { DurableV08LedgerLineageReader } from './durable-v08-ledger-lineage-reader.js';
import { readFinalReceiptFrom } from './atomic-transition-repository.js';
import type { SqlDatabase, SqlExecutor } from './sql-database.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    'Bounded Budget prefix: ' + message,
  );
}
const text = (v: unknown): string => {
  if (typeof v !== 'string' || !v || v.trim() !== v)
    invalid('noncanonical durable field');
  return v;
};
const timestamp = (v: unknown) =>
  v instanceof Date ? v.toISOString() : text(v);
const integer = (v: unknown) => {
  const s =
    typeof v === 'bigint' || typeof v === 'number' ? String(v) : text(v);
  if (!/^(?:0|[1-9]\d*)$/u.test(s)) invalid('noncanonical cursor');
  return s;
};
export async function readBoundedFinanceBudgetHistoryFrom(input: {
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
  if (h.rows.length !== 1) invalid('actual head required');
  const head = h.rows[0]!;
  if (
    head.world_version !== input.expectedWorldVersion ||
    BigInt(head.event_sequence) > 256n ||
    BigInt(head.world_version) > 256n
  )
    invalid('stale head or bounded replay capacity exceeded');
  const effects = await tx.query<{ financial: boolean; inventory: boolean }>(
    'select exists(select 1 from world_v2.financial_posting_batch where world_id=$1)as financial,exists(select 1 from world_v2.inventory_posting where world_id=$1)as inventory',
    [input.worldId],
  );
  if (
    effects.rows.length !== 1 ||
    effects.rows[0]!.financial ||
    effects.rows[0]!.inventory
  )
    invalid('intervening nonzero economic effect requires a different replay');
  const e = await tx.query<Record<string, unknown>>(
    'select event_id,event_type,schema_version,world_id,causation_command_id,correlation_id,world_version::text,event_sequence::text as sequence,sim_time::text,recorded_at_real,corrects_event_id,canonical_payload,payload_sha256,event_fingerprint from world_v2.authoritative_event where world_id=$1 and octet_length(canonical_payload)<=65536 order by event_sequence limit 257',
    [input.worldId],
  );
  if (
    e.rows.length !== Number(head.event_sequence) ||
    e.rows.length > 256 ||
    e.rows.reduce(
      (n, r) => n + Buffer.byteLength(text(r.canonical_payload)),
      0,
    ) > 1048576
  )
    invalid('complete bounded event prefix required');
  const reader = new DurableV08LedgerLineageReader({
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
  for (const row of e.rows) {
    if (
      !FINANCE_NATIVE_BUDGET_EVENT_TYPES.some((type) => type === row.event_type)
    )
      invalid('unknown intervening domain requires a different replay');
    const id = text(row.causation_command_id);
    let group = groups.get(id);
    if (!group) {
      const bounded = await tx.query<{ present: boolean }>(
        "select exists(select 1 from world_v2.command_submission where world_id=$1 and command_id=$2 and command_type='CORE_FINANCE_BUDGET_APPROPRIATION_V1'and office_id='FINANCE'and octet_length(canonical_payload)<=16384)as present",
        [input.worldId, id],
      );
      if (bounded.rows.length !== 1 || bounded.rows[0]!.present !== true)
        invalid('bounded native Budget command required');
      group = {
        command: await reader.readCommandFrom(tx, input.worldId, id),
        events: [],
      };
      groups.set(id, group);
    }
    const bytes = text(row.canonical_payload),
      body: unknown = JSON.parse(bytes);
    if (canonicalSerialize(body) !== bytes) invalid('noncanonical event bytes');
    const event = parseAuthoritativeEvent(
      {
        schemaVersion: text(row.schema_version),
        eventId: text(row.event_id),
        eventType: text(row.event_type),
        worldId: text(row.world_id),
        causationCommandId: id,
        correlationId: text(row.correlation_id),
        worldVersion: integer(row.world_version),
        sequence: integer(row.sequence),
        simTime: integer(row.sim_time),
        recordedAtReal: timestamp(row.recorded_at_real),
        correctsEventId:
          row.corrects_event_id === null ? null : text(row.corrects_event_id),
        payload: body,
      },
      sha,
    );
    if (
      event.payloadHash !== row.payload_sha256 ||
      event.fingerprint !== row.event_fingerprint
    )
      invalid('event hashes mismatch');
    group.events.push(event);
  }
  const frames = [];
  for (const group of groups.values()) {
    const transition = createAuthoritativeTransition({
      command: group.command,
      events: group.events,
      worldVersionBefore: group.command.expectedWorldVersion!,
      worldVersionAfter: group.events[0]!.worldVersion,
    });
    const receipt = await readFinalReceiptFrom(tx, group.command);
    if (!receipt || receipt.outcome !== 'COMMITTED')
      invalid('committed receipt missing');
    validateFinalReceiptForCommand({
      command: group.command,
      transition,
      receipt,
    });
    frames.push({
      ...group,
      transition,
      receipt,
      financialPostingBatches: [],
      inventoryPostings: [],
    });
  }
  const committed = await tx.query<{ command_id: string }>(
    "select command_id from world_v2.command_receipt where world_id=$1 and outcome='COMMITTED'order by world_version_after,command_id limit 257",
    [input.worldId],
  );
  if (
    committed.rows.length !== frames.length ||
    new Set(committed.rows.map((r) => r.command_id)).size !== frames.length ||
    frames.some(
      (f) => !committed.rows.some((r) => r.command_id === f.command.commandId),
    )
  )
    invalid('receipt set differs from complete prefix');
  const state = replayFinanceNativeBudgetHistory(input.worldId, frames, sha);
  if (
    state.worldVersion !== head.world_version ||
    state.eventSequence !== head.event_sequence
  )
    invalid('computed prefix differs from actual head');
  return Object.freeze({ head, frames: Object.freeze(frames), state });
}
