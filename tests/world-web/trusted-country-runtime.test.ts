import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { AuthorizedBrowserIdentity } from '../../apps/world-web/src/authorized-client/client.js';
import {
  LOCAL_PENDING_MARKER_KEY,
  type PendingMarkerStorage,
} from '../../apps/world-web/src/authorized-client/pending-marker.js';
import {
  createStagedReservationClient,
  RESERVATION_RECEIPT_PATH,
  STAGED_RESERVATION_PATH,
} from '../../apps/world-web/src/country-runtime/staged-reservation-client.js';
import {
  countryRoleOffices,
  createTrustedCountryRuntime,
  type CountryRuntimeView,
  type TrustedCountryRuntimeConfig,
} from '../../apps/world-web/src/country-runtime/trusted-runtime.js';

const identity: AuthorizedBrowserIdentity = {
  worldId: 'WORLD_TEST',
  countryId: 'COUNTRY_01',
  officeId: 'TRADE',
  scopeKey: 'SCOPE_TEST',
  authSubjectId: 'test-subject',
  authorizationRevision: 'revision-1',
  modelVersion: 'model-1',
  projectionVersion: 'projection-1',
  classification: 'OFFICE_PRIVATE',
};
const selected: CountryRuntimeView = { countryId: '01', role: 'trade' };
const prepared = {
  commandId: 'COMMAND_1',
  idempotencyKey: 'KEY_1',
  commandFingerprint: `sha256:${'a'.repeat(64)}`,
  approvalRef: 'APPROVAL_1',
  expectedWorldVersion: '0',
  payload: {
    sellerCountryId: identity.countryId,
    buyerCountryId: 'COUNTRY_02',
    commodityId: 'GRAIN',
    quantity: { amount: '2', unit: 'tonne' },
    price: { amount: '3', currency: 'GCU', perUnit: 'tonne' },
    assetSource: {
      batchId: 'BATCH_1',
      physicalLocationId: 'LOCATION_1',
      titleHolderId: 'OWNER_1',
      riskBearerId: 'OWNER_1',
      economicRecognitionId: null,
    },
    expiresAtReal: '2026-10-05T00:10:00.000Z',
  },
};
class Storage implements PendingMarkerStorage {
  values = new Map<string, string>();
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
function scenario() {
  let live = true,
    invalidate: (() => void) | null = null,
    view: CountryRuntimeView | null = selected;
  let worldVersion = '0',
    staged = 'QUEUED',
    hasFinal = false,
    inspectMatches = true,
    failEnqueue = false,
    receiptMatches = true,
    projectionSchema = 'world-activity-projection-v1';
  const storage = new Storage(),
    cleanup = vi.fn();
  const config: TrustedCountryRuntimeConfig = {
    currentIdentity: { ...identity },
    bridgeOrigin: 'http://127.0.0.1:4101',
    getAccessToken: vi.fn(async () => 'test-token'),
    session: {
      sessionRef: 'test-session',
      isCurrent: () => live,
      onInvalidate: (fn) => {
        invalidate = fn;
        return cleanup;
      },
    },
    seed: {
      worldId: identity.worldId,
      seedRef: 'test-only-seed',
      contentHash: `sha256:${'b'.repeat(64)}`,
    },
    capability: {
      kind: 'STAGED_INVENTORY_RESERVATION',
      identity: { ...identity },
    },
    view: selected,
    preparedReservation: structuredClone(prepared),
  };
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    const request = JSON.parse(String(init?.body)) as Record<string, unknown>;
    if (String(url).endsWith('/local/v1/world-read'))
      return Response.json({
        schemaVersion: 'world-read-api-v1',
        requestId: request.requestId,
        ok: true,
        data: {
          schemaVersion: 'world-projection-read-v1',
          worldId: identity.worldId,
          classification: identity.classification,
          scopeKey: identity.scopeKey,
          watermark: {
            worldVersion,
            eventSequence: worldVersion,
            generatedAt: '2026-10-05T00:00:00.000Z',
          },
          receipts: [],
          events: [],
          payload: {
            schemaVersion: projectionSchema,
            countryId: identity.countryId,
            officeId: identity.officeId,
            activity: {},
            ledger: {
              financialPositions: [],
              inventoryPositions:
                worldVersion === '0'
                  ? []
                  : [
                      {
                        bucket: 'AVAILABLE',
                        commodityId: 'GRAIN',
                        quantity: '-2',
                        unit: 'tonne',
                      },
                      {
                        bucket: 'RESERVED',
                        commodityId: 'GRAIN',
                        quantity: '2',
                        unit: 'tonne',
                      },
                    ],
            },
          },
        },
      });
    if (String(url).endsWith(RESERVATION_RECEIPT_PATH)) {
      if (!hasFinal)
        return Response.json({
          schemaVersion: 'world-final-receipt-read-v1',
          requestId: request.requestId,
          ok: false,
          error: { code: 'NOT_FOUND' },
        });
      return Response.json({
        schemaVersion: 'world-final-receipt-read-v1',
        requestId: request.requestId,
        ok: true,
        receipt: {
          source: 'DURABLE_FINAL_COMMAND_RECEIPT',
          worldId: identity.worldId,
          commandId: prepared.commandId,
          idempotencyKey: prepared.idempotencyKey,
          commandFingerprint: receiptMatches
            ? prepared.commandFingerprint
            : `sha256:${'c'.repeat(64)}`,
          outcome: 'COMMITTED',
          reasonCode: null,
          worldVersionAfter: '1',
          eventIds: ['EVENT_1'],
          recordedAtReal: '2026-10-05T00:00:00.000Z',
        },
      });
    }
    if (!String(url).endsWith(STAGED_RESERVATION_PATH))
      throw new Error('Unexpected route');
    if (request.action === 'INSPECT')
      return Response.json({
        schemaVersion: 'world-staged-transfer-v1',
        ok: true,
        state: {
          status: 'INTENT',
          commandId: prepared.commandId,
          idempotencyKey: prepared.idempotencyKey,
          commandFingerprint: prepared.commandFingerprint,
          expectedWorldVersion: prepared.expectedWorldVersion,
          simTime: '0',
          payload: inspectMatches
            ? prepared.payload
            : { ...prepared.payload, quantity: { amount: '3', unit: 'tonne' } },
        },
      });
    if (request.action === 'ENQUEUE' && failEnqueue)
      throw new Error('Lost acknowledgement');
    return Response.json({
      schemaVersion: 'world-staged-transfer-v1',
      ok: true,
      state: {
        status: staged,
        acknowledgement: {
          status: 'ACCEPTED',
          worldId: identity.worldId,
          commandId: prepared.commandId,
          commandFingerprint: prepared.commandFingerprint,
          acceptedSimTime: '0',
          acceptedAtReal: '2026-10-05T00:00:00.000Z',
        },
      },
    });
  });
  const factory = (
    options: Parameters<typeof createStagedReservationClient>[0],
  ) =>
    createStagedReservationClient({
      ...options,
      fetcher,
      pendingStorage: storage,
    });
  const runtime = createTrustedCountryRuntime(config, () => view, factory);
  return {
    runtime,
    config,
    factory,
    storage,
    fetcher,
    cleanup,
    countEnqueue: () =>
      fetcher.mock.calls.filter(
        ([, init]) => JSON.parse(String(init?.body)).action === 'ENQUEUE',
      ).length,
    setVersion: (v: string) => {
      worldVersion = v;
    },
    setStage: (v: string) => {
      staged = v;
    },
    setFinal: () => {
      hasFinal = true;
    },
    badInspect: () => {
      inspectMatches = false;
    },
    loseAck: () => {
      failEnqueue = true;
    },
    badReceipt: () => {
      receiptMatches = false;
    },
    sourcePayload: () => {
      projectionSchema = 'API_COUNTRY_VERIFIED';
    },
    changeView: (v: CountryRuntimeView | null) => {
      view = v;
    },
    revoke: () => {
      live = false;
      invalidate?.();
    },
    expire: () => {
      live = false;
    },
  };
}
async function ready(p: ReturnType<typeof scenario>) {
  await p.runtime.readProjection();
  await p.runtime.inspect();
  expect(p.runtime.review()).toBe(true);
}

describe('static country → actual A staged reservation contract (offline)', () => {
  it('has no trusted host defaults or network without complete injection', async () => {
    const factory = vi.fn();
    const runtime = createTrustedCountryRuntime(null, () => selected, factory);
    await runtime.readProjection();
    await runtime.confirm();
    await runtime.inspect();
    expect(runtime.getState()).toMatchObject({
      connection: 'NOT_CONNECTED',
      canRead: false,
      canConfirm: false,
    });
    expect(factory).not.toHaveBeenCalled();
  });
  it.each([
    'session',
    'seed',
    'capability',
    'currentIdentity',
    'preparedReservation',
  ])('fails closed without %s', async (key) => {
    const p = scenario(),
      factory = vi.fn();
    const config = {
      ...p.config,
      [key]: undefined,
    } as unknown as TrustedCountryRuntimeConfig;
    const runtime = createTrustedCountryRuntime(
      config,
      () => selected,
      factory,
    );
    await runtime.readProjection();
    expect(runtime.getState().connection).toBe('NOT_CONNECTED');
    expect(factory).not.toHaveBeenCalled();
  });
  it.each([
    'https://example.test',
    'https://127.0.0.1:4101',
    'http://localhost:4101/source',
    'http://user@localhost:4101',
    'http://localhost:4101?token=x',
  ])('does not broaden local transport: %s', (bridgeOrigin) => {
    const p = scenario();
    expect(
      createTrustedCountryRuntime(
        { ...p.config, bridgeOrigin },
        () => selected,
        p.factory,
      ).getState().connection,
    ).toBe('NOT_CONNECTED');
  });
  it.each(Object.keys(countryRoleOffices))(
    'keeps %s entry but only explicit seller TRADE capability connects',
    (role) => {
      const p = scenario(),
        view = { countryId: '01', role: role as CountryRuntimeView['role'] };
      const runtime = createTrustedCountryRuntime(
        { ...p.config, view },
        () => view,
        p.factory,
      );
      expect(runtime.getState().connection).toBe(
        role === 'trade' ? 'HOST_BOUND_LOCAL_PREPARATION' : 'NOT_CONNECTED',
      );
      expect(runtime.getState().canConfirm).toBe(false);
    },
  );
  it('rejects cash operation family, different authority revision and different seed World', () => {
    const p = scenario();
    const cases = [
      {
        ...p.config,
        capability: { ...p.config.capability, kind: 'NARROW_TRANSFER' },
      },
      {
        ...p.config,
        capability: {
          ...p.config.capability,
          identity: { ...identity, authorizationRevision: 'revision-2' },
        },
      },
      { ...p.config, seed: { ...p.config.seed, worldId: 'WORLD_OTHER' } },
    ];
    for (const c of cases)
      expect(
        createTrustedCountryRuntime(
          c as TrustedCountryRuntimeConfig,
          () => selected,
          p.factory,
        ).getState().connection,
      ).toBe('NOT_CONNECTED');
  });
  it('requires version-matched projection, actual INSPECT equality, and explicit review', async () => {
    const p = scenario();
    await p.runtime.confirm();
    expect(p.countEnqueue()).toBe(0);
    await p.runtime.readProjection();
    expect(p.runtime.review()).toBe(false);
    await p.runtime.inspect();
    expect(p.runtime.review()).toBe(true);
    await Promise.all([p.runtime.confirm(), p.runtime.confirm()]);
    expect(p.countEnqueue()).toBe(1);
    expect(p.runtime.getState()).toMatchObject({
      lifecycle: 'QUEUED',
      canRead: false,
      canConfirm: false,
      canLookup: true,
      projection: null,
      receipt: null,
    });
    const enqueue = p.fetcher.mock.calls.find(
      ([, init]) => JSON.parse(String(init?.body)).action === 'ENQUEUE',
    )!;
    expect(JSON.parse(String(enqueue[1]?.body))).toEqual({
      schemaVersion: 'world-staged-transfer-v1',
      action: 'ENQUEUE',
      worldId: identity.worldId,
      commandId: prepared.commandId,
      idempotencyKey: prepared.idempotencyKey,
      countryId: identity.countryId,
      officeId: 'TRADE',
      commandFingerprint: prepared.commandFingerprint,
      approvalRef: prepared.approvalRef,
    });
    expect(enqueue[1]).toMatchObject({
      method: 'POST',
      credentials: 'omit',
      redirect: 'error',
      headers: { authorization: 'Bearer test-token' },
    });
    expect(
      p.fetcher.mock.calls.some(([url]) =>
        String(url).includes('/narrow-transfer-command'),
      ),
    ).toBe(false);
  });
  it.each([
    'PENDING_APPROVAL_OR_ENQUEUE',
    'QUEUED',
    'EXECUTING',
    'NOT_FOUND',
    'UNKNOWN',
  ])(
    'preserves %s literally; never fabricates FINAL or resends',
    async (status) => {
      const p = scenario();
      await ready(p);
      await p.runtime.confirm();
      p.setStage(status);
      await p.runtime.lookupOriginalFinalReceipt();
      expect(p.runtime.getState().lifecycle).toBe(status);
      expect(p.runtime.getState().receipt).toBeNull();
      await p.runtime.confirm();
      await p.runtime.readProjection();
      expect(p.countEnqueue()).toBe(1);
      expect(p.storage.getItem(LOCAL_PENDING_MARKER_KEY)).not.toBeNull();
    },
  );
  it('reads dedicated verified FINAL and only then explicit fresh movement projection (not stock balances)', async () => {
    const p = scenario();
    await ready(p);
    await p.runtime.confirm();
    p.setStage('FINAL');
    await p.runtime.lookupOriginalFinalReceipt();
    expect(p.runtime.getState().receipt).toBeNull();
    p.setFinal();
    await p.runtime.lookupOriginalFinalReceipt();
    expect(p.runtime.getState()).toMatchObject({
      lifecycle: 'FINAL',
      projection: null,
      canRead: true,
    });
    await p.runtime.readProjection();
    expect(p.runtime.getState().projection).toBeNull();
    p.setVersion('1');
    await p.runtime.readProjection();
    expect(p.runtime.getState().projection).toMatchObject({
      worldVersion: '1',
      movements: [
        { bucket: 'AVAILABLE', quantity: '-2', unit: 'tonne' },
        { bucket: 'RESERVED', quantity: '2', unit: 'tonne' },
      ],
    });
    expect(p.storage.getItem(LOCAL_PENDING_MARKER_KEY)).toBeNull();
    expect(p.runtime.getState().canConfirm).toBe(false);
  });
  it('keeps lost ENQUEUE acknowledgement UNKNOWN and resolves only original IDs/fingerprint', async () => {
    const p = scenario();
    await ready(p);
    p.loseAck();
    await p.runtime.confirm();
    expect(p.runtime.getState().lifecycle).toBe('UNKNOWN');
    p.setStage('FINAL');
    p.setFinal();
    p.badReceipt();
    await p.runtime.lookupOriginalFinalReceipt();
    expect(p.runtime.getState().receipt).toBeNull();
    expect(p.runtime.getState().canRead).toBe(false);
    expect(p.countEnqueue()).toBe(1);
  });
  it('rejects mismatched INSPECT, source payload, stale version, and JS numeric intent', async () => {
    const p = scenario();
    p.badInspect();
    await p.runtime.readProjection();
    await p.runtime.inspect();
    expect(p.runtime.review()).toBe(false);
    const q = scenario();
    q.sourcePayload();
    await q.runtime.readProjection();
    await q.runtime.inspect();
    expect(q.runtime.review()).toBe(false);
    const r = scenario();
    r.setVersion('1');
    await r.runtime.readProjection();
    await r.runtime.inspect();
    expect(r.runtime.review()).toBe(false);
    const bad = {
      ...p.config,
      preparedReservation: {
        ...prepared,
        payload: {
          ...prepared.payload,
          quantity: { amount: 2, unit: 'tonne' },
        },
      },
    };
    expect(
      createTrustedCountryRuntime(bad, () => selected, p.factory).getState()
        .connection,
    ).toBe('NOT_CONNECTED');
  });
  it('retires projection/intent permanently on country/role change and host invalidation', async () => {
    const p = scenario();
    await ready(p);
    p.changeView({ countryId: '02', role: 'finance' });
    expect(p.runtime.getState()).toMatchObject({
      connection: 'NOT_CONNECTED',
      projection: null,
      draft: null,
    });
    p.changeView(selected);
    await p.runtime.confirm();
    expect(p.countEnqueue()).toBe(0);
    expect(p.cleanup).toHaveBeenCalledTimes(1);
    const q = scenario();
    await ready(q);
    q.revoke();
    expect(q.runtime.getState().connection).toBe('NOT_CONNECTED');
  });
  it.each(['disconnect', 'seat', 'expiry'])(
    'real staged transport sends no ENQUEUE after %s during deferred token',
    async (change) => {
      const p = scenario();
      await ready(p);
      let resolve!: (token: string) => void;
      const token = new Promise<string>((settle) => {
        resolve = settle;
      });
      vi.mocked(p.config.getAccessToken).mockImplementationOnce(() => token);
      const confirming = p.runtime.confirm();
      // Wait for the token boundary rather than a timing sleep.
      for (
        let i = 0;
        i < 20 &&
        vi.mocked(p.config.getAccessToken).mock.results.at(-1)?.value !== token;
        i++
      )
        await new Promise<void>((settle) => setImmediate(settle));
      if (change === 'disconnect') p.runtime.disconnect();
      else if (change === 'seat')
        p.changeView({ countryId: '02', role: 'trade' });
      else p.expire();
      resolve('test-token');
      await confirming;
      expect(p.countEnqueue()).toBe(0);
      expect(p.runtime.getState().connection).toBe('NOT_CONNECTED');
    },
  );
  it('survives reconnect/reload with pending marker without duplicate ENQUEUE', async () => {
    const p = scenario();
    await ready(p);
    await p.runtime.confirm();
    p.runtime.disconnect();
    const newRuntime = createTrustedCountryRuntime(
      p.config,
      () => selected,
      p.factory,
    );
    expect(newRuntime.getState()).toMatchObject({
      lifecycle: 'UNKNOWN',
      canConfirm: false,
      canRead: false,
      canLookup: true,
    });
    await newRuntime.confirm();
    expect(p.countEnqueue()).toBe(1);
    p.setFinal();
    p.setStage('FINAL');
    expect(await newRuntime.lookupOriginalFinalReceipt()).toBe(true);
    p.setVersion('1');
    await newRuntime.readProjection();
    expect(newRuntime.getState().projection?.worldVersion).toBe('1');
  });
  it('freezes host-prepared terms against mutable caller input', async () => {
    const p = scenario();
    (p.config.preparedReservation.payload as { quantity: unknown }).quantity = {
      amount: '9',
      unit: 'tonne',
    };
    await ready(p);
    expect(p.runtime.getState().draft?.payload.quantity).toEqual({
      amount: '2',
      unit: 'tonne',
    });
  });
  it('wires stable entry without modifying pinned index or importing prototype fixtures', () => {
    const root = new URL('../../', import.meta.url),
      read = (p: string) => readFileSync(new URL(p, root), 'utf8');
    const page = read(
        'apps/world-web/public/season1-immersive/country-game.js',
      ),
      entry = read('apps/world-web/src/country-runtime/entry.ts');
    expect(page).toContain(
      "new URL('../country-runtime-entry.js', document.currentScript.src)",
    );
    expect(page).toContain(
      "root.querySelector('.national-confirm').disabled=true",
    );
    expect(entry).toContain('econmind-country-runtime-ready');
    expect(entry).toContain('not opening-inclusive stock balances');
    expect(entry).not.toMatch(
      /localStorage|\blocation\.|import\.meta\.env|SixOfficesG01|import[^;]*fixtures/u,
    );
  });
});
