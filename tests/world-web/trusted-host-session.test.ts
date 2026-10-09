import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  installTrustedHost,
  type TrustedHostBinding,
  type TrustedHostTargets,
} from '../../apps/world-web/src/trusted-host/bootstrap.js';
import { createOfficeProjectionController } from '../../apps/world-web/src/office-projection/controller.js';
import { installOfficeProjection } from '../../apps/world-web/src/office-projection/view.js';
import { createFinancialIntakeController } from '../../apps/world-web/src/financial-intake/controller.js';
import { installFinancialIntake } from '../../apps/world-web/src/financial-intake/view.js';
import { createProductionReadClient } from '../../apps/world-web/src/production-read/client.js';
import {
  officeProjectionRoles,
  type OfficeRole,
} from '../../apps/world-web/src/office-projection/model.js';
import { financialIntakeFixture } from './financial-intake-fixture.js';
import { HostDocument, type HostElement } from './trusted-host-dom.js';
import { exactJson } from '../../apps/world-web/src/country-runtime/staged-reservation-client.js';

const requestId = () => '11111111-1111-4111-8111-111111111111';
afterEach(() => vi.unstubAllGlobals());

function mount(role: OfficeRole = 'finance') {
  const fixture = financialIntakeFixture(
    role,
    role === 'finance' ? 'SIGN_BUYER_FINANCE' : 'ENQUEUE',
  );
  const doc = new HostDocument(role),
    mutations: (() => void)[] = [];
  const events = new Map<string, (() => void)[]>();
  vi.stubGlobal(
    'MutationObserver',
    class {
      constructor(fn: () => void) {
        mutations.push(fn);
      }
      observe() {}
    },
  );
  const document = doc as unknown as Document;
  const window = {
    addEventListener(key: string, fn: () => void) {
      events.set(key, [...(events.get(key) ?? []), fn]);
    },
  } as unknown as Window;
  let transport: typeof fetch = (input, init) => {
    return new URL(String(input)).pathname === fixture.binding.endpoint.path
      ? fixture.fetcher(input, init)
      : fixture.f.fetcher(input, init);
  };
  const fetcher: typeof fetch = (input, init) => transport(input, init);
  const projection = installOfficeProjection(
    document,
    window,
    (binding, view) =>
      createOfficeProjectionController(
        binding,
        view,
        (config) => createProductionReadClient(config, { fetcher }),
        requestId,
      ),
  );
  const financial = installFinancialIntake(document, window, (binding, view) =>
    createFinancialIntakeController(binding, view, {
      fetcher,
      readFactory: (config) => createProductionReadClient(config, { fetcher }),
      requestId,
    }),
  );
  const localTrade = { disconnect: vi.fn() };
  const api = installTrustedHost(document, window, {
    projection,
    financial,
    localTrade,
  });
  const targets: TrustedHostTargets = {
    read: fixture.f.config.endpoints,
    financial: fixture.binding.endpoint,
  };
  const binding: TrustedHostBinding = {
    projection: fixture.f.binding,
    financial: fixture.binding,
  };
  const drawer = (kind: 'officeProjection' | 'financialIntake') => {
    const trigger = doc.tools
      .all()
      .find((el) => Object.hasOwn(el.dataset, `${kind}Entry`))!;
    trigger.click();
    return doc.root
      .all()
      .find((el) => Object.hasOwn(el.dataset, `${kind}Dialog`))!;
  };
  const action = (
    surface: HostElement,
    key: string,
    kind = 'officeReadAction',
  ) => {
    const element = surface.all().find((el) => el.dataset[kind] === key);
    if (!element) throw Error(`Missing real view action ${key}`);
    element.click();
  };
  return {
    fixture,
    doc,
    api,
    projection,
    financial,
    localTrade,
    targets,
    binding,
    drawer,
    action,
    transport: (fn: typeof fetch) => {
      transport = fn;
    },
    mutation: () => {
      for (const fn of mutations) fn();
    },
    pagehide: () => {
      for (const fn of events.get('pagehide') ?? []) fn();
    },
    connect: (financial = true) => {
      expect(api.configureTargets(targets)).toBe(true);
      return api.connect(
        financial ? binding : { projection: binding.projection },
      );
    },
  };
}
async function read(m: ReturnType<typeof mount>) {
  const drawer = m.drawer('officeProjection');
  m.action(drawer, 'refresh');
  await expect.poll(() => m.projection.getState().status).toBe('CURRENT');
  return drawer;
}
function cleared(m: ReturnType<typeof mount>) {
  expect(m.api.getState().status).toBe('NOT_CONNECTED');
  expect(m.projection.getState()).toMatchObject({
    model: null,
    receipt: null,
    canRead: false,
  });
  expect(m.financial.getState()).toMatchObject({
    request: null,
    read: null,
    canSubmit: false,
    canRetry: false,
  });
  expect(m.doc.body.textContent).not.toContain('9007199254740993.25');
  expect(m.doc.body.textContent).not.toContain('TEST_COMMAND');
}

describe('SOURCE_ONLY shared explicit host / actual shipped consumers / OFFLINE TEST_ONLY', () => {
  it('mounts disconnected; no implicit targets/binding/discovery or requests', () => {
    const m = mount();
    expect(m.api.connect(null)).toBe(false);
    expect(m.api.connect(m.binding)).toBe(false);
    expect(m.api.configureTargets(m.targets)).toBe(true);
    expect(m.api.connect(null)).toBe(false);
    cleared(m);
    expect(m.fixture.f.calls).toHaveLength(0);
    expect(m.fixture.calls).toHaveLength(0);
  });
  it.each([
    'target',
    'pins',
    'seat',
    'session',
    'view',
    'identity',
    'financial-endpoint',
    'original-id',
    'original-missing',
    'financial-session',
  ])(
    'rejects incomplete/mismatched %s before dispatch and leaves both disconnected',
    (fault) => {
      const m = mount();
      expect(m.api.configureTargets(m.targets)).toBe(true);
      const p = m.binding.projection,
        f = m.binding.financial!;
      let binding = m.binding;
      if (fault === 'target')
        binding = {
          projection: {
            ...p,
            read: {
              ...p.read,
              endpoints: {
                ...p.read.endpoints,
                origin: 'https://unconfigured.example.invalid',
              },
            },
          },
        };
      if (fault === 'pins')
        binding = {
          projection: {
            ...p,
            read: { ...p.read, world: { ...p.read.world, admissionRef: '' } },
          },
        };
      if (fault === 'seat')
        binding = { projection: { ...p, read: { ...p.read, seatRef: '' } } };
      if (fault === 'session') {
        m.fixture.f.invalidate();
      }
      if (fault === 'view')
        binding = { projection: { ...p, view: { ...p.view, role: 'trade' } } };
      if (fault === 'identity')
        binding = {
          projection: {
            ...p,
            read: { ...p.read, currentIdentity: () => null },
          },
        };
      if (fault === 'financial-endpoint')
        binding = {
          projection: p,
          financial: {
            ...f,
            endpoint: {
              ...f.endpoint,
              origin: 'https://unconfigured.example.invalid',
            },
          },
        };
      if (fault === 'original-id')
        binding = {
          projection: p,
          financial: {
            ...f,
            request: {
              ...f.request,
              request: { ...f.request.request, commandId: '' },
            },
          },
        };
      if (fault === 'original-missing')
        binding = {
          projection: p,
          financial: { ...f, request: undefined } as unknown as typeof f,
        };
      if (fault === 'financial-session')
        binding = {
          projection: p,
          financial: {
            ...f,
            read: {
              ...f.read,
              session: { ...f.read.session, sessionRef: 'OTHER' },
            },
          },
        };
      expect(m.api.connect(binding)).toBe(false);
      cleared(m);
      expect(m.fixture.f.calls).toHaveLength(0);
      expect(m.fixture.calls).toHaveLength(0);
    },
  );
  it('pins target policy once and copies it; strings do not establish server binding', () => {
    const m = mount();
    expect(m.api.configureTargets(m.targets)).toBe(true);
    expect(m.api.connect(m.binding)).toBe(true);
    expect(m.api.getState()).toMatchObject({
      mode: 'SOURCE_ONLY',
      status: 'SESSION_CONFIGURED',
    });
    expect(m.projection.getState().connection).toBe('NOT_CONNECTED');
    expect(m.financial.getState().connection).toBe('NOT_CONNECTED');
    expect(
      m.api.configureTargets({
        read: { ...m.targets.read, origin: 'https://other.example.invalid' },
      }),
    ).toBe(false);
    cleared(m);
    expect(m.api.connect(m.binding)).toBe(false);
    expect(m.fixture.f.calls).toHaveLength(0);
  });
  it.each(Object.keys(officeProjectionRoles) as OfficeRole[])(
    '%s uses actual read/controller/view only; does not create a financial draft or local Trade binding',
    async (role) => {
      const m = mount(role);
      expect(m.connect(false)).toBe(true);
      expect(m.fixture.f.calls).toHaveLength(0);
      const surface = await read(m);
      expect(m.projection.getState().connection).toBe('READ_ONLY_BOUND');
      expect(surface.textContent).toContain('Source head');
      expect(
        m.projection
          .getState()
          .model?.missing.every(
            (field) => field.code === 'ROLE_FIELD_NOT_PROJECTED',
          ),
      ).toBe(true);
      expect(m.financial.getState().request).toBeNull();
      expect(m.fixture.calls).toHaveLength(0);
      expect(m.localTrade.disconnect).toHaveBeenCalled();
      m.api.disconnect();
    },
  );
  it('accepts separately pinned origins, consumes exact original without automatic INSPECT/submit/replay', async () => {
    const m = mount('trade');
    Object.assign(m.fixture.binding.endpoint, {
      origin: 'https://intake.example.invalid',
      deploymentRef: 'TEST_INTAKE_DEPLOYMENT',
    });
    const original = JSON.stringify(m.binding.financial!.request);
    expect(m.connect()).toBe(true);
    expect(m.fixture.calls).toHaveLength(0);
    const surface = m.drawer('financialIntake');
    m.action(surface, 'inspect', 'financialAction');
    await expect.poll(() => m.financial.getState().canReview).toBe(true);
    expect(m.financial.getState().request).toEqual(JSON.parse(original));
    expect(m.financial.getState().canSubmit).toBe(false);
    expect(m.fixture.calls).toHaveLength(1);
    expect(new URL(m.fixture.calls[0]!.url).origin).toBe(
      'https://intake.example.invalid',
    );
    expect(
      m.fixture.calls.map((call) => JSON.parse(call.body).request.action),
    ).toEqual(['INSPECT']);
    m.api.disconnect();
  });
  it.each(['host', 'country', 'role', 'identity', 'pagehide'] as const)(
    '%s loss clears actual private DOM/state and prohibits old-session ABA reconnect',
    async (loss) => {
      const m = mount();
      let identity = m.fixture.f.config.identity as
        typeof m.fixture.f.config.identity | null;
      Object.assign(m.fixture.f.config, { currentIdentity: () => identity });
      expect(m.connect()).toBe(true);
      const surface = await read(m);
      m.drawer('financialIntake');
      expect(surface.textContent).toContain('9007199254740993.25');
      if (loss === 'host') m.fixture.f.invalidate();
      if (loss === 'country') {
        m.doc.root.dataset.country = '02';
        m.mutation();
      }
      if (loss === 'role') {
        m.doc.root.dataset.office = 'trade';
        m.mutation();
      }
      if (loss === 'identity') {
        identity = null;
        m.api.getState();
      }
      if (loss === 'pagehide') m.pagehide();
      cleared(m);
      identity = m.fixture.f.config.identity;
      Object.assign(m.doc.root.dataset, { country: '01', office: 'finance' });
      m.mutation();
      expect(m.api.connect(m.binding)).toBe(false);
      cleared(m);
    },
  );
  it.each(['projection', 'financial'] as const)(
    'real %s HTTP DENIED broadcasts shared retirement, clearing both consumers and DOM',
    async (consumer) => {
      const m = mount();
      expect(m.connect()).toBe(true);
      const p = await read(m),
        f = m.drawer('financialIntake');
      expect(p.textContent).toContain('9007199254740993.25');
      expect(f.textContent).toContain('TEST_COMMAND');
      m.transport(async () => new Response(null, { status: 403 }));
      if (consumer === 'projection') m.action(p, 'refresh');
      else m.action(f, 'inspect', 'financialAction');
      // Do not poll the host API: the real view's subscription must broadcast
      // DENIED itself and clear the other consumer without an extra host read.
      if (consumer === 'projection')
        await expect.poll(() => m.financial.getState().request).toBeNull();
      else await expect.poll(() => m.projection.getState().model).toBeNull();
      expect(m.api.getState().reason).toBe('DENIED');
      cleared(m);
    },
  );
  it('invalid server authority never establishes read binding, even with configured target/seat strings', async () => {
    const m = mount();
    expect(m.connect()).toBe(true);
    m.transport(async () =>
      Response.json({
        schemaVersion: 'world-authorized-read-binding-v1',
        ok: true,
      }),
    );
    const surface = m.drawer('officeProjection');
    m.action(surface, 'refresh');
    await expect.poll(() => m.projection.getState().status).toBe('UNAVAILABLE');
    expect(m.projection.getState()).toMatchObject({
      connection: 'NOT_CONNECTED',
      model: null,
    });
    m.api.disconnect();
  });
  it.each(['token', 'response', 'body'] as const)(
    'retires a late %s with real client fences; new explicit session survives old completion',
    async (stage) => {
      const m = mount();
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let entered = false;
      if (stage === 'token')
        Object.assign(m.fixture.f.config, {
          getAccessToken: async () => {
            entered = true;
            await gate;
            return 'TEST_ONLY_TOKEN';
          },
        });
      else
        m.transport(async (input, init) => {
          const response = await m.fixture.f.fetcher(input, init);
          entered = true;
          if (stage === 'response') {
            await gate;
            return response;
          }
          const bytes = new TextEncoder().encode(await response.text());
          return new Response(
            new ReadableStream({
              async start(controller) {
                await gate;
                controller.enqueue(bytes);
                controller.close();
              },
            }),
            { headers: { 'content-type': 'application/json' } },
          );
        });
      expect(m.connect(false)).toBe(true);
      const surface = m.drawer('officeProjection');
      m.action(surface, 'refresh');
      await expect.poll(() => entered).toBe(true);
      m.api.disconnect();
      cleared(m);
      const readConfig = m.fixture.f.config;
      const replacement = {
        projection: {
          ...m.binding.projection,
          read: {
            ...readConfig,
            getAccessToken: async () => 'TEST_ONLY_TOKEN',
            session: {
              ...readConfig.session,
              sessionRef: 'NEW_EXPLICIT_SESSION',
            },
          },
        },
      };
      expect(m.api.connect(replacement)).toBe(true);
      release();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(m.api.getState().status).toBe('SESSION_CONFIGURED');
      expect(m.projection.getState()).toMatchObject({
        status: 'READY_TO_READ',
        model: null,
      });
      expect(m.doc.body.textContent).not.toContain('9007199254740993.25');
      if (stage === 'token') expect(m.fixture.f.calls).toHaveLength(0);
      m.api.disconnect();
    },
  );
  it('missing token at actual read clears the financial original before any network request', async () => {
    const m = mount();
    Object.assign(m.fixture.f.config, { getAccessToken: async () => null });
    expect(m.connect()).toBe(true);
    const surface = m.drawer('officeProjection');
    m.drawer('financialIntake');
    m.action(surface, 'refresh');
    await expect.poll(() => m.api.getState().status).toBe('NOT_CONNECTED');
    cleared(m);
    expect(m.fixture.f.calls).toHaveLength(0);
    expect(m.fixture.calls).toHaveLength(0);
  });
  it('shared retirement clears both CLOSED additive drawers, including hidden original references', async () => {
    const m = mount();
    expect(m.connect()).toBe(true);
    const p = await read(m),
      f = m.drawer('financialIntake');
    expect(f.textContent).toContain('TEST_COMMAND');
    p.close();
    f.close();
    m.fixture.f.invalidate();
    cleared(m);
    expect(p.children).toHaveLength(0);
    expect(f.children).toHaveLength(0);
  });
  it('real financial FINAL read denial broadcasts without polling host state', async () => {
    const m = mount();
    expect(m.connect()).toBe(true);
    await read(m);
    const f = m.drawer('financialIntake');
    m.action(f, 'final', 'financialAction');
    await expect
      .poll(() => m.financial.getState().read?.receipt?.outcome)
      .toBe('COMMITTED');
    m.transport(async () => new Response(null, { status: 401 }));
    m.action(f, 'final', 'financialAction');
    await expect.poll(() => m.projection.getState().model).toBeNull();
    cleared(m);
  });
  it('original UNKNOWN is never replayed by shared wiring; explicit reinspection keeps exact request', async () => {
    const m = mount('trade');
    const original = exactJson(m.binding.financial!.request);
    expect(m.connect()).toBe(true);
    const f = m.drawer('financialIntake');
    m.action(f, 'inspect', 'financialAction');
    await expect.poll(() => m.financial.getState().canReview).toBe(true);
    const review = f
      .all()
      .find((el) => el.dataset.financialAction === 'review')!;
    review.checked = true;
    review.listeners.get('change')?.();
    m.fixture.setReply({ status: 503, state: { status: 'UNKNOWN' } });
    m.action(f, 'submit', 'financialAction');
    await expect.poll(() => m.financial.getState().status).toBe('UNKNOWN');
    expect(m.fixture.calls).toHaveLength(2);
    expect(m.fixture.calls[1]!.body).toBe(original);
    m.api.getState();
    m.mutation();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(m.fixture.calls).toHaveLength(2);
    expect(m.financial.getState().canRetry).toBe(false);
    m.action(f, 'inspect', 'financialAction');
    await expect.poll(() => m.financial.getState().canReview).toBe(true);
    expect(exactJson(m.financial.getState().request)).toBe(original);
    expect(m.fixture.calls).toHaveLength(3);
    m.api.disconnect();
  });
  it('late dispatched intake completion cannot restore original request after role loss', async () => {
    const m = mount('trade');
    expect(m.connect()).toBe(true);
    const f = m.drawer('financialIntake');
    m.action(f, 'inspect', 'financialAction');
    await expect.poll(() => m.financial.getState().canReview).toBe(true);
    const review = f
      .all()
      .find((el) => el.dataset.financialAction === 'review')!;
    review.checked = true;
    review.listeners.get('change')?.();
    let release: () => void = () => undefined,
      entered = false;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    m.transport(async (input, init) => {
      const response = await m.fixture.fetcher(input, init);
      entered = true;
      await gate;
      return response;
    });
    m.action(f, 'submit', 'financialAction');
    await expect.poll(() => entered).toBe(true);
    m.doc.root.dataset.office = 'finance';
    m.mutation();
    cleared(m);
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    cleared(m);
    expect(m.fixture.calls).toHaveLength(2);
  });
});
