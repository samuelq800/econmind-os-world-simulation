/** Pure request/DOM unit checks, explicit TEST_ONLY authorized row shape.
 * Actual API/SQL data and native economics are separate acceptance. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  buildIndustryRunRequest,
  renderIndustryRunForm,
  INDUSTRY_RUN_CATALOG_BINDING,
} from '../../apps/world-web/src/industry-run/form.js';
import { HostDocument, type HostElement } from './trusted-host-dom.js';
const row = {
  schemaVersion: 'postwar-industry-run-parameter-row-v1' as const,
  countryId: 'COUNTRY_TEST_ONLY',
  facilityId: 'FACILITY_SOURCE_ONLY',
  locationId: 'LOCATION_TEST_ONLY',
  operatorId: 'OP_TEST_ONLY',
  sourceRef: 'INDUSTRY_FIRST_DAY_' + 'B'.repeat(64),
  sourceRawSha256: 'b'.repeat(64),
  policyVersion: 'POLICY_TEST_ONLY',
  policyRawSha256: 'c'.repeat(64),
  userAdoptionRawSha256: 'd'.repeat(64),
  outputUnit: 'source unit',
  expenseCurrency: 'XBB',
  windowStartsAtSimTime: '0',
  windowEndsAtSimTime: '86400000',
  maximumMinutesPerWorkerFirstSimDay: '480',
  measurement:
    'ADOPTED_PARAMETERS_NOT_RUN_WORK_PAYMENT_OR_OUTPUT_AUTHORITY' as const,
};
const draft = {
  facilityId: row.facilityId,
  quantity: '2',
  startsAtSimTime: '10',
  endsAtSimTime: '20',
  maximumExpense: '3',
};
const build = (d = draft) =>
  buildIndustryRunRequest({
    row,
    draft: d,
    worldId: 'WORLD_TEST_ONLY',
    countryId: row.countryId,
    worldVersion: '7',
    requestId: '11111111-1111-4111-8111-111111111111',
    commandId: 'COMMAND_TEST_ONLY',
    idempotencyKey: 'KEY_TEST_ONLY',
    runId: 'RUN_TEST_ONLY',
  });
describe('source-bound Industry RUN form', () => {
  it('binds exactly the two U0282 catalog fields and leaves utilization/resource priorities outside RUN', () => {
    const catalog = JSON.parse(
        readFileSync(
          new URL(
            '../../apps/world-web/public/season1-immersive/catalog.json',
            import.meta.url,
          ),
          'utf8',
        ),
      ) as {
        modules: { id: string; fields: { key: string; source: string }[] }[];
      },
      module = catalog.modules.find(
        (m) => m.id === INDUSTRY_RUN_CATALOG_BINDING.moduleId,
      )!;
    expect(INDUSTRY_RUN_CATALOG_BINDING.fields).toEqual({
      'industry-u0282-0': 'facilityId',
      'industry-u0282-1': 'quantity',
    });
    for (const id of Object.keys(INDUSTRY_RUN_CATALOG_BINDING.fields))
      expect(module.fields.find((f) => f.key === id)?.source).toBe(
        'INDUSTRY-U0282',
      );
    expect(INDUSTRY_RUN_CATALOG_BINDING.unsupportedFields).toEqual(
      module.fields
        .filter((f) => f.source !== 'INDUSTRY-U0282')
        .map((f) => f.key),
    );
  });
  it('marks the two exact controls and requires explicit quantity, window and cost instead of copying catalog defaults', () => {
    const doc = new HostDocument('industry'),
      panel = renderIndustryRunForm(
        doc as unknown as Document,
        [row],
        true,
        () => false,
      ) as unknown as HostElement;
    const fields = panel
      .all()
      .filter((el) => Object.hasOwn(el.dataset, 'industryRunField'));
    expect(panel.dataset.catalogModuleBinding).toBe('industry-13');
    expect(
      fields
        .filter((el) => el.dataset.catalogFieldId)
        .map((el) => [el.dataset.catalogFieldId, el.dataset.industryRunField]),
    ).toEqual([
      ['industry-u0282-0', 'facilityId'],
      ['industry-u0282-1', 'quantity'],
    ]);
    for (const field of fields.filter(
      (el) => el.dataset.industryRunField !== 'facilityId',
    ))
      expect((field as unknown as HTMLInputElement).value).toBe('');
    expect(panel.textContent).toContain('利用率目标、设施与资源优先级尚未接通');
    expect(panel.textContent).toContain('source unit · XBB');
  });
  it('copies policy/source/unit/currency from authorized data while preserving explicit user terms/head/identity', () => {
    expect(build()).toMatchObject({
      request: {
        officeId: 'INDUSTRY',
        commandType: 'CORE_INDUSTRY_RUN_SCHEDULE_V1',
        expectedWorldVersion: '7',
        payload: {
          facilityId: row.facilityId,
          sourceRef: row.sourceRef,
          sourceRawSha256: row.sourceRawSha256,
          policyVersion: row.policyVersion,
          quantity: { amount: '2', unit: row.outputUnit },
          maximumExpense: { amount: '3', currency: row.expenseCurrency },
        },
      },
    });
  });
  it.each([
    { facilityId: 'ARBITRARY_FACILITY' },
    { quantity: '' },
    { quantity: '0' },
    { maximumExpense: '0' },
    { endsAtSimTime: '86400001' },
    { startsAtSimTime: '20' },
  ])(
    'does not invent defaults or accept an unbound facility/window %j',
    (change) => {
      expect(() => build({ ...draft, ...change })).toThrow();
    },
  );
  it('renders unavailable without a source and exposes no automatic operation', () => {
    const doc = new HostDocument('industry'),
      panel = renderIndustryRunForm(
        doc as unknown as Document,
        [],
        false,
        () => {
          throw Error('NO_STAGE_ALLOWED');
        },
      );
    expect(panel.textContent).toContain('不可用');
    expect(panel.querySelector('[data-industry-run-action]')).toBeNull();
  });
});
