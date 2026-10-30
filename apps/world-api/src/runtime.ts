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
import {
  handleOfficialPublicCors,
  readOfficialPublicCorsOrigins,
} from './integration/official-public-cors.js';
import {
  createPostwarFinanceNodeRoute,
  createPostwarOfficeNodeRoute,
} from './runtime/postwar-finance-node-route.js';
import type { PostwarFinanceConnection } from './runtime/postwar-finance-connection.js';
import type { PostwarSocialConnection } from './runtime/postwar-social-connection.js';
import type { PostwarTreasuryFxConnection } from './runtime/postwar-treasury-fx-connection.js';
import {
  readPostwarFinanceSocialApiConnection,
  type PostwarFinanceSocialApiConnection,
  type PostwarSharedOfficeConsumer,
} from './runtime/postwar-finance-social-connection.js';

const supportedEnvironments = new Set(['local', 'ci', 'staging', 'production']);
const supportedHosts = new Set(['127.0.0.1', 'localhost', '::1', '0.0.0.0']);

export interface ApiRuntimeConfig {
  readonly season1MyTeam?: Season1LobbySupabaseConfiguration;
  readonly officialCountryDatabase?: OfficialCountryDatabaseConfiguration;
  readonly officialAllData?: true;
  readonly officialPublicCorsOrigins?: readonly string[];
  readonly environment: string;
  readonly host: string;
  readonly port: number;
  readonly shutdownGraceMs: number;
}

export interface RunningApiRuntime {
  readonly origin: string;
  readonly port: number;
  readonly sharedOfficeConsumer?: Readonly<PostwarSharedOfficeConsumer>;
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
  const officialPublicCorsOrigins = readOfficialPublicCorsOrigins(
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
    ...(officialPublicCorsOrigins === undefined
      ? {}
      : { officialPublicCorsOrigins }),
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
  postwarFinanceConnection?: PostwarFinanceConnection,
  postwarSocialConnection?: PostwarSocialConnection,
  postwarTreasuryFxConnection?: PostwarTreasuryFxConnection,
  sharedConsumerConfigured = false,
) {
  let ready = false;
  let databaseReady = officialCountryPool === undefined;
  let allDataVerifiedAt = 0;
  let allDataProbe: Promise<boolean> | undefined;
  const financeRoute =
    postwarSocialConnection !== undefined ||
    postwarTreasuryFxConnection !== undefined
      ? createPostwarOfficeNodeRoute({
          ...(postwarSocialConnection
            ? { social: postwarSocialConnection }
            : {}),
          ...(postwarTreasuryFxConnection
            ? { treasuryFx: postwarTreasuryFxConnection }
            : {}),
          ...(postwarFinanceConnection
            ? { finance: postwarFinanceConnection }
            : {}),
        })
      : postwarFinanceConnection === undefined
        ? undefined
        : createPostwarFinanceNodeRoute(postwarFinanceConnection);
  const financeHealth = () =>
    financeRoute === undefined
      ? {}
      : {
          ...(postwarTreasuryFxConnection
            ? {
                postwarTreasuryFx: {
                  routeInstalled: true,
                  configured:
                    postwarTreasuryFxConnection.status ===
                    'EXPLICIT_MANUAL_TREASURY_FX_CONNECTION',
                  productionReady: false,
                  manualConsumptionOnly: true,
                },
              }
            : {}),
          ...(sharedConsumerConfigured
            ? {
                postwarSharedConsumer: {
                  configured: true,
                  productionReady: false,
                  manualConsumptionOnly: true,
                },
              }
            : {}),
          ...(postwarSocialConnection
            ? {
                postwarSocial: {
                  routeInstalled: true,
                  configured: true,
                  productionReady: false,
                  manualConsumptionOnly: true,
                  preparationMode: postwarSocialConnection.preparationMode,
                },
              }
            : {}),
          postwarFinance: {
            routeInstalled: postwarFinanceConnection !== undefined,
            configured:
              postwarFinanceConnection?.status ===
              'EXPLICIT_MANUAL_FINANCE_CONNECTION',
            productionReady: false,
            manualConsumptionOnly: true,
          },
        };
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
    if (financeRoute?.matches(request)) {
      void financeRoute.handle(request, response).catch(() => {
        if (!response.headersSent && !response.destroyed)
          sendJson(request, response, 503, {
            ok: false,
            error: { code: 'UPSTREAM_UNAVAILABLE' },
          });
      });
      return;
    }
    const path = request.url?.split('?', 1)[0];
    if (
      officialMapAssets !== undefined &&
      path === OFFICIAL_MAP_ASSET_LIST_PATH
    ) {
      if (
        handleOfficialPublicCors(
          request,
          response,
          config.officialPublicCorsOrigins,
        )
      )
        return;
      officialMapAssets(request, response);
      return;
    }
    if (
      officialDatasets !== undefined &&
      (path === OFFICIAL_DATASET_LIST_PATH ||
        path?.startsWith(`${OFFICIAL_DATASET_LIST_PATH}/`))
    ) {
      if (
        handleOfficialPublicCors(
          request,
          response,
          config.officialPublicCorsOrigins,
        )
      )
        return;
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
      if (
        handleOfficialPublicCors(
          request,
          response,
          config.officialPublicCorsOrigins,
        )
      )
        return;
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
        ...financeHealth(),
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
          ...financeHealth(),
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
      financeRoute?.stopAccepting();
    },
    drainFinance: () => financeRoute?.drain(),
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

async function failStartupAfterCleanup(
  startupError: unknown,
  cleanup: readonly (() => Promise<unknown> | undefined)[],
): Promise<never> {
  const failures: unknown[] = [];
  for (const operation of cleanup) {
    try {
      await operation();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length)
    throw new AggregateError(
      [startupError, ...failures],
      'world-api startup failed and cleanup was incomplete',
      { cause: startupError },
    );
  throw startupError;
}

export async function startApiRuntime(
  config: ApiRuntimeConfig = readApiRuntimeConfig(),
  dependencies: {
    readonly season1Fetch?: typeof fetch;
    readonly officialCountryPool?: ManagedOfficialCountryPool;
    readonly postwarFinanceConnection?: PostwarFinanceConnection;
    readonly postwarSocialConnection?: PostwarSocialConnection;
    readonly postwarTreasuryFxConnection?: PostwarTreasuryFxConnection;
    readonly postwarFinanceSocialConnection?: Readonly<PostwarFinanceSocialApiConnection>;
  } = {},
): Promise<RunningApiRuntime> {
  let officialCountryPool: ManagedOfficialCountryPool | undefined;
  let lifecycle: ReturnType<typeof createApiServer>;
  let shared:
    ReturnType<typeof readPostwarFinanceSocialApiConnection> | undefined;
  try {
    // Resolve only genuine ownership before validation can reject a mixed
    // installation, so every transferred resource is still drained on failure.
    if (dependencies.postwarFinanceSocialConnection)
      shared = readPostwarFinanceSocialApiConnection(
        dependencies.postwarFinanceSocialConnection,
      );
    if (
      dependencies.postwarTreasuryFxConnection &&
      (dependencies.postwarFinanceConnection ||
        dependencies.postwarSocialConnection ||
        dependencies.postwarFinanceSocialConnection)
    )
      throw Error('POSTWAR_TREASURY_FX_REQUIRES_SOLE_EXPLICIT_CONSUMER');
    if (
      dependencies.postwarTreasuryFxConnection?.environment &&
      config.environment !==
        dependencies.postwarTreasuryFxConnection.environment
    )
      throw Error('POSTWAR_TREASURY_FX_EXACT_ENVIRONMENT_REQUIRED');
    if (shared) {
      if (
        dependencies.postwarFinanceConnection ||
        dependencies.postwarSocialConnection ||
        dependencies.postwarTreasuryFxConnection ||
        config.environment !== shared.environment
      )
        throw Error('POSTWAR_SHARED_NODE_EXCLUSIVE_EXACT_ENVIRONMENT_REQUIRED');
    }
    officialCountryPool =
      config.officialCountryDatabase === undefined
        ? undefined
        : (dependencies.officialCountryPool ??
          createOfficialCountryReadPool(config.officialCountryDatabase));
    // Real cold preparation is part of product startup, before any listener.
    // Failure is drained/cleaned with the same installed dependency lifecycle.
    if (shared) await dependencies.postwarFinanceSocialConnection!.prepare();
    else await dependencies.postwarSocialConnection?.prepare();
    lifecycle = createApiServer(
      config,
      dependencies.season1Fetch,
      officialCountryPool,
      shared?.finance ?? dependencies.postwarFinanceConnection,
      shared?.social ?? dependencies.postwarSocialConnection,
      shared?.treasuryFx ?? dependencies.postwarTreasuryFxConnection,
      shared !== undefined,
    );
  } catch (error) {
    return failStartupAfterCleanup(error, [
      () =>
        shared
          ? dependencies.postwarFinanceSocialConnection!.stop()
          : undefined,
      () => dependencies.postwarFinanceConnection?.stop(),
      () => dependencies.postwarSocialConnection?.stop(),
      () => dependencies.postwarTreasuryFxConnection?.stop(),
      () => officialCountryPool?.end(),
    ]);
  }
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
    lifecycle.stopReadiness();
    return failStartupAfterCleanup(error, [
      () => lifecycle.drainFinance(),
      () =>
        shared
          ? dependencies.postwarFinanceSocialConnection!.stop()
          : undefined,
      () => officialCountryPool?.end(),
    ]);
  }
  const address = lifecycle.server.address();
  if (address === null || typeof address === 'string') {
    lifecycle.stopReadiness();
    return failStartupAfterCleanup(
      new Error('world-api did not acquire a TCP address'),
      [
        () => closeServer(lifecycle.server, config.shutdownGraceMs),
        () => lifecycle.drainFinance(),
        () =>
          shared
            ? dependencies.postwarFinanceSocialConnection!.stop()
            : undefined,
        () => officialCountryPool?.end(),
      ],
    );
  }
  let shutdownPromise: Promise<void> | undefined;
  const originHost = config.host.includes(':')
    ? `[${config.host}]`
    : config.host;
  return {
    origin: `http://${originHost}:${address.port}`,
    port: address.port,
    ...(shared ? { sharedOfficeConsumer: shared.control } : {}),
    ready: lifecycle.ready,
    shutdown: () => {
      lifecycle.stopReadiness();
      shutdownPromise ??= (async () => {
        const errors: unknown[] = [];
        for (const operation of [
          () => closeServer(lifecycle.server, config.shutdownGraceMs),
          () => lifecycle.drainFinance(),
          () =>
            shared
              ? dependencies.postwarFinanceSocialConnection!.stop()
              : undefined,
          () => officialCountryPool?.end(),
        ]) {
          try {
            await operation();
          } catch (error) {
            errors.push(error);
          }
        }
        if (errors.length)
          throw new AggregateError(
            errors,
            'world-api shutdown cleanup was incomplete',
          );
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
