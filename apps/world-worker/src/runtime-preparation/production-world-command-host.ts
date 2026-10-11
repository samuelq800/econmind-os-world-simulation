import { AsyncLocalStorage } from 'node:async_hooks';
import { CommandRequestIdentityRegistry } from './private-command-request-registry.js';

/** Closed in 3A: no formal source/clock/actor constructor is installed.
 * There is deliberately no structural positive binding or approval callback. */
export type ServerCommandHostBinding = never;
declare const productionRuntimeBrand: unique symbol;
export interface ProductionManualIntakeRuntime {
  readonly [productionRuntimeBrand]: true;
}
export interface ProductionWorldCommandHost {
  readonly preparationStatus: 'SOURCE_ONLY_UNMOUNTED_HOLD';
  diagnostics(): Readonly<{ status: 'HOLD'; missing: readonly string[] }>;
  openIntakeRequest(input: unknown): null;
  stop(): Promise<void>;
}
const registry = new CommandRequestIdentityRegistry();
const states = new WeakMap<object, 'HOLD' | 'STOPPED'>();
const missing = Object.freeze([
  'FORMAL_SOURCE_CONSTRUCTORS_NOT_INSTALLED',
  'WORLD_CLOCK_CONSTRUCTOR_NOT_INSTALLED',
  'ACTOR_IDENTITY_CONSTRUCTOR_NOT_INSTALLED',
]);
/** No sockets, environment discovery, consumer, clock or positive token. Even
 * runtime JS inputs that evade the closed TS type remain HOLD without reads. */
export function createProductionWorldCommandHost(
  _binding: ServerCommandHostBinding | null = null,
): ProductionWorldCommandHost {
  void _binding;
  const host: ProductionWorldCommandHost = Object.freeze({
    preparationStatus: 'SOURCE_ONLY_UNMOUNTED_HOLD' as const,
    diagnostics() {
      if (!states.has(this)) throw new Error('HOST_IDENTITY_REQUIRED');
      return Object.freeze({ status: 'HOLD' as const, missing });
    },
    openIntakeRequest(_input: unknown) {
      void _input;
      if (!states.has(this)) return null;
      return null;
    },
    async stop() {
      if (!states.has(this)) throw new Error('HOST_IDENTITY_REQUIRED');
      registry.stop(this);
      states.set(this, 'STOPPED');
    },
  });
  registry.registerHost(host, null);
  states.set(host, 'HOLD');
  return host;
}
export function isProductionManualIntakeRuntime(
  runtime: unknown,
): runtime is ProductionManualIntakeRuntime {
  return registry.hasRuntime(runtime);
}
export function boundProductionManualIntakeRuntime(
  runtime: unknown,
  binding: { pool: object; clock: object; worldId: string },
): runtime is ProductionManualIntakeRuntime {
  return registry.boundIntake(runtime, binding);
}

const activeCompletion = new AsyncLocalStorage<WorkerRequestCompletion>();
/** Worker operations only; cannot issue runtime/source/authorization identity. */
export class WorkerRequestCompletion {
  readonly #pending = new Set<Promise<unknown>>();
  #retired = false;
  #cleanupFailed = false;
  run<T>(operation: () => T): T {
    if (this.#retired) throw new Error('WORKER_REQUEST_RETIRED');
    return activeCompletion.run(this, operation);
  }
  track<T>(operation: Promise<T>): Promise<T> {
    // Fixed callers must stop new operations before retirement. A late
    // registration is still joined, but can never certify clean completion.
    if (this.#retired) this.#cleanupFailed = true;
    this.#pending.add(operation);
    void operation.then(
      () => this.#pending.delete(operation),
      () => this.#pending.delete(operation),
    );
    return operation;
  }
  async drain(): Promise<void> {
    while (this.#pending.size) await Promise.allSettled([...this.#pending]);
  }
  retire(): void {
    if (this.#pending.size) throw new Error('WORKER_REQUEST_NOT_DRAINED');
    this.#retired = true;
  }
  recordCleanupFailure(): void {
    this.#cleanupFailed = true;
  }
  cleanupFailed(): boolean {
    return this.#cleanupFailed;
  }
  pending(): number {
    return this.#pending.size;
  }
  retired(): boolean {
    return this.#retired;
  }
}
export function trackWorkerRequestCompletion<T>(
  operation: Promise<T>,
): Promise<T> {
  return activeCompletion.getStore()?.track(operation) ?? operation;
}
