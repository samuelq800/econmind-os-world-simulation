/** Actual candidate SQL in PGlite, tiny TEST_ONLY metadata fixture. Ephemeral
 * signature/permit is not Owner approval, Social originals or native lock proof. */
import { readFile } from 'node:fs/promises';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import * as C from '@econmind/core';
import { OPENING_PUBLICATION_SIGNATURE_DOMAIN } from '../../apps/world-worker/src/admission/private-opening-admission-authority.js';

const read = (p: string) =>
  readFile(new URL('../../' + p, import.meta.url), 'utf8');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const world = 'WORLD_TEST_ONLY_SOCIAL_INTAKE',
  otherWorld = 'WORLD_TEST_ONLY_OTHER';
const subject = '11111111-1111-4111-8111-111111111111';
const pub = 'world_v2_opening_admission_social_unit',
  intake = 'fixture_social_intake_unit';
const country = 'COUNTRY_01',
  scope = 'OFFICE_434F554E5452595F3031_534F4349414C';
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
  'SOCIAL',
  seat,
  'REV_1',
  'SOCIAL_LABOUR',
  scope,
];
const query =
  'select * from world_v2.lock_social_intake_binding($1,$2::uuid,$3,$4,$5,$6,$7,$8)';
beforeAll(async () => {
  db = new PGlite();
  for (const id of [
    '0001_world_v2_namespace',
    '0002_world_v2_command_event_ledger',
    '0003_world_v2_command_receipts_outbox',
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
      sourceId: C.openingSourceId('SOURCE_TEST_ONLY_SOCIAL_INTAKE'),
      sourceKind: 'DOCUMENTED_ASSUMPTION',
      locator: 'fixture://TEST_ONLY/metadata-not-operating-admission',
      sourceVersion: 'TEST_ONLY',
      payload: { meaning: 'SQL_METADATA_ONLY_NOT_SOCIAL_OPERATING_SOURCE' },
    },
    sha,
  );
  const seed = C.createOpeningSeed(
    {
      schemaVersion: C.OPENING_SEED_SCHEMA_VERSION,
      seedId: C.openingSeedId('SEED_TEST_ONLY_SOCIAL_INTAKE'),
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
      authorizationId: 'AUTHORIZATION_TEST_ONLY_SOCIAL_INTAKE',
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
  await db.exec(await read('database/proposals/social-operating-custody.sql'));
  await db.exec(
    await read('database/proposals/social-intake-authorization.sql'),
  );
  await db.exec(
    `create role ${intake} nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;grant world_v2_social_intake_lock_reader to ${intake}`,
  );
  for (const w of [world, otherWorld]) {
    await db.query(
      "insert into world_v2.current_commit_authorization values($1,$2::uuid,$3,'SOCIAL','SOCIAL_LABOUR','TEAM_TEST_ONLY','REV_1',true,now())",
      [w, subject, country],
    );
    await db.query(
      "insert into world_v2.runtime_read_seat(world_id,auth_subject,country_id,office_id,team_id,authorization_revision)values($1,$2::uuid,$3,'SOCIAL','TEAM_TEST_ONLY','REV_1')",
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
describe('actual fixed Social intake SQL metadata cutoff, no authority UPDATE role', () => {
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
          `select has_any_column_privilege(current_user,'world_v2.current_commit_authorization','UPDATE')as auth_update,has_any_column_privilege(current_user,'world_v2.projection_entitlement','UPDATE')as entitlement_update,has_column_privilege(current_user,'world_v2.opening_seed','canonical_payload','SELECT')as raw_seed,pg_has_role(current_user,'world_v2_social_source_reader','MEMBER')as source_reader_member`,
        )
      ).rows,
    ).toEqual([
      {
        auth_update: false,
        entitlement_update: false,
        raw_seed: false,
        source_reader_member: false,
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
  it('rejects subject/office/capability/scope confusion and does not turn missing signed admission into an empty success', async () => {
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
    await expect(db.query(query, missing)).rejects.toThrow(
      'SOCIAL_REAL_IMMUTABLE_ADMISSION_REQUIRED',
    );
    const wrongCountry = args();
    wrongCountry[2] = 'COUNTRY_02';
    wrongCountry[7] = 'OFFICE_434F554E5452595F3032_534F4349414C';
    expect((await db.query(query, wrongCountry)).rows).toHaveLength(0);
  });
  it('keeps owner metadata visibility at the exact World and forbids actual entitlement DML despite lock permission', async () => {
    await admin();
    await db.exec('set session authorization world_v2_social_source_owner');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      subject,
    ]);
    await db.query(
      "select set_config('econmind.social_custody_world',$1,false)",
      [world],
    );
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
});
