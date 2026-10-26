/** Owned PG16 protocol only; no actual GOV issuer, appointment or source. */
import { execFileSync } from 'node:child_process';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canonicalSerialize } from '@econmind/core';
import { PostgresSqlDatabase } from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import {
  GOV01_ORIGINAL_ID,
  type Gov01ReadRequest,
} from '../../apps/world-worker/src/preparation/b06-gov01-adopted-record-source.js';
import {
  applyGov01NativeControlOperation,
  GOV01_CONTROL_DEPENDENCIES,
  gov01ControlSha256 as sha,
  readGov01NativeControlSnapshotFrom,
  type Gov01ControlOperation,
  type Gov01ControlReplacement,
} from '../../apps/world-worker/src/preparation/gov01-native-control-store.js';
import { loadFrozenRenewalMigrationFixture } from '../support/renewal-frozen-migration-fixture.js';

const native =
  process.env.ECONMIND_GOV01_NATIVE_TESTS === '1' ? describe : describe.skip;
const project = path.resolve(import.meta.dirname, '../..');
const world = 'WORLD_F_GOV01_NATIVE_PROTOCOL_ONLY';
const request: Gov01ReadRequest = {
  worldId: world,
  requestedOriginalId: GOV01_ORIGINAL_ID,
  registrationReference: 'TEST_REGISTRATION',
  sourceSetVersion: 'TEST_SOURCE_SET',
  heldHead: { worldVersion: '0', eventSequence: '0' },
};
const childEnvironment = { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' };
const readerRole = 'f_gov01_protocol_reader',
  operatorRole = 'f_gov01_protocol_operator';
const tables = [
  'gov01_control_catalog',
  'gov01_control_scope',
  'gov01_control_head',
  'gov01_control_checkpoint',
  'gov01_control_history',
  'gov01_control_document',
  'gov01_control_operation_receipt',
] as const;
let admin: Pool, reader: Pool, operator: Pool;
let clusterAdmin: Pool;
let readerDB: PostgresSqlDatabase, operatorDB: PostgresSqlDatabase;
let ownedRoot = '',
  data = '',
  bin = '',
  started = false;
let sequence = 0;
const port = 6543; // Unique private socket directory; no TCP listener or shared service.
const pendingPools: Pool[] = [];

function payload(): Gov01ControlReplacement {
  const utf8 = 'TEST_ONLY original control bytes\n未认证，不是实际账户。\n';
  return {
    recordClass: 'CONTROL_PROTOCOL_ONLY',
    anchorReference: 'TEST_ANCHOR',
    scopeReference: 'TEST_SCOPE',
    registrationReference: request.registrationReference,
    sourceSetVersion: request.sourceSetVersion,
    targetDeploymentRef: 'TEST_LOCAL_NODE',
    databaseIdentityRef: 'TEST_OWNED_DATABASE',
    connectorReference: 'TEST_PRIVATE_SOCKET',
    allowedCaller: 'WORKER_GOV01_ACCOUNT_READ_V1',
    enrollmentReference: 'TEST_UNAPPOINTED',
    bindingBase: null,
    manifestPin: null,
    documents: [
      {
        pin: {
          documentId: 'TEST_RAW_ORIGINAL',
          sourceVersion: 'TEST_VERSION',
          byteLength: String(Buffer.byteLength(utf8)),
          sha256: sha(utf8),
          pointer: '',
        },
        utf8,
      },
    ],
  };
}
async function snapshot() {
  return readerDB.transaction((tx) =>
    readGov01NativeControlSnapshotFrom(tx, request),
  );
}
async function expected() {
  const s = await snapshot();
  expect(s.status).toBe('PRESENT');
  return { generation: s.generation!, headDigest: s.headDigest! };
}
async function operation(
  kind: Gov01ControlOperation['kind'],
  value: Gov01ControlOperation['payload'],
  at?: Gov01ControlOperation['expected'],
): Promise<Gov01ControlOperation> {
  return {
    schemaVersion: 'gov01-control-operation-v1',
    operationId: 'TEST_OPERATION_' + String(++sequence),
    worldId: world,
    originalId: GOV01_ORIGINAL_ID,
    heldHead: request.heldHead,
    expected: at === undefined ? await expected() : at,
    kind,
    payload: value,
  };
}
async function footprints() {
  const result: Record<string, unknown> = {};
  for (const t of tables)
    result[t] = (
      await admin.query<{ v: string }>(
        `select to_jsonb(t)::text as v from world_v2.${t} t order by to_jsonb(t)::text collate "C"`,
      )
    ).rows;
  return result;
}
async function waitForBlockedBy(readerPid: number) {
  const deadline = Date.now() + 1500;
  while (Date.now() < deadline) {
    const rows = await admin.query<{ pid: number; blockers: number[] }>(
      `select pid,pg_blocking_pids(pid) as blockers from pg_catalog.pg_stat_activity
       where application_name='f_gov01_operator' and wait_event_type='Lock'`,
    );
    const row = rows.rows.find((r) => r.blockers.includes(readerPid));
    if (row) return row;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw Error('NATIVE_CATALOG_CONFLICT_NOT_OBSERVED');
}
async function heldReadBlocks(
  operationValue: Gov01ControlOperation,
  expectAbsent = false,
) {
  let release = () => {};
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reached = () => {};
  const ready = new Promise<void>((resolve) => {
    reached = resolve;
  });
  let pid = 0;
  const read = readerDB.transaction(async (tx) => {
    pid = (await tx.query<{ pid: number }>('select pg_backend_pid() as pid'))
      .rows[0]!.pid;
    const observed = await readGov01NativeControlSnapshotFrom(tx, request);
    expect(observed.status).toBe(expectAbsent ? 'ABSENT' : 'PRESENT');
    reached();
    await hold;
    return observed;
  });
  // Observe rejection too; no never-settling test barrier on a read failure.
  await Promise.race([
    ready,
    read.then(() => {
      throw Error('HELD_READ_ENDED_EARLY');
    }),
  ]);
  const write = applyGov01NativeControlOperation(operatorDB, operationValue);
  const settled = write.then(
    (result) => ({ ok: true as const, result }),
    (error) => ({ ok: false as const, error: error as unknown }),
  );
  try {
    const blocked = await Promise.race([
      waitForBlockedBy(pid),
      settled.then((outcome) => {
        if (!outcome.ok) throw outcome.error;
        throw Error('NATIVE_WRITER_ENDED_BEFORE_LOCK_OBSERVATION');
      }),
    ]);
    expect(blocked.blockers).toContain(pid);
    console.log(
      JSON.stringify({
        case: operationValue.kind,
        dependency:
          operationValue.kind === 'REVOKE'
            ? (operationValue.payload as { dependency: string }).dependency
            : null,
        nativeBlockingPid: blocked.pid,
        holder: pid,
        mechanism: 'pg_blocking_pids',
        scope: 'CONTROL_PROTOCOL_ONLY',
      }),
    );
  } finally {
    release();
  }
  await read;
  const outcome = await settled;
  if (!outcome.ok) throw outcome.error;
  return outcome.result;
}

native(
  'GOV01 native control delta — owned protocol, absence and all finite mutators',
  () => {
    beforeAll(async () => {
      const uid = process.getuid?.();
      if (uid === undefined || uid === 0)
        throw Error('OWNED_NONROOT_NATIVE_TEST_REQUIRED');
      bin = await realpath(
        process.platform === 'darwin'
          ? '/opt/homebrew/opt/postgresql@16/bin'
          : '/usr/lib/postgresql/16/bin',
      );
      const versions: Record<string, string> = {};
      for (const tool of ['postgres', 'initdb', 'pg_ctl', 'createdb']) {
        const filename = path.join(bin, tool),
          s = await lstat(filename);
        expect(s.isFile()).toBe(true);
        expect([0, uid]).toContain(s.uid);
        expect(s.mode & 0o022).toBe(0);
        versions[tool] = execFileSync(filename, ['--version'], {
          env: childEnvironment,
          encoding: 'utf8',
        }).trim();
        expect(versions[tool]).toMatch(/PostgreSQL\) 16\.15(?: |$)/u);
      }
      ownedRoot = await mkdtemp(
        path.join(await realpath(tmpdir()), 'econmind-f-gov01-native-'),
      );
      await chmod(ownedRoot, 0o700);
      data = path.join(ownedRoot, 'data');
      const socket = path.join(ownedRoot, 'socket');
      await mkdir(socket, { mode: 0o700 });
      if (!/^[A-Za-z0-9_./-]+$/u.test(socket))
        throw Error('SAFE_OWNED_SOCKET_PATH_REQUIRED');
      const database = 'econmind_v09_f_gov01_' + String(process.pid);
      const marker = {
        schema: 'F_GOV01_OWNED_PG16_V1',
        uid,
        root: ownedRoot,
        data,
        socket,
        port,
        database,
        bin,
        versions,
      };
      await writeFile(
        path.join(ownedRoot, 'owner.json'),
        JSON.stringify(marker),
        { flag: 'wx', mode: 0o600 },
      );
      execFileSync(
        path.join(bin, 'initdb'),
        [
          '-D',
          data,
          '-U',
          'postgres',
          '-A',
          'trust',
          '--no-locale',
          '-E',
          'UTF8',
        ],
        { env: childEnvironment, stdio: 'pipe' },
      );
      execFileSync(
        path.join(bin, 'pg_ctl'),
        [
          '-D',
          data,
          '-l',
          path.join(ownedRoot, 'server.log'),
          '-o',
          `-c listen_addresses='' -p ${port} -k ${socket}`,
          '-w',
          '-t',
          '30',
          'start',
        ],
        { env: childEnvironment, stdio: 'pipe' },
      );
      started = true;
      const pool = (
        name: string,
        user = 'postgres',
        application_name = 'f_gov01_fixture_admin',
      ) => {
        const p = new Pool({
          host: socket,
          port,
          database: name,
          user,
          max: 3,
          application_name,
          options: '-c lock_timeout=3000 -c statement_timeout=6000',
        });
        pendingPools.push(p);
        return p;
      };
      clusterAdmin = pool('postgres');
      await clusterAdmin.query(`create database ${database}`);
      admin = pool(database);
      const identity = (
        await admin.query<{
          database_name: string;
          data_directory: string;
          port: string;
        }>(
          "select current_database() as database_name,current_setting('data_directory') as data_directory,current_setting('port') as port",
        )
      ).rows[0]!;
      expect(identity).toEqual({
        database_name: database,
        data_directory: data,
        port: String(port),
      });
      const pid = (
        await readFile(path.join(data, 'postmaster.pid'), 'utf8')
      ).split('\n');
      expect(pid[1]).toBe(data);
      expect(pid[3]).toBe(String(port));
      expect(Number(pid[0])).toBeGreaterThan(1);
      const frozen = await loadFrozenRenewalMigrationFixture(project);
      for (const [index, migration] of frozen.manifest.migrations.entries()) {
        if (migration.release_order <= 12)
          await admin.query(frozen.artifacts[index]!);
      }
      await admin.query(
        await readFile(
          path.join(project, 'tests/support/gov01-native-control-schema.sql'),
          'utf8',
        ),
      );
      await admin.query(
        'insert into world_v2.world_head(world_id) values($1)',
        [world],
      );
      for (const role of [readerRole, operatorRole]) {
        await admin.query(
          `create role ${role} login noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication`,
        );
        await admin.query(`grant usage on schema world_v2 to ${role}`);
      }
      await admin.query(
        `grant execute on function world_v2.gov01_read_control_snapshot(text,text,text) to ${readerRole}`,
      );
      await admin.query(
        `grant execute on function world_v2.gov01_apply_control_operation(text,text) to ${operatorRole}`,
      );
      reader = pool(database, readerRole, 'f_gov01_reader');
      operator = pool(database, operatorRole, 'f_gov01_operator');
      readerDB = new PostgresSqlDatabase(reader);
      operatorDB = new PostgresSqlDatabase(operator);
      console.log(
        JSON.stringify({
          ...marker,
          privateSocket: true,
          TCPListener: false,
          migrationPrefix: 12,
          artifact: 'TEST_SUPPORT_NOT_FORMAL_MIGRATION',
          actualSourceInstalled: false,
        }),
      );
    }, 40000);
    afterAll(async () => {
      try {
        if (reader) await reader.end();
        if (operator) await operator.end();
        if (admin) {
          expect(
            (
              await admin.query<{ count: string }>(
                'select count(*)::text as count from pg_catalog.pg_stat_activity where usename=any($1::text[])',
                [[readerRole, operatorRole]],
              )
            ).rows[0]!.count,
          ).toBe('0');
        }
        for (const p of pendingPools.filter(
          (p) => p !== reader && p !== operator,
        ))
          await p.end();
      } finally {
        if (started) {
          const marker = JSON.parse(
            await readFile(path.join(ownedRoot, 'owner.json'), 'utf8'),
          ) as {
            uid: number;
            root: string;
            data: string;
            port: number;
            bin: string;
          };
          const stat = await lstat(ownedRoot),
            pid = (
              await readFile(path.join(data, 'postmaster.pid'), 'utf8')
            ).split('\n');
          expect(stat.uid).toBe(process.getuid?.());
          expect(stat.mode & 0o777).toBe(0o700);
          expect(marker).toMatchObject({
            uid: stat.uid,
            root: ownedRoot,
            data,
            port,
            bin,
          });
          expect(pid[1]).toBe(data);
          expect(pid[3]).toBe(String(port));
          execFileSync(
            path.join(bin, 'pg_ctl'),
            ['-D', data, '-m', 'fast', '-w', '-t', '30', 'stop'],
            { env: childEnvironment, stdio: 'pipe' },
          );
          started = false;
          await expect(
            lstat(path.join(data, 'postmaster.pid')),
          ).rejects.toMatchObject({ code: 'ENOENT' });
          let status = 0;
          try {
            execFileSync(path.join(bin, 'pg_ctl'), ['-D', data, 'status'], {
              env: childEnvironment,
              stdio: 'pipe',
            });
          } catch (error) {
            status = (error as { status: number }).status;
          }
          expect(status).toBe(3);
          console.log(
            JSON.stringify({
              cleanup: 'OWNED_GOV01_CLUSTER_STOPPED',
              roleSessions: 0,
              poolsClosed: true,
              serverStopped: true,
              status,
              privateDataRetained: ownedRoot,
              actualSourceInstalled: false,
            }),
          );
        }
      }
    }, 40000);

    it('creates no GOV scope or registration as part of artifact installation', async () => {
      const s = await snapshot();
      expect(s.status).toBe('ABSENT');
      expect(s.classification).toBe('CONTROL_PROTOCOL_ONLY');
      expect(
        (await admin.query('select * from world_v2.gov01_control_scope'))
          .rowCount,
      ).toBe(0);
    });
    it('holds stable registration absence against the real REGISTER operation', async () => {
      const result = await heldReadBlocks(
        await operation('REGISTER', payload(), null),
        true,
      );
      expect(result.result.source).toBe('NEW_CONTROL_OPERATION');
      const s = await snapshot();
      expect(s.documents).toEqual(payload().documents);
      expect(s.recordClass).toBe('CONTROL_PROTOCOL_ONLY');
    });
    it.each(['REPLACE_RECORD_SET', 'REPLACE_INSTALLATION'] as const)(
      'protects the real %s writer until COMMIT',
      async (kind) => {
        await heldReadBlocks(await operation(kind, payload()));
      },
    );
    it.each(GOV01_CONTROL_DEPENDENCIES)(
      'protects %s revocation until COMMIT',
      async (dependency) => {
        await heldReadBlocks(await operation('REVOKE', { dependency }));
        expect((await snapshot()).state?.dependencies).toMatchObject({
          [dependency]: 'REVOKED',
        });
      },
    );
    it('does not grant direct control DML or mutation execution to the actual reader', async () => {
      await expect(
        reader.query('delete from world_v2.gov01_control_scope'),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        reader.query(
          "select world_v2.gov01_apply_control_operation('{}','bad')",
        ),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        operator.query(
          'update world_v2.gov01_control_head set generation=generation',
        ),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        admin.query(
          'delete from world_v2.gov01_control_scope where world_id=$1',
          [world],
        ),
      ).rejects.toThrow('GOV01_IMMUTABLE_CONTROL_RECORD');
      const actual = (
        await reader.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
          'select rolsuper,rolbypassrls from pg_catalog.pg_roles where rolname=current_user',
        )
      ).rows[0]!;
      expect(actual).toEqual({ rolsuper: false, rolbypassrls: false });
    });
    it('rejects null or non-string native headers without relying on the TypeScript wrapper', async () => {
      const valid = await operation('REPLACE_RECORD_SET', payload());
      const before = await footprints();
      const malformed = [
        { ...valid, schemaVersion: null },
        { ...valid, originalId: null },
        { ...valid, operationId: null },
        { ...valid, operationId: 123 },
        { ...valid, operationId: 'x'.repeat(513) },
        { ...valid, kind: null },
        { ...valid, heldHead: null },
        { ...valid, heldHead: { worldVersion: null, eventSequence: '0' } },
        { ...valid, heldHead: { worldVersion: 0, eventSequence: '0' } },
      ];
      for (const value of malformed) {
        // Intentionally bypass the canonical TypeScript parser: malformed SQL
        // input must be refused by the native entry itself.
        const body = JSON.stringify(value);
        await expect(
          operatorDB.transaction((tx) =>
            tx.query('select world_v2.gov01_apply_control_operation($1,$2)', [
              body,
              sha('GOV01_CONTROL_OPERATION_V1\n' + body),
            ]),
          ),
        ).rejects.toMatchObject({ outcome: 'ROLLED_BACK' });
        expect(await footprints()).toEqual(before);
      }
    });
    it('recovers an exact historical operation before NEW CAS, and rejects conflicting reuse', async () => {
      const op = await operation('REPLACE_RECORD_SET', payload());
      const first = await applyGov01NativeControlOperation(operatorDB, op);
      const before = await footprints();
      const again = await applyGov01NativeControlOperation(operatorDB, op);
      expect(again.result).toEqual({
        ...first.result,
        source: 'EXISTING_CONTROL_OPERATION',
      });
      expect(await footprints()).toEqual(before);
      await expect(
        applyGov01NativeControlOperation(operatorDB, {
          ...op,
          kind: 'RETIRE',
          payload: { reasonReference: 'CONFLICT' },
        }),
      ).rejects.toThrow();
      expect(await footprints()).toEqual(before);
    });
    it('allows only one of two same-generation native writers to advance', async () => {
      const at = await expected();
      const a = await operation('REVOKE', { dependency: 'registration' }, at),
        b = await operation('REVOKE', { dependency: 'currency' }, at);
      const outcomes = await Promise.allSettled([
        applyGov01NativeControlOperation(operatorDB, a),
        applyGov01NativeControlOperation(operatorDB, b),
      ]);
      expect(outcomes.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
      expect(outcomes.filter((x) => x.status === 'rejected')).toHaveLength(1);
      expect((await snapshot()).generation).toBe(
        String(BigInt(at.generation) + 1n),
      );
    });
    it('rolls back partial document insertion with history, checkpoint and receipt unchanged', async () => {
      const before = await footprints(),
        value = payload();
      const bad = {
        ...value,
        documents: [
          ...value.documents,
          {
            ...value.documents[0]!,
            pin: {
              ...value.documents[0]!.pin,
              documentId: 'SECOND_RAW_BAD_HASH',
              sha256: '0'.repeat(64),
            },
          },
        ],
      };
      const op = {
        ...(await operation('REPLACE_RECORD_SET', value)),
        payload: bad,
      };
      const body = canonicalSerialize(op);
      await expect(
        operatorDB.transaction((tx) =>
          tx.query('select world_v2.gov01_apply_control_operation($1,$2)', [
            body,
            sha('GOV01_CONTROL_OPERATION_V1\n' + body),
          ]),
        ),
      ).rejects.toThrow();
      expect(await footprints()).toEqual(before);
    });
    it('keeps an absent read protected until ROLLBACK and releases its native locks', async () => {
      const absentWorld = 'WORLD_F_GOV01_ABSENT_ROLLBACK_PROTOCOL_ONLY';
      await admin.query(
        'insert into world_v2.world_head(world_id) values($1)',
        [absentWorld],
      );
      const client = await reader.connect();
      await client.query('begin');
      const absent = await client.query<{ snapshot: { status: string } }>(
        'select world_v2.gov01_read_control_snapshot($1,$2,$3) as snapshot',
        [absentWorld, '0', '0'],
      );
      expect(absent.rows[0]!.snapshot.status).toBe('ABSENT');
      const probe = await admin.connect();
      try {
        await probe.query('begin');
        await expect(
          probe.query(
            'select singleton from world_v2.gov01_control_catalog for update nowait',
          ),
        ).rejects.toMatchObject({ code: '55P03' });
        await probe.query('rollback');
        await client.query('rollback');
        await probe.query('begin');
        expect(
          (
            await probe.query(
              'select singleton from world_v2.gov01_control_catalog for update nowait',
            )
          ).rowCount,
        ).toBe(1);
        await probe.query('rollback');
      } finally {
        await client.query('rollback').catch(() => undefined);
        await probe.query('rollback').catch(() => undefined);
        client.release();
        probe.release();
      }
    });
    it('refuses a corrupted materialized checkpoint and wrong exact selectors', async () => {
      const before = await snapshot();
      await admin.query(
        `update world_v2.gov01_control_checkpoint c set generation=h.generation-1,
      head_digest=p.head_digest from world_v2.gov01_control_head h
      join world_v2.gov01_control_history p on p.world_id=h.world_id and p.original_id=h.original_id and p.generation=h.generation-1
      where c.world_id=h.world_id and c.original_id=h.original_id and c.world_id=$1`,
        [world],
      );
      try {
        await expect(snapshot()).rejects.toMatchObject({
          outcome: 'ROLLED_BACK',
          cause: { message: 'GOV01_CHECKPOINT_OR_HISTORY_MISMATCH' },
        });
      } finally {
        await admin.query(
          'update world_v2.gov01_control_checkpoint set generation=$2,head_digest=$3 where world_id=$1',
          [world, before.generation, before.headDigest],
        );
      }
      await expect(
        readerDB.transaction((tx) =>
          readGov01NativeControlSnapshotFrom(tx, {
            ...request,
            sourceSetVersion: 'WRONG_EXACT_SET',
          }),
        ),
      ).rejects.toThrow();
    });
    it('suppresses an actually committed acknowledgement-unknown result and explicitly recovers it once', async () => {
      const op = await operation('REPLACE_RECORD_SET', payload());
      let commits = 0,
        exposed = false;
      const transport = {
        async connect() {
          const c = await operator.connect();
          return {
            async query(sql: string, values: unknown[] = []) {
              const result = await c.query(sql, values);
              if (sql === 'commit') {
                commits++;
                throw Error(
                  'INJECTED_NATIVE_COMMIT_ACK_LOSS_AFTER_REAL_COMMIT',
                );
              }
              return result;
            },
            release(error?: Error) {
              c.release(error);
            },
          };
        },
      };
      const unknown = new PostgresSqlDatabase(transport as unknown as Pool);
      await expect(
        applyGov01NativeControlOperation(unknown, op).then(() => {
          exposed = true;
        }),
      ).rejects.toMatchObject({ outcome: 'COMMIT_OUTCOME_UNKNOWN' });
      expect(exposed).toBe(false);
      expect(commits).toBe(1);
      const persisted = await footprints();
      const recovered = await applyGov01NativeControlOperation(operatorDB, op);
      expect(recovered.result.source).toBe('EXISTING_CONTROL_OPERATION');
      expect(await footprints()).toEqual(persisted);
    });
    it('holds the actual H row against advance and rejects an incorrect requested frontier', async () => {
      await readerDB.transaction(async (tx) => {
        await readGov01NativeControlSnapshotFrom(tx, request);
        const probe = await admin.connect();
        try {
          await probe.query('begin');
          await expect(
            probe.query(
              'select world_id from world_v2.world_head where world_id=$1 for update nowait',
              [world],
            ),
          ).rejects.toMatchObject({ code: '55P03' });
        } finally {
          await probe.query('rollback');
          probe.release();
        }
      });
      await expect(
        readerDB.transaction((tx) =>
          readGov01NativeControlSnapshotFrom(tx, {
            ...request,
            heldHead: { worldVersion: '1', eventSequence: '0' },
          }),
        ),
      ).rejects.toThrow();
    });
    it('runs a short bounded normal cycle without leaking sessions or creating economic facts', async () => {
      for (let i = 0; i < 4; i++) {
        await applyGov01NativeControlOperation(
          operatorDB,
          await operation('REPLACE_RECORD_SET', payload()),
        );
        expect((await snapshot()).documents).toEqual(payload().documents);
      }
      const facts = (
        await admin.query<{
          events: string;
          inventory: string;
          financial: string;
          receipts: string;
        }>(
          `select (select count(*)::text from world_v2.authoritative_event) as events,
      (select count(*)::text from world_v2.inventory_posting) as inventory,
      (select count(*)::text from world_v2.financial_posting_batch) as financial,
      (select count(*)::text from world_v2.command_receipt) as receipts`,
        )
      ).rows[0]!;
      expect(facts).toEqual({
        events: '0',
        inventory: '0',
        financial: '0',
        receipts: '0',
      });
    });
    it('retains the permanent tombstone and protects retirement against an active reader', async () => {
      const op = await operation('RETIRE', {
        reasonReference: 'TEST_TERMINAL_RETIREMENT',
      });
      await heldReadBlocks(op);
      expect((await snapshot()).state?.retired).toBe(true);
      await expect(
        applyGov01NativeControlOperation(
          operatorDB,
          await operation('REPLACE_RECORD_SET', payload()),
        ),
      ).rejects.toThrow();
      await expect(
        applyGov01NativeControlOperation(
          operatorDB,
          await operation('REGISTER', payload(), null),
        ),
      ).rejects.toThrow();
      const again = await applyGov01NativeControlOperation(operatorDB, op);
      expect(again.result.source).toBe('EXISTING_CONTROL_OPERATION');
    });
  },
);
