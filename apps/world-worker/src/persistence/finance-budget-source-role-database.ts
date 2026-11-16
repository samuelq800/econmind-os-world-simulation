/** Fixed Budget reads on the held worker transaction. NOINHERIT workers
 * delegate only these existing functions, then resume their economic role.
 * No grants, source publication, new pool or independent transaction cutoff. */
import type {
  SqlDatabase,
  SqlExecutor,
  SqlQueryResult,
} from './sql-database.js';

const reader = 'world_v2_finance_budget_source_reader';
const queries = new Set([
  'select * from world_v2.lock_finance_budget_policy($1,$2,$3,$4,$5,$6,$7::uuid)',
  'select * from world_v2.read_finance_budget_capacity($1,$2,$3,$4,$5,$6::timestamptz)',
  'select team_id,authorization_version from world_v2.lock_finance_budget_current_authorization($1,$2::uuid,$3,$4,$5)',
  'select * from world_v2.lock_finance_budget_current_authorization($1,$2::uuid,$3,$4,$5)',
  'select present as "?column?" from world_v2.lock_finance_budget_revoked_authorization($1,$2::uuid,$3,$4)',
]);

export function createFinanceBudgetSourceRoleDatabase(
  database: SqlDatabase,
  configuration: { readonly workerRole: string },
): SqlDatabase {
  const role = configuration.workerRole;
  if (
    !/^[a-z][a-z0-9_]{0,62}$/u.test(role) ||
    role.startsWith('pg_') ||
    [
      'postgres',
      'anon',
      'authenticated',
      'service_role',
      'supabase_admin',
      reader,
      'world_v2_finance_budget_source_owner',
      'world_v2_finance_budget_source_publisher',
    ].includes(role)
  )
    throw Error('BUDGET_SEPARATE_FIXED_WORKER_REQUIRED');

  async function assertWorker(tx: SqlExecutor) {
    const result = await tx.query<Record<string, unknown>>(
      `select current_user as role_name,
        (r.rolsuper or r.rolbypassrls or r.rolcreaterole or r.rolcreatedb or r.rolreplication) as unsafe,
        pg_has_role(current_user,'world_v2_finance_budget_source_reader','MEMBER') as reader_member,
        pg_has_role(current_user,'world_v2_finance_budget_source_owner','MEMBER') as owner_member,
        pg_has_role(current_user,'world_v2_finance_budget_source_publisher','MEMBER') as publisher_member
        from pg_roles r where r.rolname=current_user`,
    );
    const row = result.rows[0];
    if (
      result.rows.length !== 1 ||
      !row ||
      row.role_name !== role ||
      row.unsafe !== false ||
      row.reader_member !== true ||
      row.owner_member !== false ||
      row.publisher_member !== false
    )
      throw Error('BUDGET_SEPARATED_WORKER_READER_REQUIRED');
  }
  const bind = (tx: SqlExecutor): SqlExecutor => ({
    async query<Row extends object>(
      sql: string,
      parameters: readonly unknown[] = [],
    ) {
      if (!queries.has(sql)) return tx.query<Row>(sql, parameters);
      await assertWorker(tx);
      await tx.query("select set_config('role',$1,true)", [reader]);
      let outcome:
        | { ok: true; value: SqlQueryResult<Row> }
        | { ok: false; error: unknown };
      try {
        outcome = { ok: true, value: await tx.query<Row>(sql, parameters) };
      } catch (error) {
        outcome = { ok: false, error };
      }
      try {
        await tx.query("select set_config('role',$1,true)", [role]);
        await assertWorker(tx);
      } catch (restore) {
        if (!outcome.ok)
          throw new AggregateError(
            [outcome.error, restore],
            'Budget reader restoration failed; outer transaction must rollback',
            { cause: restore },
          );
        throw restore;
      }
      if (!outcome.ok) throw outcome.error;
      return outcome.value;
    },
  });
  const wrapped: SqlDatabase = Object.freeze({
    query: <Row extends object>(
      sql: string,
      parameters?: readonly unknown[],
    ) =>
      queries.has(sql)
        ? wrapped.transaction((tx) => tx.query<Row>(sql, parameters))
        : database.query<Row>(sql, parameters),
    transaction: <Result>(consume: (tx: SqlExecutor) => Promise<Result>) =>
      database.transaction((tx) => consume(bind(tx))),
  });
  return wrapped;
}
