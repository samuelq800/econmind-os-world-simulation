/** Browser DATA only. Existing service capacity is not a CreateService request,
 * a matching plan, performed work or permission to spend a budget. */
import { canonicalId, row } from '../production-read/contract.js';
import type {
  RuntimePage,
  RuntimeResult,
} from '../postwar-office-runtime/client.js';
export const SOCIAL_SERVICE_CATALOG_CONTEXT = Object.freeze({
  moduleId: 'social-10',
  dataset: 'service-pools',
  sourceParagraph: 'SOCIAL-U0932',
  capacityInputContext: 'social-u0932-0',
  mappedCatalogReadouts: Object.freeze([]),
  connectedCatalogInputs: Object.freeze([]),
});
interface ServicePool {
  readonly poolId: string;
  readonly countryId: string;
  readonly locationId: string;
  readonly skill: string;
  readonly dayIndex: string;
  readonly ruleVersion: string;
  readonly capacitySlots: string;
  readonly usedSlots: string;
  readonly reservedSlots: string;
}
const keys = [
  'poolId',
  'countryId',
  'locationId',
  'skill',
  'dayIndex',
  'ruleVersion',
  'capacitySlots',
  'usedSlots',
  'reservedSlots',
];
export function readSocialServiceContext(
  page: RuntimePage,
  countryId: string,
): readonly ServicePool[] {
  if (
    page.dataset !== 'service-pools' ||
    page.source.dataNature !== 'ADMITTED_CURRENT_SOCIAL_MIXED_FINANCIAL_PREFIX'
  )
    throw Error('CURRENT_SOCIAL_SERVICE_CONTEXT_REQUIRED');
  return parseSocialServicePoolRows(page.rows, countryId);
}
/** Row DATA only; callers separately validate their exact source profile. */
export function parseSocialServicePoolRows(
  rows: RuntimePage['rows'],
  countryId: string,
): readonly ServicePool[] {
  return rows.map((value) => {
    const p = row(value);
    if (
      !p ||
      Object.keys(p).sort().join('|') !== [...keys].sort().join('|') ||
      p.countryId !== countryId ||
      !canonicalId(p.poolId) ||
      !canonicalId(p.locationId) ||
      !canonicalId(p.ruleVersion) ||
      !['LOW', 'MEDIUM', 'HIGH'].includes(String(p.skill))
    )
      throw Error('SOCIAL_SERVICE_SCOPE_OR_ROW_INVALID');
    for (const key of [
      'dayIndex',
      'capacitySlots',
      'usedSlots',
      'reservedSlots',
    ])
      if (
        typeof p[key] !== 'string' ||
        !/^(?:0|[1-9]\d*)$/u.test(p[key]) ||
        p[key].length > 78
      )
        throw Error('SOCIAL_SERVICE_QUANTITY_INVALID');
    if (
      BigInt(String(p.usedSlots)) + BigInt(String(p.reservedSlots)) >
      BigInt(String(p.capacitySlots))
    )
      throw Error('SOCIAL_SERVICE_CAPACITY_INVALID');
    return p as unknown as ServicePool;
  });
}
export function renderSocialServiceContext(
  document: Document,
  result: RuntimeResult | null,
  countryId: string,
) {
  const section = document.createElement('section');
  section.dataset.socialServiceSupplementalContext = '';
  const text = (tag: string, value: string) => {
    const el = document.createElement(tag);
    el.textContent = value;
    return el;
  };
  section.append(
    text('h3', '现有就业服务 · 当前只读上下文'),
    text(
      'p',
      'social-10 / SOCIAL-U0932：服务池现有容量用于了解当前约束，不是“创建就业服务”容量输入。原9个目录输入尚未接通；未创建服务、未申请预算、未提交撮合计划。',
    ),
  );
  if (!result) {
    section.append(text('p', '尚无当前读出；等待本次授权读取。'));
    return section;
  }
  if ('code' in result) {
    section.append(
      text(
        'p',
        `读取未完成 · ${result.status} · ${result.code}；没有用零值替代。`,
      ),
    );
    return section;
  }
  const pools = readSocialServiceContext(result, countryId);
  section.append(
    text(
      'p',
      `Source version ${result.source.sourceVersion} · World version ${result.authority.readback.worldVersion} / event ${result.authority.readback.eventSequence} · State origin ${String(result.source.originWorldVersion)} / ${String(result.source.originEventSequence)}`,
    ),
    text(
      'p',
      `授权页范围 [${result.page.offset}, ${result.page.offset + result.page.returned}) / ${result.page.total} · Unit person · 服务日索引按每行原件展示`,
    ),
  );
  if (result.status === 'EMPTY') {
    section.append(
      text('p', '此授权页没有既有就业服务池；空页不表示服务创建成功。'),
    );
    return section;
  }
  const table = document.createElement('table'),
    header = document.createElement('tr');
  for (const label of [
    '服务池',
    '地点',
    '技能',
    '服务日索引',
    '现有容量 (person)',
    '已用 (person)',
    '预留 (person)',
    '规则版本',
  ])
    header.append(text('th', label));
  table.append(header);
  for (const p of pools) {
    const tr = document.createElement('tr');
    tr.dataset.socialServicePool = p.poolId;
    for (const value of [
      p.poolId,
      p.locationId,
      p.skill,
      p.dayIndex,
      p.capacitySlots,
      p.usedSlots,
      p.reservedSlots,
      p.ruleVersion,
    ])
      tr.append(text('td', value));
    table.append(tr);
  }
  section.append(table);
  return section;
}
