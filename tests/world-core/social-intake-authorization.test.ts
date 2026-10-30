/** Fixed transport/lock delegation. Protocol rows never establish actual SQL
 * authority; the separate native Social Node test exercises the real helper. */
import type { Pool, PoolClient } from 'pg';
import { describe, expect, it } from 'vitest';
import {
  createSocialIntakeAuthorizationPool,
  SOCIAL_INTAKE_BINDING_LOCK_QUERY,
  SOCIAL_MANUAL_CLAIM_AUTHORIZATION_LOCK_QUERY,
} from '../../apps/world-worker/src/persistence/social-intake-authorization.js';
import { OFFICE_COMMAND_CURRENT_BINDING_QUERY } from '../../apps/world-worker/src/intake/postgres-office-command-intake.js';
import { createPostwarSocialPositionRuntimeDatabase } from '../../apps/world-worker/src/persistence/postwar-social-position-runtime.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';

describe('fixed Social intake/claim metadata lock delegation', () => {
  it('reuses the exact pool identity and rewrites only the two exact Social binding queries, preserving actual results/errors/release', async () => {
    const statements: { sql: string; args: readonly unknown[] }[] = [];
    const result = {
      rowCount: 1,
      rows: [{ marker: 'PROTOCOL_ONLY_NOT_AUTHORITY' }],
    };
    let released = 0;
    const sentinel = Error('ORIGINAL_CONNECTION_FAILURE');
    const client = {
      query(sql: string, args: readonly unknown[] = []) {
        expect(this).toBe(client);
        statements.push({ sql, args });
        if (sql === 'select failure') throw sentinel;
        return Promise.resolve(result);
      },
      release() {
        expect(this).toBe(client);
        released++;
      },
    };
    const pool = {
      connect: async () => client as unknown as PoolClient,
    } as Pick<Pool, 'connect'>;
    const wrapped = createSocialIntakeAuthorizationPool(pool);
    expect(createSocialIntakeAuthorizationPool(pool)).toBe(wrapped);
    expect(createSocialIntakeAuthorizationPool(wrapped)).toBe(wrapped);
    const connected = await wrapped.connect();
    const args = [
      'WORLD_TEST',
      '11111111-1111-4111-8111-111111111111',
      'COUNTRY_01',
      'SOCIAL',
      'SEAT_TEST',
      'REV_1',
      'SOCIAL_LABOUR',
      'OFFICE_434F554E5452595F3031_534F4349414C',
    ];
    const lock =
      OFFICE_COMMAND_CURRENT_BINDING_QUERY + ' for share of authz,entitlement';
    expect(await connected.query(lock, args)).toBe(result);
    expect(
      await connected.query(OFFICE_COMMAND_CURRENT_BINDING_QUERY, args),
    ).toBe(result);
    const finance = [...args];
    finance[3] = 'FINANCE';
    finance[6] = 'FINANCE_BUDGET';
    expect(await connected.query(lock, finance)).toBe(result);
    expect(() =>
      connected.query(lock, [...args.slice(0, 6), 'OTHER_CAPABILITY', args[7]]),
    ).toThrow('FIXED_PARAMETERS_REQUIRED');
    expect(() => connected.query('select failure')).toThrow(sentinel);
    connected.release();
    expect(released).toBe(1);
    expect(statements[0]).toEqual({
      sql: SOCIAL_INTAKE_BINDING_LOCK_QUERY,
      args,
    });
    expect(statements[1]).toEqual({
      sql: SOCIAL_INTAKE_BINDING_LOCK_QUERY,
      args,
    });
    expect(statements[2]!.sql).toBe(lock);
    expect(
      statements.some((s) => /\bgrant\b|\bset\s+role\b/iu.test(s.sql)),
    ).toBe(false);
  });
  it('keeps eight-string/Social Labour gates on both literals and never rewrites other SQL or offices', async () => {
    const seen: { sql: string; parameters: readonly unknown[] }[] = [];
    const client = {
      query: (sql: string, parameters: readonly unknown[] = []) => {
        seen.push({ sql, parameters });
        return Promise.resolve({ rows: [], rowCount: 0 });
      },
      release() {},
    };
    const wrapped = createSocialIntakeAuthorizationPool({
      connect: async () => client as unknown as PoolClient,
    });
    const connection = await wrapped.connect();
    const args = [
      'WORLD_TEST',
      '11111111-1111-4111-8111-111111111111',
      'COUNTRY_01',
      'SOCIAL',
      'SEAT_TEST',
      'REV_1',
      'SOCIAL_LABOUR',
      'OFFICE_SCOPE_TEST',
    ];
    const locked =
      OFFICE_COMMAND_CURRENT_BINDING_QUERY + ' for share of authz,entitlement';
    try {
      for (const statement of [OFFICE_COMMAND_CURRENT_BINDING_QUERY, locked]) {
        for (const invalid of [
          args.slice(0, 7),
          [...args, 'EXTRA'],
          args.map((v, i) => (i === 6 ? 'OTHER_CAPABILITY' : v)),
          args.map((v, i) => (i === 5 ? 1 : v)),
        ])
          expect(() => connection.query(statement, invalid)).toThrow(
            'SOCIAL_INTAKE_FIXED_PARAMETERS_REQUIRED',
          );
        const foreign = args.map((v, i) =>
          i === 3 ? 'FINANCE' : i === 6 ? 'FINANCE_BUDGET' : v,
        );
        await connection.query(statement, foreign);
        expect(seen.at(-1)).toEqual({ sql: statement, parameters: foreign });
      }
      for (const statement of [
        OFFICE_COMMAND_CURRENT_BINDING_QUERY + ' ',
        locked + ' ',
        'select 1',
      ]) {
        await connection.query(statement, args);
        expect(seen.at(-1)).toEqual({ sql: statement, parameters: args });
      }
      expect(seen.some((s) => s.sql === SOCIAL_INTAKE_BINDING_LOCK_QUERY)).toBe(
        false,
      );
    } finally {
      connection.release();
    }
  });
  it('delegates the exact Social manual claim lock in the same transaction and restores the verified writer', async () => {
    let role = 'fixture_social_writer';
    const statements: { sql: string; args: readonly unknown[] }[] = [];
    const actual = {
      rowCount: 1,
      rows: [{ team_id: 'TEAM_TEST', authorization_version: 'REV_1' }],
    };
    const tx: SqlExecutor = {
      async query<Row extends object>(
        sql: string,
        args: readonly unknown[] = [],
      ) {
        statements.push({ sql, args });
        if (sql.startsWith('set local role ')) {
          role = sql.slice('set local role '.length);
          return { rowCount: 0, rows: [] };
        }
        if (sql.startsWith('select current_user as role_name'))
          return {
            rowCount: 1,
            rows: [
              {
                role_name: role,
                rolsuper: false,
                rolbypassrls: false,
                rolcreatedb: false,
                rolcreaterole: false,
                rolreplication: false,
                source_member: true,
                owner_member: false,
                publisher_member: false,
              },
            ] as unknown as Row[],
          };
        return actual as unknown as { rowCount: number; rows: readonly Row[] };
      },
    };
    const db = createPostwarSocialPositionRuntimeDatabase(
      { query: tx.query, transaction: async (consume) => consume(tx) },
      { workerRole: 'fixture_social_writer' },
    );
    const args = [
      'WORLD_TEST',
      '11111111-1111-4111-8111-111111111111',
      'COUNTRY_01',
      'SOCIAL',
      'SOCIAL_LABOUR',
    ];
    await db.transaction(async (scoped) => {
      expect(
        await scoped.query(SOCIAL_MANUAL_CLAIM_AUTHORIZATION_LOCK_QUERY, args),
      ).toBe(actual);
    });
    expect(role).toBe('fixture_social_writer');
    expect(
      statements.find((s) =>
        s.sql.includes(
          'from world_v2.lock_social_operating_current_authorization',
        ),
      ),
    ).toEqual({
      sql: 'select team_id,authorization_version from world_v2.lock_social_operating_current_authorization($1,$2,$3::uuid,$4,$5)',
      args: [args[0], args[2], args[1], args[3], args[4]],
    });
    expect(
      statements.filter(
        (s) => s.sql === SOCIAL_MANUAL_CLAIM_AUTHORIZATION_LOCK_QUERY,
      ),
    ).toHaveLength(0);
  });
  it('does not rewrite another office or modified SQL and does not swallow a fixed-helper failure', async () => {
    let role = 'fixture_social_writer';
    const seen: string[] = [];
    const original = Error('ACTUAL_FIXED_HELPER_FAILURE');
    const tx: SqlExecutor = {
      async query<Row extends object>(sql: string) {
        seen.push(sql);
        if (sql.startsWith('set local role ')) {
          role = sql.slice(15);
          return { rows: [], rowCount: 0 };
        }
        if (sql.startsWith('select current_user as role_name'))
          return {
            rowCount: 1,
            rows: [
              {
                role_name: role,
                rolsuper: false,
                rolbypassrls: false,
                rolcreatedb: false,
                rolcreaterole: false,
                rolreplication: false,
                source_member: true,
                owner_member: false,
                publisher_member: false,
              },
            ] as unknown as Row[],
          };
        if (sql.includes('lock_social_operating_current_authorization'))
          throw original;
        return { rows: [], rowCount: 0 };
      },
    };
    const db = createPostwarSocialPositionRuntimeDatabase(
      { query: tx.query, transaction: async (f) => f(tx) },
      { workerRole: 'fixture_social_writer' },
    );
    await db.transaction(async (scoped) => {
      await scoped.query(SOCIAL_MANUAL_CLAIM_AUTHORIZATION_LOCK_QUERY, [
        'WORLD_TEST',
        'SUBJECT',
        'COUNTRY_01',
        'FINANCE',
        'FINANCE_BUDGET',
      ]);
      await scoped.query(SOCIAL_MANUAL_CLAIM_AUTHORIZATION_LOCK_QUERY + ' ', [
        'WORLD_TEST',
        'SUBJECT',
        'COUNTRY_01',
        'SOCIAL',
        'SOCIAL_LABOUR',
      ]);
      await expect(
        scoped.query(SOCIAL_MANUAL_CLAIM_AUTHORIZATION_LOCK_QUERY, [
          'WORLD_TEST',
          'SUBJECT',
          'COUNTRY_01',
          'SOCIAL',
          'SOCIAL_LABOUR',
        ]),
      ).rejects.toBe(original);
    });
    expect(role).toBe('fixture_social_writer');
    expect(seen).toContain(SOCIAL_MANUAL_CLAIM_AUTHORIZATION_LOCK_QUERY);
    expect(seen).toContain(SOCIAL_MANUAL_CLAIM_AUTHORIZATION_LOCK_QUERY + ' ');
  });
});
