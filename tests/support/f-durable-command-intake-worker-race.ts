import { expect } from 'vitest';
import {
  EVENT_SCHEMA_VERSION,
  INVENTORY_POSTING_SCHEMA_VERSION,
  Quantity,
  acquireWorldWriterLease,
  canonicalHashInput,
  canonicalSha256,
  createAuthoritativeTransition,
  createFinalCommandReceipt,
  createInventoryAccount,
  createOutboxMessage,
  createReservationPosting,
  createWorldWriterCommitAssertion,
  inventoryPostingId,
  inventoryReservationId,
  parseAuthoritativeEvent,
  workerId,
  worldWriterLeaseRequest,
  type CanonicalCommand,
  type InventoryAccount,
  type Sha256Hex,
} from '@econmind/core';
import { createAuthoritativeWorkerExecution } from '../../apps/world-worker/src/authoritative-execution.js';
import type { AtomicTransitionDraft } from '../../apps/world-worker/src/persistence/atomic-transition-repository.js';
import { NarrowTransferApprovalStore } from '../../apps/world-worker/src/persistence/narrow-transfer-approval-store.js';
import {
  PostgresNarrowTransferIntake,
  type NarrowTransferIntakeInput,
} from '../../apps/world-worker/src/intake/postgres-narrow-transfer-intake.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';

const WORKER = workerId('WORKER_F_LOCK_RACE');
const AT = '2026-09-27T00:00:00.000Z';
const EXPIRES = '2026-09-27T00:10:00.000Z';

function barrier() {
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { ready, release };
}

async function bounded<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('F_LOCK_RACE_BARRIER_TIMEOUT')),
          5_000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Synthetic reservation candidate for lock-order regression, not a lifecycle acceptance fixture. */
function reservationDraft(input: {
  command: CanonicalCommand;
  source: InventoryAccount;
  sha256Hex: Sha256Hex;
  observedAtReal: string;
}): AtomicTransitionDraft {
  const { command, sha256Hex, observedAtReal } = input;
  const event = parseAuthoritativeEvent(
    {
      schemaVersion: EVENT_SCHEMA_VERSION,
      eventId: 'EVENT_F_LOCK_RACE',
      causationCommandId: command.commandId,
      correlationId: command.correlationId,
      correctsEventId: null,
      eventType: 'TEST_RESERVATION_LOCK_RACE',
      payload: { quantityTonnes: '2' },
      sequence: '1',
      worldId: command.worldId,
      worldVersion: '1',
      simTime: command.simTime.toCanonicalValue(),
      recordedAtReal: observedAtReal,
    },
    sha256Hex,
  );
  const transition = createAuthoritativeTransition({
    command,
    worldVersionBefore: '0',
    worldVersionAfter: '1',
    events: [event],
  });
  const source = createInventoryAccount({
    ...input.source,
    worldId: command.worldId,
  });
  const destination = createInventoryAccount({
    ...source,
    bucket: 'RESERVED',
    reservationId: inventoryReservationId('RESERVATION_F_LOCK_RACE'),
  });
  const posting = createReservationPosting(
    {
      schemaVersion: INVENTORY_POSTING_SCHEMA_VERSION,
      postingId: inventoryPostingId('POSTING_F_LOCK_RACE'),
      worldId: command.worldId,
      causationCommandId: command.commandId,
      causationEventIds: transition.eventIds,
      worldVersionBefore: '0',
      worldVersionAfter: '1',
      simTime: command.simTime,
      command,
      transition,
      quantity: Quantity.from('2', 'tonne'),
      source,
      destination,
    },
    sha256Hex,
  );
  const lease = acquireWorldWriterLease(
    null,
    worldWriterLeaseRequest(command.worldId, WORKER, AT, EXPIRES),
  ).lease;
  const payload = { commandId: command.commandId, kind: 'TEST_LOCK_RACE' };
  return {
    transition,
    inventoryPostings: [posting],
    financialPostingBatches: [],
    receipt: createFinalCommandReceipt({
      command,
      outcome: 'COMMITTED',
      reasonCode: null,
      transition,
      simTime: command.simTime,
      recordedAtReal: observedAtReal,
    }),
    outboxMessages: [
      createOutboxMessage({
        messageId: 'OUTBOX_F_LOCK_RACE',
        worldId: command.worldId,
        commandId: command.commandId,
        eventId: event.eventId,
        payload,
        payloadHash: canonicalSha256(canonicalHashInput(payload), sha256Hex),
        availableAtSimTime: command.simTime,
      }),
    ],
    currentMaterializations: [],
    authorityKind: 'DISCRETIONARY_USER',
    commitAssertion: createWorldWriterCommitAssertion(lease, '0'),
    observedAtReal,
  };
}

/**
 * Two real PG transactions. Pause actual Worker commit after its submission
 * lock, issue intake's submission query, then let the Worker acquire lease/head.
 * SQL errors are observed before the intake recovery layer can hide a deadlock.
 */
export async function assertIntakeWorkerLockRace(input: {
  database: SqlDatabase;
  intakeInput: NarrowTransferIntakeInput;
  source: InventoryAccount;
  sha256Hex: Sha256Hex;
  method: 'read' | 'submitPending' | 'enqueueApproved';
}): Promise<void> {
  const { database, intakeInput, sha256Hex } = input;
  const command = intakeInput.command;
  await database.query(
    `select * from world_v2.acquire_world_writer_lease($1, $2, $3::timestamptz, 600000::bigint)`,
    [command.worldId, WORKER, AT],
  );
  await database.query(
    `update world_v2.command_queue set queue_state = 'CLAIMED', claimed_by = $2,
    claimed_at_real = $3::timestamptz, claim_fencing_token = 1, attempt_count = 1
    where world_id = $1 and command_id = $4`,
    [command.worldId, WORKER, intakeInput.observedAtReal, command.commandId],
  );

  const workerLocked = barrier();
  const resumeWorker = barrier();
  const intakeSubmissionRequested = barrier();
  const errors: unknown[] = [];
  const backendPids = new Set<number>();
  let pausedWorker = false;
  function observedDatabase(role: 'WORKER' | 'INTAKE'): SqlDatabase {
    return {
      query: (sql, params) => database.query(sql, params),
      transaction: (operation) =>
        database.transaction(async (transaction) => {
          const pid = await transaction.query<{ pid: number }>(
            'select pg_backend_pid() as pid',
          );
          backendPids.add(pid.rows[0]!.pid);
          const observed: SqlExecutor = {
            async query<Row extends object>(
              sql: string,
              params?: readonly unknown[],
            ) {
              const submissionLock =
                sql.includes('from world_v2.command_submission') &&
                /for update/iu.test(sql);
              if (role === 'INTAKE' && submissionLock)
                intakeSubmissionRequested.release();
              try {
                const result = await transaction.query<Row>(sql, params);
                if (role === 'WORKER' && submissionLock && !pausedWorker) {
                  pausedWorker = true;
                  workerLocked.release();
                  await bounded(resumeWorker.ready);
                }
                return result;
              } catch (error) {
                errors.push(error);
                throw error;
              }
            },
          };
          return operation(observed);
        }),
    };
  }
  const worker = createAuthoritativeWorkerExecution({
    database: observedDatabase('WORKER'),
    workerId: WORKER,
    sha256Hex,
    narrowTransferApprovalGuard: new NarrowTransferApprovalStore({
      database,
      sha256Hex,
    }),
    candidateFactory: {
      prepare: async () =>
        reservationDraft({
          command,
          source: input.source,
          sha256Hex,
          observedAtReal: intakeInput.observedAtReal,
        }),
    },
  });
  const workInput = {
    command,
    authorityKind: 'DISCRETIONARY_USER' as const,
    commitSimTime: command.simTime,
    recordedAtReal: intakeInput.observedAtReal,
    requiredCapability: 'TRADE_CONTRACTS' as const,
    intakeAuthorization: intakeInput.scope.authorization,
  };
  // Attach error handlers immediately so a failed negative control cannot leak
  // unhandled rejections or strand either connection behind a test barrier.
  const committed = worker.executeQueuedCommand(workInput).then(
    (result) => ({ result, error: null }),
    (error: unknown) => ({ result: null, error }),
  );
  let inspected: ReturnType<PostgresNarrowTransferIntake['read']> | undefined;
  try {
    await bounded(workerLocked.ready);
    const adapter = new PostgresNarrowTransferIntake({
      database: observedDatabase('INTAKE'),
      sha256Hex,
    });
    inspected = adapter[input.method](intakeInput);
    await bounded(intakeSubmissionRequested.ready);
    resumeWorker.release();
    const [commit, state] = await bounded(Promise.all([committed, inspected]));
    expect(
      errors,
      'no deadlock, lock timeout or other SQL error may be swallowed',
    ).toEqual([]);
    expect(backendPids.size).toBe(2);
    expect(commit.error).toBeNull();
    expect(commit.result).toMatchObject({
      source: 'NEW_FINAL',
      receipt: { outcome: 'COMMITTED', worldVersionAfter: '1' },
    });
    expect(state).toMatchObject({
      status: 'FINAL',
      receipt: commit.result?.receipt,
    });
    expect(await worker.executeQueuedCommand(workInput)).toMatchObject({
      source: 'EXISTING_FINAL',
      receipt: commit.result?.receipt,
    });
    const durable = await database.query(
      `select world_version::text as version,
        (select count(*)::text from world_v2.command_queue where world_id = $1) as queues,
        (select count(*)::text from world_v2.authoritative_event where world_id = $1) as events,
        (select count(*)::text from world_v2.inventory_posting where world_id = $1) as inventory,
        (select count(*)::text from world_v2.financial_posting_batch where world_id = $1) as financial,
        (select count(*)::text from world_v2.command_receipt where world_id = $1) as receipts,
        (select count(*)::text from world_v2.notification_outbox where world_id = $1) as outbox
       from world_v2.world_head where world_id = $1`,
      [command.worldId],
    );
    expect(durable.rows).toEqual([
      {
        version: '1',
        queues: '1',
        events: '1',
        inventory: '1',
        financial: '0',
        receipts: '1',
        outbox: '1',
      },
    ]);
  } finally {
    resumeWorker.release();
    await Promise.allSettled([
      committed,
      ...(inspected === undefined ? [] : [inspected]),
    ]);
  }
}
