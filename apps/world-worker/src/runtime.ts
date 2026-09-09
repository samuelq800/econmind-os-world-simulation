import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';

const supportedEnvironments = new Set(['local', 'ci', 'staging', 'production']);
const supportedHosts = new Set(['127.0.0.1', 'localhost', '::1', '0.0.0.0']);

export interface WorkerRuntimeConfig {
  readonly environment: string;
  readonly host: string;
  readonly port: number;
  readonly shutdownGraceMs: number;
}

export interface RunningWorkerRuntime {
  readonly origin: string;
  readonly port: number;
  readonly ready: () => boolean;
  readonly shutdown: () => Promise<void>;
}

function parsePort(value: string | undefined, fallback: number): number {
  const portText = value ?? String(fallback);
  if (!/^\d+$/u.test(portText)) {
    throw new Error(
      'WORLD_WORKER_HEALTH_PORT must be an integer from 1024 to 65535',
    );
  }
  const port = Number(portText);
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65_535) {
    throw new Error(
      'WORLD_WORKER_HEALTH_PORT must be an integer from 1024 to 65535',
    );
  }
  return port;
}

function parseHost(value: string | undefined): string {
  const host = value ?? '127.0.0.1';
  if (!supportedHosts.has(host)) {
    throw new Error('WORLD_WORKER_HEALTH_HOST is not an approved bind host');
  }
  return host;
}

export function readWorkerRuntimeConfig(
  environment: NodeJS.ProcessEnv = process.env,
): WorkerRuntimeConfig {
  const environmentName = environment.ECONMIND_ENV ?? 'local';
  if (!supportedEnvironments.has(environmentName)) {
    throw new Error(`Unsupported ECONMIND_ENV: ${environmentName}`);
  }
  return {
    environment: environmentName,
    host: parseHost(environment.WORLD_WORKER_HEALTH_HOST),
    port: parsePort(environment.WORLD_WORKER_HEALTH_PORT, 4102),
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

function createWorkerServer() {
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
        service: 'world-worker',
        status: 'ok',
        ready,
        role: 'future-authoritative-executor',
        simulationEnabled: false,
      });
      return;
    }
    if (path === '/readyz') {
      sendJson(request, response, ready ? 200 : 503, {
        service: 'world-worker',
        status: ready ? 'ok' : 'not-ready',
        ready,
        role: 'future-authoritative-executor',
        simulationEnabled: false,
      });
      return;
    }
    sendJson(request, response, 404, {
      service: 'world-worker',
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

export async function startWorkerRuntime(
  config: WorkerRuntimeConfig = readWorkerRuntimeConfig(),
): Promise<RunningWorkerRuntime> {
  const lifecycle = createWorkerServer();
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
    throw new Error('world-worker did not acquire a TCP address');
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

export async function runWorkerProcess() {
  const config = readWorkerRuntimeConfig();
  const startupPromise = Promise.resolve().then(() =>
    startWorkerRuntime(config),
  );
  let shutdownPromise: Promise<void> | undefined;
  const shutdown = (signal: NodeJS.Signals) => {
    shutdownPromise ??= (async () => {
      const runtime = await startupPromise;
      console.log(
        JSON.stringify({
          event: 'SHUTDOWN_START',
          service: 'world-worker',
          signal,
        }),
      );
      await runtime.shutdown();
      console.log(
        JSON.stringify({
          event: 'SHUTDOWN_COMPLETE',
          service: 'world-worker',
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
          service: 'world-worker',
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
      service: 'world-worker',
      environment: config.environment,
      origin: runtime.origin,
    }),
  );
}
