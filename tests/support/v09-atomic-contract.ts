// PREPARATION_ONLY_NOT_V09_2_STARTED: test infrastructure only.

export const V09_ATOMIC_PREPARATION_STATE =
  'PREPARATION_ONLY_NOT_V09_2_STARTED' as const;

export const V09_ATOMIC_FAULT_POINTS = Object.freeze([
  'BEFORE_INVENTORY_WRITE',
  'AFTER_INVENTORY_WRITE',
  'BEFORE_FINANCIAL_WRITE',
  'AFTER_FINANCIAL_WRITE',
  'BEFORE_EVENT_WRITE',
  'AFTER_EVENT_WRITE',
  'BEFORE_RECEIPT_WRITE',
  'AFTER_RECEIPT_WRITE',
  'BEFORE_WORLD_VERSION_WRITE',
  'AFTER_WORLD_VERSION_WRITE',
  'BEFORE_OUTBOX_WRITE',
  'AFTER_OUTBOX_WRITE',
  'BEFORE_COMMIT',
  'COMMIT_ACKNOWLEDGEMENT_UNKNOWN',
  'POST_COMMIT_RESPONSE_LOST',
] as const);

export type V09AtomicFaultPoint = (typeof V09_ATOMIC_FAULT_POINTS)[number];

export type TransactionClassification =
  'COMMITTED' | 'ROLLED_BACK' | 'UNKNOWN' | 'CLEANUP_INCOMPLETE';

export interface TransactionObservation {
  readonly cleanupConfirmed: boolean;
  readonly commitAcknowledged: boolean;
  readonly commitAttempted: boolean;
  readonly durableResultFound: boolean;
  readonly rollbackConfirmed: boolean;
}

export function classifyTransactionResult(
  observation: TransactionObservation,
): TransactionClassification {
  if (!observation.cleanupConfirmed) return 'CLEANUP_INCOMPLETE';
  if (observation.durableResultFound || observation.commitAcknowledged) {
    return 'COMMITTED';
  }
  if (!observation.commitAttempted && observation.rollbackConfirmed) {
    return 'ROLLED_BACK';
  }
  return 'UNKNOWN';
}

export interface FaultTraceEntry {
  readonly index: number;
  readonly point: V09AtomicFaultPoint;
  readonly state: 'PASSED' | 'INJECTED';
}

export class InjectedV09AtomicFailure extends Error {
  readonly point: V09AtomicFaultPoint;

  constructor(point: V09AtomicFaultPoint) {
    super(`Deterministic V09 atomic failure injected at ${point}`);
    this.name = 'InjectedV09AtomicFailure';
    this.point = point;
  }
}

export class DeterministicV09FaultInjector {
  readonly #failurePoint: V09AtomicFaultPoint | null;
  readonly #trace: FaultTraceEntry[] = [];

  constructor(failurePoint: V09AtomicFaultPoint | null = null) {
    this.#failurePoint = failurePoint;
  }

  hit(point: V09AtomicFaultPoint): void {
    const state = point === this.#failurePoint ? 'INJECTED' : 'PASSED';
    this.#trace.push(
      Object.freeze({ index: this.#trace.length, point, state }),
    );
    if (state === 'INJECTED') throw new InjectedV09AtomicFailure(point);
  }

  trace(): readonly FaultTraceEntry[] {
    return Object.freeze([...this.#trace]);
  }
}

export interface SqlResult<Row extends object = Record<string, unknown>> {
  readonly rowCount: number | null;
  readonly rows: readonly Row[];
}

export interface V09AtomicSqlClient {
  query<Row extends object = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<SqlResult<Row>>;
}

export interface V09AtomicTestDatabase extends V09AtomicSqlClient {
  readonly kind: 'PGLITE' | 'POSTGRESQL';
  readonly supportsParallelTransactions: boolean;
  close(): Promise<void>;
  transaction<Result>(
    operation: (client: V09AtomicSqlClient) => Promise<Result>,
  ): Promise<Result>;
}

export class V09TransactionRolledBackError extends Error {
  override readonly cause: unknown;

  constructor(cause: unknown) {
    super('V09 atomic test transaction rolled back');
    this.name = 'V09TransactionRolledBackError';
    this.cause = cause;
  }
}

export class V09TransactionCommitUnknownError extends Error {
  override readonly cause: unknown;

  constructor(cause: unknown) {
    super('V09 atomic test transaction commit outcome is unknown');
    this.name = 'V09TransactionCommitUnknownError';
    this.cause = cause;
  }
}

export class V09TransactionCleanupIncompleteError extends Error {
  override readonly cause: unknown;

  constructor(cause: unknown) {
    super('V09 atomic test transaction cleanup is incomplete');
    this.name = 'V09TransactionCleanupIncompleteError';
    this.cause = cause;
  }
}
