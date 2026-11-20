/** Fixed transport/lock delegation. Protocol rows never establish actual SQL
 * authority; actual SQL and native host acceptance are separate checks. */
import type { Pool, PoolClient } from 'pg';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';
import {
  WORKER_CURRENT_AUTHORIZATION_LOCK_QUERY,
  WORKER_REVOKED_AUTHORIZATION_LOCK_QUERY,
} from '../../apps/world-worker/src/persistence/worker-authorization-sql.js';
import { describe, expect, it } from 'vitest';
import {
  createPostwarCaptainIntakeAuthorizationPool,
  CAPTAIN_INTAKE_BINDING_LOCK_QUERY,
  createPostwarCaptainAuthorizationDatabase,
  CAPTAIN_RUNTIME_CURRENT_AUTHORIZATION_LOCK_QUERY,
  CAPTAIN_MANUAL_CLAIM_AUTHORIZATION_LOCK_QUERY,
} from '../../apps/world-worker/src/persistence/postwar-captain-intake-authorization.js';
import { OFFICE_COMMAND_CURRENT_BINDING_QUERY } from '../../apps/world-worker/src/intake/postgres-office-command-intake.js';
describe('fixed Captain intake metadata lock delegation', () => {
  it('reuses the exact pool identity and rewrites only the two exact Captain binding queries, preserving actual results/errors/release', async () => {
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
    const wrapped = createPostwarCaptainIntakeAuthorizationPool(pool);
    expect(createPostwarCaptainIntakeAuthorizationPool(pool)).toBe(wrapped);
    expect(createPostwarCaptainIntakeAuthorizationPool(wrapped)).toBe(wrapped);
    const connected = await wrapped.connect();
    const args = [
      'WORLD_TEST',
      '11111111-1111-4111-8111-111111111111',
      'COUNTRY_01',
      'CAPTAIN',
      'SEAT_TEST',
      'REV_1',
      'CAPTAIN_CABINET',
      'OFFICE_434F554E5452595F3031_4341505441494E',
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
      sql: CAPTAIN_INTAKE_BINDING_LOCK_QUERY,
      args,
    });
    expect(statements[1]).toEqual({
      sql: CAPTAIN_INTAKE_BINDING_LOCK_QUERY,
      args,
    });
    expect(statements[2]!.sql).toBe(lock);
    expect(
      statements.some((s) => /\bgrant\b|\bset\s+role\b/iu.test(s.sql)),
    ).toBe(false);
  });
  it('keeps eight-string/Captain Labour gates on both literals and never rewrites other SQL or offices', async () => {
    const seen: { sql: string; parameters: readonly unknown[] }[] = [];
    const client = {
      query: (sql: string, parameters: readonly unknown[] = []) => {
        seen.push({ sql, parameters });
        return Promise.resolve({ rows: [], rowCount: 0 });
      },
      release() {},
    };
    const wrapped = createPostwarCaptainIntakeAuthorizationPool({
      connect: async () => client as unknown as PoolClient,
    });
    const connection = await wrapped.connect();
    const args = [
      'WORLD_TEST',
      '11111111-1111-4111-8111-111111111111',
      'COUNTRY_01',
      'CAPTAIN',
      'SEAT_TEST',
      'REV_1',
      'CAPTAIN_CABINET',
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
            'CAPTAIN_INTAKE_FIXED_PARAMETERS_REQUIRED',
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
      expect(
        seen.some((s) => s.sql === CAPTAIN_INTAKE_BINDING_LOCK_QUERY),
      ).toBe(false);
    } finally {
      connection.release();
    }
  });
});

describe('fixed Captain worker authorization database delegation', () => {
  it('maps exactly the guard, manual claim and Atomic current/revoked literals on the same held executor', async () => {
    const calls: { sql: string; args: readonly unknown[] }[] = [];
    const current = {
      rowCount: 1,
      rows: [{ team_id: 'TEAM_TEST_ONLY', authorization_version: 'REV_1' }],
    };
    const present = { rowCount: 1, rows: [{ '?column?': 1 }] };
    let transactions = 0;
    const original = Error('ACTUAL_CONTROLLED_QUERY_FAILURE');
    const tx: SqlExecutor = {
      async query<Row extends object>(
        sql: string,
        args: readonly unknown[] = [],
      ) {
        expect(this).toBe(tx);
        calls.push({ sql, args });
        if (sql === 'select failure') throw original;
        const value = sql.includes('revoked_authorization') ? present : current;
        return value as unknown as { rowCount: number; rows: readonly Row[] };
      },
    };
    const db: SqlDatabase = {
      query: async () => {
        throw Error('UNEXPECTED_SECOND_POOL_CONNECTION');
      },
      transaction: async (op) => {
        transactions++;
        return op(tx);
      },
    };
    const fixed = createPostwarCaptainAuthorizationDatabase(db);
    expect(createPostwarCaptainAuthorizationDatabase(db)).toBe(fixed);
    expect(createPostwarCaptainAuthorizationDatabase(fixed)).toBe(fixed);
    const three = [
      'WORLD_TEST_ONLY',
      '11111111-1111-4111-8111-111111111111',
      'COUNTRY_01',
    ];
    const five = [...three, 'CAPTAIN', 'CAPTAIN_CABINET'];
    await fixed.transaction(async (actual) => {
      expect(
        await actual.query(
          CAPTAIN_RUNTIME_CURRENT_AUTHORIZATION_LOCK_QUERY,
          three,
        ),
      ).toBe(current);
      expect(
        await actual.query(CAPTAIN_MANUAL_CLAIM_AUTHORIZATION_LOCK_QUERY, five),
      ).toBe(current);
      expect(
        await actual.query(WORKER_CURRENT_AUTHORIZATION_LOCK_QUERY, five),
      ).toBe(current);
      expect(
        await actual.query(
          WORKER_REVOKED_AUTHORIZATION_LOCK_QUERY,
          five.slice(0, 4),
        ),
      ).toBe(present);
      await expect(actual.query('select failure')).rejects.toBe(original);
    });
    expect(transactions).toBe(1);
    expect(calls.slice(0, 4)).toEqual([
      {
        sql: 'select team_id,authorization_version from world_v2.lock_postwar_captain_current_authorization($1,$2::uuid,$3,$4,$5)',
        args: five,
      },
      {
        sql: 'select team_id,authorization_version from world_v2.lock_postwar_captain_current_authorization($1,$2::uuid,$3,$4,$5)',
        args: five,
      },
      {
        sql: 'select * from world_v2.lock_postwar_captain_current_authorization($1,$2::uuid,$3,$4,$5)',
        args: five,
      },
      {
        sql: 'select present as "?column?" from world_v2.lock_postwar_captain_revoked_authorization($1,$2::uuid,$3,$4)',
        args: five.slice(0, 4),
      },
    ]);
    expect(calls.some((c) => /\bgrant\b|\bset\s+role\b/iu.test(c.sql))).toBe(
      false,
    );
  });
  it('refuses malformed fixed Captain parameters and forwards other Offices or modified SQL unchanged', async () => {
    const seen: { sql: string; args: readonly unknown[] }[] = [];
    const result = { rows: [], rowCount: 0 };
    const tx: SqlExecutor = {
      async query<Row extends object>(
        sql: string,
        args: readonly unknown[] = [],
      ) {
        seen.push({ sql, args });
        return result as { rows: readonly Row[]; rowCount: number };
      },
    };
    const fixed = createPostwarCaptainAuthorizationDatabase({
      query: tx.query.bind(tx),
      transaction: async (op) => op(tx),
    });
    const five = [
      'WORLD_TEST_ONLY',
      '11111111-1111-4111-8111-111111111111',
      'COUNTRY_01',
      'CAPTAIN',
      'CAPTAIN_CABINET',
    ];
    await fixed.transaction(async (executor) => {
      for (const sql of [
        CAPTAIN_MANUAL_CLAIM_AUTHORIZATION_LOCK_QUERY,
        WORKER_CURRENT_AUTHORIZATION_LOCK_QUERY,
      ]) {
        for (const bad of [
          five.slice(0, 4),
          [...five, 'EXTRA'],
          five.map((v, i) => (i === 4 ? 'OTHER_CAPABILITY' : v)),
          five.map((v, i) => (i === 2 ? 1 : v)),
        ])
          expect(() => executor.query(sql, bad)).toThrow(
            'FIXED_PARAMETERS_REQUIRED',
          );
        const foreign = five.map((v, i) =>
          i === 3 ? 'FINANCE' : i === 4 ? 'FINANCE_BUDGET' : v,
        );
        await executor.query(sql, foreign);
        expect(seen.at(-1)).toEqual({ sql, args: foreign });
      }
      expect(() =>
        executor.query(CAPTAIN_RUNTIME_CURRENT_AUTHORIZATION_LOCK_QUERY, five),
      ).toThrow('FIXED_PARAMETERS_REQUIRED');
      expect(() =>
        executor.query(WORKER_REVOKED_AUTHORIZATION_LOCK_QUERY, five),
      ).toThrow('FIXED_PARAMETERS_REQUIRED');
      for (const sql of [
        CAPTAIN_RUNTIME_CURRENT_AUTHORIZATION_LOCK_QUERY + ' ',
        CAPTAIN_MANUAL_CLAIM_AUTHORIZATION_LOCK_QUERY + ' ',
        WORKER_CURRENT_AUTHORIZATION_LOCK_QUERY + ' ',
        WORKER_REVOKED_AUTHORIZATION_LOCK_QUERY + ' ',
      ]) {
        await executor.query(sql, five);
        expect(seen.at(-1)).toEqual({ sql, args: five });
      }
    });
  });
});
