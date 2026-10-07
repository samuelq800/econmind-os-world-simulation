import {
  classifiedActivityWireFixture,
  classifiedOfficeScope,
} from '../support/classified-activity-wire-fixture.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createHttpsAuthenticatedReadComposition,
  type HttpsReadCompositionConfig,
  type ServerVerifiedReadBinding,
  type ServerReadBindingPort,
} from '../../apps/world-api/src/integration/https-authenticated-read-composition.js';
import { parseSupabaseAuthSubject } from '../../apps/world-api/src/integration/identity.js';
import { WORLD_V2_AUTHENTICATED_FINAL_RECEIPT_QUERY } from '../../apps/world-api/src/integration/postgres-final-receipt-reader.js';
import { WORLD_V2_ENTITLED_PROJECTION_QUERY } from '../../apps/world-api/src/integration/postgres-read-adapter.js';
import { createProductionReadClient } from '../../apps/world-web/src/production-read/client.js';

// OFFLINE TEST_ONLY ports: fake signature verifier, in-memory SQL result rows,
// invented TEST_* bindings. No database, network, cryptographic grant or World.
const subject = parseSupabaseAuthSubject(
  '22222222-2222-4222-8222-222222222222',
);
const requestId = '11111111-1111-4111-8111-111111111111';
const fingerprint = `sha256:${'a'.repeat(64)}`;
const offices = [
  'CAPTAIN',
  'FINANCE',
  'CENTRAL_BANK',
  'INDUSTRY',
  'TRADE',
  'SOCIAL',
];
function fixture(office = 'TRADE') {
  let binding: ServerVerifiedReadBinding | null = {
    source: 'SERVER_VERIFIED_READ_BINDING',
    capability: 'READ_AUTHORIZED_PROJECTION_AND_FINAL',
    seatRef: 'TEST_SEAT',
    seatState: 'ACTIVE',
    identity: {
      authSubjectId: subject,
      worldId: 'TEST_WORLD',
      countryId: 'TEST_COUNTRY',
      officeId: office,
      scopeKey: classifiedOfficeScope('TEST_COUNTRY', office),
      classification: 'OFFICE_PRIVATE',
      authorizationRevision: 'TEST_REVISION',
      modelVersion: 'TEST_MODEL',
      projectionVersion: 'TEST_PROJECTION',
    },
    seed: {
      worldId: 'TEST_WORLD',
      seedRef: 'TEST_SEED',
      contentHash: fingerprint,
      admissionRef: 'TEST_ADMISSION',
    },
    readback: {
      worldId: 'TEST_WORLD',
      seedRef: 'TEST_SEED',
      contentHash: fingerprint,
      admissionRef: 'TEST_ADMISSION',
      worldVersion: '2',
      eventSequence: '2',
      readbackRef: 'TEST_READBACK',
    },
  };
  const projectionRow = {
    world_id: 'TEST_WORLD',
    classification: 'OFFICE_PRIVATE',
    scope_key: classifiedOfficeScope('TEST_COUNTRY', office),
    schema_version: 'world-projection-read-v1',
    world_version: '2',
    event_sequence: '2',
    generated_at: '2026-10-06T00:00:00.000Z',
    payload: classifiedActivityWireFixture('TEST_COUNTRY', office),
  };
  const receiptRow = {
    receipt_world_id: 'TEST_WORLD',
    receipt_command_id: 'TEST_COMMAND',
    receipt_idempotency_key: 'TEST_KEY',
    receipt_schema_version: 'command-receipt-v2',
    receipt_command_fingerprint: fingerprint,
    outcome: 'COMMITTED',
    reason_code: null,
    transition_id: 'TEST_COMMAND',
    world_version_before: '1',
    world_version_after: '2',
    sim_time: '0',
    event_ids: ['TEST_EVENT'],
    recorded_at_real: '2026-10-06T00:00:00.000Z',
    submission_world_id: 'TEST_WORLD',
    submission_command_id: 'TEST_COMMAND',
    submission_idempotency_key: 'TEST_KEY',
    submission_command_fingerprint: fingerprint,
    submission_auth_subject: subject,
    submission_country_id: 'TEST_COUNTRY',
    submission_office_id: office,
  };
  const verifier = {
    verify: vi.fn(async () => ({
      sub: subject,
      iss: 'https://test-only-auth.example.invalid',
      aud: 'TEST_ONLY',
      iat: 500,
      exp: 2000,
    })),
  };
  const bindingReader = {
    resolve: vi.fn(
      async (input: Parameters<ServerReadBindingPort['resolve']>[0]) => {
        void input;
        return binding;
      },
    ),
  };
  const executor = {
    query: vi.fn(async (input: { text: string }) => {
      if (input.text === WORLD_V2_ENTITLED_PROJECTION_QUERY)
        return { rows: [projectionRow] };
      if (input.text === WORLD_V2_AUTHENTICATED_FINAL_RECEIPT_QUERY)
        return { rows: [receiptRow] };
      throw new Error('TEST_ONLY: unexpected query or mutation');
    }),
  };
  const config: HttpsReadCompositionConfig = {
    endpointPins: {
      origin: 'https://test-only-runtime.example.invalid',
      projectionPath: '/v1/world-read',
      finalLookupPath: '/v1/final-receipt',
      deploymentRef: 'TEST_DEPLOYMENT',
    },
    admittedWorldPins: {
      worldId: 'TEST_WORLD',
      seedRef: 'TEST_SEED',
      contentHash: fingerprint,
      admissionRef: 'TEST_ADMISSION',
      minimumWorldVersion: '1',
    },
    verifier,
    currentJwtPolicy: () => ({
      expectedIssuer: 'https://test-only-auth.example.invalid',
      expectedAudience: 'TEST_ONLY',
      nowEpochSeconds: 1000,
    }),
    executor,
    bindingReader,
  };
  const projectionRequest = {
    schemaVersion: 'world-read-api-v1',
    requestId,
    operation: 'READ_WORLD_PROJECTION',
    payload: {
      worldId: 'TEST_WORLD',
      classification: 'OFFICE_PRIVATE',
      scopeKey: classifiedOfficeScope('TEST_COUNTRY', office),
    },
  };
  const finalRequest = {
    schemaVersion: 'world-final-receipt-read-v1',
    requestId,
    operation: 'READ_FINAL_NARROW_TRANSFER_RECEIPT',
    payload: {
      worldId: 'TEST_WORLD',
      commandId: 'TEST_COMMAND',
      idempotencyKey: 'TEST_KEY',
    },
  };
  return {
    config,
    projectionRequest,
    finalRequest,
    verifier,
    bindingReader,
    executor,
    projectionRow,
    receiptRow,
    binding: () => binding,
    setBinding: (value: ServerVerifiedReadBinding | null) => {
      binding = value;
    },
  };
}
const authorization = 'Bearer TEST_ONLY_OPAQUE_TOKEN';
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('HTTP-neutral authenticated read composition / OFFLINE TEST_ONLY', () => {
  it('has only two read handlers, installs no host, defaults NOT_CONNECTED', async () => {
    const port = createHttpsAuthenticatedReadComposition();
    expect(Object.keys(port).sort()).toEqual([
      'handleFinalLookup',
      'handleProjection',
    ]);
    const f = fixture();
    expect(
      await port.handleProjection({
        authorization,
        request: f.projectionRequest,
      }),
    ).toMatchObject({ ok: false, error: { code: 'NOT_CONNECTED' } });
    expect(
      await port.handleFinalLookup({ authorization, request: f.finalRequest }),
    ).toMatchObject({ ok: false, error: { code: 'NOT_CONNECTED' } });
    expect(f.verifier.verify).not.toHaveBeenCalled();
    expect(f.executor.query).not.toHaveBeenCalled();
  });
  it.each(offices)(
    'reuses the actual authenticated projection handler for %s with exact subject and entitlement query',
    async (office) => {
      const f = fixture(office),
        result = await createHttpsAuthenticatedReadComposition(
          f.config,
        ).handleProjection({ authorization, request: f.projectionRequest });
      expect(result).toMatchObject({
        ok: true,
        authority: {
          identity: { officeId: office, authSubjectId: subject },
          seed: { seedRef: 'TEST_SEED' },
          readback: { worldVersion: '2' },
        },
        result: {
          ok: true,
          data: {
            watermark: { worldVersion: '2' },
            payload: classifiedActivityWireFixture('TEST_COUNTRY', office),
          },
        },
      });
      expect(f.verifier.verify).toHaveBeenCalledTimes(2);
      expect(f.bindingReader.resolve).toHaveBeenCalledTimes(2);
      expect(f.executor.query).toHaveBeenCalledOnce();
      expect(f.executor.query.mock.calls[0]?.[0]).toMatchObject({
        text: WORLD_V2_ENTITLED_PROJECTION_QUERY,
        verifiedAuthSubject: subject,
        values: [
          subject,
          'TEST_WORLD',
          'OFFICE_PRIVATE',
          classifiedOfficeScope('TEST_COUNTRY', office),
          '0',
          '0',
        ],
      });
      expect(f.bindingReader.resolve.mock.calls[0]?.[0]).toMatchObject({
        verifiedSubject: subject,
        worldId: 'TEST_WORLD',
        projectionSelector: {
          scopeKey: classifiedOfficeScope('TEST_COUNTRY', office),
          classification: 'OFFICE_PRIVATE',
        },
        finalSelector: null,
      });
    },
  );
  it('does not send caller-supplied identity or unverified claims to the binding/executor ports', async () => {
    const f = fixture();
    f.verifier.verify.mockRejectedValueOnce(
      new Error('TEST_ONLY_BAD_SIGNATURE'),
    );
    expect(
      await createHttpsAuthenticatedReadComposition(f.config).handleProjection({
        authorization,
        request: f.projectionRequest,
      }),
    ).toMatchObject({ ok: false, error: { code: 'AUTHORIZATION_DENIED' } });
    expect(f.bindingReader.resolve).not.toHaveBeenCalled();
    expect(f.executor.query).not.toHaveBeenCalled();
  });
  it('missing JWT config or admitted seed pins remains disconnected', async () => {
    const f = fixture();
    for (const config of [
      { ...f.config, currentJwtPolicy: () => null },
      {
        ...f.config,
        admittedWorldPins: { ...f.config.admittedWorldPins, admissionRef: '' },
      },
      {
        ...f.config,
        endpointPins: {
          ...f.config.endpointPins,
          origin: 'http://localhost:4100',
        },
      },
    ]) {
      expect(
        await createHttpsAuthenticatedReadComposition(config).handleProjection({
          authorization,
          request: f.projectionRequest,
        }),
      ).toMatchObject({ ok: false, error: { code: 'NOT_CONNECTED' } });
    }
    expect(f.executor.query).not.toHaveBeenCalled();
  });
  it.each(['absent', 'seed', 'subject', 'scope', 'inactive', 'unknownOffice'])(
    'fails closed on %s server binding before reading',
    async (kind) => {
      const f = fixture(),
        b = structuredClone(f.binding()!);
      if (kind === 'absent') f.setBinding(null);
      if (kind === 'seed')
        f.setBinding({
          ...b,
          seed: { ...b.seed, contentHash: `sha256:${'b'.repeat(64)}` },
        });
      if (kind === 'subject')
        f.setBinding({
          ...b,
          identity: {
            ...b.identity,
            authSubjectId: parseSupabaseAuthSubject(
              '33333333-3333-4333-8333-333333333333',
            ),
          },
        });
      if (kind === 'scope')
        f.setBinding({
          ...b,
          identity: { ...b.identity, scopeKey: 'OTHER_SCOPE' },
        });
      if (kind === 'inactive')
        f.setBinding({
          ...b,
          seatState: 'REVOKED',
        } as unknown as ServerVerifiedReadBinding);
      if (kind === 'unknownOffice')
        f.setBinding({ ...b, identity: { ...b.identity, officeId: 'ADMIN' } });
      expect(
        await createHttpsAuthenticatedReadComposition(
          f.config,
        ).handleProjection({ authorization, request: f.projectionRequest }),
      ).toMatchObject({ ok: false, error: { code: 'NOT_CONNECTED' } });
      expect(f.executor.query).not.toHaveBeenCalled();
    },
  );
  it.each(['http://test-only-auth.example.invalid', 'not-an-issuer'])(
    'unapproved issuer configuration %s remains disconnected',
    async (expectedIssuer) => {
      const f = fixture();
      const config = {
        ...f.config,
        currentJwtPolicy: () => ({
          expectedIssuer,
          expectedAudience: 'TEST_ONLY',
          nowEpochSeconds: 1000,
        }),
      };
      expect(
        await createHttpsAuthenticatedReadComposition(config).handleProjection({
          authorization,
          request: f.projectionRequest,
        }),
      ).toMatchObject({ ok: false, error: { code: 'NOT_CONNECTED' } });
      expect(f.verifier.verify).not.toHaveBeenCalled();
      expect(f.bindingReader.resolve).not.toHaveBeenCalled();
      expect(f.executor.query).not.toHaveBeenCalled();
    },
  );
  it('rechecks current seat/revision/admission after the actual handler and retires the old response', async () => {
    const f = fixture(),
      b = f.binding()!;
    f.bindingReader.resolve.mockResolvedValueOnce(b).mockResolvedValueOnce({
      ...b,
      identity: { ...b.identity, authorizationRevision: 'CHANGED_REVISION' },
    });
    const result = await createHttpsAuthenticatedReadComposition(
      f.config,
    ).handleProjection({ authorization, request: f.projectionRequest });
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'AUTHORIZATION_DENIED' },
    });
    expect(result).not.toHaveProperty('authority');
    expect(result).not.toHaveProperty('result');
  });
  it('rejects a projection behind the real readback head and does not relabel it as current', async () => {
    const f = fixture(),
      b = f.binding()!;
    f.setBinding({
      ...b,
      readback: { ...b.readback, worldVersion: '3', eventSequence: '3' },
    });
    expect(
      await createHttpsAuthenticatedReadComposition(f.config).handleProjection({
        authorization,
        request: f.projectionRequest,
      }),
    ).toMatchObject({ ok: false, error: { code: 'STALE_PROJECTION' } });
  });
  it('uses only durable FINAL lookup and passes original selectors to the server binding port without any offer', async () => {
    const f = fixture(),
      result = await createHttpsAuthenticatedReadComposition(
        f.config,
      ).handleFinalLookup({ authorization, request: f.finalRequest });
    expect(result).toMatchObject({
      ok: true,
      result: {
        ok: true,
        receipt: {
          source: 'DURABLE_FINAL_COMMAND_RECEIPT',
          outcome: 'COMMITTED',
          commandFingerprint: fingerprint,
          worldVersionAfter: '2',
        },
      },
    });
    expect(f.executor.query).toHaveBeenCalledOnce();
    expect(f.executor.query.mock.calls[0]?.[0]).toMatchObject({
      text: WORLD_V2_AUTHENTICATED_FINAL_RECEIPT_QUERY,
      verifiedAuthSubject: subject,
      values: ['TEST_WORLD', 'TEST_COMMAND', 'TEST_KEY', subject],
    });
    expect(f.bindingReader.resolve.mock.calls[0]?.[0]).toMatchObject({
      verifiedSubject: subject,
      projectionSelector: null,
      finalSelector: { commandId: 'TEST_COMMAND', idempotencyKey: 'TEST_KEY' },
    });
    expect(JSON.stringify(f.finalRequest)).not.toMatch(
      /offer|approval|expires|ENQUEUE/u,
    );
  });
  it('a missing durable receipt stays NOT_FOUND; no ACK is promoted to FINAL', async () => {
    const f = fixture();
    f.executor.query.mockResolvedValueOnce({ rows: [] });
    expect(
      await createHttpsAuthenticatedReadComposition(f.config).handleFinalLookup(
        { authorization, request: f.finalRequest },
      ),
    ).toMatchObject({
      ok: true,
      result: { ok: false, error: { code: 'NOT_FOUND' } },
    });
    expect(f.executor.query).toHaveBeenCalledOnce();
  });
  it.each(['ENQUEUE', 'REGISTER', 'SIGN', 'BIND', 'READ_CLOCK'])(
    'rejects %s without invoking verifier, authority or SQL',
    async (operation) => {
      const f = fixture();
      expect(
        await createHttpsAuthenticatedReadComposition(
          f.config,
        ).handleFinalLookup({
          authorization,
          request: { ...f.finalRequest, operation },
        }),
      ).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } });
      expect(f.verifier.verify).not.toHaveBeenCalled();
      expect(f.bindingReader.resolve).not.toHaveBeenCalled();
      expect(f.executor.query).not.toHaveBeenCalled();
    },
  );
  it('bounds an unresponsive binding provider and ignores its late result', async () => {
    vi.useFakeTimers();
    const f = fixture();
    let release: ((v: ServerVerifiedReadBinding) => void) | undefined;
    f.bindingReader.resolve.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const pending = createHttpsAuthenticatedReadComposition(
      f.config,
    ).handleProjection({ authorization, request: f.projectionRequest });
    await vi.advanceTimersByTimeAsync(10000);
    expect(await pending).toMatchObject({
      ok: false,
      error: { code: 'UPSTREAM_UNAVAILABLE' },
    });
    release?.(f.binding()!);
    await Promise.resolve();
    expect(f.executor.query).not.toHaveBeenCalled();
  });
  it('external cancellation immediately retires a non-resolving binding provider without querying', async () => {
    const f = fixture(),
      controller = new AbortController();
    f.bindingReader.resolve.mockImplementationOnce(
      () => new Promise(() => undefined),
    );
    const pending = createHttpsAuthenticatedReadComposition(
      f.config,
    ).handleProjection({
      authorization,
      request: f.projectionRequest,
      signal: controller.signal,
    });
    await vi.waitFor(() =>
      expect(f.bindingReader.resolve).toHaveBeenCalledOnce(),
    );
    controller.abort();
    expect(await pending).toMatchObject({
      ok: false,
      error: { code: 'CANCELLED' },
    });
    expect(f.executor.query).not.toHaveBeenCalled();
  });
  it.each(offices)(
    'round-trips %s through real handlers and browser parsers with only an offline fake transport',
    async (office) => {
      const f = fixture(office),
        authority = f.binding()!;
      const composition = createHttpsAuthenticatedReadComposition(f.config);
      const fetcher: typeof fetch = vi.fn(async (url, options) => {
        const path = new URL(String(url)).pathname;
        const request = JSON.parse(String(options?.body));
        const authorization = (options?.headers as Record<string, string>)
          .authorization;
        const result =
          path === f.config.endpointPins.projectionPath
            ? await composition.handleProjection({ request, authorization })
            : await composition.handleFinalLookup({ request, authorization });
        return Response.json(result);
      });
      const client = createProductionReadClient(
        {
          endpoints: f.config.endpointPins,
          world: f.config.admittedWorldPins,
          identity: authority.identity,
          seatRef: authority.seatRef,
          currentIdentity: () => authority.identity,
          getAccessToken: async () => 'TEST_ONLY_OPAQUE_TOKEN',
          session: {
            sessionRef: 'TEST_SESSION',
            isCurrent: () => true,
            onInvalidate: () => () => undefined,
          },
        },
        { fetcher },
      );
      expect(await client.readProjection(requestId)).toMatchObject({
        status: 'PROJECTION',
        worldVersion: '2',
        payload: classifiedActivityWireFixture('TEST_COUNTRY', office),
      });
      // A fabricated fixture receipt tests the query protocol, not this Office's
      // ability to author a narrow transfer or any other economic command.
      expect(
        await client.lookupFinal(requestId, {
          commandId: 'TEST_COMMAND',
          idempotencyKey: 'TEST_KEY',
          commandFingerprint: fingerprint,
        }),
      ).toMatchObject({
        status: 'FINAL_RECEIPT',
        receipt: { outcome: 'COMMITTED' },
      });
      expect(f.executor.query).toHaveBeenCalledTimes(2);
      client.disconnect();
    },
  );
});
