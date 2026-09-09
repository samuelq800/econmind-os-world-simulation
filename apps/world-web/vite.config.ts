import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin, type PreviewServer } from 'vite';
import type { ViteDevServer } from 'vite';

import { assertSafeViteEnvironment } from '../../scripts/vite-environment-policy.mjs';

const worldWebRoot = fileURLToPath(new URL('.', import.meta.url));
const supportedEnvironments = new Set(['local', 'ci', 'staging', 'production']);
const supportedHosts = new Set(['127.0.0.1', 'localhost', '::1', '0.0.0.0']);
const apiHealthPath = '/readyz';
const bootstrapApiHealthPath = '/__bootstrap/api-health';
const apiHealthTimeoutMs = 1_000;

function runtimePort(
  value: string | undefined,
  fallback: number,
  variableName: string,
): number {
  const portText = value ?? String(fallback);
  if (!/^\d+$/u.test(portText)) {
    throw new Error(`${variableName} must be an integer from 1024 to 65535`);
  }
  const port = Number(portText);
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65_535) {
    throw new Error(`${variableName} must be an integer from 1024 to 65535`);
  }
  return port;
}

function runtimeHost(value: string | undefined, variableName: string): string {
  const host = value ?? '127.0.0.1';
  if (!supportedHosts.has(host)) {
    throw new Error(`${variableName} is not an approved local host`);
  }
  return host;
}

function runtimeEnvironment(value: string | undefined): string {
  const environment = value ?? 'local';
  if (!supportedEnvironments.has(environment)) {
    throw new Error(`Unsupported ECONMIND_ENV: ${environment}`);
  }
  return environment;
}

function connectHost(host: string): string {
  if (host === '0.0.0.0') return '127.0.0.1';
  return host.includes(':') ? `[${host}]` : host;
}

async function readSmallJson(response: Response): Promise<unknown> {
  if (!response.body) return undefined;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.byteLength;
      if (length > 4_096) throw new Error('Dependency response too large');
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  const payload = Buffer.concat(chunks).toString('utf8');
  return JSON.parse(payload) as unknown;
}

function apiReadyResponse(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const body = value as Record<string, unknown>;
  return (
    body.service === 'world-api' &&
    body.status === 'ok' &&
    body.ready === true &&
    body.authoritativeMutationEnabled === false
  );
}

async function probeApiDependency(apiOrigin: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), apiHealthTimeoutMs);
  timeout.unref();
  try {
    const response = await fetch(`${apiOrigin}${apiHealthPath}`, {
      cache: 'no-store',
      credentials: 'omit',
      method: 'GET',
      redirect: 'error',
      signal: controller.signal,
    });
    if (response.status !== 200) return false;
    return apiReadyResponse(await readSmallJson(response));
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function sendBootstrapApiHealth(
  request: IncomingMessage,
  response: ServerResponse,
  available: boolean,
) {
  const payload = JSON.stringify({
    service: 'world-web',
    dependency: 'world-api',
    status: available ? 'ok' : 'unavailable',
  });
  response.writeHead(available ? 200 : 503, {
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(request.method === 'HEAD' ? undefined : payload);
}

function installLifecycleEndpoints(
  server: ViteDevServer | PreviewServer,
  apiOrigin: string,
) {
  let ready = server.httpServer?.listening ?? false;
  server.httpServer?.once('listening', () => {
    ready = true;
  });
  server.httpServer?.once('close', () => {
    ready = false;
  });
  server.middlewares.use((request, response, next) => {
    const path = request.url?.split('?', 1)[0];
    if (
      path !== '/healthz' &&
      path !== '/readyz' &&
      path !== bootstrapApiHealthPath
    ) {
      next();
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { allow: 'GET, HEAD' });
      response.end();
      return;
    }
    if (path === bootstrapApiHealthPath) {
      void probeApiDependency(apiOrigin).then((available) => {
        sendBootstrapApiHealth(request, response, available);
      });
      return;
    }
    const isReady = path === '/healthz' || ready;
    const payload = JSON.stringify({
      service: 'world-web',
      status: isReady ? 'ok' : 'not-ready',
      ready,
      authoritative: false,
    });
    response.writeHead(isReady ? 200 : 503, {
      'cache-control': 'no-store',
      'content-length': Buffer.byteLength(payload),
      'content-type': 'application/json; charset=utf-8',
    });
    response.end(request.method === 'HEAD' ? undefined : payload);
  });
}

function lifecyclePlugin(apiOrigin: string): Plugin {
  return {
    name: 'econmind-runtime-lifecycle',
    configureServer: (server) => installLifecycleEndpoints(server, apiOrigin),
    configurePreviewServer: (server) =>
      installLifecycleEndpoints(server, apiOrigin),
  };
}

export default defineConfig(({ mode }) => {
  runtimeEnvironment(process.env.ECONMIND_ENV);
  assertSafeViteEnvironment(
    loadEnv(mode, worldWebRoot, 'VITE_'),
    `world-web Vite mode ${mode}`,
  );
  const apiHost = runtimeHost(process.env.WORLD_API_HOST, 'WORLD_API_HOST');
  const apiPort = runtimePort(
    process.env.WORLD_API_PORT,
    4101,
    'WORLD_API_PORT',
  );
  const apiOrigin = `http://${connectHost(apiHost)}:${apiPort}`;

  return {
    envDir: worldWebRoot,
    plugins: [react(), lifecyclePlugin(apiOrigin)],
    preview: {
      host: runtimeHost(process.env.WORLD_WEB_HOST, 'WORLD_WEB_HOST'),
      port: runtimePort(process.env.WORLD_WEB_PORT, 4100, 'WORLD_WEB_PORT'),
      strictPort: true,
    },
    root: worldWebRoot,
    server: {
      host: runtimeHost(process.env.WORLD_WEB_HOST, 'WORLD_WEB_HOST'),
      port: runtimePort(process.env.WORLD_WEB_PORT, 4100, 'WORLD_WEB_PORT'),
      strictPort: true,
    },
  };
});
