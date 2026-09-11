import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from 'pg';

import {
  readMigrationGitProvenance,
  validateMigrationManifest,
} from './migration-policy.mjs';
import {
  V09_STAGING_MIGRATION_IDS,
  assertNoLinkedSupabaseProject,
  assertV09DedicatedStagingExecution,
} from './v09-staging-evidence-policy.mjs';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const RUN_MARKER_TABLE = 'v09_staging_run_marker';
const SQLSTATE_OBJECT_STATE = '55000';
const LINKED_PROJECT_PATH = path.join(
  repositoryRoot,
  'supabase/.temp/project-ref',
);

function identifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function failed(message) {
  throw new Error(`V09 dedicated staging runner failed closed: ${message}`);
}

function rows(result) {
  return Array.isArray(result?.rows) ? result.rows : [];
}

function asText(value) {
  return value === undefined || value === null ? '' : String(value);
}

function publicEvidence(approval, runId) {
  return {
    cleanup: { markerBound: false, status: 'NOT_ATTEMPTED' },
    marker: {
      namespace: approval.disposable_namespace,
      roles: { ...approval.roles },
      run_id: runId,
      target_fingerprint: approval.target_fingerprint,
    },
    migrations: [],
    secret_redacted: true,
    schema_version: 'V09_STAGING_EVIDENCE-1',
    status: 'RUNNING',
    steps: [],
  };
}

function publicFailure(stage) {
  return {
    cleanup: { markerBound: false, status: 'NOT_ATTEMPTED' },
    failure: { stage },
    migrations: [],
    secret_redacted: true,
    schema_version: 'V09_STAGING_EVIDENCE-1',
    status: 'FAIL_CLOSED',
    steps: [],
  };
}

async function readLinkedProjectRef() {
  try {
    return (await readFile(LINKED_PROJECT_PATH, 'utf8')).trim();
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

async function audited(evidence, id, operation) {
  const entry = { id, status: 'RUNNING' };
  evidence.steps.push(entry);
  try {
    const result = await operation();
    entry.status = 'PASS';
    return result;
  } catch (error) {
    entry.status = 'FAIL';
    throw error;
  }
}

async function command(client, step, text, values = []) {
  return client.execute({ step, text, values });
}

function assertRows(result, predicate, message) {
  if (!predicate(rows(result))) failed(message);
}

function assertLease(result, fencingToken, acquisitionKind, message) {
  const record = rows(result)[0];
  if (
    asText(record?.fencing_token) !== String(fencingToken) ||
    record?.acquisition_kind !== acquisitionKind
  ) {
    failed(message);
  }
}

function expectedDatabaseFailure(error, expectedMessage) {
  return (
    error &&
    typeof error === 'object' &&
    error.code === SQLSTATE_OBJECT_STATE &&
    asText(error.message).includes(expectedMessage)
  );
}

async function expectRejected(client, step, text, values, expectedMessage) {
  const savepoint = `v09_${step.toLowerCase()}`;
  await command(client, `${step}_SAVEPOINT`, `savepoint ${savepoint}`);
  try {
    await command(client, step, text, values);
  } catch (error) {
    if (!expectedDatabaseFailure(error, expectedMessage)) throw error;
    await command(
      client,
      `${step}_ROLLBACK`,
      `rollback to savepoint ${savepoint}`,
    );
    await command(client, `${step}_RELEASE`, `release savepoint ${savepoint}`);
    return;
  }
  await command(client, `${step}_RELEASE`, `release savepoint ${savepoint}`);
  failed(`${step} unexpectedly succeeded`);
}

export function createPgStagingClient({ connectionString }) {
  // This factory is intentionally called only after policy validation returns.
  const client = new Client({ connectionString });
  return Object.freeze({
    async connect() {
      await client.connect();
    },
    async end() {
      await client.end();
    },
    async execute({ text, values }) {
      return client.query(text, values);
    },
  });
}

export async function loadV09StagingMigrationChain() {
  const manifest = JSON.parse(
    await readFile(
      path.join(repositoryRoot, 'database/migrations/manifest.json'),
      'utf8',
    ),
  );
  const migrations = Array.isArray(manifest.migrations)
    ? manifest.migrations
    : [];
  if (
    migrations.length !== V09_STAGING_MIGRATION_IDS.length ||
    migrations.some(
      (migration, index) =>
        migration.migration_id !== V09_STAGING_MIGRATION_IDS[index],
    )
  ) {
    failed('the runner accepts only the exact branch-local 0001–0006 chain');
  }
  const artifacts = new Map();
  for (const migration of migrations) {
    artifacts.set(
      migration.path,
      await readFile(path.join(repositoryRoot, migration.path)),
    );
  }
  const provenance = await readMigrationGitProvenance(
    repositoryRoot,
    migrations,
  );
  const validation = validateMigrationManifest(manifest, artifacts, provenance);
  if (validation.status !== 'PASS') {
    failed('local migration provenance validation failed');
  }
  return migrations.map((migration) =>
    Object.freeze({
      artifact_sha256: migration.sha256,
      migration_id: migration.migration_id,
      source_repo_commit: migration.artifact_source_commit,
      sql: artifacts.get(migration.path).toString('utf8'),
    }),
  );
}

async function preflightPristine(client, approval) {
  const namespace = await command(
    client,
    'PRECHECK_NAMESPACE_ABSENT',
    'select exists(select 1 from pg_namespace where nspname = $1) as exists',
    [approval.disposable_namespace],
  );
  assertRows(
    namespace,
    ([record]) => record?.exists === false,
    'refusing to reuse a pre-existing disposable namespace',
  );
  const roles = await command(
    client,
    'PRECHECK_ROLES_ABSENT',
    'select rolname from pg_roles where rolname = any($1::text[])',
    [Object.values(approval.roles)],
  );
  assertRows(
    roles,
    (records) => records.length === 0,
    'refusing to reuse pre-existing dedicated staging roles',
  );
}

async function provisionMarker(client, approval, runId) {
  const schema = identifier(approval.disposable_namespace);
  const { migration_owner: owner, reader, worker } = approval.roles;
  for (const role of [owner, worker, reader]) {
    await command(
      client,
      `CREATE_ROLE_${role.toUpperCase()}`,
      `create role ${identifier(role)} nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls`,
    );
    await command(
      client,
      `GRANT_${role.toUpperCase()}_TO_ADMIN`,
      `grant ${identifier(role)} to current_user`,
    );
  }
  await command(
    client,
    'CREATE_DISPOSABLE_NAMESPACE',
    `create schema ${schema} authorization ${identifier(owner)}`,
  );
  await command(
    client,
    'SET_MIGRATION_OWNER',
    `set local role ${identifier(owner)}`,
  );
  await command(
    client,
    'CREATE_RUN_MARKER_TABLE',
    `create table ${schema}.${identifier(RUN_MARKER_TABLE)} (
       run_id text primary key,
       target_fingerprint text not null,
       migration_owner text not null,
       worker_role text not null,
       reader_role text not null
     )`,
  );
  await command(
    client,
    'WRITE_RUN_MARKER',
    `insert into ${schema}.${identifier(RUN_MARKER_TABLE)}
       (run_id, target_fingerprint, migration_owner, worker_role, reader_role)
     values ($1, $2, $3, $4, $5)`,
    [runId, approval.target_fingerprint, owner, worker, reader],
  );
}

async function applyMigrations(client, approval, migrations, evidence) {
  const schema = identifier(approval.disposable_namespace);
  for (const migration of migrations) {
    await command(
      client,
      `APPLY_MIGRATION_${migration.migration_id.toUpperCase()}`,
      migration.sql,
    );
    await command(
      client,
      `RECORD_MIGRATION_${migration.migration_id.toUpperCase()}`,
      `insert into ${schema}.schema_release
         (migration_id, artifact_sha256, source_repo_commit, release_order)
       values ($1, $2, $3, $4)`,
      [
        migration.migration_id,
        migration.artifact_sha256,
        migration.source_repo_commit,
        evidence.migrations.length + 1,
      ],
    );
    evidence.migrations.push(migration.migration_id);
  }
}

async function configureOwnershipGrantsAndRls(client, approval) {
  const schema = identifier(approval.disposable_namespace);
  const { migration_owner: owner, reader, worker } = approval.roles;
  await command(
    client,
    'REVOKE_PUBLIC_SCHEMA',
    `revoke all on schema ${schema} from public`,
  );
  await command(
    client,
    'REVOKE_PUBLIC_TABLES',
    `revoke all on all tables in schema ${schema} from public`,
  );
  await command(
    client,
    'REVOKE_PUBLIC_FUNCTIONS',
    `revoke all on all functions in schema ${schema} from public`,
  );
  await command(
    client,
    'GRANT_SCHEMA_USAGE',
    `grant usage on schema ${schema} to ${identifier(worker)}, ${identifier(reader)}`,
  );
  await command(
    client,
    'GRANT_WORKER_LEASE_ACCESS',
    `grant select, insert, update on table ${schema}.world_head, ${schema}.world_writer_lease to ${identifier(worker)}`,
  );
  await command(
    client,
    'GRANT_WORKER_GUARDS',
    `grant execute on function
       ${schema}.acquire_world_writer_lease(text, text, timestamptz, bigint),
       ${schema}.assert_world_writer_commit_guard(text, text, bigint, bigint, timestamptz)
       to ${identifier(worker)}`,
  );
  await command(
    client,
    'GRANT_READER_READ_ONLY',
    `grant select on table ${schema}.world_head, ${schema}.world_writer_lease to ${identifier(reader)}`,
  );
  for (const table of ['world_head', 'world_writer_lease']) {
    await command(
      client,
      `ENABLE_FORCE_RLS_${table.toUpperCase()}`,
      `alter table ${schema}.${identifier(table)} enable row level security;
       alter table ${schema}.${identifier(table)} force row level security`,
    );
  }
  await command(
    client,
    'CREATE_RLS_POLICIES',
    `create policy v09_staging_owner_world_head on ${schema}.world_head
       for all to ${identifier(owner)} using (true) with check (true);
     create policy v09_staging_owner_lease on ${schema}.world_writer_lease
       for all to ${identifier(owner)} using (true) with check (true);
     create policy v09_staging_worker_world_head on ${schema}.world_head
       for all to ${identifier(worker)} using (true) with check (true);
     create policy v09_staging_worker_lease_select on ${schema}.world_writer_lease
       for select to ${identifier(worker)} using (true);
     create policy v09_staging_worker_lease_insert on ${schema}.world_writer_lease
       for insert to ${identifier(worker)} with check (true);
     create policy v09_staging_worker_lease_update on ${schema}.world_writer_lease
       for update to ${identifier(worker)} using (true) with check (true);
     create policy v09_staging_reader_world_head on ${schema}.world_head
       for select to ${identifier(reader)} using (true);
     create policy v09_staging_reader_lease on ${schema}.world_writer_lease
       for select to ${identifier(reader)} using (true)`,
  );
  const matrix = await command(
    client,
    'VERIFY_OWNERSHIP_GRANTS_RLS',
    `select
       n.nspowner::regrole::text as schema_owner,
       bool_and(c.relrowsecurity and c.relforcerowsecurity) as rls_forced,
       has_table_privilege($1, '${approval.disposable_namespace}.world_writer_lease', 'SELECT, INSERT, UPDATE, DELETE') as owner_write,
       has_table_privilege($2, '${approval.disposable_namespace}.world_writer_lease', 'DELETE') as worker_delete,
       has_table_privilege($3, '${approval.disposable_namespace}.world_writer_lease', 'INSERT, UPDATE, DELETE') as reader_write
     from pg_namespace n
     join pg_class c on c.relnamespace = n.oid
    where n.nspname = $4 and c.relname = any(array['world_head', 'world_writer_lease'])`,
    [owner, worker, reader, approval.disposable_namespace],
  );
  assertRows(
    matrix,
    ([record]) =>
      record?.schema_owner === approval.roles.migration_owner &&
      record?.rls_forced === true &&
      record?.owner_write === true &&
      record?.worker_delete === false &&
      record?.reader_write === false,
    'ownership, grant or RLS matrix does not match the dedicated staging contract',
  );
}

async function withRole(client, role, label, operation) {
  await command(client, `${label}_SET_ROLE`, `set role ${identifier(role)}`);
  try {
    return await operation();
  } finally {
    await command(client, `${label}_RESET_ROLE`, 'reset role');
  }
}

async function verifyRoleBoundaries(client, approval) {
  const table = `${approval.disposable_namespace}.world_writer_lease`;
  const worker = await withRole(
    client,
    approval.roles.worker,
    'VERIFY_WORKER',
    () =>
      command(
        client,
        'VERIFY_WORKER_LEAST_PRIVILEGE',
        `select
           has_table_privilege(current_user, $1, 'INSERT, UPDATE') as can_write,
           has_table_privilege(current_user, $1, 'DELETE') as can_delete,
           row_security_active($1::regclass) as rls_active`,
        [table],
      ),
  );
  assertRows(
    worker,
    ([record]) =>
      record?.can_write === true &&
      record?.can_delete === false &&
      record?.rls_active === true,
    'Worker role is not constrained to its least-privilege lease surface',
  );
  const reader = await withRole(
    client,
    approval.roles.reader,
    'VERIFY_READER',
    () =>
      command(
        client,
        'VERIFY_READER_READ_ONLY',
        `select
           has_table_privilege(current_user, $1, 'SELECT') as can_read,
           has_table_privilege(current_user, $1, 'INSERT, UPDATE, DELETE') as can_write,
           row_security_active($1::regclass) as rls_active`,
        [table],
      ),
  );
  assertRows(
    reader,
    ([record]) =>
      record?.can_read === true &&
      record?.can_write === false &&
      record?.rls_active === true,
    'Reader role is not read-only under the dedicated RLS boundary',
  );
}

async function runLeaseEvidence(client, approval) {
  const schema = identifier(approval.disposable_namespace);
  await command(
    client,
    'SEED_LEASE_WORLDS',
    `insert into ${schema}.world_head (world_id)
     values ('WORLD_STAGING_LEASE'), ('WORLD_STAGING_CRASH_BEFORE'), ('WORLD_STAGING_CRASH_AFTER')`,
  );
  assertLease(
    await command(
      client,
      'LEASE_ACQUIRE',
      `select fencing_token::text as fencing_token, acquisition_kind
         from ${schema}.acquire_world_writer_lease($1, $2, $3::timestamptz, $4::bigint)`,
      ['WORLD_STAGING_LEASE', 'WORKER_1', '2026-09-11T00:00:00.000Z', '1000'],
    ),
    1,
    'ACQUIRED',
    'initial lease acquisition did not yield fence 1',
  );
  assertLease(
    await command(
      client,
      'LEASE_RENEW',
      `select fencing_token::text as fencing_token, acquisition_kind
         from ${schema}.acquire_world_writer_lease($1, $2, $3::timestamptz, $4::bigint)`,
      ['WORLD_STAGING_LEASE', 'WORKER_1', '2026-09-11T00:00:00.500Z', '1000'],
    ),
    1,
    'RENEWED',
    'lease renewal did not preserve fence 1',
  );
  await expectRejected(
    client,
    'LEASE_ACTIVE_SECOND_WRITER_REJECTED',
    `select * from ${schema}.acquire_world_writer_lease($1, $2, $3::timestamptz, $4::bigint)`,
    ['WORLD_STAGING_LEASE', 'WORKER_2', '2026-09-11T00:00:00.750Z', '1000'],
    'WORLD_WRITER_LEASE_HELD',
  );
  await expectRejected(
    client,
    'LEASE_DELETE_REJECTED',
    `delete from ${schema}.world_writer_lease where world_id = $1`,
    ['WORLD_STAGING_LEASE'],
    'DELETE is forbidden',
  );
  await expectRejected(
    client,
    'LEASE_TRUNCATE_REJECTED',
    `truncate ${schema}.world_writer_lease`,
    [],
    'TRUNCATE is forbidden',
  );
  assertLease(
    await command(
      client,
      'LEASE_EXPIRED_TAKEOVER',
      `select fencing_token::text as fencing_token, acquisition_kind
         from ${schema}.acquire_world_writer_lease($1, $2, $3::timestamptz, $4::bigint)`,
      ['WORLD_STAGING_LEASE', 'WORKER_2', '2026-09-11T00:00:01.500Z', '1000'],
    ),
    2,
    'TAKEN_OVER',
    'expired lease takeover did not yield fence 2',
  );
  await expectRejected(
    client,
    'LEASE_OLD_FENCE_REJECTED',
    `select * from ${schema}.assert_world_writer_commit_guard($1, $2, $3::bigint, $4::bigint, $5::timestamptz)`,
    ['WORLD_STAGING_LEASE', 'WORKER_1', '1', '0', '2026-09-11T00:00:01.500Z'],
    'WORLD_WRITER_FENCE_STALE',
  );
}

async function createCrashClient(clientFactory, connectionString) {
  const client = await clientFactory({ connectionString });
  await client.connect();
  return client;
}

async function runCrashProtocol(
  mainClient,
  clientFactory,
  connectionString,
  approval,
) {
  const schema = identifier(approval.disposable_namespace);
  const worker = approval.roles.worker;
  const beforeCommit = await createCrashClient(clientFactory, connectionString);
  try {
    await withRole(beforeCommit, worker, 'CRASH_BEFORE', async () => {
      await command(beforeCommit, 'CRASH_BEFORE_BEGIN', 'begin');
      assertLease(
        await command(
          beforeCommit,
          'CRASH_BEFORE_ACQUIRE',
          `select fencing_token::text as fencing_token, acquisition_kind
             from ${schema}.acquire_world_writer_lease($1, $2, $3::timestamptz, $4::bigint)`,
          [
            'WORLD_STAGING_CRASH_BEFORE',
            'WORKER_CRASHED',
            '2026-09-11T00:00:00.000Z',
            '1000',
          ],
        ),
        1,
        'ACQUIRED',
        'connection-loss setup did not acquire fence 1',
      );
    });
  } finally {
    // No commit: closing this client is the connection-loss / rollback protocol.
    await beforeCommit.end();
  }
  await withRole(mainClient, worker, 'CRASH_BEFORE_RECOVERY', async () => {
    assertLease(
      await command(
        mainClient,
        'CRASH_BEFORE_RECOVERY',
        `select fencing_token::text as fencing_token, acquisition_kind
           from ${schema}.acquire_world_writer_lease($1, $2, $3::timestamptz, $4::bigint)`,
        [
          'WORLD_STAGING_CRASH_BEFORE',
          'WORKER_RECOVERED',
          '2026-09-11T00:00:00.000Z',
          '1000',
        ],
      ),
      1,
      'ACQUIRED',
      'connection loss before commit did not roll back the lease',
    );
  });

  const afterCommit = await createCrashClient(clientFactory, connectionString);
  try {
    await withRole(afterCommit, worker, 'CRASH_AFTER', async () => {
      assertLease(
        await command(
          afterCommit,
          'CRASH_AFTER_ACQUIRE',
          `select fencing_token::text as fencing_token, acquisition_kind
             from ${schema}.acquire_world_writer_lease($1, $2, $3::timestamptz, $4::bigint)`,
          [
            'WORLD_STAGING_CRASH_AFTER',
            'WORKER_1',
            '2026-09-11T00:00:00.000Z',
            '1000',
          ],
        ),
        1,
        'ACQUIRED',
        'post-commit crash case did not acquire fence 1',
      );
    });
  } finally {
    // The acquisition committed in autocommit mode; only acknowledgement was lost.
    await afterCommit.end();
  }
  await withRole(mainClient, worker, 'CRASH_AFTER_HELD', () =>
    expectRejected(
      mainClient,
      'CRASH_AFTER_HELD_REJECTED',
      `select * from ${schema}.acquire_world_writer_lease($1, $2, $3::timestamptz, $4::bigint)`,
      [
        'WORLD_STAGING_CRASH_AFTER',
        'WORKER_2',
        '2026-09-11T00:00:00.500Z',
        '1000',
      ],
      'WORLD_WRITER_LEASE_HELD',
    ),
  );
  await withRole(mainClient, worker, 'CRASH_AFTER_TAKEOVER', async () => {
    assertLease(
      await command(
        mainClient,
        'CRASH_AFTER_TAKEOVER',
        `select fencing_token::text as fencing_token, acquisition_kind
           from ${schema}.acquire_world_writer_lease($1, $2, $3::timestamptz, $4::bigint)`,
        [
          'WORLD_STAGING_CRASH_AFTER',
          'WORKER_2',
          '2026-09-11T00:00:01.000Z',
          '1000',
        ],
      ),
      2,
      'TAKEN_OVER',
      'post-commit recovery did not preserve fencing lineage',
    );
  });
  await withRole(mainClient, worker, 'CRASH_AFTER_OLD_FENCE', () =>
    expectRejected(
      mainClient,
      'CRASH_AFTER_OLD_FENCE_REJECTED',
      `select * from ${schema}.assert_world_writer_commit_guard($1, $2, $3::bigint, $4::bigint, $5::timestamptz)`,
      [
        'WORLD_STAGING_CRASH_AFTER',
        'WORKER_1',
        '1',
        '0',
        '2026-09-11T00:00:01.000Z',
      ],
      'WORLD_WRITER_FENCE_STALE',
    ),
  );
}

async function cleanupMarkedBoundary(client, approval, evidence) {
  const schema = identifier(approval.disposable_namespace);
  const { migration_owner: owner, reader, worker } = approval.roles;
  evidence.cleanup.status = 'RUNNING';
  try {
    await command(client, 'CLEANUP_BEGIN', 'begin');
    await command(
      client,
      'CLEANUP_SET_MIGRATION_OWNER',
      `set local role ${identifier(owner)}`,
    );
    const marker = await command(
      client,
      'CLEANUP_VERIFY_MARKER',
      `select run_id, target_fingerprint, migration_owner, worker_role, reader_role
         from ${schema}.${identifier(RUN_MARKER_TABLE)}
        where run_id = $1 for update`,
      [evidence.marker.run_id],
    );
    assertRows(
      marker,
      ([record]) =>
        record?.target_fingerprint === approval.target_fingerprint &&
        record?.migration_owner === owner &&
        record?.worker_role === worker &&
        record?.reader_role === reader,
      'cleanup marker does not bind this exact disposable run',
    );
    const ownership = await command(
      client,
      'CLEANUP_VERIFY_SCHEMA_OWNERSHIP',
      `with namespace_objects as (
         select c.relowner as object_owner
           from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = $1
         union all
         select p.proowner as object_owner
           from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = $1
         union all
         select t.typowner as object_owner
           from pg_type t
           join pg_namespace n on n.oid = t.typnamespace
          where n.nspname = $1
       )
       select n.nspowner::regrole::text as schema_owner,
              bool_and(o.object_owner::regrole::text = $2) as all_objects_owned
         from pg_namespace n
         join namespace_objects o on true
        where n.nspname = $1
        group by n.nspowner`,
      [approval.disposable_namespace, owner],
    );
    assertRows(
      ownership,
      ([record]) =>
        record?.schema_owner === owner && record?.all_objects_owned === true,
      'cleanup refuses a namespace that includes non-run-owned objects',
    );
    const externalDependents = await command(
      client,
      'CLEANUP_VERIFY_NO_EXTERNAL_DEPENDENTS',
      `with run_objects as (
         select 'pg_class'::regclass as class_id, c.oid as object_id
           from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = $1
         union all
         select 'pg_proc'::regclass as class_id, p.oid as object_id
           from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = $1
         union all
         select 'pg_type'::regclass as class_id, t.oid as object_id
           from pg_type t
           join pg_namespace n on n.oid = t.typnamespace
          where n.nspname = $1
       ), external_user_dependents as (
         select distinct n.nspname as namespace
           from pg_depend d
           join run_objects r
             on r.class_id = d.refclassid and r.object_id = d.refobjid
           join pg_class c
             on d.classid = 'pg_class'::regclass and c.oid = d.objid
           join pg_namespace n on n.oid = c.relnamespace
          where n.nspname <> $1 and n.nspname <> 'information_schema'
            and n.nspname !~ '^pg_'
         union
         select distinct n.nspname as namespace
           from pg_depend d
           join run_objects r
             on r.class_id = d.refclassid and r.object_id = d.refobjid
           join pg_attrdef default_value
             on d.classid = 'pg_attrdef'::regclass and default_value.oid = d.objid
           join pg_class relation on relation.oid = default_value.adrelid
           join pg_namespace n on n.oid = relation.relnamespace
          where n.nspname <> $1 and n.nspname <> 'information_schema'
            and n.nspname !~ '^pg_'
         union
         select distinct n.nspname as namespace
           from pg_depend d
           join run_objects r
             on r.class_id = d.refclassid and r.object_id = d.refobjid
           join pg_policy policy
             on d.classid = 'pg_policy'::regclass and policy.oid = d.objid
           join pg_class relation on relation.oid = policy.polrelid
           join pg_namespace n on n.oid = relation.relnamespace
          where n.nspname <> $1 and n.nspname <> 'information_schema'
            and n.nspname !~ '^pg_'
         union
         select distinct n.nspname as namespace
           from pg_depend d
           join run_objects r
             on r.class_id = d.refclassid and r.object_id = d.refobjid
           join pg_proc p
             on d.classid = 'pg_proc'::regclass and p.oid = d.objid
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname <> $1 and n.nspname <> 'information_schema'
            and n.nspname !~ '^pg_'
         union
         select distinct n.nspname as namespace
           from pg_depend d
           join run_objects r
             on r.class_id = d.refclassid and r.object_id = d.refobjid
           join pg_type t
             on d.classid = 'pg_type'::regclass and t.oid = d.objid
           join pg_namespace n on n.oid = t.typnamespace
          where n.nspname <> $1 and n.nspname <> 'information_schema'
            and n.nspname !~ '^pg_'
         union
         select distinct n.nspname as namespace
           from pg_depend d
           join run_objects r
             on r.class_id = d.refclassid and r.object_id = d.refobjid
           join pg_constraint c
             on d.classid = 'pg_constraint'::regclass and c.oid = d.objid
           join pg_class relation on relation.oid = c.conrelid
           join pg_namespace n on n.oid = relation.relnamespace
          where n.nspname <> $1 and n.nspname <> 'information_schema'
            and n.nspname !~ '^pg_'
         union
         select distinct n.nspname as namespace
           from pg_depend d
           join run_objects r
             on r.class_id = d.refclassid and r.object_id = d.refobjid
           join pg_rewrite rewrite
             on d.classid = 'pg_rewrite'::regclass and rewrite.oid = d.objid
           join pg_class relation on relation.oid = rewrite.ev_class
           join pg_namespace n on n.oid = relation.relnamespace
          where n.nspname <> $1 and n.nspname <> 'information_schema'
            and n.nspname !~ '^pg_'
         union
         select distinct n.nspname as namespace
           from pg_depend d
           join run_objects r
             on r.class_id = d.refclassid and r.object_id = d.refobjid
           join pg_trigger trigger
             on d.classid = 'pg_trigger'::regclass and trigger.oid = d.objid
           join pg_class relation on relation.oid = trigger.tgrelid
           join pg_namespace n on n.oid = relation.relnamespace
          where n.nspname <> $1 and n.nspname <> 'information_schema'
            and n.nspname !~ '^pg_'
       )
       select coalesce(array_agg(namespace order by namespace), array[]::text[])
         as namespaces
         from external_user_dependents`,
      [approval.disposable_namespace],
    );
    assertRows(
      externalDependents,
      ([record]) =>
        Array.isArray(record?.namespaces) && record.namespaces.length === 0,
      'cleanup refuses to cascade into an object outside this run namespace',
    );
    await command(
      client,
      'CLEANUP_DROP_EXACT_SCHEMA',
      `drop schema ${schema} cascade`,
    );
    await command(client, 'CLEANUP_RESET_ROLE', 'reset role');
    for (const role of [owner, worker, reader]) {
      await command(
        client,
        `CLEANUP_REVOKE_${role.toUpperCase()}_FROM_ADMIN`,
        `revoke ${identifier(role)} from current_user`,
      );
    }
    for (const role of [owner, worker, reader]) {
      await command(
        client,
        `CLEANUP_DROP_ROLE_${role.toUpperCase()}`,
        `drop role ${identifier(role)}`,
      );
    }
    await command(client, 'CLEANUP_COMMIT', 'commit');
    evidence.cleanup.status = 'PASS';
  } catch (error) {
    await command(client, 'CLEANUP_ROLLBACK', 'rollback').catch(
      () => undefined,
    );
    evidence.cleanup.status = 'FAIL';
    throw error;
  }
}

/**
 * Executes a dedicated, owner-contract-bound evidence run. The caller controls
 * the client factory so unit tests can inject a fake client; the default real
 * factory is invoked only after policy validation has completely passed.
 */
export async function runV09DedicatedStagingEvidence({
  approval,
  clientFactory = createPgStagingClient,
  environment = process.env,
  loadLinkedProjectRef = readLinkedProjectRef,
  loadMigrationChain = loadV09StagingMigrationChain,
  runId = randomUUID(),
}) {
  let authorized;
  try {
    authorized = assertV09DedicatedStagingExecution(environment, approval);
  } catch {
    return publicFailure('POLICY_REJECTED');
  }

  const evidence = publicEvidence(authorized.approval, runId);
  try {
    await audited(evidence, 'LINKED_PROJECT_PRECHECK', async () => {
      assertNoLinkedSupabaseProject(await loadLinkedProjectRef());
    });
  } catch {
    evidence.status = 'FAIL_CLOSED';
    evidence.failure = { stage: 'LINKED_PROJECT_PRECHECK' };
    return evidence;
  }

  let migrations;
  try {
    migrations = await audited(evidence, 'LOCAL_MANIFEST', loadMigrationChain);
  } catch {
    evidence.status = 'FAIL_CLOSED';
    evidence.failure = { stage: 'LOCAL_MANIFEST' };
    return evidence;
  }

  let client;
  let cleanupRequired = false;
  let commitAttempted = false;
  let transactionCommitted = false;
  let transactionOpen = false;
  let markerWritten = false;
  try {
    client = await audited(evidence, 'CREATE_CLIENT', () =>
      clientFactory({ connectionString: authorized.connectionString }),
    );
    await audited(evidence, 'CONNECT', () => client.connect());
    await audited(evidence, 'VERIFY_CONNECTED_ADMIN', async () => {
      const identity = await command(
        client,
        'VERIFY_CONNECTED_ADMIN_ROLE',
        'select current_user as current_user',
      );
      assertRows(
        identity,
        ([record]) =>
          record?.current_user === authorized.approval.admin_database_role,
        'connected database role differs from the owner-approved admin role',
      );
    });
    await audited(evidence, 'PRISTINE_BOUNDARY', () =>
      preflightPristine(client, authorized.approval),
    );
    await audited(evidence, 'BEGIN_TRANSACTION', async () => {
      await command(client, 'BEGIN_EVIDENCE_TRANSACTION', 'begin');
      transactionOpen = true;
      await command(
        client,
        'SET_LOCK_TIMEOUT',
        "set local lock_timeout = '5s'",
      );
      await command(
        client,
        'SET_STATEMENT_TIMEOUT',
        "set local statement_timeout = '30s'",
      );
    });
    await audited(evidence, 'PROVISION_MARKER', async () => {
      await provisionMarker(client, authorized.approval, runId);
      markerWritten = true;
      evidence.cleanup.markerBound = true;
    });
    await audited(evidence, 'APPLY_MIGRATIONS', () =>
      applyMigrations(client, authorized.approval, migrations, evidence),
    );
    await audited(evidence, 'LEASE_EVIDENCE', () =>
      runLeaseEvidence(client, authorized.approval),
    );
    await audited(evidence, 'OWNERSHIP_GRANTS_RLS', () =>
      configureOwnershipGrantsAndRls(client, authorized.approval),
    );
    await audited(evidence, 'COMMIT_TRANSACTION', async () => {
      commitAttempted = true;
      await command(client, 'COMMIT_EVIDENCE_TRANSACTION', 'commit');
      transactionOpen = false;
      transactionCommitted = true;
      cleanupRequired = markerWritten;
    });
    await audited(evidence, 'ROLE_BOUNDARY_EVIDENCE', () =>
      verifyRoleBoundaries(client, authorized.approval),
    );
    await audited(evidence, 'CRASH_CONNECTION_LOSS', () =>
      runCrashProtocol(
        client,
        clientFactory,
        authorized.connectionString,
        authorized.approval,
      ),
    );
    evidence.status = 'PASS';
  } catch {
    evidence.status = 'FAIL_CLOSED';
    evidence.failure = {
      stage: evidence.steps.at(-1)?.id ?? 'UNKNOWN',
    };
    if (client && transactionOpen) {
      const rollbackConfirmed = await command(
        client,
        'ROLLBACK_AFTER_FAILURE',
        'rollback',
      ).then(
        () => true,
        () => false,
      );
      if (markerWritten && !commitAttempted && rollbackConfirmed) {
        evidence.cleanup.status = 'TRANSACTION_ROLLED_BACK';
      }
      if (markerWritten && (!rollbackConfirmed || commitAttempted)) {
        cleanupRequired = true;
      }
    } else if (markerWritten && (transactionCommitted || commitAttempted)) {
      cleanupRequired = true;
    }
  } finally {
    if (client) {
      try {
        await audited(evidence, 'END_PRIMARY_CLIENT', () => client.end());
      } catch {
        evidence.status = 'FAIL_CLOSED';
        evidence.failure = { stage: 'CLIENT_CLOSE' };
      }
    }
    if (cleanupRequired) {
      let cleanupClient;
      try {
        cleanupClient = await audited(evidence, 'CREATE_CLEANUP_CLIENT', () =>
          clientFactory({ connectionString: authorized.connectionString }),
        );
        await audited(evidence, 'CONNECT_CLEANUP_CLIENT', () =>
          cleanupClient.connect(),
        );
        await audited(evidence, 'CLEANUP_MARKED_BOUNDARY', () =>
          cleanupMarkedBoundary(cleanupClient, authorized.approval, evidence),
        );
      } catch {
        evidence.status = 'FAIL_CLOSED';
        evidence.failure = { stage: 'CLEANUP' };
      } finally {
        if (cleanupClient) {
          try {
            await audited(evidence, 'END_CLEANUP_CLIENT', () =>
              cleanupClient.end(),
            );
          } catch {
            evidence.status = 'FAIL_CLOSED';
            evidence.failure = { stage: 'CLEANUP_CLIENT_CLOSE' };
          }
        }
      }
    }
  }
  return evidence;
}
