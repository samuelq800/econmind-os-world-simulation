# Execution plan: World Seed delivery preparation

## Authority and scope

- User request: complete the Seed work and deliver the final version.
- Base: `f4384167cc26aec693f9e40c7ed5caf30da06f43`, branch `codex/world-seed-delivery`.
- Reuse existing OpeningSeed, source adoption, bootstrap store, admission and replay implementations.
- Binding requirements: Constitution R025/R026/R027; repository single-state, provenance, authorization and production isolation rules.
- This package is a read-only diagnostic/release-preparation tool plus verification of existing code. It does not implement or claim completion of V27 or bypass V09.

## Dependency and decision gate

- `status/progress.json` records V02.3, V07.3 and V08.3 VERIFIED, the V09.1 hard dependencies.
- V09.1 remains PLANNED / next_step_ready=false with isolated evidence pending. V09.2, V09.3 and V27 dependencies are not unlocked.
- ADR-18 permits disposable local/CI isolation, not production topology or cutover.
- Complete CB holdings/denomination, political-capital genesis, formal World identity, lawful seats and deployment evidence remain unresolved.
- Effective change risk: P2 diagnostic tooling, with no authority, arithmetic or production behavior changes. Existing P0 mechanisms are exercised unchanged. No self-approval or VERIFIED claim.

## Change plan

- Add an offline Seed preflight CLI that calls the existing verified-source/non-host preparation functions and returns current per-country blockers, source references and explicit capability limits.
- Export a deterministic report and editable input worksheet. Unknown values remain null; the worksheet is not an OpeningSeed and cannot be consumed as approval.
- Add targeted tests for the actual repository source, deterministic output, explicit refusal and diagnostic CLI behavior.
- Exercise existing Seed bootstrap/retry/conflict/readback and deterministic replay regressions; use an owned disposable loopback PostgreSQL instance where available.
- No economic owner changes; reads are repository files only. Writes are generated local diagnostic artifacts and evidence files.
- No schema, grants, RLS, route installation, production SQL, clock startup, secret access or legacy-site changes.

## Validation plan

- Pinned Node 24.20.0 / pnpm 12.3.4; frozen lockfile unchanged.
- Core/Worker/API build and typechecks; lint, formatting, boundary, safe-environment and secret checks appropriate to changed files.
- Real-source preflight, source drift rejection, CLI unknown-argument rejection, explicit non-readiness and deterministic regeneration tests.
- Existing opening source/Seed/admission/replay regressions, native isolated bootstrap/retry/conflict evidence and V09 preflight evidence as separately recorded.
- Record actual commands, versions, exit codes, failures and NOT_RUN using TEST_EVIDENCE.template.json conventions.

## Exit condition

Deliver reproducible local tooling, generated reports, an input worksheet, immutable implementation identity and actual evidence. Missing source/identity/host inputs remain blockers. No production-ready, P0 VERIFIED, Gate B approval or activated World claim is permitted from this package.
