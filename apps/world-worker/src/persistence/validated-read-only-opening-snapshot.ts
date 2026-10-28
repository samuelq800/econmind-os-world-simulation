/** Lexical reuse of one actual readonly seed/replay. This is data validation,
 * not source admission, current authorization, a writer fence or a Ready DTO. */
import { createHash } from 'node:crypto';
import type { DurableV08ReadOnlySnapshotWithSeed } from './durable-v08-ledger-lineage-reader.js';
import type { SqlDatabase, SqlExecutor } from './sql-database.js';

declare const readonlyOpeningSnapshotScope: unique symbol;
export interface ValidatedReadOnlyOpeningSnapshotScope {
  readonly [readonlyOpeningSnapshotScope]: true;
}
export const READ_ONLY_OPENING_SNAPSHOT_TRANSACTION_QUERY =
  `select pg_backend_pid()::text as backend_pid,
    virtualtransaction::text as virtual_transaction,
    current_setting('transaction_read_only') as read_only,
    current_setting('transaction_isolation') as isolation
   from pg_locks
   where pid=pg_backend_pid() and locktype='virtualxid'
     and mode='ExclusiveLock' and granted`.trim();
interface TransactionIdentity {
  readonly backendPid: string;
  readonly virtualTransaction: string;
}
interface Entry {
  readonly executor: SqlExecutor;
  readonly transaction: TransactionIdentity;
  readonly snapshot: Readonly<DurableV08ReadOnlySnapshotWithSeed>;
}
const active = new WeakMap<object, Entry>();
function invalid(): never {
  throw Error(
    'VALIDATED_READ_ONLY_OPENING_SNAPSHOT_EXPIRED_OR_FOREIGN_TRANSACTION',
  );
}
async function identity(executor: SqlExecutor): Promise<TransactionIdentity> {
  const result = await executor.query<{
    backend_pid: unknown;
    virtual_transaction: unknown;
    read_only: unknown;
    isolation: unknown;
  }>(READ_ONLY_OPENING_SNAPSHOT_TRANSACTION_QUERY);
  const row = result.rows[0];
  if (
    result.rows.length !== 1 ||
    !row ||
    row.read_only !== 'on' ||
    !['repeatable read', 'serializable'].includes(String(row.isolation)) ||
    typeof row.backend_pid !== 'string' ||
    !/^[1-9]\d*$/u.test(row.backend_pid) ||
    typeof row.virtual_transaction !== 'string' ||
    !/^(?:0|[1-9]\d*)\/(?:0|[1-9]\d*)$/u.test(row.virtual_transaction)
  )
    invalid();
  return Object.freeze({
    backendPid: row.backend_pid,
    virtualTransaction: row.virtual_transaction,
  });
}
const same = (a: TransactionIdentity, b: TransactionIdentity) =>
  a.backendPid === b.backendPid &&
  a.virtualTransaction === b.virtualTransaction;

/** Uses the fixed actual implementation AND Node SHA-256, not an injected
 * digest, caller seed/Ready DTO or overridden reader callback.
 * The owner must await the callback inside its already-held stable SQL tx. */
export async function withValidatedReadOnlyOpeningSnapshotFrom<Result>(
  input: {
    readonly executor: SqlExecutor;
    readonly worldId: string;
  },
  consume: (scope: ValidatedReadOnlyOpeningSnapshotScope) => Promise<Result>,
): Promise<Result> {
  const transaction = await identity(input.executor);
  // No own transaction/loader may replace the already-held actual executor.
  const database: SqlDatabase = {
    async query() {
      return invalid();
    },
    async transaction() {
      return invalid();
    },
  };
  // Deferred import keeps preparation's data-only lease consumer independent
  // of persistence/composition module initialization order.
  const { DurableV08LedgerLineageReader } =
    await import('./durable-v08-ledger-lineage-reader.js');
  const reader = new DurableV08LedgerLineageReader({
    database,
    sha256Hex: (bytes) =>
      createHash('sha256').update(bytes, 'utf8').digest('hex'),
  });
  const snapshot =
    await DurableV08LedgerLineageReader.prototype.readOnlySnapshotWithSeedFrom.call(
      reader,
      input.executor,
      input.worldId,
    );
  if (!same(transaction, await identity(input.executor))) invalid();
  const scope = Object.freeze({}) as ValidatedReadOnlyOpeningSnapshotScope;
  active.set(scope, { executor: input.executor, transaction, snapshot });
  try {
    const result = await consume(scope);
    if (!same(transaction, await identity(input.executor))) invalid();
    return result;
  } finally {
    active.delete(scope);
  }
}

/** Rechecks the actual backend's current virtual transaction every time. A
 * copied/escaped token or COMMIT+BEGIN on the same executor cannot reuse data. */
export async function readValidatedReadOnlyOpeningSnapshotFrom(
  executor: SqlExecutor,
  scope: ValidatedReadOnlyOpeningSnapshotScope,
): Promise<Readonly<DurableV08ReadOnlySnapshotWithSeed>> {
  const entry = active.get(scope);
  if (!entry || entry.executor !== executor) invalid();
  const current = await identity(executor);
  if (active.get(scope) !== entry || !same(entry.transaction, current))
    invalid();
  return entry.snapshot;
}
