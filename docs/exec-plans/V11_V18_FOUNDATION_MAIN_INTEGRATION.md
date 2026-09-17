# V11–V18 Foundation Mainline Integration Plan

**State:** `INTEGRATION_CANDIDATE_PENDING_FINAL_B_REVIEW`
**Integration branch:** `codex/v11-v18-foundation-main-integration`
**Immutable integration base:** `origin/main` = `0720a57b56394a577d34534356aa784a8bef9d22`
**Scope:** record the selectively integrated pure-Core foundation candidate and
its review boundary. This document does not authorize a main merge, status or
Gate transition, migration, database access, product change, or production
action.

## Non-negotiable boundaries

- Work only from the immutable base named above. `main` remains untouched until a separately authorized, reviewed integration change is accepted.
- Preserve the V09 quarantine. A candidate range that contains V09 runtime, worker/API, database, migration, `apps`, `status`, `config`, deployment, production, or Gate changes is out of scope and must not be staged.
- Integrate only a supplied candidate with an explicit package-level Review B outcome accepted for mainline consideration. A previous implementation or evidence commit is not a verdict.
- Do not use a foundation integration to claim that the R2 product-step dependencies are satisfied. The R2 normal-mode contracts remain authoritative.
- Do not transplant branch-local progress/gate records or broad governance test changes. Those require their own reconciliation authority.

## Candidate inventory and disposition

| Order   | Foundation / package                                | Exact selected source                                                                                                                                                                                                                                                                      | Current integration disposition                 | Boundary retained                                                           |
| ------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- | --------------------------------------------------------------------------- |
| F       | Shared V11–V18 causal channels and kernels          | Reviewed tip `5356fe93932eb285b3c21977a655e4c6e7bb6746`; selected source commits are recorded in the integration evidence.                                                                                                                                                                 | `SELECTIVELY_INTEGRATED_PENDING_FINAL_B_REVIEW` | Pure Core only; no product or R2 dependency claim.                          |
| V11     | Population, labour, and cross-engine invariant      | Isolated code `c5532ebe0c7afb54ca25f228c78a541e00714321`, `a955ede68fd17c2afd0c0e3cf3d0fe6cdece4988`, `6f2aa759548d6267dadcf4424e68927ae377d70e`, and `d839c8944601190d103082c64b9fe524ec01ec81`; exact reviewed evidence/governance records are source-bound in the integration evidence. | `SELECTIVELY_INTEGRATED_PENDING_FINAL_B_REVIEW` | Historical status/progress and broad governance-test edits remain excluded. |
| V12     | Resource-inventory foundation                       | Code `b0c04ab3e2bbb87edface2c652949d3c3cfcca21`, evidence `8bc779dcceb34adf731adc4c4868e4032093f8b0`, acceptance `899bcb1a750d01be812fde9eee3fa0fd82357b42`.                                                                                                                               | `SELECTIVELY_INTEGRATED_PENDING_FINAL_B_REVIEW` | Reviewed non-production input only.                                         |
| V13/V14 | Energy/production and technology/project foundation | B target `653c1cba9681798260954a29e32dee3398054b70`, acceptance `60fc5f8271bff8c86a14993e94cdf44c156472b6`.                                                                                                                                                                                | `SELECTIVELY_INTEGRATED_PENDING_FINAL_B_REVIEW` | Reviewed non-production input only.                                         |
| V15/V16 | Social foundation                                   | Parent `5eb535e0e50780a57f3a0d44125d806a48326be3`, remediation `b84e790e163593a914ebff771b41c50279c1748f`, acceptance `1ccc680682faae18b150a33978ee1456b88cdc24`.                                                                                                                          | `SELECTIVELY_INTEGRATED_PENDING_FINAL_B_REVIEW` | Reviewed non-production input only.                                         |
| V17/V18 | Household and fiscal foundation                     | Foundation code `40c7476213f1b9d57533fbfd57286defe954202d`, remediation `ea3b5b818a485614ad7cb2d3cd6240a59f7da439`, evidence `8038bc3f8d129f1d6bfa3877d7353ba96da15ac0`, acceptance `74748ec4e607647af2bc5898233f6e17db1457f8`.                                                            | `SELECTIVELY_INTEGRATED_PENDING_FINAL_B_REVIEW` | Reviewed non-production input only.                                         |

The exact provenance, selective source commits, V11 governance-record handling,
and NOT_RUN boundaries are frozen in
`docs/reports/integration/V11_V18_FOUNDATION_INTEGRATION_EVIDENCE.json`.
All acceptance records remain non-production inputs only; none promotes a
product package, modifies a Gate, or satisfies an R2 normal-mode dependency.

## Authoritative dependency sequence

The source transplant followed the exact hard-dependency order in
`planning/r2_steps.json`; package internals remain sequential:

1. F shared foundation.
2. V11.1 → V11.2 → V11.3. The R2 package also depends on V03.3, V06.3, V08.3, and V09.3; the pure-Core candidate does not waive those dependencies.
3. V12.1 → V12.2 → V12.3 after V11.3. The R2 package also depends on V08.3 and V09.3.
4. V13.1 → V13.2 → V13.3 after V12.3. Its R2 inputs include V03.3, V11.3, and V12.3.
5. V14.1 → V14.2 → V14.3 after V13. Its R2 inputs include V05.3, V06.3, V08.3, V11.3, V12.3, and V13.3.
6. **Then only after V14:** V15.1 → V15.2 → V15.3 and V16.1 → V16.2 → V16.3. Both require V06.3, V08.3, V11.3, and V14.3.
7. **Then only after V13/V15/V16:** V17.1 → V17.2 → V17.3.
8. **Then only after V14/V17:** V18.1 → V18.2 → V18.3.

This source order is not proof that normal-mode package prerequisites or Gates
are complete.

## Conflict-prone ownership and reconciliation rules

| Surface                                                                                                                                                       | Candidate pressure                                                                                                                                       | Required reconciliation                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/index.ts`                                                                                                                                  | F, V11, and V12 all add public exports.                                                                                                                  | Reconcile the exports deliberately, preserve unique public type names (including the V12 resource identifiers), and test the final barrel from a clean build. |
| `packages/core/src/engine-kernels/index.ts`                                                                                                                   | F owns the base exports; V13/V14, V15/V16, and V17/V18 add later modules.                                                                                | One ordered export surface; no duplicate or shadowed symbol; retain pure-Core import boundaries.                                                              |
| `FoundationReplayProof` public type                                                                                                                           | V13/V14 and V17/V18 independently define replay proofs.                                                                                                  | Preserve V17/V18 `FoundationReplayProof`; namespace V13/V14 as `V13V14FoundationReplayProof`.                                                                 |
| `packages/core/src/engine-kernels/common.ts`, `population-labour-services.ts`, `resources-energy-production.ts`, and `technology-project-household-fiscal.ts` | F establishes shared types and channels used by the supplied V13/V14 modules.                                                                            | Actual supplied sources were inspected and selectively integrated; no inferred ownership was added.                                                           |
| `packages/core/src/errors.ts` and `tests/world-core/**`                                                                                                       | F errors and kernel tests may constrain isolated V11/V12 and later package behavior.                                                                     | Run all existing and candidate-focused suites together after every stage; fix incompatibility only in the authorized integration change.                      |
| `docs/exec-plans/**` and `docs/reports/**`                                                                                                                    | Candidate evidence is valuable, but historical V11 acceptance commits also alter `status/progress.json` and `tests/architecture/v01-governance.test.ts`. | Transplant only explicitly selected evidence records. Exclude status, gate, and broad governance mutations unless separately authorized.                      |

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

All authorized foundation sources are now selectively integrated and this
worktree is held for final narrow integration Review B. No main merge, status
update, Gate change, database action, deployment, or production mutation may
occur until that final review and subsequent owner decision are recorded.
