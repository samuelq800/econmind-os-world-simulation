import { createHash } from 'node:crypto';
import {
  DOMAIN_ERROR_CODES,
  DomainError,
  SimTime,
  SOCIAL_JOB_MATCH_DUE_COMMAND,
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
import { createSqlNarrowTreasuryGcuShipmentCandidateFactory } from '../persistence/sql-narrow-treasury-gcu-shipment-preparation-source.js';
import type { SqlDatabase, SqlExecutor } from '../persistence/sql-database.js';
import { createLocalNarrowReservationWorker } from './local-narrow-reservation-worker.js';
import {
  authorizeManualOfficeCommand,
  createManualOfficeCommandComposition,
  isManualOfficeSourceMissing,
  manualOfficeCapability,
  type ManualOfficeRuntimeReaders,
} from './manual-office-command-composition.js';
import type { AuthorizedOfficeContext } from '@econmind/core';
import { FINANCE_BUDGET_APPROPRIATION_COMMAND } from '@econmind/core/authenticated-office-command-contract';
import { isFinanceBudgetNativeCommitGuard } from '../persistence/postgres-finance-budget-custody.js';
import { validateManualOfficeCommandIntent } from '../intake/manual-office-command-intent.js';
import { isPostwarSocialMatchSourceCommitProtectionPort } from '../persistence/postwar-social-match-runtime.js';

import {
  registeredFinanceCommandHostDependencies,
  productionFinanceCommandExecutionBlocker,
  type ServerCommandHostBinding,
} from '../runtime-preparation/production-world-command-host.js';

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
type DurableConsumptionInput = {
  readonly database: SqlDatabase;
  readonly environment: NodeJS.ProcessEnv;
  readonly workerId: string;
  readonly worldId: string;
  readonly sha256Hex: Sha256Hex;
  readonly clock: DurableConsumptionClock | null;
  /** Trusted server constructors only; absent sources never enable a family. */
  readonly officeReaders?: ManualOfficeRuntimeReaders;
};
export function createDurableCommandConsumptionPreparation(
  input: DurableConsumptionInput,
) {
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
  return createDurableCommandConsumer(input, null);
}
/** Explicit finite server composition. No environment substitution, loop,
 * lease acquisition or Clock construction. Missing formal originals deny first. */
export function createProductionFinanceCommandConsumption(
  binding: ServerCommandHostBinding,
) {
  const d = registeredFinanceCommandHostDependencies(binding);
  return createDurableCommandConsumer(
    {
      database: d.workerDatabase,
      environment: Object.freeze({}),
      workerId: d.workerId,
      worldId: d.worldId,
      sha256Hex: (bytes) => createHash('sha256').update(bytes).digest('hex'),
      clock: d.clock,
      officeReaders: { financeBudget: d.readers.financeBudget! },
    },
    binding,
  );
}
function createDurableCommandConsumer(
  input: DurableConsumptionInput,
  serverBinding: ServerCommandHostBinding | null,
) {
  const world = worldId(input.worldId);
  const holder = workerId(input.workerId);
  const clock = input.clock;
  const officeReaders = Object.freeze({ ...input.officeReaders });
  const lineage = new DurableV08LedgerLineageReader(input);
  const delivery = serverBinding
    ? null
    : createAuthoritativeWorkerExecution({
        database: input.database,
        workerId: holder,
        sha256Hex: input.sha256Hex,
        candidateFactory: createSqlNarrowTreasuryGcuDeliveryCandidateFactory({
          database: input.database,
          workerId: holder,
          sha256Hex: input.sha256Hex,
        }),
      });
  const shipment = serverBinding
    ? null
    : createAuthoritativeWorkerExecution({
        database: input.database,
        workerId: holder,
        sha256Hex: input.sha256Hex,
        candidateFactory: createSqlNarrowTreasuryGcuShipmentCandidateFactory({
          database: input.database,
          workerId: holder,
          sha256Hex: input.sha256Hex,
        }),
      });
  const reservation =
    clock === null || serverBinding !== null
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

  async function claimAutomatic(
    command: CanonicalCommand,
    at: string,
    simTime: SimTime,
  ) {
    if (
      command.commandType !== 'CORE_GOODS_SHIPMENT_V1' &&
      command.commandType !== 'CORE_GOODS_DELIVERY_V1' &&
      !(
        command.commandType === SOCIAL_JOB_MATCH_DUE_COMMAND &&
        isPostwarSocialMatchSourceCommitProtectionPort(
          officeReaders.socialMatch?.sourceCommitProtectionPort,
        )
      )
    )
      invalid('Only a fixed automatic source may use this claim path');
    const label =
      command.commandType === 'CORE_GOODS_SHIPMENT_V1'
        ? 'Shipment'
        : command.commandType === SOCIAL_JOB_MATCH_DUE_COMMAND
          ? 'Social MATCH'
          : 'Delivery';
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
        invalid(`${label} differs from durable canonical Command`);
      // MATCH's fixed source runtime validates the complete prefix before
      // claim and again under held source guards at Atomic's commit cutoff.
      // Its queue writer reads lease/head metadata only; it has no raw seed
      // access. Goods retain their existing lineage source protocol.
      const isMatch = command.commandType === SOCIAL_JOB_MATCH_DUE_COMMAND;
      const lease = isMatch
        ? await leaseFrom(transaction, at)
        : await checkSource(transaction, durable, at);
      if (isMatch) {
        const head = await transaction.query<{ world_version: string }>(
          'select world_version::text from world_v2.world_head where world_id=$1 for share',
          [world],
        );
        if (
          lease.worldId !== world ||
          lease.holderId !== holder ||
          lease.expiresAtReal <= at ||
          head.rows.length !== 1 ||
          head.rows[0]?.world_version !== command.expectedWorldVersion
        )
          invalid(
            'Social MATCH claim requires its exact active lease and current head',
          );
      }
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
        invalid(`${label} is not an automatic due durable queue member`);
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
        invalid(`${label} queue is not executable`);
      const updated = await transaction.query(
        `update world_v2.command_queue
            set queue_state='CLAIMED', claimed_by=$3, claimed_at_real=$4::timestamptz,
                claim_fencing_token=$5::bigint, attempt_count=attempt_count+1
          where world_id=$1 and command_id=$2 and queue_state='PENDING'`,
        [world, command.commandId, holder, at, lease.fencingToken],
      );
      if (updated.rowCount !== 1)
        invalid(`${label} claim must update exactly one durable row`);
    });
  }

  async function claimManual(
    command: CanonicalCommand,
    authorization: AuthorizedOfficeContext,
    at: string,
    simTime: SimTime,
  ) {
    await input.database.transaction(async (transaction) => {
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
        invalid('Manual command differs from durable submission');
      const lease = await leaseFrom(transaction, at);
      const head = await transaction.query<{ world_version: string }>(
        'select world_version::text from world_v2.world_head where world_id=$1 for share',
        [world],
      );
      if (
        head.rows.length !== 1 ||
        head.rows[0]?.world_version !== command.expectedWorldVersion
      )
        throw new DomainError(
          DOMAIN_ERROR_CODES.VERSION_MISMATCH,
          'Manual claim expected WorldVersion changed',
        );
      const current = await transaction.query<{
        team_id: string;
        authorization_version: string;
      }>(
        `select team_id,authorization_version from world_v2.current_commit_authorization
         where world_id=$1 and auth_subject=$2::uuid and country_id=$3 and office_id=$4
           and capability=$5 and active for share`,
        [
          world,
          command.authSubject,
          command.countryId,
          command.officeId,
          authorization.capability,
        ],
      );
      if (
        current.rows.length !== 1 ||
        current.rows[0]?.team_id !== authorization.teamId ||
        current.rows[0]?.authorization_version !==
          authorization.authorizationVersion
      )
        throw new DomainError(
          DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED,
          'Manual claim current capability/revision changed',
        );
      const queued = await transaction.query<QueueRow>(
        `select command_id,authority_kind,queue_state,available_at_sim_time::text,claimed_by,claim_fencing_token::text
         from world_v2.command_queue where world_id=$1 and command_id=$2 for update`,
        [world, command.commandId],
      );
      const row = queued.rows[0];
      if (
        queued.rows.length !== 1 ||
        !row ||
        row.authority_kind !== 'DISCRETIONARY_USER' ||
        SimTime.fromTicks(row.available_at_sim_time).ticks > simTime.ticks ||
        command.simTime.ticks > simTime.ticks
      )
        invalid(
          'Manual command must be the same discretionary due queue member',
        );
      if (row.queue_state === 'CLAIMED') {
        if (
          row.claimed_by !== holder ||
          row.claim_fencing_token !== lease.fencingToken
        )
          invalid('Manual claim requires reviewed holder/fence recovery');
        return;
      }
      if (row.queue_state !== 'PENDING')
        invalid('Manual queue is not executable');
      const result = await transaction.query(
        `update world_v2.command_queue set queue_state='CLAIMED',claimed_by=$3,claimed_at_real=$4::timestamptz,
          claim_fencing_token=$5::bigint,attempt_count=attempt_count+1
         where world_id=$1 and command_id=$2 and queue_state='PENDING'`,
        [world, command.commandId, holder, at, lease.fencingToken],
      );
      if (result.rowCount !== 1)
        invalid('Manual claim must update exactly one durable row');
    });
  }

  async function step(): Promise<DurableConsumptionStep> {
    if (serverBinding) {
      const reason = productionFinanceCommandExecutionBlocker(serverBinding);
      if (reason) return blocked(reason);
    }
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
              ${serverBinding ? "and command_id in(select s.command_id from world_v2.command_submission s where s.world_id=$1 and s.command_type='CORE_FINANCE_BUDGET_APPROPRIATION_V1'and s.office_id='FINANCE')" : ''}
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
      if (
        serverBinding &&
        (command.commandType !== FINANCE_BUDGET_APPROPRIATION_COMMAND ||
          command.officeId !== 'FINANCE')
      )
        return blocked('FINITE_FINANCE_FAMILY_REQUIRED', command.commandId);
      const manualCapability = manualOfficeCapability(command);
      const matchRuntime = officeReaders.socialMatch;
      const socialMatch =
        command.commandType === SOCIAL_JOB_MATCH_DUE_COMMAND &&
        !!matchRuntime &&
        isPostwarSocialMatchSourceCommitProtectionPort(
          matchRuntime.sourceCommitProtectionPort,
        );
      if (
        command.commandType !== 'CORE_GOODS_TRANSFER_V1' &&
        command.commandType !== 'CORE_GOODS_SHIPMENT_V1' &&
        command.commandType !== 'CORE_GOODS_DELIVERY_V1' &&
        !socialMatch &&
        manualCapability === null
      )
        return blocked('UNSUPPORTED_COMMAND', command.commandId);
      const isReserve = command.commandType === 'CORE_GOODS_TRANSFER_V1';
      const discretionary = isReserve || manualCapability !== null;
      if (
        row.authority_kind !==
          (discretionary ? 'DISCRETIONARY_USER' : 'VERSIONED_AUTOMATIC') ||
        (!discretionary && command.officeId !== null) ||
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
      if (socialMatch) {
        const execution = createAuthoritativeWorkerExecution({
          database: input.database,
          workerId: holder,
          sha256Hex: input.sha256Hex,
          candidateFactory: matchRuntime.candidateFactory,
          socialMatchSourceCommitProtectionPort:
            matchRuntime.sourceCommitProtectionPort,
        });
        const existing = await execution.repository.readFinalReceipt(command);
        if (existing !== null)
          return Object.freeze({
            status: 'PROCESSED',
            commandId: command.commandId,
            source: 'EXISTING_FINAL',
            receipt: existing,
          });
        await matchRuntime.assertSourceBeforeClaim({
          command,
          observedAtReal: at,
        });
        await claimAutomatic(command, at, simTime);
        const result = await execution.executeQueuedCommand({
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
      }
      if (
        command.commandType === FINANCE_BUDGET_APPROPRIATION_COMMAND &&
        !isFinanceBudgetNativeCommitGuard(
          officeReaders.financeBudget?.commitGuard,
        )
      ) {
        validateManualOfficeCommandIntent(command);
        return blocked('SOURCE_RUNTIME_UNAVAILABLE', command.commandId);
      }
      if (manualCapability !== null) {
        const composition = createManualOfficeCommandComposition({
          command,
          database: input.database,
          workerId: holder,
          sha256Hex: input.sha256Hex,
          readers: officeReaders,
        });
        if (composition === null)
          return blocked('MANUAL_OFFICE_SOURCE_NOT_BOUND', command.commandId);
        const execution = createAuthoritativeWorkerExecution({
          database: input.database,
          workerId: holder,
          sha256Hex: input.sha256Hex,
          candidateFactory: composition.factory,
          ...(composition.captainSourceCommitProtectionPort === undefined
            ? {}
            : {
                captainSourceCommitProtectionPort:
                  composition.captainSourceCommitProtectionPort,
              }),
          ...(composition.socialPositionSourceCommitProtectionPort === undefined
            ? {}
            : {
                socialPositionSourceCommitProtectionPort:
                  composition.socialPositionSourceCommitProtectionPort,
              }),
          ...(composition.financeBudgetSourceCommitProtectionPort === undefined
            ? {}
            : {
                financeBudgetSourceCommitProtectionPort:
                  composition.financeBudgetSourceCommitProtectionPort,
              }),
          ...(composition.sourceCommitProtectionPort === undefined
            ? {}
            : {
                sourceCommitProtectionPort:
                  composition.sourceCommitProtectionPort,
              }),
        });
        const existing = await execution.repository.readFinalReceipt(command);
        if (existing !== null)
          return Object.freeze({
            status: 'PROCESSED',
            commandId: command.commandId,
            source: 'EXISTING_FINAL',
            receipt: existing,
          });
        const authorization = await authorizeManualOfficeCommand({
          database: input.database,
          command,
        });
        await composition.assertSourceBeforeClaim(at);
        await claimManual(command, authorization, at, simTime);
        const result = await execution.executeQueuedCommand({
          command,
          authorityKind: 'DISCRETIONARY_USER',
          requiredCapability: manualCapability,
          intakeAuthorization: authorization,
          commitSimTime: simTime,
          recordedAtReal: timestamp(clock.nowReal()),
        });
        return Object.freeze({
          status: 'PROCESSED',
          commandId: command.commandId,
          source: result.source,
          receipt: result.receipt,
        });
      }
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
      await claimAutomatic(command, at, simTime);
      const execution =
        command.commandType === 'CORE_GOODS_SHIPMENT_V1' ? shipment : delivery;
      if (!execution)
        invalid(
          'Only the fixed Finance branch is installed in the server consumer',
        );
      const result = await execution.executeQueuedCommand({
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
      if (
        isManualOfficeSourceMissing(error) ||
        (error instanceof PostgresTransactionError &&
          error.outcome === 'ROLLED_BACK' &&
          isManualOfficeSourceMissing(error.cause))
      )
        return blocked('MANUAL_OFFICE_SOURCE_UNAVAILABLE', selectedId);
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
      if (serverBinding)
        invalid(
          'Production finite consumer cannot be activated through preparation',
        );
      if (lifecycle !== 'PREPARED')
        invalid('Only a prepared instance may become ready');
      lifecycle = 'READY';
    },
    consumeOnce(): Promise<DurableConsumptionStep> {
      if (
        serverBinding &&
        !['STOPPING', 'STOPPED', 'FAULTED'].includes(lifecycle)
      ) {
        const reason = productionFinanceCommandExecutionBlocker(serverBinding);
        if (reason) return Promise.resolve(blocked(reason));
      }
      if (lifecycle !== 'READY' && !(serverBinding && lifecycle === 'PREPARED'))
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
