/** Historical quote DATA for complete mixed-prefix replay. Current source and
 * actor/automatic-publisher guards remain owned by the calling fixed runtime.
 * A later FX quote/source revocation cannot undo a committed payment. */
import { createHash } from 'node:crypto';
import {
  canonicalSerialize,
  DomainError,
  DOMAIN_ERROR_CODES,
  worldId,
  countryId,
} from '@econmind/core';
import {
  parsePostwarDayOneFxQuoteData,
  type PostwarDayOneFxQuoteData,
} from '@econmind/core/postwar-day-one-treasury-fx';
import type { SqlExecutor } from './sql-database.js';

export const POSTWAR_DAY_ONE_FX_HISTORY_READ_PROPOSAL =
  'database/proposals/postwar-day-one-fx-history-read.sql';
export const POSTWAR_DAY_ONE_FX_COMMITTED_QUOTE_QUERY =
  'select * from world_v2.read_postwar_day_one_fx_committed_quote($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)';
export const POSTWAR_DAY_ONE_FX_TREASURY_HISTORY_PURPOSE =
  'TREASURY_FX_SOURCE_REPLAY' as const;
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
function invalid(reason: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    'POSTWAR_DAY_ONE_FX_HISTORY:' + reason,
  );
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value || value.trim() !== value)
    invalid('EXACT_TRACE_METADATA_REQUIRED');
  return value;
}
function integer(value: unknown): string {
  const result = text(value);
  if (!/^(0|[1-9][0-9]*)$/u.test(result)) invalid('CANONICAL_HEAD_REQUIRED');
  return result;
}
export interface PostwarDayOneFxCommittedQuoteRequest {
  readonly worldId: string;
  /** The actually held Social/Finance source scope, NOT the foreign payer. */
  readonly hostCountryId: string;
  readonly sourceCountryId: string;
  readonly officeId: 'SOCIAL' | 'FINANCE';
  readonly seedFingerprint: string;
  readonly admissionRef: string;
  readonly eventId: string;
  readonly eventPayloadHash: string;
  readonly quoteRef: string;
  readonly quoteSha256: string;
}
export interface PostwarDayOneFxCommittedQuote {
  readonly classification: 'HISTORICAL_COMMITTED_QUOTE_DATA_NOT_AUTHORITY';
  readonly quote: PostwarDayOneFxQuoteData;
  readonly observedHead: Readonly<{
    worldVersion: string;
    eventSequence: string;
  }>;
  readonly trace: Readonly<{
    hostCountryId: string;
    sourceCountryId: string;
    officeId: 'SOCIAL' | 'FINANCE';
    hostSourceRef: string;
    registrationRef: string;
    sourceRevision: string;
    seedId: string;
    seedFingerprint: string;
    admissionRef: string;
    quoteTextSHA256: string;
    eventId: string;
    eventPayloadHash: string;
    commandId: string;
    commandFingerprint: string;
    worldVersion: string;
    eventSequence: string;
  }>;
}
/** SQL rechecks fixed source-reader role, actual H/admission/permit and host
 * source registration. It returns only the immutable quote referenced by this
 * exact same-World COMMITTED event+receipt. No balance, actor grant or Ready. */
export async function readPostwarDayOneFxCommittedQuoteFrom(
  tx: SqlExecutor,
  input: PostwarDayOneFxCommittedQuoteRequest,
): Promise<Readonly<PostwarDayOneFxCommittedQuote>> {
  return readCommittedQuoteFrom(tx, input, 'SOURCE_REPLAY');
}
/** Fixed Treasury source replay only. Does not borrow a Budget role/policy.
 * New FX commands must still pass the separate current source/quote lock. */
export async function readPostwarDayOneFxCommittedQuoteForTreasuryFrom(
  tx: SqlExecutor,
  input: Omit<PostwarDayOneFxCommittedQuoteRequest, 'officeId'>,
): Promise<Readonly<PostwarDayOneFxCommittedQuote>> {
  return readCommittedQuoteFrom(
    tx,
    { ...input, officeId: 'FINANCE' },
    POSTWAR_DAY_ONE_FX_TREASURY_HISTORY_PURPOSE,
  );
}
async function readCommittedQuoteFrom(
  tx: SqlExecutor,
  input: PostwarDayOneFxCommittedQuoteRequest,
  purpose: 'SOURCE_REPLAY' | typeof POSTWAR_DAY_ONE_FX_TREASURY_HISTORY_PURPOSE,
): Promise<Readonly<PostwarDayOneFxCommittedQuote>> {
  worldId(input.worldId);
  countryId(input.hostCountryId);
  countryId(input.sourceCountryId);
  if (
    !['SOCIAL', 'FINANCE'].includes(input.officeId) ||
    !/^sha256:[a-f0-9]{64}$/u.test(input.seedFingerprint) ||
    !/^sha256:[a-f0-9]{64}$/u.test(input.eventPayloadHash) ||
    !/^[a-f0-9]{64}$/u.test(input.quoteSha256)
  )
    invalid('EXACT_REPLAY_SCOPE_REQUIRED');
  const rows = await tx
    .query(POSTWAR_DAY_ONE_FX_COMMITTED_QUOTE_QUERY, [
      input.worldId,
      input.hostCountryId,
      input.sourceCountryId,
      input.officeId,
      input.seedFingerprint,
      input.admissionRef,
      input.eventId,
      input.eventPayloadHash,
      input.quoteRef,
      input.quoteSha256,
      purpose,
    ])
    .catch((error: unknown) => {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        'message' in error &&
        ['42501', '55000', '22023'].includes(String(error.code)) &&
        /^FX_HISTORY_[A-Z_]+$/u.test(String(error.message))
      ) {
        const failure = new DomainError(
          DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
          'POSTWAR_DAY_ONE_FX_HISTORY:' + String(error.message),
        );
        Object.defineProperty(failure, 'cause', { value: error });
        throw failure;
      }
      throw error;
    });
  if (rows.rows.length !== 1 || !rows.rows[0])
    invalid('EXACT_COMMITTED_ORIGINAL_REQUIRED');
  const r = rows.rows[0],
    bytes = text(r.quote_text);
  if (Buffer.byteLength(bytes) > 4096 || sha(bytes) !== r.quote_text_sha256)
    invalid('ORIGINAL_BYTES_HASH_DIFFERS');
  const quote = parsePostwarDayOneFxQuoteData(JSON.parse(bytes), sha);
  if (
    canonicalSerialize(quote) !== bytes ||
    quote.worldId !== input.worldId ||
    quote.countryId !== input.sourceCountryId ||
    quote.seedFingerprint !== input.seedFingerprint ||
    quote.quoteRef !== input.quoteRef ||
    quote.quoteSha256 !== input.quoteSha256 ||
    r.seed_fingerprint !== input.seedFingerprint ||
    r.admission_ref !== input.admissionRef ||
    r.event_id !== input.eventId ||
    r.event_payload_hash !== input.eventPayloadHash ||
    r.host_country_id !== input.hostCountryId ||
    r.source_country_id !== input.sourceCountryId ||
    r.office_id !== input.officeId
  )
    invalid('ACTUAL_ORIGINAL_TRACE_SCOPE_DIFFERS');
  const observedHead = Object.freeze({
    worldVersion: integer(r.observed_world_version),
    eventSequence: integer(r.observed_event_sequence),
  });
  const frameVersion = integer(r.frame_world_version),
    frameSequence = integer(r.frame_event_sequence);
  if (
    BigInt(frameVersion) > BigInt(observedHead.worldVersion) ||
    BigInt(frameSequence) > BigInt(observedHead.eventSequence)
  )
    invalid('COMMITTED_FRAME_OUTSIDE_OBSERVED_PREFIX');
  return Object.freeze({
    classification: 'HISTORICAL_COMMITTED_QUOTE_DATA_NOT_AUTHORITY' as const,
    quote,
    observedHead,
    trace: Object.freeze({
      hostCountryId: input.hostCountryId,
      sourceCountryId: input.sourceCountryId,
      officeId: input.officeId,
      hostSourceRef: text(r.host_source_ref),
      registrationRef: text(r.registration_ref),
      sourceRevision: text(r.source_revision),
      seedId: text(r.seed_id),
      seedFingerprint: input.seedFingerprint,
      admissionRef: input.admissionRef,
      quoteTextSHA256: sha(bytes),
      eventId: input.eventId,
      eventPayloadHash: input.eventPayloadHash,
      commandId: text(r.command_id),
      commandFingerprint: text(r.command_fingerprint),
      worldVersion: frameVersion,
      eventSequence: frameSequence,
    }),
  });
}
