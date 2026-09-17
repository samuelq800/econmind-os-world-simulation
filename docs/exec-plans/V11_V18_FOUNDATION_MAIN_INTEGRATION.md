# V11–V18 Foundation Mainline Integration Plan

**State:** `PLANNING_ONLY_NO_CANDIDATE_INTEGRATION`
**Integration branch:** `codex/v11-v18-foundation-main-integration`
**Immutable integration base:** `origin/main` = `0720a57b56394a577d34534356aa784a8bef9d22`
**Scope:** define a safe, review-gated integration sequence for pure-Core foundation candidates. This document does not authorize a merge, cherry-pick, promotion, status transition, migration, database access, product change, or Gate change.

## Non-negotiable boundaries

- Work only from the immutable base named above. `main` remains untouched until a separately authorized, reviewed integration change is accepted.
- Preserve the V09 quarantine. A candidate range that contains V09 runtime, worker/API, database, migration, `apps`, `status`, `config`, deployment, production, or Gate changes is out of scope and must not be staged.
- Integrate only a supplied candidate with an explicit package-level Review B outcome accepted for mainline consideration. A previous implementation or evidence commit is not a verdict.
- Do not use a foundation integration to claim that the R2 product-step dependencies are satisfied. The R2 normal-mode contracts remain authoritative.
- Do not transplant branch-local progress/gate records or broad governance test changes. Those require their own reconciliation authority.

## Candidate inventory and disposition

| Order   | Foundation / package                           | Exact source                                                                                                                                                                                                                                                                                                                                          | Current integration disposition                                        | Prerequisites before a selective transplant                                                                                                                                                        |
| ------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F       | Shared V11–V18 causal channels and kernels     | `origin/codex/f-v11-v18-causal-channels` at `5356fe93932eb285b3c21977a655e4c6e7bb6746`                                                                                                                                                                                                                                                                | `WAIT_FOR_SUPPLIED_B_OUTCOME`                                          | Explicit B outcome for the exact candidate; clean range inspection against the integration base.                                                                                                   |
| V11     | Population, labour, and cross-engine invariant | Isolated code: `c5532ebe0c7afb54ca25f228c78a541e00714321`, `a955ede68fd17c2afd0c0e3cf3d0fe6cdece4988`, `6f2aa759548d6267dadcf4424e68927ae377d70e`, `d839c8944601190d103082c64b9fe524ec01ec81`; acceptance records: `2db39d01a22873162d1c841675855b60d4e5816e`, `47526ea2219ece011da82e397cf5435b1d044ea8`, `7c92c588bf1682371cef0892ee35e27df9ba6e75` | `WAIT_FOR_EXACT_INTEGRATION_VERDICT_AND_SOURCE_SET`                    | Control Tower must identify the approved isolated source set. Never merge historical V11 branches wholesale because they carry quarantined V09 lineage and branch-local status/governance updates. |
| V12     | Resource-inventory foundation                  | `origin/codex/v12-foundation-acceptance` at `899bcb1a750d01be812fde9eee3fa0fd82357b42`; code/evidence chain begins at `b0c04ab3e2bbb87edface2c652949d3c3cfcca21`, parent F `5356fe93932eb285b3c21977a655e4c6e7bb6746`                                                                                                                                 | `B_OUTCOME_RECORDED_NONPRODUCTION; WAIT_FOR_INTEGRATION_AUTHORIZATION` | F and the approved V11 source set must be integrated and pass combined checks; non-production acceptance must not be reinterpreted as R2 or product readiness.                                     |
| V13     | Energy and production foundation               | No candidate source or B outcome supplied                                                                                                                                                                                                                                                                                                             | `PENDING_NO_CANDIDATE_SOURCE`                                          | Exact candidate SHA, reviewed verdict, and reconciliation against F/V11/V12.                                                                                                                       |
| V14     | Technology and project-lifecycle foundation    | No candidate source or B outcome supplied                                                                                                                                                                                                                                                                                                             | `PENDING_NO_CANDIDATE_SOURCE`                                          | Exact candidate SHA, reviewed verdict, and reconciliation against V13.                                                                                                                             |
| V15/V16 | Social foundation                              | remediation candidate `b84e790e163593a914ebff771b41c50279c1748f` (exact parent `5eb535e0e50780a57f3a0d44125d806a48326be3`); non-production acceptance `codex/v15-v16-foundation-acceptance` at `1ccc680682faae18b150a33978ee1456b88cdc24`                                                                                                             | `B_OUTCOME_RECORDED_NONPRODUCTION; WAIT_FOR_INTEGRATION_AUTHORIZATION` | V14 chain reconciled and combined conflict review; acceptance does not waive normal-mode dependencies.                                                                                             |
| V17/V18 | Household and fiscal foundation                | remediation review tip `8038bc3f8d129f1d6bfa3877d7353ba96da15ac0` (code `ea3b5b818a485614ad7cb2d3cd6240a59f7da439`); non-production acceptance `codex/v17-v18-foundation-acceptance` at `74748ec4e607647af2bc5898233f6e17db1457f8`                                                                                                                    | `B_OUTCOME_RECORDED_NONPRODUCTION; WAIT_FOR_INTEGRATION_AUTHORIZATION` | V13, V15, and V16 chains reconciled and combined conflict review; acceptance does not waive normal-mode dependencies.                                                                              |

The V12, V15/V16, and V17/V18 acceptance records establish reviewed
non-production foundation inputs only. None is an approval to promote a product
package, modify a Gate, or satisfy an R2 normal-mode dependency.

## Authoritative dependency sequence

The safe staging order follows the exact hard-dependency chain in `planning/r2_steps.json`; package internals remain sequential:

1. F shared foundation, after its exact B outcome is supplied.
2. V11.1 → V11.2 → V11.3, after the exact isolated candidate set and verdict are supplied. The R2 package also depends on V03.3, V06.3, V08.3, and V09.3; a pure-Core transplant does not waive those normal-mode dependencies.
3. V12.1 → V12.2 → V12.3 after V11.3. The R2 package also depends on V08.3 and V09.3.
4. **Stop.** V13.1 → V13.2 → V13.3 cannot be prepared for staging until its exact candidate and B outcome are supplied. Its R2 inputs include V03.3, V11.3, and V12.3.
5. **Then only after V13:** V14.1 → V14.2 → V14.3. Its R2 inputs include V05.3, V06.3, V08.3, V11.3, V12.3, and V13.3.
6. **Then only after V14:** V15.1 → V15.2 → V15.3 and V16.1 → V16.2 → V16.3. Both require V06.3, V08.3, V11.3, and V14.3.
7. **Then only after V13/V15/V16:** V17.1 → V17.2 → V17.3.
8. **Then only after V14/V17:** V18.1 → V18.2 → V18.3.

No later candidate can leapfrog the missing V13/V14 candidates merely because it is a pure-Core foundation branch.

## Conflict-prone ownership and reconciliation rules

| Surface                                                                                                                                                       | Candidate pressure                                                                                                                                                | Required reconciliation                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/index.ts`                                                                                                                                  | F, V11, and V12 all add public exports.                                                                                                                           | Reconcile the exports deliberately, preserve unique public type names (including the V12 resource identifiers), and test the final barrel from a clean build. |
| `packages/core/src/engine-kernels/index.ts`                                                                                                                   | F owns the base kernel exports; V15/V16 and V17/V18 add later kernels. V13/V14 are expected to need adjacent exports when sources arrive.                         | One ordered export surface; no duplicate or shadowed symbol; retain pure-Core import boundaries.                                                              |
| `packages/core/src/engine-kernels/common.ts`, `population-labour-services.ts`, `resources-energy-production.ts`, and `technology-project-household-fiscal.ts` | F establishes shared types and channels. V13/V14 are expected to be adjacent semantic consumers, but their exact overlap is unverified without candidate sources. | Inspect source-by-source before staging; do not pre-resolve or infer V13/V14 implementation ownership.                                                        |
| `packages/core/src/errors.ts` and `tests/world-core/**`                                                                                                       | F errors and kernel tests may constrain isolated V11/V12 and later package behavior.                                                                              | Run all existing and candidate-focused suites together after every stage; fix incompatibility only in the authorized integration change.                      |
| `docs/exec-plans/**` and `docs/reports/**`                                                                                                                    | Candidate evidence is valuable, but historical V11 acceptance commits also alter `status/progress.json` and `tests/architecture/v01-governance.test.ts`.          | Transplant only explicitly selected evidence records. Exclude status, gate, and broad governance mutations unless separately authorized.                      |

## Staging protocol for each released candidate

1. Control Tower supplies the exact candidate SHA(s), the exact Review B verdict, and permission to prepare a selective integration change.
2. Record the source SHA and `git merge-base` against the current integration head. Run `git range-diff` and a path allowlist review before applying any change.
3. Reject or split any range that crosses the V09 quarantine or includes runtime-product, database, migration, status, Gate, deployment, or production paths.
4. Apply only the approved, narrow source set on a fresh integration staging branch; do not merge historical work branches.
5. Reconcile the shared Core exports and run the integrated validation matrix below.
6. Commit the source provenance, reconciliation decision, and actual validation evidence together. A clean local result remains an integration candidate, not a main mutation.
7. Obtain the required independent review and owner acceptance before any separate mainline promotion decision.

## Required integrated validation matrix

- `git diff --check` and source-path allowlist review against the current integration base.
- Pinned-runtime `pnpm env:check`, `pnpm secrets:check`, `pnpm foundation:policy`, and `node scripts/check-authoritative-patterns.mjs`.
- `pnpm core:build` followed by `pnpm boundaries:check` and `pnpm boundaries:scan` to prove the pure-Core boundary remains intact.
- Run every staged foundation suite together: F causal-channel/kernel/firm-ecology tests; V11 population, labour, and population-labour invariant tests; V12 resource-inventory foundation test; and, only once staged, V15/V16 social-foundation and V17/V18 household-fiscal-foundation tests.
- Run the repository's official full check at the exact staged SHA when the package owner requires it; do not substitute focused tests for that evidence.
- Verify no staged diff changes V09, database/migrations, status, Gate, deployment, production, or product runtime paths.

## Current hold point

This worktree contains only this plan and its companion checklist. It is intentionally held before F/V11 integration and before V13/V14 candidate discovery. The only valid next input is a supplied, exact approved candidate verdict (and, for V13/V14, an exact source). Until then, no merge, cherry-pick, status update, Gate change, or main mutation may occur.
