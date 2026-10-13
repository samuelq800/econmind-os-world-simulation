import {
  createOfficeCommandController,
  type OfficeCommandBinding,
} from './controller.js';
import {
  officeProjectionRoles,
  type OfficeProjectionView,
} from '../office-projection/model.js';
import { renderDecisionResult } from '../office-projection/decision-result-view.js';

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
      node('h2', 'Manual Office intent — Captain / Central Bank / Social'),
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
        'Only a current server-authorized seat can submit. Industry / Finance / Trade are not supported by this command port. Queue acknowledgement, including FINALIZED, is not an economic commit.',
      ),
    );
    const draft = document.createElement('textarea');
    draft.setAttribute('aria-label', 'Original manual Office request JSON');
    draft.dataset.officeCommandDraft = '';
    draft.value = state.intent ? JSON.stringify(state.intent, null, 2) : '';
    draft.disabled = !state.canStage;
    dialog.append(
      node(
        'p',
        'Read the current authorized projection, then paste an explicit original public DTO: requestId, world/country/office, command family, commandId, idempotencyKey, expectedWorldVersion and payload. No IDs or economic terms are generated here.',
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
          'Write outcome unknown. Do not resubmit. Only recover by the original command/key/fingerprint from the authorized workflow.',
        ),
      );
      const fingerprint = document.createElement('input');
      fingerprint.setAttribute('aria-label', 'Original command fingerprint');
      dialog.append(
        fingerprint,
        button(
          'Bind original FINAL reference — no replay',
          'recover',
          state.canRecover,
          () => {
            if (state.intent)
              owner.recoverLookup({
                commandId: state.intent.request.commandId,
                idempotencyKey: state.intent.request.idempotencyKey,
                commandFingerprint: fingerprint.value,
              });
          },
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
      if (state.receipt && !state.completion)
        dialog.append(
          node(
            'p',
            'Original command DecisionResult is not correlated or the receipt did not commit. No decision completion claimed.',
          ),
        );
    } else if (state.receipt)
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
