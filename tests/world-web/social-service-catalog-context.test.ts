/** TEST_ONLY intercepted wire and DOM protocol. No backend publication, real
 * browser, service creation, PLAN or FINAL execution is claimed here. */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { officeProjectionFixture } from './office-projection-fixture.js';
import { HostDocument, HostElement } from './trusted-host-dom.js';
import { createPostwarRuntimeView } from '../../apps/world-web/src/postwar-office-runtime/view.js';
import {
  POSTWAR_RUNTIME_SCHEMA,
  POSTWAR_RUNTIME_PATH,
} from '../../apps/world-web/src/postwar-office-runtime/client.js';
import { installOfficeProjection } from '../../apps/world-web/src/office-projection/view.js';
import { SOCIAL_SERVICE_CATALOG_CONTEXT as mapping } from '../../apps/world-web/src/social-employment/service-context.js';
const hash = 'sha256:' + 'a'.repeat(64);
afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const base = officeProjectionFixture('social');
  let live = true;
  const listeners = new Set<() => void>();
  const config = {
    ...base.config,
    identity: {
      ...base.config.identity,
      projectionVersion: POSTWAR_RUNTIME_SCHEMA,
    },
    endpoints: {
      ...base.config.endpoints,
      projectionPath: POSTWAR_RUNTIME_PATH,
    },
    world: { ...base.config.world, minimumWorldVersion: '0' },
    session: {
      ...base.config.session,
      isCurrent: () => live,
      onInvalidate: (fn: () => void) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
    },
  };
  config.currentIdentity = () => (live ? config.identity : null);
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  let fault = 'valid';
  const wire = (q: {
    requestId: string;
    dataset: string;
    page: { offset: number };
  }) => {
    const offset = q.page.offset,
      empty = fault === 'empty';
    return {
      schemaVersion: POSTWAR_RUNTIME_SCHEMA,
      requestId: q.requestId,
      ok: true,
      status: empty ? 'EMPTY' : 'AVAILABLE',
      dataset: q.dataset,
      authority: {
        source: 'SERVER_VERIFIED_READ_BINDING',
        capability: 'READ_AUTHORIZED_PROJECTION_AND_FINAL',
        identity: config.identity,
        seatRef: config.seatRef,
        seatState: 'ACTIVE',
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
          worldVersion: '7',
          eventSequence: '12',
          readbackRef: 'READBACK_TEST_ONLY',
        },
      },
      source: {
        dataNature: 'ADMITTED_CURRENT_SOCIAL_MIXED_FINANCIAL_PREFIX',
        sourceVersion: hash,
        bindingVersion: hash,
        sourceRevision: 'TEST_ONLY_WIRE',
        pageHash: 'a'.repeat(64),
        returnedRowsHash: 'a'.repeat(64),
        hashAlgorithm: 'POSTGRES_JSONB_TEXT_UTF8_SHA256',
        sourcePointer: { classification: 'TEST_ONLY_PROTOCOL_NOT_AUTHORITY' },
        worldId: config.identity.worldId,
        countryId: config.identity.countryId,
        officeId: 'SOCIAL',
        authSubjectId: config.identity.authSubjectId,
        authorizationRevision: config.identity.authorizationRevision,
        scopeKey: config.identity.scopeKey,
        modelVersion: config.identity.modelVersion,
        seedRef: config.world.seedRef,
        contentHash: config.world.contentHash,
        admissionRef: config.world.admissionRef,
        worldVersion: '7',
        eventSequence: '12',
        originWorldVersion: '0',
        originEventSequence: '0',
        observedHead: { worldVersion: '7', eventSequence: '12' },
        currentPrefixCoverage: {
          schemaVersion: 'postwar-social-current-prefix-coverage-v3',
          reducerVersion: 'POSTWAR_SOCIAL_FINANCE_FX_COMPLETE_PREFIX_V3',
          countryId: config.identity.countryId,
          coverageRef: 'COVERAGE_TEST_ONLY',
          globalWorldVersion: fault === 'head' ? '6' : '7',
          globalEventSequence: '12',
          originWorldVersion: '0',
          originEventSequence: '0',
          prefixFingerprint: hash,
          knownEffectsFingerprint: hash,
          coveredThroughEventId: 'EVENT_TEST_ONLY',
          coveredThroughEventFingerprint: hash,
          financialPostingCount: '6',
          financialBatchCount: '2',
          financialPostingsFingerprint: hash,
          employmentStateHash: hash,
          materializationHash: hash,
          stateOrigin: 'ADMITTED_OPENING_SOURCE',
        },
      },
      page: {
        offset,
        limit: 25,
        returned: empty ? 0 : 1,
        total: empty ? 0 : 2,
        nextOffset: empty || offset ? null : 1,
      },
      rows: empty
        ? []
        : [
            {
              poolId: 'POOL_TEST_ONLY_' + offset,
              countryId:
                fault === 'country'
                  ? 'COUNTRY_FOREIGN'
                  : config.identity.countryId,
              locationId: 'LOCATION_TEST_ONLY',
              skill: 'MEDIUM',
              dayIndex: '3',
              ruleVersion: 'RULE_TEST_ONLY',
              capacitySlots: '9007199254740993',
              usedSlots: fault === 'overbooked' ? '9007199254740994' : '1',
              reservedSlots: '2',
            },
          ],
    };
  };
  const fetcher: typeof fetch = async (url, init) => {
    const q = JSON.parse(String(init?.body));
    calls.push({ url: String(url), body: q });
    return fault === 'unavailable'
      ? new Response(null, { status: 503 })
      : fault === 'denied'
        ? new Response(null, { status: 403 })
        : Response.json(wire(q));
  };
  return {
    config,
    calls,
    fetcher,
    setFault: (v: string) => {
      fault = v;
    },
    invalidate() {
      live = false;
      listeners.forEach((fn) => fn());
    },
  };
}
function text(
  doc: HostDocument,
  view: ReturnType<typeof createPostwarRuntimeView>,
) {
  return view.render(doc as unknown as Document).textContent;
}
describe('social-10 existing employment services, supplemental read-only context', () => {
  it('keeps all nine CreateService/relocation/return-to-work inputs unconnected and maps no invented readout', () => {
    const catalog = JSON.parse(
      readFileSync(
        'apps/world-web/public/season1-immersive/catalog.json',
        'utf8',
      ),
    );
    const module = catalog.modules.find(
      (m: { id: string }) => m.id === mapping.moduleId,
    );
    expect(module.role).toBe('SOCIAL');
    expect(module.fields).toHaveLength(9);
    expect(module.readouts).toEqual([]);
    expect(
      module.fields.find(
        (f: { key: string }) => f.key === mapping.capacityInputContext,
      ),
    ).toMatchObject({
      source: 'SOCIAL-U0932',
      unit: '人',
      sourceQuote:
        'Labour | Create Employment Service | Social | Capacity, Budget, Target',
    });
    expect(mapping.connectedCatalogInputs).toEqual([]);
    expect(mapping.mappedCatalogReadouts).toEqual([]);
  });
  it('uses only the existing authorized API page/cursor, displays exact person capacity and source origin separately, and sends no command', async () => {
    const f = fixture();
    vi.stubGlobal('fetch', f.fetcher);
    const doc = new HostDocument('social'),
      v = createPostwarRuntimeView(f.config, () => undefined);
    try {
      await v.readSocialEmploymentContext();
      expect(v.state().status).toBe('CURRENT');
      let rendered = text(doc, v);
      expect(rendered).toContain('9007199254740993');
      expect(rendered).toContain('现有就业服务');
      expect(rendered).toContain('原9个目录输入尚未接通');
      expect(rendered).toContain('World version 7');
      expect(rendered).toContain('State origin 0 / 0');
      expect(rendered).toContain('Source version ' + hash);
      expect(rendered).toContain('Unit person');
      expect(rendered).toContain('[0, 1) / 2');
      const section = v.render(
        doc as unknown as Document,
      ) as unknown as HostElement;
      section
        .all()
        .find(
          (n) => n.tag === 'button' && n.textContent === 'Next authorized page',
        )!
        .click();
      await vi.waitFor(() => expect(f.calls).toHaveLength(2));
      await vi.waitFor(() => expect(v.state().status).toBe('CURRENT'));
      rendered = text(doc, v);
      expect(rendered).toContain('[1, 2) / 2');
      expect(f.calls[1]!.body.page).toMatchObject({
        offset: 1,
        sourceVersion: hash,
        bindingVersion: hash,
      });
      expect(
        f.calls.every(
          (c) =>
            c.url.endsWith(POSTWAR_RUNTIME_PATH) &&
            c.body.operation === 'READ_CURRENT_OFFICE_OPENING' &&
            c.body.dataset === 'service-pools',
        ),
      ).toBe(true);
      f.invalidate();
      expect(v.state().status).toBe('MISSING');
      expect(text(doc, v)).not.toContain('9007199254740993');
    } finally {
      v.disconnect();
    }
  });
  it.each(['empty', 'unavailable', 'denied', 'country', 'head', 'overbooked'])(
    'keeps %s separate from a successful current capacity read and clears prior values',
    async (fault) => {
      const f = fixture();
      vi.stubGlobal('fetch', f.fetcher);
      const doc = new HostDocument('social'),
        v = createPostwarRuntimeView(f.config, () => undefined);
      try {
        await v.readSocialEmploymentContext();
        expect(text(doc, v)).toContain('9007199254740993');
        f.setFault(fault);
        await v.refresh();
        const content = text(doc, v);
        expect(content).not.toContain('9007199254740993');
        if (fault === 'empty') {
          expect(v.state().status).toBe('CURRENT');
          expect(content).toContain('没有既有就业服务池');
        } else {
          expect(v.state().status).toBe(
            fault === 'denied' ? 'DENIED' : 'UNAVAILABLE',
          );
          expect(content).toContain('没有用零值替代');
        }
        expect(f.calls).toHaveLength(2);
      } finally {
        v.disconnect();
      }
    },
  );
  it('binds the actual catalog click only to a configured Social read pane, leaving other modules on the existing blocked path', async () => {
    const f = fixture();
    vi.stubGlobal('fetch', f.fetcher);
    vi.stubGlobal('Element', HostElement);
    vi.stubGlobal(
      'MutationObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
    const doc = new HostDocument('social');
    const clicks: ((e: unknown) => void)[] = [];
    Object.assign(doc, {
      addEventListener: (name: string, fn: (e: unknown) => void) => {
        if (name === 'click') clicks.push(fn);
      },
    });
    const target = doc.createElement('button');
    target.dataset.moduleCard = 'social-10';
    Object.assign(target, {
      closest: (selector: string) =>
        selector.includes(`[data-module-card="${target.dataset.moduleCard}"]`)
          ? target
          : null,
    });
    doc.root.append(target);
    const bridge = installOfficeProjection(
      doc as unknown as Document,
      { addEventListener() {} } as unknown as Window,
    );
    const fire = () => {
      const event = {
        target,
        preventDefault: vi.fn(),
        stopImmediatePropagation: vi.fn(),
      };
      clicks.forEach((fn) => fn(event));
      return event;
    };
    expect(fire().preventDefault).not.toHaveBeenCalled();
    expect(f.calls).toHaveLength(0);
    bridge.connect({
      read: f.config,
      view: { countryDisplayId: '01', role: 'social' },
    });
    try {
      const event = fire();
      expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
      await vi.waitFor(() => expect(f.calls).toHaveLength(1));
      await vi.waitFor(() =>
        expect(doc.root.textContent).toContain('现有就业服务'),
      );
      expect(doc.root.textContent).toContain('9007199254740993');
      target.dataset.moduleCard = 'social-12';
      expect(fire().stopImmediatePropagation).not.toHaveBeenCalled();
      expect(f.calls).toHaveLength(1);
    } finally {
      bridge.disconnect();
    }
  });
});
