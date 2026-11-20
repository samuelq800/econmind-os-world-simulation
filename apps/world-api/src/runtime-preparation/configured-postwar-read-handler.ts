/** Explicit existing-server read wiring. Nothing obtains credentials, provisions
 * a database role/Hyperdrive binding, bootstraps a seed or starts simulation. */
import {
  snapshotServerMetadata,
  type ExplicitReadPreparationConfig,
} from './explicit-read-preparation-config.js';
import { withCloudflareExecutorRoutePools } from './cloudflare-postgres-pools.js';
import { POSTWAR_OFFICE_RUNTIME_SCHEMA } from '../integration/postwar-office-runtime-read-service.js';
import { ZERO_REQUEST_ID, responseJson } from './bounded-executor-transport.js';
import {
  createPostwarOfficeRuntimeFetchHandler,
  createPostwarCurrentSeatFetchHandler,
} from './postwar-office-runtime-fetch-handler.js';
import {
  AUTHENTICATED_CURRENT_SEAT_PATH,
  AUTHENTICATED_CURRENT_SEAT_SCHEMA,
} from '@econmind/core';

export const POSTWAR_OFFICE_RUNTIME_PATH = '/v1/postwar-office-runtime';
export interface PostwarReadServerEnvironment {
  readonly RUNTIME_MODE?: string;
  /** Protected server configuration, never a browser/request field. */
  readonly POSTWAR_READ_CONFIGURATION_JSON?: string;
  readonly POSTWAR_READER?: Readonly<{ connectionString: string }>;
}
type Metadata = Omit<ExplicitReadPreparationConfig, 'pool'>;
function configuredMetadata(input: string | undefined): Metadata | null {
  if (typeof input !== 'string' || input.length > 16384) return null;
  try {
    const parsed = JSON.parse(input) as {
      schemaVersion?: unknown;
      read?: Metadata;
    };
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      Object.keys(parsed).sort().join('|') !== 'read|schemaVersion' ||
      parsed.schemaVersion !== 'postwar-admitted-read-config-v1' ||
      !parsed.read ||
      typeof parsed.read !== 'object' ||
      !/^[a-z][a-z0-9_]{0,62}$/u.test(parsed.read.readerRole) ||
      !/^[a-z][a-z0-9_]{0,62}$/u.test(parsed.read.authorizationPublisherRole)
    )
      return null;
    return snapshotServerMetadata(parsed.read);
  } catch {
    return null;
  }
}
export async function handleConfiguredPostwarRead(
  request: Request,
  environment: PostwarReadServerEnvironment,
): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (
    path !== POSTWAR_OFFICE_RUNTIME_PATH &&
    path !== AUTHENTICATED_CURRENT_SEAT_PATH
  )
    return null;
  const handler =
    path === POSTWAR_OFFICE_RUNTIME_PATH
      ? createPostwarOfficeRuntimeFetchHandler
      : createPostwarCurrentSeatFetchHandler;
  const metadata =
    environment.RUNTIME_MODE === 'ADMITTED_READ_ONLY'
      ? configuredMetadata(environment.POSTWAR_READ_CONFIGURATION_JSON)
      : null;
  const connectionString = environment.POSTWAR_READER?.connectionString;
  if (!metadata || typeof connectionString !== 'string')
    return handler(null)(request);
  try {
    return await withCloudflareExecutorRoutePools(
      path,
      {
        readerConnectionString: connectionString,
        intake: null,
        sourceConnectionString: null,
      },
      async ({ reader }) => handler({ ...metadata, pool: reader })(request),
      { deadlineMs: Date.now() + 10000, signal: request.signal },
    );
  } catch {
    const origin = request.headers.get('origin');
    return responseJson(
      503,
      {
        schemaVersion:
          path === POSTWAR_OFFICE_RUNTIME_PATH
            ? POSTWAR_OFFICE_RUNTIME_SCHEMA
            : AUTHENTICATED_CURRENT_SEAT_SCHEMA,
        requestId: ZERO_REQUEST_ID,
        ok: false,
        error: { code: 'UPSTREAM_UNAVAILABLE', retryable: true },
      },
      origin && metadata.routeOptions.allowedOrigins.includes(origin)
        ? origin
        : undefined,
    );
  }
}
