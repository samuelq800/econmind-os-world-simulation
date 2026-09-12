// PREPARATION_ONLY_NOT_V09_3_STARTED: local recovery behavior only.

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  acquireWorldWriterLease,
  createWorldWriterCommitAssertion,
  workerId,
  worldId,
  worldWriterLeaseRequest,
} from '../../apps/world-worker/node_modules/@econmind/core/dist/index.js';
import type { SqlDatabase } from '../../apps/world-worker/src/persistence/sql-database.js';
import { WorldRecoveryCoordinator } from '../../apps/world-worker/src/recovery/world-recovery.js';
import { createPGliteV09AtomicTestDatabase } from '../support/v09-atomic-database.js';
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

const WORLD = worldId('WORLD_RECOVERY_TEST');
const OLD_WORKER = workerId('WORKER_OLD');
const NEW_WORKER = workerId('WORKER_RECOVERY');
const AT_0 = '2026-09-12T00:00:00.000Z';
const AT_1 = '2026-09-12T00:00:01.000Z';
const AT_1_5 = '2026-09-12T00:00:01.500Z';
const AT_60 = '2026-09-12T00:01:00.000Z';

const databases: V09AtomicTestDatabase[] = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.close()));
});

async function testDatabase(): Promise<V09AtomicTestDatabase> {
  const database = createPGliteV09AtomicTestDatabase();
  databases.push(database);
  for (const migration of migrations) {
    await database.executeScript(
      await readFile(
        path.join(root, 'database/migrations/artifacts', migration),
        'utf8',
      ),
    );
  }
  await database.query(
    'insert into world_v2.world_head (world_id) values ($1)',
    [WORLD],
  );
  return database;
}

function hash(character: string): string {
  return `sha256:${character.repeat(64)}`;
}

async function insertCommand(
  database: V09AtomicTestDatabase,
  version: number,
  queueState: 'CLAIMED' | 'FINALIZED',
  claimedBy: string | null = null,
): Promise<void> {
  const commandId = `COMMAND_RECOVERY_${version}`;
  await database.query(
    `insert into world_v2.command_submission
       (world_id, command_id, idempotency_key, command_type, schema_version,
        canonical_payload, payload_sha256, command_fingerprint, auth_subject,
        actor_id, country_id, office_id, expected_world_version, sim_time,
        correlation_id, submitted_at_real)
     values ($1, $2, $3, 'RECOVERY_TEST', 'command-v1', '{}', $4, $5,
             '00000000-0000-4000-8000-000000000001', 'ACTOR_RECOVERY',
             'COUNTRY_RECOVERY', null, $6, $7, $8, $9)`,
    [
      WORLD,
      commandId,
      `IDEMPOTENCY_RECOVERY_${version}`,
      hash(version % 2 === 0 ? 'a' : 'b'),
      hash(version % 2 === 0 ? 'c' : 'd'),
      String(version - 1),
      String(version * 10_000),
      `CORRELATION_RECOVERY_${version}`,
      AT_0,
    ],
  );
  await database.query(
    `insert into world_v2.command_queue
       (world_id, command_id, authority_kind, queue_state, priority_rank,
        available_at_sim_time, attempt_count, claimed_by, claimed_at_real,
        finalized_at_real)
     values ($1, $2, 'VERSIONED_AUTOMATIC', $3, 0, $4, 1, $5, $6, $7)`,
    [
      WORLD,
      commandId,
      queueState,
      String(version * 10_000),
      queueState === 'CLAIMED' ? claimedBy : null,
      queueState === 'CLAIMED' ? AT_0 : null,
      queueState === 'FINALIZED' ? AT_1 : null,
    ],
  );
}

async function insertCommittedTransition(
  database: V09AtomicTestDatabase,
  version: number,
): Promise<void> {
  await insertCommand(database, version, 'FINALIZED');
  const commandId = `COMMAND_RECOVERY_${version}`;
  const eventId = `EVENT_RECOVERY_${version}`;
  await database.query(
    `insert into world_v2.authoritative_event
       (world_id, event_id, event_sequence, world_version,
        causation_command_id, correlation_id, event_type, schema_version,
        canonical_payload, payload_sha256, event_fingerprint, sim_time,
        recorded_at_real, corrects_event_id)
     values ($1, $2, $3, $3, $4, $5, 'RECOVERY_COMMITTED', 'event-v1',
             '{}', $6, $7, $8, $9, null)`,
    [
      WORLD,
      eventId,
      String(version),
      commandId,
      `CORRELATION_RECOVERY_${version}`,
      hash(version % 2 === 0 ? 'e' : 'f'),
      hash(version % 2 === 0 ? '1' : '2'),
      String(version * 10_000),
      AT_1,
    ],
  );
  await database.query(
    `insert into world_v2.command_receipt
       (world_id, command_id, idempotency_key, schema_version,
        command_fingerprint, outcome, reason_code, transition_id,
        world_version_before, world_version_after, sim_time, event_ids,
        recorded_at_real)
     select world_id, command_id, idempotency_key, 'command-receipt-v2',
            command_fingerprint, 'COMMITTED', null, command_id, $3, $4, $5,
            jsonb_build_array($2::text), $6
       from world_v2.command_submission
      where world_id = $1 and command_id = $7`,
    [
      WORLD,
      eventId,
      String(version - 1),
      String(version),
      String(version * 10_000),
      AT_1,
      commandId,
    ],
  );
  await database.query(
    `update world_v2.world_head
        set world_version = $2, event_sequence = $2
      where world_id = $1`,
    [WORLD, String(version)],
  );
}

async function insertOutbox(database: V09AtomicTestDatabase): Promise<void> {
  await database.query(
    `insert into world_v2.notification_outbox
       (world_id, outbox_message_id, command_id, event_id, schema_version,
        canonical_payload, payload_sha256, available_at_sim_time,
        delivery_state, attempt_count)
     values ($1, 'OUTBOX_RECOVERY_1', 'COMMAND_RECOVERY_1',
             'EVENT_RECOVERY_1', 'outbox-v1', '{}', $2, 10000,
             'PENDING', 0)`,
    [WORLD, hash('9')],
  );
}

function coordinator(database: V09AtomicTestDatabase, worker = NEW_WORKER) {
  return new WorldRecoveryCoordinator({
    database: database as SqlDatabase,
    workerId: worker,
  });
}

describe('V09.3 World recovery preparation', () => {
  it('reconciles durable lineage and keeps outbox recovery independent', async () => {
    const database = await testDatabase();
    await insertCommittedTransition(database, 1);
    await insertOutbox(database);
    const recovery = coordinator(database);

    await expect(recovery.inspect(WORLD, AT_1)).resolves.toMatchObject({
      status: 'RECOVERY_REQUIRED',
      pendingOutboxCount: '1',
      worldVersion: '1',
    });
    await expect(
      recovery.recordOutboxAttempt({
        worldId: WORLD,
        messageId: 'OUTBOX_RECOVERY_1',
        attemptedAtReal: AT_1,
        delivered: false,
      }),
    ).resolves.toEqual({ disposition: 'RETRY_PENDING', attemptCount: '1' });
    await expect(
      recovery.recordOutboxAttempt({
        worldId: WORLD,
        messageId: 'OUTBOX_RECOVERY_1',
        attemptedAtReal: AT_1_5,
        delivered: true,
      }),
    ).resolves.toEqual({ disposition: 'DELIVERED', attemptCount: '2' });
    await expect(recovery.inspect(WORLD, AT_1_5)).resolves.toMatchObject({
      status: 'READY',
      pendingOutboxCount: '0',
    });
  }, 20_000);

  it('reclaims an abandoned command only under the later lease generation', async () => {
    const database = await testDatabase();
    await insertCommand(database, 1, 'CLAIMED', OLD_WORKER);
    await database.query(
      'select * from world_v2.acquire_world_writer_lease($1, $2, $3, 1000)',
      [WORLD, OLD_WORKER, AT_0],
    );
    await database.query(
      'select * from world_v2.acquire_world_writer_lease($1, $2, $3, 60000)',
      [WORLD, NEW_WORKER, AT_1],
    );
    const old = acquireWorldWriterLease(
      null,
      worldWriterLeaseRequest(WORLD, OLD_WORKER, AT_0, AT_1),
    );
    const takeover = acquireWorldWriterLease(
      old.lease,
      worldWriterLeaseRequest(WORLD, NEW_WORKER, AT_1, AT_60),
    );
    const assertion = createWorldWriterCommitAssertion(takeover.lease, '0');

    await coordinator(database).reclaimAbandonedCommand({
      assertion,
      commandId: 'COMMAND_RECOVERY_1',
      observedAtReal: AT_1_5,
    });
    await expect(
      database.query(
        `select queue_state, claimed_by, attempt_count::text as attempt_count
           from world_v2.command_queue`,
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          queue_state: 'CLAIMED',
          claimed_by: NEW_WORKER,
          attempt_count: '2',
        },
      ],
    });
  }, 20_000);

  it('rebuilds replaceable materializations atomically at the locked head', async () => {
    const database = await testDatabase();
    await insertCommittedTransition(database, 1);
    await insertCommittedTransition(database, 2);
    await database.query(
      `insert into world_v2.current_materialization
         (world_id, materialization_key, world_version, source_command_id,
          canonical_payload, payload_sha256)
       values ($1, 'RECOVERY_VIEW', 1, 'COMMAND_RECOVERY_1', '{"stale":true}', $2)`,
      [WORLD, hash('8')],
    );
    await database.query(
      'select * from world_v2.acquire_world_writer_lease($1, $2, $3, 60000)',
      [WORLD, NEW_WORKER, AT_0],
    );
    const lease = acquireWorldWriterLease(
      null,
      worldWriterLeaseRequest(WORLD, NEW_WORKER, AT_0, AT_60),
    );
    const assertion = createWorldWriterCommitAssertion(lease.lease, '2');

    await expect(
      coordinator(database).rebuildCurrentMaterializations({
        assertion,
        observedAtReal: AT_1,
        rebuilder: {
          async rebuild(transaction, watermark) {
            expect(watermark).toMatchObject({
              worldVersion: '2',
              eventSequence: '2',
            });
            await transaction.query(
              `insert into world_v2.current_materialization
                 (world_id, materialization_key, world_version,
                  source_command_id, canonical_payload, payload_sha256)
               values ($1, 'RECOVERY_VIEW', $2, 'COMMAND_RECOVERY_2',
                       '{"rebuilt":true}', $3)`,
              [WORLD, watermark.worldVersion, hash('7')],
            );
            return 1;
          },
        },
      }),
    ).resolves.toBe(1);
    await expect(
      database.query(
        'select world_version::text as world_version, canonical_payload from world_v2.current_materialization',
      ),
    ).resolves.toMatchObject({
      rows: [{ world_version: '2', canonical_payload: '{"rebuilt":true}' }],
    });
  }, 20_000);

  it('rejects a head that cannot be reproduced from Events and receipts', async () => {
    const database = await testDatabase();
    await database.query(
      'update world_v2.world_head set world_version = 1, event_sequence = 1 where world_id = $1',
      [WORLD],
    );

    await expect(coordinator(database).inspect(WORLD, AT_1)).rejects.toEqual(
      expect.objectContaining({
        cause: expect.objectContaining({
          message:
            'World head, Event, Posting, receipt, queue or materialization lineage is inconsistent',
        }),
      }),
    );
  }, 20_000);
});
