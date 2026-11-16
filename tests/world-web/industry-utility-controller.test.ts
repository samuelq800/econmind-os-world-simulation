/** Actual shipped clients/controller over explicit synthetic responses.
 * No backend/source/queue/native service execution is claimed. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseIndustryUtilityPlanningRow } from '../../packages/core/src/read-models/postwar-industry-utility-planning-contract.js';
import { createOfficeCommandController } from '../../apps/world-web/src/office-command/controller.js';
import { installOfficeCommand } from '../../apps/world-web/src/office-command/view.js';
import { HostDocument } from './trusted-host-dom.js';
import {
  industryUtilityPlanningWireFixture,
  planningRow,
  planningRequestId,
} from '../support/industry-utility-planning-fixture.js';
function controller(f: ReturnType<typeof industryUtilityPlanningWireFixture>) {
  return createOfficeCommandController(f.binding, () => f.binding.view, {
    fetcher: f.fetcher,
    requestId: () => planningRequestId,
  });
}
const draft = (ref: string) => ({
  planningRef: ref,
  quantity: '2',
  startsAtSimTime: '20',
  endsAtSimTime: '30',
});
afterEach(() => vi.unstubAllGlobals());
function pagedFixture(unknownSubmission = false) {
  const f = industryUtilityPlanningWireFixture();
  f.setRows(
    Array.from({ length: 26 }, (_, index) => ({
      ...planningRow('POWER', 'BOOK', f.binding.read.identity.countryId),
      planningRef: 'PLANNING_PAGE_TEST_ONLY_' + index,
    })),
  );
  const fetcher: typeof fetch = async (url, init) => {
    const response = await f.fetcher(url, init);
    const body = JSON.parse(String(init?.body)) as {
      dataset?: string;
      page?: { offset: number };
    };
    if (
      unknownSubmission &&
      new URL(String(url)).pathname === '/v1/office-command'
    )
      throw Error('TEST_ONLY_ACK_LOST_AFTER_SUBMISSION');
    if (body.dataset !== 'industry-utility-planning' || !response.ok)
      return response;
    const wire = (await response.json()) as { rows: unknown[]; page: object };
    const offset = body.page?.offset ?? 0,
      total = wire.rows.length;
    wire.rows = wire.rows.slice(offset, offset + 25);
    wire.page = {
      offset,
      limit: 25,
      total,
      returned: wire.rows.length,
      nextOffset:
        offset + wire.rows.length < total ? offset + wire.rows.length : null,
    };
    return Response.json(wire);
  };
  return { ...f, fetcher };
}
describe('Industry source-bound service selection and original recovery', () => {
  it.each(['QUEUE_ACK', 'UNKNOWN', 'FINAL_VERIFIED'] as const)(
    'reads the next utility page after %s without changing the original request or resubmitting',
    async (status) => {
      const f = pagedFixture(status === 'UNKNOWN'),
        c = controller(f);
      try {
        await c.refresh();
        expect(c.stageIndustryUtility(draft('PLANNING_PAGE_TEST_ONLY_0'))).toBe(
          true,
        );
        expect(c.review()).toBe(true);
        await c.confirm();
        if (status === 'FINAL_VERIFIED') await c.recoverOriginal();
        const before = c.getState();
        expect(before.status).toBe(status);
        expect(before.canRead).toBe(true);
        expect(before.canStage).toBe(false);
        await c.nextIndustryUtilityPlanningPage();
        const after = c.getState();
        expect(after.utilityPlanningPage?.page).toMatchObject({
          offset: 25,
          returned: 1,
          total: 26,
          nextOffset: null,
        });
        expect(after.status).toBe(status);
        expect(after.intent).toEqual(before.intent);
        expect(after.acknowledgement).toEqual(before.acknowledgement);
        expect(after.receipt).toEqual(before.receipt);
        expect(
          c.stageIndustryUtility(draft('PLANNING_PAGE_TEST_ONLY_25')),
        ).toBe(false);
        expect(c.review()).toBe(false);
        await c.confirm();
        const count = f.calls.length;
        await c.nextIndustryUtilityPlanningPage();
        expect(f.calls).toHaveLength(count);
        expect(
          f.calls.filter((call) => call.path === '/v1/office-command'),
        ).toHaveLength(1);
        if (status !== 'FINAL_VERIFIED') {
          await c.recoverOriginal();
          expect(c.getState().status).toBe('FINAL_VERIFIED');
          expect(c.getState().intent).toEqual(before.intent);
        }
      } finally {
        c.disconnect();
      }
    },
  );
  it.each(['UNAVAILABLE', 'DENIED', 'STALE_HEAD'] as const)(
    'clears the previous utility page after %s on continuation and never replays the command',
    async (mode) => {
      const f = pagedFixture(),
        c = controller(f);
      try {
        await c.refresh();
        expect(c.stageIndustryUtility(draft('PLANNING_PAGE_TEST_ONLY_0'))).toBe(
          true,
        );
        expect(c.review()).toBe(true);
        await c.confirm();
        const original = c.getState().intent;
        f.setMode(mode);
        await c.nextIndustryUtilityPlanningPage();
        expect(c.getState().utilityPlanningPage).toBeNull();
        expect(c.getState().canStage).toBe(false);
        if (mode === 'DENIED') {
          expect(c.getState()).toMatchObject({
            status: 'DENIED',
            intent: null,
            receipt: null,
            canRead: false,
          });
          const count = f.calls.length;
          await c.nextIndustryUtilityPlanningPage();
          expect(f.calls).toHaveLength(count);
        } else {
          expect(c.getState().intent).toEqual(original);
          if (mode === 'UNAVAILABLE')
            expect(c.getState().utilityPlanningCode).toBe(
              'TEST_ONLY_SOURCE_MISSING',
            );
          else expect(c.getState().status).toBe('UNAVAILABLE');
        }
        await c.confirm();
        expect(
          f.calls.filter((call) => call.path === '/v1/office-command'),
        ).toHaveLength(1);
      } finally {
        c.disconnect();
      }
    },
  );
  it('keeps the rendered next-page control usable after a restored FINAL while command controls remain locked', async () => {
    vi.stubGlobal(
      'MutationObserver',
      class {
        observe() {}
      },
    );
    const f = pagedFixture(),
      doc = new HostDocument('industry');
    let active: ReturnType<typeof controller> | undefined;
    const ui = installOfficeCommand(
      doc as unknown as Document,
      { addEventListener() {} } as unknown as Window,
      (binding, view) => {
        active = createOfficeCommandController(binding, view, {
          fetcher: f.fetcher,
          requestId: () => planningRequestId,
        });
        return active;
      },
    );
    try {
      ui.connect(f.binding);
      const c = active!;
      await c.refresh();
      expect(c.stageIndustryUtility(draft('PLANNING_PAGE_TEST_ONLY_0'))).toBe(
        true,
      );
      const original = c.getState().intent;
      expect(c.review()).toBe(true);
      await c.confirm();
      ui.connect(f.binding);
      const restored = active!;
      expect(restored.restoreOriginalForRecovery(original)).toBe(true);
      await restored.recoverOriginal();
      doc.body
        .all()
        .find((el) => el.dataset.officeCommandAction === 'open')!
        .click();
      const button = doc.body
        .all()
        .find(
          (el) => el.dataset.officeCommandAction === 'next-utility-planning',
        );
      expect(button).toBeDefined();
      expect(button!.disabled).toBe(false);
      button!.click();
      await expect
        .poll(() => ui.getState().utilityPlanningPage?.page.offset)
        .toBe(25);
      expect(ui.getState()).toMatchObject({
        status: 'FINAL_VERIFIED',
        canConfirm: false,
        canStage: false,
      });
      expect(ui.getState().intent).toEqual(original);
      expect(
        f.calls.filter((call) => call.path === '/v1/office-command'),
      ).toHaveLength(1);
    } finally {
      ui.disconnect();
    }
  });
  it('keeps an authorized blocked WATER row visible but cannot stage or submit it', async () => {
    const f = industryUtilityPlanningWireFixture();
    const blocked = parseIndustryUtilityPlanningRow({
      ...planningRow('WATER', 'DELIVER', f.binding.read.identity.countryId),
      action: 'BLOCKED',
      parameters: {
        reasonCode: 'WATER_SERVICE_WORK_REQUIRED',
        observedAtSimTime: '0',
      },
    });
    f.setRows([blocked]);
    const c = controller(f);
    try {
      await c.refresh();
      expect(c.getState().utilityPlanningPage?.status).toBe('PAGE');
      expect(c.getState().utilityPlanningPage?.rows[0]).toEqual(blocked);
      expect(
        c.stageIndustryUtility({
          planningRef: blocked.planningRef,
          quantity: '',
          startsAtSimTime: '',
          endsAtSimTime: '',
        }),
      ).toBe(false);
      expect(c.getState().intent).toBeNull();
      expect(c.review()).toBe(false);
      await c.confirm();
      expect(
        f.calls.filter((call) => call.path === '/v1/office-command'),
      ).toHaveLength(0);
    } finally {
      c.disconnect();
    }
  });
  it('loads actual source/RUN refs, submits only once, then restores the old original after F5 for query only', async () => {
    const f = industryUtilityPlanningWireFixture(),
      first = controller(f);
    await first.refresh();
    const row = first.getState().utilityPlanningPage!.rows[0]!;
    expect(first.stageIndustryUtility(draft(String(row.planningRef)))).toBe(
      true,
    );
    const original = first.getState().intent!;
    expect(original.request.payload).toMatchObject({
      runId: row.runId,
      sourceRef: row.sourceRef,
      sourceRawSha256: row.sourceRawSha256,
    });
    expect(first.review()).toBe(true);
    await first.confirm();
    expect(first.getState().status).toBe('QUEUE_ACK');
    first.disconnect();
    const fresh = controller(f);
    expect(fresh.restoreOriginalForRecovery(original)).toBe(true);
    await fresh.recoverOriginal();
    expect(fresh.getState()).toMatchObject({
      receipt: { outcome: 'COMMITTED' },
      currentHead: { worldVersion: '8' },
      canConfirm: false,
      completion: false,
    });
    await fresh.confirm();
    expect(f.calls.filter((c) => c.path === '/v1/office-command')).toHaveLength(
      1,
    );
    expect(
      f.calls.filter((c) => c.path === '/v1/command-recovery'),
    ).toHaveLength(1);
    f.invalidate();
    expect(fresh.getState()).toMatchObject({
      utilityPlanningPage: null,
      intent: null,
      receipt: null,
      currentHead: null,
      canStage: false,
    });
    fresh.disconnect();
  });
  it.each(['EMPTY', 'UNAVAILABLE', 'FOREIGN', 'STALE_HEAD', 'DENIED'] as const)(
    'cannot stage a utility using %s planning data',
    async (mode) => {
      const f = industryUtilityPlanningWireFixture();
      f.setMode(mode);
      const c = controller(f);
      try {
        await c.refresh();
        expect(c.stageIndustryUtility(draft(planningRow().planningRef))).toBe(
          false,
        );
        await c.confirm();
        expect(
          f.calls.filter((x) => x.path === '/v1/office-command'),
        ).toHaveLength(0);
        if (mode === 'EMPTY')
          expect(c.getState().utilityPlanningPage?.status).toBe('EMPTY');
        else expect(c.getState().utilityPlanningPage).toBeNull();
        if (mode === 'DENIED')
          expect(c.getState()).toMatchObject({
            runtimePage: null,
            intent: null,
            canStage: false,
          });
      } finally {
        c.disconnect();
      }
    },
  );
  it('selects a protected logistics work order without allowing a different reference or editable performed time', async () => {
    const f = industryUtilityPlanningWireFixture(),
      row = planningRow(
        'LOGISTICS',
        'SERVICE_WORK',
        f.binding.read.identity.countryId,
      );
    f.setRows([row]);
    const c = controller(f);
    try {
      await c.refresh();
      expect(
        c.stageIndustryUtility({
          planningRef: row.planningRef,
          quantity: '',
          startsAtSimTime: '',
          endsAtSimTime: '',
        }),
      ).toBe(true);
      expect(c.getState().intent?.request.payload).toMatchObject({
        runId: row.runId,
        operation: {
          action: 'SERVICE_WORK',
          workOrderRef: 'ORDER_TEST_ONLY',
          workOrderSha256: row.sourceRawSha256,
        },
      });
      expect(
        c.stageIndustryUtility({
          planningRef: 'FOREIGN',
          quantity: '',
          startsAtSimTime: '',
          endsAtSimTime: '',
        }),
      ).toBe(false);
    } finally {
      c.disconnect();
    }
  });
});
