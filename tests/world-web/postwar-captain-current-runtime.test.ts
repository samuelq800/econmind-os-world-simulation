/** OFFLINE TEST_ONLY shipped client/view protocol. Intercepted transport and DOM
 * do not establish actual SQL publication, authority, or native browser PASS. */
import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  POSTWAR_CAPTAIN_CURRENT_NATURE,
  POSTWAR_CAPTAIN_OPENING_NATURE,
  POSTWAR_CAPTAIN_OPENING_COVERAGE_SCHEMA,
  POSTWAR_CAPTAIN_OPENING_REDUCER,
  POSTWAR_CAPTAIN_CURRENT_DATASET,
  POSTWAR_CAPTAIN_CURRENT_BUCKETS,
} from '@econmind/core/postwar-captain-current-contract';
import {
  createPostwarRuntimeClient,
  POSTWAR_RUNTIME_SCHEMA,
  POSTWAR_RUNTIME_PATH,
} from '../../apps/world-web/src/postwar-office-runtime/client.js';
import { createPostwarRuntimeView } from '../../apps/world-web/src/postwar-office-runtime/view.js';
import { officeProjectionFixture } from './office-projection-fixture.js';
import { HostDocument, HostElement } from './trusted-host-dom.js';
import { createOfficeCommandController } from '../../apps/world-web/src/office-command/controller.js';
import { installOfficeCommand } from '../../apps/world-web/src/office-command/view.js';
import type { AuthenticatedOfficeCommandRequestDto } from '@econmind/core/authenticated-office-command-contract';
import { AUTHENTICATED_COMMAND_RECOVERY_SCHEMA } from '@econmind/core/authenticated-command-recovery-contract';
const requestId = '11111111-1111-4111-8111-111111111111',
  hash = 'sha256:' + 'a'.repeat(64);
function fixture() {
  const base = officeProjectionFixture('captain'),
    identity = {
      ...base.config.identity,
      countryId: 'COUNTRY_01',
      scopeKey: 'OFFICE_434F554E5452595F3031_4341505441494E',
      projectionVersion: POSTWAR_RUNTIME_SCHEMA,
    };
  let current: typeof identity | null = identity,
    alive = true;
  const listeners = new Set<() => void>();
  const config = {
    ...base.config,
    identity,
    currentIdentity: () => current,
    endpoints: {
      ...base.config.endpoints,
      projectionPath: POSTWAR_RUNTIME_PATH,
    },
    world: { ...base.config.world, minimumWorldVersion: '0' },
    session: {
      sessionRef: 'SESSION_TEST_ONLY_CAPTAIN',
      isCurrent: () => alive,
      onInvalidate: (fn: () => void) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
    },
  };
  const seed = {
    worldId: config.world.worldId,
    seedRef: config.world.seedRef,
    contentHash: config.world.contentHash,
    admissionRef: config.world.admissionRef,
  };
  const coverage = {
    schemaVersion: 'postwar-captain-current-prefix-coverage-v1',
    reducerVersion: 'POSTWAR_CAPTAIN_FINANCE_SOCIAL_FX_COMPLETE_PREFIX_V1',
    countryId: identity.countryId,
    coverageRef: 'CAPTAIN_COVERAGE_TEST_ONLY',
    prefixFingerprint: hash,
    knownEffectsFingerprint: hash,
    globalWorldVersion: '3',
    globalEventSequence: '6',
    coveredThroughEventId: 'EVENT_TEST_ONLY_LAST',
    coveredThroughEventFingerprint: hash,
    financialPostingCount: '6',
    financialBatchCount: '2',
    financialPostingsFingerprint: hash,
    capitalStateHash: hash,
    originalPacketSha256: 'b'.repeat(64),
    originWorldVersion: '0',
    originEventSequence: '0',
  };
  const values = POSTWAR_CAPTAIN_CURRENT_BUCKETS.map((bucket) => ({
    schemaVersion: 'postwar-captain-political-capital-row-v1',
    countryId: identity.countryId,
    capitalRef: 'CAPITAL_TEST_ONLY_ADOPTED_PACKET',
    bucket,
    unit: 'political_capital',
    balance: '10',
    opening: '10',
    generated: '0',
    total: '10',
    available: '10',
    spent: '0',
    closing: '10',
    allocationNature: 'REALLOCATION_NOT_GENERATION_OR_SPENDING',
  }));
  const wire = (id = requestId) => ({
    schemaVersion: POSTWAR_RUNTIME_SCHEMA,
    requestId: id,
    ok: true,
    status: 'AVAILABLE',
    dataset: POSTWAR_CAPTAIN_CURRENT_DATASET,
    authority: {
      source: 'SERVER_VERIFIED_READ_BINDING',
      capability: 'READ_AUTHORIZED_PROJECTION_AND_FINAL',
      identity,
      seatRef: config.seatRef,
      seatState: 'ACTIVE',
      seed,
      readback: {
        ...seed,
        worldVersion: '3',
        eventSequence: '6',
        readbackRef: 'READBACK_TEST_ONLY',
      },
    },
    source: {
      dataNature: POSTWAR_CAPTAIN_CURRENT_NATURE,
      sourceVersion: hash,
      bindingVersion: hash,
      sourceRevision: 'REVISION_TEST_ONLY_CAPTAIN',
      worldId: identity.worldId,
      countryId: identity.countryId,
      officeId: 'CAPTAIN',
      authSubjectId: identity.authSubjectId,
      authorizationRevision: identity.authorizationRevision,
      scopeKey: identity.scopeKey,
      modelVersion: identity.modelVersion,
      ...{
        seedRef: seed.seedRef,
        contentHash: seed.contentHash,
        admissionRef: seed.admissionRef,
      },
      worldVersion: '3',
      eventSequence: '6',
      originWorldVersion: '0',
      originEventSequence: '0',
      observedHead: { worldVersion: '3', eventSequence: '6' },
      currentCaptainCoverage: coverage,
      pageHash: 'c'.repeat(64),
      returnedRowsHash: 'c'.repeat(64),
      hashAlgorithm: 'POSTGRES_JSONB_TEXT_UTF8_SHA256',
      sourcePointer: { classification: 'OFFLINE_TEST_ONLY_NOT_AUTHORITY' },
    },
    page: { offset: 0, limit: 25, returned: 7, total: 7, nextOffset: null },
    rows: values,
  });
  let transform: (value: ReturnType<typeof wire>) => unknown = (v) => v,
    status = 200;
  const calls: unknown[] = [];
  const fetcher: typeof fetch = async (_url, init) => {
    if (typeof init?.body !== 'string')
      throw Error('TEST_ONLY_EXPECTED_STRICT_REQUEST');
    const request = JSON.parse(init.body) as { requestId: string };
    calls.push(request);
    return Response.json(transform(wire(request.requestId)), { status });
  };
  return {
    config,
    wire,
    fetcher,
    calls,
    change(fn: typeof transform) {
      transform = fn;
    },
    setStatus(value: number) {
      status = value;
    },
    changeOffice() {
      current = { ...identity, officeId: 'FINANCE' };
    },
    invalidate() {
      alive = false;
      current = null;
      for (const fn of [...listeners]) fn();
    },
  };
}
afterEach(() => vi.unstubAllGlobals());
const allocationOptions = {
  schemaVersion: 'postwar-captain-allocation-options-v1',
  classification: 'REGISTERED_REASON_REFERENCES_NOT_ALLOCATION_APPROVAL',
  countryId: 'COUNTRY_01',
  originalPacketSha256: 'b'.repeat(64),
  reasons: [
    {
      factRef: 'REASON_TEST_ONLY_REGISTERED',
      sourceRef: 'SOURCE_TEST_ONLY',
      payloadSha256: 'd'.repeat(64),
      revision: '1',
      sourceClass: 'TEST_ONLY',
      effectiveFromSimTime: '0',
      effectiveUntilSimTime: null,
      recordRef: 'Recorded basis / section 1',
      reason: 'Explicit test basis, not an allocation approval.',
    },
  ],
};
function commandFixture(withOptions = true, installed = true) {
  const f = fixture(),
    endpoint = {
      origin: f.config.endpoints.origin,
      path: '/v1/office-command' as const,
      deploymentRef: 'TEST_ONLY_CAPTAIN_FORM',
    },
    requests: AuthenticatedOfficeCommandRequestDto[] = [],
    recoveries: {
      request: { originalRequest: AuthenticatedOfficeCommandRequestDto };
    }[] = [];
  f.change((w) => ({
    ...openingWire(w),
    source: {
      ...openingWire(w).source,
      ...(withOptions
        ? { currentCaptainAllocationOptions: allocationOptions }
        : {}),
    },
  }));
  const fetcher: typeof fetch = async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (path === endpoint.path) {
      const request = JSON.parse(
        String(init?.body),
      ) as AuthenticatedOfficeCommandRequestDto;
      requests.push(request);
      return installed
        ? Response.json(
            {
              schemaVersion: request.schemaVersion,
              requestId: request.requestId,
              ok: true,
              state: {
                status: 'QUEUED',
                source: 'NEW',
                commandType: request.request.commandType,
                commandId: request.request.commandId,
                commandFingerprint: hash,
                submitted: true,
                queued: true,
              },
            },
            { status: 202 },
          )
        : Response.json(
            {
              schemaVersion: request.schemaVersion,
              requestId: request.requestId,
              ok: false,
              error: { code: 'SOURCE_RUNTIME_UNAVAILABLE', retryable: false },
              state: {
                status: 'REJECTED',
                reason: 'SOURCE_RUNTIME_UNAVAILABLE',
                commandType: request.request.commandType,
                submitted: false,
                queued: false,
                missing: ['ADMITTED_DOMAIN_SOURCE'],
              },
            },
            { status: 503 },
          );
    }
    if (path === '/v1/command-recovery') {
      const request = JSON.parse(String(init?.body)) as {
        requestId: string;
        request: { originalRequest: AuthenticatedOfficeCommandRequestDto };
      };
      recoveries.push(request);
      const original = request.request.originalRequest;
      return Response.json({
        schemaVersion: AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
        requestId: request.requestId,
        ok: true,
        state: {
          status: 'FINAL',
          commandType: original.request.commandType,
          receipt: {
            source: 'DURABLE_FINAL_COMMAND_RECEIPT',
            schemaVersion: 'command-receipt-v2',
            worldId: original.request.worldId,
            commandId: original.request.commandId,
            idempotencyKey: original.request.idempotencyKey,
            commandFingerprint: hash,
            outcome: 'COMMITTED',
            reasonCode: null,
            transitionId: 'TRANSITION_TEST_ONLY',
            worldVersionBefore: '0',
            worldVersionAfter: '1',
            simTime: '0',
            eventIds: ['EVENT_TEST_ONLY_ALLOCATION'],
            recordedAtReal: '2026-11-08T00:00:00.000Z',
          },
        },
      });
    }
    return f.fetcher(url, init);
  };
  const binding = {
      read: f.config,
      view: { role: 'captain' as const, countryDisplayId: '01' },
      endpoint,
    },
    controller = () =>
      createOfficeCommandController(binding, () => binding.view, {
        fetcher,
        requestId: () => requestId,
      });
  return { ...f, fetcher, binding, controller, requests, recoveries };
}
function openingWire(w: ReturnType<ReturnType<typeof fixture>['wire']>) {
  return {
    ...w,
    authority: {
      ...w.authority,
      readback: {
        ...w.authority.readback,
        worldVersion: '0',
        eventSequence: '0',
      },
    },
    source: {
      ...w.source,
      dataNature: POSTWAR_CAPTAIN_OPENING_NATURE,
      worldVersion: '0',
      eventSequence: '0',
      observedHead: { worldVersion: '0', eventSequence: '0' },
      currentCaptainCoverage: {
        ...w.source.currentCaptainCoverage,
        schemaVersion: POSTWAR_CAPTAIN_OPENING_COVERAGE_SCHEMA,
        reducerVersion: POSTWAR_CAPTAIN_OPENING_REDUCER,
        globalWorldVersion: '0',
        globalEventSequence: '0',
        coveredThroughEventId: null,
        coveredThroughEventFingerprint: null,
        financialPostingCount: '0',
        financialBatchCount: '0',
      },
    },
    rows: w.rows.map((r) => ({
      ...r,
      opening: '70',
      total: '70',
      available: '70',
      closing: '70',
    })),
  };
}
describe('Captain current runtime browser-safe wire and view', () => {
  it('opens the source form from the exact Captain-8 catalog entry and leaves other catalog or unbound entries on their existing closed path', async () => {
    vi.stubGlobal(
      'MutationObserver',
      class {
        observe() {}
      },
    );
    vi.stubGlobal('Element', HostElement);
    class CatalogDocument extends HostDocument {
      capture: ((event: MouseEvent) => void) | null = null;
      addEventListener(key: string, listener: (event: MouseEvent) => void) {
        if (key === 'click') this.capture = listener;
      }
    }
    const f = commandFixture(),
      doc = new CatalogDocument('captain'),
      api = installOfficeCommand(
        doc as unknown as Document,
        { addEventListener() {} } as unknown as Window,
        (binding, view) =>
          createOfficeCommandController(binding, view, {
            fetcher: f.fetcher,
            requestId: () => requestId,
          }),
      );
    const module = doc.createElement('button') as HostElement & {
      closest(selector: string): HostElement | null;
    };
    module.dataset.cmd = 'country-module';
    module.dataset.id = 'captain-8';
    module.closest = (selector) =>
      selector.includes('[data-cmd="country-module"][data-id="captain-8"]') &&
      module.dataset.id === 'captain-8'
        ? module
        : null;
    doc.root.append(module);
    let prevented = 0;
    const click = () =>
      doc.capture?.({
        target: module,
        preventDefault() {
          prevented++;
        },
        stopImmediatePropagation() {},
      } as unknown as MouseEvent);
    click();
    expect(prevented).toBe(0);
    api.connect(f.binding);
    module.dataset.id = 'captain-7';
    click();
    expect(prevented).toBe(0);
    module.dataset.id = 'captain-8';
    click();
    await expect
      .poll(() => api.getState().status)
      .toBe('CURRENT_AUTHORIZED_HEAD');
    expect(prevented).toBe(1);
    const dialog = doc.root
      .all()
      .find((e) => Object.hasOwn(e.dataset, 'officeCommandDialog'))!;
    expect(dialog.open).toBe(true);
    const form = dialog
      .all()
      .find((e) => Object.hasOwn(e.dataset, 'captainCapitalForm'))!;
    expect(form.textContent).toContain('Recorded basis / section 1');
    expect(form.textContent).toContain('未分配／危机预留');
    const fields: Record<string, string> = {
      fromBucket: 'UNALLOCATED_CRISIS_RESERVE',
      toBucket: 'FISCAL_REFORM',
      amount: '1',
      reasonFactRef: allocationOptions.reasons[0]!.factRef,
    };
    for (const el of form.all())
      if (el.dataset.captainCapitalField)
        (el as HostElement & { value: string }).value =
          fields[el.dataset.captainCapitalField]!;
    form
      .all()
      .find((e) => Object.hasOwn(e.dataset, 'captainCapitalStage'))!
      .click();
    expect(api.getState().status).toBe('REVIEW_REQUIRED');
    expect(api.getState().intent?.request.payload).toMatchObject({
      fromBucket: fields.fromBucket,
      reasonFactRef: fields.reasonFactRef,
    });
    expect(f.requests).toHaveLength(0);
    expect(
      dialog.all().find((e) => e.dataset.officeCommandAction === 'confirm')
        ?.disabled,
    ).toBe(true);
    dialog
      .all()
      .find((e) => e.dataset.officeCommandAction === 'review')!
      .click();
    dialog
      .all()
      .find((e) => e.dataset.officeCommandAction === 'confirm')!
      .click();
    await expect.poll(() => api.getState().status).toBe('QUEUE_ACK');
    expect(api.getState().receipt).toBeNull();
    expect(dialog.textContent).not.toContain('COMMITTED');
    dialog
      .all()
      .find((e) => e.dataset.officeCommandAction === 'recover')!
      .click();
    await expect.poll(() => api.getState().receipt?.outcome).toBe('COMMITTED');
    expect(dialog.textContent).toContain('COMMITTED');
    expect(f.requests).toHaveLength(1);
    f.invalidate();
    click();
    expect(prevented).toBe(1);
    expect(doc.root.textContent).not.toContain('Recorded basis / section 1');
  });
  it('stages one source-referenced transfer, requires review, and restores the original request after reload without resubmission', async () => {
    const f = commandFixture(),
      c = f.controller();
    await c.refresh();
    expect(
      c.stageCaptainCapital({
        fromBucket: 'UNALLOCATED_CRISIS_RESERVE',
        toBucket: 'FISCAL_REFORM',
        amount: '2.5',
        reasonFactRef: allocationOptions.reasons[0]!.factRef,
      }),
    ).toBe(true);
    const original = c.getState().intent!;
    expect(original.request).toMatchObject({
      expectedWorldVersion: '0',
      payload: {
        fromBucket: 'UNALLOCATED_CRISIS_RESERVE',
        toBucket: 'FISCAL_REFORM',
        amount: { amount: '2.5', unit: 'political_capital' },
        reasonFactRef: allocationOptions.reasons[0]!.factRef,
      },
    });
    await c.confirm();
    expect(f.requests).toHaveLength(0);
    expect(c.review()).toBe(true);
    await c.confirm();
    expect(c.getState().status).toBe('QUEUE_ACK');
    expect(c.getState().receipt).toBeNull();
    expect(f.requests).toEqual([original]);
    c.disconnect();
    const fresh = f.controller();
    await fresh.refresh();
    expect(
      fresh.restoreOriginalForRecovery(JSON.parse(JSON.stringify(original))),
    ).toBe(true);
    expect(fresh.review()).toBe(false);
    await fresh.confirm();
    await fresh.recoverOriginal();
    expect(fresh.getState().receipt).toMatchObject({
      outcome: 'COMMITTED',
      commandId: original.request.commandId,
    });
    expect(fresh.getState().canConfirm).toBe(false);
    expect(f.recoveries[0]?.request.originalRequest).toEqual(original);
    expect(f.recoveries[0]?.request.originalRequest.requestId).toBe(
      original.requestId,
    );
    expect(f.requests).toHaveLength(1);
    fresh.disconnect();
  });
  it('keeps missing reason originals closed and preserves a server source-runtime rejection as no submission, never local success', async () => {
    const draft = {
      fromBucket: 'UNALLOCATED_CRISIS_RESERVE',
      toBucket: 'FISCAL_REFORM',
      amount: '1',
      reasonFactRef: allocationOptions.reasons[0]!.factRef,
    };
    const absent = commandFixture(false),
      closed = absent.controller();
    await closed.refresh();
    expect(closed.stageCaptainCapital(draft)).toBe(false);
    expect(absent.requests).toHaveLength(0);
    closed.disconnect();
    const missing = commandFixture(true, false),
      c = missing.controller();
    await c.refresh();
    expect(c.stageCaptainCapital(draft)).toBe(true);
    expect(c.review()).toBe(true);
    await c.confirm();
    expect(c.getState()).toMatchObject({ status: 'REJECTED', receipt: null });
    expect(missing.requests).toHaveLength(1);
    expect(missing.recoveries).toHaveLength(0);
    c.disconnect();
  });
  it('accepts explicit real-zero opening coverage with seven actual genesis rows and no invented event', async () => {
    const f = fixture();
    f.change(openingWire);
    const c = createPostwarRuntimeClient(f.config, { fetcher: f.fetcher }),
      r = await c.readPage(POSTWAR_CAPTAIN_CURRENT_DATASET, requestId);
    expect(r.status).toBe('PAGE');
    if (r.status !== 'PAGE') throw Error('H0_PAGE_REQUIRED');
    expect(r.source.worldVersion).toBe('0');
    expect(r.source.originWorldVersion).toBe('0');
    expect(r.rows).toHaveLength(7);
    expect(r.rows[0]).toMatchObject({ opening: '70', balance: '10' });
    c.disconnect();
  });
  it('rejects H0 schema under a nonzero head, an invented zero-head event or legacy coverage relabelled as opening', async () => {
    const changes: ((w: ReturnType<typeof openingWire>) => unknown)[] = [
      (w) => ({
        ...w,
        source: {
          ...w.source,
          worldVersion: '1',
          eventSequence: '1',
          observedHead: { worldVersion: '1', eventSequence: '1' },
        },
      }),
      (w) => ({
        ...w,
        source: {
          ...w.source,
          currentCaptainCoverage: {
            ...w.source.currentCaptainCoverage,
            coveredThroughEventId: 'FAKE_H0_EVENT',
            coveredThroughEventFingerprint: hash,
          },
        },
      }),
      (w) => ({
        ...w,
        source: {
          ...w.source,
          currentCaptainCoverage: {
            ...w.source.currentCaptainCoverage,
            schemaVersion: 'postwar-captain-current-prefix-coverage-v1',
            reducerVersion:
              'POSTWAR_CAPTAIN_FINANCE_SOCIAL_FX_COMPLETE_PREFIX_V1',
          },
        },
      }),
      (w) => ({
        ...w,
        source: { ...w.source, dataNature: POSTWAR_CAPTAIN_CURRENT_NATURE },
      }),
    ];
    for (const change of changes) {
      const f = fixture();
      f.change((w) => change(openingWire(w)));
      const c = createPostwarRuntimeClient(f.config, { fetcher: f.fetcher });
      expect(
        (await c.readPage(POSTWAR_CAPTAIN_CURRENT_DATASET, requestId)).status,
      ).toBe('UNAVAILABLE');
      c.disconnect();
    }
  });
  it('requests the fixed dataset and accepts seven scoped buckets with separate origin/current head', async () => {
    const f = fixture(),
      client = createPostwarRuntimeClient(f.config, { fetcher: f.fetcher });
    const result = await client.readPage(
      POSTWAR_CAPTAIN_CURRENT_DATASET,
      requestId,
    );
    expect(result.status).toBe('PAGE');
    if ('page' in result) {
      expect(result.rows).toHaveLength(7);
      expect(result.source.worldVersion).toBe('3');
      expect(result.source.originWorldVersion).toBe('0');
    }
    expect(f.calls[0]).toMatchObject({
      officeId: 'CAPTAIN',
      dataset: POSTWAR_CAPTAIN_CURRENT_DATASET,
    });
    client.disconnect();
  });
  it('does not accept the old H0 kind or historical facts as the new current dataset', async () => {
    for (const dataNature of [
      'ADMITTED_H0_DERIVED_PROJECTION_NOT_POST_H0_REPLAY',
      'ADMITTED_IMMUTABLE_OPENING_FACTS',
    ]) {
      const f = fixture();
      f.change((w) => ({ ...w, source: { ...w.source, dataNature } }));
      const c = createPostwarRuntimeClient(f.config, { fetcher: f.fetcher });
      expect(
        (await c.readPage(POSTWAR_CAPTAIN_CURRENT_DATASET, requestId)).status,
      ).toBe('UNAVAILABLE');
      c.disconnect();
    }
  });
  it('rejects foreign rows, duplicate buckets and coverage/head drift', async () => {
    const transforms: ((
      w: ReturnType<ReturnType<typeof fixture>['wire']>,
    ) => unknown)[] = [
      (w) => ({
        ...w,
        rows: w.rows.map((v, i) =>
          i === 0 ? { ...v, countryId: 'COUNTRY_02' } : v,
        ),
      }),
      (w) => ({ ...w, rows: [w.rows[0], w.rows[0], ...w.rows.slice(2)] }),
      (w) => ({
        ...w,
        source: {
          ...w.source,
          currentCaptainCoverage: {
            ...w.source.currentCaptainCoverage,
            globalWorldVersion: '4',
          },
        },
      }),
      (w) => ({ ...w, source: { ...w.source, originWorldVersion: '1' } }),
    ];
    for (const transform of transforms) {
      const f = fixture();
      f.change(transform);
      const c = createPostwarRuntimeClient(f.config, { fetcher: f.fetcher });
      expect(
        (await c.readPage(POSTWAR_CAPTAIN_CURRENT_DATASET, requestId)).status,
      ).toBe('UNAVAILABLE');
      c.disconnect();
    }
  });
  it('keeps unavailable and stale responses distinct from a fabricated empty seven-bucket source', async () => {
    const f = fixture();
    f.setStatus(503);
    f.change((w) => ({
      schemaVersion: w.schemaVersion,
      requestId: w.requestId,
      ok: false,
      error: { code: 'CURRENT_CAPTAIN_UNAVAILABLE', retryable: false },
    }));
    const c = createPostwarRuntimeClient(f.config, { fetcher: f.fetcher });
    expect(
      await c.readPage(POSTWAR_CAPTAIN_CURRENT_DATASET, requestId),
    ).toEqual({ status: 'UNAVAILABLE', code: 'CURRENT_CAPTAIN_UNAVAILABLE' });
    c.disconnect();
    const stale = fixture();
    stale.setStatus(409);
    stale.change((w) => ({
      schemaVersion: w.schemaVersion,
      requestId: w.requestId,
      ok: false,
      error: { code: 'CURRENT_CAPTAIN_STALE', retryable: false },
    }));
    const s = createPostwarRuntimeClient(stale.config, {
      fetcher: stale.fetcher,
    });
    expect(
      (await s.readPage(POSTWAR_CAPTAIN_CURRENT_DATASET, requestId)).status,
    ).toBe('STALE');
    s.disconnect();
    const empty = fixture();
    empty.change((w) => ({
      ...w,
      status: 'EMPTY',
      page: { ...w.page, total: 0, returned: 0 },
      rows: [],
    }));
    const e = createPostwarRuntimeClient(empty.config, {
      fetcher: empty.fetcher,
    });
    expect(
      (await e.readPage(POSTWAR_CAPTAIN_CURRENT_DATASET, requestId)).status,
    ).toBe('UNAVAILABLE');
    e.disconnect();
  });
  it('retiring the session or changing the current role clears scope before another fetch', async () => {
    const f = fixture(),
      c = createPostwarRuntimeClient(f.config, { fetcher: f.fetcher });
    await c.readPage(POSTWAR_CAPTAIN_CURRENT_DATASET, requestId);
    f.changeOffice();
    expect(
      (await c.readPage(POSTWAR_CAPTAIN_CURRENT_DATASET, requestId)).status,
    ).toBe('STALE');
    expect(f.calls).toHaveLength(1);
    f.invalidate();
    c.disconnect();
  });
  it('renders real business fields and clears them on failure or session invalidation', async () => {
    const f = fixture();
    vi.stubGlobal('fetch', f.fetcher);
    const view = createPostwarRuntimeView(f.config, () => {}),
      doc = new HostDocument('captain');
    await view.refresh();
    expect(view.state().status).toBe('CURRENT');
    const rendered = view.render(doc as unknown as Document);
    expect(rendered.textContent).toContain(
      'Verified current political capital',
    );
    expect(rendered.textContent).toContain('Capital origin 0');
    expect(rendered.textContent).toContain('FISCAL_REFORM');
    expect(rendered.textContent).toContain('political_capital');
    f.setStatus(503);
    f.change((w) => ({
      schemaVersion: w.schemaVersion,
      requestId: w.requestId,
      ok: false,
      error: { code: 'CURRENT_CAPTAIN_UNAVAILABLE', retryable: false },
    }));
    await view.refresh();
    expect(view.state().status).toBe('UNAVAILABLE');
    expect(view.render(doc as unknown as Document).textContent).not.toContain(
      'FISCAL_REFORM',
    );
    f.invalidate();
    expect(view.state().status).toBe('MISSING');
    view.disconnect();
  });
});
