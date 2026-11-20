/** TEST_ONLY source wire / DOM protocol, not real JWT/Node/browser execution,
 * service creation, successful matching or an economic FINAL. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUTHENTICATED_OFFICE_COMMAND_SCHEMA } from '@econmind/core/authenticated-office-command-contract';
import { createOfficeCommandController } from '../../apps/world-web/src/office-command/controller.js';
import { installOfficeCommand } from '../../apps/world-web/src/office-command/view.js';
import {
  buildSocialEmploymentPlanRequest,
  readSocialEmploymentPlanOptions,
  renderSocialEmploymentPlanForm,
} from '../../apps/world-web/src/social-employment/plan-form.js';
import {
  POSTWAR_RUNTIME_SCHEMA,
  POSTWAR_RUNTIME_PATH,
  type RuntimePage,
} from '../../apps/world-web/src/postwar-office-runtime/client.js';
import { AUTHENTICATED_COMMAND_RECOVERY_SCHEMA } from '@econmind/core/authenticated-command-recovery-contract';
import { officeCommandFixture } from './office-command-fixture.js';
import { HostDocument, type HostElement } from './trusted-host-dom.js';
afterEach(() => vi.unstubAllGlobals());
const fp = 'sha256:' + 'a'.repeat(64);
function fixture() {
  const base = officeCommandFixture('social');
  const read = {
    ...base.binding.read,
    identity: {
      ...base.binding.read.identity,
      projectionVersion: POSTWAR_RUNTIME_SCHEMA,
    },
    endpoints: {
      ...base.binding.read.endpoints,
      projectionPath: POSTWAR_RUNTIME_PATH,
    },
    world: { ...base.binding.read.world, minimumWorldVersion: '0' },
  };
  let live = true;
  read.currentIdentity = () => (live ? read.identity : null);
  const binding = { ...base.binding, read };
  let fault = 'valid';
  let h = '7';
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  const wire = (
    dataset: string,
    requestId = base.request.requestId,
    offset = 0,
  ) => {
    const empty = fault === 'empty' && dataset === 'service-pools';
    const hv = fault === 'head' && dataset === 'service-pools' ? '8' : h;
    return {
      schemaVersion: POSTWAR_RUNTIME_SCHEMA,
      requestId,
      ok: true,
      status: empty ? 'EMPTY' : 'AVAILABLE',
      dataset,
      authority: {
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
          worldVersion: hv,
          eventSequence: '12',
          readbackRef: 'READBACK_TEST_ONLY',
        },
      },
      source: {
        ...read.identity,
        worldId: read.world.worldId,
        seedRef: read.world.seedRef,
        contentHash: read.world.contentHash,
        admissionRef: read.world.admissionRef,
        sourceVersion: fp,
        bindingVersion: fp,
        sourceRevision: 'TEST_ONLY_WIRE',
        pageHash: 'a'.repeat(64),
        returnedRowsHash: 'a'.repeat(64),
        hashAlgorithm: 'POSTGRES_JSONB_TEXT_UTF8_SHA256',
        sourcePointer: { classification: 'TEST_ONLY_NOT_AUTHORITY' },
        dataNature: 'ADMITTED_CURRENT_SOCIAL_MIXED_FINANCIAL_PREFIX',
        worldVersion: hv,
        eventSequence: '12',
        originWorldVersion: '0',
        originEventSequence: '0',
        observedHead: { worldVersion: hv, eventSequence: '12' },
        currentPrefixCoverage: {
          schemaVersion: 'postwar-social-current-prefix-coverage-v3',
          reducerVersion: 'POSTWAR_SOCIAL_FINANCE_FX_COMPLETE_PREFIX_V3',
          countryId: read.identity.countryId,
          coverageRef: 'COVERAGE_TEST_ONLY',
          globalWorldVersion: hv,
          globalEventSequence: '12',
          originWorldVersion: '0',
          originEventSequence: '0',
          prefixFingerprint: fp,
          knownEffectsFingerprint: fp,
          coveredThroughEventId: 'EVENT_TEST_ONLY',
          coveredThroughEventFingerprint: fp,
          financialPostingCount: '6',
          financialBatchCount: '2',
          financialPostingsFingerprint: fp,
          employmentStateHash: fp,
          materializationHash: fp,
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
        : dataset === 'positions'
          ? [
              {
                positionId: 'POSITION_TEST_ONLY_' + offset,
                countryId: read.identity.countryId,
                locationId: 'LOCATION_TEST_ONLY',
                skill: 'MEDIUM',
                owner: 'PRIVATE_SECTOR',
                classificationId: 'SECTOR_TEST_ONLY',
                requiredCount: '5',
                employedCount: '1',
              },
            ]
          : [
              {
                poolId: 'POOL_TEST_ONLY_' + offset,
                countryId: read.identity.countryId,
                locationId: 'LOCATION_TEST_ONLY',
                skill: 'MEDIUM',
                dayIndex: String(3 + offset),
                ruleVersion: 'SOCIAL_JOB_MATCH_RULE_V1',
                capacitySlots: '8',
                usedSlots: '2',
                reservedSlots: '1',
              },
            ],
    };
  };
  const fetcher: typeof fetch = async (url, init) => {
    const path = new URL(String(url)).pathname,
      body = JSON.parse(String(init?.body));
    calls.push({ path, body });
    if (path === '/v1/office-command') throw Error('TEST_ONLY_ACK_LOST');
    if (path === '/v1/command-recovery') {
      const original = body.request.originalRequest;
      return Response.json({
        schemaVersion: AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
        requestId: body.requestId,
        ok: true,
        state: {
          status: 'QUEUED',
          commandType: original.request.commandType,
          commandId: original.request.commandId,
          idempotencyKey: original.request.idempotencyKey,
          commandFingerprint: fp,
        },
      });
    }
    if (body.dataset === 'service-pools' && fault === 'denied')
      return new Response(null, { status: 403 });
    if (body.dataset === 'service-pools' && fault === 'failure')
      return new Response(null, { status: 503 });
    return Response.json(wire(body.dataset, body.requestId, body.page.offset));
  };
  const controller = () =>
    createOfficeCommandController(binding, () => binding.view, {
      fetcher,
      requestId: () => base.request.requestId,
    });
  const positions = () =>
    ({ ...wire('positions'), status: 'PAGE' }) as unknown as RuntimePage;
  const pools = () =>
    ({
      ...wire('service-pools'),
      status: fault === 'empty' ? 'EMPTY' : 'PAGE',
    }) as unknown as RuntimePage;
  const draft = {
    positionId: 'POSITION_TEST_ONLY_0',
    servicePoolId: 'POOL_TEST_ONLY_0',
    requestedMatches: '3',
  };
  const build = (d = draft) =>
    buildSocialEmploymentPlanRequest({
      positions: positions(),
      pools: pools(),
      worldId: read.identity.worldId,
      countryId: read.identity.countryId,
      draft: d,
      requestId: base.request.requestId,
      commandId: 'COMMAND_SOCIAL_TEST_ONLY',
      idempotencyKey: 'KEY_SOCIAL_TEST_ONLY',
    });
  return {
    binding,
    controller,
    positions,
    pools,
    draft,
    build,
    calls,
    fetcher,
    fault: (v: string) => (fault = v),
    head: (v: string) => (h = v),
    loseIdentity: () => {
      live = false;
    },
  };
}
describe('source-bound existing Social employment PLAN form', () => {
  it('uses real selected row fields and exact seven-field PLAN payload, not CreateService', () => {
    const f = fixture(),
      q = f.build();
    expect(q.schemaVersion).toBe(AUTHENTICATED_OFFICE_COMMAND_SCHEMA);
    expect(q.request).toMatchObject({
      officeId: 'SOCIAL',
      expectedWorldVersion: '7',
      commandType: 'CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1',
      payload: {
        schemaVersion: 'social-employment-service-plan-v1',
        positionId: f.draft.positionId,
        servicePoolId: f.draft.servicePoolId,
        locationId: 'LOCATION_TEST_ONLY',
        skill: 'MEDIUM',
        dueDayIndex: '3',
        requestedMatches: '3',
      },
    });
    expect(Object.keys(q.request.payload as object)).toHaveLength(7);
  });
  it.each(['', '0', '01', '1.5', '5', '9007199254740993'])(
    'rejects absent/noncanonical/count beyond visible vacancies or pool capacity: %s',
    (requestedMatches) => {
      const f = fixture();
      expect(() => f.build({ ...f.draft, requestedMatches })).toThrow();
    },
  );
  it('rejects forged IDs, cross-head, cross-country and mismatching source prefix', () => {
    const f = fixture();
    expect(() =>
      f.build({ ...f.draft, positionId: 'UNREAD_POSITION' }),
    ).toThrow();
    f.fault('head');
    expect(() => f.build()).toThrow();
    f.fault('valid');
    const p = structuredClone(f.pools());
    (p.rows[0] as Record<string, unknown>).countryId = 'COUNTRY_FOREIGN';
    expect(() =>
      readSocialEmploymentPlanOptions(
        f.positions(),
        p,
        f.binding.read.identity.countryId,
      ),
    ).toThrow();
    const other = structuredClone(f.pools());
    (
      other.source.currentPrefixCoverage as Record<string, unknown>
    ).prefixFingerprint = 'sha256:' + 'b'.repeat(64);
    expect(() =>
      readSocialEmploymentPlanOptions(
        f.positions(),
        other,
        f.binding.read.identity.countryId,
      ),
    ).toThrow();
  });
  it('renders explicit selections and blank quantity, preserves day/source/unit and stages only after user input', () => {
    const f = fixture(),
      doc = new HostDocument('social');
    let submitted: unknown = null;
    const panel = renderSocialEmploymentPlanForm(doc as unknown as Document, {
      positions: f.positions(),
      pools: f.pools(),
      countryId: f.binding.read.identity.countryId,
      enabled: true,
      code: null,
      stage: (d) => {
        submitted = d;
        return true;
      },
    }) as unknown as HostElement;
    doc.root.append(panel);
    const field = (name: string) =>
      panel
        .all()
        .find((e) => e.dataset.socialPlanField === name)! as HostElement & {
        value: string;
      };
    expect(field('positionId').value).toBe('');
    expect(field('servicePoolId').value).toBe('');
    expect(field('requestedMatches').value).toBe('');
    field('positionId').value = f.draft.positionId;
    field('positionId').listeners.get('change')!();
    field('servicePoolId').value = f.draft.servicePoolId;
    field('servicePoolId').listeners.get('change')!();
    field('requestedMatches').value = '3';
    panel
      .all()
      .find((e) => e.dataset.socialPlanAction === 'stage')!
      .click();
    expect(submitted).toEqual(f.draft);
    expect(panel.textContent).toContain('服务日索引 3');
    expect(panel.textContent).toContain('空闲服务容量 5 person');
    expect(panel.textContent).toContain('授权页范围 [0, 1) / 2');
    expect(panel.textContent).toContain('9个创建输入仍未接通');
  });
  it('reads both current datasets and uses existing review before one-submit protocol', async () => {
    const f = fixture(),
      c = f.controller();
    await c.refresh();
    expect(c.getState().status).toBe('CURRENT_AUTHORIZED_HEAD');
    expect(c.getState().socialPoolsPage?.dataset).toBe('service-pools');
    expect(c.stageSocialEmploymentPlan(f.draft)).toBe(true);
    expect(c.getState().status).toBe('REVIEW_REQUIRED');
    await c.confirm();
    expect(f.calls.filter((x) => x.path === '/v1/office-command')).toHaveLength(
      0,
    );
    expect(c.review()).toBe(true);
    await c.confirm();
    expect(c.getState().status).toBe('UNKNOWN');
    expect(f.calls.filter((x) => x.path === '/v1/office-command')).toHaveLength(
      1,
    );
    c.disconnect();
  });
  it('refresh clears unsubmitted reviewed intent; failed and empty side pages remain distinct', async () => {
    const f = fixture(),
      c = f.controller();
    await c.refresh();
    c.stageSocialEmploymentPlan(f.draft);
    c.review();
    f.fault('failure');
    await c.refresh();
    expect(c.getState().intent).toBeNull();
    expect(c.getState().socialPoolsPage).toBeNull();
    expect(c.getState().socialPoolsCode).toBe('UNAVAILABLE');
    expect(c.stageSocialEmploymentPlan(f.draft)).toBe(false);
    f.fault('empty');
    await c.refresh();
    expect(c.getState().socialPoolsPage?.status).toBe('EMPTY');
    expect(c.getState().socialPoolsCode).toBeNull();
    expect(c.stageSocialEmploymentPlan(f.draft)).toBe(false);
    c.disconnect();
  });
  it('403 clears all current choices and staged intent; cross-head does not join stale data', async () => {
    const f = fixture(),
      c = f.controller();
    await c.refresh();
    c.stageSocialEmploymentPlan(f.draft);
    f.fault('denied');
    await c.refresh();
    expect(c.getState().status).toBe('DENIED');
    expect(c.getState().runtimePage).toBeNull();
    expect(c.getState().socialPoolsPage).toBeNull();
    expect(c.getState().intent).toBeNull();
    const g = fixture(),
      d = g.controller();
    g.fault('head');
    await d.refresh();
    expect(d.getState().code).toBe('STALE');
    expect(d.getState().socialPoolsPage).toBeNull();
    d.disconnect();
  });
  it('identity loss clears the newly added private pool page and unsubmitted plan', async () => {
    const f = fixture(),
      c = f.controller();
    await c.refresh();
    c.stageSocialEmploymentPlan(f.draft);
    f.loseIdentity();
    expect(c.getState().socialPoolsPage).toBeNull();
    expect(c.getState().runtimePage).toBeNull();
    expect(c.getState().intent).toBeNull();
    expect(c.getState().canStage).toBe(false);
  });
  it('pages exact positions/pools and derives due day from the chosen pool', async () => {
    const f = fixture(),
      c = f.controller();
    await c.refresh();
    await c.nextSocialPoolsPage();
    expect(
      c.stageSocialEmploymentPlan({
        ...f.draft,
        servicePoolId: 'POOL_TEST_ONLY_1',
      }),
    ).toBe(true);
    expect(
      (c.getState().intent?.request.payload as Record<string, unknown>)
        .dueDayIndex,
    ).toBe('4');
    await c.nextSocialPositionsPage();
    expect(c.getState().intent).toBeNull();
    expect(c.getState().runtimePage?.page.offset).toBe(1);
    expect(c.getState().socialPoolsPage?.page.offset).toBe(0);
    c.disconnect();
  });
  it('UNKNOWN refresh preserves the exact original, F5 restores query only, neither re-submits', async () => {
    const f = fixture(),
      c = f.controller();
    await c.refresh();
    c.stageSocialEmploymentPlan(f.draft);
    c.review();
    await c.confirm();
    const original = c.getState().intent;
    expect(original).not.toBeNull();
    f.head('8');
    await c.refresh();
    expect(c.getState().intent).toEqual(original);
    expect(
      c.stageSocialEmploymentPlan({ ...f.draft, requestedMatches: '2' }),
    ).toBe(false);
    await c.confirm();
    c.disconnect();
    const fresh = f.controller();
    await fresh.refresh();
    expect(fresh.restoreOriginalForRecovery(original)).toBe(true);
    expect(fresh.getState().canConfirm).toBe(false);
    await fresh.recoverOriginal();
    expect(fresh.getState().status).toBe('QUEUE_ACK');
    const recovery = f.calls.find((x) => x.path === '/v1/command-recovery')!
      .body.request as { originalRequest: unknown };
    expect(recovery.originalRequest).toEqual(original);
    expect(f.calls.filter((x) => x.path === '/v1/office-command')).toHaveLength(
      1,
    );
    fresh.disconnect();
  });
  it('mounts the typed PLAN form in the shipped Social command drawer', async () => {
    const f = fixture(),
      doc = new HostDocument('social');
    vi.stubGlobal(
      'MutationObserver',
      class {
        observe() {}
      },
    );
    let active: ReturnType<typeof createOfficeCommandController> | undefined;
    const api = installOfficeCommand(
      doc as unknown as Document,
      { addEventListener() {} } as unknown as Window,
      (binding, view) => {
        active = createOfficeCommandController(binding, view, {
          fetcher: f.fetcher,
          requestId: () => f.build().requestId,
        });
        return active;
      },
    );
    api.connect(f.binding);
    doc.body
      .all()
      .find((x) => x.dataset.officeCommandAction === 'open')!
      .click();
    await active!.refresh();
    expect(
      doc.body
        .all()
        .some((x) => Object.hasOwn(x.dataset, 'socialEmploymentPlanForm')),
    ).toBe(true);
    expect(doc.body.textContent).toContain('既有就业服务撮合计划');
    api.disconnect();
  });
});
