import {
  AUTHENTICATED_FINANCIAL_INTAKE_SCHEMA,
  FINANCIAL_INTAKE_OFFICE_ACTIONS,
  type AuthenticatedFinancialIntakeRequestDto,
} from '@econmind/core';
import { exactJson } from '../country-runtime/staged-reservation-client.js';
import { createOfficeProjectionController } from '../office-projection/controller.js';
import {
  officeProjectionRoles,
  type OfficeProjectionView,
} from '../office-projection/model.js';
import { sameAuthorizedIdentity } from '../prototype/authorized-read-adapter.js';
import {
  canonicalId,
  hash,
  row,
  uuid,
  validConfig,
  type ProductionReadConfig,
} from '../production-read/contract.js';
import {
  createProductionReadClient,
  type FinalLookupIdentity,
} from '../production-read/client.js';
import {
  createFinancialIntakeTransport,
  validFinancialEndpoint,
  type FinancialIntakeEndpoint,
} from './transport.js';

export interface FinancialIntakeBinding {
  readonly read: ProductionReadConfig;
  readonly endpoint: FinancialIntakeEndpoint;
  readonly view: OfficeProjectionView;
  /** Explicit host-owned original request, not generated from static UI figures. */
  readonly request: AuthenticatedFinancialIntakeRequestDto;
  readonly finalLookup?: FinalLookupIdentity;
}

/** Non-authoritative intent/retry consumer. Server INSPECT with current read
 * binding must succeed before a write button can enable. No automatic replay. */
export function createFinancialIntakeController(
  supplied: FinancialIntakeBinding | null,
  currentView: () => OfficeProjectionView | null,
  options: {
    readonly fetcher?: typeof fetch;
    readonly readFactory?: typeof createProductionReadClient;
    readonly requestId?: () => string;
  } = {},
) {
  let binding: FinancialIntakeBinding | null = null;
  try {
    if (
      supplied &&
      validConfig(supplied.read) &&
      validFinancialEndpoint(supplied.endpoint, supplied.read) &&
      officeProjectionRoles[supplied.view.role] ===
        supplied.read.identity.officeId &&
      /^(0[1-9]|[1-6][0-9]|70)$/u.test(supplied.view.countryDisplayId)
    ) {
      const r = supplied.request,
        s = r.request,
        lookup = supplied.finalLookup;
      if (
        r.schemaVersion === AUTHENTICATED_FINANCIAL_INTAKE_SCHEMA &&
        uuid(r.requestId) &&
        s.schemaVersion === 'world-staged-transfer-v1' &&
        canonicalId(s.commandId) &&
        canonicalId(s.idempotencyKey) &&
        s.worldId === supplied.read.identity.worldId &&
        s.countryId === supplied.read.identity.countryId &&
        s.officeId === supplied.read.identity.officeId &&
        (!lookup ||
          (lookup.commandId === s.commandId &&
            lookup.idempotencyKey === s.idempotencyKey &&
            hash(lookup.commandFingerprint) &&
            (!s.commandFingerprint ||
              s.commandFingerprint === lookup.commandFingerprint)))
      ) {
        // Reuse exact-string comparison utility; freeze original body for every retry.
        const request = JSON.parse(
          exactJson(r),
        ) as AuthenticatedFinancialIntakeRequestDto;
        binding = {
          read: {
            ...supplied.read,
            identity: Object.freeze({ ...supplied.read.identity }),
            world: Object.freeze({ ...supplied.read.world }),
            endpoints: Object.freeze({ ...supplied.read.endpoints }),
            session: Object.freeze({ ...supplied.read.session }),
          },
          endpoint: Object.freeze({ ...supplied.endpoint }),
          view: Object.freeze({ ...supplied.view }),
          request,
          ...(lookup ? { finalLookup: Object.freeze({ ...lookup }) } : {}),
        };
      }
    }
  } catch {
    /* Invalid host config stays disconnected, not authority. */
  }
  const c = binding;
  let retired = !c,
    busy = false,
    epoch = 0,
    bound = false,
    matched = false,
    reviewed = false,
    attempted = false,
    retryEligible = false,
    complete = false,
    uncertain = false;
  let status = 'NOT_CONNECTED',
    code: string | null = c ? null : 'TRUSTED_FINANCIAL_BINDING_MISSING',
    inspection = 'NOT_INSPECTED';
  let active: AbortController | null = null,
    stop: (() => void) | null = null;
  const listeners = new Set<() => void>(),
    notify = () => {
      for (const fn of listeners) fn();
    };
  const read = createOfficeProjectionController(
    c
      ? {
          read: c.read,
          view: c.view,
          ...(c.finalLookup ? { finalLookup: c.finalLookup } : {}),
        }
      : null,
    currentView,
    options.readFactory ?? createProductionReadClient,
    options.requestId,
  );
  const readStop = read.subscribe(() => {
    if (!retired && read.getState().status === 'DENIED') retire('DENIED');
    else notify();
  });
  const viewSupported = () => {
    const view = currentView();
    return (
      !!view &&
      Object.hasOwn(officeProjectionRoles, view.role) &&
      FINANCIAL_INTAKE_OFFICE_ACTIONS[officeProjectionRoles[view.role]].length >
        0
    );
  };
  function live() {
    try {
      const view = currentView();
      return (
        !!c &&
        !retired &&
        c.read.session.isCurrent() &&
        sameAuthorizedIdentity(c.read.currentIdentity(), c.read.identity) &&
        view?.role === c.view.role &&
        view.countryDisplayId === c.view.countryDisplayId
      );
    } catch {
      return false;
    }
  }
  function retire(reason: 'NOT_CONNECTED' | 'DENIED') {
    if (retired) return;
    retired = true;
    epoch++;
    busy = false;
    bound = false;
    matched = false;
    reviewed = false;
    retryEligible = false;
    inspection = 'NOT_INSPECTED';
    status = reason;
    code =
      reason === 'DENIED'
        ? 'AUTHORIZATION_DENIED'
        : 'TRUSTED_FINANCIAL_BINDING_MISSING';
    active?.abort();
    active = null;
    readStop();
    read.disconnect();
    const cleanup = stop;
    stop = null;
    try {
      cleanup?.();
    } catch {
      /* Retired. */
    }
    notify();
  }
  function disconnect() {
    retire('NOT_CONNECTED');
  }
  function checkLiveness() {
    if (live()) return true;
    if (!retired) disconnect();
    return false;
  }
  const port = c
    ? createFinancialIntakeTransport(c.endpoint, c.read, live, options)
    : null;
  const actions: readonly string[] = c
    ? FINANCIAL_INTAKE_OFFICE_ACTIONS[c.request.request.officeId]
    : [];
  const supported = !!c && actions.includes(c.request.request.action);
  if (c) {
    try {
      const cleanup = c.read.session.onInvalidate(disconnect);
      if (typeof cleanup !== 'function') disconnect();
      else if (retired) cleanup();
      else stop = cleanup;
    } catch {
      disconnect();
    }
    checkLiveness();
  }
  async function run(fn: () => Promise<void>) {
    if (busy || !checkLiveness() || !supported) return;
    busy = true;
    const started = epoch;
    notify();
    try {
      await fn();
    } catch {
      if (started === epoch && checkLiveness()) {
        status = attempted ? 'UNKNOWN' : 'UNAVAILABLE';
        code = 'UPSTREAM_UNAVAILABLE';
        matched = false;
        reviewed = false;
      }
    } finally {
      if (started === epoch) {
        busy = false;
        notify();
      }
    }
  }
  async function execute(request: AuthenticatedFinancialIntakeRequestDto) {
    if (!c || !port || !checkLiveness()) return null;
    active = new AbortController();
    const cancellation = active;
    let token: string | null;
    let cancelled: (value: null) => void = () => undefined;
    const stopped = new Promise<null>((resolve) => {
      cancelled = resolve;
    });
    const onAbort = () => cancelled(null);
    cancellation.signal.addEventListener('abort', onAbort, { once: true });
    const tokenTimer = setTimeout(() => cancellation.abort(), 10_000);
    try {
      token = await Promise.race([c.read.getAccessToken(), stopped]);
    } catch {
      token = null;
    } finally {
      clearTimeout(tokenTimer);
      cancellation.signal.removeEventListener('abort', onAbort);
    }
    if (!checkLiveness()) return null;
    if (!token || cancellation.signal.aborted) {
      bound = false;
      status = 'NOT_CONNECTED';
      code = 'SESSION_TOKEN_MISSING';
      return null;
    }
    const result = await port.execute({
      request,
      accessToken: token,
      signal: active.signal,
    });
    if (!checkLiveness()) return null;
    active = null;
    if (result.error?.code === 'AUTHORIZATION_DENIED') {
      uncertain = attempted;
      retire('DENIED');
      return null;
    }
    if (!result.ok) {
      matched = false;
      reviewed = false;
      if (result.state?.status === 'UNKNOWN') {
        uncertain = true;
        status = 'UNKNOWN';
        code = 'INSPECT_ORIGINAL_BEFORE_RETRY';
        retryEligible = false;
      } else {
        status =
          result.error?.code === 'NOT_CONNECTED'
            ? 'NOT_CONNECTED'
            : 'UNAVAILABLE';
        code = result.error?.code ?? 'UPSTREAM_UNAVAILABLE';
        retryEligible = result.error?.retryable === true;
      }
      bound = false;
      return result;
    }
    bound = true;
    code = null;
    return result;
  }
  function canAct() {
    return (
      !!c &&
      live() &&
      supported &&
      !complete &&
      !busy &&
      bound &&
      matched &&
      reviewed
    );
  }
  function requestCopy() {
    return c
      ? (JSON.parse(
          exactJson(c.request),
        ) as AuthenticatedFinancialIntakeRequestDto)
      : null;
  }
  async function send(retry: boolean) {
    if (!canAct() || !c || (retry ? !attempted || !retryEligible : attempted))
      return;
    await run(async () => {
      attempted = true;
      matched = false;
      reviewed = false;
      retryEligible = false;
      status = 'SUBMITTING';
      notify();
      const result = await execute(requestCopy()!);
      if (result?.ok) {
        const s = c.request.request,
          state = result.state!,
          ack = row(state.acknowledgement),
          fp = s.commandFingerprint ?? c.finalLookup?.commandFingerprint;
        const sameFingerprint = (value: unknown) =>
          hash(value) && (!fp || value === fp);
        const correlated = [
          'QUEUED',
          'EXECUTING',
          'PENDING_APPROVAL_OR_ENQUEUE',
          'FINAL',
        ].includes(state.status)
          ? !!ack &&
            ack.worldId === s.worldId &&
            ack.commandId === s.commandId &&
            ack.status === 'ACCEPTED' &&
            sameFingerprint(ack.commandFingerprint)
          : state.status === 'SIGNATURE_RECORDED'
            ? state.officeId === s.officeId &&
              sameFingerprint(state.commandFingerprint)
            : state.status === 'REFERENCE_BOUND'
              ? canonicalId(state.approvalRef) &&
                sameFingerprint(state.commandFingerprint)
              : ['NOT_FOUND', 'INTENT'].includes(state.status);
        if (!correlated) {
          uncertain = true;
          status = 'UNKNOWN';
          code = 'INTAKE_IDENTITY_UNCONFIRMED';
          return;
        }
        uncertain = false;
        // Intake's FINAL is only a report. Existing verified lookup owns FINAL proof.
        status =
          result.state?.status === 'FINAL'
            ? 'FINAL_REPORTED'
            : result.state!.status;
      }
    });
  }
  return Object.freeze({
    getState() {
      checkLiveness();
      const unsupported = !viewSupported();
      return {
        connection: bound && !retired ? 'SERVER_BOUND' : 'NOT_CONNECTED',
        status: unsupported ? 'OFFICE_COMMAND_FAMILY_UNSUPPORTED' : status,
        code: unsupported
          ? 'OFFICE_COMMAND_FAMILY_UNSUPPORTED'
          : !supported && c
            ? 'OFFICE_ACTION_UNSUPPORTED'
            : code,
        inspection,
        reviewed,
        attempted,
        uncertain,
        request: !retired ? requestCopy() : null,
        canInspect: !!c && !retired && supported && !busy,
        canReview: !!c && !retired && supported && !busy && bound && matched,
        canSubmit: canAct() && !attempted,
        canRetry: canAct() && attempted && retryEligible,
        canLookupFinal: !!c?.finalLookup && !retired && !busy,
        read: !retired ? read.getState() : null,
      };
    },
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    checkLiveness,
    disconnect,
    review(value: boolean) {
      reviewed = value && !!c && live() && bound && matched && !busy;
      notify();
    },
    inspect: () =>
      run(async () => {
        if (!c) return;
        const recoverable =
          status === 'UNKNOWN' ||
          retryEligible ||
          code === 'SESSION_TOKEN_MISSING';
        matched = false;
        reviewed = false;
        status = 'INSPECTING';
        inspection = 'CHECKING';
        notify();
        const s = c.request.request;
        const result = await execute({
          schemaVersion: AUTHENTICATED_FINANCIAL_INTAKE_SCHEMA,
          requestId: (options.requestId ?? (() => crypto.randomUUID()))(),
          request: {
            schemaVersion: s.schemaVersion,
            action: 'INSPECT',
            worldId: s.worldId,
            countryId: s.countryId,
            officeId: s.officeId,
            commandId: s.commandId,
            idempotencyKey: s.idempotencyKey,
          },
        });
        if (!result?.ok) {
          inspection = 'FAILED';
          return;
        }
        const state = result.state!,
          fp = s.commandFingerprint ?? c.finalLookup?.commandFingerprint;
        matched =
          state.status === 'NOT_FOUND'
            ? s.action === 'REGISTER'
            : state.status === 'INTENT' &&
              state.commandId === s.commandId &&
              state.idempotencyKey === s.idempotencyKey &&
              !!fp &&
              state.commandFingerprint === fp;
        inspection = matched ? 'MATCHED_ORIGINAL' : 'ORIGINAL_NOT_MATCHED';
        status = matched ? 'READY_TO_REVIEW' : 'INSPECTION_MISMATCH';
        code = matched ? null : 'ORIGINAL_IDENTITY_OR_INTENT_UNAVAILABLE';
        // UNKNOWN never replays. A user must explicitly inspect the original,
        // review it again, then click retry with the exact frozen original body.
        retryEligible = attempted && matched && recoverable;
      }),
    submit: () => send(false),
    retry: () => send(true),
    lookupAndRefresh: () =>
      run(async () => {
        if (!c?.finalLookup) return;
        reviewed = false;
        matched = false;
        retryEligible = false;
        status = 'LOOKING_UP_FINAL';
        notify();
        await read.lookupAndRefresh();
        if (!checkLiveness()) return;
        const snapshot = read.getState();
        if (snapshot.status === 'DENIED') {
          retire('DENIED');
          return;
        }
        complete = !!snapshot.receipt;
        if (complete) uncertain = false;
        status = snapshot.receipt ? 'FINAL_VERIFIED' : snapshot.status;
        code = snapshot.code;
      }),
  });
}
export type FinancialIntakeController = ReturnType<
  typeof createFinancialIntakeController
>;
