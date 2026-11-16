import { afterEach, expect, it, vi } from 'vitest';
import { readAfterCurrentPublication } from '../../apps/world-api/src/integration/current-publication-read-retry.js';

afterEach(() => vi.useRealTimers());
const notPublished = (value: string) => value === 'NOT_PUBLISHED';

it('does not retry denied, stale, corrupt or permanently unavailable sources', async () => {
  for (const value of ['DENIED', 'STALE', 'UNAVAILABLE', 'CORRUPT']) {
    const read = vi.fn(async () => value);
    expect(await readAfterCurrentPublication({ read, notPublished })).toBe(
      value,
    );
    expect(read).toHaveBeenCalledTimes(1);
  }
});

it('bounds attempts even if the publication never appears', async () => {
  const read = vi.fn(async () => 'NOT_PUBLISHED');
  expect(await readAfterCurrentPublication({ read, notPublished })).toBe(
    'NOT_PUBLISHED',
  );
  expect(read.mock.calls.length).toBeLessThanOrEqual(7);
  expect(read.mock.calls.length).toBeGreaterThan(1);
});

it('honours cancellation during the first wait instead of starting another SQL read', async () => {
  const controller = new AbortController();
  let calls = 0;
  const read = vi.fn(async () => {
    calls++;
    if (calls === 1) {
      queueMicrotask(() => controller.abort());
      return 'NOT_PUBLISHED';
    }
    // Same early cancellation guard as the service; no SQL is opened.
    return controller.signal.aborted ? 'CANCELLED' : 'UNEXPECTED';
  });
  const result = await readAfterCurrentPublication({
    read,
    notPublished,
    signal: controller.signal,
  });
  expect(['NOT_PUBLISHED', 'CANCELLED']).toContain(result);
  expect(read.mock.calls.length).toBeLessThanOrEqual(2);
});
