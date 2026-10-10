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
  const currentView = (): OfficeProjectionView | null => {
    const r = document.querySelector<HTMLElement>('.country-game'),
      role = r?.dataset.office;
    return r?.dataset.country &&
      role &&
      Object.hasOwn(officeProjectionRoles, role)
      ? {
          countryDisplayId: r.dataset.country,
          role: role as OfficeProjectionView['role'],
        }
      : null;
  };
  let controller = factory(null, currentView),
    root: HTMLElement | null = null,
    trigger: HTMLButtonElement | null = null,
    dialog: HTMLDialogElement | null = null;
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
    const el = document.createElement('button');
    el.type = 'button';
    el.textContent = label;
    el.dataset.officeCommandAction = key;
    el.disabled = !enabled;
    el.addEventListener('click', () => {
      void Promise.resolve(action()).catch(() => controller.disconnect());
    });
    return el;
  }
  function render() {
    const state = controller.getState();
    if (trigger) {
      trigger.title = `Office intent · ${state.status}`;
      trigger.dataset.officeCommandState = state.status;
    }
    if (!dialog) return;
    if (!dialog.open) {
      dialog.replaceChildren();
      return;
    }
    const focused = dialog.contains(document.activeElement)
      ? (document.activeElement as HTMLElement).dataset.officeCommandAction
      : undefined;
    dialog.replaceChildren(
      node('h2', 'Manual Office intent — Captain / Central Bank / Social'),
    );
    const status = node(
      'p',
      `${state.status}${state.code ? ' · ' + state.code : ''}`,
    );
    status.setAttribute('role', 'status');
    dialog.append(status);
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
          controller.stage(JSON.parse(draft.value));
        } catch {
          controller.stage(null);
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
              controller.recoverLookup({
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
      [
        'Read current authorization/projection',
        'refresh',
        state.canRead,
        () => controller.refresh(),
      ],
      [
        'Review exact intent',
        'review',
        state.canReview,
        () => controller.review(),
      ],
      [
        'Confirm once → queue',
        'confirm',
        state.canConfirm,
        () => controller.confirm(),
      ],
      [
        'Read original FINAL → authorized readback',
        'final',
        state.canLookupFinal,
        () => controller.lookupAndRefresh(),
      ],
      [
        'Disconnect',
        'disconnect',
        state.canRead,
        () => controller.disconnect(),
      ],
      [
        'Close',
        'close',
        true,
        () => {
          dialog?.close();
          dialog?.replaceChildren();
          trigger?.focus();
        },
      ],
    ] as const) {
      const el = button(label, key, enabled, action);
      dialog.append(el);
      if (focused === key) el.focus();
    }
  }
  function changed() {
    render();
    for (const fn of [...listeners]) fn();
  }
  let stop = controller.subscribe(changed);
  function sync() {
    const next = document.querySelector<HTMLElement>('.country-game');
    controller.checkLiveness();
    if (next !== root) {
      trigger?.remove();
      dialog?.remove();
      root = next;
      trigger = null;
      dialog = null;
      if (root) {
        trigger = button('Office intent', 'open', true, () => {
          dialog?.showModal();
          render();
        });
        trigger.dataset.officeCommandEntry = '';
        trigger.className = 'national-atlas';
        root.querySelector('.national-tools')?.append(trigger);
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
          if (!surface.open) surface.replaceChildren();
        });
        root.append(dialog);
      }
      render();
    }
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
    connect(binding: OfficeCommandBinding) {
      controller.disconnect();
      stop();
      controller = factory(binding, currentView);
      stop = controller.subscribe(changed);
      render();
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
