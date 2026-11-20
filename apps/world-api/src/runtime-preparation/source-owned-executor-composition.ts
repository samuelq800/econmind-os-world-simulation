import {
  createProductionWorldCommandHost,
  preflightProductionManualIntakeRuntime,
  WorkerRequestCompletion,
  type ServerCommandHostBinding,
} from '@econmind/world-worker/runtime-command-host';
import type { CanonicalCommand } from '@econmind/core';
import { createInternalExecutorCommandHandler } from './internal-executor-command-handler.js';

/** The host's abort race can finish before its actual read rollback rejects.
 * Observe that specific cleanup rejection while retaining the original work
 * in the drain; ordinary source denial is not a cleanup failure.
 */
class PreflightCompletion extends WorkerRequestCompletion {
  override track<T>(operation: Promise<T>): Promise<T> {
    return super.track(
      operation.catch((error: unknown) => {
        if (
          error instanceof Error &&
          error.message === 'COMMAND_HOST_READ_CLEANUP_UNCONFIRMED'
        )
          this.recordCleanupFailure();
        throw error;
      }),
    );
  }
}
const cleanupError = () => new Error('SOURCE_PREFLIGHT_CLEANUP_UNCONFIRMED');
/** An installed server binding can perform real read-only source preflight.
 * The execution handler stays disconnected until a separately verified sole
 * consumer exists. Preflight success never queues or settles a command. */
export function createSourceOwnedExecutorComposition(
  binding: ServerCommandHostBinding | null = null,
) {
  const host = createProductionWorldCommandHost(binding);
  const handle = createInternalExecutorCommandHandler(null);
  const completions = new Set<PreflightCompletion>();
  let stopped = false;
  let cleanupFailed = false;
  let stopping: Promise<void> | null = null;
  return Object.freeze({
    preparationStatus: host.preparationStatus,
    commandExecutionEnabled: false as const,
    async preflightOnly(input: {
      command: CanonicalCommand;
      observedAtReal: string;
      signal: AbortSignal;
    }) {
      if (cleanupFailed) throw cleanupError();
      if (stopped || input.signal.aborted)
        return Object.freeze({
          status: 'CANCELLED' as const,
          commandQueued: false as const,
        });
      const runtime = host.openIntakeRequest({
        route: '/v1/office-command',
        signal: input.signal,
      });
      if (runtime === null)
        return Object.freeze({
          status: 'SOURCE_RUNTIME_UNAVAILABLE' as const,
          commandQueued: false as const,
        });
      const completion = new PreflightCompletion();
      completions.add(completion);
      let accepted = false;
      let failure: { error: unknown } | null = null;
      try {
        accepted = await completion.run(() =>
          preflightProductionManualIntakeRuntime(
            runtime,
            input.command,
            input.observedAtReal,
          ),
        );
      } catch (error) {
        failure = { error };
      } finally {
        host.retireIntakeRequest(runtime);
        // Abort can settle outwardly before late connection/source work ends.
        // Join actual Worker work before claiming this request is complete.
        await completion.drain();
        if (completion.cleanupFailed()) cleanupFailed = true;
        completion.retire();
        completions.delete(completion);
        if (cleanupFailed) {
          stopped = true;
          await host.stop();
        }
      }
      if (cleanupFailed) throw cleanupError();
      if (failure) throw failure.error;
      return Object.freeze({
        status:
          stopped || input.signal.aborted
            ? ('CANCELLED' as const)
            : accepted
              ? ('SOURCE_PREFLIGHT_PASSED' as const)
              : ('SOURCE_PREFLIGHT_DENIED' as const),
        commandQueued: false as const,
      });
    },
    handle,
    stop() {
      stopped = true;
      stopping ??= (async () => {
        await host.stop();
        while (completions.size) {
          const pending = [...completions];
          await Promise.all(pending.map((completion) => completion.drain()));
          if (pending.some((completion) => completion.cleanupFailed()))
            cleanupFailed = true;
        }
        if (cleanupFailed) throw cleanupError();
      })();
      return stopping;
    },
  });
}
