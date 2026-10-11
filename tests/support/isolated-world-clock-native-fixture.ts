// Native oracle only: no environment URL, TCP, production credential or reuse.
import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { Pool, type PoolClient } from 'pg';
import { loadFrozenRenewalMigrationFixture } from './renewal-frozen-migration-fixture.js';
import { snapshotStorageFixtureSql } from './snapshot-storage-fixture.js';
import { PostgresSqlDatabase } from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import { ClockKnownCommitCleanupFailure } from '../../apps/world-worker/src/time/durable-world-clock.js';
import { parseClockBinding } from '../../apps/world-worker/src/time/clock-contracts.js';

const writer = 'a_clock_test_writer',
  reader = 'a_clock_test_reader';
export async function openClockFixture() {
  if (
    process.env.DATABASE_URL !== undefined ||
    process.env.WORLD_DATABASE_URL !== undefined ||
    Object.keys(process.env).some((k) => k.startsWith('PG') && process.env[k])
  )
    throw Error('URL_OR_PG_ENV_FORBIDDEN');
  const markerPath = process.env.ISOLATED_CLOCK_NATIVE_MARKER;
  if (!markerPath) throw Error('OWNED_MARKER_REQUIRED');
  const uid = process.getuid!();
  const s = lstatSync(markerPath);
  if (
    !s.isFile() ||
    s.uid !== uid ||
    (s.mode & 0o777) !== 0o600 ||
    realpathSync(markerPath) !== markerPath
  )
    throw Error('MARKER_NOT_PRIVATE_CANONICAL');
  const m = JSON.parse(readFileSync(markerPath, 'utf8')) as {
    schema: string;
    uid: number;
    data: string;
    socket: string;
    socketAlias: string;
    database: string;
    port: number;
    bootstrap: string;
  };
  if (
    m.schema !== 'ISOLATED_CLOCK_NATIVE_1' ||
    m.uid !== uid ||
    m.database !== 'econmind_isolated_clock_test' ||
    m.bootstrap !== 'a_clock_test_bootstrap' ||
    m.port !== 5432 ||
    m.data !== path.join(path.dirname(markerPath), 'data') ||
    m.socket !== path.join(path.dirname(markerPath), 'socket')
  )
    throw Error('MARKER_SCOPE_INVALID');
  for (const dir of [
    path.dirname(markerPath),
    m.data,
    m.socket,
    path.dirname(m.socketAlias),
  ]) {
    const st = lstatSync(dir);
    if (
      !st.isDirectory() ||
      st.uid !== uid ||
      (st.mode & 0o777) !== 0o700 ||
      realpathSync(dir) !== dir
    )
      throw Error('DIRECTORY_NOT_OWNED_PRIVATE_CANONICAL');
  }
  if (
    !lstatSync(m.socketAlias).isSymbolicLink() ||
    realpathSync(m.socketAlias) !== m.socket
  )
    throw Error('SOCKET_NOT_OWNED');
  const root = path.resolve(import.meta.dirname, '../..');
  const frozen = await loadFrozenRenewalMigrationFixture(root);
  const connection = {
    host: m.socketAlias,
    port: m.port,
    database: m.database,
    connectionTimeoutMillis: 2000,
  };
  const admin = new Pool({ ...connection, user: m.bootstrap, max: 6 });
  const identity = (
    await admin.query(`select current_database() as db,current_user as role,
    current_setting('data_directory') as data,current_setting('server_version_num') as version,inet_server_addr() as host`)
  ).rows[0];
  if (
    JSON.stringify(identity) !==
    JSON.stringify({
      db: m.database,
      role: m.bootstrap,
      data: m.data,
      version: '160015',
      host: null,
    })
  ) {
    await admin.end();
    throw Error('SERVER_IDENTITY_INVALID');
  }
  if (
    (await admin.query("select 1 from pg_namespace where nspname='world_v2'"))
      .rowCount !== 0
  ) {
    await admin.end();
    throw Error('SERVER_NOT_EMPTY');
  }
  await admin.query(snapshotStorageFixtureSql);
  for (const sql of frozen.artifacts) await admin.query(sql);
  await admin.query(
    readFileSync(
      path.join(root, 'database/proposals/runtime-read-binding-storage.sql'),
      'utf8',
    ),
  );
  await admin.query(
    readFileSync(
      path.join(root, 'database/proposals/isolated-world-clock.sql'),
      'utf8',
    ),
  );
  for (const role of [writer, reader])
    await admin.query(
      `create role ${role} login nosuperuser nobypassrls nocreatedb nocreaterole noinherit noreplication`,
    );
  await admin.query(`grant usage on schema world_v2 to ${writer},${reader};
    grant select,update(world_version) on world_v2.world_head to ${writer};
    grant select,update(renewed_at_real) on world_v2.world_writer_lease to ${writer};
    grant execute on function world_v2.assert_world_writer_commit_guard(text,text,bigint,bigint,timestamptz) to ${writer};
    grant select,insert on world_v2.isolated_clock_input to ${writer};
    grant select,insert,update on world_v2.isolated_clock_head to ${writer};
    create policy clock_fixture_input on world_v2.isolated_clock_input to ${writer}
      using (world_id ~ '^CLOCK_ISOLATED_') with check(world_id ~ '^CLOCK_ISOLATED_');
    create policy clock_fixture_head on world_v2.isolated_clock_head to ${writer}
      using (world_id ~ '^CLOCK_ISOLATED_') with check(world_id ~ '^CLOCK_ISOLATED_');
    create table world_v2.isolated_clock_test_source(
      reference text primary key,world_id text not null,environment text not null,
      kind text not null check(kind in ('BASE','OBSERVATION')),original_bytes text not null);
    create trigger clock_fixture_source_immutable before update or delete
      on world_v2.isolated_clock_test_source for each row
      execute function world_v2.reject_isolated_clock_input_mutation();
    alter table world_v2.isolated_clock_test_source enable row level security;
    alter table world_v2.isolated_clock_test_source force row level security;
    grant select,update(original_bytes) on world_v2.isolated_clock_test_source to ${writer};
    create policy clock_fixture_source on world_v2.isolated_clock_test_source for all to ${writer}
      using(environment='TEST_ONLY_ISOLATED' and world_id ~ '^CLOCK_ISOLATED_')
      with check(environment='TEST_ONLY_ISOLATED' and world_id ~ '^CLOCK_ISOLATED_');`);
  const pool = new Pool({ ...connection, user: writer, max: 6 });
  const readPool = new Pool({ ...connection, user: reader, max: 2 });
  const database = new PostgresSqlDatabase(pool);
  async function addSource(
    bindingBytes: string,
    ref: string,
    bytes: string,
    kind = 'OBSERVATION',
    environment = 'TEST_ONLY_ISOLATED',
  ) {
    const b = parseClockBinding(bindingBytes);
    await admin.query(
      'insert into world_v2.isolated_clock_test_source values($1,$2,$3,$4,$5)',
      [ref, b.worldId, environment, kind, bytes],
    );
  }
  async function addWorld(bindingBytes: string, duration = 60000) {
    const b = parseClockBinding(bindingBytes);
    await admin.query('insert into world_v2.world_head(world_id) values($1)', [
      b.worldId,
    ]);
    await admin.query(
      'select * from world_v2.acquire_world_writer_lease($1,$2,clock_timestamp(),$3::bigint)',
      [b.worldId, 'FIXTURE_HOLDER', duration],
    );
    await addSource(bindingBytes, b.baseGenesisRef, bindingBytes, 'BASE');
  }
  async function economicFootprint() {
    const tables = (
      await admin.query<{
        tablename: string;
      }>(`select tablename from pg_catalog.pg_tables
      where schemaname='world_v2' and tablename not in
      ('isolated_clock_input','isolated_clock_head','isolated_clock_test_source','world_writer_lease') order by tablename`)
    ).rows;
    const out: Record<string, unknown> = {};
    for (const { tablename } of tables) {
      if (!/^[a-z0-9_]+$/u.test(tablename)) throw Error('UNSAFE_TABLE');
      out[tablename] = (
        await admin.query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') as value
        from world_v2."${tablename}" t`)
      ).rows[0].value;
    }
    return out;
  }
  async function clockFootprint(world: string) {
    return (
      await admin.query(
        `select
      (select coalesce(jsonb_agg(to_jsonb(i) order by sequence),'[]') from world_v2.isolated_clock_input i where world_id=$1) as inputs,
      (select coalesce(jsonb_agg(to_jsonb(h)),'[]') from world_v2.isolated_clock_head h where world_id=$1) as heads`,
        [world],
      )
    ).rows;
  }
  return {
    admin,
    pool,
    reader: readPool,
    database,
    addWorld,
    addSource,
    economicFootprint,
    clockFootprint,
    close: async () => {
      await pool.end();
      await readPool.end();
      await admin.end();
    },
  };
}
/** Real transport fault injection only. Every statement still uses the actual
 * SqlDatabase adapter and native connection. No synthetic success rows. */
export function faultPool(
  pool: Pool,
  mode:
    | 'ACK_LOST'
    | 'COMMIT_NOT_SENT'
    | 'ROLLBACK_LOST'
    | 'CLEANUP_KNOWN'
    | 'CLEANUP_UNKNOWN',
) {
  return new Proxy(pool, {
    get(target, key) {
      if (key === 'connect')
        return async () => {
          const client = await target.connect();
          let committed = false;
          return new Proxy(client, {
            get(c, k) {
              if (k === 'query')
                return async (statement: string, params: unknown[]) => {
                  if (statement === 'rollback' && mode === 'ROLLBACK_LOST')
                    throw Error('ROLLBACK_TRANSPORT_LOST');
                  if (statement === 'commit' && mode === 'COMMIT_NOT_SENT')
                    throw Error('COMMIT_NOT_SENT');
                  const result = await c.query(statement, params);
                  if (statement === 'commit') {
                    committed = true;
                    if (mode === 'ACK_LOST')
                      throw Error('ACK_LOST_AFTER_SERVER_COMMIT');
                  }
                  return result;
                };
              if (k === 'release')
                return (error?: Error) => {
                  c.release(
                    error ??
                      (mode === 'ROLLBACK_LOST'
                        ? Error('DISCARD_UNCONFIRMED')
                        : undefined),
                  );
                  if (committed && mode === 'CLEANUP_KNOWN')
                    throw new ClockKnownCommitCleanupFailure(
                      Error('RELEASE_FAILED_AFTER_KNOWN_ACK'),
                    );
                  if (committed && mode === 'CLEANUP_UNKNOWN')
                    throw Error('RELEASE_PHASE_UNAVAILABLE');
                };
              const value = Reflect.get(c, k);
              return typeof value === 'function' ? value.bind(c) : value;
            },
          }) as PoolClient;
        };
      const value = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
