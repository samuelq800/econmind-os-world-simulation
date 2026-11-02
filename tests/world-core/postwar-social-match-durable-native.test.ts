/** Actual durable one-shot consumer over sealed H2. No Clock service or source bootstrap. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { Pool } from 'pg';
import {
  parseCanonicalCommand,
  SOCIAL_POSITION_OFFER_CREATE_COMMAND,
  DomainError,
} from '@econmind/core';
import { describe, it, expect } from 'vitest';
import {
  loadPostwarNativeReferenceMarker,
  clonePostwarNativeReference,
} from '../support/postwar-native-reference-db.js';
import {
  PostgresSqlDatabase,
  PostgresTransactionError,
} from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import {
  createPostwarSocialPositionRuntime,
  createPostwarSocialPositionRuntimeDatabase,
} from '../../apps/world-worker/src/persistence/postwar-social-position-runtime.js';
import {
  createPostwarSocialMatchRuntime,
  createPostwarSocialMatchPublisher,
} from '../../apps/world-worker/src/persistence/postwar-social-match-runtime.js';
import { createPostgresSocialOperatingSourcePublisher } from '../../apps/world-worker/src/persistence/postgres-social-operating-custody.js';
import { loadPostwarSourceContext } from '../../apps/world-worker/src/preparation/postwar-source-context.js';
import { createDurableCommandConsumptionPreparation } from '../../apps/world-worker/src/preparation/durable-command-consumption.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';
import {
  createManualOfficeIntakeRuntime,
  preflightManualOfficeIntakeRuntime,
} from '../../apps/world-worker/src/intake/manual-office-intake-runtime.js';
const markerPath = process.env.ECONMIND_SOCIAL_MATCH_REFERENCE;
const native = markerPath ? describe : describe.skip;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const directory =
  process.env.ECONMIND_SOCIAL_MATCH_NATIVE_EVIDENCE_DIR ??
  '/workspace/office-connection-evidence/postwar-social-match-native-20261028';
const workerId = 'WORKER_POSTWAR_SOCIAL_POSITION_NATIVE';
native('actual H2 durable automatic Social MATCH consumer', () => {
  it('consumes the SQL-issued pending MATCH once and stays idle, while revoked originals remain unclaimed', async () => {
    const marker = await loadPostwarNativeReferenceMarker(markerPath!);
    const checkpoint = JSON.parse(
      await readFile(path.join(directory, 'h2-clone.json'), 'utf8'),
    );
    if (
      checkpoint.referenceMarker !== markerPath ||
      checkpoint.seedFingerprint !== marker.seedFingerprint ||
      checkpoint.worldVersion !== '2'
    )
      throw Error('MATCH_CHECKPOINT_SCOPE_MISMATCH');
    const context = await loadPostwarSourceContext(
      path.resolve(import.meta.dirname, '../..'),
    );
    const evidence: Record<string, unknown> = {
      classification: 'TEST_ONLY_ACTUAL_NATIVE_DURABLE_NOT_PRODUCTION',
      checkpoint: checkpoint.database,
      WorldClock: false,
      productionAdmission: false,
      sourceClock: 'FIXED_ACTUAL_SQL_ISSUED_LAST_PLAN_SIMTIME_NO_CLOCK_ADVANCE',
    };
    const attempts: Record<string, unknown>[] = [];
    evidence.attempts = attempts;
    const errorMessages = (e: unknown): string[] =>
      e instanceof Error
        ? [
            e.message,
            ...errorMessages(e.cause),
            ...(e instanceof AggregateError
              ? e.errors.flatMap(errorMessages)
              : []),
          ]
        : [];
    try {
      for (const revoked of [false, true]) {
        const clone = await clonePostwarNativeReference(
          marker,
          revoked ? 'social_due_revoke' : 'social_due_consume',
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
        let consumer:
          | ReturnType<typeof createDurableCommandConsumptionPreparation>
          | undefined;
        const attempt: Record<string, unknown> = { revoked };
        attempts.push(attempt);
        const errors: string[] = [];
        attempt.sqlErrors = errors;
        try {
          const publishing = new PostgresSqlDatabase(pub);
          const withPublisher = <T>(consume: (tx: SqlExecutor) => Promise<T>) =>
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
          // Host preparation binds/renews the existing lawful lease explicitly;
          // the consumer itself has no acquisition or takeover fallback.
          await clone.installer.query(
            'select * from world_v2.acquire_world_writer_lease($1,$2,$3,$4)',
            [marker.worldId, workerId, new Date().toISOString(), '1800000'],
          );
          const actualDatabase = createPostwarSocialPositionRuntimeDatabase(
            new PostgresSqlDatabase(writer),
            { workerRole: checkpoint.workerRole },
          );
          const observe = (tx: SqlExecutor): SqlExecutor => ({
            async query<Row extends object>(
              sql: string,
              args?: readonly unknown[],
            ) {
              try {
                return await tx.query<Row>(sql, args);
              } catch (error) {
                errors.push(...errorMessages(error));
                throw error;
              }
            },
          });
          const database: SqlDatabase = {
            query: observe(actualDatabase).query,
            transaction: (consume) =>
              actualDatabase.transaction((tx) => consume(observe(tx))),
          };
          const runtime = createPostwarSocialMatchRuntime({
            database,
            workerRole: checkpoint.workerRole,
            workerId,
            openingAdoption: context.labourSocial,
          });
          expect(
            (
              await clone.installer.query(
                "select has_column_privilege($1,'world_v2.opening_seed','canonical_payload','SELECT')as raw",
                [checkpoint.workerRole],
              )
            ).rows[0].raw,
          ).toBe(false);
          if (revoked)
            await withPublisher((tx) =>
              createPostgresSocialOperatingSourcePublisher({
                database: publishing,
              }).revokeFrom(tx, {
                worldId: marker.worldId,
                countryId: 'COUNTRY_01',
                reasonRef: 'TEST_ONLY_DURABLE_PRECLAIM_REVOKED',
              }),
            );
          consumer = createDurableCommandConsumptionPreparation({
            database,
            environment: { ECONMIND_ENV: 'ci' },
            workerId,
            worldId: marker.worldId,
            sha256Hex: sha,
            clock: {
              nowReal: () => new Date().toISOString(),
              simTime: async (world) => {
                expect(world).toBe(marker.worldId);
                return command.simTime.toCanonicalValue();
              },
            },
            officeReaders: { socialMatch: runtime },
          });
          expect(consumer.state()).toBe('PREPARED');
          consumer.startPreparation();
          const result = await consumer.consumeOnce();
          attempt.result = result;
          if (!revoked) {
            expect(result).toMatchObject({
              status: 'PROCESSED',
              source: 'NEW_FINAL',
              commandId: command.commandId,
              receipt: { outcome: 'COMMITTED', worldVersionAfter: '3' },
            });
            const duplicate = await consumer.consumeOnce();
            expect(duplicate).toEqual({ status: 'IDLE' });
            attempt.next = duplicate;
          } else {
            expect(result).toMatchObject({
              status: 'BLOCKED',
              reason: 'DURABLE_PRIMITIVE_REJECTED',
              domainCode: 'TRANSITION_EVIDENCE_INVALID',
              detail:
                'SOCIAL_OPERATING_SOURCE_UNAVAILABLE:REGISTERED_SOURCE_UNAVAILABLE',
            });
            expect(consumer.state()).toBe('READY');
            const repeated = await consumer.consumeOnce();
            expect(repeated).toMatchObject({
              status: 'BLOCKED',
              reason: 'DURABLE_PRIMITIVE_REJECTED',
            });
            expect(consumer.state()).toBe('READY');
            attempt.repeated = repeated;
            expect(errors).toContain('SOCIAL_SOURCE_NOT_REGISTERED_OR_REVOKED');
          }
          const actual = (
            await clone.installer.query(
              "select (select count(*)::int from world_v2.authoritative_event)as events,(select count(*)::int from world_v2.command_receipt where outcome='COMMITTED')as receipts,(select world_version::text from world_v2.world_head where world_id=$1)as head,(select queue_state from world_v2.command_queue where world_id=$1 and command_id=$2)as queue,(select attempt_count from world_v2.command_queue where world_id=$1 and command_id=$2)as attempts",
              [marker.worldId, command.commandId],
            )
          ).rows[0];
          attempt.actual = actual;
          expect(actual).toEqual(
            revoked
              ? {
                  events: 2,
                  receipts: 2,
                  head: '2',
                  queue: 'PENDING',
                  attempts: '0',
                }
              : {
                  events: 3,
                  receipts: 3,
                  head: '3',
                  queue: 'FINALIZED',
                  attempts: '1',
                },
          );
          attempt.actual = actual;
          expect(
            (await writer.query('select current_user as role')).rows[0].role,
          ).toBe(checkpoint.workerRole);
        } finally {
          await consumer?.stop();
          await Promise.all([pub.end(), writer.end()]);
          await clone.drop();
        }
      }
      evidence.status = 'ACTUAL_DURABLE_MATCH_CONSUMER_PASSED_NOT_PRODUCTION';
    } catch (error) {
      evidence.status = 'FAILED';
      evidence.failureCauses = errorMessages(error);
      throw error;
    } finally {
      await mkdir(directory, { recursive: true });
      await writeFile(
        path.join(directory, 'durable-semantic-source.json'),
        JSON.stringify(
          evidence,
          (_key, value: unknown) =>
            typeof value === 'bigint' ? value.toString() : value,
          2,
        ) + '\n',
      );
    }
  }, 180000);
  it('manual preflight handles confirmed semantic rollback and preserves real SQL permission failures', async () => {
    const marker = await loadPostwarNativeReferenceMarker(markerPath!);
    const checkpoint = JSON.parse(
      await readFile(path.join(directory, 'h2-clone.json'), 'utf8'),
    );
    if (
      checkpoint.referenceMarker !== markerPath ||
      checkpoint.seedFingerprint !== marker.seedFingerprint ||
      checkpoint.worldVersion !== '2'
    )
      throw Error('MATCH_CHECKPOINT_SCOPE_MISMATCH');
    const evidence: Record<string, unknown> = {
      classification: 'TEST_ONLY_ACTUAL_NATIVE_PREFLIGHT_NOT_PRODUCTION',
      checkpoint: checkpoint.database,
      productionAdmission: false,
      WorldClock: false,
    };
    const attempts: Record<string, unknown>[] = [];
    evidence.attempts = attempts;
    try {
      for (const mode of ['SOURCE_REVOKED', 'READER_PERMISSION_DENIED']) {
        const clone = await clonePostwarNativeReference(
          marker,
          'social_preflight',
          checkpoint.database,
        );
        const pub = new Pool({
          host: marker.socket,
          port: marker.port,
          database: clone.database,
          user: checkpoint.publisherRole,
          max: 1,
        });
        const writer = new Pool({
          host: marker.socket,
          port: marker.port,
          database: clone.database,
          user: checkpoint.workerRole,
          max: 1,
        });
        pub.on('error', () => {});
        writer.on('error', () => {});
        let intake:
          ReturnType<typeof createManualOfficeIntakeRuntime> | undefined;
        const attempt: Record<string, unknown> = { mode };
        attempts.push(attempt);
        try {
          const publishing = new PostgresSqlDatabase(pub);
          if (mode === 'SOURCE_REVOKED')
            await publishing.transaction(async (tx) => {
              await tx.query('set transaction isolation level repeatable read');
              await tx.query('set local role world_v2_social_source_publisher');
              await createPostgresSocialOperatingSourcePublisher({
                database: publishing,
              }).revokeFrom(tx, {
                worldId: marker.worldId,
                countryId: 'COUNTRY_01',
                reasonRef: 'TEST_ONLY_PREFLIGHT_SOURCE_REVOKED',
              });
            });
          else
            await clone.installer.query(
              'revoke execute on function world_v2.lock_social_operating_source(text,text) from world_v2_social_source_reader',
            );
          const database = createPostwarSocialPositionRuntimeDatabase(
            new PostgresSqlDatabase(writer),
            { workerRole: checkpoint.workerRole },
          );
          const runtime = createPostwarSocialPositionRuntime({
            database,
            workerRole: checkpoint.workerRole,
            workerId,
          });
          const observedAtReal = new Date().toISOString();
          const command = parseCanonicalCommand(
            {
              schemaVersion: 'command-v1',
              commandId: 'COMMAND_POSTWAR_PREFLIGHT_SOURCE_NEGATIVE',
              commandType: SOCIAL_POSITION_OFFER_CREATE_COMMAND,
              actorId: 'ACTOR_SOCIAL_PREFLIGHT_NEGATIVE',
              authSubject: marker.subject,
              correlationId: 'CORRELATION_SOCIAL_PREFLIGHT_NEGATIVE',
              worldId: marker.worldId,
              countryId: 'COUNTRY_01',
              officeId: 'SOCIAL',
              expectedWorldVersion: '2',
              idempotencyKey: 'IDEMPOTENCY_SOCIAL_PREFLIGHT_NEGATIVE',
              simTime: '3000',
              submittedAtReal: observedAtReal,
              payload: {
                schemaVersion: 'social-employment-position-offer-create-v1',
                positionId: 'POSITION_POSTWAR_PREFLIGHT_NEGATIVE',
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
              },
            },
            sha,
          );
          intake = createManualOfficeIntakeRuntime({
            intakePool: writer,
            workerDatabase: database,
            worldId: marker.worldId,
            workerId,
            clock: {
              nowReal: () => new Date().toISOString(),
              simTime: async () => command.simTime.toCanonicalValue(),
            },
            sha256Hex: sha,
            environment: { ECONMIND_ENV: 'ci' },
            readers: { socialPosition: runtime },
          });
          if (mode === 'SOURCE_REVOKED') {
            const result = await preflightManualOfficeIntakeRuntime(
              intake,
              command,
              observedAtReal,
            );
            expect(result).toBe(false);
            attempt.preflight = result;
          } else {
            let failure: unknown;
            try {
              await preflightManualOfficeIntakeRuntime(
                intake,
                command,
                observedAtReal,
              );
            } catch (error) {
              failure = error;
            }
            expect(failure).toBeInstanceOf(PostgresTransactionError);
            if (!(failure instanceof PostgresTransactionError))
              throw Error('MISSING_REAL_SQL_FAILURE');
            expect(failure.outcome).toBe('ROLLED_BACK');
            expect(failure.cause).not.toBeInstanceOf(DomainError);
            attempt.operationalFailure = {
              name: failure.name,
              outcome: failure.outcome,
            };
          }
          expect(intake.consumer.state()).toBe('PREPARED');
          const actual = (
            await clone.installer.query(
              'select (select count(*)::int from world_v2.authoritative_event)as events,(select world_version::text from world_v2.world_head where world_id=$1)as head,(select count(*)::int from world_v2.command_submission where world_id=$1 and command_id=$2)as submitted',
              [marker.worldId, command.commandId],
            )
          ).rows[0];
          expect(actual).toEqual({ events: 2, head: '2', submitted: 0 });
          attempt.actual = actual;
          expect(
            (await writer.query('select current_user as role')).rows[0].role,
          ).toBe(checkpoint.workerRole);
        } finally {
          await intake?.consumer.stop();
          await Promise.all([pub.end(), writer.end()]);
          await clone.drop();
        }
      }
      evidence.status =
        'ACTUAL_PREFLIGHT_SEMANTIC_AND_OPERATIONAL_SPLIT_PASSED';
    } catch (error) {
      evidence.status = 'FAILED';
      evidence.failure = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      await mkdir(directory, { recursive: true });
      await writeFile(
        path.join(directory, 'manual-preflight-semantic-source.json'),
        JSON.stringify(evidence, null, 2) + '\n',
      );
    }
  }, 30000);
});
