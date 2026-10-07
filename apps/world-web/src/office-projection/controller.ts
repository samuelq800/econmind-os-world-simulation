import type { BrowserFinalReceipt } from '../authorized-client/client.js';
import { sameAuthorizedIdentity } from '../prototype/authorized-read-adapter.js';
import {
  createProductionReadClient,
  type FinalLookupIdentity,
  type ProductionReadPort,
} from '../production-read/client.js';
import {
  validConfig,
  type ProductionReadConfig,
} from '../production-read/contract.js';
import {
  consumeOfficeProjection,
  officeProjectionRoles,
  type OfficeProjectionModel,
  type OfficeProjectionView,
} from './model.js';

export interface OfficeProjectionBinding {
  readonly read: ProductionReadConfig;
  readonly view: OfficeProjectionView;
  /** Original reference from the existing authorized workflow; never synthesized by UI. */
  readonly finalLookup?: FinalLookupIdentity;
}
export interface OfficeProjectionState {
  readonly connection: 'NOT_CONNECTED' | 'READ_ONLY_BOUND';
  readonly status:
    | 'MISSING'
    | 'READY_TO_READ'
    | 'READING'
    | 'CURRENT'
    | 'LOOKING_UP_FINAL'
    | 'STALE'
    | 'DENIED'
    | 'UNAVAILABLE';
  readonly code: string | null;
  readonly model: OfficeProjectionModel | null;
  readonly receipt: BrowserFinalReceipt | null;
  readonly canRead: boolean;
  readonly canLookupFinal: boolean;
  readonly command: {
    readonly kind: 'DISABLED';
    readonly code: 'PRODUCTION_COMMAND_PORT_MISSING';
  };
}

/** No submit port exists in the approved production client. Read/FINAL refresh
 * only; existing staged Trade command workflow stays separately scoped. */
export function createOfficeProjectionController(
  supplied: OfficeProjectionBinding | null,
  currentView: () => OfficeProjectionView | null,
  factory: (
    config: ProductionReadConfig,
  ) => ProductionReadPort = createProductionReadClient,
  requestId: () => string = () => crypto.randomUUID(),
) {
  const binding =
    supplied?.view &&
    validConfig(supplied.read) &&
    Object.hasOwn(officeProjectionRoles, supplied.view.role) &&
    officeProjectionRoles[supplied.view.role] ===
      supplied.read.identity.officeId &&
    /^(0[1-9]|[1-6][0-9]|70)$/u.test(supplied.view.countryDisplayId)
      ? {
          ...supplied,
          view: Object.freeze({ ...supplied.view }),
          read: {
            ...supplied.read,
            identity: Object.freeze({ ...supplied.read.identity }),
            world: Object.freeze({ ...supplied.read.world }),
            endpoints: Object.freeze({ ...supplied.read.endpoints }),
            session: Object.freeze({ ...supplied.read.session }),
          },
          finalLookup: supplied.finalLookup
            ? Object.freeze({ ...supplied.finalLookup })
            : undefined,
        }
      : null;
  let retired = !binding,
    busy = false,
    epoch = 0;
  let status: OfficeProjectionState['status'] = binding
    ? 'READY_TO_READ'
    : 'MISSING';
  let code: string | null = binding ? null : 'TRUSTED_READ_BINDING_MISSING';
  let model: OfficeProjectionModel | null = null,
    receipt: BrowserFinalReceipt | null = null;
  let stopHost: (() => void) | null = null;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const fn of listeners) fn();
  };
  const port = binding ? factory(binding.read) : null;
  function disconnect() {
    retired = true;
    epoch++;
    busy = false;
    model = null;
    receipt = null;
    status = 'MISSING';
    code = 'TRUSTED_READ_BINDING_MISSING';
    port?.disconnect();
    const stop = stopHost;
    stopHost = null;
    try {
      stop?.();
    } catch {
      /* Detached; cannot reconnect. */
    }
    notify();
  }
  function current() {
    if (!binding || retired) return false;
    try {
      const view = currentView();
      return (
        binding.read.session.isCurrent() === true &&
        sameAuthorizedIdentity(
          binding.read.currentIdentity(),
          binding.read.identity,
        ) &&
        view?.role === binding.view.role &&
        view.countryDisplayId === binding.view.countryDisplayId
      );
    } catch {
      return false;
    }
  }
  function checkLiveness() {
    if (current()) return true;
    if (!retired) disconnect();
    return false;
  }
  if (binding && port) {
    try {
      const stop = binding.read.session.onInvalidate(disconnect);
      if (typeof stop !== 'function') disconnect();
      else if (retired) stop();
      else stopHost = stop;
    } catch {
      disconnect();
    }
    checkLiveness();
  }
  function fail(reason: string) {
    model = null;
    code = reason;
    status = reason === 'STALE' || reason === 'DENIED' ? reason : 'UNAVAILABLE';
  }
  async function read(minimumVersion?: string) {
    if (!binding || !port || !checkLiveness()) return;
    model = null;
    status = 'READING';
    code = null;
    notify();
    const result = await port.readProjection(requestId());
    if (!checkLiveness()) return;
    if (result.status !== 'PROJECTION') {
      fail(result.status);
      return;
    }
    const next = consumeOfficeProjection(
      result,
      binding.read,
      binding.view.role,
    );
    if (next.kind !== 'CURRENT') {
      fail(next.code);
      return;
    }
    if (
      minimumVersion &&
      BigInt(next.head.worldVersion) < BigInt(minimumVersion)
    ) {
      fail('STALE');
      return;
    }
    model = Object.freeze({
      ...next,
      head: Object.freeze({ ...next.head }),
      readouts: Object.freeze(
        next.readouts.map((field) => Object.freeze({ ...field })),
      ),
      missing: Object.freeze(
        next.missing.map((field) => Object.freeze({ ...field })),
      ),
    });
    status = 'CURRENT';
    code = null;
  }
  async function operation(fn: () => Promise<void>) {
    if (busy || !checkLiveness()) return;
    busy = true;
    const started = epoch;
    try {
      await fn();
    } catch {
      if (started === epoch && checkLiveness()) fail('UNAVAILABLE');
    } finally {
      if (started === epoch) {
        busy = false;
        notify();
      }
    }
  }
  return Object.freeze({
    getState(): OfficeProjectionState {
      checkLiveness();
      return {
        connection: !retired && port ? port.state() : 'NOT_CONNECTED',
        status,
        code,
        model,
        receipt,
        canRead: !!binding && !retired && !busy,
        canLookupFinal: !!binding?.finalLookup && !retired && !busy,
        command: { kind: 'DISABLED', code: 'PRODUCTION_COMMAND_PORT_MISSING' },
      };
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    checkLiveness,
    disconnect,
    refresh: () =>
      operation(() => read(receipt?.worldVersionAfter ?? undefined)),
    lookupAndRefresh: () =>
      operation(async () => {
        if (!port || !binding?.finalLookup) return;
        model = null;
        receipt = null;
        code = null;
        status = 'LOOKING_UP_FINAL';
        notify();
        const result = await port.lookupFinal(requestId(), binding.finalLookup);
        if (!checkLiveness()) return;
        if (result.status !== 'FINAL_RECEIPT') {
          fail(result.status);
          return;
        }
        receipt = Object.freeze({
          ...result.receipt,
          eventIds: Object.freeze([...result.receipt.eventIds]),
        });
        await read(result.authority.readback.worldVersion);
      }),
  });
}
export type OfficeProjectionController = ReturnType<
  typeof createOfficeProjectionController
>;
