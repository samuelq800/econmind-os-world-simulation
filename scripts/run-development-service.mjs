import { execFile, spawn } from 'node:child_process';
import { constants as osConstants } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { assertSafeEnvironment } from './environment-policy.mjs';

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const serviceName = process.argv[2];
const mode = process.argv[3] ?? 'dev';
const definitions = {
  api: {
    buildConfig: 'apps/world-api/tsconfig.build.json',
    entry: 'apps/world-api/dist/main.js',
    cwd: repositoryRoot,
  },
  web: {
    entry: 'server.mjs',
    cwd: path.join(repositoryRoot, 'apps/world-web'),
  },
  worker: {
    buildConfig: 'apps/world-worker/tsconfig.build.json',
    entry: 'apps/world-worker/dist/main.js',
    cwd: repositoryRoot,
  },
};
const definition = definitions[serviceName];

if (definition === undefined || !['dev', 'start'].includes(mode)) {
  console.error('Expected one service name: web, api, or worker');
  process.exitCode = 1;
} else {
  assertSafeEnvironment(process.env);
  const originalParentPid = process.ppid;
  let originalParentIsPnpm = process.platform === 'win32';
  let activeChild;
  let stoppingPromise;
  let parentWatch;

  if (!originalParentIsPnpm) {
    try {
      const { stdout } = await execFileAsync('ps', [
        '-p',
        String(originalParentPid),
        '-o',
        'command=',
      ]);
      originalParentIsPnpm =
        /(?:^|[/\\])pnpm(?:\.(?:cjs|mjs))?(?:\s|$)|\(pnpm\)/u.test(
          stdout.trim(),
        );
    } catch {
      originalParentIsPnpm = false;
    }
  }

  function parentStillOwnsLauncher() {
    return originalParentIsPnpm && process.ppid === originalParentPid;
  }

  function resultExitCode(result) {
    if (result.code !== null) return result.code;
    if (result.signal === null) return 1;
    const signalNumber = osConstants.signals[result.signal];
    return typeof signalNumber === 'number' ? 128 + signalNumber : 1;
  }

  function spawnOwned(command, args, cwd) {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      shell: false,
      stdio: 'inherit',
    });
    const exit = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve({ code, signal }));
    });
    activeChild = { child, exit };
    return activeChild;
  }

  async function stopActiveChild(signal) {
    const owned = activeChild;
    if (
      owned === undefined ||
      owned.child.exitCode !== null ||
      owned.child.signalCode !== null
    ) {
      return;
    }
    owned.child.kill(signal);
    let forceTimer;
    try {
      await Promise.race([
        owned.exit,
        new Promise((resolve) => {
          forceTimer = setTimeout(resolve, 7_500, 'force');
        }).then((result) => {
          if (result === 'force') owned.child.kill('SIGKILL');
        }),
      ]);
      if (owned.child.exitCode === null && owned.child.signalCode === null) {
        await owned.exit;
      }
    } finally {
      if (forceTimer !== undefined) clearTimeout(forceTimer);
    }
  }

  function beginShutdown(reason, signal) {
    stoppingPromise ??= (async () => {
      if (parentWatch !== undefined) clearInterval(parentWatch);
      console.log(
        JSON.stringify({
          event: 'PUBLIC_LAUNCHER_SHUTDOWN',
          service: `world-${serviceName}`,
          reason,
          signal,
        }),
      );
      await stopActiveChild(signal);
    })();
    return stoppingPromise;
  }

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      void beginShutdown('signal', signal).catch((error) => {
        console.error(
          JSON.stringify({
            event: 'PUBLIC_LAUNCHER_SHUTDOWN_FAILED',
            service: `world-${serviceName}`,
            error:
              error instanceof Error
                ? error.message
                : 'Unknown launcher shutdown failure',
          }),
        );
        process.exitCode = 1;
      });
    });
  }

  parentWatch = setInterval(() => {
    if (!parentStillOwnsLauncher()) {
      void beginShutdown('parent-exit', 'SIGTERM').catch((error) => {
        console.error(
          JSON.stringify({
            event: 'PUBLIC_LAUNCHER_SHUTDOWN_FAILED',
            service: `world-${serviceName}`,
            error:
              error instanceof Error
                ? error.message
                : 'Unknown launcher shutdown failure',
          }),
        );
        process.exitCode = 1;
      });
    }
  }, 25);

  try {
    if (!parentStillOwnsLauncher()) {
      await beginShutdown('parent-exit', 'SIGTERM');
    } else if (mode === 'dev' && definition.buildConfig !== undefined) {
      const compiler = path.join(
        repositoryRoot,
        'node_modules/typescript/bin/tsc',
      );
      const build = spawnOwned(
        process.execPath,
        [compiler, '-p', definition.buildConfig],
        repositoryRoot,
      );
      const result = await build.exit;
      if (activeChild === build) activeChild = undefined;
      if (stoppingPromise === undefined && result.code !== 0) {
        if (parentWatch !== undefined) clearInterval(parentWatch);
        process.exitCode = resultExitCode(result);
      }
    }

    if (process.exitCode === undefined && stoppingPromise === undefined) {
      const runtime = spawnOwned(
        process.execPath,
        ['--enable-source-maps', definition.entry],
        definition.cwd,
      );
      const result = await runtime.exit;
      if (activeChild === runtime) activeChild = undefined;
      if (stoppingPromise === undefined) {
        if (parentWatch !== undefined) clearInterval(parentWatch);
        process.exitCode = resultExitCode(result);
      }
    }

    if (stoppingPromise !== undefined) await stoppingPromise;
  } catch (error) {
    if (parentWatch !== undefined) clearInterval(parentWatch);
    console.error(
      JSON.stringify({
        event: 'PUBLIC_LAUNCHER_FAILED',
        service: `world-${serviceName}`,
        error:
          error instanceof Error ? error.message : 'Unknown launcher failure',
      }),
    );
    process.exitCode = 1;
  }
}
