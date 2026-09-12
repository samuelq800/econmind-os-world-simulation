import { describe, expect, it } from 'vitest';

import {
  createWorldReadRequest,
  executeAuthenticatedWorldProjectionRead,
  verifySupabaseJwtClaims,
  type ParameterizedPgReadExecutor,
} from '../../apps/world-api/src/index.js';

const subject = '123e4567-e89b-42d3-a456-426614174000';
const request = createWorldReadRequest({
  requestId: '123e4567-e89b-42d3-a456-426614174010',
  worldId: 'WORLD_1',
  classification: 'COUNTRY',
  scopeKey: 'COUNTRY_A',
});
const policy = {
  jwt: {
    expectedIssuer: 'https://issuer.example.test',
    expectedAudience: 'world-api',
    nowEpochSeconds: 1_800_000_000,
  },
  timeoutMs: 25,
} as const;

function verifiedClaims(overrides: Record<string, unknown> = {}) {
  return {
    sub: subject,
    iss: policy.jwt.expectedIssuer,
    aud: policy.jwt.expectedAudience,
    iat: 1_799_999_000,
    exp: 1_800_001_000,
    ...overrides,
  };
}

function projectionRows() {
  return [
    {
      world_id: 'WORLD_1',
      classification: 'COUNTRY',
      scope_key: 'COUNTRY_A',
      schema_version: 'world-projection-read-v1',
      world_version: '9',
      event_sequence: '14',
      payload: { status: 'READY' },
      generated_at: '2026-09-12T02:00:00.000Z',
    },
  ];
}

function input(
  overrides: Partial<{
    readonly authorization: unknown;
    readonly executor: ParameterizedPgReadExecutor;
    readonly policy: typeof policy;
    readonly request: unknown;
    readonly signal: AbortSignal;
    readonly verifier: {
      verify(token: string, signal?: AbortSignal): Promise<unknown>;
    };
  }> = {},
) {
  return {
    authorization: 'Bearer opaque-untrusted-token',
    executor: { query: async () => ({ rows: projectionRows() }) },
    policy,
    request,
    verifier: { verify: async () => verifiedClaims() },
    ...overrides,
  };
}

describe('authenticated World read boundary', () => {
  it('uses only the cryptographically verified subject in the entitlement query', async () => {
    const observed: string[] = [];
    const projection = await executeAuthenticatedWorldProjectionRead(
      input({
        authorization: 'Bearer untrusted.token.value',
        verifier: {
          async verify(token) {
            observed.push(token);
            return verifiedClaims();
          },
        },
        executor: {
          async query(query) {
            observed.push(query.values[0]!);
            return { rows: projectionRows() };
          },
        },
      }),
    );
    expect(observed).toEqual(['untrusted.token.value', subject]);
    expect(projection?.payload).toEqual({ status: 'READY' });
  });

  it('rejects an invalid signature or claims without querying the read model', async () => {
    let queries = 0;
    await expect(
      executeAuthenticatedWorldProjectionRead(
        input({
          verifier: {
            async verify() {
              throw new Error('signature detail must not escape');
            },
          },
          executor: {
            async query() {
              queries += 1;
              return { rows: projectionRows() };
            },
          },
        }),
      ),
    ).rejects.toMatchObject({
      code: 'AUTHENTICATION_INVALID',
      message: 'Bearer authentication is invalid',
      retryable: false,
    });
    expect(queries).toBe(0);
  });

  it('honors cancellation before verification begins', async () => {
    const controller = new AbortController();
    controller.abort();
    let verifications = 0;
    await expect(
      executeAuthenticatedWorldProjectionRead(
        input({
          signal: controller.signal,
          verifier: {
            async verify() {
              verifications += 1;
              return verifiedClaims();
            },
          },
        }),
      ),
    ).rejects.toMatchObject({ code: 'CANCELLED', retryable: false });
    expect(verifications).toBe(0);
  });

  it('does not start direct JWT verification after cancellation', async () => {
    const controller = new AbortController();
    controller.abort();
    let verifications = 0;
    await expect(
      verifySupabaseJwtClaims({
        token: 'opaque-untrusted-token',
        verifier: {
          async verify() {
            verifications += 1;
            return verifiedClaims();
          },
        },
        policy: policy.jwt,
        signal: controller.signal,
      }),
    ).rejects.toThrow('JWT_VERIFICATION_CANCELLED');
    expect(verifications).toBe(0);
  });

  it('enforces the total deadline when a verifier ignores abort', async () => {
    await expect(
      executeAuthenticatedWorldProjectionRead(
        input({
          policy: { ...policy, timeoutMs: 1 },
          verifier: { verify: async () => new Promise(() => undefined) },
        }),
      ),
    ).rejects.toMatchObject({ code: 'TIMEOUT', retryable: true });
  });

  it('enforces the total deadline when an executor ignores abort', async () => {
    await expect(
      executeAuthenticatedWorldProjectionRead(
        input({
          policy: { ...policy, timeoutMs: 1 },
          executor: {
            query: async () =>
              new Promise((resolve) => {
                setTimeout(() => resolve({ rows: projectionRows() }), 25);
              }),
          },
        }),
      ),
    ).rejects.toMatchObject({ code: 'TIMEOUT', retryable: true });
  });

  it('never retries a database read inside the server boundary', async () => {
    let calls = 0;
    await expect(
      executeAuthenticatedWorldProjectionRead(
        input({
          executor: {
            async query() {
              calls += 1;
              throw new Error('database unavailable');
            },
          },
        }),
      ),
    ).rejects.toMatchObject({ code: 'UPSTREAM_UNAVAILABLE', retryable: true });
    expect(calls).toBe(1);
  });

  it('rejects malformed raw request input before JWT verification', async () => {
    let verifications = 0;
    await expect(
      executeAuthenticatedWorldProjectionRead(
        input({
          request: { schemaVersion: 'world-read-api-v1' },
          verifier: {
            async verify() {
              verifications += 1;
              return verifiedClaims();
            },
          },
        }),
      ),
    ).rejects.toMatchObject({ code: 'PROTOCOL_ERROR', retryable: false });
    expect(verifications).toBe(0);
  });
});
