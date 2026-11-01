/** Actual candidate SQL in PGlite, tiny TEST_ONLY metadata fixture. Ephemeral
 * signature/permit is not Owner approval, Captain originals or native lock proof. */
import { readFile } from 'node:fs/promises';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import * as C from '@econmind/core';
import { OPENING_PUBLICATION_SIGNATURE_DOMAIN } from '../../apps/world-worker/src/admission/private-opening-admission-authority.js';

const read = (p: string) =>
  readFile(new URL('../../' + p, import.meta.url), 'utf8');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const world = 'WORLD_TEST_ONLY_CAPTAIN_INTAKE',
  otherWorld = 'WORLD_TEST_ONLY_OTHER';
const subject = '11111111-1111-4111-8111-111111111111';
const pub = 'world_v2_opening_admission_captain_unit',
  intake = 'fixture_captain_intake_unit';
const country = 'COUNTRY_01',
  scope = 'OFFICE_434F554E5452595F3031_4341505441494E';
let db: PGlite, seat: string;
const admin = async () => {
  await db.exec('reset role;set session authorization postgres');
};
const asIntake = async () => {
  await admin();
  await db.exec(`set session authorization ${intake}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    subject,
  ]);
};
const args = () => [
  world,
  subject,
  country,
  'CAPTAIN',
  seat,
  'REV_1',
  'CAPTAIN_CABINET',
  scope,
];
const query =
  'select * from world_v2.lock_postwar_captain_intake_binding($1,$2::uuid,$3,$4,$5,$6,$7,$8)';
beforeAll(async () => {
  db = new PGlite();
  for (const id of [
    '0001_world_v2_namespace',
    '0002_world_v2_command_event_ledger',
    '0003_world_v2_command_receipts_outbox',
    '0005_world_v2_writer_lease_fencing',
    '0007_world_v2_atomic_transition_facts',
    '0011_world_v2_current_commit_authorization',
    '0013_world_v2_read_projection_boundary',
    '0016_world_v2_opening_seed',
  ])
    await db.exec(await read(`database/migrations/artifacts/${id}.sql`));
  await db.exec(
    await read('database/proposals/runtime-read-binding-storage.sql'),
  );
  const source = C.createOpeningSource(
    {
      schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: C.openingSourceId('SOURCE_TEST_ONLY_CAPTAIN_INTAKE'),
      sourceKind: 'DOCUMENTED_ASSUMPTION',
      locator: 'fixture://TEST_ONLY/metadata-not-operating-admission',
      sourceVersion: 'TEST_ONLY',
      payload: { meaning: 'SQL_METADATA_ONLY_NOT_CAPTAIN_OPERATING_SOURCE' },
    },
    sha,
  );
  const seed = C.createOpeningSeed(
    {
      schemaVersion: C.OPENING_SEED_SCHEMA_VERSION,
      seedId: C.openingSeedId('SEED_TEST_ONLY_CAPTAIN_INTAKE'),
      worldId: C.worldId(world),
      openingWorldVersion: '0',
      replayBinding: C.CURRENT_REPLAY_BINDING,
      sources: [source],
      inventoryEntries: [],
      financialBatches: [],
    },
    sha,
  );
  const { fingerprint, ...intent } = seed;
  await db.query('insert into world_v2.world_head values($1,0,0),($2,0,0)', [
    world,
    otherWorld,
  ]);
  await db.query(
    'insert into world_v2.opening_seed values($1,$2,0,$3,$4,$5,now())',
    [
      world,
      seed.seedId,
      C.canonicalSerialize(seed.replayBinding),
      C.canonicalSerialize(intent),
      fingerprint,
    ],
  );
  await db.exec(
    await read('database/proposals/runtime-admission-publication.sql'),
  );
  await db.exec(`create role ${pub} nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
    grant usage on schema world_v2 to ${pub};
    grant execute on function world_v2.read_runtime_admission_publication_authorization(text),world_v2.lock_runtime_admission_publication(text,text,text),world_v2.publish_runtime_admission_publication(text,text,text),world_v2.read_runtime_admission_publication(text,text,text)to ${pub}`);
  const clock = Date.now(),
    sourceHash = 'a'.repeat(64),
    claims = {
      schemaVersion: 'opening-publication-authorization-v1',
      purpose: 'AUTHORIZE_OFFICIAL_OPENING_ADMISSION_PUBLICATION',
      authorizationId: 'AUTHORIZATION_TEST_ONLY_CAPTAIN_INTAKE',
      keyId: 'TEST_ONLY_EPHEMERAL',
      ownerIdentity: 'TEST_ONLY_NOT_OWNER',
      issuedAtReal: new Date(clock - 3600000).toISOString(),
      expiresAtReal: new Date(clock + 3600000).toISOString(),
      worldId: world,
      seedId: seed.seedId,
      seedFingerprint: fingerprint,
      modelVersion: C.CURRENT_REPLAY_BINDING.modelVersion,
      replayBinding: C.canonicalSerialize(C.CURRENT_REPLAY_BINDING),
      sourceBundleSha256: sourceHash,
    };
  const bytes = C.canonicalSerialize(claims),
    hash = sha(bytes),
    keys = generateKeyPairSync('ed25519');
  const signature = sign(
    null,
    Buffer.from(OPENING_PUBLICATION_SIGNATURE_DOMAIN + bytes),
    keys.privateKey,
  ).toString('base64url');
  await db.exec('set role world_v2_admission_release');
  await db.query(
    `insert into world_v2.runtime_admission_publication_permit(authorization_id,authorization_sha256,canonical_authorization,signature_base64url,world_id,seed_id,seed_fingerprint,model_version,replay_binding,source_bundle_sha256,caller_session_role,valid_from,valid_until)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      claims.authorizationId,
      hash,
      bytes,
      signature,
      world,
      seed.seedId,
      fingerprint,
      claims.modelVersion,
      claims.replayBinding,
      sourceHash,
      pub,
      claims.issuedAtReal,
      claims.expiresAtReal,
    ],
  );
  await db.exec(`reset role;set session authorization ${pub}`);
  await db.query(
    'select world_v2.publish_runtime_admission_publication($1,$2,$3)',
    [claims.authorizationId, hash, sourceHash],
  );
  await admin();
  await db.exec(await read('database/proposals/captain-operating-custody.sql'));
  await db.exec(
    await read('database/proposals/postwar-captain-source-publication.sql'),
  );
  await db.exec(
    await read('database/proposals/postwar-captain-intake-binding.sql'),
  );
  await db.exec(
    `create role ${intake} nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;grant world_v2_captain_source_reader to ${intake}`,
  );
  for (const w of [world, otherWorld]) {
    await db.query(
      "insert into world_v2.current_commit_authorization values($1,$2::uuid,$3,'CAPTAIN','CAPTAIN_CABINET','TEAM_TEST_ONLY','REV_1',true,now())",
      [w, subject, country],
    );
    await db.query(
      "insert into world_v2.runtime_read_seat(world_id,auth_subject,country_id,office_id,team_id,authorization_revision)values($1,$2::uuid,$3,'CAPTAIN','TEAM_TEST_ONLY','REV_1')",
      [w, subject, country],
    );
    await db.query(
      "insert into world_v2.projection_entitlement values($1,$2::uuid,'OFFICE_PRIVATE',$3,'REV_1',true,now(),null)",
      [w, subject, scope],
    );
  }
  seat = (
    await db.query<{ seat_ref: string }>(
      'select seat_ref from world_v2.runtime_read_seat where world_id=$1',
      [world],
    )
  ).rows[0]!.seat_ref;
}, 30_000);
afterAll(async () => {
  await db?.close();
});
describe('actual fixed Captain intake SQL metadata cutoff, no reader authority UPDATE role', () => {
  it('returns the actual current metadata under the scoped role without raw seed or authority/entitlement writes', async () => {
    await asIntake();
    const rows = (await db.query<Record<string, string>>(query, args())).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      seat_ref: seat,
      team_id: 'TEAM_TEST_ONLY',
      authorization_version: 'REV_1',
      world_version: '0',
      event_sequence: '0',
    });
    expect(
      (
        await db.query(
          `select has_any_column_privilege(current_user,'world_v2.current_commit_authorization','UPDATE')as auth_update,has_any_column_privilege(current_user,'world_v2.projection_entitlement','UPDATE')as entitlement_update,has_column_privilege(current_user,'world_v2.opening_seed','canonical_payload','SELECT')as raw_seed,pg_has_role(current_user,'world_v2_captain_source_reader','MEMBER')as source_reader_member`,
        )
      ).rows,
    ).toEqual([
      {
        auth_update: false,
        entitlement_update: false,
        raw_seed: false,
        source_reader_member: true,
      },
    ]);
    await expect(
      db.exec('update world_v2.current_commit_authorization set active=false'),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      db.exec('update world_v2.projection_entitlement set active=false'),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      db.exec('select canonical_payload from world_v2.opening_seed'),
    ).rejects.toMatchObject({ code: '42501' });
  });
  it('rejects subject/office/capability/scope confusion and returns no binding for missing signed admission', async () => {
    await asIntake();
    for (const [index, value] of [
      [1, '22222222-2222-4222-8222-222222222222'],
      [3, 'FINANCE'],
      [6, 'FINANCE_BUDGET'],
      [7, 'OFFICE_OTHER'],
    ] as const) {
      const changed = args();
      changed[index] = value;
      await expect(db.query(query, changed)).rejects.toMatchObject({
        code: '42501',
      });
    }
    const missing = args();
    missing[0] = otherWorld;
    expect((await db.query(query, missing)).rows).toHaveLength(0);
    const wrongCountry = args();
    wrongCountry[2] = 'COUNTRY_02';
    wrongCountry[7] = 'OFFICE_434F554E5452595F3032_4341505441494E';
    expect((await db.query(query, wrongCountry)).rows).toHaveLength(0);
  });
  it('keeps owner metadata visibility at the exact World and forbids actual entitlement DML despite lock permission', async () => {
    await admin();
    await db.exec('set session authorization world_v2_captain_source_owner');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      subject,
    ]);
    await db.query("select set_config('econmind.captain_world',$1,false)", [
      world,
    ]);
    expect(
      (await db.query('select world_id from world_v2.runtime_read_seat')).rows,
    ).toEqual([{ world_id: world }]);
    expect(
      (await db.query('select world_id from world_v2.projection_entitlement'))
        .rows,
    ).toEqual([{ world_id: world }]);
    await expect(
      db.exec('update world_v2.projection_entitlement set active=active'),
    ).rejects.toMatchObject({ code: '42501' });
  });
  it('reads fresh recovery metadata in a genuinely READ ONLY transaction without any row locks', async () => {
    await asIntake();
    await db.exec('begin isolation level repeatable read read only');
    try {
      const recovered = await db.query(
        'select * from world_v2.read_postwar_captain_recovery_binding($1,$2::uuid,$3,$4,$5,$6,$7,$8)',
        args(),
      );
      expect(recovered.rows).toHaveLength(1);
      expect(recovered.rows[0]).toMatchObject({
        seat_ref: seat,
        authorization_version: 'REV_1',
        world_version: '0',
        event_sequence: '0',
      });
      expect(
        (await db.query("select current_setting('transaction_read_only')as ro"))
          .rows,
      ).toEqual([{ ro: 'on' }]);
      // If a nested admission helper retained FOR SHARE, PostgreSQL rejects the
      // actual recovery call above; this is not a textual no-lock assertion.
    } finally {
      await db.exec('rollback');
    }
    await expect(
      db.query(
        'select * from world_v2.read_postwar_captain_recovery_binding($1,$2::uuid,$3,$4,$5,$6,$7,$8)',
        args(),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });
  it('freshly denies changed current authorization and entitlement, without deleting immutable seats', async () => {
    await admin();
    await db.query(
      'update world_v2.current_commit_authorization set active=false where world_id=$1',
      [world],
    );
    await asIntake();
    expect((await db.query(query, args())).rows).toHaveLength(0);
    await admin();
    await db.query(
      'update world_v2.current_commit_authorization set active=true where world_id=$1',
      [world],
    );
    await db.query(
      'update world_v2.projection_entitlement set active=false,revoked_at=clock_timestamp() where world_id=$1',
      [world],
    );
    await asIntake();
    expect((await db.query(query, args())).rows).toHaveLength(0);
    await admin();
    await db.query(
      'update world_v2.projection_entitlement set active=true,revoked_at=null where world_id=$1',
      [world],
    );
  });
  it('delegates real current and negative worker lock reads without raw auth UPDATE and preserves the any-active-capability negative predicate', async () => {
    const current =
      'select * from world_v2.lock_postwar_captain_current_authorization($1,$2::uuid,$3,$4,$5)';
    const revoked =
      'select * from world_v2.lock_postwar_captain_revoked_authorization($1,$2::uuid,$3,$4)';
    const workerArgs = [world, subject, country, 'CAPTAIN', 'CAPTAIN_CABINET'];
    await asIntake();
    await db.query("select set_config('request.jwt.claim.sub','',false)");
    expect((await db.query(current, workerArgs)).rows).toEqual([
      {
        auth_subject: subject,
        world_id: world,
        country_id: country,
        office_id: 'CAPTAIN',
        capability: 'CAPTAIN_CABINET',
        team_id: 'TEAM_TEST_ONLY',
        authorization_version: 'REV_1',
      },
    ]);
    expect((await db.query(revoked, workerArgs.slice(0, 4))).rows).toEqual([
      { present: 1 },
    ]);
    await expect(
      db.query(current, [...workerArgs.slice(0, 4), 'OTHER_CAPABILITY']),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      db.query(revoked, [...workerArgs.slice(0, 3), 'FINANCE']),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      db.query(current, [otherWorld, ...workerArgs.slice(1)]),
    ).rejects.toMatchObject({ code: '55000' });
    await admin();
    await db.query(
      'update world_v2.current_commit_authorization set active=false where world_id=$1',
      [world],
    );
    await db.query(
      "insert into world_v2.current_commit_authorization values($1,$2::uuid,$3,'CAPTAIN','TEST_ONLY_OTHER_CAPABILITY','TEAM_TEST_ONLY','REV_1',true,now())",
      [world, subject, country],
    );
    await asIntake();
    expect((await db.query(current, workerArgs)).rows).toHaveLength(0);
    // Cabinet is inactive, but a different active capability must still stop
    // a false AUTHORIZATION_REVOKED receipt; never filter for Cabinet only.
    expect((await db.query(revoked, workerArgs.slice(0, 4))).rows).toEqual([
      { present: 1 },
    ]);
    await admin();
    await db.query(
      "delete from world_v2.current_commit_authorization where world_id=$1 and capability='TEST_ONLY_OTHER_CAPABILITY'",
      [world],
    );
    await db.query(
      'update world_v2.current_commit_authorization set active=true where world_id=$1',
      [world],
    );
  });
  it('denies both binding paths after actual controlled permit revocation and records baseline RLS honestly', async () => {
    await admin();
    const catalog = (
      await db.query<{ relname: string; relrowsecurity: boolean }>(
        "select relname,relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='world_v2'and relname in('current_commit_authorization','runtime_read_seat','projection_entitlement')order by relname",
      )
    ).rows;
    expect(catalog).toEqual([
      { relname: 'current_commit_authorization', relrowsecurity: false },
      { relname: 'projection_entitlement', relrowsecurity: true },
      { relname: 'runtime_read_seat', relrowsecurity: true },
    ]);
    await db.exec('set role world_v2_admission_release');
    await db.query(
      'insert into world_v2.runtime_admission_publication_revocation(authorization_id,reason_ref)values($1,$2)',
      ['AUTHORIZATION_TEST_ONLY_CAPTAIN_INTAKE', 'TEST_ONLY_REVOKED'],
    );
    await asIntake();
    expect((await db.query(query, args())).rows).toHaveLength(0);
    await expect(
      db.query(
        'select * from world_v2.lock_postwar_captain_revoked_authorization($1,$2::uuid,$3,$4)',
        [world, subject, country, 'CAPTAIN'],
      ),
    ).rejects.toMatchObject({ code: '55000' });
    await db.exec('begin isolation level repeatable read read only');
    try {
      expect(
        (
          await db.query(
            'select * from world_v2.read_postwar_captain_recovery_binding($1,$2::uuid,$3,$4,$5,$6,$7,$8)',
            args(),
          )
        ).rows,
      ).toHaveLength(0);
    } finally {
      await db.exec('rollback');
    }
  });
});
