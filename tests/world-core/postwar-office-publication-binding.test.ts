/** Lifecycle protocol, not economic/source acceptance. The bounded engine,
 * fixed publication helper and prepared-state predicate are mocked; server
 * construction still issues the genuine same-World binding. No SQL or Clock
 * is started. */
import type { Pool } from 'pg';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPostwarSocialRuntimeConnection,
  isPostwarSocialRuntimeConnection,
  loadPostwarSocialConnectionOpeningAdoption,
  type OfficialLabourSocialOpeningAdoption,
} from '../../apps/world-worker/src/runtime-preparation/social-runtime-connection.js';
import {
  createPostwarFinanceSocialRuntimeConnection,
  readPostwarFinanceSocialRuntimeBinding,
} from '../../apps/world-worker/src/runtime-preparation/finance-social-runtime-connection.js';
import { createPostgresFinanceBudgetWorldCapacitySource } from '../../apps/world-worker/src/persistence/postgres-finance-budget-capacity-source.js';
const hooks = vi.hoisted(() => ({ engine: vi.fn(), publication: vi.fn() }));
vi.mock(
  '../../apps/world-worker/src/intake/prepared-finance-budget-intake-runtime.js',
  () => ({ createBoundedFinanceSocialIntakeRuntime: hooks.engine }),
);
vi.mock(
  '../../apps/world-worker/src/persistence/postwar-office-publication-controller.js',
  () => ({ createPostwarOfficePublicationController: hooks.publication }),
);
vi.mock(
  '../../apps/world-worker/src/persistence/prepared-postwar-social-source.js',
  async (original) => ({
    ...(await original<
      typeof import('../../apps/world-worker/src/persistence/prepared-postwar-social-source.js')
    >()),
    isPreparedPostwarSocialSource: () => true,
  }),
);
let adoption: OfficialLabourSocialOpeningAdoption;
let serial = 0;
beforeAll(async () => {
  adoption = await loadPostwarSocialConnectionOpeningAdoption(process.cwd());
});
beforeEach(() => vi.resetAllMocks());
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}
function fixture() {
  const events: string[] = [],
    world = `WORLD_PUB_BINDING_PROTOCOL_${++serial}`;
  const worker = {
    connect: vi.fn(),
    query: vi.fn(),
    end: vi.fn(),
  } as unknown as Pool;
  const intake = { connect: vi.fn() } as unknown as Pool;
  const social = createPostwarSocialRuntimeConnection({
    worldId: world,
    workerId: 'WORKER_PUB_PROTOCOL',
    workerRole: 'worker_pub_protocol',
    workerPool: worker,
    openingAdoption: adoption,
  });
  const step = { status: 'IDLE' as const };
  const consumer = {
    state: () => 'PREPARED',
    startPreparation: vi.fn(),
    consumeOnce: vi.fn(async () => {
      events.push('consume');
      return step;
    }),
    stop: vi.fn(async () => {
      events.push('consumer:stop');
    }),
  };
  const publication = {
    afterCommitted: vi.fn(async (value: unknown) => {
      events.push('publish');
      return value;
    }),
    retryCommitted: vi.fn(async (commandId: string) => {
      events.push('retry');
      return {
        status: 'UNAVAILABLE' as const,
        commandId,
        reason: 'DERIVED_PUBLICATION_REQUIRES_RETRY' as const,
      };
    }),
    close: vi.fn(async () => {
      events.push('publication:close');
    }),
  };
  hooks.engine.mockReturnValue({ runtime: { consumer }, budget: {} });
  hooks.publication.mockReturnValue(publication);
  const publicationDatabase = { query: vi.fn(), transaction: vi.fn() };
  const connection = createPostwarFinanceSocialRuntimeConnection({
    socialConnection: social,
    capacitySource: createPostgresFinanceBudgetWorldCapacitySource({
      worldId: world,
      countries: [{ countryId: 'COUNTRY_01' }],
      historyMode: 'BUDGET_SOCIAL',
    }),
    intakePool: intake,
    clock: Object.freeze({
      nowReal: () => '2026-10-30T00:00:00.000Z',
      simTime: async () => '0',
    }),
    environment: 'ci',
    publicationDatabase,
  });
  return {
    connection,
    social,
    worker,
    publicationDatabase,
    publication,
    consumer,
    events,
    step,
  };
}
describe('same consumer derived-publication lifecycle binding', () => {
  it('constructs only the fixed helper with actual same-World role, source and explicit borrowed DB', async () => {
    const f = fixture();
    try {
      const ports = readPostwarFinanceSocialRuntimeBinding(f.connection);
      expect(hooks.publication).toHaveBeenCalledExactlyOnceWith({
        worldId: f.connection.worldId,
        database: ports.database,
        workerRole: 'worker_pub_protocol',
        socialConnection: f.social,
        publicationDatabase: f.publicationDatabase,
      });
      expect(ports.publication).toBe(f.publication);
      expect(hooks.engine).toHaveBeenCalledOnce();
      expect(f.events).toEqual([]);
    } finally {
      await f.connection.stop();
    }
    expect(f.worker.end).not.toHaveBeenCalled();
    expect(f.publicationDatabase.query).not.toHaveBeenCalled();
  });
  it('keeps the whole consume/publication step exclusive and joins publication before source retirement', async () => {
    const f = fixture(),
      gate = deferred();
    f.publication.afterCommitted.mockImplementationOnce(async (value) => {
      f.events.push('publish:started');
      await gate.promise;
      f.events.push('publish:done');
      return value;
    });
    const running = f.connection.consumeOnce();
    await vi.waitFor(() => expect(f.events).toContain('publish:started'));
    expect(await f.connection.consumeOnce()).toEqual({
      status: 'BLOCKED',
      reason: 'STEP_ALREADY_RUNNING',
      commandId: null,
    });
    const stopping = f.connection.stop();
    expect(f.connection.stop()).toBe(stopping);
    expect(() => f.connection.consumeOnce()).toThrow('RUNTIME_RETIRED');
    expect(f.consumer.stop).not.toHaveBeenCalled();
    expect(f.publication.close).not.toHaveBeenCalled();
    gate.resolve();
    expect(await running).toBe(f.step);
    await stopping;
    expect(f.events.indexOf('publish:done')).toBeLessThan(
      f.events.indexOf('consumer:stop'),
    );
    expect(f.events.indexOf('consumer:stop')).toBeLessThan(
      f.events.indexOf('publication:close'),
    );
    expect(f.publication.close).toHaveBeenCalledOnce();
    expect(f.worker.end).not.toHaveBeenCalled();
    expect(
      isPostwarSocialRuntimeConnection(f.social, f.connection.worldId),
    ).toBe(false);
  });
  it('retries only derived work and prevents a new economic step during retry', async () => {
    const f = fixture(),
      gate = deferred();
    f.publication.retryCommitted.mockImplementationOnce(async (commandId) => {
      await gate.promise;
      return {
        status: 'UNAVAILABLE',
        commandId,
        reason: 'DERIVED_PUBLICATION_REQUIRES_RETRY',
      };
    });
    const retry = f.connection.retryDerivedPublication('COMMAND_KNOWN_FINAL');
    await vi.waitFor(() =>
      expect(f.publication.retryCommitted).toHaveBeenCalledOnce(),
    );
    expect(await f.connection.consumeOnce()).toEqual({
      status: 'BLOCKED',
      reason: 'STEP_ALREADY_RUNNING',
      commandId: null,
    });
    expect(f.consumer.consumeOnce).not.toHaveBeenCalled();
    gate.resolve();
    expect(await retry).toMatchObject({
      status: 'UNAVAILABLE',
      commandId: 'COMMAND_KNOWN_FINAL',
    });
    await f.connection.stop();
    expect(f.publication.retryCommitted).toHaveBeenCalledExactlyOnceWith(
      'COMMAND_KNOWN_FINAL',
    );
    expect(f.consumer.consumeOnce).not.toHaveBeenCalled();
  });
});
