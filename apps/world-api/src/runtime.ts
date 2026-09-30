import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import {
  createSeason1MyTeamRoute,
  readSeason1MyTeamRouteConfiguration,
  SEASON1_MY_TEAM_PATH,
} from './integration/season1-my-team-route.js';
import type { Season1LobbySupabaseConfiguration } from './integration/season1-lobby-supabase-reader.js';
import {
  createOfficialCountryBaselineRoute,
  OFFICIAL_COUNTRY_LIST_PATH,
  readOfficialCountries,
} from './integration/official-country-baseline.js';
import {
  createOfficialCountryReadPool,
  readOfficialCountryDatabaseConfiguration,
  type ManagedOfficialCountryPool,
  type OfficialCountryDatabaseConfiguration,
} from './integration/official-country-postgres.js';
import {
  createOfficialDatasetRoute,
  OFFICIAL_DATASET_LIST_PATH,
} from './integration/official-dataset-route.js';
import { OFFICIAL_DATASETS } from './integration/official-dataset-registry.js';
import { readOfficialDatasetSource } from './integration/official-dataset-source.js';
import {
  createOfficialMapAssetRoute,
  OFFICIAL_MAP_ASSET_LIST_PATH,
} from './integration/official-map-asset-route.js';

const supportedEnvironments = new Set(['local', 'ci', 'staging', 'production']);
const supportedHosts = new Set(['127.0.0.1', 'localhost', '::1', '0.0.0.0']);

export interface ApiRuntimeConfig {
  readonly season1MyTeam?: Season1LobbySupabaseConfiguration;
  readonly officialCountryDatabase?: OfficialCountryDatabaseConfiguration;
  readonly officialAllData?: true;
  readonly environment: string;
  readonly host: string;
  readonly port: number;
  readonly shutdownGraceMs: number;
}

export interface RunningApiRuntime {
  readonly origin: string;
  readonly port: number;
  readonly ready: () => boolean;
  readonly shutdown: () => Promise<void>;
}

function parsePort(value: string | undefined, fallback: number): number {
  const portText = value ?? String(fallback);
  if (!/^\d+$/u.test(portText)) {
    throw new Error('WORLD_API_PORT must be an integer from 1024 to 65535');
  }
  const port = Number(portText);
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65_535) {
    throw new Error('WORLD_API_PORT must be an integer from 1024 to 65535');
  }
  return port;
}

function parseHost(value: string | undefined): string {
  const host = value ?? '127.0.0.1';
  if (!supportedHosts.has(host)) {
    throw new Error('WORLD_API_HOST is not an approved bind host');
  }
  return host;
}

export function readApiRuntimeConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ApiRuntimeConfig {
  const environmentName = environment.ECONMIND_ENV ?? 'local';
  if (!supportedEnvironments.has(environmentName)) {
    throw new Error(`Unsupported ECONMIND_ENV: ${environmentName}`);
  }
  const season1MyTeam = readSeason1MyTeamRouteConfiguration(environment);
  const officialCountryDatabase = readOfficialCountryDatabaseConfiguration(
    environment,
    environmentName,
  );
  const allDataFlag = environment.WORLD_API_ALL_DATA_ENABLED;
  if (
    allDataFlag !== undefined &&
    allDataFlag !== 'false' &&
    allDataFlag !== 'true'
  ) {
    throw new Error('WORLD_API_ALL_DATA_ENABLED must be literal true or false');
  }
  if (allDataFlag === 'true' && officialCountryDatabase === undefined) {
    throw new Error(
      'WORLD_API_ALL_DATA_ENABLED requires the official database reader',
    );
  }
  return {
    ...(season1MyTeam === undefined ? {} : { season1MyTeam }),
    ...(officialCountryDatabase === undefined
      ? {}
      : { officialCountryDatabase }),
    ...(allDataFlag === 'true' ? { officialAllData: true as const } : {}),
    environment: environmentName,
    host: parseHost(environment.WORLD_API_HOST),
    port: parsePort(environment.WORLD_API_PORT, 4101),
    shutdownGraceMs: 5_000,
  };
}

function sendJson(
  request: IncomingMessage,
  response: ServerResponse,
  statusCode: number,
  body: object,
) {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(request.method === 'HEAD' ? undefined : payload);
}

function createApiServer(
  config: ApiRuntimeConfig,
  requestFetch?: typeof fetch,
  officialCountryPool?: ManagedOfficialCountryPool,
) {
  let ready = false;
  let databaseReady = officialCountryPool === undefined;
  let allDataVerifiedAt = 0;
  let allDataProbe: Promise<boolean> | undefined;
  const officialCountries =
    officialCountryPool === undefined
      ? undefined
      : createOfficialCountryBaselineRoute(officialCountryPool);
  const officialDatasets =
    config.officialAllData === true && officialCountryPool !== undefined
      ? createOfficialDatasetRoute(officialCountryPool)
      : undefined;
  const officialMapAssets =
    config.officialAllData === true && officialCountryPool !== undefined
      ? createOfficialMapAssetRoute()
      : undefined;
  const verifyAllData = async (pool: ManagedOfficialCountryPool) => {
    if (allDataVerifiedAt > 0 && Date.now() - allDataVerifiedAt < 300_000)
      return true;
    allDataProbe ??= (async () => {
      try {
        for (let index = 0; index < OFFICIAL_DATASETS.length; index += 4) {
          await Promise.all(
            OFFICIAL_DATASETS.slice(index, index + 4).map((spec) =>
              readOfficialDatasetSource(pool, spec),
            ),
          );
        }
        allDataVerifiedAt = Date.now();
        return true;
      } catch {
        allDataVerifiedAt = 0;
        return false;
      } finally {
        allDataProbe = undefined;
      }
    })();
    return allDataProbe;
  };
  const boundedAllDataProbe = async (pool: ManagedOfficialCountryPool) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        verifyAllData(pool),
        new Promise<false>((resolve) => {
          timer = setTimeout(() => resolve(false), 10_000);
          timer.unref();
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  };
  const probeDatabase = async () => {
    if (officialCountryPool === undefined) return true;
    try {
      await readOfficialCountries(officialCountryPool);
      databaseReady =
        config.officialAllData !== true ||
        (await boundedAllDataProbe(officialCountryPool));
    } catch {
      databaseReady = false;
    }
    return databaseReady;
  };
  const season1MyTeam =
    config.season1MyTeam === undefined
      ? undefined
      : createSeason1MyTeamRoute({
          configuration: config.season1MyTeam,
          ...(requestFetch === undefined ? {} : { fetch: requestFetch }),
        });
  const server = createServer((request, response) => {
    const path = request.url?.split('?', 1)[0];
    if (
      officialMapAssets !== undefined &&
      path === OFFICIAL_MAP_ASSET_LIST_PATH
    ) {
      officialMapAssets(request, response);
      return;
    }
    if (
      officialDatasets !== undefined &&
      (path === OFFICIAL_DATASET_LIST_PATH ||
        path?.startsWith(`${OFFICIAL_DATASET_LIST_PATH}/`))
    ) {
      void officialDatasets(request, response).catch(() => {
        if (!response.headersSent && !response.destroyed) {
          sendJson(request, response, 503, {
            ok: false,
            error: { code: 'SOURCE_UNAVAILABLE' },
          });
        }
      });
      return;
    }
    if (
      officialCountries !== undefined &&
      (path === OFFICIAL_COUNTRY_LIST_PATH ||
        path?.startsWith(`${OFFICIAL_COUNTRY_LIST_PATH}/`))
    ) {
      void officialCountries(request, response).catch(() => {
        if (!response.headersSent && !response.destroyed) {
          sendJson(request, response, 503, {
            ok: false,
            error: { code: 'SOURCE_UNAVAILABLE' },
          });
        }
      });
      return;
    }
    if (path === SEASON1_MY_TEAM_PATH && season1MyTeam !== undefined) {
      void season1MyTeam(request, response).catch(() => {
        if (!response.headersSent && !response.destroyed) {
          sendJson(request, response, 503, {
            ok: false,
            error: { code: 'UPSTREAM_UNAVAILABLE' },
          });
        }
      });
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { allow: 'GET, HEAD' });
      response.end();
      return;
    }
    if (path === '/healthz') {
      sendJson(request, response, 200, {
        service: 'world-api',
        status: 'ok',
        ready: ready && databaseReady,
        role: 'command-query-boundary',
        authoritativeMutationEnabled: false,
      });
      return;
    }
    if (path === '/readyz') {
      void probeDatabase().then((databaseAvailable) => {
        if (response.destroyed) return;
        const isReady = ready && databaseAvailable;
        sendJson(request, response, isReady ? 200 : 503, {
          service: 'world-api',
          status: isReady ? 'ok' : 'not-ready',
          ready: isReady,
          role: 'command-query-boundary',
          authoritativeMutationEnabled: false,
          ...(officialCountryPool === undefined
            ? {}
            : {
                officialCountryDatabaseReady: databaseAvailable,
                ...(config.officialAllData === true
                  ? {
                      officialAllDataVerifiedAt:
                        allDataVerifiedAt > 0
                          ? new Date(allDataVerifiedAt).toISOString()
                          : null,
                    }
                  : {}),
              }),
        });
      });
      return;
    }
    sendJson(request, response, 404, {
      service: 'world-api',
      status: 'not-found',
    });
  });
  server.on('listening', () => {
    ready = true;
  });
  server.on('close', () => {
    ready = false;
  });
  return {
    server,
    ready: () => ready && databaseReady,
    stopReadiness: () => {
      ready = false;
    },
  };
}

function closeServer(server: Server, graceMs: number): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const forceClose = setTimeout(() => {
      server.closeAllConnections();
    }, graceMs);
    forceClose.unref();
    server.close((error) => {
      clearTimeout(forceClose);
      if (error) reject(error);
      else resolve();
    });
  });
}

export async function startApiRuntime(
  config: ApiRuntimeConfig = readApiRuntimeConfig(),
  dependencies: {
    readonly season1Fetch?: typeof fetch;
    readonly officialCountryPool?: ManagedOfficialCountryPool;
  } = {},
): Promise<RunningApiRuntime> {
  const officialCountryPool =
    config.officialCountryDatabase === undefined
      ? undefined
      : (dependencies.officialCountryPool ??
        createOfficialCountryReadPool(config.officialCountryDatabase));
  const lifecycle = createApiServer(
    config,
    dependencies.season1Fetch,
    officialCountryPool,
  );
  try {
    await new Promise<void>((resolve, reject) => {
      const startupError = (error: Error) => {
        lifecycle.server.off('listening', resolve);
        reject(error);
      };
      lifecycle.server.once('error', startupError);
      lifecycle.server.listen(config.port, config.host, () => {
        lifecycle.server.off('error', startupError);
        resolve();
      });
    });
  } catch (error) {
    await officialCountryPool?.end();
    throw error;
  }
  const address = lifecycle.server.address();
  if (address === null || typeof address === 'string') {
    await closeServer(lifecycle.server, config.shutdownGraceMs);
    await officialCountryPool?.end();
    throw new Error('world-api did not acquire a TCP address');
  }
  let shutdownPromise: Promise<void> | undefined;
  const originHost = config.host.includes(':')
    ? `[${config.host}]`
    : config.host;
  return {
    origin: `http://${originHost}:${address.port}`,
    port: address.port,
    ready: lifecycle.ready,
    shutdown: () => {
      lifecycle.stopReadiness();
      shutdownPromise ??= (async () => {
        await closeServer(lifecycle.server, config.shutdownGraceMs);
        await officialCountryPool?.end();
      })();
      return shutdownPromise;
    },
  };
}

export async function runApiProcess() {
  const config = readApiRuntimeConfig();
  const startupPromise = Promise.resolve().then(() => startApiRuntime(config));
  let shutdownPromise: Promise<void> | undefined;
  const shutdown = (signal: NodeJS.Signals) => {
    shutdownPromise ??= (async () => {
      const runtime = await startupPromise;
      console.log(
        JSON.stringify({
          event: 'SHUTDOWN_START',
          service: 'world-api',
          signal,
        }),
      );
      await runtime.shutdown();
      console.log(
        JSON.stringify({
          event: 'SHUTDOWN_COMPLETE',
          service: 'world-api',
          signal,
        }),
      );
    })();
    return shutdownPromise;
  };
  const beginShutdown = (signal: NodeJS.Signals) => {
    void shutdown(signal).catch((error: unknown) => {
      console.error(
        JSON.stringify({
          event: 'SHUTDOWN_FAILED',
          service: 'world-api',
          signal,
          error:
            error instanceof Error ? error.message : 'Unknown shutdown failure',
        }),
      );
      process.exitCode = 1;
    });
  };
  process.on('SIGINT', () => beginShutdown('SIGINT'));
  process.on('SIGTERM', () => beginShutdown('SIGTERM'));
  const runtime = await startupPromise;
  if (shutdownPromise !== undefined) {
    await shutdownPromise;
    return;
  }
  console.log(
    JSON.stringify({
      event: 'LISTENING',
      service: 'world-api',
      environment: config.environment,
      origin: runtime.origin,
    }),
  );
}
