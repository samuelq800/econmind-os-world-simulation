/** Fixed persisted payment DATA, never a settled-payment brand or OP right.
 * Core must bind this decoded frame to the genuine full-prefix ledger, applied
 * batch, completed WORK and source before accepting an expense for production. */
import { createHash } from 'node:crypto';
import {
  canonicalHashInput,
  canonicalSerialize,
  canonicalSha256,
} from '@econmind/core';
import type { FinanceNativeBudgetCanonicalFrame } from '@econmind/core/finance-budget-native';
import { decodePostwarBoundedReplayFrameData } from './postgres-postwar-bounded-prefix-pages.js';
import type { SqlExecutor } from './sql-database.js';
const sha = (v: string) => createHash('sha256').update(v).digest('hex');
export const POSTWAR_INDUSTRY_PAID_WORK_ORIGINAL_QUERY =
  'select * from world_v2.read_postwar_industry_paid_work_original($1,$2,$3,$4,$5,$6::bigint,$7::bigint,$8,$9)';
function invalid(reason: string): never {
  throw Error('INDUSTRY_PAID_WORK_ORIGINAL:' + reason);
}
function text(v: unknown): string {
  if (typeof v !== 'string' || !v || v.trim() !== v)
    invalid('EXACT_TEXT_REQUIRED');
  return v;
}
function uint(v: unknown): string {
  const s = text(v);
  if (!/^(0|[1-9]\d*)$/u.test(s)) invalid('CANONICAL_CURSOR_REQUIRED');
  return s;
}
export interface PostwarIndustryPaidWorkOriginal {
  readonly classification: 'ACTUAL_COMMITTED_PAYMENT_FRAME_DATA_NOT_SETTLEMENT_AUTHORITY';
  readonly paymentFrame: Readonly<FinanceNativeBudgetCanonicalFrame>;
  readonly paymentFrameSha256: string;
  readonly head: Readonly<{ worldVersion: string; eventSequence: string }>;
  readonly worldId: string;
  readonly countryId: string;
  readonly facilityId: string;
  readonly runId: string;
  readonly workEventFingerprint: string;
  readonly seedId: string;
  readonly seedFingerprint: string;
  readonly admissionRef: string;
  readonly sourceRef: string;
  readonly sourceRawSha256: string;
}
export async function readPostwarIndustryPaidWorkOriginalFrom(
  tx: SqlExecutor,
  input: Readonly<{
    worldId: string;
    countryId: string;
    facilityId: string;
    runId: string;
    workEventFingerprint: string;
    expectedHead: Readonly<{ worldVersion: string; eventSequence: string }>;
    seedFingerprint: string;
    admissionRef: string;
  }>,
): Promise<Readonly<PostwarIndustryPaidWorkOriginal>> {
  for (const s of [
    input.worldId,
    input.countryId,
    input.facilityId,
    input.runId,
    input.admissionRef,
  ])
    text(s);
  if (
    !/^sha256:[a-f0-9]{64}$/u.test(input.workEventFingerprint) ||
    !/^sha256:[a-f0-9]{64}$/u.test(input.seedFingerprint)
  )
    invalid('EXACT_FINGERPRINT_REQUIRED');
  const head = Object.freeze({
    worldVersion: uint(input.expectedHead.worldVersion),
    eventSequence: uint(input.expectedHead.eventSequence),
  });
  const result = await tx.query<Record<string, unknown>>(
    POSTWAR_INDUSTRY_PAID_WORK_ORIGINAL_QUERY,
    [
      input.worldId,
      input.countryId,
      input.facilityId,
      input.runId,
      input.workEventFingerprint,
      head.worldVersion,
      head.eventSequence,
      input.seedFingerprint,
      input.admissionRef,
    ],
  );
  if (result.rows.length !== 1)
    invalid('ACTUAL_ONE_COMMITTED_PAYMENT_REQUIRED');
  const row = result.rows[0]!;
  for (const [key, value] of Object.entries({
    world_id: input.worldId,
    country_id: input.countryId,
    facility_id: input.facilityId,
    run_id: input.runId,
    work_event_fingerprint: input.workEventFingerprint,
    world_version: head.worldVersion,
    event_sequence: head.eventSequence,
    seed_fingerprint: input.seedFingerprint,
    admission_ref: input.admissionRef,
  }))
    if (row[key] !== value) invalid('ACTUAL_HELD_SCOPE_PINS_DIFFER');
  const raw = text(row.payment_frame_text);
  if (Buffer.byteLength(raw, 'utf8') > 262144) invalid('FRAME_256K_BOUND');
  const data: unknown = JSON.parse(raw);
  if (
    canonicalSerialize(data) !== raw ||
    canonicalSha256(canonicalHashInput(data), sha) !== row.payment_frame_sha256
  )
    invalid('EXACT_CANONICAL_FRAME_HASH_REQUIRED');
  const fromHead = {
      worldVersion: uint(row.from_world_version),
      eventSequence: uint(row.from_event_sequence),
    },
    frame = decodePostwarBoundedReplayFrameData({
      worldId: input.worldId,
      fromHead,
      frame: data,
    });
  if (
    frame.command.countryId !== input.countryId ||
    frame.command.commandType !== 'CORE_INDUSTRY_OPERATING_WAGE_PAY_V1' ||
    frame.command.officeId !== null ||
    frame.events.length !== 1 ||
    frame.events[0]!.eventType !== 'INDUSTRY_OPERATING_WAGE_PAID_V1' ||
    frame.financialPostingBatches.length !== 1 ||
    frame.inventoryPostings.length !== 0 ||
    BigInt(frame.transition.worldVersionAfter) > BigInt(head.worldVersion) ||
    BigInt(frame.events[0]!.sequence) > BigInt(head.eventSequence)
  )
    invalid('ACTUAL_ONE_WAGE_FRAME_REQUIRED');
  const payload: unknown = JSON.parse(frame.events[0]!.canonicalPayload);
  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    (payload as Record<string, unknown>).workEventFingerprint !==
      input.workEventFingerprint
  )
    invalid('EXACT_WORK_EVENT_REQUIRED');
  const sourceRawSha256 = text(row.source_raw_sha256);
  if (!/^[a-f0-9]{64}$/u.test(sourceRawSha256))
    invalid('EXACT_SOURCE_RAW_HASH_REQUIRED');
  return Object.freeze({
    classification:
      'ACTUAL_COMMITTED_PAYMENT_FRAME_DATA_NOT_SETTLEMENT_AUTHORITY',
    paymentFrame: frame,
    paymentFrameSha256: text(row.payment_frame_sha256),
    head,
    worldId: input.worldId,
    countryId: input.countryId,
    facilityId: input.facilityId,
    runId: input.runId,
    workEventFingerprint: input.workEventFingerprint,
    seedId: text(row.seed_id),
    seedFingerprint: input.seedFingerprint,
    admissionRef: input.admissionRef,
    sourceRef: text(row.source_ref),
    sourceRawSha256,
  });
}
