import { createHash } from 'node:crypto';

import {
  canonicalSerialize,
  type CanonicalCommand,
  type FinalCommandReceipt,
} from '@econmind/core';
import { createAuthoritativeWorkerExecution } from '../../apps/world-worker/src/authoritative-execution.js';
import { createNarrowTreasuryGcuDeliveryCandidateFactory } from '../../apps/world-worker/src/persistence/narrow-treasury-gcu-delivery-draft.js';
import type { NarrowTreasuryGcuDeliveryPreparationSource } from '../../apps/world-worker/src/persistence/narrow-treasury-gcu-delivery-draft.js';
import type { SqlDatabase } from '../../apps/world-worker/src/persistence/sql-database.js';
import type { V09AtomicTestDatabase } from './v09-atomic-contract.js';

export const V29_WORKER_DRIVER_STATUS =
  'LOCAL_PGLITE_NARROW_DELIVERY_NOT_V29_ACCEPTANCE' as const;

export interface V29WorkerDeliveryEvidence {
  readonly status: typeof V29_WORKER_DRIVER_STATUS;
  readonly source: 'NEW_FINAL' | 'EXISTING_FINAL';
  readonly receipt: FinalCommandReceipt;
  readonly worldVersion: string;
  readonly eventCount: number;
  readonly inventoryPostingCount: number;
  readonly financialPostingCount: number;
  readonly outboxCount: number;
  readonly durableTraceHash: string;
}

function invalid(message: string): never {
  throw new Error(`V29_WORKER_DRIVER_INVALID: ${message}`);
}

const sha256Hex = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');

interface DurableRow {
  readonly world_version: unknown;
  readonly event_count: unknown;
  readonly inventory_count: unknown;
  readonly financial_count: unknown;
  readonly outbox_count: unknown;
  readonly event_fingerprint: unknown;
  readonly inventory_fingerprint: unknown;
  readonly financial_fingerprint: unknown;
}

/**
 * Executes the real Worker composition root against only a disposable PGlite
 * database. The narrow production candidate factory owns economic effects;
 * this adapter cannot manufacture a posting batch or bypass its SQL commit.
 */
export async function executeV29LocalWorkerDelivery(input: {
  readonly database: V09AtomicTestDatabase;
  readonly productionTarget: false;
  readonly workerId: string;
  readonly deliveryCommand: CanonicalCommand;
  readonly observedAtReal: string;
  readonly source: NarrowTreasuryGcuDeliveryPreparationSource;
}): Promise<V29WorkerDeliveryEvidence> {
  if (
    input.productionTarget !== false ||
    input.database.kind !== 'PGLITE' ||
    !input.workerId.startsWith('WORKER_V29_LOCAL_')
  ) {
    invalid('only a disposable local PGlite Worker driver is allowed');
  }
  if (
    input.deliveryCommand.commandType !== 'CORE_GOODS_DELIVERY_V1' ||
    input.deliveryCommand.officeId !== null ||
    input.deliveryCommand.expectedWorldVersion === null
  ) {
    invalid('only a versioned automatic narrow delivery is allowed');
  }
  const worker = createAuthoritativeWorkerExecution({
    database: input.database as SqlDatabase,
    workerId: input.workerId,
    sha256Hex,
    candidateFactory: createNarrowTreasuryGcuDeliveryCandidateFactory({
      sha256Hex,
      source: input.source,
    }),
  });
  const result = await worker.executeQueuedCommand({
    command: input.deliveryCommand,
    authorityKind: 'VERSIONED_AUTOMATIC',
    commitSimTime: input.deliveryCommand.simTime,
    recordedAtReal: input.observedAtReal,
  });
  if (result.receipt.outcome !== 'COMMITTED') {
    invalid('Worker did not commit the narrow delivery');
  }
  const durable = await input.database.query<DurableRow>(
    `select
       (select world_version::text from world_v2.world_head where world_id = $1) as world_version,
       (select count(*)::text from world_v2.authoritative_event where world_id = $1 and causation_command_id = $2) as event_count,
       (select count(*)::text from world_v2.inventory_posting where world_id = $1 and causation_command_id = $2) as inventory_count,
       (select count(*)::text from world_v2.financial_posting_batch where world_id = $1 and causation_command_id = $2) as financial_count,
       (select count(*)::text from world_v2.notification_outbox where world_id = $1 and command_id = $2) as outbox_count,
       (select event_fingerprint from world_v2.authoritative_event where world_id = $1 and causation_command_id = $2 limit 1) as event_fingerprint,
       (select posting_fingerprint from world_v2.inventory_posting where world_id = $1 and causation_command_id = $2 limit 1) as inventory_fingerprint,
       (select batch_fingerprint from world_v2.financial_posting_batch where world_id = $1 and causation_command_id = $2 limit 1) as financial_fingerprint`,
    [input.deliveryCommand.worldId, input.deliveryCommand.commandId],
  );
  const row = durable.rows[0];
  if (
    row === undefined ||
    typeof row.world_version !== 'string' ||
    row.world_version !== result.receipt.worldVersionAfter ||
    row.event_count !== '1' ||
    row.inventory_count !== '1' ||
    row.financial_count !== '1' ||
    row.outbox_count !== '1' ||
    typeof row.event_fingerprint !== 'string' ||
    typeof row.inventory_fingerprint !== 'string' ||
    typeof row.financial_fingerprint !== 'string'
  ) {
    invalid('durable Event, postings, outbox or WorldVersion is incomplete');
  }
  return Object.freeze({
    status: V29_WORKER_DRIVER_STATUS,
    source: result.source,
    receipt: result.receipt,
    worldVersion: row.world_version,
    eventCount: 1,
    inventoryPostingCount: 1,
    financialPostingCount: 1,
    outboxCount: 1,
    durableTraceHash: `sha256:${sha256Hex(
      canonicalSerialize({
        eventFingerprint: row.event_fingerprint,
        financialFingerprint: row.financial_fingerprint,
        inventoryFingerprint: row.inventory_fingerprint,
        receipt: result.receipt,
        worldVersion: row.world_version,
      }),
    )}`,
  });
}
