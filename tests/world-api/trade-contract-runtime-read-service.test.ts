import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { WORLD_MODEL_VERSION } from '@econmind/core';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { ExplicitReadPreparationConfig } from '../../apps/world-api/src/runtime-preparation/explicit-read-preparation-config.js';
import type { ServerVerifiedReadBinding } from '../../apps/world-api/src/integration/https-authenticated-read-composition.js';
import { parseSupabaseAuthSubject } from '../../apps/world-api/src/integration/identity.js';
import { createPostgresRuntimeReadExecutor } from '../../apps/world-api/src/integration/postgres-runtime-read-executor.js';
import { TRADE_CONTRACT_RUNTIME_READ_QUERY } from '../../apps/world-api/src/read-models/trade-contract-runtime-reader.js';
import {
  createTradeContractRuntimeReadService,
  TRADE_CONTRACT_RUNTIME_QUERY_OPERATION,
  TRADE_CONTRACT_RUNTIME_QUERY_SCHEMA,
  TRADE_CURRENT_TEAM_QUERY,
} from '../../apps/world-api/src/integration/trade-contract-runtime-read-service.js';

// TEST_ONLY trusted persisted-reader fixtures. JWT/JWKS crypto, claim parsing,
// current-seat coherence parser, exact executor whitelist, service composition
// and durable-row parser are real. These are not native SQL/RLS/admission tests;
// the separate runtime-reader suite exercises the actual SQL and migrations.
const h = vi.hoisted(() => ({
  seats: vi.fn(),
  snapshot: vi.fn(),
  consume: vi.fn(),
  sql: vi.fn(),
}));
vi.mock(
  '../../apps/world-api/src/integration/postgres-server-read-binding.js',
  () => ({
    createPostgresServerReadBindingSnapshotReader: () => ({
      read: h.snapshot,
      readCurrentSeats: h.seats,
    }),
  }),
);
vi.mock(
  '../../apps/world-api/src/integration/postgres-full-read-provider.js',
  () => ({
    createPersistedReadBindingConsumer: () => h.consume,
  }),
);
const subject = parseSupabaseAuthSubject(
  '123e4567-e89b-42d3-a456-426614174000',
);
const requestId = '123e4567-e89b-42d3-a456-426614174001';
const scopeKey = 'OFFICE_434F554E5452595F41_5452414445';
const projectRef = 'abcdefghijklmnopqrst';
const issuer = `https://${projectRef}.supabase.co/auth/v1`;
const fingerprint = `sha256:${'a'.repeat(64)}`;
const binding: ServerVerifiedReadBinding = {
  source: 'SERVER_VERIFIED_READ_BINDING',
  capability: 'READ_AUTHORIZED_PROJECTION_AND_FINAL',
  seatRef: 'SEAT_TEST_ONLY',
  seatState: 'ACTIVE',
  identity: {
    authSubjectId: subject,
    worldId: 'WORLD_A',
    countryId: 'COUNTRY_A',
    officeId: 'TRADE',
    scopeKey,
    classification: 'OFFICE_PRIVATE',
    authorizationRevision: 'REV_REAL',
    modelVersion: WORLD_MODEL_VERSION,
    projectionVersion: 'world-projection-read-v1',
  },
  seed: {
    worldId: 'WORLD_A',
    seedRef: 'SEED_TEST_ONLY',
    contentHash: fingerprint,
    admissionRef: 'ADMISSION_TEST_ONLY',
  },
  readback: {
    worldId: 'WORLD_A',
    seedRef: 'SEED_TEST_ONLY',
    contentHash: fingerprint,
    admissionRef: 'ADMISSION_TEST_ONLY',
    worldVersion: '2',
    eventSequence: '2',
    readbackRef: 'READBACK_TEST_ONLY',
  },
};
const config: ExplicitReadPreparationConfig = {
  pool: {
    connect: vi.fn(),
  } as unknown as ExplicitReadPreparationConfig['pool'],
  readerRole: 'test_only_read_role',
  authorizationPublisherRole: 'test_only_publisher',
  modelVersion: WORLD_MODEL_VERSION,
  endpointPins: {
    origin: 'https://read.example',
    projectionPath: '/v1/projection',
    finalLookupPath: '/v1/final-receipt',
    deploymentRef: 'DEPLOYMENT_TEST_ONLY',
  },
  admittedWorldPins: {
    worldId: 'WORLD_A',
    seedRef: 'SEED_TEST_ONLY',
    contentHash: fingerprint,
    admissionRef: 'ADMISSION_TEST_ONLY',
    minimumWorldVersion: '0',
  },
  auth: {
    projectRef,
    expectedIssuer: issuer,
    jwksUrl: issuer + '/.well-known/jwks.json',
    audience: 'authenticated',
  },
  routeOptions: { allowedOrigins: ['https://pages.example'] },
};
function request(page?: unknown) {
  return {
    schemaVersion: TRADE_CONTRACT_RUNTIME_QUERY_SCHEMA,
    requestId,
    operation: TRADE_CONTRACT_RUNTIME_QUERY_OPERATION,
    ...(page === undefined ? {} : { page }),
  };
}
function receipt(index: number) {
  return {
    worldId: 'WORLD_A',
    commandId: `COMMAND_${index}`,
    commandFingerprint: fingerprint,
    idempotencyKey: `KEY_${index}`,
    outcome: 'COMMITTED',
    transitionId: `COMMAND_${index}`,
    worldVersionBefore: String(index - 1),
    worldVersionAfter: String(index),
    eventIds: [`EVENT_${index}`],
    events: [
      {
        eventId: `EVENT_${index}`,
        eventSequence: String(index),
        eventFingerprint: fingerprint,
        worldVersion: String(index),
      },
    ],
    postings: [],
    commitAuthorization: {
      worldId: 'WORLD_A',
      commandId: `COMMAND_${index}`,
      authorityKind: 'DISCRETIONARY_USER',
      authSubject: subject,
      countryId: 'COUNTRY_A',
      officeId: 'TRADE',
      capability: 'TRADE_CONTRACTS',
      teamId: 'TEAM_REAL',
      authorizationRevision: 'REV_AT_COMMIT',
    },
  };
}
let keys: { publicKey: KeyObject; privateKey: KeyObject };
let jwk: Record<string, unknown>;
function token(
  changes: Record<string, unknown> = {},
  invalidSignature = false,
) {
  const now = Math.floor(Date.now() / 1000),
    header = Buffer.from(
      JSON.stringify({ alg: 'ES256', kid: 'TEST_ONLY_KEY', typ: 'JWT' }),
    ).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: subject,
      iss: issuer,
      aud: 'authenticated',
      iat: now - 60,
      exp: now + 3600,
      ...changes,
    }),
  ).toString('base64url');
  const unsigned = `${header}.${payload}`;
  const signature = sign('sha256', Buffer.from(unsigned), {
    key: invalidSignature
      ? generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey
      : keys.privateKey,
    dsaEncoding: 'ieee-p1363',
  }).toString('base64url');
  return `Bearer ${unsigned}.${signature}`;
}
beforeAll(() => {
  keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  jwk = {
    ...keys.publicKey.export({ format: 'jwk' }),
    kid: 'TEST_ONLY_KEY',
    alg: 'ES256',
    use: 'sig',
    key_ops: ['verify'],
  };
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      const response = Response.json({ keys: [jwk] });
      Object.defineProperty(response, 'url', { value: config.auth.jwksUrl });
      return response;
    }),
  );
  h.seats.mockResolvedValue([binding]);
  h.consume.mockResolvedValue(binding);
  h.snapshot.mockImplementation(async (_selector, consume) =>
    consume({}, { query: h.sql }),
  );
  h.sql.mockImplementation(async (sql, values: readonly string[]) => {
    if (sql === TRADE_CURRENT_TEAM_QUERY)
      return {
        rows: [{ team_id: 'TEAM_REAL', authorization_version: 'REV_REAL' }],
        rowCount: 1,
      };
    if (
      sql.startsWith(
        'select distinct country_id,office_id,team_id,authorization_version',
      )
    )
      return {
        rows: [
          {
            country_id: 'COUNTRY_A',
            office_id: 'TRADE',
            team_id: 'TEAM_REAL',
            authorization_version: 'REV_REAL',
          },
        ],
        rowCount: 1,
      };
    if (sql === TRADE_CONTRACT_RUNTIME_READ_QUERY) {
      const rows = [receipt(1), receipt(2)]
        .filter(
          (row) =>
            !values[10] ||
            BigInt(row.worldVersionAfter) > BigInt(values[10]) ||
            (row.worldVersionAfter === values[10] &&
              row.commandId > values[11]!),
        )
        .slice(0, Number(values[7]));
      return {
        rows: [
          {
            state: 'READY',
            world_version: '2',
            event_sequence: '2',
            receipts: rows,
          },
        ],
        rowCount: 1,
      };
    }
    throw Error('UNEXPECTED_TEST_QUERY');
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('authenticated Trade committed-reference service', () => {
  it('is disconnected by default without touching auth, current seats or SQL', async () => {
    expect(
      await createTradeContractRuntimeReadService().handle({
        authorization: token(),
        request: request(),
      }),
    ).toMatchObject({
      httpStatus: 503,
      body: { ok: false, error: { code: 'NOT_CONNECTED' } },
    });
    expect(h.seats).not.toHaveBeenCalled();
    expect(h.snapshot).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('composes real JWT crypto/current-seat parser/exact executor and resolves scope from persisted readers', async () => {
    const service = createTradeContractRuntimeReadService(config);
    const response = await service.handle({
      authorization: token({
        teamId: 'TEAM_CALLER',
        officeId: 'FINANCE',
        authorizationRevision: 'REV_CALLER',
      }),
      request: request(),
    });
    expect(response).toMatchObject({
      httpStatus: 200,
      body: {
        ok: true,
        page: {
          status: 'PAGE',
          watermark: { worldVersion: '2', eventSequence: '2' },
          rows: [{ commandId: 'COMMAND_1' }, { commandId: 'COMMAND_2' }],
        },
      },
    });
    expect(h.seats).toHaveBeenCalledWith(
      expect.objectContaining({ verifiedSubject: subject, worldId: 'WORLD_A' }),
      config.authorizationPublisherRole,
    );
    expect(h.sql).toHaveBeenCalledWith(TRADE_CURRENT_TEAM_QUERY, [
      'WORLD_A',
      subject,
      'COUNTRY_A',
      'REV_REAL',
    ]);
    expect(h.sql).toHaveBeenCalledWith(TRADE_CONTRACT_RUNTIME_READ_QUERY, [
      'WORLD_A',
      subject,
      'COUNTRY_A',
      'TEAM_REAL',
      'REV_REAL',
      'OFFICE_PRIVATE',
      scopeKey,
      '21',
      '',
      '',
      '',
      '',
    ]);
    expect(h.snapshot).toHaveBeenCalledTimes(2);
    expect(h.consume).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(response)).not.toMatch(
      /PRIVATE_|amount|canonical_payload/,
    );
    expect(fetch).toHaveBeenCalledWith(
      config.auth.jwksUrl,
      expect.objectContaining({ method: 'GET', credentials: 'omit' }),
    );
  });
  it.each([
    'scope',
    'worldId',
    'countryId',
    'officeId',
    'teamId',
    'authorizationRevision',
    'sql',
  ])('rejects caller %s as authority before auth or reads', async (key) => {
    const result = await createTradeContractRuntimeReadService(config).handle({
      authorization: token(),
      request: { ...request(), [key]: 'CALLER_SUPPLIED' },
    });
    expect(result).toMatchObject({
      httpStatus: 400,
      body: { ok: false, error: { code: 'INVALID_REQUEST' } },
    });
    expect(h.seats).not.toHaveBeenCalled();
  });
  it('rejects an invalid signature and wrong JWT issuer before current-seat resolution', async () => {
    for (const authorization of [
      token({}, true),
      token({ iss: 'https://wrong.example' }),
      undefined,
    ]) {
      expect(
        await createTradeContractRuntimeReadService(config).handle({
          authorization,
          request: request(),
        }),
      ).toMatchObject({
        httpStatus: 401,
        body: { ok: false, error: { code: 'AUTHENTICATION_INVALID' } },
      });
    }
    expect(h.seats).not.toHaveBeenCalled();
  });
  it('does not substitute another Office or an unadmitted binding', async () => {
    h.seats.mockResolvedValue([
      { ...binding, identity: { ...binding.identity, officeId: 'FINANCE' } },
    ]);
    expect(
      await createTradeContractRuntimeReadService(config).handle({
        authorization: token(),
        request: request(),
      }),
    ).toMatchObject({
      httpStatus: 403,
      body: { ok: false, error: { code: 'CURRENT_TRADE_SEAT_REQUIRED' } },
    });
    h.seats.mockResolvedValue([
      {
        ...binding,
        seed: { ...binding.seed, admissionRef: 'OTHER_ADMISSION' },
      },
    ]);
    expect(
      await createTradeContractRuntimeReadService(config).handle({
        authorization: token(),
        request: request(),
      }),
    ).toMatchObject({
      httpStatus: 503,
      body: { ok: false, error: { code: 'READ_BINDING_UNAVAILABLE' } },
    });
    expect(h.sql).not.toHaveBeenCalled();
  });
  it('reuses the actual current-seat coherence parser for team/country revision ambiguity', async () => {
    h.sql.mockResolvedValue({
      rows: [
        {
          country_id: 'COUNTRY_A',
          office_id: 'TRADE',
          team_id: 'TEAM_A',
          authorization_version: 'REV_REAL',
        },
        {
          country_id: 'COUNTRY_B',
          office_id: 'FINANCE',
          team_id: 'TEAM_B',
          authorization_version: 'REV_REAL',
        },
      ],
    });
    expect(
      await createTradeContractRuntimeReadService(config).handle({
        authorization: token(),
        request: request(),
      }),
    ).toMatchObject({
      httpStatus: 409,
      body: {
        ok: false,
        error: { code: 'CURRENT_AUTHORIZATION_NOT_COHERENT' },
      },
    });
    expect(
      h.sql.mock.calls.some(
        ([sql]) => sql === TRADE_CONTRACT_RUNTIME_READ_QUERY,
      ),
    ).toBe(false);
  });
  it('fails closed if current persisted authority disappears before the exact Trade read', async () => {
    h.consume.mockResolvedValueOnce(binding).mockResolvedValueOnce(null);
    expect(
      await createTradeContractRuntimeReadService(config).handle({
        authorization: token(),
        request: request(),
      }),
    ).toMatchObject({
      httpStatus: 503,
      body: { ok: false, error: { code: 'WORLD_HEAD_UNAVAILABLE' } },
    });
    expect(
      h.sql.mock.calls.some(
        ([sql]) => sql === TRADE_CONTRACT_RUNTIME_READ_QUERY,
      ),
    ).toBe(false);
  });
  it('supports bounded pages with a scope-bound version cursor through the authenticated service', async () => {
    const service = createTradeContractRuntimeReadService(config),
      first = await service.handle({
        authorization: token(),
        request: request({ limit: 1 }),
      });
    if (!first.body.ok || 'reason' in first.body.page)
      throw Error('EXPECTED_PAGE');
    expect(first.body.page.nextCursor).not.toBeNull();
    const second = await service.handle({
      authorization: token(),
      request: request({ limit: 1, cursor: first.body.page.nextCursor }),
    });
    expect(second).toMatchObject({
      httpStatus: 200,
      body: {
        ok: true,
        page: {
          status: 'PAGE',
          rows: [{ commandId: 'COMMAND_2' }],
          nextCursor: null,
        },
      },
    });
  });
  it.each([
    ['DENIED', 403, 'CURRENT_SCOPE_NOT_AUTHORIZED'],
    ['STALE', 409, 'PAGE_HEAD_CHANGED'],
    ['PARTY_UNAVAILABLE', 503, 'PARTY_CONTRACT_FACTS_UNAVAILABLE'],
  ])(
    'preserves %s without treating it as an empty page',
    async (state, status, code) => {
      const original = h.sql.getMockImplementation()!;
      h.sql.mockImplementation(async (sql, values) =>
        sql === TRADE_CONTRACT_RUNTIME_READ_QUERY
          ? {
              rows: [
                {
                  state,
                  world_version: null,
                  event_sequence: null,
                  receipts: [],
                },
              ],
            }
          : original(sql, values),
      );
      expect(
        await createTradeContractRuntimeReadService(config).handle({
          authorization: token(),
          request: request(),
        }),
      ).toMatchObject({
        httpStatus: status,
        body: { ok: false, error: { code } },
      });
    },
  );
  it('keeps authorized EMPTY separate from upstream unavailability', async () => {
    const original = h.sql.getMockImplementation()!;
    h.sql.mockImplementation(async (sql, values) =>
      sql === TRADE_CONTRACT_RUNTIME_READ_QUERY
        ? {
            rows: [
              {
                state: 'READY',
                world_version: '2',
                event_sequence: '2',
                receipts: [],
              },
            ],
          }
        : original(sql, values),
    );
    expect(
      await createTradeContractRuntimeReadService(config).handle({
        authorization: token(),
        request: request(),
      }),
    ).toMatchObject({
      httpStatus: 200,
      body: { ok: true, page: { status: 'EMPTY', rows: [] } },
    });
    h.sql.mockImplementation(async (sql, values) => {
      if (sql === TRADE_CONTRACT_RUNTIME_READ_QUERY)
        throw Error('TEST_ONLY_PRIVATE_DATABASE_ERROR');
      return original(sql, values);
    });
    const unavailable = await createTradeContractRuntimeReadService(
      config,
    ).handle({ authorization: token(), request: request() });
    expect(unavailable).toMatchObject({
      httpStatus: 503,
      body: { ok: false, error: { code: 'DATABASE_UNAVAILABLE' } },
    });
    expect(JSON.stringify(unavailable)).not.toContain('PRIVATE_DATABASE');
  });
  it('cancels before any JWT/current-seat request when already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    expect(
      await createTradeContractRuntimeReadService(config).handle({
        authorization: token(),
        request: request(),
        signal: controller.signal,
      }),
    ).toMatchObject({
      httpStatus: 499,
      body: { ok: false, error: { code: 'CANCELLED' } },
    });
    expect(h.seats).not.toHaveBeenCalled();
  });
  it.each([
    'R'.repeat(129),
    'R'.repeat(256),
    'revision/2026 with internal space',
  ])(
    'reads through a valid persisted revision fixture %# accepted by existing seat hydration',
    async (authorizationRevision) => {
      const current = {
        ...binding,
        identity: { ...binding.identity, authorizationRevision },
      };
      h.seats.mockResolvedValue([current]);
      h.consume.mockResolvedValue(current);
      const original = h.sql.getMockImplementation()!;
      h.sql.mockImplementation(async (sql, values) => {
        if (sql === TRADE_CURRENT_TEAM_QUERY)
          return {
            rows: [
              {
                team_id: 'TEAM_REAL',
                authorization_version: authorizationRevision,
              },
            ],
          };
        if (
          sql.startsWith(
            'select distinct country_id,office_id,team_id,authorization_version',
          )
        )
          return {
            rows: [
              {
                country_id: 'COUNTRY_A',
                office_id: 'TRADE',
                team_id: 'TEAM_REAL',
                authorization_version: authorizationRevision,
              },
            ],
          };
        return original(sql, values);
      });
      expect(
        await createTradeContractRuntimeReadService(config).handle({
          authorization: token(),
          request: request(),
        }),
      ).toMatchObject({
        httpStatus: 200,
        body: { ok: true, page: { status: 'PAGE' } },
      });
      expect(h.sql).toHaveBeenCalledWith(
        TRADE_CONTRACT_RUNTIME_READ_QUERY,
        expect.arrayContaining([authorizationRevision]),
      );
    },
  );
  it('reads an accepted 130-character derived private scope without shortening the country identity', async () => {
    const countryId = 'C'.repeat(56),
      privateScope = `OFFICE_${Buffer.from(countryId).toString('hex').toUpperCase()}_5452414445`;
    expect(privateScope).toHaveLength(130);
    const current = {
      ...binding,
      identity: { ...binding.identity, countryId, scopeKey: privateScope },
    };
    h.seats.mockResolvedValue([current]);
    h.consume.mockResolvedValue(current);
    h.sql.mockImplementation(async (sql) => {
      if (sql === TRADE_CURRENT_TEAM_QUERY)
        return {
          rows: [{ team_id: 'TEAM_REAL', authorization_version: 'REV_REAL' }],
        };
      if (
        sql.startsWith(
          'select distinct country_id,office_id,team_id,authorization_version',
        )
      )
        return {
          rows: [
            {
              country_id: countryId,
              office_id: 'TRADE',
              team_id: 'TEAM_REAL',
              authorization_version: 'REV_REAL',
            },
          ],
        };
      if (sql === TRADE_CONTRACT_RUNTIME_READ_QUERY)
        return {
          rows: [
            {
              state: 'READY',
              world_version: '2',
              event_sequence: '2',
              receipts: [],
            },
          ],
        };
      throw Error('UNEXPECTED_TEST_QUERY');
    });
    expect(
      await createTradeContractRuntimeReadService(config).handle({
        authorization: token(),
        request: request(),
      }),
    ).toMatchObject({
      httpStatus: 200,
      body: { ok: true, page: { status: 'EMPTY' } },
    });
    expect(h.sql).toHaveBeenCalledWith(
      TRADE_CONTRACT_RUNTIME_READ_QUERY,
      expect.arrayContaining([countryId, privateScope]),
    );
  });
});

describe('exact Trade query admission to the trusted read-only executor', () => {
  const values = () => [
    'WORLD_A',
    subject,
    'COUNTRY_A',
    'TEAM_REAL',
    'REV_REAL',
    'OFFICE_PRIVATE',
    scopeKey,
    '21',
    '',
    '',
    '',
    '',
  ];
  it.each([
    'sql',
    'subject',
    'length',
    'number',
    'classification',
    'scope',
    'limit',
    'negative-version',
    'cursor-without-head',
    'blank-revision',
    'padded-revision',
    'oversized-revision',
  ])('rejects malformed %s before snapshot acquisition', async (change) => {
    const parameters: unknown[] = values();
    let text = TRADE_CONTRACT_RUNTIME_READ_QUERY;
    if (change === 'sql') text += '; select 1';
    if (change === 'subject')
      parameters[1] = '123e4567-e89b-42d3-a456-426614174009';
    if (change === 'length') parameters.pop();
    if (change === 'number') parameters[7] = 21;
    if (change === 'classification') parameters[5] = 'NEGOTIATION_PARTY';
    if (change === 'scope') parameters[6] = 'OFFICE_OTHER';
    if (change === 'limit') parameters[7] = '102';
    if (change === 'blank-revision') parameters[4] = '';
    if (change === 'padded-revision') parameters[4] = ' REV_REAL';
    if (change === 'oversized-revision') parameters[4] = 'R'.repeat(257);
    if (change === 'negative-version') parameters[8] = '-1';
    if (change === 'cursor-without-head') {
      parameters[10] = '1';
      parameters[11] = 'COMMAND_1';
    }
    const executor = createPostgresRuntimeReadExecutor(config);
    await expect(
      executor.query({
        text,
        values: parameters as string[],
        verifiedAuthSubject: subject,
      }),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
    expect(h.snapshot).not.toHaveBeenCalled();
    expect(h.sql).not.toHaveBeenCalled();
  });
  it('does not run exact SQL after the persisted consumer resolves a different seat/revision', async () => {
    h.consume.mockResolvedValue({
      ...binding,
      identity: { ...binding.identity, authorizationRevision: 'REV_DIFFERENT' },
    });
    const executor = createPostgresRuntimeReadExecutor(config);
    expect(
      await executor.query({
        text: TRADE_CONTRACT_RUNTIME_READ_QUERY,
        values: values(),
        verifiedAuthSubject: subject,
      }),
    ).toEqual({ rows: [] });
    expect(h.sql).not.toHaveBeenCalled();
  });
});
