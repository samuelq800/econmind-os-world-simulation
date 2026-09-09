import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { createConnection, type Socket } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const serviceControlPreload = pathToFileURL(
  path.join(repositoryRoot, 'tests/fixtures/control-bootstrap-service.mjs'),
).href;

interface StackPorts {
  readonly api: number;
  readonly web: number;
  readonly worker: number;
}

interface ManagedCommand {
  readonly child: ChildProcess;
  readonly exited: Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>;
  readonly output: () => string;
}

interface ProcessRow {
  readonly command: string;
  readonly pid: number;
  readonly ppid: number;
  readonly state: string;
}

function preloadEnvironment(): NodeJS.ProcessEnv {
  const existing = process.env.NODE_OPTIONS?.trim();
  return {
    NODE_OPTIONS: [existing, `--import=${serviceControlPreload}`]
      .filter(Boolean)
      .join(' '),
  };
}

function startCommand(
  script: 'dev' | 'dev:web',
  environment: NodeJS.ProcessEnv,
): ManagedCommand {
  const child = spawn('pnpm', [script], {
    cwd: repositoryRoot,
    env: { ...process.env, ...environment },
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout?.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  const exited = new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  return { child, exited, output: () => output };
}

function stackEnvironment(
  ports: StackPorts,
  overrides: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  return {
    ECONMIND_ENV: 'local',
    WORLD_API_HOST: '127.0.0.1',
    WORLD_API_PORT: String(ports.api),
    WORLD_BOOTSTRAP_CLEANUP_TIMEOUT_MS: '3000',
    WORLD_BOOTSTRAP_POLL_INTERVAL_MS: '25',
    WORLD_BOOTSTRAP_PROBE_TIMEOUT_MS: '250',
    WORLD_BOOTSTRAP_STARTUP_TIMEOUT_MS: '25000',
    WORLD_WEB_HOST: '127.0.0.1',
    WORLD_WEB_PORT: String(ports.web),
    WORLD_WORKER_HEALTH_HOST: '127.0.0.1',
    WORLD_WORKER_HEALTH_PORT: String(ports.worker),
    ...overrides,
  };
}

function startStack(
  ports: StackPorts,
  overrides: NodeJS.ProcessEnv = {},
): ManagedCommand {
  return startCommand('dev', stackEnvironment(ports, overrides));
}

async function waitUntil<T>(
  probe: () => T | Promise<T>,
  timeoutMs: number,
  description: string,
): Promise<NonNullable<T>> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const result = await probe();
      if (result) return result as NonNullable<T>;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(
    `${description}: ${
      lastError instanceof Error ? lastError.message : 'timed out'
    }`,
  );
}

async function waitForOutput(
  managed: ManagedCommand,
  pattern: RegExp,
  timeoutMs = 30_000,
) {
  return waitUntil(
    () => pattern.test(managed.output()),
    timeoutMs,
    `output matching ${String(pattern)}`,
  );
}

async function waitForExit(managed: ManagedCommand, timeoutMs = 20_000) {
  return Promise.race([
    managed.exited,
    new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error('public command did not exit')),
        timeoutMs,
      );
    }),
  ]);
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('failed to allocate a loopback port');
  }
  const port = address.port;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}

async function freePorts(): Promise<StackPorts> {
  const ports = new Set<number>();
  while (ports.size < 3) ports.add(await freePort());
  const [web, api, worker] = [...ports];
  if (web === undefined || api === undefined || worker === undefined) {
    throw new Error('failed to allocate three loopback ports');
  }
  return { api, web, worker };
}

async function canRebind(port: number) {
  const server = createServer();
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', resolve);
    });
    return true;
  } catch {
    return false;
  } finally {
    if (server.listening) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
}

async function allPortsReusable(ports: StackPorts) {
  return (
    (await canRebind(ports.web)) &&
    (await canRebind(ports.api)) &&
    (await canRebind(ports.worker))
  );
}

async function readProcessTable(): Promise<ProcessRow[]> {
  const { stdout } = await execFileAsync('ps', [
    '-axo',
    'pid=,ppid=,stat=,command=',
  ]);
  return stdout
    .trim()
    .split('\n')
    .map((line) => {
      const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/u);
      if (!match) return undefined;
      return {
        command: match[4],
        pid: Number(match[1]),
        ppid: Number(match[2]),
        state: match[3],
      } satisfies ProcessRow;
    })
    .filter((row): row is ProcessRow => row !== undefined);
}

function descendants(rows: readonly ProcessRow[], rootPid: number) {
  const owned = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (owned.has(row.ppid) && !owned.has(row.pid)) {
        owned.add(row.pid);
        changed = true;
      }
    }
  }
  return rows.filter((row) => owned.has(row.pid));
}

async function liveCapturedRows(captured: readonly ProcessRow[]) {
  const rows = await readProcessTable();
  const pids = new Set(captured.map((row) => row.pid));
  return rows.filter((row) => pids.has(row.pid) && !row.state.startsWith('Z'));
}

async function waitForCapturedExit(captured: readonly ProcessRow[]) {
  await waitUntil(
    async () => (await liveCapturedRows(captured)).length === 0,
    10_000,
    'captured process-tree cleanup',
  );
}

async function cleanupCaptured(captured: readonly ProcessRow[]) {
  let live = await liveCapturedRows(captured);
  for (const row of [...live].reverse()) {
    try {
      process.kill(row.pid, 'SIGTERM');
    } catch {
      // The test-owned process exited between observation and cleanup.
    }
  }
  try {
    await waitForCapturedExit(captured);
    return;
  } catch {
    live = await liveCapturedRows(captured);
  }
  for (const row of [...live].reverse()) {
    try {
      process.kill(row.pid, 'SIGKILL');
    } catch {
      // The test-owned process exited between observation and cleanup.
    }
  }
}

function eventCount(output: string, event: string) {
  const pattern = new RegExp(`"event":"${event}"`, 'gu');
  return output.match(pattern)?.length ?? 0;
}

function runtimeProcess(captured: readonly ProcessRow[], service: string) {
  const patterns: Record<string, RegExp> = {
    'world-api': /apps\/world-api\/dist\/main\.js/u,
    'world-web': /(?:apps\/world-web\/)?server\.mjs/u,
    'world-worker': /apps\/world-worker\/dist\/main\.js/u,
  };
  return captured.find((row) => patterns[service]?.test(row.command));
}

async function holdIncompleteRequest(port: number): Promise<Socket> {
  const socket = createConnection({ host: '127.0.0.1', port });
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('error', reject);
  });
  socket.write(`GET /healthz HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n`);
  return socket;
}

async function closeServer(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

describe.skipIf(process.platform === 'win32')(
  'V00.3 unified bootstrap public boundary',
  () => {
    it(
      'starts all three real runtimes, checks dependency health, and emits READY exactly once',
      { timeout: 50_000 },
      async () => {
        const ports = await freePorts();
        const secret = 'service-role-value-must-not-appear';
        const managed = startStack(ports, {
          TEST_PRIVATE_VALUE: secret,
        });
        let captured: ProcessRow[] = [];
        try {
          await waitForOutput(managed, /"event":"BOOTSTRAP_READY"/u);
          captured = descendants(
            await readProcessTable(),
            managed.child.pid ?? -1,
          );
          expect(runtimeProcess(captured, 'world-web')).toBeDefined();
          expect(runtimeProcess(captured, 'world-api')).toBeDefined();
          expect(runtimeProcess(captured, 'world-worker')).toBeDefined();
          const [web, api, worker, dependency] = await Promise.all([
            fetch(`http://127.0.0.1:${ports.web}/readyz`),
            fetch(`http://127.0.0.1:${ports.api}/readyz`),
            fetch(`http://127.0.0.1:${ports.worker}/readyz`),
            fetch(`http://127.0.0.1:${ports.web}/__bootstrap/api-health`),
          ]);
          expect([
            web.status,
            api.status,
            worker.status,
            dependency.status,
          ]).toEqual([200, 200, 200, 200]);
          await expect(dependency.json()).resolves.toEqual({
            dependency: 'world-api',
            service: 'world-web',
            status: 'ok',
          });
          expect(eventCount(managed.output(), 'BOOTSTRAP_READY')).toBe(1);
          expect(managed.output()).not.toContain(secret);

          managed.child.kill('SIGTERM');
          await waitForExit(managed);
          await waitForCapturedExit(captured);
          expect(await allPortsReusable(ports)).toBe(true);
          expect(managed.output()).toContain('"event":"BOOTSTRAP_STOPPED"');
          expect(managed.output()).toContain('"outcome":"SUCCESS"');
        } finally {
          await cleanupCaptured(captured);
        }
      },
    );

    it(
      'keeps the Web dependency endpoint one-shot, uncached, redirect-safe, and sanitized',
      { timeout: 30_000 },
      async () => {
        const ports = await freePorts();
        let behavior: 'ok' | 'error' | 'redirect' = 'ok';
        let apiHits = 0;
        let redirectHits = 0;
        const redirectTarget = createServer((_request, response) => {
          redirectHits += 1;
          response.writeHead(200).end('escaped');
        });
        await new Promise<void>((resolve, reject) => {
          redirectTarget.once('error', reject);
          redirectTarget.listen(ports.worker, '127.0.0.1', resolve);
        });
        const api = createServer((_request, response) => {
          apiHits += 1;
          if (behavior === 'redirect') {
            response
              .writeHead(302, {
                location: `http://127.0.0.1:${ports.worker}/escaped`,
              })
              .end();
            return;
          }
          const body =
            behavior === 'ok'
              ? JSON.stringify({
                  authoritativeMutationEnabled: false,
                  ready: true,
                  service: 'world-api',
                  status: 'ok',
                })
              : JSON.stringify({
                  error: 'upstream-secret-detail',
                  service: 'world-api',
                  status: 'failed',
                });
          response
            .writeHead(behavior === 'ok' ? 200 : 500, {
              'content-type': 'application/json',
            })
            .end(body);
        });
        await new Promise<void>((resolve, reject) => {
          api.once('error', reject);
          api.listen(ports.api, '127.0.0.1', resolve);
        });
        const web = startCommand('dev:web', {
          ECONMIND_ENV: 'local',
          WORLD_API_HOST: '127.0.0.1',
          WORLD_API_PORT: String(ports.api),
          WORLD_WEB_HOST: '127.0.0.1',
          WORLD_WEB_PORT: String(ports.web),
        });
        let captured: ProcessRow[] = [];
        try {
          await waitUntil(
            async () => {
              const response = await fetch(
                `http://127.0.0.1:${ports.web}/readyz`,
              );
              return response.ok;
            },
            10_000,
            'web readiness',
          );
          captured = descendants(await readProcessTable(), web.child.pid ?? -1);
          const endpoint = `http://127.0.0.1:${ports.web}/__bootstrap/api-health`;
          const beforeOk = apiHits;
          const ok = await fetch(endpoint);
          expect(ok.status).toBe(200);
          expect(apiHits - beforeOk).toBe(1);
          expect(ok.headers.get('cache-control')).toBe('no-store');
          expect(ok.headers.get('access-control-allow-origin')).toBeNull();

          behavior = 'error';
          const unavailable = await fetch(endpoint);
          expect(unavailable.status).toBe(503);
          const unavailableText = await unavailable.text();
          expect(unavailableText).toBe(
            '{"service":"world-web","dependency":"world-api","status":"unavailable"}',
          );
          expect(unavailableText).not.toContain('upstream-secret-detail');

          behavior = 'redirect';
          const beforeRedirect = apiHits;
          const redirect = await fetch(endpoint);
          expect(redirect.status).toBe(503);
          expect(apiHits - beforeRedirect).toBe(1);
          expect(redirectHits).toBe(0);

          expect((await fetch(endpoint, { method: 'POST' })).status).toBe(405);
          expect((await fetch(endpoint, { method: 'HEAD' })).status).toBe(503);
        } finally {
          web.child.kill('SIGTERM');
          await waitForExit(web).catch(() => undefined);
          await cleanupCaptured(captured);
          await Promise.all([closeServer(api), closeServer(redirectTarget)]);
        }
      },
    );

    it.each(['web', 'api', 'worker'] as const)(
      'fails closed when the %s public launcher exits during startup',
      { timeout: 30_000 },
      async (service) => {
        const ports = await freePorts();
        const managed = startStack(ports, {
          ...preloadEnvironment(),
          TEST_BOOTSTRAP_FAIL_SERVICE: service,
        });
        const exit = await waitForExit(managed);
        expect(exit.code).not.toBe(0);
        expect(eventCount(managed.output(), 'BOOTSTRAP_READY')).toBe(0);
        expect(managed.output()).toContain('"outcome":"FAILED"');
        expect(managed.output()).toContain(
          `"failed_service":"world-${service}"`,
        );
        await waitUntil(
          () => allPortsReusable(ports),
          10_000,
          'partial-start ports reusable',
        );
      },
    );

    it(
      'rejects invalid URL-like, path, port, and shell-injection configuration before spawn',
      { timeout: 30_000 },
      async () => {
        const ports = await freePorts();
        const marker = path.join(os.tmpdir(), `econmind-shell-${process.pid}`);
        const cases: NodeJS.ProcessEnv[] = [
          { ECONMIND_ENV: 'unsupported' },
          { WORLD_API_HOST: 'http://127.0.0.1' },
          { WORLD_API_HOST: '127.0.0.1/readyz?next=http://escape' },
          { WORLD_API_PORT: `${ports.api}/readyz` },
          { WORLD_API_PORT: `${ports.api};touch ${marker}` },
          { WORLD_API_PORT: String(ports.web) },
        ];
        for (const environment of cases) {
          const managed = startStack(ports, environment);
          const exit = await waitForExit(managed);
          expect(exit.code).not.toBe(0);
          expect(eventCount(managed.output(), 'BOOTSTRAP_READY')).toBe(0);
          expect(managed.output()).toContain('"outcome":"FAILED"');
        }
        await expect(access(marker)).rejects.toThrow();
        const coordinatorSource = await readFile(
          path.join(repositoryRoot, 'scripts/run-development-stack.mjs'),
          'utf8',
        );
        expect(coordinatorSource).toContain('shell: false');
        expect(coordinatorSource).not.toMatch(/shell\s*:\s*true/u);
        expect(await allPortsReusable(ports)).toBe(true);
      },
    );

    it(
      'fails closed for an occupied port and a bounded readiness timeout',
      { timeout: 35_000 },
      async () => {
        const occupiedPorts = await freePorts();
        const blocker = createServer();
        await new Promise<void>((resolve, reject) => {
          blocker.once('error', reject);
          blocker.listen(occupiedPorts.api, '127.0.0.1', resolve);
        });
        try {
          const occupied = startStack(occupiedPorts);
          const occupiedExit = await waitForExit(occupied);
          expect(occupiedExit.code).not.toBe(0);
          expect(eventCount(occupied.output(), 'BOOTSTRAP_READY')).toBe(0);
          expect(occupied.output()).toContain('"outcome":"FAILED"');
        } finally {
          await closeServer(blocker);
        }
        await waitUntil(
          () => allPortsReusable(occupiedPorts),
          10_000,
          'occupied-case ports reusable',
        );

        const timeoutPorts = await freePorts();
        const timedOut = startStack(timeoutPorts, {
          ...preloadEnvironment(),
          TEST_BOOTSTRAP_DELAY_MS: '5000',
          TEST_BOOTSTRAP_DELAY_SERVICE: 'worker',
          WORLD_BOOTSTRAP_STARTUP_TIMEOUT_MS: '300',
        });
        const timeoutExit = await waitForExit(timedOut);
        expect(timeoutExit.code).not.toBe(0);
        expect(eventCount(timedOut.output(), 'BOOTSTRAP_READY')).toBe(0);
        expect(timedOut.output()).toContain('readiness-timeout');
        await waitUntil(
          () => allPortsReusable(timeoutPorts),
          10_000,
          'timeout-case ports reusable',
        );
      },
    );

    it.each(['SIGINT', 'SIGTERM'] as const)(
      'cancels startup and survives repeated %s cleanup signals',
      { timeout: 30_000 },
      async (signal) => {
        const ports = await freePorts();
        const managed = startStack(ports, {
          ...preloadEnvironment(),
          TEST_BOOTSTRAP_DELAY_MS: '5000',
          TEST_BOOTSTRAP_DELAY_SERVICE: 'worker',
        });
        let captured: ProcessRow[] = [];
        try {
          await waitForOutput(managed, /"event":"BOOTSTRAP_WAITING"/u);
          captured = descendants(
            await readProcessTable(),
            managed.child.pid ?? -1,
          );
          const coordinator = captured.find((row) =>
            row.command.includes('scripts/run-development-stack.mjs'),
          );
          expect(coordinator).toBeDefined();
          managed.child.kill(signal);
          if (coordinator) {
            process.kill(coordinator.pid, signal);
            process.kill(coordinator.pid, signal);
          }
          await waitForExit(managed);
          await waitForCapturedExit(captured);
          expect(eventCount(managed.output(), 'BOOTSTRAP_READY')).toBe(0);
          expect(managed.output()).toContain('"event":"BOOTSTRAP_STOPPED"');
          expect(managed.output()).toContain('"outcome":"CANCELLED"');
          expect(await allPortsReusable(ports)).toBe(true);
        } finally {
          await cleanupCaptured(captured);
        }
      },
    );

    it(
      'tears down the full stack when a child crashes after aggregate readiness',
      { timeout: 35_000 },
      async () => {
        const ports = await freePorts();
        const managed = startStack(ports);
        let captured: ProcessRow[] = [];
        try {
          await waitForOutput(managed, /"event":"BOOTSTRAP_READY"/u);
          captured = descendants(
            await readProcessTable(),
            managed.child.pid ?? -1,
          );
          const worker = runtimeProcess(captured, 'world-worker');
          if (!worker) throw new Error('worker runtime was not found');
          process.kill(worker.pid, 'SIGKILL');
          const exit = await waitForExit(managed);
          expect(exit.code).not.toBe(0);
          await waitForCapturedExit(captured);
          expect(eventCount(managed.output(), 'BOOTSTRAP_READY')).toBe(1);
          expect(managed.output()).toContain('"outcome":"FAILED"');
          expect(managed.output()).toContain('"failed_service":"world-worker"');
          expect(await allPortsReusable(ports)).toBe(true);
        } finally {
          await cleanupCaptured(captured);
        }
      },
    );

    it(
      'rejects the API-ready-then-exit TOCTOU window before READY commitment',
      { timeout: 35_000 },
      async () => {
        const ports = await freePorts();
        const managed = startStack(ports, {
          WORLD_BOOTSTRAP_COMMIT_DELAY_MS: '500',
        });
        let captured: ProcessRow[] = [];
        try {
          await waitForOutput(managed, /"event":"BOOTSTRAP_READY_CANDIDATE"/u);
          captured = descendants(
            await readProcessTable(),
            managed.child.pid ?? -1,
          );
          const api = runtimeProcess(captured, 'world-api');
          if (!api) throw new Error('API runtime was not found');
          process.kill(api.pid, 'SIGKILL');
          const exit = await waitForExit(managed);
          expect(exit.code).not.toBe(0);
          await waitForCapturedExit(captured);
          expect(eventCount(managed.output(), 'BOOTSTRAP_READY')).toBe(0);
          expect(managed.output()).toContain('"outcome":"FAILED"');
          expect(await allPortsReusable(ports)).toBe(true);
        } finally {
          await cleanupCaptured(captured);
        }
      },
    );

    it(
      'preserves cleanup-timeout failure truth after forced owned-process cleanup',
      { timeout: 35_000 },
      async () => {
        const ports = await freePorts();
        const managed = startStack(ports, {
          WORLD_BOOTSTRAP_CLEANUP_TIMEOUT_MS: '100',
        });
        let captured: ProcessRow[] = [];
        let socket: Socket | undefined;
        try {
          await waitForOutput(managed, /"event":"BOOTSTRAP_READY"/u);
          captured = descendants(
            await readProcessTable(),
            managed.child.pid ?? -1,
          );
          const coordinator = captured.find((row) =>
            row.command.includes('scripts/run-development-stack.mjs'),
          );
          if (!coordinator)
            throw new Error('bootstrap coordinator was not found');
          socket = await holdIncompleteRequest(ports.api);
          process.kill(coordinator.pid, 'SIGTERM');
          const exit = await waitForExit(managed);
          expect(exit.code).not.toBe(0);
          socket.destroy();
          socket = undefined;
          await waitForCapturedExit(captured);
          expect(managed.output()).toContain('"phase":"STOPPED"');
          expect(managed.output()).toContain('"outcome":"FAILED"');
          expect(managed.output()).toContain(
            '"failure_reason":"cleanup-timeout"',
          );
          expect(managed.output()).toContain('"cleanup_forced":true');
          expect(await allPortsReusable(ports)).toBe(true);
        } finally {
          socket?.destroy();
          await cleanupCaptured(captured);
        }
      },
    );
  },
);
