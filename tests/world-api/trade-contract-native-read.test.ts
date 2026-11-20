/** TEST_ONLY real PG16 query/RLS/role evidence. No contract producer or source admission. */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, lstat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import * as C from '@econmind/core';
import {
  createOwnedSocialOfficeDatabase,
  createIsolatedSocialOfficeIdentity,
} from '../support/f-social-office-isolated-host.js';
import { PostgresSqlDatabase } from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import { WorldOpeningSeedStore } from '../../apps/world-worker/src/persistence/opening-seed-store.js';
import { parseSupabaseAuthSubject } from '../../apps/world-api/src/integration/identity.js';
import { createPostgresRuntimeReadExecutor } from '../../apps/world-api/src/integration/postgres-runtime-read-executor.js';
import {
  createTradeContractRuntimeReadService,
  TRADE_CONTRACT_RUNTIME_QUERY_OPERATION,
  TRADE_CONTRACT_RUNTIME_QUERY_SCHEMA,
} from '../../apps/world-api/src/integration/trade-contract-runtime-read-service.js';
import type { ParameterizedPgReadExecutor } from '../../apps/world-api/src/integration/postgres-read-adapter.js';
import {
  readTradeContractRuntimePage,
  TRADE_CONTRACT_RUNTIME_READ_QUERY,
  type ServerTradeContractRuntimeScope,
} from '../../apps/world-api/src/read-models/trade-contract-runtime-reader.js';

const run = promisify(execFile);
const root = path.resolve(import.meta.dirname, '../..');
const sha = (value: string | Buffer) =>
  createHash('sha256').update(value).digest('hex');
const native =
  process.env.ECONMIND_TRADE_NATIVE_TESTS === '1' ? describe : describe.skip;
const WORLD = 'WORLD_TRADE_TEST_ONLY',
  OTHER_WORLD = 'WORLD_OTHER_TRADE_TEST_ONLY',
  NO_AUDIT_WORLD = 'WORLD_NO_AUDIT_TRADE_TEST_ONLY';
const SUBJECT = parseSupabaseAuthSubject(
  '7f1c4f94-75b4-4876-a741-50bd31e14b21',
);
const FOREIGN_SUBJECT = parseSupabaseAuthSubject(
  '123e4567-e89b-42d3-a456-426614174001',
);
const READER = 'trade_test_only_native_reader',
  DENIED = 'trade_test_only_denied',
  PUBLISHER = 'trade_test_only_publisher';
const NOW = '2026-10-28T00:00:00.000Z';
const scopeKey = (country = 'COUNTRY_TEST_ONLY_A') =>
  `OFFICE_${Buffer.from(country).toString('hex').toUpperCase()}_5452414445`;
const scope: ServerTradeContractRuntimeScope = {
  authSubject: SUBJECT,
  worldId: WORLD,
  countryId: 'COUNTRY_TEST_ONLY_A',
  officeId: 'TRADE',
  teamId: 'TEAM_TEST_ONLY_CURRENT',
  authorizationRevision: 'AUTH_TEST_ONLY_CURRENT',
  classification: 'OFFICE_PRIVATE',
  scopeKey: scopeKey(),
};
const childEnv = { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' };

native(
  'Trade native TEST_ONLY durable SQL over unchanged current schema',
  () => {
    it('executes own-subject/team references, rejects stale/cross-scope/roles, pages and survives its owned PGDATA restart without admitting a source', async () => {
      const owned = await createOwnedSocialOfficeDatabase();
      const pools: Pool[] = [];
      let closed = false,
        restarted = false;
      let restartedPID: { pid: string; epoch: string; os: string } | undefined;
      const assertions: string[] = [];
      const evidence: Record<string, unknown> = {
        classification:
          'TEST_ONLY_ACTUAL_PG16_REFERENCE_READ_NOT_CONTRACT_EXECUTION_OR_ADMISSION',
        sourceAdmitted: false,
        productionAdmission: false,
        WorldClock: false,
        assertions,
      };
      const output = '/tmp/office-evidence/trade-native.json';
      const markerUtf8 = await readFile(
        path.join(owned.marker.root, 'owned-postgres.json'),
        'utf8',
      );
      const pool = (user: string) => {
        const p = new Pool({
          host: owned.marker.socket,
          port: owned.marker.port,
          database: owned.marker.database,
          user,
          max: 1,
          application_name: 'ECONMIND_TRADE_TEST_ONLY',
        });
        pools.push(p);
        return p;
      };
      const note = (name: string) => assertions.push(name);
      const identity = async (pid: string) =>
        (
          await run('/bin/ps', ['-p', pid, '-o', 'uid=', '-o', 'lstart='], {
            env: childEnv,
          })
        ).stdout.trim();
      const assertOwned = async () => {
        expect(
          await readFile(
            path.join(owned.marker.root, 'owned-postgres.json'),
            'utf8',
          ),
        ).toBe(markerUtf8);
        for (const p of [
          owned.marker.root,
          owned.marker.data,
          owned.marker.socket,
        ]) {
          const s = await lstat(p);
          expect(
            s.isDirectory() &&
              !s.isSymbolicLink() &&
              s.uid === process.getuid() &&
              (s.mode & 0o777) === 0o700,
          ).toBe(true);
        }
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
        for (const [index, m] of manifest.migrations.entries()) {
          await admin.query(originals[index]!);
          await admin.query(
            'insert into world_v2.schema_release(migration_id,artifact_sha256,source_repo_commit,release_order) values($1,$2,$3,$4)',
            [
              m.migration_id,
              m.sha256,
              m.artifact_source_commit,
              m.release_order,
            ],
          );
        }
        // Original proposal, including the immutable ADMISSION publication veto.
        await admin.query(
          await readFile(
            path.join(
              root,
              'database/proposals/runtime-read-binding-storage.sql',
            ),
            'utf8',
          ),
        );
        note('all-23-original-migration-bytes-and-provenance-verified');
        const seeds = new Map<string, Readonly<C.OpeningSeed>>();
        const store = new WorldOpeningSeedStore({
          database: new PostgresSqlDatabase(admin),
          sha256Hex: sha,
        });
        for (const world of [WORLD, OTHER_WORLD, NO_AUDIT_WORLD]) {
          const source = C.createOpeningSource(
            {
              schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
              sourceId: C.openingSourceId(`SOURCE_${world}`),
              sourceKind: 'AUTHORITATIVE_DATASET',
              locator:
                'dataset://TEST_ONLY_EMPTY_NATIVE_TRADE_SQL_NOT_ADMITTED',
              sourceVersion: 'TEST_ONLY.1',
              payload: {
                TEST_ONLY:
                  'REFERENCE_QUERY_FIXTURE_NOT_ECONOMIC_EXECUTION_OR_ADMISSION',
              },
            },
            sha,
          );
          const seed = C.createOpeningSeed(
            {
              schemaVersion: C.OPENING_SEED_SCHEMA_VERSION,
              seedId: C.openingSeedId(`SEED_${world}`),
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
          await store.bootstrap({ seed, bootstrappedAtReal: NOW });
          seeds.set(world, seed);
          await admin.query(
            `insert into world_v2.current_commit_authorization(world_id,auth_subject,country_id,office_id,capability,team_id,authorization_version,active,refreshed_at_real) values($1,$2,$3,'TRADE','TRADE_CONTRACTS',$4,$5,true,$6)`,
            [
              world,
              SUBJECT,
              scope.countryId,
              scope.teamId,
              scope.authorizationRevision,
              NOW,
            ],
          );
          await admin.query(
            `insert into world_v2.projection_entitlement(world_id,auth_subject,classification,scope_key,authorization_version,active,granted_at) values($1,$2,'OFFICE_PRIVATE',$3,$4,true,$5)`,
            [world, SUBJECT, scope.scopeKey, scope.authorizationRevision, NOW],
          );
        }
        async function committed(
          index: number,
          options: {
            world?: string;
            version?: number;
            subject?: string;
            team?: string;
            country?: string;
            office?: string;
            missingAudit?: boolean;
          } = {},
        ) {
          const world = options.world ?? WORLD,
            version = options.version ?? index;
          const command = C.parseCanonicalCommand(
            {
              schemaVersion: C.COMMAND_SCHEMA_VERSION,
              commandId: `TRADE_TEST_ONLY_COMMAND_${String(index).padStart(2, '0')}`,
              commandType: 'TEST_ONLY_TRADE_REFERENCE_COMMAND',
              actorId: 'ACTOR_TRADE_TEST_ONLY',
              authSubject: options.subject ?? SUBJECT,
              countryId: options.country ?? scope.countryId,
              officeId: options.office ?? 'TRADE',
              worldId: world,
              expectedWorldVersion: String(version - 1),
              idempotencyKey: `TRADE_TEST_ONLY_KEY_${index}`,
              simTime: '1',
              correlationId: 'TRADE_TEST_ONLY_TRACE',
              submittedAtReal: NOW,
              payload: { TEST_ONLY_PRIVATE_TERMS: 'MUST_NEVER_BE_RETURNED' },
            },
            sha,
          );
          const event = C.parseAuthoritativeEvent(
            {
              schemaVersion: C.EVENT_SCHEMA_VERSION,
              eventId: `TRADE_TEST_ONLY_EVENT_${index}`,
              eventType: 'TEST_ONLY_TRADE_REFERENCE_EVENT',
              worldId: world,
              worldVersion: String(version),
              sequence: String(version),
              causationCommandId: command.commandId,
              correlationId: command.correlationId,
              correctsEventId: null,
              simTime: '1',
              recordedAtReal: NOW,
              payload: { TEST_ONLY_PRIVATE_EVENT: 'MUST_NEVER_BE_RETURNED' },
            },
            sha,
          );
          const transition = C.createAuthoritativeTransition({
            command,
            worldVersionBefore: String(version - 1),
            worldVersionAfter: String(version),
            events: [event],
          });
          const receipt = C.createFinalCommandReceipt({
            command,
            transition,
            outcome: 'COMMITTED',
            reasonCode: null,
            simTime: command.simTime,
            recordedAtReal: NOW,
          });
          await admin.query(
            `insert into world_v2.command_submission(world_id,command_id,idempotency_key,command_type,schema_version,canonical_payload,payload_sha256,command_fingerprint,auth_subject,actor_id,country_id,office_id,expected_world_version,sim_time,correlation_id,submitted_at_real) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
            [
              world,
              command.commandId,
              command.idempotencyKey,
              command.commandType,
              command.schemaVersion,
              command.canonicalPayload,
              command.payloadHash,
              command.fingerprint,
              command.authSubject,
              command.actorId,
              command.countryId,
              command.officeId,
              command.expectedWorldVersion,
              '1',
              command.correlationId,
              NOW,
            ],
          );
          await admin.query(
            `insert into world_v2.authoritative_event(world_id,event_id,event_sequence,world_version,causation_command_id,correlation_id,event_type,schema_version,canonical_payload,payload_sha256,event_fingerprint,sim_time,recorded_at_real) values($1,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10,1,$11)`,
            [
              world,
              event.eventId,
              event.sequence,
              command.commandId,
              event.correlationId,
              event.eventType,
              event.schemaVersion,
              event.canonicalPayload,
              event.payloadHash,
              event.fingerprint,
              NOW,
            ],
          );
          if (!options.missingAudit)
            await admin.query(
              `insert into world_v2.authoritative_commit_authorization(world_id,command_id,authority_kind,auth_subject,actor_id,country_id,office_id,capability,team_id,authorization_version,committed_at_real) values($1,$2,'DISCRETIONARY_USER',$3,$4,$5,$6,'TRADE_CONTRACTS',$7,'AUTH_TEST_ONLY_AT_COMMIT',$8)`,
              [
                world,
                command.commandId,
                command.authSubject,
                command.actorId,
                command.countryId,
                command.officeId,
                options.team ?? scope.teamId,
                NOW,
              ],
            );
          await admin.query(
            `insert into world_v2.command_receipt(world_id,command_id,idempotency_key,schema_version,command_fingerprint,outcome,transition_id,world_version_before,world_version_after,sim_time,event_ids,recorded_at_real) values($1,$2,$3,$4,$5,'COMMITTED',$2,$6,$7,1,$8,$9)`,
            [
              world,
              receipt.commandId,
              receipt.idempotencyKey,
              receipt.schemaVersion,
              receipt.commandFingerprint,
              receipt.worldVersionBefore,
              receipt.worldVersionAfter,
              JSON.stringify(receipt.eventIds),
              NOW,
            ],
          );
          await admin.query(
            'update world_v2.world_head set world_version=$2,event_sequence=$2 where world_id=$1',
            [world, String(version)],
          );
        }
        await committed(1);
        await committed(2, { team: 'TEAM_TEST_ONLY_OLD' });
        await committed(3, { subject: FOREIGN_SUBJECT });
        await committed(4, { country: 'COUNTRY_TEST_ONLY_OTHER' });
        await committed(5, { office: 'FINANCE' });
        await committed(6);
        await committed(7);
        await committed(8, { world: OTHER_WORLD, version: 1 });
        await committed(9, {
          world: NO_AUDIT_WORLD,
          version: 1,
          missingAudit: true,
        });
        for (const role of [READER, DENIED])
          await admin.query(
            `create role ${role} login noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication`,
          );
        await admin.query(
          `create role ${PUBLISHER} nologin noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication`,
        );
        await admin.query(`grant usage on schema world_v2 to ${READER}`);
        const tables = [
          'world_head',
          'command_submission',
          'command_receipt',
          'authoritative_event',
          'inventory_posting',
          'financial_posting_batch',
          'authoritative_commit_authorization',
          'current_commit_authorization',
          'projection_entitlement',
          'current_negotiation_party_membership',
          'read_projection',
          'opening_seed',
          'runtime_read_seat',
          'runtime_opening_admission',
        ];
        for (const table of tables)
          await admin.query(`grant select on world_v2.${table} to ${READER}`);
        // TEST_ONLY provisioning to this new role only; original schema/policies/veto remain.
        await admin.query(
          `create policy trade_test_only_opening_read on world_v2.opening_seed for select to ${READER} using(exists(select 1 from world_v2.current_commit_authorization a where a.world_id=opening_seed.world_id and a.auth_subject::text=current_setting('request.jwt.claim.sub',true) and a.active))`,
        );
        await admin.query(
          `create policy trade_test_only_party_read on world_v2.current_negotiation_party_membership for select to ${READER} using(auth_subject::text=current_setting('request.jwt.claim.sub',true) and active)`,
        );
        await admin.query(
          `insert into world_v2.read_projection(world_id,classification,scope_key,schema_version,world_version,event_sequence,payload,generated_at) values($1,'OFFICE_PRIVATE',$2,'world-projection-read-v1',7,7,'{"TEST_ONLY":"REFERENCE_FIXTURE_NOT_ADMISSION"}',$3)`,
          [WORLD, scope.scopeKey, NOW],
        );
        await admin.query(
          `insert into world_v2.runtime_read_seat(seat_ref,world_id,auth_subject,country_id,office_id,team_id,authorization_revision) values('TRADE_TEST_ONLY_SEAT',$1,$2,$3,'TRADE',$4,$5)`,
          [
            WORLD,
            SUBJECT,
            scope.countryId,
            scope.teamId,
            scope.authorizationRevision,
          ],
        );
        const reader = pool(READER),
          denied = pool(DENIED);
        const role = (
          await reader.query(
            'select current_user as role,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole from pg_roles where rolname=current_user',
          )
        ).rows[0];
        expect(role).toEqual({
          role: READER,
          rolsuper: false,
          rolbypassrls: false,
          rolcreatedb: false,
          rolcreaterole: false,
        });
        note('restricted-reader-nonsuperuser-nobypassrls');
        // This explicit fixture executor exercises exact SQL + real subject-bound
        // RLS only. It is NOT the production binding consumer or an admission grant.
        const rawExecutor = (p: Pool): ParameterizedPgReadExecutor => ({
          async query(request) {
            if (
              request.text !== TRADE_CONTRACT_RUNTIME_READ_QUERY ||
              request.values[1] !== request.verifiedAuthSubject
            )
              throw Error('TEST_ONLY_QUERY_DENIED');
            const client = await p.connect();
            try {
              await client.query(
                'begin isolation level repeatable read read only',
              );
              await client.query(
                "select set_config('request.jwt.claim.sub',$1,true)",
                [request.verifiedAuthSubject],
              );
              const result = await client.query(request.text, [
                ...request.values,
              ]);
              await client.query('commit');
              return { rows: result.rows };
            } catch (error) {
              await client.query('rollback');
              throw error;
            } finally {
              client.release();
            }
          },
        });
        const read = (
          s = scope,
          page: Parameters<
            typeof readTradeContractRuntimePage
          >[0]['page'] = undefined,
          p = reader,
        ) =>
          readTradeContractRuntimePage({
            executor: rawExecutor(p),
            scope: s,
            ...(page ? { page } : {}),
          });
        const first = await read(scope, { limit: 1 });
        expect(first.status).toBe('PAGE');
        if (first.status !== 'PAGE') throw Error('EXPECTED_NATIVE_PAGE');
        const second = await read(scope, {
          limit: 1,
          cursor: first.nextCursor!,
        });
        expect(second.status).toBe('PAGE');
        if (second.status !== 'PAGE') throw Error('EXPECTED_NATIVE_PAGE');
        const third = await read(scope, {
          limit: 1,
          cursor: second.nextCursor!,
        });
        expect(third.status).toBe('PAGE');
        if (third.status !== 'PAGE') throw Error('EXPECTED_NATIVE_PAGE');
        expect([first, second, third].map((p) => p.rows[0]!.commandId)).toEqual(
          [
            'TRADE_TEST_ONLY_COMMAND_01',
            'TRADE_TEST_ONLY_COMMAND_06',
            'TRADE_TEST_ONLY_COMMAND_07',
          ],
        );
        expect(third.nextCursor).toBeNull();
        expect(first.rows[0]!.ledger).toEqual({
          status: 'UNAVAILABLE_NO_POSTINGS',
          postings: [],
        });
        expect(JSON.stringify([first, second, third])).not.toContain(
          'MUST_NEVER_BE_RETURNED',
        );
        expect(first.coverage.contractResults).toBe(
          'UNAVAILABLE_NO_PERSISTED_CONTRACT_MODEL',
        );
        expect(first.coverage.numericResults).toBe('NOT_AUTHORIZED');
        note(
          'actual-native-sql-own-subject-current-team-country-office-and-three-page-order',
        );
        note('raw-payload-and-numeric-contract-results-not-disclosed');
        for (const s of [
          { ...scope, authSubject: FOREIGN_SUBJECT },
          { ...scope, teamId: 'TEAM_TEST_ONLY_OLD' },
          {
            ...scope,
            countryId: 'COUNTRY_TEST_ONLY_OTHER',
            scopeKey: scopeKey('COUNTRY_TEST_ONLY_OTHER'),
          },
          { ...scope, officeId: 'FINANCE' as 'TRADE' },
        ])
          expect(await read(s)).toMatchObject({ status: 'DENIED', rows: [] });
        note('foreign-subject-old-team-cross-country-and-other-office-denied');
        expect(await read({ ...scope, worldId: NO_AUDIT_WORLD })).toMatchObject(
          {
            status: 'UNAVAILABLE',
            reason: 'COMMIT_AUTHORIZATION_UNAVAILABLE',
            rows: [],
          },
        );
        expect(await read(scope, undefined, denied)).toMatchObject({
          status: 'UNAVAILABLE',
          reason: 'DATABASE_UNAVAILABLE',
          rows: [],
        });
        await expect(
          denied.query('select * from world_v2.command_receipt'),
        ).rejects.toMatchObject({ code: '42501' });
        await expect(
          reader.query(
            'update world_v2.world_head set world_version=world_version',
          ),
        ).rejects.toMatchObject({ code: '42501' });
        note(
          'missing-immutable-audit-withholds-page-and-ungranted-role-or-write-is-denied',
        );
        const params = [
          WORLD,
          SUBJECT,
          scope.countryId,
          scope.teamId,
          scope.authorizationRevision,
          scope.classification,
          scope.scopeKey,
          '2',
          '',
          '',
          '',
          '',
        ];
        const managed = createPostgresRuntimeReadExecutor({
          pool: reader,
          readerRole: READER,
          authorizationPublisherRole: PUBLISHER,
        });
        await expect(
          managed.query({
            text: TRADE_CONTRACT_RUNTIME_READ_QUERY + ' ',
            values: params,
            verifiedAuthSubject: SUBJECT,
          }),
        ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
        await expect(
          managed.query({
            text: TRADE_CONTRACT_RUNTIME_READ_QUERY,
            values: params,
            verifiedAuthSubject: FOREIGN_SUBJECT,
          }),
        ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
        expect(
          (
            await managed.query({
              text: TRADE_CONTRACT_RUNTIME_READ_QUERY,
              values: params,
              verifiedAuthSubject: SUBJECT,
            })
          ).rows,
        ).toEqual([]);
        const wrongRole = createPostgresRuntimeReadExecutor({
          pool: admin,
          readerRole: READER,
          authorizationPublisherRole: PUBLISHER,
        });
        expect(
          (
            await wrongRole.query({
              text: TRADE_CONTRACT_RUNTIME_READ_QUERY,
              values: params,
              verifiedAuthSubject: SUBJECT,
            })
          ).rows,
        ).toEqual([]);
        note(
          'actual-managed-whitelist-rejects-modified-sql-subject-mismatch-and-wrong-role',
        );
        const seed = seeds.get(WORLD)!;
        await expect(
          admin.query(
            `insert into world_v2.runtime_opening_admission(world_id,seed_id,seed_fingerprint,model_version,replay_binding) values($1,$2,$3,$4,$5)`,
            [
              WORLD,
              seed.seedId,
              seed.fingerprint,
              C.WORLD_MODEL_VERSION,
              C.canonicalSerialize(seed.replayBinding),
            ],
          ),
        ).rejects.toMatchObject({ code: '55000' });
        expect(
          (
            await admin.query(
              'select count(*)::int as count from world_v2.runtime_opening_admission',
            )
          ).rows[0]!.count,
        ).toBe(0);
        const identityPort = createIsolatedSocialOfficeIdentity();
        const service = createTradeContractRuntimeReadService({
          pool: reader,
          readerRole: READER,
          authorizationPublisherRole: PUBLISHER,
          modelVersion: C.WORLD_MODEL_VERSION,
          endpointPins: {
            origin: 'https://trade-native-test.invalid',
            projectionPath: '/v1/trade-projection',
            finalLookupPath: '/v1/trade-final',
            deploymentRef: 'TRADE_TEST_ONLY_DEPLOYMENT',
          },
          admittedWorldPins: {
            worldId: WORLD,
            seedRef: seed.seedId,
            contentHash: seed.fingerprint,
            admissionRef: 'ADMISSION_EXPECTED_BUT_UNPUBLISHED_TEST_ONLY',
            minimumWorldVersion: '0',
          },
          auth: identityPort.config,
          routeOptions: {
            allowedOrigins: ['https://trade-native-test.invalid'],
          },
        });
        const serviceResult = await service.handle({
          authorization: identityPort.authorization,
          request: {
            schemaVersion: TRADE_CONTRACT_RUNTIME_QUERY_SCHEMA,
            operation: TRADE_CONTRACT_RUNTIME_QUERY_OPERATION,
            requestId: '123e4567-e89b-42d3-a456-426614174099',
            page: { limit: 1 },
          },
        });
        expect(serviceResult).toMatchObject({
          httpStatus: 503,
          body: { ok: false, error: { code: 'READ_BINDING_UNAVAILABLE' } },
        });
        evidence.formalService = serviceResult;
        evidence.formalServicePositive =
          'NOT_RUN_NO_REAL_ADMITTED_RESULT_PUBLISHER';
        note(
          'original-admission-publication-veto-preserved-and-authenticated-service-fails-closed',
        );
        await admin.query(
          "update world_v2.current_commit_authorization set team_id='TEAM_TEST_ONLY_NEW',authorization_version='AUTH_TEST_ONLY_NEW' where world_id=$1 and auth_subject=$2",
          [WORLD, SUBJECT],
        );
        await admin.query(
          "update world_v2.projection_entitlement set authorization_version='AUTH_TEST_ONLY_NEW' where world_id=$1 and auth_subject=$2",
          [WORLD, SUBJECT],
        );
        expect(await read()).toMatchObject({ status: 'DENIED' });
        expect(
          await read({
            ...scope,
            teamId: 'TEAM_TEST_ONLY_NEW',
            authorizationRevision: 'AUTH_TEST_ONLY_NEW',
          }),
        ).toMatchObject({ status: 'EMPTY', rows: [] });
        await admin.query(
          'update world_v2.current_commit_authorization set team_id=$3,authorization_version=$4 where world_id=$1 and auth_subject=$2',
          [WORLD, SUBJECT, scope.teamId, scope.authorizationRevision],
        );
        await admin.query(
          'update world_v2.projection_entitlement set authorization_version=$3 where world_id=$1 and auth_subject=$2',
          [WORLD, SUBJECT, scope.authorizationRevision],
        );
        note('current-team-transfer-does-not-reveal-old-team-history');
        await committed(8, { team: 'TEAM_TEST_ONLY_OLD' });
        expect(
          await read(scope, { limit: 1, cursor: first.nextCursor! }),
        ).toMatchObject({
          status: 'STALE',
          reason: 'PAGE_HEAD_CHANGED',
          rows: [],
        });
        note('continuation-refuses-advanced-watermark');
        const beforeRestart = await read();
        expect(beforeRestart.status).toBe('PAGE');
        evidence.beforeRestart = beforeRestart;
        const controlBefore = (
          await run(
            path.join(owned.marker.bin, 'pg_controldata'),
            [owned.marker.data],
            { env: childEnv },
          )
        ).stdout;
        const systemId = controlBefore.match(
          /^Database system identifier:\s+(\d+)$/mu,
        )?.[1];
        expect(systemId).toMatch(/^\d+$/u);
        for (const p of pools) await p.end();
        pools.length = 0;
        evidence.ownedCleanup = await owned.close();
        closed = true;
        expect(evidence.ownedCleanup).toMatchObject({
          status: 'STOPPED',
          roleSessions: 0,
          pgStatus: 3,
        });
        await assertOwned();
        const stopped = (
          await run(
            path.join(owned.marker.bin, 'pg_controldata'),
            [owned.marker.data],
            { env: childEnv },
          )
        ).stdout;
        expect(stopped).toContain('shut down');
        expect(stopped).toContain(systemId!);
        await run(
          path.join(owned.marker.bin, 'pg_ctl'),
          [
            '-D',
            owned.marker.data,
            '-l',
            path.join(owned.marker.root, 'trade-test-only-restart.log'),
            '-o',
            `-k ${owned.marker.socket} -p ${owned.marker.port} -c listen_addresses=''`,
            '-w',
            '-t',
            '30',
            'start',
          ],
          { env: childEnv, timeout: 35000 },
        );
        restarted = true;
        const pid = (
          await readFile(path.join(owned.marker.data, 'postmaster.pid'), 'utf8')
        ).split('\n');
        expect(pid[1]).toBe(owned.marker.data);
        expect(pid[3]).toBe(String(owned.marker.port));
        expect(pid[4]).toBe(owned.marker.socket);
        restartedPID = {
          pid: pid[0]!,
          epoch: pid[2]!,
          os: await identity(pid[0]!),
        };
        expect(restartedPID.os.split(/\s+/u)[0]).toBe(String(process.getuid()));
        const afterPool = pool(READER);
        const afterRestart = await read(scope, undefined, afterPool);
        expect(afterRestart).toEqual(beforeRestart);
        evidence.afterRestart = afterRestart;
        const controlAfter = (
          await run(
            path.join(owned.marker.bin, 'pg_controldata'),
            [owned.marker.data],
            { env: childEnv },
          )
        ).stdout;
        expect(controlAfter).toContain(systemId!);
        note(
          'same-system-id-private-pgdata-restart-preserves-exact-native-reference-page',
        );
        evidence.sourceFiles = await Promise.all(
          [
            'apps/world-api/src/read-models/trade-contract-runtime-reader.ts',
            'apps/world-api/src/integration/trade-contract-runtime-read-service.ts',
            'apps/world-api/src/integration/postgres-runtime-read-executor.ts',
            'tests/world-api/trade-contract-native-read.test.ts',
          ].map(async (file) => ({
            path: file,
            sha256: sha(await readFile(path.join(root, file))),
          })),
        );
      } finally {
        for (const p of pools) await p.end();
        if (!closed) evidence.ownedCleanup = await owned.close();
        if (restarted && restartedPID) {
          await assertOwned();
          const pid = (
            await readFile(
              path.join(owned.marker.data, 'postmaster.pid'),
              'utf8',
            )
          ).split('\n');
          expect(pid[0]).toBe(restartedPID.pid);
          expect(pid[2]).toBe(restartedPID.epoch);
          expect(await identity(restartedPID.pid)).toBe(restartedPID.os);
          await run(
            path.join(owned.marker.bin, 'pg_ctl'),
            ['-D', owned.marker.data, '-m', 'fast', '-w', '-t', '30', 'stop'],
            { env: childEnv, timeout: 35000 },
          );
          await expect(
            lstat(path.join(owned.marker.data, 'postmaster.pid')),
          ).rejects.toMatchObject({ code: 'ENOENT' });
          evidence.restartCleanup = {
            status: 'STOPPED',
            boundPID: restartedPID.pid,
            foreignProcessTouched: false,
          };
        }
        await mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
        await writeFile(output, JSON.stringify(evidence, null, 2) + '\n', {
          mode: 0o600,
        });
      }
      console.log(
        JSON.stringify({
          classification: evidence.classification,
          assertions: assertions.length,
          evidence: output,
          sourceAdmitted: false,
          productionAdmission: false,
          WorldClock: false,
        }),
      );
    }, 120_000);
  },
);
