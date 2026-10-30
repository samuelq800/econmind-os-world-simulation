/** Explicit local/CI assembly of the existing fixed Finance/Social[/FX] owner.
 * No environment discovery, SQL installation, lease acquisition, consumer loop,
 * Clock construction or production activation is performed here. */
import type { OpeningSeed } from '@econmind/core';
import {
  createPostwarSocialRuntimeConnection,
  type PostwarSocialRuntimeConnection,
} from '@econmind/world-worker/social-runtime-connection';
import {
  createPostwarFinanceSocialRuntimeConnection,
  type PostwarFinanceSocialRuntimeConnection,
} from '@econmind/world-worker/finance-social-runtime-connection';
import type { Pool } from 'pg';
import {
  startApiRuntime,
  type ApiRuntimeConfig,
  type RunningApiRuntime,
} from '../runtime.js';
import {
  createPostwarFinanceSocialApiConnection,
  type PostwarFinanceSocialApiConnection,
  type PostwarFinanceSocialApiConnectionInput,
  type PostwarSharedOfficeConsumer,
} from './postwar-finance-social-connection.js';
import type { PostwarSocialConnectionConfiguration } from './postwar-social-connection.js';

export interface PostwarOfficeNodeBootstrapInput {
  readonly api: ApiRuntimeConfig;
  readonly social: Omit<PostwarSocialConnectionConfiguration, 'environment'> & {
    readonly environment: 'local' | 'ci';
  };
  readonly capacitySource: Parameters<
    typeof createPostwarFinanceSocialRuntimeConnection
  >[0]['capacitySource'];
  /** Actual server-held Core seed; startup uses the metadata-only SQL header,
   * never a raw-seed grant to the online reader. */
  readonly startupSeed: Readonly<OpeningSeed>;
  readonly treasuryFx?: Readonly<{
    readonly preparation: NonNullable<
      PostwarFinanceSocialApiConnectionInput['treasuryFxPreparation']
    >;
  }>;
  readonly financeAllowedOrigins?: readonly string[];
}
export interface PostwarOfficeNodeBootstrap {
  readonly worldId: string;
  readonly origin: string;
  readonly port: number;
  readonly consumer: Readonly<PostwarSharedOfficeConsumer>;
  ready(): boolean;
  shutdown(): Promise<void>;
}

/** Existing owners can close their pools on construction failure. A transparent
 * transport facade gives both those owners and outer compensation one shared
 * end promise without mutating or widening the original Pool. All owned
 * lifecycle callers use pg's promise form of end(). */
function ownedPool(pool: Pool): Pool {
  let ending: Promise<void> | undefined;
  const methods = new Map<PropertyKey, unknown>();
  return new Proxy(pool, {
    get(target, property) {
      if (property === 'end')
        return () => (ending ??= Promise.resolve().then(() => target.end()));
      const value: unknown = Reflect.get(target, property, target);
      if (typeof value !== 'function') return value;
      if (!methods.has(property)) methods.set(property, value.bind(target));
      return methods.get(property);
    },
  });
}

/** Ownership transfers only after the initial environment/pool/seed identity
 * checks below. The caller must then stop using all four original pools,
 * including on a rejected startup. Before that boundary, rejection leaves the
 * caller's resources alone. No partially constructed controller is returned. */
export async function startPostwarOfficeNodeBootstrap(
  input: PostwarOfficeNodeBootstrapInput,
): Promise<Readonly<PostwarOfficeNodeBootstrap>> {
  const c = input.social;
  if (
    !['local', 'ci'].includes(c.environment) ||
    input.api.environment !== c.environment
  )
    throw Error('POSTWAR_NODE_LOCAL_CI_EXACT_ENVIRONMENT_REQUIRED');
  const originalPools = [
    c.boundedReadPool,
    c.intakePool,
    c.sourcePool,
    c.workerPool,
  ];
  if (
    new Set(originalPools).size !== 4 ||
    originalPools.some(
      (pool) =>
        typeof pool?.connect !== 'function' ||
        typeof pool.query !== 'function' ||
        typeof pool.end !== 'function',
    )
  )
    throw Error('POSTWAR_NODE_FOUR_DISTINCT_OWNED_POOLS_REQUIRED');
  if (
    !input.startupSeed ||
    input.startupSeed.worldId !== c.admittedWorldPins.worldId ||
    (input.treasuryFx &&
      input.treasuryFx.preparation.seed !== input.startupSeed)
  )
    throw Error('POSTWAR_NODE_EXACT_STARTUP_SEED_REQUIRED');
  // These same facade identities pass through the fixed Worker and API issuers.
  const social = {
    ...c,
    boundedReadPool: ownedPool(c.boundedReadPool),
    intakePool: ownedPool(c.intakePool),
    sourcePool: ownedPool(c.sourcePool),
    workerPool: ownedPool(c.workerPool),
  };
  const pools = [
    social.boundedReadPool,
    social.intakePool,
    social.sourcePool,
    social.workerPool,
  ];
  let source: Readonly<PostwarSocialRuntimeConnection> | undefined;
  let binding: Readonly<PostwarFinanceSocialRuntimeConnection> | undefined;
  let owner: Readonly<PostwarFinanceSocialApiConnection> | undefined;
  let runtime: RunningApiRuntime | undefined;
  let stopping: Promise<void> | undefined;
  const shutdown = (): Promise<void> => {
    stopping ??= (async () => {
      const errors = new Set<unknown>();
      // The standard Node shutdown stops acceptance/drains HTTP before the API
      // owner joins the sole consumer and closes its sources/transports. The
      // following idempotent fallbacks also cover partial construction.
      for (const operation of [
        () => runtime?.shutdown(),
        () => owner?.stop(),
        () => binding?.stop(),
        () => source?.close(),
      ])
        try {
          await operation();
        } catch (error) {
          errors.add(error);
        }
      const ended = await Promise.allSettled(
        pools.map((pool) => Promise.resolve().then(() => pool.end())),
      );
      for (const result of ended)
        if (result.status === 'rejected') errors.add(result.reason);
      if (errors.size)
        throw new AggregateError(
          [...errors],
          'POSTWAR_NODE_CLEANUP_UNCONFIRMED',
        );
    })();
    return stopping;
  };
  try {
    source = createPostwarSocialRuntimeConnection({
      worldId: c.admittedWorldPins.worldId,
      workerId: c.workerId,
      workerRole: c.workerRole,
      workerPool: social.workerPool,
      openingAdoption: c.openingAdoption,
    });
    binding = createPostwarFinanceSocialRuntimeConnection({
      socialConnection: source,
      capacitySource: input.capacitySource,
      intakePool: social.intakePool,
      clock: c.clock,
      environment: c.environment,
      ...(input.treasuryFx ? { treasuryFx: { workerRole: c.workerRole } } : {}),
    });
    owner = await createPostwarFinanceSocialApiConnection({
      binding,
      social,
      socialStartupSeed: input.startupSeed,
      ...(input.treasuryFx
        ? { treasuryFxPreparation: input.treasuryFx.preparation }
        : {}),
      ...(input.financeAllowedOrigins
        ? { financeAllowedOrigins: input.financeAllowedOrigins }
        : {}),
    });
    // Existing product startup really awaits owner.prepare before listening.
    runtime = await startApiRuntime(input.api, {
      postwarFinanceSocialConnection: owner,
    });
    const running = runtime,
      control = owner.control;
    if (running.sharedOfficeConsumer !== control)
      throw Error('POSTWAR_NODE_SOLE_CONSUMER_IDENTITY_REQUIRED');
    const requireLive = () => {
      if (stopping) throw Error('POSTWAR_NODE_STOPPING_OR_STOPPED');
    };
    return Object.freeze({
      worldId: owner.worldId,
      origin: running.origin,
      port: running.port,
      ready: () => !stopping && running.ready(),
      consumer: Object.freeze({
        startPreparation() {
          requireLive();
          control.startPreparation();
        },
        consumeOnce() {
          requireLive();
          return control.consumeOnce();
        },
      }),
      shutdown,
    });
  } catch (error) {
    const cleanup = await shutdown().then(
      () => null,
      (failure: unknown) => failure,
    );
    if (cleanup !== null) {
      throw new AggregateError(
        [error, cleanup],
        'POSTWAR_NODE_STARTUP_FAILED_WITH_CLEANUP_ERROR',
        { cause: error },
      );
    }
    throw error;
  }
}
