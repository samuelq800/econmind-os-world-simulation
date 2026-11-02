/** Actual c427 source clone → lawful vacancy → PLAN → SQL-issued automatic MATCH.
 * Controlled TEST_ONLY transport/roles/admission, never production authority. */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import path from 'node:path';
import { Pool } from 'pg';
import { describe, it, expect } from 'vitest';
import {
  parseCanonicalCommand,
  processQueuedCommand,
  SOCIAL_POSITION_OFFER_CREATE_COMMAND,
  SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
  type CanonicalCommand,
  type AuthorizedOfficeContext,
} from '@econmind/core';
import {
  loadPostwarNativeReferenceMarker,
  clonePostwarNativeReference,
  sealPostwarReferenceClone,
} from '../support/postwar-native-reference-db.js';
import type { SqlDatabase } from '../../apps/world-worker/src/persistence/sql-database.js';
import { PostgresSqlDatabase } from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import {
  createPostwarSocialPositionRuntime,
  createPostwarSocialPositionRuntimeDatabase,
} from '../../apps/world-worker/src/persistence/postwar-social-position-runtime.js';
import {
  createPostgresSocialOperatingSourcePublisher,
  createPostgresSocialOperatingCustody,
} from '../../apps/world-worker/src/persistence/postgres-social-operating-custody.js';
import {
  createSocialEmploymentRuntimeSnapshotReader,
  createSocialEmploymentCommitSourceGuard,
} from '../../apps/world-worker/src/persistence/social-employment-runtime-snapshot-reader.js';
import {
  SqlSocialJobMatchCandidateSource,
  createSocialJobMatchCandidateFactory,
} from '../../apps/world-worker/src/persistence/social-job-match-candidate-source.js';
import { loadPostwarSourceContext } from '../../apps/world-worker/src/preparation/postwar-source-context.js';
import { authorizeManualOfficeCommand } from '../../apps/world-worker/src/preparation/manual-office-command-composition.js';
import {
  AtomicTransitionRepository,
  prepareAtomicTransitionCandidate,
  type AtomicTransitionCandidateFactory,
} from '../../apps/world-worker/src/persistence/atomic-transition-repository.js';
import { createTransactionCutoffAuthorizationGuard } from '../../apps/world-worker/src/authoritative-execution.js';
import {
  createPostwarSocialMatchPublisher,
  createPostwarSocialMatchRuntime,
} from '../../apps/world-worker/src/persistence/postwar-social-match-runtime.js';
import { canonicalSha256, canonicalHashInput } from '@econmind/core';
const markerPath = process.env.ECONMIND_SOCIAL_MATCH_REFERENCE;
const native = markerPath ? describe : describe.skip;
const root = path.resolve(import.meta.dirname, '../..');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
native('actual native once-only Social MATCH publisher and consumer', () => {
  it('settles an actual SQL-issued MATCH once, rejects expiry/revocation, and preserves H3 for bounded readback', async () => {
    const marker = await loadPostwarNativeReferenceMarker(markerPath!);
    expect(marker.seedFingerprint).toBe(
      'sha256:c42757599f51fe7e21ff52c152387c1f6a27649ff0cd199dd39b7d2205386589',
    );
    const checkpointFile = process.env.ECONMIND_SOCIAL_MATCH_CHECKPOINT;
    const checkpoint = checkpointFile
      ? JSON.parse(await readFile(checkpointFile, 'utf8'))
      : null;
    if (
      checkpoint &&
      (checkpoint.referenceMarker !== markerPath ||
        checkpoint.seedFingerprint !== marker.seedFingerprint ||
        checkpoint.worldVersion !== '2' ||
        !/^postwar_clone_social_match_[a-f0-9]+$/.test(checkpoint.database))
    )
      throw Error('MATCH_CHECKPOINT_SCOPE_MISMATCH');
    let clone = await clonePostwarNativeReference(
      marker,
      'social_match',
      checkpoint?.database ?? marker.database,
    );
    const suffix = randomUUID().replaceAll('-', '').slice(0, 10),
      workerRole = checkpoint?.workerRole ?? `social_position_worker_${suffix}`,
      publisherRole =
        checkpoint?.publisherRole ?? `social_position_pub_${suffix}`;
    const worker = 'WORKER_POSTWAR_SOCIAL_POSITION_NATIVE';
    const directory =
      process.env.ECONMIND_SOCIAL_MATCH_NATIVE_EVIDENCE_DIR ??
      '/workspace/office-connection-evidence/postwar-social-match-native-20261028';
    const stages: { stage: string; at: string }[] = [];
    const evidence: Record<string, unknown> = {
      classification:
        'TEST_ONLY_ACTUAL_NATIVE_FULL_SOURCE_ATOMIC_NOT_PRODUCTION',
      referenceMarker: markerPath,
      worldId: marker.worldId,
      seedFingerprint: marker.seedFingerprint,
      admissionRef: marker.admissionRef,
      stages,
      productionAdmission: false,
      WorldClock: false,
    };
    const stage = (name: string) => {
      stages.push({ stage: name, at: new Date().toISOString() });
      console.info('SOCIAL_MATCH_NATIVE_STAGE:' + name);
    };
    let keep = Boolean(checkpoint);
    let preservedVersion = checkpoint ? '2' : '0';
    const pools: Pool[] = [];
    const open = (user: string) => {
      const pool = new Pool({
        host: marker.socket,
        port: marker.port,
        database: clone.database,
        user,
        max: 2,
      });
      pool.on('error', () => {});
      pools.push(pool);
      return pool;
    };
    try {
      const ddl = await readFile(
        path.join(root, 'database/proposals/social-operating-custody.sql'),
        'utf8',
      );
      if (!checkpoint) await clone.installer.query(ddl);
      evidence.proposalSha256 = sha(ddl);
      const matchDdl = await readFile(
        path.join(
          root,
          'database/proposals/social-operating-match-publisher.sql',
        ),
        'utf8',
      );
      if (!checkpoint) await clone.installer.query(matchDdl);
      evidence.matchProposalSha256 = sha(matchDdl);
      // Distinct disposable transport logins. The source reader is never given
      // event/receipt/queue/head DML to make a worker write succeed.
      if (!checkpoint)
        await clone.installer
          .query(`create role ${workerRole} login noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
        create role ${publisherRole} login noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
        grant world_v2_social_source_reader to ${workerRole};grant world_v2_social_source_publisher to ${publisherRole};
        grant usage on schema world_v2 to ${workerRole};
        grant select on world_v2.opening_seed to world_v2_social_source_reader,world_v2_social_source_publisher;
        create policy social_position_exact_reader on world_v2.opening_seed for select to world_v2_social_source_reader using(world_id='${marker.worldId}');
        create policy social_position_exact_publisher on world_v2.opening_seed for select to world_v2_social_source_publisher using(world_id='${marker.worldId}');
        grant select on world_v2.world_head,world_v2.authoritative_event,world_v2.command_submission,world_v2.command_receipt,world_v2.inventory_posting,world_v2.financial_posting_batch to world_v2_social_source_reader;
        grant select on world_v2.world_head,world_v2.authoritative_event,world_v2.command_submission,world_v2.command_receipt,world_v2.command_queue,world_v2.world_writer_lease,world_v2.current_commit_authorization,world_v2.inventory_posting,world_v2.financial_posting_batch,world_v2.authoritative_commit_authorization,world_v2.current_materialization,world_v2.notification_outbox to ${workerRole};
        grant insert on world_v2.authoritative_event,world_v2.command_receipt,world_v2.authoritative_commit_authorization,world_v2.current_materialization,world_v2.notification_outbox to ${workerRole};
        grant update on world_v2.world_head,world_v2.command_queue,world_v2.current_materialization to ${workerRole};
        -- PostgreSQL requires a column UPDATE privilege for submission row
        -- locks; the unchanged immutable-history trigger still rejects DML.
        grant update(actor_id) on world_v2.command_submission to ${workerRole};
        grant update(renewed_at_real) on world_v2.world_writer_lease to ${workerRole};
        grant execute on function world_v2.assert_world_writer_commit_guard(text,text,bigint,bigint,timestamptz)to ${workerRole};`);
      let pub = open(publisherRole),
        writer = open(workerRole);
      let publisherDatabase: SqlDatabase = new PostgresSqlDatabase(pub);
      let writerDatabase: SqlDatabase = new PostgresSqlDatabase(writer);
      const route = (get: () => SqlDatabase): SqlDatabase => ({
        query<Row extends object>(
          sql: string,
          parameters?: readonly unknown[],
        ) {
          return get().query<Row>(sql, parameters);
        },
        transaction: (consume) => get().transaction(consume),
      });
      const publishing = route(() => publisherDatabase);
      const publisher = createPostgresSocialOperatingSourcePublisher({
        database: publishing,
      });
      stage('VALIDATING_FULL_E03_AND_REGISTERING_70_COUNTRIES');
      const registrations = checkpoint
        ? {
            registrations: (
              await clone.installer.query(
                'select registration_ref from world_v2.social_operating_source_registration where world_id=$1',
                [marker.worldId],
              )
            ).rows,
          }
        : await publishing.transaction(async (tx) => {
            await tx.query('set transaction isolation level repeatable read');
            await tx.query('set local role world_v2_social_source_publisher');
            return publisher.registerWorldFrom(tx, { worldId: marker.worldId });
          });
      expect(registrations.registrations).toHaveLength(70);
      evidence.registeredCountries = 70;
      const matchPublisher = createPostwarSocialMatchPublisher();
      const publicationTx = <T>(
        run: (
          tx: import('../../apps/world-worker/src/persistence/sql-database.js').SqlExecutor,
        ) => Promise<T>,
      ) =>
        publishing.transaction(async (tx) => {
          await tx.query('set transaction isolation level repeatable read');
          await tx.query('set local role world_v2_social_source_publisher');
          return run(tx);
        });
      const ruleGrant = checkpoint
        ? (
            await clone.installer.query(
              'select * from world_v2.social_operating_match_publisher where world_id=$1 and country_id=$2',
              [marker.worldId, 'COUNTRY_01'],
            )
          ).rows[0]
        : await publicationTx((tx) =>
            matchPublisher.registerFrom(tx, {
              worldId: marker.worldId,
              countryId: 'COUNTRY_01',
            }),
          );
      evidence.ruleGrant = {
        grantRef: ruleGrant.grant_ref,
        revision: ruleGrant.revision,
        authorityMeaning: 'TEST_ONLY_FIXED_RULE_SOURCE_NOT_PRODUCTION',
      };
      const roleRights = (
        await clone.installer.query(
          `select has_table_privilege('world_v2_social_source_reader','world_v2.authoritative_event','INSERT')as source_event_write,has_table_privilege('world_v2_social_source_reader','world_v2.command_receipt','INSERT')as source_receipt_write,has_column_privilege('world_v2_social_source_reader','world_v2.world_head','world_version','UPDATE')as source_head_write,has_column_privilege($1,'world_v2.opening_seed','canonical_payload','SELECT')as worker_raw_seed`,
          [workerRole],
        )
      ).rows[0];
      expect(roleRights).toEqual({
        source_event_write: false,
        source_receipt_write: false,
        source_head_write: false,
        worker_raw_seed: false,
      });
      evidence.roleRights = roleRights;
      const database = createPostwarSocialPositionRuntimeDatabase(
        route(() => writerDatabase),
        { workerRole },
      );
      const runtime = createPostwarSocialPositionRuntime({
        database,
        workerId: worker,
        workerRole,
      });
      const context = await loadPostwarSourceContext(root);
      const snapshotReader = createSocialEmploymentRuntimeSnapshotReader({
        mode: 'TEST_ONLY_LOCAL',
        database,
        sha256Hex: sha,
        custody: createPostgresSocialOperatingCustody({ database }),
        postgresWorkerRole: workerRole,
      });
      const planGuard = createSocialEmploymentCommitSourceGuard(snapshotReader);
      const matchRuntime = createPostwarSocialMatchRuntime({
        database,
        workerId: worker,
        workerRole,
        openingAdoption: context.labourSocial,
      });
      const repository = new AtomicTransitionRepository({
        database,
        workerId: worker,
        sha256Hex: sha,
        authorizationGuard: createTransactionCutoffAuthorizationGuard(),
        sourceCommitProtectionPort: planGuard,
        socialPositionSourceCommitProtectionPort:
          runtime.sourceCommitProtectionPort,
        socialMatchSourceCommitProtectionPort:
          matchRuntime.sourceCommitProtectionPort,
      });
      const at = new Date().toISOString();
      await clone.installer.query(
        'select * from world_v2.acquire_world_writer_lease($1,$2,$3,$4)',
        [marker.worldId, worker, at, '1800000'],
      );
      const c = (
        kind: 'POSITION' | 'PLAN',
        id: string,
        version: string,
        payload: unknown,
        simTime = '1000',
      ) =>
        parseCanonicalCommand(
          {
            schemaVersion: 'command-v1',
            commandId: id,
            commandType:
              kind === 'POSITION'
                ? SOCIAL_POSITION_OFFER_CREATE_COMMAND
                : SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
            actorId: 'ACTOR_SOCIAL_POSITION_NATIVE',
            authSubject: marker.subject,
            correlationId: `CORRELATION_${id}`,
            worldId: marker.worldId,
            countryId: 'COUNTRY_01',
            officeId: 'SOCIAL',
            expectedWorldVersion: version,
            idempotencyKey: `IDEMPOTENCY_${id}`,
            simTime,
            submittedAtReal: at,
            payload,
          },
          sha,
        );
      const submit = async (command: CanonicalCommand) => {
        await clone.installer.query(
          `insert into world_v2.command_submission(world_id,command_id,idempotency_key,command_type,schema_version,canonical_payload,payload_sha256,command_fingerprint,auth_subject,actor_id,country_id,office_id,expected_world_version,sim_time,correlation_id,submitted_at_real)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
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
          "update world_v2.command_queue set queue_state='CLAIMED',attempt_count=1,claimed_by=$3,claimed_at_real=$4,claim_fencing_token=1 where world_id=$1 and command_id=$2",
          [command.worldId, command.commandId, worker, at],
        );
      };
      const execute = (
        command: CanonicalCommand,
        factory: AtomicTransitionCandidateFactory,
        intakeAuthorization: AuthorizedOfficeContext,
      ) =>
        processQueuedCommand({
          command,
          authorityKind: 'DISCRETIONARY_USER',
          requiredCapability: 'SOCIAL_LABOUR',
          intakeAuthorization,
          commitSimTime: command.simTime,
          recordedAtReal: at,
          persistence: {
            readFinalReceipt: (command) => repository.readFinalReceipt(command),
            recordZeroEffectReceipt: (receipt) =>
              repository.recordZeroEffectReceipt(receipt),
            commitAuthorizedCommand: async ({
              command,
              commitAuthorization,
            }) => {
              const draft = await factory.prepare({
                command,
                commitAuthorization,
                observedAtReal: at,
              });
              const result = await repository.commit(
                prepareAtomicTransitionCandidate({
                  command,
                  commitAuthorization,
                  draft,
                  sha256Hex: sha,
                }),
              );
              return { receipt: result.receipt, transition: result.transition };
            },
          },
        });
      // Raw immutable selection is merely a locator. The actual source port
      // independently rechecks it, all funds/encumbrances, roster and wages.
      const positionId = 'POSITION_POSTWAR_NATIVE_LAWFUL_VACANCY';
      const intent = {
        schemaVersion: 'social-employment-position-offer-create-v1',
        positionId,
        locationId: 'REGION_01_E1',
        skill: 'HIGH',
        publicService: 'PUBLIC_SAFETY',
        occupation: 'GENERAL',
        requiredCount: '1',
        wageScheduleRef:
          'PW_POSITION_A5BB8AE68C0CEE82BBF3C4D070D9B6648398E9289A2372D19C859143EB855C43',
        fundingAccountId:
          'ACCOUNT_BA4EE058AFCB352CB79D719392EAED763A46E024A349D266E5BC6E2240E03FE8',
        coverageDays: '1',
      };
      const create = c(
        'POSITION',
        'COMMAND_POSTWAR_NATIVE_POSITION',
        '0',
        intent,
      );
      if (!checkpoint) await submit(create);
      const authorization = await runtime.authorizeIntake(create);
      stage('CREATING_LAWFUL_POSITION_OFFER_ATOMICALLY');
      const created = await execute(
        create,
        runtime.candidateFactory,
        authorization,
      );
      expect(created.receipt.outcome).toBe('COMMITTED');
      expect(created.receipt.worldVersionAfter).toBe('1');
      const first = (
        await clone.installer.query(
          'select world_version::text,event_sequence::text from world_v2.world_head where world_id=$1',
          [marker.worldId],
        )
      ).rows[0];
      expect(first).toEqual({
        world_version: checkpoint ? '2' : '1',
        event_sequence: checkpoint ? '2' : '1',
      });
      expect(
        (await execute(create, runtime.candidateFactory, authorization)).source,
      ).toBe('EXISTING_FINAL');
      evidence.positionCreation = {
        outcome: created.receipt.outcome,
        worldVersionAfter: created.receipt.worldVersionAfter,
        exactDuplicateRecovered: true,
      };
      const plan = c(
        'PLAN',
        'COMMAND_POSTWAR_NATIVE_PLAN',
        '1',
        {
          schemaVersion: 'social-employment-service-plan-v1',
          locationId: 'REGION_01_E1',
          skill: 'HIGH',
          positionId,
          servicePoolId: 'POSTWAR_EMPLOYMENT_REGION_01_E1_HIGH',
          requestedMatches: '1',
          dueDayIndex: '0',
        },
        '2000',
      );
      if (!checkpoint) await submit(plan);
      const source = new SqlSocialJobMatchCandidateSource({
        mode: 'TEST_ONLY_LOCAL',
        database,
        workerId: worker,
        sha256Hex: sha,
        openingAdoption: context.labourSocial,
        snapshotReader,
        automaticAuthority: null,
      });
      const factory = createSocialJobMatchCandidateFactory({
        source,
        sha256Hex: sha,
      });
      const planAuthorization = await authorizeManualOfficeCommand({
        database,
        command: plan,
      });
      stage('EXISTING_PLAN_CONSUMER_FULL_PREFIX_AND_SOURCE_CUTOFF');
      const planned = await execute(plan, factory, planAuthorization);
      expect(planned.receipt.outcome).toBe('COMMITTED');
      expect(planned.receipt.worldVersionAfter).toBe('2');
      expect((await execute(plan, factory, planAuthorization)).source).toBe(
        'EXISTING_FINAL',
      );
      const persisted = (
        await clone.installer.query(
          `select (select count(*)::int from world_v2.authoritative_event where world_id=$1)as events,(select count(*)::int from world_v2.command_receipt where world_id=$1 and outcome='COMMITTED')as receipts,(select count(*)::int from world_v2.command_queue where world_id=$1 and queue_state='FINALIZED')as finalized,(select world_version::text from world_v2.world_head where world_id=$1)as version`,
          [marker.worldId],
        )
      ).rows[0];
      expect(persisted).toEqual({
        events: 2,
        receipts: 2,
        finalized: 2,
        version: '2',
      });
      evidence.servicePlan = {
        outcome: planned.receipt.outcome,
        exactDuplicateRecovered: true,
        persisted,
      };
      keep = true;
      preservedVersion = '2';
      if (!checkpoint) {
        // Freeze the actually committed H2 stage BEFORE any MATCH/negative.
        // All owned connections are closed, and no source bytes are rebuilt.
        await Promise.all(pools.splice(0).map((pool) => pool.end()));
        await clone.close();
        await sealPostwarReferenceClone(marker, clone.database);
        await mkdir(directory, { recursive: true });
        const h2 = {
          classification: 'TEST_ONLY_ACTUAL_H2_CHECKPOINT_NOT_AUTHORITY',
          referenceMarker: markerPath,
          database: clone.database,
          worldId: marker.worldId,
          seedFingerprint: marker.seedFingerprint,
          admissionRef: marker.admissionRef,
          worldVersion: '2',
          workerRole,
          publisherRole,
          proposalSha256: sha(ddl),
          matchProposalSha256: sha(matchDdl),
          templateSealed: true,
        };
        await writeFile(
          path.join(directory, 'h2-clone.json'),
          JSON.stringify(h2, null, 2) + '\n',
        );
        evidence.h2Checkpoint = h2;
        clone = await clonePostwarNativeReference(
          marker,
          'social_match',
          clone.database,
        );
        pub = open(publisherRole);
        writer = open(workerRole);
        publisherDatabase = new PostgresSqlDatabase(pub);
        writerDatabase = new PostgresSqlDatabase(writer);
      }
      stage('SQL_FIXED_RULE_PUBLISHES_ACTUAL_DUE_MATCH');
      const match = await publicationTx((tx) =>
        matchPublisher.publishFrom(tx, {
          worldId: marker.worldId,
          planCommandId: plan.commandId,
        }),
      );
      expect(match.expectedWorldVersion).toBe('2');
      expect(match.simTime.toCanonicalValue()).toBe('2000');
      expect(match.officeId).toBeNull();
      expect(
        (
          await publicationTx((tx) =>
            matchPublisher.publishFrom(tx, {
              worldId: marker.worldId,
              planCommandId: plan.commandId,
            }),
          )
        ).fingerprint,
      ).toBe(match.fingerprint);
      const observed = new Date().toISOString();
      await clone.installer.query(
        "update world_v2.command_queue set queue_state='CLAIMED',attempt_count=1,claimed_by=$3,claimed_at_real=$4,claim_fencing_token=1 where world_id=$1 and command_id=$2 and authority_kind='VERSIONED_AUTOMATIC'",
        [marker.worldId, match.commandId, worker, observed],
      );
      // The source is current at H2; append-only issuer revocation must veto
      // even an already published command. Roll back only the isolated negative
      // transaction so the genuine immutable grant can then execute positively.
      const rollback = Error('TEST_ONLY_ROLLBACK_NEGATIVE');
      await expect(
        publicationTx(async (tx) => {
          await matchPublisher.revokeFrom(tx, {
            worldId: marker.worldId,
            countryId: 'COUNTRY_01',
            reasonRef: 'TEST_ONLY_REVOKED_BEFORE_CONSUMPTION',
          });
          await expect(
            matchPublisher.publishFrom(tx, {
              worldId: marker.worldId,
              planCommandId: plan.commandId,
            }),
          ).rejects.toThrow('REVOKED');
          throw rollback;
        }),
      ).rejects.toMatchObject({ outcome: 'ROLLED_BACK', cause: rollback });
      evidence.publisherRevocationRejected = true;
      const expired = c(
        'POSITION',
        'COMMAND_POSTWAR_NATIVE_EXPIRED_SOURCE',
        '2',
        { ...intent, positionId: 'POSITION_NATIVE_EXPIRED_SOURCE' },
        '86400000',
      );
      await expect(
        runtime.assertSourceBeforeClaim({
          command: expired,
          observedAtReal: observed,
        }),
      ).rejects.toMatchObject({
        outcome: 'ROLLED_BACK',
        cause: expect.objectContaining({
          message: expect.stringContaining('expired'),
        }),
      });
      evidence.sourceWindowExpiredRejected = true;
      const matchOnce = () =>
        processQueuedCommand({
          command: match,
          authorityKind: 'VERSIONED_AUTOMATIC',
          commitSimTime: match.simTime,
          recordedAtReal: observed,
          persistence: {
            readFinalReceipt: (command) => repository.readFinalReceipt(command),
            recordZeroEffectReceipt: (receipt) =>
              repository.recordZeroEffectReceipt(receipt),
            commitAuthorizedCommand: async ({
              command,
              commitAuthorization,
            }) => {
              expect(commitAuthorization).toBeNull();
              const draft = await matchRuntime.candidateFactory.prepare({
                command,
                commitAuthorization,
                observedAtReal: observed,
              });
              const result = await repository.commit(
                prepareAtomicTransitionCandidate({
                  command,
                  commitAuthorization,
                  draft,
                  sha256Hex: sha,
                }),
              );
              return { receipt: result.receipt, transition: result.transition };
            },
          },
        });
      stage('AUTOMATIC_MATCH_ATOMIC_COMMIT_NULL_DISCRETIONARY_PROOF');
      const settled = await matchOnce();
      expect(settled.receipt.outcome).toBe('COMMITTED');
      expect(settled.receipt.worldVersionAfter).toBe('3');
      preservedVersion = '3';
      expect((await matchOnce()).source).toBe('EXISTING_FINAL');
      expect(
        (
          await publicationTx((tx) =>
            matchPublisher.publishFrom(tx, {
              worldId: marker.worldId,
              planCommandId: plan.commandId,
            }),
          )
        ).fingerprint,
      ).toBe(match.fingerprint);
      const final = (
        await clone.installer.query(
          `select (select count(*)::int from world_v2.authoritative_event where world_id=$1)as events,(select count(*)::int from world_v2.command_receipt where world_id=$1 and outcome='COMMITTED')as receipts,(select count(*)::int from world_v2.command_queue where world_id=$1 and queue_state='FINALIZED')as finalized,(select world_version::text from world_v2.world_head where world_id=$1)as version`,
          [marker.worldId],
        )
      ).rows[0];
      expect(final).toEqual({
        events: 3,
        receipts: 3,
        finalized: 3,
        version: '3',
      });
      const projection = (
        await clone.installer.query(
          'select materialization_key,canonical_payload from world_v2.current_materialization where world_id=$1',
          [marker.worldId],
        )
      ).rows;
      const service = projection.find(
        (r) => r.materialization_key === 'SOCIAL_EMPLOYMENT_SERVICE_COUNTRY_01',
      );
      expect(service).toBeDefined();
      const state = JSON.parse(service!.canonical_payload);
      const settledPlan = state.plans.find(
        (p: { planCommandId: string }) => p.planCommandId === plan.commandId,
      );
      expect(settledPlan.state).toBe('SETTLED');
      const lastEvent = (
        await clone.installer.query(
          'select canonical_payload from world_v2.authoritative_event where world_id=$1 and causation_command_id=$2',
          [marker.worldId, match.commandId],
        )
      ).rows[0];
      const event = JSON.parse(lastEvent.canonical_payload);
      expect(canonicalSha256(canonicalHashInput(state), sha)).toBe(
        event.afterStateHash,
      );
      expect(event.result.matched).toBe('1');
      expect(event.result.remainingUnemployed).toBe('152351');
      expect(settledPlan.matched).toBe('1');
      evidence.match = {
        commandId: match.commandId,
        fingerprint: match.fingerprint,
        simTime: match.simTime.toCanonicalValue(),
        outcome: settled.receipt.outcome,
        persisted: final,
        exactDuplicateRecovered: true,
        eventResult: event.result,
        stateHash: event.afterStateHash,
      };
      evidence.materializationKeys = projection.map(
        (r) => r.materialization_key,
      );
      evidence.preservedDatabase = clone.database;
      evidence.status =
        'ACTUAL_NATIVE_POSITION_PLAN_MATCH_PASSED_NOT_PRODUCTION';
      keep = true;
    } catch (error) {
      evidence.status = 'FAILED';
      evidence.failure = error instanceof Error ? error.message : String(error);
      const causes: string[] = [];
      let cause: unknown = error;
      for (let i = 0; i < 8 && cause instanceof Error; i++) {
        causes.push(cause.message);
        cause = cause.cause;
      }
      evidence.failureCauses = causes;
      throw error;
    } finally {
      await mkdir(directory, { recursive: true });
      const bytes = JSON.stringify(evidence, null, 2) + '\n';
      await writeFile(path.join(directory, `attempt-${suffix}.json`), bytes);
      await writeFile(path.join(directory, 'summary.json'), bytes);
      await Promise.all(pools.map((pool) => pool.end()));
      if (keep) {
        await clone.close();
        await sealPostwarReferenceClone(marker, clone.database);
        await writeFile(
          path.join(directory, 'current-clone.json'),
          JSON.stringify(
            {
              classification:
                'TEST_ONLY_CURRENT_ACTUAL_COMMANDS_NOT_PRODUCTION',
              referenceMarker: markerPath,
              database: clone.database,
              worldId: marker.worldId,
              seedFingerprint: marker.seedFingerprint,
              admissionRef: marker.admissionRef,
              worldVersion: preservedVersion,
              workerRole,
              publisherRole,
              templateSealed: true,
            },
            null,
            2,
          ) + '\n',
        );
      } else await clone.drop();
      const cleanup = new Pool({
        host: marker.socket,
        port: marker.port,
        database: 'postgres',
        user: 'postgres',
        max: 1,
      });
      try {
        if (!keep && !checkpoint)
          await cleanup.query(
            `drop role if exists ${workerRole},${publisherRole}`,
          );
      } finally {
        await cleanup.end();
      }
    }
  }, 600_000);
  it('checks the actual source registry revocation and pre-claim rollback without issuing a lease or economic event', async () => {
    const marker = await loadPostwarNativeReferenceMarker(markerPath!);
    const directory =
      process.env.ECONMIND_SOCIAL_MATCH_NATIVE_EVIDENCE_DIR ??
      '/workspace/office-connection-evidence/postwar-social-match-native-20261028';
    const checkpoint = JSON.parse(
      await readFile(path.join(directory, 'h2-clone.json'), 'utf8'),
    );
    if (
      checkpoint.referenceMarker !== markerPath ||
      checkpoint.seedFingerprint !== marker.seedFingerprint ||
      checkpoint.worldVersion !== '2'
    )
      throw Error('MATCH_CHECKPOINT_SCOPE_MISMATCH');
    const clone = await clonePostwarNativeReference(
      marker,
      'social_revoke',
      checkpoint.database,
    );
    const pool = (user: string) =>
      new Pool({
        host: marker.socket,
        port: marker.port,
        database: clone.database,
        user,
        max: 1,
      });
    const pub = pool(checkpoint.publisherRole),
      writer = pool(checkpoint.workerRole);
    pub.on('error', () => {});
    writer.on('error', () => {});
    const messages = (error: unknown): string[] =>
      error instanceof Error
        ? [
            error.message,
            ...messages(error.cause),
            ...(error instanceof AggregateError
              ? error.errors.flatMap(messages)
              : []),
          ]
        : [];
    try {
      const publishing = new PostgresSqlDatabase(pub);
      const withPublisher = <T>(
        consume: (
          tx: import('../../apps/world-worker/src/persistence/sql-database.js').SqlExecutor,
        ) => Promise<T>,
      ) =>
        publishing.transaction(async (tx) => {
          await tx.query('set transaction isolation level repeatable read');
          await tx.query('set local role world_v2_social_source_publisher');
          return consume(tx);
        });
      const command = await withPublisher((tx) =>
        createPostwarSocialMatchPublisher().publishFrom(tx, {
          worldId: marker.worldId,
          planCommandId: 'COMMAND_POSTWAR_NATIVE_PLAN',
        }),
      );
      const context = await loadPostwarSourceContext(root);
      const runtime = createPostwarSocialMatchRuntime({
        database: createPostwarSocialPositionRuntimeDatabase(
          new PostgresSqlDatabase(writer),
          { workerRole: checkpoint.workerRole },
        ),
        workerRole: checkpoint.workerRole,
        workerId: 'WORKER_POSTWAR_SOCIAL_POSITION_NATIVE',
        openingAdoption: context.labourSocial,
      });
      await runtime.assertSourceBeforeClaim({
        command,
        observedAtReal: new Date().toISOString(),
      });
      await withPublisher((tx) =>
        createPostgresSocialOperatingSourcePublisher({
          database: publishing,
        }).revokeFrom(tx, {
          worldId: marker.worldId,
          countryId: 'COUNTRY_01',
          reasonRef: 'TEST_ONLY_CURRENT_SOURCE_REVOKED',
        }),
      );
      let rejection: unknown;
      try {
        await runtime.assertSourceBeforeClaim({
          command,
          observedAtReal: new Date().toISOString(),
        });
      } catch (error) {
        rejection = error;
      }
      expect(messages(rejection)).toContain(
        'SOCIAL_SOURCE_NOT_REGISTERED_OR_REVOKED',
      );
      expect(
        (await writer.query('select current_user as role')).rows[0].role,
      ).toBe(checkpoint.workerRole);
      const actual = (
        await clone.installer.query(
          'select (select count(*)::int from world_v2.authoritative_event)as events,(select world_version::text from world_v2.world_head where world_id=$1)as head,(select queue_state from world_v2.command_queue where world_id=$1 and command_id=$2)as queue',
          [marker.worldId, command.commandId],
        )
      ).rows[0];
      expect(actual).toEqual({ events: 2, head: '2', queue: 'PENDING' });
      await writeFile(
        path.join(directory, 'source-revocation.json'),
        JSON.stringify(
          {
            classification: 'TEST_ONLY_ACTUAL_NATIVE_NOT_PRODUCTION',
            checkpoint: checkpoint.database,
            sourcePreclaimPositive: true,
            sourceRevocationRejected: true,
            restoredWorkerRole: checkpoint.workerRole,
            actual,
            WorldClock: false,
            productionAdmission: false,
          },
          null,
          2,
        ) + '\n',
      );
    } finally {
      await Promise.all([pub.end(), writer.end()]);
      await clone.drop();
    }
  }, 120000);
});
