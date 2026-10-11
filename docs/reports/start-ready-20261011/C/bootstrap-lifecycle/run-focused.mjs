import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Evidence wrapper only: no service implementation or readiness substitute.
const root = process.cwd();
const label = process.argv[2];
if (!label || !/^[a-z0-9-]+$/u.test(label)) throw new Error('label required');
const directory = path.join(root, 'artifacts/c-bootstrap-lifecycle');
mkdirSync(directory, { recursive: true });
const log = path.join(directory, `${label}.log`);
writeFileSync(log, '');
const child = spawn(
  'pnpm',
  [
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
function rows() {
  return execFileSync('ps', ['-axo', 'pid=,ppid=,stat=,lstart=,command='], {
    encoding: 'utf8',
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
  const pids = new Set([child.pid]);
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
  return rows().filter((row) => {
    const observed = owned.get(row.pid);
    return (
      observed &&
      observed.started === row.started &&
      observed.command === row.command &&
      !row.state.startsWith('Z')
    );
  });
}
function signalOwned(signal) {
  for (const row of live().reverse()) {
    try {
      process.kill(row.pid, signal);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
}
for (const stream of [child.stdout, child.stderr])
  stream.on('data', (chunk) => {
    appendFileSync(log, chunk);
    process.stdout.write(chunk);
  });
capture();
const tracker = setInterval(capture, 100);
let timedOut = false;
const deadline = setTimeout(() => {
  timedOut = true;
  signalOwned('SIGTERM');
}, 150_000);
const exit = await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('close', (code, signal) => resolve({ code, signal }));
});
clearTimeout(deadline);
clearInterval(tracker);
const remainingBeforeFallback = live();
if (remainingBeforeFallback.length) {
  signalOwned('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 2_000));
  signalOwned('SIGKILL');
  await new Promise((resolve) => setTimeout(resolve, 250));
}
const remainingAfterFallback = live();
const evidence = {
  label,
  exit,
  timedOut,
  observed: [...owned.values()],
  remainingBeforeFallback,
  remainingAfterFallback,
};
writeFileSync(
  path.join(directory, `${label}.processes.json`),
  JSON.stringify(evidence, null, 2) + '\n',
);
console.log(
  JSON.stringify({
    label,
    exit,
    timedOut,
    observed: owned.size,
    fallbackCleanup: remainingBeforeFallback.length,
    remaining: remainingAfterFallback.length,
  }),
);
process.exitCode =
  exit.code === 0 && !timedOut && remainingBeforeFallback.length === 0 ? 0 : 1;
