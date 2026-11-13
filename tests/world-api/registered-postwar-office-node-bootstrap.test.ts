/** Lifecycle protocol checks. Mocked ownership is not source or DB acceptance. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  startRegisteredPostwarOfficeNodeBootstrap,
  type RegisteredPostwarOfficeNodeBootstrapInput,
} from '../../apps/world-api/src/runtime/registered-postwar-office-node-bootstrap.js';

const fixed = vi.hoisted(() => ({
  read: vi.fn(),
  owner: vi.fn(),
  listen: vi.fn(),
}));
vi.mock(
  '../../apps/world-worker/dist/runtime-preparation/finance-social-runtime-connection.js',
  () => ({ readPostwarFinanceSocialRuntimeBinding: fixed.read }),
);
vi.mock(
  '../../apps/world-api/src/runtime/postwar-finance-social-connection.js',
  () => ({ createPostwarFinanceSocialApiConnection: fixed.owner }),
);
vi.mock('../../apps/world-api/src/runtime.js', () => ({
  startApiRuntime: fixed.listen,
}));

function fixture() {
  const control = { startPreparation: vi.fn(), consumeOnce: vi.fn() };
  const owner = { worldId: 'WORLD_PROTOCOL', control, stop: vi.fn() };
  const running = {
    origin: 'http://127.0.0.1:4000',
    port: 4000,
    sharedOfficeConsumer: control,
    ready: () => true,
    shutdown: vi.fn(),
  };
  const input = {
    binding: { retryDerivedPublication: vi.fn() },
    social: { environment: 'staging' },
    api: { environment: 'staging' },
  } as unknown as RegisteredPostwarOfficeNodeBootstrapInput;
  fixed.read.mockReturnValue({ formalBinding: {}, environment: 'staging' });
  fixed.owner.mockResolvedValue(owner);
  fixed.listen.mockResolvedValue(running);
  return { input, owner, running, control };
}
beforeEach(() => vi.resetAllMocks());

describe('registered Node ownership protocol', () => {
  it('rejects a forged identity before taking ownership', async () => {
    const f = fixture();
    fixed.read.mockImplementation(() => {
      throw Error('GENUINE_FINANCE_SOCIAL_RUNTIME_CONNECTION_REQUIRED');
    });
    await expect(
      startRegisteredPostwarOfficeNodeBootstrap(f.input),
    ).rejects.toThrow('GENUINE_FINANCE_SOCIAL_RUNTIME_CONNECTION_REQUIRED');
    expect(fixed.owner).not.toHaveBeenCalled();
    expect(fixed.listen).not.toHaveBeenCalled();
  });
  it.each(['local-controller', 'api-mismatch', 'transport-mismatch'])(
    'refuses %s before transferring resources',
    async (reason) => {
      const f = fixture();
      if (reason === 'local-controller')
        fixed.read.mockReturnValue({
          formalBinding: null,
          environment: 'staging',
        });
      const input = {
        ...f.input,
        ...(reason === 'api-mismatch'
          ? { api: { ...f.input.api, environment: 'production' } }
          : {}),
        ...(reason === 'transport-mismatch'
          ? { social: { ...f.input.social, environment: 'ci' as const } }
          : {}),
      };
      await expect(
        startRegisteredPostwarOfficeNodeBootstrap(input),
      ).rejects.toThrow('POSTWAR_NODE_REGISTERED_FORMAL_SHARED_HOST_REQUIRED');
      expect(fixed.owner).not.toHaveBeenCalled();
    },
  );
  it('starts HTTP without starting preparation or consumption; joins shutdown once', async () => {
    const f = fixture();
    let finish!: () => void;
    f.running.shutdown.mockImplementation(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    const service = await startRegisteredPostwarOfficeNodeBootstrap(f.input);
    expect(fixed.listen).toHaveBeenCalledWith(f.input.api, {
      postwarFinanceSocialConnection: f.owner,
    });
    expect(f.control.startPreparation).not.toHaveBeenCalled();
    expect(f.control.consumeOnce).not.toHaveBeenCalled();
    expect(service.ready()).toBe(true);
    const stop = service.shutdown();
    expect(service.shutdown()).toBe(stop);
    expect(service.ready()).toBe(false);
    expect(f.owner.stop).not.toHaveBeenCalled();
    expect(() => service.consumer.consumeOnce()).toThrow('STOPPING_OR_STOPPED');
    finish();
    await stop;
    expect(f.owner.stop).toHaveBeenCalledTimes(1);
  });
  it('cleans the transferred owner if listener startup fails', async () => {
    const f = fixture();
    fixed.listen.mockRejectedValue(Error('LISTEN_FAILED'));
    await expect(
      startRegisteredPostwarOfficeNodeBootstrap(f.input),
    ).rejects.toThrow('LISTEN_FAILED');
    expect(f.owner.stop).toHaveBeenCalledTimes(1);
  });
  it('retains both startup and cleanup failure evidence', async () => {
    const f = fixture();
    fixed.listen.mockRejectedValue(Error('LISTEN_FAILED'));
    f.owner.stop.mockRejectedValue(Error('CLEANUP_FAILED'));
    const result = await startRegisteredPostwarOfficeNodeBootstrap(
      f.input,
    ).catch((error: unknown) => error);
    expect(result).toBeInstanceOf(AggregateError);
    expect(
      (result as AggregateError).errors.map((e: Error) => e.message),
    ).toEqual(['LISTEN_FAILED', 'REGISTERED_NODE_CLEANUP_UNCONFIRMED']);
  });
});
