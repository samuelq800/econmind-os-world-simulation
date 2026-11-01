/** Actual new/underlying SQL, minimal catalog fixture. Its one-country E03
 * locator is SQL metadata only, not a full operating/Core70 or native proof. */
import { readFile } from 'node:fs/promises';
import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import * as C from '@econmind/core';
import { OPENING_PUBLICATION_SIGNATURE_DOMAIN } from '../../apps/world-worker/src/admission/private-opening-admission-authority.js';
const read = (p: string) =>
  readFile(new URL('../../' + p, import.meta.url), 'utf8');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const world = 'WORLD_TEST_ONLY_BENEFICIAL_CHILD_SQL';
let db: PGlite, fingerprint: string, digest: string, authorizationId: string;
const admissionPublisher = 'world_v2_opening_admission_rent_child_unit';
const query =
  'select * from world_v2.register_postwar_beneficial_rent_social_source_world($1,$2,$3)';
async function role(name: string) {
  await db.exec(
    'reset role;set session authorization postgres;set role ' + name,
  );
}
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
    await db.exec(await read('database/migrations/artifacts/' + id + '.sql'));
  await db.exec(
    await read('database/proposals/runtime-read-binding-storage.sql'),
  );
  await db.exec(
    await read('database/proposals/runtime-admission-publication.sql'),
  );
  await db.exec(await read('database/proposals/social-operating-custody.sql'));
  await db.exec(
    await read(
      'database/proposals/postwar-beneficial-rent-social-publication.sql',
    ),
  );
  const source = C.createOpeningSource(
    {
      schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: C.openingSourceId('SOURCE_TEST_ONLY_CHILD_SQL'),
      sourceKind: 'DOCUMENTED_ASSUMPTION',
      sourceVersion: 'SQL_METADATA_NOT_OPERATING_CORE_PROOF',
      locator: 'TEST_ONLY_SQL_ROLE_AND_HEADER_CONTRACT',
      payload: {
        schemaVersion: 'postwar-operating-genesis-seed-source-v1',
        carrier: {
          socialEmployment: { countries: [{ countryId: 'COUNTRY_01' }] },
        },
      },
    },
    sha,
  );
  const seed = C.createOpeningSeed(
    {
      schemaVersion: C.OPENING_SEED_SCHEMA_VERSION,
      seedId: C.openingSeedId('SEED_TEST_ONLY_CHILD_SQL'),
      worldId: C.worldId(world),
      openingWorldVersion: '0',
      replayBinding: C.CURRENT_REPLAY_BINDING,
      sources: [source],
      inventoryEntries: [],
      financialBatches: [],
    },
    sha,
  );
  const { fingerprint: fp, ...intent } = seed;
  fingerprint = fp;
  const bytes = C.canonicalSerialize(intent);
  digest = sha(bytes);
  await db.query('insert into world_v2.world_head values($1,0,0)', [world]);
  await db.query(
    'insert into world_v2.opening_seed values($1,$2,0,$3,$4,$5,now())',
    [world, seed.seedId, C.canonicalSerialize(seed.replayBinding), bytes, fp],
  );
  await db.exec(
    `create role ${admissionPublisher} nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;grant usage on schema world_v2 to ${admissionPublisher};grant execute on function world_v2.publish_runtime_admission_publication(text,text,text)to ${admissionPublisher}`,
  );
  authorizationId = 'AUTHORIZATION_TEST_ONLY_RENT_CHILD_SQL';
  const now = Date.now();
  const claims = {
    schemaVersion: 'opening-publication-authorization-v1',
    purpose: 'AUTHORIZE_OFFICIAL_OPENING_ADMISSION_PUBLICATION',
    authorizationId,
    keyId: 'TEST_ONLY_EPHEMERAL',
    ownerIdentity: 'TEST_ONLY_NOT_OWNER',
    issuedAtReal: new Date(now - 60000).toISOString(),
    expiresAtReal: new Date(now + 3600000).toISOString(),
    worldId: world,
    seedId: seed.seedId,
    seedFingerprint: fp,
    modelVersion: seed.replayBinding.modelVersion,
    replayBinding: C.canonicalSerialize(seed.replayBinding),
    sourceBundleSha256: sha(C.canonicalSerialize(seed.sources)),
  };
  const authorization = C.canonicalSerialize(claims),
    hash = sha(authorization),
    keys = generateKeyPairSync('ed25519');
  const signed = sign(
    null,
    Buffer.from(OPENING_PUBLICATION_SIGNATURE_DOMAIN + authorization),
    keys.privateKey,
  );
  expect(
    verify(
      null,
      Buffer.from(OPENING_PUBLICATION_SIGNATURE_DOMAIN + authorization),
      keys.publicKey,
      signed,
    ),
  ).toBe(true);
  await role('world_v2_admission_release');
  await db.query(
    'insert into world_v2.runtime_admission_publication_permit(authorization_id,authorization_sha256,canonical_authorization,signature_base64url,world_id,seed_id,seed_fingerprint,model_version,replay_binding,source_bundle_sha256,caller_session_role,valid_from,valid_until)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
    [
      authorizationId,
      hash,
      authorization,
      signed.toString('base64url'),
      world,
      seed.seedId,
      fp,
      claims.modelVersion,
      claims.replayBinding,
      claims.sourceBundleSha256,
      admissionPublisher,
      claims.issuedAtReal,
      claims.expiresAtReal,
    ],
  );
  await db.exec('reset role;set session authorization ' + admissionPublisher);
  await db.query(
    'select world_v2.publish_runtime_admission_publication($1,$2,$3)',
    [authorizationId, hash, claims.sourceBundleSha256],
  );
});
afterAll(async () => {
  await db?.close();
});
describe('child Social fixed publication SQL without raw role grants', () => {
  it('registers using the actual admitted child header and actual stored raw SHA, including idempotent repeat', async () => {
    await role('world_v2_social_source_publisher');
    for (let i = 0; i < 2; i++) {
      const r = await db.query<Record<string, unknown>>(query, [
        world,
        fingerprint,
        digest,
      ]);
      expect(r.rows).toHaveLength(1);
      expect(r.rows[0]?.seed_fingerprint).toBe(fingerprint);
      expect(r.rows[0]?.issuer_role).toBe('world_v2_social_source_publisher');
    }
    await expect(
      db.query('select canonical_payload from world_v2.opening_seed'),
    ).rejects.toMatchObject({ code: '42501' });
  });
  it('rejects a parent/other child fingerprint, wrong raw digest and unprivileged source reader', async () => {
    await role('world_v2_social_source_publisher');
    await expect(
      db.query(query, [world, 'sha256:' + 'a'.repeat(64), digest]),
    ).rejects.toThrow('BENEFICIAL_SOCIAL_ACTUAL_CHILD_HEADER_REQUIRED');
    await expect(
      db.query(query, [world, fingerprint, 'f'.repeat(64)]),
    ).rejects.toThrow('BENEFICIAL_SOCIAL_ACTUAL_CHILD_HEADER_REQUIRED');
    await role('world_v2_social_source_reader');
    await expect(
      db.query(query, [world, fingerprint, digest]),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      db.query('select canonical_payload from world_v2.opening_seed'),
    ).rejects.toMatchObject({ code: '42501' });
  });
  it('does not let matching hashes or an existing registration bypass a revoked permit', async () => {
    await role('world_v2_admission_release');
    await db.query(
      'insert into world_v2.runtime_admission_publication_revocation(authorization_id,reason_ref)values($1,$2)',
      [authorizationId, 'TEST_ONLY_REVOKED'],
    );
    await role('world_v2_social_source_publisher');
    await expect(db.query(query, [world, fingerprint, digest])).rejects.toThrow(
      'SOCIAL_REAL_SIGNED_ADMISSION_REVOKED_OR_MISSING',
    );
  });
});
