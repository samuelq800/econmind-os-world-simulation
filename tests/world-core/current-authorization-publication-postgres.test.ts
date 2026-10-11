// TEST_ONLY actual-schema oracle. Positive DML below is NOT a product writer.
import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PostgresSqlDatabase,
  PostgresTransactionError,
} from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
import { parseAuthorizationSourceBytes } from '../../apps/world-worker/src/preparation/current-authorization-source-contract.js';
import {
  authorizationSliceFingerprint,
  classifyAuthorizationPublicationFailure,
  compareAuthorizationPublicationReadback,
  planAuthorizationReplacement,
  type AuthorizationRowData,
  type AuthorizationPublicationCheckpoint,
} from '../../apps/world-worker/src/preparation/current-authorization-publication-preparation.js';
import { loadFrozenRenewalMigrationFixture } from '../support/renewal-frozen-migration-fixture.js';
import { snapshotStorageFixtureSql } from '../support/snapshot-storage-fixture.js';
import {
  sourceBytes,
  TEST_COUNTRIES,
  TEST_NOW,
  TEST_SUBJECT,
} from '../support/current-authorization-preparation-fixture.js';

const suite = process.env.AUTHZ_PREPARATION_NATIVE_MARKER
  ? describe
  : describe.skip;
const PROBE = 'a_authz_test_only_probe';
const ORACLE = 'a_authz_test_only_oracle';
let admin: Pool;
let probe: Pool;
let oracle: Pool;
let database: PostgresSqlDatabase;
const root = path.resolve(import.meta.dirname, '../..');
const empty = authorizationSliceFingerprint([]);
const functionCall =
  'select world_v2.apply_current_authorization_change($1,$2,$3::bigint,$4)';
const args = (world: string) => [
  world,
  'TEST_ONLY_UNREGISTERED_REF',
  '0',
  empty,
];
const bytes = (
  world: string,
  revision = 'TEST_ONLY_REV_1',
  pred: string | null = null,
  rows: readonly AuthorizationRowData[] = [],
  overrides: Record<string, unknown> = {},
) => sourceBytes(revision, pred, rows, { worldId: world, ...overrides });

async function rows(sql: SqlExecutor, world: string, lock = false) {
  return (
    await sql.query<AuthorizationRowData>(
      `
    select world_id as "worldId",auth_subject::text as "authSubject",country_id as "countryId",
      office_id as "officeId",capability,team_id as "teamId",
      authorization_version as "authorizationVersion",active
    from world_v2.current_commit_authorization where world_id=$1 and auth_subject=$2::uuid
    order by country_id collate "C",office_id collate "C",capability collate "C" ${lock ? 'for update' : ''}`,
      [world, TEST_SUBJECT],
    )
  ).rows;
}
async function checkpoint(sql: SqlExecutor, world: string, lock = false) {
  return (
    (
      await sql.query<AuthorizationPublicationCheckpoint>(
        `
    select world_id as "worldId",auth_subject::text as "authSubject",
      source_owner_ref as "sourceOwnerRef",source_registration_id as "sourceRegistrationId",
      source_record_ref as "sourceRecordRef",source_schema_version as "sourceSchemaVersion",
      source_sha256 as "sourceSha256",source_revision as "sourceRevision",
      predecessor_revision as "predecessorRevision",operation_id as "operationId",
      expected_world_version::text as "expectedWorldVersion",
      expected_before_fingerprint as "expectedBeforeSemanticFingerprint",after_fingerprint as "afterFingerprint"
    from world_v2.current_authorization_publication_checkpoint
    where world_id=$1 and auth_subject=$2::uuid ${lock ? 'for update' : ''}`,
        [world, TEST_SUBJECT],
      )
    ).rows[0] ?? null
  );
}
async function authSnapshot(world: string) {
  return (
    await admin.query(
      `select
    (select coalesce(jsonb_agg(to_jsonb(a) order by country_id,office_id,capability),'[]')
      from world_v2.current_commit_authorization a where world_id=$1) as a,
    (select coalesce(jsonb_agg(to_jsonb(c)),'[]')
      from world_v2.current_authorization_publication_checkpoint c where world_id=$1) as c`,
      [world],
    )
  ).rows;
}
async function footprint() {
  const tables = await admin.query<{ tablename: string }>(
    "select tablename from pg_catalog.pg_tables where schemaname='world_v2' and tablename not in ('current_commit_authorization','current_authorization_publication_checkpoint') order by tablename",
  );
  const result: Record<string, unknown> = {};
  for (const { tablename } of tables.rows) {
    if (!/^[a-z0-9_]+$/u.test(tablename))
      throw Error('TEST_TABLE_NAME_INVALID');
    result[tablename] = (
      await admin.query(
        `select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') as value from world_v2."${tablename}" t`,
      )
    ).rows[0].value;
  }
  return result;
}
async function addWorld(name: string) {
  await admin.query('insert into world_v2.world_head(world_id) values($1)', [
    name,
  ]);
}
/** Only TEST_ONLY oracle login uses this local fixture. Not exported, no routes,
 * config or actual ADMIN/registered-source callback; never a publication permit.
 */
async function fixtureApply(
  input: ReturnType<typeof sourceBytes>,
  options: { failC?: boolean; failAfterFirst?: boolean; at?: string } = {},
) {
  const source = parseAuthorizationSourceBytes(
    input.rawBytes,
    input.expectedSha256,
  );
  return database.transaction(async (sql) => {
    await sql.query('set transaction isolation level read committed');
    const h = await sql.query<{ world_version: string }>(
      'select world_version::text from world_v2.world_head where world_id=$1 for update',
      [source.worldId],
    );
    const c = await checkpoint(sql, source.worldId, true);
    const before = await rows(sql, source.worldId, true);
    const plan = planAuthorizationReplacement({
      ...input,
      headVersion: h.rows[0]?.world_version ?? null,
      checkpoint: c,
      rows: before,
      countryIds: TEST_COUNTRIES,
      observedAtReal: options.at ?? TEST_NOW,
    });
    if (plan.action === 'EXISTING_METADATA_ONLY') return plan;
    let changed = 0;
    for (const row of plan.rows) {
      const previous = before.find(
        (old) =>
          old.countryId === row.countryId &&
          old.officeId === row.officeId &&
          old.capability === row.capability,
      );
      const values = [
        row.worldId,
        row.authSubject,
        row.countryId,
        row.officeId,
        row.capability,
        row.teamId,
        row.authorizationVersion,
        row.active,
        options.at ?? TEST_NOW,
      ];
      const result = previous
        ? await sql.query(
            `update world_v2.current_commit_authorization set
            team_id=$6,authorization_version=$7,active=$8,refreshed_at_real=$9::timestamptz
            where world_id=$1 and auth_subject=$2::uuid and country_id=$3 and office_id=$4 and capability=$5
              and authorization_version=$10 and active=$11`,
            [...values, previous.authorizationVersion, previous.active],
          )
        : await sql.query(
            `insert into world_v2.current_commit_authorization
            (world_id,auth_subject,country_id,office_id,capability,team_id,authorization_version,active,refreshed_at_real)
            values($1,$2::uuid,$3,$4,$5,$6,$7,$8,$9::timestamptz)`,
            values,
          );
      if (result.rowCount !== 1) throw Error('TEST_ONLY_ROW_CAS_FAILED');
      changed += 1;
      if (options.failAfterFirst && changed === 1)
        throw Error('TEST_ONLY_PARTIAL_ROW_FAILURE');
    }
    const next = plan.checkpoint;
    const values = [
      source.worldId,
      source.authSubject,
      next.sourceOwnerRef,
      next.sourceRegistrationId,
      next.sourceRecordRef,
      next.sourceSchemaVersion,
      next.sourceSha256,
      next.sourceRevision,
      next.predecessorRevision,
      next.operationId,
      next.expectedWorldVersion,
      next.expectedBeforeSemanticFingerprint,
      options.failC ? 'INVALID_DIGEST' : next.afterFingerprint,
      options.at ?? TEST_NOW,
    ];
    const changedC = c
      ? await sql.query(
          `update world_v2.current_authorization_publication_checkpoint set
          source_owner_ref=$3,source_registration_id=$4,source_record_ref=$5,source_schema_version=$6,
          source_sha256=$7,source_revision=$8,predecessor_revision=$9,operation_id=$10,
          expected_world_version=$11::bigint,expected_before_fingerprint=$12,after_fingerprint=$13,published_at_real=$14::timestamptz
          where world_id=$1 and auth_subject=$2::uuid and source_revision=$15 and after_fingerprint=$16`,
          [...values, c.sourceRevision, c.afterFingerprint],
        )
      : await sql.query(
          `insert into world_v2.current_authorization_publication_checkpoint
          (world_id,auth_subject,source_owner_ref,source_registration_id,source_record_ref,source_schema_version,
          source_sha256,source_revision,predecessor_revision,operation_id,expected_world_version,expected_before_fingerprint,after_fingerprint,published_at_real)
          values($1,$2::uuid,$3,$4,$5,$6,$7,$8,$9,$10,$11::bigint,$12,$13,$14::timestamptz)`,
          values,
        );
    if (changedC.rowCount !== 1) throw Error('TEST_ONLY_CHECKPOINT_CAS_FAILED');
    expect(await rows(sql, source.worldId)).toEqual(plan.rows);
    expect(await checkpoint(sql, source.worldId)).toEqual(plan.checkpoint);
    return plan;
  });
}
async function waitForBlock(pid: number, blocker: number) {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const result = await admin.query<{ blockers: number[] }>(
      'select pg_blocking_pids($1) as blockers',
      [pid],
    );
    if (result.rows[0]?.blockers.includes(blocker)) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw Error('TEST_ONLY_EXPECTED_H_BLOCK_NOT_OBSERVED');
}

suite(
  'authorization preparation — owned native PG16 actual schema, NOT real source',
  () => {
    beforeAll(async () => {
      if (!process.getuid) throw Error('TEST_UNIX_UID_REQUIRED');
      const uid = process.getuid();
      if (
        process.env.WORLD_DATABASE_URL !== undefined ||
        process.env.DATABASE_URL !== undefined ||
        Object.keys(process.env).some(
          (key) => key.startsWith('PG') && process.env[key],
        )
      )
        throw Error('RUNTIME_OR_PG_OVERRIDE_FORBIDDEN');
      const markerPath = process.env.AUTHZ_PREPARATION_NATIVE_MARKER!;
      const stat = lstatSync(markerPath);
      if (
        !stat.isFile() ||
        stat.uid !== uid ||
        (stat.mode & 0o777) !== 0o600 ||
        realpathSync(markerPath) !== markerPath
      )
        throw Error('TEST_MARKER_INVALID');
      const marker = JSON.parse(readFileSync(markerPath, 'utf8')) as {
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
        marker.schema !== 'A_AUTHZ_PREPARATION_NATIVE_1' ||
        marker.uid !== uid ||
        marker.database !== 'econmind_authz_preparation_test' ||
        marker.bootstrap !== 'a_authz_test_bootstrap' ||
        marker.port !== 5432 ||
        marker.data !== path.join(path.dirname(markerPath), 'data') ||
        marker.socket !== path.join(path.dirname(markerPath), 'socket')
      )
        throw Error('TEST_MARKER_SCOPE_INVALID');
      for (const dir of [
        path.dirname(markerPath),
        marker.data,
        marker.socket,
        path.dirname(marker.socketAlias),
      ]) {
        const s = lstatSync(dir);
        if (
          !s.isDirectory() ||
          s.uid !== marker.uid ||
          (s.mode & 0o777) !== 0o700 ||
          realpathSync(dir) !== dir
        )
          throw Error('TEST_OWNED_DIRECTORY_INVALID');
      }
      if (
        !lstatSync(marker.socketAlias).isSymbolicLink() ||
        realpathSync(marker.socketAlias) !== marker.socket
      )
        throw Error('TEST_SOCKET_ALIAS_INVALID');
      const fixture = await loadFrozenRenewalMigrationFixture(root); // Full provenance before SQL.
      const connection = {
        host: marker.socketAlias,
        port: marker.port,
        database: marker.database,
        connectionTimeoutMillis: 2000,
      };
      admin = new Pool({ ...connection, user: marker.bootstrap, max: 3 });
      const identity = (
        await admin.query(
          "select current_database() as db,current_user as role,current_setting('data_directory') as data,current_setting('server_version_num') as version,inet_server_addr() as host",
        )
      ).rows[0];
      expect(identity).toEqual({
        db: marker.database,
        role: marker.bootstrap,
        data: marker.data,
        version: '160015',
        host: null,
      });
      expect(
        (
          await admin.query(
            "select 1 from pg_namespace where nspname='world_v2'",
          )
        ).rowCount,
      ).toBe(0);
      // Original bounded fixture required by unchanged 0022 storage policies.
      await admin.query(snapshotStorageFixtureSql);
      for (const artifact of fixture.artifacts) await admin.query(artifact);
      await admin.query(
        readFileSync(
          path.join(
            root,
            'database/proposals/runtime-read-binding-storage.sql',
          ),
          'utf8',
        ),
      );
      await admin.query(
        readFileSync(
          path.join(
            root,
            'database/proposals/current-authorization-writer-preparation.sql',
          ),
          'utf8',
        ),
      );
      for (const role of [PROBE, ORACLE])
        await admin.query(
          `create role ${role} login nosuperuser nobypassrls nocreatedb nocreaterole noinherit noreplication`,
        );
      await admin.query(`grant usage on schema world_v2 to ${PROBE},${ORACLE}`);
      await admin.query(
        `grant select,update(world_version) on world_v2.world_head to ${PROBE},${ORACLE}`,
      );
      await admin.query(
        `grant execute on function world_v2.apply_current_authorization_change(text,text,bigint,text) to ${PROBE}`,
      );
      // This positive fixture role is NOT an execute-only live publication role.
      await admin.query(
        `grant select,insert,update on world_v2.current_commit_authorization,world_v2.current_authorization_publication_checkpoint to ${ORACLE}`,
      );
      await admin.query(`create policy a_authz_test_only_checkpoint on world_v2.current_authorization_publication_checkpoint
      to ${ORACLE} using (world_id like 'WORLD_AUTHZ_TEST_%' and auth_subject='${TEST_SUBJECT}'::uuid)
      with check (world_id like 'WORLD_AUTHZ_TEST_%' and auth_subject='${TEST_SUBJECT}'::uuid)`);
      probe = new Pool({
        ...connection,
        user: PROBE,
        max: 3,
        options: '-c statement_timeout=4000 -c lock_timeout=3000',
      });
      oracle = new Pool({
        ...connection,
        user: ORACLE,
        max: 3,
        options: '-c statement_timeout=4000 -c lock_timeout=3000',
      });
      database = new PostgresSqlDatabase(oracle);
      console.log(
        JSON.stringify({
          scope: 'TEST_ONLY_MECHANICAL_ORACLE_NOT_SOURCE_REGISTRATION',
          identity,
          originalMigrationCount: fixture.artifacts.length,
          formalAdmission: false,
          productionAccess: false,
        }),
      );
    }, 30000);
    afterAll(async () => {
      await oracle?.end();
      await probe?.end();
      await admin?.end();
    });

    it('default-deny function preserves exact missing-source/head/isolation refusal and zero footprint', async () => {
      const world = 'WORLD_AUTHZ_TEST_DENY';
      await addWorld(world);
      const before = await footprint();
      await expect(
        probe.query(functionCall, args(world)),
      ).rejects.toMatchObject({
        code: '55000',
        message: 'AUTHORIZATION_SOURCE_NOT_REGISTERED',
      });
      await expect(
        probe.query(functionCall, args('WORLD_AUTHZ_TEST_MISSING')),
      ).rejects.toMatchObject({ message: 'AUTHORIZATION_WORLD_HEAD_MISSING' });
      const sql = await probe.connect();
      try {
        await sql.query('begin isolation level repeatable read');
        await expect(
          sql.query(functionCall, args(world)),
        ).rejects.toMatchObject({
          message: 'AUTHORIZATION_READ_COMMITTED_REQUIRED',
        });
        await sql.query('rollback');
      } finally {
        sql.release();
      }
      expect(await footprint()).toEqual(before);
      expect(await authSnapshot(world)).toEqual([{ a: [], c: [] }]);
    });
    it('nonadmin denial waits for H before touching an existing inactive authorization row', async () => {
      const world = 'WORLD_AUTHZ_TEST_H_FIRST';
      await addWorld(world);
      await admin.query(
        `insert into world_v2.current_commit_authorization values($1,$2::uuid,$3,'CAPTAIN','CAPTAIN_STRATEGY','TEAM_AUTHZ_TEST_A','TEST_ONLY_INACTIVE',false,$4::timestamptz)`,
        [world, TEST_SUBJECT, TEST_COUNTRIES[0], TEST_NOW],
      );
      const held = await admin.connect(),
        caller = await probe.connect(),
        inspector = await admin.connect();
      let pending: Promise<unknown> | undefined;
      try {
        await held.query('begin');
        const holder = (await held.query('select pg_backend_pid() as pid'))
          .rows[0].pid as number;
        await held.query(
          'select world_version from world_v2.world_head where world_id=$1 for update',
          [world],
        );
        const pid = (await caller.query('select pg_backend_pid() as pid'))
          .rows[0].pid as number;
        pending = caller
          .query(functionCall, args(world))
          .catch((error: unknown) => error);
        await waitForBlock(pid, holder);
        await inspector.query('begin');
        expect(
          (
            await inspector.query(
              'select * from world_v2.current_commit_authorization where world_id=$1 for update nowait',
              [world],
            )
          ).rowCount,
        ).toBe(1);
        await inspector.query('rollback');
        await held.query('commit');
        expect(await pending).toMatchObject({
          message: 'AUTHORIZATION_SOURCE_NOT_REGISTERED',
        });
        expect(
          (await rows(new PostgresSqlDatabase(admin), world))[0]?.active,
        ).toBe(false);
      } finally {
        await held.query('rollback');
        await inspector.query('rollback');
        if (pending) await pending;
        held.release();
        caller.release();
        inspector.release();
      }
    });
    it('TEST_ONLY H-first planner applies all six Offices then complete country/team/Office replacement with no economic footprint', async () => {
      const world = 'WORLD_AUTHZ_TEST_COMPLETE';
      await addWorld(world);
      const before = await footprint();
      const grants = [
        ['CAPTAIN', 'CAPTAIN_STRATEGY'],
        ['CENTRAL_BANK', 'CENTRAL_BANK_MONETARY_POLICY'],
        ['FINANCE', 'FINANCE_TREASURY'],
        ['INDUSTRY', 'INDUSTRY_PRODUCTION'],
        ['SOCIAL', 'SOCIAL_LABOUR'],
        ['TRADE', 'TRADE_POLICY'],
      ].map(([officeId, capability]) => ({ officeId, capability }));
      const first = await fixtureApply(
        bytes(world, 'TEST_ONLY_REV_1', null, [], { grants }),
      );
      expect(first.rows).toHaveLength(6);
      const second = await fixtureApply(
        bytes(world, 'TEST_ONLY_REV_2', 'TEST_ONLY_REV_1', first.rows, {
          countryId: TEST_COUNTRIES[1],
          teamId: 'TEAM_AUTHZ_TEST_B',
          grants: [{ officeId: 'TRADE', capability: 'TRADE_POLICY' }],
        }),
      );
      expect(second.rows).toHaveLength(7);
      expect(second.rows.filter((r) => r.active)).toHaveLength(1);
      expect(
        second.rows.every((r) => r.authorizationVersion === 'TEST_ONLY_REV_2'),
      ).toBe(true);
      expect(await footprint()).toEqual(before);
    });
    it('TEST_ONLY exact retry is read-only despite later head advance; stale predecessor/CAS and changed bytes refuse', async () => {
      const world = 'WORLD_AUTHZ_TEST_RETRY';
      await addWorld(world);
      const input = bytes(world),
        first = await fixtureApply(input),
        before = await authSnapshot(world);
      await admin.query(
        'update world_v2.world_head set world_version=7 where world_id=$1',
        [world],
      );
      expect(
        (await fixtureApply(input, { at: '2026-10-10T00:00:02.000Z' })).action,
      ).toBe('EXISTING_METADATA_ONLY');
      expect(await authSnapshot(world)).toEqual(before);
      await expect(
        fixtureApply(
          bytes(world, 'TEST_ONLY_REV_2', 'BAD_PREDECESSOR', first.rows),
        ),
      ).rejects.toMatchObject({ outcome: 'ROLLED_BACK' });
      await expect(
        fixtureApply(
          bytes(world, 'TEST_ONLY_REV_1', null, [], {
            issuer: 'CHANGED_BYTES',
          }),
        ),
      ).rejects.toMatchObject({ outcome: 'ROLLED_BACK' });
      expect(await authSnapshot(world)).toEqual(before);
    });
    it('two TEST_ONLY same-before contenders serialize on H; duplicate exact retries never write twice', async () => {
      const world = 'WORLD_AUTHZ_TEST_CONTEND';
      await addWorld(world);
      const before = await footprint();
      const outcomes = await Promise.allSettled([
        fixtureApply(bytes(world)),
        fixtureApply(bytes(world, 'TEST_ONLY_REV_2')),
      ]);
      expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(outcomes.filter((r) => r.status === 'rejected')).toHaveLength(1);
      const current = await checkpoint(database, world);
      const input = bytes(world, current!.sourceRevision);
      const snapshot = await authSnapshot(world);
      const retries = await Promise.all([
        fixtureApply(input),
        fixtureApply(input),
      ]);
      expect(retries.every((r) => r.action === 'EXISTING_METADATA_ONLY')).toBe(
        true,
      );
      expect(await authSnapshot(world)).toEqual(snapshot);
      expect(await footprint()).toEqual(before);
    });
    it('actual mid-row/C-check constraint failure rolls back the complete A+C transaction', async () => {
      const world = 'WORLD_AUTHZ_TEST_ROLLBACK';
      await addWorld(world);
      const first = await fixtureApply(bytes(world)),
        before = await authSnapshot(world),
        economic = await footprint();
      const next = bytes(
        world,
        'TEST_ONLY_REV_2',
        'TEST_ONLY_REV_1',
        first.rows,
        {
          grants: [{ officeId: 'SOCIAL', capability: 'SOCIAL_LABOUR' }],
        },
      );
      await expect(
        fixtureApply(next, { failAfterFirst: true }),
      ).rejects.toMatchObject({ outcome: 'ROLLED_BACK' });
      expect(await authSnapshot(world)).toEqual(before);
      await expect(fixtureApply(next, { failC: true })).rejects.toMatchObject({
        outcome: 'ROLLED_BACK',
        cause: { code: '23514' },
      });
      expect(await authSnapshot(world)).toEqual(before);
      expect(await footprint()).toEqual(economic);
    });
    it('TEST_ONLY empty revoke commits only metadata; later revoke supersedes old operation without resurrection', async () => {
      const world = 'WORLD_AUTHZ_TEST_REVOKE';
      await addWorld(world);
      const input = bytes(world, 'TEST_ONLY_REV_1', null, [], {
        operation: 'REVOKE',
        grants: [],
      });
      const first = await fixtureApply(input);
      expect(first.rows).toEqual([]);
      expect(await checkpoint(database, world)).toEqual(first.checkpoint);
      const next = await fixtureApply(
        bytes(world, 'TEST_ONLY_REV_2', 'TEST_ONLY_REV_1', [], {
          operation: 'REVOKE',
          grants: [],
        }),
      );
      expect(
        compareAuthorizationPublicationReadback({
          ...input,
          observedAtReal: TEST_NOW,
          countryIds: TEST_COUNTRIES,
          rows: next.rows,
          checkpoint: next.checkpoint,
        }),
      ).toBe('SUPERSEDED_OR_CONFLICT_UNKNOWN_STOP');
      await expect(fixtureApply(input)).rejects.toMatchObject({
        outcome: 'ROLLED_BACK',
      });
      expect((await checkpoint(database, world))?.sourceRevision).toBe(
        'TEST_ONLY_REV_2',
      );
    });
    it('post-COMMIT acknowledgement-loss injection preserves UNKNOWN/no automatic retry; fresh A/C is metadata only', async () => {
      const world = 'WORLD_AUTHZ_TEST_UNKNOWN';
      await addWorld(world);
      const input = bytes(world);
      let attempts = 0;
      try {
        attempts += 1;
        await fixtureApply(input); // Real native COMMIT, then TEST_ONLY response loss.
        throw new PostgresTransactionError({
          outcome: 'COMMIT_OUTCOME_UNKNOWN',
          cause: Error('TEST_ONLY_LOST_ACK_AFTER_REAL_COMMIT'),
        });
      } catch (error) {
        expect(classifyAuthorizationPublicationFailure(error)).toEqual({
          status: 'AUTHORIZATION_WRITE_OUTCOME_UNKNOWN',
          retryable: false,
        });
      }
      expect(attempts).toBe(1);
      const current = await rows(database, world),
        c = await checkpoint(database, world);
      expect(
        compareAuthorizationPublicationReadback({
          ...input,
          rows: current,
          checkpoint: c,
          countryIds: TEST_COUNTRIES,
          observedAtReal: TEST_NOW,
        }),
      ).toBe('METADATA_MATCH_REAL_SOURCE_REQUIRED');
      const before = await authSnapshot(world);
      expect(
        (await fixtureApply(input, { at: '2026-10-10T00:00:02.000Z' })).action,
      ).toBe('EXISTING_METADATA_ONLY');
      expect(await authSnapshot(world)).toEqual(before);
    });
    it('nonadmin product probe has no A/C DML or role bypass; original admission veto is retained and no admission exists', async () => {
      const sqls = [
        'insert into world_v2.current_commit_authorization default values',
        'update world_v2.current_commit_authorization set active=true',
        'delete from world_v2.current_commit_authorization',
        'truncate world_v2.current_commit_authorization',
        'insert into world_v2.current_authorization_publication_checkpoint default values',
        'update world_v2.current_authorization_publication_checkpoint set source_revision=source_revision',
        'delete from world_v2.current_authorization_publication_checkpoint',
        'truncate world_v2.current_authorization_publication_checkpoint',
        'set role ' + ORACLE,
      ];
      for (const sql of sqls)
        await expect(probe.query(sql)).rejects.toMatchObject({ code: '42501' });
      const roles = await admin.query(
        'select rolname,rolsuper,rolbypassrls,rolcreaterole from pg_roles where rolname=any($1::text[])',
        [[PROBE, ORACLE]],
      );
      expect(
        roles.rows.every(
          (r) => !r.rolsuper && !r.rolbypassrls && !r.rolcreaterole,
        ),
      ).toBe(true);
      const grants = await admin.query(
        "select exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid='world_v2.apply_current_authorization_change(text,text,bigint,text)'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE') as public_execute",
      );
      expect(grants.rows[0].public_execute).toBe(false);
      const veto = await admin.query(
        "select pg_get_functiondef('world_v2.guard_runtime_opening_admission_publication()'::regprocedure) as definition",
      );
      expect(veto.rows[0].definition).toContain(
        "raise exception 'ADMISSION_PUBLICATION_ENTRYPOINT_MISSING'",
      );
      expect(
        (
          await admin.query(
            "select tgenabled from pg_trigger where tgname='runtime_opening_admission_requires_real_publication'",
          )
        ).rows,
      ).toEqual([{ tgenabled: 'O' }]);
      expect(
        (
          await admin.query(
            'select count(*)::int as n from world_v2.runtime_opening_admission',
          )
        ).rows[0].n,
      ).toBe(0);
    });
  },
);
