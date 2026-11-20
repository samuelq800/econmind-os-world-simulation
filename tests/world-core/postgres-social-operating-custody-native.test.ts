/** Disposable PG16.15 SQL protocol, small TEST_ONLY canonical source, and
 * ephemeral TEST_ONLY signed admission. Never a real Owner grant/deployment. */
import {
  spawn,
  spawnSync,
  type ChildProcessWithoutNullStreams,
} from 'node:child_process';
import { createHash, generateKeyPairSync, sign, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  canonicalSerialize,
  createOpeningSeed,
  createOpeningSource,
  openingSeedId,
  openingSourceId,
  worldId,
  CURRENT_REPLAY_BINDING,
  OPENING_SEED_SCHEMA_VERSION,
  OPENING_SOURCE_SCHEMA_VERSION,
} from '@econmind/core';
import { WorldOpeningSeedStore } from '../../apps/world-worker/src/persistence/opening-seed-store.js';
import {
  createPostgresSocialOperatingSourcePublisher,
  createPostgresSocialOperatingCustody,
  SOCIAL_OPERATING_CUSTODY_ROLES,
} from '../../apps/world-worker/src/persistence/postgres-social-operating-custody.js';
import { SOCIAL_SOURCE_MATERIAL_PATHS } from '../../apps/world-worker/src/persistence/social-employment-source-input.js';
import {
  PrivateOpeningAdmissionAuthority,
  resolvePrivateOpeningPublicationAuthorization,
  OPENING_PUBLICATION_SIGNATURE_DOMAIN,
  type OpeningPublicationAuthorization,
} from '../../apps/world-worker/src/admission/private-opening-admission-authority.js';
import type {
  SqlExecutor,
  SqlDatabase,
  SqlQueryResult,
} from '../../apps/world-worker/src/persistence/sql-database.js';
const root = path.resolve(import.meta.dirname, '../..');
const image =
  'postgres@sha256:1beaa3084eee2676f20a9cd9928f0bf2c5bf674f8e49f81017912183d377c61c';
const sha = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
const quote = (value: unknown) =>
  value === null ? 'null' : `'${String(value).replaceAll("'", "''")}'`;
function docker(args: string[]) {
  const r = spawnSync('docker', args, {
    encoding: 'utf8',
    maxBuffer: 67108864,
  });
  if (r.status !== 0) throw Error(`TEST_ONLY_DOCKER_FAILED:${r.stderr}`);
  return r.stdout;
}
class NativeSession implements SqlExecutor {
  readonly process: ChildProcessWithoutNullStreams;
  private pending: {
    mark: string;
    resolve: (value: SqlQueryResult) => void;
    reject: (reason: Error) => void;
    json: boolean;
  } | null = null;
  private output = '';
  private errors = '';
  constructor(container: string, user = 'postgres') {
    this.process = spawn('docker', [
      'exec',
      '-i',
      '--user',
      'postgres',
      container,
      'psql',
      '-XqAt',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      user,
      'postgres',
    ]);
    this.process.stderr.on('data', (part) => {
      this.errors += String(part);
    });
    this.process.stdout.on('data', (part) => {
      this.output += String(part);
      const p = this.pending;
      if (p && this.output.includes(p.mark + '\n')) {
        const data = this.output
          .slice(0, this.output.indexOf(p.mark + '\n'))
          .trim();
        this.output = this.output.slice(
          this.output.indexOf(p.mark + '\n') + p.mark.length + 1,
        );
        this.pending = null;
        try {
          const rows = p.json ? JSON.parse(data) : [];
          p.resolve({ rowCount: rows.length, rows });
        } catch {
          p.reject(Error('TEST_ONLY_PSQL_RESULT_INVALID'));
        }
      }
    });
    this.process.on('exit', () => {
      this.pending?.reject(Error(this.errors || 'TEST_ONLY_PSQL_EXIT'));
      this.pending = null;
    });
  }
  async query<Row extends object = Record<string, unknown>>(
    statement: string,
    parameters: readonly unknown[] = [],
  ): Promise<SqlQueryResult<Row>> {
    if (this.pending) throw Error('TEST_ONLY_NO_PARALLEL_SINGLE_SESSION');
    const sql = parameters.length
      ? statement.replace(/\$(\d+)/gu, (_match, index: string) =>
          quote(parameters[Number(index) - 1]),
        )
      : statement;
    const json = /^\s*select\b/iu.test(sql) && !sql.trimEnd().endsWith(';');
    const command = json
      ? `select coalesce(json_agg(q),'[]'::json)::text from (${sql}) q`
      : sql;
    const mark = 'RESULT_' + randomUUID().replaceAll('-', '');
    return new Promise((resolve, reject) => {
      this.pending = {
        mark,
        resolve: resolve as (value: SqlQueryResult) => void,
        reject,
        json,
      };
      this.process.stdin.write(command + ';\n\\echo ' + mark + '\n');
    });
  }
  async close() {
    if (this.process.exitCode !== null || this.process.signalCode !== null)
      return;
    this.process.stdin.end('\\q\n');
    await Promise.race([
      new Promise<void>((resolve) =>
        this.process.once('exit', () => resolve()),
      ),
      new Promise<void>((resolve) =>
        setTimeout(() => {
          this.process.kill('SIGTERM');
          resolve();
        }, 2000),
      ),
    ]);
  }
}
const native =
  process.env.ECONMIND_SOCIAL_CUSTODY_NATIVE_TESTS === '1'
    ? describe
    : describe.skip;
native(
  'actual isolated PostgreSQL Social original issuer and cooperating locks',
  () => {
    it('registers exact signed TEST_ONLY SQL originals, rejects incomplete E03 and serializes source revocation', async () => {
      const container =
          'econmind-social-custody-' +
          randomUUID().replaceAll('-', '').slice(0, 12),
        sessions: NativeSession[] = [];
      const open = (user?: string) => {
        const s = new NativeSession(container, user);
        sessions.push(s);
        return s;
      };
      let started = false;
      try {
        docker([
          'run',
          '-d',
          '--name',
          container,
          '--network',
          'none',
          '--cpus',
          '1',
          '-e',
          'POSTGRES_HOST_AUTH_METHOD=trust',
          image,
        ]);
        started = true;
        let ready = false;
        for (let attempt = 0; attempt < 60; attempt++) {
          const probe = spawnSync(
            'docker',
            [
              'exec',
              '--user',
              'postgres',
              container,
              'pg_isready',
              '-U',
              'postgres',
            ],
            { encoding: 'utf8' },
          );
          if (
            probe.status === 0 &&
            spawnSync('docker', ['logs', container], {
              encoding: 'utf8',
            }).stdout.includes('PostgreSQL init process complete')
          ) {
            ready = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        expect(ready).toBe(true);
        expect(
          docker([
            'exec',
            '--user',
            'postgres',
            container,
            'postgres',
            '--version',
          ]),
        ).toContain('16.15');
        expect(
          JSON.parse(
            docker([
              'inspect',
              '--format',
              '{{json .HostConfig.PortBindings}}',
              container,
            ]),
          ) ?? {},
        ).toEqual({});
        const admin = open();
        await admin.query(
          'create schema storage; create table storage.objects(bucket_id text); alter table storage.objects enable row level security; create role anon; create role authenticated; create role service_role;',
        );
        const manifest = JSON.parse(
          await readFile(
            path.join(root, 'database/migrations/manifest.json'),
            'utf8',
          ),
        ) as {
          migrations: {
            path: string;
            sha256: string;
            migration_id: string;
            artifact_source_commit: string;
            release_order: number;
          }[];
        };
        for (const migration of manifest.migrations) {
          const bytes = await readFile(path.join(root, migration.path), 'utf8');
          expect(sha(bytes)).toBe(migration.sha256);
          await admin.query(bytes);
          await admin.query(
            `insert into world_v2.schema_release(migration_id,artifact_sha256,source_repo_commit,release_order)values(${quote(migration.migration_id)},${quote(migration.sha256)},${quote(migration.artifact_source_commit)},${migration.release_order});`,
          );
        }
        for (const file of [
          'runtime-read-binding-storage.sql',
          'runtime-admission-publication.sql',
          'social-operating-custody.sql',
        ])
          await admin.query(
            await readFile(path.join(root, 'database/proposals', file), 'utf8'),
          );
        // Small genuine Core source for SQL trust/locking mechanics only. The
        // TypeScript publisher must reject its deliberately incomplete full-E03
        // body. Real 70-country seed re-derivation is covered separately.
        const source = createOpeningSource(
          {
            schemaVersion: OPENING_SOURCE_SCHEMA_VERSION,
            sourceId: openingSourceId('SOURCE_TEST_ONLY_SQL_CUSTODY'),
            sourceKind: 'DOCUMENTED_ASSUMPTION',
            locator: 'TEST_ONLY_NOT_FORMAL_POSTWAR_SOURCE',
            sourceVersion: 'TEST_ONLY_V1',
            payload: {
              schemaVersion: 'postwar-operating-genesis-seed-source-v1',
              classification: 'TEST_ONLY_INCOMPLETE_FULL_E03_MUST_NOT_EXECUTE',
              carrier: {
                socialEmployment: { countries: [{ countryId: 'COUNTRY_01' }] },
              },
            },
          },
          sha,
        );
        const seed = createOpeningSeed(
          {
            schemaVersion: OPENING_SEED_SCHEMA_VERSION,
            seedId: openingSeedId('SEED_TEST_ONLY_SQL_CUSTODY'),
            worldId: worldId('WORLD_TEST_ONLY_SQL_CUSTODY'),
            openingWorldVersion: '0',
            replayBinding: CURRENT_REPLAY_BINDING,
            sources: [source],
            inventoryEntries: [],
            financialBatches: [],
          },
          sha,
        );
        const database: SqlDatabase = {
          query: admin.query.bind(admin),
          transaction: async (operation) => {
            await admin.query('begin');
            try {
              const value = await operation(admin);
              await admin.query('commit');
              return value;
            } catch (error) {
              await admin.query('rollback');
              throw error;
            }
          },
        };
        await admin.query(
          `insert into world_v2.world_head(world_id)values(${quote(seed.worldId)});`,
        );
        await new WorldOpeningSeedStore({ database, sha256Hex: sha }).bootstrap(
          { seed, bootstrappedAtReal: new Date().toISOString() },
        );
        const publicationUser = 'world_v2_opening_admission_custody_native';
        await admin.query(
          `create role ${publicationUser} login noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication;grant usage on schema world_v2 to ${publicationUser};grant execute on function world_v2.publish_runtime_admission_publication(text,text,text) to ${publicationUser};create role social_native_publisher login noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication;create role social_native_reader login noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication;create role social_native_alien login noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication;create role social_native_registrar login noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication;grant world_v2_admission_release to social_native_registrar;grant world_v2_social_source_publisher to social_native_publisher;grant world_v2_social_source_reader to social_native_reader;`,
        );
        // Controlled release registrar checks an actual ephemeral TEST_ONLY Ed25519 signature.
        const keys = generateKeyPairSync('ed25519'),
          now = Date.now(),
          claims: OpeningPublicationAuthorization = {
            schemaVersion: 'opening-publication-authorization-v1',
            purpose: 'AUTHORIZE_OFFICIAL_OPENING_ADMISSION_PUBLICATION',
            authorizationId: 'AUTHORIZATION_SOCIAL_CUSTODY_TEST_ONLY',
            keyId: 'KEY_SOCIAL_CUSTODY_TEST_ONLY',
            ownerIdentity: 'TEST_ONLY_NOT_REAL_OWNER',
            issuedAtReal: new Date(now - 60000).toISOString(),
            expiresAtReal: new Date(now + 600000).toISOString(),
            worldId: seed.worldId,
            seedId: seed.seedId,
            seedFingerprint: seed.fingerprint,
            modelVersion: seed.replayBinding.modelVersion,
            replayBinding: canonicalSerialize(seed.replayBinding),
            sourceBundleSha256: sha(
              'TEST_ONLY_NOT_OFFICIAL_SOURCE_PUBLICATION',
            ),
          };
        const canonicalAuthorization = canonicalSerialize(claims),
          envelope = {
            canonicalAuthorization,
            signatureBase64Url: sign(
              null,
              Buffer.from(
                OPENING_PUBLICATION_SIGNATURE_DOMAIN + canonicalAuthorization,
              ),
              keys.privateKey,
            ).toString('base64url'),
          };
        const authority = new PrivateOpeningAdmissionAuthority({
          trustedKeys: new Map([
            [
              claims.keyId,
              {
                publicKey: keys.publicKey,
                ownerIdentity: claims.ownerIdentity,
              },
            ],
          ]),
          registry: {
            load: async (reference) =>
              reference === claims.authorizationId ? envelope : null,
          },
        });
        expect(
          await resolvePrivateOpeningPublicationAuthorization(
            authority,
            claims.authorizationId,
            new Date().toISOString(),
          ),
        ).toEqual(claims);
        await admin.query('begin');
        await admin.query('set local role world_v2_admission_release');
        await admin.query(
          `insert into world_v2.runtime_admission_publication_permit(authorization_id,authorization_sha256,canonical_authorization,signature_base64url,world_id,seed_id,seed_fingerprint,model_version,replay_binding,source_bundle_sha256,caller_session_role,valid_from,valid_until)values(${[claims.authorizationId, sha(canonicalAuthorization), canonicalAuthorization, envelope.signatureBase64Url, claims.worldId, claims.seedId, claims.seedFingerprint, claims.modelVersion, claims.replayBinding, claims.sourceBundleSha256, publicationUser, claims.issuedAtReal, claims.expiresAtReal].map(quote).join(',')});`,
        );
        await admin.query('commit');
        const pubSession = open(publicationUser);
        await pubSession.query(
          'select world_v2.publish_runtime_admission_publication($1,$2,$3)',
          [
            claims.authorizationId,
            sha(canonicalAuthorization),
            claims.sourceBundleSha256,
          ],
        );
        // Explicit TEST_ONLY canonical read grants. No production enrollment is performed.
        for (const role of Object.values(SOCIAL_OPERATING_CUSTODY_ROLES))
          await admin.query(
            `grant select on world_v2.opening_seed to ${role};create policy ${role}_seed on world_v2.opening_seed for select to ${role} using(world_id=${quote(seed.worldId)});`,
          );
        const rights = (
          await admin.query<{
            reader_write: boolean;
            publisher_write: boolean;
            reader_publisher: boolean;
          }>(
            "select has_table_privilege('world_v2_social_source_reader','world_v2.social_operating_source_registration','INSERT,UPDATE,DELETE,TRUNCATE') as reader_write,has_table_privilege('world_v2_social_source_publisher','world_v2.social_operating_source_registration','INSERT,UPDATE,DELETE,TRUNCATE') as publisher_write,pg_has_role('world_v2_social_source_reader','world_v2_social_source_publisher','MEMBER') as reader_publisher",
          )
        ).rows[0]!;
        expect(rights).toEqual({
          reader_write: false,
          publisher_write: false,
          reader_publisher: false,
        });
        const outsider = open('social_native_reader');
        await outsider.query('begin isolation level repeatable read');
        await outsider.query('set local role world_v2_social_source_reader');
        await outsider.query(
          "select set_config('econmind.social_custody_world',$1,true)",
          [seed.worldId],
        );
        await expect(
          outsider.query(
            'select * from world_v2.lock_social_operating_source($1,$2)',
            ['WORLD_UNADMITTED_FOREIGN_SCOPE', 'COUNTRY_01'],
          ),
        ).rejects.toThrow('ADMISSION_REQUIRED');
        const forbiddenOwner = open('social_native_reader');
        await expect(
          forbiddenOwner.query('set role world_v2_social_source_owner'),
        ).rejects.toThrow('permission denied');
        const publisher = open('social_native_publisher'),
          reader = open('social_native_reader');
        await publisher.query('begin isolation level repeatable read');
        await publisher.query(
          'set local role world_v2_social_source_publisher',
        );
        const store = createPostgresSocialOperatingSourcePublisher({
          database,
        });
        await expect(
          store.registerFrom(publisher, {
            worldId: seed.worldId,
            countryId: 'COUNTRY_01',
          }),
        ).rejects.toThrow();
        // The separately trusted SQL publisher can register the exact admitted
        // original; a registry row alone still cannot pass the Core E03 reader.
        const registration = (
          await publisher.query<Record<string, unknown>>(
            'select * from world_v2.register_social_operating_source($1,$2)',
            [seed.worldId, 'COUNTRY_01'],
          )
        ).rows[0]!;
        expect(registration.issuer_role).toBe(
          SOCIAL_OPERATING_CUSTODY_ROLES.publisher,
        );
        await publisher.query('commit');
        // A genuine source registration still cannot manufacture a command vacancy.
        await admin.query(
          `grant select on world_v2.world_head,world_v2.authoritative_event,world_v2.command_receipt,world_v2.command_submission,world_v2.inventory_posting,world_v2.financial_posting_batch to world_v2_social_source_reader;`,
        );
        await reader.query('begin isolation level repeatable read');
        await reader.query('set local role world_v2_social_source_reader');
        // A caller's forged foreign context must be overwritten by the real
        // function argument; it cannot select a foreign admission under owner.
        await reader.query(
          "select set_config('econmind.social_custody_world',$1,true)",
          ['WORLD_FORGED_FOREIGN_CONTEXT'],
        );
        const locked = await reader.query(
          'select registration_ref from world_v2.lock_social_operating_source($1,$2)',
          [seed.worldId, 'COUNTRY_01'],
        );
        expect(locked.rows).toHaveLength(1);
        const race = open('social_native_publisher');
        await race.query('begin');
        await race.query('set local role world_v2_social_source_publisher');
        await race.query("set local lock_timeout='200ms'");
        await expect(
          race.query(
            'select world_v2.revoke_social_operating_source($1,$2,$3)',
            [seed.worldId, 'COUNTRY_01', 'TEST_ONLY_CONCURRENT_REVOKE'],
          ),
        ).rejects.toThrow();
        const permitRace = open('social_native_registrar');
        await permitRace.query('begin');
        await permitRace.query('set local role world_v2_admission_release');
        await permitRace.query("set local lock_timeout='200ms'");
        await expect(
          permitRace.query(
            `insert into world_v2.runtime_admission_publication_revocation(authorization_id,reason_ref)values(${quote(claims.authorizationId)},'TEST_ONLY_REVOKE_HELD_ADMISSION');`,
          ),
        ).rejects.toThrow();
        await reader.query('commit');
        await permitRace.close();
        await race.close();
        const revoke = open('social_native_publisher');
        await revoke.query('begin');
        await revoke.query('set local role world_v2_social_source_publisher');
        await revoke.query(
          'select world_v2.revoke_social_operating_source($1,$2,$3)',
          [seed.worldId, 'COUNTRY_01', 'TEST_ONLY_REVOKE_AFTER_RELEASE'],
        );
        await revoke.query('commit');
        expect(
          (
            await admin.query<{ version: string; sequence: string }>(
              'select world_version::text as version,event_sequence::text as sequence from world_v2.world_head where world_id=$1',
              [seed.worldId],
            )
          ).rows,
        ).toEqual([{ version: '0', sequence: '0' }]);
        await reader.query('begin isolation level repeatable read');
        await reader.query('set local role world_v2_social_source_reader');
        await expect(
          createPostgresSocialOperatingCustody({ database }).withSnapshotFrom(
            reader,
            {
              publicationHead: {
                worldId: seed.worldId,
                worldVersion: '0',
                eventSequence: '0',
              },
              worldBinding: {
                seedId: seed.seedId,
                seedFingerprint: seed.fingerprint,
                modelVersion: seed.replayBinding.modelVersion,
                replayBindingFingerprint: `sha256:${sha(canonicalSerialize(seed.replayBinding))}`,
              },
              purpose: 'SOCIAL_EMPLOYMENT_SERVICE_PLAN_SOURCE_EVALUATION_V1',
              commandBinding: {
                commandId: 'TEST_ONLY_COMMAND',
                commandFingerprint: `sha256:${'1'.repeat(64)}`,
                countryId: 'COUNTRY_01',
                locationId: 'REGION_01_E1',
                skill: 'HIGH',
                positionId: 'TEST_ONLY_NO_FAKE_VACANCY',
                servicePoolId: 'TEST_ONLY_POOL',
                dueDayIndex: '0',
                simTime: '1',
              },
              requiredMaterialPaths: SOCIAL_SOURCE_MATERIAL_PATHS,
            },
            async () => invalidReady(),
          ),
        ).rejects.toThrow('REVOKED');
      } finally {
        for (const session of sessions) {
          if (session.process.exitCode === null)
            await session.close().catch(() => {});
        }
        if (started) docker(['rm', '--force', '--volumes', container]);
      }
    }, 120000);
  },
);
function invalidReady(): never {
  throw Error('NO_FAKE_READY_CALLBACK_MUST_RUN');
}
