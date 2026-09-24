# V27.3 — NPC Controller candidate-intent preparation

## Identity and authority

- Branch: `codex/v27-3-npc-intent-preparation`; isolated worktree rebased onto `origin/main` `4d38a9f6ef4191edd84ded58a2c90b130267b69f`.
- Result: `PREPARATION_ONLY`. `status/progress.json` keeps V27.2 and V27.3 `PLANNED`; ADR-13 is `PROPOSED_NOT_APPROVED`. No dependent gate was promoted and no owner decision was inferred.
- Highest affected boundary: P0-sensitive Core authorization/approval and economic resource screening. Independent review and later V27.2/ADR-13 decisions remain required before runtime integration.

## Delivered slice

`packages/core/src/npc/intent-preparation.ts` prepares one deterministic `RESOURCE_ALLOCATION_COMMAND_INTENT` candidate from explicit, version-aligned model, existing opaque Office authorization context, approved proposal fingerprint, cash/budget and AVAILABLE inventory facts. Exact `Money` and `Quantity` comparisons reject overspend and overdraw. The funding owner must match the inventory title holder. Missing or inconsistent evidence returns `UNAVAILABLE`; it does not infer resources or accept offers.

The result contains a replayable canonical preimage, fingerprint and explicit transaction recheck list. It has no `CommandId`, executable `CanonicalCommand`, Event, Posting or durable receipt. The module is not package-index exported or wired to API/worker, scheduler, persistence, UI, or production. Even an `APPROVED` input is a caller-supplied screening fact, **not** an approval/authorization proof for execution; the authoritative writer must reauthorize and recheck approval, current WorldVersion, funds and inventory in its transaction. This branch does not decide an NPC principal/default-policy mechanism reserved to ADR-13.

## Verification

- Focused Vitest plus Command/Event/Inventory/receipt regressions: PASS, 4 files / 51 tests; V27.3 focused file 5 tests.
- Core build and Core typecheck: PASS.
- All workspace package typechecks via pinned direct `pnpm -r --if-present typecheck`: PASS.
- Targeted ESLint/Prettier: PASS.
- Architecture boundary suite: PASS, 3 files / 34 tests. Authoritative-pattern and repository-boundary scans: PASS after final code change.
- Repository secrets and local safe-environment checks: PASS; database not configured, Supabase not linked, mutations disallowed.
- Root `pnpm typecheck` wrapper: FAIL due nested shell resolving Node 24.19.0/pnpm 11.19.0 rather than pinned Node 24.20.0/pnpm 12.3.4; direct pinned package typecheck passed. This is a command-environment failure, not silently relabeled as a PASS.

## NOT_RUN / unresolved

V27.2 closure, ADR-13 owner approval, real NPC identity/policy issuance, authoritative ledger-read integration, current approval/authentication validation at commit, Command routing, atomic writer and crash/retry integration, full repository test suite, independent P0 review, migration, release and production access are NOT_RUN or pending. No runtime, schema, migration, Gate, status, ADR or frozen V27.1 provenance file was modified.
