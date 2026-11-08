/** Explicit user planning over already authorized source DATA. No defaults for
 * quantity/time/cost, no URL/storage credentials and no WORK/WAGE operation. */
import {
  parseIndustryRunParameterRow,
  type IndustryRunParameterRow,
} from '@econmind/core/postwar-industry-run-parameters-contract';
import {
  AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
  type AuthenticatedOfficeCommandRequestDto,
} from '@econmind/core/authenticated-office-command-contract';
/** Exact catalog subset. Other Industry-13 actions are not RUN scheduling. */
export const INDUSTRY_RUN_CATALOG_BINDING = Object.freeze({
  moduleId: 'industry-13',
  normativeUnit: 'INDUSTRY-U0282',
  commandType: 'CORE_INDUSTRY_RUN_SCHEDULE_V1',
  fields: Object.freeze({
    'industry-u0282-0': 'facilityId',
    'industry-u0282-1': 'quantity',
  }),
  unsupportedFields: Object.freeze([
    'industry-u0283-0',
    'industry-u0283-1',
    'industry-u0284-0',
    'industry-u0284-1',
  ] as const),
  requiredAdditionalInputs: Object.freeze([
    'startsAtSimTime',
    'endsAtSimTime',
    'maximumExpense',
  ] as const),
  operation: 'SOURCE_BOUND_FACILITY_RUN_PLAN_NOT_ACHIEVED_OUTPUT',
} as const);
export interface IndustryRunDraft {
  readonly facilityId: string;
  readonly quantity: string;
  readonly startsAtSimTime: string;
  readonly endsAtSimTime: string;
  readonly maximumExpense: string;
}
export function buildIndustryRunRequest(
  input: Readonly<{
    row: IndustryRunParameterRow;
    draft: IndustryRunDraft;
    worldId: string;
    countryId: string;
    worldVersion: string;
    requestId: string;
    commandId: string;
    runId: string;
    idempotencyKey: string;
  }>,
): AuthenticatedOfficeCommandRequestDto {
  const p = parseIndustryRunParameterRow(input.row),
    d = input.draft,
    integer = (v: string) => /^(0|[1-9][0-9]*)$/u.test(v),
    amount = (v: string) =>
      /^(0|[1-9][0-9]*)(\.[0-9]*[1-9])?$/u.test(v) && v !== '0';
  if (
    p.countryId !== input.countryId ||
    p.facilityId !== d.facilityId ||
    !amount(d.quantity) ||
    !amount(d.maximumExpense) ||
    !integer(d.startsAtSimTime) ||
    !integer(d.endsAtSimTime) ||
    BigInt(d.startsAtSimTime) < BigInt(p.windowStartsAtSimTime) ||
    BigInt(d.endsAtSimTime) > BigInt(p.windowEndsAtSimTime) ||
    BigInt(d.endsAtSimTime) <= BigInt(d.startsAtSimTime)
  )
    throw Error('INDUSTRY_RUN_EXPLICIT_PLAN_AND_BOUND_SOURCE_REQUIRED');
  return {
    schemaVersion: AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
    requestId: input.requestId,
    request: {
      worldId: input.worldId,
      countryId: input.countryId,
      officeId: 'INDUSTRY',
      commandType: 'CORE_INDUSTRY_RUN_SCHEDULE_V1',
      commandId: input.commandId,
      idempotencyKey: input.idempotencyKey,
      expectedWorldVersion: input.worldVersion,
      payload: {
        schemaVersion: 'postwar-industry-run-schedule-v1',
        runId: input.runId,
        facilityId: p.facilityId,
        quantity: { amount: d.quantity, unit: p.outputUnit },
        startsAtSimTime: d.startsAtSimTime,
        endsAtSimTime: d.endsAtSimTime,
        maximumExpense: {
          amount: d.maximumExpense,
          currency: p.expenseCurrency,
        },
        policyVersion: p.policyVersion,
        sourceRef: p.sourceRef,
        sourceRawSha256: p.sourceRawSha256,
      },
    },
  };
}
export function renderIndustryRunForm(
  document: Document,
  rows: readonly IndustryRunParameterRow[],
  enabled: boolean,
  stage: (draft: IndustryRunDraft) => boolean,
) {
  const panel = document.createElement('section');
  panel.dataset.industryRunForm = '';
  panel.dataset.catalogModuleBinding = INDUSTRY_RUN_CATALOG_BINDING.moduleId;
  const title = document.createElement('h3');
  title.textContent = '设施排产计划';
  panel.append(title);
  const scope = document.createElement('p');
  scope.dataset.industryRunCatalogScope = '';
  scope.textContent =
    '生产目标仅连接本次设施与目标产量。起止时间、最高费用须明确填写；载入或排队不表示已生产。利用率目标、设施与资源优先级尚未接通。';
  panel.append(scope);
  if (!enabled || rows.length === 0) {
    const msg = document.createElement('p');
    msg.dataset.industryRunUnavailable = '';
    msg.textContent = '排产参数当前不可用，请刷新授权数据。';
    panel.append(msg);
    return panel;
  }
  const sources = rows.map(parseIndustryRunParameterRow),
    facility = document.createElement('select');
  facility.dataset.industryRunField = 'facilityId';
  facility.dataset.catalogFieldId = 'industry-u0282-0';
  facility.setAttribute('aria-label', '生产设施');
  for (const row of sources) {
    const option = document.createElement('option');
    option.value = row.facilityId;
    option.textContent = row.facilityId;
    facility.append(option);
  }
  facility.value = sources[0]!.facilityId;
  panel.append(facility);
  const summary = document.createElement('p');
  summary.dataset.industryRunSource = '';
  panel.append(summary);
  const fields = new Map<string, HTMLInputElement>();
  for (const [key, label] of [
    ['quantity', '计划产量'],
    ['startsAtSimTime', '开始时间（模拟毫秒）'],
    ['endsAtSimTime', '结束时间（模拟毫秒）'],
    ['maximumExpense', '最高费用'],
  ] as const) {
    const caption = document.createElement('label'),
      field = document.createElement('input');
    caption.textContent = label;
    field.type = 'text';
    field.value = '';
    field.autocomplete = 'off';
    field.maxLength = 128;
    field.dataset.industryRunField = key;
    if (key === 'quantity') field.dataset.catalogFieldId = 'industry-u0282-1';
    field.setAttribute('aria-label', label);
    caption.append(field);
    fields.set(key, field);
    panel.append(caption);
  }
  const describe = () => {
    const row = sources.find((p) => p.facilityId === facility.value);
    summary.textContent = row
      ? `${row.outputUnit} · ${row.expenseCurrency} · 窗口 ${row.windowStartsAtSimTime}–${row.windowEndsAtSimTime} 模拟毫秒 · ${row.policyVersion}。计划尚未执行。`
      : '';
  };
  facility.addEventListener('change', describe);
  describe();
  const result = document.createElement('p');
  result.setAttribute('role', 'status');
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.industryRunAction = 'stage';
  button.textContent = '审阅排产计划';
  button.addEventListener('click', () => {
    if (!document.body.contains(panel)) return;
    const ok = stage({
      facilityId: facility.value,
      quantity: fields.get('quantity')!.value,
      startsAtSimTime: fields.get('startsAtSimTime')!.value,
      endsAtSimTime: fields.get('endsAtSimTime')!.value,
      maximumExpense: fields.get('maximumExpense')!.value,
    });
    result.textContent = ok
      ? '计划已载入，请审阅后确认提交。'
      : '请填写有效的产量、时间与最高费用，或刷新已过期的参数。';
  });
  panel.append(button, result);
  return panel;
}
