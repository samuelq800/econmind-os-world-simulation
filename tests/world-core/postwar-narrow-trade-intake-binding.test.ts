/** TEST_ONLY genuine signed admission + actual embedded PostgreSQL metadata
 * boundary. No production grants, economic writes, approvals or native PG. */
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest';
import { installPostwarNarrowTradeCutoffFixture } from '../support/postwar-narrow-trade-cutoff-fixture.js';
import {
  TRADE_INTAKE_BINDING_LOCK_QUERY,
  TRADE_RECOVERY_BINDING_QUERY,
  createPostwarNarrowTradeIntakeAuthorizationPool,
} from '../../apps/world-worker/src/persistence/postwar-narrow-trade-intake-authorization.js';
import { OFFICE_COMMAND_CURRENT_BINDING_QUERY } from '../../apps/world-worker/src/intake/postgres-office-command-intake.js';
import type { Pool } from 'pg';
const scope = (country: string) =>
  'OFFICE_' +
  Buffer.from(country).toString('hex').toUpperCase() +
  '_5452414445';
describe('fixed Trade metadata intake/recovery actual SQL (embedded TEST_ONLY)', () => {
  let db: PGlite,
    f: Awaited<ReturnType<typeof installPostwarNarrowTradeCutoffFixture>>,
    params: string[];
  beforeAll(async () => {
    db = new PGlite();
    f = await installPostwarNarrowTradeCutoffFixture(db);
    await db.exec(
      await readFile(
        new URL(
          '../../database/proposals/postwar-narrow-trade-intake-binding.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    const seat = await db.query<{ seat_ref: string }>(
      'select seat_ref from world_v2.runtime_read_seat where world_id=$1 and auth_subject=$2::uuid and office_id=$3',
      [f.world, f.subject, 'TRADE'],
    );
    params = [
      f.world,
      f.subject,
      f.seller,
      'TRADE',
      seat.rows[0]!.seat_ref,
      f.revision,
      'TRADE_CONTRACTS',
      scope(f.seller),
    ];
  }, 60000);
  afterEach(async () => {
    await f.reset();
  });
  afterAll(async () => {
    await db.close();
  });
  async function ro() {
    await f.reset();
    await db.exec('set session authorization ' + f.readerRole);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      f.subject,
    ]);
    await db.exec('begin isolation level repeatable read read only');
  }
  it('locks genuine current metadata without returning seed bytes or changing permissions, and reads the same pins in READ ONLY recovery', async () => {
    await f.begin();
    const locked = await db.query(TRADE_INTAKE_BINDING_LOCK_QUERY, params);
    expect(locked.rows).toHaveLength(1);
    expect(locked.rows[0]).toMatchObject({
      seat_ref: params[4],
      team_id: f.team,
      authorization_version: f.revision,
      admission_ref: f.admissionRef,
      seed_id: f.seed.seedId,
      seed_fingerprint: f.seed.fingerprint,
      world_version: '0',
      event_sequence: '0',
    });
    expect(Object.keys(locked.rows[0]!)).toHaveLength(9);
    await ro();
    expect((await db.query(TRADE_RECOVERY_BINDING_QUERY, params)).rows).toEqual(
      locked.rows,
    );
    const permissions = await db.query(
      "select has_column_privilege(current_user,'world_v2.current_commit_authorization','authorization_version','UPDATE')auth_update,has_column_privilege(current_user,'world_v2.projection_entitlement','active','UPDATE')entitlement_update,has_column_privilege(current_user,'world_v2.opening_seed','canonical_payload','SELECT')seed_read",
    );
    expect(permissions.rows[0]).toEqual({
      auth_update: false,
      entitlement_update: false,
      seed_read: false,
    });
  });
  it('fails fixed role/subject/office/scope, stale seat/revision and wrong country instead of trusting supplied selectors', async () => {
    for (const changes of [
      { i: 3, value: 'FINANCE' },
      { i: 6, value: 'FINANCE_TREASURY' },
      { i: 7, value: scope(f.buyer) },
      { i: 1, value: '00000000-0000-4000-8000-000000000002' },
    ]) {
      await f.begin();
      const p = [...params];
      p[changes.i] = changes.value;
      await expect(
        db.query(TRADE_INTAKE_BINDING_LOCK_QUERY, p),
      ).rejects.toMatchObject({ code: '42501' });
    }
    for (const changes of [
      { i: 4, value: 'SEAT_STALE' },
      { i: 5, value: 'REV_STALE' },
    ]) {
      await f.begin();
      const p = [...params];
      p[changes.i] = changes.value;
      expect((await db.query(TRADE_INTAKE_BINDING_LOCK_QUERY, p)).rows).toEqual(
        [],
      );
    }
    await f.begin();
    const foreign = [...params];
    foreign[2] = f.buyer;
    foreign[7] = scope(f.buyer);
    expect(
      (await db.query(TRADE_INTAKE_BINDING_LOCK_QUERY, foreign)).rows,
    ).toEqual([]);
    await f.reset();
    await db.query(
      "insert into world_v2.current_commit_authorization values($1,$2::uuid,$3,'FINANCE','FINANCE_TREASURY','TEAM_CONFLICT','REV_CONFLICT',true,now())",
      [f.world, f.subject, f.buyer],
    );
    await f.begin();
    expect(
      (await db.query(TRADE_INTAKE_BINDING_LOCK_QUERY, params)).rows,
    ).toEqual([]);
    expect(
      (
        await db.query(
          'select * from world_v2.lock_postwar_narrow_trade_current_authorization($1,$2::uuid,$3,$4,$5)',
          [f.world, f.subject, f.seller, 'TRADE', 'TRADE_CONTRACTS'],
        )
      ).rows,
    ).toEqual([]);
    await f.reset();
    await db.query(
      "update world_v2.current_commit_authorization set active=false where world_id=$1 and team_id='TEAM_CONFLICT'",
      [f.world],
    );
    await f.reset();
    await db.exec('begin');
    await expect(
      db.query(TRADE_INTAKE_BINDING_LOCK_QUERY, params),
    ).rejects.toMatchObject({ code: '42501' });
  });
  it('keeps recovery read-only and owner inaccessible, and does not cache actual auth/entitlement/admission revocation', async () => {
    await ro();
    await expect(
      db.query(TRADE_INTAKE_BINDING_LOCK_QUERY, params),
    ).rejects.toMatchObject({ code: '42501' });
    await f.begin();
    await expect(
      db.query(TRADE_RECOVERY_BINDING_QUERY, params),
    ).rejects.toMatchObject({ code: '42501' });
    await f.begin();
    await expect(
      db.exec('set role world_v2_postwar_narrow_trade_current_owner'),
    ).rejects.toMatchObject({ code: '42501' });
    for (const sql of [
      'update world_v2.current_commit_authorization set active=false where world_id=$1',
      'update world_v2.projection_entitlement set active=false where world_id=$1',
      'select canonical_payload from world_v2.opening_seed where world_id=$1',
    ]) {
      await f.begin();
      await expect(db.query(sql, [f.world])).rejects.toMatchObject({
        code: '42501',
      });
    }
    await f.reset();
    await db.query(
      'update world_v2.projection_entitlement set active=false,revoked_at=now()where world_id=$1',
      [f.world],
    );
    await f.begin();
    expect(
      (await db.query(TRADE_INTAKE_BINDING_LOCK_QUERY, params)).rows,
    ).toEqual([]);
    await f.reset();
    await db.query(
      'update world_v2.projection_entitlement set active=true,revoked_at=null where world_id=$1',
      [f.world],
    );
    await db.query(
      'update world_v2.current_commit_authorization set active=false where world_id=$1',
      [f.world],
    );
    await ro();
    expect((await db.query(TRADE_RECOVERY_BINDING_QUERY, params)).rows).toEqual(
      [],
    );
    await f.reset();
    await db.query(
      "update world_v2.current_commit_authorization set active=true where world_id=$1 and team_id<>'TEAM_CONFLICT'",
      [f.world],
    );
    const permit = await db.query<{ authorization_id: string }>(
      'select authorization_id from world_v2.runtime_admission_publication_permit where world_id=$1',
      [f.world],
    );
    await db.exec('set role world_v2_admission_release');
    await db.query(
      "insert into world_v2.runtime_admission_publication_revocation(authorization_id,reason_ref)values($1,'TEST_ONLY_TRADE_METADATA_REVOKED')",
      [permit.rows[0]!.authorization_id],
    );
    await db.exec('reset role');
    await ro();
    expect((await db.query(TRADE_RECOVERY_BINDING_QUERY, params)).rows).toEqual(
      [],
    );
  });
});
describe('Trade intake exact borrowed pool wrapper, transport protocol only', () => {
  it('caches one identity, rewrites only the two exact Trade queries and passes every other family through', async () => {
    const calls: { q: unknown; p: unknown }[] = [],
      client = {
        query: async (q: unknown, p: unknown) => {
          calls.push({ q, p });
          return { rows: [] };
        },
        release() {},
      };
    const raw = { connect: async () => client } as unknown as Pick<
        Pool,
        'connect'
      >,
      pool = createPostwarNarrowTradeIntakeAuthorizationPool(raw);
    expect(createPostwarNarrowTradeIntakeAuthorizationPool(raw)).toBe(pool);
    expect(createPostwarNarrowTradeIntakeAuthorizationPool(pool)).toBe(pool);
    const c = await pool.connect(),
      p = [
        'WORLD_TEST',
        'subject',
        'COUNTRY_01',
        'TRADE',
        'SEAT_TEST',
        'REV_TEST',
        'TRADE_CONTRACTS',
        scope('COUNTRY_01'),
      ];
    await c.query(OFFICE_COMMAND_CURRENT_BINDING_QUERY, p);
    await c.query(
      OFFICE_COMMAND_CURRENT_BINDING_QUERY + ' for share of authz,entitlement',
      p,
    );
    await c.query(OFFICE_COMMAND_CURRENT_BINDING_QUERY, [
      ...p.slice(0, 3),
      'FINANCE',
      ...p.slice(4),
    ]);
    await c.query(OFFICE_COMMAND_CURRENT_BINDING_QUERY + ' ', p);
    expect(calls.map((c) => c.q)).toEqual([
      TRADE_INTAKE_BINDING_LOCK_QUERY,
      TRADE_INTAKE_BINDING_LOCK_QUERY,
      OFFICE_COMMAND_CURRENT_BINDING_QUERY,
      OFFICE_COMMAND_CURRENT_BINDING_QUERY + ' ',
    ]);
    expect(() =>
      c.query(OFFICE_COMMAND_CURRENT_BINDING_QUERY, [
        ...p.slice(0, 6),
        'SOCIAL_LABOUR',
        p[7],
      ]),
    ).toThrow('FIXED_PARAMETERS');
    c.release();
  });
});
