import { setTimeout as delay } from 'node:timers/promises';

import type {
  V30LatencyObservation,
  V30PlannedOperation,
} from './load-harness-preparation.js';

export interface V30LoadRunnerOptions {
  readonly maxInFlight: number;
  readonly millisecondsPerVirtualSecond: number;
  readonly signal?: AbortSignal;
}

export interface V30LoadRunResult {
  readonly status:
    'NOT_RUN' | 'CALLER_EXECUTED_NOT_ACCEPTED' | 'ABORTED_NOT_ACCEPTED';
  readonly source: 'INJECTED_EXECUTOR_UNVERIFIED';
  readonly attempted: number;
  readonly observations: readonly V30LatencyObservation[];
}

export type V30OperationExecutor = (
  operation: V30PlannedOperation,
  signal: AbortSignal,
) => Promise<void>;

const ACTIONS = new Set([
  'PROJECTION_READ',
  'ORDER_SUBMIT',
  'CONTRACT_SUBMIT',
  'RECEIPT_POLL',
  'FORECAST_LOCAL',
  'DUE_OBLIGATION_TICK',
]);

function validOperation(operation: V30PlannedOperation): boolean {
  return (
    operation !== null &&
    typeof operation === 'object' &&
    Number.isSafeInteger(operation.virtualSecond) &&
    operation.virtualSecond >= 0 &&
    ACTIONS.has(operation.kind) &&
    (operation.sessionIndex === null
      ? operation.kind === 'DUE_OBLIGATION_TICK'
      : Number.isSafeInteger(operation.sessionIndex) &&
        operation.sessionIndex >= 0 &&
        operation.sessionIndex < 420 &&
        operation.kind !== 'DUE_OBLIGATION_TICK')
  );
}

/** Bounded adapter harness only; the caller owns target identity and evidence. */
export async function runV30LoadPlan(
  operations: Iterable<V30PlannedOperation>,
  execute: V30OperationExecutor,
  options: V30LoadRunnerOptions,
): Promise<V30LoadRunResult> {
  if (
    !Number.isSafeInteger(options.maxInFlight) ||
    options.maxInFlight < 1 ||
    options.maxInFlight > 64 ||
    !Number.isSafeInteger(options.millisecondsPerVirtualSecond) ||
    options.millisecondsPerVirtualSecond < 0 ||
    options.millisecondsPerVirtualSecond > 1_000
  ) {
    throw new Error('Invalid or unbounded V30 runner options');
  }
  const controller = new AbortController();
  const externalSignal = options.signal;
  const abort = () => controller.abort();
  externalSignal?.addEventListener('abort', abort, { once: true });
  if (externalSignal?.aborted) controller.abort();
  const startedAt = performance.now();
  const observations: V30LatencyObservation[] = [];
  const inFlight = new Set<Promise<void>>();
  let attempted = 0;
  let previousSecond = -1;
  try {
    for (const operation of operations) {
      if (controller.signal.aborted) break;
      if (
        !validOperation(operation) ||
        operation.virtualSecond < previousSecond
      ) {
        throw new Error('Invalid or out-of-order V30 operation');
      }
      previousSecond = operation.virtualSecond;
      while (inFlight.size >= options.maxInFlight) {
        await Promise.race(inFlight);
        if (controller.signal.aborted) break;
      }
      if (controller.signal.aborted) break;
      const scheduledAt =
        startedAt +
        operation.virtualSecond * options.millisecondsPerVirtualSecond;
      const remainingMs = scheduledAt - performance.now();
      if (remainingMs > 0) {
        try {
          await delay(remainingMs, undefined, { signal: controller.signal });
        } catch (error) {
          if (!controller.signal.aborted) throw error;
          break;
        }
      }
      if (controller.signal.aborted) break;
      const observationIndex = attempted;
      attempted += 1;
      const start = performance.now();
      const task = Promise.resolve()
        .then(() => execute(operation, controller.signal))
        .then(
          () => {
            observations[observationIndex] = {
              kind: operation.kind,
              latencyMs: performance.now() - start,
              success: true,
            };
          },
          () => {
            observations[observationIndex] = {
              kind: operation.kind,
              latencyMs: performance.now() - start,
              success: false,
            };
          },
        )
        .finally(() => {
          inFlight.delete(task);
        });
      inFlight.add(task);
    }
  } finally {
    await Promise.all(inFlight);
    externalSignal?.removeEventListener('abort', abort);
  }
  return {
    status: controller.signal.aborted
      ? 'ABORTED_NOT_ACCEPTED'
      : attempted === 0
        ? 'NOT_RUN'
        : 'CALLER_EXECUTED_NOT_ACCEPTED',
    source: 'INJECTED_EXECUTOR_UNVERIFIED',
    attempted,
    observations,
  };
}
