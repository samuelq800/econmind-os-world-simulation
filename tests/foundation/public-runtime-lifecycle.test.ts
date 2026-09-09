import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:http';
import { createConnection, type Socket } from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const delayedLauncherPreload = pathToFileURL(
  path.join(repositoryRoot, 'tests/fixtures/delay-development-launcher.mjs'),
).href;
const failedBuildPreload = pathToFileURL(
  path.join(repositoryRoot, 'tests/fixtures/fail-typescript-build.mjs'),
).href;

interface ServiceDefinition {
  readonly command: 'dev:web' | 'dev:api' | 'dev:worker';
  readonly environmentPort: string;
  readonly runtimePattern: RegExp;
}

interface ManagedPublicCommand {
  readonly child: ChildProcess;
  readonly exited: Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>;
  readonly output: () => string;
}

interface ProcessRow {
  readonly command: string;
  readonly pgid: number;
  readonly pid: number;
  readonly ppid: number;
  readonly session: number;
  readonly state: string;
}

const services: readonly ServiceDefinition[] = [
  {
    command: 'dev:web',
    environmentPort: 'WORLD_WEB_PORT',
    runtimePattern: /server\.mjs$/u,
  },
  {
    command: 'dev:api',
    environmentPort: 'WORLD_API_PORT',
    runtimePattern: /apps\/world-api\/dist\/main\.js$/u,
  },
  {
    command: 'dev:worker',
    environmentPort: 'WORLD_WORKER_HEALTH_PORT',
    runtimePattern: /apps\/world-worker\/dist\/main\.js$/u,
  },
];

function startPublicCommand(
  service: ServiceDefinition,
  port: number,
  environment: NodeJS.ProcessEnv = {},
): ManagedPublicCommand {
  const child = spawn('pnpm', [service.command], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      ECONMIND_ENV: 'local',
      [service.environmentPort]: String(port),
      ...environment,
    },
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

function preloadEnvironment(preload: string): NodeJS.ProcessEnv {
  const existing = process.env.NODE_OPTIONS?.trim();
  return {
    NODE_OPTIONS: [existing, `--import=${preload}`].filter(Boolean).join(' '),
  };
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

async function waitForHttp(port: number) {
  return waitUntil(
    async () => {
      const response = await fetch(`http://127.0.0.1:${port}/readyz`, {
        cache: 'no-store',
      });
      return response.ok ? response : undefined;
    },
    15_000,
    `readiness on port ${port}`,
  );
}

async function endpointIsReachable(port: number) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/healthz`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(250),
    });
    return response.ok;
  } catch {
    return false;
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
    throw new Error('Failed to reserve a loopback port');
  }
  const port = address.port;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
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

async function readProcessTable(): Promise<ProcessRow[]> {
  const { stdout } = await execFileAsync('ps', [
    '-axo',
    'pid=,ppid=,pgid=,sess=,stat=,command=',
  ]);
  return stdout
    .trim()
    .split('\n')
    .map((line) => {
      const match = line.match(
        /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/u,
      );
      if (match === null) return undefined;
      return {
        pid: Number(match[1]),
        ppid: Number(match[2]),
        pgid: Number(match[3]),
        session: Number(match[4]),
        state: match[5],
        command: match[6],
      } satisfies ProcessRow;
    })
    .filter((row): row is ProcessRow => row !== undefined);
}

function descendants(rows: readonly ProcessRow[], rootPid: number) {
  const ownedPids = new Set([rootPid]);
  let foundChild = true;
  while (foundChild) {
    foundChild = false;
    for (const row of rows) {
      if (ownedPids.has(row.ppid) && !ownedPids.has(row.pid)) {
        ownedPids.add(row.pid);
        foundChild = true;
      }
    }
  }
  return rows.filter((row) => ownedPids.has(row.pid));
}

async function liveCapturedRows(captured: readonly ProcessRow[]) {
  const rows = await readProcessTable();
  const capturedPids = new Set(captured.map((row) => row.pid));
  return rows.filter(
    (row) => capturedPids.has(row.pid) && !row.state.startsWith('Z'),
  );
}

async function cleanupCapturedProcesses(captured: readonly ProcessRow[]) {
  let live = await liveCapturedRows(captured);
  for (const row of [...live].reverse()) {
    try {
      process.kill(row.pid, 'SIGTERM');
    } catch {
      // The process exited between observation and cleanup.
    }
  }
  try {
    await waitUntil(
      async () => (await liveCapturedRows(captured)).length === 0,
      1_000,
      'graceful test cleanup',
    );
    return;
  } catch {
    live = await liveCapturedRows(captured);
  }
  for (const row of [...live].reverse()) {
    try {
      process.kill(row.pid, 'SIGKILL');
    } catch {
      // The process exited between observation and cleanup.
    }
  }
}

async function publicBoundaryAttack(
  service: ServiceDefinition,
  signal: NodeJS.Signals,
) {
  const port = await freePort();
  const managed = startPublicCommand(service, port);
  let captured: ProcessRow[] = [];
  let observed;
  try {
    await waitForHttp(port);
    captured = descendants(await readProcessTable(), managed.child.pid ?? -1);
    managed.child.kill(signal);
    const launcherExit = await Promise.race([
      managed.exited,
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error('Public launcher did not terminate')),
          10_000,
        );
      }),
    ]);
    let survivors: ProcessRow[] = [];
    try {
      await waitUntil(
        async () => {
          survivors = await liveCapturedRows(captured);
          return survivors.length === 0;
        },
        10_000,
        'owned descendant termination',
      );
    } catch {
      survivors = await liveCapturedRows(captured);
    }
    let endpointClosed = false;
    try {
      await waitUntil(
        async () => {
          endpointClosed = !(await endpointIsReachable(port));
          return endpointClosed;
        },
        2_000,
        'HTTP endpoint closure',
      );
    } catch {
      endpointClosed = false;
    }
    observed = {
      captured,
      endpointClosed,
      launcherExit,
      output: managed.output(),
      rebound: await canRebind(port),
      survivors,
    };
  } finally {
    if (observed === undefined || observed.survivors.length > 0) {
      await cleanupCapturedProcesses(captured);
    }
  }
  return observed;
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

async function repeatedSignalAttack(
  service: ServiceDefinition,
  signals: readonly [NodeJS.Signals, NodeJS.Signals],
) {
  const port = await freePort();
  const managed = startPublicCommand(service, port);
  let captured: ProcessRow[] = [];
  let socket: Socket | undefined;
  try {
    await waitForHttp(port);
    captured = descendants(await readProcessTable(), managed.child.pid ?? -1);
    const runtime = captured.find((row) =>
      service.runtimePattern.test(row.command),
    );
    if (runtime === undefined) throw new Error('Runtime process was not found');
    socket = await holdIncompleteRequest(port);
    process.kill(runtime.pid, signals[0]);
    await waitUntil(
      () => managed.output().includes('SHUTDOWN_START'),
      2_000,
      'shutdown start',
    );
    process.kill(runtime.pid, signals[1]);
    const survivedRepeat = await Promise.race([
      managed.exited.then(() => false),
      new Promise<true>((resolve) => setTimeout(resolve, 150, true)),
    ]);
    socket.end();
    socket = undefined;
    const launcherExit = await managed.exited;
    await waitUntil(
      async () => (await liveCapturedRows(captured)).length === 0,
      10_000,
      'repeated-signal descendant termination',
    );
    const output = managed.output();
    return {
      completeCount: output.match(/"event":"SHUTDOWN_COMPLETE"/gu)?.length ?? 0,
      failed: /SHUTDOWN_FAILED|unhandled rejection/iu.test(output),
      launcherExit,
      rebound: await canRebind(port),
      startCount: output.match(/"event":"SHUTDOWN_START"/gu)?.length ?? 0,
      survivedRepeat,
    };
  } finally {
    socket?.destroy();
    await cleanupCapturedProcesses(captured);
  }
}

async function startupWindowAttack(service: ServiceDefinition) {
  const port = await freePort();
  const managed = startPublicCommand(
    service,
    port,
    preloadEnvironment(delayedLauncherPreload),
  );
  let captured: ProcessRow[] = [];
  try {
    await waitUntil(
      async () => {
        captured = descendants(
          await readProcessTable(),
          managed.child.pid ?? -1,
        );
        return captured.some((row) =>
          row.command.includes('scripts/run-development-service.mjs'),
        );
      },
      5_000,
      'delayed launcher creation',
    );
    managed.child.kill('SIGTERM');
    const launcherExit = await managed.exited;
    await waitUntil(
      async () => (await liveCapturedRows(captured)).length === 0,
      5_000,
      'startup-window descendant termination',
    );
    return {
      endpointReachable: await endpointIsReachable(port),
      launcherExit,
      output: managed.output(),
      rebound: await canRebind(port),
      survivors: await liveCapturedRows(captured),
    };
  } finally {
    await cleanupCapturedProcesses(captured);
  }
}

async function failedBuildAttack(service: ServiceDefinition) {
  const port = await freePort();
  const managed = startPublicCommand(
    service,
    port,
    preloadEnvironment(failedBuildPreload),
  );
  const exit = await Promise.race([
    managed.exited,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Failed build did not exit')), 5_000);
    }),
  ]);
  return {
    endpointReachable: await endpointIsReachable(port),
    exit,
    rebound: await canRebind(port),
  };
}

async function unexpectedRuntimeSignalAttack() {
  const service = services[0];
  const port = await freePort();
  const managed = startPublicCommand(service, port);
  let captured: ProcessRow[] = [];
  try {
    await waitForHttp(port);
    captured = descendants(await readProcessTable(), managed.child.pid ?? -1);
    const runtime = captured.find((row) =>
      service.runtimePattern.test(row.command),
    );
    if (runtime === undefined) throw new Error('Runtime process was not found');
    process.kill(runtime.pid, 'SIGKILL');
    const exit = await managed.exited;
    await waitUntil(
      async () => (await liveCapturedRows(captured)).length === 0,
      5_000,
      'unexpected-signal descendant termination',
    );
    return { exit, rebound: await canRebind(port) };
  } finally {
    await cleanupCapturedProcesses(captured);
  }
}

describe.skipIf(process.platform === 'win32')(
  'V00.2 public runtime lifecycle boundary',
  () => {
    it.each(
      services.flatMap((service) =>
        (['SIGINT', 'SIGTERM'] as const).map((signal) => [service, signal]),
      ),
    )(
      'stops every descendant and releases the listener for $0.command $1',
      { timeout: 30_000 },
      async (service, signal) => {
        const observed = await publicBoundaryAttack(service, signal);
        expect(observed.captured.length).toBeGreaterThanOrEqual(3);
        expect(observed.launcherExit).toEqual({ code: null, signal });
        expect(observed.survivors).toEqual([]);
        expect(observed.endpointClosed).toBe(true);
        expect(observed.rebound).toBe(true);
        expect(observed.output).toContain('SHUTDOWN_COMPLETE');
      },
    );

    it.each(
      services
        .filter((service) => service.command !== 'dev:web')
        .flatMap((service) =>
          (
            [
              ['SIGINT', 'SIGINT'],
              ['SIGTERM', 'SIGTERM'],
              ['SIGINT', 'SIGTERM'],
              ['SIGTERM', 'SIGINT'],
            ] as const
          ).map((signals) => [service, signals] as const),
        ),
    )(
      'keeps $0.command shutdown idempotent for $1',
      { timeout: 30_000 },
      async (service, signals) => {
        const observed = await repeatedSignalAttack(service, signals);
        expect(observed.survivedRepeat).toBe(true);
        expect(observed.launcherExit).toEqual({ code: 0, signal: null });
        expect(observed.startCount).toBe(1);
        expect(observed.completeCount).toBe(1);
        expect(observed.failed).toBe(false);
        expect(observed.rebound).toBe(true);
      },
    );

    it.each(services)(
      'does not escape if $command loses pnpm before launcher initialization',
      { timeout: 15_000 },
      async (service) => {
        const observed = await startupWindowAttack(service);
        expect(observed.launcherExit).toEqual({
          code: null,
          signal: 'SIGTERM',
        });
        expect(observed.survivors).toEqual([]);
        expect(observed.endpointReachable).toBe(false);
        expect(observed.rebound).toBe(true);
        expect(observed.output).not.toContain('LISTENING');
      },
    );

    it.each(services.filter((service) => service.command !== 'dev:web'))(
      'exits promptly when the $command compiler fails',
      { timeout: 10_000 },
      async (service) => {
        const observed = await failedBuildAttack(service);
        expect(observed.exit).toEqual({ code: 2, signal: null });
        expect(observed.endpointReachable).toBe(false);
        expect(observed.rebound).toBe(true);
      },
    );

    it('preserves an unexpected runtime signal exit code', async () => {
      const observed = await unexpectedRuntimeSignalAttack();
      expect(observed.exit).toEqual({ code: 137, signal: null });
      expect(observed.rebound).toBe(true);
    });
  },
);
