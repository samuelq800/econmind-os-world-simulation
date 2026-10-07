import {
  countryRoleOffices,
  createTrustedCountryRuntime,
  type CountryRuntimeView,
  type TrustedCountryRuntime,
  type TrustedCountryRuntimeConfig,
} from './trusted-runtime.js';
import { installOfficeProjection } from '../office-projection/view.js';

/** Mounted by the selected static page; no prototype/fixture entry is imported. */
export function installCountryRuntime(document: Document, host: Window) {
  let mountedRoot: HTMLElement | null = null;
  let dialog: HTMLDialogElement | null = null;
  let trigger: HTMLButtonElement | null = null;
  const view = (): CountryRuntimeView | null => {
    const root = document.querySelector<HTMLElement>('.country-game');
    const role = root?.dataset.office;
    if (
      !root?.dataset.country ||
      !role ||
      !Object.hasOwn(countryRoleOffices, role)
    )
      return null;
    return {
      countryId: root.dataset.country,
      role: role as CountryRuntimeView['role'],
    };
  };
  let runtime: TrustedCountryRuntime = createTrustedCountryRuntime(null, view);
  let stopRuntime = runtime.subscribe(render);

  function button(label: string, disabled: boolean, action: () => unknown) {
    const item = document.createElement('button');
    item.type = 'button';
    item.textContent = label;
    item.disabled = disabled;
    item.addEventListener('click', () => {
      void Promise.resolve(action()).catch(() => runtime.disconnect());
    });
    return item;
  }
  function text(tag: string, content: string) {
    const item = document.createElement(tag);
    item.textContent = content;
    return item;
  }
  function render() {
    const state = runtime.getState();
    if (trigger) {
      trigger.title = `Runtime · ${state.connection}`;
      trigger.setAttribute('aria-label', trigger.title);
    }
    if (mountedRoot) mountedRoot.dataset.runtimeConnection = state.connection;
    if (!dialog?.open) return;
    // Keep the focused action button stable during async status updates.
    const focusedAction = dialog.contains(document.activeElement)
      ? (document.activeElement as HTMLElement).dataset.runtimeAction
      : undefined;
    dialog.replaceChildren(text('h2', 'Trusted local runtime'));
    const status = text(
      'p',
      `${state.connection} · ${state.lifecycle} · ${state.snapshot?.phase ?? 'No trusted host configuration'}`,
    );
    status.setAttribute('role', 'status');
    dialog.append(status);
    dialog.append(
      text(
        'p',
        'Isolated browser integration preparation. Host claims are not server admission. Source fields and local allocations are not live projection or Command terms.',
      ),
    );
    const inspection = text('p', `INSPECT: ${state.inspectionStatus}`);
    inspection.setAttribute('role', 'status');
    inspection.setAttribute('aria-label', 'Registered intent inspection');
    dialog.append(inspection);
    if (state.inspectedIntent) {
      const intent = state.inspectedIntent;
      dialog.append(
        text(
          'p',
          `Verified INSPECT intent: ${intent.commandId} · ${intent.commandFingerprint} · Expected World version ${intent.expectedWorldVersion}. Server response matched the frozen intent; this is not ENQUEUE admission or execution authority.`,
        ),
      );
      if (!state.canReview && !state.receipt && state.canRead)
        dialog.append(
          text(
            'p',
            `Before Review, read / refresh the authorized projection at expected World version ${intent.expectedWorldVersion}. INSPECT alone does not enable Review.`,
          ),
        );
    } else if (state.inspectionStatus === 'PENDING')
      dialog.append(
        text('p', 'INSPECT pending; wait for the server response.'),
      );
    else if (state.inspectionStatus === 'FAILED')
      dialog.append(
        text(
          'p',
          'INSPECT failed or did not match. No verified intent; Review is blocked.',
        ),
      );
    dialog.append(
      text(
        'p',
        'Workflow: Inspect registered intent → Read authorized projection (expected version) → Review → Confirm ENQUEUE once → Read FINAL → Refresh authorized projection. Each step keeps its existing server and session checks.',
      ),
    );
    if (state.snapshot?.reason) dialog.append(text('p', state.snapshot.reason));
    if (state.ui) {
      dialog.append(text('p', `FINAL command: ${state.ui.command.kind}`));
      const receipt = state.receipt;
      if (receipt)
        dialog.append(
          text(
            'p',
            `FINAL ${receipt.outcome} · ${receipt.commandId} · ${receipt.commandFingerprint} · World version ${receipt.worldVersionAfter ?? 'unchanged'}`,
          ),
        );
      if (state.projection) {
        dialog.append(
          text(
            'h3',
            `Authorized Posting movement · version ${state.projection.worldVersion} · not opening-inclusive stock balances`,
          ),
        );
        for (const movement of state.projection.movements)
          dialog.append(
            text(
              'p',
              `${movement.commodityId} ${movement.bucket}: ${movement.quantity} ${movement.unit} net Posting movement`,
            ),
          );
      } else
        dialog.append(
          text(
            'p',
            'Authorized movement projection unavailable. Before Review, read the expected version; after a verified FINAL, refresh again.',
          ),
        );
    }
    if (state.draft) {
      dialog.append(text('h3', 'Review host-prepared inventory reservation'));
      const fields = document.createElement('textarea');
      fields.readOnly = true;
      fields.rows = 12;
      fields.cols = 32;
      fields.setAttribute(
        'aria-label',
        'Exact inspected reservation intent and approval reference',
      );
      fields.value = JSON.stringify(state.draft, null, 2);
      dialog.append(fields);
      dialog.append(
        text(
          'p',
          'INSPECT matched this immutable intent. The server must still validate current authority, three signatures and approval reference. Reservation only; no payment, shipping or delivery. No amount is inferred from the source page.',
        ),
      );
    }
    const actions: readonly [string, string, boolean, () => unknown][] = [
      [
        'inspect',
        'Inspect registered intent',
        !state.canInspect,
        () => runtime.inspect(),
      ],
      [
        'read',
        'Read / refresh authorized projection',
        !state.canRead,
        () => runtime.readProjection(),
      ],
      [
        'review',
        'Review prepared inventory reservation',
        !state.canReview,
        () => runtime.review(),
      ],
      [
        'confirm',
        'Confirm ENQUEUE reservation once',
        !state.canConfirm,
        () => runtime.confirm(),
      ],
      [
        'lookup',
        'Read original lifecycle / FINAL receipt',
        !state.canLookup,
        () => runtime.lookupOriginalFinalReceipt(),
      ],
      [
        'disconnect',
        'Disconnect',
        state.connection === 'NOT_CONNECTED',
        () => runtime.disconnect(),
      ],
      [
        'close',
        'Close',
        false,
        () => {
          dialog?.close();
          trigger?.focus();
        },
      ],
    ];
    for (const [key, label, disabled, action] of actions) {
      const item = button(label, disabled, action);
      item.dataset.runtimeAction = key;
      dialog.append(item);
      if (key === focusedAction) item.focus();
    }
  }

  function sync() {
    const root = document.querySelector<HTMLElement>('.country-game');
    if (root !== mountedRoot) {
      runtime.disconnect();
      dialog?.remove();
      trigger?.remove();
      mountedRoot = root;
      dialog = null;
      trigger = null;
      if (root) {
        trigger = button('↔', false, () => {
          dialog?.showModal();
          render();
        });
        trigger.dataset.runtimeEntry = '';
        trigger.title = 'Runtime · NOT_CONNECTED';
        trigger.setAttribute('aria-label', trigger.title);
        root.querySelector('.national-tools')?.append(trigger);
        dialog = document.createElement('dialog');
        dialog.dataset.runtimeDialog = '';
        dialog.setAttribute('aria-label', 'Trusted local runtime');
        root.append(dialog);
      }
    }
    runtime.checkLiveness();
    root
      ?.querySelectorAll<HTMLButtonElement>('[data-cmd="country-confirm"]')
      .forEach((item) => {
        item.disabled = true;
        item.title =
          'Local allocation cannot execute a World Command. Use the trusted runtime review.';
      });
    const connection = runtime.getState().connection;
    if (root && root.dataset.runtimeConnection !== connection)
      root.dataset.runtimeConnection = connection;
  }
  // Even programmatic dispatch must not turn local source allocations into Commands.
  const guardAllocation = (event: Event) => {
    if ((event.target as Element)?.closest?.('[data-cmd="country-confirm"]')) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };
  document.addEventListener('click', guardAllocation, true);
  const observer = new MutationObserver(sync);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-country', 'data-office'],
  });
  host.addEventListener('pagehide', () => runtime.disconnect());
  sync();
  const api = Object.freeze({
    /** Trusted host calls explicitly. No config is discovered from URL/storage/VITE. */
    connect(config: TrustedCountryRuntimeConfig) {
      runtime.disconnect();
      stopRuntime();
      runtime = createTrustedCountryRuntime(config, view);
      stopRuntime = runtime.subscribe(render);
      render();
      sync();
      return runtime.getState().connection;
    },
    disconnect: () => runtime.disconnect(),
    getState: () => runtime.getState(),
  });
  return api;
}

declare global {
  interface Window {
    EconMindCountryRuntime?: ReturnType<typeof installCountryRuntime>;
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.EconMindCountryRuntime = installCountryRuntime(document, window);
  window.EconMindOfficeProjection = installOfficeProjection(document, window);
  document.dispatchEvent(new Event('econmind-country-runtime-ready'));
}
