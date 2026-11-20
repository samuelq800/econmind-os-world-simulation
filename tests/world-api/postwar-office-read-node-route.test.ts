/** Real TCP transport with deliberately unavailable SQL/JWKS. Positive data
 * publication belongs to the separate native shared-consumer acceptance. */
import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { WORLD_MODEL_VERSION } from '@econmind/core';
import { createPostwarOfficeReadNodeRoute } from '../../apps/world-api/src/runtime/postwar-finance-node-route.js';
let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});
async function fixture() {
  let connects = 0;
  const allowed = 'https://world.example.org';
  const route = createPostwarOfficeReadNodeRoute({
    modelVersion: WORLD_MODEL_VERSION,
    pool: {
      async connect() {
        connects++;
        throw Error('NO_SQL_EXPECTED');
      },
    },
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
      async fetch() {
        throw Error('NO_NETWORK_EXPECTED');
      },
    },
    routeOptions: { allowedOrigins: [allowed] },
  });
  const server = createServer((req, res) => {
    if (!route.matches(req)) {
      res.writeHead(404);
      res.end();
      return;
    }
    void route.handle(req, res).catch(() => {
      if (!res.destroyed) {
        res.writeHead(503);
        res.end();
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw Error('TEST_TCP_ADDRESS_REQUIRED');
  cleanup = async () => {
    route.stopAccepting();
    await route.drain();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  };
  return {
    url: 'http://127.0.0.1:' + address.port,
    allowed,
    route,
    connects: () => connects,
  };
}
describe('fixed current-page/current-seat Node transport', () => {
  it('mounts both exact read routes with CORS and JWT denial, never falling back to SQL or a command handler', async () => {
    const f = await fixture();
    for (const path of ['/v1/current-seat', '/v1/postwar-office-runtime']) {
      const cors = await fetch(f.url + path, {
        method: 'OPTIONS',
        headers: {
          origin: f.allowed,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'authorization,content-type',
        },
      });
      expect(cors.status).toBe(204);
      expect(cors.headers.get('access-control-allow-origin')).toBe(f.allowed);
      const missingJwt = await fetch(f.url + path, {
        method: 'POST',
        headers: { origin: f.allowed, 'content-type': 'application/json' },
        body: '{}',
      });
      expect(missingJwt.status).toBe(401);
      expect(missingJwt.headers.get('cache-control')).toContain('no-store');
      expect(
        (await fetch(f.url + path, { headers: { origin: f.allowed } })).status,
      ).toBe(405);
      expect(
        (
          await fetch(f.url + path + '?country=OTHER', {
            method: 'POST',
            body: '{}',
          })
        ).status,
      ).toBe(404);
    }
    expect(
      (
        await fetch(f.url + '/v1/office-command', {
          method: 'POST',
          body: '{}',
        })
      ).status,
    ).toBe(404);
    expect(f.connects()).toBe(0);
  });
  it('rejects an unlisted origin and stops accepting before borrowed pool cleanup', async () => {
    const f = await fixture();
    expect(
      (
        await fetch(f.url + '/v1/postwar-office-runtime', {
          method: 'POST',
          headers: { origin: 'https://other.example' },
          body: '{}',
        })
      ).status,
    ).toBe(403);
    f.route.stopAccepting();
    expect(
      (await fetch(f.url + '/v1/current-seat', { method: 'POST', body: '{}' }))
        .status,
    ).toBe(503);
    expect(f.connects()).toBe(0);
  });
});
