import { setTimeout as delay } from 'node:timers/promises';

/** Retry only a missing publication at the observed head, never a rejected
 * source or corrupt document. Each attempt owns fresh authentication and a
 * complete read snapshot; no connection is retained during the wait. */
export async function readAfterCurrentPublication<T>(input: {
  readonly read: () => Promise<T>;
  readonly notPublished: (result: T) => boolean;
  readonly signal?: AbortSignal;
}): Promise<T> {
  const started = performance.now();
  let result = await input.read();
  for (const waitMs of [100, 200, 400, 800, 1000, 1000]) {
    if (
      input.signal?.aborted ||
      !input.notPublished(result) ||
      performance.now() - started + waitMs > 4000
    )
      break;
    try {
      await delay(waitMs, undefined, { signal: input.signal });
    } catch (error) {
      if (!input.signal?.aborted) throw error;
    }
    // The service performs its cancellation check before authentication/SQL.
    result = await input.read();
  }
  return result;
}
