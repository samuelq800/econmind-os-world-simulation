import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import {
  createServer,
  request,
  type IncomingHttpHeaders,
  type Server,
} from 'node:http';
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
  readonly closed: Promise<void>;
  readonly isClosed: () => boolean;
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
  readonly started: string;
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
  return observeCommand(
    spawn('pnpm', [script], {
      cwd: repositoryRoot,
      env: { ...process.env, ...environment },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  );
}

function observeCommand(child: ChildProcess): ManagedCommand {
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
  // Observers can be checking output before they await the exit promise.
  void exited.catch(() => undefined);
  let closed = false;
  const drained = new Promise<void>((resolve) => {
    child.once('close', () => {
      closed = true;
      resolve();
    });
  });
  return {
    child,
    exited,
    closed: drained,
    isClosed: () => closed,
    output: () => output,
  };
}

async function drainBefore(managed: ManagedCommand, deadline: number) {
  if (managed.isClosed()) return true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      managed.closed.then(() => true),
      new Promise<false>((resolve) => {
        timer = setTimeout(resolve, Math.max(0, deadline - Date.now()), false);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
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
  captured: ProcessRow[],
  timeoutMs = 30_000,
) {
  const deadline = Date.now() + timeoutMs;
  let drain: 'not-attempted' | 'complete' | 'timed-out' = 'not-attempted';
  try {
    while (Date.now() < deadline) {
      // Observe ownership before READY: failures must not leave captured=[].
      await captureCommand(managed, captured);
      if (pattern.test(managed.output())) return;
      if (
        managed.child.exitCode !== null ||
        managed.child.signalCode !== null
      ) {
        drain = (await drainBefore(managed, deadline))
          ? 'complete'
          : 'timed-out';
        throw new Error('public command exited before expected output');
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('timed out');
  } catch (error) {
    throw new Error(
      `output matching ${String(pattern)}: ${error instanceof Error ? error.message : 'failed'}\n` +
        `child=${JSON.stringify({ pid: managed.child.pid, exitCode: managed.child.exitCode, signalCode: managed.child.signalCode, drain })}\n` +
        `owned=${JSON.stringify(captured)}\noutput:\n${managed.output()}`,
      { cause: error },
    );
  }
}

async function waitForExit(managed: ManagedCommand, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const exit = await Promise.race([
      managed.exited,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('public command did not exit')),
          timeoutMs,
        );
      }),
    ]);
    if (!(await drainBefore(managed, deadline))) {
      throw new Error(
        `public command exited ${JSON.stringify(exit)}; output drain timed out\n${managed.output()}`,
      );
    }
    return exit;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
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
    'pid=,ppid=,stat=,lstart=,command=',
  ]);
  return stdout
    .trim()
    .split('\n')
    .map((line) => {
      const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.{24})\s+(.*)$/u);
      if (!match) return undefined;
      return {
        command: match[5],
        pid: Number(match[1]),
        ppid: Number(match[2]),
        state: match[3],
        started: match[4],
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
  const starts = new Map(captured.map((row) => [row.pid, row.started]));
  return rows.filter(
    (row) => starts.get(row.pid) === row.started && !row.state.startsWith('Z'),
  );
}

async function captureCommand(managed: ManagedCommand, captured: ProcessRow[]) {
  if (
    managed.child.pid === undefined ||
    managed.child.exitCode !== null ||
    managed.child.signalCode !== null
  )
    return;
  const observed = descendants(await readProcessTable(), managed.child.pid);
  for (const row of observed) {
    const index = captured.findIndex((previous) => previous.pid === row.pid);
    if (index < 0) captured.push(row);
    else captured[index] = row;
  }
}

async function cleanupCommand(managed: ManagedCommand, captured: ProcessRow[]) {
  await captureCommand(managed, captured);
  await cleanupCaptured(captured);
}

async function preserveCleanupFailure(
  primary: unknown,
  cleanup: () => Promise<void>,
) {
  try {
    await cleanup();
  } catch (error) {
    if (primary !== undefined) {
      throw new AggregateError(
        [primary, error],
        `original failure: ${primary instanceof Error ? primary.message : String(primary)}; cleanup failure: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
    throw error;
  }
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
  await waitForCapturedExit(captured);
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

// These tests exercise real HTTP and process lifecycle, not the fetch client.
// Node 24.20.0's bundled undici can throw outside the fetch promise while
// applying default socket ToS. Keep the test observer off that path without
// changing the application's fetch, catching uncaught errors, or sharing pools.
async function requestLoopback(
  endpoint: string,
  method: 'GET' | 'POST' | 'HEAD' = 'GET',
  timeoutMs = 1_000,
): Promise<{
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly body: string;
}> {
  const url = new URL(endpoint);
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    url.username !== '' ||
    url.password !== ''
  ) {
    throw new Error(
      'Test HTTP observer requires an uncredentialed loopback URL',
    );
  }
  const client = request(url, { agent: false, method });
  const closed = new Promise<void>((resolve) => client.once('close', resolve));
  const response = new Promise<{
    status: number;
    headers: IncomingHttpHeaders;
    body: string;
  }>((resolve, reject) => {
    client.once('error', reject);
    client.once('response', (incoming) => {
      const chunks: Buffer[] = [];
      let bytes = 0;
      incoming.once('error', reject);
      incoming.once('aborted', () =>
        reject(new Error('Test HTTP response was aborted before completion')),
      );
      incoming.on('data', (chunk: Buffer) => {
        bytes += chunk.byteLength;
        if (bytes > 4_096) {
          const error = new Error('Test HTTP response exceeded 4096 bytes');
          reject(error);
          client.destroy(error);
        } else chunks.push(chunk);
      });
      incoming.once('end', () => {
        if (!incoming.complete) {
          reject(new Error('Test HTTP response was incomplete'));
          return;
        }
        resolve({
          status: incoming.statusCode ?? 0,
          headers: incoming.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });
  });
  const timeout = setTimeout(
    () => client.destroy(new Error('Test HTTP request timed out')),
    timeoutMs,
  );
  client.end();
  try {
    return await response;
  } finally {
    clearTimeout(timeout);
    client.destroy();
    await closed;
  }
}

describe.skipIf(process.platform === 'win32')(
  'V00.3 unified bootstrap public boundary',
  () => {
    it('drains and closes its one-shot HTTP observer and rejects transport failures', async () => {
      const connections = new Set<Socket>();
      let connectionCount = 0;
      const observed: { path: string; method: string; connection: string }[] =
        [];
      const server = createServer((incoming, response) => {
        observed.push({
          path: incoming.url ?? '',
          method: incoming.method ?? '',
          connection: incoming.headers.connection ?? '',
        });
        if (incoming.url === '/redirect') {
          response.writeHead(302, { location: '/escaped' }).end('not followed');
        } else if (incoming.url === '/truncated') {
          response.writeHead(200, { 'content-length': '100' }).end('short');
        } else if (incoming.url === '/stalled') {
          response.writeHead(200).write('partial');
        } else if (incoming.url === '/oversized') {
          response.end('x'.repeat(4_097));
        } else if (incoming.method === 'POST') {
          response.writeHead(405).end('method rejected');
        } else {
          response.writeHead(200, { 'content-type': 'application/json' });
          response.write('{"ready":');
          response.end('true}');
        }
      });
      server.on('connection', (socket) => {
        connectionCount += 1;
        connections.add(socket);
        socket.once('close', () => connections.delete(socket));
      });
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      const address = server.address();
      if (address === null || typeof address === 'string') {
        throw new Error('HTTP observer control did not bind loopback');
      }
      const origin = `http://127.0.0.1:${address.port}`;
      try {
        const complete = await requestLoopback(`${origin}/complete`);
        expect(complete.status).toBe(200);
        expect(complete.headers['content-type']).toBe('application/json');
        expect(complete.body).toBe('{"ready":true}');
        const redirect = await requestLoopback(`${origin}/redirect`);
        expect(redirect.status).toBe(302);
        expect(redirect.headers.location).toBe('/escaped');
        expect(redirect.body).toBe('not followed');
        expect((await requestLoopback(`${origin}/post`, 'POST')).status).toBe(
          405,
        );
        const head = await requestLoopback(`${origin}/head`, 'HEAD');
        expect(head.status).toBe(200);
        expect(head.body).toBe('');
        await expect(requestLoopback(`${origin}/truncated`)).rejects.toThrow(
          /aborted|incomplete/u,
        );
        await expect(
          requestLoopback(`${origin}/stalled`, 'GET', 50),
        ).rejects.toThrow('Test HTTP request timed out');
        await expect(requestLoopback(`${origin}/oversized`)).rejects.toThrow(
          'Test HTTP response exceeded 4096 bytes',
        );
        expect(observed.map(({ path, method }) => [path, method])).toEqual([
          ['/complete', 'GET'],
          ['/redirect', 'GET'],
          ['/post', 'POST'],
          ['/head', 'HEAD'],
          ['/truncated', 'GET'],
          ['/stalled', 'GET'],
          ['/oversized', 'GET'],
        ]);
        expect(observed.every(({ connection }) => connection === 'close')).toBe(
          true,
        );
        expect(connectionCount).toBe(observed.length);
        await waitUntil(
          () => connections.size === 0,
          1_000,
          'observer sockets closed',
        );
        await expect(
          requestLoopback('http://example.invalid/'),
        ).rejects.toThrow('uncredentialed loopback URL');
      } finally {
        await closeServer(server);
      }
      await expect(requestLoopback(`${origin}/closed`)).rejects.toThrow(
        'ECONNREFUSED',
      );
    });

    it(
      'bounds drain after parent exit while an owned child retains the pipe',
      { timeout: 10_000 },
      async () => {
        const managed = observeCommand(
          spawn(
            process.execPath,
            [
              path.join(
                repositoryRoot,
                'docs/reports/start-ready-20261011/C/bootstrap-lifecycle/control-output-pipe.mjs',
              ),
              'held-pipe',
            ],
            {
              cwd: repositoryRoot,
              env: process.env,
              shell: false,
              stdio: ['ignore', 'pipe', 'pipe'],
            },
          ),
        );
        const captured: ProcessRow[] = [];
        let primaryFailure: unknown;
        try {
          await waitForOutput(managed, /CONTROL_CHILD_READY/u, captured);
          await waitUntil(
            () => managed.child.exitCode === 1,
            2_000,
            'control parent exit',
          );
          expect(managed.isClosed()).toBe(false);
          const started = Date.now();
          const failure: unknown = await waitForOutput(
            managed,
            /NEVER_READY/u,
            captured,
            100,
          ).catch((error: unknown) => error);
          expect(Date.now() - started).toBeLessThan(1_500);
          expect(failure).toBeInstanceOf(Error);
          expect((failure as Error).message).toContain(
            'public command exited before expected output',
          );
          expect((failure as Error).message).toContain('"exitCode":1');
          expect((failure as Error).message).toContain('"drain":"timed-out"');
          expect((failure as Error).message).toContain('CONTROL_PARENT_EXIT');
          expect(managed.isClosed()).toBe(false);
        } catch (error) {
          primaryFailure = error;
          throw error;
        } finally {
          await preserveCleanupFailure(primaryFailure, () =>
            cleanupCommand(managed, captured),
          );
        }
        expect(await liveCapturedRows(captured)).toEqual([]);
      },
    );

    it(
      'retains complete stdout/stderr for an ordinary fast exit',
      { timeout: 5_000 },
      async () => {
        const managed = observeCommand(
          spawn(
            process.execPath,
            [
              path.join(
                repositoryRoot,
                'docs/reports/start-ready-20261011/C/bootstrap-lifecycle/control-output-pipe.mjs',
              ),
              'fast-exit',
            ],
            {
              cwd: repositoryRoot,
              env: process.env,
              shell: false,
              stdio: ['ignore', 'pipe', 'pipe'],
            },
          ),
        );
        const captured: ProcessRow[] = [];
        let primaryFailure: unknown;
        try {
          const failure: unknown = await waitForOutput(
            managed,
            /NEVER_READY/u,
            captured,
            1_000,
          ).catch((error: unknown) => error);
          expect(failure).toBeInstanceOf(Error);
          expect((failure as Error).message).toContain('"exitCode":1');
          expect((failure as Error).message).toContain('"drain":"complete"');
          expect((failure as Error).message).toContain('CONTROL_FINAL_STDOUT');
          expect((failure as Error).message).toContain('CONTROL_FINAL_STDERR');
        } catch (error) {
          primaryFailure = error;
          throw error;
        } finally {
          await preserveCleanupFailure(primaryFailure, () =>
            cleanupCommand(managed, captured),
          );
        }
      },
    );

    it.each(['held-pipe', 'fast-exit', 'run-timeout'] as const)(
      'finalizes wrapper evidence independently of close: %s',
      { timeout: 10_000 },
      async (mode) => {
        const label = `pipe-wrapper-${mode}-${process.pid}`;
        const managed = observeCommand(
          spawn(
            process.execPath,
            [
              path.join(
                repositoryRoot,
                'docs/reports/start-ready-20261011/C/bootstrap-lifecycle/run-focused.mjs',
              ),
              label,
              `--control-${mode}`,
            ],
            {
              cwd: repositoryRoot,
              env: process.env,
              shell: false,
              stdio: ['ignore', 'pipe', 'pipe'],
            },
          ),
        );
        const captured: ProcessRow[] = [];
        let primaryFailure: unknown;
        try {
          await waitForOutput(managed, /CONTROL_/u, captured);
          const started = Date.now();
          const exit = await waitForExit(managed, 3_000);
          expect(Date.now() - started).toBeLessThan(2_500);
          expect(exit.code).toBe(1); // The original failure never becomes success.
          const evidence = JSON.parse(
            await readFile(
              path.join(
                repositoryRoot,
                `artifacts/c-bootstrap-lifecycle/${label}.processes.json`,
              ),
              'utf8',
            ),
          ) as {
            exit: { code: number | null; signal: string | null };
            timedOut: boolean;
            drainTimedOut: boolean;
            cleanupTimedOut: boolean;
            closedBeforeFinalization: boolean;
            cleanupSignals: { signal: string }[];
            remainingAfterFallback: unknown[];
            errors: unknown[];
          };
          expect(evidence.timedOut).toBe(mode === 'run-timeout');
          if (mode === 'run-timeout') {
            expect(evidence.exit).toEqual({ code: null, signal: 'SIGKILL' });
          } else expect(evidence.exit.code).toBe(1);
          expect(evidence.cleanupTimedOut).toBe(false);
          expect(evidence.remainingAfterFallback).toEqual([]);
          expect(evidence.errors).toEqual([]);
          expect(evidence.closedBeforeFinalization).toBe(true);
          if (mode === 'held-pipe') {
            expect(evidence.drainTimedOut).toBe(true);
            expect(
              evidence.cleanupSignals.map((entry) => entry.signal),
            ).toEqual(['SIGTERM', 'SIGKILL']);
            expect(managed.output()).toContain('CONTROL_CHILD_TERM_IGNORED');
          } else if (mode === 'run-timeout') {
            expect(evidence.drainTimedOut).toBe(false);
            expect(
              evidence.cleanupSignals.map((entry) => entry.signal),
            ).toEqual(['SIGTERM', 'SIGTERM', 'SIGKILL', 'SIGKILL']);
            expect(managed.output()).toContain('CONTROL_PARENT_TERM_IGNORED');
            expect(managed.output()).toContain('CONTROL_CHILD_TERM_IGNORED');
          } else {
            expect(evidence.drainTimedOut).toBe(false);
            expect(evidence.cleanupSignals).toEqual([]);
            expect(managed.output()).toContain('CONTROL_FINAL_STDOUT');
            expect(managed.output()).toContain('CONTROL_FINAL_STDERR');
          }
        } catch (error) {
          primaryFailure = error;
          throw error;
        } finally {
          await preserveCleanupFailure(primaryFailure, () =>
            cleanupCommand(managed, captured),
          );
        }
        expect(await liveCapturedRows(captured)).toEqual([]);
      },
    );

    it('keeps the original failure together with a cleanup failure', async () => {
      const primary = new Error('original exit 1; output drain timed out');
      const cleanup = new Error('owned cleanup timed out');
      const failure: unknown = await preserveCleanupFailure(
        primary,
        async () => {
          throw cleanup;
        },
      ).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(AggregateError);
      expect((failure as AggregateError).errors).toEqual([primary, cleanup]);
      expect((failure as AggregateError).cause).toBe(cleanup);
      expect((failure as AggregateError).message).toContain(primary.message);
      expect((failure as AggregateError).message).toContain(cleanup.message);
    });

    it(
      'starts all three real runtimes, checks dependency health, and emits READY exactly once',
      { timeout: 50_000 },
      async () => {
        const ports = await freePorts();
        const secret = 'service-role-value-must-not-appear';
        const managed = startStack(ports, {
          TEST_PRIVATE_VALUE: secret,
        });
        const captured: ProcessRow[] = [];
        let primaryFailure: unknown;
        try {
          await waitForOutput(managed, /"event":"BOOTSTRAP_READY"/u, captured);
          expect(runtimeProcess(captured, 'world-web')).toBeDefined();
          expect(runtimeProcess(captured, 'world-api')).toBeDefined();
          expect(runtimeProcess(captured, 'world-worker')).toBeDefined();
          const [web, api, worker, dependency] = await Promise.all([
            requestLoopback(`http://127.0.0.1:${ports.web}/readyz`),
            requestLoopback(`http://127.0.0.1:${ports.api}/readyz`),
            requestLoopback(`http://127.0.0.1:${ports.worker}/readyz`),
            requestLoopback(
              `http://127.0.0.1:${ports.web}/__bootstrap/api-health`,
            ),
          ]);
          expect([
            web.status,
            api.status,
            worker.status,
            dependency.status,
          ]).toEqual([200, 200, 200, 200]);
          expect(JSON.parse(dependency.body)).toEqual({
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
        } catch (error) {
          primaryFailure = error;
          throw error;
        } finally {
          await preserveCleanupFailure(primaryFailure, () =>
            cleanupCommand(managed, captured),
          );
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
        const captured: ProcessRow[] = [];
        let primaryFailure: unknown;
        try {
          await waitUntil(
            async () => {
              const response = await requestLoopback(
                `http://127.0.0.1:${ports.web}/readyz`,
              );
              return response.status === 200;
            },
            10_000,
            'web readiness',
          );
          await captureCommand(web, captured);
          const endpoint = `http://127.0.0.1:${ports.web}/__bootstrap/api-health`;
          const beforeOk = apiHits;
          const ok = await requestLoopback(endpoint);
          expect(ok.status).toBe(200);
          expect(apiHits - beforeOk).toBe(1);
          expect(ok.headers['cache-control']).toBe('no-store');
          expect(ok.headers['access-control-allow-origin']).toBeUndefined();
          expect(JSON.parse(ok.body)).toEqual({
            service: 'world-web',
            dependency: 'world-api',
            status: 'ok',
          });

          behavior = 'error';
          const beforeError = apiHits;
          const unavailable = await requestLoopback(endpoint);
          expect(unavailable.status).toBe(503);
          expect(apiHits - beforeError).toBe(1);
          const unavailableText = unavailable.body;
          expect(unavailableText).toBe(
            '{"service":"world-web","dependency":"world-api","status":"unavailable"}',
          );
          expect(unavailableText).not.toContain('upstream-secret-detail');

          behavior = 'redirect';
          const beforeRedirect = apiHits;
          const redirect = await requestLoopback(endpoint);
          expect(redirect.status).toBe(503);
          expect(apiHits - beforeRedirect).toBe(1);
          expect(redirectHits).toBe(0);
          expect(redirect.body).toBe(unavailableText);

          const beforePost = apiHits;
          expect((await requestLoopback(endpoint, 'POST')).status).toBe(405);
          expect(apiHits).toBe(beforePost);
          const beforeHead = apiHits;
          const head = await requestLoopback(endpoint, 'HEAD');
          expect(head.status).toBe(503);
          expect(head.body).toBe('');
          expect(apiHits - beforeHead).toBe(1);
          expect(redirectHits).toBe(0);
        } catch (error) {
          primaryFailure = error;
          throw error;
        } finally {
          await preserveCleanupFailure(primaryFailure, async () => {
            // Attempt every owned cleanup even if exit/drain or another
            // resource fails; retain all failures instead of swallowing one.
            const results = await Promise.allSettled([
              cleanupCommand(web, captured),
              waitForExit(web),
              closeServer(api),
              closeServer(redirectTarget),
            ]);
            const errors = results.flatMap((result) =>
              result.status === 'rejected' ? [result.reason] : [],
            );
            if (errors.length) {
              throw new AggregateError(
                errors,
                'Web command/resource cleanup failed',
                { cause: errors[0] },
              );
            }
          });
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
      'preserves exit/output and owned-process evidence when READY is never reached',
      { timeout: 35_000 },
      async () => {
        const ports = await freePorts();
        const managed = startStack(ports, {
          ...preloadEnvironment(),
          TEST_BOOTSTRAP_FAIL_SERVICE: 'worker',
        });
        const captured: ProcessRow[] = [];
        let primaryFailure: unknown;
        try {
          const failure: unknown = await waitForOutput(
            managed,
            /"event":"BOOTSTRAP_READY"/u,
            captured,
          ).catch((error: unknown) => error);
          expect(failure).toBeInstanceOf(Error);
          const message = (failure as Error).message;
          expect(message).toContain(
            'public command exited before expected output',
          );
          expect(message).toContain('"exitCode":1');
          expect(message).toContain('"event":"BOOTSTRAP_STOPPED"');
          expect(message).toContain('"failed_service":"world-worker"');
          expect(message).not.toContain('timed out');
          expect(captured.some((row) => row.pid === managed.child.pid)).toBe(
            true,
          );
          expect(eventCount(managed.output(), 'BOOTSTRAP_READY')).toBe(0);
        } catch (error) {
          primaryFailure = error;
          throw error;
        } finally {
          await preserveCleanupFailure(primaryFailure, () =>
            cleanupCommand(managed, captured),
          );
        }
        expect(await liveCapturedRows(captured)).toEqual([]);
        expect(await allPortsReusable(ports)).toBe(true);
      },
    );

    it(
      'cleans observed owned children after a pre-READY output timeout',
      { timeout: 35_000 },
      async () => {
        const ports = await freePorts();
        const managed = startStack(ports, {
          ...preloadEnvironment(),
          TEST_BOOTSTRAP_DELAY_MS: '5000',
          TEST_BOOTSTRAP_DELAY_SERVICE: 'worker',
        });
        const captured: ProcessRow[] = [];
        let primaryFailure: unknown;
        try {
          await waitForOutput(
            managed,
            /"event":"LISTENING","service":"world-web"/u,
            captured,
          );
          const failure: unknown = await waitForOutput(
            managed,
            /"event":"BOOTSTRAP_READY"/u,
            captured,
            100,
          ).catch((error: unknown) => error);
          expect(failure).toBeInstanceOf(Error);
          expect((failure as Error).message).toContain('timed out');
          expect((failure as Error).message).toContain(
            '"event":"BOOTSTRAP_WAITING"',
          );
          expect(runtimeProcess(captured, 'world-web')).toBeDefined();
          expect(eventCount(managed.output(), 'BOOTSTRAP_READY')).toBe(0);
        } catch (error) {
          primaryFailure = error;
          throw error;
        } finally {
          await preserveCleanupFailure(primaryFailure, () =>
            cleanupCommand(managed, captured),
          );
        }
        expect(await liveCapturedRows(captured)).toEqual([]);
        expect(await allPortsReusable(ports)).toBe(true);
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
        const captured: ProcessRow[] = [];
        let primaryFailure: unknown;
        try {
          await waitForOutput(
            managed,
            /"event":"BOOTSTRAP_WAITING"/u,
            captured,
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
        } catch (error) {
          primaryFailure = error;
          throw error;
        } finally {
          await preserveCleanupFailure(primaryFailure, () =>
            cleanupCommand(managed, captured),
          );
        }
      },
    );

    it(
      'tears down the full stack when a child crashes after aggregate readiness',
      { timeout: 35_000 },
      async () => {
        const ports = await freePorts();
        const managed = startStack(ports);
        const captured: ProcessRow[] = [];
        let primaryFailure: unknown;
        try {
          await waitForOutput(managed, /"event":"BOOTSTRAP_READY"/u, captured);
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
        } catch (error) {
          primaryFailure = error;
          throw error;
        } finally {
          await preserveCleanupFailure(primaryFailure, () =>
            cleanupCommand(managed, captured),
          );
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
        const captured: ProcessRow[] = [];
        let primaryFailure: unknown;
        try {
          await waitForOutput(
            managed,
            /"event":"BOOTSTRAP_READY_CANDIDATE"/u,
            captured,
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
        } catch (error) {
          primaryFailure = error;
          throw error;
        } finally {
          await preserveCleanupFailure(primaryFailure, () =>
            cleanupCommand(managed, captured),
          );
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
        const captured: ProcessRow[] = [];
        let socket: Socket | undefined;
        let primaryFailure: unknown;
        try {
          await waitForOutput(managed, /"event":"BOOTSTRAP_READY"/u, captured);
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
        } catch (error) {
          primaryFailure = error;
          throw error;
        } finally {
          await preserveCleanupFailure(primaryFailure, async () => {
            socket?.destroy();
            await cleanupCommand(managed, captured);
          });
        }
      },
    );
  },
);
