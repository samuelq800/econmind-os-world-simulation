import type { AuthorizedBrowserIdentity } from '../authorized-client/client.js';
import { createProductionReadClient } from '../production-read/client.js';
import {
  officeProjectionRoles,
  type OfficeProjectionView,
} from '../office-projection/model.js';
import {
  AUTHORIZED_READ_BINDING_SCHEMA,
  canonicalId,
  parseAuthority,
  row,
  uuid,
  validEndpoints,
  validReadIdentity,
  validWorldPins,
  type AdmittedWorldPins,
  type ProductionReadConfig,
} from '../production-read/contract.js';
import { officeFamilies } from '../office-command/contract.js';
import type { installTrustedHost, TrustedHostTargets } from './bootstrap.js';

/** Metadata only; tokens stay in provider/call memory, never state or DOM. */
export interface AuthSessionSnapshot {
  readonly subject: string;
  readonly sessionRef: string;
  readonly expiresAtEpochSeconds: number;
}
export interface FormalAuthProvider {
  currentSession(): AuthSessionSnapshot | null;
  getAccessToken(): Promise<string | null>;
  subscribe(listener: () => void): () => void;
}
/** Pending G endpoint contract: return the EXISTING authorized-read envelope,
 * including persisted seat/admission authority; no positive/READY callback.
 * No endpoint is guessed or mounted here. The server still authenticates every
 * subsequent read/command. Structural consistency is not a browser grant. */
export interface FormalSeatReceiptProvider {
  readSeat(input: {
    readonly requestId: string;
    readonly subject: string;
    readonly view: OfficeProjectionView;
    readonly accessToken: string;
    readonly signal: AbortSignal;
  }): Promise<unknown>;
}
interface Configuration {
  readonly auth: FormalAuthProvider;
  readonly seats: FormalSeatReceiptProvider;
  readonly targets: TrustedHostTargets;
  readonly world: AdmittedWorldPins;
  /** Explicit host directory mapping, never inferred from DOM numbering. This
   * mapping is presentation selection only, never a grant of any country seat. */
  readonly countryIdsByDisplayId: Readonly<Record<string, string>>;
}
export function installFormalSessionAdapter(
  document: Document,
  window: Window,
  host: ReturnType<typeof installTrustedHost>,
  options: {
    readonly now?: () => number;
    readonly requestId?: () => string;
  } = {},
) {
  const now = options.now ?? (() => Date.now() / 1000),
    requestId = options.requestId ?? (() => crypto.randomUUID());
  let closed = false;
  let configuration: Configuration | null = null,
    epoch = 0,
    reason = 'AUTH_AND_SEAT_PROVIDER_MISSING',
    status: 'BLOCKED' | 'RESOLVING_SEAT' | 'SESSION_CONFIGURED' = 'BLOCKED',
    stopAuth: (() => void) | null = null,
    expiry: ReturnType<typeof setTimeout> | null = null,
    pending: AbortController | null = null,
    lifetime: (() => void) | null = null;
  const view = (): OfficeProjectionView | null => {
    const root = document.querySelector<HTMLElement>('.country-game'),
      role = root?.dataset.office;
    return root?.dataset.country &&
      /^(0[1-9]|[1-6][0-9]|70)$/u.test(root.dataset.country) &&
      role &&
      Object.hasOwn(officeProjectionRoles, role)
      ? {
          countryDisplayId: root.dataset.country,
          role: role as OfficeProjectionView['role'],
        }
      : null;
  };
  const validSession = (
    s: AuthSessionSnapshot | null,
  ): s is AuthSessionSnapshot =>
    !!s &&
    uuid(s.subject) &&
    typeof s.sessionRef === 'string' &&
    /^[A-Za-z0-9_-]{1,200}$/u.test(s.sessionRef) &&
    Number.isSafeInteger(s.expiresAtEpochSeconds) &&
    s.expiresAtEpochSeconds > now();
  function invalidate(code = 'AUTH_SESSION_CHANGED') {
    epoch++;
    reason = code;
    status = 'BLOCKED';
    pending?.abort();
    pending = null;
    if (expiry) clearTimeout(expiry);
    expiry = null;
    const retire = lifetime;
    lifetime = null;
    try {
      retire?.();
    } finally {
      host.disconnect();
    }
  }
  function sessionMatches(
    expected: AuthSessionSnapshot,
    expectedView: OfficeProjectionView,
    started: number,
  ) {
    try {
      const s = configuration?.auth.currentSession(),
        v = view();
      return (
        epoch === started &&
        validSession(s ?? null) &&
        s!.subject === expected.subject &&
        s!.sessionRef === expected.sessionRef &&
        s!.expiresAtEpochSeconds === expected.expiresAtEpochSeconds &&
        v?.role === expectedView.role &&
        v.countryDisplayId === expectedView.countryDisplayId
      );
    } catch {
      return false;
    }
  }
  const observer = new MutationObserver(() => {
    // A query also fences host lifetime; the host owns shared consumer retirement.
    if (
      status !== 'BLOCKED' &&
      lifetime &&
      host.getState().status === 'NOT_CONNECTED'
    )
      invalidate('HOST_OR_VIEW_RETIRED');
    else if (status === 'RESOLVING_SEAT')
      invalidate('VIEW_CHANGED_DURING_SEAT_LOOKUP');
  });
  observer.observe(document.body, {
    attributes: true,
    subtree: true,
    attributeFilter: ['data-country', 'data-office'],
  });
  window.addEventListener('pagehide', () => {
    closed = true;
    invalidate('PAGE_HIDDEN');
    stopAuth?.();
    stopAuth = null;
  });
  return Object.freeze({
    configure(supplied: Configuration) {
      invalidate('PROVIDER_CONFIGURATION');
      try {
        if (
          closed ||
          configuration ||
          !supplied ||
          typeof supplied.auth?.currentSession !== 'function' ||
          typeof supplied.auth.getAccessToken !== 'function' ||
          typeof supplied.auth.subscribe !== 'function' ||
          typeof supplied.seats?.readSeat !== 'function' ||
          !validEndpoints(supplied.targets.read) ||
          !validWorldPins(supplied.world) ||
          !row(supplied.countryIdsByDisplayId) ||
          Object.keys(supplied.countryIdsByDisplayId).length === 0 ||
          !Object.entries(supplied.countryIdsByDisplayId).every(
            ([key, value]) =>
              /^(0[1-9]|[1-6][0-9]|70)$/u.test(key) && canonicalId(value),
          ) ||
          new Set(Object.values(supplied.countryIdsByDisplayId)).size !==
            Object.keys(supplied.countryIdsByDisplayId).length ||
          !host.configureTargets(supplied.targets)
        )
          return false;
        configuration = {
          auth: supplied.auth,
          seats: supplied.seats,
          targets: {
            ...supplied.targets,
            read: { ...supplied.targets.read },
            ...(supplied.targets.office
              ? { office: { ...supplied.targets.office } }
              : {}),
          },
          world: { ...supplied.world },
          countryIdsByDisplayId: Object.freeze({
            ...supplied.countryIdsByDisplayId,
          }),
        };
        const stop = configuration.auth.subscribe(() => invalidate());
        if (typeof stop !== 'function') {
          configuration = null;
          invalidate('AUTH_SUBSCRIPTION_INVALID');
          return false;
        }
        stopAuth = stop;
        reason = 'EXPLICIT_BIND_REQUIRED';
        return true;
      } catch {
        invalidate('PROVIDER_CONFIGURATION_INVALID');
        return false;
      }
    },
    async bindCurrentView() {
      invalidate('EXPLICIT_BIND_REQUIRED');
      const c = configuration;
      if (closed || !c) return false;
      const selected = view();
      let session: AuthSessionSnapshot | null;
      try {
        session = c.auth.currentSession();
      } catch {
        return false;
      }
      if (
        !selected ||
        !validSession(session) ||
        !Object.hasOwn(c.countryIdsByDisplayId, selected.countryDisplayId)
      ) {
        reason = 'AUTH_SESSION_OR_VIEW_MISSING';
        return false;
      }
      const expected = { ...session },
        expectedView = { ...selected },
        started = epoch;
      const controller = new AbortController();
      pending = controller;
      status = 'RESOLVING_SEAT';
      let cancel: () => void = () => undefined;
      const cancelled = new Promise<false>((resolve) => {
        cancel = () => resolve(false);
      });
      controller.signal.addEventListener('abort', cancel, { once: true });
      const timer = setTimeout(() => {
        if (epoch === started) invalidate('SEAT_LOOKUP_TIMEOUT');
      }, 10000);
      const current = () => sessionMatches(expected, expectedView, started);
      async function resolve() {
        try {
          const token = await c!.auth.getAccessToken();
          if (!current() || controller.signal.aborted) return false;
          if (
            !token ||
            token.length > 8192 ||
            !/^[A-Za-z0-9._~-]+$/u.test(token)
          ) {
            invalidate('AUTH_TOKEN_MISSING');
            return false;
          }
          const id = requestId();
          if (!uuid(id)) {
            invalidate('REQUEST_ID_INVALID');
            return false;
          }
          const envelope = row(
            await c!.seats.readSeat({
              requestId: id,
              subject: expected.subject,
              view: expectedView,
              accessToken: token,
              signal: controller.signal,
            }),
          );
          if (!current() || controller.signal.aborted) return false;
          const authority = row(envelope?.authority),
            identity = authority?.identity;
          if (
            !envelope ||
            envelope.schemaVersion !== AUTHORIZED_READ_BINDING_SCHEMA ||
            envelope.requestId !== id ||
            envelope.ok !== true ||
            !validReadIdentity(identity) ||
            identity.authSubjectId !== expected.subject ||
            identity.worldId !== c!.world.worldId ||
            identity.countryId !==
              c!.countryIdsByDisplayId[expectedView.countryDisplayId] ||
            identity.officeId !== officeProjectionRoles[expectedView.role]
          ) {
            invalidate('SERVER_SEAT_RECEIPT_MISMATCH');
            return false;
          }
          const listeners = new Set<() => void>();
          lifetime = () => {
            for (const fn of [...listeners]) fn();
            listeners.clear();
          };
          const read: ProductionReadConfig = {
            endpoints: c!.targets.read,
            world: c!.world,
            identity: { ...identity },
            seatRef: String(authority!.seatRef),
            currentIdentity: (): AuthorizedBrowserIdentity | null =>
              current() ? identity : null,
            getAccessToken: async () => {
              if (!current()) return null;
              const next = await c!.auth.getAccessToken();
              return current() ? next : null;
            },
            session: {
              // Browser lifetime label, not a minted seat or server grant.
              sessionRef: `${expected.sessionRef}:${id}`,
              isCurrent: current,
              onInvalidate(fn) {
                listeners.add(fn);
                return () => {
                  listeners.delete(fn);
                };
              },
            },
          };
          if (!parseAuthority(authority, read)) {
            invalidate('SERVER_SEAT_RECEIPT_MISMATCH');
            return false;
          }
          // A provider JSON object alone never establishes even read connectivity.
          // Re-read through the existing authenticated API transport and parser.
          const verifier = createProductionReadClient(read);
          const abortVerification = () => verifier.disconnect();
          controller.signal.addEventListener('abort', abortVerification, {
            once: true,
          });
          let verified;
          try {
            verified = await verifier.readProjection(requestId());
          } finally {
            verifier.disconnect();
            controller.signal.removeEventListener('abort', abortVerification);
          }
          if (
            !current() ||
            verified.status !== 'PROJECTION' ||
            BigInt(verified.authority.readback.worldVersion) <
              BigInt(String(row(authority?.readback)?.worldVersion))
          ) {
            if (epoch === started)
              invalidate(
                verified.status === 'DENIED'
                  ? 'DENIED'
                  : 'AUTHENTICATED_READBACK_UNAVAILABLE',
              );
            return false;
          }
          if (
            !host.connect({
              projection: { read, view: expectedView },
              ...(c!.targets.office &&
              identity.classification === 'OFFICE_PRIVATE' &&
              Object.hasOwn(officeFamilies, identity.officeId)
                ? {
                    office: {
                      read,
                      view: expectedView,
                      endpoint: c!.targets.office,
                    },
                  }
                : {}),
            })
          ) {
            invalidate('HOST_BINDING_REJECTED');
            return false;
          }
          status = 'SESSION_CONFIGURED';
          reason = 'SERVER_SEAT_CONSISTENCY_CHECKED_NOT_AUTHORITY';
          pending = null;
          expiry = setTimeout(
            () => invalidate('AUTH_SESSION_EXPIRED'),
            Math.min(
              2147483647,
              Math.max(0, (expected.expiresAtEpochSeconds - now()) * 1000),
            ),
          );
          return true;
        } catch {
          if (epoch === started)
            invalidate('AUTH_OR_SEAT_PROVIDER_UNAVAILABLE');
          return false;
        }
      }
      try {
        return await Promise.race([resolve(), cancelled]);
      } finally {
        clearTimeout(timer);
        if (epoch === started && status === 'RESOLVING_SEAT')
          invalidate('SESSION_CHANGED_DURING_LOOKUP');
      }
    },
    disconnect: () => invalidate('EXPLICIT_DISCONNECT'),
    getState() {
      if (
        status === 'SESSION_CONFIGURED' &&
        host.getState().status === 'NOT_CONNECTED'
      )
        invalidate('HOST_RETIRED');
      return Object.freeze({
        status,
        reason,
        epoch,
        providerConfigured: configuration !== null,
        productionLogin:
          'BLOCKED_PENDING_REAL_PROVIDER_AND_G_ENDPOINT' as const,
        seatEndpointContract: 'PENDING_G_REVIEW' as const,
      });
    },
  });
}
declare global {
  interface Window {
    EconMindFormalSession?: ReturnType<typeof installFormalSessionAdapter>;
  }
}
