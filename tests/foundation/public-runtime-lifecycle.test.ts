import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:http';
import { createConnection, type Socket } from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { probePublicRuntimeEndpoint } from '../support/public-runtime-http-probe.js';

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
const delayedClosePreload = pathToFileURL(
  path.join(repositoryRoot, 'tests/fixtures/delay-http-close-callback.mjs'),
).href;

interface ServiceDefinition {
  readonly command: 'dev:web' | 'dev:api' | 'dev:worker';
  readonly environmentPort: string;
  readonly runtimePattern: RegExp;
}

interface ManagedPublicCommand {
  readonly child: ChildProcess;
  /** Spawned detached leader: this PID also owns the POSIX session. */
  readonly ownedRootPid: number | undefined;
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
  readonly session: string;
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
  return startManagedCommand('pnpm', [service.command], {
    ...process.env,
    ECONMIND_ENV: 'local',
    [service.environmentPort]: String(port),
    ...environment,
  });
}

function startManagedCommand(
  command: string,
  args: readonly string[],
  environment: NodeJS.ProcessEnv,
): ManagedPublicCommand {
  const child = spawn(command, [...args], {
    cwd: repositoryRoot,
    detached: process.platform !== 'win32',
    env: environment,
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
  return { child, ownedRootPid: child.pid, exited, output: () => output };
}

function signalOwnedGroup(
  managed: ManagedPublicCommand,
  signal: NodeJS.Signals,
) {
  const pid = managed.child.pid;
  if (pid === undefined) throw new Error('owned pnpm fixture has no PID');
  process.kill(process.platform === 'win32' ? pid : -pid, signal);
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
    () => probePublicRuntimeEndpoint(port, '/readyz'),
    15_000,
    `readiness on port ${port}`,
  );
}

async function endpointIsReachable(port: number) {
  try {
    return await probePublicRuntimeEndpoint(port, '/healthz');
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
  return parseProcessTable(stdout);
}

/** Darwin ps prints sess as a KPTR (%lx), while Linux prints a numeric SID.
 * Retain the opaque token only for captured identity comparisons.
 * Apple adv_cmds 6bed8737a34d ps/keyword.c:182, print.c:1135-1139. */
function parseProcessTable(stdout: string): ProcessRow[] {
  return stdout
    .trim()
    .split('\n')
    .map((line) => {
      const match = line.match(
        /^\s*(\d+)\s+(\d+)\s+(\d+)\s+((?:0x)?[0-9a-fA-F]+)\s+(\S+)\s+(.*)$/u,
      );
      if (match === null) return undefined;
      return {
        pid: Number(match[1]),
        ppid: Number(match[2]),
        pgid: Number(match[3]),
        session: match[4]!,
        state: match[5]!,
        command: match[6]!,
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
  return rows.filter(
    (row) =>
      !row.state.startsWith('Z') &&
      captured.some(
        (owned) =>
          row.pid === owned.pid &&
          row.pgid === owned.pgid &&
          row.session === owned.session,
      ),
  );
}

/** Only the actually spawned detached process group is eligible for fresh
 * discovery. A shared/zero Darwin session token is never a group selector. */
function ownedCleanupRows(
  rows: readonly ProcessRow[],
  rootPid: number,
  parentPid: number,
  captured: readonly ProcessRow[] = [],
): ProcessRow[] {
  const root = rows.find((row) => row.pid === rootPid);
  if (root && (root.pgid !== rootPid || root.ppid !== parentPid))
    throw new Error(
      'Owned public root process-group/parent identity changed; refusing cleanup',
    );
  const fresh = rows.filter(
    (row) => row.pgid === rootPid && (!root || row.session === root.session),
  );
  const descendantsNow = root ? descendants(rows, rootPid) : [];
  return [
    ...new Map(
      [...captured, ...fresh, ...descendantsNow].map((row) => [row.pid, row]),
    ).values(),
  ];
}

/** Readiness can fail before descendants are captured, or after the detached
 * leader exits. Its recorded PGID retains only its own reparented descendants;
 * previously captured PID/PGID/opaque-session tuples remain rechecked. */
async function cleanupManagedCommand(
  managed: ManagedPublicCommand,
  captured: readonly ProcessRow[] = [],
) {
  const pid = managed.ownedRootPid;
  if (pid === undefined) return;
  await cleanupCapturedProcesses(
    ownedCleanupRows(await readProcessTable(), pid, process.pid, captured),
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
  await waitUntil(
    async () => (await liveCapturedRows(captured)).length === 0,
    1_000,
    'forced owned test cleanup',
  );
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
    signalOwnedGroup(managed, signal);
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
      await cleanupManagedCommand(managed, captured);
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
  const managed = startPublicCommand(
    service,
    port,
    preloadEnvironment(delayedClosePreload),
  );
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
    await cleanupManagedCommand(managed, captured);
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
    signalOwnedGroup(managed, 'SIGTERM');
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
    await cleanupManagedCommand(managed, captured);
  }
}

async function failedBuildAttack(service: ServiceDefinition) {
  const port = await freePort();
  const managed = startPublicCommand(
    service,
    port,
    preloadEnvironment(failedBuildPreload),
  );
  try {
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
  } finally {
    await cleanupManagedCommand(managed);
  }
}

async function unexpectedRuntimeSignalAttack() {
  const service = services[0]!;
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
    await cleanupManagedCommand(managed, captured);
  }
}

describe('owned process identity portability', () => {
  it('retains Linux SID and Darwin hexadecimal/zero sess tokens without numeric conversion', () => {
    const rows = parseProcessTable(
      '101 99 101 101 Ss linux-root\n' +
        '201 99 201 ffffff801234abcd Ss darwin-root\n' +
        '202 201 201 0 S darwin-child\n',
    );
    expect(rows.map((row) => row.session)).toEqual([
      '101',
      'ffffff801234abcd',
      '0',
    ]);
  });

  it('never treats shared Darwin session zero as ownership of another detached group', () => {
    const rows = parseProcessTable(
      '101 99 101 0 Ss owned-root\n' +
        '102 101 101 0 S owned-child\n' +
        '201 99 201 0 Ss unrelated-root\n' +
        '202 201 201 0 S unrelated-child\n',
    );
    expect(ownedCleanupRows(rows, 101, 99).map((row) => row.pid)).toEqual([
      101, 102,
    ]);
  });

  it('retains the owned group after the leader exits without collecting unrelated session peers', () => {
    const rows = parseProcessTable(
      '102 1 101 ffffff801234abcd S reparented-owned-child\n' +
        '201 99 201 ffffff801234abcd Ss unrelated-root\n',
    );
    expect(ownedCleanupRows(rows, 101, 99).map((row) => row.pid)).toEqual([
      102,
    ]);
  });

  it('refuses a live root whose parent or process group no longer matches the spawned identity', () => {
    for (const line of [
      '101 100 101 0 Ss wrong-parent',
      '101 99 201 0 Ss wrong-group',
    ]) {
      expect(() => ownedCleanupRows(parseProcessTable(line), 101, 99)).toThrow(
        'identity changed',
      );
    }
  });
});

describe.skipIf(process.platform === 'win32')(
  'owned early-readiness failure cleanup',
  () => {
    it('cleans its root and descendant before any ready capture while preserving an unrelated owned fixture', async () => {
      const own = startManagedCommand(
        process.execPath,
        [
          '-e',
          "const {spawn}=require('node:child_process'); const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'}); process.stdout.write('CHILD:'+child.pid+'\\n'); setInterval(()=>{},1000);",
        ],
        process.env,
      );
      const unrelated = startManagedCommand(
        process.execPath,
        [
          '-e',
          "process.stdout.write('CONTROL_READY\\n');setInterval(()=>{},1000);",
        ],
        process.env,
      );
      let expected: ProcessRow[] = [];
      try {
        await waitUntil(
          () =>
            own.output().includes('CHILD:') &&
            unrelated.output().includes('CONTROL_READY'),
          2_000,
          'owned Node fixtures',
        );
        expected = descendants(await readProcessTable(), own.ownedRootPid!);
        expect(expected.length).toBeGreaterThanOrEqual(2);
        // The actual attack helpers have not yet assigned captured when readiness
        // rejects. Preserve that exact empty-capture failure state in this test.
        await expect(
          (async () => {
            try {
              throw new Error('SIMULATED_READINESS_FAILURE');
            } finally {
              await cleanupManagedCommand(own, []);
            }
          })(),
        ).rejects.toThrow('SIMULATED_READINESS_FAILURE');
        expect(await liveCapturedRows(expected)).toEqual([]);
        expect(
          (await readProcessTable()).some(
            (row) =>
              row.pid === unrelated.ownedRootPid && !row.state.startsWith('Z'),
          ),
        ).toBe(true);
      } finally {
        await cleanupManagedCommand(own, expected);
        await cleanupManagedCommand(unrelated);
        await Promise.all([own.exited, unrelated.exited]);
      }
    });
  },
);

describe.skipIf(process.platform === 'win32')(
  'V00.2 public runtime lifecycle boundary',
  () => {
    it.each(
      services.flatMap((service) =>
        (['SIGINT', 'SIGTERM'] as const).map((signal) => ({
          service,
          command: service.command,
          signal,
        })),
      ),
    )(
      'stops every descendant and releases the listener for $command $signal',
      { timeout: 30_000 },
      async ({ service, signal }) => {
        const observed = await publicBoundaryAttack(service, signal);
        expect(observed.captured.length).toBeGreaterThanOrEqual(3);
        // pnpm can translate SIGINT to the conventional 128 + signal exit code.
        // The descendant and listener assertions below still prove shutdown.
        const acceptedExits =
          signal === 'SIGINT'
            ? [
                { code: null, signal: 'SIGINT' },
                { code: 130, signal: null },
              ]
            : [{ code: null, signal }];
        expect(acceptedExits).toContainEqual(observed.launcherExit);
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
          ).map((signals) => ({
            service,
            command: service.command,
            signals,
            signalLabel: signals.join(' then '),
          })),
        ),
    )(
      'keeps $command shutdown idempotent for $signalLabel',
      { timeout: 30_000 },
      async ({ service, signals }) => {
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
