import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WORLD_MODEL_VERSION } from '@econmind/core';
const { pools } = vi.hoisted(() => ({ pools: vi.fn() }));
vi.mock(
  '../../apps/world-api/src/runtime-preparation/cloudflare-postgres-pools.js',
  () => ({
    withCloudflareExecutorRoutePools: pools,
  }),
);
import { handleConfiguredPostwarRead } from '../../apps/world-api/src/runtime-preparation/configured-postwar-read-handler.js';

const origin = 'https://world.example.org';
const metadata = {
  modelVersion: WORLD_MODEL_VERSION,
  readerRole: 'world_v2_postwar_projection_reader',
  authorizationPublisherRole: 'test_authorization_publisher',
  endpointPins: {
    origin: 'https://api.example.org',
    projectionPath: '/v1/postwar-office-runtime',
    finalLookupPath: '/v1/final-receipt',
    deploymentRef: 'TEST_DEPLOYMENT',
  },
  admittedWorldPins: {
    worldId: 'TEST_WORLD',
    seedRef: 'TEST_SEED',
    admissionRef: 'TEST_ADMISSION',
    contentHash: 'sha256:' + 'a'.repeat(64),
    minimumWorldVersion: '0',
  },
  auth: {
    projectRef: 'abcdefghijklmnopqrst',
    expectedIssuer: 'https://abcdefghijklmnopqrst.supabase.co/auth/v1',
    jwksUrl:
      'https://abcdefghijklmnopqrst.supabase.co/auth/v1/.well-known/jwks.json',
    audience: 'authenticated',
  },
  routeOptions: { allowedOrigins: [origin] },
};
const configured = () => ({
  RUNTIME_MODE: 'ADMITTED_READ_ONLY',
  POSTWAR_READ_CONFIGURATION_JSON: JSON.stringify({
    schemaVersion: 'postwar-admitted-read-config-v1',
    read: metadata,
  }),
  POSTWAR_READER: {
    connectionString: 'postgresql://test_reader:TEST_ONLY@localhost/test_only',
  },
});
function request(path: string, requestOrigin = origin) {
  return new Request('https://api.example.org' + path, {
    method: 'POST',
    headers: { origin: requestOrigin, 'content-type': 'application/json' },
    body: '{}',
  });
}
describe('protected postwar read configuration boundary (no database I/O)', () => {
  beforeEach(() => pools.mockReset());
  it('leaves unrelated routes to the existing handler without allocating a pool', async () => {
    expect(
      await handleConfiguredPostwarRead(request('/healthz'), configured()),
    ).toBeNull();
    expect(pools).not.toHaveBeenCalled();
  });
  it.each(['/v1/current-seat', '/v1/postwar-office-runtime'])(
    'keeps %s closed for HOLD, malformed configuration and absent binding',
    async (path) => {
      for (const environment of [
        {},
        { ...configured(), RUNTIME_MODE: 'HOLD' },
        { ...configured(), POSTWAR_READ_CONFIGURATION_JSON: '{invalid' },
        {
          ...configured(),
          POSTWAR_READ_CONFIGURATION_JSON: JSON.stringify({
            schemaVersion: 'postwar-admitted-read-config-v1',
            read: metadata,
            ready: true,
          }),
        },
        { ...configured(), POSTWAR_READER: undefined },
      ]) {
        const response = await handleConfiguredPostwarRead(
          request(path),
          environment,
        );
        expect(response).not.toBeNull();
        const body = await response!.json();
        expect(body.ok).toBe(false);
        expect(body).not.toHaveProperty('rows');
      }
      expect(pools).not.toHaveBeenCalled();
    },
  );
  it.each([
    ['/v1/current-seat', 'world-current-seat-v1'],
    ['/v1/postwar-office-runtime', 'postwar-office-runtime-read-v1'],
  ])(
    'reports a pool failure as retryable unavailability on %s without leaking connection details',
    async (path, schemaVersion) => {
      pools.mockRejectedValueOnce(
        new Error('TEST_ONLY_PASSWORD_MUST_NOT_LEAK'),
      );
      const response = await handleConfiguredPostwarRead(
        request(path),
        configured(),
      );
      expect(response!.status).toBe(503);
      expect(response!.headers.get('access-control-allow-origin')).toBe(origin);
      const body = await response!.json();
      expect(body.schemaVersion).toBe(schemaVersion);
      expect(body.ok).toBe(false);
      expect(body.error).toEqual({
        code: 'UPSTREAM_UNAVAILABLE',
        retryable: true,
      });
      expect(JSON.stringify(body)).not.toContain('PASSWORD');
      expect(pools).toHaveBeenCalledTimes(1);
      expect(pools.mock.calls[0][1]).toEqual({
        readerConnectionString: configured().POSTWAR_READER.connectionString,
        intake: null,
        sourceConnectionString: null,
      });
    },
  );
  it('does not reflect an unapproved Origin when an upstream fails', async () => {
    pools.mockRejectedValueOnce(new Error('TEST_ONLY_FAILURE'));
    const response = await handleConfiguredPostwarRead(
      request('/v1/postwar-office-runtime', 'https://unapproved.example.org'),
      configured(),
    );
    expect(response!.status).toBe(503);
    expect(response!.headers.has('access-control-allow-origin')).toBe(false);
  });
});
