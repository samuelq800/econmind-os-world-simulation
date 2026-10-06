import type {
  AuthorizedBrowserIdentity,
  BrowserFinalReceipt,
} from '../authorized-client/client.js';
import {
  resolveAuthorizedUi,
  sameAuthorizedIdentity,
} from '../prototype/authorized-read-adapter.js';
import { createLocalAuthorizedReadController } from '../prototype/local-authorized-read.js';
import {
  createStagedReservationClient,
  exactJson,
  localRuntimeOrigin,
  record,
  type PreparedReservation,
  type ReservationLifecycle,
  type StagedReservationPort,
} from './staged-reservation-client.js';

export const countryRoleOffices = Object.freeze({
  captain: 'CAPTAIN',
  finance: 'FINANCE',
  central_bank: 'CENTRAL_BANK',
  industry: 'INDUSTRY',
  trade: 'TRADE',
  social: 'SOCIAL',
});
export interface CountryRuntimeView {
  /** DOM display key (01), never server identity (COUNTRY_01). */
  readonly countryId: string;
  readonly role: keyof typeof countryRoleOffices;
}
export interface TrustedCountryRuntimeConfig {
  readonly currentIdentity: AuthorizedBrowserIdentity;
  readonly bridgeOrigin: string;
  readonly getAccessToken: () => Promise<string | null>;
  readonly session: {
    readonly sessionRef: string;
    readonly isCurrent: () => boolean;
    readonly onInvalidate: (listener: () => void) => () => void;
  };
  /** Assertion only; actual seed admission remains server-owned. */
  readonly seed: {
    readonly worldId: string;
    readonly seedRef: string;
    readonly contentHash: string;
  };
  readonly capability: {
    readonly kind: 'STAGED_INVENTORY_RESERVATION';
    readonly identity: AuthorizedBrowserIdentity;
  };
  readonly view: CountryRuntimeView;
  /** Host has separately completed REGISTER/three signatures/BIND; UI never manufactures them. */
  readonly preparedReservation: PreparedReservation;
}
const id = /^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u,
  version = /^(?:0|[1-9]\d*)$/u,
  hash = /^sha256:[0-9a-f]{64}$/u;
const decimal = /^(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/u,
  signedDecimal = /^-?(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/u;
const text = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= 256;
function validConfig(c: TrustedCountryRuntimeConfig) {
  try {
    const i = c.currentIdentity,
      p = c.preparedReservation,
      q = record(p?.payload.quantity);
    return !!(
      i &&
      c.session &&
      c.seed &&
      c.capability &&
      c.view &&
      p &&
      [i.worldId, i.countryId, i.officeId, i.scopeKey].every(
        (v) => text(v) && id.test(v),
      ) &&
      [
        i.authSubjectId,
        i.authorizationRevision,
        i.modelVersion,
        i.projectionVersion,
      ].every(text) &&
      ['COUNTRY', 'OFFICE_PRIVATE'].includes(i.classification) &&
      i.officeId === 'TRADE' &&
      text(c.session.sessionRef) &&
      typeof c.session.isCurrent === 'function' &&
      typeof c.session.onInvalidate === 'function' &&
      typeof c.getAccessToken === 'function' &&
      localRuntimeOrigin(c.bridgeOrigin) &&
      text(c.seed.seedRef) &&
      hash.test(c.seed.contentHash) &&
      c.seed.worldId === i.worldId &&
      c.capability.kind === 'STAGED_INVENTORY_RESERVATION' &&
      sameAuthorizedIdentity(i, c.capability.identity) &&
      text(c.view.countryId) &&
      c.view.role === 'trade' &&
      [p.commandId, p.idempotencyKey, p.approvalRef].every(
        (v) => text(v) && id.test(v),
      ) &&
      hash.test(p.commandFingerprint) &&
      version.test(p.expectedWorldVersion) &&
      q &&
      typeof q.amount === 'string' &&
      decimal.test(q.amount) &&
      q.amount !== '0' &&
      text(q.unit) &&
      p.payload.sellerCountryId === i.countryId &&
      exactJson(p.payload).length <= 16_384
    );
  } catch {
    return false;
  }
}
export interface InventoryMovement {
  readonly bucket: string;
  readonly commodityId: string;
  readonly quantity: string;
  readonly unit: string;
}
function movements(
  payload: unknown,
  identity: AuthorizedBrowserIdentity,
): readonly InventoryMovement[] | null {
  const row = record(payload),
    ledger = record(row?.ledger);
  if (
    row?.schemaVersion !== 'world-activity-projection-v1' ||
    row.countryId !== identity.countryId ||
    (identity.classification === 'OFFICE_PRIVATE' &&
      row.officeId !== identity.officeId) ||
    !Array.isArray(ledger?.inventoryPositions)
  )
    return null;
  const result: InventoryMovement[] = [];
  for (const item of ledger.inventoryPositions) {
    const p = record(item);
    if (
      !p ||
      !['AVAILABLE', 'RESERVED', 'IN_TRANSIT'].includes(String(p.bucket)) ||
      !text(p.commodityId) ||
      !id.test(p.commodityId) ||
      !text(p.unit) ||
      typeof p.quantity !== 'string' ||
      !signedDecimal.test(p.quantity) ||
      p.quantity === '-0'
    )
      return null;
    result.push({
      bucket: String(p.bucket),
      commodityId: p.commodityId,
      quantity: p.quantity,
      unit: p.unit,
    });
  }
  return result;
}
/** Reuses D's scoped projection/liveness controller, never its synchronous cash submit. */
export function createTrustedCountryRuntime(
  supplied: TrustedCountryRuntimeConfig | null,
  currentView: () => CountryRuntimeView | null,
  factory: (
    options: Parameters<typeof createStagedReservationClient>[0],
  ) => StagedReservationPort = createStagedReservationClient,
) {
  const c =
    supplied && validConfig(supplied)
      ? {
          ...supplied,
          currentIdentity: Object.freeze({ ...supplied.currentIdentity }),
          view: Object.freeze({ ...supplied.view }),
          session: Object.freeze({ ...supplied.session }),
          seed: Object.freeze({ ...supplied.seed }),
          preparedReservation: Object.freeze({
            ...supplied.preparedReservation,
            payload: JSON.parse(
              exactJson(supplied.preparedReservation.payload),
            ) as Readonly<Record<string, unknown>>,
          }),
        }
      : null;
  let retired = !c,
    reviewed = false,
    inspected = false,
    busy = false,
    attempted = false;
  let lifecycle: ReservationLifecycle | 'IDLE' | 'INSPECTING' | 'SUBMITTING' =
      'IDLE',
    receipt: BrowserFinalReceipt | null = null;
  // Observation of exact INSPECT equality, not authority to enqueue or execute.
  let inspectionStatus: 'NOT_INSPECTED' | 'PENDING' | 'MATCHED' | 'FAILED' =
    'NOT_INSPECTED';
  let stopHost: (() => void) | null = null;
  const listeners = new Set<() => void>(),
    notify = () => {
      for (const fn of listeners) fn();
    };
  const live = () => {
    if (retired || !c) return false;
    try {
      const v = currentView();
      return (
        c.session.isCurrent() === true &&
        v?.countryId === c.view.countryId &&
        v.role === c.view.role
      );
    } catch {
      return false;
    }
  };
  const port = c
    ? factory({
        identity: c.currentIdentity,
        origin: c.bridgeOrigin,
        prepared: c.preparedReservation,
        isCurrent: live,
        getAccessToken: async () => {
          if (!ensureCurrent()) return null;
          const token = await c.getAccessToken();
          return ensureCurrent() ? token : null;
        },
      })
    : null;
  const controller =
    c && port
      ? createLocalAuthorizedReadController(
          {
            currentIdentity: c.currentIdentity,
            bridgeOrigin: c.bridgeOrigin,
            getAccessToken: c.getAccessToken,
          },
          () => ({ readProjection: port.readProjection, cache: port.cache }),
        )
      : null;
  const pending = port?.pending();
  if (pending && pending.state !== 'EMPTY') {
    attempted = true;
    lifecycle = 'UNKNOWN';
  }
  function disconnect() {
    if (retired) return;
    retired = true;
    reviewed = false;
    inspected = false;
    inspectionStatus = 'NOT_INSPECTED';
    receipt = null;
    controller?.disconnect();
    port?.retire();
    const stop = stopHost;
    stopHost = null;
    try {
      stop?.();
    } catch {
      /* Already retired. */
    }
    notify();
  }
  function ensureCurrent() {
    if (!live()) {
      disconnect();
      return false;
    }
    return true;
  }
  function projection() {
    if (!live() || !controller || !c || (attempted && !receipt) || busy)
      return null;
    const read = controller.getSnapshot().read?.result;
    if (
      read?.status !== 'PROJECTION' ||
      read.source !== 'DERIVED_SERVER_PROJECTION' ||
      (receipt?.outcome === 'COMMITTED' &&
        BigInt(read.worldVersion) < BigInt(receipt.worldVersionAfter!))
    )
      return null;
    const values = movements(read.payload, c.currentIdentity);
    return values
      ? {
          worldVersion: read.worldVersion,
          snapshotRef: read.snapshotRef,
          movements: values,
        }
      : null;
  }
  function canReview() {
    const p = projection();
    return !!(
      live() &&
      inspected &&
      !busy &&
      !attempted &&
      p &&
      p.worldVersion === c?.preparedReservation.expectedWorldVersion
    );
  }
  controller?.subscribe(notify);
  if (c) {
    try {
      const stop = c.session.onInvalidate(disconnect);
      if (typeof stop !== 'function') disconnect();
      else if (retired) stop();
      else stopHost = stop;
    } catch {
      disconnect();
    }
    ensureCurrent();
  }
  return {
    getState() {
      ensureCurrent();
      const snapshot = live() ? (controller?.getSnapshot() ?? null) : null;
      return {
        connection: snapshot
          ? ('HOST_BOUND_LOCAL_PREPARATION' as const)
          : ('NOT_CONNECTED' as const),
        snapshot: snapshot ? structuredClone(snapshot) : null,
        lifecycle: snapshot ? lifecycle : ('IDLE' as const),
        inspectionStatus: snapshot
          ? inspectionStatus
          : ('NOT_INSPECTED' as const),
        inspectedIntent:
          snapshot && inspected && inspectionStatus === 'MATCHED'
            ? {
                commandId: c!.preparedReservation.commandId,
                commandFingerprint: c!.preparedReservation.commandFingerprint,
                expectedWorldVersion:
                  c!.preparedReservation.expectedWorldVersion,
              }
            : null,
        receipt: snapshot && receipt ? structuredClone(receipt) : null,
        projection: projection(),
        ui: snapshot
          ? resolveAuthorizedUi({
              currentIdentity: snapshot.identity,
              read: null,
              command: receipt
                ? {
                    identity: snapshot.identity!,
                    commandId: receipt.commandId,
                    result: { status: 'FINAL_RECEIPT', receipt },
                  }
                : null,
            })
          : null,
        draft:
          snapshot && reviewed ? structuredClone(c!.preparedReservation) : null,
        canRead:
          !!snapshot &&
          snapshot.phase !== 'LOADING' &&
          !busy &&
          (!attempted || !!receipt),
        canInspect: !!snapshot && !busy && !attempted,
        canReview: canReview(),
        canConfirm: reviewed && canReview(),
        canLookup: !!snapshot && !busy && attempted && !receipt,
      };
    },
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    disconnect,
    checkLiveness: ensureCurrent,
    async readProjection() {
      if (!ensureCurrent() || busy || (attempted && !receipt)) return;
      reviewed = false;
      await controller?.readProjection();
      ensureCurrent();
    },
    async inspect() {
      if (!ensureCurrent() || busy || attempted) return;
      reviewed = false;
      inspected = false;
      inspectionStatus = 'PENDING';
      busy = true;
      lifecycle = 'INSPECTING';
      notify();
      let matched = false;
      try {
        matched = await port!.inspect();
      } catch {
        // Do not expose transport errors or host-provided identity as verified.
      }
      busy = false;
      if (!ensureCurrent()) return;
      inspected = matched;
      inspectionStatus = matched ? 'MATCHED' : 'FAILED';
      lifecycle = inspected ? 'IDLE' : 'UNAVAILABLE';
      notify();
    },
    review() {
      if (!ensureCurrent() || !canReview()) return false;
      reviewed = true;
      notify();
      return true;
    },
    async confirm() {
      if (!ensureCurrent() || !reviewed || !canReview()) return;
      reviewed = false;
      attempted = true;
      busy = true;
      lifecycle = 'SUBMITTING';
      controller?.invalidate('ENQUEUE pending; old projection retired.');
      notify();
      try {
        lifecycle = await port!.enqueue();
      } catch {
        lifecycle = 'UNKNOWN';
      }
      busy = false;
      ensureCurrent();
      notify();
    },
    async lookupOriginalFinalReceipt() {
      if (!ensureCurrent() || busy || !attempted || receipt) return false;
      busy = true;
      notify();
      try {
        lifecycle = await port!.readLifecycle();
        receipt = await port!.lookupFinalReceipt();
        if (receipt) lifecycle = 'FINAL';
      } catch {
        lifecycle = 'UNKNOWN';
      }
      busy = false;
      if (!ensureCurrent()) return false;
      notify();
      return !!receipt;
    },
  };
}
export type TrustedCountryRuntime = ReturnType<
  typeof createTrustedCountryRuntime
>;
