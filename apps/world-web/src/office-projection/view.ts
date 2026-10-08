import {
  createOfficeProjectionController,
  type OfficeProjectionBinding,
} from './controller.js';
import {
  economicAvailabilityMessages,
  officeProjectionRoles,
  roleProjectionGaps,
  type OfficeProjectionView,
} from './model.js';
import { renderCurrentFinancialPosition } from './financial-position-view.js';
import { renderDecisionResult } from './decision-result-view.js';

/** Additive drawer in the approved country shell. No map, opening HUD, source
 * asset or original form is replaced. No URL/storage/VITE credentials loaded. */
export function installOfficeProjection(
  document: Document,
  host: Window,
  createController: typeof createOfficeProjectionController = createOfficeProjectionController,
) {
  const currentView = (): OfficeProjectionView | null => {
    const root = document.querySelector<HTMLElement>('.country-game');
    const role = root?.dataset.office;
    return root?.dataset.country &&
      role &&
      Object.hasOwn(officeProjectionRoles, role)
      ? {
          countryDisplayId: root.dataset.country,
          role: role as OfficeProjectionView['role'],
        }
      : null;
  };
  let controller = createController(null, currentView);
  let root: HTMLElement | null = null,
    trigger: HTMLButtonElement | null = null,
    dialog: HTMLDialogElement | null = null;
  let mountedView: OfficeProjectionView | null = null;
  const node = (tag: string, value: string) => {
    const el = document.createElement(tag);
    el.textContent = value;
    return el;
  };
  function button(label: string, action: () => unknown) {
    const el = document.createElement('button');
    el.type = 'button';
    el.textContent = label;
    el.className = 'national-atlas';
    el.addEventListener('click', () => {
      void Promise.resolve(action()).catch(() => controller.disconnect());
    });
    return el;
  }
  function render() {
    const state = controller.getState(),
      view = currentView();
    if (trigger) {
      trigger.setAttribute('aria-label', 'Authorized World projection');
      trigger.title = `World readout · ${state.model ? 'v' + state.model.head.worldVersion : state.status}${state.code ? ' · ' + state.code : ''}`;
      trigger.dataset.officeProjectionState = state.status;
    }
    if (!dialog?.open) return;
    const focused = dialog.contains(document.activeElement)
      ? (document.activeElement as HTMLElement).dataset.officeReadAction
      : undefined;
    dialog.replaceChildren(
      node(
        'h2',
        `${view ? officeProjectionRoles[view.role] : 'Office'} / World readout`,
      ),
    );
    const status = node(
      'p',
      `${state.connection} · ${state.status}${state.code ? ' · ' + state.code : ''}`,
    );
    status.setAttribute('role', 'status');
    dialog.append(status);
    dialog.append(
      node('p', 'Server readout · Ledger positions are not spendable funds'),
    );
    if (state.model) {
      const source = node('details', '');
      source.append(
        node(
          'summary',
          `Source head · World v${state.model.head.worldVersion} / event ${state.model.head.eventSequence}`,
        ),
      );
      const list = document.createElement('dl');
      for (const [key, value] of Object.entries(state.model.head))
        list.append(node('dt', key), node('dd', value));
      source.append(list);
      dialog.append(source);
      dialog.append(renderDecisionResult(document, state.model.decisionResult));
      dialog.append(
        renderCurrentFinancialPosition(
          document,
          state.model.currentFinancialPosition,
        ),
        node('h3', 'Net Posting movement / activity'),
      );
      const fields = document.createElement('dl');
      fields.setAttribute('aria-label', 'Exact authorized projection values');
      for (const field of state.model.readouts)
        fields.append(
          node('dt', field.label),
          node('dd', `${field.canonicalValue} ${field.unit}`),
        );
      dialog.append(fields);
      for (const message of economicAvailabilityMessages(
        state.model.economicAvailability,
      ))
        dialog.append(node('p', message));
      if (
        state.model.economicAvailability.financial === 'AVAILABLE' &&
        state.model.readouts.length === 1
      )
        dialog.append(
          node(
            'p',
            'No authorized financial movement entries. This is not a zero or spendable balance.',
          ),
        );
    }
    if (state.receipt) {
      dialog.append(node('h3', `FINAL · ${state.receipt.outcome}`));
      dialog.append(
        node(
          'p',
          `${state.receipt.commandId} · ${state.receipt.commandFingerprint}`,
        ),
      );
      dialog.append(
        node(
          'p',
          `Receipt version: ${state.receipt.worldVersionAfter ?? 'unchanged'} · ${state.receipt.reasonCode ?? 'No rejection reason'}`,
        ),
      );
      if (!state.model)
        dialog.append(
          node(
            'p',
            'FINAL is recorded; current projection refresh is unavailable. No current fields shown.',
          ),
        );
    }
    const missing = document.createElement('details');
    missing.open = true;
    missing.append(node('summary', 'Current office state not supplied'));
    for (const field of view ? roleProjectionGaps[view.role] : [])
      missing.append(node('p', `${field} · ROLE_FIELD_NOT_PROJECTED`));
    dialog.append(missing);
    const submit = button('Submit World action — unavailable', () => undefined);
    submit.disabled = true;
    submit.title = state.command.code;
    submit.setAttribute('aria-describedby', 'office-read-command-gap');
    dialog.append(submit);
    const gap = node('p', state.command.code);
    gap.id = 'office-read-command-gap';
    dialog.append(gap);
    for (const [key, label, enabled, action] of [
      [
        'refresh',
        'Refresh authorized readout',
        state.canRead,
        () => controller.refresh(),
      ],
      [
        'final',
        'Read original FINAL → refresh',
        state.canLookupFinal,
        () => controller.lookupAndRefresh(),
      ],
      [
        'disconnect',
        'Disconnect readout',
        state.canRead || !!state.model || !!state.receipt,
        () => controller.disconnect(),
      ],
      [
        'close',
        'Close',
        true,
        () => {
          dialog?.close();
          trigger?.focus();
        },
      ],
    ] as const) {
      const el = button(label, action);
      el.disabled = !enabled;
      el.dataset.officeReadAction = key;
      dialog.append(el);
      if (key === focused) el.focus();
    }
  }
  let unsubscribe = controller.subscribe(render);
  function sync() {
    const next = document.querySelector<HTMLElement>('.country-game'),
      view = currentView();
    const changed =
      root !== next ||
      view?.role !== mountedView?.role ||
      view?.countryDisplayId !== mountedView?.countryDisplayId;
    // Root replacement on an ordinary rerender does not change the bound view.
    // Role/country navigation, including same-element attribute changes, retires.
    if (
      mountedView &&
      (!view ||
        view.role !== mountedView.role ||
        view.countryDisplayId !== mountedView.countryDisplayId)
    )
      controller.disconnect();
    if (root !== next) {
      trigger?.remove();
      dialog?.remove();
      root = next;
      trigger = null;
      dialog = null;
      if (root) {
        trigger = button('◎', () => {
          dialog?.showModal();
          render();
        });
        trigger.dataset.officeProjectionEntry = '';
        trigger.className = '';
        root.querySelector('.national-tools')?.append(trigger);
        dialog = document.createElement('dialog');
        dialog.dataset.officeProjectionDialog = '';
        // Reuse the approved drawer surface/fonts; contain only this new modal.
        dialog.className = 'national-drawer';
        Object.assign(dialog.style, {
          inset: '0',
          margin: 'auto',
          width: 'min(680px, calc(100vw - 48px))',
          height: 'fit-content',
          maxHeight: 'calc(100dvh - 48px)',
          font: 'inherit',
          overflowWrap: 'anywhere',
        });
        dialog.setAttribute('aria-label', 'Authorized office World readout');
        root.append(dialog);
      }
    }
    mountedView = view;
    controller.checkLiveness();
    if (changed) render();
  }
  const observer = new MutationObserver(sync);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-country', 'data-office'],
  });
  host.addEventListener('pagehide', () => controller.disconnect());
  sync();
  return Object.freeze({
    /** Explicit trusted host config only. Config strings do not grant seats. */
    connect(binding: OfficeProjectionBinding) {
      controller.disconnect();
      unsubscribe();
      controller = createController(binding, currentView);
      unsubscribe = controller.subscribe(render);
      render();
      return controller.getState().status;
    },
    disconnect: () => controller.disconnect(),
    getState: () => controller.getState(),
  });
}

declare global {
  interface Window {
    EconMindOfficeProjection?: ReturnType<typeof installOfficeProjection>;
  }
}
