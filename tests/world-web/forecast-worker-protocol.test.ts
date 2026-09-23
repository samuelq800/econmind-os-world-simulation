import { MessageChannel } from 'node:worker_threads';

import { expose, releaseProxy, wrap, type Endpoint } from 'comlink';
import { afterEach, describe, expect, it } from 'vitest';

import { createForecastClient } from '../../apps/world-web/src/forecast/client';
import {
  FORECAST_PROTOCOL_VERSION,
  createForecastWorkerApi,
  type ForecastRequest,
  type ForecastSnapshotIdentity,
  type ForecastWorkerApi,
} from '../../apps/world-web/src/forecast/protocol';

const identity: ForecastSnapshotIdentity = {
  worldId: 'world-1',
  countryId: 'country-7',
  scopeKey: 'office-finance',
  authorizationRevision: 'auth-3',
  projectionVersion: 'projection-4',
  modelVersion: 'model-2',
  snapshotRef: 'snapshot-9',
  worldVersion: '42',
};

function request(taskId = 'task-1'): ForecastRequest {
  return {
    protocolVersion: FORECAST_PROTOCOL_VERSION,
    taskId,
    snapshot: {
      identity: { ...identity },
      facts: [{ factRef: 'cash-1', value: '12.50', unit: 'GCU' }],
    },
    assumptions: [{ assumptionRef: 'horizon', value: '7', unit: 'sim-day' }],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const channels: MessageChannel[] = [];
afterEach(() => {
  for (const channel of channels.splice(0)) {
    channel.port1.close();
    channel.port2.close();
  }
});

describe('V26.1 browser forecast protocol preparation', () => {
  it('returns explicit unavailable reasons without manufacturing forecast values', async () => {
    const api = createForecastWorkerApi();
    expect(await api.run(request())).toMatchObject({
      kind: 'DERIVED_FORECAST',
      status: 'UNAVAILABLE',
      reason: 'MODEL_NOT_CONNECTED',
    });
    const empty = request('empty');
    expect(
      await api.run({ ...empty, snapshot: { ...empty.snapshot, facts: [] } }),
    ).toMatchObject({ status: 'UNAVAILABLE', reason: 'INPUTS_MISSING' });
  });

  it('rejects malformed version, amount and concurrent duplicate task identity', async () => {
    const pending = deferred<{
      readonly status: 'UNAVAILABLE';
      readonly reason: 'MODEL_NOT_CONNECTED';
    }>();
    const api = createForecastWorkerApi(async () => pending.promise);
    const first = api.run(request());
    expect(await api.run(request())).toMatchObject({
      status: 'FAILED',
      reason: 'INVALID_REQUEST',
    });
    expect(
      await api.run({
        ...request('bad-version'),
        snapshot: {
          ...request().snapshot,
          identity: { ...identity, worldVersion: '04' },
        },
      }),
    ).toMatchObject({ status: 'FAILED', reason: 'INVALID_REQUEST' });
    expect(
      await api.run({
        ...request('bad-amount'),
        assumptions: [{ assumptionRef: 'horizon', value: 'NaN', unit: 'day' }],
      }),
    ).toMatchObject({ status: 'FAILED', reason: 'INVALID_REQUEST' });
    pending.resolve({ status: 'UNAVAILABLE', reason: 'MODEL_NOT_CONNECTED' });
    await first;
  });

  it('only exposes named inputs to an executor and checks output provenance', async () => {
    let seenInput: ForecastRequest | undefined;
    const api = createForecastWorkerApi(async (input) => {
      seenInput = input;
      return {
        status: 'READY',
        values: [
          {
            forecastRef: 'future-cash',
            value: '11',
            unit: 'GCU',
            sourceFactRefs: ['unknown-private-fact'],
          },
        ],
      };
    });
    const input = {
      ...request(),
      unauthorizedSecret: 'must-not-enter-model',
      snapshot: {
        ...request().snapshot,
        hidden: 'must-not-enter-model',
        facts: [
          {
            factRef: 'cash-1',
            value: '12.50',
            unit: 'GCU',
            hidden: 'must-not-enter-model',
          },
        ],
      },
    };
    expect(await api.run(input)).toMatchObject({
      status: 'FAILED',
      reason: 'EXECUTION_FAILED',
    });
    expect(JSON.stringify(seenInput)).not.toContain('must-not-enter-model');
  });

  it('cancels an active computation even when it resolves after the abort', async () => {
    const pending = deferred<{
      readonly status: 'UNAVAILABLE';
      readonly reason: 'MODEL_NOT_CONNECTED';
    }>();
    let observedSignal: AbortSignal | undefined;
    const api = createForecastWorkerApi(async (_, signal) => {
      observedSignal = signal;
      return pending.promise;
    });
    const result = api.run(request());
    expect(await api.cancel('task-1')).toBe(true);
    expect(observedSignal?.aborted).toBe(true);
    pending.resolve({ status: 'UNAVAILABLE', reason: 'MODEL_NOT_CONNECTED' });
    expect(await result).toMatchObject({ status: 'CANCELLED' });
    expect(await api.cancel('task-1')).toBe(false);
  });

  it('discards results after projection or authorization revision changes', async () => {
    const pending = deferred<{
      readonly status: 'UNAVAILABLE';
      readonly reason: 'MODEL_NOT_CONNECTED';
    }>();
    const api = createForecastWorkerApi(async () => pending.promise);
    let current = identity;
    const client = createForecastClient(api, () => current);
    const result = client.run(request());
    current = { ...identity, authorizationRevision: 'auth-4' };
    pending.resolve({ status: 'UNAVAILABLE', reason: 'MODEL_NOT_CONNECTED' });
    expect(await result).toEqual({ state: 'STALE' });
    client.dispose();
  });

  it('keeps only the newest task and strips unexpected executor fields', async () => {
    const first = deferred<{
      readonly status: 'UNAVAILABLE';
      readonly reason: 'MODEL_NOT_CONNECTED';
    }>();
    const api = createForecastWorkerApi(async (input) =>
      input.taskId === 'older'
        ? first.promise
        : ({
            status: 'READY',
            values: [
              {
                forecastRef: 'derived-cash',
                value: '11.75',
                unit: 'GCU',
                sourceFactRefs: ['cash-1'],
                actual: 'must-not-escape',
              },
            ],
            actual: 'must-not-escape',
          } as never),
    );
    const client = createForecastClient(api, () => identity);
    const older = client.run(request('older'));
    const newer = await client.run(request('newer'));
    expect(newer.state).toBe('CURRENT');
    expect(JSON.stringify(newer)).not.toContain('must-not-escape');
    first.resolve({ status: 'UNAVAILABLE', reason: 'MODEL_NOT_CONNECTED' });
    expect(await older).toEqual({ state: 'STALE' });
    client.dispose();
  });

  it('transports the same safe unavailable contract over real Comlink RPC', async () => {
    const channel = new MessageChannel();
    channels.push(channel);
    expose(createForecastWorkerApi(), channel.port1 as unknown as Endpoint);
    const remote = wrap<ForecastWorkerApi>(
      channel.port2 as unknown as Endpoint,
    );
    try {
      const client = createForecastClient(remote, () => identity);
      expect(await client.run(request())).toMatchObject({
        state: 'CURRENT',
        result: { status: 'UNAVAILABLE', reason: 'MODEL_NOT_CONNECTED' },
      });
      client.dispose();
    } finally {
      remote[releaseProxy]();
    }
  });
});
