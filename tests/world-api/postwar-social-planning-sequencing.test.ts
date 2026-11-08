/** TEST_ONLY API sequencing protocol. Snapshot/store/planning seams below are
 * mocked; no private source token, SQL/RLS, registered Node or economic result
 * is issued. Production reader issuance has its separate boundary test. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WORLD_MODEL_VERSION } from '@econmind/core';
import type { ExplicitReadPreparationConfig } from '../../apps/world-api/src/runtime-preparation/explicit-read-preparation-config.js';
import { RequestCompletion } from '../../apps/world-api/src/runtime-preparation/request-completion.js';

const h = vi.hoisted(() => ({
  snapshot: vi.fn(),
  headers: vi.fn(),
  page: vi.fn(),
  verify: vi.fn(),
  planning: { read: vi.fn() },
}));
vi.mock(
  '../../apps/world-api/src/integration/postgres-server-read-binding.js',
  () => ({
    createPostgresServerReadBindingSnapshotReader: () => ({
      withReadOnlyExecutor: h.snapshot,
    }),
  }),
);
vi.mock(
  '../../apps/world-api/src/integration/postgres-full-read-provider.js',
  () => ({ createPersistedReadBindingConsumer: () => undefined }),
);
vi.mock(
  '../../apps/world-api/src/integration/supabase-jwks-signature-verifier.js',
  () => ({ createSupabaseJwksSignatureVerifier: () => ({ verify: h.verify }) }),
);
vi.mock(
  '@econmind/world-worker/postwar-social-service-creation-planning-read',
  () => ({
    // Protocol seam only: does not exercise or replace the real private issuer.
    isPostwarSocialServiceCreationPlanningReader: (reader: unknown) =>
      reader === h.planning,
  }),
);
vi.mock('@econmind/world-worker/postwar-office-runtime', () => ({
  PostwarOfficeProjectionStoreError: class extends Error {},
  POSTWAR_PROJECTION_DATASETS: {
    SOCIAL: ['service-pools'],
    INDUSTRY: [],
    TRADE: [],
    CAPTAIN: [],
  },
  createPostwarOfficeProjectionStore: () => ({
    readCurrentSeatHeadersFrom: h.headers,
    readPageFrom: h.page,
  }),
  createPostwarSocialMixedCurrentProjectionStore: () => ({
    readPageFrom: h.page,
  }),
  createPostwarCaptainCurrentProjectionStore: () => ({}),
}));
vi.mock('@econmind/world-worker/postwar-financial-current-read', () => ({
  POSTWAR_FINANCIAL_CURRENT_DATASETS: {},
  createPostwarFinancialMixedCurrentProjectionStore: () => ({}),
}));
vi.mock(
  '@econmind/world-worker/postwar-industry-utility-planning-read',
  () => ({ isPostwarIndustryUtilityPlanningReader: () => false }),
);
vi.mock('@econmind/world-worker/postwar-trade-current-read', () => ({
  createPostwarTradeCurrentProjectionStore: () => ({}),
}));
vi.mock('@econmind/world-worker/postwar-industry-run-parameters-read', () => ({
  createPostwarIndustryRunParametersReader: () => ({}),
}));
vi.mock('@econmind/world-worker/postwar-industry-labour-current-read', () => ({
  createPostwarIndustryLabourCurrentProjectionStore: () => ({}),
}));
vi.mock('@econmind/world-worker/postwar-physical-opening-facts-read', () => ({
  createPostwarPhysicalOpeningHeadReader: () => ({}),
  createPostwarPhysicalInventoryProvenanceReader: () => ({}),
}));
import { createPostwarOfficeRuntimeReadService } from '../../apps/world-api/src/integration/postwar-office-runtime-read-service.js';

const subject = '11111111-1111-4111-8111-111111111111';
const issuer = 'https://abcdefghijklmnopqrst.supabase.co/auth/v1';
const hash = `sha256:${'a'.repeat(64)}`;
const config: ExplicitReadPreparationConfig = {
  modelVersion: WORLD_MODEL_VERSION,
  pool: {
    async connect() {
      throw Error('PROTOCOL_MUST_NOT_OPEN_SQL');
    },
  },
  readerRole: 'test_only_reader',
  authorizationPublisherRole: 'test_only_publisher',
  admittedWorldPins: {
    worldId: 'WORLD_TEST',
    seedRef: 'SEED_TEST',
    contentHash: hash,
    admissionRef: 'ADMISSION_TEST',
    minimumWorldVersion: '0',
  },
  endpointPins: {
    origin: 'https://api.example.org',
    projectionPath: '/v1/postwar-office-runtime',
    finalLookupPath: '/v1/final-receipt',
    deploymentRef: 'TEST_ONLY',
  },
  routeOptions: { allowedOrigins: ['https://world.example.org'] },
  auth: {
    projectRef: 'abcdefghijklmnopqrst',
    expectedIssuer: issuer,
    jwksUrl: issuer + '/.well-known/jwks.json',
    audience: 'authenticated',
  },
};
function header() {
  return {
    scope: {
      worldId: 'WORLD_TEST',
      countryId: 'COUNTRY_02',
      officeId: 'SOCIAL',
      authSubject: subject,
      seatRef: 'SEAT_TEST',
      scopeKey: 'SCOPE_TEST',
      authorizationVersion: '1',
    },
    source: {
      modelVersion: WORLD_MODEL_VERSION,
      seedId: 'SEED_TEST',
      seedFingerprint: hash,
      admissionRef: 'ADMISSION_TEST',
      worldVersion: '3',
      eventSequence: '4',
      sourceVersion: hash,
      sourceRevision: '1',
      pageHash: hash,
      returnedRowsHash: hash,
      hashAlgorithm: 'SHA256',
      dataNature: 'DERIVED_CURRENT_SOCIAL_STATE',
      sourcePointer: { schemaVersion: 'TEST_ONLY_POINTER' },
    },
  };
}
let held = false;
let snapshots = 0;
const events: string[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  held = false;
  snapshots = 0;
  events.length = 0;
  h.verify.mockImplementation(async () => {
    events.push('jwt');
    const now = Math.floor(Date.now() / 1000);
    return {
      sub: subject,
      iss: issuer,
      aud: 'authenticated',
      iat: now - 1,
      exp: now + 300,
    };
  });
  h.snapshot.mockImplementation(async (_request, consume) => {
    expect(held).toBe(false);
    held = true;
    const index = ++snapshots;
    events.push(`acquire-${index}`);
    try {
      return await consume({});
    } finally {
      held = false;
      events.push(`release-${index}`);
    }
  });
  h.headers.mockImplementation(async () => [header()]);
  h.page.mockImplementation(async () => ({
    ...header(),
    status: 'PAGE',
    rows: [{ poolId: 'POOL_TEST' }],
    page: { offset: 0, limit: 50, totalRows: 1 },
  }));
  h.planning.read.mockImplementation(async (selection) => {
    events.push('worker');
    expect(held).toBe(false);
    expect(events.at(-2)).toBe('release-1');
    expect(selection).toEqual({
      countryId: 'COUNTRY_02',
      expectedHead: { worldVersion: '3', eventSequence: '4' },
      servicePoolIds: ['POOL_TEST'],
    });
    expect(Object.keys(selection.expectedHead).sort()).toEqual([
      'eventSequence',
      'worldVersion',
    ]);
    return { status: 'UNAVAILABLE', code: 'TEST_ONLY_NO_SOURCE_ISSUED' };
  });
});
function call() {
  return createPostwarOfficeRuntimeReadService(config, {
    socialServiceCreationPlanningReader: h.planning,
  }).handle({
    authorization: 'Bearer TEST_ONLY_PROTOCOL_TOKEN',
    request: {
      schemaVersion: 'postwar-office-runtime-read-v1',
      requestId: '22222222-2222-4222-8222-222222222222',
      operation: 'READ_CURRENT_OFFICE_OPENING',
      officeId: 'SOCIAL',
      dataset: 'service-pools',
    },
  });
}
describe('Social planning API sequencing, transport mocks only', () => {
  it('releases the page client, passes only the two head keys and freshly reauthorizes before returning', async () => {
    const result = await call();
    expect(result.httpStatus).toBe(200);
    expect(events).toEqual([
      'jwt',
      'acquire-1',
      'release-1',
      'worker',
      'jwt',
      'acquire-2',
      'release-2',
    ]);
    expect(result.body).toMatchObject({
      ok: true,
      source: {
        currentEmploymentServiceCreationOptions: {
          status: 'UNAVAILABLE',
          code: 'TEST_ONLY_NO_SOURCE_ISSUED',
        },
      },
    });
  });
  it.each(['jwt', 'seat', 'head', 'authorizationRevision'] as const)(
    'refuses the old page when %s changes during the independent worker read',
    async (changed) => {
      const original = h.planning.read.getMockImplementation()!;
      h.planning.read.mockImplementation(async (selection) => {
        const options = await original(selection);
        if (changed === 'jwt')
          h.verify.mockRejectedValueOnce(Error('JWT_EXPIRED'));
        else if (changed === 'seat') h.headers.mockResolvedValue([]);
        else
          h.headers.mockImplementation(async () => {
            const fresh = header();
            if (changed === 'head') fresh.source.worldVersion = '4';
            else fresh.scope.authorizationVersion = '2';
            return [fresh];
          });
        return options;
      });
      const result = await call();
      expect(result.httpStatus).toBe(
        changed === 'jwt' ? 401 : changed === 'seat' ? 403 : 409,
      );
      expect(result.body.ok).toBe(false);
      expect(result.body).not.toHaveProperty('rows');
      expect(result.body).not.toHaveProperty('source');
      expect(held).toBe(false);
    },
  );
  it('tracks the outstanding worker read through completion for request drain', async () => {
    const original = h.planning.read.getMockImplementation()!;
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let started!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    h.planning.read.mockImplementation(async (selection) => {
      const options = await original(selection);
      started();
      await pending;
      return options;
    });
    const completion = new RequestCompletion();
    const response = completion.run(call);
    await entered;
    expect(held).toBe(false);
    expect(completion.pending()).toBe(1);
    let drained = false;
    const drain = completion.drain().then(() => {
      drained = true;
    });
    await Promise.resolve();
    expect(drained).toBe(false);
    finish();
    expect((await response).httpStatus).toBe(200);
    await drain;
    expect(completion.pending()).toBe(0);
    expect(drained).toBe(true);
  });
});
