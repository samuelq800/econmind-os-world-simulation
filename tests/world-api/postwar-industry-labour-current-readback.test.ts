/** TEST_ONLY API selector/JWT/lifecycle protocol with intercepted SQL rows.
 * It verifies shipped transport/store composition, not native publication. */
import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { describe, it, expect } from 'vitest';
import { WORLD_MODEL_VERSION } from '@econmind/core';
import {
  POSTWAR_INDUSTRY_LABOUR_CURRENT_DATASET,
  POSTWAR_INDUSTRY_LABOUR_CURRENT_NATURE,
} from '@econmind/core/postwar-industry-labour-current-contract';
import {
  createPostwarOfficeRuntimeFetchHandler,
  POSTWAR_OFFICE_RUNTIME_READ_PATH,
} from '../../apps/world-api/src/runtime-preparation/postwar-office-runtime-fetch-handler.js';
import { POSTWAR_OFFICE_RUNTIME_SCHEMA } from '../../apps/world-api/src/integration/postwar-office-runtime-read-service.js';
import type { ExplicitReadPreparationConfig } from '../../apps/world-api/src/runtime-preparation/explicit-read-preparation-config.js';
const id = '11111111-1111-4111-8111-111111111111',
  subject = '22222222-2222-4222-8222-222222222222',
  hash = 'sha256:' + 'a'.repeat(64),
  raw = 'b'.repeat(64);
function fixture(opening = false) {
  const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }),
    jwk = {
      ...keys.publicKey.export({ format: 'jwk' }),
      kid: 'TEST_ONLY_INDUSTRY_CURRENT',
      alg: 'ES256',
      use: 'sig',
      key_ops: ['verify'],
    };
  const issuer = 'https://abcdefghijklmnopqrst.supabase.co/auth/v1',
    world = 'WORLD_TEST_ONLY_INDUSTRY_CURRENT',
    scope = {
      worldId: world,
      countryId: 'COUNTRY_01',
      officeId: 'INDUSTRY',
      authSubject: subject,
      teamId: 'TEAM_TEST_ONLY',
      authorizationVersion: 'REV_TEST_ONLY',
      scopeKey: 'OFFICE_434F554E5452595F3031_494E445553545259',
      seatRef: 'SEAT_TEST_ONLY_INDUSTRY',
    };
  let currentSubject = '',
    acquired = 0,
    released = 0,
    revoked = false,
    mode:
      'PAGE' | 'UNAVAILABLE' | 'STALE' | 'EMPTY' | 'FAIL' | 'ADVANCED_HEADER' =
      'PAGE';
  const sql: string[] = [];
  const coverage = {
    schemaVersion: 'postwar-industry-labour-current-coverage-v1',
    countryId: 'COUNTRY_01',
    prefixFingerprint: hash,
    knownEffectsFingerprint: hash,
    globalWorldVersion: opening ? '0' : '3',
    globalEventSequence: opening ? '0' : '6',
    coveredThroughEventId: opening ? null : 'EVENT_TEST_ONLY_LAST',
    coveredThroughEventFingerprint: opening ? null : hash,
    financialPostingCount: opening ? '0' : '6',
    financialBatchCount: opening ? '0' : '2',
    financialPostingsFingerprint: hash,
    rowsHash: hash,
    originalScopeSha256: raw,
  };
  const rows = Array.from({ length: 7 }, (_, i) => ({
    schemaVersion: 'postwar-industry-labour-current-row-v1',
    countryId: 'COUNTRY_01',
    facilityId: 'FACILITY_TEST',
    locationId: 'REGION_TEST',
    operatorId: 'OP_TEST',
    positionId: 'POSITION_TEST_' + i,
    skill: 'HIGH',
    classificationId: 'STEEL',
    requiredCount: '10',
    openingFilledCount: '6',
    currentEmployedCount: opening ? '6' : '7',
    measurement: 'EMPLOYMENT_HEADCOUNT_NOT_ATTENDANCE_OR_PAYMENT',
    completedPersonDays: null,
    paidCost: null,
  }));
  const baseSource = {
    dataNature: opening
      ? 'ADMITTED_OPENING_INDUSTRY_EMPLOYMENT_HEADCOUNT'
      : POSTWAR_INDUSTRY_LABOUR_CURRENT_NATURE,
    sourceVersion: hash,
    sourceRevision: 'REVISION_TEST_ONLY',
    seedId: 'SEED_TEST_ONLY_INDUSTRY',
    seedFingerprint: hash,
    admissionRef: 'ADMISSION_TEST_ONLY_INDUSTRY',
    modelVersion: WORLD_MODEL_VERSION,
    replayBinding: 'TEST_ONLY_REPLAY',
    sourceBundleSha256: raw,
    canonicalSeedSha256: raw,
    worldVersion: opening ? '0' : '3',
    eventSequence: opening ? '0' : '6',
    originWorldVersion: '0',
    originEventSequence: '0',
    observedHead: {
      worldVersion: opening ? '0' : '3',
      eventSequence: opening ? '0' : '6',
    },
    currentIndustryLabourCoverage: coverage,
    pageHash: raw,
    returnedRowsHash: raw,
    hashAlgorithm: 'POSTGRES_JSONB_TEXT_UTF8_SHA256',
    sourcePointer: {
      sourceId: 'SOURCE_OPERATING_TEST',
      sourcePayloadHash: hash,
      canonicalSeedSha256: raw,
      path: '/carrier/socialEmployment/inputs/sourcePositions',
      selection: {
        countryId: 'COUNTRY_01',
        sourceBucket: 'INDUSTRY',
        employerRole: 'OP',
      },
    },
  };
  const pool = {
    async connect() {
      acquired++;
      return {
        async query(statement: string, args: readonly unknown[] = []) {
          sql.push(statement);
          if (statement.includes("set_config('request.jwt.claim.sub'"))
            currentSubject = String(args[0]);
          let result: unknown[] = [];
          if (statement.includes('current_user as role_name'))
            result = [
              {
                role_name: 'test_industry_labour_read',
                rolsuper: false,
                rolbypassrls: false,
                subject: currentSubject,
                read_only: 'on',
                isolation: 'repeatable read',
                unsafe: false,
                publisher: false,
                unsafe_role: false,
                publisher_member: false,
              },
            ];
          else if (statement.includes('read_postwar_office_projection_seats'))
            result =
              revoked || currentSubject !== subject
                ? []
                : [
                    {
                      world_id: world,
                      country_id: scope.countryId,
                      office_id: scope.officeId,
                      auth_subject: subject,
                      team_id: scope.teamId,
                      authorization_revision: scope.authorizationVersion,
                      scope_key: scope.scopeKey,
                      seat_ref: scope.seatRef,
                      admission_ref: baseSource.admissionRef,
                      seed_id: baseSource.seedId,
                      seed_fingerprint: hash,
                      model_version: WORLD_MODEL_VERSION,
                      replay_binding: baseSource.replayBinding,
                      source_bundle_sha256: raw,
                      world_version:
                        opening && mode !== 'ADVANCED_HEADER' ? '0' : '3',
                      event_sequence:
                        opening && mode !== 'ADVANCED_HEADER' ? '0' : '6',
                    },
                  ];
          else if (
            statement.includes('read_postwar_industry_labour_current_page')
          ) {
            if (mode === 'FAIL') throw Error('TEST_ONLY_BACKEND_FAILURE');
            if (['UNAVAILABLE', 'STALE'].includes(mode))
              result = [{ status: mode }];
            else {
              const offset = Number(args[1]),
                limit = Number(args[2]),
                values =
                  mode === 'EMPTY' ? [] : rows.slice(offset, offset + limit),
                bytes = JSON.stringify(values);
              result = [
                {
                  status: values.length === 0 ? 'EMPTY' : 'PAGE',
                  scope,
                  source: {
                    ...baseSource,
                    returnedRowsHash: createHash('sha256')
                      .update(bytes)
                      .digest('hex'),
                  },
                  page: {
                    offset,
                    limit,
                    returned: values.length,
                    total: 7,
                    nextOffset:
                      offset + values.length < 7
                        ? offset + values.length
                        : null,
                  },
                  rows_text: bytes,
                },
              ];
            }
          } else if (
            !/^(begin |commit$|rollback$|select set_config)/u.test(statement)
          )
            throw Error('UNEXPECTED_SQL_OR_H0_FALLBACK:' + statement);
          return { rows: result, rowCount: result.length };
        },
        release() {
          released++;
        },
      } as unknown as PoolClient;
    },
  } as Pick<Pool, 'connect'>;
  const config: ExplicitReadPreparationConfig = {
    pool,
    readerRole: 'test_industry_labour_read',
    authorizationPublisherRole: 'test_industry_labour_publisher',
    modelVersion: WORLD_MODEL_VERSION,
    endpointPins: {
      origin: 'https://read.example',
      projectionPath: POSTWAR_OFFICE_RUNTIME_READ_PATH,
      finalLookupPath: '/v1/final-receipt',
      deploymentRef: 'TEST_ONLY_INDUSTRY',
    },
    admittedWorldPins: {
      worldId: world,
      seedRef: baseSource.seedId,
      contentHash: hash,
      admissionRef: baseSource.admissionRef,
      minimumWorldVersion: '0',
    },
    routeOptions: { allowedOrigins: ['https://pages.example'] },
    auth: {
      projectRef: 'abcdefghijklmnopqrst',
      expectedIssuer: issuer,
      jwksUrl: issuer + '/.well-known/jwks.json',
      audience: 'authenticated',
      fetch: async (url) => {
        const response = Response.json({ keys: [jwk] });
        Object.defineProperty(response, 'url', { value: String(url) });
        return response;
      },
    },
  };
  const handler = createPostwarOfficeRuntimeFetchHandler(config);
  const token = (who = subject) => {
    const head = Buffer.from(
        JSON.stringify({ alg: 'ES256', kid: jwk.kid, typ: 'JWT' }),
      ).toString('base64url'),
      now = Math.floor(Date.now() / 1000),
      payload = Buffer.from(
        JSON.stringify({
          sub: who,
          iss: issuer,
          aud: 'authenticated',
          iat: now - 5,
          exp: now + 300,
        }),
      ).toString('base64url'),
      data = head + '.' + payload;
    return (
      'Bearer ' +
      data +
      '.' +
      sign('sha256', Buffer.from(data), {
        key: keys.privateKey,
        dsaEncoding: 'ieee-p1363',
      }).toString('base64url')
    );
  };
  const request = (page: Record<string, unknown> = {}) => ({
    schemaVersion: POSTWAR_OFFICE_RUNTIME_SCHEMA,
    requestId: id,
    operation: 'READ_CURRENT_OFFICE_OPENING',
    officeId: 'INDUSTRY',
    dataset: POSTWAR_INDUSTRY_LABOUR_CURRENT_DATASET,
    page: { limit: 2, ...page },
  });
  const call = async (body: unknown = request(), authorization = token()) => {
    const response = await handler(
      new Request('https://read.example' + POSTWAR_OFFICE_RUNTIME_READ_PATH, {
        method: 'POST',
        headers: {
          origin: 'https://pages.example',
          authorization,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      }),
    );
    if (!response) throw Error('FIXED_HANDLER_EXPECTED');
    return {
      response,
      body: (await response.json()) as Record<string, unknown>,
    };
  };
  return {
    call,
    request,
    token,
    sql,
    setMode(value: typeof mode) {
      mode = value;
    },
    revoke() {
      revoked = true;
    },
    counts: () => ({ acquired, released }),
  };
}
describe('Industry fixed current API transport (TEST_ONLY protocol)', () => {
  it('reads dedicated admitted-opening H0 headcount without pretending a committed event exists', async () => {
    const f = fixture(true),
      r = await f.call();
    expect(r.response.status).toBe(200);
    expect(r.body.source).toMatchObject({
      dataNature: 'ADMITTED_OPENING_INDUSTRY_EMPLOYMENT_HEADCOUNT',
      worldVersion: '0',
      eventSequence: '0',
      observedHead: { worldVersion: '0', eventSequence: '0' },
      currentIndustryLabourCoverage: {
        coveredThroughEventId: null,
        coveredThroughEventFingerprint: null,
      },
    });
    expect((r.body.rows as Record<string, unknown>[])[0]).toMatchObject({
      openingFilledCount: '6',
      currentEmployedCount: '6',
      completedPersonDays: null,
      paidCost: null,
    });
    expect(f.counts().acquired).toBe(f.counts().released);
  });

  it('does not advertise an H0 page as current after its fresh header advanced', async () => {
    const f = fixture(true);
    f.setMode('ADVANCED_HEADER');
    const r = await f.call();
    expect(r.response.status).toBe(503);
    expect(r.body.rows).toBeUndefined();
    expect(f.counts().acquired).toBe(f.counts().released);
  });
  it('routes verified JWT/current seat to only the new fixed store, forwards coverage and binds cursors', async () => {
    const f = fixture(),
      first = await f.call();
    expect(first.response.status).toBe(200);
    expect(first.response.headers.get('cache-control')).toBe(
      'private, no-store',
    );
    expect(first.body.dataset).toBe(POSTWAR_INDUSTRY_LABOUR_CURRENT_DATASET);
    const source = first.body.source as Record<string, unknown>;
    expect(source.dataNature).toBe(POSTWAR_INDUSTRY_LABOUR_CURRENT_NATURE);
    expect(source.currentIndustryLabourCoverage).toMatchObject({
      globalWorldVersion: '3',
      financialPostingCount: '6',
    });
    const second = await f.call(
      f.request({
        offset: 2,
        sourceVersion: source.sourceVersion,
        bindingVersion: source.bindingVersion,
      }),
    );
    expect(second.response.status).toBe(200);
    expect(second.body.page).toMatchObject({
      offset: 2,
      returned: 2,
      total: 7,
    });
    const end = await f.call(
      f.request({
        offset: 7,
        sourceVersion: source.sourceVersion,
        bindingVersion: source.bindingVersion,
      }),
    );
    expect(end.response.status).toBe(200);
    expect(end.body.status).toBe('EMPTY');
    expect(end.body.rows).toEqual([]);
    expect(
      f.sql.some((s) =>
        s.includes('read_postwar_industry_labour_current_page'),
      ),
    ).toBe(true);
    expect(
      f.sql.some(
        (s) =>
          s.includes('read_postwar_office_projection_page') ||
          s.includes('canonical_payload'),
      ),
    ).toBe(false);
    expect(f.counts().acquired).toBe(f.counts().released);
  });
  it('returns unavailable/backend failure rather than H0 or fabricated EMPTY', async () => {
    for (const mode of ['UNAVAILABLE', 'FAIL', 'EMPTY'] as const) {
      const f = fixture();
      f.setMode(mode);
      const r = await f.call();
      expect(r.response.status).toBe(503);
      expect(r.body.ok).toBe(false);
      expect(r.body.rows).toBeUndefined();
      expect(f.counts().acquired).toBe(f.counts().released);
    }
  });
  it('uses exact current role on each request and refuses foreign principal/caller country selectors', async () => {
    const f = fixture();
    expect(
      (
        await f.call(
          f.request(),
          f.token('33333333-3333-4333-8333-333333333333'),
        )
      ).response.status,
    ).toBe(403);
    for (const extra of [
      { operatorId: 'OP_OTHER' },
      { facilityId: 'FACILITY_OTHER' },
      { sourceRef: 'CALLER_SOURCE' },
    ])
      expect((await f.call({ ...f.request(), ...extra })).response.status).toBe(
        400,
      );
    expect(
      (await f.call({ ...f.request(), countryId: 'COUNTRY_02' })).response
        .status,
    ).toBe(400);
    expect(
      (await f.call({ ...f.request(), officeId: 'FINANCE' })).response.status,
    ).toBe(400);
    expect((await f.call()).response.status).toBe(200);
    f.revoke();
    expect((await f.call()).response.status).toBe(403);
    expect(f.counts().acquired).toBe(f.counts().released);
  });
  it('keeps native-source STALE and API binding cursor mismatch at 409 without retrying a different source', async () => {
    const f = fixture();
    f.setMode('STALE');
    expect((await f.call()).response.status).toBe(409);
    f.setMode('PAGE');
    expect(
      (
        await f.call(
          f.request({
            sourceVersion: hash,
            bindingVersion: 'sha256:' + 'f'.repeat(64),
          }),
        )
      ).response.status,
    ).toBe(409);
    expect(
      f.sql.some((s) => s.includes('read_postwar_office_projection_page')),
    ).toBe(false);
  });
  it('rejects invalid JWT before acquiring a database connection', async () => {
    const f = fixture();
    expect(
      (await f.call(f.request(), 'Bearer invalid-token')).response.status,
    ).toBe(401);
    expect(f.counts()).toEqual({ acquired: 0, released: 0 });
  });
});
