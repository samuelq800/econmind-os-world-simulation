import { useEffect, useMemo, useSyncExternalStore } from 'react';

import {
  resolveAuthorizedUi,
  sameAuthorizedIdentity,
  type AuthorizedUiInjection,
} from './authorized-read-adapter.js';
import {
  createLocalAuthorizedReadController,
  trustedReceiptBindingMatchesDraft,
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
      controller.recordUnknown(config.command);
    } else if (config.command?.result.status === 'FINAL_RECEIPT') {
      controller.reconcileFinalReceipt(config.command);
    }
  }, [controller, config.command]);
  useEffect(() => () => controller.disconnect(), [controller]);

  const identityCurrent =
    config.currentIdentity !== null &&
    snapshot.identity !== null &&
    sameAuthorizedIdentity(config.currentIdentity, snapshot.identity);
  const authorized: AuthorizedUiInjection = {
    currentIdentity: snapshot.connected ? config.currentIdentity : null,
    read: snapshot.connected && identityCurrent ? snapshot.read : null,
    command: snapshot.connected && identityCurrent ? snapshot.command : null,
    pendingCommandId:
      snapshot.connected && identityCurrent ? snapshot.pendingCommandId : null,
  };
  const read = resolveAuthorizedUi(authorized).read;
  const status = !snapshot.connected
    ? 'Disconnected. No authorized values are held in this view.'
    : !identityCurrent
      ? 'Office identity changed. Previous values were cleared.'
      : snapshot.phase === 'LOADING'
        ? 'Reading the scoped projection…'
        : snapshot.phase === 'SUBMITTING'
          ? 'Sending once. No final result has returned yet.'
          : snapshot.phase === 'UNKNOWN'
            ? 'Outcome unknown. Look up the original Command ID before another move.'
            : read.kind === 'CURRENT'
              ? `Current derived projection · World v${read.worldVersion}`
              : (snapshot.reason ?? read.reason);

  return (
    <div className="prototype-app">
      <div className="prototype-warning" role="note">
        <strong>LOCAL AUTHORIZED READ · OPT-IN</strong>
        <span>
          The supplied loopback bridge is contacted only after your action.
          Commands require a reviewed, host-supplied draft and explicit
          confirmation.
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
              config.currentIdentity === null ||
              ['LOADING', 'SUBMITTING', 'UNKNOWN'].includes(snapshot.phase)
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
        commandAction={
          snapshot.connected && identityCurrent
            ? {
                draft: config.narrowTransferDraft ?? null,
                receiptBindingReady: trustedReceiptBindingMatchesDraft(
                  config.narrowTransferDraft,
                  config.narrowTransferReceiptBinding,
                ),
                phase: snapshot.phase,
                alreadySubmitted: config.narrowTransferDraft
                  ? controller.wasSubmitted(
                      config.narrowTransferDraft.commandId,
                    )
                  : false,
                onSubmit: () => {
                  if (config.narrowTransferDraft) {
                    void controller.submitNarrowTransfer(
                      config.narrowTransferDraft,
                      config.narrowTransferReceiptBinding,
                    );
                  }
                },
                onRefresh: () => void controller.readProjection(),
              }
            : undefined
        }
        onRetry={() => void controller.readProjection()}
        onReturnToEntry={() => controller.disconnect()}
      />
    </div>
  );
}
