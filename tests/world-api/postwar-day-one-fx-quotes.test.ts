/** Real JWT -> fixed API -> actual embedded SQL. The fixture's original
 * site/deposit/header registrations are installer metadata, not formal
 * physical/financial admission, native PG or successful Industry execution. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import * as C from '@econmind/core';
import { createFxQuotesSqlFixture } from '../support/postwar-day-one-fx-quotes-fixture.js';
import {
  createPostwarOfficeRuntimeFetchHandler,
  POSTWAR_OFFICE_RUNTIME_READ_PATH,
} from '../../apps/world-api/src/runtime-preparation/postwar-office-runtime-fetch-handler.js';
import { POSTWAR_OFFICE_RUNTIME_SCHEMA } from '../../apps/world-api/src/integration/postwar-office-runtime-read-service.js';
let f: Awaited<ReturnType<typeof createFxQuotesSqlFixture>>,
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
  f = await createFxQuotesSqlFixture();
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
        officeId: 'FINANCE',
        dataset: 'day-one-fx-quotes',
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
describe('registered first-day FX quote JWT and actual SQL read', () => {
  it('returns only registered own-country quote refs and the existing runtime destination selector', async () => {
    const r = await call();
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const row = (r.body.rows as Record<string, unknown>[])[0]!;
    expect(row).toMatchObject({
      countryId: 'COUNTRY_02',
      quoteRef: f.quote.quoteRef,
      quoteSha256: f.quote.quoteSha256,
      localCurrency: 'XBB',
      dealerGcuAccountId: f.quote.dealerGcuAccountId,
    });
    expect(row.payerGcuAccountId).toBe(
      'ACCOUNT_DAY_ONE_GOV_GCU_' +
        C.canonicalSha256(
          C.canonicalHashInput({
            worldId: f.f.world,
            government: f.quote.governmentEntityId,
          }),
          (value) => createHash('sha256').update(value).digest('hex'),
        )
          .slice(7, 47)
          .toUpperCase(),
    );
    expect(row).not.toHaveProperty('balance');
    expect(row).not.toHaveProperty('ready');
    expect(r.body.source).toMatchObject({
      dataNature: 'ADMITTED_IMMUTABLE_OPENING_FACTS',
      originWorldVersion: '0',
      observedHead: { worldVersion: '0', eventSequence: '0' },
    });
  });
  it('keeps missing/foreign identity denied and rejects unsupported office selectors', async () => {
    expect((await call({}, 'NOT_A_JWT')).status).toBe(401);
    expect(
      (await call({}, token('00000000-0000-4000-8000-000000000002'))).status,
    ).not.toBe(200);
    expect(
      (await call({}, token(), { officeId: 'CENTRAL_BANK' })).status,
    ).not.toBe(200);
  });
  it('provides pinned bounded pagination and does not give readers raw quote/seed SELECT', async () => {
    const first = await call();
    const version = (first.body.source as { sourceVersion: string })
      .sourceVersion;
    const bindingVersion = (first.body.source as { bindingVersion: string })
      .bindingVersion;
    const next = await call({
      offset: 1,
      sourceVersion: version,
      bindingVersion,
    });
    expect(next.status, JSON.stringify(next.body)).toBe(200);
    expect(next.body.status).toBe('EMPTY');
    expect((await call({ offset: 1 })).status).not.toBe(200);
    expect(
      (
        await call({
          sourceVersion: 'sha256:' + '0'.repeat(64),
          bindingVersion,
        })
      ).status,
    ).not.toBe(200);
    await f.f.reset();
    await f.db.exec(
      'set session authorization ' +
        f.f.readerRole +
        ';set role world_v2_postwar_projection_reader',
    );
    const p = await f.db.query(
      "select has_table_privilege(current_user,'world_v2.postwar_day_one_fx_quote_original','SELECT')quote_read,has_column_privilege(current_user,'world_v2.opening_seed','canonical_payload','SELECT')seed_read",
    );
    expect(p.rows[0]).toEqual({ quote_read: false, seed_read: false });
    await expect(
      f.db.query('select world_v2.postwar_day_one_fx_quote_rows($1,$2,$3,$4)', [
        f.f.world,
        f.f.buyer,
        f.f.seed.fingerprint,
        f.f.admissionRef,
      ]),
    ).rejects.toMatchObject({ code: '42501' });
  });
  it('denies a revoked current Finance seat before returning any quote', async () => {
    await f.f.reset();
    await f.db.query(
      "update world_v2.current_commit_authorization set active=false where world_id=$1 and office_id='FINANCE'",
      [f.f.world],
    );
    try {
      const r = await call();
      expect(r.status).toBe(403);
      expect(r.body).not.toHaveProperty('rows');
    } finally {
      await f.f.reset();
      await f.db.query(
        "update world_v2.current_commit_authorization set active=true where world_id=$1 and office_id='FINANCE'",
        [f.f.world],
      );
    }
  });
  it('returns unavailable after actual quote revocation, never a synthetic empty or zero quote', async () => {
    await f.f.reset();
    await f.db.query(
      'insert into world_v2.postwar_day_one_fx_quote_revocation(world_id,country_id,quote_ref,reason_ref) values($1,$2,$3,$4)',
      [f.f.world, f.f.buyer, f.quote.quoteRef, 'TEST_ONLY_REVOKED'],
    );
    const r = await call();
    expect(r.status, JSON.stringify(r.body)).toBe(503);
    expect(r.body.ok).toBe(false);
    expect(r.body).not.toHaveProperty('rows');
    expect(acquired).toBe(released);
  });
});
