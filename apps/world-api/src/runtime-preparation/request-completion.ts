import { AsyncLocalStorage } from 'node:async_hooks';

/** Server-only observation of actual promises, including operations which outlive
 * a caller's cancellation race. Does not authorize or retry any operation. */
const current = new AsyncLocalStorage<RequestCompletion>();
export function trackRequestCompletion<T>(operation: Promise<T>): Promise<T> {
  current.getStore()?.track(operation);
  return operation;
}
export function trackRequestCleanup<T>(operation: Promise<T>): Promise<T> {
  const scope = current.getStore();
  if (scope) {
    scope.track(operation);
    void operation.then(undefined, () => scope.recordCleanupFailure());
  }
  return operation;
}
export class RequestCompletion {
  readonly #pending = new Set<Promise<unknown>>();
  #failures = 0;
  #cleanupFailed = false;
  recordCleanupFailure(): void {
    this.#cleanupFailed = true;
  }
  cleanupFailed(): boolean {
    return this.#cleanupFailed;
  }
  track<T>(operation: Promise<T>): Promise<T> {
    this.#pending.add(operation);
    void operation.then(
      () => this.#pending.delete(operation),
      () => {
        this.#failures++;
        this.#pending.delete(operation);
      },
    );
    return operation;
  }
  run<T>(operation: () => T): T {
    return current.run(this, operation);
  }
  async drain(): Promise<void> {
    while (this.#pending.size) await Promise.allSettled([...this.#pending]);
  }
  pending(): number {
    return this.#pending.size;
  }
  failures(): number {
    return this.#failures;
  }
}
