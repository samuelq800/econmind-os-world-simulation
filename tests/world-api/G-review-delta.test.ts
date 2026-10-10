import { generateKeyPairSync, sign } from 'node:crypto';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import {
  WORLD_MODEL_VERSION,
  AUTHENTICATED_FINANCIAL_INTAKE_SCHEMA,
  AUTHENTICATED_CURRENT_SEAT_SCHEMA,
} from '@econmind/core';
import { validateReply } from '../../apps/world-api/src/runtime-preparation/bounded-executor-transport.js';
import { createExecutorCommandForwarder } from '../../apps/world-api/src/runtime-preparation/executor-command-forwarder.js';
import { createCurrentSeatFetchHandler } from '../../apps/world-api/src/runtime-preparation/current-seat-fetch-handler.js';
import type { ExplicitReadPreparationConfig } from '../../apps/world-api/src/runtime-preparation/explicit-read-preparation-config.js';

const subject = '11111111-1111-4111-8111-111111111111',
  requestId = '33333333-3333-4333-8333-333333333333';
const fingerprint = 'sha256:' + 'a'.repeat(64);
/** Wire/JWT mechanism fixture only. SQL always throws; no positive binding,
 * economic outcome, admission or actual executor construction is issued. */
function fixture() {
  const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const project = 'abcdefghijklmnopqrst',
    issuer = 'https://' + project + '.supabase.co/auth/v1',
    jwksUrl = issuer + '/.well-known/jwks.json';
  const jwk = {
    ...keys.publicKey.export({ format: 'jwk' }),
    kid: 'G_REVIEW_TEST_ONLY',
    alg: 'ES256',
    use: 'sig',
  };
  const calls = { jwt: 0, sql: 0 };
  const config: ExplicitReadPreparationConfig = {
    modelVersion: WORLD_MODEL_VERSION,
    pool: {
      connect: async () => {
        calls.sql++;
        throw new Error('TEST_ONLY_SQL_UNAVAILABLE');
      },
    } as Pick<Pool, 'connect'>,
    readerRole: 'g_test_only_reader',
    authorizationPublisherRole: 'g_test_only_publisher',
    endpointPins: {
      origin: 'https://api-test-only.example.invalid',
      projectionPath: '/v1/world-read',
      finalLookupPath: '/v1/world-final',
      deploymentRef: 'DEPLOYMENT_TEST_ONLY',
    },
    admittedWorldPins: {
      worldId: 'WORLD_TEST_ONLY',
      seedRef: 'SEED_TEST_ONLY',
      contentHash: fingerprint,
      admissionRef: 'ADMISSION_TEST_ONLY',
      minimumWorldVersion: '0',
    },
    routeOptions: {
      allowedOrigins: ['https://browser-test-only.example.invalid'],
    },
    auth: {
      projectRef: project,
      expectedIssuer: issuer,
      jwksUrl,
      audience: 'authenticated',
      fetch: async () => {
        calls.jwt++;
        const r = new Response(JSON.stringify({ keys: [jwk] }), {
          headers: { 'content-type': 'application/json' },
        });
        Object.defineProperty(r, 'url', { value: jwksUrl });
        return r;
      },
    },
  };
  const now = Math.floor(Date.now() / 1000);
  const h = Buffer.from(
    JSON.stringify({ alg: 'ES256', typ: 'JWT', kid: jwk.kid }),
  ).toString('base64url');
  const p = Buffer.from(
    JSON.stringify({
      sub: subject,
      iss: issuer,
      aud: 'authenticated',
      iat: now - 10,
      exp: now + 60,
    }),
  ).toString('base64url');
  const token =
    h +
    '.' +
    p +
    '.' +
    sign('sha256', Buffer.from(h + '.' + p), {
      key: keys.privateKey,
      dsaEncoding: 'ieee-p1363',
    }).toString('base64url');
  return { config, calls, token };
}
const actions = [
  'REGISTER',
  'INSPECT',
  'SIGN_SELLER',
  'SIGN_BUYER_TRADE',
  'SIGN_BUYER_FINANCE',
  'BIND_REFERENCE',
  'ENQUEUE',
  'READ',
] as const;
const offices = [
  'CAPTAIN',
  'FINANCE',
  'CENTRAL_BANK',
  'INDUSTRY',
  'TRADE',
  'SOCIAL',
] as const;
// Independently enumerated expected service/Core contract, not imported from
// the implementation's predicate. Every Office/action/state combination runs.
const allowedOffices: Record<(typeof actions)[number], readonly string[]> = {
  REGISTER: ['TRADE'],
  INSPECT: ['TRADE', 'FINANCE'],
  SIGN_SELLER: ['TRADE'],
  SIGN_BUYER_TRADE: ['TRADE'],
  SIGN_BUYER_FINANCE: ['FINANCE'],
  BIND_REFERENCE: ['FINANCE'],
  ENQUEUE: ['TRADE'],
  READ: ['TRADE'],
};
const allowedStates: Record<(typeof actions)[number], readonly string[]> = {
  REGISTER: [
    'PENDING_APPROVAL_OR_ENQUEUE',
    'QUEUED',
    'EXECUTING',
    'FINAL',
    'UNKNOWN',
  ],
  INSPECT: ['INTENT', 'NOT_FOUND'],
  SIGN_SELLER: ['SIGNATURE_RECORDED', 'NOT_FOUND'],
  SIGN_BUYER_TRADE: ['SIGNATURE_RECORDED', 'NOT_FOUND'],
  SIGN_BUYER_FINANCE: ['SIGNATURE_RECORDED', 'NOT_FOUND'],
  BIND_REFERENCE: ['REFERENCE_BOUND', 'NOT_FOUND'],
  ENQUEUE: ['QUEUED', 'EXECUTING', 'FINAL', 'UNKNOWN', 'NOT_FOUND'],
  READ: [
    'PENDING_APPROVAL_OR_ENQUEUE',
    'QUEUED',
    'EXECUTING',
    'FINAL',
    'UNKNOWN',
    'NOT_FOUND',
  ],
};
function request(action: string, officeId: string) {
  return {
    schemaVersion: 'world-staged-transfer-v1',
    action,
    officeId,
    worldId: 'WORLD_TEST_ONLY',
    countryId: 'COUNTRY_TEST_ONLY',
    commandId: 'COMMAND_TEST_ONLY',
    idempotencyKey: 'KEY_TEST_ONLY',
    commandFingerprint: fingerprint,
  };
}
function authority(
  r: ReturnType<typeof request>,
  c: ExplicitReadPreparationConfig,
) {
  const seed = {
    worldId: r.worldId,
    seedRef: c.admittedWorldPins.seedRef,
    contentHash: fingerprint,
    admissionRef: c.admittedWorldPins.admissionRef,
  };
  return {
    source: 'SERVER_VERIFIED_READ_BINDING',
    capability: 'READ_AUTHORIZED_PROJECTION_AND_FINAL',
    seatRef: 'SEAT_TEST_ONLY',
    seatState: 'ACTIVE',
    identity: {
      authSubjectId: subject,
      worldId: r.worldId,
      countryId: r.countryId,
      officeId: r.officeId,
      scopeKey:
        'OFFICE_' +
        Buffer.from(r.countryId).toString('hex').toUpperCase() +
        '_' +
        Buffer.from(r.officeId).toString('hex').toUpperCase(),
      classification: 'OFFICE_PRIVATE',
      authorizationRevision: 'AUTH_TEST_ONLY',
      modelVersion: c.modelVersion,
      projectionVersion: 'world-projection-read-v1',
    },
    seed,
    readback: {
      ...seed,
      worldVersion: '0',
      eventSequence: '0',
      readbackRef: seed.admissionRef,
    },
  };
}
function states(r: ReturnType<typeof request>) {
  const identity = {
    worldId: r.worldId,
    commandId: r.commandId,
    idempotencyKey: r.idempotencyKey,
    commandFingerprint: fingerprint,
  };
  const ack = {
    schemaVersion: 'command-acceptance-v1',
    status: 'ACCEPTED',
    worldId: r.worldId,
    commandId: r.commandId,
    commandFingerprint: fingerprint,
    acceptedSimTime: '10000',
    acceptedAtReal: '2026-10-10T00:00:00.000Z',
  };
  return [
    ...['PENDING_APPROVAL_OR_ENQUEUE', 'QUEUED', 'EXECUTING'].map((status) => ({
      status,
      acknowledgement: ack,
    })),
    {
      status: 'FINAL',
      acknowledgement: ack,
      receipt: {
        ...identity,
        schemaVersion: 'command-receipt-v2',
        outcome: 'REJECTED',
        reasonCode: 'TEST_ONLY_REJECTION',
        transitionId: null,
        worldVersionBefore: null,
        worldVersionAfter: null,
        simTime: '10000',
        eventIds: [],
        recordedAtReal: '2026-10-10T00:00:00.000Z',
      },
    },
    { status: 'UNKNOWN', ...identity, retryable: true },
    { status: 'NOT_FOUND' },
    {
      status: 'INTENT',
      commandId: r.commandId,
      idempotencyKey: r.idempotencyKey,
      commandFingerprint: fingerprint,
      expectedWorldVersion: '0',
      simTime: '10000',
      payload: {},
    },
    {
      status: 'SIGNATURE_RECORDED',
      officeId: r.officeId,
      commandFingerprint: fingerprint,
    },
    {
      status: 'REFERENCE_BOUND',
      approvalRef: 'APPROVAL_FINANCE_' + r.commandId,
      proposalRef: 'BUYER_APPROVAL_' + r.commandId,
      commandFingerprint: fingerprint,
    },
  ];
}
function reply(
  r: ReturnType<typeof request>,
  state: unknown,
  c: ExplicitReadPreparationConfig,
) {
  return {
    schemaVersion: AUTHENTICATED_FINANCIAL_INTAKE_SCHEMA,
    requestId,
    ok: true,
    authority: authority(r, c),
    state,
  };
}
describe('F-G-01 fixed financial action/Office/state protocol', () => {
  it.each(actions)(
    '%s exhausts all six Offices and nine state shapes',
    (action) => {
      const { config } = fixture();
      for (const office of offices)
        for (const state of states(request(action, office))) {
          const r = request(action, office);
          const expected =
            allowedOffices[action].includes(office) &&
            allowedStates[action].includes(state.status);
          expect(
            validateReply(
              '/v1/financial-intake',
              reply(r, state, config),
              requestId,
              r,
              subject,
              config,
              200,
            ),
            office + '/' + action + '/' + state.status,
          ).toBe(expected);
        }
    },
  );
  it.each([
    ['SIGN_BUYER_FINANCE', 'INTENT'],
    ['BIND_REFERENCE', 'SIGNATURE_RECORDED'],
  ] as const)(
    '%s cannot relay successful %s after dispatch',
    async (action, status) => {
      const f = fixture(),
        r = request(action, 'FINANCE'),
        state = states(r).find((s) => s.status === status);
      let dispatches = 0;
      const forward = createExecutorCommandForwarder({
        ...f.config,
        executor: {
          fetch: async () => {
            dispatches++;
            return new Response(JSON.stringify(reply(r, state, f.config)), {
              headers: { 'content-type': 'application/json' },
            });
          },
        },
      });
      const response = await forward(
        new Request(f.config.endpointPins.origin + '/v1/financial-intake', {
          method: 'POST',
          headers: {
            authorization: 'Bearer ' + f.token,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            schemaVersion: AUTHENTICATED_FINANCIAL_INTAKE_SCHEMA,
            requestId,
            request: r,
          }),
        }),
      );
      expect(response?.status).toBe(503);
      expect(await response?.json()).toMatchObject({
        ok: false,
        error: { code: 'WRITE_OUTCOME_UNKNOWN', retryable: false },
      });
      expect(dispatches).toBe(1);
      expect(f.calls.sql).toBe(0);
    },
  );
  it('preserves legitimate NOT_FOUND, original UNKNOWN and definite401/403/409 without replay', async () => {
    const f = fixture(),
      r = request('SIGN_BUYER_FINANCE', 'FINANCE');
    const outcomes = [
      { status: 200, body: reply(r, { status: 'NOT_FOUND' }, f.config) },
      {
        status: 503,
        body: {
          schemaVersion: AUTHENTICATED_FINANCIAL_INTAKE_SCHEMA,
          requestId,
          ok: false,
          state: {
            status: 'UNKNOWN',
            action: r.action,
            worldId: r.worldId,
            commandId: r.commandId,
            idempotencyKey: r.idempotencyKey,
            retryable: true,
          },
        },
      },
      ...[
        [401, 'AUTHENTICATION_INVALID'],
        [403, 'AUTHORIZATION_DENIED'],
        [409, 'IDEMPOTENCY_CONFLICT'],
        [503, 'WRITE_OUTCOME_UNKNOWN'],
      ].map(([status, code]) => ({
        status: Number(status),
        body: {
          schemaVersion: AUTHENTICATED_FINANCIAL_INTAKE_SCHEMA,
          requestId,
          ok: false,
          error: { code, retryable: false },
        },
      })),
    ];
    for (const original of outcomes) {
      let dispatches = 0;
      const forward = createExecutorCommandForwarder({
        ...f.config,
        executor: {
          fetch: async () => {
            dispatches++;
            return new Response(JSON.stringify(original.body), {
              status: original.status,
              headers: { 'content-type': 'application/json' },
            });
          },
        },
      });
      const response = await forward(
        new Request(f.config.endpointPins.origin + '/v1/financial-intake', {
          method: 'POST',
          headers: {
            authorization: 'Bearer ' + f.token,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            schemaVersion: AUTHENTICATED_FINANCIAL_INTAKE_SCHEMA,
            requestId,
            request: r,
          }),
        }),
      );
      expect(response?.status).toBe(original.status);
      expect(await response?.json()).toEqual(original.body);
      expect(dispatches).toBe(1);
    }
    expect(f.calls.sql).toBe(0);
  });
});
describe('F-G-02 approved current-seat1024-byte cap', () => {
  it.each([
    [1024, false],
    [1025, false],
    [1024, true],
    [1025, true],
  ] as const)('%i bytes; real streamed=%s', async (size, streamed) => {
    const f = fixture(),
      handler = createCurrentSeatFetchHandler(f.config);
    const json = JSON.stringify({
      schemaVersion: AUTHENTICATED_CURRENT_SEAT_SCHEMA,
      requestId,
    });
    const bytes = Buffer.from(
      '\n\t' + json + ' '.repeat(size - Buffer.byteLength(json) - 2),
    );
    expect(bytes.byteLength).toBe(size);
    let offset = 0,
      cancelled = false;
    const body = streamed
      ? new ReadableStream<Uint8Array>(
          {
            pull(controller) {
              if (offset === bytes.length) {
                controller.close();
                return;
              }
              const next = Math.min(offset + 512, bytes.length);
              controller.enqueue(bytes.subarray(offset, next));
              offset = next;
            },
            cancel() {
              cancelled = true;
            },
          },
          { highWaterMark: 0 },
        )
      : bytes.toString();
    const init: RequestInit & { duplex: 'half' } = {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + f.token,
        'content-type': 'application/json',
      },
      body,
      duplex: 'half',
    };
    const response = await handler(
      new Request(f.config.endpointPins.origin + '/v1/current-seat', init),
    );
    if (size === 1025) {
      expect(response?.status).toBe(413);
      expect(await response?.json()).toMatchObject({
        error: { code: 'REQUEST_TOO_LARGE' },
      });
      expect(f.calls).toEqual({ jwt: 0, sql: 0 });
      if (streamed) expect(cancelled).toBe(true);
    } else {
      // Valid1024 body crosses the cap/parser and real JWT, then the deliberate
      // unavailable SQL port. This is no fabricated positive seat response.
      expect(response?.status).toBe(503);
      expect(f.calls).toEqual({ jwt: 1, sql: 1 });
    }
  });
});
