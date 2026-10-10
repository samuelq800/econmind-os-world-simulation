// Pure filesystem/command controls only. No fake/native SQL or server-address evidence.
import assert from 'node:assert/strict';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { STEP_OUTCOMES, successfulSteps } from './start-ready-candidate-ci.mjs';
import {
  BIN,
  CHILD_ENV,
  DATABASE,
  PREFIX,
  VERSION,
  locations,
  plan,
  startOwned,
  stopOwned,
  validateOwned,
} from './start-ready-postgres.mjs';

function fixture() {
  const temp = mkdtempSync(path.join(tmpdir(), 'owned-pg-control-'));
  // tmpdir may be a system alias on macOS; canonicalize before testing the guard.
  const canonical = realpathSync(temp);
  const evidence = path.join(canonical, 'start-ready-candidate');
  mkdirSync(evidence);
  const where = locations({
    RUNNER_TEMP: canonical,
    CI_EVIDENCE_DIRECTORY: evidence,
  });
  const root = mkdtempSync(path.join(canonical, PREFIX));
  chmodSync(root, 0o700);
  const data = path.join(root, 'data');
  mkdirSync(data, { mode: 0o700 });
  const marker = {
    schema: 'START_READY_OWNED_PG16_1',
    uid: process.getuid(),
    root,
    data,
    bin: BIN,
    version: VERSION,
  };
  return { where, marker };
}

test('commands pin PG16.15, loopback TCP, fixed port/database, no external PG environment', () => {
  assert.equal(BIN, '/usr/lib/postgresql/16/bin');
  assert.equal(VERSION, '16.15');
  const commands = plan('/owned/data');
  assert.deepEqual(commands.initdb, [
    '-D',
    '/owned/data',
    '-U',
    'postgres',
    '--encoding=UTF8',
    '--no-locale',
    '--auth-local=trust',
    '--auth-host=trust',
  ]);
  assert.deepEqual(commands.start, [
    '-D',
    '/owned/data',
    '-w',
    '-t',
    '30',
    '-o',
    "-c listen_addresses=127.0.0.1 -c port=5432 -c unix_socket_directories=''",
    'start',
  ]);
  assert.deepEqual(commands.createdb, [
    '--host=127.0.0.1',
    '--port=5432',
    '--username=postgres',
    '--maintenance-db=postgres',
    '--no-password',
    DATABASE,
  ]);
  assert.deepEqual(commands.stop, [
    '-D',
    '/owned/data',
    '-m',
    'fast',
    '-w',
    '-t',
    '30',
    'stop',
  ]);
  assert.deepEqual(CHILD_ENV, {
    PATH: '/usr/bin:/bin',
    LANG: 'C',
    LC_ALL: 'C',
  });
});

test('runner temp/evidence are canonical current-UID owned, not arbitrary external locations', () => {
  const { where } = fixture();
  assert.throws(() => locations({ RUNNER_TEMP: 'relative' }), /Absolute/u);
  assert.throws(
    () =>
      locations({ RUNNER_TEMP: where.temp, CI_EVIDENCE_DIRECTORY: tmpdir() }),
    /exact/u,
  );
  assert.throws(
    () =>
      locations(
        { RUNNER_TEMP: where.temp, CI_EVIDENCE_DIRECTORY: where.evidence },
        where.uid + 1,
      ),
    /owned/u,
  );
  const alias = path.join(where.temp, 'alias');
  symlinkSync(where.evidence, alias);
  assert.throws(
    () =>
      locations({
        RUNNER_TEMP: alias,
        CI_EVIDENCE_DIRECTORY: path.join(alias, 'start-ready-candidate'),
      }),
    /owned/u,
  );
});

test('cluster control rejects foreign generation, UID, tool source, nonprivate directories and symlinks', () => {
  const { where, marker } = fixture();
  assert.deepEqual(validateOwned(marker, where), marker);
  for (const changed of [
    { root: where.temp },
    { data: where.temp },
    { uid: where.uid + 1 },
    { bin: '/usr/bin' },
    { version: '17' },
    { schema: 'foreign' },
  ])
    assert.throws(() => validateOwned({ ...marker, ...changed }, where));
  chmodSync(marker.data, 0o755);
  assert.throws(() => validateOwned(marker, where), /0700/u);
  chmodSync(marker.data, 0o700);
  const aliasRoot = path.join(where.temp, `${PREFIX}alias`);
  symlinkSync(marker.root, aliasRoot);
  assert.throws(
    () =>
      validateOwned(
        { ...marker, root: aliasRoot, data: path.join(aliasRoot, 'data') },
        where,
      ),
    /owned/u,
  );
});

test('missing marker/partially initialized cluster issues no stop command', () => {
  const { where, marker } = fixture();
  const commands = [];
  const run = (...args) => commands.push(args);
  assert.equal(stopOwned(where, run).status, 'NOT_STARTED');
  writeFileSync(where.marker, JSON.stringify(marker), { mode: 0o600 });
  assert.equal(stopOwned(where, run).status, 'NOT_RUNNING');
  assert.deepEqual(commands, []);
});

test('startup reserves fresh private ownership before initdb failure; no second attempt', () => {
  const { where } = fixture();
  let calls = 0;
  const run = (name, args) => {
    calls += 1;
    assert.equal(name, 'initdb');
    const marker = JSON.parse(readFileSync(where.marker, 'utf8'));
    validateOwned(marker, where);
    assert.deepEqual(args, plan(marker.data).initdb);
    throw Error('EXPECTED_INITDB_FAILURE');
  };
  assert.throws(
    () => startOwned(where, {}, {}, run),
    /EXPECTED_INITDB_FAILURE/u,
  );
  assert.throws(() => startOwned(where, {}, {}, run), /already recorded/u);
  assert.equal(calls, 1);
  assert.equal(
    stopOwned(where, () => assert.fail('must not stop another server')).status,
    'NOT_RUNNING',
  );
});

test('a failure after server startup still leaves exact owned cleanup identity', () => {
  const { where } = fixture();
  const calls = [];
  const run = (name, args) => {
    calls.push(name);
    const marker = JSON.parse(readFileSync(where.marker, 'utf8'));
    if (name === 'pg_ctl') {
      assert.deepEqual(args, [
        ...plan(marker.data).start.slice(0, -1),
        '-l',
        path.join(where.evidence, 'postgres-server.log'),
        'start',
      ]);
      // PID-file fixture ONLY; no process or SQL is run by this pure test.
      writeFileSync(
        path.join(marker.data, 'postmaster.pid'),
        `12345\n${marker.data}\n0\n5432\n`,
      );
    }
    if (name === 'createdb') throw Error('EXPECTED_CREATEDB_FAILURE');
  };
  assert.throws(
    () => startOwned(where, {}, {}, run),
    /EXPECTED_CREATEDB_FAILURE/u,
  );
  assert.deepEqual(calls, ['initdb', 'pg_ctl', 'createdb']);
  assert.equal(
    stopOwned(where, (name, args) => {
      assert.equal(name, 'pg_ctl');
      const marker = JSON.parse(readFileSync(where.marker, 'utf8'));
      assert.deepEqual(args, plan(marker.data).stop);
    }).status,
    'STOPPED',
  );
});

test('cleanup only targets validated own data; failures propagate, evidence is retained', () => {
  const { where, marker } = fixture();
  writeFileSync(where.marker, JSON.stringify(marker), { mode: 0o600 });
  const pidFile = path.join(marker.data, 'postmaster.pid');
  writeFileSync(pidFile, `12345\n${where.temp}\n0\n5432\n`);
  let calls = 0;
  const run = (name, args) => {
    calls += 1;
    assert.equal(name, 'pg_ctl');
    assert.deepEqual(args, plan(marker.data).stop);
    throw Error('EXPECTED_STOP_FAILURE');
  };
  assert.throws(() => stopOwned(where, run), /identity mismatch/u);
  assert.equal(calls, 0);
  writeFileSync(pidFile, `12345\n${marker.data}\n0\n5432\n`);
  assert.throws(() => stopOwned(where, run), /EXPECTED_STOP_FAILURE/u);
  assert.equal(calls, 1);
  assert.equal(stopOwned(where, () => {}).status, 'STOPPED');
  assert.equal(
    JSON.parse(readFileSync(where.marker, 'utf8')).root,
    marker.root,
  );
  chmodSync(where.marker, 0o644);
  assert.throws(() => stopOwned(where, run), /ownership marker/u);
});

test('supplemental PASS requires successful startup AND successful cleanup, with original six outcomes', () => {
  assert.deepEqual(STEP_OUTCOMES, [
    'INPUTS_OUTCOME',
    'INSTALL_OUTCOME',
    'CI_CONTRACT_OUTCOME',
    'BUILD_OUTCOME',
    'STRICT_TYPES_OUTCOME',
    'NATIVE_D_OUTCOME',
    'PG_START_OUTCOME',
    'PG_STOP_OUTCOME',
  ]);
  const outcomes = Object.fromEntries(
    STEP_OUTCOMES.map((name) => [name, 'success']),
  );
  assert.equal(successfulSteps(outcomes), true);
  for (const name of STEP_OUTCOMES)
    for (const status of ['failure', 'skipped', 'cancelled', undefined])
      assert.equal(successfulSteps({ ...outcomes, [name]: status }), false);
});

test('workflow removes Docker, orders strict checks/start/native/always-stop/finalize and binds all outcomes', () => {
  const workflow = readFileSync(
    new URL(
      '../../.github/workflows/start-ready-candidate.yml',
      import.meta.url,
    ),
    'utf8',
  );
  assert.match(workflow, /runs-on: ubuntu-24\.04/u);
  assert.doesNotMatch(
    workflow,
    /services:|postgres:16-alpine|systemctl|sudo|apt-get|pg_dropcluster/u,
  );
  assert.match(
    workflow,
    /id: strict_types[\s\S]*id: pg_start[\s\S]*id: native_d[\s\S]*id: pg_stop[\s\S]*Finalize actual-source receipt/u,
  );
  assert.match(
    workflow,
    /id: native_d\n[^\n]*steps\.pg_start\.outcome == 'success'/u,
  );
  assert.match(
    workflow,
    /id: pg_stop\n {8}if: always\(\) && steps\.inputs\.outcome == 'success'/u,
  );
  assert.match(
    workflow,
    /PG_START_OUTCOME: \$\{\{ steps\.pg_start\.outcome \}\}/u,
  );
  assert.match(
    workflow,
    /PG_STOP_OUTCOME: \$\{\{ steps\.pg_stop\.outcome \}\}/u,
  );
  assert.match(
    workflow,
    /node --test tests\/support\/start-ready-candidate-ci\.test\.mjs tests\/support\/start-ready-postgres\.test\.mjs/u,
  );
  for (const mode of ['start', 'stop'])
    assert.match(
      workflow,
      new RegExp(
        `set -o pipefail\\n[^\\n]*start-ready-postgres\\.mjs ${mode} 2>&1 \\| tee`,
        'u',
      ),
    );
});
