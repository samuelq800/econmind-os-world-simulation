import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const run = promisify(execFile);
const root = path.resolve(import.meta.dirname, '../..');

it('prints a side-effect-free native plan with truthful isolation and source classification', async () => {
  const result = await run(
    process.execPath,
    ['tools/office-connection/native-evidence.mjs', '--plan'],
    { cwd: root },
  );
  const plan = JSON.parse(result.stdout);
  expect(result.stderr).toBe('');
  expect(plan).toMatchObject({
    status: 'PLAN_ONLY_NOT_RUN',
    postgres: '16.15',
    node: '24.20.0',
    pnpm: '12.3.4',
    sourceClass: 'SIMULATED_OPENING',
    sourceAdmitted: false,
    productionAdmission: false,
    WorldClock: false,
    hostMounts: [],
    networkDuringTests: 'NONE',
  });
  expect(plan.image).toMatch(/^postgres@sha256:[a-f0-9]{64}$/u);
});

const native =
  process.env.ECONMIND_OFFICE_NATIVE_EVIDENCE === '1'
    ? describe
    : describe.skip;
native('owned Linux native persistence and authority evidence', () => {
  it('rejects revoked authority/source/version and preserves actual committed tables across its own PGDATA restart', async () => {
    const code = String.raw`
      import assert from 'node:assert/strict';
      import fs from 'node:fs/promises';
      import path from 'node:path';
      import { execFile } from 'node:child_process';
      import { promisify } from 'node:util';
      import { randomUUID, createHash } from 'node:crypto';
      import { Pool } from 'pg';
      import { startIsolatedSocialOfficeHost, runIsolatedSocialOfficeNegativeControl, preserveIsolatedSocialOfficeCheckpoint } from './tools/social-office-demo/host.mjs';
      const run = promisify(execFile);
      const childEnv = { PATH:'/usr/bin:/bin', LANG:'C', LC_ALL:'C' };
      const checks = [];
      const check = (id, value) => { assert.equal(value, true, id); checks.push({id,status:'PASS'}); };
      let host, marker, originalMarker, postmaster, pool, restarted = false, closed = false;
      const output = '/tmp/office-evidence/owned-linux-restart.json';
      const evidence = { sourceClass:'SIMULATED_OPENING', sourceAdmitted:false, productionAdmission:false, WorldClock:false, historicalMacRecovery:'NOT_RUN_FIXED_FOREIGN_CUSTODY', checks };
      const identity = async (pid) => (await run('/bin/ps',['-p',pid,'-o','uid=','-o','lstart='],{env:childEnv})).stdout.trim();
      const assertOwned = async () => {
        assert.equal(await fs.readFile(path.join(marker.root,'owned-postgres.json'),'utf8'),originalMarker);
        for (const p of [marker.root,marker.data,marker.socket]) {
          const stat = await fs.lstat(p);
          assert(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid===process.getuid() && (stat.mode&0o777)===0o700);
          assert.equal(await fs.realpath(p),p);
        }
        assert.equal(marker.bin,'/usr/lib/postgresql/16/bin');
        for (const name of ['postgres','pg_ctl','pg_controldata']) {
          const stat = await fs.lstat(path.join(marker.bin,name));
          assert(stat.isFile() && !stat.isSymbolicLink() && stat.uid===0 && (stat.mode&0o022)===0);
          assert.match((await run(path.join(marker.bin,name),['--version'],{env:childEnv})).stdout,/\(PostgreSQL\) 16\.15\b/u);
        }
      };
      const control = async () => (await run(path.join(marker.bin,'pg_controldata'),[marker.data],{env:childEnv})).stdout;
      try {
        host = await startIsolatedSocialOfficeHost();
        const root = host.inspection().nativeRoot;
        originalMarker = await fs.readFile(path.join(root,'owned-postgres.json'),'utf8');
        marker = JSON.parse(originalMarker);
        await assertOwned();
        check('new-cluster-is-owned-linux-private-socket', marker.uid===process.getuid() && marker.root.startsWith('/tmp/econmind-f-social-demo-'));
        const negatives = [];
        for (const kind of ['AUTHORITY_REVOKED','SOURCE_MISSING_DOMAIN','SOURCE_REVOKED','WRONG_VERSION']) {
          const result = await runIsolatedSocialOfficeNegativeControl(host,kind);
          check(kind+'-economic-facts-unchanged',result.economicFactsUnchanged===true && result.before.sha256===result.after.sha256);
          negatives.push(result);
        }
        evidence.negatives = negatives;
        const base = host.origin+'/isolated/v1/social-office/';
        const session = await fetch(base+'session',{method:'POST',headers:{origin:host.origin,'content-type':'application/json'},body:'{}'});
        assert.equal(session.status,200);
        const authorization = (await session.json()).authorization;
        const projection = await fetch(base+'projection',{headers:{authorization}});
        assert.equal(projection.status,200);
        const before = await projection.json();
        const requestId = randomUUID();
        let response = await fetch(base+'command',{method:'POST',headers:{origin:host.origin,'content-type':'application/json',authorization},body:JSON.stringify({requestId,action:'PLAN',expectedWorldVersion:before.worldVersion})});
        assert([200,202].includes(response.status));
        let receipt = await response.json();
        for (let i=0;i<40 && !['FINAL','REJECTED'].includes(receipt.status);i++) {
          await new Promise(resolve=>setTimeout(resolve,100));
          response = await fetch(base+'receipt?requestId='+requestId,{headers:{authorization}});
          assert.equal(response.status,200); receipt = await response.json();
        }
        check('actual-plan-final',receipt.status==='FINAL' && receipt.requestId===requestId);
        const checkpoint = await preserveIsolatedSocialOfficeCheckpoint(host,'DAY0');
        const checkpointRaw = await fs.readFile(checkpoint.path,'utf8');
        assert.equal(createHash('sha256').update(checkpointRaw).digest('hex'),checkpoint.sha256);
        const original = JSON.parse(checkpointRaw);
        check('checkpoint-contains-real-events-and-receipt',original.tables.authoritative_event.length>0 && original.tables.command_receipt.length>0);
        evidence.checkpoint = {path:checkpoint.path,sha256:checkpoint.sha256};
        const initialControl = await control();
        const systemIdentifier = initialControl.match(/^Database system identifier:\s+(\d+)$/mu)?.[1];
        assert.match(systemIdentifier ?? '',/^\d+$/u);
        evidence.initialSystemIdentifier = systemIdentifier;
        evidence.hostCleanup = await host.close(); closed=true;
        check('host-cleanup-zero-sessions',evidence.hostCleanup.status==='STOPPED' && evidence.hostCleanup.roleSessions===0 && evidence.hostCleanup.pgStatus===3);
        await assertOwned();
        const stoppedControl = await control();
        check('same-pgdata-cleanly-stopped',stoppedControl.includes('shut down') && stoppedControl.includes(systemIdentifier));
        await assert.rejects(fs.lstat(path.join(marker.data,'postmaster.pid')),{code:'ENOENT'});
        await run(path.join(marker.bin,'pg_ctl'),['-D',marker.data,'-l',path.join(marker.root,'linux-restart.log'),'-o',"-k "+marker.socket+" -p "+marker.port+" -c listen_addresses=''",'-w','-t','30','start'],{env:childEnv,timeout:35000});
        restarted=true;
        const pid = (await fs.readFile(path.join(marker.data,'postmaster.pid'),'utf8')).split('\n');
        assert.equal(pid[1],marker.data); assert.equal(pid[3],String(marker.port)); assert.equal(pid[4],marker.socket);
        postmaster={pid:pid[0],epoch:pid[2],os:await identity(pid[0])};
        assert.equal(postmaster.os.split(/\s+/u)[0],String(process.getuid()));
        pool = new Pool({host:marker.socket,port:marker.port,database:marker.database,user:'f_social_demo_bootstrap',max:1});
        const actual=(await pool.query("select current_database() as db,current_setting('data_directory') as data,current_setting('listen_addresses') as listen,(select system_identifier::text from pg_control_system()) as system_id")).rows[0];
        check('restart-same-actual-system-and-database',actual.db===marker.database && actual.data===marker.data && actual.listen==='' && actual.system_id===systemIdentifier);
        for (const [name,expected] of Object.entries(original.tables)) {
          assert.match(name,/^[a-z_]+$/u);
          const rows=(await pool.query('select to_jsonb(t) as row from world_v2.'+name+' t order by to_jsonb(t)::text')).rows.map(r=>r.row);
          assert.deepEqual(rows,expected,'persisted-table-'+name);
          checks.push({id:'persisted-table-'+name,status:'PASS',rows:rows.length});
        }
        evidence.actualRestartIdentity=actual;
      } finally {
        if (pool) await pool.end();
        if (host && !closed) evidence.hostCleanup=await host.close();
        if (restarted) {
          await assertOwned();
          const pid=(await fs.readFile(path.join(marker.data,'postmaster.pid'),'utf8')).split('\n');
          assert.equal(pid[0],postmaster.pid); assert.equal(pid[2],postmaster.epoch);
          assert.equal(await identity(postmaster.pid),postmaster.os);
          await run(path.join(marker.bin,'pg_ctl'),['-D',marker.data,'-m','fast','-w','-t','30','stop'],{env:childEnv,timeout:35000});
          await assert.rejects(fs.lstat(path.join(marker.data,'postmaster.pid')),{code:'ENOENT'});
          evidence.restartCleanup={status:'STOPPED',boundPID:postmaster.pid,foreignProcessTouched:false};
        }
        await fs.writeFile(output,JSON.stringify(evidence,null,2)+'\n',{mode:0o600});
      }
      console.log(JSON.stringify({status:'OWNED_LINUX_RESTART_ASSERTIONS_PASSED',checks:checks.length,evidence:output,sourceAdmitted:false,WorldClock:false}));
    `;
    const result = await run(
      process.execPath,
      ['--input-type=module', '-e', code],
      { cwd: root, timeout: 120_000, maxBuffer: 2 * 1024 * 1024 },
    );
    expect(JSON.parse(result.stdout.trim())).toMatchObject({
      status: 'OWNED_LINUX_RESTART_ASSERTIONS_PASSED',
      sourceAdmitted: false,
      WorldClock: false,
    });
    console.log(result.stdout.trim());
  }, 125_000);
});
