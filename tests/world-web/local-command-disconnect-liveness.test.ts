import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createAuthorizedWorldBrowserClient,
  LOCAL_WORLD_COMMAND_PATH,
  LOCAL_WORLD_READ_PATH,
  type AuthorizedBrowserIdentity,
  type NarrowTransferDraft,
} from '../../apps/world-web/src/authorized-client/client.js';
import {
  LOCAL_PENDING_MARKER_KEY,
  readPendingMarker,
  type PendingMarkerStorage,
} from '../../apps/world-web/src/authorized-client/pending-marker.js';
import { createLocalAuthorizedReadController } from '../../apps/world-web/src/prototype/local-authorized-read.js';

const id = '123e4567-e89b-42d3-a456-426614174000';
const north: AuthorizedBrowserIdentity = {
  worldId: 'WORLD_TEST',
  countryId: 'COUNTRY_NORTH',
  officeId: 'FINANCE',
  scopeKey: 'SCOPE_NORTH',
  authSubjectId: 'subject-north',
  authorizationRevision: 'revision-1',
  modelVersion: 'model-1',
  projectionVersion: 'projection-1',
  classification: 'OFFICE_PRIVATE',
};
const south: AuthorizedBrowserIdentity = {
  ...north,
  countryId: 'COUNTRY_SOUTH',
  officeId: 'TRADE',
  scopeKey: 'SCOPE_SOUTH',
  authSubjectId: 'subject-south',
  authorizationRevision: 'revision-2',
};
const draft: NarrowTransferDraft = {
  commandId: 'COMMAND_43',
  idempotencyKey: 'KEY_43',
  expectedWorldVersion: '42',
  proposalRef: 'PROPOSAL_43',
  buyerCountryId: 'COUNTRY_SOUTH',
  buyerFinanceApprovalRef: 'APPROVAL_43',
};
const binding = {
  commandId: draft.commandId,
  idempotencyKey: draft.idempotencyKey,
  commandFingerprint: `sha256:${'a'.repeat(64)}`,
};

class MemoryStorage implements PendingMarkerStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function readResponse(identity: AuthorizedBrowserIdentity, requestId: string) {
  return Response.json({
    schemaVersion: 'world-read-api-v1',
    requestId,
    ok: true,
    data: {
      schemaVersion: 'world-projection-read-v1',
      worldId: identity.worldId,
      classification: identity.classification,
      scopeKey: identity.scopeKey,
      watermark: {
        worldVersion: '42',
        eventSequence: '7',
        generatedAt: '2026-09-24T00:00:00.000Z',
      },
      payload: {
        schemaVersion: 'g02-derived-read-v1',
        ...identity,
        worldVersion: '42',
        snapshotRef: 'projection:42:7',
        metrics: [
          {
            id: 'GRAIN',
            label: 'Available grain',
            canonicalValue: '128000',
            displayValue: '128k',
            unit: 'tonnes',
            changeLabel: null,
            accessibleSummary: 'Available grain is 128,000 tonnes.',
          },
        ],
        trails: [],
      },
      receipts: [],
      events: [],
    },
  });
}

afterEach(() => vi.restoreAllMocks());

function finalResponse() {
  return Response.json({
    schemaVersion: 'world-command-api-v2',
    requestId: id,
    ok: true,
    receipt: {
      source: 'DURABLE_FINAL_COMMAND_RECEIPT',
      worldId: north.worldId,
      ...binding,
      outcome: 'COMMITTED',
      reasonCode: null,
      worldVersionAfter: '43',
      eventIds: ['EVENT_43'],
      recordedAtReal: '2026-09-24T00:00:00.000Z',
    },
  });
}

function scenario(
  getAccessToken: () => Promise<string | null> = async () => 'user-jwt',
  send: () => Promise<Response> = async () => finalResponse(),
) {
  const storage = new MemoryStorage();
  const commandPosts = vi.fn(send);
  const clients: ReturnType<typeof createAuthorizedWorldBrowserClient>[] = [];
  const results: ReturnType<
    ReturnType<
      typeof createAuthorizedWorldBrowserClient
    >['submitNarrowTransfer']
  >[] = [];
  const factory = (
    options: Parameters<typeof createAuthorizedWorldBrowserClient>[0],
  ) => {
    const client = createAuthorizedWorldBrowserClient({
      ...options,
      pendingStorage: storage,
      bridge: {
        origin: options.bridge!.origin,
        fetcher: (async (url, init) => {
          if (String(url).endsWith(LOCAL_WORLD_READ_PATH)) {
            const body = JSON.parse(String(init?.body));
            return readResponse(
              body.payload.scopeKey === north.scopeKey ? north : south,
              body.requestId,
            );
          }
          return commandPosts();
        }) as typeof fetch,
      },
    });
    clients.push(client);
    return {
      ...client,
      submitNarrowTransfer: (
        ...args: Parameters<typeof client.submitNarrowTransfer>
      ) => {
        const result = client.submitNarrowTransfer(...args);
        results.push(result);
        return result;
      },
    };
  };
  const make = (identity = north, token = getAccessToken) =>
    createLocalAuthorizedReadController(
      {
        currentIdentity: identity,
        bridgeOrigin: 'http://127.0.0.1:4102',
        getAccessToken: token,
      },
      factory,
      () => id,
    );
  return { storage, commandPosts, clients, results, make };
}

describe('retired Office client cannot dispatch a Command', () => {
  it('fails closed if the host dispatch guard throws, without blocking reads', async () => {
    const storage = new MemoryStorage();
    const commandPosts = vi.fn();
    const client = createAuthorizedWorldBrowserClient({
      currentIdentity: () => north,
      getAccessToken: async () => 'user-jwt',
      canDispatchCommand: () => {
        throw new Error('Host retired');
      },
      pendingStorage: storage,
      bridge: {
        origin: 'http://127.0.0.1:4102',
        fetcher: (async (url) => {
          if (String(url).endsWith(LOCAL_WORLD_READ_PATH))
            return readResponse(north, id);
          commandPosts();
          return finalResponse();
        }) as typeof fetch,
      },
    });
    expect((await client.readProjection(id)).status).toBe('PROJECTION');
    expect(await client.submitNarrowTransfer(id, draft)).toEqual({
      status: 'STALE',
    });
    expect(commandPosts).not.toHaveBeenCalled();
    expect(readPendingMarker(storage).state).toBe('EMPTY');
  });

  it('blocks an old POST after a deferred token resolves while the new seat can read', async () => {
    const storage = new MemoryStorage();
    const token = deferred<string | null>();
    const tokenEntered = deferred<void>();
    let northTokenCalls = 0;
    const commandPosts = vi.fn();
    const fetcher = vi.fn(
      async (url: URL | RequestInfo, init?: RequestInit) => {
        if (String(url).endsWith(LOCAL_WORLD_READ_PATH)) {
          const body = JSON.parse(String(init?.body)) as {
            requestId: string;
            payload: { scopeKey: string };
          };
          return readResponse(
            body.payload.scopeKey === north.scopeKey ? north : south,
            body.requestId,
          );
        }
        if (String(url).endsWith(LOCAL_WORLD_COMMAND_PATH)) commandPosts();
        return finalResponse();
      },
    ) as unknown as typeof fetch;
    const factory = (
      options: Parameters<typeof createAuthorizedWorldBrowserClient>[0],
    ) =>
      createAuthorizedWorldBrowserClient({
        ...options,
        bridge: { origin: options.bridge!.origin, fetcher },
        pendingStorage: storage,
      });
    const old = createLocalAuthorizedReadController(
      {
        currentIdentity: north,
        bridgeOrigin: 'http://127.0.0.1:4102',
        getAccessToken: async () => {
          northTokenCalls += 1;
          if (northTokenCalls === 1) return 'user-jwt';
          tokenEntered.resolve();
          return token.promise;
        },
      },
      factory,
      () => id,
    );
    await old.readProjection();
    expect(old.getSnapshot().phase).toBe('READ_RETURNED');
    const sending = old.submitNarrowTransfer(draft, binding);
    await tokenEntered.promise;
    old.disconnect();
    const next = createLocalAuthorizedReadController(
      {
        currentIdentity: south,
        bridgeOrigin: 'http://127.0.0.1:4103',
        getAccessToken: async () => 'user-jwt',
      },
      factory,
      () => id,
    );
    await next.readProjection();
    token.resolve('user-jwt');
    await sending;
    expect(commandPosts).not.toHaveBeenCalled();
    expect(readPendingMarker(storage).state).toBe('EMPTY');
    expect(old.getSnapshot()).toMatchObject({ phase: 'IDLE', read: null });
    await next.readProjection();
    expect(next.getSnapshot()).toMatchObject({
      phase: 'READ_RETURNED',
      identity: { countryId: south.countryId, officeId: south.officeId },
    });
    old.disconnect();
    expect(next.getSnapshot().phase).toBe('READ_RETURNED');
    await next.submitNarrowTransfer(draft, binding);
    expect(commandPosts).toHaveBeenCalledOnce();
    expect(next.getSnapshot().phase).toBe('FINAL_RECEIPT');
  });

  for (const waitAt of ['token', 'marker'] as const) {
    for (const retire of [
      'disconnect/reconnect',
      'seat ABA',
      'invalidate',
    ] as const) {
      it(`blocks retired client after ${waitAt} wait and ${retire}`, async () => {
        const release = deferred<void>();
        const entered = deferred<void>();
        let tokenCalls = 0;
        const s = scenario(async () => {
          tokenCalls += 1;
          if (waitAt === 'token' && tokenCalls === 2) {
            entered.resolve();
            await release.promise;
          }
          return 'user-jwt';
        });
        const controller = s.make();
        await controller.readProjection();
        if (waitAt === 'marker') {
          vi.spyOn(globalThis.crypto.subtle, 'digest').mockImplementationOnce(
            async () => {
              entered.resolve();
              await release.promise;
              return new ArrayBuffer(32);
            },
          );
        }
        const sending = controller.submitNarrowTransfer(draft, binding);
        await entered.promise;
        if (retire === 'disconnect/reconnect') controller.disconnect();
        if (retire === 'seat ABA') {
          controller.setIdentity(south);
          controller.setIdentity(north);
        }
        if (retire === 'invalidate') controller.invalidate('Session expired.');
        // A replacement read with identical identity cannot revive the old client.
        await controller.readProjection();
        const next = s.make(south, async () => 'user-jwt');
        await next.readProjection();
        release.resolve();
        await sending;
        expect(await s.results[0]).toEqual({ status: 'STALE' });
        expect(s.commandPosts).not.toHaveBeenCalled();
        expect(readPendingMarker(s.storage).state).toBe('EMPTY');
        expect(controller.getSnapshot().phase).toBe('READ_RETURNED');
        // Its new client was constructed while the reservation existed; refresh
        // after the old preflight settles, as required by the pending cache guard.
        await next.readProjection();
        controller.disconnect();
        expect(next.getSnapshot().phase).toBe('READ_RETURNED');
        await next.submitNarrowTransfer(draft, binding);
        expect(s.commandPosts).toHaveBeenCalledOnce();
        expect(next.getSnapshot().phase).toBe('FINAL_RECEIPT');
      });
    }
  }

  it.each(['receipt', 'network failure'] as const)(
    'does not cancel an already dispatched POST: %s',
    async (outcome) => {
      const response = deferred<Response>();
      const entered = deferred<void>();
      const s = scenario(undefined, () => {
        entered.resolve();
        return response.promise;
      });
      const old = s.make();
      await old.readProjection();
      const sending = old.submitNarrowTransfer(draft, binding);
      await entered.promise;
      old.disconnect();
      const next = s.make(south);
      await next.readProjection();
      if (outcome === 'receipt') response.resolve(finalResponse());
      else response.resolve(new Response(null, { status: 503 }));
      await sending;
      expect(s.commandPosts).toHaveBeenCalledOnce();
      expect((await s.results[0])?.status).toBe(
        outcome === 'receipt' ? 'FINAL_RECEIPT' : 'UNKNOWN',
      );
      expect(readPendingMarker(s.storage).state).toBe(
        outcome === 'receipt' ? 'EMPTY' : 'PENDING',
      );
      expect(old.getSnapshot().phase).toBe('IDLE');
      old.disconnect();
      expect(next.getSnapshot().phase).toBe('READ_RETURNED');
      if (outcome === 'network failure') {
        // Storage disappearance is not proof of cancellation of a dispatched POST.
        s.storage.removeItem(LOCAL_PENDING_MARKER_KEY);
        await next.submitNarrowTransfer(draft, binding);
        expect(next.getSnapshot().phase).toBe('UNKNOWN');
        expect(s.commandPosts).toHaveBeenCalledOnce();
      }
    },
  );

  it('expires cancellation proof when a later reservation may have been dispatched', async () => {
    const token = deferred<string | null>();
    const entered = deferred<void>();
    let tokenCalls = 0;
    const s = scenario(
      async () => {
        if (++tokenCalls === 2) {
          entered.resolve();
          return token.promise;
        }
        return 'user-jwt';
      },
      async () => new Response(null, { status: 503 }),
    );
    const old = s.make();
    await old.readProjection();
    const sending = old.submitNarrowTransfer(draft, binding);
    await entered.promise;
    const observer = s.make(south);
    await observer.readProjection();
    old.disconnect();
    token.resolve('user-jwt');
    await sending;
    expect(s.commandPosts).not.toHaveBeenCalled();
    // Same marker fields, but a later attempt actually dispatched. An observer
    // must not use the earlier cancellation proof to ignore this ambiguity.
    const later = s.make();
    await later.readProjection();
    await later.submitNarrowTransfer(draft, binding);
    expect(later.getSnapshot().phase).toBe('UNKNOWN');
    s.storage.removeItem(LOCAL_PENDING_MARKER_KEY);
    await observer.readProjection();
    await observer.submitNarrowTransfer(draft, binding);
    expect(observer.getSnapshot().phase).toBe('UNKNOWN');
    expect(s.commandPosts).toHaveBeenCalledOnce();
  });

  it('keeps an unresolved POST marker when retirement blocks its retry', async () => {
    const s = scenario(
      undefined,
      async () => new Response(null, { status: 503 }),
    );
    const old = s.make();
    await old.readProjection();
    const originalClient = s.clients[0]!;
    await old.submitNarrowTransfer(draft, binding);
    expect(old.getSnapshot().phase).toBe('UNKNOWN');
    old.disconnect();
    expect(await originalClient.submitNarrowTransfer(id, draft)).toEqual({
      status: 'UNKNOWN',
    });
    expect(s.commandPosts).toHaveBeenCalledOnce();
    expect(readPendingMarker(s.storage).state).toBe('PENDING');
  });
});
