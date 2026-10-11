import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Evidence wrapper only: no service implementation or readiness substitute.
const root = process.cwd();
const label = process.argv[2];
if (!label || !/^[a-z0-9-]+$/u.test(label)) throw new Error('label required');
const control = process.argv[3];
const isControl = [
  '--control-held-pipe',
  '--control-fast-exit',
  '--control-run-timeout',
].includes(control);
const runTimeoutMs = isControl ? 1_000 : 150_000;
const drainGraceMs = isControl ? 200 : 2_000;
const termGraceMs = isControl ? 200 : 2_000;
const killGraceMs = 250; // Preserve the original wrapper's post-KILL allowance.
const directory = path.join(root, 'artifacts/c-bootstrap-lifecycle');
mkdirSync(directory, { recursive: true });
const log = path.join(directory, `${label}.log`);
writeFileSync(log, '', { flag: 'wx' }); // Never overwrite a previous failure.
const controlFile = fileURLToPath(
  new URL('./control-output-pipe.mjs', import.meta.url),
);
const child = spawn(
  isControl ? process.execPath : 'pnpm',
  isControl
    ? [controlFile, control.slice('--control-'.length)]
    : [
        'exec',
        'vitest',
        'run',
        'tests/foundation/bootstrap-lifecycle.test.ts',
        '--reporter=verbose',
        ...process.argv.slice(3),
      ],
  {
    cwd: root,
    env: process.env,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
const owned = new Map();
const errors = [];
const cleanupSignals = [];
let closed = false;
let exit;
const exited = new Promise((resolve) => {
  child.once('exit', (code, signal) => {
    exit = { code, signal };
    resolve(exit);
  });
  child.once('error', (error) => {
    errors.push({ stage: 'spawn', message: error.message });
    resolve(undefined);
  });
});
const drained = new Promise((resolve) =>
  child.once('close', () => {
    closed = true;
    resolve(true);
  }),
);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function within(promise, ms) {
  let timer;
  try {
    return await Promise.race([
      promise.then(() => true),
      new Promise((resolve) => {
        timer = setTimeout(resolve, ms, false);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
function rows() {
  return execFileSync('ps', ['-axo', 'pid=,ppid=,stat=,lstart=,command='], {
    encoding: 'utf8',
    timeout: 1_000,
  })
    .trim()
    .split('\n')
    .flatMap((line) => {
      const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.{24})\s+(.*)$/u);
      return match
        ? [
            {
              pid: Number(match[1]),
              ppid: Number(match[2]),
              state: match[3],
              started: match[4],
              command: match[5],
            },
          ]
        : [];
    });
}
function capture() {
  const snapshot = rows();
  // Continue observing known live descendants after the original parent exits.
  const pids = new Set(
    snapshot
      .filter((row) => owned.get(row.pid)?.started === row.started)
      .map((row) => row.pid),
  );
  if (
    child.exitCode === null &&
    child.signalCode === null &&
    child.pid !== undefined
  )
    pids.add(child.pid);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of snapshot) {
      if (pids.has(row.ppid) && !pids.has(row.pid)) {
        pids.add(row.pid);
        changed = true;
      }
    }
  }
  for (const row of snapshot) if (pids.has(row.pid)) owned.set(row.pid, row);
}
function live() {
  return rows().filter(
    (row) =>
      owned.get(row.pid)?.started === row.started && !row.state.startsWith('Z'),
  );
}
function signalOwned(signal) {
  for (const row of live().reverse()) {
    try {
      process.kill(row.pid, signal);
      cleanupSignals.push({ pid: row.pid, signal });
    } catch (error) {
      if (error.code !== 'ESRCH')
        errors.push({ stage: signal, pid: row.pid, message: error.message });
    }
  }
}
async function waitOwned(ms) {
  const deadline = Date.now() + ms;
  while (live().length && Date.now() < deadline) await sleep(25);
  return live();
}
for (const stream of [child.stdout, child.stderr])
  stream.on('data', (chunk) => {
    appendFileSync(log, chunk);
    process.stdout.write(chunk);
  });
let tracker;
let timedOut = false;
let drainTimedOut = false;
let cleanupTimedOut = false;
let remainingBeforeFallback = [];
let remainingAfterFallback = [];
try {
  capture();
  tracker = setInterval(() => {
    try {
      capture();
    } catch (error) {
      errors.push({ stage: 'capture', message: error.message });
    }
  }, 100);
  timedOut = !(await within(exited, runTimeoutMs));
  // A deadline immediately reaches cleanup; it never waits for close first.
  if (!timedOut) drainTimedOut = !(await within(drained, drainGraceMs));
  capture();
  remainingBeforeFallback = live();
  if (timedOut || drainTimedOut || remainingBeforeFallback.length) {
    signalOwned('SIGTERM');
    if ((await waitOwned(termGraceMs)).length) {
      signalOwned('SIGKILL');
      remainingAfterFallback = await waitOwned(killGraceMs);
    } else remainingAfterFallback = live();
    cleanupTimedOut = remainingAfterFallback.length > 0;
  }
  if (!closed)
    drainTimedOut = !(await within(drained, drainGraceMs)) || drainTimedOut;
} catch (error) {
  errors.push({ stage: 'observation-or-cleanup', message: error.message });
} finally {
  clearInterval(tracker);
  const evidence = {
    label,
    exit: exit ?? null,
    timedOut,
    drainTimedOut,
    cleanupTimedOut,
    closedBeforeFinalization: closed,
    errors,
    cleanupSignals,
    observed: [...owned.values()],
    remainingBeforeFallback,
    remainingAfterFallback,
  };
  writeFileSync(
    path.join(directory, `${label}.processes.json`),
    JSON.stringify(evidence, null, 2) + '\n',
    { flag: 'wx' },
  );
  // Do not kill unknown pipe holders. Detach local reads after recording the
  // failure, so an unobserved inherited pipe cannot keep this wrapper alive.
  if (!closed) {
    child.stdout.destroy();
    child.stderr.destroy();
  }
  // A failed cleanup must not leave the wrapper waiting on a child handle.
  child.unref();
  console.log(
    JSON.stringify({
      label,
      exit: evidence.exit,
      timedOut,
      drainTimedOut,
      cleanupTimedOut,
      errors,
      cleanupSignals,
      remaining: remainingAfterFallback.length,
    }),
  );
  process.exitCode =
    exit?.code === 0 &&
    !timedOut &&
    !drainTimedOut &&
    !cleanupTimedOut &&
    errors.length === 0 &&
    remainingBeforeFallback.length === 0
      ? 0
      : 1;
}
