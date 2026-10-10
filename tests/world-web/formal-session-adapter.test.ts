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
