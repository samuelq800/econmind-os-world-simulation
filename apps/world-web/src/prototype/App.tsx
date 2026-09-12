import { useEffect, useState } from 'react';

import { WorldCommandBrief } from './WorldCommandBrief.js';
import {
  EMPTY_PROJECTION,
  READY_PROJECTION,
  STALE_PROJECTION,
} from './fixtures.js';
import type { PrototypeStateName, PrototypeViewState } from './state.js';

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

function viewState(name: PrototypeStateName): PrototypeViewState {
  switch (name) {
    case 'loading':
      return { status: 'loading' };
    case 'ready':
      return { status: 'ready', projection: READY_PROJECTION };
    case 'empty':
      return { status: 'empty', projection: EMPTY_PROJECTION };
    case 'stale':
      return { status: 'stale', projection: STALE_PROJECTION };
    case 'unauthorized':
      return {
        status: 'unauthorized',
        reason:
          'The mock authorization revision changed. Office-private values have been removed from view.',
      };
    case 'offline':
      return {
        status: 'offline',
        projection: READY_PROJECTION,
        reason: 'The prototype query connection is unavailable.',
      };
    case 'retrying':
      return {
        status: 'retrying',
        projection: READY_PROJECTION,
        reason: 'Refreshing the mock projection.',
      };
  }
}

export function PrototypeApp() {
  const [stateName, setStateName] = useState<PrototypeStateName>('ready');
  const [state, setState] = useState<PrototypeViewState>(viewState('ready'));

  useEffect(() => {
    setState(viewState(stateName));
  }, [stateName]);

  const retry = () => {
    setStateName('retrying');
    window.setTimeout(() => setStateName('ready'), 700);
  };

  return (
    <div className="prototype-app">
      <div className="prototype-warning" role="note">
        <strong>PREPARATION ONLY · NOT RUNTIME</strong>
        <span>
          Typed local mock projection · no API · no command submission
        </span>
      </div>
      <section className="state-switcher" aria-label="Prototype state controls">
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
      <WorldCommandBrief state={state} onRetry={retry} />
    </div>
  );
}
