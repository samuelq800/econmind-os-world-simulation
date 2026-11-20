/** Real JWT -> fixed API -> actual embedded SQL. The fixture's original
 * site/deposit/header registrations are installer metadata, not formal
 * physical/financial admission, native PG or successful Industry execution. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import * as C from '@econmind/core';
import { createIndustryRunParametersSqlFixture } from '../support/postwar-industry-run-parameters-fixture.js';
import {
  createPostwarOfficeRuntimeFetchHandler,
  POSTWAR_OFFICE_RUNTIME_READ_PATH,
} from '../../apps/world-api/src/runtime-preparation/postwar-office-runtime-fetch-handler.js';
import { POSTWAR_OFFICE_RUNTIME_SCHEMA } from '../../apps/world-api/src/integration/postwar-office-runtime-read-service.js';
let f: Awaited<ReturnType<typeof createIndustryRunParametersSqlFixture>>,
  handler: ReturnType<typeof createPostwarOfficeRuntimeFetchHandler>,
  acquired = 0,
  released = 0;
const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }),
  jwk = {
    ...keys.publicKey.export({ format: 'jwk' }),
    kid: 'TEST_ONLY_RUN_PARAMETERS',
    alg: 'ES256',
    use: 'sig',
    key_ops: ['verify'],
  },
  issuer = 'https://abcdefghijklmnopqrst.supabase.co/auth/v1',
  sql: string[] = [];
function token(who = f.f.subject) {
  const head = Buffer.from(
      JSON.stringify({ alg: 'ES256', kid: jwk.kid, typ: 'JWT' }),
    ).toString('base64url'),
    now = Math.floor(Date.now() / 1000),
    body = Buffer.from(
      JSON.stringify({
        sub: who,
        iss: issuer,
        aud: 'authenticated',
        iat: now - 1,
        exp: now + 300,
      }),
    ).toString('base64url'),
    raw = head + '.' + body;
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
          sql.push(q);
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
    modelVersion: C.WORLD_MODEL_VERSION,
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
      deploymentRef: 'TEST_ONLY_RUN_PARAMETERS',
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
async function call(
  page: Record<string, unknown> = {},
  authorization = token(),
  extra: Record<string, unknown> = {},
) {
  const r = await handler(
    new Request('https://read.example' + POSTWAR_OFFICE_RUNTIME_READ_PATH, {
      method: 'POST',
      headers: {
        origin: 'https://pages.example',
        authorization: 'Bearer ' + authorization,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        schemaVersion: POSTWAR_OFFICE_RUNTIME_SCHEMA,
        requestId: '11111111-1111-4111-8111-111111111111',
        operation: 'READ_CURRENT_OFFICE_OPENING',
        officeId: 'INDUSTRY',
        dataset: 'industry-run-parameters',
        page: { limit: 1, ...page },
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
describe('actual RUN parameter JWT API', () => {
  it('returns exact original references/currency and separates immutable origin from the observed head', async () => {
    const r = await call();
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.rows).toHaveLength(1);
    expect((r.body.rows as Record<string, unknown>[])[0]).toMatchObject({
      sourceRef: f.published.sourceRef,
      sourceRawSha256: f.published.sourceSha256,
      expenseCurrency: f.currency,
      countryId: 'COUNTRY_02',
    });
    expect(r.body.source).toMatchObject({
      dataNature: 'ADMITTED_IMMUTABLE_OPENING_FACTS',
      worldVersion: '0',
      originWorldVersion: '0',
      observedHead: { worldVersion: '0', eventSequence: '0' },
    });
    expect(
      (r.body.authority as { identity: { countryId: string } }).identity
        .countryId,
    ).toBe('COUNTRY_02');
  });
  it('retains JWT/subject/country isolation and cursor semantics without raw seed reads', async () => {
    expect((await call({}, 'NOT_A_JWT')).status).toBe(401);
    expect(
      (await call({}, token('33333333-3333-4333-8333-333333333333'))).status,
    ).toBe(403);
    expect((await call({}, token(), { countryId: 'COUNTRY_01' })).status).toBe(
      400,
    );
    const first = await call(),
      s = first.body.source as Record<string, unknown>;
    const empty = await call({
      offset: 1,
      sourceVersion: s.sourceVersion,
      bindingVersion: s.bindingVersion,
    });
    expect(empty.status, JSON.stringify(empty.body)).toBe(200);
    expect(empty.body.status).toBe('EMPTY');
    expect(
      (
        await call({
          sourceVersion: 'sha256:' + '0'.repeat(64),
          bindingVersion: s.bindingVersion,
        })
      ).status,
    ).toBe(409);
    expect(sql.some((q) => /\bfrom\s+world_v2\.opening_seed\b/iu.test(q))).toBe(
      false,
    );
  });
  it('does not retain original data after source revocation and releases every actual client', async () => {
    await f.f.reset();
    await f.db.exec(
      'set session authorization world_v2_industry_source_publisher',
    );
    await f.db.query(
      'select world_v2.revoke_postwar_industry_first_day_source($1,$2,$3)',
      [f.f.world, f.published.sourceRef, 'TEST_ONLY_API_REVOKED'],
    );
    const r = await call();
    expect(r.status).toBe(503);
    expect(r.body.rows).toBeUndefined();
    expect(acquired).toBe(released);
  });
});
