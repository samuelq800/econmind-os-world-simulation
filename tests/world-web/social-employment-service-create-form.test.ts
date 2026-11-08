/** TEST_ONLY browser DATA/DOM/transport vectors. No licence/source admission,
 * real JWT/Node/Chromium, queue execution or economic FINAL is established. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUTHENTICATED_COMMAND_RECOVERY_SCHEMA } from '@econmind/core/authenticated-command-recovery-contract';
import {
  buildSocialEmploymentServiceCreateRequest as build,
  readSocialEmploymentServiceCreationPlanning as planning,
  renderSocialEmploymentServiceCreateForm as render,
} from '../../apps/world-web/src/social-employment/create-form.js';
import { createOfficeCommandController } from '../../apps/world-web/src/office-command/controller.js';
import { installOfficeCommand } from '../../apps/world-web/src/office-command/view.js';
import {
  POSTWAR_RUNTIME_SCHEMA,
  POSTWAR_RUNTIME_PATH,
  type RuntimePage,
} from '../../apps/world-web/src/postwar-office-runtime/client.js';
import { readSocialServiceContext } from '../../apps/world-web/src/social-employment/service-context.js';
import { officeCommandFixture } from './office-command-fixture.js';
import { HostDocument, type HostElement } from './trusted-host-dom.js';
afterEach(() => vi.unstubAllGlobals());
const fp = 'sha256:' + 'a'.repeat(64);
type MutableRuntimePage = Omit<RuntimePage, 'source'> & {
  source: Record<string, unknown> & {
    sourceVersion: string;
    bindingVersion: string;
  };
};
function fixture() {
  const f = officeCommandFixture('social');
  const read = {
    ...f.binding.read,
    identity: {
      ...f.binding.read.identity,
      projectionVersion: POSTWAR_RUNTIME_SCHEMA,
    },
    endpoints: {
      ...f.binding.read.endpoints,
      projectionPath: POSTWAR_RUNTIME_PATH,
    },
    world: { ...f.binding.read.world, minimumWorldVersion: '0' },
  };
  read.currentIdentity = () => read.identity;
  let mode = 'available',
    head = '3';
  const parent = {
    poolId: 'ROOT_POOL_TEST_ONLY',
    countryId: read.identity.countryId,
    locationId: 'LOCATION_TEST_ONLY',
    skill: 'MEDIUM',
    dayIndex: '0',
    ruleVersion: 'SOCIAL_JOB_MATCH_RULE_V1',
    capacitySlots: '7',
    usedSlots: '1',
    reservedSlots: '2',
  };
  const licence = {
    licenseId: 'LICENCE_TEST_ONLY',
    licensorEntityId: 'OP_TEST_ONLY',
    beneficiaryEntityId: 'GOV_TEST_ONLY',
    locationId: parent.locationId,
    validFromDayIndex: '0',
    validUntilDayIndex: '1',
    dutyAssignmentIds: ['DUTY_TEST_ONLY'],
    maximumWorkerMinutes: '480',
    scope: 'PUBLIC_REFERRALS_ONLY_NOT_EMPLOYER_TRANSFER',
    state: 'GENESIS_USAGE_LICENSE_NOT_PAID_PURCHASE',
    additionalFeeAmount: '0',
    futurePaymentCondition:
      'NEW_PUBLIC_PURCHASE_REQUIRES_SEPARATE_LAWFUL_FUNDED_CONTRACT',
  };
  const data = () => ({
    classification: 'CURRENT_T0_SERVICE_CREATION_PLANNING_DATA_NOT_AUTHORITY',
    worldId: read.identity.worldId,
    countryId: read.identity.countryId,
    head: { worldVersion: head, eventSequence: head },
    simTime: '10000',
    dayIndex: '0',
    localCurrency: 'XAA',
    sourceRef: 'SOURCE_TEST_ONLY',
    sourceFingerprint: fp,
    usageLicences: [{ ...licence }],
    rootTargets: [
      {
        poolId: parent.poolId,
        locationId: parent.locationId,
        skill: parent.skill,
        dayIndex: parent.dayIndex,
        capacitySlots: parent.capacitySlots,
        usedSlots: parent.usedSlots,
        reservedSlots: parent.reservedSlots,
        actualUnemployedCount: '20',
      },
    ],
    creations: [] as {
      programmeId: string;
      parentPoolId: string;
      childPoolId: string;
      capacitySlots: string;
    }[],
  });
  const page = (dataset = 'service-pools'): MutableRuntimePage => {
    const seed = {
      worldId: read.identity.worldId,
      seedRef: read.world.seedRef,
      contentHash: read.world.contentHash,
      admissionRef: read.world.admissionRef,
    };
    return {
      status: 'PAGE',
      dataset,
      authority: {
        source: 'SERVER_VERIFIED_READ_BINDING',
        capability: 'READ_AUTHORIZED_PROJECTION_AND_FINAL',
        identity: read.identity,
        seatRef: read.seatRef,
        seatState: 'ACTIVE',
        seed,
        readback: {
          ...seed,
          worldVersion: head,
          eventSequence: head,
          readbackRef: 'READBACK_TEST_ONLY',
        },
      },
      source: {
        ...read.identity,
        ...seed,
        sourceVersion: fp,
        bindingVersion: fp,
        sourceRevision: 'TEST_ONLY',
        sourcePointer: { classification: 'TEST_ONLY_WIRE' },
        pageHash: 'a'.repeat(64),
        returnedRowsHash: 'a'.repeat(64),
        hashAlgorithm: 'POSTGRES_JSONB_TEXT_UTF8_SHA256',
        dataNature: 'ADMITTED_CURRENT_SOCIAL_MIXED_FINANCIAL_PREFIX',
        worldVersion: head,
        eventSequence: head,
        originWorldVersion: '0',
        originEventSequence: '0',
        observedHead: { worldVersion: head, eventSequence: head },
        currentPrefixCoverage: {
          schemaVersion: 'postwar-social-current-prefix-coverage-v3',
          reducerVersion: 'POSTWAR_SOCIAL_FINANCE_FX_COMPLETE_PREFIX_V3',
          countryId: read.identity.countryId,
          coverageRef: 'COVERAGE_TEST_ONLY',
          globalWorldVersion: head,
          globalEventSequence: head,
          originWorldVersion: '0',
          originEventSequence: '0',
          prefixFingerprint: fp,
          knownEffectsFingerprint: fp,
          coveredThroughEventId: 'EVENT_TEST_ONLY',
          coveredThroughEventFingerprint: fp,
          financialPostingCount: '0',
          financialBatchCount: '0',
          financialPostingsFingerprint: fp,
          employmentStateHash: fp,
          materializationHash: fp,
          stateOrigin: 'ADMITTED_OPENING_SOURCE',
        },
        ...(dataset === 'service-pools' && mode !== 'missing'
          ? {
              currentEmploymentServiceCreationOptions:
                mode === 'available'
                  ? { status: 'AVAILABLE', data: data() }
                  : {
                      status: mode.toUpperCase(),
                      code: 'PLANNING_READ_FAILED',
                    },
            }
          : {}),
      },
      page: { offset: 0, limit: 25, returned: 1, total: 1, nextOffset: null },
      rows:
        dataset === 'positions'
          ? [
              {
                positionId: 'POSITION_TEST_ONLY',
                countryId: parent.countryId,
                locationId: parent.locationId,
                skill: parent.skill,
                owner: 'PRIVATE_SECTOR',
                classificationId: 'SECTOR_TEST_ONLY',
                requiredCount: '5',
                employedCount: '1',
              },
            ]
          : [{ ...parent }],
    };
  };
  const draft = { servicePoolId: parent.poolId, capacity: '4' };
  const request = (p = page(), d = draft) =>
    build({
      page: p,
      draft: d,
      programmeId: 'PROGRAMME_TEST_ONLY',
      requestId: f.request.requestId,
      commandId: 'COMMAND_CREATE_TEST_ONLY',
      idempotencyKey: 'KEY_CREATE_TEST_ONLY',
    });
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    const path = new URL(String(url)).pathname,
      body = JSON.parse(String(init?.body));
    calls.push({ path, body });
    if (path === '/v1/office-command') throw Error('TEST_ONLY_UNKNOWN_WRITE');
    if (path === '/v1/command-recovery')
      return Response.json({
        schemaVersion: AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
        requestId: body.requestId,
        ok: true,
        state: {
          status: 'QUEUED',
          commandType: body.request.originalRequest.request.commandType,
          commandId: body.request.commandId,
          idempotencyKey: body.request.idempotencyKey,
          commandFingerprint: fp,
        },
      });
    if (mode === 'denied') return new Response(null, { status: 403 });
    const p = page(body.dataset);
    return Response.json({
      schemaVersion: POSTWAR_RUNTIME_SCHEMA,
      requestId: body.requestId,
      ok: true,
      ...p,
      status: p.status === 'PAGE' ? 'AVAILABLE' : 'EMPTY',
    });
  };
  const controller = () =>
    createOfficeCommandController(
      { ...f.binding, read },
      () => f.binding.view,
      { fetcher, requestId: () => f.request.requestId },
    );
  const h0 = () => {
    head = '0';
    const p = page();
    p.source.dataNature = 'ADMITTED_H0_DERIVED_PROJECTION_NOT_POST_H0_REPLAY';
    delete p.source.currentPrefixCoverage;
    delete p.source.originWorldVersion;
    delete p.source.originEventSequence;
    delete p.source.observedHead;
    return p;
  };
  return {
    f,
    read,
    parent,
    page,
    data,
    request,
    draft,
    fetcher,
    controller,
    calls,
    binding: { ...f.binding, read },
    mode: (v: string) => (mode = v),
    head: (v: string) => (head = v),
    h0,
  };
}
function options(p: RuntimePage) {
  return (
    p.source.currentEmploymentServiceCreationOptions as {
      status: 'AVAILABLE';
      data: ReturnType<ReturnType<typeof fixture>['data']>;
    }
  ).data;
}
describe('first-day licensed service creation user intent (TEST_ONLY)', () => {
  it('derives actual LC/target and exact five-field Core payload, without a purchase or PLAN', () => {
    const f = fixture(),
      r = f.request();
    expect(r.request).toMatchObject({
      commandType: 'CORE_SOCIAL_EMPLOYMENT_SERVICE_CREATE_V1',
      expectedWorldVersion: '3',
      payload: {
        schemaVersion: 'social-employment-service-create-v1',
        programmeId: 'PROGRAMME_TEST_ONLY',
        capacity: { amount: '4', unit: 'person' },
        budget: { amount: '0', currency: 'XAA' },
        target: {
          servicePoolId: f.parent.poolId,
          locationId: f.parent.locationId,
          skill: f.parent.skill,
        },
      },
    });
    expect(Object.keys(r.request.payload as object)).toHaveLength(5);
  });
  it.each(['', '0', '01', '1.5', '5'])(
    'requires explicit canonical capacity within current free parent slots: %s',
    (capacity) => {
      const f = fixture();
      expect(() => f.request(f.page(), { ...f.draft, capacity })).toThrow();
    },
  );
  it('uses already reduced parent capacity and subtracts PLAN reservations exactly once', () => {
    const f = fixture(),
      p = f.page(),
      d = options(p);
    d.creations = [
      {
        programmeId: 'PREVIOUS_TEST_ONLY',
        parentPoolId: f.parent.poolId,
        childPoolId: 'CHILD_TEST_ONLY',
        capacitySlots: '3',
      },
    ];
    expect(f.request(p).request.payload).toMatchObject({
      capacity: { amount: '4', unit: 'person' },
    });
    expect(() =>
      build({
        page: p,
        draft: f.draft,
        programmeId: 'PREVIOUS_TEST_ONLY',
        requestId: f.f.request.requestId,
        commandId: 'COMMAND_TEST_ONLY',
        idempotencyKey: 'KEY_TEST_ONLY',
      }),
    ).toThrow();
  });
  it('refuses child re-partition and mismatching row counters, scope or target', () => {
    const f = fixture(),
      p = f.page();
    options(p).creations = [
      {
        programmeId: 'OLD_TEST_ONLY',
        parentPoolId: 'OTHER_ROOT',
        childPoolId: f.parent.poolId,
        capacitySlots: '7',
      },
    ];
    expect(() => f.request(p)).toThrow();
    for (const change of ['counter', 'country', 'head', 'target'] as const) {
      const p = f.page(),
        d = options(p);
      if (change === 'counter') d.rootTargets[0]!.reservedSlots = '0';
      if (change === 'country') d.countryId = 'COUNTRY_FOREIGN';
      if (change === 'head') d.head.worldVersion = '4';
      if (change === 'target') d.rootTargets[0]!.actualUnemployedCount = '';
      expect(() => f.request(p)).toThrow();
    }
  });
  it('does not default a licence, currency, present target or cross-day window', () => {
    const f = fixture();
    for (const change of ['licence', 'currency', 'day', 'time'] as const) {
      const p = f.page(),
        d = options(p);
      if (change === 'licence') d.usageLicences = [];
      if (change === 'currency') d.localCurrency = '';
      if (change === 'day') d.dayIndex = '1';
      if (change === 'time') d.simTime = '86400000';
      expect(() => f.request(p)).toThrow();
    }
  });
  it('does not turn a fee, missing actual duty or unrelated licence into a free permission', () => {
    const f = fixture();
    for (const change of ['fee', 'duty', 'location'] as const) {
      const p = f.page(),
        d = options(p);
      if (change === 'fee') d.usageLicences[0]!.additionalFeeAmount = '1';
      if (change === 'duty') d.usageLicences[0]!.dutyAssignmentIds = [];
      if (change === 'location')
        d.usageLicences[0]!.locationId = 'OTHER_LOCATION_TEST_ONLY';
      expect(() => f.request(p)).toThrow();
    }
  });
  it('recognizes only exact genuine H0 metadata; old PLAN keeps rejecting that opening nature', () => {
    const f = fixture(),
      p = f.h0();
    expect(f.request(p).request.expectedWorldVersion).toBe('0');
    expect(() =>
      readSocialServiceContext(p, f.read.identity.countryId),
    ).toThrow();
    p.source.originWorldVersion = '0';
    p.source.originEventSequence = '0';
    p.source.observedHead = { worldVersion: '0', eventSequence: '0' };
    expect(f.request(p).request.expectedWorldVersion).toBe('0');
    p.source.currentPrefixCoverage = {};
    expect(() => f.request(p)).toThrow();
    delete p.source.currentPrefixCoverage;
    p.source.observedHead = { worldVersion: '3', eventSequence: '3' };
    expect(() => f.request(p)).toThrow();
    const bound = f.h0();
    bound.source.currentStateBinding = {};
    expect(() => f.request(bound)).toThrow();
    const origin = f.h0();
    origin.source.originWorldVersion = '1';
    expect(() => f.request(origin)).toThrow();
    const source = f.h0();
    source.source.worldVersion = '3';
    expect(() => f.request(source)).toThrow();
  });
  it('never treats origin zero at a positive head as H0 or changes admitted pins', () => {
    const f = fixture(),
      p = f.page();
    p.source.dataNature = 'ADMITTED_H0_DERIVED_PROJECTION_NOT_POST_H0_REPLAY';
    expect(() => f.request(p)).toThrow();
    const q = f.h0();
    q.source.admissionRef = 'WRONG_ADMISSION';
    expect(() => f.request(q)).toThrow();
  });
  it('keeps missing/stale/failure/actual no-licence distinct and never supplies an enabled create control', () => {
    const f = fixture(),
      doc = new HostDocument('social');
    for (const mode of ['missing', 'stale', 'unavailable']) {
      f.mode(mode);
      const p = f.page();
      expect(planning(p)?.status ?? 'MISSING').toBe(mode.toUpperCase());
      const panel = render(doc as unknown as Document, {
        page: p,
        enabled: true,
        stage: () => true,
      }) as unknown as HostElement;
      expect(
        panel
          .all()
          .some((e) => e.dataset.socialServiceCreateAction === 'stage'),
      ).toBe(false);
    }
    f.mode('available');
    const p = f.page();
    options(p).usageLicences = [];
    const panel = render(doc as unknown as Document, {
      page: p,
      enabled: true,
      stage: () => true,
    }) as unknown as HostElement;
    expect(panel.textContent).toContain('未提供可用的首日转介许可');
    expect(panel.textContent).not.toContain('0 XAA');
  });
  it('requires explicit actual pool selection/blank capacity and displays the licensed budget only after valid DATA', () => {
    const f = fixture(),
      doc = new HostDocument('social');
    let value: unknown = null;
    const panel = render(doc as unknown as Document, {
      page: f.page(),
      enabled: true,
      stage: (d) => {
        value = d;
        return true;
      },
    }) as unknown as HostElement;
    doc.root.append(panel);
    const field = (key: string) =>
      panel
        .all()
        .find(
          (e) => e.dataset.socialServiceCreateField === key,
        )! as HostElement & { value: string };
    expect(field('servicePoolId').value).toBe('');
    expect(field('capacity').value).toBe('');
    field('servicePoolId').value = f.parent.poolId;
    field('servicePoolId').listeners.get('change')!();
    field('capacity').value = '4';
    panel
      .all()
      .find((e) => e.dataset.socialServiceCreateAction === 'stage')!
      .click();
    expect(value).toEqual(f.draft);
    expect(panel.textContent).toContain('0 XAA');
    expect(panel.textContent).toContain('当前求职人数 20 person');
  });
  it('uses existing review/one-submit/unknown original recovery without inventing economic FINAL', async () => {
    const f = fixture(),
      c = f.controller();
    await c.refresh();
    expect(c.stageSocialEmploymentServiceCreate(f.draft)).toBe(true);
    await c.confirm();
    expect(f.calls.filter((x) => x.path === '/v1/office-command')).toHaveLength(
      0,
    );
    expect(c.review()).toBe(true);
    await c.confirm();
    expect(c.getState().status).toBe('UNKNOWN');
    const original = c.getState().intent;
    f.head('4');
    f.mode('missing');
    await c.refresh();
    expect(c.getState().intent).toEqual(original);
    expect(c.stageSocialEmploymentServiceCreate(f.draft)).toBe(false);
    await c.confirm();
    c.disconnect();
    const fresh = f.controller();
    await fresh.refresh();
    expect(fresh.restoreOriginalForRecovery(original)).toBe(true);
    await fresh.recoverOriginal();
    expect(fresh.getState().status).toBe('QUEUE_ACK');
    expect(fresh.getState().completion).toBe(false);
    expect(f.calls.filter((x) => x.path === '/v1/office-command')).toHaveLength(
      1,
    );
    const q = f.calls.find((x) => x.path === '/v1/command-recovery')!.body
      .request as { originalRequest: unknown };
    expect(q.originalRequest).toEqual(original);
    fresh.disconnect();
  });
  it('clears an unsubmitted create on refresh and all private options after 403, while missing metadata leaves old PLAN usable', async () => {
    const f = fixture(),
      c = f.controller();
    await c.refresh();
    c.stageSocialEmploymentServiceCreate(f.draft);
    c.review();
    f.mode('missing');
    await c.refresh();
    expect(c.getState().intent).toBeNull();
    expect(c.stageSocialEmploymentServiceCreate(f.draft)).toBe(false);
    expect(
      c.stageSocialEmploymentPlan({
        positionId: 'POSITION_TEST_ONLY',
        servicePoolId: f.parent.poolId,
        requestedMatches: '1',
      }),
    ).toBe(true);
    f.mode('denied');
    await c.refresh();
    expect(c.getState()).toMatchObject({
      status: 'DENIED',
      intent: null,
      socialPoolsPage: null,
      runtimePage: null,
    });
  });
  it('mounts the creation form in the shipped drawer without changing its generic review/recovery surface', async () => {
    const f = fixture(),
      doc = new HostDocument('social');
    vi.stubGlobal(
      'MutationObserver',
      class {
        observe() {}
      },
    );
    let c: ReturnType<typeof createOfficeCommandController> | undefined;
    const api = installOfficeCommand(
      doc as unknown as Document,
      { addEventListener() {} } as unknown as Window,
      (b, v) => {
        c = createOfficeCommandController(b, v, {
          fetcher: f.fetcher,
          requestId: () => f.f.request.requestId,
        });
        return c;
      },
    );
    api.connect(f.binding);
    doc.body
      .all()
      .find((e) => e.dataset.officeCommandAction === 'open')!
      .click();
    await c!.refresh();
    expect(
      doc.body
        .all()
        .some((e) => e.dataset.socialServiceCreateAction === 'stage'),
    ).toBe(true);
    expect(
      doc.body.all().some((e) => e.dataset.officeCommandAction === 'review'),
    ).toBe(true);
    api.disconnect();
  });
});
