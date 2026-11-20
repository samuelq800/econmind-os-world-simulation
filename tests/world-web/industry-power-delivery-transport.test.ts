/** Shipped browser/controller over explicit synthetic planning and receipt
 * responses. This is not actual service WORK, payment or backend delivery. */
import { describe, expect, it } from 'vitest';
import { parseIndustryUtilityPlanningRow } from '../../packages/core/src/read-models/postwar-industry-utility-planning-contract.js';
import {
  isManualIndustryUtilityPayload,
  MANUAL_INDUSTRY_UTILITY_COMMANDS,
} from '@econmind/core/authenticated-office-command-contract';
import {
  buildIndustryUtilityRequest,
  renderIndustryUtilityForm,
} from '../../apps/world-web/src/industry-utility/form.js';
import { createOfficeCommandController } from '../../apps/world-web/src/office-command/controller.js';
import {
  industryUtilityPlanningWireFixture,
  planningRow,
  planningRequestId,
} from '../support/industry-utility-planning-fixture.js';
import { HostDocument, type HostElement } from './trusted-host-dom.js';
const draft = (planningRef: string) => ({
  planningRef,
  quantity: '',
  startsAtSimTime: '',
  endsAtSimTime: '',
});
function build() {
  const row = planningRow('POWER', 'DELIVER');
  return {
    row,
    request: buildIndustryUtilityRequest({
      row,
      draft: draft(row.planningRef),
      worldId: 'WORLD_TEST_ONLY',
      countryId: row.countryId,
      worldVersion: '7',
      requestId: planningRequestId,
      commandId: 'COMMAND_DELIVER_TEST_ONLY',
      idempotencyKey: 'KEY_DELIVER_TEST_ONLY',
    }),
  };
}
function controller(f: ReturnType<typeof industryUtilityPlanningWireFixture>) {
  return createOfficeCommandController(f.binding, () => f.binding.view, {
    fetcher: f.fetcher,
    requestId: () => planningRequestId,
  });
}
describe('POWER delivery uses only actual planning references', () => {
  it('copies the selected booking/committed-event identifiers without creating paid amount or delivered quantity', () => {
    const { row, request } = build();
    if (row.action !== 'DELIVER') throw Error('DELIVERY_ROW_REQUIRED');
    expect(request.request.payload).toMatchObject({
      serviceKind: 'POWER',
      facilityId: row.facilityId,
      runId: row.runId,
      sourceRef: row.sourceRef,
      sourceRawSha256: row.sourceRawSha256,
      operation: row.parameters.operation,
    });
    const op = (
      request.request.payload as { operation: Record<string, unknown> }
    ).operation;
    expect(Object.keys(op).sort()).toEqual([
      'action',
      'bookingRef',
      'paymentEventFingerprint',
      'workEventFingerprint',
    ]);
    expect(
      isManualIndustryUtilityPayload(
        MANUAL_INDUSTRY_UTILITY_COMMANDS.POWER,
        request.request.payload,
      ),
    ).toBe(true);
    expect(() =>
      buildIndustryUtilityRequest({
        row,
        draft: { ...draft(row.planningRef), quantity: '1' },
        worldId: 'WORLD_TEST_ONLY',
        countryId: row.countryId,
        worldVersion: '7',
        requestId: planningRequestId,
        commandId: 'COMMAND_TEST_ONLY',
        idempotencyKey: 'KEY_TEST_ONLY',
      }),
    ).toThrow();
  });
  it('renders protected references for review while quantity/time fields stay disabled and blank', () => {
    const doc = new HostDocument('industry'),
      row = planningRow('POWER', 'DELIVER');
    let staged: unknown;
    const panel = renderIndustryUtilityForm(
      doc as unknown as Document,
      [row],
      true,
      'PAGE',
      (value) => {
        staged = value;
        return true;
      },
    );
    doc.body.append(panel as unknown as HostElement);
    expect(panel.textContent).toContain('BOOKING_TEST_ONLY');
    for (const field of ['quantity', 'startsAtSimTime', 'endsAtSimTime']) {
      const input = panel.querySelector<HTMLInputElement>(
        `[data-industry-utility-field="${field}"]`,
      );
      expect(input?.disabled).toBe(true);
      expect(input?.value).toBe('');
    }
    panel
      .querySelector<HTMLButtonElement>(
        '[data-industry-utility-action="stage"]',
      )!
      .click();
    expect(staged).toEqual(draft(row.planningRef));
  });
  it.each([
    { bookingRef: '' },
    { workEventFingerprint: 'INVALID' },
    { paymentEventFingerprint: false },
    { paidAmount: '1' },
    { deliveredMWh: '1' },
    { paid: true },
  ])('rejects missing or reported results %j', (change) => {
    const row = planningRow('POWER', 'DELIVER');
    if (row.action !== 'DELIVER') throw Error('DELIVERY_ROW_REQUIRED');
    const op = { ...row.parameters.operation, ...change };
    expect(() =>
      parseIndustryUtilityPlanningRow({
        ...row,
        parameters: { operation: op },
      }),
    ).toThrow();
    const { request } = build();
    expect(
      isManualIndustryUtilityPayload(MANUAL_INDUSTRY_UTILITY_COMMANDS.POWER, {
        ...(request.request.payload as object),
        operation: op,
      }),
    ).toBe(false);
  });
  it('recovers the exact original after reload without requiring a new current planning row or resubmitting delivery', async () => {
    const f = industryUtilityPlanningWireFixture(),
      row = planningRow('POWER', 'DELIVER', f.binding.read.identity.countryId);
    f.setRows([row]);
    const first = controller(f);
    await first.refresh();
    expect(first.stageIndustryUtility(draft(row.planningRef))).toBe(true);
    const original = first.getState().intent!;
    expect(first.review()).toBe(true);
    await first.confirm();
    expect(first.getState().status).toBe('QUEUE_ACK');
    first.disconnect();
    f.setMode('UNAVAILABLE');
    const restored = controller(f);
    expect(restored.restoreOriginalForRecovery(original)).toBe(true);
    await restored.recoverOriginal();
    expect(restored.getState()).toMatchObject({
      receipt: { outcome: 'COMMITTED' },
      utilityPlanningPage: null,
      currentHead: { worldVersion: '8' },
      canConfirm: false,
      completion: false,
    });
    expect(restored.getState().intent?.request.expectedWorldVersion).toBe('7');
    await restored.confirm();
    expect(f.calls.filter((c) => c.path === '/v1/office-command')).toHaveLength(
      1,
    );
    restored.disconnect();
  });
  it('clears delivery references on actual403 and cannot stage a source row from another country', async () => {
    for (const mode of ['DENIED', 'FOREIGN'] as const) {
      const f = industryUtilityPlanningWireFixture(),
        row = planningRow(
          'POWER',
          'DELIVER',
          f.binding.read.identity.countryId,
        );
      f.setRows([row]);
      f.setMode(mode);
      const c = controller(f);
      try {
        await c.refresh();
        expect(c.getState().utilityPlanningPage).toBeNull();
        expect(c.stageIndustryUtility(draft(row.planningRef))).toBe(false);
        await c.confirm();
        expect(f.calls.some((x) => x.path === '/v1/office-command')).toBe(
          false,
        );
      } finally {
        c.disconnect();
      }
    }
  });
});
