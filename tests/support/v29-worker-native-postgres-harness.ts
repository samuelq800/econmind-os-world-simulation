// PREPARATION_ONLY_NOT_V29_STARTED: disposable PG16 Worker evidence only.
import { expect } from 'vitest';

import { createAuthoritativeWorkerExecution } from '../../apps/world-worker/src/authoritative-execution.js';
import { createNarrowTreasuryGcuDeliveryCandidateFactory } from '../../apps/world-worker/src/persistence/narrow-treasury-gcu-delivery-draft.js';
import type { SqlDatabase } from '../../apps/world-worker/src/persistence/sql-database.js';
import {
  V09TransactionCommitUnknownError,
  type V09AtomicTestDatabase,
} from './v09-atomic-contract.js';
import { readV29DurableWorkerStep } from './v29-worker-replay-evidence.js';
import {
  AT,
  WORKER,
  preparedSequentialDeliveries,
  seedAdditionalClaimedCommand,
  seedClaimedDelivery,
  sha256,
} from './v29-worker-two-delivery-fixture.js';

/**
 * Prior reserve/ship lineage and candidate sources are test fixture state.
 * Only the two deliveries below execute through the real Worker composition
 * and a guarded, disposable native-PostgreSQL transaction adapter.
 */
export async function assertV29NativePostgresTwoDelivery(
  database: V09AtomicTestDatabase,
) {
  if (database.kind !== 'POSTGRESQL') {
    throw new Error('V29_NATIVE_PG_REQUIRES_GUARDED_POSTGRES_TEST_DATABASE');
  }
  const prepared = await preparedSequentialDeliveries(
    'V29_NATIVE_PG_TWO_DELIVERIES',
  );
  await seedClaimedDelivery(database, prepared.deliveryA, '4');
  await seedAdditionalClaimedCommand(database, prepared.deliveryB);

  const firstWorker = createAuthoritativeWorkerExecution({
    database: database as SqlDatabase,
    workerId: WORKER,
    sha256Hex: sha256,
    candidateFactory: createNarrowTreasuryGcuDeliveryCandidateFactory({
      sha256Hex: sha256,
      source: prepared.sourceA,
    }),
  });
  const first = await firstWorker.executeQueuedCommand({
    command: prepared.deliveryA,
    authorityKind: 'VERSIONED_AUTOMATIC',
    commitSimTime: prepared.deliveryA.simTime,
    recordedAtReal: AT,
  });
  expect(first).toMatchObject({
    source: 'NEW_FINAL',
    receipt: { outcome: 'COMMITTED', worldVersionAfter: '5' },
  });
  const firstDurable = await readV29DurableWorkerStep({
    database,
    command: prepared.deliveryA,
    commandIndex: 0,
  });

  let injectedCommitAcknowledgements = 0;
  const acknowledgementLost: SqlDatabase = {
    query: database.query,
    async transaction(operation) {
      const committed = await database.transaction(operation);
      injectedCommitAcknowledgements += 1;
      if (injectedCommitAcknowledgements === 1) {
        throw new V09TransactionCommitUnknownError(
          new Error('INJECTED_V29_NATIVE_PG_ACKNOWLEDGEMENT_LOST'),
        );
      }
      return committed;
    },
  };
  const secondWorker = createAuthoritativeWorkerExecution({
    database: acknowledgementLost,
    workerId: WORKER,
    sha256Hex: sha256,
    candidateFactory: createNarrowTreasuryGcuDeliveryCandidateFactory({
      sha256Hex: sha256,
      source: prepared.sourceB,
    }),
  });
  const second = await secondWorker.executeQueuedCommand({
    command: prepared.deliveryB,
    authorityKind: 'VERSIONED_AUTOMATIC',
    commitSimTime: prepared.deliveryB.simTime,
    recordedAtReal: AT,
  });
  expect(injectedCommitAcknowledgements).toBe(1);
  expect(second).toMatchObject({
    source: 'NEW_FINAL',
    receipt: { outcome: 'COMMITTED', worldVersionAfter: '6' },
  });
  const secondDurable = await readV29DurableWorkerStep({
    database,
    command: prepared.deliveryB,
    commandIndex: 1,
  });

  // A new Worker instance retries after the injected response loss.
  const restartedWorker = createAuthoritativeWorkerExecution({
    database: database as SqlDatabase,
    workerId: WORKER,
    sha256Hex: sha256,
    candidateFactory: createNarrowTreasuryGcuDeliveryCandidateFactory({
      sha256Hex: sha256,
      source: prepared.sourceB,
    }),
  });
  const retry = await restartedWorker.executeQueuedCommand({
    command: prepared.deliveryB,
    authorityKind: 'VERSIONED_AUTOMATIC',
    commitSimTime: prepared.deliveryB.simTime,
    recordedAtReal: AT,
  });
  expect(retry).toMatchObject({
    source: 'EXISTING_FINAL',
    receipt: { outcome: 'COMMITTED', worldVersionAfter: '6' },
  });
  expect(
    await readV29DurableWorkerStep({
      database,
      command: prepared.deliveryB,
      commandIndex: 1,
    }),
  ).toEqual(secondDurable);

  expect([firstDurable.worldVersion, secondDurable.worldVersion]).toEqual([
    '5',
    '6',
  ]);
  for (const key of [
    'eventHash',
    'inventoryHash',
    'financialHash',
    'receiptHash',
    'worldVersionHash',
  ] as const) {
    expect(firstDurable[key]).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(secondDurable[key]).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(firstDurable[key]).not.toBe(secondDurable[key]);
  }

  let deliveredTonnes = 0n;
  let settledGcu = 0n;
  for (const [index, command] of [
    prepared.deliveryA,
    prepared.deliveryB,
  ].entries()) {
    const facts = await database.query<{
      readonly event_payload: string;
      readonly inventory_payload: string;
      readonly financial_payload: string;
      readonly receipt_outcome: string;
      readonly version_before: string;
      readonly version_after: string;
    }>(
      `select
         (select canonical_payload from world_v2.authoritative_event
           where world_id = $1 and causation_command_id = $2)::text as event_payload,
         (select canonical_payload from world_v2.inventory_posting
           where world_id = $1 and causation_command_id = $2)::text as inventory_payload,
         (select canonical_payload from world_v2.financial_posting_batch
           where world_id = $1 and causation_command_id = $2)::text as financial_payload,
         outcome as receipt_outcome,
         world_version_before::text as version_before,
         world_version_after::text as version_after
       from world_v2.command_receipt
       where world_id = $1 and command_id = $2`,
      [command.worldId, command.commandId],
    );
    expect(facts.rows).toHaveLength(1);
    const row = facts.rows[0]!;
    const event = JSON.parse(row.event_payload) as {
      readonly transferCommandId: string;
      readonly transferFingerprint: string;
    };
    const transfer = index === 0 ? prepared.first.transfer : prepared.transferB;
    expect(event).toMatchObject({
      transferCommandId: transfer.commandId,
      transferFingerprint: transfer.fingerprint,
    });
    expect(row.receipt_outcome).toBe('COMMITTED');
    expect([row.version_before, row.version_after]).toEqual(
      index === 0 ? ['4', '5'] : ['5', '6'],
    );
    const inventory = JSON.parse(row.inventory_payload) as {
      readonly entries: readonly {
        readonly delta: { readonly amount: string; readonly unit: string };
        readonly account: {
          readonly countryId: string;
          readonly bucket: string;
        };
      }[];
    };
    expect(inventory.entries.map((entry) => entry.delta.amount).sort()).toEqual(
      ['-2', '2'],
    );
    const delivered = inventory.entries.find(
      (entry) => entry.delta.amount === '2',
    );
    expect(delivered).toMatchObject({
      delta: { amount: '2', unit: 'tonne' },
      account: {
        countryId: prepared.first.fixture.countries.buyer,
        bucket: 'AVAILABLE',
      },
    });
    deliveredTonnes += BigInt(delivered!.delta.amount);
    const financial = JSON.parse(row.financial_payload) as {
      readonly legs: readonly {
        readonly amount: { readonly amount: string; readonly currency: string };
        readonly direction: string;
        readonly account: { readonly countryId: string };
      }[];
    };
    const buyerPayment = financial.legs.find(
      (leg) => leg.account.countryId === prepared.first.fixture.countries.buyer,
    );
    expect(buyerPayment).toMatchObject({
      amount: { amount: '6', currency: 'GCU' },
      direction: 'CREDIT',
    });
    settledGcu += BigInt(buyerPayment!.amount.amount);
  }
  expect(deliveredTonnes).toBe(4n);
  expect(settledGcu).toBe(12n);
  const footprint = await database.query<{
    readonly event_count: string;
    readonly inventory_count: string;
    readonly financial_count: string;
    readonly receipt_count: string;
    readonly outbox_count: string;
    readonly world_version: string;
    readonly event_sequence: string;
  }>(
    `select
       (select count(*)::text from world_v2.authoritative_event where world_id = $1) as event_count,
       (select count(*)::text from world_v2.inventory_posting where world_id = $1) as inventory_count,
       (select count(*)::text from world_v2.financial_posting_batch where world_id = $1) as financial_count,
       (select count(*)::text from world_v2.command_receipt where world_id = $1) as receipt_count,
       (select count(*)::text from world_v2.notification_outbox where world_id = $1) as outbox_count,
       (select world_version::text from world_v2.world_head where world_id = $1) as world_version,
       (select event_sequence::text from world_v2.world_head where world_id = $1) as event_sequence`,
    [prepared.first.fixture.worldId],
  );
  expect(footprint.rows[0]).toEqual({
    event_count: '2',
    inventory_count: '2',
    financial_count: '2',
    receipt_count: '2',
    outbox_count: '2',
    world_version: '6',
    event_sequence: '6',
  });
  return Object.freeze({
    first: firstDurable,
    second: secondDurable,
    deliveredTonnes: deliveredTonnes.toString(),
    settledGcu: settledGcu.toString(),
    lostAcknowledgements: injectedCommitAcknowledgements,
    retrySource: retry.source,
  });
}
