/** Synthetic source rows and DOM only, not a live server or service delivery. */
import { describe, expect, it } from 'vitest';
import {
  buildIndustryUtilityRequest,
  renderIndustryUtilityForm,
} from '../../apps/world-web/src/industry-utility/form.js';
import {
  planningRow,
  planningRequestId,
} from '../support/industry-utility-planning-fixture.js';
import { HostDocument } from './trusted-host-dom.js';
const draft = {
  planningRef: planningRow().planningRef,
  quantity: '2',
  startsAtSimTime: '20',
  endsAtSimTime: '30',
};
const build = (
  row = planningRow(),
  d = { ...draft, planningRef: row.planningRef },
) =>
  buildIndustryUtilityRequest({
    row,
    draft: d,
    worldId: 'WORLD_TEST_ONLY',
    countryId: row.countryId,
    worldVersion: '7',
    requestId: planningRequestId,
    commandId: 'COMMAND_NEW_TEST_ONLY',
    idempotencyKey: 'KEY_NEW_TEST_ONLY',
  });
describe('Industry utility real-reference form transport', () => {
  it('copies actual selected RUN/source/purpose while leaving quantity/window to the user', () => {
    expect(build()).toMatchObject({
      request: {
        officeId: 'INDUSTRY',
        expectedWorldVersion: '7',
        payload: {
          facilityId: planningRow().facilityId,
          runId: planningRow().runId,
          sourceRef: planningRow().sourceRef,
          sourceRawSha256: planningRow().sourceRawSha256,
          operation: {
            action: 'BOOK',
            outputMWh: '2',
            fromSimTime: '20',
            throughSimTime: '30',
            purpose: 'INDUSTRY_SELF_USE',
            bookingRef: 'COMMAND_NEW_TEST_ONLY_BOOKING',
          },
        },
      },
    });
  });
  it('creates a named logistics request with the actual material unit and the existing source direction', () => {
    const row = planningRow('LOGISTICS', 'BOOK');
    expect(build(row)).toMatchObject({
      request: {
        payload: {
          runId: row.runId,
          operation: {
            action: 'BOOK',
            transferId: 'COMMAND_NEW_TEST_ONLY_TRANSFER',
            request: {
              runId: row.runId,
              direction: 'WAREHOUSE_TO_EXISTING_FACILITY',
              quantity: { amount: '2', unit: 'tonne' },
              startsAtSimTime: '20',
              endsAtSimTime: '30',
            },
          },
        },
      },
    });
  });
  it.each(['SHIP', 'SERVICE_WORK', 'PAY_INPUTS', 'DELIVER'])(
    'uses only existing protected %s references with no editable cost/hours',
    (action) => {
      const row = planningRow('LOGISTICS', action),
        r = build(row, {
          planningRef: row.planningRef,
          quantity: '',
          startsAtSimTime: '',
          endsAtSimTime: '',
        });
      if (row.action === 'BOOK') throw Error('REF_ONLY_ROW_REQUIRED');
      expect((r.request.payload as { operation: unknown }).operation).toEqual(
        row.parameters.operation,
      );
      expect(() => build(row)).toThrow();
    },
  );
  it.each([
    { quantity: '' },
    { quantity: '0' },
    { quantity: '-1' },
    { startsAtSimTime: '0' },
    { endsAtSimTime: '1001' },
    { endsAtSimTime: '20' },
    { planningRef: 'FOREIGN' },
  ])(
    'does not supply a default quantity or accept an unbound RUN window %j',
    (change) => {
      expect(() => build(planningRow(), { ...draft, ...change })).toThrow();
    },
  );
  it('shows the actual named handover, title and risk while leaving all new quantity/time inputs blank', () => {
    const doc = new HostDocument('industry'),
      row = planningRow('LOGISTICS', 'BOOK');
    const panel = renderIndustryUtilityForm(
      doc as unknown as Document,
      [row],
      true,
      'PAGE',
      () => false,
    );
    expect(panel.textContent).toContain(
      'WAREHOUSE_TEST_ONLY → LOCATION_TEST_ONLY',
    );
    expect(panel.textContent).toContain('产权 OP_TEST_ONLY');
    expect(panel.textContent).toContain('风险 OP_TEST_ONLY');
    for (const field of ['quantity', 'startsAtSimTime', 'endsAtSimTime'])
      expect(
        panel.querySelector<HTMLInputElement>(
          `[data-industry-utility-field="${field}"]`,
        )?.value,
      ).toBe('');
  });
  it('distinguishes no current action from an unavailable source and offers no sample JSON', () => {
    const doc = new HostDocument('industry'),
      empty = renderIndustryUtilityForm(
        doc as unknown as Document,
        [],
        true,
        'EMPTY',
        () => false,
      ),
      missing = renderIndustryUtilityForm(
        doc as unknown as Document,
        [],
        false,
        'UNAVAILABLE',
        () => false,
      );
    expect(empty.textContent).toContain('没有可选');
    expect(missing.textContent).toContain('不可用');
    expect(empty.querySelector('[data-industry-utility-action]')).toBeNull();
    expect(missing.querySelector('[data-industry-utility-action]')).toBeNull();
  });
});
