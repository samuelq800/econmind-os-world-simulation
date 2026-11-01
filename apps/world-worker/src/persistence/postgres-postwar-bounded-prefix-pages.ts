/** Transaction-bound DATA transport. Pages never grant source, actor, lease,
 * admission or ledger authority. Core's private continuation independently
 * replays every complete frame; callers still hold their real source guards. */
import { createHash } from 'node:crypto';
import {
  canonicalSerialize,
  canonicalHashInput,
  canonicalSha256,
  parseAuthoritativeEvent,
  createAuthoritativeTransition,
  createFinalCommandReceipt,
  validateFinalReceiptForCommand,
} from '@econmind/core';
import type { FinanceNativeBudgetCanonicalFrame } from '@econmind/core/finance-budget-native';
import { decodeDurableCanonicalCommandRow } from './durable-v08-ledger-lineage-reader.js';
import { decodeDurableFinalReceiptRow } from './atomic-transition-repository.js';
import {
  decodeBoundedPostwarFinancialPostings,
  decodeBoundedPostwarInventoryPostings,
  type BoundedPostwarFinancialPostingRow,
} from './bounded-postwar-fx-postings.js';
import type { SqlExecutor } from './sql-database.js';
const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const hash = (v: unknown) => canonicalSha256(canonicalHashInput(v), sha);
const MAX_BYTES = 1048576,
  MAX_EVENTS = 256;
export const POSTWAR_BOUNDED_PREFIX_PAGE_QUERY =
  'select * from world_v2.read_postwar_bounded_prefix_page($1,$2,$3,$4::bigint,$5::bigint,$6::bigint,$7::bigint,$8,$9)';
export interface PostwarReplayPageHead {
  readonly worldVersion: string;
  readonly eventSequence: string;
}
/** Exact Core continuation DATA shape. This is not an authorization token. */
export interface PostwarBoundedReplayPage {
  readonly schemaVersion: 'finance-social-replay-page-v1';
  readonly worldId: string;
  readonly seedFingerprint: string;
  readonly fromHead: Readonly<PostwarReplayPageHead>;
  readonly throughHead: Readonly<PostwarReplayPageHead>;
  readonly expectedHead: Readonly<PostwarReplayPageHead>;
  readonly frames: readonly FinanceNativeBudgetCanonicalFrame[];
  readonly framesSha256: string;
}
export interface PostwarBoundedPrefixPageReader {
  readonly classification: 'TRANSACTION_BOUND_PREFIX_PAGE_TRANSPORT_NOT_AUTHORITY';
  readNext(): Promise<Readonly<PostwarBoundedReplayPage> | null>;
  inspect(): Readonly<{
    complete: boolean;
    pages: string;
    head: Readonly<PostwarReplayPageHead> | null;
    throughHead: Readonly<PostwarReplayPageHead>;
    hostSourceRef: string | null;
  }>;
}
const issued = new WeakSet<object>();
export function isPostwarBoundedPrefixPageReader(
  value: unknown,
): value is Readonly<PostwarBoundedPrefixPageReader> {
  return typeof value === 'object' && value !== null && issued.has(value);
}
function invalid(message: string): never {
  throw Error('POSTWAR_PREFIX_PAGE:' + message);
}
function record(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    invalid('CANONICAL_OBJECT_REQUIRED');
  return v as Record<string, unknown>;
}
function text(v: unknown): string {
  if (typeof v !== 'string' || !v || v.trim() !== v)
    invalid('CANONICAL_TEXT_REQUIRED');
  return v;
}
function uint(v: unknown): string {
  const s = text(v);
  if (!/^(0|[1-9][0-9]*)$/u.test(s)) invalid('CANONICAL_CURSOR_REQUIRED');
  return s;
}
function array(v: unknown): unknown[] {
  if (!Array.isArray(v)) invalid('COMPLETE_ARRAY_REQUIRED');
  return v;
}
const same = (a: unknown, b: unknown) =>
  canonicalSerialize(a) === canonicalSerialize(b);
function postings(
  v: unknown,
  commandId: string,
): readonly BoundedPostwarFinancialPostingRow[] {
  return Object.freeze(
    array(v).map((entry) => {
      const r = record(entry),
        { fingerprint, ...body } = r;
      if (
        typeof fingerprint !== 'string' ||
        !/^sha256:[a-f0-9]{64}$/u.test(fingerprint)
      )
        invalid('CANONICAL_POSTING_FINGERPRINT_REQUIRED');
      return Object.freeze({
        causation_command_id: commandId,
        canonical_payload: canonicalSerialize(body),
        fingerprint,
      });
    }),
  );
}
function decodeFrame(
  raw: unknown,
  world: string,
  from: Readonly<PostwarReplayPageHead>,
) {
  const f = record(raw),
    c = record(f.command);
  const command = decodeDurableCanonicalCommandRow(
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
      command_sim_time: c.simTime,
      command_submitted_at_real: c.submittedAtReal,
      command_type: c.commandType,
      command_world_id: c.worldId,
      correlation_id: c.correlationId,
    },
    sha,
  );
  if (
    command.worldId !== world ||
    command.expectedWorldVersion !== from.worldVersion ||
    Buffer.byteLength(command.canonicalPayload) > 16384 ||
    !same(command, c)
  )
    invalid('EXACT_GLOBAL_COMMAND_BOUNDARY_REQUIRED');
  const rawEvents = array(f.events);
  if (rawEvents.length < 1 || rawEvents.length > MAX_EVENTS)
    invalid('WHOLE_TRANSITION_EVENT_SET_REQUIRED');
  const next = (BigInt(from.worldVersion) + 1n).toString();
  const events = Object.freeze(
    rawEvents.map((entry, index) => {
      const e = record(entry),
        rawPayload = text(e.canonicalPayload);
      if (Buffer.byteLength(rawPayload) > 65536)
        invalid('EVENT_BYTES_EXCEEDED');
      const payload: unknown = JSON.parse(rawPayload);
      if (canonicalSerialize(payload) !== rawPayload)
        invalid('CANONICAL_EVENT_BYTES_REQUIRED');
      const value = parseAuthoritativeEvent(
        {
          schemaVersion: text(e.schemaVersion),
          eventId: text(e.eventId),
          eventType: text(e.eventType),
          worldId: text(e.worldId),
          causationCommandId: text(e.causationCommandId),
          correlationId: text(e.correlationId),
          worldVersion: uint(e.worldVersion),
          sequence: uint(e.sequence),
          simTime: uint(e.simTime),
          recordedAtReal: text(e.recordedAtReal),
          correctsEventId:
            e.correctsEventId === null ? null : text(e.correctsEventId),
          payload,
        },
        sha,
      );
      if (
        value.worldId !== world ||
        value.worldVersion !== next ||
        value.sequence !==
          (BigInt(from.eventSequence) + BigInt(index) + 1n).toString() ||
        !same(value, e)
      )
        invalid('EXACT_ORDERED_EVENT_BYTES_REQUIRED');
      return value;
    }),
  );
  const transition = createAuthoritativeTransition({
    command,
    events,
    worldVersionBefore: from.worldVersion,
    worldVersionAfter: next,
  });
  if (!same(transition, f.transition))
    invalid('WHOLE_CANONICAL_TRANSITION_REQUIRED');
  const r = record(f.receipt),
    receipt = decodeDurableFinalReceiptRow(
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
        sim_time: r.simTime,
        event_ids: r.eventIds,
        recorded_at_real: r.recordedAtReal,
      },
      command,
    );
  if (!receipt || receipt.outcome !== 'COMMITTED')
    invalid('ACTUAL_COMMITTED_RECEIPT_REQUIRED');
  validateFinalReceiptForCommand({ command, transition, receipt });
  const expectedReceipt = createFinalCommandReceipt({
    command,
    transition,
    outcome: 'COMMITTED',
    reasonCode: null,
    simTime: command.simTime,
    recordedAtReal: receipt.recordedAtReal,
  });
  if (!same(expectedReceipt, r) || !same(receipt, r))
    invalid('EXACT_FULL_RECEIPT_REQUIRED');
  const financialPostingBatches = decodeBoundedPostwarFinancialPostings({
      command,
      transition,
      rows: postings(f.financialPostingBatches, command.commandId),
    }),
    inventoryPostings = decodeBoundedPostwarInventoryPostings({
      command,
      transition,
      rows: postings(f.inventoryPostings, command.commandId),
    });
  const frame = Object.freeze({
    command,
    events,
    transition,
    receipt,
    financialPostingBatches,
    inventoryPostings,
  });
  if (!same(frame, f)) invalid('EXACT_COMPLETE_FRAME_REQUIRED');
  return frame;
}
/** Pure canonical DATA decode. No source, actor, admission or settlement
 * authority is issued. The caller must bind SQL pins and actual stored bytes. */
export function decodePostwarBoundedReplayFrameData(input: {
  readonly worldId: string;
  readonly fromHead: Readonly<PostwarReplayPageHead>;
  readonly frame: unknown;
}): FinanceNativeBudgetCanonicalFrame {
  return decodeFrame(input.frame, input.worldId, input.fromHead);
}
/** Only an existing caller-held RR/serializable transaction is used. There is
 * no pool, callback, arbitrary cursor, external state DTO, role switch or loop
 * which consumes commands. Each explicit read performs one bounded fixed RPC. */
export function createPostwarBoundedPrefixPageReaderFrom(
  tx: SqlExecutor,
  input: {
    readonly worldId: string;
    readonly countryId: string;
    readonly officeId: 'SOCIAL' | 'FINANCE';
    readonly seedFingerprint: string;
    readonly admissionRef: string;
  },
): Readonly<PostwarBoundedPrefixPageReader> {
  if (
    !/^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$/u.test(input.worldId) ||
    !/^COUNTRY_(0[1-9]|[1-6][0-9]|70)$/u.test(input.countryId) ||
    !['SOCIAL', 'FINANCE'].includes(input.officeId) ||
    !/^sha256:[a-f0-9]{64}$/u.test(input.seedFingerprint) ||
    text(input.admissionRef) !== input.admissionRef
  )
    invalid('FIXED_SERVER_SCOPE_REQUIRED');
  const scope = Object.freeze({ ...input });
  let through: Readonly<PostwarReplayPageHead> = Object.freeze({
      worldVersion: '0',
      eventSequence: '0',
    }),
    head: Readonly<PostwarReplayPageHead> | null = null,
    pin: string | null = null,
    host: string | null = null,
    complete = false,
    busy = false,
    pages = 0n,
    financial = 0n,
    inventory = 0n;
  const reader: PostwarBoundedPrefixPageReader = {
    classification: 'TRANSACTION_BOUND_PREFIX_PAGE_TRANSPORT_NOT_AUTHORITY',
    inspect() {
      return Object.freeze({
        complete,
        pages: pages.toString(),
        head,
        throughHead: through,
        hostSourceRef: host,
      });
    },
    async readNext() {
      if (busy) invalid('CONCURRENT_PAGE_READ_DENIED');
      // Even the terminal read rechecks the actual transaction/source pins.
      // A copied SqlExecutor or a completed pool transaction is not a lease.
      const wasComplete = complete;
      busy = true;
      try {
        const response = await tx.query<Record<string, unknown>>(
          POSTWAR_BOUNDED_PREFIX_PAGE_QUERY,
          [
            scope.worldId,
            scope.countryId,
            scope.officeId,
            through.worldVersion,
            through.eventSequence,
            head?.worldVersion ?? null,
            head?.eventSequence ?? null,
            scope.seedFingerprint,
            scope.admissionRef,
          ],
        );
        if (response.rows.length !== 1) invalid('ONE_FIXED_PAGE_REQUIRED');
        const row = response.rows[0]!;
        const currentHead = Object.freeze({
            worldVersion: uint(row.world_version),
            eventSequence: uint(row.event_sequence),
          }),
          from = Object.freeze({
            worldVersion: uint(row.from_world_version),
            eventSequence: uint(row.from_event_sequence),
          }),
          to = Object.freeze({
            worldVersion: uint(row.through_world_version),
            eventSequence: uint(row.through_event_sequence),
          });
        if (
          row.world_id !== scope.worldId ||
          row.host_country_id !== scope.countryId ||
          row.office_id !== scope.officeId ||
          row.seed_fingerprint !== scope.seedFingerprint ||
          row.admission_ref !== scope.admissionRef ||
          !same(from, through) ||
          (head !== null && !same(currentHead, head)) ||
          typeof row.has_more !== 'boolean'
        )
          invalid('HELD_SCOPE_HEAD_AND_CURSOR_REQUIRED');
        const totals = {
          frames: uint(row.total_frame_count),
          events: uint(row.total_event_count),
          financial: uint(row.total_financial_batch_count),
          inventory: uint(row.total_inventory_posting_count),
        };
        if (
          totals.frames !== currentHead.worldVersion ||
          totals.events !== currentHead.eventSequence ||
          BigInt(currentHead.eventSequence) < BigInt(currentHead.worldVersion)
        )
          invalid('ACTUAL_FULL_WORLD_TOTALS_REQUIRED');
        const currentHost = text(row.host_source_ref),
          currentPin = canonicalSerialize({
            transaction: uint(row.transaction_id),
            backend: uint(row.backend_pid),
            seedId: text(row.seed_id),
            seedFingerprint: scope.seedFingerprint,
            admissionRef: scope.admissionRef,
            host: currentHost,
            head: currentHead,
            totals,
          });
        if (pin !== null && pin !== currentPin)
          invalid('TRANSACTION_OR_IMMUTABLE_SOURCE_PINS_CHANGED');
        const raw = text(row.frames_text),
          bytes = Buffer.byteLength(raw);
        if (
          bytes > MAX_BYTES ||
          uint(row.frame_bytes) !== String(bytes) ||
          row.frames_sha256 !== canonicalSha256('SHA-256\n' + raw, sha)
        )
          invalid('EXACT_BOUNDED_PAGE_HASH_REQUIRED');
        const parsed: unknown = JSON.parse(raw);
        if (canonicalSerialize(parsed) !== raw)
          invalid('CANONICAL_PAGE_BYTES_REQUIRED');
        const entries = array(parsed);
        if (entries.length > MAX_EVENTS)
          invalid('PAGE_EVENT_CAPACITY_EXCEEDED');
        let cursor: Readonly<PostwarReplayPageHead> = from;
        const frames = Object.freeze(
          entries.map((entry) => {
            const frame = decodeFrame(entry, scope.worldId, cursor);
            cursor = Object.freeze({
              worldVersion: frame.transition.worldVersionAfter,
              eventSequence: frame.events.at(-1)!.sequence,
            });
            return frame;
          }),
        );
        const eventCount = frames.reduce((n, f) => n + f.events.length, 0),
          batches = frames.reduce(
            (n, f) => n + f.financialPostingBatches.length,
            0,
          ),
          stocks = frames.reduce((n, f) => n + f.inventoryPostings.length, 0);
        if (
          eventCount > MAX_EVENTS ||
          batches > 512 ||
          stocks > 256 ||
          uint(row.event_count) !== String(eventCount) ||
          uint(row.frame_count) !== String(frames.length) ||
          uint(row.financial_batch_count) !== String(batches) ||
          uint(row.inventory_posting_count) !== String(stocks) ||
          !same(cursor, to) ||
          BigInt(to.worldVersion) > BigInt(currentHead.worldVersion) ||
          BigInt(to.eventSequence) > BigInt(currentHead.eventSequence)
        )
          invalid('COMPLETE_PAGE_BOUNDARY_AND_JOURNAL_REQUIRED');
        if (
          row.has_more !== !same(to, currentHead) ||
          (frames.length === 0 && !same(from, currentHead))
        )
          invalid('NO_EMPTY_INTERMEDIATE_OR_TRUNCATED_PAGE');
        const nextFinancial = financial + BigInt(batches),
          nextInventory = inventory + BigInt(stocks);
        if (
          !row.has_more &&
          (nextFinancial !== BigInt(totals.financial) ||
            nextInventory !== BigInt(totals.inventory))
        )
          invalid('COMPLETE_GLOBAL_JOURNAL_REQUIRED');
        const framesSha256 = hash(frames);
        if (framesSha256 !== row.frames_sha256)
          invalid('RECONSTRUCTED_FRAME_HASH_MISMATCH');
        if (wasComplete) return null;
        pin = currentPin;
        host = currentHost;
        head = currentHead;
        through = to;
        pages++;
        financial = nextFinancial;
        inventory = nextInventory;
        complete = !row.has_more;
        return Object.freeze({
          schemaVersion: 'finance-social-replay-page-v1',
          worldId: scope.worldId,
          seedFingerprint: scope.seedFingerprint,
          fromHead: from,
          throughHead: to,
          expectedHead: currentHead,
          frames,
          framesSha256,
        });
      } finally {
        busy = false;
      }
    },
  };
  issued.add(reader);
  return Object.freeze(reader);
}
