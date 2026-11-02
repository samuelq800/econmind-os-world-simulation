/** Actual c427 source clone → lawful funded vacancy → existing PLAN consumer.
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
import * as C from '@econmind/core';
import {
  FINANCE_NATIVE_BUDGET_RULE,
  type FinanceNativeBudgetPolicy,
} from '@econmind/core/finance-budget-native';
import {
  createPostgresFinanceBudgetNativeRuntime,
  createFinanceBudgetAuthorizationDatabase,
} from '../../apps/world-worker/src/persistence/postgres-finance-budget-custody.js';
import {
  createPostwarSocialMatchPublisher,
  createPostwarSocialMatchRuntime,
} from '../../apps/world-worker/src/persistence/postwar-social-match-runtime.js';
const markerPath = process.env.ECONMIND_POSTWAR_MIXED_REFERENCE;
const checkpointPath = process.env.ECONMIND_POSTWAR_MIXED_H5_CHECKPOINT;
const setupCheckpointPath = process.env.ECONMIND_POSTWAR_MIXED_SETUP_CHECKPOINT;
const native = markerPath && !checkpointPath ? describe : describe.skip;
const root = path.resolve(import.meta.dirname, '../..');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
native('actual one-World Finance and Social ordered consumers', () => {
  it('commits Budget SET and LINE, then funded POSITION, PLAN and issued MATCH with one global prefix', async () => {
    const marker = await loadPostwarNativeReferenceMarker(markerPath!);
    expect(marker.seedFingerprint).toBe(
      'sha256:c42757599f51fe7e21ff52c152387c1f6a27649ff0cd199dd39b7d2205386589',
    );
    const resume = setupCheckpointPath
      ? (JSON.parse(await readFile(setupCheckpointPath, 'utf8')) as {
          classification: string;
          database: string;
          worldId: string;
          seedFingerprint: string;
          admissionRef: string;
          workerRole: string;
          publisherRole: string;
          financeRole: string;
        })
      : null;
    if (resume) {
      expect(resume.classification).toBe(
        'TEST_ONLY_ACTUAL_MIXED_FAILED_CHECKPOINT_NOT_AUTHORITY',
      );
      expect([
        resume.worldId,
        resume.seedFingerprint,
        resume.admissionRef,
      ]).toEqual([marker.worldId, marker.seedFingerprint, marker.admissionRef]);
    }
    const clone = await clonePostwarNativeReference(
      marker,
      'social_position',
      resume?.database,
    );
    const suffix = randomUUID().replaceAll('-', '').slice(0, 10),
      workerRole = resume?.workerRole ?? `social_position_worker_${suffix}`,
      publisherRole = resume?.publisherRole ?? `mixed_pub_${suffix}`,
      financeRole = resume?.financeRole ?? `mixed_finance_worker_${suffix}`;
    const worker = 'WORKER_POSTWAR_SOCIAL_POSITION_NATIVE';
    const directory =
      process.env.ECONMIND_SOCIAL_POSITION_NATIVE_EVIDENCE_DIR ??
      '/workspace/office-connection-evidence/postwar-shared-prefix-native-20261028';
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
      console.info('MIXED_PREFIX_NATIVE_STAGE:' + name);
    };
    const pools: Pool[] = [];
    let keep = false;
    const open = (user: string) => {
      const pool = new Pool({
        host: marker.socket,
        port: marker.port,
        database: clone.database,
        user,
        options: '-c request.jwt.claim.sub=' + marker.subject,
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
      if (!resume) {
        await clone.installer.query(ddl);
        await clone.installer.query(
          await readFile(
            path.join(root, 'database/proposals/finance-budget-custody.sql'),
            'utf8',
          ),
        );
        await clone.installer.query(
          await readFile(
            path.join(
              root,
              'database/proposals/social-operating-match-publisher.sql',
            ),
            'utf8',
          ),
        );
        evidence.proposalSha256 = sha(ddl);
        // Distinct disposable transport logins. The source reader is never given
        // event/receipt/queue/head DML to make a worker write succeed.
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
        await clone.installer.query(
          `grant world_v2_finance_budget_source_publisher to ${publisherRole};create role ${financeRole} login nosuperuser nobypassrls nocreatedb nocreaterole noreplication;grant world_v2_finance_budget_source_reader,world_v2_postwar_offline_seed_reader to ${financeRole};grant usage on schema world_v2 to ${financeRole};grant select on world_v2.opening_seed,world_v2.world_head,world_v2.world_writer_lease,world_v2.command_submission,world_v2.command_queue,world_v2.command_receipt,world_v2.authoritative_event,world_v2.inventory_posting,world_v2.financial_posting_batch,world_v2.current_commit_authorization,world_v2.authoritative_commit_authorization,world_v2.current_materialization,world_v2.notification_outbox to ${financeRole};grant insert on world_v2.authoritative_event,world_v2.command_receipt,world_v2.authoritative_commit_authorization,world_v2.current_materialization,world_v2.notification_outbox to ${financeRole};grant update on world_v2.world_head,world_v2.command_queue,world_v2.current_materialization to ${financeRole};grant update(command_id)on world_v2.command_submission to ${financeRole};grant update(renewed_at_real)on world_v2.world_writer_lease to ${financeRole};create policy mixed_finance_seed on world_v2.opening_seed for select to ${financeRole} using(world_id='${marker.worldId}');`,
        );
      }
      // Metadata needed by the existing seed RLS predicate; no write authority
      // and no broad/new raw-data policy is introduced by this affected repair.
      await clone.installer.query(
        `grant select on world_v2.runtime_read_seat,world_v2.projection_entitlement,world_v2.runtime_opening_admission to ${financeRole}`,
      );
      const pub = open(publisherRole),
        writer = open(workerRole);
      const publishing = new PostgresSqlDatabase(pub);
      const publisher = createPostgresSocialOperatingSourcePublisher({
        database: publishing,
      });
      stage('VALIDATING_FULL_E03_AND_REGISTERING_70_COUNTRIES');
      const registrations = resume
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
        new PostgresSqlDatabase(writer),
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
        socialMatchSourceCommitProtectionPort:
          matchRuntime.sourceCommitProtectionPort,
        socialPositionSourceCommitProtectionPort:
          runtime.sourceCommitProtectionPort,
      });
      const persistedAt = resume
        ? (
            await clone.installer.query<{ submitted_at_real: Date }>(
              'select submitted_at_real from world_v2.command_submission where world_id=$1 order by submitted_at_real limit 1',
              [marker.worldId],
            )
          ).rows[0]?.submitted_at_real
        : null;
      const at = persistedAt?.toISOString() ?? new Date().toISOString();
      if (!resume)
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
          `insert into world_v2.command_submission(world_id,command_id,idempotency_key,command_type,schema_version,canonical_payload,payload_sha256,command_fingerprint,auth_subject,actor_id,country_id,office_id,expected_world_version,sim_time,correlation_id,submitted_at_real)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)on conflict do nothing`,
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
          "insert into world_v2.command_queue(world_id,command_id,authority_kind,available_at_sim_time)values($1,$2,'DISCRETIONARY_USER',$3)on conflict do nothing",
          [
            command.worldId,
            command.commandId,
            command.simTime.toCanonicalValue(),
          ],
        );
        await clone.installer.query(
          "update world_v2.command_queue set queue_state='CLAIMED',attempt_count=1,claimed_by=$3,claimed_at_real=$4,claim_fencing_token=1 where world_id=$1 and command_id=$2 and queue_state='PENDING'",
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
      // Source-backed player intents allocate existing fiscal capacity. No
      // balance, payment, exchange quote, opening rule or source is invented.
      stage('BUDGET_ORIGINALS_AND_SAME_WORLD_SET_LINE');
      const selected = await clone.installer.query<{
        government: string;
        currency: string;
        account: string;
        gross: string;
        encumbered: string;
      }>(
        `with roots as(select(x->>'canonicalPayload')::jsonb body from world_v2.opening_seed s cross join lateral jsonb_array_elements(s.canonical_payload::jsonb->'sources')x where s.world_id=$1),fin as(select body from roots where body->>'schemaVersion'='adopted-financial-opening-source-v2'),roster as(select x->'roster' r from fin cross join lateral jsonb_array_elements(body->'assembly'->'countries')x where x->>'countryId'=$2),op as(select body from roots where body->>'schemaVersion'='postwar-operating-genesis-seed-source-v1'),legs as(select l from world_v2.opening_seed s cross join lateral jsonb_array_elements(s.canonical_payload::jsonb->'financialBatches')b cross join lateral jsonb_array_elements(b->'legs')l cross join roster where s.world_id=$1 and l->'account'->>'countryId'=$2 and l->'account'->>'ownerId'=r->>'government'and l->'account'->>'counterpartyEntityId'=r->>'centralBank'and l->'account'->>'accountClass'='ASSET'and l->>'direction'='DEBIT')select r->>'government'government,l->'account'->>'currency'currency,l->'account'->>'accountId'account,l->'amount'->>'amount'gross,(select coalesce(sum((f->>'ceilingAmount')::numeric),0)::text from op cross join lateral jsonb_array_elements(body->'carrier'->'facts'->'funding')f where f->>'accountId'=l->'account'->>'accountId')encumbered from legs cross join roster`,
        [marker.worldId, marker.countryId],
      );
      expect(selected.rows).toHaveLength(1);
      const original = selected.rows[0]!;
      const free = C.Money.from(original.gross, original.currency).subtract(
        C.Money.from(original.encumbered, original.currency),
      );
      expect(free.amount.greaterThan('0')).toBe(true);
      const cap = C.canonicalDecimal(free.amount.dividedBy('2'));
      const policy: FinanceNativeBudgetPolicy = {
        schemaVersion: 'finance-native-budget-policy-v1',
        ruleRef: FINANCE_NATIVE_BUDGET_RULE,
        ruleRevision: 'RULE_TEST_ONLY_MIXED_V1',
        sourceDocumentSHA256:
          'sha256:' +
          sha(
            await readFile(
              path.join(root, 'specs/extracted/FINANCE.md'),
              'utf8',
            ),
          ),
        normativeUnits: [
          'FINANCE-U0247',
          'FINANCE-U0252',
          'FINANCE-U0265',
          'FINANCE-U0295',
        ],
        worldId: marker.worldId,
        countryId: marker.countryId,
        governmentEntityId: original.government,
        currency: original.currency,
        envelopeRef: 'MIXED_NATIVE_FINANCE_SELF',
        effectivePeriodRef: 'TEST_ONLY_OPENING_PERIOD',
        periodRevision: 'TEST_ONLY_PERIOD_REV',
        validFromSimTime: '0',
        validUntilSimTime: '86400000',
        requestingOfficeId: 'FINANCE',
        programmeOwnerOfficeId: 'FINANCE',
        classification: 'ORDINARY_DEPARTMENTAL',
        funding: 'FULL_UNCONDITIONAL',
        requiredApprovalOffices: ['FINANCE'],
      };
      await publishing.transaction(async (tx) => {
        await tx.query('set transaction isolation level repeatable read');
        await tx.query(
          'set local role world_v2_finance_budget_source_publisher',
        );
        return tx.query(
          'select world_v2.publish_finance_budget_policy($1,$2,$3,$4,$5,$6)',
          [
            'POLICY_TEST_ONLY_MIXED',
            'ISOLATED_TEST_ONLY_POLICY_PUBLISHER',
            C.canonicalSerialize(policy),
            marker.seedFingerprint,
            marker.admissionRef,
            policy.sourceDocumentSHA256.slice(7),
          ],
        );
      });
      const financeDatabase = createFinanceBudgetAuthorizationDatabase(
        new PostgresSqlDatabase(open(financeRole)),
      );
      const financeRuntime = createPostgresFinanceBudgetNativeRuntime({
        database: financeDatabase,
        workerId: worker,
        sha256Hex: sha,
      });
      const financeRepository = new AtomicTransitionRepository({
        database: financeDatabase,
        workerId: worker,
        sha256Hex: sha,
        authorizationGuard: createTransactionCutoffAuthorizationGuard(),
        financeBudgetSourceCommitProtectionPort: financeRuntime.commitGuard,
      });
      const executeFinance = async (command: CanonicalCommand) =>
        processQueuedCommand({
          command,
          authorityKind: 'DISCRETIONARY_USER',
          requiredCapability: 'FINANCE_BUDGET',
          intakeAuthorization: await authorizeManualOfficeCommand({
            database: financeDatabase,
            command,
          }),
          commitSimTime: command.simTime,
          recordedAtReal: at,
          persistence: {
            readFinalReceipt: (cmd) => financeRepository.readFinalReceipt(cmd),
            recordZeroEffectReceipt: (r) =>
              financeRepository.recordZeroEffectReceipt(r),
            async commitAuthorizedCommand({ command, commitAuthorization }) {
              const draft = await financeRuntime.factory.prepare({
                command,
                commitAuthorization,
                observedAtReal: at,
              });
              const value = await financeRepository.commit(
                prepareAtomicTransitionCandidate({
                  command,
                  commitAuthorization,
                  draft,
                  sha256Hex: sha,
                }),
              );
              return { receipt: value.receipt, transition: value.transition };
            },
          },
        });
      const budget = (
        operation: 'SET_ENVELOPE' | 'APPROVE_NEW_LINE',
        version: string,
      ) =>
        C.parseCanonicalCommand(
          {
            schemaVersion: 'command-v1',
            commandId: `COMMAND_MIXED_${operation}`,
            commandType: 'CORE_FINANCE_BUDGET_APPROPRIATION_V1',
            actorId: 'ACTOR_SOCIAL_POSITION_NATIVE',
            authSubject: marker.subject,
            correlationId: 'CORRELATION_MIXED_NATIVE',
            worldId: marker.worldId,
            countryId: marker.countryId,
            officeId: 'FINANCE',
            expectedWorldVersion: version,
            idempotencyKey: `KEY_MIXED_${operation}`,
            simTime: '0',
            submittedAtReal: at,
            payload: {
              operation,
              scope: {
                worldId: marker.worldId,
                countryId: marker.countryId,
                entityRef: original.government,
                envelopeRef: policy.envelopeRef,
                effectivePeriodRef: policy.effectivePeriodRef,
              },
              currency: original.currency,
              amount:
                operation === 'SET_ENVELOPE'
                  ? cap
                  : C.canonicalDecimal(
                      C.Money.from(cap, original.currency).amount.dividedBy(
                        '2',
                      ),
                    ),
              envelopeRevisionRef: 'ENVELOPE_REV_MIXED_NATIVE',
              lineRef:
                operation === 'SET_ENVELOPE' ? null : 'LINE_MIXED_NATIVE',
              revisionRef:
                operation === 'SET_ENVELOPE'
                  ? 'ENVELOPE_REV_MIXED_NATIVE'
                  : 'LINE_REV_MIXED_NATIVE',
              predecessorRevisionRef: null,
            },
          },
          sha,
        );
      for (const command of [
        budget('SET_ENVELOPE', '0'),
        budget('APPROVE_NEW_LINE', '1'),
      ]) {
        await submit(command);
        const result = await executeFinance(command);
        expect(result.receipt.outcome).toBe('COMMITTED');
        expect((await executeFinance(command)).source).toBe('EXISTING_FINAL');
      }
      evidence.budget = {
        cap,
        currency: original.currency,
        treasuryAccount: original.account,
        sourceBalance: original.gross,
        openingEncumbered: original.encumbered,
        commands: 2,
        eventGroupSizes: [1, 3],
        cashCreated: false,
      };
      stage('SOCIAL_POSITION_AFTER_REAL_BUDGET_PREFIX');
      const intent = {
        schemaVersion: 'social-employment-position-offer-create-v1',
        positionId: 'POSITION_MIXED_NATIVE_VACANCY',
        locationId: 'REGION_01_E1',
        skill: 'HIGH',
        publicService: 'PUBLIC_SAFETY',
        occupation: 'GENERAL',
        requiredCount: '1',
        wageScheduleRef:
          'PW_POSITION_A5BB8AE68C0CEE82BBF3C4D070D9B6648398E9289A2372D19C859143EB855C43',
        fundingAccountId: original.account,
        coverageDays: '1',
      };
      const create = c(
        'POSITION',
        'COMMAND_MIXED_NATIVE_POSITION',
        '2',
        intent,
      );
      await submit(create);
      const created = await execute(
        create,
        runtime.candidateFactory,
        await runtime.authorizeIntake(create),
      );
      expect(created.receipt.outcome).toBe('COMMITTED');
      expect(created.receipt.worldVersionAfter).toBe('3');
      const payload = (
        await clone.installer.query<{ canonical_payload: string }>(
          'select canonical_payload from world_v2.authoritative_event where world_id=$1 and causation_command_id=$2',
          [marker.worldId, create.commandId],
        )
      ).rows[0]!;
      const actualPosition = JSON.parse(payload.canonical_payload);
      expect(
        actualPosition.readFacts.funding.priorReservations.filter(
          (r: { reservationId: string; amount: string }) =>
            r.reservationId.startsWith('BUDGET_CAPACITY_') && r.amount === cap,
        ),
      ).toHaveLength(1);
      evidence.position = {
        budgetCapProtectedExactlyOnce: true,
        reservation: actualPosition.reservation,
        outcome: created.receipt.outcome,
      };
      stage('PLAN_AND_SQL_ISSUED_MATCH_AFTER_MIXED_PREFIX');
      const plan = c(
        'PLAN',
        'COMMAND_MIXED_NATIVE_PLAN',
        '3',
        {
          schemaVersion: 'social-employment-service-plan-v1',
          locationId: 'REGION_01_E1',
          skill: 'HIGH',
          positionId: intent.positionId,
          servicePoolId: 'POSTWAR_EMPLOYMENT_REGION_01_E1_HIGH',
          requestedMatches: '1',
          dueDayIndex: '0',
        },
        '2000',
      );
      await submit(plan);
      const source = new SqlSocialJobMatchCandidateSource({
        mode: 'TEST_ONLY_LOCAL',
        database,
        workerId: worker,
        sha256Hex: sha,
        openingAdoption: context.labourSocial,
        snapshotReader,
        automaticAuthority: null,
      });
      const planned = await execute(
        plan,
        createSocialJobMatchCandidateFactory({ source, sha256Hex: sha }),
        await authorizeManualOfficeCommand({ database, command: plan }),
      );
      expect(planned.receipt.outcome).toBe('COMMITTED');
      expect(planned.receipt.worldVersionAfter).toBe('4');
      const matchPublisher = createPostwarSocialMatchPublisher();
      const publication = <T>(
        consume: (
          tx: import('../../apps/world-worker/src/persistence/sql-database.js').SqlExecutor,
        ) => Promise<T>,
      ) =>
        publishing.transaction(async (tx) => {
          await tx.query('set transaction isolation level repeatable read');
          await tx.query('set local role world_v2_social_source_publisher');
          return consume(tx);
        });
      await publication((tx) =>
        matchPublisher.registerFrom(tx, {
          worldId: marker.worldId,
          countryId: marker.countryId,
        }),
      );
      const match = await publication((tx) =>
        matchPublisher.publishFrom(tx, {
          worldId: marker.worldId,
          planCommandId: plan.commandId,
        }),
      );
      expect(match.expectedWorldVersion).toBe('4');
      await clone.installer.query(
        "update world_v2.command_queue set queue_state='CLAIMED',attempt_count=1,claimed_by=$3,claimed_at_real=$4,claim_fencing_token=1 where world_id=$1 and command_id=$2",
        [marker.worldId, match.commandId, worker, at],
      );
      const matchOnce = () =>
        processQueuedCommand({
          command: match,
          authorityKind: 'VERSIONED_AUTOMATIC',
          commitSimTime: match.simTime,
          recordedAtReal: at,
          persistence: {
            readFinalReceipt: (cmd) => repository.readFinalReceipt(cmd),
            recordZeroEffectReceipt: (r) =>
              repository.recordZeroEffectReceipt(r),
            async commitAuthorizedCommand({ command, commitAuthorization }) {
              expect(commitAuthorization).toBeNull();
              const draft = await matchRuntime.candidateFactory.prepare({
                command,
                commitAuthorization,
                observedAtReal: at,
              });
              const value = await repository.commit(
                prepareAtomicTransitionCandidate({
                  command,
                  commitAuthorization,
                  draft,
                  sha256Hex: sha,
                }),
              );
              return { receipt: value.receipt, transition: value.transition };
            },
          },
        });
      const matched = await matchOnce();
      expect(matched.receipt.outcome).toBe('COMMITTED');
      expect((await matchOnce()).source).toBe('EXISTING_FINAL');
      const final = (
        await clone.installer.query(
          `select(select count(*)::int from world_v2.authoritative_event where world_id=$1)events,(select count(*)::int from world_v2.command_receipt where world_id=$1 and outcome='COMMITTED')receipts,(select count(*)::int from world_v2.command_queue where world_id=$1 and queue_state='FINALIZED')finalized,(select world_version::text from world_v2.world_head where world_id=$1)version,(select event_sequence::text from world_v2.world_head where world_id=$1)sequence,(select count(*)::int from world_v2.financial_posting_batch where world_id=$1)financial_postings`,
          [marker.worldId],
        )
      ).rows[0];
      expect(final).toEqual({
        events: 7,
        receipts: 5,
        finalized: 5,
        version: '5',
        sequence: '7',
        financial_postings: 0,
      });
      evidence.final = final;
      evidence.status =
        'ACTUAL_NATIVE_MIXED_FINANCE_SOCIAL_PREFIX_PASSED_NOT_PRODUCTION';
      keep = true;
    } catch (error) {
      evidence.status = 'FAILED';
      const causes: string[] = [];
      let cause: unknown = error;
      for (let i = 0; i < 8 && cause instanceof Error; i++) {
        causes.push(cause.message);
        cause = cause.cause;
      }
      evidence.failureCauses = causes;
      throw error;
    } finally {
      const checkpointHead = (
        await clone.installer.query<{
          world_version: string;
          event_sequence: string;
        }>(
          'select world_version::text,event_sequence::text from world_v2.world_head where world_id=$1',
          [marker.worldId],
        )
      ).rows[0];
      await mkdir(directory, { recursive: true });
      const bytes = JSON.stringify(evidence, null, 2) + '\n';
      await writeFile(path.join(directory, `attempt-${suffix}.json`), bytes);
      await writeFile(path.join(directory, 'summary.json'), bytes);
      await Promise.all(pools.map((p) => p.end()));
      if (checkpointHead) {
        await clone.close();
        await sealPostwarReferenceClone(marker, clone.database);
        await writeFile(
          path.join(
            directory,
            keep
              ? 'h5-checkpoint.json'
              : `failed-h${checkpointHead.world_version}-${suffix}.json`,
          ),
          JSON.stringify(
            {
              classification: keep
                ? 'TEST_ONLY_ACTUAL_MIXED_H5_CHECKPOINT_NOT_AUTHORITY'
                : 'TEST_ONLY_ACTUAL_MIXED_FAILED_CHECKPOINT_NOT_AUTHORITY',
              referenceMarker: markerPath,
              database: clone.database,
              worldId: marker.worldId,
              seedFingerprint: marker.seedFingerprint,
              admissionRef: marker.admissionRef,
              workerId: worker,
              workerRole,
              financeRole,
              publisherRole,
              worldVersion: checkpointHead.world_version,
              eventSequence: checkpointHead.event_sequence,
              stage: stages.at(-1)?.stage,
              failureCauses: evidence.failureCauses ?? null,
              policy: {
                envelopeRef: 'MIXED_NATIVE_FINANCE_SELF',
                effectivePeriodRef: 'TEST_ONLY_OPENING_PERIOD',
              },
              budget: evidence.budget,
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
        if (!checkpointHead)
          await cleanup.query(
            `drop role if exists ${workerRole},${publisherRole},${financeRole}`,
          );
      } finally {
        await cleanup.end();
      }
    }
  }, 600000);
});
