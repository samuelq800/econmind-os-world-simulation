import { afterEach, describe, expect, it, vi } from 'vitest';
import { watchProcessOwnership } from '../../scripts/process-parent-pid.mjs';
afterEach(() => vi.useRealTimers());
describe('bounded launcher ownership observation', () => {
  it('keeps macOS ps observation bounded while checking the direct parent every tick', async () => {
    vi.useFakeTimers();
    const direct = vi.fn(() => true),
      observe = vi.fn(async () => true),
      lost = vi.fn();
    const stop = watchProcessOwnership({
      isDirectParent: direct,
      observeOwnership: observe,
      onLost: lost,
      platform: 'darwin',
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(direct).toHaveBeenCalledTimes(40);
    expect(observe).toHaveBeenCalledTimes(4);
    expect(lost).not.toHaveBeenCalled();
    stop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(direct).toHaveBeenCalledTimes(40);
  });
  it('does not overlap a slow parent observation and still detects direct-parent exit promptly', async () => {
    vi.useFakeTimers();
    let resolve!: (owned: boolean) => void;
    let direct = true;
    const observe = vi.fn(
        () =>
          new Promise<boolean>((r) => {
            resolve = r;
          }),
      ),
      lost = vi.fn();
    watchProcessOwnership({
      isDirectParent: () => direct,
      observeOwnership: observe,
      onLost: lost,
      platform: 'darwin',
    });
    await vi.advanceTimersByTimeAsync(2000);
    expect(observe).toHaveBeenCalledTimes(1);
    direct = false;
    await vi.advanceTimersByTimeAsync(25);
    expect(lost).toHaveBeenCalledTimes(1);
    resolve(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(lost).toHaveBeenCalledTimes(1);
  });
  it.each(['false', 'throw'])(
    'fails shut after an %s ownership result',
    async (mode) => {
      vi.useFakeTimers();
      const lost = vi.fn();
      watchProcessOwnership({
        isDirectParent: () => true,
        observeOwnership: async () => {
          if (mode === 'throw') throw Error('ps failed');
          return false;
        },
        onLost: lost,
        platform: 'darwin',
      });
      await vi.advanceTimersByTimeAsync(1000);
      expect(lost).toHaveBeenCalledTimes(1);
    },
  );
  it('keeps Linux procfs cadence and ignores a completion after shutdown', async () => {
    vi.useFakeTimers();
    const observe = vi.fn(async () => true),
      lost = vi.fn();
    const stop = watchProcessOwnership({
      isDirectParent: () => true,
      observeOwnership: observe,
      onLost: lost,
      platform: 'linux',
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(observe).toHaveBeenCalledTimes(4);
    stop();
    let resolve!: (owned: boolean) => void;
    const stopPending = watchProcessOwnership({
      isDirectParent: () => true,
      observeOwnership: () =>
        new Promise<boolean>((r) => {
          resolve = r;
        }),
      onLost: lost,
      platform: 'darwin',
    });
    await vi.advanceTimersByTimeAsync(25);
    stopPending();
    resolve(false);
    await vi.advanceTimersByTimeAsync(500);
    expect(lost).not.toHaveBeenCalled();
  });
});
