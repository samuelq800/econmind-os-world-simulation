/** Lifecycle protocol only: mocked fixed issuers and unconnected transports.
 * These fixtures do not issue source/admission/authorization or economic facts. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { worldId, type OpeningSeed } from '@econmind/core';
import type {
  PostwarFinanceSocialApiConnectionInput,
  PostwarFinanceSocialApiConnection,
} from '../../apps/world-api/src/runtime/postwar-finance-social-connection.js';
import type { PostwarSocialRuntimeConnectionInput } from '../../apps/world-worker/dist/runtime-preparation/social-runtime-connection.js';
import { startPostwarOfficeNodeBootstrap } from '../../apps/world-api/src/runtime/postwar-office-node-bootstrap.js';
import type { PostwarOfficeNodeBootstrapInput } from '../../apps/world-api/src/runtime/postwar-office-node-bootstrap.js';
const fixed = vi.hoisted(() => ({
  social: vi.fn(),
  shared: vi.fn(),
  api: vi.fn(),
  listen: vi.fn(),
}));
vi.mock(
  '../../apps/world-worker/dist/runtime-preparation/social-runtime-connection.js',
  async (original) => ({
    ...(await original<
      typeof import('../../apps/world-worker/dist/runtime-preparation/social-runtime-connection.js')
    >()),
    createPostwarSocialRuntimeConnection: fixed.social,
  }),
);
vi.mock(
  '../../apps/world-worker/dist/runtime-preparation/finance-social-runtime-connection.js',
  async (original) => ({
    ...(await original<
      typeof import('../../apps/world-worker/dist/runtime-preparation/finance-social-runtime-connection.js')
    >()),
    createPostwarFinanceSocialRuntimeConnection: fixed.shared,
  }),
);
vi.mock(
  '../../apps/world-api/src/runtime/postwar-finance-social-connection.js',
  async (original) => ({
    ...(await original<
      typeof import('../../apps/world-api/src/runtime/postwar-finance-social-connection.js')
    >()),
    createPostwarFinanceSocialApiConnection: fixed.api,
  }),
);
vi.mock('../../apps/world-api/src/runtime.js', async (original) => ({
  ...(await original<typeof import('../../apps/world-api/src/runtime.js')>()),
  startApiRuntime: fixed.listen,
}));
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}
function protocol() {
  const events: string[] = [],
    pools = new Map<string, { pool: Pool; ends: number }>();
  for (const name of ['bounded', 'intake', 'source', 'worker']) {
    const control = {
      ends: 0,
      pool: {
        connect: vi.fn(async () => {
          throw Error('NO_PROTOCOL_DATABASE');
        }),
        query: vi.fn(async () => {
          throw Error('NO_PROTOCOL_SQL');
        }),
        end: vi.fn(async () => {
          control.ends++;
          events.push('end:' + name);
        }),
      } as unknown as Pool,
    };
    pools.set(name, control);
  }
  const seed = { worldId: 'WORLD_NODE_PROTOCOL' } as Readonly<OpeningSeed>;
  const config = {
    api: {
      environment: 'ci',
      host: '127.0.0.1',
      port: 0,
      shutdownGraceMs: 5000,
    },
    social: {
      environment: 'ci',
      admittedWorldPins: { worldId: seed.worldId },
      workerId: 'WORKER_NODE_PROTOCOL',
      workerRole: 'node_protocol_worker',
      workerPool: pools.get('worker')!.pool,
      intakePool: pools.get('intake')!.pool,
      boundedReadPool: pools.get('bounded')!.pool,
      sourcePool: pools.get('source')!.pool,
      openingAdoption: {},
      clock: Object.freeze({
        nowReal: () => '2026-10-30T00:00:00.000Z',
        simTime: async () => '0',
      }),
    },
    capacitySource: {},
    startupSeed: seed,
  } as unknown as PostwarOfficeNodeBootstrapInput;
  let sourceClosing: Promise<void> | undefined,
    bindingStopping: Promise<void> | undefined,
    ownerStopping: Promise<void> | undefined,
    runtimeStopping: Promise<void> | undefined,
    active: Promise<unknown> | undefined;
  const source = {
    close: vi.fn(() => {
      sourceClosing ??= Promise.resolve().then(() => {
        events.push('source:close');
      });
      return sourceClosing;
    }),
  };
  const preparation = deferred(),
    http = deferred(),
    step = deferred();
  let gatedPreparation = false,
    gatedHttp = false;
  const control = {
    startPreparation: vi.fn(() => events.push('consumer:start')),
    consumeOnce: vi.fn(() => {
      events.push('consumer:step');
      active = step.promise.then(() => ({ status: 'IDLE' }));
      return active;
    }),
  };
  const binding = {
    retryDerivedPublication: vi.fn(async (commandId: string) => ({
      status: 'UNAVAILABLE',
      commandId,
      reason: 'DERIVED_PUBLICATION_REQUIRES_RETRY',
    })),
    stop: vi.fn(() => {
      bindingStopping ??= (async () => {
        events.push('consumer:stop');
        await active;
        await source.close();
      })();
      return bindingStopping;
    }),
  };
  let apiInput: PostwarFinanceSocialApiConnectionInput;
  const owner = {
    worldId: seed.worldId,
    control,
    prepare: vi.fn(async () => {
      events.push('prepare:start');
      if (gatedPreparation) await preparation.promise;
      events.push('prepare:done');
    }),
    stop: vi.fn(() => {
      ownerStopping ??= (async () => {
        await binding.stop();
        await Promise.all(
          [
            apiInput.social.boundedReadPool,
            apiInput.social.intakePool,
            apiInput.social.sourcePool,
            apiInput.social.workerPool,
          ].map((p) => p.end()),
        );
      })();
      return ownerStopping;
    }),
  };
  fixed.social.mockImplementation(
    (input: PostwarSocialRuntimeConnectionInput) => {
      events.push('construct:social');
      // The facade preserves method receiver and never mutates caller pools.
      expect(input.workerPool.end).not.toBe(config.social.workerPool.end);
      return source;
    },
  );
  fixed.shared.mockImplementation((input) => {
    events.push('construct:shared');
    expect(input.socialConnection).toBe(source);
    expect(input.clock).toBe(config.social.clock);
    expect(input.capacitySource).toBe(config.capacitySource);
    return binding;
  });
  fixed.api.mockImplementation((input) => {
    apiInput = input;
    events.push('construct:api');
    expect(input.binding).toBe(binding);
    expect(input.socialStartupSeed).toBe(seed);
    expect(input.social.intakePool).toBe(
      fixed.shared.mock.calls[0]?.[0].intakePool,
    );
    return owner;
  });
  const runtime = {
    origin: 'http://127.0.0.1:12345',
    port: 12345,
    ready: () => true,
    sharedOfficeConsumer: control,
    shutdown: vi.fn(() => {
      runtimeStopping ??= (async () => {
        events.push('http:drain');
        if (gatedHttp) await http.promise;
        events.push('http:drained');
        await owner.stop();
      })();
      return runtimeStopping;
    }),
  };
  fixed.listen.mockImplementation(
    async (
      _config,
      input: {
        postwarFinanceSocialConnection: PostwarFinanceSocialApiConnection;
      },
    ) => {
      expect(input.postwarFinanceSocialConnection).toBe(owner);
      await owner.prepare();
      events.push('http:listen');
      return runtime;
    },
  );
  return {
    config,
    events,
    pools,
    source,
    binding,
    owner,
    runtime,
    control,
    preparation,
    http,
    step,
    gatePreparation: () => (gatedPreparation = true),
    gateHttp: () => (gatedHttp = true),
  };
}
beforeEach(() => vi.resetAllMocks());
describe('explicit fixed office Node bootstrap ownership protocol', () => {
  it('does not listen until product prepare resolves or start the consumer implicitly', async () => {
    const f = protocol();
    f.gatePreparation();
    const starting = startPostwarOfficeNodeBootstrap(f.config);
    await vi.waitFor(() => expect(f.events).toContain('prepare:start'));
    expect(f.events).not.toContain('http:listen');
    expect(f.control.startPreparation).not.toHaveBeenCalled();
    f.preparation.resolve();
    const host = await starting;
    expect(host.ready()).toBe(true);
    expect(host.origin).toBe(f.runtime.origin);
    host.consumer.startPreparation();
    expect(f.control.startPreparation).toHaveBeenCalledOnce();
    await host.shutdown();
    for (const p of f.pools.values()) expect(p.ends).toBe(1);
  });
  it('drains HTTP then an in-flight step then source and pools, and retires control immediately', async () => {
    const f = protocol(),
      host = await startPostwarOfficeNodeBootstrap(f.config);
    f.gateHttp();
    const consuming = host.consumer.consumeOnce(),
      stopping = host.shutdown();
    expect(host.shutdown()).toBe(stopping);
    expect(host.ready()).toBe(false);
    expect(() => host.consumer.consumeOnce()).toThrow('STOPPING_OR_STOPPED');
    expect(() => host.consumer.startPreparation()).toThrow(
      'STOPPING_OR_STOPPED',
    );
    expect(f.events).not.toContain('consumer:stop');
    f.http.resolve();
    await vi.waitFor(() => expect(f.events).toContain('consumer:stop'));
    expect(f.events).not.toContain('source:close');
    for (const p of f.pools.values()) expect(p.ends).toBe(0);
    f.step.resolve();
    await consuming;
    await stopping;
    expect(f.events.indexOf('http:drained')).toBeLessThan(
      f.events.indexOf('consumer:stop'),
    );
    expect(f.events.indexOf('consumer:stop')).toBeLessThan(
      f.events.indexOf('source:close'),
    );
    for (const name of f.pools.keys()) {
      expect(f.events.indexOf('source:close')).toBeLessThan(
        f.events.indexOf('end:' + name),
      );
      expect(f.pools.get(name)!.ends).toBe(1);
    }
  });
  it.each(['social', 'shared', 'api', 'listen'] as const)(
    'closes every transferred pool when %s construction/startup fails',
    async (stage) => {
      const f = protocol(),
        failure = Error('ACTUAL_' + stage.toUpperCase() + '_FAILURE');
      fixed[stage].mockImplementationOnce(() => {
        throw failure;
      });
      await expect(startPostwarOfficeNodeBootstrap(f.config)).rejects.toBe(
        failure,
      );
      for (const p of f.pools.values()) expect(p.ends).toBe(1);
      if (stage !== 'social') expect(f.source.close).toHaveBeenCalled();
      expect(f.events).not.toContain('consumer:start');
    },
  );
  it('compensates prepare failure after the existing owner already ends its pools exactly once', async () => {
    const f = protocol(),
      failure = Error('REAL_PREPARE_FAILURE');
    f.owner.prepare.mockRejectedValueOnce(failure);
    fixed.listen.mockImplementationOnce(async () => {
      try {
        await f.owner.prepare();
      } catch (error) {
        await f.owner.stop();
        throw error;
      }
    });
    await expect(startPostwarOfficeNodeBootstrap(f.config)).rejects.toBe(
      failure,
    );
    for (const p of f.pools.values()) expect(p.ends).toBe(1);
    expect(f.events).not.toContain('http:listen');
  });
  it('preserves startup and cleanup failures while still ending the remaining pools', async () => {
    const f = protocol(),
      failure = Error('LISTEN_FAILURE'),
      closeFailure = Error('POOL_CLOSE_FAILURE');
    fixed.listen.mockRejectedValueOnce(failure);
    vi.mocked(f.pools.get('bounded')!.pool.end).mockImplementationOnce(
      async () => {
        f.pools.get('bounded')!.ends++;
        throw closeFailure;
      },
    );
    const result = await startPostwarOfficeNodeBootstrap(f.config).catch(
      (error: unknown) => error,
    );
    expect(result).toBeInstanceOf(AggregateError);
    const error = result as AggregateError;
    expect(error.cause).toBe(failure);
    expect(error.errors[0]).toBe(failure);
    expect((error.errors[1] as AggregateError).errors).toContain(closeFailure);
    for (const p of f.pools.values()) expect(p.ends).toBe(1);
  });
  it.each(['production', 'shared-pool', 'other-seed'])(
    'rejects %s before transferring resource ownership',
    async (mode) => {
      const f = protocol();
      const input = {
        ...f.config,
        ...(mode === 'production'
          ? { api: { ...f.config.api, environment: 'production' } }
          : {}),
        ...(mode === 'shared-pool'
          ? {
              social: {
                ...f.config.social,
                sourcePool: f.config.social.boundedReadPool,
              },
            }
          : {}),
        ...(mode === 'other-seed'
          ? {
              startupSeed: {
                ...f.config.startupSeed,
                worldId: worldId('WORLD_OTHER_PROTOCOL'),
              },
            }
          : {}),
      };
      await expect(startPostwarOfficeNodeBootstrap(input)).rejects.toThrow(
        'POSTWAR_NODE_',
      );
      expect(fixed.social).not.toHaveBeenCalled();
      for (const p of f.pools.values()) expect(p.ends).toBe(0);
    },
  );
  it('rejects a mismatched FX seed and uses one exact genuine seed for both startup paths', async () => {
    const f = protocol();
    const fx = {
      seed: f.config.startupSeed,
      policyBytes: 'TEST_ONLY_PROTOCOL_POLICY',
      userReceiptBytes: 'TEST_ONLY_PROTOCOL_RECEIPT',
    };
    await expect(
      startPostwarOfficeNodeBootstrap({
        ...f.config,
        treasuryFx: { preparation: { ...fx, seed: { ...fx.seed } } },
      }),
    ).rejects.toThrow('EXACT_STARTUP_SEED');
    const host = await startPostwarOfficeNodeBootstrap({
      ...f.config,
      treasuryFx: { preparation: fx },
    });
    expect(fixed.shared.mock.calls[0]?.[0].treasuryFx).toEqual({
      workerRole: f.config.social.workerRole,
    });
    expect(fixed.api.mock.calls[0]?.[0].treasuryFxPreparation).toBe(fx);
    await host.shutdown();
  });
  it('projects only Captain source mode onto the same Worker role and consumer', async () => {
    const f = protocol(),
      candidate = vi.fn();
    const captain = {
      mode: 'TEST_ONLY_LOCAL' as const,
      candidateFactory: candidate,
      ready: candidate,
    };
    const host = await startPostwarOfficeNodeBootstrap({
      ...f.config,
      captain,
    });
    expect(fixed.shared.mock.calls[0]?.[0].captain).toEqual({
      workerRole: f.config.social.workerRole,
      mode: 'TEST_ONLY_LOCAL',
    });
    expect(fixed.shared).toHaveBeenCalledOnce();
    expect(candidate).not.toHaveBeenCalled();
    expect(f.control.startPreparation).not.toHaveBeenCalled();
    host.consumer.startPreparation();
    expect(f.control.startPreparation).toHaveBeenCalledOnce();
    await host.shutdown();
    for (const p of f.pools.values()) expect(p.ends).toBe(1);
  });
  it('passes only an explicit borrowed publication DB and retries derived work without another economic step', async () => {
    const f = protocol();
    const publicationDatabase = { query: vi.fn(), transaction: vi.fn() };
    const host = await startPostwarOfficeNodeBootstrap({
      ...f.config,
      publicationDatabase,
    });
    expect(fixed.shared.mock.calls[0]?.[0].publicationDatabase).toBe(
      publicationDatabase,
    );
    expect(
      await host.retryDerivedPublication('COMMAND_TEST_ONLY_FINAL'),
    ).toMatchObject({
      status: 'UNAVAILABLE',
      commandId: 'COMMAND_TEST_ONLY_FINAL',
    });
    expect(f.binding.retryDerivedPublication).toHaveBeenCalledExactlyOnceWith(
      'COMMAND_TEST_ONLY_FINAL',
    );
    expect(f.control.consumeOnce).not.toHaveBeenCalled();
    await host.shutdown();
    expect(publicationDatabase.transaction).not.toHaveBeenCalled();
    expect(() =>
      host.retryDerivedPublication('COMMAND_TEST_ONLY_FINAL'),
    ).toThrow('STOPPING_OR_STOPPED');
  });
  it('forwards bounded read configuration to the same fixed API owner without another pool', async () => {
    const f = protocol();
    const read = { readerRole: 'node_protocol_bounded' } as NonNullable<
      PostwarOfficeNodeBootstrapInput['read']
    >;
    const host = await startPostwarOfficeNodeBootstrap({ ...f.config, read });
    expect(fixed.api.mock.calls[0]?.[0].read).toBe(read);
    expect(fixed.api).toHaveBeenCalledOnce();
    await host.shutdown();
    for (const p of f.pools.values()) expect(p.ends).toBe(1);
  });
  it('uses genuine fixed issuers and refuses unverified startup before any listener or consumer', async () => {
    const f = protocol();
    const social = await vi.importActual<
      typeof import('../../apps/world-worker/dist/runtime-preparation/social-runtime-connection.js')
    >(
      '../../apps/world-worker/dist/runtime-preparation/social-runtime-connection.js',
    );
    const shared = await vi.importActual<
      typeof import('../../apps/world-worker/dist/runtime-preparation/finance-social-runtime-connection.js')
    >(
      '../../apps/world-worker/dist/runtime-preparation/finance-social-runtime-connection.js',
    );
    const api = await vi.importActual<
      typeof import('../../apps/world-api/src/runtime/postwar-finance-social-connection.js')
    >('../../apps/world-api/src/runtime/postwar-finance-social-connection.js');
    const node = await vi.importActual<
      typeof import('../../apps/world-api/src/runtime.js')
    >('../../apps/world-api/src/runtime.js');
    const finance =
      await import('../../apps/world-worker/dist/persistence/postgres-finance-budget-capacity-source.js');
    fixed.social.mockImplementation(
      social.createPostwarSocialRuntimeConnection,
    );
    fixed.shared.mockImplementation(
      shared.createPostwarFinanceSocialRuntimeConnection,
    );
    fixed.api.mockImplementation(api.createPostwarFinanceSocialApiConnection);
    fixed.listen.mockImplementation(node.startApiRuntime);
    const projectRef = 'a'.repeat(20);
    const input: PostwarOfficeNodeBootstrapInput = {
      ...f.config,
      capacitySource: finance.createPostgresFinanceBudgetWorldCapacitySource({
        worldId: f.config.startupSeed.worldId,
        countries: [{ countryId: 'COUNTRY_01' }],
        historyMode: 'BUDGET_SOCIAL',
      }),
      social: {
        ...f.config.social,
        openingAdoption:
          await social.loadPostwarSocialConnectionOpeningAdoption(
            process.cwd(),
          ),
        boundedReaderRole: 'node_protocol_bounded',
        sourceReaderRole: 'node_protocol_offline',
        intakeRole: 'node_protocol_intake',
        authorizationPublisherRole: 'node_protocol_publisher',
        admittedWorldPins: {
          worldId: f.config.startupSeed.worldId,
          seedRef: 'SEED_PROTOCOL_NOT_ADMITTED',
          contentHash: 'sha256:' + '1'.repeat(64),
          admissionRef: 'ADMISSION_PROTOCOL_NOT_REAL',
          minimumWorldVersion: '0',
        },
        modelVersion: 'world-v2-foundation-1',
        resolveActorId: async () => null,
        auth: {
          projectRef,
          expectedIssuer: 'https://' + projectRef + '.supabase.co/auth/v1',
          jwksUrl:
            'https://' +
            projectRef +
            '.supabase.co/auth/v1/.well-known/jwks.json',
          audience: 'authenticated',
          fetch: async () => {
            throw Error('NO_PROTOCOL_NETWORK');
          },
        },
        allowedOrigins: ['https://world.example'],
      },
    };
    await expect(startPostwarOfficeNodeBootstrap(input)).rejects.toThrow(
      'NO_PROTOCOL_DATABASE',
    );
    expect(fixed.social).toHaveReturned();
    expect(fixed.shared).toHaveReturned();
    expect(fixed.api).toHaveReturned();
    for (const p of f.pools.values()) expect(p.ends).toBe(1);
    expect(f.events).not.toContain('consumer:start');
  });
});
