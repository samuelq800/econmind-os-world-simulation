// PREPARATION_ONLY_NOT_V09_3_STARTED: disposable PostgreSQL evidence only.

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  COMMAND_SCHEMA_VERSION,
  EVENT_SCHEMA_VERSION,
  INVENTORY_POSTING_SCHEMA_VERSION,
  Quantity,
  SimTime,
  acquireWorldWriterLease,
  canonicalHashInput,
  canonicalSha256,
  commodityId,
  countryId,
  createAuthoritativeTransition,
  createFinalCommandReceipt,
  createInventoryAccount,
  createOutboxMessage,
  createReservationPosting,
  createWorldWriterCommitAssertion,
  eventId,
  inventoryBatchId,
  inventoryLocationId,
  inventoryPostingId,
  inventoryReservationId,
  legalEntityId,
  parseAuthoritativeEvent,
  parseCanonicalCommand,
  workerId,
  worldId,
  worldWriterLeaseRequest,
  type Sha256Hex,
} from '../../apps/world-worker/node_modules/@econmind/core/dist/index.js';
import {
  AtomicTransitionRepository,
  prepareAtomicTransitionCandidate,
  serverHeldAuthorizationGuard,
} from '../../apps/world-worker/src/persistence/atomic-transition-repository.js';
import type { SqlDatabase } from '../../apps/world-worker/src/persistence/sql-database.js';
import { WorldRecoveryCoordinator } from '../../apps/world-worker/src/recovery/world-recovery.js';
import { createLocalPostgresV09AtomicTestDatabase } from '../support/v09-atomic-database.js';
import type { V09AtomicTestDatabase } from '../support/v09-atomic-contract.js';

const root = path.resolve(import.meta.dirname, '../..');
const migrations = [
  '0001_world_v2_namespace.sql',
  '0002_world_v2_command_event_ledger.sql',
  '0003_world_v2_command_receipts_outbox.sql',
  '0004_world_v2_receipt_event_set_integrity.sql',
  '0005_world_v2_writer_lease_fencing.sql',
  '0006_world_v2_writer_lease_lineage_guard.sql',
  '0007_world_v2_atomic_transition_facts.sql',
  '0008_world_v2_materialization_recovery.sql',
] as const;
const sha256Hex: Sha256Hex = (preimage: string) =>
  createHash('sha256').update(preimage, 'utf8').digest('hex');
const WORLD = worldId('WORLD_POSTGRES_RECOVERY');
const WORKER = workerId('WORKER_POSTGRES_RECOVERY');
const AT_0 = '2026-09-12T00:00:00.000Z';
const AT_1 = '2026-09-12T00:00:01.000Z';
const AT_60 = '2026-09-12T00:01:00.000Z';

const postgresDescribe = process.env.V09_TEST_DATABASE_URL
  ? describe
  : describe.skip;

let database: V09AtomicTestDatabase;

beforeAll(async () => {
  if (!process.env.V09_TEST_DATABASE_URL) return;
  database = createLocalPostgresV09AtomicTestDatabase();
  await database.executeScript('drop schema if exists world_v2 cascade');
  for (const migration of migrations) {
    await database.executeScript(
      await readFile(
        path.join(root, 'database/migrations/artifacts', migration),
        'utf8',
      ),
    );
  }
});

afterAll(async () => {
  if (database === undefined) return;
  await database.executeScript('drop schema if exists world_v2 cascade');
  await database.close();
});

postgresDescribe(
  'V09 atomic/recovery disposable PostgreSQL integration',
  () => {
    it('commits through 0007 and resumes only after 0008 recovery work is complete', async () => {
      const simTime = SimTime.fromTicks('10000');
      const command = parseCanonicalCommand(
        {
          actorId: 'ACTOR_POSTGRES_RECOVERY',
          authSubject: '00000000-0000-4000-8000-000000000001',
          commandId: 'COMMAND_POSTGRES_RECOVERY',
          commandType: 'TEST_POSTGRES_RECOVERY',
          correlationId: 'CORRELATION_POSTGRES_RECOVERY',
          countryId: 'COUNTRY_POSTGRES_RECOVERY',
          expectedWorldVersion: '0',
          idempotencyKey: 'IDEMPOTENCY_POSTGRES_RECOVERY',
          officeId: null,
          payload: { operation: 'POSTGRES_RECOVERY' },
          schemaVersion: COMMAND_SCHEMA_VERSION,
          simTime: simTime.toCanonicalValue(),
          submittedAtReal: AT_0,
          worldId: WORLD,
        },
        sha256Hex,
      );
      const event = parseAuthoritativeEvent(
        {
          causationCommandId: command.commandId,
          correlationId: command.correlationId,
          correctsEventId: null,
          eventId: eventId('EVENT_POSTGRES_RECOVERY'),
          eventType: 'TEST_POSTGRES_RECOVERY_COMMITTED',
          payload: { commandId: command.commandId },
          recordedAtReal: AT_1,
          schemaVersion: EVENT_SCHEMA_VERSION,
          sequence: '1',
          simTime: simTime.toCanonicalValue(),
          worldId: WORLD,
          worldVersion: '1',
        },
        sha256Hex,
      );
      const transition = createAuthoritativeTransition({
        command,
        events: [event],
        worldVersionAfter: '1',
        worldVersionBefore: '0',
      });
      const owner = legalEntityId('ENTITY_POSTGRES_RECOVERY');
      const available = createInventoryAccount({
        worldId: WORLD,
        countryId: countryId('COUNTRY_POSTGRES_RECOVERY'),
        commodityId: commodityId('POSTGRES_GOOD'),
        batchId: inventoryBatchId('POSTGRES_BATCH'),
        unit: 'tonne',
        physicalLocationId: inventoryLocationId('POSTGRES_LOCATION'),
        bucket: 'AVAILABLE',
        reservationId: null,
        shipmentId: null,
        titleHolderId: owner,
        riskBearerId: owner,
        economicRecognitionId: null,
      });
      const reserved = createInventoryAccount({
        ...available,
        bucket: 'RESERVED',
        reservationId: inventoryReservationId('POSTGRES_RESERVATION'),
      });
      const posting = createReservationPosting(
        {
          schemaVersion: INVENTORY_POSTING_SCHEMA_VERSION,
          postingId: inventoryPostingId('POSTING_POSTGRES_RECOVERY'),
          worldId: WORLD,
          causationCommandId: command.commandId,
          causationEventIds: transition.eventIds,
          worldVersionBefore: '0',
          worldVersionAfter: '1',
          simTime,
          command,
          transition,
          quantity: Quantity.from('1', 'tonne'),
          source: available,
          destination: reserved,
        },
        sha256Hex,
      );
      const receipt = createFinalCommandReceipt({
        command,
        outcome: 'COMMITTED',
        reasonCode: null,
        transition,
        simTime,
        recordedAtReal: AT_1,
      });
      const outboxPayload = { commandId: command.commandId };
      const outbox = createOutboxMessage({
        messageId: 'OUTBOX_POSTGRES_RECOVERY',
        worldId: WORLD,
        commandId: command.commandId,
        eventId: event.eventId,
        payload: outboxPayload,
        payloadHash: canonicalSha256(
          canonicalHashInput(outboxPayload),
          sha256Hex,
        ),
        availableAtSimTime: simTime,
      });
      const lease = acquireWorldWriterLease(
        null,
        worldWriterLeaseRequest(WORLD, WORKER, AT_0, AT_60),
      );
      const candidate = prepareAtomicTransitionCandidate({
        command,
        commitAuthorization: null,
        draft: {
          transition,
          inventoryPostings: [posting],
          financialPostingBatches: [],
          receipt,
          outboxMessages: [outbox],
          currentMaterializations: [
            { key: 'POSTGRES_STATE', payload: { worldVersion: '1' } },
          ],
          authorityKind: 'VERSIONED_AUTOMATIC',
          commitAssertion: createWorldWriterCommitAssertion(lease.lease, '0'),
          observedAtReal: AT_1,
        },
        sha256Hex,
      });

      await database.query(
        'insert into world_v2.world_head (world_id) values ($1)',
        [WORLD],
      );
      await database.query(
        'select * from world_v2.acquire_world_writer_lease($1, $2, $3, 60000)',
        [WORLD, WORKER, AT_0],
      );
      await database.query(
        `insert into world_v2.command_submission
           (world_id, command_id, idempotency_key, command_type,
            schema_version, canonical_payload, payload_sha256,
            command_fingerprint, auth_subject, actor_id, country_id,
            office_id, expected_world_version, sim_time, correlation_id,
            submitted_at_real)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
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
      await database.query(
        `insert into world_v2.command_queue
           (world_id, command_id, authority_kind, queue_state, priority_rank,
            available_at_sim_time, attempt_count, claimed_by, claimed_at_real)
         values ($1,$2,'VERSIONED_AUTOMATIC','CLAIMED',0,$3,1,$4,$5)`,
        [WORLD, command.commandId, simTime.toCanonicalValue(), WORKER, AT_0],
      );

      const repository = new AtomicTransitionRepository({
        database: database as SqlDatabase,
        authorizationGuard: serverHeldAuthorizationGuard,
        workerId: WORKER,
        sha256Hex,
      });
      await expect(repository.commit(candidate)).resolves.toMatchObject({
        source: 'NEW_COMMIT',
      });

      const recovery = new WorldRecoveryCoordinator({
        database: database as SqlDatabase,
        workerId: WORKER,
      });
      await expect(recovery.inspect(WORLD, AT_1)).resolves.toMatchObject({
        status: 'RECOVERY_REQUIRED',
        pendingOutboxCount: '1',
      });
      await recovery.recordOutboxAttempt({
        worldId: WORLD,
        messageId: outbox.messageId,
        attemptedAtReal: AT_1,
        delivered: true,
      });
      await expect(recovery.inspect(WORLD, AT_1)).resolves.toMatchObject({
        status: 'READY',
        pendingOutboxCount: '0',
      });
    }, 30_000);
  },
);
