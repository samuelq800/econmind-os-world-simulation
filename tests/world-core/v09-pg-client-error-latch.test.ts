import { describe, expect, it, vi } from 'vitest';

const mockedPg = vi.hoisted(() => {
  class MockClient {
    static instances: MockClient[] = [];

    readonly connect = vi.fn(async () => undefined);
    readonly end = vi.fn(async () => undefined);
    readonly query = vi.fn(async () => ({ rows: [] }));
    private readonly errorListeners: Array<(error: Error) => void> = [];

    constructor() {
      MockClient.instances.push(this);
    }

    on(event: string, listener: (error: Error) => void): this {
      if (event === 'error') this.errorListeners.push(listener);
      return this;
    }

    emitError(error: Error): void {
      for (const listener of this.errorListeners) listener(error);
    }
  }

  return { MockClient };
});

vi.mock('pg', () => ({ Client: mockedPg.MockClient }));

const { createPgStagingClient } =
  await import('../../scripts/v09-staging-evidence-runner.mjs');

describe('V09 PostgreSQL staging client error latch', () => {
  it('handles a terminated client error and propagates it through runner operations', async () => {
    const stagingClient = createPgStagingClient({
      connectionString: 'postgresql://postgres@127.0.0.1:5432/econmind_v09',
    });
    const client = mockedPg.MockClient.instances.at(-1);
    if (client === undefined) throw new Error('mock PostgreSQL client missing');
    const termination = new Error('Connection terminated unexpectedly');

    await stagingClient.connect();
    expect(() => client.emitError(termination)).not.toThrow();
    await expect(
      stagingClient.execute({ text: 'select 1', values: [] }),
    ).rejects.toBe(termination);
    expect(client.query).not.toHaveBeenCalled();
    await expect(stagingClient.end()).rejects.toBe(termination);
    expect(client.end).toHaveBeenCalledOnce();
  });
});
