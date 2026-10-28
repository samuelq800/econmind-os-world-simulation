/** TEST_ONLY DOM/HTTP-protocol vectors. Uses the real shipped client/parser;
 * these synthetic rows grant no admission or authority and are not native SQL. */
import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installMainOfficeFields } from '../../apps/world-web/src/main-office-fields/binder.js';
import { MAIN_OFFICE_FIELD_MAPPING as mapping } from '../../apps/world-web/src/main-office-fields/mapping.js';
import {
  POSTWAR_RUNTIME_SCHEMA,
  POSTWAR_RUNTIME_PATH,
} from '../../apps/world-web/src/postwar-office-runtime/client.js';
import { officeProjectionFixture } from './office-projection-fixture.js';
afterEach(() => vi.unstubAllGlobals());
class El {
  children: El[] = [];
  parent: El | null = null;
  dataset: Record<string, string> = {};
  style = {};
  attributes = new Map<string, string>();
  id = '';
  className = '';
  title = '';
  disabled = false;
  type = '';
  value = '';
  own = '';
  listeners = new Map<string, () => void>();
  constructor(readonly tag: string) {}
  get textContent(): string {
    return [this.own, ...this.children.map((c) => c.textContent)].join('\n');
  }
  set textContent(s: string) {
    this.own = s;
    this.children = [];
  }
  append(...nodes: El[]) {
    for (const n of nodes) {
      n.parent = this;
      this.children.push(n);
    }
  }
  replaceChildren(...nodes: El[]) {
    for (const c of this.children) c.parent = null;
    this.children = [];
    this.own = '';
    this.append(...nodes);
  }
  remove() {
    if (this.parent)
      this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }
  contains(el: unknown): boolean {
    return el === this || this.children.some((c) => c.contains(el));
  }
  all(): El[] {
    return [this, ...this.children.flatMap((c) => c.all())];
  }
  setAttribute(k: string, v: string) {
    this.attributes.set(k, v);
    if (k.startsWith('data-')) this.dataset[this.key(k.slice(5))] = v;
  }
  removeAttribute(k: string) {
    this.attributes.delete(k);
    if (k.startsWith('data-')) delete this.dataset[this.key(k.slice(5))];
  }
  getAttribute(k: string) {
    return this.attributes.get(k) ?? null;
  }
  key(k: string) {
    return k.replace(/-([a-z])/gu, (_, c: string) => c.toUpperCase());
  }
  querySelector(s: string): El | null {
    return (
      this.all().find((e) => {
        if (s.startsWith('.'))
          return e.className.split(' ').includes(s.slice(1));
        if (s.startsWith('#')) return e.id === s.slice(1);
        const m = /^\[data-([a-z-]+)(?:="([^"]+)")?\]$/u.exec(s);
        return (
          !!m &&
          Object.hasOwn(e.dataset, this.key(m[1]!)) &&
          (m[2] === undefined || e.dataset[this.key(m[1]!)] === m[2])
        );
      }) ?? null
    );
  }
  addEventListener(k: string, fn: () => void) {
    this.listeners.set(k, fn);
  }
}
class Doc {
  body = new El('body');
  root: El;
  hud: El;
  main: El;
  policy: El;
  constructor() {
    this.root = new El('main');
    this.root.className = 'country-game';
    Object.assign(this.root.dataset, { office: 'finance', country: '01' });
    this.hud = new El('button');
    Object.assign(this.hud.dataset, {
      metric: 'treasury',
      cmd: 'country-metric',
      sourceExact: '100000',
    });
    this.hud.textContent = 'Public opening balance 100000 GCU';
    this.main = new El('section');
    this.main.className = 'national-play';
    this.policy = new El('input');
    this.policy.dataset.field = 'finance-u0251-0';
    this.policy.value = '100000';
    this.main.append(this.policy);
    this.root.append(this.hud, this.main);
    this.body.append(this.root);
  }
  createElement(tag: string) {
    return new El(tag);
  }
  querySelector(s: string) {
    return this.body.querySelector(s);
  }
}
function mount() {
  const doc = new Doc(),
    mutations: (() => void)[] = [],
    events = new Map<string, () => void>();
  vi.stubGlobal(
    'MutationObserver',
    class {
      constructor(fn: () => void) {
        mutations.push(fn);
      }
      observe() {}
    },
  );
  const f = officeProjectionFixture('finance');
  let valid = true;
  const listeners = new Set<() => void>();
  const read = {
    ...f.config,
    identity: {
      ...f.config.identity,
      projectionVersion: POSTWAR_RUNTIME_SCHEMA,
    },
    endpoints: { ...f.config.endpoints, projectionPath: POSTWAR_RUNTIME_PATH },
    world: { ...f.config.world, minimumWorldVersion: '0' },
  };
  read.currentIdentity = () => read.identity;
  read.session = {
    sessionRef: 'TEST_ONLY_MAIN_FIELDS',
    isCurrent: () => valid,
    onInvalidate(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  const authority = {
    source: 'SERVER_VERIFIED_READ_BINDING',
    capability: 'READ_AUTHORIZED_PROJECTION_AND_FINAL',
    identity: read.identity,
    seatRef: read.seatRef,
    seatState: 'ACTIVE',
    seed: {
      worldId: read.world.worldId,
      seedRef: read.world.seedRef,
      contentHash: read.world.contentHash,
      admissionRef: read.world.admissionRef,
    },
    readback: {
      worldId: read.world.worldId,
      seedRef: read.world.seedRef,
      contentHash: read.world.contentHash,
      admissionRef: read.world.admissionRef,
      worldVersion: '6',
      eventSequence: '10',
      readbackRef: 'READ_MAIN_TEST_ONLY',
    },
  };
  const row = {
    schemaVersion: 'postwar-treasury-capacity-row-v1',
    countryId: read.identity.countryId,
    accountId: 'ACCOUNT_TEST_ONLY_TGA',
    claimId: 'CLAIM_TEST_ONLY_TGA',
    currency: 'XAA',
    treasuryLedgerClaimBalance: '9007199254740993.25',
    openingReservedCapacity: '1',
    budgetEnvelopeCapacity: '2',
    additionalPayrollReservedCapacity: '0',
    totalReservedCapacity: '3',
    availableCapacity: '9007199254740990.25',
    reservationNature: 'CAPACITY_RESERVED_NOT_PAID_OR_ACCRUED',
    balanceNature: 'RECIPROCAL_LEDGER_CLAIM_NOT_CASH_WALLET',
  };
  const calls: Record<string, unknown>[] = [];
  let mode: 'OK' | 'FAIL' | 'DENIED' = 'OK';
  let change: (b: ReturnType<typeof body>) => void = () => {};
  const body = (requestId: string) => ({
    schemaVersion: POSTWAR_RUNTIME_SCHEMA,
    requestId,
    ok: true,
    status: 'AVAILABLE',
    dataset: 'treasury-capacity',
    authority,
    source: {
      dataNature: 'ADMITTED_CURRENT_FINANCIAL_NO_POSTING_PREFIX',
      sourceVersion: 'sha256:' + 'a'.repeat(64),
      bindingVersion: 'sha256:' + 'b'.repeat(64),
      sourceRevision: 'TEST_ONLY',
      worldId: read.identity.worldId,
      countryId: read.identity.countryId,
      officeId: 'FINANCE',
      authSubjectId: read.identity.authSubjectId,
      authorizationRevision: read.identity.authorizationRevision,
      scopeKey: read.identity.scopeKey,
      modelVersion: read.identity.modelVersion,
      seedRef: read.world.seedRef,
      contentHash: read.world.contentHash,
      admissionRef: read.world.admissionRef,
      worldVersion: '6',
      eventSequence: '10',
      originWorldVersion: '0',
      originEventSequence: '0',
      observedHead: { worldVersion: '6', eventSequence: '10' },
      pageHash: 'c'.repeat(64),
      returnedRowsHash: 'd'.repeat(64),
      hashAlgorithm: 'POSTGRES_JSONB_TEXT_UTF8_SHA256',
      sourcePointer: { classification: 'TEST_ONLY_PROTOCOL' },
      currentFinancialCoverage: {
        schemaVersion: 'postwar-financial-current-prefix-coverage-v1',
        reducerVersion: 'POSTWAR_FINANCIAL_COMPLETE_NO_POSTING_PREFIX_V1',
        coverageRef: 'TEST_ONLY_COVERAGE',
        prefixFingerprint: 'sha256:' + 'c'.repeat(64),
        knownEffectsFingerprint: 'sha256:' + 'd'.repeat(64),
        globalWorldVersion: '6',
        globalEventSequence: '10',
        coveredThroughEventId: 'TEST_ONLY_EVENT',
        coveredThroughEventFingerprint: 'sha256:' + 'e'.repeat(64),
        noFinancialPostings: true,
        noInventoryPostings: true,
      },
    },
    page: { offset: 0, limit: 25, returned: 1, total: 1, nextOffset: null },
    rows: [{ ...row }],
  });
  const fetcher: typeof fetch = async (_url, init) => {
    const q = JSON.parse(String(init?.body));
    calls.push(q);
    if (mode !== 'OK')
      return Response.json(
        {
          schemaVersion: POSTWAR_RUNTIME_SCHEMA,
          requestId: q.requestId,
          ok: false,
          error: { code: mode },
        },
        { status: mode === 'DENIED' ? 403 : 503 },
      );
    const result = body(q.requestId);
    change(result);
    return Response.json(result);
  };
  vi.stubGlobal('fetch', fetcher);
  const binder = installMainOfficeFields(
    doc as unknown as Document,
    {
      addEventListener(k: string, fn: () => void) {
        events.set(k, fn);
      },
    } as unknown as Window,
  );
  const binding = {
    read,
    view: { role: 'finance' as const, countryDisplayId: '01' },
  };
  return {
    doc,
    binder,
    binding,
    row,
    calls,
    fetcher,
    body,
    mutate: () => mutations.forEach((fn) => fn()),
    mode: (m: typeof mode) => {
      mode = m;
    },
    change: (fn: typeof change) => {
      change = fn;
    },
    invalidate: () => {
      valid = false;
      for (const fn of [...listeners]) fn();
    },
    hide: () => events.get('pagehide')?.(),
  };
}
async function settled() {
  for (let i = 0; i < 12; i++)
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
}
describe('main Finance fields over the existing trusted read lifetime', () => {
  it('paints the real main HUD and ten readonly body slots, preserving exact LC strings and policy inputs', async () => {
    const f = mount();
    expect(f.doc.hud.textContent).toContain(
      'Opening public reference · not current',
    );
    f.binder.connect(f.binding);
    await settled();
    expect(f.binder.getState().status).toBe('CURRENT');
    expect(f.doc.hud.textContent).toContain(
      f.row.treasuryLedgerClaimBalance + ' XAA',
    );
    expect(f.doc.hud.textContent).toContain('not cash');
    expect(f.doc.hud.disabled).toBe(true);
    expect(f.doc.hud.dataset.sourceExact).toBeUndefined();
    expect(f.doc.main.querySelector('#' + mapping.sectionId)).not.toBeNull();
    expect(
      f.doc.body.all().filter((e) => e.dataset.mainOfficeField !== undefined),
    ).toHaveLength(10);
    expect(f.doc.body.all().some((e) => e.tag === 'dialog')).toBe(false);
    expect(f.doc.policy.value).toBe('100000');
    expect(
      f.doc.main.querySelector('#main-finance-payroll-reserved')?.textContent,
    ).toBe('0');
    expect(f.doc.main.textContent).toContain(f.row.availableCapacity);
    expect(f.doc.main.textContent).toContain(
      'Reserved capacity · not paid or accrued',
    );
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]).toMatchObject({
      operation: 'READ_CURRENT_OFFICE_OPENING',
      dataset: 'treasury-capacity',
      officeId: 'FINANCE',
    });
    f.binder.disconnect();
  });
  it.each(['FAIL', 'DENIED'] as const)(
    'clears every private field after %s without restoring a fake current public balance',
    async (mode) => {
      const f = mount();
      f.binder.connect(f.binding);
      await settled();
      f.mode(mode);
      await f.binder.refresh();
      expect(f.doc.main.textContent).not.toContain(f.row.accountId);
      expect(f.doc.main.textContent).not.toContain(
        f.row.treasuryLedgerClaimBalance,
      );
      expect(f.doc.hud.textContent).not.toContain(
        f.row.treasuryLedgerClaimBalance,
      );
      expect(f.doc.hud.textContent).toContain('Unavailable');
      if (mode === 'DENIED') expect(f.binder.getState().canRead).toBe(false);
      f.binder.disconnect();
    },
  );
  it.each(['country', 'office', 'session', 'pagehide'] as const)(
    'clears main fields and old detached nodes on %s invalidation',
    async (kind) => {
      const f = mount();
      f.binder.connect(f.binding);
      await settled();
      const old = f.doc.root;
      if (kind === 'session') f.invalidate();
      else if (kind === 'pagehide') f.hide();
      else {
        if (kind === 'country') f.doc.root.dataset.country = '02';
        else f.doc.root.dataset.office = 'industry';
        f.mutate();
      }
      expect(old.textContent).not.toContain(f.row.accountId);
      expect(old.textContent).not.toContain(f.row.availableCapacity);
      expect(f.binder.getState().canRead).toBe(false);
      await f.binder.refresh();
      expect(f.calls).toHaveLength(1);
      f.binder.disconnect();
    },
  );
  it('discards a late response after a country change', async () => {
    const f = mount();
    let release: ((r: Response) => void) | undefined;
    let request = '';
    vi.stubGlobal('fetch', async (_url: unknown, init: RequestInit) => {
      request = JSON.parse(String(init.body)).requestId;
      return new Promise<Response>((resolve) => {
        release = resolve;
      });
    });
    f.binder.connect(f.binding);
    await settled();
    f.doc.root.dataset.country = '02';
    f.mutate();
    release?.(Response.json(f.body(request)));
    await settled();
    expect(f.doc.body.textContent).not.toContain(
      f.row.treasuryLedgerClaimBalance,
    );
    expect(f.binder.getState().canRead).toBe(false);
    f.binder.disconnect();
  });
  it.each(['missing', 'foreign', 'duplicate', 'historical'] as const)(
    'does not paint an unsupported %s capacity row',
    async (fault) => {
      const f = mount();
      f.change((b) => {
        if (fault === 'missing')
          delete (b.rows[0] as Partial<typeof f.row>).availableCapacity;
        if (fault === 'foreign') b.rows[0]!.countryId = 'COUNTRY_FOREIGN';
        if (fault === 'duplicate') {
          b.rows.push({ ...b.rows[0]! });
          b.page.total = 2;
          b.page.returned = 2;
        }
        if (fault === 'historical')
          b.source.dataNature = 'ADMITTED_IMMUTABLE_OPENING_FACTS';
      });
      f.binder.connect(f.binding);
      await settled();
      expect(f.binder.getState().status).toBe('UNAVAILABLE');
      expect(f.doc.main.textContent).not.toContain(f.row.accountId);
      f.binder.disconnect();
    },
  );
  it('declares coverage against the actual catalog without counting context as connected policy fields', async () => {
    const catalog = JSON.parse(
      await readFile(
        new URL(
          '../../apps/world-web/public/season1-immersive/catalog.json',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    expect(catalog.modules).toHaveLength(mapping.denominator.modules);
    expect(
      catalog.modules.reduce(
        (n: number, m: { fields: unknown[] }) => n + m.fields.length,
        0,
      ),
    ).toBe(mapping.denominator.policyInputs);
    expect(
      catalog.modules.reduce(
        (n: number, m: { readouts: unknown[] }) => n + m.readouts.length,
        0,
      ),
    ).toBe(mapping.denominator.readouts);
    expect(mapping.coverage).toMatchObject({
      existingHudControls: 1,
      newReadonlySlots: 10,
      catalogPolicyInputs: 0,
      catalogReadouts: 0,
      moduleActions: 0,
    });
  });
});
