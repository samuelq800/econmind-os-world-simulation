/** One explicit transfer between actual current buckets. Catalog defaults are
 * presentation only; no capital, reason original or authority is created. */
import {
  parsePostwarCaptainAllocationOptions,
  parsePostwarCaptainPoliticalCapitalRow,
  parsePostwarCaptainCurrentCoverage,
  type PostwarCaptainAllocationOptions,
  type PostwarCaptainPoliticalCapitalRow,
} from '@econmind/core/postwar-captain-current-contract';
import {
  AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
  type AuthenticatedOfficeCommandRequestDto,
} from '@econmind/core/authenticated-office-command-contract';
export const CAPTAIN_CAPITAL_CATALOG_BINDING = Object.freeze({
  moduleId: 'captain-8',
  fields: Object.freeze({
    'captain-u0302-0': 'FISCAL_REFORM',
    'captain-u0303-0': 'INDUSTRIAL_STRATEGY',
    'captain-u0304-0': 'TRADE_NEGOTIATIONS',
    'captain-u0305-0': 'SOCIAL_REFORM_PROTECTION',
    'captain-u0306-0': 'STRATEGIC_PROJECT_SUPPORT',
    'captain-u0307-0': 'CRISIS_RESPONSE',
  }),
  reserveReadout: 'CAPTAIN-U0308',
  operation: 'EXPLICIT_SINGLE_TRANSFER_NOT_ABSOLUTE_BUCKET_RESET',
} as const);
export interface CaptainCapitalDraft {
  readonly fromBucket: string;
  readonly toBucket: string;
  readonly amount: string;
  readonly reasonFactRef: string;
}
function validAmount(v: string) {
  return v.length <= 256 && /^(0|[1-9]\d*)(?:\.\d*[1-9])?$/u.test(v);
}
function greater(a: string, b: string) {
  const [ai, af = ''] = a.split('.'),
    [bi, bf = ''] = b.split('.'),
    scale = Math.max(af.length, bf.length);
  return (
    BigInt(ai! + af.padEnd(scale, '0')) > BigInt(bi! + bf.padEnd(scale, '0'))
  );
}
export function buildCaptainCapitalRequest(input: {
  readonly rows: readonly unknown[];
  readonly options: unknown;
  readonly coverage: unknown;
  readonly draft: CaptainCapitalDraft;
  readonly worldId: string;
  readonly countryId: string;
  readonly worldVersion: string;
  readonly eventSequence: string;
  readonly requestId: string;
  readonly commandId: string;
  readonly idempotencyKey: string;
}): AuthenticatedOfficeCommandRequestDto {
  const rows = input.rows.map(parsePostwarCaptainPoliticalCapitalRow),
    options = parsePostwarCaptainAllocationOptions(input.options),
    coverage = parsePostwarCaptainCurrentCoverage(input.coverage),
    d = input.draft,
    from = rows.find((r) => r.bucket === d.fromBucket),
    to = rows.find((r) => r.bucket === d.toBucket);
  if (
    rows.length !== 7 ||
    new Set(rows.map((r) => r.bucket)).size !== 7 ||
    new Set(rows.map((r) => r.capitalRef)).size !== 1 ||
    rows.some((r) => r.countryId !== input.countryId) ||
    options.countryId !== input.countryId ||
    coverage.countryId !== input.countryId ||
    options.originalPacketSha256 !== coverage.originalPacketSha256 ||
    coverage.globalWorldVersion !== input.worldVersion ||
    coverage.globalEventSequence !== input.eventSequence ||
    !from ||
    !to ||
    from.bucket === to.bucket ||
    !validAmount(d.amount) ||
    d.amount === '0' ||
    greater(d.amount, from.balance) ||
    !options.reasons.some((r) => r.factRef === d.reasonFactRef)
  )
    throw Error(
      'CAPTAIN_ACTUAL_CURRENT_BUCKETS_AND_REGISTERED_REASON_REQUIRED',
    );
  return {
    schemaVersion: AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
    requestId: input.requestId,
    request: {
      worldId: input.worldId,
      countryId: input.countryId,
      officeId: 'CAPTAIN',
      commandType: 'CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1',
      commandId: input.commandId,
      idempotencyKey: input.idempotencyKey,
      expectedWorldVersion: input.worldVersion,
      payload: {
        schemaVersion: 'captain-political-capital-allocation-v1',
        fromBucket: from.bucket,
        toBucket: to.bucket,
        amount: { amount: d.amount, unit: 'political_capital' },
        reasonFactRef: d.reasonFactRef,
      },
    },
  };
}
const labels: Readonly<Record<string, string>> = Object.freeze({
  FISCAL_REFORM: '财政改革',
  INDUSTRIAL_STRATEGY: '产业战略',
  TRADE_NEGOTIATIONS: '贸易谈判',
  SOCIAL_REFORM_PROTECTION: '社会改革与保护',
  STRATEGIC_PROJECT_SUPPORT: '战略项目',
  CRISIS_RESPONSE: '危机响应',
  UNALLOCATED_CRISIS_RESERVE: '未分配／危机预留',
});
export function renderCaptainCapitalForm(
  document: Document,
  input: {
    readonly rows: readonly PostwarCaptainPoliticalCapitalRow[];
    readonly options: PostwarCaptainAllocationOptions;
    readonly enabled: boolean;
    readonly stage: (draft: CaptainCapitalDraft) => boolean;
  },
) {
  const section = document.createElement('section');
  section.dataset.captainCapitalForm = '';
  const heading = document.createElement('h3');
  heading.textContent = '政治资本 · 一次桶间转移';
  section.append(heading);
  const note = document.createElement('p');
  note.textContent =
    '余额来自当前已授权页面。一次转移保持总量不变；不会使用目录默认0或40上限覆盖真实开局。理由原件是依据引用，不是本次分配批准。';
  section.append(note);
  const current = document.createElement('dl');
  for (const row of input.rows) {
    const name = document.createElement('dt'),
      value = document.createElement('dd');
    name.textContent = labels[row.bucket] ?? row.bucket;
    value.textContent = row.balance + ' political_capital';
    current.append(name, value);
  }
  section.append(current);
  const select = (
    label: string,
    name: string,
    entries: readonly { value: string; label: string }[],
  ) => {
    const l = document.createElement('label');
    l.textContent = label;
    const s = document.createElement('select');
    s.name = name;
    s.dataset.captainCapitalField = name;
    s.disabled = !input.enabled;
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = '请选择';
    s.append(empty);
    for (const entry of entries) {
      const o = document.createElement('option');
      o.value = entry.value;
      o.textContent = entry.label;
      s.append(o);
    }
    l.append(s);
    section.append(l);
    return s;
  };
  const entries = input.rows.map((r) => ({
    value: r.bucket,
    label: (labels[r.bucket] ?? r.bucket) + ' · ' + r.balance,
  }));
  const from = select('转出桶', 'fromBucket', entries),
    to = select('转入桶', 'toBucket', entries);
  const label = document.createElement('label');
  label.textContent = '转移数量';
  const amount = document.createElement('input');
  amount.type = 'text';
  amount.inputMode = 'decimal';
  amount.autocomplete = 'off';
  amount.dataset.captainCapitalField = 'amount';
  amount.disabled = !input.enabled;
  label.append(amount);
  section.append(label);
  const reason = select(
    '已登记依据',
    'reasonFactRef',
    input.options.reasons.map((r) => ({
      value: r.factRef,
      label: r.recordRef + ' · ' + r.reason,
    })),
  );
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = '载入本次转移供审核';
  button.dataset.captainCapitalStage = '';
  button.disabled = !input.enabled;
  button.addEventListener('click', () => {
    status.textContent = input.stage({
      fromBucket: from.value,
      toBucket: to.value,
      amount: amount.value,
      reasonFactRef: reason.value,
    })
      ? '请求已载入，请核对后提交。'
      : '未载入：请核对当前余额、不同的两个桶、精确数量与已登记依据。';
  });
  section.append(button, status);
  return section;
}
