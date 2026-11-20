/** Disposable PG16 schema-only rehearsal. No seed, World/bootstrap, service,
 * consumer or Clock. Exact local image only; no external DB/credential input. */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../..', import.meta.url));
const image =
  'postgres@sha256:1beaa3084eee2676f20a9cd9928f0bf2c5bf674f8e49f81017912183d377c61c';
const oldCommit = '0cf65bc0e6cbf1b117ca625bb16ec7280938e239';
const targetCommit = '4b6d400c2620303bfdc167d6645adfbfed3f3e04';
const sha = (s) => createHash('sha256').update(s).digest('hex');
const quote = (s) => "'" + s.replaceAll("'", "''") + "'";
export function schemaUpgradeNativePlan() {
  return {
    classification: 'SCHEMA_ONLY_NOT_ECONOMIC_OR_PRODUCTION',
    image,
    oldCommit,
    targetCommit,
    network: 'none',
    ports: [],
    hostMounts: [],
    data: 'owned container /tmp tmpfs',
    maxMemory: '384m',
    largeSeed: false,
    WorldInitialized: false,
    ClockStarted: false,
  };
}
export async function runSchemaUpgradeNative({
  expectedCommit,
  evidenceDirectory,
}) {
  assert.equal(
    process.env.ECONMIND_SCHEMA_UPGRADE_NATIVE,
    '1',
    'EXPLICIT_SCHEMA_NATIVE_OPT_IN_REQUIRED',
  );
  assert.match(expectedCommit, /^[a-f0-9]{40}$/u);
  assert(path.isAbsolute(evidenceDirectory));
  fs.mkdirSync(evidenceDirectory, { recursive: false });
  const report = {
    ...schemaUpgradeNativePlan(),
    repositoryRoot: root,
    expectedCommit,
    runnerSha256: sha(fs.readFileSync(fileURLToPath(import.meta.url))),
    startedAt: new Date().toISOString(),
    status: 'RUNNING',
    phases: [],
    sources: [],
    checks: [],
    cleanup: null,
  };
  const save = () =>
    fs.writeFileSync(
      path.join(evidenceDirectory, 'report.json'),
      JSON.stringify(report, null, 2) + '\n',
    );
  const direct = (command, args, input) => {
    const r = spawnSync(command, args, {
      cwd: root,
      input,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    });
    if (r.status !== 0) {
      const e = new Error(
        command +
          ' failed: ' +
          args.slice(0, 4).join(' ') +
          '\n' +
          (r.stderr || r.error?.message),
      );
      e.status = r.status;
      e.stdout = r.stdout;
      e.stderr = r.stderr;
      throw e;
    }
    return r.stdout;
  };
  assert.equal(direct('git', ['rev-parse', 'HEAD']).trim(), expectedCommit);
  const git = (commit, p) =>
    direct('git', ['--no-replace-objects', 'show', commit + ':' + p]);
  const manifestPath =
      'database/upgrades/postwar-0cf65bc0-to-4b6d400c.manifest.json',
    manifest = JSON.parse(
      fs.readFileSync(path.join(root, manifestPath), 'utf8'),
    );
  assert.equal(manifest.oldCommit, oldCommit);
  assert.equal(manifest.newCommit, targetCommit);
  assert.equal(manifest.orderedUpgradeFiles.length, 5);
  assert.equal(manifest.freshProposalFiles.length, 2);
  report.manifest = {
    path: manifestPath,
    sha256: sha(fs.readFileSync(path.join(root, manifestPath))),
  };
  const upgrades = manifest.orderedUpgradeFiles.map((item) => {
    const bytes = fs.readFileSync(path.join(root, item.path), 'utf8');
    assert.equal(sha(bytes), item.rawSha256, item.path);
    return { ...item, bytes };
  });
  const fresh = manifest.freshProposalFiles.map((item) => {
    const bytes = fs.readFileSync(path.join(root, item.path), 'utf8');
    assert.equal(sha(bytes), item.rawSha256, item.path);
    return { ...item, bytes };
  });
  const migrations = JSON.parse(
    git(oldCommit, 'database/migrations/manifest.json'),
  ).migrations.sort((a, b) => a.release_order - b.release_order);
  assert.equal(migrations.length, 23);
  const baseline = migrations.map((m) => {
    const bytes = git(oldCommit, m.path);
    assert.equal(sha(bytes), m.sha256);
    assert.equal(bytes, git(m.artifact_source_commit, m.path));
    return { ...m, bytes };
  });
  const oldPlan = git(
      oldCommit,
      'tools/office-connection/registered-final-native-sql.mjs',
    ),
    array = oldPlan.match(
      /export const REGISTERED_FINAL_NATIVE_SQL_ORDER = Object.freeze\(\[([\s\S]*?)\]\);/u,
    )?.[1];
  assert(array);
  const selected = [...array.matchAll(/'([a-z0-9-]+)'/gu)].map((m) => m[1]);
  assert.equal(selected.length, 74);
  const names = [
    ...new Set([
      'runtime-read-binding-storage',
      'current-authorization-writer-preparation',
      'runtime-admission-publication',
      'postwar-runtime-source-read-policy',
      ...selected,
    ]),
  ];
  // The real child-source phase registers Captain publication before the
  // complete history-reader phase. Empty schema rehearsals need that same DDL
  // prerequisite even though they never publish a World/source record.
  const child = oldPlan.match(
    /const childSourceNames = new Set\(\[([\s\S]*?)\]\);/u,
  )?.[1];
  assert(child?.includes("'postwar-captain-source-publication'"));
  const captainIndex = names.indexOf('postwar-captain-source-publication');
  names.splice(captainIndex, 1);
  names.splice(
    names.indexOf('central-bank-omo-history-read'),
    0,
    'postwar-captain-source-publication',
  );
  report.dependencyBootstrap = [
    'old child-source Captain publication before Central Bank history',
  ];
  assert.equal(names.length, 76);
  const oldSources = names.map((name) => {
    const p = 'database/proposals/' + name + '.sql',
      bytes = git(oldCommit, p);
    return { path: p, bytes, sha256: sha(bytes) };
  });
  for (const [name, h] of Object.entries(manifest.oldProposalSha256))
    assert.equal(sha(git(oldCommit, 'database/proposals/' + name + '.sql')), h);
  const inspect = JSON.parse(direct('docker', ['image', 'inspect', image]))[0];
  assert(inspect.RepoDigests.includes(image));
  report.imageId = inspect.Id;
  const ownerNonce = randomUUID();
  const name =
    'econmind-schema-upgrade-' + ownerNonce.replaceAll('-', '').slice(0, 12);
  report.container = name;
  let attempted = false,
    holder;
  const docker = (args, input) => direct('docker', args, input);
  let seq = 0;
  const sql = (db, bytes, label = 'query') => {
    const id = String(++seq).padStart(3, '0'),
      meta = {
        id,
        label,
        database: db,
        sha256: sha(bytes),
        startedAt: new Date().toISOString(),
      };
    try {
      const out = docker(
        [
          'exec',
          '-i',
          name,
          'psql',
          '-X',
          '-qAt',
          '-h',
          '/tmp',
          '-U',
          'postgres',
          '-d',
          db,
          '-v',
          'ON_ERROR_STOP=1',
          '-v',
          'VERBOSITY=verbose',
        ],
        bytes,
      );
      meta.exit = 0;
      meta.completedAt = new Date().toISOString();
      report.phases.push(meta);
      save();
      return out.trim();
    } catch (e) {
      meta.exit = e.status;
      meta.stderr = e.stderr;
      meta.stdout = e.stdout;
      meta.completedAt = new Date().toISOString();
      report.phases.push(meta);
      save();
      throw e;
    }
  };
  const json = (db, q) => JSON.parse(sql(db, q));
  const snapshot = (db) =>
    json(
      db,
      `select json_build_object(
 'roles',(select json_agg(x order by rolname)from(select rolname,rolcanlogin,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolreplication from pg_roles where rolname like 'world_v2_%'or rolname in('anon','authenticated','service_role'))x),
 'memberships',(select json_agg(x order by roleid,member)from(select roleid,member,admin_option from pg_auth_members)x),
 'tables',(select json_agg(x order by relname)from(select c.oid,c.relname,pg_get_userbyid(c.relowner)as owner,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='world_v2'and c.relkind in('r','p'))x),
 'policies',(select json_agg(x order by polrelid,polname)from(select p.* from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='world_v2')x),
 'triggers',(select json_agg(x order by tgrelid,tgname)from(select t.* from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='world_v2')x),
 'sentinel',(select json_agg(x order by id)from public.schema_upgrade_sentinel x),
 'functions',(select json_agg(x order by signature)from(select p.oid,replace(p.oid::regprocedure::text,'timestamp with time zone','timestamptz')as signature,pg_get_userbyid(p.proowner)as owner,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')as body_sha256,p.proacl::text,(select coalesce(json_agg(pg_get_userbyid(a.grantee)::text order by pg_get_userbyid(a.grantee)::text),'[]'::json)from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a where a.grantee<>p.proowner and a.privilege_type='EXECUTE')as readers,p.proargnames,p.proisstrict,p.prosecdef,p.proconfig,p.provolatile,p.proparallel,pg_get_function_result(p.oid)as result from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='world_v2')x),
 'worldCounts',json_build_object('world_head',(select count(*)from world_v2.world_head),'opening_seed',(select count(*)from world_v2.opening_seed),'commands',(select count(*)from world_v2.command_submission),'events',(select count(*)from world_v2.authoritative_event),'receipts',(select count(*)from world_v2.command_receipt),'financial',(select count(*)from world_v2.financial_posting_batch),'inventory',(select count(*)from world_v2.inventory_posting)),
 'key',(select pg_get_constraintdef(oid)from pg_constraint where conrelid='world_v2.postwar_industry_water_grant_publication'::regclass and contype='p'))`,
    );
  const check = (label, fn) => {
    fn();
    report.checks.push({ label, status: 'PASS' });
    save();
  };
  const writeSnapshot = (label, value) => {
    fs.writeFileSync(
      path.join(evidenceDirectory, label + '.json'),
      JSON.stringify(value, null, 2) + '\n',
    );
  };
  const reject = (db, bytes, label) => {
    try {
      sql(db, bytes, label);
      throw Error('EXPECTED_SQL_FAILURE');
    } catch (e) {
      assert.notEqual(e.message, 'EXPECTED_SQL_FAILURE');
      return e;
    }
  };
  try {
    attempted = true;
    save();
    docker([
      'run',
      '--detach',
      '--pull=never',
      '--name',
      name,
      '--label',
      'econmind.task=schema-upgrade-only',
      '--label',
      'econmind.owner_nonce=' + ownerNonce,
      '--network=none',
      '--read-only',
      '--cap-drop=ALL',
      '--security-opt=no-new-privileges',
      '--memory=384m',
      '--cpus=1',
      '--pids-limit=64',
      '--tmpfs',
      '/tmp:rw,mode=1777,size=256m',
      '--user',
      'postgres',
      '--entrypoint',
      'sleep',
      image,
      'infinity',
    ]);
    report.containerIsolation = JSON.parse(docker(['inspect', name]))[0];
    report.containerIsolation = {
      image: report.containerIsolation.Image,
      user: report.containerIsolation.Config.User,
      network: report.containerIsolation.HostConfig.NetworkMode,
      readOnly: report.containerIsolation.HostConfig.ReadonlyRootfs,
      mounts: report.containerIsolation.Mounts,
      tmpfs: report.containerIsolation.HostConfig.Tmpfs,
      ports: report.containerIsolation.HostConfig.PortBindings,
    };
    docker([
      'exec',
      name,
      '/usr/lib/postgresql/16/bin/initdb',
      '-D',
      '/tmp/schema-pgdata',
      '-A',
      'trust',
      '--no-locale',
      '--encoding=UTF8',
    ]);
    docker([
      'exec',
      name,
      '/usr/lib/postgresql/16/bin/pg_ctl',
      '-D',
      '/tmp/schema-pgdata',
      '-l',
      '/tmp/postgres.log',
      '-o',
      "-c listen_addresses='' -c unix_socket_directories=/tmp -c shared_buffers=16MB -c max_connections=10 -c work_mem=1MB -c maintenance_work_mem=16MB -c max_parallel_workers=0",
      '-w',
      '-t',
      '30',
      'start',
    ]);
    const version = sql('postgres', 'select version()');
    assert.match(version, /PostgreSQL 16\.15/u);
    report.actualPostgres = version;
    sql('postgres', 'create database schema_old;');
    sql(
      'schema_old',
      `create schema storage;create table storage.objects(bucket_id text);alter table storage.objects enable row level security;create role anon nologin noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication;create role authenticated nologin noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication;create role service_role nologin noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication;create role world_v2_postwar_offline_seed_reader nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;create table public.schema_upgrade_sentinel(id text primary key,payload text);insert into public.schema_upgrade_sentinel values('TEST_ONLY_A','retained unicode 原文'),('TEST_ONLY_B','unchanged schema-only bytes');`,
      'native fixture namespace roles only',
    );
    for (const m of baseline) {
      sql('schema_old', m.bytes, m.path);
      sql(
        'schema_old',
        `insert into world_v2.schema_release(migration_id,artifact_sha256,source_repo_commit,release_order)values(${quote(m.migration_id)},${quote(m.sha256)},${quote(m.artifact_source_commit)},${m.release_order});`,
        'baseline ledger',
      );
      report.sources.push({ kind: 'BASELINE', path: m.path, sha256: m.sha256 });
    }
    for (const s of oldSources) {
      sql('schema_old', s.bytes, s.path);
      report.sources.push({
        kind: 'OLD_0CF_PROPOSAL',
        path: s.path,
        sha256: s.sha256,
      });
    }
    const old = snapshot('schema_old');
    writeSnapshot('old-catalog', old);
    check('legacy real SQL and no World initialization', () => {
      assert.equal(old.key, 'PRIMARY KEY (world_id, run_id)');
      assert(Object.values(old.worldCounts).every((n) => n === 0));
    });
    sql(
      'postgres',
      'create database schema_fail template schema_old;create database schema_final template schema_old;',
    );
    sql('schema_fail', upgrades[0].bytes, upgrades[0].path);
    const mid = snapshot('schema_fail');
    const fault = upgrades[1].bytes.replace(
      /commit;\s*$/u,
      'select 1/0;\ncommit;',
    );
    assert.notEqual(fault, upgrades[1].bytes);
    const failure = reject(
      'schema_fail',
      fault,
      'TEST_ONLY injected after real function replacement',
    );
    check('failed chunk rolls back while prior committed chunk remains', () => {
      assert.match(failure.stderr, /22012/u);
      assert.deepEqual(snapshot('schema_fail'), mid);
      assert.notDeepEqual(mid.functions, old.functions);
    });
    for (let i = 1; i < 4; i++)
      sql('schema_fail', upgrades[i].bytes, upgrades[i].path);
    const beforeKeyFailure = snapshot('schema_fail'),
      keyFault = upgrades[4].bytes.replace(
        /commit;\s*$/u,
        'select 1/0;\ncommit;',
      );
    const failedKey = reject(
      'schema_fail',
      keyFault,
      'TEST_ONLY injected after real key/RPC replacement',
    );
    check('failed GRANT key/RPC chunk atomically restores old catalog', () => {
      assert.match(failedKey.stderr, /22012/u);
      assert.deepEqual(snapshot('schema_fail'), beforeKeyFailure);
      assert.equal(beforeKeyFailure.key, 'PRIMARY KEY (world_id, run_id)');
    });
    for (const s of upgrades) sql('schema_final', s.bytes, s.path);
    const upgraded = snapshot('schema_final');
    writeSnapshot('upgraded-catalog', upgraded);
    const expected = new Map(
      manifest.sourceFunctionChanges
        .filter((f) => !f.effect.startsWith('SHADOWED'))
        .map((f) => [f.signature, f.targetBodySha256]),
    );
    check('all five target upgrades and immutable catalog metadata', () => {
      for (const [signature, h] of expected) {
        const p = upgraded.functions.find(
          (p) => p.signature === 'world_v2.' + signature,
        );
        assert(p, signature);
        assert.equal(p.body_sha256, h, signature);
      }
      for (const m of manifest.functions) {
        const p = upgraded.functions.find(
          (p) => p.signature === 'world_v2.' + m.name + '(' + m.types + ')',
        );
        assert(p, m.name);
        assert.equal(p.owner, m.owner);
        assert.deepEqual(p.readers, [...m.readers].sort());
        assert.deepEqual(p.proargnames, m.args);
        assert.equal(p.result, m.result);
        assert.equal(p.prosecdef, true);
        assert.deepEqual(p.proconfig, ['search_path=pg_catalog']);
      }
      for (const key of [
        'roles',
        'memberships',
        'tables',
        'policies',
        'triggers',
        'sentinel',
        'worldCounts',
      ])
        assert.deepEqual(upgraded[key], old[key], key);
      assert.equal(upgraded.key, 'PRIMARY KEY (world_id, schedule_command_id)');
    });
    for (const s of fresh) {
      sql('schema_final', s.bytes, s.path);
      report.sources.push({
        kind: 'FRESH_POWER',
        path: s.path,
        sha256: s.rawSha256,
      });
    }
    const final = snapshot('schema_final');
    writeSnapshot('final-catalog', final);
    const freshExpected = [];
    for (const source of fresh) {
      const re =
        /create(?: or replace)? function world_v2\.([a-z0-9_]+)\(([^$]*?)\)\s*returns[\s\S]*?as \$\$([\s\S]*?)\$\$;/gu;
      for (const m of source.bytes.matchAll(re)) {
        const params = m[2]
          .split(',')
          .map((p) => p.trim().split(/\s+/u).slice(1).join(' '));
        const sig = m[1] + '(' + params.join(',') + ')',
          lines = source.bytes.split('\n');
        const ownerLine = lines.find((line) =>
            line.startsWith('alter function world_v2.' + sig + 'owner to '),
          ),
          owner = ownerLine?.match(/owner to ([a-z0-9_]+)/u)?.[1];
        assert(owner, sig);
        const readers = lines
          .filter((line) =>
            line.startsWith(
              'grant execute on function world_v2.' + sig + 'to ',
            ),
          )
          .map((line) => line.match(/to ([a-z0-9_]+)/u)?.[1]);
        freshExpected.push({
          signature: 'world_v2.' + sig,
          body_sha256: sha(m[3]),
          owner,
          readers: readers.filter((x) => x !== owner).sort(),
        });
      }
    }
    assert.equal(freshExpected.length, 5);
    report.freshFinalOverrides = freshExpected;
    check(
      'two fresh POWER files install final effective overrides with no World/data/role widening',
      () => {
        for (const p of freshExpected) {
          const actual = final.functions.find(
            (f) => f.signature === p.signature,
          );
          assert(actual, p.signature);
          assert.equal(actual.body_sha256, p.body_sha256, p.signature);
          assert.equal(actual.owner, p.owner);
          assert.deepEqual(actual.readers, p.readers);
          const prior = old.functions.find((f) => f.signature === p.signature);
          if (prior) assert.equal(actual.oid, prior.oid);
        }
        for (const key of [
          'roles',
          'memberships',
          'tables',
          'policies',
          'triggers',
          'sentinel',
          'worldCounts',
        ])
          assert.deepEqual(final[key], old[key], key);
      },
    );
    for (const s of upgrades.slice(0, 4)) {
      const err = reject('schema_final', s.bytes, 'repeat rejects ' + s.path);
      assert.match(err.stderr, /55000/u);
    }
    sql('schema_final', upgrades[4].bytes, 'exact GRANT successor repeat');
    check(
      'repeats follow exact per-artifact contract without catalog drift',
      () => assert.deepEqual(snapshot('schema_final'), final),
    );
    const denied = reject(
      'schema_final',
      `set session authorization world_v2_industry_source_reader;select * from world_v2.read_postwar_industry_water_grant_publication('WORLD_NO_SUCH_SOURCE','COUNTRY_10','OPEN-10-REFINED_FUEL','RUN_NONE');`,
      'low reader denied scoped publisher RPC',
    );
    check('reader has no new publisher or raw-source rights', () => {
      assert.match(denied.stderr, /42501/u);
      const acl = json(
        'schema_final',
        `select json_build_object('seed',has_table_privilege('world_v2_industry_source_reader','world_v2.opening_seed','SELECT'),'grants',has_table_privilege('world_v2_industry_source_publisher','world_v2.postwar_industry_water_grant_publication','SELECT'))`,
      );
      assert.deepEqual(acl, { seed: false, grants: false });
    });
    let holderText = '';
    const held = new Promise((resolve, reject) => {
      holder = spawn(
        'docker',
        [
          'exec',
          '-i',
          name,
          'psql',
          '-X',
          '-qAt',
          '-h',
          '/tmp',
          '-U',
          'postgres',
          '-d',
          'schema_final',
          '-v',
          'ON_ERROR_STOP=1',
        ],
        { stdio: ['pipe', 'pipe', 'pipe'] },
      );
      holder.stdout.on('data', (b) => {
        holderText += b;
        if (holderText.includes('LOCK_ACQUIRED')) resolve();
      });
      holder.on('error', reject);
      holder.stdin.end(
        "begin;lock table world_v2.postwar_industry_water_grant_publication in access share mode;select 'LOCK_ACQUIRED';select pg_sleep(4);commit;",
      );
    });
    await held;
    const started = performance.now(),
      blocked = reject(
        'schema_final',
        upgrades[4].bytes,
        'actual contended ACCESS EXCLUSIVE timeout',
      );
    report.lockContention = {
      elapsedMilliseconds: performance.now() - started,
      sqlState: '55P03',
      holderOutput: holderText,
    };
    assert.match(blocked.stderr, /55P03/u);
    await new Promise((resolve, reject) => {
      if (holder.exitCode !== null)
        return holder.exitCode === 0
          ? resolve()
          : reject(Error('LOCK_HOLDER_FAILED'));
      holder.on('close', (code) =>
        code === 0 ? resolve() : reject(Error('LOCK_HOLDER_FAILED')),
      );
    });
    check('PG16 contended lock times out and rolls back cleanly', () => {
      assert(report.lockContention.elapsedMilliseconds >= 1800);
      assert(report.lockContention.elapsedMilliseconds < 5000);
      assert.deepEqual(snapshot('schema_final'), final);
    });
    report.status = 'PASS_SCHEMA_ONLY_NOT_ECONOMIC_ACCEPTANCE';
    report.completedAt = new Date().toISOString();
    save();
  } catch (e) {
    report.status = 'FAIL';
    report.error = { message: e.message, stdout: e.stdout, stderr: e.stderr };
    report.completedAt = new Date().toISOString();
    save();
    throw e;
  } finally {
    if (attempted) {
      let collectError;
      try {
        const logs = docker(['exec', name, 'cat', '/tmp/postgres.log']);
        fs.writeFileSync(path.join(evidenceDirectory, 'postgres.log'), logs);
      } catch (e) {
        collectError = e.message;
      }
      let removed = false,
        cleanupError;
      try {
        const info = JSON.parse(docker(['inspect', name]))[0];
        assert.equal(
          info.Config.Labels['econmind.task'],
          'schema-upgrade-only',
        );
        assert.equal(info.Config.Labels['econmind.owner_nonce'], ownerNonce);
        docker(['rm', '--force', name]);
        removed = true;
      } catch (e) {
        cleanupError = e.message;
      }
      report.cleanup = {
        ownedContainer: name,
        removed,
        collectError,
        cleanupError,
        remaining: direct('docker', [
          'ps',
          '-a',
          '--filter',
          'name=^/' + name + '$',
          '--format',
          '{{.Names}}',
        ]).trim(),
      };
      save();
    }
  }
  return report;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const a = process.argv.slice(2);
  if (
    a.length !== 5 ||
    a[0] !== '--run' ||
    a[1] !== '--expected-commit' ||
    a[3] !== '--evidence-dir'
  )
    throw Error(
      'Usage: --run --expected-commit SHA --evidence-dir FRESH_ABSOLUTE_DIRECTORY',
    );
  const result = await runSchemaUpgradeNative({
    expectedCommit: a[2],
    evidenceDirectory: a[4],
  });
  process.stdout.write(
    JSON.stringify({
      status: result.status,
      checks: result.checks.length,
      cleanup: result.cleanup,
    }) + '\n',
  );
}
