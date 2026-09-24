import { describe, expect, it, vi } from 'vitest';

import {
  LOCAL_WORLD_COMMAND_PATH,
  LOCAL_WORLD_READ_PATH,
  createAuthorizedWorldBrowserClient,
  type AuthorizedBrowserIdentity,
  type NarrowTransferDraft,
} from '../../apps/world-web/src/authorized-client/client';
import {
  LOCAL_PENDING_MARKER_KEY,
  localPendingStorage,
  type PendingMarkerStorage,
} from '../../apps/world-web/src/authorized-client/pending-marker';

const requestId = '550e8400-e29b-41d4-a716-446655440001';
const identity: AuthorizedBrowserIdentity = {
  worldId: 'WORLD_ONE',
  authSubjectId: '550e8400-e29b-41d4-a716-446655440000',
  authorizationRevision: 'AUTH_REVISION_1',
  countryId: 'COUNTRY_A',
  officeId: 'TRADE',
  scopeKey: 'COUNTRY_A',
  modelVersion: 'MODEL_1',
  projectionVersion: 'PROJECTION_1',
  classification: 'COUNTRY',
};
const draft: NarrowTransferDraft = {
  commandId: 'COMMAND_1',
  idempotencyKey: 'IDEMPOTENCY_1',
  expectedWorldVersion: '8',
  proposalRef: 'PROPOSAL_1',
  buyerCountryId: 'COUNTRY_B',
  buyerFinanceApprovalRef: 'APPROVAL_1',
};

function projection(worldVersion = '8') {
  return {
    schemaVersion: 'world-projection-read-v1',
    worldId: identity.worldId,
    classification: identity.classification,
    scopeKey: identity.scopeKey,
    watermark: {
      worldVersion,
      eventSequence: worldVersion,
      generatedAt: '2026-09-23T00:00:00.000Z',
    },
    payload: { cash: '5.00' },
    receipts: [],
    events: [],
  };
}

function receipt() {
  return {
    source: 'DURABLE_FINAL_COMMAND_RECEIPT',
    worldId: identity.worldId,
    commandId: draft.commandId,
    idempotencyKey: draft.idempotencyKey,
    commandFingerprint: `sha256:${'a'.repeat(64)}`,
    outcome: 'COMMITTED',
    reasonCode: null,
    worldVersionAfter: '9',
    eventIds: ['EVENT_1'],
    recordedAtReal: '2026-09-23T00:00:00.000Z',
  };
}

class MemoryPendingStorage implements PendingMarkerStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function browser(
  fetcher: typeof fetch,
  currentIdentity = () => identity,
  pendingStorage: PendingMarkerStorage = new MemoryPendingStorage(),
) {
  return createAuthorizedWorldBrowserClient({
    currentIdentity,
    getAccessToken: async () => 'local-jwt-token',
    bridge: { origin: 'http://127.0.0.1:4179', fetcher },
    pendingStorage,
  });
}

describe('World Web local authorized client preparation', () => {
  it('is unavailable by default and never requests a token', async () => {
    const getAccessToken = vi.fn(async () => 'secret');
    const client = createAuthorizedWorldBrowserClient({
      currentIdentity: () => identity,
      getAccessToken,
    });
    expect(await client.readProjection(requestId)).toEqual({
      status: 'UNAVAILABLE',
      reason: 'BRIDGE_NOT_CONFIGURED',
    });
    expect(await client.submitNarrowTransfer(requestId, draft)).toEqual({
      status: 'UNAVAILABLE',
      reason: 'BRIDGE_NOT_CONFIGURED',
    });
    expect(getAccessToken).not.toHaveBeenCalled();
  });

  it('rejects non-loopback and credentialed origins', () => {
    const create = (origin: string) =>
      createAuthorizedWorldBrowserClient({
        currentIdentity: () => identity,
        getAccessToken: async () => 'token',
        bridge: { origin },
      });
    expect(() => create('https://example.com')).toThrow(
      'LOCAL_BRIDGE_ORIGIN_INVALID',
    );
    expect(() => create('http://user:pass@127.0.0.1:4179')).toThrow(
      'LOCAL_BRIDGE_ORIGIN_INVALID',
    );
    expect(() => create('http://127.0.0.1:4179/path')).toThrow(
      'LOCAL_BRIDGE_ORIGIN_INVALID',
    );
  });

  it('does not enable pending-marker storage for a remote browser page', () => {
    const storage = new MemoryPendingStorage();
    vi.stubGlobal('window', {
      location: { hostname: 'remote.example' },
      sessionStorage: storage,
    });
    try {
      expect(localPendingStorage(storage)).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('uses E read wire shape, scopes response, and accepts only monotonic derived cache', async () => {
    let worldVersion = '8';
    const fetcher = vi.fn(
      async (url: URL | RequestInfo, options?: RequestInit) => {
        expect(String(url)).toBe(
          `http://127.0.0.1:4179${LOCAL_WORLD_READ_PATH}`,
        );
        expect(options).toMatchObject({
          method: 'POST',
          redirect: 'error',
          cache: 'no-store',
          credentials: 'omit',
        });
        expect(new Headers(options?.headers).get('authorization')).toBe(
          'Bearer local-jwt-token',
        );
        expect(JSON.parse(String(options?.body))).toEqual({
          schemaVersion: 'world-read-api-v1',
          requestId,
          operation: 'READ_WORLD_PROJECTION',
          payload: {
            worldId: identity.worldId,
            classification: identity.classification,
            scopeKey: identity.scopeKey,
          },
        });
        return Response.json({
          schemaVersion: 'world-read-api-v1',
          requestId,
          ok: true,
          data: projection(worldVersion),
        });
      },
    ) as unknown as typeof fetch;
    const client = browser(fetcher);
    expect(await client.readProjection(requestId)).toMatchObject({
      status: 'PROJECTION',
      worldVersion: '8',
      payload: { cash: '5.00' },
    });
    expect(JSON.stringify(client.cache.read(identity))).not.toContain(
      'local-jwt-token',
    );
    worldVersion = '7';
    expect(await client.readProjection(requestId)).toEqual({ status: 'STALE' });
    expect(client.cache.read(identity)).toMatchObject({ worldVersion: '8' });
  });

  it('rejects a noncanonical expected WorldVersion before persisting or posting', async () => {
    const storage = new MemoryPendingStorage();
    let commandPosts = 0;
    const fetcher = vi.fn(async (url: URL | RequestInfo) => {
      if (String(url).endsWith(LOCAL_WORLD_READ_PATH)) {
        return Response.json({
          schemaVersion: 'world-read-api-v1',
          requestId,
          ok: true,
          data: projection(),
        });
      }
      commandPosts += 1;
      return Response.json({});
    }) as unknown as typeof fetch;
    const client = browser(fetcher, () => identity, storage);
    await client.readProjection(requestId);
    expect(
      await client.submitNarrowTransfer(requestId, {
        ...draft,
        expectedWorldVersion: '08',
      }),
    ).toEqual({ status: 'UNAVAILABLE', reason: 'IDENTITY_NOT_READY' });
    expect(storage.getItem(LOCAL_PENDING_MARKER_KEY)).toBeNull();
    expect(commandPosts).toBe(0);
  });

  it('drops cross-scope and changed authorization responses, and clears cache on denial', async () => {
    const wrongScope = browser(async () =>
      Response.json({
        schemaVersion: 'world-read-api-v1',
        requestId,
        ok: true,
        data: { ...projection(), scopeKey: 'COUNTRY_B' },
      }),
    );
    expect(await wrongScope.readProjection(requestId)).toEqual({
      status: 'UNAVAILABLE',
      reason: 'INVALID_RESPONSE',
    });
    let active = identity;
    let release!: (response: Response) => void;
    const pendingResponse = new Promise<Response>((done) => {
      release = done;
    });
    const changing = browser(
      async () => pendingResponse,
      () => active,
    );
    const pending = changing.readProjection(requestId);
    await Promise.resolve();
    active = { ...identity, authorizationRevision: 'AUTH_REVISION_2' };
    release(
      Response.json({
        schemaVersion: 'world-read-api-v1',
        requestId,
        ok: true,
        data: projection(),
      }),
    );
    expect(await pending).toEqual({ status: 'STALE' });
    const denied = browser(async () => Response.json({}, { status: 403 }));
    expect(await denied.readProjection(requestId)).toEqual({
      status: 'DENIED',
    });
    expect(denied.cache.read(identity).state).toBe('UNAVAILABLE');
  });

  it('sends only E narrow command fields and handles durable, mock and unknown outcomes', async () => {
    let commandReceipt: object = receipt();
    const fetcher = vi.fn(
      async (url: URL | RequestInfo, options?: RequestInit) => {
        const body = JSON.parse(String(options?.body));
        if (String(url).endsWith(LOCAL_WORLD_READ_PATH)) {
          return Response.json({
            schemaVersion: 'world-read-api-v1',
            requestId,
            ok: true,
            data: projection(),
          });
        }
        expect(String(url)).toBe(
          `http://127.0.0.1:4179${LOCAL_WORLD_COMMAND_PATH}`,
        );
        expect(body).toEqual({
          schemaVersion: 'world-command-api-v1',
          requestId,
          operation: 'SUBMIT_NARROW_TREASURY_GCU_TRANSFER',
          payload: {
            worldId: identity.worldId,
            countryId: identity.countryId,
            officeId: identity.officeId,
            commandId: draft.commandId,
            idempotencyKey: draft.idempotencyKey,
            expectedWorldVersion: draft.expectedWorldVersion,
            proposalRef: draft.proposalRef,
            buyerCountryId: draft.buyerCountryId,
            buyerFinanceApprovalRef: draft.buyerFinanceApprovalRef,
          },
        });
        return Response.json({
          schemaVersion: 'world-command-api-v1',
          requestId,
          ok: true,
          receipt: commandReceipt,
        });
      },
    ) as unknown as typeof fetch;
    const client = browser(fetcher);
    expect((await client.readProjection(requestId)).status).toBe('PROJECTION');
    commandReceipt = { ...receipt(), source: 'FIXTURE' };
    expect(await client.submitNarrowTransfer(requestId, draft)).toEqual({
      status: 'UNKNOWN',
    });
    expect(client.cache.read(identity)).toMatchObject({
      worldVersion: '8',
      reconciliationRequired: true,
    });
    commandReceipt = receipt();
    expect(await client.submitNarrowTransfer(requestId, draft)).toMatchObject({
      status: 'FINAL_RECEIPT',
      receipt: { outcome: 'COMMITTED', worldVersionAfter: '9' },
    });
    expect(client.cache.read(identity)).toMatchObject({
      worldVersion: '8',
      reconciliationRequired: true,
    });
    const lostAck = browser(async (url) => {
      if (String(url).endsWith(LOCAL_WORLD_READ_PATH)) {
        return Response.json({
          schemaVersion: 'world-read-api-v1',
          requestId,
          ok: true,
          data: projection(),
        });
      }
      throw new Error('response dropped');
    });
    await lostAck.readProjection(requestId);
    expect(await lostAck.submitNarrowTransfer(requestId, draft)).toEqual({
      status: 'UNKNOWN',
    });
    expect(lostAck.cache.read(identity)).toMatchObject({
      worldVersion: '8',
      reconciliationRequired: true,
    });
  });

  it('does not retry a committed command with new IDs after a truncated 200 acknowledgement', async () => {
    let durableCommits = 0;
    let commandPosts = 0;
    let releaseFirstAck!: (response: Response) => void;
    const firstAck = new Promise<Response>((resolve) => {
      releaseFirstAck = resolve;
    });
    const fetcher = vi.fn(async (url: URL | RequestInfo) => {
      if (String(url).endsWith(LOCAL_WORLD_READ_PATH)) {
        return Response.json({
          schemaVersion: 'world-read-api-v1',
          requestId,
          ok: true,
          data: projection(),
        });
      }
      commandPosts += 1;
      if (durableCommits === 0) {
        durableCommits += 1; // Server committed before its 200 body was truncated.
        return firstAck;
      }
      return Response.json({
        schemaVersion: 'world-command-api-v1',
        requestId,
        ok: true,
        receipt: receipt(),
      });
    }) as unknown as typeof fetch;
    const client = browser(fetcher);
    expect((await client.readProjection(requestId)).status).toBe('PROJECTION');
    const firstSubmission = client.submitNarrowTransfer(requestId, draft);
    await vi.waitFor(() => expect(commandPosts).toBe(1));
    const changedIds = {
      ...draft,
      commandId: 'COMMAND_2',
      idempotencyKey: 'IDEMPOTENCY_2',
    };
    // B's race: the second command arrives before the first ack exists.
    expect(await client.submitNarrowTransfer(requestId, changedIds)).toEqual({
      status: 'UNKNOWN',
    });
    expect(commandPosts).toBe(1);
    releaseFirstAck(
      new Response('{"schemaVersion":"world-command-api-v1",', { status: 200 }),
    );
    expect(await firstSubmission).toEqual({ status: 'UNKNOWN' });
    expect(client.cache.read(identity)).toMatchObject({
      reconciliationRequired: true,
    });
    expect(await client.submitNarrowTransfer(requestId, changedIds)).toEqual({
      status: 'UNKNOWN',
    });
    expect(
      await client.submitNarrowTransfer(
        '550e8400-e29b-41d4-a716-446655440002',
        draft,
      ),
    ).toEqual({ status: 'UNKNOWN' });
    expect(
      await client.submitNarrowTransfer(requestId, {
        ...draft,
        buyerFinanceApprovalRef: 'APPROVAL_2',
      }),
    ).toEqual({ status: 'UNKNOWN' });
    expect(commandPosts).toBe(1);
    // A same-version refresh alone must not unlock a new economic command.
    expect((await client.readProjection(requestId)).status).toBe('PROJECTION');
    expect(await client.submitNarrowTransfer(requestId, changedIds)).toEqual({
      status: 'UNKNOWN',
    });
    expect(commandPosts).toBe(1);
    expect(await client.submitNarrowTransfer(requestId, draft)).toMatchObject({
      status: 'FINAL_RECEIPT',
      receipt: { commandId: 'COMMAND_1', outcome: 'COMMITTED' },
    });
    expect(durableCommits).toBe(1);
    expect(commandPosts).toBe(2);
  });

  it('releases the in-flight reservation after a verified definitive rejection', async () => {
    const storage = new MemoryPendingStorage();
    let commandPosts = 0;
    let releaseFirst!: (response: Response) => void;
    const firstAck = new Promise<Response>((resolve) => {
      releaseFirst = resolve;
    });
    const secondDraft = {
      ...draft,
      commandId: 'COMMAND_2',
      idempotencyKey: 'IDEMPOTENCY_2',
    };
    const fetcher = vi.fn(async (url: URL | RequestInfo) => {
      if (String(url).endsWith(LOCAL_WORLD_READ_PATH)) {
        return Response.json({
          schemaVersion: 'world-read-api-v1',
          requestId,
          ok: true,
          data: projection(),
        });
      }
      commandPosts += 1;
      if (commandPosts === 1) return firstAck;
      return Response.json({
        schemaVersion: 'world-command-api-v1',
        requestId,
        ok: true,
        receipt: {
          ...receipt(),
          commandId: secondDraft.commandId,
          idempotencyKey: secondDraft.idempotencyKey,
        },
      });
    }) as unknown as typeof fetch;
    const client = browser(fetcher, () => identity, storage);
    await client.readProjection(requestId);
    const firstSubmission = client.submitNarrowTransfer(requestId, draft);
    await vi.waitFor(() => expect(commandPosts).toBe(1));
    expect(await client.submitNarrowTransfer(requestId, secondDraft)).toEqual({
      status: 'UNKNOWN',
    });
    expect(commandPosts).toBe(1);
    releaseFirst(
      Response.json({
        schemaVersion: 'world-command-api-v1',
        requestId,
        ok: true,
        receipt: {
          ...receipt(),
          outcome: 'REJECTED',
          reasonCode: 'NO_APPROVAL',
          worldVersionAfter: null,
          eventIds: [],
        },
      }),
    );
    expect(await firstSubmission).toMatchObject({
      status: 'FINAL_RECEIPT',
      receipt: { outcome: 'REJECTED' },
    });
    expect(storage.getItem(LOCAL_PENDING_MARKER_KEY)).toBeNull();
    expect(
      await client.submitNarrowTransfer(requestId, secondDraft),
    ).toMatchObject({
      status: 'FINAL_RECEIPT',
      receipt: { commandId: 'COMMAND_2', outcome: 'COMMITTED' },
    });
    expect(commandPosts).toBe(2);
  });

  it('persists only a scope-bound pending marker and fails closed after browser-session reconstruction', async () => {
    const storage = new MemoryPendingStorage();
    let commandPosts = 0;
    const fetcher = vi.fn(async (url: URL | RequestInfo) => {
      if (String(url).endsWith(LOCAL_WORLD_READ_PATH)) {
        return Response.json({
          schemaVersion: 'world-read-api-v1',
          requestId,
          ok: true,
          data: projection(),
        });
      }
      commandPosts += 1;
      return new Response('{"schemaVersion":"world-command-api-v1",', {
        status: 200,
      });
    }) as unknown as typeof fetch;
    const first = browser(fetcher, () => identity, storage);
    await first.readProjection(requestId);
    expect(await first.submitNarrowTransfer(requestId, draft)).toEqual({
      status: 'UNKNOWN',
    });
    expect(commandPosts).toBe(1);
    const raw = storage.getItem(LOCAL_PENDING_MARKER_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(String(raw))).toMatchObject({
      schemaVersion: 'LOCAL_WORLD_PENDING_COMMAND_V1',
      commandId: draft.commandId,
      expectedWorldVersion: '8',
    });
    expect(JSON.parse(String(raw)).scopeDigest).toMatch(
      /^sha256:[0-9a-f]{64}$/,
    );
    for (const forbidden of [
      'local-jwt-token',
      draft.idempotencyKey,
      identity.authSubjectId,
      draft.proposalRef,
      draft.buyerFinanceApprovalRef,
      draft.buyerCountryId,
    ])
      expect(raw).not.toContain(forbidden);

    const rebuilt = browser(fetcher, () => identity, storage);
    expect((await rebuilt.readProjection(requestId)).status).toBe('PROJECTION');
    expect(rebuilt.cache.read(identity)).toMatchObject({
      reconciliationRequired: true,
    });
    const newDraft = {
      ...draft,
      commandId: 'COMMAND_2',
      idempotencyKey: 'IDEMPOTENCY_2',
    };
    expect(await rebuilt.submitNarrowTransfer(requestId, newDraft)).toEqual({
      status: 'UNKNOWN',
    });
    expect(await rebuilt.submitNarrowTransfer(requestId, draft)).toEqual({
      status: 'UNKNOWN',
    });
    expect(commandPosts).toBe(1); // No lookup port exists to verify either outcome.

    const otherIdentity = {
      ...identity,
      authSubjectId: '550e8400-e29b-41d4-a716-446655440099',
      countryId: 'COUNTRY_B',
    };
    const other = browser(fetcher, () => otherIdentity, storage);
    expect(await other.submitNarrowTransfer(requestId, newDraft)).toEqual({
      status: 'UNKNOWN',
    });
    const revised = browser(
      fetcher,
      () => ({
        ...identity,
        authorizationRevision: 'AUTH_REVISION_2',
        projectionVersion: 'PROJECTION_2',
      }),
      storage,
    );
    expect(
      await revised.submitNarrowTransfer(requestId, {
        ...draft,
        expectedWorldVersion: '9',
      }),
    ).toEqual({ status: 'UNKNOWN' });
    expect(commandPosts).toBe(1);
    expect(storage.getItem(LOCAL_PENDING_MARKER_KEY)).toBe(raw);
  });

  it('writes the marker before dispatch and removes it only for a verified final receipt', async () => {
    const storage = new MemoryPendingStorage();
    let release!: (response: Response) => void;
    const acknowledgement = new Promise<Response>((resolve) => {
      release = resolve;
    });
    let commandPosts = 0;
    const fetcher = vi.fn(async (url: URL | RequestInfo) => {
      if (String(url).endsWith(LOCAL_WORLD_READ_PATH)) {
        return Response.json({
          schemaVersion: 'world-read-api-v1',
          requestId,
          ok: true,
          data: projection(),
        });
      }
      expect(storage.getItem(LOCAL_PENDING_MARKER_KEY)).not.toBeNull();
      commandPosts += 1;
      return acknowledgement;
    }) as unknown as typeof fetch;
    const client = browser(fetcher, () => identity, storage);
    await client.readProjection(requestId);
    const pending = client.submitNarrowTransfer(requestId, draft);
    await vi.waitFor(() => expect(commandPosts).toBe(1));
    const rebuiltWhilePending = browser(fetcher, () => identity, storage);
    expect(
      await rebuiltWhilePending.submitNarrowTransfer(requestId, {
        ...draft,
        commandId: 'COMMAND_2',
        idempotencyKey: 'IDEMPOTENCY_2',
      }),
    ).toEqual({ status: 'UNKNOWN' });
    expect(commandPosts).toBe(1);
    release(
      Response.json({
        schemaVersion: 'world-command-api-v1',
        requestId,
        ok: true,
        receipt: receipt(),
      }),
    );
    expect(await pending).toMatchObject({ status: 'FINAL_RECEIPT' });
    expect(storage.getItem(LOCAL_PENDING_MARKER_KEY)).toBeNull();
  });

  it('reserves one session marker across two client instances before either can POST', async () => {
    const storage = new MemoryPendingStorage();
    let commandPosts = 0;
    let release!: (response: Response) => void;
    const acknowledgement = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const fetcher = vi.fn(async (url: URL | RequestInfo) => {
      if (String(url).endsWith(LOCAL_WORLD_READ_PATH)) {
        return Response.json({
          schemaVersion: 'world-read-api-v1',
          requestId,
          ok: true,
          data: projection(),
        });
      }
      commandPosts += 1;
      return acknowledgement;
    }) as unknown as typeof fetch;
    const first = browser(fetcher, () => identity, storage);
    const second = browser(fetcher, () => identity, storage);
    await first.readProjection(requestId);
    await second.readProjection(requestId);
    const firstSubmission = first.submitNarrowTransfer(requestId, draft);
    const secondResult = await second.submitNarrowTransfer(requestId, {
      ...draft,
      commandId: 'COMMAND_2',
      idempotencyKey: 'IDEMPOTENCY_2',
    });
    expect(secondResult).toEqual({ status: 'UNKNOWN' });
    await vi.waitFor(() => expect(commandPosts).toBe(1));
    release(
      Response.json({
        schemaVersion: 'world-command-api-v1',
        requestId,
        ok: true,
        receipt: receipt(),
      }),
    );
    expect(await firstSubmission).toMatchObject({ status: 'FINAL_RECEIPT' });
    expect(commandPosts).toBe(1);
  });

  it('does not POST when session marker storage is unavailable or corrupt', async () => {
    let commandPosts = 0;
    const fetcher = vi.fn(async (url: URL | RequestInfo) => {
      if (String(url).endsWith(LOCAL_WORLD_READ_PATH)) {
        return Response.json({
          schemaVersion: 'world-read-api-v1',
          requestId,
          ok: true,
          data: projection(),
        });
      }
      commandPosts += 1;
      return Response.json({});
    }) as unknown as typeof fetch;
    const failingStorage: PendingMarkerStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {},
    };
    const unavailable = browser(fetcher, () => identity, failingStorage);
    await unavailable.readProjection(requestId);
    expect(await unavailable.submitNarrowTransfer(requestId, draft)).toEqual({
      status: 'UNAVAILABLE',
      reason: 'PENDING_STORAGE_UNAVAILABLE',
    });
    const corruptStorage = new MemoryPendingStorage();
    corruptStorage.setItem(LOCAL_PENDING_MARKER_KEY, '{not-json');
    const corrupt = browser(fetcher, () => identity, corruptStorage);
    expect(await corrupt.submitNarrowTransfer(requestId, draft)).toEqual({
      status: 'UNKNOWN',
    });
    expect(commandPosts).toBe(0);
  });

  it('keeps a posted command unknown after bare HTTP denial without a final receipt', async () => {
    const storage = new MemoryPendingStorage();
    let commandPosts = 0;
    const fetcher = vi.fn(async (url: URL | RequestInfo) => {
      if (String(url).endsWith(LOCAL_WORLD_READ_PATH)) {
        return Response.json({
          schemaVersion: 'world-read-api-v1',
          requestId,
          ok: true,
          data: projection(),
        });
      }
      commandPosts += 1;
      return Response.json({}, { status: 403 });
    }) as unknown as typeof fetch;
    const client = browser(fetcher, () => identity, storage);
    await client.readProjection(requestId);
    expect(await client.submitNarrowTransfer(requestId, draft)).toEqual({
      status: 'UNKNOWN',
    });
    expect(storage.getItem(LOCAL_PENDING_MARKER_KEY)).not.toBeNull();
    expect(commandPosts).toBe(1);
  });

  it('clears a reservation when token loss proves no command POST occurred', async () => {
    const storage = new MemoryPendingStorage();
    let tokens = 0;
    let commandPosts = 0;
    const client = createAuthorizedWorldBrowserClient({
      currentIdentity: () => identity,
      getAccessToken: async () => (++tokens === 1 ? 'local-jwt-token' : null),
      bridge: {
        origin: 'http://127.0.0.1:4179',
        fetcher: (async (url: URL | RequestInfo) => {
          if (String(url).endsWith(LOCAL_WORLD_READ_PATH)) {
            return Response.json({
              schemaVersion: 'world-read-api-v1',
              requestId,
              ok: true,
              data: projection(),
            });
          }
          commandPosts += 1;
          return Response.json({});
        }) as unknown as typeof fetch,
      },
      pendingStorage: storage,
    });
    await client.readProjection(requestId);
    expect(await client.submitNarrowTransfer(requestId, draft)).toEqual({
      status: 'UNAVAILABLE',
      reason: 'TOKEN_NOT_READY',
    });
    expect(commandPosts).toBe(0);
    expect(storage.getItem(LOCAL_PENDING_MARKER_KEY)).toBeNull();
  });

  it.each([
    'wrong request ID',
    'wrong schema',
    'missing receipt',
    'invalid receipt',
    'service error',
  ])(
    'classifies post-dispatch %s as unknown and blocks a new command',
    async (kind) => {
      let commandPosts = 0;
      const fetcher = vi.fn(async (url: URL | RequestInfo) => {
        if (String(url).endsWith(LOCAL_WORLD_READ_PATH)) {
          return Response.json({
            schemaVersion: 'world-read-api-v1',
            requestId,
            ok: true,
            data: projection(),
          });
        }
        commandPosts += 1;
        if (kind === 'service error') return Response.json({}, { status: 503 });
        return Response.json({
          schemaVersion:
            kind === 'wrong schema' ? 'wrong-schema' : 'world-command-api-v1',
          requestId:
            kind === 'wrong request ID'
              ? '550e8400-e29b-41d4-a716-446655440002'
              : requestId,
          ok: true,
          ...(kind === 'missing receipt'
            ? {}
            : {
                receipt:
                  kind === 'invalid receipt'
                    ? { ...receipt(), commandFingerprint: 'MOCK' }
                    : receipt(),
              }),
        });
      }) as unknown as typeof fetch;
      const client = browser(fetcher);
      await client.readProjection(requestId);
      expect(await client.submitNarrowTransfer(requestId, draft)).toEqual({
        status: 'UNKNOWN',
      });
      expect(client.cache.read(identity)).toMatchObject({
        reconciliationRequired: true,
      });
      expect(
        await client.submitNarrowTransfer(requestId, {
          ...draft,
          commandId: 'COMMAND_2',
          idempotencyKey: 'IDEMPOTENCY_2',
        }),
      ).toEqual({ status: 'UNKNOWN' });
      expect(commandPosts).toBe(1);
    },
  );
});
