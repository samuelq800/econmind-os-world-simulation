/** Browser-only, derived forecast transport. These records are never World State. */
export const FORECAST_PROTOCOL_VERSION = 1 as const;

export interface ForecastSnapshotIdentity {
  readonly worldId: string;
  readonly countryId: string;
  /** Opaque identifier for the caller's already-authorized projection scope. */
  readonly scopeKey: string;
  readonly authorizationRevision: string;
  readonly projectionVersion: string;
  readonly modelVersion: string;
  readonly snapshotRef: string;
  /** Canonical, nonnegative integer supplied by the authoritative read path. */
  readonly worldVersion: string;
}

export interface ForecastFact {
  readonly factRef: string;
  readonly value: string;
  readonly unit: string;
}

export interface ForecastAssumption {
  readonly assumptionRef: string;
  readonly value: string;
  readonly unit: string;
}

export interface AuthorizedForecastSnapshot {
  readonly identity: ForecastSnapshotIdentity;
  /** Caller-selected projection facts; the worker has no independent read path. */
  readonly facts: readonly ForecastFact[];
}

export interface ForecastRequest {
  readonly protocolVersion: typeof FORECAST_PROTOCOL_VERSION;
  readonly taskId: string;
  readonly snapshot: AuthorizedForecastSnapshot;
  readonly assumptions: readonly ForecastAssumption[];
}

export interface ForecastValue {
  readonly forecastRef: string;
  readonly value: string;
  readonly unit: string;
  readonly sourceFactRefs: readonly string[];
}

export type ForecastCalculation =
  | { readonly status: 'READY'; readonly values: readonly ForecastValue[] }
  | {
      readonly status: 'UNAVAILABLE';
      readonly reason: 'INPUTS_MISSING' | 'MODEL_NOT_CONNECTED';
    };

type ForecastResultEnvelope = {
  readonly protocolVersion: typeof FORECAST_PROTOCOL_VERSION;
  readonly taskId: string;
  readonly kind: 'DERIVED_FORECAST';
};

export type ForecastWorkerResult = ForecastResultEnvelope &
  (
    | {
        readonly identity: ForecastSnapshotIdentity | null;
        readonly status: 'FAILED';
        readonly reason: 'INVALID_REQUEST';
      }
    | ({ readonly identity: ForecastSnapshotIdentity } & (
        | ForecastCalculation
        | { readonly status: 'CANCELLED' }
        | { readonly status: 'FAILED'; readonly reason: 'EXECUTION_FAILED' }
      ))
  );

export interface ForecastWorkerApi {
  run(request: ForecastRequest): Promise<ForecastWorkerResult>;
  cancel(taskId: string): Promise<boolean>;
}

export type ForecastExecutor = (
  request: ForecastRequest,
  signal: AbortSignal,
) => Promise<ForecastCalculation>;

const canonicalDecimal = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

function nonempty(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length > 0 && value.trim() === value
  );
}

export function isValidSnapshotIdentity(
  identity: ForecastSnapshotIdentity | null | undefined,
): identity is ForecastSnapshotIdentity {
  return (
    !!identity &&
    nonempty(identity.worldId) &&
    nonempty(identity.countryId) &&
    nonempty(identity.scopeKey) &&
    nonempty(identity.authorizationRevision) &&
    nonempty(identity.projectionVersion) &&
    nonempty(identity.modelVersion) &&
    nonempty(identity.snapshotRef) &&
    /^(?:0|[1-9]\d*)$/.test(identity.worldVersion)
  );
}

export function sameSnapshotIdentity(
  left: ForecastSnapshotIdentity | null | undefined,
  right: ForecastSnapshotIdentity | null | undefined,
): boolean {
  return (
    isValidSnapshotIdentity(left) &&
    isValidSnapshotIdentity(right) &&
    left.worldId === right.worldId &&
    left.countryId === right.countryId &&
    left.scopeKey === right.scopeKey &&
    left.authorizationRevision === right.authorizationRevision &&
    left.projectionVersion === right.projectionVersion &&
    left.modelVersion === right.modelVersion &&
    left.snapshotRef === right.snapshotRef &&
    left.worldVersion === right.worldVersion
  );
}

function validAmount(record: ForecastFact | ForecastAssumption): boolean {
  return (
    nonempty(record.value) &&
    canonicalDecimal.test(record.value) &&
    nonempty(record.unit)
  );
}

export function isValidForecastRequest(request: ForecastRequest): boolean {
  return (
    request?.protocolVersion === FORECAST_PROTOCOL_VERSION &&
    nonempty(request.taskId) &&
    isValidSnapshotIdentity(request.snapshot?.identity) &&
    Array.isArray(request.snapshot?.facts) &&
    request.snapshot.facts.every(
      (fact) => nonempty(fact?.factRef) && validAmount(fact),
    ) &&
    Array.isArray(request.assumptions) &&
    request.assumptions.every(
      (assumption) =>
        nonempty(assumption?.assumptionRef) && validAmount(assumption),
    )
  );
}

function normalizeCalculation(
  calculation: ForecastCalculation,
  sourceRefs: ReadonlySet<string>,
): ForecastCalculation {
  if (calculation.status === 'UNAVAILABLE') {
    if (
      calculation.reason !== 'INPUTS_MISSING' &&
      calculation.reason !== 'MODEL_NOT_CONNECTED'
    ) {
      throw new Error('Invalid unavailable reason');
    }
    return { status: 'UNAVAILABLE', reason: calculation.reason };
  }

  if (calculation.status !== 'READY' || !Array.isArray(calculation.values)) {
    throw new Error('Invalid forecast result');
  }
  return {
    status: 'READY',
    values: calculation.values.map((value) => {
      if (
        !nonempty(value?.forecastRef) ||
        !validAmount(value) ||
        !Array.isArray(value.sourceFactRefs) ||
        value.sourceFactRefs.length === 0 ||
        !value.sourceFactRefs.every(
          (ref: string) => nonempty(ref) && sourceRefs.has(ref),
        )
      ) {
        throw new Error('Invalid forecast value');
      }
      return {
        forecastRef: value.forecastRef,
        value: value.value,
        unit: value.unit,
        sourceFactRefs: [...value.sourceFactRefs],
      };
    }),
  };
}

/** Cancellation is checked after the executor settles, so late completion cannot win. */
export function createForecastWorkerApi(
  executor: ForecastExecutor = async (request) =>
    request.snapshot.facts.length === 0
      ? { status: 'UNAVAILABLE', reason: 'INPUTS_MISSING' }
      : { status: 'UNAVAILABLE', reason: 'MODEL_NOT_CONNECTED' },
): ForecastWorkerApi {
  const active = new Map<string, AbortController>();

  return {
    async run(request) {
      const identity = request?.snapshot?.identity;
      const baseEnvelope = {
        protocolVersion: FORECAST_PROTOCOL_VERSION,
        taskId: request?.taskId ?? '',
        kind: 'DERIVED_FORECAST' as const,
      };
      if (!isValidForecastRequest(request) || active.has(request.taskId)) {
        return {
          ...baseEnvelope,
          identity: isValidSnapshotIdentity(identity) ? { ...identity } : null,
          status: 'FAILED',
          reason: 'INVALID_REQUEST',
        };
      }

      // Pass only named protocol fields to a future model. Caller extras are
      // never part of its inputs, even if JavaScript bypasses the TS contract.
      const safeRequest: ForecastRequest = {
        protocolVersion: FORECAST_PROTOCOL_VERSION,
        taskId: request.taskId,
        snapshot: {
          identity: { ...request.snapshot.identity },
          facts: request.snapshot.facts.map((fact) => ({
            factRef: fact.factRef,
            value: fact.value,
            unit: fact.unit,
          })),
        },
        assumptions: request.assumptions.map((assumption) => ({
          assumptionRef: assumption.assumptionRef,
          value: assumption.value,
          unit: assumption.unit,
        })),
      };
      const envelope = {
        ...baseEnvelope,
        identity: safeRequest.snapshot.identity,
      };
      const sourceRefs = new Set([
        ...safeRequest.snapshot.facts.map((fact) => fact.factRef),
        ...safeRequest.assumptions.map(
          (assumption) => assumption.assumptionRef,
        ),
      ]);
      const controller = new AbortController();
      active.set(request.taskId, controller);
      try {
        const calculation = await executor(safeRequest, controller.signal);
        if (controller.signal.aborted) {
          return { ...envelope, status: 'CANCELLED' };
        }
        return {
          ...envelope,
          ...normalizeCalculation(calculation, sourceRefs),
        };
      } catch {
        return controller.signal.aborted
          ? { ...envelope, status: 'CANCELLED' }
          : { ...envelope, status: 'FAILED', reason: 'EXECUTION_FAILED' };
      } finally {
        active.delete(request.taskId);
      }
    },
    async cancel(taskId) {
      const controller = active.get(taskId);
      if (!controller) return false;
      controller.abort();
      return true;
    },
  };
}
