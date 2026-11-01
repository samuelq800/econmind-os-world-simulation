/** Formal Node assembly of an already registered fixed shared execution host.
 * Construction starts HTTP only. It never registers control records, starts a
 * consumer loop, acquires a writer lease, initializes a World or advances time.
 */
import {
  readPostwarFinanceSocialRuntimeBinding,
  type PostwarFinanceSocialRuntimeConnection,
} from '@econmind/world-worker/finance-social-runtime-connection';
import { startApiRuntime, type ApiRuntimeConfig } from '../runtime.js';
import {
  createPostwarFinanceSocialApiConnection,
  type PostwarFinanceSocialApiConnection,
  type PostwarFinanceSocialApiConnectionInput,
} from './postwar-finance-social-connection.js';
import type { PostwarOfficeNodeBootstrap } from './postwar-office-node-bootstrap.js';

export interface RegisteredPostwarOfficeNodeBootstrapInput extends Omit<
  PostwarFinanceSocialApiConnectionInput,
  'binding'
> {
  readonly binding: Readonly<PostwarFinanceSocialRuntimeConnection>;
  readonly api: ApiRuntimeConfig;
}

/** The fixed Worker issuer owns source/control provenance. This boundary checks
 * its private identity before transferring resources to the existing API owner.
 * A production label alone cannot upgrade a local/test controller.
 */
export async function startRegisteredPostwarOfficeNodeBootstrap(
  input: RegisteredPostwarOfficeNodeBootstrapInput,
): Promise<Readonly<PostwarOfficeNodeBootstrap>> {
  const installedBinding = input.binding;
  const ports = readPostwarFinanceSocialRuntimeBinding(installedBinding);
  if (
    !ports.formalBinding ||
    !['staging', 'production'].includes(ports.environment) ||
    input.api.environment !== ports.environment ||
    input.social.environment !== ports.environment
  )
    throw Error('POSTWAR_NODE_REGISTERED_FORMAL_SHARED_HOST_REQUIRED');

  // The API constructor validates exact pool/World/worker/clock identity before
  // taking ownership. On a pre-transfer rejection the caller retains resources.
  const owner: Readonly<PostwarFinanceSocialApiConnection> =
    await createPostwarFinanceSocialApiConnection(input);
  let runtime: Awaited<ReturnType<typeof startApiRuntime>> | undefined;
  let stopping: Promise<void> | undefined;
  const shutdown = (): Promise<void> => {
    stopping ??= (async () => {
      const failures: unknown[] = [];
      for (const stop of [() => runtime?.shutdown(), () => owner.stop()])
        try {
          await stop();
        } catch (error) {
          failures.push(error);
        }
      if (failures.length)
        throw new AggregateError(
          failures,
          'REGISTERED_NODE_CLEANUP_UNCONFIRMED',
        );
    })();
    return stopping;
  };
  try {
    runtime = await startApiRuntime(input.api, {
      postwarFinanceSocialConnection: owner,
    });
    if (runtime.sharedOfficeConsumer !== owner.control)
      throw Error('REGISTERED_NODE_SOLE_CONSUMER_IDENTITY_REQUIRED');
    const running = runtime;
    const requireLive = () => {
      if (stopping) throw Error('REGISTERED_NODE_STOPPING_OR_STOPPED');
    };
    return Object.freeze({
      worldId: owner.worldId,
      origin: running.origin,
      port: running.port,
      ready: () => !stopping && running.ready(),
      consumer: Object.freeze({
        startPreparation() {
          requireLive();
          owner.control.startPreparation();
        },
        consumeOnce() {
          requireLive();
          return owner.control.consumeOnce();
        },
      }),
      retryDerivedPublication(commandId: string) {
        requireLive();
        return installedBinding.retryDerivedPublication(commandId);
      },
      shutdown,
    });
  } catch (error) {
    try {
      await shutdown();
    } catch (cleanup) {
      throw new AggregateError(
        [error, cleanup],
        'REGISTERED_NODE_STARTUP_AND_CLEANUP_FAILED',
        { cause: cleanup },
      );
    }
    throw error;
  }
}
