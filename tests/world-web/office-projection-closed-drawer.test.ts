import { afterEach, expect, it, vi } from 'vitest';
import { publishedDecisionFixture } from '../support/office-decision-result-consumer-fixture.js';
import { officeProjectionFixture } from './office-projection-fixture.js';
import {
  createOfficeProjectionController,
  type OfficeProjectionBinding,
} from '../../apps/world-web/src/office-projection/controller.js';
import { installOfficeProjection } from '../../apps/world-web/src/office-projection/view.js';
import type {
  ProductionReadPort,
  ProjectionResult,
} from '../../apps/world-web/src/production-read/client.js';

/** F's bounded real-view integration repro, ported to an owned strict-typed DOM
 * double. Calls shipped install/view/controller; not a preview or browser claim. */
class Element {
  children: Element[] = [];
  readonly dataset: Record<string, string> = {};
  readonly style: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, () => void>();
  parent: Element | null = null;
  tools: Element | null = null;
  open = false;
  private own = '';
  constructor(
    readonly tag: string,
    readonly document: DrawerDocument,
  ) {}
  set textContent(value: string) {
    this.own = value;
    this.children = [];
  }
  get textContent(): string {
    return [this.own, ...this.children.map((c) => c.textContent)].join('\n');
  }
  append(...children: Element[]) {
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
    }
  }
  replaceChildren(...children: Element[]) {
    for (const child of this.children) child.parent = null;
    this.children = [];
    this.own = '';
    this.append(...children);
  }
  setAttribute(key: string, value: string) {
    this.attributes.set(key, value);
  }
  addEventListener(key: string, callback: () => void) {
    this.listeners.set(key, callback);
  }
  click() {
    this.listeners.get('click')?.();
  }
  contains(element: Element): boolean {
    return this === element || this.children.some((c) => c.contains(element));
  }
  focus() {
    this.document.activeElement = this;
  }
  close() {
    this.open = false;
    this.deliverClose();
  }
  deliverClose() {
    this.listeners.get('close')?.();
  }
  showModal() {
    this.open = true;
  }
  remove() {
    if (this.parent)
      this.parent.children = this.parent.children.filter((c) => c !== this);
  }
  querySelector(selector: string) {
    return selector === '.national-tools' ? this.tools : null;
  }
  all(): Element[] {
    return [this, ...this.children.flatMap((c) => c.all())];
  }
}
class DrawerDocument {
  activeElement: Element | null = null;
  readonly body = new Element('body', this);
  readonly root = new Element('main', this);
  constructor() {
    Object.assign(this.root.dataset, { country: '01', office: 'captain' });
    this.root.tools = new Element('nav', this);
    this.root.append(this.root.tools);
    this.body.append(this.root);
  }
  createElement(tag: string) {
    return new Element(tag, this);
  }
  querySelector(selector: string) {
    return selector === '.country-game' ? this.root : null;
  }
}
const requestId = () => '11111111-1111-4111-8111-111111111112';
afterEach(() => vi.unstubAllGlobals());
function mount(
  binding: OfficeProjectionBinding,
  client: () => ProductionReadPort,
) {
  const doc = new DrawerDocument();
  doc.root.dataset.office = binding.view.role;
  let mutation!: () => void;
  const hostListeners = new Map<string, () => void>();
  vi.stubGlobal(
    'MutationObserver',
    class {
      constructor(callback: () => void) {
        mutation = callback;
      }
      observe() {}
    },
  );
  const ui = installOfficeProjection(
    doc as unknown as Document,
    {
      addEventListener: (key: string, listener: () => void) =>
        hostListeners.set(key, listener),
    } as unknown as Window,
    (bound, view) =>
      createOfficeProjectionController(bound, view, client, requestId),
  );
  ui.connect(binding);
  const trigger = doc.root.tools!.children[0]!;
  trigger.click();
  const drawer = doc.root.children.find((el) => el.tag === 'dialog')!;
  const action = (name: string) => {
    const button = drawer
      .all()
      .find((el) => el.dataset.officeReadAction === name);
    if (!button) throw Error(`Missing shipped drawer action ${name}`);
    button.click();
  };
  return {
    ui,
    doc,
    trigger,
    drawer,
    action,
    mutation,
    pagehide: () => hostListeners.get('pagehide')?.(),
  };
}
async function current(m: ReturnType<typeof mount>) {
  m.action('refresh');
  await expect.poll(() => m.ui.getState().status).toBe('CURRENT');
  expect(m.drawer.textContent).toContain('COMMAND_TEST_RESULT');
  expect(m.drawer.textContent).toContain('11.5 political_capital');
  expect(m.drawer.textContent).toContain('World v1 / event 1');
}
function cleared(m: ReturnType<typeof mount>) {
  expect(m.drawer.children).toHaveLength(0);
  for (const privateValue of [
    'COMMAND_TEST_RESULT',
    '11.5 political_capital',
    'EVENT_COMMAND_TEST_RESULT',
    'sha256:',
    'TEST_READBACK',
    'TEST_COMMAND',
    '9007199254740993.25',
  ])
    expect(m.doc.body.textContent).not.toContain(privateValue);
}

it.each([
  'session-revocation',
  'explicit-disconnect',
  'same-element-role-change',
])('closed drawer clears result on %s', async (loss) => {
  const f = await publishedDecisionFixture('captain'),
    m = mount(f.binding, () => f.client());
  await current(m);
  // F's three loss paths, isolating the render guard from close-event cleanup.
  m.drawer.open = false;
  if (loss === 'session-revocation') f.invalidate();
  if (loss === 'explicit-disconnect') m.ui.disconnect();
  if (loss === 'same-element-role-change') {
    m.doc.root.dataset.office = 'trade';
    m.mutation();
  }
  expect(m.ui.getState().model).toBeNull();
  cleared(m);
});

it('ordinary Close removes DOM only, restores focus, and reopens the still-authorized result without another read', async () => {
  const f = await publishedDecisionFixture('captain');
  let reads = 0;
  const port = f.client(),
    m = mount(f.binding, () => ({
      ...port,
      readProjection: (request) => {
        reads++;
        return port.readProjection(request);
      },
    }));
  await current(m);
  const original = m.ui.getState().model;
  m.action('close');
  expect(m.drawer.open).toBe(false);
  cleared(m);
  expect(m.doc.activeElement).toBe(m.trigger);
  expect(m.ui.getState().model).toBe(original);
  expect(m.ui.getState().canRead).toBe(true);
  m.trigger.click();
  expect(m.drawer.textContent).toContain('COMMAND_TEST_RESULT');
  expect(reads).toBe(1);
  m.action('refresh');
  await expect.poll(() => reads).toBe(2);
  await expect.poll(() => m.ui.getState().status).toBe('CURRENT');
  expect(m.drawer.textContent).toContain('11.5 political_capital');
  m.ui.disconnect();
});

it('native close (including Escape) clears private nodes without retiring a valid binding', async () => {
  const f = await publishedDecisionFixture('captain'),
    m = mount(f.binding, () => f.client());
  await current(m);
  m.drawer.close();
  cleared(m);
  expect(m.ui.getState().status).toBe('CURRENT');
  m.trigger.click();
  expect(m.drawer.textContent).toContain('COMMAND_TEST_RESULT');
  m.ui.disconnect();
});

it('a queued native close event cannot erase a newly reopened authorized surface', async () => {
  const f = await publishedDecisionFixture('captain'),
    m = mount(f.binding, () => f.client());
  await current(m);
  m.drawer.open = false;
  m.trigger.click();
  m.drawer.deliverClose();
  expect(m.drawer.open).toBe(true);
  expect(m.drawer.textContent).toContain('COMMAND_TEST_RESULT');
  m.ui.disconnect();
});

it.each(['country', 'pagehide'])(
  'closed %s clears all private source and metric nodes',
  async (loss) => {
    const f = await publishedDecisionFixture('captain'),
      m = mount(f.binding, () => f.client());
    await current(m);
    m.drawer.open = false;
    if (loss === 'country') {
      m.doc.root.dataset.country = '70';
      m.mutation();
    } else m.pagehide();
    expect(m.ui.getState().model).toBeNull();
    cleared(m);
  },
);

it('closed FINAL history and financial movements are cleared on revocation, while normal close preserves authorized history', async () => {
  const f = officeProjectionFixture('finance'),
    m = mount(f.binding, () => f.client());
  m.action('final');
  await expect.poll(() => m.ui.getState().status).toBe('CURRENT');
  expect(m.drawer.textContent).toContain('TEST_COMMAND');
  expect(m.drawer.textContent).toContain('9007199254740993.25');
  m.action('close');
  cleared(m);
  expect(m.ui.getState().receipt?.outcome).toBe('COMMITTED');
  m.trigger.click();
  expect(m.drawer.textContent).toContain('TEST_COMMAND');
  m.drawer.open = false;
  f.invalidate();
  expect(m.ui.getState().receipt).toBeNull();
  cleared(m);
});

it('closed refresh clears cached DOM before awaiting readback and cannot resurrect it after retirement', async () => {
  const f = await publishedDecisionFixture('captain'),
    port = f.client();
  let hold = false,
    release!: (value: ProjectionResult) => void;
  const m = mount(f.binding, () => ({
    ...port,
    readProjection: (request) =>
      hold
        ? new Promise((resolve) => {
            release = resolve;
          })
        : port.readProjection(request),
  }));
  await current(m);
  const oldResult = await port.readProjection(requestId());
  const refresh = m.drawer
    .all()
    .find((el) => el.dataset.officeReadAction === 'refresh')!;
  m.drawer.open = false;
  hold = true;
  refresh.click();
  expect(m.ui.getState().status).toBe('READING');
  cleared(m);
  f.invalidate();
  release(oldResult);
  await Promise.resolve();
  await Promise.resolve();
  expect(m.ui.getState().model).toBeNull();
  cleared(m);
});
