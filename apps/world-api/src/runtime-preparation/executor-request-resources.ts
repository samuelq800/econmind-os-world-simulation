import type { Pool, PoolClient } from 'pg';
import { WorkerRequestCompletion } from '@econmind/world-worker/runtime-command-host';
import { RequestCompletion } from './request-completion.js';

export type OwnedExecutorPool = Pick<Pool, 'connect' | 'end'>;
/** A resource scope is not a runtime issuer. No source/ready/drain callback is
 * accepted. Only this scope closes its registered pool objects. */
export class ExecutorRequestResourceScope {
  readonly api = new RequestCompletion();
  readonly worker = new WorkerRequestCompletion();
  readonly #controller = new AbortController();
  readonly #pools = new Set<OwnedExecutorPool>();
  #phase: 'OPEN' | 'STOPPING' | 'CLOSED' = 'OPEN';
  #closing: Promise<void> | null = null;
  #cleanupFailed = false;
  readonly #maximumPools: number;
  readonly #externalSignal: AbortSignal | undefined;
  readonly #externalAbort = () => this.#controller.abort();
  constructor(maximumPools: number = Infinity, signal?: AbortSignal) {
    if (
      maximumPools !== Infinity &&
      (!Number.isInteger(maximumPools) || maximumPools < 1)
    )
      throw new Error('EXECUTOR_POOL_BUDGET_INVALID');
    this.#maximumPools = maximumPools;
    this.#externalSignal = signal;
    signal?.addEventListener('abort', this.#externalAbort, { once: true });
    if (signal?.aborted) this.#externalAbort();
  }
  get signal(): AbortSignal {
    return this.#controller.signal;
  }
  own(pool: OwnedExecutorPool): void {
    if (this.#phase !== 'OPEN') throw new Error('REQUEST_SCOPE_RETIRED');
    if (typeof pool?.connect !== 'function' || typeof pool.end !== 'function')
      throw new Error('EXECUTOR_POOL_OWNERSHIP_REQUIRED');
    if (!this.#pools.has(pool) && this.#pools.size >= this.#maximumPools)
      throw new Error('EXECUTOR_POOL_BUDGET_EXCEEDED');
    this.#pools.add(pool);
  }
  inventory(): readonly OwnedExecutorPool[] {
    return Object.freeze([...this.#pools]);
  }
  run<T>(operation: () => T): T {
    if (this.#phase !== 'OPEN' || this.signal.aborted)
      throw new Error('REQUEST_SCOPE_RETIRED');
    return this.worker.run(() => this.api.run(operation));
  }
  /** Fixed future source adapters may use this managed connection path.
   * An abort/stop while connect is pending still waits for and discards the
   * actual late client before any pool is ended. No query replay. */
  withWorkerConnection<T>(
    pool: OwnedExecutorPool,
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    if (this.#phase !== 'OPEN' || this.signal.aborted || !this.#pools.has(pool))
      return Promise.reject(new Error('REQUEST_SCOPE_RETIRED'));
    const pending = (async () => {
      const client = await pool.connect();
      let discard: Error | undefined;
      try {
        if (this.signal.aborted) throw new Error('REQUEST_SCOPE_CANCELLED');
        return await operation(client);
      } catch (error) {
        discard = new Error('REQUEST_CONNECTION_DISCARDED');
        throw error;
      } finally {
        try {
          client.release(discard);
        } catch {
          this.#cleanupFailed = true;
          this.worker.recordCleanupFailure();
        }
      }
    })();
    return this.worker.track(pending);
  }
  abort(): void {
    if (this.#phase === 'OPEN') this.#phase = 'STOPPING';
    this.#controller.abort();
  }
  close(): Promise<void> {
    if (this.#closing) return this.#closing;
    this.abort();
    this.#closing = (async () => {
      do {
        await this.api.drain();
        await this.worker.drain();
      } while (this.api.pending() || this.worker.pending());
      this.worker.retire();
      const closing = [...this.#pools].map((pool) =>
        this.api.track(Promise.resolve().then(() => pool.end())),
      );
      const results = await Promise.allSettled(closing);
      if (results.some((r) => r.status === 'rejected'))
        this.#cleanupFailed = true;
      await this.api.drain();
      await this.worker.drain();
      if (this.api.pending() || this.worker.pending() || !this.worker.retired())
        this.#cleanupFailed = true;
      this.#phase = 'CLOSED';
      this.#externalSignal?.removeEventListener('abort', this.#externalAbort);
    })();
    return this.#closing;
  }
  cleanupFailed(): boolean {
    return (
      this.#cleanupFailed ||
      this.api.cleanupFailed() ||
      this.worker.cleanupFailed()
    );
  }
  closed(): boolean {
    return this.#phase === 'CLOSED';
  }
}
