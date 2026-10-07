import {
  DOMAIN_ERROR_CODES,
  DomainError,
  canonicalSerialize,
  validateFinalReceiptForCommand,
  worldId,
  type FinalCommandReceipt,
  type Sha256Hex,
} from '@econmind/core';

import {
  DurableV08LedgerLineageReader,
  type DurableV08LedgerLineageSnapshot,
} from '../persistence/durable-v08-ledger-lineage-reader.js';
import type { SqlDatabase } from '../persistence/sql-database.js';
import {
  createDurableCommandConsumptionPreparation,
  type DurableConsumptionClock,
  type DurableConsumptionStep,
} from './durable-command-consumption.js';

export const ISOLATED_FINANCIAL_RUNTIME_STATUS =
  'TEST_ONLY_NOT_OFFICIAL_OPENING_OR_RUNTIME_ACCEPTANCE' as const;

export interface IsolatedFinancialOpeningBinding {
  readonly worldId: string;
  readonly seedId: string;
  readonly seedFingerprint: string;
}

export interface IsolatedFinancialReadback extends DurableV08LedgerLineageSnapshot {
  readonly worldId: string;
  readonly status: typeof ISOLATED_FINANCIAL_RUNTIME_STATUS;
}

function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    message,
  );
}

/**
 * Bounded disposable-PG composition, not a startup service or admission port.
 * It consumes only existing durable Commands through the reviewed Reserve /
 * SQL Shipment / SQL Delivery factories. No balances, seeds, approvals,
 * policy callbacks, lease acquisition or automatic commands are supplied here.
 * The host must separately persist an opening, approvals and commands through
 * their existing server-owned boundaries. A matching seed is not an admission.
 */
export function createIsolatedFinancialRuntimeComposition(input: {
  readonly database: SqlDatabase;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly workerId: string;
  readonly opening: IsolatedFinancialOpeningBinding;
  readonly sha256Hex: Sha256Hex;
  readonly clock: DurableConsumptionClock;
}) {
  const world = worldId(input.opening.worldId);
  if (!/^WORLD_C_ISOLATED_[A-Z0-9_]+$/u.test(world))
    invalid(
      'Isolated composition requires a separate TEST_ONLY World namespace',
    );
  if (
    !input.opening.seedId ||
    !/^sha256:[0-9a-f]{64}$/u.test(input.opening.seedFingerprint)
  )
    invalid('An explicit immutable persisted opening binding is required');
  // Copy the expected identity; subsequent caller mutation cannot retarget it.
  const opening = Object.freeze({ ...input.opening, worldId: world });
  const lineage = new DurableV08LedgerLineageReader(input);
  const consumer = createDurableCommandConsumptionPreparation({
    ...input,
    worldId: world,
  });
  let state: 'PREPARED' | 'READY' | 'FAULTED' | 'STOPPING' | 'STOPPED' =
    'PREPARED';
  let active: Promise<unknown> | null = null;
  function fault(): void {
    if (state !== 'STOPPING') state = 'FAULTED';
  }

  async function readback(
    receipt?: FinalCommandReceipt,
  ): Promise<Readonly<IsolatedFinancialReadback>> {
    return input.database.transaction(async (transaction) => {
      // Verify the actual connected server, not an `isolated: true` flag or a
      // URL supplied by a caller. No public / production schema is accessed.
      const target = await transaction.query<{
        database: string;
        host: string | null;
        role: string;
      }>(
        'select current_database() as database, host(inet_server_addr()) as host, current_user as role',
      );
      const row = target.rows[0];
      if (
        target.rows.length !== 1 ||
        !row ||
        !/^econmind_v09(?:_[a-z0-9_]+)?$/u.test(row.database) ||
        !['127.0.0.1', '::1'].includes(row.host ?? '') ||
        row.role !== 'postgres'
      )
        invalid(
          'Actual connection is not a disposable loopback PostgreSQL target',
        );
      // Match intake / atomic commit's submission-before-head lock order.
      // Commands are append-only, so this early canonical read stays valid
      // while the later shared head lock pins opening / replay / receipt facts.
      // Never acquire a submission lock underneath an already-held head lock.
      const command =
        receipt === undefined
          ? null
          : await lineage.readCommandFrom(
              transaction,
              world,
              receipt.commandId,
            );
      // The reader holds a shared head lock throughout opening / ledger /
      // receipt inspection. It reconstructs, never materializes another truth.
      const snapshot = await lineage.rebuildFrom(transaction, world);
      if (
        snapshot.ledgers.seedId !== opening.seedId ||
        snapshot.ledgers.seedFingerprint !== opening.seedFingerprint ||
        snapshot.ledgers.inventory.worldId !== world ||
        snapshot.ledgers.financial.worldId !== world
      )
        invalid('Persisted opening differs from the isolated host binding');
      if (receipt !== undefined) {
        if (command === null) invalid('Receipt command binding is absent');
        validateFinalReceiptForCommand({ command, receipt });
        const facts = await transaction.query<{
          receipt: unknown;
          event_ids: unknown;
          queue_state: string;
        }>(
          `select json_build_object(
             'schemaVersion', r.schema_version, 'worldId', r.world_id,
             'commandId', r.command_id, 'idempotencyKey', r.idempotency_key,
             'commandFingerprint', r.command_fingerprint, 'outcome', r.outcome,
             'reasonCode', r.reason_code, 'transitionId', r.transition_id,
             'worldVersionBefore', r.world_version_before::text,
             'worldVersionAfter', r.world_version_after::text,
             'simTime', r.sim_time::text, 'eventIds', r.event_ids,
             'recordedAtReal', to_char(r.recorded_at_real at time zone 'UTC',
               'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) as receipt,
             coalesce((select json_agg(e.event_id order by e.event_sequence)
               from world_v2.authoritative_event e
               where e.world_id=r.world_id and e.causation_command_id=r.command_id),
               '[]'::json) as event_ids, q.queue_state
           from world_v2.command_receipt r
           join world_v2.command_queue q using (world_id, command_id)
           where r.world_id=$1 and r.command_id=$2`,
          [world, receipt.commandId],
        );
        const fact = facts.rows[0];
        if (
          facts.rows.length !== 1 ||
          !fact ||
          fact.queue_state !== 'FINALIZED' ||
          canonicalSerialize(fact.receipt) !== canonicalSerialize(receipt) ||
          canonicalSerialize(fact.event_ids) !==
            canonicalSerialize(receipt.eventIds) ||
          (receipt.worldVersionAfter !== null &&
            BigInt(receipt.worldVersionAfter) >
              BigInt(snapshot.headWorldVersion))
        )
          invalid(
            'Worker result is not a complete durable final receipt in this lineage',
          );
      }
      return Object.freeze({
        ...snapshot,
        worldId: world,
        status: ISOLATED_FINANCIAL_RUNTIME_STATUS,
      });
    });
  }

  return Object.freeze({
    status: ISOLATED_FINANCIAL_RUNTIME_STATUS,
    state: () => state,
    async startIsolation(): Promise<Readonly<IsolatedFinancialReadback>> {
      if (state !== 'PREPARED' || active !== null)
        invalid('Only a prepared isolated host may be bound');
      const binding = readback();
      active = binding;
      try {
        const snapshot = await binding;
        if (state !== 'PREPARED') invalid('Isolated host is stopping');
        consumer.startPreparation();
        state = 'READY';
        return snapshot;
      } catch (error) {
        fault();
        throw error;
      } finally {
        active = null;
      }
    },
    async consumeOnce(): Promise<
      Readonly<{
        step: DurableConsumptionStep;
        readback: IsolatedFinancialReadback;
      }>
    > {
      if (state !== 'READY' || active !== null)
        invalid('Isolated host is not ready or already consuming');
      const operation = (async () => {
        await readback();
        const step = await consumer.consumeOnce();
        const snapshot = await readback(
          step.status === 'PROCESSED' ? step.receipt : undefined,
        );
        if (step.status === 'FAILED') fault();
        return Object.freeze({ step, readback: snapshot });
      })();
      active = operation;
      try {
        return await operation;
      } catch (error) {
        // Readback failure after commit is UNKNOWN to this host, not rollback.
        // Restart and inspect the durable receipt; never retry an economic callback.
        fault();
        throw error;
      } finally {
        active = null;
      }
    },
    readback: () => readback(),
    async stop(): Promise<void> {
      state = 'STOPPING';
      try {
        await active;
      } finally {
        await consumer.stop();
        state = 'STOPPED';
      }
    },
  });
}
