/** Actual official/provider DDL, function-only upgrade and separated low roles.
 * TEST_ONLY immutable source registration, not production/E03 admission or
 * non-C2 economic history. No raw-seed privilege is granted to runtime roles. */
import { readFile } from 'node:fs/promises';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { it, expect } from 'vitest';
import * as C from '../../packages/core/src/index.js';
import { testOpeningSeed } from '../helpers/v08-ledgers.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const read = (p: string) =>
  readFile(new URL('../../database/' + p, import.meta.url), 'utf8');
async function schema(legacy = true) {
  const db = new PGlite();
  try {
    for (const name of [
      '0001_world_v2_namespace',
      '0002_world_v2_command_event_ledger',
      '0003_world_v2_command_receipts_outbox',
      '0005_world_v2_writer_lease_fencing',
      '0007_world_v2_atomic_transition_facts',
      '0009_world_v2_posting_payload_integrity',
      '0011_world_v2_current_commit_authorization',
      '0013_world_v2_read_projection_boundary',
      '0016_world_v2_opening_seed',
    ])
      await db.exec(await read('migrations/artifacts/' + name + '.sql'));
    for (const name of [
      'runtime-read-binding-storage',
      'runtime-admission-publication',
      'social-operating-custody',
      'finance-budget-custody',
      'postwar-office-derived-read',
      'postwar-industry-production-source',
      'postwar-industry-first-day-source',
      'postwar-industry-run-history',
      'postwar-industry-logistics-custody',
      'postwar-source-revocation-fence',
    ]) {
      const sql =
        legacy && name === 'postwar-industry-logistics-custody'
          ? await readFile(
              new URL(
                '../fixtures/sql/postwar-industry-logistics-custody.54964251.sql',
                import.meta.url,
              ),
              'utf8',
            )
          : await read('proposals/' + name + '.sql');
      if (legacy && name === 'postwar-industry-logistics-custody')
        expect(sha(sql)).toBe(
          '62a3666dc4b92cdd258ab85e0bab581c7899e79d41fd3756900f76af00c4cfa6',
        );
      await db.exec(sql);
    }

    return db;
  } catch (e) {
    await db.close();
    throw e;
  }
}
const signatures = [
  'postwar_industry_logistics_order_scope(text,text,text)',
  'read_postwar_industry_logistics_committed_orders(text,text,text,text,text,text,text,text,bigint,bigint,text,text)',
];
it('atomically upgrades only the two exact scopes, preserves metadata/data, and admits actual same-country non-C2 source lookup under fixed roles', async () => {
  const db = await schema();
  const reset = () =>
    db.exec('rollback;reset role;set session authorization postgres');
  const asRole = async <T>(
    login: string,
    role: string,
    run: () => Promise<T>,
  ) => {
    await reset();
    await db.exec('set session authorization ' + login);
    await db.exec('begin isolation level repeatable read');
    try {
      if (role !== login) await db.exec('set local role ' + role);
      const result = await run();
      await db.exec('commit');
      return result;
    } catch (e) {
      await db.exec('rollback');
      throw e;
    } finally {
      await reset();
    }
  };
  const catalog = async () =>
    (
      await db.query<{
        oid: string;
        owner: string;
        acl: string | null;
        prosecdef: boolean;
        proconfig: readonly string[] | null;
        body_sha256: string;
      }>(
        "select p.oid::text,pg_get_userbyid(p.proowner)owner,p.proacl::text acl,p.prosecdef,p.proconfig,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')body_sha256 from pg_proc p where p.oid=any(array[('world_v2.'||$1)::regprocedure,('world_v2.'||$2)::regprocedure])order by p.oid",
        signatures,
      )
    ).rows;
  try {
    const before = await catalog(),
      upgrade = await read(
        'upgrades/postwar-industry-logistics-multicountry-scope-upgrade.sql',
      );
    await db.exec(upgrade);
    const after = await catalog();
    expect(
      after.map(({ body_sha256, ...m }) => {
        void body_sha256;
        return m;
      }),
    ).toEqual(
      before.map(({ body_sha256, ...m }) => {
        void body_sha256;
        return m;
      }),
    );
    expect(after.map((r) => r.body_sha256)).not.toEqual(
      before.map((r) => r.body_sha256),
    );
    await db.exec(upgrade);
    expect(await catalog()).toEqual(after);
    const world = C.worldId('WORLD_LOGISTICS_MULTI_SCOPE_TEST_ONLY'),
      seed = testOpeningSeed({ worldId: world, sha256Hex: sha }),
      at = new Date().toISOString(),
      { fingerprint, ...intent } = seed,
      replay = C.canonicalSerialize(seed.replayBinding);
    await db.query('insert into world_v2.world_head values($1,0,0)', [world]);
    await db.query(
      'insert into world_v2.opening_seed values($1,$2,0,$3,$4,$5,$6)',
      [
        world,
        seed.seedId,
        replay,
        C.canonicalSerialize(intent),
        fingerprint,
        at,
      ],
    );
    const caller = 'world_v2_opening_admission_logistics_multi_test';
    await db.exec(
      `create role ${caller} nologin noinherit;grant usage on schema world_v2 to ${caller};grant execute on function world_v2.publish_runtime_admission_publication(text,text,text)to ${caller}`,
    );
    const claims = {
      schemaVersion: 'opening-publication-authorization-v1',
      purpose: 'AUTHORIZE_OFFICIAL_OPENING_ADMISSION_PUBLICATION',
      authorizationId: 'AUTH_TEST_ONLY_LOGISTICS_MULTI',
      keyId: 'TEST_ONLY_KEY',
      ownerIdentity: 'TEST_ONLY_NOT_OWNER',
      worldId: world,
      seedId: seed.seedId,
      seedFingerprint: fingerprint,
      modelVersion: seed.replayBinding.modelVersion,
      replayBinding: replay,
      sourceBundleSha256: sha('TEST_ONLY_LOGISTICS_MULTI'),
      issuedAtReal: new Date(Date.now() - 86400000).toISOString(),
      expiresAtReal: new Date(Date.now() + 86400000).toISOString(),
    };
    const bytes = C.canonicalSerialize(claims),
      digest = sha(bytes),
      admission = 'ADMISSION_' + digest.toUpperCase();
    await asRole(
      'world_v2_admission_release',
      'world_v2_admission_release',
      () =>
        db.query(
          'insert into world_v2.runtime_admission_publication_permit(authorization_id,authorization_sha256,canonical_authorization,signature_base64url,world_id,seed_id,seed_fingerprint,model_version,replay_binding,source_bundle_sha256,caller_session_role,valid_from,valid_until)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
          [
            claims.authorizationId,
            digest,
            bytes,
            sign(
              null,
              Buffer.from(bytes),
              generateKeyPairSync('ed25519').privateKey,
            ).toString('base64url'),
            world,
            seed.seedId,
            fingerprint,
            claims.modelVersion,
            replay,
            claims.sourceBundleSha256,
            caller,
            claims.issuedAtReal,
            claims.expiresAtReal,
          ],
        ),
    );
    await asRole(caller, caller, () =>
      db.query(
        'select world_v2.publish_runtime_admission_publication($1,$2,$3)',
        [claims.authorizationId, digest, claims.sourceBundleSha256],
      ),
    );
    const country = 'COUNTRY_10',
      facility = 'OPEN-10-REFINED_FUEL',
      registration = 'REG_TEST_ONLY_C10_SCOPE';
    const text = C.canonicalSerialize({
        worldId: world,
        countryId: country,
        facilityId: facility,
        operatorId: 'ENTITY_OPERATOR_10',
        seedId: seed.seedId,
        seedFingerprint: fingerprint,
        admissionRef: admission,
        classification: 'TEST_ONLY_SQL_SCOPE_NOT_E03_OR_OPERATING_AUTHORITY',
      }),
      hash = sha(text),
      ref = 'INDUSTRY_FIRST_DAY_' + hash.toUpperCase();
    await db.query(
      'insert into world_v2.postwar_industry_original(world_id,country_id,facility_id,registration_ref,seed_fingerprint,admission_ref,operating_source_id,operating_source_hash,checksums_sha256,owner_original_sha256,document_text,document_sha256)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10,$11)',
      [
        world,
        country,
        facility,
        registration,
        fingerprint,
        admission,
        seed.sources[0]!.sourceId,
        seed.sources[0]!.payloadHash,
        'a'.repeat(64),
        text,
        hash,
      ],
    );
    await db.query(
      'insert into world_v2.postwar_industry_first_day_source values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
      [
        world,
        country,
        facility,
        ref,
        registration,
        seed.seedId,
        fingerprint,
        admission,
        'TEST_ONLY_FIRST_DAY_POLICY',
        'b'.repeat(64),
        'c'.repeat(64),
        text,
        hash,
      ],
    );
    await db.exec(
      'create role logistics_multi_reader login noinherit nosuperuser nobypassrls nocreatedb nocreaterole;grant world_v2_industry_source_reader to logistics_multi_reader',
    );
    await db.query(
      "insert into world_v2.social_operating_source_registration(world_id,country_id,registration_ref,seed_fingerprint,source_id,source_payload_hash,admission_ref,issuer_role)values($1,$2,$3,$4,$5,$6,$7,'world_v2_social_source_publisher')",
      [
        world,
        country,
        'TEST_ONLY_C10_SOCIAL_HOST',
        fingerprint,
        seed.sources[0]!.sourceId,
        seed.sources[0]!.payloadHash,
        admission,
      ],
    );
    await db.exec(
      'create role logistics_multi_social_reader login noinherit nosuperuser nobypassrls nocreatedb nocreaterole;grant world_v2_social_source_reader to logistics_multi_social_reader',
    );
    await expect(
      asRole(
        'logistics_multi_social_reader',
        'world_v2_social_source_reader',
        () =>
          db.query(
            'select * from world_v2.read_postwar_industry_logistics_committed_orders($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
            [
              world,
              country,
              'SOCIAL',
              country,
              facility,
              'UNKNOWN_RUN',
              'UNKNOWN_COMMAND',
              'sha256:' + '0'.repeat(64),
              0,
              0,
              fingerprint,
              admission,
            ],
          ),
      ),
    ).rejects.toMatchObject({
      code: '55000',
      message: 'LOGISTICS_HISTORY_EXACT_COMMAND_REQUIRED',
    });
    const args = [
      world,
      country,
      facility,
      'ACTUAL_EMPTY_RUN',
      0,
      0,
      fingerprint,
      admission,
    ];
    const query = () =>
      db.query(
        'select * from world_v2.read_postwar_industry_logistics_orders($1,$2,$3,$4,$5,$6,$7,$8)',
        args,
      );
    await expect(
      asRole('logistics_multi_reader', 'logistics_multi_reader', query),
    ).rejects.toMatchObject({ code: '42501' });
    expect(
      (
        await asRole(
          'logistics_multi_reader',
          'world_v2_industry_source_reader',
          query,
        )
      ).rows,
    ).toEqual([]);
    await expect(
      asRole('logistics_multi_reader', 'world_v2_industry_source_reader', () =>
        db.query(
          'select * from world_v2.read_postwar_industry_logistics_orders($1,$2,$3,$4,$5,$6,$7,$8)',
          [...args.slice(0, 2), 'OPEN-02-REFINED_FUEL', ...args.slice(3)],
        ),
      ),
    ).rejects.toMatchObject({ code: '22023' });
    await expect(
      asRole('logistics_multi_reader', 'world_v2_industry_source_reader', () =>
        db.query(
          'select * from world_v2.read_postwar_industry_logistics_orders($1,$2,$3,$4,$5,$6,$7,$8)',
          [...args.slice(0, 6), 'sha256:' + '0'.repeat(64), admission],
        ),
      ),
    ).rejects.toMatchObject({
      code: '55000',
      message: 'LOGISTICS_ORDER_ACTUAL_HEAD_AND_PINS_REQUIRED',
    });
    await expect(
      asRole('logistics_multi_reader', 'world_v2_industry_source_reader', () =>
        db.query('select canonical_payload from world_v2.opening_seed'),
      ),
    ).rejects.toMatchObject({ code: '42501' });
    expect(
      (
        await db.query(
          'select count(*)::text count from world_v2.authoritative_event',
        )
      ).rows,
    ).toEqual([{ count: '0' }]);
  } finally {
    await db.close();
  }
}, 30000);

it('rolls back the first replacement when the second predecessor is unknown', async () => {
  const db = await schema();
  try {
    const before = (
      await db.query(
        "select prosrc from pg_proc where oid='world_v2.postwar_industry_logistics_order_scope(text,text,text)'::regprocedure",
      )
    ).rows;
    const result = await db.query<{ definition: string }>(
      "select pg_get_functiondef('world_v2.read_postwar_industry_logistics_committed_orders(text,text,text,text,text,text,text,text,bigint,bigint,text,text)'::regprocedure)definition",
    );
    await db.exec(
      result.rows[0]!.definition.replace(
        'LOGISTICS_HISTORY_FIXED_HOST_ROLE_REQUIRED',
        'LOGISTICS_HISTORY_TEST_ONLY_UNKNOWN_BODY',
      ),
    );
    await expect(
      db.exec(
        await read(
          'upgrades/postwar-industry-logistics-multicountry-scope-upgrade.sql',
        ),
      ),
    ).rejects.toMatchObject({
      code: '55000',
      message: 'LOGISTICS_MULTICOUNTRY_EXACT_PREDECESSOR_REQUIRED',
    });
    await db.exec('rollback');
    expect(
      (
        await db.query(
          "select prosrc from pg_proc where oid='world_v2.postwar_industry_logistics_order_scope(text,text,text)'::regprocedure",
        )
      ).rows,
    ).toEqual(before);
  } finally {
    await db.close();
  }
}, 30000);

it('fresh source installs the exact successor, and a changed successor ACL is not accepted as idempotent', async () => {
  const db = await schema(false);
  try {
    const upgrade = await read(
      'upgrades/postwar-industry-logistics-multicountry-scope-upgrade.sql',
    );
    await db.exec(upgrade);
    await db.exec(
      'grant execute on function world_v2.postwar_industry_logistics_order_scope(text,text,text)to public',
    );
    await expect(db.exec(upgrade)).rejects.toMatchObject({
      code: '55000',
      message: 'LOGISTICS_MULTICOUNTRY_EXACT_EXISTING_METADATA_REQUIRED',
    });
    await db.exec('rollback');
  } finally {
    await db.close();
  }
}, 30000);
