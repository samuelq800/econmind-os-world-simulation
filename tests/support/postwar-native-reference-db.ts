/** One reusable TEST_ONLY native PG16 reference. Local owned UDS only; no
 * external DSN, production connection, signing-key persistence or Clock. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID, createHash, generateKeyPairSync, sign } from 'node:crypto';
import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import {
  canonicalSerialize,
  parseOpeningSeed,
  OFFICE_DEFINITIONS,
  countryId,
  officeId,
} from '@econmind/core';
import { readPostwarOperatingGenesisFromSeed } from '../../apps/world-worker/src/preparation/postwar-operating-genesis-adoption.js';
import { WorldOpeningSeedStore } from '../../apps/world-worker/src/persistence/opening-seed-store.js';
import { PostgresSqlDatabase } from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import { officePrivateReadProjectionScopeKey } from '../../apps/world-worker/src/projections/current-authorization-entitlement-publisher.js';
import {
  PrivateOpeningAdmissionAuthority,
  resolvePrivateOpeningPublicationAuthorization,
  OPENING_PUBLICATION_SIGNATURE_DOMAIN,
} from '../../apps/world-worker/src/admission/private-opening-admission-authority.js';

const run = promisify(execFile);
export const POSTWAR_REFERENCE_IMAGE =
  'postgres@sha256:1beaa3084eee2676f20a9cd9928f0bf2c5bf674f8e49f81017912183d377c61c';
const roles = Object.freeze({
  readerRole: 'fixture_postwar_source_reader',
  authorizationPublisherRole: 'fixture_postwar_source_publisher',
  admissionPublisherRole: 'world_v2_opening_admission_postwar_test',
  registrarRole: 'postwar_reference_test_registrar',
  boundedReaderRole: 'fixture_postwar_bounded_reader',
});
const hash = (bytes: string | Buffer) =>
  createHash('sha256').update(bytes).digest('hex');
const identifier = (value: string) => {
  if (!/^postwar_[a-z0-9_]+$/u.test(value))
    throw Error('REFERENCE_DATABASE_IDENTIFIER_DENIED');
  return `"${value}"`;
};
export interface PostwarNativeReferenceMarker {
  schemaVersion: 'postwar-native-reference-v1';
  classification: 'TEST_ONLY_ISOLATED_REFERENCE_NOT_PRODUCTION';
  evidenceDirectory: string;
  markerPath: string;
  ownedContainer: string;
  ownershipNonce: string;
  pgDataStorage: Readonly<{
    kind: 'DOCKER_NAMED_VOLUME';
    name: string;
    mountPath: '/var/lib/postgresql/data';
    ownershipNonce: string;
  }>;
  image: string;
  socket: string;
  port: 5432;
  database: string;
  baselineSealed: boolean;
  worldId: string;
  seedId: string;
  seedFingerprint: string;
  seedFile: string;
  seedFileSha256: string;
  seedBytes: string;
  sourceVersion: string;
  subject: string;
  team: string;
  countryId: 'COUNTRY_01';
  roles: typeof roles;
  admissionRef: string;
  authorizationHash: string;
  sourceBundleSha256: string;
  sourceHashMeaning: 'TEST_ONLY_EXACT_CANONICAL_SOURCE_SET_NOT_PRODUCTION_BUNDLE';
  verification: Record<string, boolean | string>;
  installedArtifacts: readonly { path: string; sha256: string }[];
  cleanupCommand: readonly string[];
  cleanupStorageCommand: readonly string[];
}
const idleConnectionFailures: { code: string; message: string }[] = [];
function pool(
  marker: Pick<PostwarNativeReferenceMarker, 'socket' | 'port'>,
  database: string,
  user = 'postgres',
) {
  const result = new Pool({
    host: marker.socket,
    port: marker.port,
    database,
    user,
    max: 2,
    ssl: false,
    password: async () => '',
    application_name: 'ECONMIND_POSTWAR_REFERENCE_TEST_ONLY',
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 1000,
  });
  // pg's default idle error event exposes its complete Client object. Retain
  // only safe failure metadata; active-query promises still reject normally.
  result.on('error', (error) =>
    idleConnectionFailures.push({
      code: 'code' in error ? String(error.code) : 'UNKNOWN',
      message: error.message,
    }),
  );
  return result;
}
async function owned(marker: PostwarNativeReferenceMarker) {
  if (
    marker.schemaVersion !== 'postwar-native-reference-v1' ||
    !marker.socket.startsWith('/workspace/.cloud-setup/evidence/') ||
    !marker.ownedContainer.startsWith('econmind-postwar-reference-') ||
    marker.image !== POSTWAR_REFERENCE_IMAGE
  )
    throw Error('REFERENCE_MARKER_SCOPE_DENIED');
  identifier(marker.database);
  if (
    marker.pgDataStorage?.kind !== 'DOCKER_NAMED_VOLUME' ||
    !/^econmind-postwar-reference-data-[a-f0-9]{8}$/u.test(
      marker.pgDataStorage.name,
    ) ||
    marker.pgDataStorage.mountPath !== '/var/lib/postgresql/data' ||
    marker.pgDataStorage.ownershipNonce !== marker.ownershipNonce
  )
    throw Error('REFERENCE_PERSISTENT_PGDATA_REQUIRED_OLD_TMPFS_UNUSABLE');
  const inspected = JSON.parse(
    (
      await run('docker', ['inspect', marker.ownedContainer], {
        maxBuffer: 1048576,
      })
    ).stdout,
  )[0];
  if (
    inspected.HostConfig.NetworkMode !== 'none' ||
    Object.keys(inspected.NetworkSettings.Ports ?? {}).length !== 0 ||
    inspected.Config.Labels?.['econmind.reference.nonce'] !==
      marker.ownershipNonce
  )
    throw Error('REFERENCE_OWNERSHIP_OR_NETWORK_CHANGED');
  const dataMount = inspected.Mounts?.find(
    (mount: { Destination?: string }) =>
      mount.Destination === marker.pgDataStorage.mountPath,
  );
  const volume = JSON.parse(
    (
      await run('docker', ['volume', 'inspect', marker.pgDataStorage.name], {
        maxBuffer: 1048576,
      })
    ).stdout,
  )[0];
  if (
    dataMount?.Type !== 'volume' ||
    dataMount.Name !== marker.pgDataStorage.name ||
    dataMount.RW !== true ||
    inspected.HostConfig.Tmpfs?.[marker.pgDataStorage.mountPath] !==
      undefined ||
    volume.Labels?.['econmind.reference.nonce'] !== marker.ownershipNonce
  )
    throw Error('REFERENCE_PERSISTENT_VOLUME_OWNERSHIP_OR_MOUNT_CHANGED');
}
export async function loadPostwarNativeReferenceMarker(
  markerPath: string,
): Promise<PostwarNativeReferenceMarker> {
  const marker = JSON.parse(
    await readFile(markerPath, 'utf8'),
  ) as PostwarNativeReferenceMarker;
  await owned(marker);
  return marker;
}
export async function clonePostwarNativeReference(
  marker: PostwarNativeReferenceMarker,
  owner: string,
  template = marker.database,
) {
  await owned(marker);
  if (!marker.baselineSealed)
    throw Error('REFERENCE_FAILED_NOT_READY_DO_NOT_CLONE');
  identifier(template);
  if (!/^[a-z0-9_]{1,24}$/u.test(owner))
    throw Error('REFERENCE_CLONE_OWNER_INVALID');
  const database = `postwar_clone_${owner}_${randomUUID().replaceAll('-', '').slice(0, 10)}`;
  const admin = pool(marker, 'postgres');
  try {
    await admin.query(
      `create database ${identifier(database)} template ${identifier(template)}`,
    );
  } finally {
    await admin.end();
  }
  const reader = pool(marker, database, roles.readerRole),
    boundedReader = pool(marker, database, roles.boundedReaderRole),
    installer = pool(marker, database);
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await Promise.all([reader.end(), boundedReader.end(), installer.end()]);
  };
  return {
    database,
    reader,
    boundedReader,
    installer,
    close,
    async drop() {
      await close();
      const root = pool(marker, 'postgres');
      try {
        await root.query(`drop database ${identifier(database)} with(force)`);
      } finally {
        await root.end();
      }
    },
  };
}
export async function sealPostwarReferenceClone(
  marker: PostwarNativeReferenceMarker,
  database: string,
) {
  await owned(marker);
  if (!database.startsWith('postwar_clone_'))
    throw Error('REFERENCE_ONLY_OWNED_CLONE_MAY_BE_SEALED');
  const admin = pool(marker, 'postgres');
  try {
    await admin.query(
      `alter database ${identifier(database)} with is_template true allow_connections false`,
    );
  } finally {
    await admin.end();
  }
}
export async function createPostwarNativeReferenceDatabase(
  input: Readonly<{
    repositoryRoot: string;
    evidenceDirectory: string;
    seedFile: string;
  }>,
): Promise<PostwarNativeReferenceMarker> {
  if (!input.evidenceDirectory.startsWith('/workspace/.cloud-setup/evidence/'))
    throw Error('REFERENCE_EVIDENCE_ROOT_DENIED');
  const existingPath = path.join(input.evidenceDirectory, 'reference-db.json');
  const existingBytes = await readFile(existingPath, 'utf8').catch(() => null);
  if (existingBytes) {
    const existing = await loadPostwarNativeReferenceMarker(existingPath);
    if (!existing.baselineSealed || existing.seedFile !== input.seedFile)
      throw Error('REFERENCE_EXISTING_INSTANCE_REQUIRES_REPAIR_NOT_REBUILD');
    const check = pool(existing, 'postgres');
    try {
      const state = await check.query(
        'select datistemplate,datallowconn from pg_database where datname=$1',
        [existing.database],
      );
      if (
        state.rows.length !== 1 ||
        !state.rows[0].datistemplate ||
        state.rows[0].datallowconn
      )
        throw Error('REFERENCE_BASELINE_SEAL_CHANGED');
    } finally {
      await check.end();
    }
    return existing;
  }
  const pendingBytes = await readFile(
    path.join(input.evidenceDirectory, 'failure.json'),
    'utf8',
  ).catch(() => null);
  if (pendingBytes) {
    const pending = JSON.parse(pendingBytes) as {
      status?: string;
      ownedContainer?: string;
    };
    if (pending.status === 'FAILED_NOT_READY' && pending.ownedContainer) {
      const state = await run('docker', ['inspect', pending.ownedContainer], {
        maxBuffer: 1048576,
      }).catch(() => null);
      if (state)
        throw Error('REFERENCE_FAILED_NOT_READY_REPAIR_EXISTING_INSTANCE');
    }
  }
  const nonce = randomUUID(),
    container = `econmind-postwar-reference-${nonce.slice(0, 8)}`,
    storageVolume = `econmind-postwar-reference-data-${nonce.slice(0, 8)}`,
    database = `postwar_reference_${nonce.replaceAll('-', '').slice(0, 12)}`;
  const pgDataStorage = Object.freeze({
    kind: 'DOCKER_NAMED_VOLUME' as const,
    name: storageVolume,
    mountPath: '/var/lib/postgresql/data' as const,
    ownershipNonce: nonce,
  });
  const socket = path.join(
      input.evidenceDirectory,
      `socket-${nonce.slice(0, 8)}`,
    ),
    markerPath = path.join(input.evidenceDirectory, 'reference-db.json');
  if (socket.length + 20 > 107)
    throw Error('REFERENCE_UNIX_SOCKET_PATH_TOO_LONG');
  await mkdir(socket, { recursive: true });
  await chmod(socket, 0o777);
  await writeFile(
    path.join(input.evidenceDirectory, 'owned-container.json'),
    JSON.stringify(
      {
        ownedContainer: container,
        ownershipNonce: nonce,
        image: POSTWAR_REFERENCE_IMAGE,
        pgDataStorage,
        socket,
        cleanupCommand: ['docker', 'rm', '--force', container],
        cleanupStorageCommand: ['docker', 'volume', 'rm', storageVolume],
      },
      null,
      2,
    ) + '\n',
  );
  // --pull=never pins the already cached image; network=none and an empty TCP
  // listener protect this helper even when the host has production env vars.
  await run(
    'docker',
    [
      'volume',
      'create',
      '--label',
      `econmind.reference.nonce=${nonce}`,
      '--label',
      'econmind.reference.classification=TEST_ONLY',
      storageVolume,
    ],
    { maxBuffer: 1048576 },
  );
  await run(
    'docker',
    [
      'run',
      '--detach',
      '--pull=never',
      '--name',
      container,
      '--label',
      `econmind.reference.nonce=${nonce}`,
      '--network',
      'none',
      '--cpus',
      '1',
      '--memory',
      '3g',
      '--shm-size',
      '256m',
      '--read-only',
      '--mount',
      `type=volume,src=${storageVolume},dst=/var/lib/postgresql/data`,
      '--tmpfs',
      '/tmp:rw,nosuid,size=128m',
      '--mount',
      `type=bind,src=${socket},dst=/var/run/postgresql`,
      '--env',
      'POSTGRES_HOST_AUTH_METHOD=trust',
      POSTWAR_REFERENCE_IMAGE,
      'postgres',
      '-c',
      'listen_addresses=',
      '-c',
      'unix_socket_directories=/var/run/postgresql',
      '-c',
      'unix_socket_permissions=0777',
      '-c',
      'shared_buffers=128MB',
      '-c',
      'max_connections=24',
      '-c',
      'timezone=UTC',
    ],
    { maxBuffer: 1048576 },
  );
  const connection = { socket, port: 5432 as const };
  const admin = pool(connection, 'postgres');
  let marker: PostwarNativeReferenceMarker | undefined;
  let durableBootstrapCompleted = false;
  let stageVerification: Record<string, boolean | string> = {};
  try {
    let ready = false;
    const startupDeadline = Date.now() + 45000;
    for (
      let attempt = 0;
      attempt < 120 && Date.now() < startupDeadline;
      attempt++
    ) {
      try {
        // The official image first runs a temporary init server, then stops
        // it. Wait for PID 1's final postgres exec before accepting readiness.
        const command = await run(
          'docker',
          ['exec', container, 'cat', '/proc/1/comm'],
          { maxBuffer: 1024 },
        );
        if (command.stdout.trim() !== 'postgres') {
          await new Promise((resolve) => setTimeout(resolve, 250));
          continue;
        }
        const client = await admin.connect();
        client.release();
        ready = true;
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    if (!ready) throw Error('REFERENCE_POSTGRES_NOT_READY');
    const version = await admin.query(
      "select version() as version,current_setting('server_version_num') as number",
    );
    if (version.rows[0]?.number !== '160015')
      throw Error('REFERENCE_PG16_15_REQUIRED');
    await admin.query(`create database ${identifier(database)}`);
    const data = pool(connection, database);
    const artifacts: { path: string; sha256: string }[] = [];
    const verification: Record<string, boolean | string> = {
      productionAdmission: false,
      WorldClock: false,
      privateKeyPersisted: false,
      privateKeyPrinted: false,
      isolatedUnixOnly: true,
      serverVersion: version.rows[0].version,
    };
    stageVerification = verification;
    const phase = async (name: string) =>
      writeFile(
        path.join(input.evidenceDirectory, 'phase.json'),
        JSON.stringify(
          { phase: name, at: new Date().toISOString(), verification },
          null,
          2,
        ) + '\n',
      );
    try {
      await phase('INSTALLING_EXACT_23_MIGRATIONS');
      await data.query(
        'create schema storage;create table storage.objects(bucket_id text);alter table storage.objects enable row level security',
      );
      for (const name of ['anon', 'authenticated', 'service_role'])
        await data.query(
          `create role ${name} nologin noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication`,
        );
      const manifest = JSON.parse(
        await readFile(
          path.join(input.repositoryRoot, 'database/migrations/manifest.json'),
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
      if (manifest.migrations.length !== 23)
        throw Error('REFERENCE_EXACT_23_MIGRATIONS_REQUIRED');
      for (const migration of manifest.migrations) {
        const bytes = await readFile(
          path.join(input.repositoryRoot, migration.path),
        );
        const original = await run(
          'git',
          [
            '--no-replace-objects',
            'show',
            `${migration.artifact_source_commit}:${migration.path}`,
          ],
          { cwd: input.repositoryRoot, encoding: 'buffer', maxBuffer: 1048576 },
        );
        if (hash(bytes) !== migration.sha256 || !bytes.equals(original.stdout))
          throw Error(
            'REFERENCE_MIGRATION_PROVENANCE_CHANGED:' + migration.migration_id,
          );
        await data.query(bytes.toString('utf8'));
        await data.query(
          'insert into world_v2.schema_release(migration_id,artifact_sha256,source_repo_commit,release_order) values($1,$2,$3,$4)',
          [
            migration.migration_id,
            migration.sha256,
            migration.artifact_source_commit,
            migration.release_order,
          ],
        );
        artifacts.push({ path: migration.path, sha256: migration.sha256 });
      }
      for (const file of [
        'database/proposals/runtime-read-binding-storage.sql',
        'database/proposals/current-authorization-writer-preparation.sql',
      ]) {
        const bytes = await readFile(
          path.join(input.repositoryRoot, file),
          'utf8',
        );
        await data.query(bytes);
        artifacts.push({ path: file, sha256: hash(bytes) });
      }
      await phase('PREFLIGHTING_ALL_ROLE_AND_PROPOSAL_DEPENDENCIES');
      await data.query(`create role ${roles.readerRole} login nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
        create role world_v2_postwar_offline_seed_reader nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
        grant world_v2_postwar_offline_seed_reader to ${roles.readerRole};
        create role ${roles.boundedReaderRole} login nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
        create role ${roles.authorizationPublisherRole} nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
        create role ${roles.admissionPublisherRole} login nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
        create role ${roles.registrarRole} login noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
        grant usage on schema world_v2 to ${roles.readerRole};
        grant select on world_v2.world_head,world_v2.current_commit_authorization,world_v2.projection_entitlement,world_v2.runtime_read_seat,world_v2.runtime_opening_admission,world_v2.opening_seed,world_v2.authoritative_event,world_v2.command_submission,world_v2.inventory_posting,world_v2.financial_posting_batch,world_v2.read_projection to ${roles.readerRole}`);
      const admissionSql =
        'database/proposals/runtime-admission-publication.sql';
      const admissionBytes = await readFile(
        path.join(input.repositoryRoot, admissionSql),
        'utf8',
      );
      await data.query(admissionBytes);
      artifacts.push({ path: admissionSql, sha256: hash(admissionBytes) });
      await data.query(
        `grant world_v2_admission_release to ${roles.registrarRole};grant usage on schema world_v2 to ${roles.admissionPublisherRole};grant execute on function world_v2.read_runtime_admission_publication_authorization(text),world_v2.lock_runtime_admission_publication(text,text,text),world_v2.publish_runtime_admission_publication(text,text,text),world_v2.read_runtime_admission_publication(text,text,text) to ${roles.admissionPublisherRole}`,
      );
      const policy =
          'database/proposals/postwar-runtime-source-read-policy.sql',
        policyBytes = await readFile(
          path.join(input.repositoryRoot, policy),
          'utf8',
        );
      await data.query(policyBytes);
      artifacts.push({ path: policy, sha256: hash(policyBytes) });
      await phase('CURRENT_CORE_PARSE_AND_ACTUAL_OPERATING_SOURCE_VALIDATION');
      const sourceFile = await readFile(input.seedFile, 'utf8');
      const seed = parseOpeningSeed(JSON.parse(sourceFile), hash);
      const operating = readPostwarOperatingGenesisFromSeed(seed);
      if (
        operating.facts.regions.length !== 122 ||
        operating.socialEmployment?.countries.length !== 70
      )
        throw Error('REFERENCE_FULL_VALIDATED_SOURCE_REQUIRED');
      verification.currentCoreSeedParsed = true;
      verification.currentOperatingSourceActuallyValidated = true;
      await phase('ACTUAL_NATIVE_WORLD_OPENING_STORE_BOOTSTRAP');
      await data.query(
        'insert into world_v2.world_head(world_id,world_version,event_sequence) values($1,0,0)',
        [seed.worldId],
      );
      const store = new WorldOpeningSeedStore({
        database: new PostgresSqlDatabase(data),
        sha256Hex: hash,
      });
      const bootstrap = await store.bootstrap({
        seed,
        bootstrappedAtReal: new Date().toISOString(),
      });
      if (bootstrap !== 'BOOTSTRAPPED')
        throw Error('REFERENCE_EXPECTED_FRESH_BOOTSTRAP');
      verification.actualStoreBootstrap = true;
      durableBootstrapCompleted = true;
      const subject = '11111111-1111-4111-8111-111111111111',
        team = 'TEAM_POSTWAR_RUNTIME_TEST',
        country = 'COUNTRY_01',
        now = new Date().toISOString();
      for (const [office, definition] of Object.entries(OFFICE_DEFINITIONS)) {
        for (const capability of definition.capabilities)
          await data.query(
            `insert into world_v2.current_commit_authorization(world_id,auth_subject,country_id,office_id,capability,team_id,authorization_version,active,refreshed_at_real) values($1,$2::uuid,$3,$4,$5,$6,'REV_1',true,$7)`,
            [seed.worldId, subject, country, office, capability, team, now],
          );
        await data.query(
          `insert into world_v2.runtime_read_seat(world_id,auth_subject,country_id,office_id,team_id,authorization_revision) values($1,$2::uuid,$3,$4,$5,'REV_1')`,
          [seed.worldId, subject, country, office, team],
        );
        const scope = officePrivateReadProjectionScopeKey({
          countryId: countryId(country),
          officeId: officeId(office),
        });
        await data.query(
          `insert into world_v2.projection_entitlement(world_id,auth_subject,classification,scope_key,authorization_version,active,granted_at) values($1,$2::uuid,'OFFICE_PRIVATE',$3,'REV_1',true,$4)`,
          [seed.worldId, subject, scope, now],
        );
        await data.query(
          `insert into world_v2.read_projection(world_id,classification,scope_key,schema_version,world_version,event_sequence,payload,generated_at) values($1,'OFFICE_PRIVATE',$2,'world-projection-read-v1',0,0,'{}',$3)`,
          [seed.worldId, scope, now],
        );
      }
      await phase('ACTUAL_TEST_ONLY_ED25519_VERIFY_AND_CONTROLLED_PERMIT');
      const at = Date.now(),
        sourceHash = hash(canonicalSerialize(seed.sources));
      const claims = {
        schemaVersion: 'opening-publication-authorization-v1' as const,
        purpose: 'AUTHORIZE_OFFICIAL_OPENING_ADMISSION_PUBLICATION' as const,
        authorizationId: 'AUTHORIZATION_POSTWAR_REFERENCE_TEST',
        keyId: 'TEST_ONLY_REFERENCE_EPHEMERAL',
        ownerIdentity: 'TEST_ONLY_NOT_PROJECT_OWNER',
        issuedAtReal: new Date(at - 60000).toISOString(),
        expiresAtReal: new Date(at + 86400000).toISOString(),
        worldId: seed.worldId,
        seedId: seed.seedId,
        seedFingerprint: seed.fingerprint,
        modelVersion: seed.replayBinding.modelVersion,
        replayBinding: canonicalSerialize(seed.replayBinding),
        sourceBundleSha256: sourceHash,
      };
      const canonical = canonicalSerialize(claims),
        authorizationHash = hash(canonical),
        keys = generateKeyPairSync('ed25519');
      const envelope = {
        canonicalAuthorization: canonical,
        signatureBase64Url: sign(
          null,
          Buffer.from(OPENING_PUBLICATION_SIGNATURE_DOMAIN + canonical),
          keys.privateKey,
        ).toString('base64url'),
      };
      const authority = new PrivateOpeningAdmissionAuthority({
        trustedKeys: new Map([
          [
            claims.keyId,
            { publicKey: keys.publicKey, ownerIdentity: claims.ownerIdentity },
          ],
        ]),
        registry: {
          load: async (reference) =>
            reference === claims.authorizationId ? envelope : null,
        },
      });
      const verified = await resolvePrivateOpeningPublicationAuthorization(
        authority,
        claims.authorizationId,
        new Date(at).toISOString(),
      );
      if (canonicalSerialize(verified) !== canonical)
        throw Error('REFERENCE_ACTUAL_PRIVATE_AUTHORITY_VERIFICATION_FAILED');
      verification.ephemeralEd25519PrivateAuthorityActuallyVerified = true;
      const registrar = pool(connection, database, roles.registrarRole);
      try {
        const client = await registrar.connect();
        try {
          await client.query('set role world_v2_admission_release');
          await client.query(
            `insert into world_v2.runtime_admission_publication_permit(authorization_id,authorization_sha256,canonical_authorization,signature_base64url,world_id,seed_id,seed_fingerprint,model_version,replay_binding,source_bundle_sha256,caller_session_role,valid_from,valid_until) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
            [
              claims.authorizationId,
              authorizationHash,
              canonical,
              envelope.signatureBase64Url,
              seed.worldId,
              seed.seedId,
              seed.fingerprint,
              claims.modelVersion,
              claims.replayBinding,
              sourceHash,
              roles.admissionPublisherRole,
              claims.issuedAtReal,
              claims.expiresAtReal,
            ],
          );
        } finally {
          client.release();
        }
      } finally {
        await registrar.end();
      }
      const publisher = pool(
        connection,
        database,
        roles.admissionPublisherRole,
      );
      try {
        await publisher.query(
          'select world_v2.publish_runtime_admission_publication($1,$2,$3)',
          [claims.authorizationId, authorizationHash, sourceHash],
        );
        const readback = await publisher.query(
          'select * from world_v2.read_runtime_admission_publication($1,$2,$3)',
          [claims.authorizationId, authorizationHash, sourceHash],
        );
        if (
          readback.rows.length !== 1 ||
          readback.rows[0].seed_fingerprint !== seed.fingerprint
        )
          throw Error('REFERENCE_CONTROLLED_ADMISSION_READBACK_MISMATCH');
      } finally {
        await publisher.end();
      }
      verification.controlledPermitPublishedAndReadBack = true;
      const rls = await data.query(
        `select c.relname,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='world_v2' and c.relname in('opening_seed','runtime_read_seat','runtime_opening_admission') order by c.relname`,
      );
      if (
        rls.rows.length !== 3 ||
        rls.rows.some((r) => !r.relrowsecurity || !r.relforcerowsecurity)
      )
        throw Error('REFERENCE_FORCE_RLS_MUST_REMAIN_ENABLED');
      verification.forceRlsPreserved = true;
      const head = await data.query(
        'select world_version::text,event_sequence::text from world_v2.world_head where world_id=$1',
        [seed.worldId],
      );
      if (
        head.rows[0]?.world_version !== '0' ||
        head.rows[0]?.event_sequence !== '0'
      )
        throw Error('REFERENCE_HEAD_ADVANCED');
      for (const table of [
        'authoritative_event',
        'inventory_posting',
        'financial_posting_batch',
      ]) {
        const rows = await data.query(
          `select count(*)::text as count from world_v2.${table}`,
        );
        if (rows.rows[0]?.count !== '0')
          throw Error('REFERENCE_UNEXPECTED_RUNTIME_POSTINGS');
      }
      verification.noRuntimeEventsOrPostings = true;
      const bounded = await data.query(
        `select has_column_privilege($1,'world_v2.opening_seed','canonical_payload','SELECT') as raw_seed,pg_has_role($1,$2,'MEMBER') as legacy_member`,
        [roles.boundedReaderRole, roles.readerRole],
      );
      if (
        bounded.rows[0]?.raw_seed !== false ||
        bounded.rows[0]?.legacy_member !== false
      )
        throw Error('REFERENCE_BOUNDED_READER_MUST_NOT_READ_RAW_SEED');
      verification.boundedReaderRawSeedDenied = true;
      if (idleConnectionFailures.length)
        throw Error(
          'REFERENCE_IDLE_CONNECTION_FAILURE:' +
            JSON.stringify(idleConnectionFailures),
        );
      marker = {
        schemaVersion: 'postwar-native-reference-v1',
        classification: 'TEST_ONLY_ISOLATED_REFERENCE_NOT_PRODUCTION',
        evidenceDirectory: input.evidenceDirectory,
        markerPath,
        ownedContainer: container,
        ownershipNonce: nonce,
        pgDataStorage,
        image: POSTWAR_REFERENCE_IMAGE,
        socket,
        port: 5432,
        database,
        baselineSealed: false,
        worldId: seed.worldId,
        seedId: seed.seedId,
        seedFingerprint: seed.fingerprint,
        seedFile: input.seedFile,
        seedFileSha256: hash(sourceFile),
        seedBytes: String(Buffer.byteLength(sourceFile)),
        sourceVersion:
          seed.sources.find((s) => s.sourceId === 'SOURCE_POSTWAR_OPERATING_V1')
            ?.sourceVersion ?? 'UNKNOWN',
        subject,
        team,
        countryId: country,
        roles,
        admissionRef: `ADMISSION_${authorizationHash.toUpperCase()}`,
        authorizationHash,
        sourceBundleSha256: sourceHash,
        sourceHashMeaning:
          'TEST_ONLY_EXACT_CANONICAL_SOURCE_SET_NOT_PRODUCTION_BUNDLE',
        verification,
        installedArtifacts: artifacts,
        cleanupCommand: ['docker', 'rm', '--force', container],
        cleanupStorageCommand: ['docker', 'volume', 'rm', storageVolume],
      };
      await phase('SEALING_CLONEABLE_BASELINE');
    } finally {
      await data.end();
    }
    if (!marker) throw Error('REFERENCE_MARKER_NOT_BUILT');
    await admin.query(
      `alter database ${identifier(database)} with is_template true allow_connections false`,
    );
    marker.baselineSealed = true;
    await owned(marker);
    marker.verification.persistentPgDataMountVerified = true;
    marker.verification.restartPersistenceVerified =
      'NOT_RUN_OFFICE_ACCEPTANCE_REQUIRED';
    await writeFile(markerPath, JSON.stringify(marker, null, 2) + '\n');
    await writeFile(
      path.join(input.evidenceDirectory, 'README.txt'),
      `TEST_ONLY isolated PG16 reference; baseline disallows connections. Persistent PGDATA: named volume ${storageVolume}, ownership nonce ${nonce}. This fixes the former tmpfs restart-loss defect; initial READY is not itself a restart/readback PASS. Clone via helper before tests. Cluster roles are global: role/membership mutations must be transactionally rolled back or coordinated; never revoke shared roles outside a rollback. No production admission or Owner signature or signing-key persistence. After all consumers stop, cleanup container first: docker rm --force ${container}; then owned volume: docker volume rm ${storageVolume}\n`,
    );
    return marker;
  } catch (error) {
    await writeFile(
      path.join(input.evidenceDirectory, 'failure.json'),
      JSON.stringify(
        {
          name: error instanceof Error ? error.name : 'UNKNOWN',
          message: error instanceof Error ? error.message : String(error),
          at: new Date().toISOString(),
          ownedContainer: container,
          pgDataStorage,
          database,
          socket,
          status: durableBootstrapCompleted
            ? 'FAILED_NOT_READY'
            : 'FAILED_CLEANED',
          verification: stageVerification,
          cleanupCommand: ['docker', 'rm', '--force', container],
          cleanupStorageCommand: ['docker', 'volume', 'rm', storageVolume],
        },
        null,
        2,
      ) + '\n',
    );
    throw error;
  } finally {
    await admin.end();
    if (!marker?.baselineSealed && !durableBootstrapCompleted) {
      await run('docker', ['rm', '--force', container], {
        maxBuffer: 1048576,
      }).catch(() => undefined);
      await run('docker', ['volume', 'rm', storageVolume], {
        maxBuffer: 1048576,
      }).catch(() => undefined);
    }
  }
}

/** Small actual SQL header for the eight-scalar controlled projection entry.
 * Data identity only: the publisher must recheck its own locks/authorization. */
export async function readPostwarNativeReferenceHeader(
  marker: PostwarNativeReferenceMarker,
  database: string,
) {
  await owned(marker);
  identifier(database);
  const admin = pool(marker, database);
  try {
    const result = await admin.query(
      `select s.world_id,s.seed_id,s.seed_fingerprint,
      encode(sha256(convert_to(s.canonical_payload,'UTF8')),'hex') as canonical_intent_sha256,
      octet_length(s.canonical_payload)::text as canonical_intent_bytes,
      ('sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||s.canonical_payload,'UTF8')),'hex')=s.seed_fingerprint) as core_intent_fingerprint_matches,
      a.admission_ref,h.world_version::text,h.event_sequence::text,
      s.replay_binding,a.model_version from world_v2.opening_seed s
      join world_v2.world_head h using(world_id)
      join world_v2.runtime_opening_admission a using(world_id)
      where s.world_id=$1 and a.seed_id=s.seed_id and a.seed_fingerprint=s.seed_fingerprint`,
      [marker.worldId],
    );
    if (
      result.rows.length !== 1 ||
      result.rows[0].seed_fingerprint !== marker.seedFingerprint ||
      result.rows[0].core_intent_fingerprint_matches !== true
    )
      throw Error('REFERENCE_ACTUAL_SQL_HEADER_MISMATCH');
    return Object.freeze({
      ...result.rows[0],
      source_bundle_sha256: marker.sourceBundleSha256,
      authorization_revision: 'REV_1',
    });
  } finally {
    await admin.end();
  }
}
