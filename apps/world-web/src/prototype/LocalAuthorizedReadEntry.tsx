import { useEffect, useMemo, useSyncExternalStore } from 'react';

import {
  resolveAuthorizedUi,
  sameAuthorizedIdentity,
  type AuthorizedUiInjection,
} from './authorized-read-adapter.js';
import {
  createLocalAuthorizedReadController,
  type LocalAuthorizedReadConfig,
} from './local-authorized-read.js';
import { SixOfficesG01 } from './SixOfficesG01.js';

/** Mounted only by a trusted host that explicitly supplies all local read inputs. */
export function LocalAuthorizedReadEntry({
  config,
}: {
  readonly config: LocalAuthorizedReadConfig;
}) {
  const controller = useMemo(
    () => createLocalAuthorizedReadController(config),
    [config.bridgeOrigin, config.getAccessToken],
  );
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  useEffect(() => {
    controller.setIdentity(config.currentIdentity);
  });
  useEffect(() => {
    if (config.command?.result.status === 'UNKNOWN') {
      controller.invalidate(
        'Command outcome unknown. Read again after reconciliation.',
      );
    }
  }, [controller, config.command?.commandId, config.command?.result.status]);
  useEffect(() => () => controller.disconnect(), [controller]);

  const identityCurrent =
    config.currentIdentity !== null &&
    snapshot.identity !== null &&
    sameAuthorizedIdentity(config.currentIdentity, snapshot.identity);
  const authorized: AuthorizedUiInjection = {
    currentIdentity: snapshot.connected ? config.currentIdentity : null,
    read: snapshot.connected && identityCurrent ? snapshot.read : null,
    command: snapshot.connected ? (config.command ?? null) : null,
  };
  const read = resolveAuthorizedUi(authorized).read;
  const status = !snapshot.connected
    ? 'Disconnected. No authorized values are held in this view.'
    : !identityCurrent
      ? 'Office identity changed. Previous values were cleared.'
      : snapshot.phase === 'LOADING'
        ? 'Reading the scoped projection…'
        : read.kind === 'CURRENT'
          ? `Current derived projection · World v${read.worldVersion}`
          : (snapshot.reason ?? read.reason);

  return (
    <div className="prototype-app">
      <div className="prototype-warning" role="note">
        <strong>LOCAL AUTHORIZED READ · OPT-IN</strong>
        <span>
          Only the supplied loopback bridge is contacted after you choose Read.
          No Command is sent.
        </span>
      </div>
      <section
        className="state-switcher"
        aria-label="Local authorized read controls"
      >
        <span>Local read</span>
        <div>
          <button
            type="button"
            disabled={
              config.currentIdentity === null || snapshot.phase === 'LOADING'
            }
            onClick={() => void controller.readProjection()}
          >
            {snapshot.connected ? 'Refresh read' : 'Connect & read'}
          </button>
          {snapshot.connected ? (
            <button type="button" onClick={() => controller.disconnect()}>
              Disconnect
            </button>
          ) : null}
        </div>
        <p role="status" aria-live="polite">
          {status}
        </p>
      </section>
      <SixOfficesG01
        state={{ status: 'loading' }}
        authorized={authorized}
        onRetry={() => void controller.readProjection()}
        onReturnToEntry={() => controller.disconnect()}
      />
    </div>
  );
}
