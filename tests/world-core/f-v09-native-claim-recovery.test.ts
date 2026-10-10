// PREPARATION_ONLY_NOT_V09_2_STARTED. Synthetic claim inputs, never formal opening.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  acquireWorldWriterLease,
  createWorldWriterCommitAssertion,
  workerId,
  worldId,
  worldWriterLeaseRequest,
} from '@econmind/core';
import { WorldRecoveryCoordinator } from '../../apps/world-worker/src/recovery/world-recovery.js';
import { PostgresSqlDatabase } from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import { assertV09PostgresTestEnvironment } from '../../scripts/v09-postgres-test-environment.mjs';

const enabled =
  process.env.F_NATIVE_CLAIM_RECOVERY === 'OWNED_FRESH_GENERATION';
const root = path.resolve(import.meta.dirname, '../..');
const oldWorker = workerId('WORKER_F_NATIVE_OLD');
const newWorker = workerId('WORKER_F_NATIVE_NEW');
const t0 = '2026-10-10T00:00:00.000Z';
const t1 = '2026-10-10T00:00:01.000Z';
const t2 = '2026-10-10T00:00:02.000Z';
const t61 = '2026-10-10T00:01:01.000Z';
let database: PostgresSqlDatabase | undefined;
let pool: Pool | undefined;
function connect() {
  const target = assertV09PostgresTestEnvironment();
  pool = new Pool({
    connectionString: target.connectionString,
    max: 2,
    connectionTimeoutMillis: 2000,
    statement_timeout: 5000,
    lock_timeout: 1000,
  });
  database = new PostgresSqlDatabase(pool);
}
const db = () => {
  if (!database) throw Error('F_NATIVE_DATABASE_NOT_INITIALIZED');
  return database;
};

beforeAll(async () => {
  if (!enabled) return;
  // The shared guard rejects Supabase/runtime variables and URL overrides.
  // Additionally bind the actual server generation before the first mutation.
  const url = new URL(process.env.V09_TEST_DATABASE_URL ?? '');
  expect(url.hostname).toBe('127.0.0.1');
  expect(url.pathname).toBe('/econmind_v09_f_claim_20261010');
  expect(url.username).toBe('postgres');
  expect(url.password).toBe('');
  expect(url.search).toBe('');
  expect(url.hash).toBe('');
  expect(url.port).toMatch(/^\d+$/u);
  expect(process.env.F_NATIVE_SYSTEM_IDENTIFIER).toMatch(/^\d+$/u);
  expect(process.env.F_NATIVE_DATA_DIRECTORY).toMatch(
    /^\/Users\/samuel\/Documents\/econclub\/artifacts\/f-v09-claim-recovery-20261010\.[A-Za-z0-9]+\/pgdata$/u,
  );
  connect();
  const identity = await db().transaction(async (tx) => {
    await tx.query('set transaction read only');
    return tx.query(`select current_database() as database, current_user as role,
      host(inet_server_addr()) as host, inet_server_port()::text as port,
      current_setting('server_version_num') as version,
      current_setting('data_directory') as directory,
      current_setting('unix_socket_directories') as sockets,
      (select system_identifier::text from pg_control_system()) as system,
      (select count(*)::text from pg_namespace where nspname='world_v2') as world_schemas,
      (select count(*)::text from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind in ('r','p','v','m','S')) as public_relations`);
  });
  expect(identity.rows).toEqual([
    {
      database: 'econmind_v09_f_claim_20261010',
      role: 'postgres',
      host: '127.0.0.1',
      port: url.port,
      version: '160015',
      directory: process.env.F_NATIVE_DATA_DIRECTORY,
      sockets: '',
      system: process.env.F_NATIVE_SYSTEM_IDENTIFIER,
      world_schemas: '0',
      public_relations: '0',
    },
  ]);
  console.info('F_NATIVE_PRE_MUTATION_IDENTITY', JSON.stringify(identity.rows));
  const manifest = JSON.parse(
    await readFile(
      path.join(root, 'database/migrations/manifest.json'),
      'utf8',
    ),
  ) as {
    migrations: { path: string; release_order: number; sha256: string }[];
  };
  const selected = manifest.migrations.filter((m) => m.release_order <= 12);
  expect(selected.map((m) => m.release_order)).toEqual(
    Array.from({ length: 12 }, (_, i) => i + 1),
  );
  // Provenance is separately validated by the repository migration validator.
  // No drops, replacement DDL or new migration: install exact existing 0001–0012.
  for (const m of selected) {
    expect(m.path).toMatch(
      /^database\/migrations\/artifacts\/\d{4}_[a-z0-9_]+\.sql$/u,
    );
    const bytes = await readFile(path.join(root, m.path));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(m.sha256);
    await pool!.query(bytes.toString('utf8'));
  }
  console.info('F_NATIVE_INSTALLED_MIGRATIONS', JSON.stringify(selected));
});

afterAll(async () => {
  await pool?.end();
});

async function claimedWorld(suffix: string) {
  const world = worldId(`WORLD_F_NATIVE_CLAIM_${suffix}`);
  const command = `COMMAND_F_NATIVE_${suffix}`;
  await db().query('insert into world_v2.world_head(world_id) values($1)', [
    world,
  ]);
  await db().query(
    'select * from world_v2.acquire_world_writer_lease($1,$2,$3,1000)',
    [world, oldWorker, t0],
  );
  await db().query(
    `insert into world_v2.command_submission
    (world_id,command_id,idempotency_key,command_type,schema_version,canonical_payload,
     payload_sha256,command_fingerprint,auth_subject,actor_id,country_id,office_id,
     expected_world_version,sim_time,correlation_id,submitted_at_real)
    values($1,$2,$2,'F_TEST_ONLY_CLAIM','command-v1','{}',$3,$4,
      '00000000-0000-4000-8000-000000000001','ACTOR_F_TEST_ONLY',
      'COUNTRY_F_TEST_ONLY',null,0,10000,$2,$5)`,
    [
      world,
      command,
      `sha256:${'a'.repeat(64)}`,
      `sha256:${'b'.repeat(64)}`,
      t0,
    ],
  );
  await db().query(
    `insert into world_v2.command_queue
    (world_id,command_id,authority_kind,priority_rank,available_at_sim_time,attempt_count)
    values($1,$2,'VERSIONED_AUTOMATIC',0,10000,0)`,
    [world, command],
  );
  await db().query(
    `update world_v2.command_queue set queue_state='CLAIMED',
    attempt_count=1,claimed_by=$3,claimed_at_real=$4,claim_fencing_token=1
    where world_id=$1 and command_id=$2`,
    [world, command, oldWorker, t0],
  );
  const old = acquireWorldWriterLease(
    null,
    worldWriterLeaseRequest(world, oldWorker, t0, t1),
  );
  return { world, command, old };
}

async function footprint(world: string) {
  const tables = [
    'world_head',
    'command_submission',
    'authoritative_event',
    'command_receipt',
    'notification_outbox',
    'inventory_posting',
    'financial_posting_batch',
    'authoritative_commit_authorization',
    'current_commit_authorization',
    'event_consumer_receipt',
    'current_materialization',
  ] as const;
  const rows: Record<string, unknown> = {};
  for (const table of tables) {
    rows[table] = (
      await db().query(
        `select to_jsonb(f)::text as row from world_v2.${table} f
      where world_id=$1 order by to_jsonb(f)::text collate "C"`,
        [world],
      )
    ).rows;
  }
  return rows;
}

const queue = async (world: string) =>
  (
    await db().query(
      `select queue_state,claimed_by,
  attempt_count::text,claim_fencing_token::text from world_v2.command_queue where world_id=$1`,
      [world],
    )
  ).rows;
const coordinator = (holder: string) =>
  new WorldRecoveryCoordinator({ database: db(), workerId: holder });

describe.skipIf(!enabled)(
  'F native PG ordinary abandoned claim recovery, TEST_ONLY',
  () => {
    it('reconnects under higher fence, reclaims exactly once, and changes no economic facts', async () => {
      const f = await claimedWorld('RECOVER');
      const before = await footprint(f.world);
      await db().query(
        'select * from world_v2.acquire_world_writer_lease($1,$2,$3,60000)',
        [f.world, newWorker, t1],
      );
      const takeover = acquireWorldWriterLease(
        f.old.lease,
        worldWriterLeaseRequest(f.world, newWorker, t1, t61),
      );
      const assertion = createWorldWriterCommitAssertion(takeover.lease, '0');
      // Ordinary connection/host reconstruction, not a claimed OS crash test.
      await pool!.end();
      connect();
      await coordinator(newWorker).reclaimAbandonedCommand({
        assertion,
        commandId: f.command,
        observedAtReal: t2,
      });
      expect(await queue(f.world)).toEqual([
        {
          queue_state: 'CLAIMED',
          claimed_by: newWorker,
          attempt_count: '2',
          claim_fencing_token: '2',
        },
      ]);
      expect(await footprint(f.world)).toEqual(before);
      await expect(
        coordinator(newWorker).reclaimAbandonedCommand({
          assertion,
          commandId: f.command,
          observedAtReal: t2,
        }),
      ).rejects.toMatchObject({
        outcome: 'ROLLED_BACK',
        cause: {
          message: 'Current higher-fence lease does not supersede this claim',
        },
      });
      expect(await queue(f.world)).toEqual([
        {
          queue_state: 'CLAIMED',
          claimed_by: newWorker,
          attempt_count: '2',
          claim_fencing_token: '2',
        },
      ]);
      expect(await footprint(f.world)).toEqual(before);
      await expect(
        coordinator(oldWorker).reclaimAbandonedCommand({
          assertion: createWorldWriterCommitAssertion(f.old.lease, '0'),
          commandId: f.command,
          observedAtReal: t2,
        }),
      ).rejects.toMatchObject({
        outcome: 'ROLLED_BACK',
        cause: { message: 'WORLD_WRITER_FENCE_STALE' },
      });
      expect(await footprint(f.world)).toEqual(before);
      console.info(
        'F_NATIVE_RECOVERED_FACTS',
        JSON.stringify({ queue: await queue(f.world), footprint: before }),
      );
    });
    it('rejects recovery of a still-current claim without increasing attempts or mutating facts', async () => {
      const f = await claimedWorld('ACTIVE');
      const before = await footprint(f.world),
        claim = await queue(f.world);
      await expect(
        coordinator(oldWorker).reclaimAbandonedCommand({
          assertion: createWorldWriterCommitAssertion(f.old.lease, '0'),
          commandId: f.command,
          observedAtReal: t0,
        }),
      ).rejects.toMatchObject({
        outcome: 'ROLLED_BACK',
        cause: {
          message: 'Current higher-fence lease does not supersede this claim',
        },
      });
      expect(await queue(f.world)).toEqual(claim);
      expect(await footprint(f.world)).toEqual(before);
    });
  },
);
