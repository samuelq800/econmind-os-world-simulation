/** Isolated actual selected-source genesis + controlled TEST_ONLY SQL permit.
 * No production role/project, persistent signing key, Owner signature, Clock or
 * command execution. The ephemeral Ed25519 signature is actually verified; the
 * fixture release registrar is explicitly NOT project Owner approval. */
import { PGlite } from '@electric-sql/pglite';
import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  authenticateIdentity,
  authorizeOfficeCapability,
  authSubject,
  canonicalSerialize,
  countryId,
  officeId,
  teamId,
  worldId,
  OFFICE_DEFINITIONS,
  type AuthorizationCapability,
  type MembershipSnapshot,
} from '@econmind/core';
import { preparePostwarWorldGenesis } from '../../apps/world-worker/src/preparation/postwar-world-genesis.js';
import { assemblePostwarGenesisCarrier } from '../../apps/world-worker/src/preparation/postwar-genesis-carrier-assembly.js';
import { readPostwarNewWorldScopeFrom } from '../../apps/world-worker/src/preparation/postwar-operating-genesis-adoption.js';
import { WorldOpeningSeedStore } from '../../apps/world-worker/src/persistence/opening-seed-store.js';
import { officePrivateReadProjectionScopeKey } from '../../apps/world-worker/src/projections/current-authorization-entitlement-publisher.js';
import { OPENING_PUBLICATION_SIGNATURE_DOMAIN } from '../../apps/world-worker/src/admission/private-opening-admission-authority.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';

const root = path.resolve(import.meta.dirname, '../..');
const hash = (value: string) =>
  createHash('sha256').update(value, 'utf8').digest('hex');
const read = (relative: string) => readFile(path.join(root, relative), 'utf8');
export async function createPostwarAdmittedRuntimeFixture(
  input: Readonly<{
    worldId?: string;
    seedId?: string;
    genesisVersion?: string;
  }> = {},
) {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'postwar-runtime-test-'),
  );
  let db = new PGlite(directory);
  const wid = input.worldId ?? 'WORLD_POSTWAR_RUNTIME_ACTUAL_TEST';
  const seedId = input.seedId ?? 'SEED_POSTWAR_RUNTIME_ACTUAL_TEST';
  const subject = '11111111-1111-4111-8111-111111111111';
  const team = 'TEAM_POSTWAR_RUNTIME_TEST';
  const country = 'COUNTRY_01';
  const readerRole = 'fixture_postwar_source_reader';
  const authorizationPublisherRole = 'fixture_postwar_source_publisher';
  const boundedReaderRole = 'fixture_postwar_bounded_reader';
  const admissionPublisherRole = 'world_v2_opening_admission_postwar_test';
  const statements: string[] = [];
  const executor: SqlExecutor = {
    async query<Row extends object>(
      sql: string,
      parameters: readonly unknown[] = [],
    ) {
      statements.push(sql);
      const result = await db.query(sql, [...parameters]);
      return {
        rows: result.rows as Row[],
        rowCount: result.affectedRows ?? result.rows.length,
      };
    },
  };
  const database: SqlDatabase = {
    query: executor.query,
    async transaction<Result>(
      consume: (transaction: SqlExecutor) => Promise<Result>,
    ) {
      await db.exec('begin');
      try {
        const result = await consume(executor);
        await db.exec('commit');
        return result;
      } catch (error) {
        await db.exec('rollback');
        throw error;
      }
    },
  };
  try {
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
    await db.exec(`create role ${readerRole} nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
      create role world_v2_postwar_offline_seed_reader nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
      grant world_v2_postwar_offline_seed_reader to ${readerRole};
      create role ${boundedReaderRole} nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
      grant usage on schema world_v2 to ${boundedReaderRole};
      create role ${authorizationPublisherRole} nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
      grant usage on schema world_v2 to ${readerRole};
      grant select on world_v2.world_head,world_v2.current_commit_authorization,world_v2.projection_entitlement,
        world_v2.runtime_read_seat,world_v2.runtime_opening_admission,world_v2.opening_seed,
        world_v2.authoritative_event,world_v2.command_submission,world_v2.inventory_posting,world_v2.financial_posting_batch,
        world_v2.read_projection to ${readerRole}`);
    await db.exec('begin isolation level repeatable read read only');
    let newWorldScope;
    try {
      newWorldScope = await readPostwarNewWorldScopeFrom(executor, wid);
    } finally {
      await db.exec('rollback');
    }
    const prepared = await preparePostwarWorldGenesis({
      repositoryRoot: root,
      worldId: wid,
      seedId,
      genesisVersion: input.genesisVersion ?? 'POSTWAR_RUNTIME_TEST_V1',
      valueDate: '2026-10-28',
    });
    const assembly = await assemblePostwarGenesisCarrier({
      prepared,
      newWorldScope,
    });
    const seed = assembly.finalSeed;
    await db.query(
      'insert into world_v2.world_head(world_id,world_version,event_sequence) values($1,0,0)',
      [wid],
    );
    const opening = new WorldOpeningSeedStore({ database, sha256Hex: hash });
    await opening.bootstrap({
      seed,
      bootstrappedAtReal: '2026-10-28T00:00:00.000Z',
    });
    for (const [office, definition] of Object.entries(OFFICE_DEFINITIONS)) {
      for (const capability of definition.capabilities)
        await db.query(
          `insert into world_v2.current_commit_authorization
        (world_id,auth_subject,country_id,office_id,capability,team_id,authorization_version,active,refreshed_at_real)
        values($1,$2::uuid,$3,$4,$5,$6,'REV_1',true,'2026-10-28T00:00:00Z')`,
          [wid, subject, country, office, capability, team],
        );
      await db.query(
        `insert into world_v2.runtime_read_seat(world_id,auth_subject,country_id,office_id,team_id,authorization_revision)
        values($1,$2::uuid,$3,$4,$5,'REV_1')`,
        [wid, subject, country, office, team],
      );
      const key = officePrivateReadProjectionScopeKey({
        countryId: countryId(country),
        officeId: officeId(office),
      });
      await db.query(
        `insert into world_v2.projection_entitlement(world_id,auth_subject,classification,scope_key,authorization_version,active,granted_at)
        values($1,$2::uuid,'OFFICE_PRIVATE',$3,'REV_1',true,'2026-10-28T00:00:00Z')`,
        [wid, subject, key],
      );
      // This is entitlement/watermark fixture metadata, never source data. The
      // actual runtime facts are re-read from the admitted canonical seed.
      await db.query(
        `insert into world_v2.read_projection(world_id,classification,scope_key,schema_version,world_version,event_sequence,payload,generated_at)
        values($1,'OFFICE_PRIVATE',$2,'world-projection-read-v1',0,0,'{}','2026-10-28T00:00:00Z')`,
        [wid, key],
      );
    }
    await db.exec(
      await read('database/proposals/runtime-admission-publication.sql'),
    );
    await db.exec(`create role ${admissionPublisherRole} nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
      grant usage on schema world_v2 to ${admissionPublisherRole};
      grant execute on function world_v2.read_runtime_admission_publication_authorization(text),
        world_v2.lock_runtime_admission_publication(text,text,text),world_v2.publish_runtime_admission_publication(text,text,text),
        world_v2.read_runtime_admission_publication(text,text,text) to ${admissionPublisherRole}`);
    const now = Date.now(),
      sourceHash = hash(canonicalSerialize(seed.sources));
    const claims = {
      schemaVersion: 'opening-publication-authorization-v1',
      purpose: 'AUTHORIZE_OFFICIAL_OPENING_ADMISSION_PUBLICATION',
      authorizationId: 'AUTHORIZATION_POSTWAR_RUNTIME_TEST',
      keyId: 'TEST_ONLY_EPHEMERAL_NOT_OWNER',
      ownerIdentity: 'TEST_ONLY_NOT_PROJECT_OWNER',
      issuedAtReal: new Date(now - 60000).toISOString(),
      expiresAtReal: new Date(now + 3600000).toISOString(),
      worldId: wid,
      seedId: seed.seedId,
      seedFingerprint: seed.fingerprint,
      modelVersion: seed.replayBinding.modelVersion,
      replayBinding: canonicalSerialize(seed.replayBinding),
      sourceBundleSha256: sourceHash,
    };
    const canonical = canonicalSerialize(claims),
      authorizationHash = hash(canonical);
    // Ephemeral TEST_ONLY key: never returned, printed, written or installed.
    const keys = generateKeyPairSync('ed25519');
    const signedBytes = Buffer.from(
      OPENING_PUBLICATION_SIGNATURE_DOMAIN + canonical,
    );
    const signature = sign(null, signedBytes, keys.privateKey);
    if (!verify(null, signedBytes, keys.publicKey, signature))
      throw Error('TEST_ONLY_SIGNATURE_VERIFICATION_FAILED');
    await db.exec('set role world_v2_admission_release');
    await db.query(
      `insert into world_v2.runtime_admission_publication_permit
      (authorization_id,authorization_sha256,canonical_authorization,signature_base64url,world_id,seed_id,seed_fingerprint,model_version,replay_binding,source_bundle_sha256,caller_session_role,valid_from,valid_until)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        claims.authorizationId,
        authorizationHash,
        canonical,
        signature.toString('base64url'),
        wid,
        seed.seedId,
        seed.fingerprint,
        claims.modelVersion,
        claims.replayBinding,
        sourceHash,
        admissionPublisherRole,
        claims.issuedAtReal,
        claims.expiresAtReal,
      ],
    );
    await db.exec('reset role; set session authorization postgres');
    await db.exec(`set session authorization ${admissionPublisherRole}`);
    await db.query(
      'select world_v2.publish_runtime_admission_publication($1,$2,$3)',
      [claims.authorizationId, authorizationHash, sourceHash],
    );
    await db.exec('reset role; set session authorization postgres');
    await db.exec(
      await read('database/proposals/postwar-runtime-source-read-policy.sql'),
    );
    const state: { membership: MembershipSnapshot } = {
      membership: {
        authorizationVersion: 'REV_1',
        authSubject: authSubject(subject),
        worldId: worldId(wid),
        teamId: teamId(team),
        countryId: countryId(country),
        officeAssignments: Object.keys(OFFICE_DEFINITIONS).map(officeId),
        active: true,
        suspended: false,
        isWorldAdmin: false,
        negotiationPartyIds: [],
      },
    };
    const principal = await authenticateIdentity({
      token: 'TEST_ONLY_PRINCIPAL',
      profile: { user_id: subject, display_name: null, school_id: null },
      verifier: {
        verify: async () => ({
          subject,
          issuer: 'TEST_ONLY',
          audience: 'TEST_ONLY',
          issuedAt: new Date(now - 1000).toISOString(),
          expiresAt: new Date(now + 3600000).toISOString(),
        }),
      },
    });
    const resolver = {
      resolveCurrentIdentity: async () => principal.authSubject,
      resolveCurrentMembership: async () => state.membership,
    };
    const authorization = (
      office: keyof typeof OFFICE_DEFINITIONS = 'SOCIAL',
      capability?: AuthorizationCapability,
    ) =>
      authorizeOfficeCapability({
        principal,
        resolver,
        worldId: worldId(wid),
        requestedCountryId: countryId(country),
        requestedOfficeId: officeId(office),
        capability: capability ?? OFFICE_DEFINITIONS[office].capabilities[0],
      });
    async function asReader<Result>(
      consume: (read: SqlExecutor) => Promise<Result>,
      options: Readonly<{
        mode?:
          | 'repeatable read read only'
          | 'serializable read only'
          | 'read committed read only'
          | 'repeatable read read write';
        subject?: string;
        role?: string;
      }> = {},
    ) {
      const mode = options.mode ?? 'repeatable read read only',
        role = options.role ?? readerRole;
      if (
        ![
          'repeatable read read only',
          'serializable read only',
          'read committed read only',
          'repeatable read read write',
        ].includes(mode) ||
        ![
          readerRole,
          boundedReaderRole,
          authorizationPublisherRole,
          'postgres',
        ].includes(role)
      )
        throw Error('TEST_ONLY_SQL_MODE_NOT_ALLOWED');
      await db.exec(`begin isolation level ${mode}`);
      try {
        await db.exec(`set local role ${role}`);
        await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
          options.subject ?? subject,
        ]);
        return await consume(executor);
      } finally {
        await db.exec('rollback');
      }
    }
    return {
      get db() {
        return db;
      },
      executor,
      database,
      prepared,
      assembly,
      seed,
      state,
      statements,
      worldId: wid,
      countryId: country,
      subject,
      team,
      roles: {
        readerRole,
        runtimeReaderRole: readerRole,
        boundedReaderRole,
        authorizationPublisherRole,
      },
      admissionRef: `ADMISSION_${authorizationHash.toUpperCase()}`,
      permitEvidence: Object.freeze({
        classification:
          'TEST_ONLY_CONTROLLED_SQL_PERMIT_NOT_PROJECT_OWNER_APPROVAL',
        ephemeralEd25519SignatureVerified: true,
        privateKeyPersisted: false,
      }),
      authorization,
      asReader,
      async restart() {
        await db.close();
        db = new PGlite(directory);
        await db.waitReady;
      },
      async close() {
        await db.close();
        await rm(directory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await db.close();
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
export type PostwarAdmittedRuntimeFixture = Awaited<
  ReturnType<typeof createPostwarAdmittedRuntimeFixture>
>;
