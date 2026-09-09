import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin, type PreviewServer } from 'vite';
import type { ViteDevServer } from 'vite';

import { assertSafeViteEnvironment } from '../../scripts/vite-environment-policy.mjs';

const worldWebRoot = fileURLToPath(new URL('.', import.meta.url));
const supportedEnvironments = new Set(['local', 'ci', 'staging', 'production']);
const supportedHosts = new Set(['127.0.0.1', 'localhost', '::1', '0.0.0.0']);

function runtimePort(value: string | undefined): number {
  const portText = value ?? '4100';
  if (!/^\d+$/u.test(portText)) {
    throw new Error('WORLD_WEB_PORT must be an integer from 1024 to 65535');
  }
  const port = Number(portText);
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65_535) {
    throw new Error('WORLD_WEB_PORT must be an integer from 1024 to 65535');
  }
  return port;
}

function runtimeHost(value: string | undefined): string {
  const host = value ?? '127.0.0.1';
  if (!supportedHosts.has(host)) {
    throw new Error('WORLD_WEB_HOST is not an approved bind host');
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

function installLifecycleEndpoints(server: ViteDevServer | PreviewServer) {
  let ready = server.httpServer?.listening ?? false;
  server.httpServer?.once('listening', () => {
    ready = true;
  });
  server.httpServer?.once('close', () => {
    ready = false;
  });
  server.middlewares.use((request, response, next) => {
    const path = request.url?.split('?', 1)[0];
    if (path !== '/healthz' && path !== '/readyz') {
      next();
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { allow: 'GET, HEAD' });
      response.end();
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

function lifecyclePlugin(): Plugin {
  return {
    name: 'econmind-runtime-lifecycle',
    configureServer: installLifecycleEndpoints,
    configurePreviewServer: installLifecycleEndpoints,
  };
}

export default defineConfig(({ mode }) => {
  runtimeEnvironment(process.env.ECONMIND_ENV);
  assertSafeViteEnvironment(
    loadEnv(mode, worldWebRoot, 'VITE_'),
    `world-web Vite mode ${mode}`,
  );

  return {
    envDir: worldWebRoot,
    plugins: [react(), lifecyclePlugin()],
    preview: {
      host: runtimeHost(process.env.WORLD_WEB_HOST),
      port: runtimePort(process.env.WORLD_WEB_PORT),
      strictPort: true,
    },
    root: worldWebRoot,
    server: {
      host: runtimeHost(process.env.WORLD_WEB_HOST),
      port: runtimePort(process.env.WORLD_WEB_PORT),
      strictPort: true,
    },
  };
});
