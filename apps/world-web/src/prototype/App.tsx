import { useEffect, useState } from 'react';

import { OfficeEntryFlow } from './OfficeEntryFlow.js';
import { LocalAuthorizedReadEntry } from './LocalAuthorizedReadEntry.js';
import { SixOfficesG01 } from './SixOfficesG01.js';
import {
  EMPTY_PROJECTION,
  fixtureProjectionForOffice,
  READY_PROJECTION,
  STALE_PROJECTION,
  type FixtureOfficeId,
} from './fixtures.js';
import type { PrototypeStateName, PrototypeViewState } from './state.js';
import type { AuthorizedUiInjection } from './authorized-read-adapter.js';
import type { LocalAuthorizedReadConfig } from './local-authorized-read.js';

const stateLabels: ReadonlyArray<{
  readonly id: PrototypeStateName;
  readonly label: string;
}> = [
  { id: 'ready', label: 'Ready' },
  { id: 'loading', label: 'Loading' },
  { id: 'empty', label: 'Empty' },
  { id: 'stale', label: 'Stale' },
  { id: 'unauthorized', label: 'Unauthorized' },
  { id: 'offline', label: 'Offline' },
  { id: 'retrying', label: 'Retrying' },
];

function viewState(
  name: PrototypeStateName,
  officeId: FixtureOfficeId,
): PrototypeViewState {
  switch (name) {
    case 'loading':
      return { status: 'loading' };
    case 'ready':
      return {
        status: 'ready',
        projection: fixtureProjectionForOffice(officeId, READY_PROJECTION),
      };
    case 'empty':
      return {
        status: 'empty',
        projection: fixtureProjectionForOffice(officeId, EMPTY_PROJECTION),
      };
    case 'stale':
      return {
        status: 'stale',
        projection: fixtureProjectionForOffice(officeId, STALE_PROJECTION),
      };
    case 'unauthorized':
      return {
        status: 'unauthorized',
        reason:
          'The mock authorization revision changed. Office-private values have been removed from view.',
      };
    case 'offline':
      return {
        status: 'offline',
        projection: fixtureProjectionForOffice(officeId, READY_PROJECTION),
        reason: 'The prototype query connection is unavailable.',
      };
    case 'retrying':
      return {
        status: 'retrying',
        projection: fixtureProjectionForOffice(officeId, READY_PROJECTION),
        reason: 'Refreshing the mock projection.',
      };
  }
}

export function PrototypeApp({
  authorized,
  localAuthorizedRead,
}: {
  readonly authorized?: AuthorizedUiInjection;
  readonly localAuthorizedRead?: LocalAuthorizedReadConfig;
} = {}) {
  return localAuthorizedRead ? (
    <LocalAuthorizedReadEntry config={localAuthorizedRead} />
  ) : (
    <FixturePrototypeApp authorized={authorized} />
  );
}

function FixturePrototypeApp({
  authorized,
}: {
  readonly authorized: AuthorizedUiInjection | undefined;
}) {
  const [stateName, setStateName] = useState<PrototypeStateName>('ready');
  const [selectedOfficeId, setSelectedOfficeId] =
    useState<FixtureOfficeId>('TRADE');
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [state, setState] = useState<PrototypeViewState>(
    viewState('ready', 'TRADE'),
  );

  useEffect(() => {
    setState(viewState(stateName, selectedOfficeId));
  }, [selectedOfficeId, stateName]);

  const retry = () => {
    setStateName('retrying');
    window.setTimeout(() => setStateName('ready'), 700);
  };

  return (
    <div className="prototype-app">
      <div className="prototype-warning" role="note">
        <strong>
          {authorized
            ? 'AUTHORIZED READ · PREPARATION ONLY'
            : 'PREPARATION ONLY · NOT RUNTIME'}
        </strong>
        <span>
          {authorized
            ? 'Injected browser-client result · no automatic network or Command submission'
            : 'Typed local mock projection · no API · no command submission'}
        </span>
      </div>
      {!authorized ? (
        <section
          className="state-switcher"
          aria-label="Prototype state controls"
        >
          <span>Preview state</span>
          <div>
            {stateLabels.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={stateName === item.id}
                onClick={() => setStateName(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {authorized ? (
        <SixOfficesG01
          state={state}
          authorized={authorized}
          onRetry={retry}
          onReturnToEntry={() => setWorkspaceOpen(false)}
        />
      ) : workspaceOpen ? (
        <SixOfficesG01
          state={state}
          onRetry={retry}
          onReturnToEntry={() => setWorkspaceOpen(false)}
        />
      ) : (
        <OfficeEntryFlow
          lastOfficeId={selectedOfficeId}
          onEnterOffice={(officeId) => {
            setSelectedOfficeId(officeId);
            setState(viewState(stateName, officeId));
            setWorkspaceOpen(true);
          }}
        />
      )}
    </div>
  );
}
