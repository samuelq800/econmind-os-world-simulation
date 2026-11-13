import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import {
  boundedOfficeRecoveryBindingQuery,
  POSTWAR_OFFICE_RECOVERY_BINDING_READ_QUERY,
} from '../../apps/world-api/src/integration/bounded-office-command-recovery-service.js';
import { OFFICE_COMMAND_CURRENT_BINDING_QUERY } from '../../apps/world-worker/src/intake/postgres-office-command-intake.js';

const subject = '11111111-1111-4111-8111-111111111111';
const scope = (office: string) =>
  'OFFICE_' +
  Buffer.from('COUNTRY_01').toString('hex').toUpperCase() +
  '_' +
  Buffer.from(office).toString('hex').toUpperCase();
const args = (office = 'FINANCE', capability = 'FINANCE_BUDGET') => [
  'WORLD_TEST_ONLY',
  subject,
  'COUNTRY_01',
  office,
  'SEAT_' + office,
  'REV_TEST_ONLY',
  capability,
  scope(office),
];
describe('postwar recovery uses a genuinely READ ONLY metadata boundary', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create schema world_v2;
      create role world_v2_postwar_projection_owner nologin;
      create role world_v2_finance_budget_source_reader nologin;
      create role world_v2_day_one_fx_source_reader nologin;
      create role world_v2_social_intake_lock_reader nologin;
      create role test_budget_recovery nologin;
      create role test_treasury_recovery nologin;
      create role test_social_recovery nologin;
      grant world_v2_finance_budget_source_reader to test_budget_recovery;
      grant world_v2_day_one_fx_source_reader to test_treasury_recovery;
      grant world_v2_social_intake_lock_reader to test_social_recovery;
      grant usage on schema world_v2 to world_v2_postwar_projection_owner,test_budget_recovery,test_treasury_recovery,test_social_recovery;
      create table world_v2.world_head(world_id text,world_version bigint,event_sequence bigint);
      create table world_v2.opening_seed(world_id text,seed_id text,seed_fingerprint text,replay_binding text);
      create table world_v2.runtime_opening_admission(world_id text,admission_ref text,seed_id text,seed_fingerprint text,model_version text,replay_binding text,admitted_at_real timestamptz);
      create table world_v2.runtime_admission_publication_permit(authorization_id text,authorization_sha256 text,world_id text,seed_id text,seed_fingerprint text,model_version text,replay_binding text,source_bundle_sha256 text,valid_from timestamptz,valid_until timestamptz);
      create table world_v2.runtime_admission_publication_revocation(authorization_id text);
      create table world_v2.runtime_read_seat(world_id text,auth_subject uuid,country_id text,office_id text,team_id text,authorization_revision text,seat_ref text);
      create table world_v2.current_commit_authorization(world_id text,auth_subject uuid,country_id text,office_id text,capability text,team_id text,authorization_version text,active boolean);
      create table world_v2.projection_entitlement(world_id text,auth_subject uuid,authorization_version text,active boolean,revoked_at timestamptz,classification text,scope_key text);
      grant select on all tables in schema world_v2 to world_v2_postwar_projection_owner;
      insert into world_v2.world_head values('WORLD_TEST_ONLY',2,2);
      insert into world_v2.opening_seed values('WORLD_TEST_ONLY','SEED_TEST_ONLY','sha256:'||repeat('a',64),'{"modelVersion":"MODEL_TEST_ONLY"}');
      insert into world_v2.runtime_opening_admission values('WORLD_TEST_ONLY','ADMISSION_'||upper(repeat('b',64)),'SEED_TEST_ONLY','sha256:'||repeat('a',64),'MODEL_TEST_ONLY','{"modelVersion":"MODEL_TEST_ONLY"}','2026-10-30T00:00:00Z');
      insert into world_v2.runtime_admission_publication_permit values('AUTH_TEST_ONLY',repeat('b',64),'WORLD_TEST_ONLY','SEED_TEST_ONLY','sha256:'||repeat('a',64),'MODEL_TEST_ONLY','{"modelVersion":"MODEL_TEST_ONLY"}',repeat('c',64),'2026-01-01','2027-01-01');
    `);
    for (const office of ['FINANCE', 'SOCIAL']) {
      await db.query(
        'insert into world_v2.runtime_read_seat values($1,$2,$3,$4,$5,$6,$7)',
        [
          'WORLD_TEST_ONLY',
          subject,
          'COUNTRY_01',
          office,
          'TEAM_TEST_ONLY',
          'REV_TEST_ONLY',
          'SEAT_' + office,
        ],
      );
      await db.query(
        'insert into world_v2.projection_entitlement values($1,$2,$3,true,null,$4,$5)',
        [
          'WORLD_TEST_ONLY',
          subject,
          'REV_TEST_ONLY',
          'OFFICE_PRIVATE',
          scope(office),
        ],
      );
    }
    for (const [office, capability] of [
      ['FINANCE', 'FINANCE_BUDGET'],
      ['FINANCE', 'FINANCE_TREASURY'],
      ['SOCIAL', 'SOCIAL_LABOUR'],
    ]) {
      await db.query(
        'insert into world_v2.current_commit_authorization values($1,$2,$3,$4,$5,$6,$7,true)',
        [
          'WORLD_TEST_ONLY',
          subject,
          'COUNTRY_01',
          office,
          capability,
          'TEAM_TEST_ONLY',
          'REV_TEST_ONLY',
        ],
      );
    }
    // Execute the original metadata admission helper unchanged; the tiny
    // schema is a contract fixture, not an admitted financial/source World.
    const existing = await readFile(
      new URL(
        '../../database/proposals/postwar-office-derived-read.sql',
        import.meta.url,
      ),
      'utf8',
    );
    const begin = existing.indexOf(
      'create function world_v2.postwar_projection_admission_header(',
    );
    const end = existing.indexOf(
      'create function world_v2.read_postwar_office_projection_seats(',
      begin,
    );
    await db.exec(existing.slice(begin, end));
    await db.exec(
      await readFile(
        new URL(
          '../../database/proposals/postwar-office-recovery-read.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    );
  });
  afterAll(async () => db?.close());

  async function read(role: string, values: string[], readonly = true) {
    await db.exec(readonly ? 'begin read only' : 'begin');
    try {
      await db.exec('set local role ' + role);
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
        subject,
      ]);
      const result = await db.query(
        POSTWAR_OFFICE_RECOVERY_BINDING_READ_QUERY,
        values,
      );
      await db.exec('commit');
      return result;
    } catch (error) {
      await db.exec('rollback');
      throw error;
    }
  }
  it('retains the legacy default and explicitly selects the postwar nonlocking query', () => {
    expect(boundedOfficeRecoveryBindingQuery(undefined)).toBe(
      OFFICE_COMMAND_CURRENT_BINDING_QUERY,
    );
    expect(boundedOfficeRecoveryBindingQuery('POSTWAR_READ_ONLY_V1')).toBe(
      POSTWAR_OFFICE_RECOVERY_BINDING_READ_QUERY,
    );
  });
  it('reads precise Budget, Treasury and Social metadata under actual READ ONLY least roles', async () => {
    for (const [role, office, cap] of [
      ['test_budget_recovery', 'FINANCE', 'FINANCE_BUDGET'],
      ['test_treasury_recovery', 'FINANCE', 'FINANCE_TREASURY'],
      ['test_social_recovery', 'SOCIAL', 'SOCIAL_LABOUR'],
    ]) {
      const result = await read(role!, args(office, cap));
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toMatchObject({
        seat_ref: 'SEAT_' + office,
        authorization_version: 'REV_TEST_ONLY',
        world_version: '2',
        event_sequence: '2',
      });
    }
  });
  it('denies wrong capability, subject, scope and READ WRITE misuse without raw table grants', async () => {
    await expect(
      read('test_budget_recovery', args('FINANCE', 'FINANCE_TREASURY')),
    ).rejects.toMatchObject({ code: '42501' });
    const wrong = args();
    wrong[1] = '22222222-2222-4222-8222-222222222222';
    await expect(read('test_budget_recovery', wrong)).rejects.toMatchObject({
      code: '42501',
    });
    const badScope = args();
    badScope[7] = 'OFFICE_UNKNOWN';
    await expect(read('test_budget_recovery', badScope)).rejects.toMatchObject({
      code: '42501',
    });
    await expect(
      read('test_budget_recovery', args(), false),
    ).rejects.toMatchObject({ code: '42501' });
    const privileges = await db.query<{ raw: boolean; write: boolean }>(
      "select has_table_privilege('test_budget_recovery','world_v2.opening_seed','SELECT')raw,has_table_privilege('test_budget_recovery','world_v2.current_commit_authorization','UPDATE')write",
    );
    expect(privileges.rows[0]).toEqual({ raw: false, write: false });
  });
  it('refuses revoked capability and admission while retaining other precise capabilities', async () => {
    await db.exec(
      "update world_v2.current_commit_authorization set active=false where capability='FINANCE_TREASURY'",
    );
    expect(
      (
        await read(
          'test_treasury_recovery',
          args('FINANCE', 'FINANCE_TREASURY'),
        )
      ).rows,
    ).toHaveLength(0);
    expect((await read('test_budget_recovery', args())).rows).toHaveLength(1);
    await db.exec(
      "update world_v2.current_commit_authorization set active=true;insert into world_v2.runtime_admission_publication_revocation values('AUTH_TEST_ONLY')",
    );
    expect((await read('test_budget_recovery', args())).rows).toHaveLength(0);
  });
  it('demonstrates PostgreSQL rejects the previous row-lock path inside READ ONLY', async () => {
    await db.exec('begin read only');
    try {
      await expect(
        db.query('select * from world_v2.world_head for share'),
      ).rejects.toMatchObject({ code: '25006' });
    } finally {
      await db.exec('rollback');
    }
  });
});
