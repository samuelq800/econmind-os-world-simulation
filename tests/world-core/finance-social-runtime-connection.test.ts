/** Fixed issuer and ownership protocol. No DB source/admission is fabricated;
 * real ordered Finance/Social execution is verified by the native fixture. */
import { beforeAll, describe, it, expect } from 'vitest';
import type { Pool } from 'pg';
import {
  createPostwarSocialRuntimeConnection,
  loadPostwarSocialConnectionOpeningAdoption,
  type OfficialLabourSocialOpeningAdoption,
} from '../../apps/world-worker/src/runtime-preparation/social-runtime-connection.js';
import {
  createPostwarFinanceSocialRuntimeConnection,
  readPostwarFinanceSocialRuntimeBinding,
  isPostwarFinanceSocialRuntimeConnection,
  readFinanceSocialSourceBinding,
} from '../../apps/world-worker/src/runtime-preparation/finance-social-runtime-connection.js';
import {
  createPostgresFinanceBudgetWorldCapacitySource,
  createPostgresFinanceBudgetCapacitySource,
} from '../../apps/world-worker/src/persistence/postgres-finance-budget-capacity-source.js';
import { isBoundedFinanceBudgetIntakeRuntime } from '../../apps/world-worker/src/intake/prepared-finance-budget-intake-runtime.js';
import { boundManualOfficeIntakeRuntime } from '../../apps/world-worker/src/intake/manual-office-intake-runtime.js';
import { OFFICE_COMMAND_CURRENT_BINDING_QUERY } from '../../apps/world-worker/src/intake/postgres-office-command-intake.js';
let openingAdoption: OfficialLabourSocialOpeningAdoption;
beforeAll(async () => {
  openingAdoption = await loadPostwarSocialConnectionOpeningAdoption(
    process.cwd(),
  );
});
function transport() {
  const queries: string[] = [],
    client = {
      query: async (sql: string) => {
        queries.push(sql);
        return { rows: [], rowCount: 0 };
      },
      release: () => {},
    };
  const pool = {
    query: client.query,
    connect: async () => client,
    end: async () => {
      throw Error('borrowed pool must not end');
    },
  } as unknown as Pool;
  return { pool, queries };
}
function fixtures(worldId: string) {
  const worker = transport(),
    intake = transport(),
    clock = Object.freeze({
      nowReal: () => '2026-10-29T00:00:00.000Z',
      simTime: async () => '2000',
    });
  const social = createPostwarSocialRuntimeConnection({
    worldId,
    workerId: 'WORKER_SHARED_TEST',
    workerPool: worker.pool,
    workerRole: 'worker_shared_test',
    openingAdoption,
  });
  const capacitySource = createPostgresFinanceBudgetWorldCapacitySource({
    worldId,
    countries: [{ countryId: 'COUNTRY_01' }],
    historyMode: 'BUDGET_SOCIAL',
  });
  return {
    worker,
    intake,
    clock,
    social,
    input: {
      socialConnection: social,
      capacitySource,
      intakePool: intake.pool,
      clock,
      environment: 'ci' as const,
    },
  };
}
describe('fixed Finance/Social single World issuer', () => {
  it('constructs one genuine runtime with exact shared pool/clock identity and no SQL/start', async () => {
    const f = fixtures('WORLD_SHARED_IDENTITY'),
      connection = createPostwarFinanceSocialRuntimeConnection(f.input),
      ports = readPostwarFinanceSocialRuntimeBinding(connection);
    try {
      expect(
        isPostwarFinanceSocialRuntimeConnection(connection, connection.worldId),
      ).toBe(true);
      expect(
        isPostwarFinanceSocialRuntimeConnection(
          { ...connection },
          connection.worldId,
        ),
      ).toBe(false);
      expect(
        isPostwarFinanceSocialRuntimeConnection(connection, 'WORLD_OTHER'),
      ).toBe(false);
      expect(() =>
        readPostwarFinanceSocialRuntimeBinding({ ...connection }),
      ).toThrow('GENUINE_FINANCE_SOCIAL');
      expect(() => readFinanceSocialSourceBinding({} as never)).toThrow(
        'GENUINE_FINANCE_SOCIAL_SOURCE_BINDING',
      );
      expect(ports.runtime.consumer.state()).toBe('PREPARED');
      expect(isBoundedFinanceBudgetIntakeRuntime(ports.runtime)).toBe(true);
      expect(ports.rawIntakePool).toBe(f.intake.pool);
      expect(ports.workerPool).toBe(f.worker.pool);
      expect(ports.clock).toBe(f.clock);
      expect(
        boundManualOfficeIntakeRuntime(ports.runtime, {
          pool: ports.intakePool,
          clock: f.clock,
          worldId: connection.worldId,
        }),
      ).toBe(true);
      expect(
        boundManualOfficeIntakeRuntime(ports.runtime, {
          pool: f.intake.pool,
          clock: f.clock,
          worldId: connection.worldId,
        }),
      ).toBe(false);
      expect(
        boundManualOfficeIntakeRuntime(ports.runtime, {
          pool: ports.intakePool,
          clock: Object.freeze({ ...f.clock }),
          worldId: connection.worldId,
        }),
      ).toBe(false);
      expect(f.worker.queries).toEqual([]);
      expect(f.intake.queries).toEqual([]);
      expect(() => connection.startPreparation()).toThrow(
        'SOURCE_NOT_PREPARED',
      );
      expect(() => connection.consumeOnce()).toThrow('SOURCE_NOT_PREPARED');
    } finally {
      await connection.stop();
    }
    expect(
      isPostwarFinanceSocialRuntimeConnection(connection, connection.worldId),
    ).toBe(false);
    expect(() => readPostwarFinanceSocialRuntimeBinding(connection)).toThrow();
  });
  it('uses one fixed adapter stack for both exact Office intake lock queries', async () => {
    const f = fixtures('WORLD_SHARED_INTAKE'),
      connection = createPostwarFinanceSocialRuntimeConnection(f.input);
    try {
      const ports = readPostwarFinanceSocialRuntimeBinding(connection),
        client = await ports.intakePool.connect();
      const sql =
        OFFICE_COMMAND_CURRENT_BINDING_QUERY +
        ' for share of authz,entitlement';
      await client.query(sql, [
        'WORLD_SHARED_INTAKE',
        '11111111-1111-4111-8111-111111111111',
        'COUNTRY_01',
        'FINANCE',
        'SEAT_F',
        '1',
        'FINANCE_BUDGET',
        'SCOPE_F',
      ]);
      await client.query(sql, [
        'WORLD_SHARED_INTAKE',
        '11111111-1111-4111-8111-111111111111',
        'COUNTRY_01',
        'SOCIAL',
        'SEAT_S',
        '1',
        'SOCIAL_LABOUR',
        'SCOPE_S',
      ]);
      await client.query('select protocol_passthrough');
      client.release();
      expect(f.intake.queries).toEqual([
        'select * from world_v2.lock_finance_budget_intake_binding($1,$2::uuid,$3,$4,$5,$6,$7,$8)',
        'select * from world_v2.lock_social_intake_binding($1,$2::uuid,$3,$4,$5,$6,$7,$8)',
        'select protocol_passthrough',
      ]);
    } finally {
      await connection.stop();
    }
  });
  it('keeps global ownership until full stop and rejects competing or independent consumers', async () => {
    const f = fixtures('WORLD_SHARED_OWNER'),
      connection = createPostwarFinanceSocialRuntimeConnection(f.input),
      other = fixtures('WORLD_SHARED_OWNER');
    try {
      expect(() =>
        createPostwarFinanceSocialRuntimeConnection(other.input),
      ).toThrow('WORLD_CONSUMER_ALREADY_BOUND');
      expect(() =>
        f.social.createPreparedIntake({
          environment: 'ci',
          intakePool: f.intake.pool,
          clock: f.clock,
        }),
      ).toThrow('SHARED_CONSUMER_ALREADY_BOUND');
      await expect(f.social.close()).rejects.toThrow('OWNER_MUST_STOP_FIRST');
      const stopping = connection.stop();
      expect(() =>
        createPostwarFinanceSocialRuntimeConnection(other.input),
      ).toThrow('WORLD_CONSUMER_ALREADY_BOUND');
      await stopping;
      const replacement = createPostwarFinanceSocialRuntimeConnection(
        other.input,
      );
      await replacement.stop();
    } finally {
      await connection.stop();
      await other.social.close();
    }
  });
  it('rejects forged/mismatched sources and actual production environment without SQL', async () => {
    const f = fixtures('WORLD_SHARED_NEGATIVE');
    try {
      expect(() =>
        createPostwarFinanceSocialRuntimeConnection({
          ...f.input,
          socialConnection: { ...f.social },
        }),
      ).toThrow('GENUINE_SOCIAL');
      expect(() =>
        createPostwarFinanceSocialRuntimeConnection({
          ...f.input,
          environment: 'production' as never,
        }),
      ).toThrow('LOCAL_CI_ONLY');
      expect(() =>
        createPostwarFinanceSocialRuntimeConnection({
          ...f.input,
          clock: { ...f.clock },
        }),
      ).toThrow('IMMUTABLE_SERVER_CLOCK');
      expect(() =>
        createPostwarFinanceSocialRuntimeConnection({
          ...f.input,
          intakePool: f.worker.pool,
        }),
      ).toThrow('SEPARATE_INTAKE');
      expect(() =>
        createPostwarFinanceSocialRuntimeConnection({
          ...f.input,
          capacitySource: createPostgresFinanceBudgetCapacitySource({
            worldId: f.social.worldId,
            countryId: 'COUNTRY_01',
          }),
        }),
      ).toThrow('GENUINE_FINITE_WORLD');
      expect(() =>
        createPostwarFinanceSocialRuntimeConnection({
          ...f.input,
          capacitySource: createPostgresFinanceBudgetWorldCapacitySource({
            worldId: 'WORLD_FOREIGN',
            countries: [{ countryId: 'COUNTRY_01' }],
            historyMode: 'BUDGET_SOCIAL',
          }),
        }),
      ).toThrow('GENUINE_FINITE_WORLD');
      expect(() =>
        createPostwarFinanceSocialRuntimeConnection({
          ...f.input,
          capacitySource: createPostgresFinanceBudgetWorldCapacitySource({
            worldId: f.social.worldId,
            countries: [{ countryId: 'COUNTRY_99' }],
            historyMode: 'BUDGET_SOCIAL',
          }),
        }),
      ).toThrow('EXACT_COUNTRY_SCOPE');
      expect(f.worker.queries).toEqual([]);
      expect(f.intake.queries).toEqual([]);
    } finally {
      await f.social.close();
    }
  });
  it('releases constructor reservation on failure without creating an extra runtime', async () => {
    const f = fixtures('WORLD_SHARED_CONSTRUCT_FAIL');
    f.social.createPreparedIntake({
      environment: 'ci',
      intakePool: f.intake.pool,
      clock: f.clock,
    });
    expect(() => createPostwarFinanceSocialRuntimeConnection(f.input)).toThrow(
      'SOCIAL_SOURCE_CONSUMER_ALREADY_BOUND',
    );
    const replacement = fixtures(f.social.worldId),
      owner = createPostwarFinanceSocialRuntimeConnection(replacement.input);
    await owner.stop();
    await f.social.close();
  });
  it('waits for actual in-flight preparation rollback before releasing the World owner', async () => {
    const f = fixtures('WORLD_SHARED_PREPARE_STOP');
    let enteredResolve!: () => void, releaseResolve!: () => void;
    const entered = new Promise<void>((resolve) => {
        enteredResolve = resolve;
      }),
      hold = new Promise<void>((resolve) => {
        releaseResolve = resolve;
      });
    f.worker.pool.connect = (async () => ({
      query: async (sql: string) => {
        f.worker.queries.push(sql);
        if (sql === 'begin') {
          enteredResolve();
          await hold;
        }
        return { rows: [], rowCount: 0 };
      },
      release: () => {},
    })) as Pool['connect'];
    const connection = createPostwarFinanceSocialRuntimeConnection(f.input),
      other = fixtures(f.social.worldId);
    const preparing = connection
      .prepare({
        observedAtReal: '2026-10-29T00:00:00.000Z',
        admittedWorldPins: {
          worldId: f.social.worldId,
          seedRef: 'SEED_TEST',
          contentHash: 'sha256:' + '1'.repeat(64),
          admissionRef: 'ADMISSION_TEST',
        },
        modelVersion: 'MODEL_TEST',
      })
      .then(
        () => null,
        (error) => error,
      );
    await entered;
    let stopped = false;
    const stopping = connection.stop().then(() => {
      stopped = true;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(stopped).toBe(false);
    expect(() =>
      createPostwarFinanceSocialRuntimeConnection(other.input),
    ).toThrow('WORLD_CONSUMER_ALREADY_BOUND');
    releaseResolve();
    expect(await preparing).toBeInstanceOf(Error);
    await stopping;
    expect(f.worker.queries).toContain('rollback');
    expect(
      isPostwarFinanceSocialRuntimeConnection(connection, connection.worldId),
    ).toBe(false);
    const replacement = createPostwarFinanceSocialRuntimeConnection(
      other.input,
    );
    await replacement.stop();
  });
});
