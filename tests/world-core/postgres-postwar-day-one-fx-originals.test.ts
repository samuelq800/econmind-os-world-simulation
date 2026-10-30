/** Embedded SQL schema/ACL mechanism checks. No actual cfc World/source is
 * admitted here, no balances/commands are fabricated and this is not native PG. */
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';

const base = `
create schema world_v2;
create table world_v2.world_head(world_id text primary key,world_version bigint,event_sequence bigint);
create table world_v2.opening_seed(world_id text,seed_id text,seed_fingerprint text,replay_binding text,canonical_payload text,unique(world_id,seed_fingerprint));
create table world_v2.runtime_opening_admission(world_id text,seed_id text,seed_fingerprint text,admission_ref text unique,model_version text,replay_binding text,admitted_at_real timestamptz);
create table world_v2.runtime_admission_publication_permit(authorization_id text,authorization_sha256 text,world_id text,seed_id text,seed_fingerprint text,model_version text,replay_binding text,valid_from timestamptz,valid_until timestamptz);
create table world_v2.runtime_admission_publication_revocation(authorization_id text);
create table world_v2.current_commit_authorization(world_id text,auth_subject uuid,country_id text,office_id text,capability text,team_id text,authorization_version text,active boolean);
create table world_v2.runtime_read_seat(world_id text,auth_subject uuid,country_id text,office_id text,team_id text,authorization_revision text,seat_ref text);
create table world_v2.projection_entitlement(world_id text,auth_subject uuid,classification text,scope_key text,authorization_version text,active boolean,revoked_at timestamptz);
create function world_v2.reject_authoritative_history_mutation()returns trigger language plpgsql as $$begin raise exception 'TEST_METADATA_APPEND_ONLY';end;$$;
`;
describe('first-day FX bounded custody SQL candidate', () => {
  it('routes the actual initial binding read and final cutoff through one fixed definer on the same client, retaining other permission failures', async () => {
    const [
      { createPostwarDayOneFxIntakeAuthorizationPool },
      { OFFICE_COMMAND_CURRENT_BINDING_QUERY },
    ] = await Promise.all([
      import('../../apps/world-worker/src/persistence/postgres-postwar-day-one-fx-originals.js'),
      import('../../apps/world-worker/src/intake/postgres-office-command-intake.js'),
    ]);
    const lock =
      'select * from world_v2.lock_postwar_day_one_fx_intake_binding($1,$2::uuid,$3,$4,$5,$6,$7,$8)';
    const calls: { sql: string; parameters: unknown[] | undefined }[] = [];
    const denied = Object.assign(
      new Error('permission denied for table opening_seed'),
      { code: '42501' },
    );
    let connects = 0,
      releases = 0;
    const client = {
      async query(sql: string, parameters?: unknown[]) {
        calls.push({ sql, parameters });
        if (sql !== lock) throw denied;
        return { rows: [], rowCount: 0 };
      },
      release() {
        releases++;
      },
    };
    const raw = {
      async connect() {
        connects++;
        return client;
      },
    } as unknown as Pick<Pool, 'connect'>;
    const pool = createPostwarDayOneFxIntakeAuthorizationPool(raw);
    expect(createPostwarDayOneFxIntakeAuthorizationPool(raw)).toBe(pool);
    expect(createPostwarDayOneFxIntakeAuthorizationPool(pool)).toBe(pool);
    const held = await pool.connect();
    const parameters = [
      'WORLD_POSTWAR_GCU_OPENING_20261029_V1',
      '11111111-1111-4111-8111-111111111111',
      'COUNTRY_01',
      'FINANCE',
      'SEAT_ACTUAL',
      'REV_1',
      'FINANCE_TREASURY',
      'OFFICE_SCOPE',
    ];
    try {
      await held.query(OFFICE_COMMAND_CURRENT_BINDING_QUERY, parameters);
      await held.query(
        OFFICE_COMMAND_CURRENT_BINDING_QUERY +
          ' for share of authz,entitlement',
        parameters,
      );
      expect(calls.slice(0, 2)).toEqual([
        { sql: lock, parameters },
        { sql: lock, parameters },
      ]);
      // Near matches and another capability remain the original statement;
      // the adapter cannot authorize them or hide the real permission denial.
      for (const [sql, args] of [
        [OFFICE_COMMAND_CURRENT_BINDING_QUERY + ' ', parameters],
        [
          OFFICE_COMMAND_CURRENT_BINDING_QUERY,
          [...parameters.slice(0, 6), 'FINANCE_BUDGET', parameters[7]],
        ],
        [OFFICE_COMMAND_CURRENT_BINDING_QUERY, parameters.slice(0, 7)],
      ] as const)
        await expect(held.query(sql, [...args])).rejects.toBe(denied);
      expect(calls.slice(2).map((call) => call.sql)).toEqual([
        OFFICE_COMMAND_CURRENT_BINDING_QUERY + ' ',
        OFFICE_COMMAND_CURRENT_BINDING_QUERY,
        OFFICE_COMMAND_CURRENT_BINDING_QUERY,
      ]);
    } finally {
      held.release();
    }
    expect(connects).toBe(1);
    expect(releases).toBe(1);
  });
  it('installs isolated fixed no-login roles, inaccessible immutable tables and finite functions without caller memberships', async () => {
    const db = new PGlite();
    try {
      await db.exec(base);
      await db.exec(
        await readFile(
          new URL(
            '../../database/proposals/postwar-day-one-fx-custody.sql',
            import.meta.url,
          ),
          'utf8',
        ),
      );
      const roles = await db.query<{
        rolname: string;
        rolcanlogin: boolean;
        rolsuper: boolean;
        rolbypassrls: boolean;
        rolcreaterole: boolean;
        rolcreatedb: boolean;
      }>(
        "select rolname,rolcanlogin,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb from pg_roles where rolname like 'world_v2_day_one_fx_source_%' order by rolname",
      );
      expect(roles.rows).toHaveLength(3);
      for (const role of roles.rows)
        expect(Object.values(role).slice(1)).toEqual([
          false,
          false,
          false,
          false,
          false,
        ]);
      const access = await db.query<Record<string, boolean>>(`select
        has_table_privilege('world_v2_day_one_fx_source_reader','world_v2.postwar_day_one_fx_quote_original','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')as reader_original,
        has_table_privilege('world_v2_day_one_fx_source_publisher','world_v2.postwar_day_one_fx_quote_original','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')as publisher_original,
        has_table_privilege('world_v2_day_one_fx_source_reader','world_v2.opening_seed','SELECT')as reader_raw_seed,
        has_table_privilege('world_v2_day_one_fx_source_reader','world_v2.current_commit_authorization','UPDATE')as reader_authority_update,
        has_function_privilege('world_v2_day_one_fx_source_reader','world_v2.lock_postwar_day_one_fx_original(text,text,text,text,timestamptz)','EXECUTE')as reader_lock,
        has_function_privilege('world_v2_day_one_fx_source_reader','world_v2.publish_postwar_day_one_fx_originals(text)','EXECUTE')as reader_publish,
        has_function_privilege('world_v2_day_one_fx_source_publisher','world_v2.publish_postwar_day_one_fx_originals(text)','EXECUTE')as publisher_publish,
        has_function_privilege('world_v2_day_one_fx_source_publisher','world_v2.lock_postwar_day_one_fx_original(text,text,text,text,timestamptz)','EXECUTE')as publisher_lock`);
      expect(access.rows).toEqual([
        {
          reader_original: false,
          publisher_original: false,
          reader_raw_seed: false,
          reader_authority_update: false,
          reader_lock: true,
          reader_publish: false,
          publisher_publish: true,
          publisher_lock: false,
        },
      ]);
      const tables = await db.query<{
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }>(
        "select relrowsecurity,relforcerowsecurity from pg_class where relname in('postwar_day_one_fx_source_original','postwar_day_one_fx_quote_original','postwar_day_one_fx_source_revocation','postwar_day_one_fx_quote_revocation')",
      );
      expect(tables.rows).toHaveLength(4);
      expect(
        tables.rows.every((r) => r.relrowsecurity && r.relforcerowsecurity),
      ).toBe(true);
      const denied = async (
        role: string,
        statement: string,
        message: RegExp,
      ) => {
        await db.exec('begin;set local role ' + role);
        try {
          await expect(db.query(statement)).rejects.toThrow(message);
        } finally {
          await db.exec('rollback');
        }
      };
      await denied(
        'world_v2_day_one_fx_source_reader',
        'select * from world_v2.postwar_day_one_fx_quote_original',
        /permission denied/u,
      );
      await denied(
        'world_v2_day_one_fx_source_reader',
        "select * from world_v2.publish_postwar_day_one_fx_originals('{}')",
        /permission denied/u,
      );
      await denied(
        'world_v2_day_one_fx_source_publisher',
        "select * from world_v2.publish_postwar_day_one_fx_originals('{}')",
        /FX_EXACT_NEW_WORLD_DOCUMENT_REQUIRED/u,
      );
      await denied(
        'world_v2_day_one_fx_source_reader',
        "select * from world_v2.lock_postwar_day_one_fx_original('WORLD_OTHER','COUNTRY_01','fake','QUOTE',clock_timestamp())",
        /FX_ACTUAL_WORLD_HEAD_REQUIRED/u,
      );
      await denied(
        'world_v2_day_one_fx_source_reader',
        "select * from world_v2.lock_postwar_day_one_fx_current_authorization('WORLD_OTHER','11111111-1111-4111-8111-111111111111','COUNTRY_01','FINANCE','FINANCE_BUDGET')",
        /FX_EXACT_TREASURY_CAPABILITY_REQUIRED/u,
      );
      await denied(
        'world_v2_day_one_fx_source_reader',
        "select * from world_v2.lock_postwar_day_one_fx_intake_binding('WORLD_OTHER','11111111-1111-4111-8111-111111111111','COUNTRY_01','SOCIAL','SEAT','REV','SOCIAL_LABOUR','SCOPE')",
        /FX_EXACT_TREASURY_INTAKE_REQUIRED/u,
      );
    } finally {
      await db.close();
    }
  });
});
