// CI-only owned cluster. No external DSN, global service, deletion or fallback.
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BIN = '/usr/lib/postgresql/16/bin';
export const VERSION = '16.15';
export const DATABASE = 'econmind_v09_d_supervisor_ci';
export const PREFIX = 'start-ready-d-pg16-';
const markerName = 'postgres-owned-cluster.json';
export const CHILD_ENV = Object.freeze({
  PATH: '/usr/bin:/bin',
  LANG: 'C',
  LC_ALL: 'C',
});

function directory(target, uid, privateMode = false) {
  const stat = lstatSync(target);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    realpathSync(target) !== target ||
    stat.uid !== uid ||
    (stat.mode & 0o022) !== 0 ||
    (privateMode && (stat.mode & 0o777) !== 0o700)
  )
    throw Error(
      `Not an owned canonical${privateMode ? ' 0700' : ''} directory: ${target}`,
    );
}

export function locations(env = process.env, uid = process.getuid()) {
  const temp = env.RUNNER_TEMP;
  if (!temp || !path.isAbsolute(temp))
    throw Error('Absolute RUNNER_TEMP required');
  directory(temp, uid);
  const evidence = path.join(temp, 'start-ready-candidate');
  if (env.CI_EVIDENCE_DIRECTORY !== evidence)
    throw Error('Evidence must be the exact runner-local directory');
  directory(evidence, uid);
  return { temp, evidence, marker: path.join(evidence, markerName), uid };
}

export function validateOwned(marker, where) {
  if (
    marker.schema !== 'START_READY_OWNED_PG16_1' ||
    marker.uid !== where.uid ||
    marker.bin !== BIN ||
    marker.version !== VERSION ||
    path.dirname(marker.root || '') !== where.temp ||
    !path.basename(marker.root || '').startsWith(PREFIX) ||
    marker.data !== path.join(marker.root, 'data')
  )
    throw Error('Foreign or invalid cluster marker; refusing cluster control');
  directory(marker.root, where.uid, true);
  directory(marker.data, where.uid, true);
  return marker;
}

export function plan(data) {
  return {
    initdb: [
      '-D',
      data,
      '-U',
      'postgres',
      '--encoding=UTF8',
      '--no-locale',
      '--auth-local=trust',
      '--auth-host=trust',
    ],
    start: [
      '-D',
      data,
      '-w',
      '-t',
      '30',
      '-o',
      "-c listen_addresses=127.0.0.1 -c port=5432 -c unix_socket_directories=''",
      'start',
    ],
    createdb: [
      '--host=127.0.0.1',
      '--port=5432',
      '--username=postgres',
      '--maintenance-db=postgres',
      '--no-password',
      DATABASE,
    ],
    stop: ['-D', data, '-m', 'fast', '-w', '-t', '30', 'stop'],
  };
}

export function verifyTools() {
  if (process.platform !== 'linux' || process.getuid() === 0)
    throw Error('Non-root Ubuntu runner required; no platform fallback');
  const os = readFileSync('/etc/os-release', 'utf8');
  if (!/^ID=ubuntu$/mu.test(os) || !/^VERSION_ID="24\.04"$/mu.test(os))
    throw Error('Pinned Ubuntu 24.04 runner required');
  const versions = {};
  for (const name of ['initdb', 'pg_ctl', 'createdb', 'postgres']) {
    const executable = path.join(BIN, name);
    const stat = lstatSync(executable);
    if (!stat.isFile() || stat.uid !== 0 || (stat.mode & 0o022) !== 0)
      throw Error(`Untrusted PG tool: ${executable}`);
    for (let parent = BIN; parent !== '/'; parent = path.dirname(parent)) {
      const parentStat = lstatSync(parent);
      if (
        !parentStat.isDirectory() ||
        parentStat.uid !== 0 ||
        (parentStat.mode & 0o022) !== 0
      )
        throw Error(`Untrusted PG tool directory: ${parent}`);
    }
    versions[name] = execFileSync(executable, ['--version'], {
      env: CHILD_ENV,
      encoding: 'utf8',
    }).trim();
    if (
      !versions[name].includes(`(PostgreSQL) ${VERSION} `) &&
      !versions[name].endsWith(`(PostgreSQL) ${VERSION}`)
    )
      throw Error(`Expected PG ${VERSION}, got ${versions[name]}`);
  }
  return versions;
}

export function stopOwned(where, run) {
  if (!existsSync(where.marker)) return { status: 'NOT_STARTED' };
  const stat = lstatSync(where.marker);
  if (!stat.isFile() || stat.uid !== where.uid || (stat.mode & 0o777) !== 0o600)
    throw Error('Invalid ownership marker file');
  const marker = validateOwned(
    JSON.parse(readFileSync(where.marker, 'utf8')),
    where,
  );
  const pidPath = path.join(marker.data, 'postmaster.pid');
  if (!existsSync(pidPath)) return { status: 'NOT_RUNNING', root: marker.root };
  const pidStat = lstatSync(pidPath);
  if (!pidStat.isFile() || pidStat.uid !== where.uid)
    throw Error('Invalid owned postmaster PID file');
  const pid = readFileSync(pidPath, 'utf8').split('\n');
  if (
    !/^[1-9][0-9]*$/u.test(pid[0]) ||
    pid[1] !== marker.data ||
    pid[3] !== '5432'
  )
    throw Error('Postmaster identity mismatch; refusing stop');
  run('pg_ctl', plan(marker.data).stop);
  return { status: 'STOPPED', root: marker.root };
}

export function startOwned(where, versions, image, run) {
  if (existsSync(where.marker))
    throw Error('Cluster attempt already recorded; no retry');
  const ownedRoot = mkdtempSync(path.join(where.temp, PREFIX));
  chmodSync(ownedRoot, 0o700);
  const data = path.join(ownedRoot, 'data');
  mkdirSync(data, { mode: 0o700 });
  const marker = {
    schema: 'START_READY_OWNED_PG16_1',
    uid: where.uid,
    root: ownedRoot,
    data,
    bin: BIN,
    version: VERSION,
    versions,
    ...image,
  };
  validateOwned(marker, where);
  // Persist ownership BEFORE initdb/start so always-cleanup covers partial failure.
  writeFileSync(where.marker, `${JSON.stringify(marker, null, 2)}\n`, {
    flag: 'wx',
    mode: 0o600,
  });
  console.log(JSON.stringify(marker));
  const commands = plan(data);
  run('initdb', commands.initdb);
  const serverLog = path.join(where.evidence, 'postgres-server.log');
  writeFileSync(serverLog, '', { flag: 'wx', mode: 0o600 });
  run('pg_ctl', [...commands.start.slice(0, -1), '-l', serverLog, 'start']);
  run('createdb', commands.createdb);
  console.log(
    'OWNED_CLUSTER_READY; native assertions remain separate and unchanged',
  );
  return marker;
}

function main(mode) {
  const where = locations();
  if (!['start', 'stop'].includes(mode)) throw Error('Expected start or stop');
  // Even cleanup may never substitute a different pg_ctl executable.
  const versions = verifyTools();
  const run = (name, args) => {
    console.log(JSON.stringify({ executable: path.join(BIN, name), args }));
    execFileSync(path.join(BIN, name), args, {
      env: CHILD_ENV,
      stdio: 'inherit',
    });
  };
  if (mode === 'stop') {
    console.log(JSON.stringify(stopOwned(where, run)));
    return;
  }
  startOwned(
    where,
    versions,
    {
      runnerImage: process.env.ImageOS || 'UNKNOWN',
      runnerImageVersion: process.env.ImageVersion || 'UNKNOWN',
    },
    run,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv[2]);
