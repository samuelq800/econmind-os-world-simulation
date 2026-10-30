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
export async function readBoundedPostwarFinancialPostingRowsFrom(
  tx: SqlExecutor,
  worldId: string,
) {
  const totals = await tx.query<{ count: string }>(
    'select count(*)::text as count from world_v2.financial_posting_batch where world_id=$1',
    [worldId],
  );
  if (
    totals.rows.length !== 1 ||
    !/^(?:0|[1-9]\d*)$/u.test(totals.rows[0]!.count) ||
    BigInt(totals.rows[0]!.count) > BigInt(MAX_BATCHES)
  )
    invalid('complete bounded batch count required');
  const result = await tx.query<BoundedPostwarFinancialPostingRow>(
    'select causation_command_id,canonical_payload,batch_fingerprint as fingerprint from world_v2.financial_posting_batch where world_id=$1 and octet_length(canonical_payload)<=65536 order by batch_id limit 513',
    [worldId],
  );
  if (result.rows.length !== Number(totals.rows[0]!.count))
    invalid('complete bounded batch set required');
  const rows = result.rows.map((row) => {
    if (
      typeof row.causation_command_id !== 'string' ||
      typeof row.canonical_payload !== 'string' ||
      Buffer.byteLength(row.canonical_payload) > MAX_BATCH_BYTES
    )
      invalid('bounded canonical batch bytes required');
    return Object.freeze({ ...row });
  });
  return Object.freeze({
    rows: Object.freeze(rows),
    bytes: rows.reduce(
      (n, r) => n + Buffer.byteLength(r.canonical_payload as string),
      0,
    ),
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
