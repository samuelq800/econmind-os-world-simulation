# V11–V18 Foundation Mainline Integration Checklist

**State:** `INTEGRATION_CANDIDATE_PENDING_FINAL_B_REVIEW`
**Base:** `origin/main` = `0720a57b56394a577d34534356aa784a8bef9d22`
**Companion plan:** `docs/exec-plans/V11_V18_FOUNDATION_MAIN_INTEGRATION.md`

This checklist is a control record, not an integration authorization. Every unchecked item remains a hard stop.

## Establish the candidate

- [x] Owner-authorized F source set is bound to `5356fe93932eb285b3c21977a655e4c6e7bb6746` and selectively integrated by the exact commits in the integration evidence.
- [x] V11 isolated code, reviewed evidence, and immutable governance source records are bound in the integration evidence; historical V11 branches were not merge targets.
- [x] V12 code/evidence/acceptance source `b0c04ab3e2bbb87edface2c652949d3c3cfcca21` → `899bcb1a750d01be812fde9eee3fa0fd82357b42` is selectively integrated as `FOUNDATION_REVIEWED_NONPRODUCTION` input only.
- [x] V13/V14 B target `653c1cba9681798260954a29e32dee3398054b70` and acceptance `60fc5f8271bff8c86a14993e94cdf44c156472b6` are selectively integrated as non-production inputs only.
- [x] V15/V16 B result (`P0=0`, `MAJOR=0`, `FOUNDATION_REVIEW_CANDIDATE_APPROVED`) is bound to remediation `b84e790e163593a914ebff771b41c50279c1748f`, parent `5eb535e0e50780a57f3a0d44125d806a48326be3`, and non-production acceptance `1ccc680682faae18b150a33978ee1456b88cdc24`.
- [x] V17/V18 B result (`P0=0`, `MAJOR=0`, `FOUNDATION_REVIEW_CANDIDATE_APPROVED`) is bound to review tip `8038bc3f8d129f1d6bfa3877d7353ba96da15ac0`, code `ea3b5b818a485614ad7cb2d3cd6240a59f7da439`, and non-production acceptance `74748ec4e607647af2bc5898233f6e17db1457f8`.

## Enforce dependency order

- [x] F is selectively staged.
- [x] V11.1 → V11.2 → V11.3 are selectively staged; no claim waives V03.3/V06.3/V08.3/V09.3 normal-mode requirements.
- [x] V12.1 → V12.2 → V12.3 are selectively staged after V11; no claim waives V08.3/V09.3 normal-mode requirements.
- [x] V13.1 → V13.2 → V13.3 are selectively staged from their exact reviewed source.
- [x] V14.1 → V14.2 → V14.3 are selectively staged after V13.
- [x] V15.1 → V15.2 → V15.3 and V16.1 → V16.2 → V16.3 are selectively staged after V14.
- [x] V17.1 → V17.2 → V17.3 are selectively staged after V13/V15/V16.
- [x] V18.1 → V18.2 → V18.3 are selectively staged after V14/V17.

## Quarantine and path controls

- [ ] `git range-diff` and path allowlist review completed for every candidate range.
- [ ] No staged range includes V09 runtime, worker/API, database, migration, application, status, Gate, deployment, production, or configuration paths.
- [ ] No branch-local `status/progress.json` transition or broad `tests/architecture/v01-governance.test.ts` change has been carried forward without explicit separate authority.
- [ ] `packages/core/src/index.ts` exports reconcile without duplicate/shadowed public identifiers.
- [ ] `packages/core/src/engine-kernels/index.ts` exports reconcile in approved dependency order.
- [ ] V13/V14 overlap is inspected from actual supplied sources, not inferred from their package names.

## Evidence and checks at the staged SHA

- [ ] `git diff --check` passes.
- [ ] Pinned-runtime `pnpm env:check` passes.
- [ ] `pnpm secrets:check` passes.
- [ ] `pnpm foundation:policy` and `node scripts/check-authoritative-patterns.mjs` pass.
- [ ] `pnpm core:build`, `pnpm boundaries:check`, and `pnpm boundaries:scan` pass.
- [ ] All applicable F, V11, V12, V15/V16, and V17/V18 focused suites pass together.
- [ ] The official full repository check has passed at the exact staged SHA when required by the package owner.
- [ ] Independent review and owner acceptance evidence are attached before any mainline-promotion request.

## Explicit exclusions

- [ ] No merge or cherry-pick was performed before all required supplied verdicts and source selections.
- [ ] No mutation of `main`, production, database, status, Gate, or deployment occurred from this planning worktree.
- [ ] No statement of R2 product completion, package verification, or production readiness is derived from this checklist.
