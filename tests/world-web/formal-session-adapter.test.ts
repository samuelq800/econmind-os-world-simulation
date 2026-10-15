import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  installFormalSessionAdapter,
  type AuthSessionSnapshot,
} from '../../apps/world-web/src/trusted-host/formal-session-adapter.js';
import { installTrustedHost } from '../../apps/world-web/src/trusted-host/bootstrap.js';
import { installOfficeCommand } from '../../apps/world-web/src/office-command/view.js';
import { installOfficeProjection } from '../../apps/world-web/src/office-projection/view.js';
import { installFinancialIntake } from '../../apps/world-web/src/financial-intake/view.js';
import { officeCommandFixture } from './office-command-fixture.js';
import { HostDocument } from './trusted-host-dom.js';
import type { AuthenticatedCurrentSeatResponseDto } from '@econmind/core';

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const stop of cleanups.splice(0)) stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function mount() {
  const f = officeCommandFixture(),
    doc = new HostDocument('captain'),
    authListeners = new Set<() => void>(),
    mutations: (() => void)[] = [];
  const events = new Map<string, () => void>();
  vi.stubGlobal(
    'MutationObserver',
    class {
      constructor(fn: () => void) {
        mutations.push(fn);
      }
      observe() {}
    },
  );
  vi.stubGlobal('fetch', f.fetcher);
  const document = doc as unknown as Document,
    window = {
      addEventListener(key: string, fn: () => void) {
        events.set(key, fn);
      },
    } as unknown as Window;
  const projection = installOfficeProjection(document, window),
    financial = installFinancialIntake(document, window),
    office = installOfficeCommand(document, window);
  const host = installTrustedHost(document, window, {
    projection,
    financial,
    office,
    localTrade: { disconnect() {} },
  });
  let snapshot: AuthSessionSnapshot | null = {
    subject: f.f.config.identity.authSubjectId,
    sessionRef: 'AUTH_TEST_SESSION',
    expiresAtEpochSeconds: Math.floor(Date.now() / 1000) + 60,
  };
  let accessToken: () => Promise<string | null> = async () => 'TEST_ONLY_TOKEN';
  const auth = {
    currentSession: () => snapshot,
    getAccessToken: () => accessToken(),
    subscribe(fn: () => void) {
      authListeners.add(fn);
      return () => {
        authListeners.delete(fn);
      };
    },
  };
  const seats = {
    readSeat: vi.fn(async (input: { requestId: string }) => {
      const response = await f.f.fetcher(
        f.f.config.endpoints.origin + f.f.config.endpoints.projectionPath,
        { body: JSON.stringify({ requestId: input.requestId }) },
      );
      return response.json() as Promise<unknown>;
    }),
  };
  let nextId = 0;
  const adapter = installFormalSessionAdapter(document, window, host, {
    requestId: () =>
      `11111111-1111-4111-8111-${String(++nextId).padStart(12, '0')}`,
  });
  cleanups.push(() => adapter.disconnect());
  const config = {
    auth,
    seats,
    targets: { read: f.f.config.endpoints, office: f.endpoint },
    world: f.f.config.world,
    countryIdsByDisplayId: { '01': f.f.config.identity.countryId },
  };
  return {
    f,
    doc,
    host,
    projection,
    office,
    adapter,
    auth,
    seats,
    config,
    changeAuth: (next: AuthSessionSnapshot | null) => {
      snapshot = next;
      for (const fn of [...authListeners]) fn();
    },
    token: (fn: () => Promise<string | null>) => {
      accessToken = fn;
    },
    mutate: () => {
      for (const fn of mutations) fn();
    },
    pagehide: () => events.get('pagehide')?.(),
  };
}
describe('formal adapter / actual installed host/read/Office / OFFLINE TEST_ONLY', () => {
  it('missing real provider is BLOCKED and makes no request', async () => {
    const m = mount();
    expect(await m.adapter.bindCurrentView()).toBe(false);
    expect(m.adapter.getState()).toMatchObject({
      status: 'BLOCKED',
      productionLogin: 'BLOCKED_PENDING_REAL_PROVIDER_AND_G_ENDPOINT',
    });
    expect(m.f.f.calls).toHaveLength(0);
    expect(m.f.commands).toHaveLength(0);
  });
  it('strict seat receipt + authenticated readback then installs real consumers, not just connect wrapper', async () => {
    const m = mount();
    expect(m.adapter.configure(m.config)).toBe(true);
    expect(await m.adapter.bindCurrentView()).toBe(true);
    expect(m.host.getState()).toMatchObject({
      status: 'SESSION_CONFIGURED',
      officeConfigured: true,
    });
    expect(m.f.f.calls).toHaveLength(2);
    expect(m.f.commands).toHaveLength(0);
    expect(m.office.getState().status).toBe('READY_TO_READ');
    expect(m.adapter.getState().productionLogin).toBe(
      'BLOCKED_PENDING_REAL_PROVIDER_AND_G_ENDPOINT',
    );
    expect(JSON.stringify(m.adapter.getState())).not.toContain(
      'TEST_ONLY_TOKEN',
    );
    m.changeAuth(null);
    expect(m.adapter.getState().status).toBe('BLOCKED');
    expect(m.office.getState().status).toBe('MISSING');
  });
  it.each(['subject', 'office', 'seat', 'admission', 'revision'])(
    'rejects mismatched %s receipt without host connection',
    async (fault) => {
      const m = mount(),
        original = m.seats.readSeat;
      m.seats.readSeat = vi.fn(async (input) => {
        const e = (await original(input)) as {
          authority: {
            identity: Record<string, unknown>;
            seatRef: string;
            seed: { admissionRef: string };
          };
        };
        if (fault === 'subject')
          e.authority.identity.authSubjectId =
            '33333333-3333-4333-8333-333333333333';
        if (fault === 'office') e.authority.identity.officeId = 'SOCIAL';
        if (fault === 'seat') e.authority.seatRef = '';
        if (fault === 'admission')
          e.authority.seed.admissionRef = 'OTHER_ADMISSION';
        if (fault === 'revision')
          e.authority.identity.authorizationRevision = 'OTHER_REVISION';
        return e;
      });
      expect(m.adapter.configure(m.config)).toBe(true);
      expect(await m.adapter.bindCurrentView()).toBe(false);
      expect(m.host.getState().status).toBe('NOT_CONNECTED');
      expect(m.f.commands).toHaveLength(0);
    },
  );
  it('provider JSON cannot replace authenticated endpoint readback', async () => {
    const m = mount();
    vi.stubGlobal('fetch', async () => new Response(null, { status: 403 }));
    expect(m.adapter.configure(m.config)).toBe(true);
    expect(await m.adapter.bindCurrentView()).toBe(false);
    expect(m.adapter.getState()).toMatchObject({
      status: 'BLOCKED',
      reason: 'DENIED',
    });
    expect(m.host.getState().status).toBe('NOT_CONNECTED');
  });
  it('does not send token/seat requests after identity changes during token await', async () => {
    const m = mount();
    let release: (s: string) => void = () => undefined;
    m.token(
      () =>
        new Promise((r) => {
          release = r;
        }),
    );
    m.adapter.configure(m.config);
    const pending = m.adapter.bindCurrentView();
    m.changeAuth(null);
    release('TEST_ONLY_TOKEN');
    expect(await pending).toBe(false);
    expect(m.seats.readSeat).not.toHaveBeenCalled();
  });
  it('late seat response cannot reconnect after country/office navigation', async () => {
    const m = mount(),
      original = m.seats.readSeat;
    let release: (v: unknown) => void = () => undefined;
    m.seats.readSeat = vi.fn(
      () =>
        new Promise((r) => {
          release = r;
        }),
    );
    m.adapter.configure(m.config);
    const pending = m.adapter.bindCurrentView();
    await expect.poll(() => m.seats.readSeat.mock.calls.length).toBe(1);
    const receipt = await original({ requestId: m.f.request.requestId });
    m.doc.root.dataset.country = '02';
    m.mutate();
    release(receipt);
    expect(await pending).toBe(false);
    expect(m.host.getState().status).toBe('NOT_CONNECTED');
  });
  it('expiry/pagehide retires live consumers without polling and fresh explicit lifetime can rebind', async () => {
    vi.useFakeTimers();
    const m = mount();
    m.adapter.configure(m.config);
    expect(await m.adapter.bindCurrentView()).toBe(true);
    m.adapter.disconnect();
    expect(await m.adapter.bindCurrentView()).toBe(true);
    await vi.advanceTimersByTimeAsync(60001);
    expect(m.host.getState().status).toBe('NOT_CONNECTED');
    expect(m.office.getState().status).toBe('MISSING');
    m.pagehide();
    expect(m.adapter.getState().status).toBe('BLOCKED');
  });
  it('invalid origin/default target is rejected without acquiring a token', () => {
    const m = mount(),
      token = vi.fn(async () => 'TEST_ONLY_TOKEN');
    m.token(token);
    expect(
      m.adapter.configure({
        ...m.config,
        targets: {
          ...m.config.targets,
          read: { ...m.config.targets.read, origin: 'http://localhost:1' },
        },
      }),
    ).toBe(false);
    expect(token).not.toHaveBeenCalled();
    expect(m.f.f.calls).toHaveLength(0);
  });
});

describe('shared Office denial / page lifetime', () => {
  it('never infers country authority from a display key or accepts another authorized country', async () => {
    const m = mount();
    expect(
      m.adapter.configure({
        ...m.config,
        countryIdsByDisplayId: { '01': 'OTHER_SERVER_COUNTRY' },
      }),
    ).toBe(true);
    expect(await m.adapter.bindCurrentView()).toBe(false);
    expect(m.host.getState().status).toBe('NOT_CONNECTED');
    expect(m.f.commands).toHaveLength(0);
  });
  it('Office 403 immediately retires all shared consumers and clears private DOM', async () => {
    const m = mount();
    m.adapter.configure(m.config);
    expect(await m.adapter.bindCurrentView()).toBe(true);
    m.doc.tools
      .all()
      .find((e) => Object.hasOwn(e.dataset, 'officeCommandEntry'))!
      .click();
    const dialog = m.doc.root
      .all()
      .find((e) => Object.hasOwn(e.dataset, 'officeCommandDialog'))!;
    const click = (key: string) =>
      dialog
        .all()
        .find((e) => e.dataset.officeCommandAction === key)!
        .click();
    click('refresh');
    await expect.poll(() => m.office.getState().status).toBe('CURRENT');
    const draft = dialog
      .all()
      .find((e) =>
        Object.hasOwn(e.dataset, 'officeCommandDraft'),
      )! as unknown as { value: string };
    draft.value = JSON.stringify(m.f.request);
    click('stage');
    click('review');
    m.f.submit(async () => new Response(null, { status: 403 }));
    click('confirm');
    await expect.poll(() => m.host.getState().status).toBe('NOT_CONNECTED');
    expect(m.projection.getState()).toMatchObject({
      model: null,
      receipt: null,
      canRead: false,
    });
    expect(m.office.getState()).toMatchObject({
      model: null,
      intent: null,
      receipt: null,
    });
    expect(m.doc.body.textContent).not.toContain('TEST_COMMAND');
  });
  it('pagehide cannot reconnect an adapter whose auth subscription was detached', async () => {
    const m = mount();
    m.adapter.configure(m.config);
    expect(await m.adapter.bindCurrentView()).toBe(true);
    m.pagehide();
    expect(await m.adapter.bindCurrentView()).toBe(false);
    expect(m.host.getState().status).toBe('NOT_CONNECTED');
  });
});

type CurrentSeatSuccess = Extract<
  AuthenticatedCurrentSeatResponseDto,
  { ok: true }
>;
type Mounted = ReturnType<typeof mount>;
/** Core wire DTO only, OFFLINE TEST_ONLY. Projection fixtures are used solely
 * by the subsequent authenticated readback, never as this seat response. */
function currentSeatPacket(
  m: Mounted,
  requestId: string,
  jwtExpiry?: number,
): CurrentSeatSuccess {
  const config = m.f.f.config;
  return {
    schemaVersion: 'world-current-seat-v1',
    requestId,
    ok: true,
    session: {
      authSubjectId: config.identity.authSubjectId,
      issuedAtEpochSeconds: Math.floor(Date.now() / 1000) - 60,
      expiresAtEpochSeconds:
        jwtExpiry ?? m.auth.currentSession()!.expiresAtEpochSeconds,
    },
    world: { ...config.world },
    bindings: [
      {
        source: 'SERVER_VERIFIED_READ_BINDING',
        capability: 'READ_AUTHORIZED_PROJECTION_AND_FINAL',
        seatRef: config.seatRef,
        seatState: 'ACTIVE',
        identity: { ...config.identity, classification: 'OFFICE_PRIVATE' },
        seed: {
          worldId: config.world.worldId,
          seedRef: config.world.seedRef,
          contentHash: config.world.contentHash,
          admissionRef: config.world.admissionRef,
        },
        readback: {
          worldId: config.world.worldId,
          seedRef: config.world.seedRef,
          contentHash: config.world.contentHash,
          admissionRef: config.world.admissionRef,
          worldVersion: '2',
          eventSequence: '2',
          readbackRef: 'TEST_READBACK',
        },
      },
    ],
  };
}
function currentSeats(
  m: Mounted,
  change: (p: CurrentSeatSuccess) => unknown = (p) => p,
) {
  m.seats.readSeat.mockImplementation(async ({ requestId }) =>
    change(currentSeatPacket(m, requestId)),
  );
}
function otherOffice(p: CurrentSeatSuccess) {
  const binding = structuredClone(p.bindings[0]!);
  Object.assign(binding.identity, {
    officeId: 'SOCIAL',
    scopeKey: 'TEST_SCOPE_SOCIAL',
  });
  return binding;
}

describe('Core current-seat envelope consumer / OFFLINE TEST_ONLY', () => {
  it('selects one active private binding among legitimate other Offices and rechecks projection', async () => {
    const m = mount();
    currentSeats(m, (p) => ({
      ...p,
      bindings: [otherOffice(p), ...p.bindings],
    }));
    expect(m.adapter.configure(m.config)).toBe(true);
    expect(await m.adapter.bindCurrentView()).toBe(true);
    expect(m.f.f.calls).toHaveLength(1);
    expect(m.office.getState().status).toBe('READY_TO_READ');
    expect(m.f.commands).toHaveLength(0);
    expect(m.adapter.getState().productionLogin).toBe(
      'BLOCKED_PENDING_REAL_PROVIDER_AND_G_ENDPOINT',
    );
    expect(JSON.stringify(m.adapter.getState())).not.toContain(
      'TEST_ONLY_TOKEN',
    );
  });
  const invalid: readonly [string, (p: CurrentSeatSuccess) => unknown][] = [
    ['zero matches', (p) => ({ ...p, bindings: [otherOffice(p)] })],
    [
      'duplicate matches',
      (p) => ({
        ...p,
        bindings: [...p.bindings, structuredClone(p.bindings[0]!)],
      }),
    ],
    [
      'foreign session',
      (p) => ({
        ...p,
        session: {
          ...p.session,
          authSubjectId: '33333333-3333-4333-8333-333333333333',
        },
      }),
    ],
    [
      'wrong request',
      (p) => ({ ...p, requestId: '33333333-3333-4333-8333-333333333333' }),
    ],
    [
      'foreign World',
      (p) => ({ ...p, world: { ...p.world, worldId: 'OTHER_WORLD' } }),
    ],
    [
      'foreign admission',
      (p) => ({ ...p, world: { ...p.world, admissionRef: 'OTHER_ADMISSION' } }),
    ],
    [
      'foreign hash',
      (p) => ({
        ...p,
        world: { ...p.world, contentHash: `sha256:${'b'.repeat(64)}` },
      }),
    ],
    [
      'foreign minimum head',
      (p) => ({ ...p, world: { ...p.world, minimumWorldVersion: '3' } }),
    ],
    ['missing bindings', (p) => ({ ...p, bindings: undefined })],
    [
      'error envelope',
      (p) => ({
        schemaVersion: p.schemaVersion,
        requestId: p.requestId,
        ok: false,
        error: { code: 'DENIED' },
      }),
    ],
    [
      'malformed unselected entry',
      (p) => ({ ...p, bindings: [...p.bindings, null] }),
    ],
    [
      'inactive seat',
      (p) => {
        Object.assign(p.bindings[0]!, { seatState: 'INACTIVE' });
        return p;
      },
    ],
    [
      'foreign binding subject',
      (p) => {
        Object.assign(p.bindings[0]!.identity, {
          authSubjectId: '33333333-3333-4333-8333-333333333333',
        });
        return p;
      },
    ],
    [
      'foreign binding World',
      (p) => {
        Object.assign(p.bindings[0]!.identity, { worldId: 'OTHER_WORLD' });
        return p;
      },
    ],
    [
      'foreign country',
      (p) => {
        Object.assign(p.bindings[0]!.identity, { countryId: 'OTHER_COUNTRY' });
        return p;
      },
    ],
    [
      'country classification only',
      (p) => {
        Object.assign(p.bindings[0]!.identity, { classification: 'COUNTRY' });
        return p;
      },
    ],
    [
      'unknown Office',
      (p) => {
        Object.assign(p.bindings[0]!.identity, { officeId: 'OTHER_OFFICE' });
        return p;
      },
    ],
    [
      'foreign source head',
      (p) => {
        Object.assign(p.bindings[0]!.readback, { seedRef: 'OTHER_SEED' });
        return p;
      },
    ],
    [
      'below minimum head',
      (p) => {
        Object.assign(p.bindings[0]!.readback, { worldVersion: '0' });
        return p;
      },
    ],
    [
      'malformed head',
      (p) => {
        Object.assign(p.bindings[0]!.readback, { eventSequence: '1.5' });
        return p;
      },
    ],
    [
      'bad unselected context is not discarded',
      (p) => {
        const other = otherOffice(p);
        Object.assign(other.seed, { admissionRef: 'OTHER_ADMISSION' });
        return { ...p, bindings: [...p.bindings, other] };
      },
    ],
    [
      'no legacy fallback',
      (p) => ({ ...p, bindings: [], authority: p.bindings[0] }),
    ],
  ];
  it.each(invalid)(
    'rejects %s before host connection',
    async (_name, change) => {
      const m = mount();
      currentSeats(m, change);
      m.adapter.configure(m.config);
      expect(await m.adapter.bindCurrentView()).toBe(false);
      expect(m.host.getState().status).toBe('NOT_CONNECTED');
      expect(m.f.f.calls).toHaveLength(0);
      expect(m.f.commands).toHaveLength(0);
    },
  );
  it.each([
    'negative iat',
    'negative exp',
    'equal',
    'reversed',
    'fractional iat',
    'fractional exp',
    'unsafe',
    'nonfinite',
  ])(
    'rejects invalid JWT interval %s independently of expired-token rejection',
    async (fault) => {
      const m = mount(),
        future = Math.floor(Date.now() / 1000) + 60;
      const intervals: Record<string, readonly [number, number]> = {
        'negative iat': [-1, future],
        'negative exp': [0, -1],
        equal: [future, future],
        reversed: [future + 1, future],
        'fractional iat': [0.5, future],
        'fractional exp': [0, future + 0.5],
        unsafe: [Number.MAX_SAFE_INTEGER + 1, Number.MAX_SAFE_INTEGER + 2],
        nonfinite: [0, Infinity],
      };
      const [iat, exp] = intervals[fault]!;
      currentSeats(m, (p) => ({
        ...p,
        session: {
          ...p.session,
          issuedAtEpochSeconds: iat,
          expiresAtEpochSeconds: exp,
        },
      }));
      m.adapter.configure(m.config);
      expect(await m.adapter.bindCurrentView()).toBe(false);
      expect(m.f.f.calls).toHaveLength(0);
    },
  );
  it('accepts nonnegative epoch-zero iat with a current valid expiry', async () => {
    const m = mount();
    currentSeats(m, (p) => ({
      ...p,
      session: { ...p.session, issuedAtEpochSeconds: 0 },
    }));
    m.adapter.configure(m.config);
    expect(await m.adapter.bindCurrentView()).toBe(true);
  });
  it('rejects an already expired otherwise valid JWT while provider is current', async () => {
    const m = mount();
    currentSeats(m, (p) => ({
      ...p,
      session: {
        ...p.session,
        expiresAtEpochSeconds: Math.floor(Date.now() / 1000),
      },
    }));
    m.adapter.configure(m.config);
    expect(await m.adapter.bindCurrentView()).toBe(false);
    expect(m.f.f.calls).toHaveLength(0);
  });
  it.each([-1, 1])(
    'a silently changed provider expiry %+s is not overwritten or extended by JWT expiry',
    async (delta) => {
      const m = mount();
      currentSeats(m, (p) => ({
        ...p,
        session: {
          ...p.session,
          expiresAtEpochSeconds: p.session.expiresAtEpochSeconds + 60,
        },
      }));
      const captured = m.auth.currentSession()!;
      m.adapter.configure(m.config);
      expect(await m.adapter.bindCurrentView()).toBe(true);
      vi.spyOn(m.auth, 'currentSession').mockReturnValue({
        ...captured,
        expiresAtEpochSeconds: captured.expiresAtEpochSeconds + delta,
      });
      expect(m.adapter.getState().status).toBe('BLOCKED');
      expect(m.office.getState().status).toBe('MISSING');
    },
  );
  it('iat is issuance rather than bind-now; no new clock-skew policy', async () => {
    vi.useFakeTimers();
    const m = mount(),
      now = Math.floor(Date.now() / 1000);
    currentSeats(m, (p) => ({
      ...p,
      session: {
        ...p.session,
        issuedAtEpochSeconds: now + 1,
        expiresAtEpochSeconds: now + 20,
      },
    }));
    m.adapter.configure(m.config);
    expect(await m.adapter.bindCurrentView()).toBe(true);
  });
  it.each([20, 60, 120])(
    'JWT expiry +%ss may differ from provider +60s; earlier one retires without polling',
    async (seconds) => {
      vi.useFakeTimers();
      const m = mount(),
        now = Math.floor(Date.now() / 1000);
      currentSeats(m, (p) => ({
        ...p,
        session: { ...p.session, expiresAtEpochSeconds: now + seconds },
      }));
      m.adapter.configure(m.config);
      expect(await m.adapter.bindCurrentView()).toBe(true);
      await vi.advanceTimersByTimeAsync(Math.min(seconds, 60) * 1000 + 1);
      expect(m.host.getState().status).toBe('NOT_CONNECTED');
      expect(m.office.getState().status).toBe('MISSING');
    },
  );
  it.each(['JWT', 'provider'] as const)(
    '%s earlier expiry cancels pending authenticated readback',
    async (earlier) => {
      vi.useFakeTimers();
      const m = mount(),
        now = Math.floor(Date.now() / 1000);
      if (earlier === 'provider')
        m.changeAuth({
          ...m.auth.currentSession()!,
          expiresAtEpochSeconds: now + 3,
        });
      currentSeats(m, (p) => ({
        ...p,
        session: {
          ...p.session,
          expiresAtEpochSeconds: now + (earlier === 'JWT' ? 3 : 60),
        },
      }));
      let release: () => void = () => undefined;
      const fetcher = vi.fn<typeof fetch>(
        (input, init) =>
          new Promise((resolve) => {
            release = () => {
              void m.f.f.fetcher(input, init).then(resolve);
            };
          }),
      );
      vi.stubGlobal('fetch', fetcher);
      m.adapter.configure(m.config);
      const pending = m.adapter.bindCurrentView();
      for (let i = 0; i < 20; i++) await Promise.resolve();
      expect(fetcher).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(3001);
      expect(await pending).toBe(false);
      release();
      for (let i = 0; i < 20; i++) await Promise.resolve();
      expect(m.host.getState().status).toBe('NOT_CONNECTED');
    },
  );
  it.each(['DENIED', 'OLDER', 'REVISION', 'UNAVAILABLE'])(
    'separate readback %s refuses host connection',
    async (failure) => {
      const m = mount();
      currentSeats(m, (p) => {
        if (failure === 'OLDER')
          Object.assign(p.bindings[0]!.readback, {
            worldVersion: '3',
            eventSequence: '3',
          });
        return p;
      });
      if (failure !== 'OLDER')
        vi.stubGlobal(
          'fetch',
          async (
            input: Parameters<typeof fetch>[0],
            init: Parameters<typeof fetch>[1],
          ) => {
            if (failure === 'DENIED')
              return new Response(null, { status: 403 });
            if (failure === 'UNAVAILABLE')
              return new Response(null, { status: 503 });
            const response = await m.f.f.fetcher(input, init),
              body = await response.json();
            body.authority.identity.authorizationRevision = 'OTHER_REVISION';
            return Response.json(body);
          },
        );
      m.adapter.configure(m.config);
      expect(await m.adapter.bindCurrentView()).toBe(false);
      expect(m.host.getState().status).toBe('NOT_CONNECTED');
    },
  );
  it('allows a legitimate authenticated head advance after current-seat', async () => {
    const m = mount();
    currentSeats(m);
    vi.stubGlobal(
      'fetch',
      async (
        input: Parameters<typeof fetch>[0],
        init: Parameters<typeof fetch>[1],
      ) => {
        const response = await m.f.f.fetcher(input, init),
          body = await response.json();
        body.authority.readback.worldVersion = '3';
        body.authority.readback.eventSequence = '3';
        body.result.data.watermark.worldVersion = '3';
        body.result.data.watermark.eventSequence = '3';
        return Response.json(body);
      },
    );
    m.adapter.configure(m.config);
    expect(await m.adapter.bindCurrentView()).toBe(true);
    expect(m.f.commands).toHaveLength(0);
  });
  it('stale current-seat completion cannot retire or revive a newer explicit binding', async () => {
    const m = mount();
    let release: (p: CurrentSeatSuccess) => void = () => undefined,
      firstId = '';
    m.seats.readSeat.mockImplementationOnce(
      ({ requestId }) =>
        new Promise((resolve) => {
          firstId = requestId;
          release = resolve;
        }),
    );
    currentSeats(m);
    m.adapter.configure(m.config);
    const first = m.adapter.bindCurrentView();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(firstId).not.toBe('');
    m.adapter.disconnect();
    expect(await m.adapter.bindCurrentView()).toBe(true);
    release(currentSeatPacket(m, firstId));
    expect(await first).toBe(false);
    expect(m.host.getState().status).toBe('SESSION_CONFIGURED');
  });
});
