/** Real PG16 permissions/locks only. Ephemeral TEST_ONLY key/permit is NOT an Owner decision or 70-country adoption. */
import { execFile } from 'node:child_process';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { Pool, type PoolClient } from 'pg';
import { describe, expect, it } from 'vitest';
import * as C from '@econmind/core';
import { createOwnedSocialOfficeDatabase } from '../support/f-social-office-isolated-host.js';
import { PostgresSqlDatabase } from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import { WorldOpeningSeedStore } from '../../apps/world-worker/src/persistence/opening-seed-store.js';
import {
  PrivateOpeningAdmissionAuthority,
  resolvePrivateOpeningPublicationAuthorization,
  OPENING_PUBLICATION_SIGNATURE_DOMAIN,
  type OpeningPublicationAuthorization,
  type SignedOpeningPublicationAuthorization,
} from '../../apps/world-worker/src/admission/private-opening-admission-authority.js';

const run = promisify(execFile);
const root = path.resolve(import.meta.dirname, '../..');
const sha = (value: string | Buffer) =>
  createHash('sha256').update(value).digest('hex');
const native =
  process.env.ECONMIND_ADMISSION_NATIVE_TESTS === '1'
    ? describe
    : describe.skip;
const PUBLISHER = 'world_v2_opening_admission_test_native';
const OTHER = 'world_v2_opening_admission_other_native';
const REGISTRAR = 'admission_test_only_registrar';
const RELEASE = 'world_v2_admission_release';
const SOURCE_HASH = sha(
  'TEST_ONLY_EMPTY_SOURCE_CARRIER_NOT_OFFICIAL_ADOPTED_BUNDLE',
);
const SQL = 'database/proposals/runtime-admission-publication.sql';
const publishSql =
  'select world_v2.publish_runtime_admission_publication($1,$2,$3)';
const lockSql =
  'select * from world_v2.lock_runtime_admission_publication($1,$2,$3)';
const readSql =
  'select * from world_v2.read_runtime_admission_publication($1,$2,$3)';
type TestPermit = Readonly<{
  claims: OpeningPublicationAuthorization;
  envelope: SignedOpeningPublicationAuthorization;
  authorizationHash: string;
  args: readonly string[];
}>;

native('controlled admission publication native TEST_ONLY SQL boundary', () => {
  it('enforces exact permits, real sessions, immutable originals, atomic rollback and publication/revocation locks', async () => {
    const owned = await createOwnedSocialOfficeDatabase();
    const pools: Pool[] = [];
    const assertions: string[] = [];
    const evidence: Record<string, unknown> = {
      classification:
        'TEST_ONLY_REAL_PG16_CONTROLLED_SQL_PUBLICATION_NOT_OFFICIAL_SOURCE_ADOPTION',
      testKeyOwnerIdentity: 'TEST_ONLY_NOT_REAL_OWNER',
      officialSeventyCountryAdoption: false,
      sourceAdmitted: false,
      productionAdmission: false,
      WorldClock: false,
      actualRuntimeServicePositive:
        'NOT_RUN_MISSING_REAL_ADOPTED_SOURCE_BUNDLE_AND_OWNER_KEY',
      assertions,
    };
    const note = (name: string) => assertions.push(name);
    const pool = (user: string) => {
      const p = new Pool({
        host: owned.marker.socket,
        port: owned.marker.port,
        database: owned.marker.database,
        user,
        max: 2,
        application_name: 'ECONMIND_ADMISSION_TEST_ONLY',
      });
      pools.push(p);
      return p;
    };
    try {
      const admin = await owned.rolePool('installer');
      const manifest = JSON.parse(
        await readFile(
          path.join(root, 'database/migrations/manifest.json'),
          'utf8',
        ),
      ) as {
        migrations: {
          migration_id: string;
          path: string;
          sha256: string;
          artifact_source_commit: string;
          release_order: number;
        }[];
      };
      expect(manifest.migrations).toHaveLength(23);
      const originals: string[] = [];
      for (const m of manifest.migrations) {
        const bytes = await readFile(path.join(root, m.path));
        const original = await run(
          'git',
          [
            '--no-replace-objects',
            'show',
            `${m.artifact_source_commit}:${m.path}`,
          ],
          { cwd: root, encoding: 'buffer', maxBuffer: 1048576 },
        );
        expect(bytes.equals(original.stdout)).toBe(true);
        expect(sha(bytes)).toBe(m.sha256);
        originals.push(bytes.toString('utf8'));
      }
      await admin.query(
        'create schema storage; create table storage.objects(bucket_id text); alter table storage.objects enable row level security',
      );
      for (const role of ['anon', 'authenticated', 'service_role'])
        await admin.query(
          `create role ${role} nologin noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication`,
        );
      for (const [i, m] of manifest.migrations.entries()) {
        await admin.query(originals[i]!);
        await admin.query(
          'insert into world_v2.schema_release(migration_id,artifact_sha256,source_repo_commit,release_order) values($1,$2,$3,$4)',
          [m.migration_id, m.sha256, m.artifact_source_commit, m.release_order],
        );
      }
      await admin.query(
        await readFile(
          path.join(
            root,
            'database/proposals/runtime-read-binding-storage.sql',
          ),
          'utf8',
        ),
      );
      const seeds = new Map<string, Readonly<C.OpeningSeed>>();
      const store = new WorldOpeningSeedStore({
        database: new PostgresSqlDatabase(admin),
        sha256Hex: sha,
      });
      for (const suffix of [
        'MAIN',
        'BAD_SEED',
        'ALIEN',
        'ADVANCED',
        'REVOKED',
        'EXPIRED',
        'ROLLBACK',
        'RACE',
      ]) {
        const world = `WORLD_ADMISSION_TEST_ONLY_${suffix}`;
        const source = C.createOpeningSource(
          {
            schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
            sourceId: C.openingSourceId(`SOURCE_TEST_ONLY_${suffix}`),
            sourceKind: 'DOCUMENTED_ASSUMPTION',
            locator: 'fixture://TEST_ONLY/native-admission-sql-not-official',
            sourceVersion: 'TEST_ONLY.1',
            payload: { TEST_ONLY: 'EMPTY_SQL_BOUNDARY_FIXTURE_NOT_ADOPTION' },
          },
          sha,
        );
        const seed = C.createOpeningSeed(
          {
            schemaVersion: C.OPENING_SEED_SCHEMA_VERSION,
            seedId: C.openingSeedId(`SEED_ADMISSION_TEST_ONLY_${suffix}`),
            worldId: C.worldId(world),
            openingWorldVersion: '0',
            replayBinding: C.CURRENT_REPLAY_BINDING,
            sources: [source],
            inventoryEntries: [],
            financialBatches: [],
          },
          sha,
        );
        await admin.query(
          'insert into world_v2.world_head(world_id) values($1)',
          [world],
        );
        await store.bootstrap({
          seed,
          bootstrappedAtReal: new Date().toISOString(),
        });
        seeds.set(suffix, seed);
      }
      const main = seeds.get('MAIN')!;
      const admissionValues = [
        main.worldId,
        main.seedId,
        main.fingerprint,
        main.replayBinding.modelVersion,
        C.canonicalSerialize(main.replayBinding),
      ];
      await expect(
        admin.query(
          'insert into world_v2.runtime_opening_admission(world_id,seed_id,seed_fingerprint,model_version,replay_binding) values($1,$2,$3,$4,$5)',
          admissionValues,
        ),
      ).rejects.toMatchObject({ code: '55000' });
      note(
        'original-storage-proposal-default-publication-veto-refuses-direct-insert',
      );
      const proposal = await readFile(path.join(root, SQL), 'utf8');
      evidence.sqlSHA256 = sha(proposal);
      await admin.query(proposal);
      for (const role of [PUBLISHER, OTHER, REGISTRAR])
        await admin.query(
          `create role ${role} login noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication`,
        );
      await admin.query(`grant world_v2_admission_release to ${REGISTRAR}`);
      for (const role of [PUBLISHER, OTHER]) {
        await admin.query(`grant usage on schema world_v2 to ${role}`);
        await admin.query(
          `grant execute on function world_v2.read_runtime_admission_publication_authorization(text),world_v2.lock_runtime_admission_publication(text,text,text),world_v2.publish_runtime_admission_publication(text,text,text),world_v2.read_runtime_admission_publication(text,text,text) to ${role}`,
        );
      }
      const publisher = pool(PUBLISHER),
        other = pool(OTHER),
        registrar = pool(REGISTRAR);
      const roles = (
        await publisher.query(
          `select session_user as session,current_user as role,current_setting('role') as role_setting,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolreplication,has_table_privilege(current_user,'world_v2.world_head','UPDATE') as head_update,has_table_privilege(current_user,'world_v2.runtime_opening_admission','INSERT,UPDATE,DELETE,TRUNCATE') as admission_write from pg_roles where rolname=current_user`,
        )
      ).rows[0];
      expect(roles).toEqual({
        session: PUBLISHER,
        role: PUBLISHER,
        role_setting: 'none',
        rolsuper: false,
        rolbypassrls: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolreplication: false,
        head_update: false,
        admission_write: false,
      });
      evidence.publisherRole = roles;
      const keys = generateKeyPairSync('ed25519');
      const envelopes = new Map<
        string,
        SignedOpeningPublicationAuthorization
      >();
      const authority = new PrivateOpeningAdmissionAuthority({
        trustedKeys: new Map([
          [
            'TEST_ONLY_EPHEMERAL_KEY',
            {
              publicKey: keys.publicKey,
              ownerIdentity: 'TEST_ONLY_NOT_REAL_OWNER',
            },
          ],
        ]),
        registry: {
          load: async (reference) => envelopes.get(reference) ?? null,
        },
      });
      const makePermit = (
        name: string,
        suffix = 'MAIN',
        overrides: Partial<OpeningPublicationAuthorization> = {},
      ): TestPermit => {
        const seed = seeds.get(suffix)!;
        const now = Date.now();
        const claims: OpeningPublicationAuthorization = {
          schemaVersion: 'opening-publication-authorization-v1',
          purpose: 'AUTHORIZE_OFFICIAL_OPENING_ADMISSION_PUBLICATION',
          authorizationId: `AUTHORIZATION_TEST_ONLY_${name}`,
          keyId: 'TEST_ONLY_EPHEMERAL_KEY',
          ownerIdentity: 'TEST_ONLY_NOT_REAL_OWNER',
          issuedAtReal: new Date(now - 60000).toISOString(),
          expiresAtReal: new Date(now + 600000).toISOString(),
          worldId: seed.worldId,
          seedId: seed.seedId,
          seedFingerprint: seed.fingerprint,
          modelVersion: seed.replayBinding.modelVersion,
          replayBinding: C.canonicalSerialize(seed.replayBinding),
          sourceBundleSha256: SOURCE_HASH,
          ...overrides,
        };
        const canonicalAuthorization = C.canonicalSerialize(claims);
        const envelope = {
          canonicalAuthorization,
          signatureBase64Url: sign(
            null,
            Buffer.from(
              OPENING_PUBLICATION_SIGNATURE_DOMAIN + canonicalAuthorization,
            ),
            keys.privateKey,
          ).toString('base64url'),
        };
        envelopes.set(claims.authorizationId, envelope);
        const authorizationHash = sha(canonicalAuthorization);
        return {
          claims,
          envelope,
          authorizationHash,
          args: [claims.authorizationId, authorizationHash, SOURCE_HASH],
        };
      };
      const releaseTransaction = async <T>(
        consume: (client: PoolClient) => Promise<T>,
      ) => {
        const client = await registrar.connect();
        try {
          await client.query('begin');
          await client.query(`set local role ${RELEASE}`);
          const result = await consume(client);
          await client.query('commit');
          return result;
        } catch (error) {
          await client.query('rollback');
          throw error;
        } finally {
          client.release();
        }
      };
      const register = async (
        p: TestPermit,
        rowOverrides: Partial<{
          worldId: string;
          seedId: string;
          authorizationHash: string;
        }> = {},
        verifiedAt = new Date().toISOString(),
      ) => {
        // The actual private issuer verifies an ephemeral TEST_ONLY signature
        // BEFORE fixture registrar enrollment. PostgreSQL trusts that release
        // registrar; it does not itself verify Ed25519 or the official bundle.
        expect(
          await resolvePrivateOpeningPublicationAuthorization(
            authority,
            p.claims.authorizationId,
            verifiedAt,
          ),
        ).toEqual(p.claims);
        await releaseTransaction((client) =>
          client.query(
            `insert into world_v2.runtime_admission_publication_permit(authorization_id,authorization_sha256,canonical_authorization,signature_base64url,world_id,seed_id,seed_fingerprint,model_version,replay_binding,source_bundle_sha256,caller_session_role,valid_from,valid_until) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
            [
              p.claims.authorizationId,
              rowOverrides.authorizationHash ?? p.authorizationHash,
              p.envelope.canonicalAuthorization,
              p.envelope.signatureBase64Url,
              rowOverrides.worldId ?? p.claims.worldId,
              rowOverrides.seedId ?? p.claims.seedId,
              p.claims.seedFingerprint,
              p.claims.modelVersion,
              p.claims.replayBinding,
              p.claims.sourceBundleSha256,
              PUBLISHER,
              p.claims.issuedAtReal,
              p.claims.expiresAtReal,
            ],
          ),
        );
      };
      const count = async (world: string) =>
        Number(
          (
            await admin.query(
              'select count(*)::text as count from world_v2.runtime_opening_admission where world_id=$1',
              [world],
            )
          ).rows[0]!.count,
        );
      const valid = makePermit('VALID');
      await expect(
        publisher.query(publishSql, [...valid.args]),
      ).rejects.toMatchObject({ code: '55000' });
      await expect(
        publisher.query(readSql, [...valid.args]),
      ).rejects.toMatchObject({ code: '55000' });
      expect(
        (
          await publisher.query(
            'select * from world_v2.read_runtime_admission_publication_authorization($1)',
            ['AUTHORIZATION_TEST_ONLY_MISSING'],
          )
        ).rows,
      ).toEqual([]);
      note('installed-entrypoint-without-controlled-permit-remains-denied');
      for (const statement of [
        "insert into world_v2.runtime_opening_admission(world_id) values('WORLD_TEST_ONLY_DENIED')",
        "insert into world_v2.runtime_admission_publication_permit(authorization_id) values('AUTHORIZATION_TEST_ONLY_DENIED')",
        "insert into world_v2.runtime_admission_publication_revocation(authorization_id,reason_ref) values('AUTHORIZATION_TEST_ONLY_DENIED','TEST_ONLY')",
        'update world_v2.world_head set world_version=world_version',
        'select * from world_v2.runtime_opening_admission',
        'set role world_v2_admission_owner',
      ])
        await expect(publisher.query(statement)).rejects.toMatchObject({
          code: '42501',
        });
      note(
        'real-dedicated-session-has-only-four-function-exec-no-owner-membership-or-direct-dml',
      );
      const forged = makePermit('FORGED');
      envelopes.set(forged.claims.authorizationId, {
        ...forged.envelope,
        signatureBase64Url: Buffer.alloc(64).toString('base64url'),
      });
      await expect(register(forged)).rejects.toThrow(
        'OPENING_PUBLICATION_AUTHORIZATION_DENIED',
      );
      expect(
        (
          await admin.query(
            'select count(*)::int as count from world_v2.runtime_admission_publication_permit',
          )
        ).rows[0]!.count,
      ).toBe(0);
      note(
        'real-private-authority-refuses-forged-test-signature-before-registration',
      );
      const badWorld = makePermit('WRONG_WORLD');
      await expect(
        register(badWorld, { worldId: seeds.get('ALIEN')!.worldId }),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        register(makePermit('WRONG_SHA'), {
          authorizationHash: 'b'.repeat(64),
        }),
      ).rejects.toMatchObject({ code: '23514' });
      note(
        'registrar-original-world-and-authorization-byte-hash-binding-mismatch-rolls-back',
      );
      await register(valid);
      await expect(
        publisher.query(publishSql, [
          valid.args[0],
          valid.args[1],
          'b'.repeat(64),
        ]),
      ).rejects.toMatchObject({ code: '55000' });
      await expect(
        publisher.query(publishSql, [
          valid.args[0],
          'b'.repeat(64),
          SOURCE_HASH,
        ]),
      ).rejects.toMatchObject({ code: '55000' });
      await expect(
        other.query(publishSql, [...valid.args]),
      ).rejects.toMatchObject({ code: '55000' });
      const spoof = await admin.connect();
      try {
        await spoof.query('begin');
        await spoof.query(`set local role ${PUBLISHER}`);
        await expect(
          spoof.query(publishSql, [...valid.args]),
        ).rejects.toMatchObject({ code: '42501' });
      } finally {
        await spoof.query('rollback');
        spoof.release();
      }
      note(
        'wrong-source-hash-authorization-hash-session-and-set-role-cannot-publish',
      );
      const originalRead = (
        await publisher.query(
          'select * from world_v2.read_runtime_admission_publication_authorization($1)',
          [valid.claims.authorizationId],
        )
      ).rows;
      expect(originalRead).toEqual([
        {
          canonical_authorization: valid.envelope.canonicalAuthorization,
          signature_base64url: valid.envelope.signatureBase64Url,
        },
      ]);
      expect((await publisher.query(readSql, [...valid.args])).rows).toEqual(
        [],
      );
      for (let i = 0; i < 2; i++)
        await publisher.query(publishSql, [...valid.args]);
      const published = (
        await admin.query(
          'select admission_ref,world_id,seed_id,seed_fingerprint,model_version,replay_binding from world_v2.runtime_opening_admission where world_id=$1',
          [main.worldId],
        )
      ).rows;
      expect(published).toEqual([
        {
          admission_ref: 'ADMISSION_' + valid.authorizationHash.toUpperCase(),
          world_id: main.worldId,
          seed_id: main.seedId,
          seed_fingerprint: main.fingerprint,
          model_version: main.replayBinding.modelVersion,
          replay_binding: C.canonicalSerialize(main.replayBinding),
        },
      ]);
      evidence.testOnlyPublishedReadback = published;
      const narrowRead = (await publisher.query(readSql, [...valid.args])).rows;
      expect(narrowRead).toHaveLength(1);
      expect(narrowRead[0]).toMatchObject(published[0]);
      expect(narrowRead[0]!.admitted_at_real).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
      for (const args of [
        [valid.args[0], 'b'.repeat(64), SOURCE_HASH],
        [valid.args[0], valid.args[1], 'b'.repeat(64)],
      ])
        await expect(publisher.query(readSql, args)).rejects.toMatchObject({
          code: '55000',
        });
      await expect(other.query(readSql, [...valid.args])).rejects.toMatchObject(
        {
          code: '55000',
        },
      );
      evidence.narrowPermitReadback = narrowRead;
      note(
        'narrow-read-binds-exact-permit-source-hash-and-real-caller-session',
      );
      const headAfter = (
        await admin.query(
          'select world_version::text,event_sequence::text from world_v2.world_head where world_id=$1',
          [main.worldId],
        )
      ).rows[0];
      expect(headAfter).toEqual({ world_version: '0', event_sequence: '0' });
      evidence.publishedHead = headAfter;
      const conflict = makePermit('CONFLICT');
      await register(conflict);
      await expect(
        publisher.query(publishSql, [...conflict.args]),
      ).rejects.toMatchObject({ code: '23514' });
      expect(await count(main.worldId)).toBe(1);
      note(
        'exact-permit-original-zero-head-seed-publishes-idempotently-and-different-admission-conflicts',
      );
      const badSeed = makePermit('WRONG_SEED', 'BAD_SEED', {
        seedId: seeds.get('ALIEN')!.seedId,
      });
      await register(badSeed);
      await expect(
        publisher.query(publishSql, [...badSeed.args]),
      ).rejects.toMatchObject({ code: '23514' });
      const badModel = makePermit('WRONG_MODEL', 'BAD_SEED', {
        modelVersion: 'TEST_ONLY_WRONG_MODEL',
      });
      await register(badModel);
      await expect(
        publisher.query(publishSql, [...badModel.args]),
      ).rejects.toMatchObject({ code: '23514' });
      expect(await count(seeds.get('BAD_SEED')!.worldId)).toBe(0);
      const advanced = makePermit('ADVANCED', 'ADVANCED');
      await register(advanced);
      await admin.query(
        'update world_v2.world_head set world_version=1,event_sequence=1 where world_id=$1',
        [advanced.claims.worldId],
      );
      await expect(
        publisher.query(publishSql, [...advanced.args]),
      ).rejects.toMatchObject({ code: '23514' });
      expect(await count(advanced.claims.worldId)).toBe(0);
      note(
        'exact-seed-model-and-head-zero-checks-refuse-wrong-or-advanced-fixture-originals',
      );
      const expired = makePermit('EXPIRED', 'EXPIRED', {
        issuedAtReal: new Date(Date.now() - 180000).toISOString(),
        expiresAtReal: new Date(Date.now() - 120000).toISOString(),
      });
      await register(
        expired,
        {},
        new Date(Date.parse(expired.claims.issuedAtReal) + 1000).toISOString(),
      );
      await expect(
        publisher.query(publishSql, [...expired.args]),
      ).rejects.toMatchObject({ code: '55000' });
      const revoked = makePermit('REVOKED', 'REVOKED');
      await register(revoked);
      await releaseTransaction((client) =>
        client.query(
          'insert into world_v2.runtime_admission_publication_revocation(authorization_id,reason_ref) values($1,$2)',
          [revoked.claims.authorizationId, 'TEST_ONLY_ALREADY_REVOKED'],
        ),
      );
      await expect(
        publisher.query(publishSql, [...revoked.args]),
      ).rejects.toMatchObject({ code: '55000' });
      expect(await count(revoked.claims.worldId)).toBe(0);
      expect(await count(expired.claims.worldId)).toBe(0);
      note(
        'database-current-time-expired-and-append-only-revoked-permits-deny-new-publication',
      );
      const rollback = makePermit('ROLLBACK', 'ROLLBACK');
      await register(rollback);
      const failed = await publisher.connect();
      try {
        await failed.query('begin');
        await failed.query(publishSql, [...rollback.args]);
        await expect(failed.query('select 1/0')).rejects.toMatchObject({
          code: '22012',
        });
      } finally {
        await failed.query('rollback');
        failed.release();
      }
      expect(await count(rollback.claims.worldId)).toBe(0);
      await publisher.query(publishSql, [...rollback.args]);
      expect(await count(rollback.claims.worldId)).toBe(1);
      note(
        'failure-rolls-back-publication-atomically-and-the-original-request-can-retry',
      );
      const race = makePermit('RACE', 'RACE');
      await register(race);
      const publication = await publisher.connect(),
        revocation = await registrar.connect();
      let publicationOpen = false,
        revocationOpen = false,
        pending: Promise<unknown> | undefined;
      try {
        await publication.query('begin');
        publicationOpen = true;
        const pubPid = Number(
          (await publication.query('select pg_backend_pid() as pid')).rows[0]!
            .pid,
        );
        await publication.query(lockSql, [...race.args]);
        await revocation.query('begin');
        revocationOpen = true;
        await revocation.query(`set local role ${RELEASE}`);
        const revPid = Number(
          (await revocation.query('select pg_backend_pid() as pid')).rows[0]!
            .pid,
        );
        pending = revocation.query(
          'insert into world_v2.runtime_admission_publication_revocation(authorization_id,reason_ref) values($1,$2)',
          [race.claims.authorizationId, 'TEST_ONLY_CONCURRENT_REVOCATION'],
        );
        void pending.catch(() => undefined);
        let blocked = false;
        const deadline = Date.now() + 3000;
        while (!blocked && Date.now() < deadline) {
          const state = (
            await admin.query(
              'select wait_event_type,pg_blocking_pids(pid) as blockers from pg_stat_activity where pid=$1',
              [revPid],
            )
          ).rows[0];
          blocked =
            state?.wait_event_type === 'Lock' &&
            state.blockers.includes(pubPid);
          if (!blocked) await new Promise((resolve) => setTimeout(resolve, 20));
        }
        expect(blocked).toBe(true);
        await publication.query(publishSql, [...race.args]);
        await publication.query('commit');
        publicationOpen = false;
        await pending;
        await revocation.query('commit');
        revocationOpen = false;
        expect(await count(race.claims.worldId)).toBe(1);
        await expect(
          publisher.query(publishSql, [...race.args]),
        ).rejects.toMatchObject({ code: '55000' });
        await expect(
          publisher.query(readSql, [...race.args]),
        ).rejects.toMatchObject({ code: '55000' });
        evidence.revocationRace = {
          observedActualLockWait: true,
          publicationPID: pubPid,
          revocationPID: revPid,
          admissionCommittedBeforeRevocation: true,
          futurePublicationRefused: true,
        };
      } finally {
        if (publicationOpen) await publication.query('rollback');
        if (pending) await pending.catch(() => undefined);
        if (revocationOpen) await revocation.query('rollback');
        publication.release();
        revocation.release();
      }
      note(
        'real-revoker-for-update-waits-for-publication-share-lock-and-serializes-with-commit',
      );
      for (const table of [
        'runtime_admission_publication_permit',
        'runtime_admission_publication_revocation',
      ])
        await expect(
          admin.query(`delete from world_v2.${table}`),
        ).rejects.toMatchObject({ code: '55000' });
      const effects = (
        await admin.query(
          `select (select count(*)::int from world_v2.authoritative_event) as events,(select count(*)::int from world_v2.inventory_posting) as inventory,(select count(*)::int from world_v2.financial_posting_batch) as financial`,
        )
      ).rows[0];
      expect(effects).toEqual({ events: 0, inventory: 0, financial: 0 });
      evidence.economicEffects = effects;
      note(
        'permit-revocation-immutability-and-zero-economic-effects-preserved',
      );
      evidence.sourceFiles = await Promise.all(
        [
          SQL,
          'database/proposals/runtime-read-binding-storage.sql',
          'apps/world-worker/src/admission/private-opening-admission-authority.ts',
          'tests/world-api/runtime-admission-publication-native.test.ts',
        ].map(async (file) => ({
          path: file,
          sha256: sha(await readFile(path.join(root, file))),
        })),
      );
    } finally {
      for (const p of pools) await p.end();
      evidence.cleanup = await owned.close();
      expect(evidence.cleanup).toMatchObject({
        status: 'STOPPED',
        roleSessions: 0,
        pgStatus: 3,
      });
      await mkdir('/tmp/office-evidence', { recursive: true, mode: 0o700 });
      await writeFile(
        '/tmp/office-evidence/runtime-admission-native.json',
        JSON.stringify(evidence, null, 2) + '\n',
        { mode: 0o600 },
      );
    }
    console.log(
      JSON.stringify({
        classification: evidence.classification,
        checks: assertions.length,
        evidence: '/tmp/office-evidence/runtime-admission-native.json',
        officialSeventyCountryAdoption: false,
        WorldClock: false,
      }),
    );
  }, 120_000);
});
