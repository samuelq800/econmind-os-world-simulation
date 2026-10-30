/** Exact bounded posting-set reconstruction. No row is ignored/rebased and no
 * parsed batch creates ledger/source/admission authority. The Core mixed
 * replay independently validates each actual economic effect. */
import { createHash } from 'node:crypto';
import {
  DomainError,
  DOMAIN_ERROR_CODES,
  type AuthoritativeTransition,
  type CanonicalCommand,
  type FinancialPostingBatch,
} from '@econmind/core';
import { POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND } from '@econmind/core/authenticated-office-command-contract';
import { decodeDurableFinancialPostingBatch } from './durable-v08-ledger-lineage-reader.js';
import type { FinanceNativeBudgetCanonicalFrame } from '@econmind/core/finance-budget-native';
export type BoundedPostwarCanonicalFrame = Omit<
  FinanceNativeBudgetCanonicalFrame,
  'financialPostingBatches'
> & { readonly financialPostingBatches: readonly FinancialPostingBatch[] };
import type { SqlExecutor } from './sql-database.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const MAX_BATCHES = 512;
const MAX_BATCH_BYTES = 65536;
export interface BoundedPostwarFinancialPostingRow {
  readonly causation_command_id: unknown;
  readonly canonical_payload: unknown;
  readonly fingerprint: unknown;
}
function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    'Bounded FX postings: ' + message,
  );
}
export const POSTWAR_BOUNDED_JOURNAL_QUERY =
  'select * from world_v2.read_postwar_bounded_journal($1,$2,$3)';
export async function readBoundedPostwarJournalFrom(
  tx: SqlExecutor,
  input: {
    readonly worldId: string;
    readonly countryId: string;
    readonly officeId: 'SOCIAL' | 'FINANCE';
  },
) {
  const result = await tx.query<Record<string, unknown>>(
    POSTWAR_BOUNDED_JOURNAL_QUERY,
    [input.worldId, input.countryId, input.officeId],
  );
  const r = result.rows[0];
  const uint = (v: unknown): v is string =>
    typeof v === 'string' && /^(?:0|[1-9]\d*)$/u.test(v);
  if (
    result.rows.length !== 1 ||
    !r ||
    !uint(r.world_version) ||
    !uint(r.event_sequence) ||
    BigInt(r.world_version) > 256n ||
    BigInt(r.event_sequence) > 256n ||
    !uint(r.financial_batch_count) ||
    BigInt(r.financial_batch_count) > BigInt(MAX_BATCHES) ||
    r.inventory_posting_count !== '0' ||
    !Array.isArray(r.financial_batches) ||
    r.financial_batches.length !== Number(r.financial_batch_count)
  )
    invalid('complete bounded journal and actual head required');
  const rows = r.financial_batches.map((row: unknown) => {
    if (!row || typeof row !== 'object' || Array.isArray(row))
      invalid('canonical batch row required');
    const b = row as Record<string, unknown>;
    if (
      typeof b.causation_command_id !== 'string' ||
      !b.causation_command_id ||
      typeof b.canonical_payload !== 'string' ||
      Buffer.byteLength(b.canonical_payload) > MAX_BATCH_BYTES ||
      typeof b.fingerprint !== 'string' ||
      !/^sha256:[a-f0-9]{64}$/u.test(b.fingerprint)
    )
      invalid('bounded canonical batch bytes and fingerprint required');
    return Object.freeze({
      causation_command_id: b.causation_command_id,
      canonical_payload: b.canonical_payload,
      fingerprint: b.fingerprint,
    });
  });
  const bytes = rows.reduce(
    (n, b) => n + Buffer.byteLength(b.canonical_payload),
    0,
  );
  if (bytes > 1048576) invalid('complete journal byte capacity exceeded');
  return Object.freeze({
    rows: Object.freeze(rows),
    bytes,
    head: Object.freeze({
      worldVersion: r.world_version,
      eventSequence: r.event_sequence,
    }),
    financialBatchCount: r.financial_batch_count,
    inventoryPostingCount: r.inventory_posting_count,
  });
}
/** Both non-FX effects and missing/extra FX batches deny. Complete global-set
 * coverage is checked after every canonical command group has been decoded. */
export function decodeBoundedPostwarFinancialPostings(input: {
  readonly command: CanonicalCommand;
  readonly transition: AuthoritativeTransition;
  readonly rows: readonly BoundedPostwarFinancialPostingRow[];
}): readonly FinancialPostingBatch[] {
  const rows = input.rows.filter(
    (r) => r.causation_command_id === input.command.commandId,
  );
  if (input.command.commandType !== POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND) {
    if (rows.length)
      invalid('financial effects outside the installed FX family');
    return Object.freeze([]);
  }
  if (rows.length !== 2) invalid('exact two FX currency batches required');
  const batches = rows.map((row) =>
    decodeDurableFinancialPostingBatch({ ...input, row, sha256Hex: sha }),
  );
  if (
    new Set(batches.map((b) => b.batchId)).size !== 2 ||
    new Set(batches.map((b) => b.settlementCurrency)).size !== 2
  )
    invalid('distinct exact FX batches required');
  // Stable comparison only; Core rederives both batches and all six legs.
  return Object.freeze(
    batches.sort((a, b) =>
      a.settlementCurrency === 'GCU'
        ? 1
        : b.settlementCurrency === 'GCU'
          ? -1
          : a.batchId.localeCompare(b.batchId),
    ),
  );
}
