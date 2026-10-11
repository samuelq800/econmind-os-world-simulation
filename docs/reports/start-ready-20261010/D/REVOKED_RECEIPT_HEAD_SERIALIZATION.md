# D — revoked receipt negative-predicate serialization

Date: 2026-10-11 (assignment 2026-10-10). IMPLEMENTED_UNVERIFIED.
Root-assigned isolated mechanical compatibility candidate; independent review
required. Not an E-I01 closure, real-source registration, production approval,
activation, Gate B, deployment or merge. Freeze and STOP after handoff.

## Fixed identity and scope

- Repository: `https://github.com/samuelq800/econmind-os-world-simulation`.
- Worktree: `/Users/samuel/Documents/econclub/.econmind-worktrees/d-revoked-receipt-head-lock-20261010`.
- Branch: `codex/d-revoked-receipt-head-lock-20261010`.
- Base: local `origin/main` snapshot `eb033a4d9e717a9cb9149e450900b606c3457403`,
  tree `13a60f04c1a9c54eb8ffbaca8b469bf25b293dce`; no fetch or remote-current claim.
- Implementation commit: `6c8eb4e7d687bbc7ba827bd808d0983e5281fc92`.
- Final code/test commit: `81a7d66daaf5a2a5f56aa0a257c0fa7d2d149fcc`,
  tree `cf1b7a33922249dfaaa557938b730c2559348724`.
  The latter only removes an unused native-test variable initializer.
- Canonical code delta SHA256:
  `f99e625d21b79f0730853da69ace3d0eba09032c4f943c27347e3187916843bb`
  (`git diff --binary --full-index --no-renames --no-ext-diff --no-color BASE CODE`).
- Product boundary: only `recordZeroEffectReceipt` in
  `apps/world-worker/src/persistence/atomic-transition-repository.ts`, 23 added
  lines. Six added test/support/config files, plus this report. No other product
  file, Core, approval store, SQL, migration, DCL, manifest, admission, source,
  opening data, status/gate or preview change. A/B/G ownership respected.

Read completely: current AGENTS/PLANS and C's fixed review
`C_CURRENT_AUTHORIZATION_WRITER_DESIGN_REVIEW/review.md` under managed collection
`o-owner-inputs-exact-20261010/artifacts-7c60b5ca12d34d85296a0b822c3e569cfac7d802a7e835c3a45003f825d27f98`.
Its zero-effect section identifies S→negative A→receipt/Q without H.
Current status/progress still records V09 PLANNED/not ready; this explicit
bounded preparation does not advance that gate.

## Implemented transaction contract

After durable S identity/intent validation and existing-receipt readback:

`S → existing lease row FOR SHARE → same-World H FOR UPDATE → negative A → R → original lease/fence/expiry read → Q → outer COMMIT`.

Both new locks use only the command's World ID. H must return exactly one row;
zero/null/extra counts fail closed before authority or writes. H remains held
through receipt insert, queue finalization and the adapter's actual COMMIT.
The unchanged SQL authority guard reads after H, so a missing active A row is
serialized with cooperating H-first activation/revocation writers.

Important engineering correction to the literal H-only recipe: the existing
zero-effect finalizer already reads the lease FOR SHARE. Adding H alone puts
that branch at H→lease against the positive guard's lease→H, and actually
deadlocked in the isolated native witness. Therefore this branch first takes
the **existing** lease row's shared lock. It does not require a row, inspect
holder/fence/expiry, execute a commit guard or create/acquire/renew any lease
there. The original validation remains unchanged at finalization. This is a
local compatibility lock, not a new lease policy or global lock reorder.

Unchanged:

- Existing immutable receipt wins before either new lock or reauthorization;
  exact retry after later activation returns that original refusal.
- Ordinary REJECTED receipts follow their original path, with no new H lock.
- The original current lease/holder/fence/explicit recorded-time cutoff and Q
  update rules still reject invalid finalization, rolling back R and Q together.
- Positive `commit`, S→lease→H guard, economic/version/event logic, fault hooks,
  receipt format, adapter transaction/UNKNOWN behavior and retry policy.

This is only consumer compatibility. H does not itself enforce the future
writer ACL or register an authentic authorization source. Raw-DML/non-bypass,
upstream cutoff, registration and other consumers remain their owners' gates.

## Final executed evidence

Pinned Node 24.20.0:
`/Users/samuel/.cache/npm/_npx/460b723c8ad28bd7/node_modules/node/bin/node`.
Pinned pnpm 12.3.4:
`/Users/samuel/.cache/node/corepack/v1/pnpm/12.3.4/bin/pnpm.mjs`.
PATH places that Node bin first; install was offline/frozen, 161 reused and zero
downloads; package files and lockfile unchanged. Real `pnpm run preinstall`
confirmed both versions (exit0), without fabricating a package-manager agent.

Final results are separate invocations, never summed across attempts:

| Check                                                                        | Actual result                                                 |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Focused SQL-shape tests                                                      | 5 PASS                                                        |
| Serial actual-schema PGlite functional tests                                 | 6 PASS                                                        |
| Existing repository preparation regression                                   | 29 PASS                                                       |
| Existing genuine Core authorization-cutoff regression                        | 1 PASS                                                        |
| Existing Worker authoritative-execution regression                           | 2 PASS                                                        |
| Above five-file invocation (`verified-focused.json`)                         | 43 PASS / 0 FAIL / 0 SKIP, exit0                              |
| Final native suite (`proof-native.json`), code81a7d66                        | 12 PASS / 0 FAIL / 0 SKIP, exit0                              |
| Dedicated product/native/scripted strict TS, `--strict --skipLibCheck false` | exit0                                                         |
| Embedded strict TS using inherited existing V09 PGlite configuration         | exit0; inherited `skipLibCheck:true` explicitly retained      |
| Filtered Core/Worker build                                                   | exit0                                                         |
| Focused ESLint, seven-source/config Prettier check, diff check               | exit0                                                         |
| Architecture boundary                                                        | PASS, 334 files                                               |
| Authoritative pattern check                                                  | PASS, 329 files / 91 Core files                               |
| Repository secrets                                                           | PASS, 2462 files before report addition                       |
| Clean-env local environment check                                            | PASS / NOT_LINKED / databaseConfigured:false / mutation:false |

Exact focused command: pinned Node `node_modules/vitest/vitest.mjs run`
`tests/world-core/d-revoked-receipt-head-lock.test.ts`
`tests/world-core/d-revoked-receipt-head-lock-embedded.test.ts`
`tests/world-core/v09-atomic-repository-preparation.test.ts`
`tests/world-core/v09-commit-authorization-cutoff.test.ts`
`tests/world-core/v09-worker-authoritative-execution.test.ts`
`--reporter=json --outputFile=.../verified-focused.json` under `env -i`, explicit
PATH/LANG=C/LC_ALL=C, with no database URL.

Native uses the same Node/Vitest entry with only
`tests/world-core/d-revoked-receipt-head-lock-postgres.test.ts`, plus explicit
`ECONMIND_ENV=local`, `V09_TEST_DATABASE_FINGERPRINT=world-v2-v09-test-local`,
`V09_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:59729/econmind_v09_d_revoked_proof`.
Reporter output is `proof-native.json`. No runtime URL or PG override variable.

Strict projects are `tests/world-core/d-revoked-receipt-head-lock.tsconfig.json`
and `d-revoked-receipt-head-lock-embedded.tsconfig.json`, each `--noEmit --strict`;
the first additionally uses `--skipLibCheck false`. Build is pinned pnpm
`--filter @econmind/core --filter @econmind/world-worker build`.
Lint targets the product file, new helper and three tests. Format includes both
new configs. Boundary/pattern/secrets/environment use their unchanged scripts.

### What the twelve native cases establish

Distinct ordinary nonadmin/no-membership logins; exact mutable-column H rights,
not table UPDATE or identity UPDATE. Actual schema and unchanged actual guard:

- NOWAIT witness: H remains locked after real R and Q writes, before COMMIT;
  outside observers still see no R and the old CLAIMED queue.
- Refusal-first blocks both inactive-row activation and absent-row insertion
  until refusal COMMIT; later activation does not rewrite the final receipt.
- Writer-first activation commits while refusal waits for H; fresh post-H read
  rejects with AUTHORIZATION_DENIED and leaves R absent/Q CLAIMED.
- Writer-first revoke permits refusal only after that writer commits.
- Active-first denial rolls back; later H-first revoke permits exact retry.
- Both orders against the actual unchanged positive SQL guard complete without
  a lock cycle. These execute the guard only, NOT an economic positive commit.
- Another World's H is not locked; expired lease retains WRITER_FENCE_STALE;
  missing column UPDATE on H fails with42501 and zero writes, repaired only by
  restoring the original exact disposable fixture column grant.

## Native provenance and precise grants

All generations self-owned, listen only127.0.0.1:59729 plus their own Unix socket,
PG16.15 Homebrew, disposable trust authentication, never a shared/production DB.
Unchanged environment guard and frozen migration fixture validate complete
current Git/artifact provenance BEFORE Pool creation. Only exact0001..0012
executed in each fresh DB; no0022, no later migration, no veto removed, no
synthetic opening/admission or formal source. This is NOT a full-chain rehearsal.

Final generation `/tmp/d-revoked-receipt-pg-proof-Iqs3Eg/data`:
system identifier `7695224462033039022`; DB `econmind_v09_d_revoked_proof`;
READ COMMITTED observed. Final retained facts: schema releases12, submissions12,
refusal receipts9; events/inventory/financial/audit/materialization/outbox all0.
World heads stay version/sequence0. Operational claim leases are TEST_ONLY facts.

Two LOGIN roles have NOINHERIT, no memberships, no superuser/BYPASSRLS/CREATEDB/
CREATEROLE/replication. Both: schema USAGE, H SELECT+UPDATE(world_version).
Consumer: S SELECT+UPDATE(command_type) for row locking; R SELECT+INSERT;
Q SELECT+UPDATE(queue_state,finalized_at_real); A SELECT+UPDATE(active) for KEY SHARE;
lease SELECT+UPDATE(renewed_at_real) for existing shared row locks; event SELECT
for the unchanged receipt validator. Writer fixture: A SELECT+INSERT+
UPDATE(active,authorization_version,refreshed_at_real). These are precise
**disposable test grants**, not production provisioning or a publisher ACL proof.
The fixture writer uses direct DML under H; it is not A's future registered writer.

Six retained generations: `d-revoked-receipt-pg-kaA5D8`,
`d-revoked-receipt-pg-final-9ypiEL`, `d-revoked-receipt-pg-cycle-XkTaso`,
`d-revoked-receipt-pg-cycle2-JYtOmE`, `d-revoked-receipt-pg-verified-I1NvFu`,
`d-revoked-receipt-pg-proof-Iqs3Eg`, all under `/tmp`.
All stopped with owned `pg_ctl -m fast -w stop`; status exit3/no server running.
Nothing deleted. No long-running/concurrent-load test.

## Retained failures and limitations

1. Initial install used pinned Node to invoke pnpm but lifecycle PATH selected
   ambient Node26.5; failed preinstall. Corrected PATH, no engine-policy edit.
   Direct toolchain-script invocation later lacked pnpm's real user agent and
   failed; actual pinned `pnpm run preinstall` passed. Both are invocation errors.
2. Initial embedded run: 2 PASS / 4 FAIL. Missing H caused two intended failures;
   historical PGlite SELECT affectedRows semantics caused one fixture mismatch;
   forbidden lease-expiry shortening caused another. Corrected only this test's
   SELECT row-count adapter and used a later explicit receipt time, never removed
   lease triggers or changed shared adapters. Corrected baseline:4 PASS/2 FAIL.
3. Pre-fix native NOWAIT witness:0 PASS/1 FAIL/9 name-filtered. Another login could
   lock H while R/Q were uncommitted. This is the original missing-lock witness.
4. H-only candidate initially10 native PASS, but was NOT promoted. Added actual
   positive-prefix compatibility witness exposed a real PostgreSQL deadlock.
   First observation attempt stopped on a transient wait-event snapshot; bounded
   observation now requires BOTH blocking PID and Lock event, no assertion waived.
   Corrected witness:0 PASS/1 FAIL/10 name-filtered; server log records the lease
   finalizer and actual commit guard cycle. Product fix is the local pre-lease
   row lock, not SQL/grant/positive-guard changes. Final12 native PASS are separate.
5. Initial full declaration strict check failed six upstream PGlite Emscripten
   declaration errors. Kept that failure; split scripted/native strict project
   (library checking ON) from embedded tests inheriting unchanged repository
   PGlite configuration. No blanket full-dependency-strict PASS claim.
6. Boundary check launched before concurrent Worker build finished failed nine
   unresolved dist-backed exports; after build PASS, no resolver-policy change.
   ESLint later found one unused witness initializer; removed it only, strict,
   lint and final native proof on81a7d66 passed. No rule disabled.

Old E-I02 60/36/7, full/420, live CI, network/production, E9/synthetic suites,
other owners' compatibility, real-source/ACL integration and end-to-end positive
economic transition: NOT_RUN here. No push, PR, merge, deployment or runtime
activation.4198 preview files/process were not operated on or changed.

## Evidence handoff

Managed collection:
`/Users/samuel/.codex/state/plugins/codex-security/scans/d-revoked-receipt-head-lock-20261010/artifacts-91211b81606b703e12367571ac3a55c8ad1b5d6424df727d0a2a12dc45db3e13/artifacts/D_REVOKED_RECEIPT_HEAD/`.
Original execution files retained in `/tmp/d-revoked-receipt-evidence-DY86GM`;
raw PostgreSQL logs copied from the six owned generations, not transcribed.
Freeze JSON binds final tip/tree/deltas, file hashes, commands/results, raw logs,
native identities and stop statuses. Final tip/delta are recorded there outside
the report to avoid a self-referential commit hash.

- `proof-native.json` SHA256 `4644e4054a1f4ef93639243ba918bb23465a626abfa6a123595fd290a8382c07`.
- `verified-focused.json` SHA256 `b75fd11dee73450d35cc8043fa003bfbbef992bd1549912ff4d205fede19deaf`.
- `cycle2-native.json` SHA256 `49bc2ced153db5fa476c4ecdba15e5725438105bca156e61ef58ac1b9fee4cb7`.
- `baseline-native.json` SHA256 `a72e60d83c2695933112a3f7992a6009bdb0e5e00a2ac039d7b638a2a0a33d0e`.
- `baseline-unit.json` SHA256 `6029da68acb8bd905038edb77170a044e0add444ebae61806afe03df259bed80`.

Root/non-implementer review must assess the local lease-before-H correction as
well as the negative-predicate proof. Candidate remains IMPLEMENTED_UNVERIFIED;
neither these green checks nor this report self-approve a P0 change.
