import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  readApiRuntimeConfig,
  startApiRuntime,
} from '../../apps/world-api/src/runtime.js';
import {
  readWorkerRuntimeConfig,
  startWorkerRuntime,
} from '../../apps/world-worker/src/runtime.js';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const apiEntry = path.join(repositoryRoot, 'apps/world-api/dist/main.js');
const workerEntry = path.join(repositoryRoot, 'apps/world-worker/dist/main.js');
const webRoot = path.join(repositoryRoot, 'apps/world-web');
const webEntry = path.join(webRoot, 'server.mjs');

interface ManagedChild {
  readonly child: ChildProcess;
  readonly output: () => string;
}

function startNodeEntry(
  entry: string,
  environment: NodeJS.ProcessEnv,
): ManagedChild {
  const child = spawn(process.execPath, ['--enable-source-maps', entry], {
    cwd: repositoryRoot,
    env: { ...process.env, ...environment },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout?.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  return { child, output: () => output };
}

function startWeb(environment: NodeJS.ProcessEnv): ManagedChild {
  const child = spawn(process.execPath, [webEntry], {
    cwd: webRoot,
    env: { ...process.env, ...environment },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout?.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  return { child, output: () => output };
}

function waitForExit(
  child: ChildProcess,
  timeoutMs = 10_000,
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timed out waiting for child process exit'));
    }, timeoutMs);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    });
  });
}

async function stopChild(
  managed: ManagedChild,
  signal: NodeJS.Signals = 'SIGTERM',
) {
  if (managed.child.exitCode === null && managed.child.signalCode === null) {
    managed.child.kill(signal);
  }
  return waitForExit(managed.child);
}

async function waitForHttp(url: string, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (response.ok) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Timed out waiting for ${url}`);
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Failed to reserve a loopback port');
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
  return address.port;
}

async function listenBlocker(port: number): Promise<Server> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return server;
}

async function closeBlocker(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

describe('V00.2 runtime lifecycle skeleton', () => {
  it('fails closed for unsupported environments, hosts, and ports', () => {
    expect(() => readApiRuntimeConfig({ ECONMIND_ENV: 'preview' })).toThrow(
      'Unsupported ECONMIND_ENV',
    );
    expect(() =>
      readApiRuntimeConfig({
        ECONMIND_ENV: 'local',
        WORLD_API_HOST: 'http://127.0.0.1',
      }),
    ).toThrow('approved bind host');
    expect(() =>
      readApiRuntimeConfig({
        ECONMIND_ENV: 'local',
        WORLD_API_PORT: '80',
      }),
    ).toThrow('1024 to 65535');
    expect(() =>
      readWorkerRuntimeConfig({
        ECONMIND_ENV: 'local',
        WORLD_WORKER_HEALTH_PORT: 'not-a-port',
      }),
    ).toThrow('1024 to 65535');
  });

  it('serves real API and worker liveness/readiness without enabling authority', async () => {
    const apiPort = await freePort();
    const workerPort = await freePort();
    const api = await startApiRuntime({
      environment: 'ci',
      host: '127.0.0.1',
      port: apiPort,
      shutdownGraceMs: 1_000,
    });
    const worker = await startWorkerRuntime({
      environment: 'ci',
      host: '127.0.0.1',
      port: workerPort,
      shutdownGraceMs: 1_000,
    });
    try {
      const apiHealth = await fetch(`${api.origin}/healthz`);
      const apiReady = await fetch(`${api.origin}/readyz`);
      const workerHealth = await fetch(`${worker.origin}/healthz`);
      const workerReady = await fetch(`${worker.origin}/readyz`);
      expect(apiHealth.status).toBe(200);
      expect(apiReady.status).toBe(200);
      expect(workerHealth.status).toBe(200);
      expect(workerReady.status).toBe(200);
      await expect(apiHealth.json()).resolves.toMatchObject({
        service: 'world-api',
        ready: true,
        authoritativeMutationEnabled: false,
      });
      await expect(workerHealth.json()).resolves.toMatchObject({
        service: 'world-worker',
        ready: true,
        simulationEnabled: false,
      });
      expect((await fetch(`${api.origin}/missing`)).status).toBe(404);
      expect(
        (await fetch(`${worker.origin}/healthz`, { method: 'POST' })).status,
      ).toBe(405);
    } finally {
      await Promise.all([api.shutdown(), worker.shutdown()]);
    }
    expect(api.ready()).toBe(false);
    expect(worker.ready()).toBe(false);
  });

  it(
    'rejects invalid configuration through the real process entries',
    { timeout: 20_000 },
    async () => {
      const cases = [
        startNodeEntry(apiEntry, {
          ECONMIND_ENV: 'invalid',
          WORLD_API_PORT: '4101',
        }),
        startNodeEntry(apiEntry, {
          ECONMIND_ENV: 'local',
          WORLD_API_PORT: 'invalid',
        }),
        startNodeEntry(workerEntry, {
          ECONMIND_ENV: 'invalid',
          WORLD_WORKER_HEALTH_PORT: '4102',
        }),
        startNodeEntry(workerEntry, {
          ECONMIND_ENV: 'local',
          WORLD_WORKER_HEALTH_PORT: '99999',
        }),
        startWeb({ ECONMIND_ENV: 'invalid', WORLD_WEB_PORT: '4100' }),
        startWeb({ ECONMIND_ENV: 'local', WORLD_WEB_PORT: 'invalid' }),
      ];
      const results = await Promise.all(
        cases.map(async (managed) => ({
          exit: await waitForExit(managed.child),
          output: managed.output(),
        })),
      );
      for (const result of results) {
        expect(result.exit.code).not.toBe(0);
        expect(result.output).toMatch(
          /Unsupported ECONMIND_ENV|must be an integer/u,
        );
      }
    },
  );

  it(
    'rejects occupied ports for all three real listeners',
    { timeout: 20_000 },
    async () => {
      const port = await freePort();
      const blocker = await listenBlocker(port);
      try {
        await expect(
          startApiRuntime({
            environment: 'ci',
            host: '127.0.0.1',
            port,
            shutdownGraceMs: 1_000,
          }),
        ).rejects.toMatchObject({ code: 'EADDRINUSE' });
        await expect(
          startWorkerRuntime({
            environment: 'ci',
            host: '127.0.0.1',
            port,
            shutdownGraceMs: 1_000,
          }),
        ).rejects.toMatchObject({ code: 'EADDRINUSE' });
        const web = startWeb({
          ECONMIND_ENV: 'local',
          WORLD_WEB_PORT: String(port),
        });
        const result = await waitForExit(web.child);
        expect(result.code).not.toBe(0);
        expect(web.output()).toContain('already in use');
      } finally {
        await closeBlocker(blocker);
      }
    },
  );

  it(
    'starts web, API, and worker concurrently and shuts down on process signals',
    { timeout: 30_000 },
    async () => {
      const ports = new Set<number>();
      while (ports.size < 3) ports.add(await freePort());
      const [webPort, apiPort, workerPort] = [...ports];
      if (
        webPort === undefined ||
        apiPort === undefined ||
        workerPort === undefined
      ) {
        throw new Error('Failed to allocate three test ports');
      }
      const web = startWeb({
        ECONMIND_ENV: 'local',
        WORLD_WEB_PORT: String(webPort),
      });
      const api = startNodeEntry(apiEntry, {
        ECONMIND_ENV: 'local',
        WORLD_API_PORT: String(apiPort),
      });
      const worker = startNodeEntry(workerEntry, {
        ECONMIND_ENV: 'local',
        WORLD_WORKER_HEALTH_PORT: String(workerPort),
      });
      try {
        const [webReady, apiReady, workerReady] = await Promise.all([
          waitForHttp(`http://127.0.0.1:${webPort}/readyz`),
          waitForHttp(`http://127.0.0.1:${apiPort}/readyz`),
          waitForHttp(`http://127.0.0.1:${workerPort}/readyz`),
        ]);
        expect(webReady.status).toBe(200);
        expect(apiReady.status).toBe(200);
        expect(workerReady.status).toBe(200);
        await expect(webReady.json()).resolves.toMatchObject({
          service: 'world-web',
          ready: true,
          authoritative: false,
        });
      } finally {
        const [webExit, apiExit, workerExit] = await Promise.all([
          stopChild(web, 'SIGINT'),
          stopChild(api, 'SIGTERM'),
          stopChild(worker, 'SIGINT'),
        ]);
        expect(webExit.code).toBe(0);
        expect(apiExit.code).toBe(0);
        expect(workerExit.code).toBe(0);
        expect(web.output()).toContain('SHUTDOWN_COMPLETE');
        expect(api.output()).toContain('SHUTDOWN_COMPLETE');
        expect(worker.output()).toContain('SHUTDOWN_COMPLETE');
      }
    },
  );

  it(
    'covers the alternate SIGTERM and SIGINT shutdown paths',
    { timeout: 30_000 },
    async () => {
      const ports = new Set<number>();
      while (ports.size < 3) ports.add(await freePort());
      const [webPort, apiPort, workerPort] = [...ports];
      if (
        webPort === undefined ||
        apiPort === undefined ||
        workerPort === undefined
      ) {
        throw new Error('Failed to allocate three test ports');
      }
      const web = startWeb({
        ECONMIND_ENV: 'local',
        WORLD_WEB_PORT: String(webPort),
      });
      const api = startNodeEntry(apiEntry, {
        ECONMIND_ENV: 'local',
        WORLD_API_PORT: String(apiPort),
      });
      const worker = startNodeEntry(workerEntry, {
        ECONMIND_ENV: 'local',
        WORLD_WORKER_HEALTH_PORT: String(workerPort),
      });
      try {
        await Promise.all([
          waitForHttp(`http://127.0.0.1:${webPort}/healthz`),
          waitForHttp(`http://127.0.0.1:${apiPort}/healthz`),
          waitForHttp(`http://127.0.0.1:${workerPort}/healthz`),
        ]);
      } finally {
        const [webExit, apiExit, workerExit] = await Promise.all([
          stopChild(web, 'SIGTERM'),
          stopChild(api, 'SIGINT'),
          stopChild(worker, 'SIGTERM'),
        ]);
        expect(webExit.code).toBe(143);
        expect(apiExit.code).toBe(0);
        expect(workerExit.code).toBe(0);
        expect(api.output()).toContain('SHUTDOWN_COMPLETE');
        expect(worker.output()).toContain('SHUTDOWN_COMPLETE');
      }
      await expect(
        fetch(`http://127.0.0.1:${webPort}/healthz`),
      ).rejects.toThrow();
    },
  );
});
