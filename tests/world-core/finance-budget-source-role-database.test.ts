/** Real SQL roles/functions on embedded PostgreSQL and, when configured,
 * the existing guarded disposable native PG target. No admitted source or
 * successful economic command is invented by this focused role regression. */
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertV09PostgresTestEnvironment } from '../../scripts/v09-postgres-test-environment.mjs';
import { createFinanceBudgetSourceRoleDatabase } from '../../apps/world-worker/src/persistence/finance-budget-source-role-database.js';
import {
  createFinanceBudgetAuthorizationDatabase,
  FINANCE_BUDGET_SOURCE_LOCK_QUERY,
} from '../../apps/world-worker/src/persistence/postgres-finance-budget-custody.js';
import {
  WORKER_CURRENT_AUTHORIZATION_LOCK_QUERY,
  WORKER_REVOKED_AUTHORIZATION_LOCK_QUERY,
} from '../../apps/world-worker/src/persistence/worker-authorization-sql.js';
import type { SqlDatabase } from '../../apps/world-worker/src/persistence/sql-database.js';

const worker = 'test_only_budget_noinherit_worker';
const subject = '11111111-1111-4111-8111-111111111111';
const world = 'WORLD_TEST_ONLY_BUDGET_ROLE';
const capability = [world, subject, 'COUNTRY_01', 'FINANCE', 'FINANCE_BUDGET'];
const modes = process.env.V09_TEST_DATABASE_URL
  ? (['native'] as const)
  : (['embedded'] as const);

describe.each(modes)(
  'Budget NOINHERIT source delegation / %s TEST_ONLY',
  (mode) => {
    let close: () => Promise<void>;
    let raw: SqlDatabase;
    let scoped: SqlDatabase;
    beforeAll(async () => {
      const engine =
        mode === 'native'
          ? new Client({
              connectionString:
                assertV09PostgresTestEnvironment().connectionString,
            })
          : new PGlite();
      if (engine instanceof Client) await engine.connect();
      close = () => (engine instanceof Client ? engine.end() : engine.close());
      const script = async (sql: string) => {
        if (engine instanceof Client) await engine.query(sql);
        else await engine.exec(sql);
      };
      const execute = async (
        sql: string,
        parameters: readonly unknown[] = [],
      ) => {
        const result = await engine.query(sql, [...parameters]);
        return { rows: result.rows, rowCount: result.rows.length };
      };
      raw = {
        async query<Row extends object>(
          sql: string,
          parameters: readonly unknown[] = [],
        ) {
          const result = await execute(sql, parameters);
          return { ...result, rows: result.rows as readonly Row[] };
        },
        async transaction(consume) {
          await execute('begin');
          try {
            const value = await consume(raw);
            await execute('commit');
            return value;
          } catch (error) {
            await execute('rollback');
            throw error;
          }
        },
      };
      for (const id of [
        '0001_world_v2_namespace',
        '0002_world_v2_command_event_ledger',
        '0003_world_v2_command_receipts_outbox',
        '0005_world_v2_writer_lease_fencing',
        '0007_world_v2_atomic_transition_facts',
        '0011_world_v2_current_commit_authorization',
        '0013_world_v2_read_projection_boundary',
        '0016_world_v2_opening_seed',
      ])
        await script(
          await readFile(
            new URL(
              '../../database/migrations/artifacts/' + id + '.sql',
              import.meta.url,
            ),
            'utf8',
          ),
        );
      for (const name of [
        'runtime-read-binding-storage.sql',
        'runtime-admission-publication.sql',
        'finance-budget-custody.sql',
        'finance-budget-capacity-source.sql',
      ])
        await script(
          await readFile(
            new URL('../../database/proposals/' + name, import.meta.url),
            'utf8',
          ),
        );
      await script(`create role ${worker} login noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
      grant world_v2_finance_budget_source_reader to ${worker};
      grant usage on schema world_v2 to ${worker};
      create role test_only_budget_unrelated noinherit;
      create role test_only_budget_publisher_member noinherit;
      grant world_v2_finance_budget_source_reader,world_v2_finance_budget_source_publisher to test_only_budget_publisher_member`);
      await execute('insert into world_v2.world_head(world_id) values($1)', [
        world,
      ]);
      for (const cap of ['FINANCE_BUDGET', 'FINANCE_TREASURY'])
        await execute(
          "insert into world_v2.current_commit_authorization values($1,$2::uuid,'COUNTRY_01','FINANCE',$3,'TEAM_TEST','REV_TEST',true,now())",
          [world, subject, cap],
        );
      scoped = createFinanceBudgetAuthorizationDatabase(
        createFinanceBudgetSourceRoleDatabase(raw, { workerRole: worker }),
      );
    });
    afterAll(async () => {
      await close?.();
    });

    async function asRole(role: string, consume: () => Promise<void>) {
      // Exact test-owned identifiers only. Session authorization also tests that
      // SET ROLE works from the non-superuser login, not installer authority.
      if (!/^test_only_[a-z_]+$/u.test(role)) throw Error('TEST_ROLE_REQUIRED');
      await raw.query('set session authorization ' + role);
      try {
        await consume();
      } finally {
        await raw.query('reset role');
        // PGlite RESET SESSION AUTHORIZATION retains its most recent session
        // identity; explicitly restore the test installer on both engines.
        await raw.query('set session authorization postgres');
      }
    }
    async function currentRole() {
      return (await raw.query<{ name: string }>('select current_user as name'))
        .rows[0]!.name;
    }
    function originalError(error: unknown): unknown {
      return error instanceof AggregateError ? error.errors[0] : error;
    }

    it('reproduces missing inherited EXECUTE and preserves the NOINHERIT grants', async () => {
      await asRole(worker, async () => {
        const privileges = await raw.query(`select r.rolinherit,
        pg_has_role(current_user,'world_v2_finance_budget_source_reader','MEMBER') as member,
        has_function_privilege(current_user,'world_v2.lock_finance_budget_policy(text,text,text,text,text,timestamptz,uuid)','EXECUTE') as execute
        from pg_roles r where rolname=current_user`);
        expect(privileges.rows).toEqual([
          { rolinherit: false, member: true, execute: false },
        ]);
        await expect(
          raw.query(FINANCE_BUDGET_SOURCE_LOCK_QUERY, [
            world,
            'COUNTRY_01',
            'ENVELOPE_TEST',
            'PERIOD_TEST',
            'WORKER_TEST',
            new Date().toISOString(),
            subject,
          ]),
        ).rejects.toMatchObject({
          code: '42501',
          message: expect.stringContaining('permission denied'),
        });
      });
    });

    it('runs policy/capacity guards as reader, keeps missing lease fail-closed, then rolls back to worker', async () => {
      await asRole(worker, async () => {
        for (const capacity of [false, true]) {
          await raw.query(
            "select set_config('request.jwt.claim.sub',$1,false)",
            [subject],
          );
          const error = await scoped
            .query(
              capacity
                ? 'select * from world_v2.read_finance_budget_capacity($1,$2,$3,$4,$5,$6::timestamptz)'
                : FINANCE_BUDGET_SOURCE_LOCK_QUERY,
              [
                world,
                'COUNTRY_01',
                'ENVELOPE_TEST',
                'PERIOD_TEST',
                'WORKER_TEST',
                new Date().toISOString(),
                ...(capacity ? [] : [subject]),
              ],
            )
            .catch((error: unknown) => error);
          expect(originalError(error)).toMatchObject({
            code: '42501',
            message: 'BUDGET_CURRENT_WRITER_LEASE_REQUIRED',
          });
          expect(await currentRole()).toBe(worker);
        }
      });
    });

    it('reads real authorization rows on one backend and restores worker before subsequent statements', async () => {
      await asRole(worker, async () => {
        await scoped.transaction(async (tx) => {
          const before = (await tx.query('select pg_backend_pid() as pid'))
            .rows;
          expect(
            (
              await tx.query(
                WORKER_CURRENT_AUTHORIZATION_LOCK_QUERY,
                capability,
              )
            ).rows,
          ).toEqual([
            {
              auth_subject: subject,
              world_id: world,
              country_id: 'COUNTRY_01',
              office_id: 'FINANCE',
              capability: 'FINANCE_BUDGET',
              team_id: 'TEAM_TEST',
              authorization_version: 'REV_TEST',
            },
          ]);
          expect(
            (
              await tx.query(
                WORKER_REVOKED_AUTHORIZATION_LOCK_QUERY,
                capability.slice(0, 4),
              )
            ).rows,
          ).toHaveLength(2);
          expect(
            (await tx.query('select pg_backend_pid() as pid')).rows,
          ).toEqual(before);
          expect(await currentRole()).toBe(worker);
        });
        expect(await currentRole()).toBe(worker);
      });
    });

    it('does not delegate near-match SQL, raw tables, publications, or unrelated capabilities', async () => {
      await asRole(worker, async () => {
        for (const sql of [
          FINANCE_BUDGET_SOURCE_LOCK_QUERY + ' ',
          'select * from world_v2.finance_budget_policy_original',
          "select world_v2.publish_finance_budget_policy('P','I','{}','H','A','0')",
        ])
          await expect(
            scoped.query(
              sql,
              sql.includes('$1')
                ? [
                    world,
                    'COUNTRY_01',
                    'E',
                    'P',
                    'WORKER_TEST',
                    new Date().toISOString(),
                    subject,
                  ]
                : [],
            ),
          ).rejects.toMatchObject({ code: '42501' });
        await expect(
          scoped.query(WORKER_CURRENT_AUTHORIZATION_LOCK_QUERY, [
            ...capability.slice(0, 4),
            'FINANCE_TREASURY',
          ]),
        ).rejects.toMatchObject({ code: '42501' });
        expect(await currentRole()).toBe(worker);
      });
    });

    it('rejects a wrong session, absent membership, or publisher membership before delegation', async () => {
      await expect(
        scoped.query(WORKER_CURRENT_AUTHORIZATION_LOCK_QUERY, capability),
      ).rejects.toThrow('BUDGET_SEPARATED_WORKER_READER_REQUIRED');
      for (const role of [
        'test_only_budget_unrelated',
        'test_only_budget_publisher_member',
      ])
        await asRole(role, async () => {
          const invalid = createFinanceBudgetSourceRoleDatabase(raw, {
            workerRole: role,
          });
          await expect(
            invalid.query(
              'select * from world_v2.lock_finance_budget_current_authorization($1,$2::uuid,$3,$4,$5)',
              capability,
            ),
          ).rejects.toThrow('BUDGET_SEPARATED_WORKER_READER_REQUIRED');
          expect(await currentRole()).toBe(role);
        });
    });
  },
);

describe('Budget reader restoration failure protocol', () => {
  it('retains both source and restoration errors and never returns a successful read', async () => {
    const sourceFailure = Error('TEST_SOURCE_FAILED');
    const restoreFailure = Error('TEST_RESTORE_FAILED');
    const tx = {
      async query<Row extends object>(
        sql: string,
        parameters: readonly unknown[] = [],
      ) {
        if (sql === FINANCE_BUDGET_SOURCE_LOCK_QUERY) throw sourceFailure;
        if (parameters[0] === worker) throw restoreFailure;
        const rows = sql.includes('from pg_roles')
          ? [
              {
                role_name: worker,
                unsafe: false,
                reader_member: true,
                owner_member: false,
                publisher_member: false,
              },
            ]
          : [];
        return {
          rows: rows as unknown as readonly Row[],
          rowCount: rows.length,
        };
      },
    };
    const raw: SqlDatabase = { ...tx, transaction: (consume) => consume(tx) };
    const scoped = createFinanceBudgetSourceRoleDatabase(raw, {
      workerRole: worker,
    });
    const error = await scoped
      .query(FINANCE_BUDGET_SOURCE_LOCK_QUERY)
      .catch((error: unknown) => error);
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors).toEqual([
      sourceFailure,
      restoreFailure,
    ]);
  });
});
