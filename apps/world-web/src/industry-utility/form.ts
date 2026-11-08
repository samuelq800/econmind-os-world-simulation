/** User scheduling over actual current planning rows. Ref-only stages cannot
 * edit the protected WORK, payment, material or delivery facts. */
import {
  parseIndustryUtilityPlanningRow,
  type IndustryUtilityPlanningRow,
} from '@econmind/core/postwar-industry-utility-planning-contract';
import {
  AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
  MANUAL_INDUSTRY_UTILITY_COMMANDS,
  type AuthenticatedOfficeCommandRequestDto,
} from '@econmind/core/authenticated-office-command-contract';
export interface IndustryUtilityDraft {
  readonly planningRef: string;
  readonly quantity: string;
  readonly startsAtSimTime: string;
  readonly endsAtSimTime: string;
}
export function buildIndustryUtilityRequest(
  input: Readonly<{
    row: IndustryUtilityPlanningRow;
    draft: IndustryUtilityDraft;
    worldId: string;
    countryId: string;
    worldVersion: string;
    requestId: string;
    commandId: string;
    idempotencyKey: string;
  }>,
): AuthenticatedOfficeCommandRequestDto {
  const row = parseIndustryUtilityPlanningRow(input.row),
    d = input.draft;
  if (row.countryId !== input.countryId || row.planningRef !== d.planningRef)
    throw Error('INDUSTRY_UTILITY_CURRENT_SELECTION_REQUIRED');
  let operation: Readonly<Record<string, unknown>>;
  if (row.action === 'BOOK') {
    if (
      !/^(0|[1-9][0-9]*)(\.[0-9]*[1-9])?$/u.test(d.quantity) ||
      d.quantity === '0' ||
      !/^(0|[1-9][0-9]*)$/u.test(d.startsAtSimTime) ||
      !/^(0|[1-9][0-9]*)$/u.test(d.endsAtSimTime) ||
      BigInt(d.startsAtSimTime) < BigInt(row.runStartsAtSimTime) ||
      BigInt(d.endsAtSimTime) > BigInt(row.runEndsAtSimTime) ||
      BigInt(d.startsAtSimTime) >= BigInt(d.endsAtSimTime)
    )
      throw Error('INDUSTRY_UTILITY_EXPLICIT_QUANTITY_AND_RUN_WINDOW_REQUIRED');
    operation =
      row.serviceKind === 'POWER'
        ? {
            action: 'BOOK',
            bookingRef: input.commandId + '_BOOKING',
            purpose: row.parameters.purpose,
            fromSimTime: d.startsAtSimTime,
            throughSimTime: d.endsAtSimTime,
            outputMWh: d.quantity,
          }
        : {
            action: 'BOOK',
            transferId: input.commandId + '_TRANSFER',
            request: {
              transferId: input.commandId + '_TRANSFER',
              runId: row.runId,
              direction: 'WAREHOUSE_TO_EXISTING_FACILITY',
              quantity: {
                amount: d.quantity,
                unit: row.parameters.quantityUnit,
              },
              startsAtSimTime: d.startsAtSimTime,
              endsAtSimTime: d.endsAtSimTime,
            },
          };
  } else {
    if (d.quantity !== '' || d.startsAtSimTime !== '' || d.endsAtSimTime !== '')
      throw Error('INDUSTRY_UTILITY_REF_ONLY_OPERATION_REQUIRED');
    operation = row.parameters.operation;
  }
  return {
    schemaVersion: AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
    requestId: input.requestId,
    request: {
      worldId: input.worldId,
      countryId: input.countryId,
      officeId: 'INDUSTRY',
      commandType: MANUAL_INDUSTRY_UTILITY_COMMANDS[row.serviceKind],
      commandId: input.commandId,
      idempotencyKey: input.idempotencyKey,
      expectedWorldVersion: input.worldVersion,
      payload: {
        schemaVersion: 'industry-first-day-utility-command-v1',
        serviceKind: row.serviceKind,
        operationRef: input.commandId,
        facilityId: row.facilityId,
        runId: row.runId,
        sourceRef: row.sourceRef,
        sourceRawSha256: row.sourceRawSha256,
        operation,
      },
    },
  };
}
export function renderIndustryUtilityForm(
  document: Document,
  rows: readonly IndustryUtilityPlanningRow[],
  enabled: boolean,
  status: 'PAGE' | 'EMPTY' | 'UNAVAILABLE',
  stage: (draft: IndustryUtilityDraft) => boolean,
) {
  const panel = document.createElement('section');
  panel.dataset.industryUtilityForm = '';
  const title = document.createElement('h3');
  title.textContent = '生产服务调度';
  panel.append(title);
  if (!enabled || !rows.length) {
    const message = document.createElement('p');
    message.dataset.industryUtilityUnavailable = '';
    message.textContent =
      status === 'EMPTY'
        ? '当前没有可选的服务调度；没有生成工作、费用或交付。'
        : status === 'PAGE'
          ? '当前请求尚未完成，请先恢复回执或刷新当前授权。'
          : '当前调度来源不可用，请刷新授权数据。';
    panel.append(message);
    return panel;
  }
  const selected = document.createElement('select'),
    sourceRows = rows.map(parseIndustryUtilityPlanningRow);
  selected.dataset.industryUtilityField = 'planningRef';
  selected.setAttribute('aria-label', '实际运行与服务操作');
  for (const row of sourceRows) {
    const option = document.createElement('option');
    option.value = row.planningRef;
    option.textContent = `${row.facilityId} · ${row.runId} · ${row.serviceKind}/${row.action}`;
    selected.append(option);
  }
  selected.value = sourceRows[0]!.planningRef;
  panel.append(selected);
  const summary = document.createElement('p');
  summary.dataset.industryUtilitySource = '';
  panel.append(summary);
  const fields = new Map<string, HTMLInputElement>(),
    labels = new Map<string, HTMLLabelElement>();
  for (const [key, label] of [
    ['quantity', '申请数量'],
    ['startsAtSimTime', '开始时间（模拟毫秒）'],
    ['endsAtSimTime', '结束时间（模拟毫秒）'],
  ] as const) {
    const caption = document.createElement('label'),
      field = document.createElement('input');
    caption.textContent = label;
    field.type = 'text';
    field.value = '';
    field.maxLength = 128;
    field.autocomplete = 'off';
    field.setAttribute('aria-label', label);
    field.dataset.industryUtilityField = key;
    caption.append(field);
    fields.set(key, field);
    labels.set(key, caption);
    panel.append(caption);
  }
  const describe = () => {
    const row = sourceRows.find((r) => r.planningRef === selected.value);
    for (const [key, field] of fields) {
      field.value = '';
      field.disabled = row?.action !== 'BOOK';
      labels.get(key)!.hidden = row?.action !== 'BOOK';
    }
    if (!row) {
      summary.textContent = '';
      return;
    }
    const route =
      row.serviceKind === 'LOGISTICS' && row.action === 'BOOK'
        ? `${row.parameters.materialRef} · ${row.parameters.fromLocationId} → ${row.parameters.toLocationId} · 产权 ${row.parameters.titleHolderId} · 风险 ${row.parameters.riskBearerId} · `
        : row.serviceKind === 'POWER' && row.action === 'BOOK'
          ? `${row.parameters.purpose} · `
          : '';
    const detail =
      row.action === 'BOOK'
        ? `${row.parameters.quantityUnit} · ${row.parameters.capacityFacts.map((f) => `${f.name}: ${f.value} ${f.unit}`).join('；')}`
        : JSON.stringify(row.parameters.operation);
    summary.textContent = `${row.sourceRef} · RUN窗口 ${row.runStartsAtSimTime}–${row.runEndsAtSimTime} · ${route}${detail}。仅调度数据，实际来源、权限与资源由服务器重新核验。`;
  };
  selected.addEventListener('change', describe);
  describe();
  const result = document.createElement('p');
  result.setAttribute('role', 'status');
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.industryUtilityAction = 'stage';
  button.textContent = '审阅服务调度';
  button.addEventListener('click', () => {
    if (!document.body.contains(panel)) return;
    const ok = stage({
      planningRef: selected.value,
      quantity: fields.get('quantity')!.value,
      startsAtSimTime: fields.get('startsAtSimTime')!.value,
      endsAtSimTime: fields.get('endsAtSimTime')!.value,
    });
    result.textContent = ok
      ? '调度已载入，请审阅后确认提交。'
      : '调度数据已过期，或数量与时段无效，请刷新后重试。';
  });
  panel.append(button, result);
  return panel;
}
