# B — start-ready supplemental CI candidate

Date: 2026-10-10, Asia/Shanghai.
Status: `IMPLEMENTED_UNVERIFIED`; pending C independent narrow review.
This is implementation evidence, not self-approval, merge or Gate B authority.

## Fixed source identity

- Repository: `samuelq800/econmind-os-world-simulation`.
- Base: `42991acfee9d0eacc702ba47a380c938a4516f03`.
- Base tree: `1254c4144279717c9075e9bbf07b4b2ac4710558`.
- Code candidate: `a7f938d5c97d095571072bb014f8d8ad9c179d73`.
- Code tree: `7bb474366ebd9b592248637a99fd8ce745a19c4e`.
- Independent branch: `codex/b-start-ready-candidate-ci-20261010`.
- Worktree: `/Users/samuel/Documents/econclub/.econmind-worktrees/b-start-ready-candidate-ci-20261010`.

The code commit adds exactly three files: the new workflow and two pure CI
support files. This subsequent report/evidence commit changes no code bytes.
The outer handoff records its final SHA/tree without recursive self-reference.
No A/C/D/F implementation was cherry-picked into this branch to prepare CI.

## Updated scope, not a second full pipeline

Root's later scope update supersedes the original unified-full proposal:
PR131 already triggers `.github/workflows/cloudflare-runtime-environment.yml`.
That unchanged workflow owns the unmodified complete `pnpm check`, existing
authenticated native roundtrip and real workerd/PostgreSQL jobs.

The new `.github/workflows/start-ready-candidate.yml` has **no full-check
invocation or manual full option**. It supplements only:

1. Four mandatory strict configurations:
   `tests/support/tsconfig.formal-financial-opening.json`,
   `tests/world-web/office-command.tsconfig.json`,
   `tests/world-core/writer-lease-supervisor.tsconfig.json`, and
   `tests/support/tsconfig.f-v09-native-claim.json`.
2. Shared Core/Worker dependency builds required by those consumers; no API/web
   build or broad test rerun is added.
3. The existing seven-case D supervisor PostgreSQL test, on a fresh CI service.
4. Actual checkout SHA/tree, raw logs/digests, command exit/signal and explicit
   `NOT_RUN` classifications, always retained after ordinary step failure.

Workflow triggers are `workflow_dispatch` with no inputs and `pull_request`
filtered to enumerated batch A/C/D/F paths plus this new CI's own files/report.
There is no push, pull_request_target, environment, deploy/publish, production
database, secret lookup or write permission. `contents: read` is the sole
permission; checkout does not persist credentials. Toolchain is Node24.20.0 /
pnpm12.3.4, with one frozen-lockfile install. Package/lockfiles are unchanged.

## Fail-closed execution and evidence

Initialization first writes the actual `git rev-parse HEAD` and `HEAD^{tree}`,
then verifies fixed-base ancestry, tracked cleanliness and all 19 required
combined inputs. Missing config/source/test fails, rather than paths-exist
skipping. This separate base-only branch intentionally cannot run the combined
checks until Root later composes reviewed changes with this reviewed CI.

Each compiler invocation explicitly adds `--noEmit --strict --skipLibCheck false`.
All four are attempted after successful install/build, even if an earlier
compiler fails; every individual nonzero exit remains FAIL. No vendor declaration
exclusion, test/guard/timeout change or test skip is introduced.

The helper has no full-check mode. Commands run as separate argv, without a
shell; each raw log is exclusively reserved before child startup. A completed,
running or failed stage cannot be automatically retried. stdout/stderr and exact
exit/signal are retained. Finalization records actual ending checkout, tracked
changes, workflow outcomes and SHA256 of logs/native JSON. `RUNNING`, `NOT_RUN`,
skipped steps, dirty source and partial/failed checks cannot become supplemental
PASS. Success is only `PASS_SUPPLEMENTAL_CI_ONLY_FULL_SEPARATE`, never package,
production or full-suite approval. Upload runs with `always()`; a failure before
checkout makes the repository helper unavailable and cannot yield a PASS receipt.

### D disposable native boundary

Inspected fixed D `3b4406eb8129fffa8c54433433b11b8c6d25b03a` test and existing
`scripts/v09-postgres-test-environment.mjs`, unchanged here. CI uses only
`postgresql://postgres@127.0.0.1:5432/econmind_v09_d_supervisor_ci` in the native
step, `ECONMIND_ENV=ci`, and `world-v2-v09-test-ci`. The GitHub service is disposable
`postgres:16-alpine`; no production credential is needed. Other steps receive
no database URL.

The existing environment guard runs before Vitest and again before the test's
first connection. It rejects runtime/Supabase/PG overrides, query/fragment or
noncanonical URLs, non-loopback and credential-bearing targets. The existing
test checks actual loopback/database identity and an absent world_v2 schema;
its frozen fixture validates the complete current migration provenance, then
installs only the existing exact 0001–0006 prefix. Existing isolated roles/grants
are test-only. No new SQL, guard relaxation, reset/drop or production chain exists.
The CI helper requires JSON success, exactly seven passing tests and zero failed
or pending tests; an exit0 empty/skipped suite is not native evidence.

This future CI native execution is **NOT_RUN** in this implementation turn.
No local database/service was started to validate it. C should independently
inspect applicability and the actual workflow before any separate CI execution.

### F native remains explicitly separate

Inspected F's original receipt and later provenance guard source. The two native
cases require an owned local generation, fixed macOS data directory/database,
PG160015 identity and a specific system identifier; these are not a portable
CI fixture. F was not modified or falsely enabled. CI receipt always records
F native `NOT_RUN`, with the pinned producer receipt and independent D review:

- F candidate `d9853754b3eb2080a5ac4d30c71cae4db013fe0c`.
- D review `docs/reports/start-ready-20261010/reviews/D_F_review.md`, SHA256
  `2ff88ab43b861eb9f9963c039985962c8830874d247ea6bc1ce98ab97efe1c2e`.
- Original native JSON SHA256
  `fbba98a2b2214b1ea05cc512eaaa4a468af37e5abbabc28a5bdd9d6de3008fd7`.

These are references, not reruns. D's approval preserved the original pre-run
Core-dist provenance limitation; the new CI does not retrospectively erase it
or approve any subsequent F provenance change.

## Existing full workflow: observed failure, not inherited PASS

Read-only live metadata/raw job logs for run `38048771913`, attempt1,
job `114203506317`, show:

- Metadata head: `95926300c35645d9a684ec7dedd51114e1962935`.
- Actual checkout/git-log: `a61a26a90a0ea932401caa9f529a18a25eca0697`.
- Commit API tree: `3bbed0dae40a2cc85b414e1a87893f514d26da7a`.
- Unmodified `pnpm check` reached lint, then failed `pnpm format:check` on
  `docs/reports/start-ready-20261010/C/REPORT.md`, exit1.
- Following authenticated native step: `SKIPPED`; artifact upload succeeded.

This observation was reported promptly to Root. No fix, rerun or dispatch was
made here, and this historical run is not the new CI candidate's result.
Future full evidence must match its own actual checkout SHA/tree. Nothing in
this new candidate delays normal acceptance of separately reviewed PR131 source.

## Actual bounded validation

At code candidate `a7f938d`, Node24.20.0:

- `node --test tests/support/start-ready-candidate-ci.test.mjs`: 10 PASS,
  0 FAIL/SKIP, exit0. Pure controls only; never invokes compiler/full/native DB.
- Real ESLint on both support files: exit0. Initial draft had five
  `no-regex-spaces` errors; fixed before freezing without suppression.
- Prettier on workflow and both support files: exit0.
- `node --check` on both files: exit0.
- Ruby YAML parse, exact readonly permissions/one-job check, `bash -n` on every
  actual run block: exit0. actionlint was not installed and is `NOT_RUN`.
- Read-only governance validator: 14 PASS, exit0; no gate/status mutation.
- Secret sanity: 2355 scanned files, exit0. Explicit empty-credential local
  environment sanity: exit0, NOT_LINKED, no configured database/mutation.
- Actual CLI initialize on this noncombined branch: expected exit1, all 19
  missing inputs named, actual fixed code SHA/tree retained in receipt.
- Actual CLI finalize afterward: expected exit1 / `FAIL_OR_NOT_RUN`; all builds,
  compilers and native remain NOT_RUN. Exact receipt assertions passed.
- `git diff --check base HEAD`: exit0; three code additions only, clean checkout.

Raw captured command outputs/actual exit codes are in `UNIFIED_CI_EVIDENCE.json`.
Local lint/format used a read-only node_modules link to the existing A checkout;
no dependency install or build was run here. No full/420/browser/native/CI
dispatch, cloud mutation, push, merge or status promotion took place.

## Handoff and STOP

Affected owner: CI only, invoking unchanged reviewed/test contracts when later
composed. No economic owner, public API, schema, migration provenance, existing
HOLD workflow/source pin, package/lock, permissions or status was edited.
No new economic/architecture decision is requested or self-approved.

Root should hand this fixed candidate to C for independent narrow review of
workflow scope, strict flags, native guard/prefix applicability, skip/failure
classification and actual-source receipts. The implementation agent does not
award APPROVED, append it to PR131, push, merge, dispatch or promote it. STOP.
