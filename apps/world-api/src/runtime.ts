import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';

const supportedEnvironments = new Set(['local', 'ci', 'staging', 'production']);
const supportedHosts = new Set(['127.0.0.1', 'localhost', '::1', '0.0.0.0']);

export interface ApiRuntimeConfig {
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
  return {
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

function createApiServer() {
  let ready = false;
  const server = createServer((request, response) => {
    const path = request.url?.split('?', 1)[0];
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { allow: 'GET, HEAD' });
      response.end();
      return;
    }
    if (path === '/healthz') {
      sendJson(request, response, 200, {
        service: 'world-api',
        status: 'ok',
        ready,
        role: 'command-query-boundary',
        authoritativeMutationEnabled: false,
      });
      return;
    }
    if (path === '/readyz') {
      sendJson(request, response, ready ? 200 : 503, {
        service: 'world-api',
        status: ready ? 'ok' : 'not-ready',
        ready,
        role: 'command-query-boundary',
        authoritativeMutationEnabled: false,
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
    ready: () => ready,
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
): Promise<RunningApiRuntime> {
  const lifecycle = createApiServer();
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
  const address = lifecycle.server.address();
  if (address === null || typeof address === 'string') {
    await closeServer(lifecycle.server, config.shutdownGraceMs);
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
      shutdownPromise ??= closeServer(lifecycle.server, config.shutdownGraceMs);
      return shutdownPromise;
    },
  };
}

export async function runApiProcess() {
  const config = readApiRuntimeConfig();
  const runtime = await startApiRuntime(config);
  console.log(
    JSON.stringify({
      event: 'LISTENING',
      service: 'world-api',
      environment: config.environment,
      origin: runtime.origin,
    }),
  );
  let stopping = false;
  const shutdown = async (signal: NodeJS.Signals) => {
    if (stopping) return;
    stopping = true;
    console.log(
      JSON.stringify({ event: 'SHUTDOWN_START', service: 'world-api', signal }),
    );
    await runtime.shutdown();
    console.log(
      JSON.stringify({
        event: 'SHUTDOWN_COMPLETE',
        service: 'world-api',
        signal,
      }),
    );
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
  process.once('SIGINT', () => beginShutdown('SIGINT'));
  process.once('SIGTERM', () => beginShutdown('SIGTERM'));
}
