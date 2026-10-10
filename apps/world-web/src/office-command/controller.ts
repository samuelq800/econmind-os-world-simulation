import type {
  AuthenticatedOfficeCommandRequestDto,
  ManualOfficeQueueAcknowledgementDto,
} from '@econmind/core/authenticated-office-command-contract';
import type { BrowserFinalReceipt } from '../authorized-client/client.js';
import {
  createProductionReadClient,
  type FinalLookupIdentity,
} from '../production-read/client.js';
import {
  canonicalId,
  hash,
  validConfig,
  type ProductionReadConfig,
} from '../production-read/contract.js';
import { sameAuthorizedIdentity } from '../prototype/authorized-read-adapter.js';
import {
  consumeOfficeProjection,
  officeProjectionRoles,
  type OfficeProjectionModel,
  type OfficeProjectionView,
} from '../office-projection/model.js';
import { createOfficeCommandClient } from './client.js';
import {
  officeFamilies,
  parseOfficeIntent,
  validOfficeEndpoint,
  type OfficeCommandEndpoint,
} from './contract.js';

export interface OfficeCommandBinding {
  readonly read: ProductionReadConfig;
  readonly view: OfficeProjectionView;
  readonly endpoint: OfficeCommandEndpoint;
}
export function validOfficeBinding(
  b: OfficeCommandBinding | null,
): b is OfficeCommandBinding {
  return (
    !!b &&
    !!b.view &&
    Object.hasOwn(officeProjectionRoles, b.view.role) &&
    validConfig(b.read) &&
    validOfficeEndpoint(b.endpoint, b.read) &&
    b.read.identity.classification === 'OFFICE_PRIVATE' &&
    Object.hasOwn(officeFamilies, b.read.identity.officeId) &&
    officeProjectionRoles[b.view.role] === b.read.identity.officeId &&
    /^(0[1-9]|[1-6][0-9]|70)$/u.test(b.view.countryDisplayId)
  );
}
type Status =
  | 'MISSING'
  | 'READY_TO_READ'
  | 'READING'
  | 'CURRENT'
  | 'REVIEW_REQUIRED'
  | 'REVIEWED'
  | 'SUBMITTING'
  | 'QUEUE_ACK'
  | 'UNKNOWN'
  | 'REJECTED'
  | 'LOOKING_UP_FINAL'
  | 'FINAL_VERIFIED'
  | 'UNAVAILABLE'
  | 'DENIED';
export function createOfficeCommandController(
  supplied: OfficeCommandBinding | null,
  currentView: () => OfficeProjectionView | null,
  options: {
    readonly fetcher?: typeof fetch;
    readonly requestId?: () => string;
  } = {},
) {
  const b = validOfficeBinding(supplied)
    ? {
        view: { ...supplied.view },
        endpoint: { ...supplied.endpoint },
        read: {
          ...supplied.read,
          identity: { ...supplied.read.identity },
          world: { ...supplied.read.world },
          endpoints: { ...supplied.read.endpoints },
          session: { ...supplied.read.session },
        },
      }
    : null;
  const reader = b ? createProductionReadClient(b.read, options) : null,
    writer = b ? createOfficeCommandClient(b.endpoint, b.read, options) : null;
  const requestId = options.requestId ?? (() => crypto.randomUUID()),
    listeners = new Set<() => void>();
  let retired = !b,
    busy = false,
    epoch = 0,
    attempted = false,
    outcomeUnknown = false,
    stop: (() => void) | null = null;
  let status: Status = b ? 'READY_TO_READ' : 'MISSING',
    code: string | null = b ? null : 'OFFICE_BINDING_MISSING_OR_UNSUPPORTED';
  let model: OfficeProjectionModel | null = null,
    intent: AuthenticatedOfficeCommandRequestDto | null = null,
    acknowledgement: ManualOfficeQueueAcknowledgementDto | null = null,
    lookup: FinalLookupIdentity | null = null,
    receipt: BrowserFinalReceipt | null = null;
  let floor = b?.read.world.minimumWorldVersion ?? '0';
  let submitStatus: Status | null = null;
  let submitCode: string | null = null;
  const notify = () => {
    for (const fn of [...listeners]) fn();
  };
  function disconnect(reason = 'SESSION_OR_VIEW_LOST') {
    retired = true;
    epoch++;
    busy = false;
    status = reason === 'DENIED' ? 'DENIED' : 'MISSING';
    code = reason;
    model = null;
    intent = null;
    acknowledgement = null;
    lookup = null;
    receipt = null;
    reader?.disconnect();
    writer?.disconnect();
    const cleanup = stop;
    stop = null;
    try {
      cleanup?.();
    } catch {
      /* Retirement is irreversible. */
    }
    notify();
  }
  function checkLiveness() {
    if (retired || !b) return false;
    try {
      const view = currentView();
      if (
        b.read.session.isCurrent() &&
        sameAuthorizedIdentity(b.read.currentIdentity(), b.read.identity) &&
        view?.role === b.view.role &&
        view.countryDisplayId === b.view.countryDisplayId
      )
        return true;
    } catch {
      /* Unavailable host is not authority. */
    }
    disconnect();
    return false;
  }
  if (b) {
    try {
      const unsubscribe = b.read.session.onInvalidate(() => disconnect());
      if (typeof unsubscribe !== 'function') disconnect();
      else if (retired) unsubscribe();
      else stop = unsubscribe;
    } catch {
      disconnect();
    }
    checkLiveness();
  }
  function fail(reason: string) {
    if (reason === 'DENIED') {
      disconnect('DENIED');
      return;
    }
    model = null;
    status = 'UNAVAILABLE';
    code = reason;
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
  async function read() {
    if (!b || !reader) return;
    model = null;
    status = 'READING';
    notify();
    const r = await reader.readProjection(requestId());
    if (!checkLiveness()) return;
    if (r.status !== 'PROJECTION') {
      fail(r.status);
      return;
    }
    const next = consumeOfficeProjection(r, b.read, b.view.role);
    if (next.kind !== 'CURRENT') {
      fail(next.code);
      return;
    }
    if (BigInt(next.head.worldVersion) < BigInt(floor)) {
      fail('STALE');
      return;
    }
    floor = next.head.worldVersion;
    model = next;
    code = receipt ? null : submitCode;
    status = receipt ? 'FINAL_VERIFIED' : (submitStatus ?? 'CURRENT');
  }
  return Object.freeze({
    disconnect,
    checkLiveness,
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    getState() {
      checkLiveness();
      return {
        status,
        code,
        model: model
          ? (JSON.parse(JSON.stringify(model)) as OfficeProjectionModel)
          : null,
        receipt,
        acknowledgement,
        intent: intent
          ? (JSON.parse(
              JSON.stringify(intent),
            ) as AuthenticatedOfficeCommandRequestDto)
          : null,
        canRead: !retired && !busy,
        canStage: !retired && !busy && !attempted && !!model,
        canReview: !retired && !busy && !attempted && !!intent && !!model,
        canConfirm:
          !retired && !busy && !attempted && status === 'REVIEWED' && !!model,
        canLookupFinal: !retired && !busy && !!lookup,
        canRecover: !retired && !busy && outcomeUnknown && !lookup,
        completion:
          status === 'FINAL_VERIFIED' &&
          receipt?.outcome === 'COMMITTED' &&
          model?.decisionResult.result?.cause?.commandId ===
            lookup?.commandId &&
          model?.decisionResult.result?.cause?.commandFingerprint ===
            lookup?.commandFingerprint &&
          model?.decisionResult.result?.cause?.worldVersionAfter ===
            receipt.worldVersionAfter &&
          receipt.eventIds.includes(
            model?.decisionResult.result?.cause?.eventId ?? '',
          ),
      };
    },
    refresh: () =>
      operation(async () => {
        await read();
      }),
    stage(value: unknown) {
      if (!b || busy || attempted || !checkLiveness()) return false;
      const next = parseOfficeIntent(value, b.read);
      if (
        !next ||
        !model ||
        next.request.expectedWorldVersion !== model.head.worldVersion
      ) {
        intent = null;
        status = 'UNAVAILABLE';
        code = 'INTENT_OR_CURRENT_VERSION_MISMATCH';
        notify();
        return false;
      }
      intent = next;
      status = 'REVIEW_REQUIRED';
      code = null;
      notify();
      return true;
    },
    review() {
      if (
        !checkLiveness() ||
        busy ||
        attempted ||
        !intent ||
        !model ||
        intent.request.expectedWorldVersion !== model.head.worldVersion
      )
        return false;
      status = 'REVIEWED';
      notify();
      return true;
    },
    confirm: () =>
      operation(async () => {
        if (
          !writer ||
          !intent ||
          !model ||
          attempted ||
          status !== 'REVIEWED' ||
          intent.request.expectedWorldVersion !== model.head.worldVersion
        )
          return;
        attempted = true;
        status = 'SUBMITTING';
        code = null;
        notify();
        const result = await writer.submit(intent);
        if (!checkLiveness()) return;
        if (result.status === 'DENIED') {
          disconnect('DENIED');
          return;
        }
        if (result.status === 'QUEUE_ACK') {
          acknowledgement = result.acknowledgement;
          lookup = {
            commandId: intent.request.commandId,
            idempotencyKey: intent.request.idempotencyKey,
            commandFingerprint: acknowledgement.commandFingerprint,
          };
          status = 'QUEUE_ACK';
        } else {
          outcomeUnknown = result.status === 'UNKNOWN';
          status =
            result.status === 'REJECTED'
              ? 'REJECTED'
              : outcomeUnknown
                ? 'UNKNOWN'
                : 'UNAVAILABLE';
          code = result.status === 'REJECTED' ? result.code : result.status;
        }
        submitStatus = status;
        submitCode = code;
      }),
    recoverLookup(original: FinalLookupIdentity) {
      if (
        !checkLiveness() ||
        busy ||
        !outcomeUnknown ||
        lookup ||
        !intent ||
        !canonicalId(original.commandId) ||
        !canonicalId(original.idempotencyKey) ||
        !hash(original.commandFingerprint) ||
        original.commandId !== intent.request.commandId ||
        original.idempotencyKey !== intent.request.idempotencyKey
      )
        return false;
      lookup = Object.freeze({ ...original });
      notify();
      return true;
    },
    lookupAndRefresh: () =>
      operation(async () => {
        if (!reader || !lookup) return;
        model = null;
        receipt = null;
        status = 'LOOKING_UP_FINAL';
        code = null;
        notify();
        const r = await reader.lookupFinal(requestId(), lookup);
        if (!checkLiveness()) return;
        if (r.status !== 'FINAL_RECEIPT') {
          fail(r.status);
          return;
        }
        receipt = Object.freeze({
          ...r.receipt,
          eventIds: Object.freeze([...r.receipt.eventIds]),
        });
        if (BigInt(r.authority.readback.worldVersion) > BigInt(floor))
          floor = r.authority.readback.worldVersion;
        await read();
      }),
  });
}
