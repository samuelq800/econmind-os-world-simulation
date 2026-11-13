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
/** Exact catalog subset: RUN scheduling and separate finite first-day target
 * intent. Neither mapping proves actual output; critical priorities are unwired. */
export const INDUSTRY_RUN_CATALOG_BINDING = Object.freeze({
  moduleId: 'industry-13',
  normativeUnit: 'INDUSTRY-U0282',
  commandType: 'CORE_INDUSTRY_RUN_SCHEDULE_V1',
  fields: Object.freeze({
    'industry-u0282-0': 'facilityId',
    'industry-u0282-1': 'quantity',
  }),
  assistedFields: Object.freeze({
    'industry-u0283-0': 'facilityId',
    'industry-u0283-1': 'grossRunQuantityCalculationOnly',
  }),
  targetCommandType: 'CORE_INDUSTRY_UTILISATION_TARGET_SET_V1',
  targetFields: Object.freeze({
    'industry-u0283-0': 'facilityId',
    'industry-u0283-1': 'targetPercent',
  }),
  targetScope: 'ADMITTED_FACILITY_FIRST_DAY_WINDOW_INTENT_NOT_RUN_OR_OUTPUT',
  unsupportedFields: Object.freeze([
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
export interface IndustryUtilisationTargetDraft {
  readonly facilityId: string;
  readonly targetPercent: string;
  readonly startsAtSimTime: string;
  readonly endsAtSimTime: string;
}
export function buildIndustryUtilisationTargetRequest(
  input: Readonly<{
    row: IndustryRunParameterRow;
    draft: IndustryUtilisationTargetDraft;
    worldId: string;
    countryId: string;
    worldVersion: string;
    requestId: string;
    commandId: string;
    idempotencyKey: string;
  }>,
): AuthenticatedOfficeCommandRequestDto {
  const row = parseIndustryRunParameterRow(input.row),
    d = input.draft;
  const percent = decimalRatio(d.targetPercent);
  if (
    row.countryId !== input.countryId ||
    row.facilityId !== d.facilityId ||
    row.capacityPerSimDay === undefined ||
    percent.numerator > 100n * percent.denominator ||
    ![d.startsAtSimTime, d.endsAtSimTime].every(
      (v) => v.length <= 128 && /^(0|[1-9][0-9]*)$/u.test(v),
    ) ||
    BigInt(d.startsAtSimTime) < BigInt(row.windowStartsAtSimTime) ||
    BigInt(d.endsAtSimTime) > BigInt(row.windowEndsAtSimTime) ||
    BigInt(d.endsAtSimTime) <= BigInt(d.startsAtSimTime)
  )
    throw Error('INDUSTRY_TARGET_EXPLICIT_BOUND_SOURCE_REQUIRED');
  return {
    schemaVersion: AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
    requestId: input.requestId,
    request: {
      worldId: input.worldId,
      countryId: input.countryId,
      officeId: 'INDUSTRY',
      commandType: 'CORE_INDUSTRY_UTILISATION_TARGET_SET_V1',
      commandId: input.commandId,
      idempotencyKey: input.idempotencyKey,
      expectedWorldVersion: input.worldVersion,
      payload: {
        schemaVersion: 'postwar-industry-utilisation-target-v1',
        ...d,
        policyVersion: row.policyVersion,
        sourceRef: row.sourceRef,
        sourceRawSha256: row.sourceRawSha256,
      },
    },
  };
}
function decimalRatio(value: string) {
  if (value.length > 128 || !/^(0|[1-9][0-9]*)(\.[0-9]*[1-9])?$/u.test(value))
    throw Error('INDUSTRY_RUN_EXACT_DECIMAL_REQUIRED');
  const [whole, fraction = ''] = value.split('.');
  return {
    numerator: BigInt(whole! + fraction),
    denominator: 10n ** BigInt(fraction.length),
  };
}
/** Gross plan arithmetic only. It neither reads existing reservations nor
 * establishes feasible output, remaining capacity or a persistent target. */
export function calculateIndustryRunGrossQuantity(
  row: IndustryRunParameterRow,
  input: Readonly<{
    utilisationPercent: string;
    startsAtSimTime: string;
    endsAtSimTime: string;
  }>,
): string {
  const source = parseIndustryRunParameterRow(row);
  if (source.capacityPerSimDay === undefined)
    throw Error('INDUSTRY_RUN_SOURCE_CAPACITY_UNAVAILABLE');
  const capacity = decimalRatio(source.capacityPerSimDay),
    percent = decimalRatio(input.utilisationPercent);
  if (
    percent.numerator > 100n * percent.denominator ||
    ![input.startsAtSimTime, input.endsAtSimTime].every(
      (v) => v.length <= 128 && /^(0|[1-9][0-9]*)$/u.test(v),
    ) ||
    BigInt(input.startsAtSimTime) < BigInt(source.windowStartsAtSimTime) ||
    BigInt(input.endsAtSimTime) > BigInt(source.windowEndsAtSimTime) ||
    BigInt(input.endsAtSimTime) <= BigInt(input.startsAtSimTime)
  )
    throw Error('INDUSTRY_RUN_EXPLICIT_PERCENT_AND_WINDOW_REQUIRED');
  let numerator =
      capacity.numerator *
      (BigInt(input.endsAtSimTime) - BigInt(input.startsAtSimTime)) *
      percent.numerator,
    denominator = capacity.denominator * 86400000n * percent.denominator * 100n;
  let a = numerator,
    b = denominator;
  while (b !== 0n) [a, b] = [b, a % b];
  numerator /= a;
  denominator /= a;
  let twos = 0,
    fives = 0;
  while (denominator % 2n === 0n) {
    denominator /= 2n;
    twos++;
  }
  while (denominator % 5n === 0n) {
    denominator /= 5n;
    fives++;
  }
  const places = Math.max(twos, fives);
  if (denominator !== 1n || places > 128)
    throw Error('INDUSTRY_RUN_EXACT_FINITE_QUANTITY_REQUIRED_NO_ROUNDING');
  numerator *= 2n ** BigInt(places - twos) * 5n ** BigInt(places - fives);
  const digits = numerator.toString().padStart(places + 1, '0');
  const result =
    places === 0
      ? digits
      : (digits.slice(0, -places) + '.' + digits.slice(-places)).replace(
          /\.?0+$/u,
          '',
        );
  if (result.length > 128) throw Error('INDUSTRY_RUN_QUANTITY_TOO_LARGE');
  return result;
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
  if (p.capacityPerSimDay !== undefined) {
    const quantity = decimalRatio(d.quantity),
      capacity = decimalRatio(p.capacityPerSimDay);
    if (
      quantity.numerator * capacity.denominator * 86400000n >
      capacity.numerator *
        quantity.denominator *
        (BigInt(d.endsAtSimTime) - BigInt(d.startsAtSimTime))
    )
      throw Error('INDUSTRY_RUN_EXCEEDS_GROSS_WINDOW_CAPACITY');
  }
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
  stageTarget?: (draft: IndustryUtilisationTargetDraft) => boolean,
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
    '本次设施排产可手填数量，或按原件容量、明确百分比与窗口计算理论计划量。这不是剩余容量或可行产出，未扣除已安排量；' +
    (stageTarget
      ? '可另行提交明确窗口的利用率目标；目标不占用容量或改变既有排产。'
      : '不保存持续利用率目标。') +
    '起止时间、最高费用须明确填写，载入或排队不表示已生产。设施与资源优先级尚未接通。';
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
  facility.dataset.catalogAssistedFieldId = 'industry-u0283-0';
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
      ? `${row.outputUnit} · ${row.expenseCurrency} · 窗口 ${row.windowStartsAtSimTime}–${row.windowEndsAtSimTime} 模拟毫秒 · ${row.policyVersion}。原件日容量：${row.capacityPerSimDay ?? '未提供（可手填本次数量）'}。计划尚未执行。`
      : '';
    calculate.disabled = row?.capacityPerSimDay === undefined;
  };
  const result = document.createElement('p');
  result.setAttribute('role', 'status');
  const utilisationLabel = document.createElement('label'),
    utilisation = document.createElement('input'),
    calculate = document.createElement('button');
  utilisationLabel.textContent = '本次窗口利用率（0–100%，仅辅助计划量）';
  utilisation.type = 'text';
  utilisation.value = '';
  utilisation.autocomplete = 'off';
  utilisation.maxLength = 128;
  utilisation.dataset.industryRunField = 'utilisationPercent';
  utilisation.dataset.catalogAssistedFieldId = 'industry-u0283-1';
  utilisation.setAttribute('aria-label', '本次窗口利用率（百分比）');
  utilisationLabel.append(utilisation);
  calculate.type = 'button';
  calculate.dataset.industryRunAction = 'calculate-gross-quantity';
  calculate.textContent = '计算本次理论计划量';
  calculate.addEventListener('click', () => {
    if (!document.body.contains(panel)) return;
    try {
      const row = sources.find((p) => p.facilityId === facility.value);
      if (!row) throw Error('SOURCE_REQUIRED');
      const quantity = calculateIndustryRunGrossQuantity(row, {
        utilisationPercent: utilisation.value,
        startsAtSimTime: fields.get('startsAtSimTime')!.value,
        endsAtSimTime: fields.get('endsAtSimTime')!.value,
      });
      fields.get('quantity')!.value = quantity;
      result.textContent =
        quantity === '0'
          ? '0%：本次不安排运行，不产生提交或产出。'
          : `理论计划量 ${quantity} ${row.outputUnit}，未扣已安排量；请审阅时间、实际投入与费用后提交。`;
    } catch {
      fields.get('quantity')!.value = '';
      result.textContent =
        '需真实原件容量、0–100%和有效窗口；不能精确表示的数量不自动舍入，请调整窗口或手填计划量。';
    }
  });
  facility.addEventListener('change', describe);
  describe();
  panel.append(utilisationLabel, calculate);
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.industryRunAction = 'stage';
  button.textContent = '审阅排产计划';
  button.addEventListener('click', () => {
    if (!document.body.contains(panel)) return;
    if (fields.get('quantity')!.value === '0') {
      result.textContent = '本次不安排运行，不产生提交或产出。';
      return;
    }
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
  if (stageTarget) {
    const target = document.createElement('button');
    target.type = 'button';
    target.dataset.industryRunAction = 'stage-target';
    target.dataset.catalogFieldIds = 'industry-u0283-0 industry-u0283-1';
    target.textContent = '审阅利用率目标';
    target.addEventListener('click', () => {
      if (!document.body.contains(panel)) return;
      const ok = stageTarget({
        facilityId: facility.value,
        targetPercent: utilisation.value,
        startsAtSimTime: fields.get('startsAtSimTime')!.value,
        endsAtSimTime: fields.get('endsAtSimTime')!.value,
      });
      result.textContent = ok
        ? '目标已载入，确认后持久保存；0%是明确目标，不产生排产、费用或产出。'
        : '请填写0–100%和有效窗口，并刷新授权设施数据。';
    });
    panel.append(target);
  }
  panel.append(button, result);
  return panel;
}
