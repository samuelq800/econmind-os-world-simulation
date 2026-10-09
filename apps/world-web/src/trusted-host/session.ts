import { sameAuthorizedIdentity } from '../prototype/authorized-read-adapter.js';
import {
  validConfig,
  type ProductionReadConfig,
} from '../production-read/contract.js';
import type { OfficeProjectionView } from '../office-projection/model.js';

/** Browser lifetime only. This does not verify tokens, seats, seed admission or
 * deployments; the existing server-response parser remains the authority gate. */
export function createTrustedHostSession(
  supplied: ProductionReadConfig,
  view: OfficeProjectionView,
  currentView: () => OfficeProjectionView | null,
) {
  if (!validConfig(supplied)) return null;
  const c: ProductionReadConfig = {
    ...supplied,
    identity: Object.freeze({ ...supplied.identity }),
    world: Object.freeze({ ...supplied.world }),
    endpoints: Object.freeze({ ...supplied.endpoints }),
    session: Object.freeze({ ...supplied.session }),
  };
  const expectedView = Object.freeze({ ...view });
  const listeners = new Set<() => void>();
  let retired = false,
    reason: string | null = null,
    stopHost: (() => void) | null = null;
  function retire(code = 'HOST_INVALIDATED') {
    if (retired) return;
    retired = true;
    reason = code;
    const stop = stopHost;
    stopHost = null;
    try {
      stop?.();
    } catch {
      /* Cleanup cannot restore a retired lifetime. */
    }
    for (const listener of [...listeners]) listener();
    listeners.clear();
  }
  function isCurrent() {
    if (retired) return false;
    try {
      const actual = currentView();
      if (
        c.session.isCurrent() === true &&
        sameAuthorizedIdentity(c.currentIdentity(), c.identity) &&
        actual?.role === expectedView.role &&
        actual.countryDisplayId === expectedView.countryDisplayId
      )
        return true;
    } catch {
      /* An unavailable host identity is not an authorization. */
    }
    retire('IDENTITY_SESSION_OR_VIEW_LOST');
    return false;
  }
  function onInvalidate(listener: () => void) {
    if (retired) listener();
    else listeners.add(listener);
    return () => listeners.delete(listener);
  }
  try {
    const stop = c.session.onInvalidate(() => retire());
    if (typeof stop !== 'function') retire('INVALID_HOST_SUBSCRIPTION');
    else if (retired) stop();
    else stopHost = stop;
  } catch {
    retire('INVALID_HOST_SUBSCRIPTION');
  }
  isCurrent();
  const read: ProductionReadConfig = Object.freeze({
    ...c,
    currentIdentity: () => (isCurrent() ? c.identity : null),
    getAccessToken: async () => {
      if (!isCurrent()) return null;
      let token: string | null;
      try {
        token = await c.getAccessToken();
      } catch {
        retire('SESSION_TOKEN_UNAVAILABLE');
        return null;
      }
      if (!isCurrent()) return null;
      if (!token || token.length > 8192 || !/^[A-Za-z0-9._~-]+$/u.test(token)) {
        retire('SESSION_TOKEN_MISSING');
        return null;
      }
      return token;
    },
    session: Object.freeze({
      sessionRef: c.session.sessionRef,
      isCurrent,
      onInvalidate,
    }),
  });
  return Object.freeze({
    read,
    isCurrent,
    onInvalidate,
    retire,
    reason: () => reason,
  });
}
export type TrustedHostSession = NonNullable<
  ReturnType<typeof createTrustedHostSession>
>;
