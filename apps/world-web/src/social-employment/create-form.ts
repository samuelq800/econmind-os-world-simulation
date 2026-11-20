/** Browser DATA and explicit user intent only. The server rechecks the actual
 * licence, current clock/source and finite capacity before creating a pool. */
import {
  Money,
  SOCIAL_EMPLOYMENT_SERVICE_CREATE_COMMAND,
  type SocialEmploymentServiceCreationReadFacts,
  type SocialEmploymentServiceCreateIntent,
} from '@econmind/core';
import {
  AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
  type AuthenticatedOfficeCommandRequestDto,
} from '@econmind/core/authenticated-office-command-contract';
import type { RuntimePage } from '../postwar-office-runtime/client.js';
import { canonicalId, hash, row } from '../production-read/contract.js';
import {
  parseSocialServicePoolRows,
  readSocialServiceContext,
} from './service-context.js';

/** Mirrors the fixed runtime's public planning DATA, never its implementation
 * or a new endpoint. Only the actual authorized page source can supply it. */
interface CreationPlanningData {
  readonly classification: 'CURRENT_T0_SERVICE_CREATION_PLANNING_DATA_NOT_AUTHORITY';
  readonly worldId: string;
  readonly countryId: string;
  readonly head: Readonly<{ worldVersion: string; eventSequence: string }>;
  readonly simTime: string;
  readonly dayIndex: '0';
  readonly localCurrency: string;
  readonly sourceRef: string;
  readonly sourceFingerprint: string;
  readonly usageLicences: readonly SocialEmploymentServiceCreationReadFacts['usageLicence'][];
  readonly rootTargets: readonly Readonly<{
    poolId: string;
    locationId: string;
    skill: SocialEmploymentServiceCreateIntent['target']['skill'];
    dayIndex: string;
    capacitySlots: string;
    usedSlots: string;
    reservedSlots: string;
    actualUnemployedCount: string;
  }>[];
  readonly creations: readonly Readonly<{
    programmeId: string;
    parentPoolId: string;
    childPoolId: string;
    capacitySlots: string;
  }>[];
}
export interface SocialEmploymentServiceCreateDraft {
  readonly servicePoolId: string;
  readonly capacity: string;
}
const uint = (v: unknown): v is string =>
  typeof v === 'string' && /^(0|[1-9][0-9]*)$/u.test(v) && v.length <= 78;
const exact = (value: unknown, keys: readonly string[]) => {
  const r = row(value);
  if (!r || Object.keys(r).sort().join('|') !== [...keys].sort().join('|'))
    throw Error('SOCIAL_SERVICE_CREATION_DATA_INVALID');
  return r;
};
export function readSocialEmploymentServiceCreationPlanning(
  page: RuntimePage,
): Readonly<
  | { status: 'AVAILABLE'; data: CreationPlanningData }
  | { status: 'UNAVAILABLE' | 'STALE'; code: string }
> | null {
  if (
    page.source.currentEmploymentServiceCreationOptions === undefined ||
    page.source.currentEmploymentServiceCreationOptions === null
  )
    return null;
  if (
    page.dataset !== 'service-pools' ||
    page.authority.identity.officeId !== 'SOCIAL'
  )
    throw Error('SOCIAL_SERVICE_CURRENT_POOL_PAGE_REQUIRED');
  const envelope = row(page.source.currentEmploymentServiceCreationOptions);
  if (envelope?.status === 'UNAVAILABLE' || envelope?.status === 'STALE') {
    exact(envelope, ['status', 'code']);
    if (
      typeof envelope.code !== 'string' ||
      !/^[A-Z][A-Z0-9_:.-]{0,127}$/u.test(envelope.code)
    )
      throw Error('SOCIAL_SERVICE_CREATION_STATUS_INVALID');
    return { status: envelope.status, code: envelope.code };
  }
  exact(envelope, ['status', 'data']);
  if (envelope?.status !== 'AVAILABLE')
    throw Error('SOCIAL_SERVICE_CREATION_STATUS_INVALID');
  const p = exact(envelope.data, [
    'classification',
    'worldId',
    'countryId',
    'head',
    'simTime',
    'dayIndex',
    'localCurrency',
    'sourceRef',
    'sourceFingerprint',
    'usageLicences',
    'rootTargets',
    'creations',
  ]);
  const h = exact(p.head, ['worldVersion', 'eventSequence']);
  if (
    p.classification !==
      'CURRENT_T0_SERVICE_CREATION_PLANNING_DATA_NOT_AUTHORITY' ||
    p.worldId !== page.authority.identity.worldId ||
    p.countryId !== page.authority.identity.countryId ||
    h.worldVersion !== page.authority.readback.worldVersion ||
    h.eventSequence !== page.authority.readback.eventSequence ||
    p.dayIndex !== '0' ||
    !uint(p.simTime) ||
    BigInt(p.simTime) >= 86400000n ||
    !canonicalId(p.sourceRef) ||
    !hash(p.sourceFingerprint) ||
    typeof p.localCurrency !== 'string' ||
    !Array.isArray(p.rootTargets) ||
    !Array.isArray(p.creations) ||
    !Array.isArray(p.usageLicences)
  )
    throw Error('SOCIAL_SERVICE_CURRENT_T0_SOURCE_REQUIRED');
  Money.from('0', p.localCurrency);
  for (const key of [
    'worldId',
    'seedRef',
    'contentHash',
    'admissionRef',
  ] as const)
    if (page.source[key] !== page.authority.readback[key])
      throw Error('SOCIAL_SERVICE_SOURCE_PINS_DIFFER');
  let pools: ReturnType<typeof parseSocialServicePoolRows>;
  if (
    page.source.dataNature ===
    'ADMITTED_H0_DERIVED_PROJECTION_NOT_POST_H0_REPLAY'
  ) {
    const observed =
      page.source.observedHead === undefined
        ? null
        : exact(page.source.observedHead, ['worldVersion', 'eventSequence']);
    if (
      h.worldVersion !== '0' ||
      h.eventSequence !== '0' ||
      page.source.worldVersion !== '0' ||
      page.source.eventSequence !== '0' ||
      page.source.currentStateBinding !== undefined ||
      page.source.currentPrefixCoverage !== undefined ||
      (page.source.originWorldVersion !== undefined &&
        page.source.originWorldVersion !== '0') ||
      (page.source.originEventSequence !== undefined &&
        page.source.originEventSequence !== '0') ||
      (observed &&
        (observed.worldVersion !== '0' || observed.eventSequence !== '0'))
    )
      throw Error('SOCIAL_SERVICE_EXACT_ADMITTED_H0_REQUIRED');
    pools = parseSocialServicePoolRows(
      page.rows,
      page.authority.identity.countryId,
    );
  } else {
    if (
      !uint(h.worldVersion) ||
      h.worldVersion === '0' ||
      page.source.worldVersion !== h.worldVersion ||
      page.source.eventSequence !== h.eventSequence
    )
      throw Error('SOCIAL_SERVICE_CURRENT_HEAD_REQUIRED');
    pools = readSocialServiceContext(page, page.authority.identity.countryId);
  }
  const children = new Set<string>(),
    programmes = new Set<string>();
  for (const item of p.creations) {
    const c = exact(item, [
      'programmeId',
      'parentPoolId',
      'childPoolId',
      'capacitySlots',
    ]);
    if (
      !canonicalId(c.programmeId) ||
      !canonicalId(c.parentPoolId) ||
      !canonicalId(c.childPoolId) ||
      !uint(c.capacitySlots) ||
      c.capacitySlots === '0' ||
      children.has(c.childPoolId) ||
      programmes.has(c.programmeId)
    )
      throw Error('SOCIAL_SERVICE_CREATION_HISTORY_INVALID');
    children.add(c.childPoolId);
    programmes.add(c.programmeId);
  }
  const targets = new Set<string>();
  for (const item of p.rootTargets) {
    const t = exact(item, [
      'poolId',
      'locationId',
      'skill',
      'dayIndex',
      'capacitySlots',
      'usedSlots',
      'reservedSlots',
      'actualUnemployedCount',
    ]);
    const actual = pools.find((r) => r.poolId === t.poolId);
    if (
      !actual ||
      targets.has(actual.poolId) ||
      children.has(actual.poolId) ||
      t.dayIndex !== '0' ||
      !uint(t.actualUnemployedCount) ||
      [
        'locationId',
        'skill',
        'dayIndex',
        'capacitySlots',
        'usedSlots',
        'reservedSlots',
      ].some((key) => t[key] !== actual[key as keyof typeof actual])
    )
      throw Error('SOCIAL_SERVICE_VISIBLE_ROOT_TARGET_REQUIRED');
    targets.add(actual.poolId);
  }
  const licences = new Set<string>();
  for (const item of p.usageLicences) {
    const l = exact(item, [
      'licenseId',
      'licensorEntityId',
      'beneficiaryEntityId',
      'locationId',
      'validFromDayIndex',
      'validUntilDayIndex',
      'dutyAssignmentIds',
      'maximumWorkerMinutes',
      'scope',
      'state',
      'additionalFeeAmount',
      'futurePaymentCondition',
    ]);
    if (
      !canonicalId(l.licenseId) ||
      licences.has(l.licenseId) ||
      !canonicalId(l.licensorEntityId) ||
      !canonicalId(l.beneficiaryEntityId) ||
      l.licensorEntityId === l.beneficiaryEntityId ||
      !canonicalId(l.locationId) ||
      l.validFromDayIndex !== '0' ||
      l.validUntilDayIndex !== '1' ||
      !uint(l.maximumWorkerMinutes) ||
      l.maximumWorkerMinutes === '0' ||
      !Array.isArray(l.dutyAssignmentIds) ||
      l.dutyAssignmentIds.length === 0 ||
      !l.dutyAssignmentIds.every(canonicalId) ||
      new Set(l.dutyAssignmentIds).size !== l.dutyAssignmentIds.length ||
      l.scope !== 'PUBLIC_REFERRALS_ONLY_NOT_EMPLOYER_TRANSFER' ||
      l.state !== 'GENESIS_USAGE_LICENSE_NOT_PAID_PURCHASE' ||
      l.additionalFeeAmount !== '0' ||
      l.futurePaymentCondition !==
        'NEW_PUBLIC_PURCHASE_REQUIRES_SEPARATE_LAWFUL_FUNDED_CONTRACT'
    )
      throw Error('SOCIAL_SERVICE_ACTUAL_T0_LICENCE_REQUIRED');
    licences.add(l.licenseId);
  }
  return { status: 'AVAILABLE', data: p as unknown as CreationPlanningData };
}
export function buildSocialEmploymentServiceCreateRequest(
  input: Readonly<{
    page: RuntimePage;
    draft: SocialEmploymentServiceCreateDraft;
    programmeId: string;
    requestId: string;
    commandId: string;
    idempotencyKey: string;
  }>,
): AuthenticatedOfficeCommandRequestDto {
  const planning = readSocialEmploymentServiceCreationPlanning(input.page),
    p = planning?.status === 'AVAILABLE' ? planning.data : null,
    d = input.draft;
  const t = p?.rootTargets.find((r) => r.poolId === d.servicePoolId);
  if (
    !p ||
    !t ||
    !canonicalId(input.programmeId) ||
    !p.usageLicences.some((l) => l.locationId === t.locationId) ||
    !uint(d.capacity) ||
    d.capacity === '0' ||
    BigInt(d.capacity) >
      BigInt(t.capacitySlots) - BigInt(t.usedSlots) - BigInt(t.reservedSlots) ||
    p.creations.some((c) => c.programmeId === input.programmeId)
  )
    throw Error('SOCIAL_SERVICE_EXPLICIT_LICENSED_CAPACITY_REQUIRED');
  // Current parent capacity already reflects previous creation partitions;
  // reservedSlots already includes PLAN. Neither is subtracted a second time.
  // Browser intent only. The authoritative parser uses Node-only canonical
  // serialization and remains on the server; all selected DATA is checked above.
  const payload: SocialEmploymentServiceCreateIntent = {
    schemaVersion: 'social-employment-service-create-v1',
    programmeId: input.programmeId,
    capacity: { amount: d.capacity, unit: 'person' },
    budget: { amount: '0', currency: p.localCurrency },
    target: {
      servicePoolId: t.poolId,
      locationId: t.locationId,
      skill: t.skill,
    },
  };
  return {
    schemaVersion: AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
    requestId: input.requestId,
    request: {
      worldId: p.worldId,
      countryId: p.countryId,
      officeId: 'SOCIAL',
      commandType: SOCIAL_EMPLOYMENT_SERVICE_CREATE_COMMAND,
      commandId: input.commandId,
      idempotencyKey: input.idempotencyKey,
      expectedWorldVersion: p.head.worldVersion,
      payload,
    },
  };
}
export function renderSocialEmploymentServiceCreateForm(
  document: Document,
  input: Readonly<{
    page: RuntimePage | null;
    enabled: boolean;
    stage: (draft: SocialEmploymentServiceCreateDraft) => boolean;
  }>,
) {
  const panel = document.createElement('section');
  panel.dataset.socialServiceCreateForm = '';
  const text = (tag: string, value: string) => {
    const n = document.createElement(tag);
    n.textContent = value;
    return n;
  };
  panel.append(
    text('h3', '创建首日就业服务'),
    text(
      'p',
      '仅分配既有公共转介容量；不增雇、迁移人员或购买额外服务。搬迁支持与返岗计划未接通。',
    ),
  );
  let planning: ReturnType<typeof readSocialEmploymentServiceCreationPlanning>;
  try {
    planning = input.page
      ? readSocialEmploymentServiceCreationPlanning(input.page)
      : null;
  } catch {
    panel.append(text('p', '当前创建参数不可用，请刷新授权数据。'));
    return panel;
  }
  if (!planning) {
    panel.append(
      text('p', '当前未提供可用的创建参数；可继续查询和使用既有服务。'),
    );
    return panel;
  }
  if (planning.status !== 'AVAILABLE') {
    panel.append(
      text(
        'p',
        planning.status === 'STALE'
          ? '创建参数已过期，请刷新当前授权页。'
          : '创建参数读取未完成，请稍后刷新；未用无许可或零容量替代。',
      ),
    );
    return panel;
  }
  const p = planning.data;
  if (p.usageLicences.length === 0) {
    panel.append(text('p', '当前原件未提供可用的首日转介许可，不能创建。'));
    return panel;
  }
  const targets = p.rootTargets.filter(
    (t) =>
      p!.usageLicences.some((l) => l.locationId === t.locationId) &&
      BigInt(t.capacitySlots) > BigInt(t.usedSlots) + BigInt(t.reservedSlots),
  );
  if (targets.length === 0) {
    panel.append(
      text('p', '本授权页没有可划分的首日服务容量；这不表示其他页没有服务池。'),
    );
    return panel;
  }
  panel.append(
    text(
      'p',
      `既有首日转介许可：无额外费用（0 ${p.localCurrency}），不是已付款或新采购报价。劳动关系不变；新购买须另有合法资金合同。`,
    ),
  );
  const target = document.createElement('select');
  target.dataset.socialServiceCreateField = 'servicePoolId';
  target.setAttribute('aria-label', '现有首日转介服务池');
  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = '请选择当前许可范围内的服务池';
  target.append(empty);
  for (const t of targets) {
    const o = document.createElement('option');
    o.value = t.poolId;
    o.textContent = `${t.poolId} · ${t.locationId} · ${t.skill}`;
    target.append(o);
  }
  target.value = '';
  const capacity = document.createElement('input');
  capacity.type = 'text';
  capacity.value = '';
  capacity.autocomplete = 'off';
  capacity.maxLength = 78;
  capacity.dataset.socialServiceCreateField = 'capacity';
  capacity.setAttribute('aria-label', '划分服务容量（person）');
  target.disabled = capacity.disabled = !input.enabled;
  const detail = text('p', '请选择真实服务池，并明确填写容量；没有默认人数。');
  target.addEventListener('change', () => {
    capacity.value = '';
    const t = targets.find((t) => t.poolId === target.value);
    detail.textContent = t
      ? `${t.locationId} · ${t.skill} · 模拟日 ${t.dayIndex} · 当前求职人数 ${t.actualUnemployedCount} person · 可划分 ${BigInt(t.capacitySlots) - BigInt(t.usedSlots) - BigInt(t.reservedSlots)} person。创建不表示已经撮合或就业。`
      : '';
  });
  const feedback = text('p', '');
  feedback.setAttribute('role', 'status');
  const stage = document.createElement('button');
  stage.type = 'button';
  stage.dataset.socialServiceCreateAction = 'stage';
  stage.disabled = !input.enabled;
  stage.textContent = '审阅服务创建';
  stage.addEventListener('click', () => {
    if (!document.body.contains(panel) || stage.disabled) return;
    const ok = input.stage({
      servicePoolId: target.value,
      capacity: capacity.value,
    });
    feedback.textContent = ok
      ? '原请求已载入，须审阅后明确提交；尚未创建服务。'
      : '请选择有效的许可服务池并填写可用范围内的容量，或刷新授权数据。';
  });
  panel.append(target, capacity, detail, stage, feedback);
  return panel;
}
