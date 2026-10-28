/** Clone of the one actual native reference; real bounded SQL + API + ES256
 * verification. Ephemeral TEST_ONLY identity keys are not Owner admission. */
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { Pool } from 'pg';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { WORLD_MODEL_VERSION } from '@econmind/core';
import {
  loadPostwarNativeReferenceMarker,
  clonePostwarNativeReference,
  type PostwarNativeReferenceMarker,
} from '../support/postwar-native-reference-db.js';
import {
  createPostwarOfficeRuntimeFetchHandler,
  POSTWAR_OFFICE_RUNTIME_READ_PATH,
} from '../../apps/world-api/src/runtime-preparation/postwar-office-runtime-fetch-handler.js';
const descriptor =
  '/workspace/.cloud-setup/evidence/postwar-reference-20261028/reference-db.json';
let marker: PostwarNativeReferenceMarker;
let clone: Awaited<ReturnType<typeof clonePostwarNativeReference>>;
let pool: Pool;
let handler: ReturnType<typeof createPostwarOfficeRuntimeFetchHandler>;
const idleFailures: string[] = [];
const project = 'abcdefghijklmnopqrst',
  issuer = `https://${project}.supabase.co/auth/v1`,
  jwksUrl = issuer + '/.well-known/jwks.json';
const origin = 'https://test-only-native-financial-api.example.invalid',
  ui = 'https://test-only-native-financial-ui.example.invalid';
const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jwk = {
  ...keys.publicKey.export({ format: 'jwk' }),
  kid: 'TEST_ONLY_FINANCIAL_REFERENCE_KEY',
  alg: 'ES256',
  use: 'sig',
  key_ops: ['verify'],
};
function token(subject: string) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: 'ES256', kid: jwk.kid, typ: 'JWT' }),
  ).toString('base64url');
  const claims = Buffer.from(
    JSON.stringify({
      sub: subject,
      iss: issuer,
      aud: 'authenticated',
      iat: now - 30,
      exp: now + 600,
    }),
  ).toString('base64url');
  const unsigned = `${header}.${claims}`;
  return (
    'Bearer ' +
    unsigned +
    '.' +
    sign('sha256', Buffer.from(unsigned), {
      key: keys.privateKey,
      dsaEncoding: 'ieee-p1363',
    }).toString('base64url')
  );
}
async function request(
  officeId: string,
  dataset: string,
  subject = marker.subject,
) {
  const response = await handler(
    new Request(origin + POSTWAR_OFFICE_RUNTIME_READ_PATH, {
      method: 'POST',
      headers: {
        authorization: token(subject),
        origin: ui,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        schemaVersion: 'postwar-office-runtime-read-v1',
        requestId: randomUUID(),
        operation: 'READ_CURRENT_OFFICE_OPENING',
        officeId,
        dataset,
        page: { offset: 0, limit: 25 },
      }),
    }),
  );
  if (!response) throw Error('ACTUAL_API_ROUTE_REQUIRED');
  return {
    status: response.status,
    headers: response.headers,
    body: (await response.json()) as Record<string, unknown>,
  };
}
beforeAll(async () => {
  marker = await loadPostwarNativeReferenceMarker(descriptor);
  const template = process.env.POSTWAR_BOUNDED_REFERENCE_TEMPLATE;
  if (!template || !/^postwar_clone_[a-z0-9_]+$/u.test(template))
    throw Error('ACTUAL_PUBLISHED_REFERENCE_TEMPLATE_REQUIRED');
  clone = await clonePostwarNativeReference(marker, 'financial_api', template);
  pool = new Pool({
    host: marker.socket,
    port: marker.port,
    database: clone.database,
    user: marker.roles.boundedReaderRole,
    max: 2,
    ssl: false,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 1000,
    application_name: 'TEST_ONLY_BOUNDED_FINANCIAL_API',
  });
  pool.on('error', (error) =>
    idleFailures.push('code' in error ? String(error.code) : 'UNKNOWN'),
  );
  handler = createPostwarOfficeRuntimeFetchHandler({
    pool,
    readerRole: marker.roles.boundedReaderRole,
    authorizationPublisherRole: marker.roles.authorizationPublisherRole,
    modelVersion: WORLD_MODEL_VERSION,
    endpointPins: {
      origin,
      projectionPath: POSTWAR_OFFICE_RUNTIME_READ_PATH,
      finalLookupPath: '/v1/final-receipt',
      deploymentRef: 'TEST_ONLY_BOUNDED_FINANCIAL_REFERENCE',
    },
    admittedWorldPins: {
      worldId: marker.worldId,
      seedRef: marker.seedId,
      contentHash: marker.seedFingerprint,
      admissionRef: marker.admissionRef,
      minimumWorldVersion: '0',
    },
    auth: {
      projectRef: project,
      expectedIssuer: issuer,
      jwksUrl,
      audience: 'authenticated',
      fetch: async (url) => {
        expect(String(url)).toBe(jwksUrl);
        const response = Response.json({ keys: [jwk] });
        Object.defineProperty(response, 'url', { value: jwksUrl });
        return response;
      },
    },
    routeOptions: { allowedOrigins: [ui] },
  });
}, 30000);
afterAll(async () => {
  await pool?.end();
  await clone?.drop();
});
describe('actual bounded native financial office API', () => {
  it('reads real Finance government legs and Central Bank original holdings with exact office/country and bounded bodies', async () => {
    const finance = await request('FINANCE', 'opening-financial-legs');
    expect(finance.status).toBe(200);
    expect(finance.body.ok).toBe(true);
    const source = finance.body.source as Record<string, unknown>;
    expect(source).toMatchObject({
      worldId: marker.worldId,
      countryId: marker.countryId,
      officeId: 'FINANCE',
      contentHash: marker.seedFingerprint,
      admissionRef: marker.admissionRef,
      worldVersion: '0',
      eventSequence: '0',
    });
    const rows = finance.body.rows as {
      leg: { account: { countryId: string; ownerId: string } };
    }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(
      rows.every(
        (r) =>
          r.leg.account.countryId === marker.countryId &&
          r.leg.account.ownerId === 'ENTITY_GOVERNMENT_01',
      ),
    ).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(finance.body))).toBeLessThanOrEqual(
      65536,
    );
    expect(finance.headers.get('cache-control')).toBe('private, no-store');
    const cb = await request('CENTRAL_BANK', 'cb-holdings');
    expect(cb.status).toBe(200);
    expect(cb.body.ok).toBe(true);
    expect(cb.body.source).toMatchObject({
      countryId: marker.countryId,
      officeId: 'CENTRAL_BANK',
      contentHash: marker.seedFingerprint,
    });
    const holdings = cb.body.rows as { category: string; holderId: string }[];
    expect(holdings).toHaveLength(2);
    expect(holdings.every((h) => h.holderId === 'ENTITY_CENTRAL_BANK_01')).toBe(
      true,
    );
    expect(holdings.map((h) => h.category).sort()).toEqual([
      'COMMERCIAL_BANK_RESERVE_ACCOUNTS',
      'TREASURY_GOVERNMENT_DEPOSIT',
    ]);
    expect(cb.body).not.toHaveProperty('quote');
    expect(cb.body).not.toHaveProperty('treasuryLiquidClaim');
    expect(JSON.stringify(cb.body)).not.toContain('COUNTRY_02');
    expect(idleFailures).toEqual([]);
  });
  it('denies raw seed access, foreign subject, cross-office datasets and same-head Finance revocation on the clone only', async () => {
    await expect(
      pool.query(
        'select canonical_payload from world_v2.opening_seed where world_id=$1',
        [marker.worldId],
      ),
    ).rejects.toMatchObject({ code: '42501' });
    for (const statement of [
      'select * from world_v2.postwar_office_projection_document',
      'select * from world_v2.postwar_office_projection_page',
      'select jsonb_agg(rows_text::jsonb) from world_v2.postwar_office_projection_page',
    ])
      await expect(pool.query(statement)).rejects.toMatchObject({
        code: '42501',
      });
    const cross = await request('FINANCE', 'cb-holdings');
    expect(cross.status).toBe(400);
    expect(cross.body.ok).toBe(false);
    expect(cross.body).not.toHaveProperty('rows');
    const foreign = await request(
      'FINANCE',
      'opening-financial-legs',
      '22222222-2222-4222-8222-222222222222',
    );
    expect(foreign.status).toBeGreaterThanOrEqual(400);
    expect(foreign.body.ok).toBe(false);
    expect(foreign.body).not.toHaveProperty('rows');
    await clone.installer.query(
      "update world_v2.current_commit_authorization set active=false where world_id=$1 and office_id='FINANCE'",
      [marker.worldId],
    );
    try {
      const denied = await request('FINANCE', 'opening-financial-legs');
      expect(denied.status).toBeGreaterThanOrEqual(400);
      expect(denied.body.ok).toBe(false);
      expect(denied.body).not.toHaveProperty('rows');
    } finally {
      await clone.installer.query(
        "update world_v2.current_commit_authorization set active=true where world_id=$1 and office_id='FINANCE'",
        [marker.worldId],
      );
    }
    expect(
      (
        await clone.installer.query(
          'select world_version::text,event_sequence::text from world_v2.world_head where world_id=$1',
          [marker.worldId],
        )
      ).rows,
    ).toEqual([{ world_version: '0', event_sequence: '0' }]);
  });
});
