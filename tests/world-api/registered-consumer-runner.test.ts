import { describe, expect, it, vi } from 'vitest';
import { runRegisteredConsumer } from '../../apps/world-api/src/runtime/registered-consumer-runner.js';

describe('explicit registered FIFO runner', () => {
  it('never retries an unknown outcome or consumes a following command', async () => {
    const consumeOnce = vi.fn(async () => ({
      status: 'FAILED' as const,
      reason: 'OPERATIONAL_FAILURE_REQUIRES_RECOVERY' as const,
      commandId: 'COMMAND_UNKNOWN',
    }));
    const report = vi.fn();
    await expect(
      runRegisteredConsumer({
        consumer: { consumeOnce },
        signal: new AbortController().signal,
        report,
      }),
    ).rejects.toThrow('REGISTERED_CONSUMER_REQUIRES_RECOVERY');
    expect(consumeOnce).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith({
      event: 'REGISTERED_CONSUMER_STEP',
      status: 'FAILED',
      commandId: 'COMMAND_UNKNOWN',
      recoveryRequired: true,
    });
  });

  it('stops at the blocked FIFO head without invoking preparation or skipping it', async () => {
    const consumeOnce = vi.fn(async () => ({
      status: 'BLOCKED' as const,
      reason: 'SOURCE_REVOKED',
      commandId: 'HEAD',
    }));
    await expect(
      runRegisteredConsumer({
        consumer: { consumeOnce },
        signal: new AbortController().signal,
        report: vi.fn(),
      }),
    ).rejects.toThrow('REGISTERED_CONSUMER_REQUIRES_RECOVERY');
    expect(consumeOnce).toHaveBeenCalledTimes(1);
  });

  it('does not start another step after shutdown during an in-flight operation', async () => {
    const control = new AbortController();
    let settle!: (step: { status: 'IDLE' }) => void;
    const consumeOnce = vi.fn(
      () =>
        new Promise<{ status: 'IDLE' }>((resolve) => {
          settle = resolve;
        }),
    );
    const running = runRegisteredConsumer({
      consumer: { consumeOnce },
      signal: control.signal,
      report: vi.fn(),
    });
    control.abort();
    settle({ status: 'IDLE' });
    await running;
    expect(consumeOnce).toHaveBeenCalledTimes(1);
  });

  it('stops after a committed command whose derived page requires separate recovery', async () => {
    const consumeOnce = vi.fn(async () => ({
      status: 'PROCESSED' as const,
      commandId: 'COMMITTED_HEAD',
      derivedPublication: {
        status: 'UNAVAILABLE' as const,
        commandId: 'COMMITTED_HEAD',
        reason: 'DERIVED_PUBLICATION_REQUIRES_RETRY' as const,
      },
    }));
    await expect(
      runRegisteredConsumer({
        consumer: { consumeOnce },
        signal: new AbortController().signal,
        report: vi.fn(),
      }),
    ).rejects.toThrow('REGISTERED_CONSUMER_REQUIRES_RECOVERY');
    expect(consumeOnce).toHaveBeenCalledTimes(1);
  });

  it('does not poll after an already requested stop', async () => {
    const control = new AbortController();
    control.abort();
    const consumeOnce = vi.fn(async () => ({ status: 'IDLE' as const }));
    await runRegisteredConsumer({
      consumer: { consumeOnce },
      signal: control.signal,
      report: vi.fn(),
    });
    expect(consumeOnce).not.toHaveBeenCalled();
  });
});
