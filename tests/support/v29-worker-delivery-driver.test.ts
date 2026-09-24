import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { CanonicalCommand } from '@econmind/core';
import type { NarrowTreasuryGcuDeliveryPreparationSource } from '../../apps/world-worker/src/persistence/narrow-treasury-gcu-delivery-draft.js';
import { createPGliteV09AtomicTestDatabase } from './v09-atomic-database.js';
import type { V09AtomicTestDatabase } from './v09-atomic-contract.js';
import { executeV29LocalWorkerDelivery } from './v29-worker-delivery-driver.js';
import {
  AT,
  WORKER,
  preparedSequentialDeliveries,
  preparedTwoCountryDelivery,
  seedAdditionalClaimedCommand,
  seedClaimedDelivery,
} from './v29-worker-two-delivery-fixture.js';
import {
  V29WorkerReplayMismatchError,
  V29WorkerReplayStepError,
  assertV29WorkerFixedSeedReplay,
  readV29DurableWorkerStep,
} from './v29-worker-replay-evidence.js';

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
  '0009_world_v2_posting_payload_integrity.sql',
  '0010_world_v2_command_claim_fencing.sql',
  '0011_world_v2_current_commit_authorization.sql',
  '0012_world_v2_command_claim_active_lease_guard.sql',
  '0015_world_v2_narrow_transfer_approvals.sql',
  '0016_world_v2_opening_seed.sql',
] as const;

async function database(): Promise<V09AtomicTestDatabase> {
  const result = createPGliteV09AtomicTestDatabase();
  for (const migration of migrations) {
    await result.executeScript(
      await readFile(
        path.join(root, 'database/migrations/artifacts', migration),
        'utf8',
      ),
    );
  }
  return result;
}

async function runFreshWorkerSequence(
  seed: string,
  sessionTimeZone?: 'UTC' | 'Asia/Shanghai',
) {
  const prepared = preparedTwoCountryDelivery(seed);
  const local = await database();
  try {
    if (sessionTimeZone !== undefined) {
      await local.query(
        sessionTimeZone === 'UTC'
          ? `set time zone 'UTC'`
          : `set time zone 'Asia/Shanghai'`,
      );
      const zone = await local.query<{ readonly zone: string }>(
        `select current_setting('TimeZone') as zone`,
      );
      expect(zone.rows[0]?.zone).toBe(sessionTimeZone);
    }
    await seedClaimedDelivery(local, prepared.delivery);
    const input = {
      database: local,
      productionTarget: false as const,
      workerId: WORKER,
      deliveryCommand: prepared.delivery,
      observedAtReal: AT,
      source: prepared.source,
    };
    const executeStep = async (commandIndex: number) => {
      try {
        const result = await executeV29LocalWorkerDelivery(input);
        const durable = await readV29DurableWorkerStep({
          database: local,
          command: prepared.delivery,
          commandIndex,
        });
        return { result, durable };
      } catch {
        throw new V29WorkerReplayStepError(commandIndex);
      }
    };
    const first = await executeStep(0);
    if (sessionTimeZone !== undefined) {
      const offset = await local.query<{ readonly seconds: string }>(
        `select extract(timezone from recorded_at_real)::text as seconds
           from world_v2.command_receipt where command_id = $1`,
        [prepared.delivery.commandId],
      );
      expect(offset.rows[0]?.seconds).toBe(
        sessionTimeZone === 'UTC' ? '0' : '28800',
      );
    }
    const retry = await executeStep(1);
    if (
      first.result.source !== 'NEW_FINAL' ||
      retry.result.source !== 'EXISTING_FINAL'
    ) {
      throw new V29WorkerReplayStepError(
        first.result.source !== 'NEW_FINAL' ? 0 : 1,
      );
    }
    return [first.durable, retry.durable] as const;
  } finally {
    await local.close();
  }
}

async function runFreshSequentialWorkerSequence(seed: string) {
  const prepared = await preparedSequentialDeliveries(seed);
  const local = await database();
  try {
    await seedClaimedDelivery(local, prepared.deliveryA, '4');
    await seedAdditionalClaimedCommand(local, prepared.deliveryB);
    const execute = async (
      command: CanonicalCommand,
      source: NarrowTreasuryGcuDeliveryPreparationSource,
      commandIndex: number,
    ) => {
      try {
        const result = await executeV29LocalWorkerDelivery({
          database: local,
          productionTarget: false,
          workerId: WORKER,
          deliveryCommand: command,
          observedAtReal: AT,
          source,
        });
        const durable = await readV29DurableWorkerStep({
          database: local,
          command,
          commandIndex,
        });
        return { result, durable };
      } catch {
        throw new V29WorkerReplayStepError(commandIndex);
      }
    };
    const first = await execute(prepared.deliveryA, prepared.sourceA, 0);
    const second = await execute(prepared.deliveryB, prepared.sourceB, 1);
    const retry = await execute(prepared.deliveryB, prepared.sourceB, 2);
    if (
      first.result.source !== 'NEW_FINAL' ||
      second.result.source !== 'NEW_FINAL' ||
      retry.result.source !== 'EXISTING_FINAL'
    ) {
      throw new V29WorkerReplayStepError(
        first.result.source !== 'NEW_FINAL'
          ? 0
          : second.result.source !== 'NEW_FINAL'
            ? 1
            : 2,
      );
    }
    return [first.durable, second.durable, retry.durable] as const;
  } finally {
    await local.close();
  }
}

describe('V29 preparation-only real Worker narrow-delivery adapter', () => {
  it('commits one two-country goods/GCU delivery through Worker and returns the same durable receipt on retry', async () => {
    const prepared = preparedTwoCountryDelivery();
    const local = await database();
    try {
      await seedClaimedDelivery(local, prepared.delivery);
      const input = {
        database: local,
        productionTarget: false as const,
        workerId: WORKER,
        deliveryCommand: prepared.delivery,
        observedAtReal: AT,
        source: prepared.source,
      };
      const first = await executeV29LocalWorkerDelivery(input);
      const retry = await executeV29LocalWorkerDelivery(input);
      expect(first).toMatchObject({
        status: 'LOCAL_PGLITE_NARROW_DELIVERY_NOT_V29_ACCEPTANCE',
        source: 'NEW_FINAL',
        receipt: { outcome: 'COMMITTED', worldVersionAfter: '3' },
        worldVersion: '3',
        eventCount: 1,
        inventoryPostingCount: 1,
        financialPostingCount: 1,
        outboxCount: 1,
      });
      expect(retry.source).toBe('EXISTING_FINAL');
      expect(retry.durableTraceHash).toBe(first.durableTraceHash);
      const postings = await local.query<{
        readonly inventory: string;
        readonly financial: string;
      }>(
        `select
           (select canonical_payload from world_v2.inventory_posting where causation_command_id = $1)::text as inventory,
           (select canonical_payload from world_v2.financial_posting_batch where causation_command_id = $1)::text as financial`,
        [prepared.delivery.commandId],
      );
      const inventory = JSON.parse(postings.rows[0]!.inventory) as {
        readonly entries: readonly {
          readonly delta: { readonly amount: string };
          readonly account: {
            readonly countryId: string;
            readonly bucket: string;
          };
        }[];
      };
      const financial = JSON.parse(postings.rows[0]!.financial) as {
        readonly legs: readonly {
          readonly amount: { readonly amount: string };
          readonly account: { readonly countryId: string };
        }[];
      };
      expect(
        inventory.entries.map((entry) => entry.delta.amount).sort(),
      ).toEqual(['-2', '2']);
      expect(
        inventory.entries.find((entry) => entry.delta.amount === '2')?.account,
      ).toMatchObject({
        countryId: prepared.fixture.countries.buyer,
        bucket: 'AVAILABLE',
      });
      expect(financial.legs.map((leg) => leg.amount.amount)).toEqual([
        '6',
        '6',
      ]);
      expect(financial.legs.map((leg) => leg.account.countryId).sort()).toEqual(
        [
          prepared.fixture.countries.seller,
          prepared.fixture.countries.buyer,
        ].sort(),
      );
    } finally {
      await local.close();
    }
  }, 30_000);

  it('rejects production-target flag before Worker execution', async () => {
    const prepared = preparedTwoCountryDelivery();
    const local = createPGliteV09AtomicTestDatabase();
    try {
      await expect(
        executeV29LocalWorkerDelivery({
          database: local,
          productionTarget: true as false,
          workerId: WORKER,
          deliveryCommand: prepared.delivery,
          observedAtReal: AT,
          source: prepared.source,
        }),
      ).rejects.toThrow(
        'only a disposable local PGlite Worker driver is allowed',
      );
    } finally {
      await local.close();
    }
  });

  it('cannot commit an unsubmitted command into an empty local database', async () => {
    const prepared = preparedTwoCountryDelivery();
    const local = await database();
    try {
      await expect(
        executeV29LocalWorkerDelivery({
          database: local,
          productionTarget: false,
          workerId: WORKER,
          deliveryCommand: prepared.delivery,
          observedAtReal: AT,
          source: prepared.source,
        }),
      ).rejects.toThrow();
      const durable = await local.query<{
        readonly events: string;
        readonly inventory: string;
        readonly financial: string;
        readonly receipts: string;
      }>(
        `select
           (select count(*)::text from world_v2.authoritative_event) as events,
           (select count(*)::text from world_v2.inventory_posting) as inventory,
           (select count(*)::text from world_v2.financial_posting_batch) as financial,
           (select count(*)::text from world_v2.command_receipt) as receipts`,
      );
      expect(durable.rows[0]).toEqual({
        events: '0',
        inventory: '0',
        financial: '0',
        receipts: '0',
      });
    } finally {
      await local.close();
    }
  }, 30_000);
});

describe('V29.3 preparation-only fresh-PGlite Worker replay evidence', () => {
  it('matches every durable fact hash after two independent initializations with the same test seed and command sequence', async () => {
    let initializations = 0;
    const evidence = await assertV29WorkerFixedSeedReplay({
      seed: 'V29_REPLAY_SEED_1',
      async createAndRunFreshDatabase(seed) {
        initializations += 1;
        return runFreshWorkerSequence(seed);
      },
    });
    expect(initializations).toBe(2);
    expect(evidence.sequenceHash).toBe(
      // The receipt instant is hashed in canonical UTC, not in the DB session zone.
      'sha256:c814790513c1e8d4fea354111dabd12c39d2051b56a084af01bb4555033cd44c',
    );
    expect(evidence).toMatchObject({
      status: 'LOCAL_PGLITE_FIXED_SEQUENCE_NOT_V29_3_ACCEPTANCE',
      seed: 'V29_REPLAY_SEED_1',
      commandCount: 2,
    });
    expect(evidence.steps[0]?.stepHash).toBe(evidence.steps[1]?.stepHash);
    expect(evidence.steps.every((step) => step.worldVersion === '3')).toBe(
      true,
    );
    const different = await assertV29WorkerFixedSeedReplay({
      seed: 'V29_REPLAY_SEED_2',
      createAndRunFreshDatabase: runFreshWorkerSequence,
    });
    expect(different.sequenceHash).not.toBe(evidence.sequenceHash);
  }, 60_000);

  it('replays identical durable hashes across UTC and Asia/Shanghai database sessions', async () => {
    let run = 0;
    const evidence = await assertV29WorkerFixedSeedReplay({
      seed: 'V29_CROSS_TZ_SEED',
      createAndRunFreshDatabase(seed) {
        run += 1;
        return runFreshWorkerSequence(
          seed,
          run === 1 ? 'UTC' : 'Asia/Shanghai',
        );
      },
    });
    expect(run).toBe(2);
    expect(evidence.commandCount).toBe(2);
    expect(evidence.steps[0]?.stepHash).toBe(evidence.steps[1]?.stepHash);
  }, 60_000);

  it('reports a reproducible seed/index/minimal hash trace on mismatch, without payloads', async () => {
    let run = 0;
    let error: unknown;
    try {
      await assertV29WorkerFixedSeedReplay({
        seed: 'V29_MISMATCH_SEED',
        createAndRunFreshDatabase(seed) {
          run += 1;
          return runFreshWorkerSequence(
            run === 1 ? seed : 'V29_DIFFERENT_SEED',
          );
        },
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(V29WorkerReplayMismatchError);
    const mismatch = error as V29WorkerReplayMismatchError;
    expect(mismatch.reproduction).toMatchObject({
      seed: 'V29_MISMATCH_SEED',
      commandIndex: 0,
      first: { worldVersion: '3' },
      second: { worldVersion: '3' },
    });
    expect(JSON.stringify(mismatch.reproduction)).not.toContain(
      '00000000-0000-4000-8000-000000000001',
    );
    expect(JSON.stringify(mismatch.reproduction)).not.toContain(
      'canonical_payload',
    );
    expect(mismatch.message).toContain('"eventHash"');
    expect(mismatch.message).not.toContain('canonical_payload');
  }, 60_000);

  it('fails a missing sequence with the same redacted reproduction envelope', async () => {
    await expect(
      assertV29WorkerFixedSeedReplay({
        seed: 'V29_EMPTY_SEED',
        async createAndRunFreshDatabase() {
          return [];
        },
      }),
    ).rejects.toMatchObject({
      reproduction: {
        seed: 'V29_EMPTY_SEED',
        commandIndex: 0,
        first: null,
        second: null,
      },
    });
  });

  it('redacts an execution error while retaining its seed and command index', async () => {
    let error: unknown;
    try {
      await assertV29WorkerFixedSeedReplay({
        seed: 'V29_STEP_FAILURE',
        async createAndRunFreshDatabase() {
          throw new V29WorkerReplayStepError(1);
        },
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(V29WorkerReplayMismatchError);
    expect((error as V29WorkerReplayMismatchError).reproduction).toMatchObject({
      seed: 'V29_STEP_FAILURE',
      commandIndex: 1,
      first: null,
      second: null,
    });
  });
});

describe('V29 preparation-only same-World sequential Worker deliveries', () => {
  it('commits two distinct two-country deliveries through Worker with separate durable numeric trails', async () => {
    const prepared = await preparedSequentialDeliveries('V29_TWO_DELIVERIES');
    expect(prepared.first.fixture.transferIntent.quantity.unit).toBe('tonne');
    const local = await database();
    try {
      await seedClaimedDelivery(local, prepared.deliveryA, '4');
      await seedAdditionalClaimedCommand(local, prepared.deliveryB);
      const first = await executeV29LocalWorkerDelivery({
        database: local,
        productionTarget: false,
        workerId: WORKER,
        deliveryCommand: prepared.deliveryA,
        observedAtReal: AT,
        source: prepared.sourceA,
      });
      const firstDurable = await readV29DurableWorkerStep({
        database: local,
        command: prepared.deliveryA,
        commandIndex: 0,
      });
      const second = await executeV29LocalWorkerDelivery({
        database: local,
        productionTarget: false,
        workerId: WORKER,
        deliveryCommand: prepared.deliveryB,
        observedAtReal: AT,
        source: prepared.sourceB,
      });
      const secondDurable = await readV29DurableWorkerStep({
        database: local,
        command: prepared.deliveryB,
        commandIndex: 1,
      });
      expect(first).toMatchObject({
        source: 'NEW_FINAL',
        worldVersion: '5',
        eventCount: 1,
        inventoryPostingCount: 1,
        financialPostingCount: 1,
        outboxCount: 1,
      });
      expect(second).toMatchObject({
        source: 'NEW_FINAL',
        worldVersion: '6',
        eventCount: 1,
        inventoryPostingCount: 1,
        financialPostingCount: 1,
        outboxCount: 1,
      });
      expect(first.receipt.commandId).not.toBe(second.receipt.commandId);
      expect(firstDurable.worldVersion).toBe('5');
      expect(secondDurable.worldVersion).toBe('6');
      expect(firstDurable.stepHash).not.toBe(secondDurable.stepHash);
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
      const retry = await executeV29LocalWorkerDelivery({
        database: local,
        productionTarget: false,
        workerId: WORKER,
        deliveryCommand: prepared.deliveryB,
        observedAtReal: AT,
        source: prepared.sourceB,
      });
      expect(retry.source).toBe('EXISTING_FINAL');
      expect(retry.durableTraceHash).toBe(second.durableTraceHash);
      expect(
        await readV29DurableWorkerStep({
          database: local,
          command: prepared.deliveryB,
          commandIndex: 1,
        }),
      ).toEqual(secondDurable);
      const postings = await local.query<{
        readonly command_id: string;
        readonly event: string;
        readonly inventory: string;
        readonly financial: string;
        readonly world_version_before: string;
        readonly world_version_after: string;
      }>(
        `select command_id,
                (select canonical_payload from world_v2.authoritative_event
                  where causation_command_id = command_id)::text as event,
                (select canonical_payload from world_v2.inventory_posting
                  where causation_command_id = command_id)::text as inventory,
                (select canonical_payload from world_v2.financial_posting_batch
                  where causation_command_id = command_id)::text as financial,
                world_version_before::text, world_version_after::text
           from world_v2.command_receipt
          where command_id in ($1, $2)
          order by world_version_after`,
        [prepared.deliveryA.commandId, prepared.deliveryB.commandId],
      );
      expect(postings.rows).toHaveLength(2);
      let deliveredTonnes = 0n;
      let settledGcu = 0n;
      for (const [index, row] of postings.rows.entries()) {
        const transfer =
          index === 0 ? prepared.first.transfer : prepared.transferB;
        const event = JSON.parse(row.event) as {
          readonly transferCommandId: string;
          readonly transferFingerprint: string;
        };
        expect(event).toMatchObject({
          transferCommandId: transfer.commandId,
          transferFingerprint: transfer.fingerprint,
        });
        expect(row.world_version_before).toBe(index === 0 ? '4' : '5');
        expect(row.world_version_after).toBe(index === 0 ? '5' : '6');
        const inventory = JSON.parse(row.inventory) as {
          readonly entries: readonly {
            readonly delta: { readonly amount: string };
            readonly account: {
              readonly countryId: string;
              readonly bucket: string;
            };
          }[];
        };
        const financial = JSON.parse(row.financial) as {
          readonly legs: readonly {
            readonly amount: { readonly amount: string };
            readonly direction: string;
            readonly account: { readonly countryId: string };
          }[];
        };
        expect(
          inventory.entries.map((entry) => entry.delta.amount).sort(),
        ).toEqual(['-2', '2']);
        expect(
          inventory.entries.find((entry) => entry.delta.amount === '2')
            ?.account,
        ).toMatchObject({
          countryId: prepared.first.fixture.countries.buyer,
          bucket: 'AVAILABLE',
        });
        deliveredTonnes += BigInt(
          inventory.entries.find((entry) => entry.delta.amount === '2')!.delta
            .amount,
        );
        expect(financial.legs.map((leg) => leg.amount.amount)).toEqual([
          '6',
          '6',
        ]);
        const buyerPayment = financial.legs.find(
          (leg) =>
            leg.account.countryId === prepared.first.fixture.countries.buyer,
        );
        expect(buyerPayment?.direction).toBe('CREDIT');
        settledGcu += BigInt(buyerPayment!.amount.amount);
        expect(
          financial.legs.map((leg) => leg.account.countryId).sort(),
        ).toEqual(
          [
            prepared.first.fixture.countries.seller,
            prepared.first.fixture.countries.buyer,
          ].sort(),
        );
      }
      expect(deliveredTonnes).toBe(4n);
      expect(settledGcu).toBe(12n);
      const counts = await local.query<{
        readonly events: string;
        readonly inventory: string;
        readonly financial: string;
        readonly receipts: string;
        readonly outbox: string;
        readonly world_version: string;
      }>(
        `select
           (select count(*)::text from world_v2.authoritative_event) as events,
           (select count(*)::text from world_v2.inventory_posting) as inventory,
           (select count(*)::text from world_v2.financial_posting_batch) as financial,
           (select count(*)::text from world_v2.command_receipt) as receipts,
           (select count(*)::text from world_v2.notification_outbox) as outbox,
           (select world_version::text from world_v2.world_head) as world_version`,
      );
      expect(counts.rows[0]).toEqual({
        events: '2',
        inventory: '2',
        financial: '2',
        receipts: '2',
        outbox: '2',
        world_version: '6',
      });
    } finally {
      await local.close();
    }
  }, 30_000);

  it('replays the same two-command Worker sequence and retry in two fresh PGlite worlds', async () => {
    let initializations = 0;
    const evidence = await assertV29WorkerFixedSeedReplay({
      seed: 'V29_TWO_DELIVERIES_REPLAY',
      async createAndRunFreshDatabase(seed) {
        initializations += 1;
        return runFreshSequentialWorkerSequence(seed);
      },
    });
    expect(initializations).toBe(2);
    expect(evidence.commandCount).toBe(3);
    expect(evidence.sequenceHash).toBe(
      'sha256:8638d34d83bc1dd44fa7f11a9404e7fd53077901dcaf4f1eb7db3105b0501ae2',
    );
    expect(evidence.steps.map((step) => step.worldVersion)).toEqual([
      '5',
      '6',
      '6',
    ]);
    expect(evidence.steps[0]?.stepHash).not.toBe(evidence.steps[1]?.stepHash);
    expect(evidence.steps[1]?.stepHash).toBe(evidence.steps[2]?.stepHash);
  }, 60_000);
});
