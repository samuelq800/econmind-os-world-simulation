import { createServer } from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';

import {
  createWorldReadRequest,
  executeWorldProjectionRead,
  FixtureWorldReadTransport,
  LocalMockHttpWorldReadTransport,
  OfflineWorldReadTransport,
  verifySupabaseJwtClaims,
  WORLD_PROJECTION_SCHEMA_VERSION,
  WORLD_READ_API_SCHEMA_VERSION,
  WorldReadFailure,
} from '../../apps/world-api/src/index.js';

const request = createWorldReadRequest({
  requestId: '123e4567-e89b-42d3-a456-426614174000',
  worldId: 'WORLD_1',
  classification: 'OFFICE_PRIVATE',
  scopeKey: 'COUNTRY_A_TRADE',
});

function successResponse() {
  return {
    schemaVersion: WORLD_READ_API_SCHEMA_VERSION,
    requestId: request.requestId,
    ok: true,
    data: {
      schemaVersion: WORLD_PROJECTION_SCHEMA_VERSION,
      worldId: 'WORLD_1',
      classification: 'OFFICE_PRIVATE',
      scopeKey: 'COUNTRY_A_TRADE',
      watermark: {
        worldVersion: '7',
        eventSequence: '11',
        generatedAt: '2026-09-12T02:00:00.000Z',
      },
      payload: { status: 'READY' },
      receipts: [
        {
          commandId: 'COMMAND_1',
          outcome: 'COMMITTED',
          reasonCode: null,
          worldVersionAfter: '7',
          eventIds: ['EVENT_11'],
          recordedAtReal: '2026-09-12T01:59:59.000Z',
        },
      ],
      events: [
        {
          eventId: 'EVENT_11',
          sequence: '11',
          worldVersion: '7',
          eventType: 'TRADE_ACCEPTED',
          recordedAtReal: '2026-09-12T01:59:59.000Z',
        },
      ],
    },
  };
}

describe('PREPARATION_ONLY_NOT_CONNECTED identity boundary', () => {
  it('requires an injected signature verifier then validates Supabase claims', async () => {
    let verifiedToken = '';
    const claims = await verifySupabaseJwtClaims({
      token: 'fixture-token-never-logged',
      verifier: {
        verify: (token) => {
          verifiedToken = token;
          return Promise.resolve({
            sub: '123e4567-e89b-42d3-a456-426614174000',
            iss: 'https://fixture.supabase.invalid/auth/v1',
            aud: 'authenticated',
            iat: 1_799_712_000,
            exp: 1_799_715_600,
          });
        },
      },
      policy: {
        expectedIssuer: 'https://fixture.supabase.invalid/auth/v1',
        expectedAudience: 'authenticated',
        nowEpochSeconds: 1_799_713_800,
      },
    });
    expect(verifiedToken).toBe('fixture-token-never-logged');
    expect(claims.authSubject).toBe('123e4567-e89b-42d3-a456-426614174000');
  });

  it.each([
    [
      'uppercase UUID',
      '123E4567-E89B-42D3-A456-426614174000',
      'authenticated',
      1_799_715_600,
    ],
    [
      'wrong audience',
      '123e4567-e89b-42d3-a456-426614174000',
      'anon',
      1_799_715_600,
    ],
    [
      'expired',
      '123e4567-e89b-42d3-a456-426614174000',
      'authenticated',
      1_799_713_000,
    ],
  ])('fails closed for %s', async (_case, sub, aud, exp) => {
    await expect(
      verifySupabaseJwtClaims({
        token: 'fixture',
        verifier: {
          verify: async () => ({
            sub,
            iss: 'https://fixture.supabase.invalid/auth/v1',
            aud,
            iat: 1_799_712_000,
            exp,
          }),
        },
        policy: {
          expectedIssuer: 'https://fixture.supabase.invalid/auth/v1',
          expectedAudience: 'authenticated',
          nowEpochSeconds: 1_799_713_800,
        },
      }),
    ).rejects.toThrow('JWT_CLAIMS_INVALID');
  });
});

describe('PREPARATION_ONLY_NOT_CONNECTED read transport', () => {
  const servers: Array<ReturnType<typeof createServer>> = [];

  afterEach(async () => {
    await Promise.all(
      servers
        .splice(0)
        .map(
          (server) =>
            new Promise<void>((resolve) => server.close(() => resolve())),
        ),
    );
  });

  it('validates a watermark, receipt and event fixture', async () => {
    const transport = new FixtureWorldReadTransport(async () =>
      successResponse(),
    );
    await expect(
      executeWorldProjectionRead({
        transport,
        request,
        policy: { maxAttempts: 1, timeoutMs: 100, retryDelayMs: 0 },
      }),
    ).resolves.toMatchObject({
      worldId: 'WORLD_1',
      watermark: { worldVersion: '7', eventSequence: '11' },
    });
    expect(transport.requests).toHaveLength(1);
  });

  it('retries only classified transient failures', async () => {
    let attempt = 0;
    const transport = new FixtureWorldReadTransport(async () => {
      attempt += 1;
      if (attempt < 3) {
        throw new WorldReadFailure(
          'UPSTREAM_UNAVAILABLE',
          'fixture unavailable',
          true,
        );
      }
      return successResponse();
    });
    await expect(
      executeWorldProjectionRead({
        transport,
        request,
        policy: { maxAttempts: 3, timeoutMs: 100, retryDelayMs: 0 },
      }),
    ).resolves.toMatchObject({ worldId: 'WORLD_1' });
    expect(attempt).toBe(3);
  });

  it('classifies offline, timeout and cancellation without retrying offline', async () => {
    await expect(
      executeWorldProjectionRead({
        transport: new OfflineWorldReadTransport(),
        request,
        policy: { maxAttempts: 3, timeoutMs: 100, retryDelayMs: 0 },
      }),
    ).rejects.toMatchObject({ code: 'OFFLINE', retryable: false });

    const never = new FixtureWorldReadTransport(
      (_request, signal) =>
        new Promise((_, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(new DOMException('aborted', 'AbortError')),
            { once: true },
          );
        }),
    );
    await expect(
      executeWorldProjectionRead({
        transport: never,
        request,
        policy: { maxAttempts: 1, timeoutMs: 5, retryDelayMs: 0 },
      }),
    ).rejects.toMatchObject({ code: 'TIMEOUT', retryable: true });

    const controller = new AbortController();
    controller.abort();
    await expect(
      executeWorldProjectionRead({
        transport: never,
        request,
        policy: { maxAttempts: 1, timeoutMs: 100, retryDelayMs: 0 },
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: 'CANCELLED', retryable: false });
  });

  it('connects only to a loopback mock server and never sends auth headers', async () => {
    let authorizationHeader: string | undefined;
    const server = createServer((incoming, outgoing) => {
      authorizationHeader = incoming.headers.authorization;
      const payload = JSON.stringify(successResponse());
      outgoing.writeHead(200, {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
      });
      outgoing.end(payload);
    });
    servers.push(server);
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    if (address === null || typeof address === 'string')
      throw new Error('port');
    const transport = new LocalMockHttpWorldReadTransport(
      `http://127.0.0.1:${address.port}`,
    );
    await expect(
      executeWorldProjectionRead({
        transport,
        request,
        policy: { maxAttempts: 1, timeoutMs: 500, retryDelayMs: 0 },
      }),
    ).resolves.toMatchObject({ worldId: 'WORLD_1' });
    expect(authorizationHeader).toBeUndefined();
    expect(
      () => new LocalMockHttpWorldReadTransport('https://example.com'),
    ).toThrow('LOCAL_MOCK_URL_MUST_BE_LOOPBACK_HTTP_ORIGIN');
  });

  it('rejects mismatched correlation and malformed projection data', async () => {
    const mismatch = successResponse();
    mismatch.requestId = '123e4567-e89b-42d3-a456-426614174001';
    await expect(
      executeWorldProjectionRead({
        transport: new FixtureWorldReadTransport(async () => mismatch),
        request,
        policy: { maxAttempts: 1, timeoutMs: 100, retryDelayMs: 0 },
      }),
    ).rejects.toMatchObject({ code: 'PROTOCOL_ERROR' });

    const malformed = successResponse();
    malformed.data.watermark.worldVersion = '-1';
    await expect(
      executeWorldProjectionRead({
        transport: new FixtureWorldReadTransport(async () => malformed),
        request,
        policy: { maxAttempts: 3, timeoutMs: 100, retryDelayMs: 0 },
      }),
    ).rejects.toMatchObject({ code: 'PROTOCOL_ERROR', retryable: false });
  });
});
