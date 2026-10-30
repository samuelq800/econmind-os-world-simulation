/** Fixed genuine constructors over protocol-only transport. Selected source
 * adoption is real, but no source is published/prepared and no SQL engine,
 * economic command, Clock loop, production authority or native pass is used. */
import { createHash } from 'node:crypto';
import path from 'node:path';
import type { Pool } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COMMAND_SCHEMA_VERSION, parseCanonicalCommand } from '@econmind/core';
import { createFinanceSocialCommandConsumptionPreparation } from '../../apps/world-worker/src/preparation/durable-command-consumption.js';
import {
  createPostwarSocialRuntimeConnection,
  loadPostwarSocialConnectionOpeningAdoption,
} from '../../apps/world-worker/src/runtime-preparation/social-runtime-connection.js';
import {
  createPostwarFinanceSocialRuntimeConnection,
  readPostwarFinanceSocialRuntimeBinding,
  type FinanceSocialSourceBinding,
} from '../../apps/world-worker/src/runtime-preparation/finance-social-runtime-connection.js';
import { createPostgresFinanceBudgetWorldCapacitySource } from '../../apps/world-worker/src/persistence/postgres-finance-budget-capacity-source.js';
import { DurableV08LedgerLineageReader } from '../../apps/world-worker/src/persistence/durable-v08-ledger-lineage-reader.js';
import { isBoundedFinanceBudgetIntakeRuntime } from '../../apps/world-worker/src/intake/prepared-finance-budget-intake-runtime.js';
import { boundManualOfficeIntakeRuntime } from '../../apps/world-worker/src/intake/manual-office-intake-runtime.js';
import * as reservation from '../../apps/world-worker/src/preparation/local-narrow-reservation-worker.js';
import * as shipment from '../../apps/world-worker/src/persistence/sql-narrow-treasury-gcu-shipment-preparation-source.js';
import * as delivery from '../../apps/world-worker/src/persistence/sql-narrow-treasury-gcu-delivery-preparation-source.js';
const adoption = await loadPostwarSocialConnectionOpeningAdoption(
  path.resolve(import.meta.dirname, '../..'),
);
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const at = '2026-10-29T00:00:00.000Z';
let serial = 0;
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function harness(
  type = 'UNKNOWN_TEST_ONLY_ECONOMY',
  forcedWorld?: string,
  withFx = false,
) {
  const world = forcedWorld ?? `WORLD_TEST_ONLY_FIXED_CONSUMER_${++serial}`;
  const makeCommand = (commandType: string, suffix: string) =>
    parseCanonicalCommand(
      {
        schemaVersion: COMMAND_SCHEMA_VERSION,
        worldId: world,
        countryId: 'COUNTRY_01',
        commandId: `COMMAND_${suffix}`,
        idempotencyKey: `KEY_${suffix}`,
        actorId: 'ACTOR_TEST_ONLY',
        authSubject: '11111111-1111-4111-8111-111111111111',
        officeId:
          commandType === 'CORE_GOODS_DELIVERY_V1' ||
          commandType === 'CORE_GOODS_SHIPMENT_V1'
            ? null
            : commandType.startsWith('CAPTAIN_')
              ? 'CAPTAIN'
              : 'FINANCE',
        commandType,
        expectedWorldVersion: '0',
        simTime: '10',
        submittedAtReal: at,
        correlationId: 'CORRELATION_TEST_ONLY',
        payload: { classification: 'TEST_ONLY_BOUNDARY' },
      },
      sha,
    );
  const first = makeCommand(type, 'A_TEST_ONLY_HEAD'),
    later = makeCommand(
      'CORE_FINANCE_BUDGET_APPROPRIATION_V1',
      'B_TEST_ONLY_LATER',
    );
  const statements: { sql: string; parameters: readonly unknown[] }[] = [];
  let selectorGate: Promise<void> | null = null;
  const entered = deferred();
  const query = vi.fn(
    async (sql: string, parameters: readonly unknown[] = []) => {
      statements.push({ sql, parameters });
      if (sql.includes('from world_v2.command_queue')) {
        entered.resolve();
        if (selectorGate) await selectorGate;
        return {
          rows: [
            {
              command_id: first.commandId,
              authority_kind: 'VERSIONED_AUTOMATIC',
              queue_state: 'PENDING',
              available_at_sim_time: '10',
              claimed_by: null,
              claim_fencing_token: null,
            },
          ],
          rowCount: 1,
        };
      }
      if (
        [
          'begin',
          'commit',
          'rollback',
          'set transaction isolation level repeatable read',
        ].includes(sql)
      )
        return { rows: [], rowCount: 0 };
      throw Error(`UNEXPECTED_PROTOCOL_SQL:${sql}`);
    },
  );
  const release = vi.fn(),
    end = vi.fn();
  const workerPool = {
    query,
    connect: vi.fn(async () => ({ query, release })),
    end,
  } as unknown as Pool;
  const intakePool = {
    connect: vi.fn(async () => {
      throw Error('NO_INTAKE_EXPECTED');
    }),
  };
  const social = createPostwarSocialRuntimeConnection({
    worldId: world,
    workerId: 'WORKER_TEST_ONLY_SHARED',
    workerPool,
    workerRole: 'fixture_shared_boundary_worker',
    openingAdoption: adoption,
  });
  const configuration = {
    socialConnection: social,
    capacitySource: createPostgresFinanceBudgetWorldCapacitySource({
      worldId: world,
      countries: [{ countryId: 'COUNTRY_01' }],
      historyMode: 'BUDGET_SOCIAL',
    }),
    intakePool,
    clock: Object.freeze({
      nowReal: () => at,
      simTime: vi.fn(async () => '10'),
    }),
    environment: 'ci' as const,
    ...(withFx
      ? { treasuryFx: { workerRole: 'fixture_shared_boundary_worker' } }
      : {}),
  };
  const connection = createPostwarFinanceSocialRuntimeConnection(configuration);
  const ports = readPostwarFinanceSocialRuntimeBinding(connection);
  const read = vi
    .spyOn(DurableV08LedgerLineageReader.prototype, 'readCommandFrom')
    .mockImplementation(async (_executor, _world, id) => {
      if (id !== first.commandId)
        throw Error('LATER_QUEUE_ENTRY_MUST_NOT_BE_READ');
      return first;
    });
  return {
    connection,
    configuration,
    ports,
    social,
    workerPool,
    world,
    first,
    later,
    statements,
    read,
    release,
    end,
    entered,
    setSelectorGate(gate: Promise<void>) {
      selectorGate = gate;
    },
  };
}
afterEach(() => vi.restoreAllMocks());
describe('fixed Finance/Social global FIFO boundary', () => {
  it('requires the genuine combined issuer and keeps the exact manual/Finance identities', async () => {
    expect(() =>
      createFinanceSocialCommandConsumptionPreparation(
        {} as FinanceSocialSourceBinding,
      ),
    ).toThrow('GENUINE_FINANCE_SOCIAL_SOURCE_BINDING');
    const h = harness();
    try {
      expect(() =>
        readPostwarFinanceSocialRuntimeBinding({ ...h.connection }),
      ).toThrow('GENUINE_FINANCE_SOCIAL_RUNTIME_CONNECTION');
      expect(isBoundedFinanceBudgetIntakeRuntime(h.ports.runtime)).toBe(true);
      expect(isBoundedFinanceBudgetIntakeRuntime({ ...h.ports.runtime })).toBe(
        false,
      );
      expect(
        boundManualOfficeIntakeRuntime(h.ports.runtime, {
          pool: h.ports.intakePool,
          clock: h.ports.clock,
          worldId: h.world,
        }),
      ).toBe(true);
      expect(
        boundManualOfficeIntakeRuntime(h.ports.runtime, {
          pool: h.configuration.intakePool,
          clock: h.ports.clock,
          worldId: h.world,
        }),
      ).toBe(false);
      expect(h.statements).toEqual([]);
      expect(await h.ports.runtime.consumer.consumeOnce()).toMatchObject({
        status: 'BLOCKED',
        reason: 'LIFECYCLE_PREPARED',
      });
      expect(() => h.connection.startPreparation()).toThrow(
        'FINANCE_SOCIAL_SOURCE_NOT_PREPARED',
      );
      expect(() =>
        createPostwarFinanceSocialRuntimeConnection({
          ...h.configuration,
          environment: 'production' as 'ci',
        }),
      ).toThrow('FINANCE_SOCIAL_LOCAL_CI_ONLY');
    } finally {
      await h.connection.stop();
    }
    expect(h.end).not.toHaveBeenCalled();
  });
  it.each(
    [
      'UNKNOWN_TEST_ONLY_ECONOMY',
      'CORE_GOODS_TRANSFER_V1',
      'CORE_GOODS_SHIPMENT_V1',
      'CORE_GOODS_DELIVERY_V1',
      'CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1',
    ].flatMap((type) => [false, true].map((withFx) => ({ type, withFx }))),
  )(
    'blocks $type with FX=$withFx at the true global queue head without source reads, claim, writes or a legacy goods constructor',
    async ({ type, withFx }) => {
      const reserve = vi.spyOn(
          reservation,
          'createLocalNarrowReservationWorker',
        ),
        ship = vi.spyOn(
          shipment,
          'createSqlNarrowTreasuryGcuShipmentCandidateFactory',
        ),
        deliver = vi.spyOn(
          delivery,
          'createSqlNarrowTreasuryGcuDeliveryCandidateFactory',
        );
      const h = harness(type, undefined, withFx);
      try {
        const consumer = h.ports.runtime.consumer;
        consumer.startPreparation(); // TEST_ONLY local engine lifecycle; source remains unprepared.
        for (let i = 0; i < 2; i++)
          expect(await consumer.consumeOnce()).toEqual({
            status: 'BLOCKED',
            reason: 'FINANCE_SOCIAL_FAMILY_NOT_INSTALLED',
            commandId: h.first.commandId,
          });
        const selectors = h.statements.filter((s) =>
          s.sql.includes('from world_v2.command_queue'),
        );
        expect(selectors).toHaveLength(2);
        for (const selected of selectors) {
          expect(selected.parameters).toEqual([h.world, '10']);
          expect(selected.sql).toContain(
            'order by available_at_sim_time, priority_rank, command_id limit 1',
          );
          expect(selected.sql).not.toMatch(
            /command_type|office_id|skip locked/iu,
          );
        }
        expect(h.read.mock.calls.map((call) => call[2])).toEqual([
          h.first.commandId,
          h.first.commandId,
        ]);
        expect(
          h.statements.some((s) =>
            /^\s*(insert|update|delete)\b/iu.test(s.sql),
          ),
        ).toBe(false);
        expect(
          h.statements.some((s) =>
            /lease|source|authorization|for update/iu.test(s.sql),
          ),
        ).toBe(false);
        expect(reserve).not.toHaveBeenCalled();
        expect(ship).not.toHaveBeenCalled();
        expect(deliver).not.toHaveBeenCalled();
        expect(h.first.expectedWorldVersion).toBe('0');
        expect(h.later.expectedWorldVersion).toBe('0');
      } finally {
        await h.connection.stop();
      }
    },
  );
  it('allows one pending finite step, joins it at stop, and retains the World reservation until drain completes', async () => {
    const h = harness(),
      gate = deferred();
    h.setSelectorGate(gate.promise);
    const consumer = h.ports.runtime.consumer;
    consumer.startPreparation();
    const first = consumer.consumeOnce();
    await h.entered.promise;
    expect(await consumer.consumeOnce()).toMatchObject({
      status: 'BLOCKED',
      reason: 'STEP_ALREADY_RUNNING',
    });
    let stopped = false;
    const stopping = h.connection.stop().then(() => {
      stopped = true;
    });
    expect(consumer.state()).toBe('STOPPING');
    expect(() =>
      createPostwarFinanceSocialRuntimeConnection(h.configuration),
    ).toThrow();
    await Promise.resolve();
    expect(stopped).toBe(false);
    gate.resolve();
    expect(await first).toMatchObject({
      status: 'BLOCKED',
      reason: 'FINANCE_SOCIAL_FAMILY_NOT_INSTALLED',
    });
    await stopping;
    expect(stopped).toBe(true);
    expect(consumer.state()).toBe('STOPPED');
    expect(h.end).not.toHaveBeenCalled();
    expect(() =>
      readPostwarFinanceSocialRuntimeBinding(h.connection),
    ).toThrow();
    const restarted = harness('UNKNOWN_TEST_ONLY_ECONOMY', h.world);
    try {
      expect(restarted.ports.runtime.consumer.state()).toBe('PREPARED');
    } finally {
      await restarted.connection.stop();
    }
  });
});
