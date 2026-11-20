/** Bounded original DATA for one complete transaction page. Source and current
 * host locks remain SQL-owned; original decoding reuses the existing canonical
 * validators. This adapter cannot issue economic or source authority. */
import type { FinanceNativeBudgetCanonicalFrame } from '@econmind/core/finance-budget-native';
import {
  CENTRAL_BANK_OMO_HISTORY_QUERY,
  readCentralBankOmoMixedReplayOriginalsFrom,
} from './postgres-central-bank-omo-history.js';
import { readPostwarCaptainCurrentOriginalsFrom } from './postwar-captain-history-originals.js';
import type { SqlExecutor } from './sql-database.js';
interface Head {
  readonly worldVersion: string;
  readonly eventSequence: string;
}
export interface PostwarPagedOfficeHistoryInput {
  readonly worldId: string;
  readonly hostCountryId: string;
  readonly officeId: 'SOCIAL' | 'FINANCE';
  readonly seedFingerprint: string;
  readonly admissionRef: string;
  readonly fromHead: Readonly<Head>;
  readonly throughHead: Readonly<Head>;
  readonly expectedHead: Readonly<Head>;
  readonly frames: readonly FinanceNativeBudgetCanonicalFrame[];
  readonly sourceMetadata: readonly {
    readonly sourceId: string;
    readonly payloadHash: string;
  }[];
  readonly mode?: 'OFFICIAL_RUNTIME' | 'TEST_ONLY_LOCAL';
}
const CAPTAIN_QUERY =
  'select * from world_v2.read_postwar_captain_history_originals($1,$2,$3,$4,$5,$6)';
export const POSTWAR_PAGED_CAPTAIN_ORIGINALS_QUERY =
  'select * from world_v2.read_postwar_paged_captain_originals($1,$2,$3,$4,$5,$6,$7,$8::bigint,$9::bigint,$10::bigint,$11::bigint)';
export const POSTWAR_PAGED_OMO_ORIGINALS_QUERY =
  'select * from world_v2.read_postwar_paged_omo_originals($1,$2,$3,$4,$5,$6,$7,$8::bigint,$9::bigint,$10::bigint,$11::bigint)';
function parameters(input: PostwarPagedOfficeHistoryInput) {
  const heads = [input.fromHead, input.throughHead, input.expectedHead];
  if (
    !['SOCIAL', 'FINANCE'].includes(input.officeId) ||
    input.frames.length > 256 ||
    heads.some(
      (h) =>
        !/^(0|[1-9][0-9]*)$/u.test(h.worldVersion) ||
        !/^(0|[1-9][0-9]*)$/u.test(h.eventSequence),
    )
  )
    throw Error('PAGED_ORIGINALS_FIXED_COMPLETE_PAGE_REQUIRED');
  let version = BigInt(input.fromHead.worldVersion),
    sequence = BigInt(input.fromHead.eventSequence);
  for (const f of input.frames) {
    if (
      f.command.worldId !== input.worldId ||
      BigInt(f.transition.worldVersionBefore) !== version ||
      BigInt(f.transition.worldVersionAfter) !== version + 1n ||
      f.receipt.outcome !== 'COMMITTED' ||
      !f.events.length
    )
      throw Error('PAGED_ORIGINALS_COMPLETE_TRANSACTION_REQUIRED');
    version++;
    for (const e of f.events)
      if (
        e.worldId !== input.worldId ||
        BigInt(e.sequence) !== ++sequence ||
        BigInt(e.worldVersion) !== version
      )
        throw Error('PAGED_ORIGINALS_ORDERED_EVENTS_REQUIRED');
  }
  if (
    version !== BigInt(input.throughHead.worldVersion) ||
    sequence !== BigInt(input.throughHead.eventSequence) ||
    sequence - BigInt(input.fromHead.eventSequence) > 256n ||
    version > BigInt(input.expectedHead.worldVersion) ||
    sequence > BigInt(input.expectedHead.eventSequence) ||
    (!input.frames.length && input.expectedHead.worldVersion !== '0')
  )
    throw Error('PAGED_ORIGINALS_EXACT_PAGE_END_REQUIRED');
  return Object.freeze([
    input.worldId,
    input.hostCountryId,
    input.officeId,
    input.seedFingerprint,
    input.admissionRef,
    input.expectedHead.worldVersion,
    input.expectedHead.eventSequence,
    input.fromHead.worldVersion,
    input.fromHead.eventSequence,
    input.throughHead.worldVersion,
    input.throughHead.eventSequence,
  ]);
}
function pageExecutor(
  tx: SqlExecutor,
  expected: string,
  query: string,
  args: readonly string[],
): SqlExecutor {
  return Object.freeze({
    async query<Row extends object>(sql: string) {
      if (sql !== expected)
        throw Error('PAGED_ORIGINALS_FIXED_DECODER_QUERY_REQUIRED');
      return tx.query<Row>(query, args);
    },
  });
}
export async function readPostwarPagedCaptainHistoryOriginalsFrom(
  tx: SqlExecutor,
  input: PostwarPagedOfficeHistoryInput,
) {
  const args = parameters(input);
  const result = await readPostwarCaptainCurrentOriginalsFrom(
    pageExecutor(
      tx,
      CAPTAIN_QUERY,
      POSTWAR_PAGED_CAPTAIN_ORIGINALS_QUERY,
      args,
    ),
    input,
  );
  return Object.freeze({
    captainCountries: result.captainCountries,
    captainOriginalStatus: result.status,
  });
}
export async function readPostwarPagedOmoHistoryOriginalsFrom(
  tx: SqlExecutor,
  input: PostwarPagedOfficeHistoryInput,
) {
  const args = parameters(input);
  return readCentralBankOmoMixedReplayOriginalsFrom(
    pageExecutor(
      tx,
      CENTRAL_BANK_OMO_HISTORY_QUERY,
      POSTWAR_PAGED_OMO_ORIGINALS_QUERY,
      args,
    ),
    { ...input, mode: input.mode ?? 'OFFICIAL_RUNTIME' },
  );
}
