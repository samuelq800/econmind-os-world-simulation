/** Actual shipped clients/controller over explicit synthetic responses.
 * No backend/source/queue/native service execution is claimed. */
import { describe, expect, it } from 'vitest';
import { parseIndustryUtilityPlanningRow } from '../../packages/core/src/read-models/postwar-industry-utility-planning-contract.js';
import { createOfficeCommandController } from '../../apps/world-web/src/office-command/controller.js';
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
describe('Industry source-bound service selection and original recovery', () => {
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
