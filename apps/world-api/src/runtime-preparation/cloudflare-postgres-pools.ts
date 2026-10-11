import { Pool } from 'pg';
import { ExecutorRequestResourceScope } from './executor-request-resources.js';

/** Server-owned Hyperdrive values, never browser input or environment discovery.
 * Hyperdrive target registration, disabled query caching and database privileges
 * must be independently established by the release owner. A connection string
 * alone is neither target authorization nor an admitted World. */
export interface CloudflarePostgresConnections {
  readonly readerConnectionString: string;
  readonly intakeConnectionString: string;
}

export type ExecutorPoolRoute =
  | '/v1/office-command'
  | '/v1/financial-intake'
  | '/v1/command-recovery'
  | '/v1/current-seat';
/** Resource plumbing only. These are explicit server-owned values, not formal
 * binding names or runtime authority. Production composition remains HOLD. */
export interface ExecutorRouteConnections {
  readonly readerConnectionString: string;
  readonly intake: Readonly<{
    kind: 'MANUAL' | 'FINANCIAL';
    connectionString: string;
  }> | null;
  readonly sourceConnectionString: string | null;
}
export async function withCloudflareExecutorRoutePools<Result>(
  route: ExecutorPoolRoute,
  input: ExecutorRouteConnections,
  operation: (
    pools: Readonly<{ reader: Pool; intake: Pool | null; source: Pool | null }>,
    scope: ExecutorRequestResourceScope,
  ) => Promise<Result>,
  budget?: Readonly<{ deadlineMs: number; signal: AbortSignal }>,
): Promise<Result> {
  if (
    ![
      '/v1/office-command',
      '/v1/financial-intake',
      '/v1/command-recovery',
      '/v1/current-seat',
    ].includes(route) ||
    typeof operation !== 'function'
  )
    throw new TypeError('EXECUTOR_ROUTE_INVALID');
  const kind =
    route === '/v1/office-command'
      ? 'MANUAL'
      : route === '/v1/financial-intake'
        ? 'FINANCIAL'
        : null;
  if (
    kind === null
      ? input.intake !== null || input.sourceConnectionString !== null
      : input.intake?.kind !== kind || input.sourceConnectionString === null
  )
    throw new TypeError('EXECUTOR_ROUTE_POOL_MISMATCH');
  // Validate every selected value before allocating any pool.
  const readerConnectionString = connection(input.readerConnectionString);
  const intakeConnectionString = input.intake
    ? connection(input.intake.connectionString)
    : null;
  const sourceConnectionString =
    input.sourceConnectionString !== null
      ? connection(input.sourceConnectionString)
      : null;
  const remaining = Math.min(
    10000,
    (budget?.deadlineMs ?? Date.now() + 10000) - Date.now(),
  );
  if (!Number.isFinite(remaining) || remaining <= 0 || budget?.signal.aborted)
    throw new Error('EXECUTOR_REQUEST_EXPIRED');
  const scope = new ExecutorRequestResourceScope(
    kind === null ? 1 : 3,
    budget?.signal,
  );
  const create = (connectionString: string, max: number) => {
    const pool = new Pool({
      connectionString,
      max,
      connectionTimeoutMillis: Math.max(
        1,
        Math.min(3000, Math.floor(remaining)),
      ),
      idleTimeoutMillis: 1000,
      allowExitOnIdle: true,
    });
    scope.own(pool);
    pool.on('error', () => scope.api.recordCleanupFailure());
    return pool;
  };
  let result: Result | undefined,
    failed = false,
    failure: unknown;
  try {
    const pools = Object.freeze({
      reader: create(readerConnectionString, 2),
      intake: intakeConnectionString ? create(intakeConnectionString, 2) : null,
      source: sourceConnectionString ? create(sourceConnectionString, 1) : null,
    });
    result = await scope.run(() => operation(pools, scope));
  } catch (error) {
    failed = true;
    failure = error;
  }
  await scope.close();
  if (scope.cleanupFailed())
    throw new Error('CLOUDFLARE_POSTGRES_CLEANUP_UNCONFIRMED');
  if (failed) throw failure;
  return result as Result;
}

function connection(value: string): string {
  try {
    const url = new URL(value);
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !url.hostname ||
      !url.username ||
      url.pathname.length < 2 ||
      url.hash
    )
      throw new Error();
    return value;
  } catch {
    // Never include a credential-bearing URL or driver message in diagnostics.
    throw new TypeError('CLOUDFLARE_POSTGRES_CONNECTION_INVALID');
  }
}

/** Call inside a Worker request's I/O context. Both real pg Pools retain their
 * identity for existing server compositions; no global socket, SQL proxy,
 * grant, transaction retry or economic implementation is introduced here.
 * The caller must await all operations before returning. Each Pool permits two
 * connections, leaving room for JWKS/service calls within Workers' limit.
 * Pool.end() is awaited on success and failure; a cleanup failure never returns
 * a successful operation result. Existing repositories own UNKNOWN handling. */
export async function withCloudflarePostgresPools<Result>(
  input: CloudflarePostgresConnections,
  operation: (
    pools: Readonly<{ reader: Pool; intake: Pool }>,
  ) => Promise<Result>,
): Promise<Result> {
  const readerConnectionString = connection(input.readerConnectionString);
  const intakeConnectionString = connection(input.intakeConnectionString);
  if (typeof operation !== 'function')
    throw new TypeError('CLOUDFLARE_POSTGRES_OPERATION_REQUIRED');
  const create = (connectionString: string) =>
    new Pool({
      connectionString,
      max: 2,
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 1000,
      allowExitOnIdle: true,
    });
  const pools = Object.freeze({
    reader: create(readerConnectionString),
    intake: create(intakeConnectionString),
  });
  let idleFailure = false;
  const onError = () => {
    idleFailure = true;
  };
  pools.reader.on('error', onError);
  pools.intake.on('error', onError);
  let result: Result | undefined;
  let failed = false;
  let failure: unknown;
  try {
    result = await operation(pools);
  } catch (error) {
    failed = true;
    failure = error;
  }
  const closed = await Promise.allSettled([
    pools.reader.end(),
    pools.intake.end(),
  ]);
  const cleanupFailed =
    idleFailure || closed.some((item) => item.status === 'rejected');
  if (cleanupFailed)
    throw new Error('CLOUDFLARE_POSTGRES_CLEANUP_UNCONFIRMED', {
      cause: failed ? failure : undefined,
    });
  if (failed) throw failure;
  return result as Result;
}
