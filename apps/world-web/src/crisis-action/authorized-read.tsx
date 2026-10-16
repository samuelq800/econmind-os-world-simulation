import { createRoot, type Root } from 'react-dom/client';
import { createOfficeProjectionController } from '../office-projection/controller.js';
import { consumeOfficeProjection } from '../office-projection/model.js';
import {
  createProductionReadClient,
  type ProductionReadPort,
  type ProjectionResult,
} from '../production-read/client.js';
import { row, type ProductionReadConfig } from '../production-read/contract.js';
import { sameAuthorizedIdentity } from '../prototype/authorized-read-adapter.js';
import { CrisisSummary, UNBOUND_CRISIS_STATE } from './CrisisActionPage.js';
import type { CrisisReadState, CrisisUnavailableReason } from './model.js';

const absent: readonly CrisisUnavailableReason[] = Object.freeze([
  'ACTUAL_GAP_NOT_PROJECTED',
  'VERIFIED_DELIVERY_NOT_PROJECTED',
  'CONTRIBUTION_NOT_PROJECTED',
  'CRISIS_CLOCK_NOT_PROJECTED',
  'PLAYER_CONTENT_NOT_PROJECTED',
]);
const exact = (value: unknown, keys: readonly string[]) => {
  const record = row(value);
  return record &&
    Object.keys(record).length === keys.length &&
    keys.every((key) => Object.hasOwn(record, key))
    ? record
    : null;
};

/** Mirror only the currently admitted *unavailable* carrier. No content/model
 * is admitted here; the API remains the disclosure and validation authority. */
function feedbackReasons(
  result: Extract<ProjectionResult, { status: 'PROJECTION' }>,
  config: ProductionReadConfig,
): readonly CrisisUnavailableReason[] {
  const f = exact(row(result.payload)?.feedback, [
    'schemaVersion',
    'classification',
    'scopeKey',
    'countryId',
    'officeId',
    'sourceHead',
    'generatedAt',
    'citizen',
    'government',
  ]);
  const head = exact(f?.sourceHead, [
    'worldId',
    'worldVersion',
    'eventSequence',
  ]);
  const unavailable = (value: unknown, reason: string) => {
    const part = exact(value, ['status', 'reason', 'items']);
    return (
      part?.status === 'UNAVAILABLE' &&
      part.reason === reason &&
      Array.isArray(part.items) &&
      part.items.length === 0
    );
  };
  const time = f?.generatedAt;
  if (
    config.identity.classification !== 'OFFICE_PRIVATE' ||
    f?.schemaVersion !== 'derived-system-feedback-v1' ||
    f.classification !== config.identity.classification ||
    f.scopeKey !== config.identity.scopeKey ||
    f.countryId !== config.identity.countryId ||
    f.officeId !== config.identity.officeId ||
    head?.worldId !== config.identity.worldId ||
    head.worldVersion !== result.worldVersion ||
    head.eventSequence !== result.authority.readback.eventSequence ||
    typeof time !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(time) ||
    Number.isNaN(Date.parse(time)) ||
    new Date(time).toISOString() !== time ||
    !unavailable(f.citizen, 'MODEL_NOT_ADMITTED') ||
    !unavailable(f.government, 'DISCLOSURE_UNAVAILABLE')
  )
    return ['FEEDBACK_UNAVAILABLE'];
  return ['MODEL_NOT_ADMITTED', 'DISCLOSURE_UNAVAILABLE'];
}

/** Observe the existing controller's actual read, never start a parallel read,
 * subscribe to the session again, synthesize a crisis DTO or mint a view. */
export function createCrisisReadBridge(
  factory: (
    config: ProductionReadConfig,
  ) => ProductionReadPort = createProductionReadClient,
  requestId: () => string = () => crypto.randomUUID(),
) {
  let state: CrisisReadState = UNBOUND_CRISIS_STATE;
  let epoch = 0;
  let check = () => true;
  let disconnect = () => {};
  const listeners = new Set<() => void>();
  const publish = (next: CrisisReadState) => {
    state = Object.freeze(next);
    for (const listener of [...listeners]) listener();
  };
  const createController: typeof createOfficeProjectionController = (
    binding,
    currentView,
  ) => {
    disconnect();
    const generation = ++epoch;
    let retired = false;
    let readPin: ProductionReadConfig | null = null;
    const viewPin = binding ? { ...binding.view } : null;
    const current = () => {
      try {
        const view = currentView();
        return (
          !retired &&
          generation === epoch &&
          !!readPin &&
          readPin.session.isCurrent() === true &&
          sameAuthorizedIdentity(readPin.currentIdentity(), readPin.identity) &&
          view?.role === viewPin?.role &&
          view?.countryDisplayId === viewPin?.countryDisplayId
        );
      } catch {
        return false;
      }
    };
    check = current;
    const controller = createOfficeProjectionController(
      binding,
      currentView,
      (config) => {
        readPin = config;
        const port = factory(config);
        return {
          ...port,
          async lookupFinal(id, identity) {
            if (current()) publish({ status: 'LOADING' });
            try {
              const result = await port.lookupFinal(id, identity);
              if (current() && result.status !== 'FINAL_RECEIPT')
                publish(
                  result.status === 'DENIED'
                    ? { status: 'DENIED' }
                    : result.status === 'NOT_CONNECTED'
                      ? UNBOUND_CRISIS_STATE
                      : {
                          status: result.status === 'STALE' ? 'STALE' : 'ERROR',
                          view: null,
                        },
                );
              return result;
            } catch (error) {
              if (current()) publish({ status: 'ERROR', view: null });
              throw error;
            }
          },
          async readProjection(id) {
            if (current()) publish({ status: 'LOADING' });
            try {
              const result = await port.readProjection(id);
              if (!current()) return result;
              if (result.status === 'PROJECTION') {
                // Reuse the same source/seat/country/office/current-head consumer.
                const model = consumeOfficeProjection(
                  result,
                  config,
                  viewPin!.role,
                );
                publish(
                  model.kind === 'CURRENT'
                    ? {
                        status: 'UNAVAILABLE',
                        reasons: Object.freeze([
                          ...absent,
                          ...feedbackReasons(result, config),
                        ]),
                      }
                    : { status: 'ERROR', view: null },
                );
              } else
                publish(
                  result.status === 'DENIED'
                    ? { status: 'DENIED' }
                    : result.status === 'NOT_CONNECTED'
                      ? UNBOUND_CRISIS_STATE
                      : {
                          status: result.status === 'STALE' ? 'STALE' : 'ERROR',
                          view: null,
                        },
                );
              return result;
            } catch (error) {
              if (current()) publish({ status: 'ERROR', view: null });
              throw error;
            }
          },
          disconnect() {
            retired = true;
            port.disconnect();
            if (generation === epoch) publish(UNBOUND_CRISIS_STATE);
          },
        };
      },
      requestId,
    );
    disconnect = () => {
      controller.disconnect();
      if (generation === epoch) {
        epoch++;
        publish(UNBOUND_CRISIS_STATE);
      }
    };
    return controller;
  };
  return Object.freeze({
    createController,
    getState(): CrisisReadState {
      if (state.status !== 'UNBOUND' && !check()) disconnect();
      return state;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      disconnect();
      listeners.clear();
    },
  });
}

/** Existing authorized drawer only: no public summary binding or new entry.
 * Replaced/closed drawer nodes and pagehide unmount the private surface. */
export function installCrisisReadSurface(
  document: Document,
  host: Window,
  bridge: ReturnType<typeof createCrisisReadBridge>,
) {
  let mounted: HTMLElement | null = null,
    root: Root | null = null;
  let rendered: CrisisReadState | null = null;
  let stopped = false;
  const clear = () => {
    root?.unmount();
    root = null;
    mounted?.remove();
    mounted = null;
    rendered = null;
  };
  const sync = () => {
    if (stopped) return;
    const state = bridge.getState();
    const dialog = document.querySelector<HTMLDialogElement>(
      '.country-game [data-office-projection-dialog][open]',
    );
    if (!dialog || state.status === 'UNBOUND') {
      clear();
      return;
    }
    if (!mounted || mounted.parentElement !== dialog) {
      clear();
      mounted = document.createElement('div');
      mounted.dataset.authorizedCrisis = '';
      dialog.append(mounted);
      root = createRoot(mounted);
    }
    if (rendered !== state) {
      rendered = state;
      root?.render(
        <CrisisSummary
          state={state}
          href={null}
          countryNumber={
            document.querySelector<HTMLElement>('.country-game')?.dataset
              .country ?? ''
          }
        />,
      );
    }
  };
  const observer = new MutationObserver(sync);
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['open'],
  });
  const unsubscribe = bridge.subscribe(sync);
  const dispose = () => {
    if (stopped) return;
    stopped = true;
    observer.disconnect();
    unsubscribe();
    clear();
    bridge.dispose();
    host.removeEventListener('pagehide', dispose);
  };
  host.addEventListener('pagehide', dispose, { once: true });
  sync();
  return Object.freeze({ dispose });
}
