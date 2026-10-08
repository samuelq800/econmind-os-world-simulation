// TEST_ONLY: real PGlite transaction/request, no network/native/prod caller.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import {
  PRODUCTION_POSTING_RELEASE as fixed,
  prepareProductionPostingRelease,
  productionPostingPolicyFingerprint,
  productionPostingUnknownOutcome,
  verifyProductionPostingReadback,
} from '../../scripts/production-posting-release-policy.mjs';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const fingerprint = await productionPostingPolicyFingerprint();
function options(phase = 'publish') {
  return {
    repositoryRoot,
    migrationId: fixed.migrationId,
    namespace: 'world_v2',
    phase,
    lock: `${phase === 'publish' ? 'PUBLISH_GO' : 'READBACK_GO'}:${fingerprint}`,
    confirmation:
      phase === 'publish'
        ? 'RELEASE_WORLD_V2_PRODUCTION_POSTING_ONCE'
        : 'READBACK_WORLD_V2_PRODUCTION_POSTING_ONLY',
  };
}
const publish = await prepareProductionPostingRelease(options());
const readback = await prepareProductionPostingRelease(options('readback'));
const gitBytes = (ref) =>
  execFileSync('git', ['--no-replace-objects', 'show', ref], {
    cwd: repositoryRoot,
    env: {
      PATH: '/usr/bin:/bin',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
    },
  });

test('selects fixed PR114 Git bytes even though current HEAD/main lacks 0023', () => {
  assert.equal(fixed.sourceCommit, '7461a053a74131fcc8273a8ac981e28b510ca03c');
  assert.equal(
    fixed.artifactSource,
    '4714c1da7af9324741996b94c6da036bf54c39a4',
  );
  const artifact = gitBytes(
    `${fixed.sourceCommit}:${fixed.artifactPath}`,
  ).toString('utf8');
  assert.ok(publish.request.query.includes(artifact));
  assert.ok(!readback.request.query.includes(artifact));
  assert.equal(publish.callerRegistration, 'NOT_REGISTERED');
  assert.equal(publish.callerReadiness, 'CALLER_NOT_READY');
  assert.ok(Object.isFrozen(publish) && Object.isFrozen(publish.request));
});

for (const [name, change, code] of [
  ['0024', { migrationId: '0024_world_v2_unreviewed' }, 'SELECTOR_DENIED'],
  ['foreign namespace', { namespace: 'public' }, 'SELECTOR_DENIED'],
  ['arbitrary SQL', { sql: 'select 1' }, 'OPTIONS_INVALID'],
  ['moving source', { sourceCommit: 'main' }, 'OPTIONS_INVALID'],
  ['unrecognized phase', { phase: 'retry' }, 'PHASE_INVALID'],
  ['missing lock', { lock: '' }, 'PHASE_HOLD'],
  ['stale fingerprint', { lock: 'PUBLISH_GO:' + '0'.repeat(64) }, 'PHASE_HOLD'],
  [
    'readback lock cannot publish',
    { lock: `READBACK_GO:${fingerprint}` },
    'PHASE_HOLD',
  ],
  [
    'readback confirmation cannot publish',
    { confirmation: 'READBACK_WORLD_V2_PRODUCTION_POSTING_ONLY' },
    'PHASE_HOLD',
  ],
  ['invalid repository', { repositoryRoot: '/dev/null' }, 'GIT_SOURCE_INVALID'],
]) {
  test(`denies ${name}`, async () => {
    await assert.rejects(
      prepareProductionPostingRelease({ ...options(), ...change }),
      new RegExp(`POSTING_RELEASE_${code}`, 'u'),
    );
  });
}
test('module-private plan identity cannot be reconstructed', () => {
  assert.throws(
    () => productionPostingUnknownOutcome({ ...publish }),
    /PLAN_NOT_REGISTERED/u,
  );
  assert.throws(
    () =>
      verifyProductionPostingReadback(JSON.parse(JSON.stringify(readback)), []),
    /PLAN_NOT_REGISTERED/u,
  );
});
test('uncertain transport or proof outcome is always stop/no replay', () => {
  for (const plan of [publish, readback]) {
    const result = productionPostingUnknownOutcome(plan);
    assert.equal(result.status, 'UNKNOWN_STOP_NO_RETRY');
    assert.equal(result.retryAllowed, false);
    assert.equal(result.economicActivation, false);
    assert.equal(result.schemaAdmitted, false);
  }
});

async function response(database, plan) {
  const results = await database.exec(plan.request.query);
  const result = results.find(
    (r) =>
      r.rows.length === 1 &&
      Object.hasOwn(r.rows[0], 'production_posting_release_evidence'),
  );
  assert.ok(result, 'real SQL must return the requested readback');
  return result.rows;
}
test('real historical22 -> exact0023 atomic request and actual idempotent readback', async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon nologin; create role authenticated nologin;
      create schema storage; create table storage.objects(bucket_id text);
      alter table storage.objects enable row level security;
      create table public.test_only_sentinel(id integer primary key, value text);
      insert into public.test_only_sentinel values(1,'preserve');`);
    const manifest = JSON.parse(
      gitBytes(`${fixed.sourceCommit}:database/migrations/manifest.json`),
    );
    for (const entry of manifest.migrations.slice(0, 22)) {
      await db.exec(
        gitBytes(`${fixed.sourceCommit}:${entry.path}`).toString('utf8'),
      );
      await db.query(
        `insert into world_v2.schema_release
        (migration_id,artifact_sha256,source_repo_commit,release_order) values($1,$2,$3,$4)`,
        [
          entry.migration_id,
          entry.sha256,
          entry.artifact_source_commit,
          entry.release_order,
        ],
      );
    }
    const before = await response(db, readback);
    await t.test(
      'real 22-ledger recognized, publish not falsely proven',
      () => {
        const result = verifyProductionPostingReadback(readback, before);
        assert.equal(result.status, 'BASELINE_METADATA_MATCH');
        assert.equal(result.observedLedger.length, 22);
        const wrongPhase = structuredClone(before);
        wrongPhase[0].production_posting_release_evidence.phase = 'publish';
        assert.throws(
          () => verifyProductionPostingReadback(publish, wrongPhase),
          /PUBLICATION_NOT_PROVEN/u,
        );
      },
    );
    await t.test(
      'actual ledger hash conflict stops before any 0023 DDL',
      async () => {
        await db.query(
          'update world_v2.schema_release set artifact_sha256=$1 where release_order=22',
          ['f'.repeat(64)],
        );
        const conflict = verifyProductionPostingReadback(
          readback,
          await response(db, readback),
        );
        assert.equal(conflict.status, 'CONFLICT');
        await assert.rejects(
          db.exec(publish.request.query),
          /BEFORE_LEDGER_CONFLICT/u,
        );
        await db.exec('rollback;');
        const fn = await db.query(
          "select to_regprocedure('world_v2.production_decimal(jsonb,boolean)')::text as fn",
        );
        assert.equal(fn.rows[0].fn, null);
        await db.query(
          'update world_v2.schema_release set artifact_sha256=$1 where release_order=22',
          [manifest.migrations[21].sha256],
        );
      },
    );
    await t.test(
      'post-DDL/pre-commit failure rolls back artifact and release row',
      async () => {
        await db.exec(`create function world_v2.test_only_fail_release() returns trigger language plpgsql as $$
        begin raise exception 'TEST_ONLY_PRE_COMMIT_FAILURE'; end; $$;
        create trigger test_only_fail_release before insert on world_v2.schema_release
        for each row when(new.release_order=23) execute function world_v2.test_only_fail_release();`);
        await assert.rejects(
          db.exec(publish.request.query),
          /TEST_ONLY_PRE_COMMIT_FAILURE/u,
        );
        await db.exec('rollback;');
        assert.equal(
          verifyProductionPostingReadback(
            readback,
            await response(db, readback),
          ).status,
          'BASELINE_METADATA_MATCH',
        );
        assert.equal(
          (
            await db.query(
              "select to_regprocedure('world_v2.production_decimal(jsonb,boolean)')::text as fn",
            )
          ).rows[0].fn,
          null,
        );
        await db.exec(
          'drop trigger test_only_fail_release on world_v2.schema_release; drop function world_v2.test_only_fail_release();',
        );
      },
    );
    await t.test(
      'once-only exact publication, not source metadata masquerading as readback',
      async () => {
        const actual = await response(db, publish);
        const result = verifyProductionPostingReadback(publish, actual);
        assert.equal(result.status, 'APPLIED_METADATA_MATCH');
        assert.equal(result.observedLedger.length, 23);
        assert.deepEqual(result.observedLedger.at(-1), {
          migration_id: fixed.migrationId,
          artifact_sha256: fixed.artifactHash,
          source_repo_commit: fixed.artifactSource,
          release_order: 23,
        });
        assert.equal(result.economicActivation, false);
        assert.equal(result.schemaAdmitted, false);
        assert.equal(result.retryAllowed, false);
        assert.equal(result.callerRegistration, 'NOT_REGISTERED');
        assert.ok(
          (
            await db.query(
              "select to_regprocedure('world_v2.production_decimal(jsonb,boolean)')::text as fn",
            )
          ).rows[0].fn,
        );
        assert.deepEqual(
          (await db.query('select * from public.test_only_sentinel')).rows,
          [{ id: 1, value: 'preserve' }],
        );
        assert.deepEqual(
          (
            await db.query(
              "select policyname from pg_policies where schemaname='storage' order by policyname",
            )
          ).rows,
          [
            { policyname: 'world_v2_snapshot_objects_delete_deny' },
            { policyname: 'world_v2_snapshot_objects_insert_deny' },
          ],
        );
      },
    );
    await t.test(
      'duplicate publication cannot replay non-idempotent DDL',
      async () => {
        await assert.rejects(
          db.exec(publish.request.query),
          /BEFORE_LEDGER_CONFLICT/u,
        );
        await db.exec('rollback;');
        for (let i = 0; i < 2; i++) {
          const result = verifyProductionPostingReadback(
            readback,
            await response(db, readback),
          );
          assert.equal(result.status, 'APPLIED_METADATA_MATCH');
          assert.equal(result.observedLedger.length, 23);
        }
        assert.equal(
          (
            await db.query(
              'select count(*)::int as n from world_v2.schema_release where release_order=23',
            )
          ).rows[0].n,
          1,
        );
      },
    );
    await t.test(
      'commit response lost means UNKNOWN; readback is separately held and read-only',
      async () => {
        assert.equal(
          productionPostingUnknownOutcome(publish).status,
          'UNKNOWN_STOP_NO_RETRY',
        );
        const result = verifyProductionPostingReadback(
          readback,
          await response(db, readback),
        );
        assert.equal(result.status, 'APPLIED_METADATA_MATCH');
        assert.equal(result.retryAllowed, false);
        assert.match(readback.request.query, /^begin read only;/u);
        assert.doesNotMatch(
          readback.request.query,
          /\b(?:insert|update|alter|create|delete)\b/iu,
        );
      },
    );
    await t.test(
      'unknown registered0024 readback is conflict, never implicitly accepted',
      async () => {
        await db.query(
          `insert into world_v2.schema_release(migration_id,artifact_sha256,source_repo_commit,release_order)
        values($1,$2,$3,$4)`,
          [
            '0024_world_v2_test_only_unknown',
            'a'.repeat(64),
            'b'.repeat(40),
            24,
          ],
        );
        const actual = await response(db, readback);
        assert.equal(
          verifyProductionPostingReadback(readback, actual).status,
          'CONFLICT',
        );
        const asPublish = structuredClone(actual);
        asPublish[0].production_posting_release_evidence.phase = 'publish';
        assert.throws(
          () => verifyProductionPostingReadback(publish, asPublish),
          /PUBLICATION_NOT_PROVEN/u,
        );
        await db.query(
          'delete from world_v2.schema_release where release_order=24',
        );
      },
    );
    await t.test(
      'every provenance field, missing/extra/duplicate row and invalid response is refused',
      async () => {
        const actual = await response(db, readback);
        for (const field of [
          'migration_id',
          'artifact_sha256',
          'source_repo_commit',
          'release_order',
        ]) {
          const changed = structuredClone(actual);
          const row =
            changed[0].production_posting_release_evidence.ledger_entries[22];
          row[field] =
            field === 'release_order'
              ? 24
              : field === 'migration_id'
                ? '0023_wrong'
                : field === 'artifact_sha256'
                  ? '0'.repeat(64)
                  : '0'.repeat(40);
          assert.equal(
            verifyProductionPostingReadback(readback, changed).status,
            'CONFLICT',
          );
        }
        for (const mutate of [
          (rows) => rows.splice(0, 1),
          (rows) => rows.push(rows[22]),
          (rows) => rows.reverse(),
        ]) {
          const changed = structuredClone(actual);
          mutate(changed[0].production_posting_release_evidence.ledger_entries);
          assert.equal(
            verifyProductionPostingReadback(readback, changed).status,
            'CONFLICT',
          );
        }
        for (const changed of [
          [],
          {},
          [actual[0], actual[0]],
          [{ evidence: actual[0] }],
        ])
          assert.throws(
            () => verifyProductionPostingReadback(readback, changed),
            /RESPONSE_INVALID/u,
          );
        const extra = structuredClone(actual);
        extra[0].production_posting_release_evidence.ledger_entries[22].arbitrary_value =
          'not allowed';
        assert.throws(
          () => verifyProductionPostingReadback(readback, extra),
          /RESPONSE_INVALID/u,
        );
        for (const [key, value] of [
          ['namespace', 'public'],
          ['phase', 'publish'],
          ['source_commit', 'main'],
          ['policy_fingerprint', 'wrong'],
        ]) {
          const changed = structuredClone(actual);
          changed[0].production_posting_release_evidence[key] = value;
          assert.throws(
            () => verifyProductionPostingReadback(readback, changed),
            /RESPONSE_INVALID/u,
          );
        }
      },
    );
    await t.test(
      'wrong registered22 source commit cannot pass atomic SQL preflight',
      async () => {
        // Locally reset only the TEST_ONLY ledger to baseline; no SQL artifact replay.
        await db.query(
          'delete from world_v2.schema_release where release_order=23',
        );
        await db.query(
          'update world_v2.schema_release set source_repo_commit=$1 where release_order=22',
          ['0'.repeat(40)],
        );
        await assert.rejects(
          db.exec(publish.request.query),
          /BEFORE_LEDGER_CONFLICT/u,
        );
        await db.exec('rollback;');
        assert.equal(
          (
            await db.query(
              'select count(*)::int as n from world_v2.schema_release',
            )
          ).rows[0].n,
          22,
        );
      },
    );
  } finally {
    await db.close();
  }
});
