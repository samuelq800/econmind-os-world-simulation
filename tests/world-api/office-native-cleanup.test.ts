import { describe, expect, it, vi } from 'vitest';
import { finalizeOwnedContainer } from '../../tools/office-connection/native-evidence.mjs';

describe('native evidence resource cleanup failure paths', () => {
  it('removes the owned container even when preservation cannot write logs', () => {
    const remove = vi.fn(() => ({ status: 0 }));
    const result = finalizeOwnedContainer({
      attempted: true,
      collect() {
        throw Error('ENOSPC while writing evidence');
      },
      remove,
    });
    expect(remove).toHaveBeenCalledOnce();
    expect(result?.removed).toBe(true);
    expect(result?.preservationError).toContain('ENOSPC');
  });
  it('attempts cleanup after creation whose logging failed before success was recorded', () => {
    const collect = vi.fn(() => {
      throw Error('creation log unavailable');
    });
    const remove = vi.fn(() => ({ status: 0 }));
    expect(
      finalizeOwnedContainer({ attempted: true, collect, remove })?.removed,
    ).toBe(true);
    expect(remove).toHaveBeenCalledOnce();
  });
  it('does not claim removal when the cleanup command fails', () => {
    const result = finalizeOwnedContainer({
      attempted: true,
      collect() {},
      remove() {
        throw Error('Docker unavailable');
      },
    });
    expect(result?.removed).toBe(false);
    expect(result?.cleanupError).toContain('Docker unavailable');
  });
  it('does not touch containers when no creation was attempted', () => {
    const remove = vi.fn();
    expect(
      finalizeOwnedContainer({ attempted: false, collect: vi.fn(), remove }),
    ).toBeNull();
    expect(remove).not.toHaveBeenCalled();
  });
});
