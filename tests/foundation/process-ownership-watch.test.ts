import { afterEach, expect, it, vi } from 'vitest';

import { watchProcessOwnership } from '../../scripts/process-parent-pid.mjs';

afterEach(() => vi.useRealTimers());

it('keeps a slow ownership check serial and stops scheduling after cancellation', async () => {
  vi.useFakeTimers();
  let resolveCheck!: (owned: boolean) => void;
  const check = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        resolveCheck = resolve;
      }),
  );
  const lost = vi.fn();
  const stop = watchProcessOwnership(check, lost);
  await vi.advanceTimersByTimeAsync(1000);
  expect(check).toHaveBeenCalledTimes(1);
  resolveCheck(true);
  await vi.advanceTimersByTimeAsync(1000);
  expect(check).toHaveBeenCalledTimes(2);
  stop();
  resolveCheck(false);
  await vi.advanceTimersByTimeAsync(1000);
  expect(check).toHaveBeenCalledTimes(2);
  expect(lost).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it.each(['missing', 'error'])(
  'fails closed once when the parent is %s',
  async (failure) => {
    vi.useFakeTimers();
    const check = vi.fn(async () => {
      if (failure === 'error') throw new Error('owner lookup failed');
      return false;
    });
    const lost = vi.fn();
    const stop = watchProcessOwnership(check, lost);
    await vi.advanceTimersByTimeAsync(1000);
    expect(check).toHaveBeenCalledTimes(1);
    expect(lost).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    stop();
  },
);
