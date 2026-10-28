import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOfficeCommandController } from '../../apps/world-web/src/office-command/controller.js';
import { installOfficeCommand } from '../../apps/world-web/src/office-command/view.js';
import { officeCommandFixture } from './office-command-fixture.js';
import { HostDocument, HostElement } from './trusted-host-dom.js';
import type { OfficeRole } from '../../apps/world-web/src/office-projection/model.js';

// OFFLINE TEST_ONLY observation adapter over the existing DOM double. Real
// shipped controller/client/view execute; this is not native browser/auth E2E.
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function setup(role: OfficeRole = 'captain') {
  const f = officeCommandFixture(role),
    doc = new HostDocument(role);
  const mutations: (() => void)[] = [],
    hostEvents = new Map<string, () => void>();
  const controllers: ReturnType<typeof createOfficeCommandController>[] = [];
  let transport = f.fetcher,
    requestId = f.request.requestId;
  vi.stubGlobal(
    'MutationObserver',
    class {
      constructor(fn: () => void) {
        mutations.push(fn);
      }
      observe() {}
    },
  );
  const api = installOfficeCommand(
    doc as unknown as Document,
    {
      addEventListener: (name: string, fn: () => void) =>
        hostEvents.set(name, fn),
    } as unknown as Window,
    (binding, view) => {
      const currentTransport = transport,
        id = requestId;
      const c = createOfficeCommandController(binding, view, {
        fetcher: currentTransport,
        requestId: () => id,
      });
      controllers.push(c);
      return c;
    },
  );
  const find = (key: string, within: HostElement = doc.body) =>
    within.all().find((el) => el.dataset.officeCommandAction === key);
  function click(key: string) {
    const el = find(key);
    if (!el) throw new Error('OFFLINE_MISSING_ACTION_' + key);
    el.click();
  }
  const dialog = () =>
    doc.body
      .all()
      .find((el) => Object.hasOwn(el.dataset, 'officeCommandDialog'));
  function open() {
    click('open');
    return dialog()!;
  }
  function connect(next = f, binding = next.binding) {
    transport = next.fetcher;
    requestId = next.request.requestId;
    return api.connect(binding);
  }
  function replaceRoot() {
    const old = doc.root;
    old.remove();
    const next = new HostElement('main', doc),
      tools = new HostElement('nav', doc);
    Object.assign(next.dataset, old.dataset);
    next.append(tools);
    doc.body.append(next);
    // Same attributes, a different real node identity; no fixture authority changes.
    Object.defineProperty(doc, 'root', { value: next, configurable: true });
    Object.defineProperty(doc, 'tools', { value: tools, configurable: true });
    return old;
  }
  return {
    f,
    doc,
    api,
    controllers,
    connect,
    find,
    click,
    dialog,
    open,
    replaceRoot,
    flush: () => mutations.forEach((fn) => fn()),
    pagehide: () => hostEvents.get('pagehide')?.(),
  };
}
function privateNodes(doc: HostDocument) {
  return doc.body
    .all()
    .filter(
      (el) =>
        Object.hasOwn(el.dataset, 'officeCommandEntry') ||
        Object.hasOwn(el.dataset, 'officeCommandDialog') ||
        el.tag === 'textarea' ||
        el.tag === 'input' ||
        el.attributes.get('role') === 'status',
    );
}
function draft(s: ReturnType<typeof setup>) {
  return s
    .dialog()!
    .all()
    .find((el) =>
      Object.hasOwn(el.dataset, 'officeCommandDraft'),
    )! as HostElement & { value: string };
}
async function refresh(s: ReturnType<typeof setup>) {
  s.click('refresh');
  await expect.poll(() => s.api.getState().canRead).toBe(true);
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('W1 Office private DOM lifecycle / shipped view and bounded transport', () => {
  it('unbound public install and repeated observer reconciliation have no private DOM or network', () => {
    const s = setup();
    for (let i = 0; i < 8; i++) s.flush();
    expect(privateNodes(s.doc)).toEqual([]);
    expect(s.api.getState()).toMatchObject({
      status: 'MISSING',
      lastAuthorizedReadAtClient: null,
    });
    expect(s.f.f.calls).toHaveLength(0);
    expect(s.f.commands).toHaveLength(0);
  });
  it.each(['industry', 'trade'] as const)(
    'unsupported %s creates no private shell',
    (role) => {
      const s = setup(role);
      expect(s.connect()).toBe('MISSING');
      s.flush();
      expect(privateNodes(s.doc)).toEqual([]);
      expect(s.f.f.calls).toHaveLength(0);
      expect(s.f.commands).toHaveLength(0);
    },
  );
  it('Finance transport mounts only after a trusted binding and performs no automatic request', () => {
    const s = setup('finance');
    expect(s.connect()).toBe('READY_TO_READ');
    s.flush();
    expect(privateNodes(s.doc).length).toBeGreaterThan(0);
    expect(s.f.f.calls).toHaveLength(0);
    expect(s.f.commands).toHaveLength(0);
  });
  it('invalid binding is missing with no private accessibility controls or dispatch', () => {
    const s = setup();
    s.connect(s.f, {
      ...s.f.binding,
      endpoint: { ...s.f.endpoint, deploymentRef: '' },
    });
    expect(privateNodes(s.doc)).toEqual([]);
    expect(s.f.f.calls).toHaveLength(0);
  });
  it('trusted current connect on unchanged root mounts once without automatic read', () => {
    const s = setup(),
      root = s.doc.root;
    expect(s.connect()).toBe('READY_TO_READ');
    for (let i = 0; i < 10; i++) s.flush();
    expect(s.doc.root).toBe(root);
    expect(
      s.doc.body
        .all()
        .filter((el) => Object.hasOwn(el.dataset, 'officeCommandEntry')),
    ).toHaveLength(1);
    expect(
      s.doc.body
        .all()
        .filter((el) => Object.hasOwn(el.dataset, 'officeCommandDialog')),
    ).toHaveLength(1);
    expect(s.f.f.calls).toHaveLength(0);
    s.open();
    expect(s.dialog()!.textContent).toContain('Manual refresh');
  });
  it('successful read alone sets client display time; failed refresh preserves only historical time', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-13T08:00:00.000Z'));
    const s = setup();
    s.connect();
    s.open();
    expect(s.api.getState().lastAuthorizedReadAtClient).toBeNull();
    await refresh(s);
    expect(s.api.getState()).toMatchObject({
      status: 'CURRENT',
      lastAuthorizedReadAtClient: '2026-10-13T08:00:00.000Z',
      completion: false,
    });
    expect(s.dialog()!.textContent).toContain(
      'Last read on this device: 2026-10-13T08:00:00.000Z',
    );
    s.f.reads(async () => new Response(null, { status: 503 }));
    await refresh(s);
    expect(s.api.getState()).toMatchObject({
      status: 'UNAVAILABLE',
      model: null,
      lastAuthorizedReadAtClient: '2026-10-13T08:00:00.000Z',
      canStage: false,
      canConfirm: false,
    });
    expect(s.dialog()!.textContent).toContain('Previous successful read');
    expect(s.dialog()!.textContent).not.toContain('Last read on this device');
    expect(s.find('refresh')!.disabled).toBe(false);
  });
  it('invalid browser wall clock leaves metadata null without inventing source time', async () => {
    const OriginalDate = Date;
    vi.stubGlobal(
      'Date',
      class extends OriginalDate {
        constructor(value?: string | number) {
          super(value === undefined ? NaN : value);
        }
      },
    );
    const s = setup();
    s.connect();
    s.open();
    await refresh(s);
    expect(s.api.getState()).toMatchObject({
      status: 'CURRENT',
      lastAuthorizedReadAtClient: null,
    });
    expect(s.dialog()!.textContent).not.toContain('Last read on this device');
  });
  it.each([
    'session',
    'revision',
    'country',
    'office',
    'denied',
    'pagehide',
  ] as const)(
    '%s retirement wipes current and retained private nodes',
    async (fault) => {
      const s = setup();
      s.connect();
      s.open();
      await refresh(s);
      draft(s).value = JSON.stringify(s.f.request);
      s.click('stage');
      const surface = s.dialog()!,
        retained = surface.all(),
        saved = draft(s);
      expect(saved.value).toContain('TEST_COMMAND');
      const entry = s.find('open')!,
        focus = vi.spyOn(entry, 'focus');
      if (fault === 'session') s.f.f.invalidate();
      if (fault === 'revision') {
        Object.assign(s.f.binding.read.identity, {
          authorizationRevision: 'TEST_REPLACED_REVISION',
        });
        s.flush();
      }
      if (fault === 'country') {
        s.doc.root.dataset.country = '02';
        s.flush();
      }
      if (fault === 'office') {
        s.doc.root.dataset.office = 'social';
        s.flush();
      }
      if (fault === 'denied') {
        s.f.reads(async () => new Response(null, { status: 403 }));
        s.click('refresh');
        await expect.poll(() => s.api.getState().status).toBe('DENIED');
      }
      if (fault === 'pagehide') s.pagehide();
      expect(privateNodes(s.doc)).toEqual([]);
      expect(saved.value).toBe('');
      expect(surface.textContent).toBe('');
      for (const node of retained) expect(node.textContent).toBe('');
      expect(focus).not.toHaveBeenCalled();
      expect(s.api.getState()).toMatchObject({
        model: null,
        intent: null,
        receipt: null,
        lastAuthorizedReadAtClient: null,
      });
    },
  );
  it('same-attribute root replacement retires old controller and requires a fresh connect', async () => {
    const s = setup();
    s.connect();
    s.open();
    await refresh(s);
    const old = s.controllers.at(-1)!,
      oldDialog = s.dialog()!;
    const oldRoot = s.replaceRoot();
    // A pending completion/getState must also see object replacement before observer flush.
    expect(old.getState().status).toBe('MISSING');
    s.flush();
    expect(oldRoot.dataset).toEqual(s.doc.root.dataset);
    expect(privateNodes(s.doc)).toEqual([]);
    expect(oldDialog.textContent).toBe('');
    const next = officeCommandFixture();
    s.connect(next);
    s.open();
    await refresh(s);
    expect(s.api.getState().status).toBe('CURRENT');
    expect(
      s.doc.body
        .all()
        .filter((el) => Object.hasOwn(el.dataset, 'officeCommandEntry')),
    ).toHaveLength(1);
  });
  it('detached old enabled handlers cannot refresh, confirm or close the fresh binding', async () => {
    const s = setup();
    s.connect();
    s.open();
    await refresh(s);
    const oldDraft = draft(s);
    oldDraft.value = JSON.stringify(s.f.request);
    s.click('stage');
    s.click('review');
    const oldConfirm = s.find('confirm')!,
      oldRefresh = s.find('refresh')!,
      oldClose = s.find('close')!;
    expect(oldConfirm.disabled).toBe(false);
    s.api.disconnect();
    expect(oldDraft.value).toBe('');
    const next = officeCommandFixture();
    s.connect(next);
    s.open();
    await refresh(s);
    draft(s).value = JSON.stringify(next.request);
    s.click('stage');
    s.click('review');
    expect(s.api.getState().canConfirm).toBe(true);
    const reads = next.f.calls.length;
    oldConfirm.click();
    oldRefresh.click();
    oldClose.click();
    await Promise.resolve();
    expect(next.commands).toHaveLength(0);
    expect(next.f.calls).toHaveLength(reads);
    expect(s.dialog()!.open).toBe(true);
    expect(s.api.getState().status).toBe('REVIEWED');
  });
  it('UNKNOWN fingerprint input is explicitly wiped on retirement without replay', async () => {
    const s = setup();
    s.connect();
    s.open();
    await refresh(s);
    draft(s).value = JSON.stringify(s.f.request);
    s.click('stage');
    s.click('review');
    s.f.submit(async () => {
      throw new Error('OFFLINE_LOST_ACK');
    });
    s.click('confirm');
    await expect.poll(() => s.api.getState().status).toBe('UNKNOWN');
    const fingerprint = s
      .dialog()!
      .all()
      .find((el) => el.tag === 'input')! as HostElement & { value: string };
    fingerprint.value = s.f.f.lookup.commandFingerprint;
    s.f.f.invalidate();
    expect(fingerprint.value).toBe('');
    expect(privateNodes(s.doc)).toEqual([]);
    expect(s.f.commands).toHaveLength(1);
  });
  it('close clears values and focuses only the connected current trigger without retiring binding', async () => {
    const s = setup();
    s.connect();
    s.open();
    await refresh(s);
    const saved = draft(s),
      entry = s.find('open')!;
    saved.value = 'PRIVATE_UNSTAGED_TEXT';
    s.click('close');
    expect(saved.value).toBe('');
    expect(s.dialog()!.textContent).toBe('');
    expect(s.doc.activeElement).toBe(entry);
    expect(s.api.getState().status).toBe('CURRENT');
    s.open();
    expect(s.dialog()!.textContent).toContain('Last read on this device');
    s.dialog()!.close();
    expect(s.dialog()!.textContent).toBe('');
  });
  it.each(['token', 'fetch', 'body'] as const)(
    'late %s after retirement cannot update time/remount or affect fresh scope',
    async (stage) => {
      const s = setup(),
        token = deferred<string>(),
        response = deferred<Response>();
      let started = false,
        savedInput: Parameters<typeof fetch>[0] | undefined,
        savedInit: RequestInit | undefined,
        releaseBody = () => undefined,
        cancelled = false;
      let binding = s.f.binding;
      if (stage === 'token')
        binding = {
          ...binding,
          read: {
            ...binding.read,
            getAccessToken: () => {
              started = true;
              return token.promise;
            },
          },
        };
      if (stage === 'fetch')
        s.f.reads((url, init) => {
          started = true;
          savedInput = url;
          savedInit = init;
          return response.promise;
        });
      if (stage === 'body')
        s.f.reads(async (url, init) => {
          const original = await s.f.f.fetcher(url, init),
            bytes = new Uint8Array(await original.arrayBuffer());
          return new Response(
            new ReadableStream<Uint8Array>({
              start(c) {
                c.enqueue(bytes.slice(0, 8));
                releaseBody = () => {
                  try {
                    c.enqueue(bytes.slice(8));
                  } catch {
                    /* original cancel already retired stream */
                  }
                };
              },
              pull() {
                started = true;
              },
              cancel() {
                cancelled = true;
              },
            }),
            { headers: { 'content-type': 'application/json' } },
          );
        });
      s.connect(s.f, binding);
      s.open();
      const old = s.controllers.at(-1)!;
      const pending = old.refresh();
      await expect.poll(() => started).toBe(true);
      await Promise.resolve();
      await Promise.resolve();
      expect(s.find('open')).toBeDefined(); // busy is not lost binding
      s.f.f.invalidate();
      expect(privateNodes(s.doc)).toEqual([]);
      const next = officeCommandFixture();
      s.connect(next);
      s.open();
      await refresh(s);
      const freshTime = s.api.getState().lastAuthorizedReadAtClient;
      if (stage === 'token') token.resolve('TEST_ONLY_TOKEN');
      if (stage === 'fetch')
        response.resolve(await s.f.f.fetcher(savedInput!, savedInit));
      if (stage === 'body') releaseBody();
      await pending;
      expect(old.getState()).toMatchObject({
        status: 'MISSING',
        model: null,
        lastAuthorizedReadAtClient: null,
      });
      expect(s.api.getState()).toMatchObject({
        status: 'CURRENT',
        lastAuthorizedReadAtClient: freshTime,
      });
      expect(next.f.calls).toHaveLength(1);
      expect(next.commands).toHaveLength(0);
      expect(
        s.doc.body
          .all()
          .filter((el) => Object.hasOwn(el.dataset, 'officeCommandEntry')),
      ).toHaveLength(1);
      if (stage === 'token') expect(s.f.f.calls).toHaveLength(0);
      if (stage === 'body') await expect.poll(() => cancelled).toBe(true);
    },
  );
});
