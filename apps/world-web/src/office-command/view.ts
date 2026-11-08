import {
  INDUSTRY_UTILITY_PLANNING_DATASET,
  parseIndustryUtilityPlanningRow,
} from '@econmind/core/postwar-industry-utility-planning-contract';
import { renderIndustryUtilityForm } from '../industry-utility/form.js';
import { renderSocialEmploymentPlanForm } from '../social-employment/plan-form.js';
import { renderSocialEmploymentServiceCreateForm } from '../social-employment/create-form.js';
import {
  parsePostwarCaptainAllocationOptions,
  parsePostwarCaptainPoliticalCapitalRow,
} from '@econmind/core/postwar-captain-current-contract';
import { renderCaptainCapitalForm } from '../captain-capital/form.js';
import {
  INDUSTRY_RUN_PARAMETERS_DATASET,
  parseIndustryRunParameterRow,
} from '@econmind/core/postwar-industry-run-parameters-contract';
import {
  INDUSTRY_RUN_CATALOG_BINDING,
  renderIndustryRunForm,
} from '../industry-run/form.js';
import {
  createOfficeCommandController,
  type OfficeCommandBinding,
} from './controller.js';
import {
  officeProjectionRoles,
  type OfficeProjectionView,
} from '../office-projection/model.js';
import { renderDecisionResult } from '../office-projection/decision-result-view.js';
import { renderOfficeReadout } from '../office-projection/readout-view.js';

/** Additive manual-intent drawer; no default economic payload or fixture data. */
export function installOfficeCommand(
  document: Document,
  host: Window,
  factory: typeof createOfficeCommandController = createOfficeCommandController,
) {
  let root = document.querySelector<HTMLElement>('.country-game');
  const currentView = (): OfficeProjectionView | null => {
    const r = document.querySelector<HTMLElement>('.country-game'),
      role = r?.dataset.office;
    return r === root &&
      r?.dataset.country &&
      role &&
      Object.hasOwn(officeProjectionRoles, role)
      ? {
          countryDisplayId: r.dataset.country,
          role: role as OfficeProjectionView['role'],
        }
      : null;
  };
  let controller = factory(null, currentView),
    trigger: HTMLButtonElement | null = null,
    dialog: HTMLDialogElement | null = null;
  let generation = 0,
    reconciling = false;
  const listeners = new Set<() => void>();
  const node = (tag: string, text: string) => {
    const el = document.createElement(tag);
    el.textContent = text;
    return el;
  };
  function button(
    label: string,
    key: string,
    enabled: boolean,
    action: () => unknown,
  ) {
    const owner = controller,
      lifetime = generation;
    const el = document.createElement('button');
    el.type = 'button';
    el.textContent = label;
    el.dataset.officeCommandAction = key;
    el.disabled = !enabled;
    el.addEventListener('click', () => {
      if (!active(owner, lifetime, el)) return;
      try {
        void Promise.resolve(action()).catch(() => {
          if (owner === controller && lifetime === generation)
            owner.disconnect();
        });
      } catch {
        if (owner === controller && lifetime === generation) owner.disconnect();
      }
    });
    return el;
  }
  function active(
    owner: typeof controller,
    lifetime: number,
    element: HTMLElement,
  ) {
    return (
      owner === controller &&
      lifetime === generation &&
      root === document.querySelector('.country-game') &&
      document.body.contains(element) &&
      owner.checkLiveness()
    );
  }
  function clearPrivateContent(surface: HTMLElement) {
    for (const child of Array.from(surface.children))
      clearPrivateContent(child as HTMLElement);
    if ('value' in surface) (surface as HTMLInputElement).value = '';
    surface.textContent = '';
    surface.replaceChildren();
  }
  function removePrivateShell() {
    const surface = dialog;
    dialog = null;
    if (surface) {
      clearPrivateContent(surface);
      if (surface.open) surface.close();
      surface.remove();
    }
    if (trigger) {
      trigger.title = '';
      delete trigger.dataset.officeCommandState;
      clearPrivateContent(trigger);
      trigger.remove();
    }
    trigger = null;
  }
  function render(state: ReturnType<typeof controller.getState>) {
    const owner = controller,
      lifetime = generation;
    if (trigger) {
      trigger.title = `Office intent · ${state.status}`;
      trigger.dataset.officeCommandState = state.status;
    }
    if (!dialog) return;
    if (!dialog.open) {
      clearPrivateContent(dialog);
      return;
    }
    const focused = dialog.contains(document.activeElement)
      ? (document.activeElement as HTMLElement).dataset.officeCommandAction
      : undefined;
    clearPrivateContent(dialog);
    dialog.append(
      node(
        'h2',
        'Manual Office intent — Captain / Central Bank / Finance / Industry / Trade / Social',
      ),
    );
    const status = node(
      'p',
      `${state.status}${state.code ? ' · ' + state.code : ''}`,
    );
    status.setAttribute('role', 'status');
    dialog.append(status);
    if (state.lastAuthorizedReadAtClient)
      dialog.append(
        node(
          'p',
          `${state.model ? 'Last read on this device' : 'Previous successful read'}: ${state.lastAuthorizedReadAtClient} · browser observation only`,
        ),
      );
    dialog.append(
      node(
        'p',
        'Only a current server-authorized seat can submit an installed manual family. Industry supports source-bound RUN plans and service schedules selected from current data; an acknowledgement does not establish work, wages, delivery or output. Trade supports only the narrow preapproved Treasury GCU transfer, with current three signatures, owner mandate, route and funds checked by the server. Queue acknowledgement, including FINALIZED, is not an economic commit.',
      ),
    );
    if (state.tradeDataset) {
      const section = document.createElement('section');
      section.dataset.tradeCurrentReadout = '';
      for (const [dataset, label] of [
        ['inventory-current', '当前库存'],
        ['goods-transfers-current', '已提交转移'],
      ] as const) {
        const select = button(
          label,
          dataset === 'inventory-current'
            ? 'trade-inventory'
            : 'trade-transfers',
          state.canRead,
          () => owner.selectTradeDataset(dataset),
        );
        select.setAttribute(
          'aria-pressed',
          String(state.tradeDataset === dataset),
        );
        section.append(select);
      }
      if (state.canReadTradeOpeningH0)
        section.append(
          button('仅查看已授权 H0 开局库存', 'trade-opening-h0', true, () =>
            owner.readTradeOpeningH0(),
          ),
        );
      const page = state.runtimePage;
      if (page) {
        const opening = page.dataset === 'opening-inventory-entries';
        section.append(
          node(
            'p',
            opening
              ? 'H0 开局库存 · 仅已核验零头、零事件时显示；不是 H>0 当前库存。刷新返回所选当前数据。'
              : page.dataset === 'inventory-current'
                ? '当前库存 · 包含实际预留、在途与可用数量。'
                : '已提交转移 · RESERVED / SHIPPED / DELIVERED 来自实际账本，不是本地订单预览。',
          ),
        );
        section.append(
          node(
            'p',
            `World ${page.authority.readback.worldVersion} / event ${page.authority.readback.eventSequence} · ${page.page.offset + (page.page.returned ? 1 : 0)}–${page.page.offset + page.page.returned} / ${page.page.total}`,
          ),
        );
        if (page.status === 'EMPTY')
          section.append(
            node(
              'p',
              opening ? '已授权开局库存页无记录。' : '当前已授权数据页无记录。',
            ),
          );
        else {
          const columns = opening
            ? ['account', 'quantity']
            : page.dataset === 'inventory-current'
              ? [
                  'commodityId',
                  'batchId',
                  'quantity',
                  'unit',
                  'bucket',
                  'physicalLocationId',
                  'titleHolderId',
                  'riskBearerId',
                  'reservationId',
                  'shipmentId',
                ]
              : [
                  'transferCommandId',
                  'sellerCountryId',
                  'buyerCountryId',
                  'commodityId',
                  'quantity',
                  'unit',
                  'status',
                  'reservationId',
                  'shipmentId',
                ];
          const table = document.createElement('table'),
            header = document.createElement('tr');
          for (const column of columns) header.append(node('th', column));
          table.append(header);
          for (const row of page.rows) {
            const line = document.createElement('tr');
            for (const column of columns)
              line.append(
                node(
                  'td',
                  typeof row[column] === 'string'
                    ? (row[column] as string)
                    : JSON.stringify(row[column] ?? null),
                ),
              );
            table.append(line);
          }
          section.append(table);
        }
        if (page.page.nextOffset !== null)
          section.append(
            button('下一页', 'trade-next-page', state.canRead, () =>
              owner.nextTradePage(),
            ),
          );
      }
      dialog.append(section);
    }
    if (currentView()?.role === 'social') {
      dialog.append(
        renderSocialEmploymentServiceCreateForm(document, {
          page: state.socialPoolsPage,
          enabled: state.canStage,
          stage: (draft) =>
            active(owner, lifetime, dialog!) &&
            owner.stageSocialEmploymentServiceCreate(draft),
        }),
      );
      dialog.append(
        renderSocialEmploymentPlanForm(document, {
          positions:
            state.runtimePage?.dataset === 'positions'
              ? state.runtimePage
              : null,
          pools: state.socialPoolsPage,
          countryId: state.runtimePage?.authority.identity.countryId ?? '',
          enabled: state.canStage,
          code: state.socialPoolsCode ?? state.code,
          stage: (draft) =>
            active(owner, lifetime, dialog!) &&
            owner.stageSocialEmploymentPlan(draft),
        }),
      );
      if (
        state.runtimePage?.dataset === 'positions' &&
        state.runtimePage.page.nextOffset !== null
      )
        dialog.append(
          button('下一授权岗位页', 'social-next-positions', state.canRead, () =>
            owner.nextSocialPositionsPage(),
          ),
        );
      if (
        state.socialPoolsPage?.page.nextOffset !== null &&
        state.socialPoolsPage
      )
        dialog.append(
          button('下一授权服务池页', 'social-next-pools', state.canRead, () =>
            owner.nextSocialPoolsPage(),
          ),
        );
    }
    if (currentView()?.role === 'captain') {
      try {
        const page = state.runtimePage;
        if (page?.dataset !== 'political-capital-current')
          throw Error('CURRENT_CAPITAL_REQUIRED');
        dialog.append(
          renderCaptainCapitalForm(document, {
            rows: page.rows.map(parsePostwarCaptainPoliticalCapitalRow),
            options: parsePostwarCaptainAllocationOptions(
              page.source.currentCaptainAllocationOptions,
            ),
            enabled: state.canStage,
            stage: (draft) => owner.stageCaptainCapital(draft),
          }),
        );
      } catch {
        dialog.append(
          node(
            'p',
            '政治资本操作未开放：需要当前七桶余额和实际登记的依据原件。',
          ),
        );
      }
    }
    if (currentView()?.role === 'industry') {
      const rows =
        state.runParametersPage?.dataset === INDUSTRY_RUN_PARAMETERS_DATASET
          ? state.runParametersPage.rows.map(parseIndustryRunParameterRow)
          : [];
      dialog.append(
        renderIndustryRunForm(
          document,
          rows,
          state.canStage,
          (draft) =>
            active(owner, lifetime, dialog!) && owner.stageIndustryRun(draft),
        ),
      );
    }
    if (currentView()?.role === 'industry') {
      const planning =
        state.utilityPlanningPage?.dataset === INDUSTRY_UTILITY_PLANNING_DATASET
          ? state.utilityPlanningPage
          : null;
      dialog.append(
        renderIndustryUtilityForm(
          document,
          planning ? planning.rows.map(parseIndustryUtilityPlanningRow) : [],
          state.canStage,
          planning?.status ?? 'UNAVAILABLE',
          (draft) =>
            active(owner, lifetime, dialog!) &&
            owner.stageIndustryUtility(draft),
        ),
      );
      if (planning?.page.nextOffset !== null && planning)
        dialog.append(
          button('更多服务调度', 'next-utility-planning', state.canStage, () =>
            owner.nextIndustryUtilityPlanningPage(),
          ),
        );
    }
    const draft = document.createElement('textarea');
    draft.setAttribute('aria-label', 'Original manual Office request JSON');
    draft.dataset.officeCommandDraft = '';
    draft.value = state.intent ? JSON.stringify(state.intent, null, 2) : '';
    draft.disabled = !state.canStage && !state.canRestoreOriginal;
    dialog.append(
      node(
        'p',
        'For a new command, read the current projection and load an explicit public request. To recover after a page reload, paste the exact submitted request and choose recovery only; its old head is retained and it cannot be submitted again. Reference forms generate only new command/booking IDs; source references and economic facts come from the authorized page.',
      ),
      draft,
    );
    dialog.append(
      button('Load explicit intent', 'stage', state.canStage, () => {
        try {
          owner.stage(JSON.parse(draft.value));
        } catch {
          owner.stage(null);
        }
      }),
      button(
        'Restore submitted request for recovery only',
        'restore',
        state.canRestoreOriginal,
        () => {
          try {
            owner.restoreOriginalForRecovery(JSON.parse(draft.value));
          } catch {
            owner.restoreOriginalForRecovery(null);
          }
        },
      ),
    );
    if (state.intent)
      dialog.append(node('pre', JSON.stringify(state.intent, null, 2)));
    if (state.acknowledgement)
      dialog.append(
        node(
          'p',
          `QUEUE_ACK · ${state.acknowledgement.status} · ${state.acknowledgement.commandId} · ${state.acknowledgement.commandFingerprint}`,
        ),
      );
    if (state.status === 'UNKNOWN' || state.canRecover) {
      dialog.append(
        node(
          'p',
          state.status === 'UNKNOWN'
            ? 'Write outcome unknown. Do not resubmit. Recover with the exact original request; a fingerprint is not required.'
            : 'The command is registered. Read its original server status; this does not replay the command.',
        ),
        button(
          'Recover original server status — no replay',
          'recover',
          state.canRecover,
          () => owner.recoverOriginal(),
        ),
      );
    }
    if (state.runtimePage) {
      const page = state.runtimePage;
      dialog.append(
        node(
          'p',
          `Verified authorized World head ${page.authority.readback.worldVersion} · ${page.dataset} · ${page.status} · ${page.page.returned} rows`,
        ),
        node(
          'p',
          `Source ${page.source.sourceVersion} · Origin ${String(page.source.originWorldVersion ?? page.source.worldVersion)} · ${String(page.source.dataNature)}. Source rows are not a grant or a source preflight.`,
        ),
      );
      if (state.receipt)
        dialog.append(
          node(
            'p',
            'Durable receipt and authorized page are separate evidence. No action completion is inferred without a matching current result.',
          ),
        );
    }
    if (state.receipt)
      dialog.append(
        node(
          'p',
          `Durable FINAL · ${state.receipt.outcome} · ${state.receipt.reasonCode ?? 'No rejection reason'} · ${state.receipt.commandId}`,
        ),
      );
    if (state.model) {
      dialog.append(
        node('p', `Authorized readback · v${state.model.head.worldVersion}`),
      );
      dialog.append(renderDecisionResult(document, state.model.decisionResult));
      dialog.append(renderOfficeReadout(document, state.model));
      if (state.receipt && !state.completion)
        dialog.append(
          node(
            'p',
            'Original command DecisionResult is not correlated or the receipt did not commit. No decision completion claimed.',
          ),
        );
    } else if (state.receipt && !state.runtimePage)
      dialog.append(
        node(
          'p',
          'Receipt is recorded; authorized current readback unavailable. No current result inferred.',
        ),
      );
    for (const [label, key, enabled, action] of [
      ['Manual refresh', 'refresh', state.canRead, () => owner.refresh()],
      ['Review exact intent', 'review', state.canReview, () => owner.review()],
      [
        'Confirm once → queue',
        'confirm',
        state.canConfirm,
        () => owner.confirm(),
      ],
      [
        'Read original FINAL → authorized readback',
        'final',
        state.canLookupFinal,
        () => owner.lookupAndRefresh(),
      ],
      ['Disconnect', 'disconnect', state.canRead, () => owner.disconnect()],
      [
        'Close',
        'close',
        true,
        () => {
          const surface = dialog,
            entry = trigger;
          if (surface) {
            surface.close();
            clearPrivateContent(surface);
          }
          if (entry && active(owner, lifetime, entry)) entry.focus();
        },
      ],
    ] as const) {
      const el = button(label, key, enabled, action);
      dialog.append(el);
      if (focused === key) el.focus();
    }
  }
  function notify() {
    for (const fn of [...listeners]) fn();
  }
  function changed() {
    reconcile(true);
    notify();
  }
  let stop = controller.subscribe(changed);
  function retire() {
    generation++;
    stop();
    stop = () => undefined;
    controller.disconnect();
    removePrivateShell();
  }
  function reconcile(redraw = false): boolean {
    if (reconciling) return false;
    reconciling = true;
    let replaced = false;
    try {
      const next = document.querySelector<HTMLElement>('.country-game');
      if (next !== root) {
        retire();
        root = next;
        replaced = true;
      }
      const state = controller.getState();
      if (!root || state.status === 'MISSING' || state.status === 'DENIED') {
        removePrivateShell();
        return replaced;
      }
      const tools = root.querySelector('.national-tools');
      if (!tools) {
        removePrivateShell();
        return replaced;
      }
      if (trigger && !document.body.contains(trigger)) removePrivateShell();
      if (!trigger || !dialog) {
        trigger = button('Office intent', 'open', true, () => {
          if (dialog && !dialog.open) dialog.showModal();
          reconcile(true);
        });
        trigger.dataset.officeCommandEntry = '';
        trigger.className = 'national-atlas';
        tools.append(trigger);
        dialog = document.createElement('dialog');
        dialog.dataset.officeCommandDialog = '';
        dialog.className = 'national-drawer';
        dialog.setAttribute('aria-label', 'Manual Office command');
        Object.assign(dialog.style, {
          inset: '0',
          margin: 'auto',
          width: 'min(680px, calc(100vw - 48px))',
          height: 'fit-content',
          maxHeight: 'calc(100dvh - 48px)',
          overflowWrap: 'anywhere',
        });
        const surface = dialog;
        surface.addEventListener('close', () => {
          if (!surface.open) clearPrivateContent(surface);
        });
        root.append(dialog);
        redraw = true;
      }
      if (redraw) render(state);
      return replaced;
    } finally {
      reconciling = false;
    }
  }
  function sync() {
    if (reconcile()) notify();
  }
  const observer = new MutationObserver(sync);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-country', 'data-office'],
  });
  host.addEventListener('pagehide', () => {
    retire();
    reconcile();
    notify();
  });
  sync();
  document.addEventListener?.(
    'click',
    (event) => {
      const role = currentView()?.role,
        moduleId = INDUSTRY_RUN_CATALOG_BINDING.moduleId,
        selector =
          role === 'captain'
            ? '[data-module-card="captain-8"],[data-cmd="module"][data-id="captain-8"],[data-cmd="country-module"][data-id="captain-8"],[data-cmd="country-module"][data-module="captain-8"],[data-cmd="country-room"][data-module="captain-8"]'
            : role === 'industry'
              ? `[data-module-card="${moduleId}"],[data-cmd="module"][data-id="${moduleId}"],[data-cmd="country-module"][data-id="${moduleId}"],[data-cmd="country-module"][data-module="${moduleId}"],[data-cmd="country-room"][data-module="${moduleId}"]`
              : null;
      const target =
        selector && event.target instanceof Element
          ? event.target.closest<HTMLElement>(selector)
          : null;
      if (!target || !root?.contains(target)) return;
      sync();
      const state = controller.getState();
      if (state.status === 'MISSING' || state.status === 'DENIED' || !dialog)
        return; // existing explicit blocked-module UI remains in force
      event.preventDefault();
      event.stopImmediatePropagation();
      dialog.showModal();
      void controller.refresh().finally(() => {
        reconcile(true);
      });
    },
    true,
  );
  return Object.freeze({
    connect(binding: OfficeCommandBinding) {
      sync();
      retire();
      root = document.querySelector<HTMLElement>('.country-game');
      controller = factory(binding, currentView);
      const owner = controller,
        lifetime = generation;
      stop = controller.subscribe(() => {
        if (owner === controller && lifetime === generation) changed();
      });
      reconcile(true);
      notify();
      return controller.getState().status;
    },
    disconnect: () => controller.disconnect(),
    getState: () => controller.getState(),
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  });
}
declare global {
  interface Window {
    EconMindOfficeCommand?: ReturnType<typeof installOfficeCommand>;
  }
}
