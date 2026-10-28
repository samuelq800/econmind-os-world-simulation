/** Opt-in actual H3 → real second-country POSITION H4 → full Core prefix →
 * bounded current pages. No source bootstrap, fake wage/balance, Clock or prod. */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import { describe, it, expect } from 'vitest';
import * as C from '@econmind/core';
import {
  loadPostwarNativeReferenceMarker,
  clonePostwarNativeReference,
  sealPostwarReferenceClone,
} from '../support/postwar-native-reference-db.js';
import { PostgresSqlDatabase } from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import {
  createPostwarSocialPositionRuntime,
  createPostwarSocialPositionRuntimeDatabase,
} from '../../apps/world-worker/src/persistence/postwar-social-position-runtime.js';
import {
  AtomicTransitionRepository,
  prepareAtomicTransitionCandidate,
} from '../../apps/world-worker/src/persistence/atomic-transition-repository.js';
import { createTransactionCutoffAuthorizationGuard } from '../../apps/world-worker/src/authoritative-execution.js';
import { DurableV08LedgerLineageReader } from '../../apps/world-worker/src/persistence/durable-v08-ledger-lineage-reader.js';
import { publishPostwarSocialCurrentPrefixProjectionsFrom } from '../../apps/world-worker/src/persistence/postwar-social-current-prefix-publication.js';
import {
  createPostwarOfficeProjectionStore,
  POSTWAR_PROJECTION_PUBLISH_QUERY,
} from '../../apps/world-worker/src/persistence/postwar-office-projection-store.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
import { SELECT_POSTWAR_COUNTRY_VACANCY_SOURCE } from '../support/postwar-social-country-source-selection.js';
const checkpointPath = process.env.ECONMIND_SOCIAL_PREFIX_NATIVE_CHECKPOINT;
const native = checkpointPath ? describe : describe.skip;
const root = path.resolve(import.meta.dirname, '../..');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const text = (v: unknown) => {
  if (typeof v !== 'string' || !v || v.trim() !== v)
    throw Error('ACTUAL_SOURCE_TEXT_REQUIRED');
  return v;
};
const ident = (v: string) => {
  if (!/^[a-z][a-z0-9_]{0,62}$/u.test(v))
    throw Error('ISOLATED_ROLE_IDENTIFIER_REQUIRED');
  return '"' + v + '"';
};
native('actual two-country committed Social current prefix', () => {
  it('commits only actual Country02 funded vacancy and covers both real origin heads at global H4', async () => {
    const raw = JSON.parse(await readFile(checkpointPath!, 'utf8')) as {
      referenceMarker: string;
      workerRole: string;
      publisherRole: string;
      worldVersion: string;
    };
    if (
      !raw.referenceMarker.includes('postwar-reference-persistent-') ||
      raw.worldVersion !== '3'
    )
      throw Error('PERSISTENT_ACTUAL_H3_CHECKPOINT_REQUIRED');
    const marker = await loadPostwarNativeReferenceMarker(raw.referenceMarker),
      base = JSON.parse(
        await readFile(
          '/workspace/office-connection-evidence/postwar-social-current-native-development-20261028/h3-revision2/current-template.json',
          'utf8',
        ),
      ) as {
        templateDatabase: string;
        seedFingerprint: string;
        admissionRef: string;
      },
      out =
        process.env.ECONMIND_SOCIAL_PREFIX_NATIVE_EVIDENCE_DIR ??
        '/workspace/office-connection-evidence/postwar-social-prefix-native-development-20261028';
    expect(base.seedFingerprint).toBe(marker.seedFingerprint);
    expect(base.admissionRef).toBe(marker.admissionRef);
    await mkdir(out, { recursive: true });
    const clone = await clonePostwarNativeReference(
      marker,
      'social_prefix_two',
      base.templateDatabase,
    );
    let ancestor:
        Awaited<ReturnType<typeof clonePostwarNativeReference>> | undefined,
      sealed = false,
      actualCountry02Committed = false;
    const writer = new Pool({
      host: marker.socket,
      port: marker.port,
      database: clone.database,
      user: raw.workerRole,
      max: 1,
    });
    writer.on('error', () => {});
    const evidence: Record<string, unknown> = {
      classification:
        'TEST_ONLY_ACTUAL_TWO_COUNTRY_CORE_NATIVE_CURRENT_NOT_PRODUCTION',
      checkpoint: checkpointPath,
      referenceMarker: raw.referenceMarker,
      ownedDatabase: clone.database,
      production: false,
      WorldClock: false,
      stages: [],
    };
    const stages = evidence.stages as { stage: string; at: string }[];
    const stage = (s: string) => {
      stages.push({ stage: s, at: new Date().toISOString() });
      console.info('SOCIAL_PREFIX_NATIVE_STAGE:' + s);
    };
    const other = '00000000-0000-4000-8000-000000000092',
      workerId = 'WORKER_POSTWAR_SOCIAL_POSITION_NATIVE';
    const store = createPostwarOfficeProjectionStore({
      runtimeReaderRole: marker.roles.boundedReaderRole,
      authorizationPublisherRole: marker.roles.authorizationPublisherRole,
    });
    const read = async (who: string, dataset = 'positions') => {
      const c = await clone.boundedReader.connect();
      try {
        await c.query('begin isolation level repeatable read read only');
        await c.query("select set_config('request.jwt.claim.sub',$1,true)", [
          who,
        ]);
        const port: SqlExecutor = {
          async query<Row extends object>(
            q: string,
            args: readonly unknown[] = [],
          ) {
            const r = await c.query<Row>(q, [...args]);
            return { rows: r.rows, rowCount: r.rowCount };
          },
        };
        return await store.readPageFrom(port, {
          worldId: marker.worldId,
          officeId: 'SOCIAL',
          dataset,
          limit: 100,
        });
      } finally {
        await c.query('rollback').catch(() => {});
        c.release();
      }
    };
    try {
      stage('COPY_EXACT_COUNTRY02_H0_ANCESTOR_FROM_SAME_STORED_SEED');
      const hd = JSON.parse(
        await readFile(
          '/workspace/office-connection-evidence/postwar-persistent-bounded-native-20261028/projection-template.json',
          'utf8',
        ),
      ) as { templateDatabase: string };
      ancestor = await clonePostwarNativeReference(
        marker,
        'prefix_ancestor',
        hd.templateDatabase,
      );
      const ac = await ancestor.installer.connect();
      try {
        const info = (
          await ac.query(
            "select encode(sha256(convert_to(canonical_payload,'UTF8')),'hex')as sha from world_v2.opening_seed where world_id=$1",
            [marker.worldId],
          )
        ).rows[0];
        for (const dataset of ['positions', 'service-pools']) {
          let doc = (
            await ac.query(
              "select * from world_v2.postwar_office_projection_document where world_id=$1 and country_id='COUNTRY_02'and office_id='SOCIAL'and dataset=$2",
              [marker.worldId, dataset],
            )
          ).rows[0];
          if (!doc) {
            await ac.query('set role world_v2_postwar_projection_publisher');
            try {
              doc = (
                await ac.query(POSTWAR_PROJECTION_PUBLISH_QUERY, [
                  marker.worldId,
                  'COUNTRY_02',
                  'SOCIAL',
                  dataset,
                  marker.seedFingerprint,
                  info.sha,
                  marker.sourceBundleSha256,
                  marker.admissionRef,
                ])
              ).rows[0];
            } finally {
              await ac.query('reset role');
            }
          }
          expect(doc.seed_fingerprint).toBe(marker.seedFingerprint);
          expect(doc.admission_ref).toBe(marker.admissionRef);
          const cols = Object.keys(doc);
          await clone.installer.query(
            `insert into world_v2.postwar_office_projection_document(${cols.map(ident).join(',')})values(${cols.map((_, i) => '$' + (i + 1)).join(',')})`,
            Object.values(doc),
          );
          for (const p of (
            await ac.query(
              'select * from world_v2.postwar_office_projection_page where document_ref=$1',
              [doc.document_ref],
            )
          ).rows) {
            const cs = Object.keys(p);
            await clone.installer.query(
              `insert into world_v2.postwar_office_projection_page(${cs.map(ident).join(',')})values(${cs.map((_, i) => '$' + (i + 1)).join(',')})`,
              Object.values(p),
            );
          }
        }
      } finally {
        ac.release();
      }
      await ancestor.drop();
      ancestor = undefined;
      // A distinct TEST_ONLY verified subject gets coherent real scope records;
      // the original Country01 subject is never reassigned or made cross-country.
      for (const [office, capability] of [
        ['SOCIAL', 'SOCIAL_LABOUR'],
        ['FINANCE', 'FINANCE_BUDGET'],
      ]) {
        await clone.installer.query(
          'insert into world_v2.current_commit_authorization values($1,$2::uuid,$3,$4,$5,$6,$7,true,now())',
          [
            marker.worldId,
            other,
            'COUNTRY_02',
            office,
            capability,
            'TEAM_TEST_ONLY_COUNTRY02',
            'REV_TEST_ONLY_COUNTRY02',
          ],
        );
        await clone.installer.query(
          'insert into world_v2.runtime_read_seat(world_id,auth_subject,country_id,office_id,team_id,authorization_revision)values($1,$2::uuid,$3,$4,$5,$6)',
          [
            marker.worldId,
            other,
            'COUNTRY_02',
            office,
            'TEAM_TEST_ONLY_COUNTRY02',
            'REV_TEST_ONLY_COUNTRY02',
          ],
        );
        await clone.installer.query(
          "insert into world_v2.projection_entitlement values($1,$2::uuid,'OFFICE_PRIVATE',$3,$4,true,now(),null)",
          [
            marker.worldId,
            other,
            'OFFICE_' +
              Buffer.from('COUNTRY_02').toString('hex').toUpperCase() +
              '_' +
              Buffer.from(office!).toString('hex').toUpperCase(),
            'REV_TEST_ONLY_COUNTRY02',
          ],
        );
      }
      stage(
        'SELECT_REAL_COUNTRY02_ORIGINAL_WAGE_FUNDING_AND_UNEMPLOYED_CAPACITY',
      );
      const ddl = await readFile(
        path.join(
          root,
          'database/proposals/postwar-social-current-prefix-read.sql',
        ),
        'utf8',
      );
      await clone.installer.query(ddl);
      evidence.proposalSha256 = sha(ddl);
      // Controlled, single PL/pgSQL source extraction. Selection below reads
      // only one immutable <=256 KiB country scope, not the 124 MB seed.
      await clone.installer.query(
        'select world_v2.prepare_postwar_social_prefix_scopes($1)',
        [marker.worldId],
      );
      const selected = (
        await clone.installer.query<{
          wage: Record<string, unknown>;
          funding: Record<string, unknown>;
          scope_bytes: number;
          scope_sha256: string;
          seed_fingerprint: string;
          admission_ref: string;
        }>(SELECT_POSTWAR_COUNTRY_VACANCY_SOURCE, [
          marker.worldId,
          'COUNTRY_02',
        ])
      ).rows[0];
      if (!selected)
        throw Error('ACTUAL_COUNTRY02_LAWFUL_FUNDED_VACANCY_SOURCE_MISSING');
      expect(selected.seed_fingerprint).toBe(marker.seedFingerprint);
      expect(selected.admission_ref).toBe(marker.admissionRef);
      expect(selected.scope_bytes).toBeGreaterThan(0);
      expect(selected.scope_bytes).toBeLessThanOrEqual(262144);
      evidence.actualSourceSelection = selected;
      evidence.selectionBoundary = {
        querySha256: sha(SELECT_POSTWAR_COUNTRY_VACANCY_SOURCE),
        maximumScopeBytes: 262144,
        maximumRows: 1,
        fullSeedParsedBySelectionQuery: false,
        heapOrRssPeakMeasured: false,
        scopePreparation:
          'SINGLE_CONTROLLED_PLPGSQL_EXTRACTION_REUSED_BY_PUBLICATION',
      };
      const database = createPostwarSocialPositionRuntimeDatabase(
          new PostgresSqlDatabase(writer),
          { workerRole: raw.workerRole },
        ),
        runtime = createPostwarSocialPositionRuntime({
          database,
          workerId,
          workerRole: raw.workerRole,
        }),
        repository = new AtomicTransitionRepository({
          database,
          workerId,
          sha256Hex: sha,
          authorizationGuard: createTransactionCutoffAuthorizationGuard(),
          socialPositionSourceCommitProtectionPort:
            runtime.sourceCommitProtectionPort,
        });
      const at = new Date().toISOString();
      await clone.installer.query(
        'select * from world_v2.acquire_world_writer_lease($1,$2,$3,$4)',
        [marker.worldId, workerId, at, '1800000'],
      );
      const command = C.parseCanonicalCommand(
        {
          schemaVersion: 'command-v1',
          commandId: 'COMMAND_ACTUAL_COUNTRY02_PREFIX_POSITION',
          commandType: 'CORE_SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATE_V1',
          actorId: 'ACTOR_TEST_ONLY_COUNTRY02',
          authSubject: other,
          correlationId: 'CORRELATION_ACTUAL_COUNTRY02_PREFIX',
          worldId: marker.worldId,
          countryId: 'COUNTRY_02',
          officeId: 'SOCIAL',
          expectedWorldVersion: '3',
          idempotencyKey: 'IDEMPOTENCY_ACTUAL_COUNTRY02_PREFIX',
          simTime: '4000',
          submittedAtReal: at,
          payload: {
            schemaVersion: 'social-employment-position-offer-create-v1',
            positionId: 'POSITION_ACTUAL_COUNTRY02_PREFIX_VACANCY',
            locationId: text(selected.wage.locationId),
            skill: text(selected.wage.skill),
            publicService: text(selected.wage.classificationId),
            occupation: text(selected.wage.occupation),
            requiredCount: '1',
            wageScheduleRef: text(selected.wage.positionId),
            fundingAccountId: text(selected.funding.accountRef),
            coverageDays: '1',
          },
        },
        sha,
      );
      await clone.installer.query(
        'insert into world_v2.command_submission(world_id,command_id,idempotency_key,command_type,schema_version,canonical_payload,payload_sha256,command_fingerprint,auth_subject,actor_id,country_id,office_id,expected_world_version,sim_time,correlation_id,submitted_at_real)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)',
        [
          command.worldId,
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
          command.simTime.toCanonicalValue(),
          command.correlationId,
          command.submittedAtReal,
        ],
      );
      await clone.installer.query(
        "insert into world_v2.command_queue(world_id,command_id,authority_kind,available_at_sim_time)values($1,$2,'DISCRETIONARY_USER',$3)",
        [
          command.worldId,
          command.commandId,
          command.simTime.toCanonicalValue(),
        ],
      );
      await clone.installer.query(
        "update world_v2.command_queue set queue_state='CLAIMED',attempt_count=1,claimed_by=$3,claimed_at_real=$4,claim_fencing_token=(select fencing_token from world_v2.world_writer_lease where world_id=$1)where world_id=$1 and command_id=$2",
        [command.worldId, command.commandId, workerId, at],
      );
      stage('REAL_CORE_COUNTRY02_POSITION_AND_SOURCE_CUTOFF_ATOMIC_H4');
      const authorization = await runtime.authorizeIntake(command);
      const executed = await C.processQueuedCommand({
        command,
        authorityKind: 'DISCRETIONARY_USER',
        requiredCapability: 'SOCIAL_LABOUR',
        intakeAuthorization: authorization,
        commitSimTime: command.simTime,
        recordedAtReal: at,
        persistence: {
          readFinalReceipt: (c) => repository.readFinalReceipt(c),
          recordZeroEffectReceipt: (r) => repository.recordZeroEffectReceipt(r),
          commitAuthorizedCommand: async ({ command, commitAuthorization }) => {
            const draft = await runtime.candidateFactory.prepare({
              command,
              commitAuthorization,
              observedAtReal: at,
            });
            const committed = await repository.commit(
              prepareAtomicTransitionCandidate({
                command,
                commitAuthorization,
                draft,
                sha256Hex: sha,
              }),
            );
            return {
              receipt: committed.receipt,
              transition: committed.transition,
            };
          },
        },
      });
      expect(executed.receipt.outcome).toBe('COMMITTED');
      expect(executed.receipt.worldVersionAfter).toBe('4');
      actualCountry02Committed = true;
      // Core SimTime owns bigint ticks; evidence uses its public canonical DTO.
      // The authoritative receipt itself remains untouched.
      evidence.actualCountry02Receipt = {
        ...executed.receipt,
        simTime: executed.receipt.simTime.toCanonicalValue(),
      };
      const postingCounts = (
        await clone.installer.query(
          `select (select count(*)::int from world_v2.financial_posting_batch where world_id=$1)as financial,(select count(*)::int from world_v2.inventory_posting where world_id=$1)as inventory,(select count(*)::int from world_v2.command_receipt where world_id=$1 and outcome='COMMITTED')as committed,(select count(*)::int from world_v2.authoritative_event where world_id=$1)as events`,
          [marker.worldId],
        )
      ).rows[0];
      expect(postingCounts).toEqual({
        financial: 0,
        inventory: 0,
        committed: 4,
        events: 4,
      });
      evidence.noPaymentOrStockMutation = postingCounts;

      expect((await read(marker.subject)).status).toBe('UNAVAILABLE');
      expect((await read(other)).status).toBe('UNAVAILABLE');
      evidence.legacyCrossCountryFailureReproduced = true;
      stage('ONE_GENUINE_COMPLETE_CORE_PREFIX_FOR_BOTH_COUNTRY_PUBLICATIONS');
      const pc = await clone.installer.connect();
      try {
        await pc.query('begin');
        const executor: SqlExecutor = {
          async query<Row extends object>(
            q: string,
            args: readonly unknown[] = [],
          ) {
            const publishing =
              q.includes('lock_postwar_social_current_prefix_publication') ||
              q.includes('publish_postwar_social_current_prefix_projection');
            if (publishing)
              await pc.query(
                'set local role world_v2_postwar_projection_publisher',
              );
            try {
              const r = await pc.query<Row>(q, [...args]);
              return { rows: r.rows, rowCount: r.rowCount };
            } finally {
              if (publishing) await pc.query('reset role');
            }
          },
        };
        const db = {
            query: executor.query,
            transaction: async <T>(consume: (tx: SqlExecutor) => Promise<T>) =>
              consume(executor),
          },
          reader = new DurableV08LedgerLineageReader({
            database: db,
            sha256Hex: sha,
          });
        const published =
          await publishPostwarSocialCurrentPrefixProjectionsFrom(executor, {
            reader,
            worldId: marker.worldId,
            countryIds: ['COUNTRY_01', 'COUNTRY_02'],
          });
        expect(published).toHaveLength(2);
        evidence.publication = published;
        await pc.query('commit');
      } finally {
        await pc.query('rollback').catch(() => {});
        pc.release();
      }
      stage('ACTUAL_LOW_ROLE_BOUNDED_READ_BOTH_ORIGINS_AT_GLOBAL_H4');
      const one = await read(marker.subject),
        two = await read(other);
      expect(one.status).toBe('PAGE');
      expect(two.status).toBe('PAGE');
      if (one.status === 'PAGE' && two.status === 'PAGE') {
        expect(one.source.worldVersion).toBe('4');
        expect(one.source.currentStateBinding?.sourceStateWorldVersion).toBe(
          '3',
        );
        expect(one.source.currentPrefixCoverage).toMatchObject({
          globalWorldVersion: '4',
          originWorldVersion: '3',
          countryId: 'COUNTRY_01',
        });
        expect(two.source.currentStateBinding?.sourceStateWorldVersion).toBe(
          '4',
        );
        expect(two.source.currentPrefixCoverage).toMatchObject({
          globalWorldVersion: '4',
          originWorldVersion: '4',
          countryId: 'COUNTRY_02',
        });
        expect(
          one.rows.every(
            (p) => (p as { countryId: string }).countryId === 'COUNTRY_01',
          ),
        ).toBe(true);
        expect(
          two.rows.every(
            (p) => (p as { countryId: string }).countryId === 'COUNTRY_02',
          ),
        ).toBe(true);
        expect(
          two.rows.some(
            (p) =>
              (p as { positionId: string }).positionId ===
              'POSITION_ACTUAL_COUNTRY02_PREFIX_VACANCY',
          ),
        ).toBe(true);
        expect(
          Math.max(
            Buffer.byteLength(JSON.stringify(one)),
            Buffer.byteLength(JSON.stringify(two)),
          ),
        ).toBeLessThanOrEqual(65536);
      }
      evidence.reads = { one, two };
      await expect(
        clone.boundedReader.query(
          'select jsonb_agg(scope_document)from world_v2.postwar_social_prefix_scope',
        ),
      ).rejects.toMatchObject({ code: '42501' });
      await clone.installer.query(
        'update world_v2.projection_entitlement set active=false,revoked_at=now()where world_id=$1 and auth_subject=$2::uuid',
        [marker.worldId, other],
      );
      expect((await read(other)).status).toBe('DENIED');
      await clone.installer.query(
        'update world_v2.projection_entitlement set active=true,revoked_at=null where world_id=$1 and auth_subject=$2::uuid',
        [marker.worldId, other],
      );
      expect((await read(marker.subject, 'offers')).status).toBe('STALE');
      await writer.end();
      await clone.close();
      await sealPostwarReferenceClone(marker, clone.database);
      sealed = true;
      const handoff = {
        schemaVersion: 'postwar-social-current-prefix-native-template-v2',
        classification:
          'TEST_ONLY_ACTUAL_TWO_COUNTRY_CORE_NATIVE_NOT_PRODUCTION',
        referenceMarker: raw.referenceMarker,
        templateDatabase: clone.database,
        worldId: marker.worldId,
        seedFingerprint: marker.seedFingerprint,
        admissionRef: marker.admissionRef,
        worldVersion: '4',
        eventSequence: '4',
        subjects: { COUNTRY_01: marker.subject, COUNTRY_02: other },
        proposalSha256: sha(ddl),
      };
      evidence.handoff = handoff;
      await writeFile(
        path.join(out, 'current-template-v2.json'),
        JSON.stringify(handoff, null, 2) + '\n',
      );
    } catch (error) {
      evidence.failure = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      try {
        await writer.end().catch(() => {});
      } finally {
        try {
          await ancestor?.drop();
        } finally {
          try {
            // Preserve a genuine H4 checkpoint if a later publication/read
            // assertion fails; a retry must not need to repeat the economic
            // command. This retains the FAIL outcome, never a passing template.
            if (!sealed && evidence.failure && actualCountry02Committed) {
              try {
                await clone.close();
                await sealPostwarReferenceClone(marker, clone.database);
                sealed = true;
                const checkpoint = {
                  classification:
                    'FAILED_AFTER_REAL_H4_COMMIT_NOT_PUBLISHED_PROOF',
                  referenceMarker: raw.referenceMarker,
                  templateDatabase: clone.database,
                  seedFingerprint: marker.seedFingerprint,
                  admissionRef: marker.admissionRef,
                  worldVersion: '4',
                  workerRole: raw.workerRole,
                  publisherRole: raw.publisherRole,
                  failure: evidence.failure,
                };
                evidence.failedAfterCommitCheckpoint = checkpoint;
                await writeFile(
                  path.join(out, 'failed-h4-checkpoint.json'),
                  JSON.stringify(checkpoint, null, 2) + '\n',
                );
              } catch (error) {
                evidence.checkpointPreservationFailure =
                  error instanceof Error ? error.message : String(error);
              }
            }
            if (!sealed)
              await clone.drop().catch((error: unknown) => {
                evidence.cleanupFailure =
                  error instanceof Error ? error.message : String(error);
                if (!evidence.failure) throw error;
              });
          } finally {
            await writeFile(
              path.join(out, 'native-evidence.json'),
              JSON.stringify(evidence, null, 2) + '\n',
            );
          }
        }
      }
    }
  }, 300_000);
});
