import {
  DOMAIN_ERROR_CODES,
  DomainError,
  SimTime,
  canonicalSerialize,
  parseWorldWriterLease,
  workerId,
  worldId,
  type CanonicalCommand,
  type DomainErrorCode,
  type FinalCommandReceipt,
  type Sha256Hex,
} from '@econmind/core';

import { createAuthoritativeWorkerExecution } from '../authoritative-execution.js';
import { DurableV08LedgerLineageReader } from '../persistence/durable-v08-ledger-lineage-reader.js';
import { PostgresTransactionError } from '../persistence/postgres-sql-database.js';
import { createSqlNarrowTreasuryGcuDeliveryCandidateFactory } from '../persistence/sql-narrow-treasury-gcu-delivery-preparation-source.js';
import type { SqlDatabase, SqlExecutor } from '../persistence/sql-database.js';
import { createLocalNarrowReservationWorker } from './local-narrow-reservation-worker.js';

export const DURABLE_COMMAND_CONSUMPTION_STATUS =
  'PREPARATION_ONLY_NOT_RUNTIME_ACCEPTANCE' as const;

export type DurableConsumptionLifecycle =
  'PREPARED' | 'READY' | 'STOPPING' | 'STOPPED' | 'FAULTED';

/** Same server-owned clock port used by the existing Reservation Worker. */
export type DurableConsumptionClock = Parameters<
  typeof createLocalNarrowReservationWorker
>[0]['clock'];

export type DurableConsumptionStep =
  | Readonly<{ status: 'IDLE' }>
  | Readonly<{
      status: 'BLOCKED';
      reason: string;
      commandId: string | null;
      domainCode?: DomainErrorCode;
      detail?: string;
    }>
  | Readonly<{
      status: 'PROCESSED';
      commandId: string;
      source: 'NEW_FINAL' | 'EXISTING_FINAL';
      receipt: FinalCommandReceipt;
    }>
  | Readonly<{
      status: 'FAILED';
      reason: 'OPERATIONAL_FAILURE_REQUIRES_RECOVERY';
      commandId: string | null;
    }>;

interface QueueRow {
  readonly command_id: string;
  readonly authority_kind: string;
  readonly queue_state: string;
  readonly available_at_sim_time: string;
  readonly claimed_by: string | null;
  readonly claim_fencing_token: string | null;
}

interface LeaseRow {
  readonly world_id: string;
  readonly holder_id: string;
  readonly fencing_token: string;
  readonly acquired_at_real: Date | string;
  readonly renewed_at_real: Date | string;
  readonly lease_expires_at_real: Date | string;
}

function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    message,
  );
}

function timestamp(value: Date | string): string {
  const text = value instanceof Date ? value.toISOString() : value;
  if (
    typeof text !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(text) ||
    !Number.isFinite(Date.parse(text)) ||
    new Date(text).toISOString() !== text
  )
    invalid('Worker requires canonical server-held real time');
  return text;
}

function blocked(
  reason: string,
  commandId: string | null = null,
): DurableConsumptionStep {
  return Object.freeze({ status: 'BLOCKED', reason, commandId });
}

function domainFailure(error: unknown): DomainError | null {
  if (error instanceof DomainError) return error;
  // Only a confirmed rollback can expose a semantic denial safely. An unknown
  // COMMIT/rollback outcome is operational, even if its cause is a DomainError.
  if (
    error instanceof PostgresTransactionError &&
    error.outcome === 'ROLLED_BACK' &&
    error.cause instanceof DomainError
  )
    return error.cause;
  return null;
}

/**
 * Worker-only, non-activated composition. No HTTP body, economic callback,
 * supplied command/ledger, polling loop, lease takeover or clock advancement.
 * The host must bind an admitted server clock and existing SQL database.
 */
export function createDurableCommandConsumptionPreparation(input: {
  readonly database: SqlDatabase;
  readonly environment: NodeJS.ProcessEnv;
  readonly workerId: string;
  readonly worldId: string;
  readonly sha256Hex: Sha256Hex;
  readonly clock: DurableConsumptionClock | null;
}) {
  if (!['local', 'ci'].includes(input.environment.ECONMIND_ENV ?? '')) {
    invalid('Durable command preparation is local/CI only');
  }
  for (const [name, value] of Object.entries(input.environment)) {
    if (
      value &&
      (/^(?:VITE_)?SUPABASE_/u.test(name) ||
        name === 'WORLD_DATABASE_URL' ||
        name === 'DATABASE_URL')
    ) {
      invalid(
        'Production connection configuration is forbidden in preparation',
      );
    }
  }
  const world = worldId(input.worldId);
  const holder = workerId(input.workerId);
  const clock = input.clock;
  const lineage = new DurableV08LedgerLineageReader(input);
  const delivery = createAuthoritativeWorkerExecution({
    database: input.database,
    workerId: holder,
    sha256Hex: input.sha256Hex,
    candidateFactory: createSqlNarrowTreasuryGcuDeliveryCandidateFactory({
      database: input.database,
      workerId: holder,
      sha256Hex: input.sha256Hex,
    }),
  });
  const reservation =
    clock === null
      ? null
      : createLocalNarrowReservationWorker({
          ...input,
          workerId: holder,
          clock,
        });
  let lifecycle: DurableConsumptionLifecycle = 'PREPARED';
  let active: Promise<DurableConsumptionStep> | null = null;
  let stopping: Promise<void> | null = null;

  async function leaseFrom(transaction: SqlExecutor, at: string) {
    const result = await transaction.query<LeaseRow>(
      `select world_id, holder_id, fencing_token::text,
              acquired_at_real, renewed_at_real, lease_expires_at_real
         from world_v2.world_writer_lease
        where world_id=$1 and holder_id=$2 and lease_expires_at_real>$3::timestamptz
        for share`,
      [world, holder, at],
    );
    const row = result.rows[0];
    if (!row || result.rows.length !== 1)
      invalid(
        'Existing active writer lease is required; no acquisition fallback',
      );
    return parseWorldWriterLease({
      schemaVersion: 'world-writer-lease-v1',
      worldId: row.world_id,
      holderId: row.holder_id,
      fencingToken: row.fencing_token,
      acquiredAtReal: timestamp(row.acquired_at_real),
      renewedAtReal: timestamp(row.renewed_at_real),
      expiresAtReal: timestamp(row.lease_expires_at_real),
    });
  }

  async function checkSource(
    transaction: SqlExecutor,
    command: CanonicalCommand,
    at: string,
  ) {
    const lease = await leaseFrom(transaction, at);
    if (
      lease.worldId !== world ||
      lease.holderId !== holder ||
      lease.expiresAtReal <= at
    )
      invalid('Active lease does not bind this Worker and World');
    const snapshot = await lineage.rebuildFrom(transaction, world);
    if (command.expectedWorldVersion !== snapshot.headWorldVersion) {
      throw new DomainError(
        DOMAIN_ERROR_CODES.VERSION_MISMATCH,
        'Queued Command expected WorldVersion is stale',
      );
    }
    return lease;
  }

  async function claimDelivery(
    command: CanonicalCommand,
    at: string,
    simTime: SimTime,
  ) {
    await input.database.transaction(async (transaction) => {
      // Follow atomic/intake submission-before-lease/head lock order. Never
      // take the queue lock in the selector and then wait for a submission.
      await transaction.query(
        'select command_id from world_v2.command_submission where world_id=$1 and command_id=$2 for update',
        [world, command.commandId],
      );
      const durable = await lineage.readCommandFrom(
        transaction,
        world,
        command.commandId,
      );
      if (canonicalSerialize(durable) !== canonicalSerialize(command))
        invalid('Delivery differs from durable canonical Command');
      const lease = await checkSource(transaction, durable, at);
      const queue = await transaction.query<QueueRow>(
        `select command_id, authority_kind, queue_state, available_at_sim_time::text,
                claimed_by, claim_fencing_token::text
           from world_v2.command_queue where world_id=$1 and command_id=$2 for update`,
        [world, command.commandId],
      );
      const row = queue.rows[0];
      if (
        !row ||
        queue.rows.length !== 1 ||
        row.authority_kind !== 'VERSIONED_AUTOMATIC' ||
        SimTime.fromTicks(row.available_at_sim_time).ticks > simTime.ticks
      )
        invalid('Delivery is not an automatic due durable queue member');
      if (row.queue_state === 'CLAIMED') {
        if (
          row.claimed_by !== holder ||
          row.claim_fencing_token !== lease.fencingToken
        )
          invalid(
            'Claim belongs to another holder/fence; reviewed recovery is required',
          );
        return;
      }
      if (row.queue_state !== 'PENDING')
        invalid('Delivery queue is not executable');
      const updated = await transaction.query(
        `update world_v2.command_queue
            set queue_state='CLAIMED', claimed_by=$3, claimed_at_real=$4::timestamptz,
                claim_fencing_token=$5::bigint, attempt_count=attempt_count+1
          where world_id=$1 and command_id=$2 and queue_state='PENDING'`,
        [world, command.commandId, holder, at, lease.fencingToken],
      );
      if (updated.rowCount !== 1)
        invalid('Delivery claim must update exactly one durable row');
    });
  }

  async function step(): Promise<DurableConsumptionStep> {
    if (clock === null) return blocked('SERVER_CLOCK_NOT_BOUND');
    let selectedId: string | null = null;
    try {
      const at = timestamp(clock.nowReal());
      const simTime = SimTime.fromTicks(await clock.simTime(world));
      const selected = await input.database.transaction(async (transaction) => {
        const queue = await transaction.query<QueueRow>(
          `select command_id, authority_kind, queue_state, available_at_sim_time::text,
                  claimed_by, claim_fencing_token::text
             from world_v2.command_queue
            where world_id=$1 and queue_state in ('PENDING','CLAIMED')
              and available_at_sim_time <= $2::bigint
            order by available_at_sim_time, priority_rank, command_id limit 1`,
          [world, simTime.toCanonicalValue()],
        );
        const row = queue.rows[0];
        if (!row) return null;
        if (queue.rows.length !== 1)
          invalid('Bounded selector returned multiple Commands');
        selectedId = row.command_id;
        const command = await lineage.readCommandFrom(
          transaction,
          world,
          row.command_id,
        );
        if (command.worldId !== world || command.commandId !== row.command_id)
          invalid('Queue and canonical Command identity differ');
        return { command, row };
      });
      if (selected === null) return Object.freeze({ status: 'IDLE' });
      const { command, row } = selected;
      if (command.commandType === 'CORE_GOODS_SHIPMENT_V1')
        return blocked(
          'MISSING_SQL_SHIP_PREPARATION_SOURCE',
          command.commandId,
        );
      if (
        command.commandType !== 'CORE_GOODS_TRANSFER_V1' &&
        command.commandType !== 'CORE_GOODS_DELIVERY_V1'
      )
        return blocked('UNSUPPORTED_COMMAND', command.commandId);
      const isReserve = command.commandType === 'CORE_GOODS_TRANSFER_V1';
      if (
        row.authority_kind !==
          (isReserve ? 'DISCRETIONARY_USER' : 'VERSIONED_AUTOMATIC') ||
        (!isReserve && command.officeId !== null) ||
        command.expectedWorldVersion === null
      )
        return blocked('COMMAND_QUEUE_AUTHORITY_MISMATCH', command.commandId);
      if (
        SimTime.fromTicks(row.available_at_sim_time).ticks > simTime.ticks ||
        command.simTime.ticks > simTime.ticks
      )
        return blocked('COMMAND_NOT_DUE', command.commandId);
      if (row.queue_state === 'CLAIMED' && row.claimed_by !== holder)
        return blocked('CLAIM_REQUIRES_REVIEWED_RECOVERY', command.commandId);
      if (isReserve) {
        await input.database.transaction((transaction) =>
          checkSource(transaction, command, at),
        );
        const result = await reservation!.execute({
          worldId: world,
          commandId: command.commandId,
        });
        return Object.freeze({
          status: 'PROCESSED',
          commandId: command.commandId,
          source: result.source,
          receipt: result.receipt,
        });
      }
      await claimDelivery(command, at, simTime);
      const result = await delivery.executeQueuedCommand({
        command,
        authorityKind: 'VERSIONED_AUTOMATIC',
        commitSimTime: simTime,
        recordedAtReal: timestamp(clock.nowReal()),
      });
      return Object.freeze({
        status: 'PROCESSED',
        commandId: command.commandId,
        source: result.source,
        receipt: result.receipt,
      });
    } catch (error) {
      const semantic = domainFailure(error);
      if (semantic)
        return Object.freeze({
          status: 'BLOCKED',
          reason: 'DURABLE_PRIMITIVE_REJECTED',
          commandId: selectedId,
          domainCode: semantic.code,
          detail: semantic.message,
        });
      if (lifecycle !== 'STOPPING') lifecycle = 'FAULTED';
      return Object.freeze({
        status: 'FAILED',
        reason: 'OPERATIONAL_FAILURE_REQUIRES_RECOVERY',
        commandId: selectedId,
      });
    }
  }

  return Object.freeze({
    preparationStatus: DURABLE_COMMAND_CONSUMPTION_STATUS,
    state: () => lifecycle,
    startPreparation(): void {
      if (lifecycle !== 'PREPARED')
        invalid('Only a prepared instance may become ready');
      lifecycle = 'READY';
    },
    consumeOnce(): Promise<DurableConsumptionStep> {
      if (lifecycle !== 'READY')
        return Promise.resolve(blocked(`LIFECYCLE_${lifecycle}`));
      if (active !== null)
        return Promise.resolve(blocked('STEP_ALREADY_RUNNING'));
      const running = step();
      active = running;
      void running.finally(() => {
        if (active === running) active = null;
      });
      return running;
    },
    stop(): Promise<void> {
      if (stopping !== null) return stopping;
      lifecycle = 'STOPPING';
      stopping = (async () => {
        await active;
        lifecycle = 'STOPPED';
      })();
      return stopping;
    },
  });
}
