/** Catalog/immutable-record upgrade only, over explicit TEST_ONLY command and
 * admission metadata. No seed, economic settlement or production deployment. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { describe, it, expect } from 'vitest';
// Existing JS artifact tool has no TS declaration. This linkage describes only
// its read-only parser output; the real module is still imported and exercised.
const { classifyDeltaTransaction } = (await import(
  new URL(
    '../../tools/office-connection/postwar-schema-delta.mjs',
    import.meta.url,
  ).href
)) as { classifyDeltaTransaction(bytes: Buffer): { sourceEnvelope: string } };
const read = (p: string) =>
  readFile(new URL('../../' + p, import.meta.url), 'utf8');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const legacyPath =
    'tests/fixtures/sql/postwar-industry-utility-custody.0cf65bc0.sql',
  upgradePath =
    'database/upgrades/postwar-industry-water-grant-scope-upgrade.sql';
const world = 'WORLD_TEST_ONLY_UPGRADE',
  runId = 'RUN_TEST_ONLY_SAME_LOCAL_ID';
async function fixture(fresh = false) {
  const notices: string[] = [];
  const db = new PGlite();
  try {
    const migration = await read(
        'database/migrations/artifacts/0002_world_v2_command_event_ledger.sql',
      ),
      start = migration.indexOf(
        'create function world_v2.reject_authoritative_history_mutation()',
      ),
      end = migration.indexOf('$$;', start) + 3;
    await db.exec(`create schema world_v2;
create role world_v2_industry_source_owner nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
create role world_v2_industry_source_publisher nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
create role world_v2_industry_source_reader nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
grant usage on schema world_v2 to world_v2_industry_source_owner,world_v2_industry_source_publisher,world_v2_industry_source_reader;
create table world_v2.world_head(world_id text primary key,world_version bigint,event_sequence bigint);
create table world_v2.runtime_opening_admission(world_id text,seed_id text,seed_fingerprint text,replay_binding text,model_version text,admission_ref text,admitted_at_real timestamptz);
create table world_v2.postwar_industry_original(world_id text,registration_ref text,unique(world_id,registration_ref));
create table world_v2.world_writer_lease(world_id text,holder_id text,acquired_at_real timestamptz,renewed_at_real timestamptz,lease_expires_at_real timestamptz,fencing_token bigint);
create table world_v2.command_submission(world_id text,command_id text,schema_version text,command_type text,actor_id text,auth_subject uuid,country_id text,office_id text,expected_world_version bigint,idempotency_key text,correlation_id text,sim_time numeric,submitted_at_real timestamptz,canonical_payload text,command_fingerprint text,payload_sha256 text,primary key(world_id,command_id));
create table world_v2.command_receipt(world_id text,command_id text,outcome text,world_version_after bigint,event_ids jsonb);
create table world_v2.authoritative_event(world_id text,event_id text,event_type text,causation_command_id text,world_version bigint,event_sequence bigint,sim_time numeric,canonical_payload text,event_fingerprint text);`);
    await db.exec(
      'grant select on world_v2.command_submission,world_v2.command_receipt to world_v2_industry_source_owner;',
    );
    await db.exec(migration.slice(start, end));
    const source = await read(
      fresh
        ? 'database/proposals/postwar-industry-utility-custody.sql'
        : legacyPath,
    );
    await db.exec(source);
    const insert = async (country: string) => {
      const suffix = country.slice(-2),
        facility = 'OPEN-' + suffix + '-REFINED_FUEL',
        schedule = 'COMMAND_TEST_ONLY_RUN_' + suffix,
        command = 'COMMAND_TEST_ONLY_GRANT_' + suffix,
        fp = 'sha256:' + sha(command),
        payload = JSON.stringify({
          schemaVersion: 'industry-first-day-utility-command-v1',
          facilityId: facility,
          runId,
          operation: { action: 'GRANT_RIGHT' },
        });
      for (const [id, type, office, body] of [
        [
          schedule,
          'CORE_INDUSTRY_RUN_SCHEDULE_V1',
          'INDUSTRY',
          JSON.stringify({ facilityId: facility, runId }),
        ],
        [command, 'INDUSTRY_FIRST_DAY_WATER_EXECUTE_V1', null, payload],
      ] as const) {
        await db.query(
          "insert into world_v2.command_submission values($1,$2,'command-v1',$3,'ACTOR_TEST_ONLY','11111111-1111-4111-8111-111111111111',$4,$5,0,$2,'CORRELATION_TEST_ONLY',0,'2026-11-08Z',$6,$7,$8)",
          [
            world,
            id,
            type,
            country,
            office,
            body,
            id === command ? fp : 'sha256:' + sha(id),
            'sha256:' + sha(body),
          ],
        );
      }
      await db.query(
        "insert into world_v2.command_receipt values($1,$2,'COMMITTED',1,$3::jsonb)",
        [world, schedule, JSON.stringify(['EVENT_TEST_ONLY_' + suffix])],
      );
      await db.query(
        "insert into world_v2.authoritative_event values($1,$2,'INDUSTRY_FIRST_DAY_RUN_SCHEDULED_V1',$3,1,1,0,'{}',$4)",
        [
          world,
          'EVENT_TEST_ONLY_' + suffix,
          schedule,
          'sha256:' + sha(schedule),
        ],
      );
      await db.query(
        'insert into world_v2.postwar_industry_water_grant_publication values($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          world,
          runId,
          schedule,
          command,
          fp,
          'SOURCE_TEST_ONLY_' + suffix,
          'sha256:' + sha('seed'),
          'ADMISSION_TEST_ONLY',
        ],
      );
      return { country, facility, command, fp, schedule };
    };
    const c2 = await insert('COUNTRY_02');
    const role = async <T>(fn: () => Promise<T>) => {
      await db.exec(
        'set session authorization world_v2_industry_source_publisher',
      );
      try {
        return await fn();
      } finally {
        await db.exec('set session authorization postgres;reset role');
      }
    };
    const recover = (country: string, facility: string) =>
      role(() =>
        db.query<{ command_json: { commandId: string } }>(
          'select * from world_v2.read_postwar_industry_water_grant_publication($1,$2,$3,$4)',
          [world, country, facility, runId],
        ),
      );
    const oldRecover = () =>
      role(() =>
        db.query<{ command_json: { commandId: string } }>(
          'select * from world_v2.read_postwar_industry_water_grant_publication($1,$2)',
          [world, runId],
        ),
      );
    const rows = () =>
      db.query(
        'select * from world_v2.postwar_industry_water_grant_publication order by world_id,command_id',
      );
    const pk = async () =>
      (
        await db.query<{ definition: string }>(
          "select pg_get_constraintdef(oid)as definition from pg_constraint where conrelid='world_v2.postwar_industry_water_grant_publication'::regclass and contype='p'",
        )
      ).rows[0]!.definition;
    return {
      db,
      source,
      c2,
      insert,
      role,
      recover,
      oldRecover,
      rows,
      pk,
      notices,
      upgrade: (sql: string) =>
        db.exec(sql, {
          onNotice: (n) => {
            if (typeof n.message === 'string') notices.push(n.message);
          },
        }),
      sourceGate: async () => {
        await db.exec(`create table world_v2.runtime_admission_publication_permit(authorization_id text primary key,authorization_sha256 text,world_id text,seed_id text,seed_fingerprint text,model_version text,replay_binding text,valid_from timestamptz,valid_until timestamptz);
create table world_v2.runtime_admission_publication_revocation(authorization_id text);
grant select on world_v2.world_head,world_v2.world_writer_lease,world_v2.runtime_opening_admission,world_v2.runtime_admission_publication_permit,world_v2.runtime_admission_publication_revocation to world_v2_industry_source_owner;
grant update(world_version)on world_v2.world_head to world_v2_industry_source_owner;
grant update(holder_id)on world_v2.world_writer_lease to world_v2_industry_source_owner;
grant update(seed_id)on world_v2.runtime_opening_admission to world_v2_industry_source_owner;
grant update(authorization_id)on world_v2.runtime_admission_publication_permit to world_v2_industry_source_owner;`);
        const source = await read(
            'database/proposals/postwar-industry-production-source.sql',
          ),
          start = source.indexOf(
            'create function world_v2.industry_source_admission(',
          ),
          end = source.indexOf(
            'create function world_v2.register_postwar_industry_originals(',
          );
        await db.exec(
          'grant create on schema world_v2 to world_v2_industry_source_owner;' +
            source.slice(start, end) +
            'revoke all on function world_v2.industry_source_admission(text)from public;revoke create on schema world_v2 from world_v2_industry_source_owner;',
        );
        await db.exec(
          await read('database/proposals/postwar-source-revocation-fence.sql'),
        );
        await db.query('insert into world_v2.world_head values($1,1,1)', [
          world,
        ]);
        await db.query(
          "insert into world_v2.world_writer_lease values($1,'WORKER_TEST_ONLY_UPGRADE','2026-11-08Z','2026-11-08Z','2026-11-09Z',1)",
          [world],
        );
        await db.query(
          "insert into world_v2.runtime_opening_admission values($1,'SEED_TEST_ONLY',$2,'TEST_ONLY_REPLAY','TEST_ONLY_MODEL',$3,'2026-11-08Z')",
          [world, 'sha256:' + sha('seed'), 'ADMISSION_' + '2'.repeat(64)],
        );
        await db.query(
          "insert into world_v2.runtime_admission_publication_permit values('PERMIT_TEST_ONLY',$1,$2,'SEED_TEST_ONLY',$3,'TEST_ONLY_MODEL','TEST_ONLY_REPLAY','2026-11-01Z','2026-11-09Z')",
          ['2'.repeat(64), world, 'sha256:' + sha('seed')],
        );
      },
    };
  } catch (e) {
    await db.close();
    throw e;
  }
}
async function rejected(db: PGlite, sql: string) {
  try {
    await db.exec(sql);
    throw Error('EXPECTED_UPGRADE_REJECTION');
  } catch (e) {
    await db.exec('rollback');
    return e;
  }
}
describe('bounded historical water GRANT registry upgrade', () => {
  it('uses the actual 0cf predecessor; replaying its source cannot change the old primary key', async () => {
    const f = await fixture();
    try {
      expect(sha(f.source)).toBe(
        '0341a55519ba0e8eb970ae43acf19980b2f2c3a6134cd97f1695a417907a1fb5',
      );
      const before = await f.rows();
      expect(
        (await rejected(f.db, f.source)) as { code: string },
      ).toMatchObject({ code: '42710' });
      expect(await f.pk()).toBe('PRIMARY KEY (world_id, run_id)');
      expect(await f.rows()).toEqual(before);
      expect((await f.oldRecover()).rows[0]!.command_json.commandId).toBe(
        f.c2.command,
      );
    } finally {
      await f.db.close();
    }
  });
  it('preserves authorized legacy C2 bytes, upgrades idempotently and isolates two countries with the same runId', async () => {
    const f = await fixture();
    try {
      const before = await f.rows(),
        sql = await read(upgradePath);
      await f.upgrade(sql);
      expect(await f.pk()).toBe('PRIMARY KEY (world_id, schedule_command_id)');
      const locks = f.notices.filter((n) =>
        n.startsWith('WATER_GRANT_UPGRADE_LOCK'),
      );
      expect(locks.some((n) => n.includes('timeout=2s elapsed_ms='))).toBe(
        true,
      );
      if (process.env.ECONMIND_UPGRADE_LOCK_EVIDENCE === '1')
        process.stdout.write(
          JSON.stringify({
            kind: 'ACTUAL_PGLITE_UPGRADE_LOCK_NOTICES',
            notices: locks,
            contention: 'NOT_TESTED_SINGLE_BACKEND',
          }) + '\n',
        );
      expect(await f.rows()).toEqual(before);
      expect((await f.oldRecover()).rows[0]!.command_json.commandId).toBe(
        f.c2.command,
      );
      await f.upgrade(sql);
      expect(await f.rows()).toEqual(before);
      await f.sourceGate();
      await expect(
        f.role(async () => {
          await f.db.exec('begin isolation level repeatable read');
          try {
            return await f.db.query(
              'select * from world_v2.publish_postwar_industry_water_grant($1,$2,$3,$4,$5,1,1,$6,$7,$8)',
              [
                world,
                'COUNTRY_10',
                'OPEN-10-REFINED_FUEL',
                'RUN_TEST_ONLY_UNREGISTERED',
                'WORKER_TEST_ONLY_UPGRADE',
                '2026-11-08T12:00:00.000Z',
                '0',
                'sha256:' + sha('not-a-candidate'),
              ],
            );
          } finally {
            await f.db.exec('rollback');
          }
        }),
      ).rejects.toMatchObject({
        code: '55000',
        message: 'WATER_GRANT_REGISTERED_QUOTA_ORIGINAL_REQUIRED',
      });
      const c10 = await f.insert('COUNTRY_10');
      expect(
        (await f.recover('COUNTRY_10', c10.facility)).rows[0]!.command_json
          .commandId,
      ).toBe(c10.command);
      expect(
        (await f.recover('COUNTRY_02', f.c2.facility)).rows[0]!.command_json
          .commandId,
      ).toBe(f.c2.command);
      expect((await f.oldRecover()).rows).toHaveLength(1);
      expect((await f.recover('COUNTRY_10', f.c2.facility)).rows).toEqual([]);
      await f.upgrade(sql);
      expect((await f.rows()).rows).toHaveLength(2);
      const def = (
        await f.db.query<{ prosrc: string }>(
          "select prosrc from pg_proc where oid='world_v2.publish_postwar_industry_water_grant(text,text,text,text,text,bigint,bigint,timestamptz,text,text)'::regprocedure",
        )
      ).rows[0]!.prosrc;
      expect(sha(def)).toBe(
        '7ea0feff174c496cbf2658d02bc3f88532869819d1124fb3d2f0d60ac89c0848',
      );
      expect(def).toContain(
        'read_postwar_industry_water_grant_publication(p_world,p_country,p_facility,p_run)',
      );
      await expect(
        f.role(() =>
          f.db.query(
            'select * from world_v2.postwar_industry_water_grant_publication',
          ),
        ),
      ).rejects.toMatchObject({ code: '42501' });
      expect(
        (
          await f.db.query<{ value: string }>(
            "select current_setting('lock_timeout')as value",
          )
        ).rows[0]!.value,
      ).toBe('0');
    } finally {
      await f.db.close();
    }
  });
  it('leaves the exact fresh successor unchanged when explicitly checked by the upgrade entry', async () => {
    const f = await fixture(true);
    try {
      const before = await f.rows();
      await f.upgrade(await read(upgradePath));
      expect(await f.pk()).toBe('PRIMARY KEY (world_id, schedule_command_id)');
      expect(await f.rows()).toEqual(before);
    } finally {
      await f.db.close();
    }
  });
  it('fails closed on changed RLS, leaving old key and records intact', async () => {
    const f = await fixture();
    try {
      const before = await f.rows();
      await f.db.exec(
        'alter table world_v2.postwar_industry_water_grant_publication disable row level security',
      );
      expect(await rejected(f.db, await read(upgradePath))).toMatchObject({
        message: expect.stringContaining('OWNER_RLS'),
      });
      expect(await f.pk()).toBe('PRIMARY KEY (world_id, run_id)');
      expect(await f.rows()).toEqual(before);
    } finally {
      await f.db.close();
    }
  });
  it('refuses changed owner, columns or function definitions before altering the old key', async () => {
    for (const mutation of [
      'alter table world_v2.postwar_industry_water_grant_publication owner to world_v2_industry_source_publisher',
      'alter table world_v2.postwar_industry_water_grant_publication add column unreviewed text',
      'create or replace function world_v2.read_postwar_industry_water_grant_publication(p_world text,p_run text)returns table(command_json jsonb,command_fingerprint text,publication_status text)language sql security definer set search_path=pg_catalog as $$select null::jsonb,null::text,null::text where false$$',
    ]) {
      const f = await fixture();
      try {
        const before = await f.rows();
        await f.db.exec(mutation);
        expect(await rejected(f.db, await read(upgradePath))).toMatchObject({
          message: expect.stringContaining('WATER_GRANT_UPGRADE_'),
        });
        expect(await f.pk()).toBe('PRIMARY KEY (world_id, run_id)');
        if (!mutation.includes('add column'))
          expect(await f.rows()).toEqual(before);
      } finally {
        await f.db.close();
      }
    }
  });
  it('rejects a duplicate actual schedule without editing either historical row', async () => {
    const f = await fixture();
    try {
      await f.db.exec(
        "insert into world_v2.postwar_industry_water_grant_publication select world_id,run_id||'_CORRUPT_TEST_ONLY',schedule_command_id,command_id,command_fingerprint,source_ref,seed_fingerprint,admission_ref from world_v2.postwar_industry_water_grant_publication",
      );
      const before = await f.rows();
      expect(await rejected(f.db, await read(upgradePath))).toMatchObject({
        message: 'WATER_GRANT_UPGRADE_DUPLICATE_ACTUAL_RUN',
      });
      expect(await f.pk()).toBe('PRIMARY KEY (world_id, run_id)');
      expect(await f.rows()).toEqual(before);
    } finally {
      await f.db.close();
    }
  });
  it('rolls back a failure after the real key/function changes without losing historical rows', async () => {
    const f = await fixture();
    try {
      const before = await f.rows(),
        sql = await read(upgradePath),
        fault = sql.replace(/commit;\s*$/u, 'select 1/0;\ncommit;');
      expect(await rejected(f.db, fault)).toMatchObject({ code: '22012' });
      expect(await f.pk()).toBe('PRIMARY KEY (world_id, run_id)');
      expect(await f.rows()).toEqual(before);
      expect(
        (
          await f.db.query<{ oid: string | null }>(
            "select to_regprocedure('world_v2.read_postwar_industry_water_grant_publication(text,text,text,text)')::text as oid",
          )
        ).rows[0]!.oid,
      ).toBeNull();
      expect((await f.oldRecover()).rows[0]!.command_json.commandId).toBe(
        f.c2.command,
      );
    } finally {
      await f.db.close();
    }
  });
  it('packages only the exact guarded upgrade artifact, never a generic constraint removal', async () => {
    const sql = await read(upgradePath);
    expect(classifyDeltaTransaction(Buffer.from(sql)).sourceEnvelope).toBe(
      'SOURCE_BEGIN_COMMIT',
    );
    for (const altered of [
      sql.replace('in access exclusive mode', 'in share mode'),
      sql.replace('relforcerowsecurity', 'relrowsecurity'),
      sql.replace(
        'primary key(world_id,schedule_command_id)',
        'primary key(world_id,run_id)',
      ),
      sql.replace(
        'drop constraint postwar_industry_water_grant_publication_pkey;',
        'drop constraint postwar_industry_water_grant_publication_pkey cascade;',
      ),
    ])
      expect(() => classifyDeltaTransaction(Buffer.from(altered))).toThrow(
        'DESTRUCTIVE_CREDENTIAL_OR_NONTRANSACTIONAL_SQL_DENIED',
      );
  });
});
