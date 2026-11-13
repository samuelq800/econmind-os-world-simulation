import {
  SOCIAL_PROGRAMMES_DATASET,
  SOCIAL_PROGRAMMES_NATURE,
  SOCIAL_PROGRAMME_COMMAND,
  parseSocialProgrammeTermsDto,
  parseSocialProgrammeRowDto,
} from '@econmind/core/social-labour-programme-public-contract';
import {
  AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
  type AuthenticatedOfficeCommandRequestDto,
} from '@econmind/core/authenticated-office-command-contract';
import type { RuntimePage } from '../postwar-office-runtime/client.js';
import { row, canonicalId } from '../production-read/contract.js';
export type SocialProgrammeDraft =
  | Readonly<{
      kind: 'RELOCATION_SUPPORT';
      locationId: string;
      participants: string;
      benefit: string;
    }>
  | Readonly<{
      kind: 'RETURN_TO_WORK';
      eligible: string;
      capacity: string;
      duration: string;
    }>;
function context(page: RuntimePage) {
  const c = row(page.source.currentSocialProgrammeContext);
  if (
    page.dataset !== SOCIAL_PROGRAMMES_DATASET ||
    page.authority.identity.officeId !== 'SOCIAL' ||
    page.source.dataNature !== SOCIAL_PROGRAMMES_NATURE ||
    !c ||
    Object.keys(c).sort().join('|') !== 'localCurrency|locationIds' ||
    !canonicalId(c.localCurrency) ||
    !Array.isArray(c.locationIds) ||
    c.locationIds.length > 1000 ||
    c.locationIds.some((x) => !canonicalId(x)) ||
    new Set(c.locationIds).size !== c.locationIds.length ||
    page.source.worldVersion !== page.authority.readback.worldVersion ||
    page.source.eventSequence !== page.authority.readback.eventSequence
  )
    throw Error('CURRENT_SOCIAL_PROGRAMME_CONTEXT_REQUIRED');
  return c as { localCurrency: string; locationIds: string[] };
}
export function buildSocialProgrammeRequest(input: {
  page: RuntimePage;
  draft: SocialProgrammeDraft;
  programmeId: string;
  commandId: string;
  idempotencyKey: string;
  requestId: string;
}): AuthenticatedOfficeCommandRequestDto {
  const c = context(input.page),
    d = input.draft;
  if (d.kind === 'RELOCATION_SUPPORT' && !c.locationIds.includes(d.locationId))
    throw Error('ACTUAL_DOMESTIC_PROGRAMME_LOCATION_REQUIRED');
  const terms = parseSocialProgrammeTermsDto({
    schemaVersion: 'social-labour-programme-create-v1',
    programmeId: input.programmeId,
    ...(d.kind === 'RELOCATION_SUPPORT'
      ? {
          kind: d.kind,
          locationId: d.locationId,
          participants: d.participants,
          benefit: { amount: d.benefit, currency: c.localCurrency },
        }
      : {
          kind: d.kind,
          eligible: d.eligible,
          capacity: d.capacity,
          duration: { amount: d.duration, unit: 'SIM_DAY' },
        }),
  });
  return {
    schemaVersion: AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
    requestId: input.requestId,
    request: {
      worldId: input.page.authority.identity.worldId,
      countryId: input.page.authority.identity.countryId,
      officeId: 'SOCIAL',
      commandType: SOCIAL_PROGRAMME_COMMAND,
      commandId: input.commandId,
      idempotencyKey: input.idempotencyKey,
      expectedWorldVersion: input.page.authority.readback.worldVersion,
      payload: terms,
    },
  };
}
export function renderSocialProgrammeForm(
  document: Document,
  input: {
    page: RuntimePage | null;
    enabled: boolean;
    code: string | null;
    stage: (draft: SocialProgrammeDraft) => boolean;
  },
) {
  const section = document.createElement('section');
  section.dataset.socialProgrammeForm = '';
  const text = (tag: string, value: string) => {
    const n = document.createElement(tag);
    n.textContent = value;
    return n;
  };
  section.append(
    text('h3', '迁移支持 / 重返就业：登记待审批项目'),
    text(
      'p',
      '这里只保存提议条款。人数不是已批准名单，资格条件尚未核验；不会批准预算、付款、迁移人口或增加劳动力。',
    ),
  );
  let c: ReturnType<typeof context> | null = null;
  try {
    if (input.page) c = context(input.page);
  } catch {
    /* unavailable actual source: keep form closed */
  }
  if (!c || !input.page) {
    section.append(text('p', input.code ?? '等待当前授权项目数据'));
    return section;
  }
  const createForm = (kind: SocialProgrammeDraft['kind']) => {
    const form = document.createElement('form');
    form.dataset.socialProgrammeKind = kind;
    form.append(
      text(
        'h4',
        kind === 'RELOCATION_SUPPORT' ? '迁移支持提案' : '重返就业提案',
      ),
    );
    const controls: Record<
      string,
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    > = {};
    const add = (name: string, label: string, area = false) => {
      const wrap = document.createElement('label');
      wrap.textContent = label;
      const field = area
        ? document.createElement('textarea')
        : document.createElement('input');
      field.name = name;
      field.required = true;
      field.disabled = !input.enabled;
      field.setAttribute('aria-label', label);
      controls[name] = field;
      wrap.append(field);
      form.append(wrap);
    };
    if (kind === 'RELOCATION_SUPPORT') {
      const label = document.createElement('label');
      label.textContent = '目的地区';
      const select = document.createElement('select');
      select.name = 'locationId';
      select.required = true;
      select.disabled = !input.enabled;
      select.setAttribute('aria-label', '目的地区');
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = '选择实际地区';
      select.append(placeholder);
      for (const id of c!.locationIds) {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = id;
        select.append(option);
      }
      controls.locationId = select;
      label.append(select);
      form.append(label);
      add('participants', '提议参与人数');
      add('benefit', `提议人均补助（${c!.localCurrency}）`);
    } else {
      add('eligible', '提议资格条件（尚未核验）', true);
      add('capacity', '提议项目容量');
      add('duration', '提议期限（模拟日）');
    }
    const message = text('p', '');
    message.setAttribute('role', 'status');
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.disabled = !input.enabled;
    submit.textContent = '审阅待审批项目条款';
    form.append(submit, message);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const value = (key: string) => controls[key]!.value.trim();
      const draft: SocialProgrammeDraft =
        kind === 'RELOCATION_SUPPORT'
          ? {
              kind,
              locationId: value('locationId'),
              participants: value('participants'),
              benefit: value('benefit'),
            }
          : {
              kind,
              eligible: value('eligible'),
              capacity: value('capacity'),
              duration: value('duration'),
            };
      message.textContent = input.stage(draft)
        ? '条款已进入审阅；尚未提交或获得批准。'
        : '当前数据或条款无效，请修正或重新读取。';
    });
    return form;
  };
  section.append(
    createForm('RELOCATION_SUPPORT'),
    createForm('RETURN_TO_WORK'),
  );
  section.append(text('h4', '已登记项目（待审批）'));
  if (input.page.rows.length === 0)
    section.append(text('p', '当前没有已登记项目。'));
  for (const value of input.page.rows) {
    const r = parseSocialProgrammeRowDto(value);
    section.append(
      text('p', `${r.programmeId} · 待审批 · ${JSON.stringify(r.terms)}`),
    );
  }
  return section;
}
