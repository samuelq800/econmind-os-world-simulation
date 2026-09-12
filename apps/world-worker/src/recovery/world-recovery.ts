import {
  DOMAIN_ERROR_CODES,
  DomainError,
  workerId,
  worldId,
  type WorldWriterCommitAssertion,
} from '@econmind/core';

import type { SqlDatabase, SqlExecutor } from '../persistence/sql-database.js';

const NON_NEGATIVE_INTEGER = /^(?:0|[1-9]\d*)$/u;
const RFC3339_MILLISECONDS =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;

function recoveryInvalid(message: string): never {
  throw new DomainError(DOMAIN_ERROR_CODES.RECONCILIATION_MISMATCH, message);
}

function integer(value: unknown, label: string): string {
  const rendered =
    typeof value === 'number' || typeof value === 'bigint'
      ? String(value)
      : value;
  if (typeof rendered !== 'string' || !NON_NEGATIVE_INTEGER.test(rendered)) {
    recoveryInvalid(`${label} must be a canonical non-negative integer`);
  }
  return rendered;
}

function timestamp(value: string, label: string): string {
  if (!RFC3339_MILLISECONDS.test(value)) {
    recoveryInvalid(`${label} must be canonical RFC3339 milliseconds`);
  }
  return value;
}

interface RecoveryInspectionRow {
  readonly committed_count: unknown;
  readonly committed_unfinalized_count: unknown;
  readonly event_max_sequence: unknown;
  readonly event_max_world_version: unknown;
  readonly event_sequence: unknown;
  readonly finalized_without_receipt_count: unknown;
  readonly materialization_ahead_count: unknown;
  readonly pending_outbox_count: unknown;
  readonly posting_ahead_count: unknown;
  readonly receipt_max_world_version: unknown;
  readonly stale_claim_count: unknown;
  readonly stale_materialization_count: unknown;
  readonly world_version: unknown;
}

export interface WorldRecoveryInspection {
  readonly status: 'READY' | 'RECOVERY_REQUIRED';
  readonly worldId: string;
  readonly worldVersion: string;
  readonly eventSequence: string;
  readonly pendingOutboxCount: string;
  readonly staleClaimCount: string;
  readonly staleMaterializationCount: string;
}

interface LockedClaimRow {
  readonly acquired_at_real: unknown;
  readonly attempt_count: unknown;
  readonly claimed_at_real: unknown;
  readonly claimed_by: unknown;
  readonly holder_id: unknown;
  readonly queue_state: unknown;
}

interface OutboxRow {
  readonly attempt_count: unknown;
  readonly delivery_state: unknown;
}

interface HeadRow {
  readonly event_sequence: unknown;
  readonly world_version: unknown;
}

export interface RecoveryProjectionRebuilder {
  rebuild(
    transaction: SqlExecutor,
    watermark: Readonly<{
      worldId: string;
      worldVersion: string;
      eventSequence: string;
    }>,
  ): Promise<number>;
}

export type OutboxAttemptResult = Readonly<{
  disposition: 'ALREADY_DELIVERED' | 'DELIVERED' | 'RETRY_PENDING';
  attemptCount: string;
}>;

/**
 * Coordinates recovery using durable World facts only. Process memory,
 * projections and caches can trigger repair, but never determine economic
 * truth or advance WorldVersion.
 */
export class WorldRecoveryCoordinator {
  readonly #database: SqlDatabase;
  readonly #workerId: string;

  constructor(input: {
    readonly database: SqlDatabase;
    readonly workerId: string;
  }) {
    this.#database = input.database;
    this.#workerId = workerId(input.workerId);
  }

  async inspect(
    requestedWorldId: string,
    observedAtReal: string,
  ): Promise<Readonly<WorldRecoveryInspection>> {
    const canonicalWorldId = worldId(requestedWorldId);
    const observedAt = timestamp(observedAtReal, 'recovery observation time');
    return this.#database.transaction(async (transaction) => {
      const result = await transaction.query<RecoveryInspectionRow>(
        `select
           head.world_version,
           head.event_sequence,
           coalesce((select max(event_sequence) from world_v2.authoritative_event where world_id = head.world_id), 0) as event_max_sequence,
           coalesce((select max(world_version) from world_v2.authoritative_event where world_id = head.world_id), 0) as event_max_world_version,
           coalesce((select max(world_version_after) from world_v2.command_receipt where world_id = head.world_id and outcome = 'COMMITTED'), 0) as receipt_max_world_version,
           (select count(*) from world_v2.command_receipt where world_id = head.world_id and outcome = 'COMMITTED') as committed_count,
           (select count(*) from world_v2.command_queue queue left join world_v2.command_receipt receipt using (world_id, command_id) where queue.world_id = head.world_id and queue.queue_state = 'FINALIZED' and receipt.command_id is null) as finalized_without_receipt_count,
           (select count(*) from world_v2.command_receipt receipt join world_v2.command_queue queue using (world_id, command_id) where receipt.world_id = head.world_id and receipt.outcome = 'COMMITTED' and queue.queue_state <> 'FINALIZED') as committed_unfinalized_count,
           (select count(*) from world_v2.command_queue queue left join world_v2.command_receipt receipt using (world_id, command_id) left join world_v2.world_writer_lease lease using (world_id) where queue.world_id = head.world_id and queue.queue_state = 'CLAIMED' and receipt.command_id is null and (lease.world_id is null or lease.lease_expires_at_real <= $2 or queue.claimed_by is distinct from lease.holder_id or queue.claimed_at_real < lease.acquired_at_real)) as stale_claim_count,
           (select count(*) from world_v2.notification_outbox where world_id = head.world_id and delivery_state = 'PENDING') as pending_outbox_count,
           (select count(*) from world_v2.current_materialization where world_id = head.world_id and world_version < head.world_version) as stale_materialization_count,
           (select count(*) from world_v2.current_materialization where world_id = head.world_id and world_version > head.world_version) as materialization_ahead_count,
           ((select count(*) from world_v2.inventory_posting where world_id = head.world_id and world_version_after > head.world_version) + (select count(*) from world_v2.financial_posting_batch where world_id = head.world_id and world_version_after > head.world_version)) as posting_ahead_count
         from world_v2.world_head head
        where head.world_id = $1
        for share`,
        [canonicalWorldId, observedAt],
      );
      const row = result.rows[0];
      if (row === undefined) recoveryInvalid('World head is missing');
      const worldVersion = integer(row.world_version, 'WorldVersion');
      const eventSequence = integer(row.event_sequence, 'Event sequence');
      const committedCount = integer(
        row.committed_count,
        'committed receipt count',
      );
      const hardMismatch =
        integer(row.event_max_sequence, 'maximum Event sequence') !==
          eventSequence ||
        integer(row.event_max_world_version, 'maximum Event WorldVersion') !==
          worldVersion ||
        integer(
          row.receipt_max_world_version,
          'maximum receipt WorldVersion',
        ) !== worldVersion ||
        committedCount !== worldVersion ||
        integer(
          row.finalized_without_receipt_count,
          'receiptless finalized queue count',
        ) !== '0' ||
        integer(
          row.committed_unfinalized_count,
          'unfinalized committed receipt count',
        ) !== '0' ||
        integer(
          row.materialization_ahead_count,
          'future materialization count',
        ) !== '0' ||
        integer(row.posting_ahead_count, 'future Posting count') !== '0';
      if (hardMismatch) {
        recoveryInvalid(
          'World head, Event, Posting, receipt, queue or materialization lineage is inconsistent',
        );
      }
      const staleClaimCount = integer(
        row.stale_claim_count,
        'stale claim count',
      );
      const pendingOutboxCount = integer(
        row.pending_outbox_count,
        'pending outbox count',
      );
      const staleMaterializationCount = integer(
        row.stale_materialization_count,
        'stale materialization count',
      );
      return Object.freeze({
        status:
          staleClaimCount === '0' &&
          pendingOutboxCount === '0' &&
          staleMaterializationCount === '0'
            ? ('READY' as const)
            : ('RECOVERY_REQUIRED' as const),
        worldId: canonicalWorldId,
        worldVersion,
        eventSequence,
        pendingOutboxCount,
        staleClaimCount,
        staleMaterializationCount,
      });
    });
  }

  async reclaimAbandonedCommand(input: {
    readonly assertion: WorldWriterCommitAssertion;
    readonly commandId: string;
    readonly observedAtReal: string;
  }): Promise<void> {
    if (input.assertion.holderId !== this.#workerId) {
      recoveryInvalid('Recovery assertion holder does not match this Worker');
    }
    const observedAt = timestamp(input.observedAtReal, 'claim recovery time');
    await this.#database.transaction(async (transaction) => {
      await this.#assertCommitGuard(transaction, input.assertion, observedAt);
      const result = await transaction.query<LockedClaimRow>(
        `select queue.queue_state,
                queue.claimed_by,
                queue.claimed_at_real,
                queue.attempt_count,
                lease.holder_id,
                lease.acquired_at_real
           from world_v2.command_queue queue
           join world_v2.world_writer_lease lease using (world_id)
           left join world_v2.command_receipt receipt using (world_id, command_id)
          where queue.world_id = $1
            and queue.command_id = $2
            and receipt.command_id is null
          for update of queue`,
        [input.assertion.worldId, input.commandId],
      );
      const row = result.rows[0];
      if (
        row === undefined ||
        row.queue_state !== 'CLAIMED' ||
        typeof row.claimed_by !== 'string' ||
        typeof row.holder_id !== 'string' ||
        !(
          row.claimed_at_real instanceof Date ||
          typeof row.claimed_at_real === 'string'
        ) ||
        !(
          row.acquired_at_real instanceof Date ||
          typeof row.acquired_at_real === 'string'
        )
      ) {
        recoveryInvalid('Command is not an abandoned unfinalized claim');
      }
      const claimedAt = new Date(row.claimed_at_real).getTime();
      const acquiredAt = new Date(row.acquired_at_real).getTime();
      if (
        row.holder_id !== this.#workerId ||
        (row.claimed_by === this.#workerId && claimedAt >= acquiredAt)
      ) {
        recoveryInvalid(
          'Current higher-fence lease does not supersede this claim',
        );
      }
      integer(row.attempt_count, 'claim attempt count');
      await transaction.query(
        `update world_v2.command_queue
            set queue_state = 'PENDING',
                claimed_by = null,
                claimed_at_real = null,
                finalized_at_real = null
          where world_id = $1 and command_id = $2 and queue_state = 'CLAIMED'`,
        [input.assertion.worldId, input.commandId],
      );
      const reclaimed = await transaction.query(
        `update world_v2.command_queue
            set queue_state = 'CLAIMED',
                attempt_count = attempt_count + 1,
                claimed_by = $3,
                claimed_at_real = $4
          where world_id = $1 and command_id = $2 and queue_state = 'PENDING'`,
        [input.assertion.worldId, input.commandId, this.#workerId, observedAt],
      );
      if (reclaimed.rowCount !== 1)
        recoveryInvalid('Abandoned claim was not reclaimed');
    });
  }

  async recordOutboxAttempt(input: {
    readonly worldId: string;
    readonly messageId: string;
    readonly attemptedAtReal: string;
    readonly delivered: boolean;
  }): Promise<OutboxAttemptResult> {
    const canonicalWorldId = worldId(input.worldId);
    const attemptedAt = timestamp(input.attemptedAtReal, 'outbox attempt time');
    return this.#database.transaction(async (transaction) => {
      const result = await transaction.query<OutboxRow>(
        `select delivery_state, attempt_count
           from world_v2.notification_outbox
          where world_id = $1 and outbox_message_id = $2
          for update`,
        [canonicalWorldId, input.messageId],
      );
      const row = result.rows[0];
      if (row === undefined) recoveryInvalid('Outbox message is missing');
      const priorAttemptCount = integer(
        row.attempt_count,
        'outbox attempt count',
      );
      if (row.delivery_state === 'DELIVERED') {
        return Object.freeze({
          disposition: 'ALREADY_DELIVERED' as const,
          attemptCount: priorAttemptCount,
        });
      }
      if (row.delivery_state !== 'PENDING') {
        recoveryInvalid('Outbox delivery state is unsupported');
      }
      const updated = await transaction.query<{
        readonly attempt_count: unknown;
      }>(
        `update world_v2.notification_outbox
            set attempt_count = attempt_count + 1,
                last_attempt_at_real = $3,
                delivery_state = $4,
                delivered_at_real = case when $4 = 'DELIVERED' then $3::timestamptz else null end
          where world_id = $1 and outbox_message_id = $2
          returning attempt_count`,
        [
          canonicalWorldId,
          input.messageId,
          attemptedAt,
          input.delivered ? 'DELIVERED' : 'PENDING',
        ],
      );
      const attemptCount = integer(
        updated.rows[0]?.attempt_count,
        'updated outbox attempt count',
      );
      return Object.freeze({
        disposition: input.delivered
          ? ('DELIVERED' as const)
          : ('RETRY_PENDING' as const),
        attemptCount,
      });
    });
  }

  async rebuildCurrentMaterializations(input: {
    readonly assertion: WorldWriterCommitAssertion;
    readonly observedAtReal: string;
    readonly rebuilder: RecoveryProjectionRebuilder;
  }): Promise<number> {
    if (input.assertion.holderId !== this.#workerId) {
      recoveryInvalid('Recovery assertion holder does not match this Worker');
    }
    const observedAt = timestamp(
      input.observedAtReal,
      'projection rebuild time',
    );
    return this.#database.transaction(async (transaction) => {
      const head = await this.#assertCommitGuard(
        transaction,
        input.assertion,
        observedAt,
      );
      await transaction.query(
        'delete from world_v2.current_materialization where world_id = $1',
        [input.assertion.worldId],
      );
      const rebuilt = await input.rebuilder.rebuild(transaction, {
        worldId: input.assertion.worldId,
        worldVersion: head.worldVersion,
        eventSequence: head.eventSequence,
      });
      if (!Number.isSafeInteger(rebuilt) || rebuilt < 0) {
        recoveryInvalid('Projection rebuilder returned an invalid row count');
      }
      const verification = await transaction.query<{ readonly count: unknown }>(
        `select count(*) as count
           from world_v2.current_materialization
          where world_id = $1 and world_version <> $2`,
        [input.assertion.worldId, head.worldVersion],
      );
      if (
        integer(
          verification.rows[0]?.count,
          'rebuilt watermark mismatch count',
        ) !== '0'
      ) {
        recoveryInvalid('Projection rebuild produced a non-head watermark');
      }
      return rebuilt;
    });
  }

  async #assertCommitGuard(
    transaction: SqlExecutor,
    assertion: WorldWriterCommitAssertion,
    observedAtReal: string,
  ): Promise<{
    readonly worldVersion: string;
    readonly eventSequence: string;
  }> {
    const result = await transaction.query<HeadRow>(
      `select world_version, event_sequence
         from world_v2.assert_world_writer_commit_guard($1, $2, $3, $4, $5)`,
      [
        assertion.worldId,
        assertion.holderId,
        assertion.fencingToken,
        assertion.expectedWorldVersion,
        observedAtReal,
      ],
    );
    const row = result.rows[0];
    if (row === undefined)
      recoveryInvalid('Writer commit guard returned no World head');
    return Object.freeze({
      worldVersion: integer(row.world_version, 'guard WorldVersion'),
      eventSequence: integer(row.event_sequence, 'guard Event sequence'),
    });
  }
}
