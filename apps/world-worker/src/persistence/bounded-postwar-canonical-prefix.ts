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
import { FINANCE_NATIVE_BUDGET_EVENT_TYPES } from '@econmind/core/finance-budget-native';
import { decodeDurableCanonicalCommandRow } from './durable-v08-ledger-lineage-reader.js';
import {
  readBoundedPostwarJournalFrom,
  decodeBoundedPostwarJournal,
  decodeBoundedPostwarFinancialPostings,
  type BoundedPostwarCanonicalFrame,
} from './bounded-postwar-fx-postings.js';
import { POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND } from '@econmind/core/authenticated-office-command-contract';
import { POSTWAR_DAY_ONE_TREASURY_FX_SETTLED_EVENT } from '@econmind/core/postwar-day-one-treasury-fx';
import { decodeDurableFinalReceiptRow } from './atomic-transition-repository.js';
export const BOUNDED_POSTWAR_PREFIX_LIMITS = Object.freeze({
  events: 256,
  eventBytes: 65536,
  commandBytes: 16384,
  prefixBytes: 1048576,
  countryBytes: 262144,
  totalCountryBytes: 1048576,
});
import type { SqlExecutor } from './sql-database.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    'Bounded canonical prefix: ' + message,
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
  ['CENTRAL_BANK_OMO_SETTLED_V1', 'CORE_CENTRAL_BANK_OMO_V1'],
  [
    'POSTWAR_BENEFICIAL_HOUSING_RENT_SETTLED_V1',
    'POSTWAR_BENEFICIAL_HOUSING_RENT_V1',
  ],
  [
    'CAPTAIN_POLITICAL_CAPITAL_ALLOCATED_V1',
    'CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1',
  ],
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
export async function readBoundedPostwarCanonicalPrefixFrom(
  tx: SqlExecutor,
  input: {
    readonly worldId: string;
    readonly countryId: string;
    readonly officeId: 'SOCIAL' | 'FINANCE';
  },
) {
  const response = await tx.query<Record<string, unknown>>(
    'select * from world_v2.read_postwar_bounded_prefix($1,$2,$3)',
    [input.worldId, input.countryId, input.officeId],
  );
  if (response.rows.length !== 1) invalid('one complete fixed prefix required');
  const journal = await readBoundedPostwarJournalFrom(tx, input);
  return decodeBoundedPostwarCanonicalPrefix({
    worldId: input.worldId,
    prefixRow: response.rows[0],
    journal,
  });
}
/** Decodes inert data obtained by a fixed, independently authorized domain
 * getter. The result is not an admission or a commit/source capability. */
export function decodeBoundedPostwarCanonicalPrefix(input: {
  readonly worldId: string;
  readonly prefixRow: unknown;
  readonly journal: Awaited<ReturnType<typeof readBoundedPostwarJournalFrom>>;
}) {
  const limit = BOUNDED_POSTWAR_PREFIX_LIMITS;
  const raw = input.prefixRow;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    invalid('complete fixed prefix response required');
  const value = raw as Record<string, unknown>;
  if (
    !value ||
    !Array.isArray(value.events) ||
    !Array.isArray(value.commands) ||
    !Array.isArray(value.receipts)
  )
    invalid('complete fixed prefix response required');
  const head = {
    world_version: integer(value.world_version),
    event_sequence: integer(value.event_sequence),
  };
  if (
    BigInt(head.world_version) > 256n ||
    BigInt(head.event_sequence) > 256n ||
    value.events.length !== Number(head.event_sequence) ||
    value.commands.length !== Number(head.world_version) ||
    value.receipts.length !== Number(head.world_version)
  )
    invalid('complete bounded prefix count and actual head required');
  const rowObject = (r: unknown): Record<string, unknown> => {
    if (!r || typeof r !== 'object' || Array.isArray(r))
      invalid('actual canonical row required');
    return r as Record<string, unknown>;
  };
  const e = { rows: value.events.map(rowObject) };
  const commands = new Map<string, CanonicalCommand>();
  for (const raw of value.commands) {
    const r = rowObject(raw);
    if (Buffer.byteLength(text(r.canonical_payload)) > limit.commandBytes)
      invalid('bounded canonical command required');
    const command = decodeDurableCanonicalCommandRow(
      {
        command_actor_id: r.actor_id,
        command_auth_subject: r.auth_subject,
        command_canonical_payload: r.canonical_payload,
        command_country_id: r.country_id,
        command_expected_world_version: r.expected_world_version,
        command_fingerprint: r.command_fingerprint,
        command_id: r.command_id,
        command_idempotency_key: r.idempotency_key,
        command_office_id: r.office_id,
        command_payload_sha256: r.payload_sha256,
        command_schema_version: r.schema_version,
        command_sim_time: r.sim_time,
        command_submitted_at_real: r.submitted_at_real,
        command_type: r.command_type,
        command_world_id: r.world_id,
        correlation_id: r.correlation_id,
      },
      sha,
    );
    if (command.worldId !== input.worldId || commands.has(command.commandId))
      invalid('unique actual World command required');
    commands.set(command.commandId, command);
  }
  const receipts = new Map<string, Record<string, unknown>>();
  for (const raw of value.receipts) {
    const r = rowObject(raw),
      id = text(r.command_id);
    if (
      r.world_id !== input.worldId ||
      r.outcome !== 'COMMITTED' ||
      receipts.has(id)
    )
      invalid('unique actual committed receipt required');
    receipts.set(id, r);
  }
  // A typed DTO is not trusted byte/count evidence. Recompute from all rows.
  const supplied = input.journal;
  const postings = decodeBoundedPostwarJournal({
    world_version: supplied?.head?.worldVersion,
    event_sequence: supplied?.head?.eventSequence,
    financial_batch_count: supplied?.financialBatchCount,
    inventory_posting_count: supplied?.inventoryPostingCount,
    financial_batches: supplied?.rows,
  });
  if (
    postings.head.worldVersion !== integer(head.world_version) ||
    postings.head.eventSequence !== integer(head.event_sequence) ||
    postings.inventoryPostingCount !== '0'
  )
    invalid(
      'journal differs from held current head or unsupported inventory effect',
    );
  let prefixBytes = postings.bytes;
  if (prefixBytes > limit.prefixBytes)
    invalid('complete prefix byte capacity exceeded');
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
      !socialCommand &&
      eventType !== POSTWAR_DAY_ONE_TREASURY_FX_SETTLED_EVENT
    )
      invalid('unknown intervening family');
    const id = text(row.causation_command_id);
    let group = groups.get(id);
    if (!group) {
      const command = commands.get(id);
      if (!command) invalid('bounded canonical command required');
      if (Buffer.byteLength(command.canonicalPayload) > limit.commandBytes)
        invalid('bounded canonical command required');
      prefixBytes += Buffer.byteLength(command.canonicalPayload);
      group = { command, events: [] };
      groups.set(id, group);
    }
    if (
      group.command.commandType !==
      (eventType === POSTWAR_DAY_ONE_TREASURY_FX_SETTLED_EVENT
        ? POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND
        : (socialCommand ?? 'CORE_FINANCE_BUDGET_APPROPRIATION_V1'))
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
  const frames: BoundedPostwarCanonicalFrame[] = [];
  for (const group of groups.values()) {
    const transition = createAuthoritativeTransition({
      command: group.command,
      events: group.events,
      worldVersionBefore: group.command.expectedWorldVersion!,
      worldVersionAfter: group.events[0]!.worldVersion,
    });
    const storedReceipt = receipts.get(group.command.commandId);
    const receipt = storedReceipt
      ? decodeDurableFinalReceiptRow(storedReceipt, group.command)
      : null;
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
      financialPostingBatches: decodeBoundedPostwarFinancialPostings({
        command: group.command,
        transition,
        rows: postings.rows,
      }),
      inventoryPostings: [],
    });
  }
  if (
    frames.reduce((n, f) => n + f.financialPostingBatches.length, 0) !==
    postings.rows.length
  )
    invalid('posting set differs from complete canonical prefix');
  if (
    receipts.size !== frames.length ||
    commands.size !== frames.length ||
    frames.some(
      (f, index) =>
        !receipts.has(f.command.commandId) ||
        f.transition.worldVersionBefore !== String(index) ||
        f.transition.worldVersionAfter !== String(index + 1),
    )
  )
    invalid('receipt set differs from complete prefix');
  if (e.rows.some((r, index) => integer(r.sequence) !== String(index + 1)))
    invalid('complete ordered event sequence required');
  return Object.freeze({
    head: Object.freeze({
      worldVersion: integer(head.world_version),
      eventSequence: integer(head.event_sequence),
    }),
    frames: Object.freeze(frames),
    prefixBytes,
  });
}
