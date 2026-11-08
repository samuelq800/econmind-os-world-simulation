/** User intent over authorized current DATA, not service creation, hiring,
 * legal-offer approval, performed matching or a completed employment outcome. */
import {
  AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
  type AuthenticatedOfficeCommandRequestDto,
} from '@econmind/core/authenticated-office-command-contract';
import type { RuntimePage } from '../postwar-office-runtime/client.js';
import { canonicalId, hash, row } from '../production-read/contract.js';
import { sameAuthorizedIdentity } from '../prototype/authorized-read-adapter.js';
import { readSocialServiceContext } from './service-context.js';

export interface SocialEmploymentPlanDraft {
  readonly positionId: string;
  readonly servicePoolId: string;
  readonly requestedMatches: string;
}
interface PlanOption {
  readonly positionId: string;
  readonly servicePoolId: string;
  readonly locationId: string;
  readonly skill: string;
  readonly dueDayIndex: string;
  readonly vacantPositions: string;
  readonly freeServiceSlots: string;
  readonly displayedMaximum: string;
}
const count = (v: unknown): v is string =>
  typeof v === 'string' && /^(0|[1-9][0-9]*)$/u.test(v) && v.length <= 78;
export function readSocialEmploymentPlanOptions(
  positions: RuntimePage,
  pools: RuntimePage,
  countryId: string,
): readonly PlanOption[] {
  const a = positions.authority,
    b = pools.authority;
  if (
    positions.dataset !== 'positions' ||
    positions.source.dataNature !==
      'ADMITTED_CURRENT_SOCIAL_MIXED_FINANCIAL_PREFIX' ||
    a.identity.officeId !== 'SOCIAL' ||
    b.identity.officeId !== 'SOCIAL' ||
    a.identity.countryId !== countryId ||
    b.identity.countryId !== countryId ||
    !sameAuthorizedIdentity(a.identity, b.identity) ||
    a.readback.worldVersion !== b.readback.worldVersion ||
    a.readback.eventSequence !== b.readback.eventSequence ||
    !hash(row(positions.source.currentPrefixCoverage)?.prefixFingerprint) ||
    row(positions.source.currentPrefixCoverage)?.prefixFingerprint !==
      row(pools.source.currentPrefixCoverage)?.prefixFingerprint
  )
    throw Error('SOCIAL_PLAN_SAME_CURRENT_SCOPE_REQUIRED');
  for (const key of [
    'worldId',
    'seedRef',
    'contentHash',
    'admissionRef',
  ] as const)
    if (positions.source[key] !== pools.source[key])
      throw Error('SOCIAL_PLAN_SOURCE_PINS_DIFFER');
  const services = readSocialServiceContext(pools, countryId),
    options: PlanOption[] = [];
  const seen = new Set<string>();
  for (const raw of positions.rows) {
    const p = row(raw);
    if (
      !p ||
      Object.keys(p).sort().join('|') !==
        [
          'positionId',
          'countryId',
          'locationId',
          'skill',
          'owner',
          'classificationId',
          'requiredCount',
          'employedCount',
        ]
          .sort()
          .join('|') ||
      p.countryId !== countryId ||
      !canonicalId(p.positionId) ||
      !canonicalId(p.locationId) ||
      !canonicalId(p.classificationId) ||
      !['LOW', 'MEDIUM', 'HIGH'].includes(String(p.skill)) ||
      !['PRIVATE_SECTOR', 'PUBLIC_SERVICE'].includes(String(p.owner)) ||
      !count(p.requiredCount) ||
      !count(p.employedCount) ||
      BigInt(p.employedCount) > BigInt(p.requiredCount) ||
      seen.has(p.positionId)
    )
      throw Error('SOCIAL_PLAN_POSITION_INVALID');
    seen.add(p.positionId);
    const vacancies = BigInt(p.requiredCount) - BigInt(p.employedCount);
    for (const pool of services) {
      if (pool.locationId !== p.locationId || pool.skill !== p.skill) continue;
      const free =
        BigInt(pool.capacitySlots) -
        BigInt(pool.usedSlots) -
        BigInt(pool.reservedSlots);
      if (free === 0n || vacancies === 0n) continue;
      options.push({
        positionId: p.positionId,
        servicePoolId: pool.poolId,
        locationId: pool.locationId,
        skill: pool.skill,
        dueDayIndex: pool.dayIndex,
        vacantPositions: vacancies.toString(),
        freeServiceSlots: free.toString(),
        displayedMaximum: (free < vacancies ? free : vacancies).toString(),
      });
    }
  }
  return options;
}
export function buildSocialEmploymentPlanRequest(
  input: Readonly<{
    positions: RuntimePage;
    pools: RuntimePage;
    countryId: string;
    worldId: string;
    draft: SocialEmploymentPlanDraft;
    requestId: string;
    commandId: string;
    idempotencyKey: string;
  }>,
): AuthenticatedOfficeCommandRequestDto {
  const options = readSocialEmploymentPlanOptions(
    input.positions,
    input.pools,
    input.countryId,
  );
  const selected = options.filter(
    (p) =>
      p.positionId === input.draft.positionId &&
      p.servicePoolId === input.draft.servicePoolId,
  );
  if (
    selected.length !== 1 ||
    input.positions.authority.identity.worldId !== input.worldId ||
    !count(input.draft.requestedMatches) ||
    input.draft.requestedMatches === '0' ||
    BigInt(input.draft.requestedMatches) > BigInt(selected[0]!.displayedMaximum)
  )
    throw Error('SOCIAL_PLAN_EXPLICIT_CURRENT_SELECTION_AND_COUNT_REQUIRED');
  const p = selected[0]!;
  return {
    schemaVersion: AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
    requestId: input.requestId,
    request: {
      worldId: input.worldId,
      countryId: input.countryId,
      officeId: 'SOCIAL',
      commandType: 'CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1',
      commandId: input.commandId,
      idempotencyKey: input.idempotencyKey,
      expectedWorldVersion: input.positions.authority.readback.worldVersion,
      payload: {
        schemaVersion: 'social-employment-service-plan-v1',
        locationId: p.locationId,
        skill: p.skill,
        positionId: p.positionId,
        servicePoolId: p.servicePoolId,
        requestedMatches: input.draft.requestedMatches,
        dueDayIndex: p.dueDayIndex,
      },
    },
  };
}
export function renderSocialEmploymentPlanForm(
  document: Document,
  input: Readonly<{
    positions: RuntimePage | null;
    pools: RuntimePage | null;
    countryId: string;
    enabled: boolean;
    code: string | null;
    stage: (draft: SocialEmploymentPlanDraft) => boolean;
  }>,
) {
  const panel = document.createElement('section');
  panel.dataset.socialEmploymentPlanForm = '';
  const text = (tag: string, value: string) => {
    const e = document.createElement(tag);
    e.textContent = value;
    return e;
  };
  panel.append(
    text('h3', '既有就业服务撮合计划（PLAN）'),
    text(
      'p',
      '选择当前已授权岗位与既有服务池；未创建服务，social-10 的9个创建输入仍未接通。排队不表示已经撮合或雇佣；服务端仍核验合法offer、工资、最低工资与审批。',
    ),
  );
  if (!input.positions || !input.pools) {
    panel.append(
      text(
        'p',
        `计划选项读取未完成 · ${input.code ?? '等待当前授权读页'}；未用空值或零容量替代。`,
      ),
    );
    return panel;
  }
  let options: readonly PlanOption[];
  try {
    options = readSocialEmploymentPlanOptions(
      input.positions,
      input.pools,
      input.countryId,
    );
  } catch {
    panel.append(
      text('p', '计划选项不可用：岗位与服务池必须来自同一当前授权范围。'),
    );
    return panel;
  }
  for (const p of [input.positions, input.pools])
    panel.append(
      text(
        'p',
        `${p.dataset} · Source version ${p.source.sourceVersion} · World ${p.authority.readback.worldVersion} / event ${p.authority.readback.eventSequence} · 授权页范围 [${p.page.offset}, ${p.page.offset + p.page.returned}) / ${p.page.total}`,
      ),
    );
  if (options.length === 0) {
    panel.append(
      text(
        'p',
        '当前两页没有可匹配的空缺岗位与有限服务容量；这不表示全库没有岗位或服务池。',
      ),
    );
    return panel;
  }
  const position = document.createElement('select'),
    pool = document.createElement('select');
  position.dataset.socialPlanField = 'positionId';
  pool.dataset.socialPlanField = 'servicePoolId';
  position.setAttribute('aria-label', '现有岗位');
  pool.setAttribute('aria-label', '现有服务池');
  const option = (select: HTMLSelectElement, value: string, label: string) => {
    const p = document.createElement('option');
    p.value = value;
    p.textContent = label;
    select.append(p);
  };
  option(position, '', '请选择已授权岗位');
  for (const id of new Set(options.map((p) => p.positionId)))
    option(position, id, id);
  position.value = '';
  pool.value = '';
  const quantity = document.createElement('input');
  quantity.type = 'text';
  quantity.value = '';
  quantity.autocomplete = 'off';
  quantity.maxLength = 78;
  quantity.dataset.socialPlanField = 'requestedMatches';
  quantity.setAttribute('aria-label', '请求撮合人数（person）');
  const detail = text(
    'p',
    '请明确选择岗位与服务池，并填写人数；没有默认人数。',
  );
  const update = () => {
    const p = options.find(
      (p) => p.positionId === position.value && p.servicePoolId === pool.value,
    );
    detail.textContent = p
      ? `${p.locationId} · ${p.skill} · 服务日索引 ${p.dueDayIndex} · 当前空缺 ${p.vacantPositions} person · 空闲服务容量 ${p.freeServiceSlots} person · 本页可请求上限 ${p.displayedMaximum} person`
      : '请明确选择当前岗位与对应的服务池。';
  };
  position.addEventListener('change', () => {
    pool.replaceChildren();
    option(pool, '', '请选择匹配的已授权服务池');
    pool.value = '';
    quantity.value = '';
    for (const p of options.filter((p) => p.positionId === position.value))
      option(
        pool,
        p.servicePoolId,
        `${p.servicePoolId} · day ${p.dueDayIndex}`,
      );
    update();
  });
  pool.addEventListener('change', () => {
    quantity.value = '';
    update();
  });
  position.disabled = pool.disabled = quantity.disabled = !input.enabled;
  const feedback = text('p', '');
  feedback.setAttribute('role', 'status');
  const stage = document.createElement('button');
  stage.type = 'button';
  stage.dataset.socialPlanAction = 'stage';
  stage.disabled = !input.enabled;
  stage.textContent = '审阅就业撮合计划';
  stage.addEventListener('click', () => {
    if (!document.body.contains(panel) || stage.disabled) return;
    const ok = input.stage({
      positionId: position.value,
      servicePoolId: pool.value,
      requestedMatches: quantity.value,
    });
    feedback.textContent = ok
      ? '原请求已载入，须审阅后明确提交；尚未排队或撮合。'
      : '请选择当前匹配岗位与池，并填写容量范围内的明确人数。';
  });
  panel.append(position, pool, quantity, detail, stage, feedback);
  return panel;
}
