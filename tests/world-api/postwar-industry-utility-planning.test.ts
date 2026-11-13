/** Actual JWT and embedded read-role metadata. No fake planning reader, source,
 * economic execution or native current-page success is issued here. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { WORLD_MODEL_VERSION } from '@econmind/core';
import { createIndustryRunParametersSqlFixture } from '../support/postwar-industry-run-parameters-fixture.js';
import { createPostwarOfficeRuntimeReadService } from '../../apps/world-api/src/integration/postwar-office-runtime-read-service.js';
import {
  createPostwarOfficeRuntimeFetchHandler,
  POSTWAR_OFFICE_RUNTIME_READ_PATH,
} from '../../apps/world-api/src/runtime-preparation/postwar-office-runtime-fetch-handler.js';
let f: Awaited<ReturnType<typeof createIndustryRunParametersSqlFixture>>,
  handler: ReturnType<typeof createPostwarOfficeRuntimeFetchHandler>,
  acquired = 0,
  released = 0;
const queries: string[] = [],
  keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }),
  issuer = 'https://abcdefghijklmnopqrst.supabase.co/auth/v1',
  jwk = {
    ...keys.publicKey.export({ format: 'jwk' }),
    kid: 'TEST_ONLY_UTILITY_PLANNING',
    alg: 'ES256',
    use: 'sig',
    key_ops: ['verify'],
  };
function token(subject = f.f.subject) {
  const header = Buffer.from(
      JSON.stringify({ alg: 'ES256', kid: jwk.kid, typ: 'JWT' }),
    ).toString('base64url'),
    now = Math.floor(Date.now() / 1000),
    body = Buffer.from(
      JSON.stringify({
        sub: subject,
        iss: issuer,
        aud: 'authenticated',
        iat: now - 1,
        exp: now + 300,
      }),
    ).toString('base64url'),
    raw = header + '.' + body;
  return (
    raw +
    '.' +
    sign('sha256', Buffer.from(raw), {
      key: keys.privateKey,
      dsaEncoding: 'ieee-p1363',
    }).toString('base64url')
  );
}
beforeAll(async () => {
  f = await createIndustryRunParametersSqlFixture();
  const pool = {
    async connect() {
      acquired++;
      await f.f.reset();
      await f.db.exec('set session authorization ' + f.f.readerRole);
      await f.db.exec('set role world_v2_postwar_projection_reader');
      return {
        async query(q: string, p?: unknown[]) {
          queries.push(q);
          const r = await f.db.query(q, p);
          return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
        },
        release() {
          released++;
        },
      } as unknown as PoolClient;
    },
  } as Pick<Pool, 'connect'>;
  handler = createPostwarOfficeRuntimeFetchHandler({
    pool,
    readerRole: 'world_v2_postwar_projection_reader',
    authorizationPublisherRole: 'world_v2_postwar_projection_publisher',
    modelVersion: WORLD_MODEL_VERSION,
    admittedWorldPins: {
      worldId: f.f.world,
      seedRef: f.f.seed.seedId,
      contentHash: f.f.seed.fingerprint,
      admissionRef: f.f.admissionRef,
      minimumWorldVersion: '0',
    },
    endpointPins: {
      origin: 'https://read.example',
      projectionPath: POSTWAR_OFFICE_RUNTIME_READ_PATH,
      finalLookupPath: '/v1/final-receipt',
      deploymentRef: 'TEST_ONLY_UTILITY_PLANNING',
    },
    routeOptions: { allowedOrigins: ['https://pages.example'] },
    auth: {
      projectRef: 'abcdefghijklmnopqrst',
      expectedIssuer: issuer,
      jwksUrl: issuer + '/.well-known/jwks.json',
      audience: 'authenticated',
      fetch: async (url) => {
        const r = Response.json({ keys: [jwk] });
        Object.defineProperty(r, 'url', { value: String(url) });
        return r;
      },
    },
  });
}, 30000);
afterAll(async () => {
  await f?.close();
});
async function call(jwt = token(), extra: Record<string, unknown> = {}) {
  const r = await handler(
    new Request('https://read.example' + POSTWAR_OFFICE_RUNTIME_READ_PATH, {
      method: 'POST',
      headers: {
        origin: 'https://pages.example',
        authorization: 'Bearer ' + jwt,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        schemaVersion: 'postwar-office-runtime-read-v1',
        requestId: '11111111-1111-4111-8111-111111111111',
        operation: 'READ_CURRENT_OFFICE_OPENING',
        officeId: 'INDUSTRY',
        dataset: 'industry-utility-planning',
        ...extra,
      }),
    }),
  );
  if (!r) throw Error('ACTUAL_HANDLER_REQUIRED');
  return {
    status: r.status,
    body: (await r.json()) as Record<string, unknown>,
  };
}
describe('Industry planning query requires the actual fixed reader after JWT/current seat', () => {
  it('returns typed missing503 after an actual authorized seat, not an invented empty page or H0 fallback', async () => {
    const r = await call();
    expect(r.status).toBe(503);
    expect(r.body).toMatchObject({
      ok: false,
      error: { code: 'INDUSTRY_UTILITY_PLANNING_NOT_INSTALLED' },
    });
    expect(r.body.rows).toBeUndefined();
    expect(acquired).toBe(released);
    expect(
      queries.some((q) =>
        /read_postwar_office_projection_page|from\s+world_v2\.opening_seed/iu.test(
          q,
        ),
      ),
    ).toBe(false);
  });
  it('retains signature, current subject and request-scope checks before source inspection', async () => {
    const before = queries.length;
    expect((await call('BAD_JWT')).status).toBe(401);
    expect(queries.length).toBe(before);
    expect(
      (await call(token('33333333-3333-4333-8333-333333333333'))).status,
    ).toBe(403);
    expect((await call(token(), { countryId: 'COUNTRY_01' })).status).toBe(400);
    expect(acquired).toBe(released);
  });
  it('rejects structural planning callbacks instead of treating their rows as a genuine source', () => {
    let called = false;
    expect(() =>
      createPostwarOfficeRuntimeReadService(null, {
        industryUtilityPlanningReader: {
          async readPage() {
            called = true;
            throw Error('MUST_NOT_CALL');
          },
        },
      }),
    ).toThrow('GENUINE_INDUSTRY_UTILITY_PLANNING_READER_REQUIRED');
    expect(called).toBe(false);
  });
});
