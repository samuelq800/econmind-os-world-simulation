/** A fixed transaction-local concurrency fence, never source/actor authority.
 * Must run before any source/control read in the same held write RR transaction.
 * SQLSTATE 40001/40P01 is propagated: retry a new whole transaction, never refresh
 * the snapshot by continuing a partially validated operation. */
import type { SqlExecutor } from './sql-database.js';
export const POSTWAR_SOURCE_REVOCATION_FENCE_QUERY =
  'select world_v2.lock_postwar_source_revocation_fences($1)';
export async function lockPostwarSourceRevocationFencesFrom(
  tx: SqlExecutor,
  scope: { readonly worldId: string },
): Promise<void> {
  if (!/^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$/u.test(scope.worldId))
    throw Error('REVOCATION_FENCE_EXACT_WORLD_REQUIRED');
  const result = await tx.query(POSTWAR_SOURCE_REVOCATION_FENCE_QUERY, [
    scope.worldId,
  ]);
  if (result.rows.length !== 1)
    throw Error('REVOCATION_FENCE_ONE_FIXED_RESULT_REQUIRED');
}
