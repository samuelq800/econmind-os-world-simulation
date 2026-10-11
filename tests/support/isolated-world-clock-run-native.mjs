// Owned disposable PostgreSQL only. --development records a non-frozen run;
// final execution refuses a dirty candidate. No ambient DB/PG URL is forwarded.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
const wt = realpathSync(path.resolve(import.meta.dirname, '../..'));
const temp =
  '/private/var/folders/lc/qw6zqhv13kgbygqw1g4c4l5r0000gn/T/codex-security-artifacts-7aacef883068f0bc8b331535ac4b5f49998298b03c1e4226fee7f61f9a9ce36c';
const node =
  '/Users/samuel/.npm/_npx/92e92e656f04b72c/node_modules/node/bin/node';
const bin = '/opt/homebrew/opt/postgresql@16/bin';
const base = 'e652485b4c76aba4a04b211889076341e551f9a5';
const development = process.argv.slice(2).join(' ') === '--development';
if (process.argv.length > 2 && !development)
  throw Error('UNKNOWN_RUNNER_ARGUMENT');
if (process.version !== 'v24.20.0') throw Error('PINNED_NODE_REQUIRED');
const uid = process.getuid();
const env = {
  PATH: path.dirname(node) + ':/usr/bin:/bin',
  LANG: 'C',
  LC_ALL: 'C',
  TZ: 'UTC',
  TMPDIR: temp,
};
const digest = (b) => createHash('sha256').update(b).digest('hex');
const git = (...args) =>
  execFileSync('/usr/bin/git', ['--no-replace-objects', ...args], {
    cwd: wt,
    env,
    encoding: 'utf8',
  }).trim();
const files = [
  'apps/world-worker/src/time/durable-world-clock.ts',
  'apps/world-worker/src/time/clock-contracts.ts',
  'database/proposals/isolated-world-clock.sql',
  'tests/support/isolated-world-clock-fixture.ts',
  'tests/support/isolated-world-clock-native-fixture.ts',
  'tests/support/isolated-world-clock-tsconfig.json',
  'tests/support/isolated-world-clock-run-native.mjs',
  'tests/world-core/durable-world-clock.test.ts',
  'tests/world-core/durable-world-clock-postgres.test.ts',
];
git('merge-base', '--is-ancestor', base, 'HEAD');
if (!development && git('status', '--porcelain') !== '')
  throw Error('FINAL_CANDIDATE_NOT_CLEAN');
const subject = {
  base,
  head: git('rev-parse', 'HEAD'),
  tree: git('rev-parse', 'HEAD^{tree}'),
  mode: development ? 'DEVELOPMENT_NOT_FROZEN' : 'FIXED_CLEAN_CANDIDATE',
  fileSha256: Object.fromEntries(
    files.map((f) => [f, digest(readFileSync(path.join(wt, f)))]),
  ),
  coreDistSha256: digest(
    readFileSync(
      path.join(wt, 'packages/core/dist/time/simulation-scheduler.js'),
    ),
  ),
};
const versions = {};
for (const tool of ['initdb', 'pg_ctl', 'createdb', 'postgres']) {
  const executable = path.join(bin, tool),
    st = lstatSync(executable);
  if (!st.isFile() || (st.mode & 0o022) !== 0)
    throw Error('UNTRUSTED_LOCAL_TEST_BINARY');
  const version = execFileSync(executable, ['--version'], {
    env,
    encoding: 'utf8',
  }).trim();
  if (!version.includes('(PostgreSQL) 16.15')) throw Error('PG16_15_REQUIRED');
  versions[tool] = {
    version,
    sha256: digest(readFileSync(executable)),
    uid: st.uid,
  };
}
const root = realpathSync(mkdtempSync(path.join(temp, 'clock-native-')));
chmodSync(root, 0o700);
const data = path.join(root, 'data'),
  socket = path.join(root, 'socket');
mkdirSync(data, { mode: 0o700 });
mkdirSync(socket, { mode: 0o700 });
const aliasRoot = realpathSync(mkdtempSync('/private/tmp/clock-'));
chmodSync(aliasRoot, 0o700);
const socketAlias = path.join(aliasRoot, 's');
symlinkSync(socket, socketAlias);
const markerPath = path.join(root, 'marker.json');
const marker = {
  schema: 'ISOLATED_CLOCK_NATIVE_1',
  uid,
  data,
  socket,
  socketAlias,
  database: 'econmind_isolated_clock_test',
  port: 5432,
  bootstrap: 'a_clock_test_bootstrap',
  versions,
};
writeFileSync(markerPath, JSON.stringify(marker, null, 2) + '\n', {
  flag: 'wx',
  mode: 0o600,
});
const runs = [];
function pg(tool, args) {
  const r = spawnSync(path.join(bin, tool), args, {
    env,
    encoding: 'utf8',
    timeout: 35000,
  });
  const output = (r.stdout ?? '') + (r.stderr ?? '');
  const log = path.join(root, `${runs.length}-${tool}.log`);
  writeFileSync(log, output, { flag: 'wx', mode: 0o600 });
  runs.push({
    tool,
    args,
    status: r.status,
    signal: r.signal,
    error: r.error?.message ?? null,
    log,
    sha256: digest(output),
  });
  if (r.error || r.status !== 0)
    throw Error('OWNED_PG_FAILED:' + tool + ':' + output);
}
let failure = null,
  stop = 'NOT_RUNNING',
  native = null;
function stopOwnedServer() {
  const m = JSON.parse(readFileSync(markerPath, 'utf8'));
  if (
    m.uid !== uid ||
    m.data !== data ||
    realpathSync(data) !== data ||
    lstatSync(data).uid !== uid ||
    (lstatSync(data).mode & 0o777) !== 0o700 ||
    realpathSync(socketAlias) !== socket
  )
    throw Error('CLEANUP_IDENTITY_INVALID');
  const pidPath = path.join(data, 'postmaster.pid');
  if (existsSync(pidPath)) {
    const st = lstatSync(pidPath),
      lines = readFileSync(pidPath, 'utf8').split('\n');
    if (
      !st.isFile() ||
      st.uid !== uid ||
      !/^\d+$/u.test(lines[0]) ||
      lines[1] !== data ||
      lines[3] !== '5432'
    )
      throw Error('CLEANUP_PID_INVALID');
    pg('pg_ctl', ['-D', data, '-m', 'fast', '-w', '-t', '30', 'stop']);
    stop = 'STOPPED';
  }
}
try {
  pg('initdb', [
    '-D',
    data,
    '-U',
    marker.bootstrap,
    '--encoding=UTF8',
    '--no-locale',
    '--auth-local=trust',
    '--auth-host=reject',
  ]);
  pg('pg_ctl', [
    '-D',
    data,
    '-l',
    path.join(root, 'server.log'),
    '-w',
    '-t',
    '30',
    '-o',
    "-c listen_addresses='' -c port=5432 -c unix_socket_directories=" +
      socketAlias,
    'start',
  ]);
  pg('createdb', [
    '--host=' + socketAlias,
    '--port=5432',
    '--username=' + marker.bootstrap,
    '--maintenance-db=postgres',
    '--no-password',
    marker.database,
  ]);
  const json = path.join(root, 'native-results.json');
  const r = spawnSync(
    node,
    [
      path.join(wt, 'node_modules/vitest/vitest.mjs'),
      'run',
      'tests/world-core/durable-world-clock-postgres.test.ts',
      '--reporter=default',
      '--reporter=json',
      '--outputFile.json=' + json,
    ],
    {
      cwd: wt,
      env: { ...env, ISOLATED_CLOCK_NATIVE_MARKER: markerPath },
      encoding: 'utf8',
      timeout: 60000,
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  const output = (r.stdout ?? '') + (r.stderr ?? '');
  writeFileSync(path.join(root, 'native.log'), output, {
    flag: 'wx',
    mode: 0o600,
  });
  process.stdout.write(output);
  if (existsSync(json)) native = JSON.parse(readFileSync(json, 'utf8'));
  if (
    r.error ||
    r.status !== 0 ||
    !native?.success ||
    native.numPassedTests !== 13 ||
    native.numPendingTests !== 0 ||
    native.numFailedTests !== 0 ||
    native.numTotalTests !== 13
  )
    throw Error('NATIVE_THIRTEEN_NOT_ALL_PASS');
} catch (error) {
  failure = String(error);
  process.exitCode = 1;
} finally {
  try {
    stopOwnedServer();
  } catch (error) {
    stop = 'FAILED';
    failure = (failure ?? '') + ';' + String(error);
    process.exitCode = 1;
  }
}
if (
  git('rev-parse', 'HEAD') !== subject.head ||
  git('rev-parse', 'HEAD^{tree}') !== subject.tree ||
  files.some(
    (f) => digest(readFileSync(path.join(wt, f))) !== subject.fileSha256[f],
  )
) {
  failure = (failure ?? '') + ';CANDIDATE_CHANGED';
  process.exitCode = 1;
}
const evidence = {
  subject,
  root,
  markerPath,
  versions,
  runs,
  stop,
  failure,
  nativeCounts: native
    ? {
        success: native.success,
        passed: native.numPassedTests,
        failed: native.numFailedTests,
        pending: native.numPendingTests,
        total: native.numTotalTests,
      }
    : null,
  realSourceAuthority: 'NOT_ESTABLISHED_DEFAULT_DENY',
  realPublisherNonBypass: 'NOT_PROVEN',
  testWriterRawKCapability: true,
  productionAccess: false,
  retainedOwnedData: true,
  noDirectoryDeletion: true,
};
writeFileSync(
  path.join(root, 'runner-evidence.json'),
  JSON.stringify(evidence, null, 2) + '\n',
  { flag: 'wx', mode: 0o600 },
);
process.stdout.write(JSON.stringify(evidence, null, 2) + '\n');
if (stop !== 'STOPPED') process.exitCode = 1;
