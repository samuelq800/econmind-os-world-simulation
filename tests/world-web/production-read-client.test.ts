import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthorizedBrowserIdentity } from '../../apps/world-web/src/authorized-client/client.js';
import { createProductionReadClient } from '../../apps/world-web/src/production-read/client.js';
import {
  READ_OFFICES,
  type ProductionReadConfig,
} from '../../apps/world-web/src/production-read/contract.js';

// Every endpoint, token, identity, seed and result below is an OFFLINE TEST_ONLY
// fixture. No real admission, player, Office action, balance or HTTP host exists.
const requestId = '11111111-1111-4111-8111-111111111111';
const fingerprint = `sha256:${'a'.repeat(64)}`;
const lookup = {
  commandId: 'TEST_COMMAND',
  idempotencyKey: 'TEST_KEY',
  commandFingerprint: fingerprint,
};
function fixture(office = 'TRADE') {
  const identity: AuthorizedBrowserIdentity = {
    worldId: 'TEST_WORLD',
    countryId: 'TEST_COUNTRY',
    officeId: office,
    scopeKey: `TEST_SCOPE_${office}`,
    authSubjectId: '22222222-2222-4222-8222-222222222222',
    authorizationRevision: 'TEST_REVISION',
    modelVersion: 'TEST_MODEL',
    projectionVersion: 'TEST_PROJECTION',
    classification: 'OFFICE_PRIVATE',
  };
  let current: AuthorizedBrowserIdentity | null = identity,
    alive = true;
  const listeners = new Set<() => void>();
  const config: ProductionReadConfig = {
    identity,
    seatRef: 'TEST_SEAT',
    endpoints: {
      origin: 'https://test-only-runtime.example.invalid',
      projectionPath: '/v1/world-read',
      finalLookupPath: '/v1/final-receipt',
      deploymentRef: 'TEST_DEPLOYMENT',
    },
    world: {
      worldId: identity.worldId,
      seedRef: 'TEST_SEED',
      contentHash: fingerprint,
      admissionRef: 'TEST_ADMISSION',
      minimumWorldVersion: '1',
    },
    currentIdentity: () => current,
    getAccessToken: async () => 'TEST_ONLY_OPAQUE_TOKEN',
    session: {
      sessionRef: 'TEST_SESSION',
      isCurrent: () => alive,
      onInvalidate: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
  };
  const authority = (worldVersion = '2') => ({
    source: 'SERVER_VERIFIED_READ_BINDING',
    capability: 'READ_AUTHORIZED_PROJECTION_AND_FINAL',
    identity,
    seatRef: config.seatRef,
    seatState: 'ACTIVE',
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
      worldVersion,
      eventSequence: worldVersion,
      readbackRef: 'TEST_READBACK',
    },
  });
  const projection = (worldVersion = '2') => ({
    schemaVersion: 'world-authorized-read-binding-v1',
    requestId,
    ok: true,
    authority: authority(worldVersion),
    result: {
      schemaVersion: 'world-read-api-v1',
      requestId,
      ok: true,
      data: {
        schemaVersion: 'world-projection-read-v1',
        worldId: identity.worldId,
        classification: identity.classification,
        scopeKey: identity.scopeKey,
        watermark: {
          worldVersion,
          eventSequence: worldVersion,
          generatedAt: '2026-10-06T00:00:00.000Z',
        },
        payload: {
          canonicalValue: '9007199254740993.25',
          nature: 'TEST_ONLY_DERIVED_PROJECTION',
        },
        receipts: [],
        events: [],
      },
    },
  });
  const final = () => ({
    schemaVersion: 'world-authorized-read-binding-v1',
    requestId,
    ok: true,
    authority: authority('3'),
    result: {
      schemaVersion: 'world-final-receipt-read-v1',
      requestId,
      ok: true,
      receipt: {
        source: 'DURABLE_FINAL_COMMAND_RECEIPT',
        worldId: 'TEST_WORLD',
        ...lookup,
        outcome: 'COMMITTED',
        reasonCode: null,
        worldVersionAfter: '3',
        eventIds: ['TEST_EVENT'],
        recordedAtReal: '2026-10-06T00:00:00.000Z',
      },
    },
  });
  return {
    config,
    projection,
    final,
    invalidate: () => {
      alive = false;
      for (const listener of [...listeners]) listener();
    },
    replaceIdentity: (i: AuthorizedBrowserIdentity | null) => {
      current = i;
    },
    listeners,
  };
}
const fetcherFor = (response: unknown) =>
  vi.fn(async () => Response.json(response));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('unmounted HTTPS production read preparation / OFFLINE TEST_ONLY', () => {
  it.each(['identity', 'liveness', 'predicate throws'])(
    'B-G-READ-01 permanently retires observed token loss: %s',
    async (loss) => {
      const f = fixture();
      let lost = false,
        release: ((token: string) => void) | undefined;
      const token = vi.fn(f.config.getAccessToken);
      token.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      );
      const fetcher = fetcherFor(f.projection());
      const client = createProductionReadClient(
        {
          ...f.config,
          getAccessToken: token,
          session: {
            ...f.config.session,
            isCurrent: () => {
              if (lost && loss === 'predicate throws')
                throw new Error('TEST_ONLY_LIFETIME');
              return !(lost && loss === 'liveness');
            },
          },
        },
        { fetcher },
      );
      const pending = client.readProjection(requestId);
      lost = true;
      if (loss === 'identity') f.replaceIdentity(null);
      release?.('TEST_ONLY_OPAQUE_TOKEN');
      expect(await pending).toEqual({ status: 'STALE' });
      lost = false;
      f.replaceIdentity(f.config.identity);
      // No state() or invalidation callback may supply the retirement latch.
      expect(await client.readProjection(requestId)).toEqual({
        status: 'NOT_CONNECTED',
      });
      expect(fetcher).not.toHaveBeenCalled();
      expect(f.listeners.size).toBe(0);
    },
  );
  it.each(['fetch response', 'fetch rejection', 'token rejection'])(
    'B-G-READ-01 permanently retires observed async loss: %s',
    async (fence) => {
      const f = fixture();
      let resolve: ((response: Response) => void) | undefined,
        reject: ((reason: Error) => void) | undefined;
      const deferred = new Promise<Response>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      const fetcher = fetcherFor(f.projection());
      const token = vi.fn(f.config.getAccessToken);
      if (fence === 'token rejection')
        token.mockImplementationOnce(() =>
          deferred.then(() => 'TEST_ONLY_OPAQUE_TOKEN'),
        );
      else fetcher.mockImplementationOnce(() => deferred);
      const client = createProductionReadClient(
        { ...f.config, getAccessToken: token },
        { fetcher },
      );
      const pending = client.readProjection(requestId);
      if (fence !== 'token rejection')
        await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
      f.replaceIdentity(null);
      if (fence === 'fetch response') resolve?.(Response.json(f.projection()));
      else reject?.(new Error('TEST_ONLY_FAILURE'));
      expect(await pending).toEqual({ status: 'STALE' });
      f.replaceIdentity(f.config.identity);
      expect(await client.lookupFinal(requestId, lookup)).toEqual({
        status: 'NOT_CONNECTED',
      });
      expect(fetcher).toHaveBeenCalledTimes(
        fence === 'token rejection' ? 0 : 1,
      );
      expect(f.listeners.size).toBe(0);
    },
  );
  it.each(['throws', 'hangs'])(
    'B-G-READ-01 retires before body cancellation that %s',
    async (cleanup) => {
      const f = fixture();
      let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
      const cancel = vi.fn(() => {
        if (cleanup === 'throws') throw new Error('TEST_ONLY_CANCEL');
        return new Promise<void>(() => {});
      });
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          controller = c;
        },
        cancel,
      });
      const fetcher = vi.fn(
        async () =>
          new Response(body, {
            headers: { 'content-type': 'application/json' },
          }),
      );
      const client = createProductionReadClient(f.config, { fetcher });
      const pending = client.readProjection(requestId);
      await vi.waitFor(() => expect(body.locked).toBe(true));
      f.replaceIdentity(null);
      controller?.enqueue(
        new TextEncoder().encode(JSON.stringify(f.projection())),
      );
      expect(await pending).toEqual({ status: 'STALE' });
      f.replaceIdentity(f.config.identity);
      expect(await client.readProjection(requestId)).toEqual({
        status: 'NOT_CONNECTED',
      });
      expect(cancel).toHaveBeenCalledOnce();
      expect(fetcher).toHaveBeenCalledOnce();
      expect(f.listeners.size).toBe(0);
    },
  );
  it('B-G-READ-01 observed loss aborts sibling reads without notification', async () => {
    const f = fixture();
    let release: ((response: Response) => void) | undefined;
    const signals: AbortSignal[] = [];
    const fetcher = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) => {
        if (init?.signal) signals.push(init.signal);
        return new Promise<Response>((resolve) => {
          if (signals.length === 1) release = resolve;
        });
      },
    );
    const client = createProductionReadClient(f.config, { fetcher });
    const first = client.readProjection(requestId),
      sibling = client.lookupFinal(requestId, lookup);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    f.replaceIdentity(null);
    release?.(Response.json(f.projection()));
    expect(await Promise.all([first, sibling])).toEqual([
      { status: 'STALE' },
      { status: 'STALE' },
    ]);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    f.replaceIdentity(f.config.identity);
    expect(await client.readProjection(requestId)).toEqual({
      status: 'NOT_CONNECTED',
    });
    expect(f.listeners.size).toBe(0);
  });
  it('B-G-READ-01 continuous lifetime and transient network failure remain retryable', async () => {
    const f = fixture(),
      fetcher = fetcherFor(f.projection()),
      client = createProductionReadClient(f.config, { fetcher });
    expect(await client.readProjection(requestId)).toMatchObject({
      status: 'PROJECTION',
    });
    fetcher.mockRejectedValueOnce(new Error('TEST_ONLY_NETWORK'));
    expect(await client.readProjection(requestId)).toEqual({
      status: 'UNAVAILABLE',
    });
    expect(await client.readProjection(requestId)).toMatchObject({
      status: 'PROJECTION',
    });
    expect(f.listeners.size).toBe(1);
    client.disconnect();
  });
  it('B-G-READ-01 timeout alone does not retire a current lifetime', async () => {
    vi.useFakeTimers();
    const f = fixture(),
      token = vi.fn(f.config.getAccessToken),
      fetcher = fetcherFor(f.projection());
    let release: ((token: string) => void) | undefined;
    token.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const client = createProductionReadClient(
      { ...f.config, getAccessToken: token },
      { fetcher },
    );
    const pending = client.readProjection(requestId);
    await vi.advanceTimersByTimeAsync(10000);
    expect(await pending).toEqual({ status: 'UNAVAILABLE' });
    release?.('TEST_ONLY_OPAQUE_TOKEN');
    await Promise.resolve();
    expect(fetcher).not.toHaveBeenCalled();
    expect(await client.readProjection(requestId)).toMatchObject({
      status: 'PROJECTION',
    });
    expect(f.listeners.size).toBe(1);
    client.disconnect();
  });
  it('has only read/final/disconnect and defaults to NOT_CONNECTED without discovery', async () => {
    const fetcher = fetcherFor({}),
      client = createProductionReadClient(null, { fetcher });
    expect(Object.keys(client).sort()).toEqual([
      'disconnect',
      'lookupFinal',
      'readProjection',
      'state',
    ]);
    expect(client.state()).toBe('NOT_CONNECTED');
    expect(await client.readProjection(requestId)).toEqual({
      status: 'NOT_CONNECTED',
    });
    expect(await client.lookupFinal(requestId, lookup)).toEqual({
      status: 'NOT_CONNECTED',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    'http://test-only-runtime.example.invalid',
    'https://localhost',
    'https://test-only-runtime.example.invalid/other',
    'https://test-only-runtime.example.invalid?token=x',
    'https://user@test-only-runtime.example.invalid',
  ])(
    'rejects an unapproved/canonical HTTPS endpoint %s before token or fetch',
    async (origin) => {
      const f = fixture(),
        token = vi.fn(f.config.getAccessToken),
        fetcher = fetcherFor(f.projection());
      const client = createProductionReadClient(
        {
          ...f.config,
          endpoints: { ...f.config.endpoints, origin },
          getAccessToken: token,
        },
        { fetcher },
      );
      expect(await client.readProjection(requestId)).toEqual({
        status: 'NOT_CONNECTED',
      });
      expect(token).not.toHaveBeenCalled();
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it('rejects local routes and missing admission pins; host claims cannot replace them', async () => {
    const f = fixture(),
      fetcher = fetcherFor(f.projection());
    for (const config of [
      {
        ...f.config,
        endpoints: {
          ...f.config.endpoints,
          projectionPath: '/local/v1/world-read',
        },
      },
      { ...f.config, world: { ...f.config.world, admissionRef: '' } },
    ])
      expect(
        await createProductionReadClient(config, { fetcher }).readProjection(
          requestId,
        ),
      ).toEqual({ status: 'NOT_CONNECTED' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(READ_OFFICES)(
    'reads %s scoped TEST_ONLY projections using exactly fixed POST/read semantics',
    async (office) => {
      const f = fixture(office),
        fetcher = fetcherFor(f.projection()),
        client = createProductionReadClient(f.config, { fetcher });
      const result = await client.readProjection(requestId);
      expect(result).toMatchObject({
        status: 'PROJECTION',
        source: 'DERIVED_SERVER_PROJECTION',
        worldVersion: '2',
        payload: {
          canonicalValue: '9007199254740993.25',
          nature: 'TEST_ONLY_DERIVED_PROJECTION',
        },
      });
      expect(client.state()).toBe('READ_ONLY_BOUND');
      expect(fetcher).toHaveBeenCalledTimes(1);
      const call = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
      expect(String(call[0])).toBe(
        f.config.endpoints.origin + f.config.endpoints.projectionPath,
      );
      expect(call[1]).toMatchObject({
        method: 'POST',
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
        headers: { authorization: 'Bearer TEST_ONLY_OPAQUE_TOKEN' },
      });
      expect(JSON.parse(String(call[1].body))).toEqual({
        schemaVersion: 'world-read-api-v1',
        requestId,
        operation: 'READ_WORLD_PROJECTION',
        payload: {
          worldId: 'TEST_WORLD',
          classification: 'OFFICE_PRIVATE',
          scopeKey: `TEST_SCOPE_${office}`,
        },
      });
      expect(JSON.parse(String(call[1].body))).not.toHaveProperty(
        'authSubjectId',
      );
      client.disconnect();
      expect(f.listeners.size).toBe(0);
    },
  );
  it.each([
    'subject',
    'seat',
    'revision',
    'office',
    'world',
    'seed',
    'readback',
    'watermark',
  ])(
    'rejects server binding mismatch %s without connecting',
    async (mutation) => {
      const f = fixture(),
        value = f.projection();
      if (mutation === 'subject')
        value.authority.identity = {
          ...value.authority.identity,
          authSubjectId: '33333333-3333-4333-8333-333333333333',
        };
      if (mutation === 'seat') value.authority.seatRef = 'OTHER_SEAT';
      if (mutation === 'revision')
        value.authority.identity = {
          ...value.authority.identity,
          authorizationRevision: 'OTHER_REVISION',
        };
      if (mutation === 'office')
        value.authority.identity = {
          ...value.authority.identity,
          officeId: 'FINANCE',
        };
      if (mutation === 'world') value.authority.seed.worldId = 'OTHER_WORLD';
      if (mutation === 'seed')
        value.authority.seed.contentHash = `sha256:${'b'.repeat(64)}`;
      if (mutation === 'readback')
        value.authority.readback.seedRef = 'OTHER_SEED';
      if (mutation === 'watermark')
        value.result.data.watermark.worldVersion = '1';
      const client = createProductionReadClient(f.config, {
        fetcher: fetcherFor(value),
      });
      expect(await client.readProjection(requestId)).toEqual({
        status: 'UNAVAILABLE',
      });
      expect(client.state()).toBe('NOT_CONNECTED');
    },
  );
  it('retires during opaque token retrieval and cannot dispatch after identity ABA', async () => {
    const f = fixture();
    let release: ((v: string) => void) | undefined;
    const token = new Promise<string>((resolve) => {
        release = resolve;
      }),
      fetcher = fetcherFor(f.projection());
    const client = createProductionReadClient(
      { ...f.config, getAccessToken: () => token },
      { fetcher },
    );
    const pending = client.readProjection(requestId);
    f.invalidate();
    expect(await pending).toEqual({ status: 'STALE' });
    f.replaceIdentity({ ...f.config.identity });
    release?.('TEST_ONLY_OPAQUE_TOKEN');
    await Promise.resolve();
    expect(fetcher).not.toHaveBeenCalled();
    expect(client.state()).toBe('NOT_CONNECTED');
  });
  it('retires a late response/body and never reconnects on return to the old identity', async () => {
    const f = fixture();
    let release: ((v: Response) => void) | undefined;
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    const client = createProductionReadClient(f.config, { fetcher });
    const pending = client.readProjection(requestId);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    f.invalidate();
    release?.(Response.json(f.projection()));
    expect(await pending).toEqual({ status: 'STALE' });
    expect(await client.readProjection(requestId)).toEqual({
      status: 'NOT_CONNECTED',
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('aborts a pending body immediately on invalidation and rejects late data', async () => {
    const f = fixture();
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
      },
    });
    const fetcher = vi.fn(
      async () =>
        new Response(body, { headers: { 'content-type': 'application/json' } }),
    );
    const client = createProductionReadClient(f.config, { fetcher }),
      pending = client.readProjection(requestId);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    f.invalidate();
    controller?.enqueue(
      new TextEncoder().encode(JSON.stringify(f.projection())),
    );
    controller?.close();
    expect(await pending).toEqual({ status: 'STALE' });
    expect(client.state()).toBe('NOT_CONNECTED');
  });
  it('bounds full body to one MiB and does not retry', async () => {
    const f = fixture(),
      fetcher = vi.fn(
        async () =>
          new Response('x'.repeat(1024 * 1024 + 1), {
            headers: { 'content-type': 'application/json' },
          }),
      );
    expect(
      await createProductionReadClient(f.config, { fetcher }).readProjection(
        requestId,
      ),
    ).toEqual({ status: 'UNAVAILABLE' });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('bounds a non-resolving token supplier and a late token cannot dispatch', async () => {
    vi.useFakeTimers();
    const f = fixture(),
      fetcher = fetcherFor(f.projection());
    let release: ((v: string) => void) | undefined;
    const client = createProductionReadClient(
      {
        ...f.config,
        getAccessToken: () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      },
      { fetcher },
    );
    const pending = client.readProjection(requestId);
    await vi.advanceTimersByTimeAsync(10000);
    expect(await pending).toEqual({ status: 'UNAVAILABLE' });
    release?.('TEST_ONLY_OPAQUE_TOKEN');
    await Promise.resolve();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('looks up original durable FINAL without any offer or write capability', async () => {
    const f = fixture(),
      fetcher = fetcherFor(f.final()),
      client = createProductionReadClient(f.config, { fetcher });
    expect(await client.lookupFinal(requestId, lookup)).toMatchObject({
      status: 'FINAL_RECEIPT',
      receipt: {
        commandFingerprint: fingerprint,
        outcome: 'COMMITTED',
        worldVersionAfter: '3',
      },
    });
    const call = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(call[0])).toBe(
      f.config.endpoints.origin + f.config.endpoints.finalLookupPath,
    );
    expect(JSON.parse(String(call[1].body))).toEqual({
      schemaVersion: 'world-final-receipt-read-v1',
      requestId,
      operation: 'READ_FINAL_NARROW_TRANSFER_RECEIPT',
      payload: {
        worldId: 'TEST_WORLD',
        commandId: 'TEST_COMMAND',
        idempotencyKey: 'TEST_KEY',
      },
    });
    expect(call[1].body).not.toMatch(
      /offer|expires|approval|ENQUEUE|REGISTER|SIGN|BIND/u,
    );
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('rejects wrong FINAL fingerprint/identity and inconsistent outcomes', async () => {
    const f = fixture();
    for (const patch of [
      { commandFingerprint: `sha256:${'b'.repeat(64)}` },
      { worldId: 'OTHER_WORLD' },
      { commandId: 'OTHER_COMMAND' },
      { idempotencyKey: 'OTHER_KEY' },
      { eventIds: [] },
      { worldVersionAfter: '4' },
    ]) {
      const value = f.final();
      Object.assign(value.result.receipt, patch);
      expect(
        await createProductionReadClient(f.config, {
          fetcher: fetcherFor(value),
        }).lookupFinal(requestId, lookup),
      ).toEqual({ status: 'UNAVAILABLE' });
    }
  });
  it('does not lose the FINAL readback floor across a network failure', async () => {
    const f = fixture();
    let step = 0;
    const fetcher = vi.fn(async () => {
      step++;
      if (step === 2) throw new Error('TEST_ONLY_DISCONNECT');
      return Response.json(
        step === 1 ? f.final() : f.projection(step === 3 ? '2' : '3'),
      );
    });
    const client = createProductionReadClient(f.config, { fetcher });
    expect(await client.lookupFinal(requestId, lookup)).toMatchObject({
      status: 'FINAL_RECEIPT',
    });
    expect(await client.readProjection(requestId)).toEqual({
      status: 'UNAVAILABLE',
    });
    expect(await client.readProjection(requestId)).toEqual({ status: 'STALE' });
    expect(await client.readProjection(requestId)).toMatchObject({
      status: 'PROJECTION',
      worldVersion: '3',
    });
    client.disconnect();
  });
  it('rejects a foreign response URL even when its binding JSON matches', async () => {
    const f = fixture(),
      response = Response.json(f.projection());
    Object.defineProperty(response, 'url', {
      value: 'https://other.example.invalid/v1/world-read',
    });
    const fetcher = vi.fn(async () => response);
    expect(
      await createProductionReadClient(f.config, { fetcher }).readProjection(
        requestId,
      ),
    ).toEqual({ status: 'UNAVAILABLE' });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('rejects a normalized impossible calendar date', async () => {
    const f = fixture(),
      value = f.projection();
    value.result.data.watermark.generatedAt = '2026-02-31T00:00:00.000Z';
    expect(
      await createProductionReadClient(f.config, {
        fetcher: fetcherFor(value),
      }).readProjection(requestId),
    ).toEqual({ status: 'UNAVAILABLE' });
  });
  it('401 and server current-seat denial permanently retire the session', async () => {
    for (const response of [
      new Response(null, { status: 401 }),
      Response.json({
        schemaVersion: 'world-authorized-read-binding-v1',
        requestId,
        ok: false,
        error: { code: 'AUTHORIZATION_DENIED' },
      }),
    ]) {
      const f = fixture(),
        fetcher = vi.fn(async () => response),
        client = createProductionReadClient(f.config, { fetcher });
      expect(await client.readProjection(requestId)).toEqual({
        status: 'DENIED',
      });
      expect(await client.readProjection(requestId)).toEqual({
        status: 'NOT_CONNECTED',
      });
      expect(fetcher).toHaveBeenCalledOnce();
    }
  });
});
