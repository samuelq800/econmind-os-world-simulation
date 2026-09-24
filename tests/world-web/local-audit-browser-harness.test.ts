import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AuthorizedBrowserIdentity } from '../../apps/world-web/src/authorized-client/client.js';
import { attachLocalAuditBrowserHarness } from '../../apps/world-web/src/prototype/local-audit-browser-harness.js';
import { createLocalAuditHostConfig } from '../../apps/world-web/src/prototype/local-audit-host.js';

function identity(
  countryId: string,
  officeId: string,
): AuthorizedBrowserIdentity {
  return {
    worldId: 'WORLD_TEST',
    countryId,
    officeId,
    scopeKey: 'SCOPE_TEST',
    authSubjectId: `${countryId}-${officeId}`,
    authorizationRevision: 'revision-1',
    modelVersion: 'model-1',
    projectionVersion: 'projection-1',
    classification: 'OFFICE_PRIVATE',
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('development-only in-memory browser audit harness', () => {
  it('swaps two Country/Office seats and clears the older private context', async () => {
    const refresh = vi.fn();
    const browser = {
      location: { pathname: '/local-audit-host.html' },
      __ECONMIND_LOCAL_AUDIT_REFRESH__: refresh,
      __ECONMIND_LOCAL_AUDIT_HOST__: undefined as unknown,
    };
    vi.stubGlobal('window', browser);
    const northToken = vi.fn(async () => null);
    const southToken = vi.fn(async () => null);
    const detachNorth = attachLocalAuditBrowserHarness({
      currentIdentity: identity('COUNTRY_NORTH', 'FINANCE'),
      bridgeOrigin: 'http://127.0.0.1:4102',
      getAccessToken: northToken,
    });
    const north = createLocalAuditHostConfig(
      browser.__ECONMIND_LOCAL_AUDIT_HOST__ as Parameters<
        typeof createLocalAuditHostConfig
      >[0],
    );
    expect(north?.currentIdentity?.countryId).toBe('COUNTRY_NORTH');
    expect(await north?.getAccessToken()).toBeNull();
    expect(northToken).toHaveBeenCalledOnce();

    const detachSouth = attachLocalAuditBrowserHarness({
      currentIdentity: identity('COUNTRY_SOUTH', 'TRADE'),
      bridgeOrigin: 'http://127.0.0.1:4103',
      getAccessToken: southToken,
    });
    const south = createLocalAuditHostConfig(
      browser.__ECONMIND_LOCAL_AUDIT_HOST__ as Parameters<
        typeof createLocalAuditHostConfig
      >[0],
    );
    expect(south?.currentIdentity?.countryId).toBe('COUNTRY_SOUTH');
    expect(south?.currentIdentity?.officeId).toBe('TRADE');
    expect(south?.bridgeOrigin).toBe('http://127.0.0.1:4103');
    expect(await south?.getAccessToken()).toBeNull();
    detachNorth();
    expect(browser.__ECONMIND_LOCAL_AUDIT_HOST__).toBeTruthy();
    detachSouth();
    expect(browser.__ECONMIND_LOCAL_AUDIT_HOST__).toBeUndefined();
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it('refuses to attach outside the isolated audit page', () => {
    vi.stubGlobal('window', {
      location: { pathname: '/prototype.html' },
      __ECONMIND_LOCAL_AUDIT_REFRESH__: vi.fn(),
    });
    expect(() =>
      attachLocalAuditBrowserHarness({
        currentIdentity: identity('COUNTRY_NORTH', 'FINANCE'),
        bridgeOrigin: 'http://127.0.0.1:4102',
        getAccessToken: async () => null,
      }),
    ).toThrow('LOCAL_AUDIT_BROWSER_HARNESS_UNAVAILABLE');
  });
});
