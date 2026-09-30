import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { assertV09PostgresTestEnvironment } from '../../scripts/v09-postgres-test-environment.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const READER_ROLE = 'world_v2_api_reader';
const LOGIN_ROLE = 'world_v2_api_login';
const SELECTED_BUNDLE = 'BALANCED_2026_09_28_V1';
const SELECTED_PATH = 'source/646174612f636f756e74726965732e6a736f6e';
const OTHER_BUNDLE = 'OTHER_INERT_SOURCE';
const OTHER_PATH = 'source/6f746865722e6a736f6e';
const postgresDescribe = process.env.V09_TEST_DATABASE_URL
  ? describe
  : describe.skip;

let admin: Pool | undefined;
let login: Pool | undefined;

function currentAdmin(): Pool {
  if (admin === undefined) throw new Error('WORLD_V2_API_READER_ADMIN_MISSING');
  return admin;
}

function currentLogin(): Pool {
  if (login === undefined) throw new Error('WORLD_V2_API_READER_LOGIN_MISSING');
  return login;
}

function roleConnectionString(connectionString: string, role: string): string {
  const value = new URL(connectionString);
  value.username = role;
  value.password = '';
  return value.toString();
}

async function dropRole(role: string): Promise<void> {
  await currentAdmin().query(
    `select pg_terminate_backend(pid)
       from pg_stat_activity
      where usename = $1 and pid <> pg_backend_pid()`,
    [role],
  );
  await currentAdmin().query(`drop role if exists ${role}`);
}

async function resetWorldV2(): Promise<void> {
  await currentAdmin().query('drop schema if exists world_v2 cascade');
  await dropRole(LOGIN_ROLE);
  await dropRole(READER_ROLE);
  const manifest = JSON.parse(
    await readFile(
      path.join(root, 'database/migrations/manifest.json'),
      'utf8',
    ),
  ) as { migrations: readonly { readonly path: string }[] };
  for (const migration of manifest.migrations) {
    await currentAdmin().query(
      await readFile(path.join(root, migration.path), 'utf8'),
    );
  }
}

async function seedCandidateRows(): Promise<void> {
  const selectedContent = '[{"id":"visual-territory-01"}]';
  const otherContent = '[{"id":"not-selected"}]';
  const selectedHash = (
    await currentAdmin().query<{ hash: string }>(
      'select world_v2.authoritative_sha256($1) as hash',
      [selectedContent],
    )
  ).rows[0]?.hash;
  const otherHash = (
    await currentAdmin().query<{ hash: string }>(
      'select world_v2.authoritative_sha256($1) as hash',
      [otherContent],
    )
  ).rows[0]?.hash;
  if (selectedHash === undefined || otherHash === undefined) {
    throw new Error('WORLD_V2_API_READER_HASH_MISSING');
  }
  await currentAdmin().query(
    `insert into world_v2.country_candidate_bundle
       (bundle_id, source_thread_id, package_manifest_sha256, source_status,
        activation_allowed)
     values ($1, 'selected-source', $2, 'IMPLEMENTED_UNVERIFIED_CANDIDATE', false),
            ($3, 'other-source', $4, 'ILLUSTRATIVE_PLANNING_ONLY', false)`,
    [SELECTED_BUNDLE, 'a'.repeat(64), OTHER_BUNDLE, 'b'.repeat(64)],
  );
  await currentAdmin().query(
    `insert into world_v2.country_candidate_artifact
       (bundle_id, artifact_path, content_sha256, content_utf8)
     values ($1, $2, $3, $4), ($5, $6, $7, $8)`,
    [
      SELECTED_BUNDLE,
      SELECTED_PATH,
      selectedHash,
      selectedContent,
      OTHER_BUNDLE,
      OTHER_PATH,
      otherHash,
      otherContent,
    ],
  );
}

async function queryAsReader(
  text: string,
  values: readonly unknown[] = [],
  readOnly = true,
) {
  const client = await currentLogin().connect();
  let transactionOpen = false;
  try {
    await client.query(readOnly ? 'begin read only' : 'begin');
    transactionOpen = true;
    await client.query(`set local role ${READER_ROLE}`);
    const result = await client.query(text, values);
    await client.query('commit');
    transactionOpen = false;
    return result;
  } catch (error) {
    if (transactionOpen) await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

function normalizePolicyQual(value: string | null): string {
  return (value ?? '')
    .replaceAll('::text', '')
    .replaceAll(/\s+/g, '')
    .replaceAll(/[()]/g, '');
}

postgresDescribe('World V2 selected-country server reader role', () => {
  beforeAll(async () => {
    const environment = assertV09PostgresTestEnvironment();
    admin = new Pool({
      connectionString: environment.connectionString,
      max: 2,
    });
    await resetWorldV2();
    await seedCandidateRows();
    await currentAdmin().query(`alter role ${LOGIN_ROLE} login`);
    login = new Pool({
      connectionString: roleConnectionString(
        environment.connectionString,
        LOGIN_ROLE,
      ),
      max: 1,
    });
  }, 30_000);

  afterAll(async () => {
    await login?.end();
    login = undefined;
    if (admin !== undefined) {
      await currentAdmin().query('drop schema if exists world_v2 cascade');
      await dropRole(LOGIN_ROLE);
      await dropRole(READER_ROLE);
      await admin.end();
      admin = undefined;
    }
  });

  it('permits only the fixed source row after SET LOCAL ROLE', async () => {
    await expect(
      currentLogin().query(
        `select bundle_id from world_v2.country_candidate_bundle`,
      ),
    ).rejects.toMatchObject({ code: '42501' });

    await expect(
      queryAsReader(
        `select b.bundle_id, b.package_manifest_sha256, b.source_status,
                b.activation_allowed, a.content_sha256, a.content_utf8
           from world_v2.country_candidate_bundle b
           join world_v2.country_candidate_artifact a
             on a.bundle_id = b.bundle_id
          where b.bundle_id = $1 and a.artifact_path = $2
          limit 2`,
        [SELECTED_BUNDLE, SELECTED_PATH],
      ),
    ).resolves.toMatchObject({
      rowCount: 1,
      rows: [
        {
          bundle_id: SELECTED_BUNDLE,
          source_status: 'IMPLEMENTED_UNVERIFIED_CANDIDATE',
          activation_allowed: false,
        },
      ],
    });

    await expect(
      queryAsReader(
        `select artifact_path from world_v2.country_candidate_artifact
          where bundle_id = $1 and artifact_path = $2`,
        [OTHER_BUNDLE, OTHER_PATH],
      ),
    ).resolves.toMatchObject({ rowCount: 0 });
  }, 30_000);

  it('denies ungranted country profiles, columns, and all mutations', async () => {
    await expect(
      queryAsReader(
        'select country_id from world_v2.country_candidate_profile limit 1',
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      queryAsReader(
        `select source_thread_id from world_v2.country_candidate_bundle
          where bundle_id = $1`,
        [SELECTED_BUNDLE],
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      queryAsReader(
        `update world_v2.country_candidate_bundle
            set source_status = 'ILLUSTRATIVE_PLANNING_ONLY'
          where bundle_id = $1`,
        [SELECTED_BUNDLE],
        false,
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      queryAsReader(
        `insert into world_v2.country_candidate_profile
           (bundle_id, country_id, source_record)
         values ($1, 'visual-territory-02', '{"countryId":"visual-territory-02","activationAllowed":false}')`,
        [SELECTED_BUNDLE],
        false,
      ),
    ).rejects.toMatchObject({ code: '42501' });
  }, 30_000);

  it('retains a non-login, non-inheriting, non-bypass reader group', async () => {
    await expect(
      currentAdmin().query(
        `select rolcanlogin, rolinherit, rolbypassrls, rolsuper
           from pg_roles where rolname = $1`,
        [READER_ROLE],
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          rolcanlogin: false,
          rolinherit: false,
          rolbypassrls: false,
          rolsuper: false,
        },
      ],
    });
    await expect(
      currentAdmin().query(
        `select pg_has_role($1, $2, 'member') as may_set_role`,
        [LOGIN_ROLE, READER_ROLE],
      ),
    ).resolves.toMatchObject({ rows: [{ may_set_role: true }] });
  }, 30_000);

  it('retains exact membership options, column grants, and selected-source policies', async () => {
    const membership = await currentAdmin().query<{
      admin_option: boolean;
      inherit_option: boolean;
      set_option: boolean;
    }>(
      `select membership.admin_option, membership.inherit_option,
              membership.set_option
         from pg_auth_members membership
         join pg_roles member_role on member_role.oid = membership.member
         join pg_roles granted_role on granted_role.oid = membership.roleid
        where member_role.rolname = $1 and granted_role.rolname = $2`,
      [LOGIN_ROLE, READER_ROLE],
    );
    expect(membership.rows).toEqual([
      { admin_option: false, inherit_option: false, set_option: true },
    ]);

    const columns = await currentAdmin().query<{
      table_name: string;
      column_name: string;
    }>(
      `select relation.relname as table_name, attribute.attname as column_name
         from pg_attribute attribute
         join pg_class relation on relation.oid = attribute.attrelid
         join pg_namespace namespace on namespace.oid = relation.relnamespace
        where namespace.nspname = 'world_v2'
          and relation.relkind in ('p', 'r')
          and attribute.attnum > 0 and not attribute.attisdropped
          and has_column_privilege($1, relation.oid, attribute.attname, 'SELECT')
        order by relation.relname, attribute.attnum`,
      [READER_ROLE],
    );
    expect(columns.rows).toEqual([
      { table_name: 'country_candidate_artifact', column_name: 'bundle_id' },
      {
        table_name: 'country_candidate_artifact',
        column_name: 'artifact_path',
      },
      {
        table_name: 'country_candidate_artifact',
        column_name: 'content_sha256',
      },
      { table_name: 'country_candidate_artifact', column_name: 'content_utf8' },
      { table_name: 'country_candidate_bundle', column_name: 'bundle_id' },
      {
        table_name: 'country_candidate_bundle',
        column_name: 'package_manifest_sha256',
      },
      { table_name: 'country_candidate_bundle', column_name: 'source_status' },
      {
        table_name: 'country_candidate_bundle',
        column_name: 'activation_allowed',
      },
    ]);

    const policies = await currentAdmin().query<{
      tablename: string;
      policyname: string;
      roles: readonly string[];
      cmd: string;
      qual: string | null;
      with_check: string | null;
    }>(
      `select tablename, policyname, roles, cmd, qual, with_check
         from pg_policies
        where schemaname = 'world_v2'
          and policyname in (
            'country_candidate_bundle_selected_source_server_read',
            'country_candidate_artifact_selected_source_server_read'
          )
        order by policyname`,
    );
    expect(
      policies.rows.map((policy) => ({
        ...policy,
        qual: normalizePolicyQual(policy.qual),
      })),
    ).toEqual([
      {
        tablename: 'country_candidate_artifact',
        policyname: 'country_candidate_artifact_selected_source_server_read',
        roles: [READER_ROLE],
        cmd: 'SELECT',
        qual: "bundle_id='BALANCED_2026_09_28_V1'ANDartifact_path='source/646174612f636f756e74726965732e6a736f6e'",
        with_check: null,
      },
      {
        tablename: 'country_candidate_bundle',
        policyname: 'country_candidate_bundle_selected_source_server_read',
        roles: [READER_ROLE],
        cmd: 'SELECT',
        qual: "bundle_id='BALANCED_2026_09_28_V1'",
        with_check: null,
      },
    ]);
  }, 30_000);
});
