import {
  createFinancialIntakeController,
  type FinancialIntakeBinding,
} from './controller.js';
import {
  economicAvailabilityMessages,
  officeProjectionRoles,
  type OfficeProjectionView,
} from '../office-projection/model.js';
import type { FinancialIntakeAction } from '@econmind/core/authenticated-financial-intake-contract';

const labels: Record<FinancialIntakeAction, string> = {
  REGISTER: 'Register this offer',
  INSPECT: 'Inspect this transfer',
  SIGN_SELLER: 'Sign seller offer',
  SIGN_BUYER_TRADE: 'Sign buyer trade approval',
  SIGN_BUYER_FINANCE: 'Sign finance approval',
  BIND_REFERENCE: 'Bind finance reference',
  ENQUEUE: 'Queue signed transfer',
  READ: 'Read intake state',
};

/** Additive order drawer using the existing country-game surface and fonts.
 * Host supplies one original action at a time. No replacement map or policies. */
export function installFinancialIntake(
  document: Document,
  host: Window,
  factory: typeof createFinancialIntakeController = createFinancialIntakeController,
) {
  const currentView = (): OfficeProjectionView | null => {
    const root = document.querySelector<HTMLElement>('.country-game'),
      role = root?.dataset.office;
    return root?.dataset.country &&
      role &&
      Object.hasOwn(officeProjectionRoles, role)
      ? {
          countryDisplayId: root.dataset.country,
          role: role as OfficeProjectionView['role'],
        }
      : null;
  };
  let controller = factory(null, currentView),
    unsubscribe = controller.subscribe(render);
  let root: HTMLElement | null = null,
    trigger: HTMLButtonElement | null = null,
    dialog: HTMLDialogElement | null = null,
    mountedView: OfficeProjectionView | null = null;
  const node = (tag: string, text: string) => {
    const element = document.createElement(tag);
    element.textContent = text;
    return element;
  };
  function action(
    key: string,
    label: string,
    enabled: boolean,
    fn: () => unknown,
  ) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'national-atlas';
    el.textContent = label;
    el.disabled = !enabled;
    el.dataset.financialAction = key;
    el.addEventListener('click', () => {
      void Promise.resolve(fn()).catch(() => controller.disconnect());
    });
    return el;
  }
  function render() {
    const state = controller.getState();
    if (trigger) {
      trigger.title = `Transfer orders · ${state.status}`;
      trigger.setAttribute('aria-label', 'Transfer orders');
    }
    if (!dialog?.open) return;
    const focus = dialog.contains(document.activeElement)
      ? (document.activeElement as HTMLElement).dataset.financialAction
      : undefined;
    dialog.replaceChildren(node('h2', 'Transfer orders'));
    const status = node('p', `${state.connection} · ${state.status}`);
    status.setAttribute('role', 'status');
    dialog.append(status);
    dialog.append(
      node('p', 'Signatures and queue entries are not settled results.'),
    );
    if (state.uncertain)
      dialog.append(
        node(
          'p',
          'Result unknown. Inspect the original request; never create a replacement to retry.',
        ),
      );
    if (state.request) {
      const s = state.request.request;
      dialog.append(node('h3', labels[s.action]));
      const list = document.createElement('dl');
      for (const [label, value] of [
        [
          'World / country / office',
          `${s.worldId} / ${s.countryId} / ${s.officeId}`,
        ],
        ['Original command', s.commandId],
        ['Idempotency key', s.idempotencyKey],
        ['Fingerprint', s.commandFingerprint ?? 'Not supplied'],
      ])
        list.append(node('dt', label!), node('dd', value!));
      dialog.append(list);
      if (s.intent) {
        const i = s.intent,
          terms = document.createElement('dl');
        for (const [label, value] of [
          ['Buyer', i.buyerCountryId],
          ['World version', i.expectedWorldVersion],
          ['Quantity', `${i.quantity.amount} ${i.quantity.unit}`],
          [
            'Unit price',
            `${i.price.amount} ${i.price.currency} / ${i.price.perUnit}`,
          ],
          ['Expires', i.expiresAtReal],
        ])
          terms.append(node('dt', label!), node('dd', value!));
        dialog.append(terms);
        const source = node('details', '');
        source.append(node('summary', 'Asset source'));
        const fields = document.createElement('dl');
        for (const [key, value] of Object.entries(i.assetSource))
          fields.append(node('dt', key), node('dd', value));
        source.append(fields);
        dialog.append(source);
      }
      const ids = node('details', '');
      ids.append(node('summary', 'Original request reference'));
      ids.append(node('p', state.request.requestId));
      dialog.append(ids);
    }
    const steps = node('ol', '');
    steps.append(
      node('li', `Inspect original · ${state.inspection}`),
      node(
        'li',
        state.reviewed
          ? 'Original action reviewed'
          : 'Review the original action',
      ),
      node('li', 'Look up original FINAL, then refresh the country'),
    );
    dialog.append(steps);
    dialog.append(
      action('inspect', 'Inspect original transfer', state.canInspect, () =>
        controller.inspect(),
      ),
    );
    const review = document.createElement('label'),
      checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = state.reviewed;
    checkbox.disabled = !state.canReview;
    checkbox.dataset.financialAction = 'review';
    checkbox.addEventListener('change', () =>
      controller.review(checkbox.checked),
    );
    review.append(
      checkbox,
      document.createTextNode(' I reviewed this exact original action'),
    );
    dialog.append(review);
    dialog.append(
      action(
        'submit',
        state.request
          ? labels[state.request.request.action]
          : 'Submit — unavailable',
        state.canSubmit,
        () => controller.submit(),
      ),
    );
    if (state.attempted)
      dialog.append(
        action('retry', 'Retry this same request', state.canRetry, () =>
          controller.retry(),
        ),
      );
    dialog.append(
      action(
        'final',
        'Look up original FINAL → refresh',
        state.canLookupFinal,
        () => controller.lookupAndRefresh(),
      ),
    );
    if (state.read?.receipt) {
      dialog.append(node('h3', `FINAL · ${state.read.receipt.outcome}`));
      dialog.append(
        node(
          'p',
          `${state.read.receipt.commandId} · World v${state.read.receipt.worldVersionAfter ?? 'unchanged'}`,
        ),
      );
      if (state.read.model) {
        dialog.append(
          node(
            'p',
            `Country refreshed · World v${state.read.model.head.worldVersion} / event ${state.read.model.head.eventSequence}`,
          ),
        );
        for (const message of economicAvailabilityMessages(
          state.read.model.economicAvailability,
        ))
          dialog.append(node('p', message));
        const values = document.createElement('dl');
        for (const field of state.read.model.readouts)
          values.append(
            node('dt', field.label),
            node('dd', `${field.canonicalValue} ${field.unit}`),
          );
        dialog.append(
          values,
          node('p', 'Net Posting movement · Not spendable balances'),
        );
      } else
        dialog.append(
          node(
            'p',
            `Current country fields unavailable · ${state.read.code ?? state.read.status}`,
          ),
        );
    }
    if (state.code) {
      const detail = node('details', '');
      detail.setAttribute('open', '');
      detail.append(
        node('summary', 'Connection / recovery'),
        node('p', state.code),
      );
      dialog.append(detail);
    }
    dialog.append(
      action('close', 'Close', true, () => {
        dialog?.close();
        trigger?.focus();
      }),
    );
    if (focus)
      dialog
        .querySelector<HTMLElement>(`[data-financial-action="${focus}"]`)
        ?.focus();
  }
  function sync() {
    const next = document.querySelector<HTMLElement>('.country-game'),
      view = currentView();
    const changed =
      root !== next ||
      view?.role !== mountedView?.role ||
      view?.countryDisplayId !== mountedView?.countryDisplayId;
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
        trigger = action('open', '⚖', true, () => {
          dialog?.showModal();
          render();
        });
        trigger.className = '';
        trigger.dataset.financialIntakeEntry = '';
        root.querySelector('.national-tools')?.append(trigger);
        dialog = document.createElement('dialog');
        dialog.className = 'national-drawer';
        dialog.dataset.financialIntakeDialog = '';
        Object.assign(dialog.style, {
          inset: '0',
          margin: 'auto',
          width: 'min(680px, calc(100vw - 48px))',
          height: 'fit-content',
          maxHeight: 'calc(100dvh - 48px)',
          font: 'inherit',
          overflowWrap: 'anywhere',
        });
        dialog.setAttribute('aria-label', 'Transfer order action');
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
    connect(binding: FinancialIntakeBinding) {
      controller.disconnect();
      unsubscribe();
      controller = factory(binding, currentView);
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
    EconMindFinancialIntake?: ReturnType<typeof installFinancialIntake>;
  }
}
