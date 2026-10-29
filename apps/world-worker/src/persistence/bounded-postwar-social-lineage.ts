/** Complete bounded canonical SQL prefix, data only. No seed hydration,
 * source admission, authority, skipped family or supplied current-state DTO. */
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
  type FinanceNativeBudgetCanonicalFrame,
} from '@econmind/core/finance-budget-native';
import { DurableV08LedgerLineageReader } from './durable-v08-ledger-lineage-reader.js';
import { readFinalReceiptFrom } from './atomic-transition-repository.js';
import { BOUNDED_MIXED_OFFICE_LIMITS } from './bounded-mixed-office-history.js';
import type { SqlDatabase, SqlExecutor } from './sql-database.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    'Bounded Social prefix: ' + message,
  );
}
const text = (v: unknown): string => {
  if (typeof v !== 'string' || !v || v.trim() !== v)
    invalid('noncanonical durable field');
  return v;
};
const integer = (v: unknown): string => {
  const s =
    typeof v === 'number' || typeof v === 'bigint' ? String(v) : text(v);
  if (!/^(?:0|[1-9]\d*)$/u.test(s)) invalid('noncanonical cursor');
  return s;
};
const timestamp = (v: unknown) =>
  v instanceof Date ? v.toISOString() : text(v);
const socialTypes = new Map([
  [
    'SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATED_V1',
    'CORE_SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATE_V1',
  ],
  [
    'SOCIAL_EMPLOYMENT_SERVICE_PLANNED_V1',
    'CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1',
  ],
  ['SOCIAL_JOB_MATCH_SETTLED_V1', 'CORE_SOCIAL_JOB_MATCH_SETTLEMENT_V1'],
]);
export async function readBoundedPostwarSocialFramesFrom(input: {
  readonly executor: SqlExecutor;
  readonly database: SqlDatabase;
  readonly worldId: string;
  readonly countryId: string;
}) {
  const tx = input.executor,
    limit = BOUNDED_MIXED_OFFICE_LIMITS;
  const h = await tx.query<{ world_version: string; event_sequence: string }>(
    'select world_version,event_sequence from world_v2.lock_social_operating_lineage_head($1,$2)',
    [input.worldId, input.countryId],
  );
  if (h.rows.length !== 1) invalid('actual head required');
  const head = h.rows[0]!;
  if (
    BigInt(integer(head.world_version)) > BigInt(limit.events) ||
    BigInt(integer(head.event_sequence)) > BigInt(limit.events) ||
    BigInt(head.world_version) > BigInt(limit.events)
  )
    invalid('stale head or bounded replay capacity exceeded');
  const effects = await tx.query<{ financial: boolean; inventory: boolean }>(
    'select exists(select 1 from world_v2.financial_posting_batch where world_id=$1)as financial,exists(select 1 from world_v2.inventory_posting where world_id=$1)as inventory',
    [input.worldId],
  );
  if (
    effects.rows.length !== 1 ||
    effects.rows[0]!.financial !== false ||
    effects.rows[0]!.inventory !== false
  )
    invalid('unsupported financial or inventory posting effect');
  const e = await tx.query<Record<string, unknown>>(
    'select event_id,event_type,schema_version,world_id,causation_command_id,correlation_id,world_version::text,event_sequence::text as sequence,sim_time::text,recorded_at_real,corrects_event_id,canonical_payload,payload_sha256,event_fingerprint from world_v2.authoritative_event where world_id=$1 and octet_length(canonical_payload)<=65536 order by event_sequence limit 257',
    [input.worldId],
  );
  if (
    e.rows.length !== Number(head.event_sequence) ||
    e.rows.length > limit.events
  )
    invalid('complete bounded event prefix required');
  let prefixBytes = 0;
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
    const eventType = text(row.event_type),
      socialCommand = socialTypes.get(eventType);
    if (
      !FINANCE_NATIVE_BUDGET_EVENT_TYPES.some((t) => t === eventType) &&
      !socialCommand
    )
      invalid('unknown intervening family');
    const id = text(row.causation_command_id);
    let group = groups.get(id);
    if (!group) {
      const bounded = await tx.query<{ present: boolean }>(
        'select exists(select 1 from world_v2.command_submission where world_id=$1 and command_id=$2 and octet_length(canonical_payload)<=16384)as present',
        [input.worldId, id],
      );
      if (bounded.rows.length !== 1 || bounded.rows[0]!.present !== true)
        invalid('bounded canonical command required');
      const command = await reader.readCommandReadOnlyFrom(
        tx,
        input.worldId,
        id,
      );
      if (Buffer.byteLength(command.canonicalPayload) > limit.commandBytes)
        invalid('bounded canonical command required');
      prefixBytes += Buffer.byteLength(command.canonicalPayload);
      group = { command, events: [] };
      groups.set(id, group);
    }
    if (
      group.command.commandType !==
      (socialCommand ?? 'CORE_FINANCE_BUDGET_APPROPRIATION_V1')
    )
      invalid('event/command family mismatch');
    const bytes = text(row.canonical_payload);
    prefixBytes += Buffer.byteLength(bytes);
    if (
      Buffer.byteLength(bytes) > limit.eventBytes ||
      prefixBytes > limit.prefixBytes
    )
      invalid('complete prefix byte capacity exceeded');
    const body: unknown = JSON.parse(bytes);
    if (canonicalSerialize(body) !== bytes) invalid('noncanonical event bytes');
    const event = parseAuthoritativeEvent(
      {
        schemaVersion: text(row.schema_version),
        eventId: text(row.event_id),
        eventType,
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
  const frames: FinanceNativeBudgetCanonicalFrame[] = [];
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
  return Object.freeze({
    head: Object.freeze({
      worldVersion: integer(head.world_version),
      eventSequence: integer(head.event_sequence),
    }),
    frames: Object.freeze(frames),
    prefixBytes,
  });
}
