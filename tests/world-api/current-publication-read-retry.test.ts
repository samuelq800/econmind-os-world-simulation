import { expect, it, vi } from 'vitest';
import type { PostwarOfficeRuntimeServiceResponse } from '../../apps/world-api/src/integration/postwar-office-runtime-read-service.js';
import { readAfterCurrentPublication } from '../../apps/world-api/src/integration/current-publication-read-retry.js';

const failure = (
  code: string,
  httpStatus = 503,
): PostwarOfficeRuntimeServiceResponse => ({
  httpStatus,
  body: {
    schemaVersion: 'postwar-office-runtime-read-v1',
    requestId: '44444444-4444-4444-8444-444444444444',
    ok: false,
    error: { code, retryable: false },
  },
});

const timing = vi.hoisted(() => ({
  wait: undefined as ((ms: number) => Promise<void>) | undefined,
}));
vi.mock('node:timers/promises', async (original) => {
  const actual = await original<typeof import('node:timers/promises')>();
  return {
    ...actual,
    setTimeout: (
      ms: number,
      value: undefined,
      options: { signal?: AbortSignal },
    ) =>
      timing.wait ? timing.wait(ms) : actual.setTimeout(ms, value, options),
  };
});

it('does not retry denied, stale or rejected sources', async () => {
  for (const response of [
    failure('CURRENT_OFFICE_SEAT_REQUIRED', 403),
    failure('STALE_SOURCE_SCOPE', 409),
    failure('CURRENT_FINANCIAL_UNAVAILABLE'),
  ]) {
    const read = vi.fn(async () => response);
    expect(await readAfterCurrentPublication(read)).toBe(response);
    expect(read).toHaveBeenCalledTimes(1);
  }
});

it('keeps six reads and 3.25s waiting within the original budget, preserving the public unavailable error', async () => {
  let waited = 0;
  timing.wait = async (ms) => {
    waited += ms;
  };
  const read = vi.fn(async () => failure('CURRENT_FINANCIAL_NOT_PUBLISHED'));
  try {
    expect(await readAfterCurrentPublication(read)).toEqual(
      failure('CURRENT_FINANCIAL_UNAVAILABLE'),
    );
    expect(read).toHaveBeenCalledTimes(6);
    expect(waited).toBe(3250);
  } finally {
    timing.wait = undefined;
  }
});

it('observes a published head between recurring commits instead of skipping its entire window', async () => {
  let elapsed = 0;
  timing.wait = async (ms) => {
    elapsed += ms;
  };
  // Transport control-flow fixture only; no source or authorization proof.
  const published = {
    httpStatus: 200,
    body: { ok: true },
  } as unknown as PostwarOfficeRuntimeServiceResponse;
  const read = vi.fn(async () =>
    elapsed % 3000 >= 1750 && elapsed % 3000 < 2750
      ? published
      : failure('CURRENT_SOCIAL_NOT_PUBLISHED'),
  );
  try {
    expect(await readAfterCurrentPublication(read)).toBe(published);
    expect(elapsed).toBe(1750);
    expect(read).toHaveBeenCalledTimes(4);
  } finally {
    timing.wait = undefined;
  }
});

it('returns 499 when cancelled during the wait without reading again', async () => {
  const controller = new AbortController();
  const read = vi.fn(async () => failure('CURRENT_FINANCIAL_NOT_PUBLISHED'));
  const pending = readAfterCurrentPublication(read, controller.signal);
  const timer = setTimeout(() => controller.abort(), 20);
  try {
    expect(await pending).toEqual(failure('CANCELLED', 499));
    expect(read).toHaveBeenCalledTimes(1);
  } finally {
    clearTimeout(timer);
  }
});

it('stops immediately if fresh authorization is denied after waiting', async () => {
  const denied = failure('CURRENT_OFFICE_SEAT_REQUIRED', 403);
  const read = vi
    .fn()
    .mockResolvedValueOnce(failure('CURRENT_SOCIAL_NOT_PUBLISHED'))
    .mockResolvedValue(denied);
  expect(await readAfterCurrentPublication(read)).toBe(denied);
  expect(read).toHaveBeenCalledTimes(2);
});
