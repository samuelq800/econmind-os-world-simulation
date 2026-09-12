import { describe, expect, it } from 'vitest';

import {
  MAX_WORLD_READ_RESPONSE_BYTES,
  LocalMockHttpWorldReadTransport,
  WorldReadFailure,
  executeWorldProjectionRead,
  createWorldReadRequest,
  type WorldReadTransport,
} from '../../apps/world-api/src/index.js';

const request = createWorldReadRequest({
  requestId: '123e4567-e89b-42d3-a456-426614174020',
  worldId: 'WORLD_1',
  classification: 'COUNTRY',
  scopeKey: 'COUNTRY_A',
});

function response(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 'world-read-api-v1',
    requestId: request.requestId,
    ok: true,
    data: {
      schemaVersion: 'world-projection-read-v1',
      worldId: 'WORLD_1',
      classification: 'COUNTRY',
      scopeKey: 'COUNTRY_A',
      watermark: {
        worldVersion: '1',
        eventSequence: '1',
        generatedAt: '2026-09-12T02:00:00.000Z',
      },
      payload: { status: 'READY' },
      receipts: [],
      events: [],
    },
    ...overrides,
  };
}

const policy = { maxAttempts: 2, timeoutMs: 50, retryDelayMs: 0 } as const;

describe('World read transport boundaries', () => {
  it('times out even when a transport ignores its abort signal', async () => {
    const transport: WorldReadTransport = {
      send: async () => new Promise(() => undefined),
    };
    await expect(
      executeWorldProjectionRead({
        transport,
        request,
        policy: { ...policy, timeoutMs: 1 },
      }),
    ).rejects.toMatchObject({ code: 'TIMEOUT', retryable: true });
  });

  it('stops retrying an upstream-provided authentication failure', async () => {
    let calls = 0;
    const transport: WorldReadTransport = {
      async send() {
        calls += 1;
        return {
          schemaVersion: 'world-read-api-v1',
          requestId: request.requestId,
          ok: false,
          error: {
            code: 'AUTHENTICATION_INVALID',
            message: 'untrusted upstream retry directive',
            retryable: true,
          },
        };
      },
    };
    await expect(
      executeWorldProjectionRead({ transport, request, policy }),
    ).rejects.toMatchObject({
      code: 'AUTHENTICATION_INVALID',
      retryable: false,
    });
    expect(calls).toBe(1);
  });

  it('stops retrying a directly thrown authentication failure', async () => {
    let calls = 0;
    const transport: WorldReadTransport = {
      async send() {
        calls += 1;
        throw new WorldReadFailure(
          'AUTHENTICATION_INVALID',
          'untrusted transport retry directive',
          true,
        );
      },
    };
    await expect(
      executeWorldProjectionRead({ transport, request, policy }),
    ).rejects.toMatchObject({
      code: 'AUTHENTICATION_INVALID',
      retryable: false,
    });
    expect(calls).toBe(1);
  });

  it('cancels an undeclared oversized streamed response before it is buffered', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(MAX_WORLD_READ_RESPONSE_BYTES + 1));
      },
      cancel() {
        cancelled = true;
      },
    });
    const transport = new LocalMockHttpWorldReadTransport(
      'http://127.0.0.1:4100',
      async () => new Response(body, { status: 200 }),
    );
    await expect(
      transport.send(request, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'PROTOCOL_ERROR', retryable: false });
    expect(cancelled).toBe(true);
  });
});
