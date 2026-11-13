/** Mechanism-only server composition. No Clock source, production enrollment,
 * DB write or approved activation is fabricated by these tests. */
import { createHash, randomUUID } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import type { Pool } from 'pg';
import {
  createServerCommandHostBinding,
  type ServerCommandHostBinding,
  type ServerCommandHostDependencies,
} from '../../apps/world-worker/src/runtime-preparation/production-world-command-host.js';
import {
  createBoundedFinanceBudgetIntakeRuntime,
  createProductionBoundedFinanceBudgetIntakeRuntime,
} from '../../apps/world-worker/src/intake/prepared-finance-budget-intake-runtime.js';
import {
  boundManualOfficeIntakeRuntime,
  manualOfficeIntakeRuntimeSupportsFamily,
  preflightManualOfficeIntakeRuntime,
} from '../../apps/world-worker/src/intake/manual-office-intake-runtime.js';
import { createPostgresFinanceBudgetCapacitySource } from '../../apps/world-worker/src/persistence/postgres-finance-budget-capacity-source.js';
import type { CanonicalCommand } from '@econmind/core';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function fixture() {
  let queries = 0,
    connections = 0,
    clockReads = 0;
  const worldId =
    'WORLD_FORMAL_FINANCE_' + randomUUID().replaceAll('-', '').toUpperCase();
  const pool = () =>
    ({
      async connect() {
        connections++;
        throw Error('NO_DB_CONNECT_EXPECTED');
      },
    }) as unknown as Pick<Pool, 'connect'>;
  const database = {
    async query<Row extends object>(): Promise<{
      rows: Row[];
      rowCount: number;
    }> {
      queries++;
      throw Error('NO_DB_QUERY_EXPECTED');
    },
    async transaction<T>(): Promise<T> {
      queries++;
      throw Error('NO_DB_TRANSACTION_EXPECTED');
    },
  };
  const input: ServerCommandHostDependencies = {
    worldId,
    workerId: 'WORKER_FINITE_FORMAL',
    seedRef: 'SEED_FORMAL',
    contentHash: 'sha256:' + 'a'.repeat(64),
    admissionRef: 'ADMISSION_FORMAL',
    modelVersion: 'world-v2-foundation-1',
    intakePool: pool(),
    sourcePool: pool(),
    readerRole: 'formal_bounded_reader',
    authorizationPublisherRole: 'formal_authorization_publisher',
    workerDatabase: database,
    clock: Object.freeze({
      nowReal() {
        clockReads++;
        return '2026-10-29T00:00:00.000Z';
      },
      async simTime() {
        clockReads++;
        return '0';
      },
    }),
    resolveActorId: async () => null,
    readers: {},
    financeCapacitySource: createPostgresFinanceBudgetCapacitySource({
      worldId,
      countryId: 'COUNTRY_01',
      historyMode: 'BUDGET_SOCIAL',
    }),
  };
  return { input, counts: () => ({ queries, connections, clockReads }) };
}
const blocked = 'FORMAL_CLOCK_SOURCE_CONTROL_AND_SOLE_CONSUMER_NOT_REGISTERED';
describe('registered finite Finance server composition remains closed without formal originals', () => {
  it('installs fixed genuine Finance source without local/CI relabelling, callbacks or IO', async () => {
    const f = fixture(),
      binding = createServerCommandHostBinding(f.input),
      s = createProductionBoundedFinanceBudgetIntakeRuntime({ binding });
    try {
      expect(
        boundManualOfficeIntakeRuntime(s.runtime, {
          pool: f.input.intakePool,
          clock: f.input.clock,
          worldId: f.input.worldId,
        }),
      ).toBe(true);
      expect(s.diagnostics()).toMatchObject({
        status: 'REGISTERED_FINITE_FINANCE_NOT_ACTIVATION',
        blocker: blocked,
        commandExecutionEnabled: false,
      });
      expect(await s.runtime.consumer.consumeOnce()).toMatchObject({
        status: 'BLOCKED',
        reason: blocked,
      });
      expect(f.counts()).toEqual({ queries: 0, connections: 0, clockReads: 0 });
      expect(() => s.runtime.consumer.startPreparation()).toThrow(
        'cannot be activated through preparation',
      );
    } finally {
      await s.runtime.consumer.stop();
    }
  });
  it('does not turn callbacks, known source selection, or a source-looking object into Clock/consumer authority', async () => {
    const f = fixture(),
      s = createProductionBoundedFinanceBudgetIntakeRuntime({
        binding: createServerCommandHostBinding(f.input),
      });
    try {
      for (const family of [
        'CORE_FINANCE_BUDGET_APPROPRIATION_V1',
        'CORE_SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATE_V1',
        'CORE_GOODS_TRANSFER_V1',
        'CORE_CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1',
      ])
        expect(manualOfficeIntakeRuntimeSupportsFamily(s.runtime, family)).toBe(
          false,
        );
      expect(
        await preflightManualOfficeIntakeRuntime(
          s.runtime,
          {
            commandType: 'CORE_FINANCE_BUDGET_APPROPRIATION_V1',
            worldId: f.input.worldId,
          } as CanonicalCommand,
          '2026-10-29T00:00:00.000Z',
        ),
      ).toBe(false);
      expect(f.counts()).toEqual({ queries: 0, connections: 0, clockReads: 0 });
    } finally {
      await s.runtime.consumer.stop();
    }
  });
  it('rejects copied and forged server bindings before source or SQL', () => {
    const f = fixture(),
      binding = createServerCommandHostBinding(f.input);
    for (const fake of [
      {},
      { ...binding },
      { registered: true, READY: true, environment: 'ci' },
    ])
      expect(() =>
        createProductionBoundedFinanceBudgetIntakeRuntime({
          binding: fake as ServerCommandHostBinding,
        }),
      ).toThrow('REGISTERED_FIXED_FINANCE_SERVER_BINDING_REQUIRED');
    expect(f.counts().queries).toBe(0);
  });
  it('rejects generic source objects and genuine capacity ports for another World', () => {
    const f = fixture();
    for (const source of [
      {},
      createPostgresFinanceBudgetCapacitySource({
        worldId: 'WORLD_OTHER',
        countryId: 'COUNTRY_01',
      }),
    ])
      expect(() =>
        createServerCommandHostBinding({
          ...f.input,
          financeCapacitySource: source as typeof f.input.financeCapacitySource,
        }),
      ).toThrow('SERVER_COMMAND_DEPENDENCIES_REQUIRED');
  });
  it('reserves one finite composition per World in this process and releases only on stop', async () => {
    const f = fixture(),
      binding = createServerCommandHostBinding(f.input),
      s = createProductionBoundedFinanceBudgetIntakeRuntime({ binding });
    expect(() =>
      createProductionBoundedFinanceBudgetIntakeRuntime({ binding }),
    ).toThrow('SERVER_WORLD_FINITE_CONSUMER_ALREADY_BOUND');
    await s.runtime.consumer.stop();
    expect(s.runtime.consumer.state()).toBe('STOPPED');
    expect((await s.runtime.consumer.consumeOnce()).status).toBe('BLOCKED');
    const next = createProductionBoundedFinanceBudgetIntakeRuntime({ binding });
    await next.runtime.consumer.stop();
    expect(f.counts()).toEqual({ queries: 0, connections: 0, clockReads: 0 });
  });
  it('keeps the original preparation constructor production deny rule unchanged', () => {
    const f = fixture();
    expect(() =>
      createBoundedFinanceBudgetIntakeRuntime({
        worldId: f.input.worldId,
        workerId: f.input.workerId,
        intakePool: f.input.intakePool,
        workerDatabase: f.input.workerDatabase,
        clock: f.input.clock,
        sha256Hex: sha,
        environment: { ECONMIND_ENV: 'production' },
        capacitySource: f.input.financeCapacitySource!,
      }),
    ).toThrow('local/CI only');
  });
  it('does not recognize a structural runtime copy as intake registration', async () => {
    const f = fixture(),
      s = createProductionBoundedFinanceBudgetIntakeRuntime({
        binding: createServerCommandHostBinding(f.input),
      });
    try {
      expect(
        boundManualOfficeIntakeRuntime(
          { ...s.runtime },
          {
            pool: f.input.intakePool,
            clock: f.input.clock,
            worldId: f.input.worldId,
          },
        ),
      ).toBe(false);
    } finally {
      await s.runtime.consumer.stop();
    }
  });
});
