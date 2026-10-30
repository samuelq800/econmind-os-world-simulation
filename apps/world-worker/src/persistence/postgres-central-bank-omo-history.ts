/** Historical registered DATA for complete shared replay. This helper grants
 * neither a financial-ledger brand nor CB/current-source/commit authority. The
 * owning Core orchestrator must still validate every frame and all effects. */
import { createHash } from 'node:crypto';
import {
  CENTRAL_BANK_OMO_COMMAND,
  CENTRAL_BANK_OMO_EVENT,
  canonicalSerialize,
  DomainError,
  DOMAIN_ERROR_CODES,
  type CanonicalCommand,
  type AuthoritativeTransition,
  type FinalCommandReceipt,
  type CentralBankOmoSourceFacts,
} from '@econmind/core';
import type { CentralBankOmoOriginal } from './postgres-central-bank-omo-originals.js';
import type { SqlExecutor } from './sql-database.js';
export const CENTRAL_BANK_OMO_HISTORY_PROPOSAL =
  'database/proposals/central-bank-omo-history-read.sql';
export const CENTRAL_BANK_OMO_HISTORY_QUERY =
  'select * from world_v2.read_central_bank_omo_committed_originals($1,$2,$3,$4,$5,$6,$7)';
export interface CentralBankOmoHistoricalFrame {
  readonly command: CanonicalCommand;
  readonly transition: AuthoritativeTransition;
  readonly receipt: FinalCommandReceipt;
  readonly financialPostingBatches: readonly unknown[];
}
export interface CentralBankOmoHistoricalCountry {
  readonly countryId: string;
  readonly adoptionRef: string;
  readonly sourceClass: 'ADMITTED_ORIGINAL' | 'TEST_ONLY';
  readonly sourceRef: string;
  readonly sourceRevision: string;
  readonly admissionRevision: string;
  readonly originalSHA256: string;
  readonly original: Readonly<CentralBankOmoOriginal>;
  readonly quotes: readonly Readonly<{
    quote: CentralBankOmoSourceFacts['quote'];
    sha256: string;
  }>[];
  readonly frames: readonly Readonly<{
    commandId: string;
    commandFingerprint: string;
    eventId: string;
    eventFingerprint: string;
    transitionId: string;
    financialBatchFingerprint: string;
  }>[];
}
export interface CentralBankOmoHistoryData {
  readonly classification: 'COMMITTED_CB_ORIGINALS_DATA_NOT_AUTHORITY';
  readonly worldId: string;
  readonly seedFingerprint: string;
  readonly admissionRef: string;
  readonly head: Readonly<{ worldVersion: string; eventSequence: string }>;
  readonly countries: readonly Readonly<CentralBankOmoHistoricalCountry>[];
}
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function invalid(s: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    'CB_OMO_HISTORY:' + s,
  );
}
function text(v: unknown): string {
  if (typeof v !== 'string' || !v || v.trim() !== v)
    invalid('EXACT_STORED_FIELD_REQUIRED');
  return v;
}
function record(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    invalid('STORED_RECORD_REQUIRED');
  return v as Record<string, unknown>;
}
function array(v: unknown, limit: number): readonly unknown[] {
  if (!Array.isArray(v) || v.length > limit)
    invalid('BOUNDED_STORED_ARRAY_REQUIRED');
  return v;
}
function bytes<T>(value: unknown, expected: unknown, limit: number): T {
  const raw = text(value);
  if (Buffer.byteLength(raw) > limit || sha(raw) !== expected)
    invalid('EXACT_REGISTERED_BYTES_REQUIRED');
  const data: unknown = JSON.parse(raw);
  if (canonicalSerialize(data) !== raw)
    invalid('CANONICAL_REGISTERED_ORIGINAL_REQUIRED');
  return data as T;
}
function freeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
/** Call inside the owning source transaction, with its actual fixed reader
 * role. No reader callbacks, source rows, caller-known/Ready flags or grants.
 * Revocation of the current HOST fails; revocation of historical CB inputs
 * does not erase an already COMMITTED economic event. */
export async function readCentralBankOmoCommittedOriginalsFrom(
  tx: SqlExecutor,
  input: {
    readonly worldId: string;
    readonly hostCountryId: string;
    readonly officeId:
      'FINANCE' | 'SOCIAL' | 'TREASURY_FX' | 'CAPTAIN' | 'CB_OMO';
    readonly seedFingerprint: string;
    readonly admissionRef: string;
    readonly expectedHead: Readonly<{
      worldVersion: string;
      eventSequence: string;
    }>;
    readonly mode: 'OFFICIAL_RUNTIME' | 'TEST_ONLY_LOCAL';
    readonly frames: readonly CentralBankOmoHistoricalFrame[];
  },
): Promise<Readonly<CentralBankOmoHistoryData>> {
  if (
    !['OFFICIAL_RUNTIME', 'TEST_ONLY_LOCAL'].includes(input.mode) ||
    input.frames.length > 256
  )
    invalid('FIXED_MODE_AND_COMPLETE_BOUNDED_PREFIX_REQUIRED');
  let result;
  try {
    result = await tx.query<Record<string, unknown>>(
      CENTRAL_BANK_OMO_HISTORY_QUERY,
      [
        input.worldId,
        input.hostCountryId,
        input.officeId,
        input.seedFingerprint,
        input.admissionRef,
        input.expectedHead.worldVersion,
        input.expectedHead.eventSequence,
      ],
    );
  } catch (error: unknown) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      'message' in error &&
      ['42501', '55000', '54000', '22023'].includes(String(error.code)) &&
      /^CB_OMO_HISTORY_[A-Z_]+$/u.test(String(error.message))
    ) {
      const failure = new DomainError(
        DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
        'CB_OMO_HISTORY:' + String(error.message),
      );
      Object.defineProperty(failure, 'cause', { value: error });
      throw failure;
    }
    throw error;
  }
  const row = result.rows[0];
  if (
    result.rows.length !== 1 ||
    !row ||
    row.world_version !== input.expectedHead.worldVersion ||
    row.event_sequence !== input.expectedHead.eventSequence ||
    row.seed_fingerprint !== input.seedFingerprint ||
    row.admission_ref !== input.admissionRef
  )
    invalid('ACTUAL_HELD_HEAD_AND_ADMISSION_REQUIRED');
  const selected = input.frames.filter((frame) => {
    if (frame.command.worldId !== input.worldId)
      invalid('SAME_WORLD_FULL_PREFIX_REQUIRED');
    if (frame.command.commandType !== CENTRAL_BANK_OMO_COMMAND) {
      if (
        frame.transition.events.some(
          (e) => e.eventType === CENTRAL_BANK_OMO_EVENT,
        )
      )
        invalid('CB_EVENT_COMMAND_MISMATCH');
      return false;
    }
    if (
      frame.transition.events.length !== 1 ||
      frame.transition.events[0]?.eventType !== CENTRAL_BANK_OMO_EVENT ||
      frame.financialPostingBatches.length !== 1 ||
      frame.receipt.outcome !== 'COMMITTED'
    )
      invalid('EXACT_COMMITTED_CB_FRAME_REQUIRED');
    return true;
  });
  const expectedCountries = new Set<string>(
    selected.map((f) => f.command.countryId),
  );
  const packets = array(row.originals, 70);
  if (
    packets.length !== expectedCountries.size ||
    Buffer.byteLength(JSON.stringify(packets)) > 1048576
  )
    invalid('ALL_PARTICIPATING_ORIGINS_REQUIRED');
  const countries: CentralBankOmoHistoricalCountry[] = packets.map((raw) => {
    const r = record(raw),
      countryId = text(r.country_id);
    if (
      !expectedCountries.delete(countryId) ||
      !['TEST_ONLY', 'ADMITTED_ORIGINAL'].includes(String(r.source_class)) ||
      (input.mode === 'OFFICIAL_RUNTIME' &&
        r.source_class !== 'ADMITTED_ORIGINAL')
    )
      invalid('UNIQUE_INDEPENDENT_ADOPTED_ORIGIN_REQUIRED');
    const original = bytes<CentralBankOmoOriginal>(
      r.original_text,
      r.original_sha256,
      262144,
    );
    if (
      original.schemaVersion !== 'central-bank-omo-original-v1' ||
      original.worldId !== input.worldId ||
      original.countryId !== countryId ||
      original.seedFingerprint !== input.seedFingerprint ||
      original.sourceRef !== r.source_ref ||
      original.sourceRevision !== r.source_revision
    )
      invalid('REGISTERED_H0_ORIGINAL_SCOPE_DIFFERS');
    const quotes = array(r.quotes, 256).map((rawQuote) => {
      const q = record(rawQuote),
        quote = bytes<CentralBankOmoSourceFacts['quote']>(
          q.quote_text,
          q.quote_sha256,
          16384,
        );
      if (
        quote.sourceRef !== original.sourceRef ||
        quote.issuerRef !== original.domesticTreasuryRef
      )
        invalid('HISTORICAL_QUOTE_ISSUER_OR_SOURCE_DIFFERS');
      return { quote, sha256: text(q.quote_sha256) };
    });
    if (new Set(quotes.map((q) => q.quote.quoteRef)).size !== quotes.length)
      invalid('UNIQUE_HISTORICAL_QUOTES_REQUIRED');
    const actualRefs = array(r.frames, 256).map((value) => {
      const ref = record(value);
      return {
        commandId: text(ref.command_id),
        commandFingerprint: text(ref.command_fingerprint),
        eventId: text(ref.event_id),
        eventFingerprint: text(ref.event_fingerprint),
        transitionId: text(ref.transition_id),
        financialBatchFingerprint: text(ref.financial_batch_fingerprint),
      };
    });
    const frames = selected.filter((f) => f.command.countryId === countryId);
    const expectedRefs = frames.map((f) => {
      const event = f.transition.events[0]!,
        batch = record(f.financialPostingBatches[0]);
      const payload = record(JSON.parse(event.canonicalPayload)),
        source = record(payload.source),
        quote = record(source.quote);
      const trace = record(payload.trace),
        snapshot = record(trace.snapshot);
      if (
        snapshot.lineageRef !== r.adoption_ref ||
        snapshot.snapshotRef !== original.sourceRef
      )
        invalid('RECORDED_SOURCE_ADOPTION_DIFFERS');
      const admitted = quotes.find((q) => q.quote.quoteRef === quote.quoteRef);
      if (
        !admitted ||
        canonicalSerialize(admitted.quote) !== canonicalSerialize(quote)
      )
        invalid('EXACT_COMMITTED_ADOPTED_QUOTE_REQUIRED');
      return {
        commandId: f.command.commandId,
        commandFingerprint: f.command.fingerprint,
        eventId: event.eventId,
        eventFingerprint: event.fingerprint,
        transitionId: f.receipt.transitionId,
        financialBatchFingerprint: text(batch.fingerprint),
      };
    });
    if (canonicalSerialize(actualRefs) !== canonicalSerialize(expectedRefs))
      invalid('ACTUAL_CANONICAL_CB_FRAME_SET_DIFFERS');
    return {
      countryId,
      adoptionRef: text(r.adoption_ref),
      sourceClass: r.source_class as 'ADMITTED_ORIGINAL' | 'TEST_ONLY',
      sourceRef: original.sourceRef,
      sourceRevision: original.sourceRevision,
      admissionRevision: text(r.admission_revision),
      originalSHA256: text(r.original_sha256),
      original,
      quotes,
      frames: actualRefs,
    };
  });
  return freeze({
    classification: 'COMMITTED_CB_ORIGINALS_DATA_NOT_AUTHORITY',
    worldId: input.worldId,
    seedFingerprint: input.seedFingerprint,
    admissionRef: input.admissionRef,
    head: { ...input.expectedHead },
    countries,
  });
}
