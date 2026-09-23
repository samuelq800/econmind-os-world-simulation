import { releaseProxy, wrap } from 'comlink';

import { createForecastClient } from './client';
import type { ForecastSnapshotIdentity, ForecastWorkerApi } from './protocol';

/** Vite browser entry; callers supply the current classified projection identity. */
export function createBrowserForecastClient(
  currentIdentity: () => ForecastSnapshotIdentity | null,
) {
  const worker = new Worker(new URL('./forecast.worker.ts', import.meta.url), {
    type: 'module',
    name: 'econmind-forecast',
  });
  const remote = wrap<ForecastWorkerApi>(worker);
  const client = createForecastClient(remote, currentIdentity);
  return {
    run: client.run,
    cancelCurrent: client.cancelCurrent,
    dispose(): void {
      client.dispose();
      remote[releaseProxy]();
      worker.terminate();
    },
  };
}
