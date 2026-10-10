import { describe, expect, it } from 'vitest';
import { createWriterLeaseSupervisor } from '../../apps/world-worker/src/runtime-preparation/writer-lease-supervisor.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';
import { PostgresTransactionError } from '../../apps/world-worker/src/persistence/postgres-sql-database.js';

const at = '2026-10-10T00:00:00.000Z';
function inert() {
  let calls = 0;
  const database: SqlDatabase = {
    async query() {
      calls++;
      throw Error('INERT_DATABASE_MUST_NOT_BE_USED');
    },
    async transaction() {
      calls++;
      throw Error('INERT_DATABASE_MUST_NOT_BE_USED');
    },
  };
  return {
    database,
    calls: () => calls,
    config: {
      database,
      role: 'd_test_lease',
      worldId: 'WORLD_D_LEASE',
      workerId: 'WORKER_D_LEASE',
      leaseDurationMilliseconds: '1000',
    },
  };
}

describe('writer supervisor source-only boundaries (no positive SQL fixture)', () => {
  it('constructs without SQL and cannot grant a lease through metadata', async () => {
    const f = inert();
    const host = createWriterLeaseSupervisor(f.config);
    expect(host.status(at)).toMatchObject({
      phase: 'IDLE',
      ready: false,
      lastConfirmedLease: null,
    });
    expect(() =>
      host.assertCanCommit({ observedAtReal: at, expectedWorldVersion: '0' }),
    ).toThrow('LEASE_NOT_ACTIVE');
    expect(() => host.renew(at)).toThrow('LEASE_NOT_ACTIVE');
    expect(f.calls()).toBe(0);
    await host.stop();
    expect(host.status(at)).toMatchObject({ phase: 'STOPPED', ready: false });
    expect(() => host.acquire(at)).toThrow('ACQUIRE_REQUIRES_IDLE');
    expect(f.calls()).toBe(0);
  });

  it.each([
    'postgres',
    'service_role',
    'authenticated',
    'anon',
    'supabase_admin',
    'pg_write_all_data',
    'BAD_ROLE',
    'x;select',
  ])('refuses unsafe configured role %s without SQL', (role) => {
    const f = inert();
    expect(() => createWriterLeaseSupervisor({ ...f.config, role })).toThrow(
      'SCOPED_ROLE_REQUIRED',
    );
    expect(f.calls()).toBe(0);
  });

  it.each(['0', '-1', '1.0', '01', '2147483648', '99999999999999999999'])(
    'refuses duration %s without SQL',
    (leaseDurationMilliseconds) => {
      const f = inert();
      expect(() =>
        createWriterLeaseSupervisor({ ...f.config, leaseDurationMilliseconds }),
      ).toThrow();
      expect(f.calls()).toBe(0);
    },
  );

  it.each([
    '2026-02-30T00:00:00.000Z',
    '2026-10-10T00:00:00Z',
    '2026-10-10T00:00:00.000+00:00',
    '9999-12-31T23:59:59.999Z',
  ])('rejects noncanonical time %s without SQL', (value) => {
    const f = inert();
    const host = createWriterLeaseSupervisor(f.config);
    expect(() => host.acquire(value)).toThrow('TIMESTAMP_INVALID');
    expect(f.calls()).toBe(0);
  });

  it('copies IDs/role/duration and captures the original database port', async () => {
    const f = inert();
    const host = createWriterLeaseSupervisor(f.config);
    f.config.worldId = 'WORLD_OTHER';
    f.config.role = 'postgres';
    f.database.transaction = async () => {
      throw Error('MUTATED_PORT');
    };
    await expect(host.acquire(at)).rejects.toMatchObject({
      outcome: 'UNKNOWN',
    });
    expect(f.calls()).toBe(1);
    expect(host.status(at)).toMatchObject({ ready: false, failure: 'UNKNOWN' });
    expect(() => host.acquire(at)).toThrow();
    await host.stop();
    expect(host.status(at)).toMatchObject({
      phase: 'STOPPED',
      failure: 'UNKNOWN',
      ready: false,
    });
  });
});

describe('writer supervisor rejects incomplete/overprivileged catalog observations', () => {
  // Negative-only port controls. Actual SQL and the positive column matrix are
  // exercised by the dedicated native suite, not asserted by this fake row.
  const observation = {
    role_name: 'd_test_lease',
    session_role: 'd_test_lease',
    read_only: 'off',
    rolsuper: false,
    rolbypassrls: false,
    rolcreatedb: false,
    rolcreaterole: false,
    rolreplication: false,
    schema_creator: false,
    role_membership: false,
    lease_delete: false,
    broad_update: false,
    identity_update: false,
    head_write: false,
    lease_access: true,
    head_access: true,
    acquire_access: true,
    guard_access: true,
    column_layout_valid: true,
  };
  it.each([
    ...[
      'rolsuper',
      'rolbypassrls',
      'rolcreatedb',
      'rolcreaterole',
      'rolreplication',
      'schema_creator',
      'role_membership',
      'lease_delete',
      'broad_update',
      'identity_update',
      'head_write',
    ].flatMap((key) => [[key, true] as const, [key, undefined] as const]),
    ...[
      'lease_access',
      'head_access',
      'acquire_access',
      'guard_access',
      'column_layout_valid',
    ].flatMap((key) => [[key, false] as const, [key, undefined] as const]),
    ['role_name', 'd_other'] as const,
    ['session_role', 'd_other'] as const,
    ['read_only', 'on'] as const,
  ])('denies catalog field %s=%s before any mutation', async (key, value) => {
    let queries = 0;
    const port: SqlExecutor = {
      async query<Row extends object>(statement: string) {
        queries++;
        expect(statement).toContain('pg_auth_members');
        if (queries !== 1) throw Error('CATALOG_DENIAL_MUST_PRECEDE_SQL');
        return {
          rowCount: 1,
          rows: [{ ...observation, [String(key)]: value } as unknown as Row],
        };
      },
    };
    const database: SqlDatabase = {
      query: port.query,
      async transaction(run) {
        try {
          return await run(port);
        } catch (cause) {
          throw new PostgresTransactionError({ outcome: 'ROLLED_BACK', cause });
        }
      },
    };
    const host = createWriterLeaseSupervisor({ ...inert().config, database });
    await expect(host.acquire(at)).rejects.toMatchObject({
      outcome: 'REJECTED',
      cause: { cause: { code: 'DATABASE_ROLE_DENIED' } },
    });
    expect(queries).toBe(1);
    expect(host.status(at)).toMatchObject({
      ready: false,
      failure: 'LOST',
      lastConfirmedLease: null,
    });
    await host.stop();
  });
});
