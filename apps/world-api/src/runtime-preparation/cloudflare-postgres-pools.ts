import { Pool } from 'pg';

/** Server-owned Hyperdrive values, never browser input or environment discovery.
 * Hyperdrive target registration, disabled query caching and database privileges
 * must be independently established by the release owner. A connection string
 * alone is neither target authorization nor an admitted World. */
export interface CloudflarePostgresConnections {
  readonly readerConnectionString: string;
  readonly intakeConnectionString: string;
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
