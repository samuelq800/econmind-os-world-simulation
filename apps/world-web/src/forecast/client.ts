import {
  isValidForecastRequest,
  sameSnapshotIdentity,
  type ForecastRequest,
  type ForecastSnapshotIdentity,
  type ForecastWorkerApi,
  type ForecastWorkerResult,
} from './protocol';

export type ForecastClientOutcome =
  | { readonly state: 'CURRENT'; readonly result: ForecastWorkerResult }
  | { readonly state: 'STALE' }
  | { readonly state: 'UNAVAILABLE'; readonly reason: 'TRANSPORT_ERROR' };

/** Only the latest request for the caller's current authorized snapshot may surface. */
export function createForecastClient(
  transport: ForecastWorkerApi,
  currentIdentity: () => ForecastSnapshotIdentity | null,
) {
  let generation = 0;
  let activeTaskId: string | null = null;
  let disposed = false;

  function cancelCurrent(): void {
    generation += 1;
    const taskId = activeTaskId;
    activeTaskId = null;
    if (taskId) void transport.cancel(taskId).catch(() => undefined);
  }

  return {
    async run(request: ForecastRequest): Promise<ForecastClientOutcome> {
      if (
        disposed ||
        !isValidForecastRequest(request) ||
        !sameSnapshotIdentity(request.snapshot.identity, currentIdentity())
      ) {
        return { state: 'STALE' };
      }

      const submittedIdentity = { ...request.snapshot.identity };
      cancelCurrent();
      const ticket = generation;
      activeTaskId = request.taskId;
      try {
        const result = await transport.run(request);
        if (
          disposed ||
          ticket !== generation ||
          !sameSnapshotIdentity(submittedIdentity, currentIdentity()) ||
          result.taskId !== request.taskId ||
          result.protocolVersion !== request.protocolVersion ||
          result.kind !== 'DERIVED_FORECAST' ||
          !sameSnapshotIdentity(result.identity, submittedIdentity)
        ) {
          return { state: 'STALE' };
        }
        return { state: 'CURRENT', result };
      } catch {
        if (
          disposed ||
          ticket !== generation ||
          !sameSnapshotIdentity(submittedIdentity, currentIdentity())
        ) {
          return { state: 'STALE' };
        }
        return { state: 'UNAVAILABLE', reason: 'TRANSPORT_ERROR' };
      } finally {
        if (ticket === generation) activeTaskId = null;
      }
    },
    cancelCurrent,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      cancelCurrent();
    },
  };
}
