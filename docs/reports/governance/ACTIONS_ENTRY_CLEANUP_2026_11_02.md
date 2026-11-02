# Actions entry cleanup — 2026-11-02

Status: VERIFIED by explicit OWNER_FAST_TRACK_ACCEPTED, P2 foundation/tooling. Scope: CI entry consolidation; no authoritative application, schema, RLS, migration, deployment permission or economic behavior change. Owner acceptance is recorded below; no independent review is claimed.

## Authority and dependencies

The user explicitly requested Actions cleanup and clarified that the sidebar workflow entries, rather than run history, are the problem. Baseline main is `cd966907494ddee5d8a86f18f75989f0eff288ce`. Applicable governance: AGENTS.md, PLANS.md and `docs/governance/FAST_MAINLINE_REVIEW_POLICY.json`. The V09.1 preflight gate remains pending in progress.json; this change does not advance it or authorize production.

GitHub inventory returned 31 active workflows: 28 definitions in main, one Office workflow on an active development branch, and two GitHub-generated workflows. There are 767 historical runs. Neither historical runs nor artifacts were deleted. Main protection GET returned 404 and the rulesets list was empty; no protection settings were altered and 404 is not treated as proof of universal absence of protection.

## Change and coverage

Fourteen single-job, manual/legacy-branch workflows move into `world-specialist-checks.yml`. It offers a 14-choice dispatch input, rejects unknown choices and runs only the selected suite. All original jobs retain their services, env, command steps and artifacts. A complete job-definition comparison against the baseline passed for all 14; only IDs, selectors and one moved workflow's self-referential formatting path differ. Mapping and the old API IDs are recorded in `ACTIONS_ENTRY_CLEANUP_2026_11_02.json`.

Main's workflow-file count changes from 28 to 15. Existing PR workflows and release workflows remain independent; their job names and command checks are unchanged. `v09-postgres.yml` expands its PR path trigger from its own file to all workflow files, ensuring changes to the new manual entry also run the existing complete check. Legacy branch-specific push selectors remain, with path filtering broadened rather than removed coverage. The Office development workflow and GitHub-generated Pages/Dependency Graph entries are preserved.

No tests are deleted, skipped or weakened. The new manual selector is not a replacement for mandatory PR checks. The original plain readback-source job is also retained, even though its script is included in the native audit, to keep an inexpensive source-only option.

No permissions, credentials, migrations, source activation, Cloudflare HOLD deployment or clock operation are performed. GitHub Actions list/protection/run inspection uses the official REST API because the connected GitHub tools cannot list/manage repository workflows. Existing Git credentials are consumed in memory and are not printed or written into reports.

## Validation and evidence

Environment: Windows PowerShell, Node 24.20.0, pnpm 12.3.4, existing frozen dependency installation. Temporary actionlint is isolated under `.git/actions-cleanup-tools`, checked against the release SHA-256 `7f12f1801bca3d480d67aaf7774f4c2a6359a3ca8eebe382c95c10c9704aa731`; no global installation or lockfile change.

- Complete before/after job configuration comparison and branch/dispatch selector checks: 14/14 PASS, exit 0. Script retained locally as `.git/verify-actions-consolidation-20261102.mjs`.
- `actionlint.exe -shellcheck= -pyflakes= <all 15 workflow paths>`: PASS, exit 0. External shellcheck/pyflakes are not installed/enabled; this is workflow syntax/expression validation, not a claim those tools ran.
- `pnpm exec vitest run tests/architecture/world-web-shared-core-ci-prerequisites.test.ts tests/foundation/world-runtime-actions.test.ts`: PASS, 2 files / 27 tests, exit 0.
- `node scripts/foundation-gate-policy.mjs`: PASS, exit 0, no violations.
- The actual selector shell script was extracted from the workflow and executed with Git Bash: a valid source-audit selection exited 0, unknown selection exited 1; both expected outcomes PASS.
- Prettier check of both changed workflows, runbook and report/JSON: PASS, exit 0.
- `git diff --check`: PASS, exit 0; newly added files also have explicit Prettier checks.
- `node scripts/check-repository-secrets.mjs`: PASS, exit 0, 2,983 files scanned. Final staged diff is checked before commit.
- Actual GitHub dispatch of every database suite: NOT_RUN; the original jobs are preserved but not re-certified by static equivalence. Native PostgreSQL, full pnpm check and Linux runner behavior are not self-awarded PASS from this Windows inspection.

The initial PowerShell wildcard invocation of actionlint failed to expand filenames; it was corrected to an explicit array of workflow paths and that real invocation passed. Initial Node fetch to GitHub failed ECONNRESET; authenticated PowerShell REST inventory succeeded. These are not hidden as successful attempts.

## Release and stopping boundary

### Remote provenance correction discovered by real CI

Initial PR run `41384906951` failed the unchanged native job at `migration:validate`: `SOURCE_COMMIT_NOT_FOUND:0023_world_v2_production_consumption_posting`. Local validation passed because this machine retained cleanup backup refs. The preceding branch cleanup had removed `codex/f-production-posting-schema` on exact current-file equivalence, but its historical source commit `4714c1da7af9324741996b94c6da036bf54c39a4` was still a required manifest dependency. Tree equivalence alone was insufficient for that deletion.

The exact original source commit is now published under `refs/tags/provenance/migration-0023-4714c1da`, so existing full-history checkout can fetch it without restoring another work branch. This is a provenance anchor, not a release, schema mutation or permission approval. The migration manifest, SQL bytes and validation rules are unchanged. A subsequent remote-ref reachability check covers all 23 migration source commits: PASS, none missing. No CI failure was bypassed; the initial failed run remains historical evidence. The repaired candidate must pass a new real CI run before merge.

Push a reviewable branch and PR. Do not stop old workflows before the new definition is merged into main. After owner acceptance/merge, disable only the mapped old IDs, read back API states and count the remaining active definitions. No irreversible history deletion is needed or authorized by the user's clarification. Under the centralized policy, implementation cannot invent P2 OWNER_FAST_TRACK_ACCEPTED; main merge/acceptance remains a distinct step.

Affected owner: CI/operations; source/provenance/security/native database acceptance owners retain their checks. Legacy site and Supabase production impact: none. Rollback restores workflow files from baseline and enables their old IDs; no economic or database rollback. User instructions and original six untracked governance files remain intact.

## Completion and explicit owner acceptance

The project owner explicitly answered: `同意，CI 通过后合并并停用旧入口`. This grants P2 owner fast-track acceptance conditional on passing CI; it is not independent review or P0/ADR approval. Accepted implementation: `f5acddb82e407f15e33b5f4148f88adb18cec541`. Evidence: [CI run 41385170118](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/41385170118), both the unmodified complete pnpm check and native PostgreSQL V09/V10 job SUCCESS.

[PR #198](https://github.com/samuelq800/econmind-os-world-simulation/pull/198) merged as `9ea759e72802a64d61571c9a94ac0d08da618c64` only after that success. New workflow ID `404117964` is active. Its source-only suite was then really dispatched on merged main: [smoke run 41387463815](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/41387463815) SUCCESS, with exactly the selector and requested source-audit job successful; the other 13 suites were skipped as designed, not claimed as exercised.

All 14 old IDs were individually read back as `deleted` after their definitions were removed from main; they were already inactive, so no redundant disable PUT was needed. Total active GitHub workflow entries: **31 → 18**. Main definitions: **28 → 15**. The other three active entries are the Office development workflow and GitHub's Dependency Graph/Pages system workflows. Existing failed run `41384906951` remains readable; no run history or artifacts were deleted. Exact IDs, states, owner instruction and result metadata are recorded in the accompanying JSON.

This completion update only records already observed results. It does not change the accepted workflow implementation, create another approval or advance any economic gate.
