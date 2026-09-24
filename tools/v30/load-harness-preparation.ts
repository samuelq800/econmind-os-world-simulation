/** V30.1 preparation only: virtual workload planning, with no I/O or PASS state. */

export const V30_SESSION_TIERS = [50, 100, 420] as const;

export type V30SessionTier = (typeof V30_SESSION_TIERS)[number];
export type V30SessionAction =
  | 'PROJECTION_READ'
  | 'ORDER_SUBMIT'
  | 'CONTRACT_SUBMIT'
  | 'RECEIPT_POLL'
  | 'FORECAST_LOCAL';
export type V30WorldAction = 'DUE_OBLIGATION_TICK';

export interface V30Rate<Kind extends string> {
  readonly kind: Kind;
  readonly perMinute: number;
}

export interface V30LoadPlanInput {
  readonly tier: V30SessionTier;
  readonly minutes: number;
  readonly seed: number;
  readonly sessionActions: readonly V30Rate<V30SessionAction>[];
  readonly worldActions: readonly V30Rate<V30WorldAction>[];
}

export interface V30PlannedOperation {
  readonly virtualSecond: number;
  readonly kind: V30SessionAction | V30WorldAction;
  readonly sessionIndex: number | null;
}

export interface V30LatencyObservation {
  readonly kind: V30SessionAction | V30WorldAction;
  readonly latencyMs: number;
  readonly success: boolean;
}

export interface V30LatencySummary {
  readonly status: 'NOT_RUN' | 'CALLER_MEASURED_NOT_ACCEPTED';
  readonly source: 'CALLER_SUPPLIED_OBSERVATIONS_UNVERIFIED';
  readonly count: number;
  readonly failures: number;
  readonly p50Ms: number | null;
  readonly p95Ms: number | null;
  readonly p99Ms: number | null;
}

const SESSION_ACTIONS = new Set<V30SessionAction>([
  'PROJECTION_READ',
  'ORDER_SUBMIT',
  'CONTRACT_SUBMIT',
  'RECEIPT_POLL',
  'FORECAST_LOCAL',
]);
const WORLD_ACTIONS = new Set<V30WorldAction>(['DUE_OBLIGATION_TICK']);

function safeInteger(value: number, minimum: number, maximum: number): boolean {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function validateRates<Kind extends string>(
  rates: readonly V30Rate<Kind>[],
  allowed: ReadonlySet<Kind>,
): void {
  if (!Array.isArray(rates)) throw new Error('Load rates must be arrays');
  const seen = new Set<Kind>();
  for (const rate of rates) {
    if (
      rate === null ||
      typeof rate !== 'object' ||
      !allowed.has(rate.kind) ||
      !safeInteger(rate.perMinute, 0, 60) ||
      seen.has(rate.kind)
    ) {
      throw new Error('Invalid or duplicate V30 operation rate');
    }
    seen.add(rate.kind);
  }
}

function due(second: number, phase: number, rate: number): boolean {
  const slot = (second + phase) % 60;
  return Math.floor(((slot + 1) * rate) / 60) > Math.floor((slot * rate) / 60);
}

/** Stream a stable, time-ordered plan; callers must bind it to real routes later. */
export function createV30LoadPlan(
  input: V30LoadPlanInput,
): Iterable<V30PlannedOperation> {
  if (
    !V30_SESSION_TIERS.includes(input.tier) ||
    !safeInteger(input.minutes, 1, 120) ||
    !safeInteger(input.seed, 0, 2_147_483_647)
  ) {
    throw new Error('Invalid V30 load tier, duration, or seed');
  }
  validateRates(input.sessionActions, SESSION_ACTIONS);
  validateRates(input.worldActions, WORLD_ACTIONS);
  if (
    [...input.sessionActions, ...input.worldActions].every(
      (rate) => rate.perMinute === 0,
    )
  ) {
    throw new Error('A nonempty V30 workload is required');
  }
  const sessionActions = input.sessionActions.map((rate) => ({ ...rate }));
  const worldActions = input.worldActions.map((rate) => ({ ...rate }));
  const { tier, minutes, seed } = input;
  return {
    *[Symbol.iterator]() {
      for (
        let virtualSecond = 0;
        virtualSecond < minutes * 60;
        virtualSecond += 1
      ) {
        const second = virtualSecond % 60;
        for (let index = 0; index < worldActions.length; index += 1) {
          const action = worldActions[index]!;
          if (due(second, (seed + index * 11) % 60, action.perMinute)) {
            yield { virtualSecond, kind: action.kind, sessionIndex: null };
          }
        }
        for (let sessionIndex = 0; sessionIndex < tier; sessionIndex += 1) {
          for (let index = 0; index < sessionActions.length; index += 1) {
            const action = sessionActions[index]!;
            if (
              due(
                second,
                (seed + sessionIndex * 17 + index * 11) % 60,
                action.perMinute,
              )
            ) {
              yield { virtualSecond, kind: action.kind, sessionIndex };
            }
          }
        }
      }
    },
  };
}

function percentile(sorted: readonly number[], percent: number): number {
  return sorted[Math.ceil((percent / 100) * sorted.length) - 1]!;
}

/** Never returns PASS: provenance and real target checks belong to V30.1. */
export function summarizeV30Latencies(
  observations: readonly V30LatencyObservation[],
): V30LatencySummary {
  if (!Array.isArray(observations)) {
    throw new Error('Observations must be an array');
  }
  const values: number[] = [];
  let failures = 0;
  for (const observation of observations) {
    if (
      observation === null ||
      typeof observation !== 'object' ||
      (!SESSION_ACTIONS.has(observation.kind as V30SessionAction) &&
        !WORLD_ACTIONS.has(observation.kind as V30WorldAction)) ||
      !Number.isFinite(observation.latencyMs) ||
      observation.latencyMs < 0 ||
      typeof observation.success !== 'boolean'
    ) {
      throw new Error('Invalid V30 latency observation');
    }
    values.push(observation.latencyMs);
    if (!observation.success) failures += 1;
  }
  values.sort((left, right) => left - right);
  return {
    status: values.length === 0 ? 'NOT_RUN' : 'CALLER_MEASURED_NOT_ACCEPTED',
    source: 'CALLER_SUPPLIED_OBSERVATIONS_UNVERIFIED',
    count: values.length,
    failures,
    p50Ms: values.length === 0 ? null : percentile(values, 50),
    p95Ms: values.length === 0 ? null : percentile(values, 95),
    p99Ms: values.length === 0 ? null : percentile(values, 99),
  };
}
