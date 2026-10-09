import {
  AUTHENTICATED_FINANCIAL_INTAKE_SCHEMA,
  AUTHENTICATED_FINANCIAL_INTAKE_PATH,
  FINANCIAL_INTAKE_OFFICE_ACTIONS,
} from '@econmind/core/authenticated-financial-intake-contract';
import type { installCountryRuntime } from '../country-runtime/entry.js';
import { exactJson } from '../country-runtime/staged-reservation-client.js';
import type { FinancialIntakeBinding } from '../financial-intake/controller.js';
import {
  validFinancialEndpoint,
  type FinancialIntakeEndpoint,
} from '../financial-intake/transport.js';
import type { installFinancialIntake } from '../financial-intake/view.js';
import type { OfficeProjectionBinding } from '../office-projection/controller.js';
import {
  officeProjectionRoles,
  type OfficeProjectionView,
} from '../office-projection/model.js';
import type { installOfficeProjection } from '../office-projection/view.js';
import { sameAuthorizedIdentity } from '../prototype/authorized-read-adapter.js';
import {
  canonicalId,
  hash,
  uuid,
  validConfig,
  validEndpoints,
  type ApprovedReadEndpoints,
  type ProductionReadConfig,
} from '../production-read/contract.js';
import {
  createTrustedHostSession,
  type TrustedHostSession,
} from './session.js';

/** Explicit host configuration, NOT deployment approval or a grant of authority.
 * Pinned once per installation; no URL/storage/env discovery or local fallback. */
export interface TrustedHostTargets {
  readonly read: ApprovedReadEndpoints;
  readonly financial?: FinancialIntakeEndpoint;
}
export interface TrustedHostBinding {
  readonly projection: OfficeProjectionBinding;
  readonly financial?: FinancialIntakeBinding;
}
export interface TrustedHostConsumers {
  readonly projection: ReturnType<typeof installOfficeProjection>;
  readonly financial: ReturnType<typeof installFinancialIntake>;
  readonly localTrade: Pick<
    ReturnType<typeof installCountryRuntime>,
    'disconnect'
  >;
}
const sameView = (a: OfficeProjectionView, b: OfficeProjectionView | null) =>
  a.role === b?.role && a.countryDisplayId === b.countryDisplayId;
const sameEndpoints = (a: ApprovedReadEndpoints, b: ApprovedReadEndpoints) =>
  a.origin === b.origin &&
  a.projectionPath === b.projectionPath &&
  a.finalLookupPath === b.finalLookupPath &&
  a.deploymentRef === b.deploymentRef;
function sameRead(a: ProductionReadConfig, b: ProductionReadConfig) {
  return (
    validConfig(a) &&
    sameAuthorizedIdentity(a.identity, b.identity) &&
    sameEndpoints(a.endpoints, b.endpoints) &&
    a.seatRef === b.seatRef &&
    Object.keys(b.world).every(
      (key) =>
        a.world[key as keyof typeof a.world] ===
        b.world[key as keyof typeof b.world],
    ) &&
    a.currentIdentity === b.currentIdentity &&
    a.getAccessToken === b.getAccessToken &&
    a.session.sessionRef === b.session.sessionRef &&
    a.session.isCurrent === b.session.isCurrent &&
    a.session.onInvalidate === b.session.onInvalidate
  );
}
function validLookup(lookup: OfficeProjectionBinding['finalLookup']) {
  return (
    !lookup ||
    (canonicalId(lookup.commandId) &&
      canonicalId(lookup.idempotencyKey) &&
      hash(lookup.commandFingerprint))
  );
}
function validFinancial(
  f: FinancialIntakeBinding,
  p: OfficeProjectionBinding,
  target: FinancialIntakeEndpoint | undefined,
) {
  if (
    !target ||
    !sameRead(f.read, p.read) ||
    !sameView(f.view, p.view) ||
    !validFinancialEndpoint(f.endpoint, p.read) ||
    f.endpoint.origin !== target.origin ||
    f.endpoint.path !== target.path ||
    f.endpoint.deploymentRef !== target.deploymentRef ||
    !validLookup(f.finalLookup)
  )
    return false;
  const r = f.request,
    s = r.request,
    lookup = f.finalLookup;
  const actions: readonly string[] =
    FINANCIAL_INTAKE_OFFICE_ACTIONS[s.officeId] ?? [];
  return (
    r.schemaVersion === AUTHENTICATED_FINANCIAL_INTAKE_SCHEMA &&
    uuid(r.requestId) &&
    s.schemaVersion === 'world-staged-transfer-v1' &&
    actions.includes(s.action) &&
    canonicalId(s.commandId) &&
    canonicalId(s.idempotencyKey) &&
    s.worldId === p.read.identity.worldId &&
    s.countryId === p.read.identity.countryId &&
    s.officeId === p.read.identity.officeId &&
    (!lookup ||
      (lookup.commandId === s.commandId &&
        lookup.idempotencyKey === s.idempotencyKey &&
        (!s.commandFingerprint ||
          s.commandFingerprint === lookup.commandFingerprint)))
  );
}

/** SOURCE_ONLY composition of already-installed consumers. Connecting never
 * reads, inspects, creates an original request, submits, replays or starts Clock. */
export function installTrustedHost(
  document: Document,
  host: Window,
  consumers: TrustedHostConsumers,
) {
  let targets: TrustedHostTargets | null = null,
    active: TrustedHostSession | null = null,
    financialConfigured = false,
    epoch = 0,
    reason = 'TRUSTED_HOST_BINDING_MISSING',
    connecting = false,
    checking = false;
  const usedSessions = new Set<string>();
  function currentView(): OfficeProjectionView | null {
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
  }
  function clearConsumers() {
    consumers.localTrade.disconnect();
    consumers.projection.disconnect();
    consumers.financial.disconnect();
  }
  function disconnect(code = 'HOST_DISCONNECTED') {
    const previous = active;
    active = null;
    financialConfigured = false;
    reason = code;
    epoch++;
    previous?.retire(code);
    clearConsumers();
  }
  function check() {
    if (!active || checking || connecting) return;
    checking = true;
    try {
      if (!active.isCurrent()) return;
      const p = consumers.projection.getState(),
        f = consumers.financial.getState();
      if (
        p.status === 'DENIED' ||
        f.status === 'DENIED' ||
        f.read?.status === 'DENIED'
      )
        disconnect('DENIED');
      else if (!p.canRead || (financialConfigured && !f.canInspect))
        // Busy reads have canRead/canInspect=false, but are still live. Only the
        // permanently missing consumers retire the shared lifetime here.
        if (p.status === 'MISSING' || (financialConfigured && !f.request))
          disconnect('CONSUMER_RETIRED');
    } finally {
      checking = false;
    }
  }
  consumers.projection.subscribe(check);
  consumers.financial.subscribe(check);
  const observer = new MutationObserver(check);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-country', 'data-office'],
  });
  host.addEventListener('pagehide', () => disconnect('PAGE_HIDDEN'));
  clearConsumers();
  return Object.freeze({
    configureTargets(supplied: TrustedHostTargets) {
      disconnect('TARGET_CONFIGURATION');
      try {
        if (targets || !validEndpoints(supplied.read)) return false;
        if (
          supplied.financial &&
          (!validEndpoints({
            ...supplied.read,
            origin: supplied.financial.origin,
          }) ||
            supplied.financial.path !== AUTHENTICATED_FINANCIAL_INTAKE_PATH ||
            !canonicalId(supplied.financial.deploymentRef))
        )
          return false;
        targets = Object.freeze({
          read: Object.freeze({ ...supplied.read }),
          ...(supplied.financial
            ? { financial: Object.freeze({ ...supplied.financial }) }
            : {}),
        });
        return true;
      } catch {
        return false;
      }
    },
    connect(supplied: TrustedHostBinding | null) {
      disconnect('TRUSTED_HOST_BINDING_MISSING');
      try {
        if (!targets || !supplied) return false;
        const p = supplied.projection,
          f = supplied.financial;
        if (
          !validConfig(p.read) ||
          !sameEndpoints(p.read.endpoints, targets.read) ||
          !sameView(p.view, currentView()) ||
          officeProjectionRoles[p.view.role] !== p.read.identity.officeId ||
          !/^(0[1-9]|[1-6][0-9]|70)$/u.test(p.view.countryDisplayId) ||
          !validLookup(p.finalLookup) ||
          usedSessions.has(p.read.session.sessionRef) ||
          (f && !validFinancial(f, p, targets.financial))
        )
          return false;
        // Detached originals only, never manufacture or derive terms from UI.
        const original = f
          ? (JSON.parse(
              exactJson(f.request),
            ) as FinancialIntakeBinding['request'])
          : null;
        usedSessions.add(p.read.session.sessionRef);
        const session = createTrustedHostSession(p.read, p.view, currentView);
        if (!session || !session.isCurrent()) return false;
        active = session;
        const started = epoch;
        session.onInvalidate(() => {
          if (active === session && epoch === started)
            disconnect(session.reason() ?? 'HOST_INVALIDATED');
        });
        connecting = true;
        consumers.projection.connect({ ...p, read: session.read });
        if (active !== session || !session.isCurrent()) return false;
        if (f && original) {
          financialConfigured = true;
          consumers.financial.connect({
            ...f,
            request: original,
            read: session.read,
          });
        }
        reason = 'EXPLICIT_CONFIGURATION_ONLY';
        connecting = false;
        check();
        return active === session;
      } catch {
        disconnect('INVALID_TRUSTED_HOST_BINDING');
        return false;
      } finally {
        connecting = false;
      }
    },
    disconnect: () => disconnect(),
    getState() {
      check();
      return Object.freeze({
        mode: 'SOURCE_ONLY' as const,
        status: active
          ? ('SESSION_CONFIGURED' as const)
          : ('NOT_CONNECTED' as const),
        reason,
        epoch,
        financialConfigured,
      });
    },
  });
}
declare global {
  interface Window {
    EconMindTrustedHost?: ReturnType<typeof installTrustedHost>;
  }
}
