# V27 single-World worker composition — executable diagnostic slice

## Identity and gate

- Branch: `codex/v27-single-world-worker-preparation`; initial implementation base `origin/main` `0fa8da7e74488f4554185afb68c19b4933d72586`, rebased onto `47a393a6f1abb3bb99467377c7d97a28e46456d1` before final verification.
- Result: `PREPARATION_ONLY`; no formal V27 step, Gate or ADR status changed. V27.1/V27.2/V27.3 are `PLANNED` and ADR-13 remains `PROPOSED_NOT_APPROVED` in repository truth.
- Highest affected boundary: P0-sensitive World initialization, NPC authorization and worker execution. The slice is diagnostic-only and needs independent review before any runtime integration or merge.

## Actual gap and delivered behavior

The existing V27.1 provenance parser, V27.2 calibration closure validator and their adapter already flag the missing `calibration.worldId` / country-configuration binding as `WORLD_CONFIGURATION_BINDING_UNAVAILABLE`. V27.3 NPC can only prepare a non-authoritative candidate; no NPC principal/policy authority is approved. The worker has an OpeningSeed store, but using these candidates to bootstrap it would infer missing authority and is prohibited.

The new Core `prepareSingleWorldWorkerPreflight` composes those existing validators with one canonical initial Simulation Clock snapshot. It validates one World and configured NPC countries/tick, runs the existing provenance/calibration adapter and NPC preparer, then returns a deterministic canonical review fingerprint, issue codes and NPC screening outcomes. It always reports `initializationAuthorized=false`, `workerDispatchAllowed=false` and an explicit V27 dependency/ADR blocker. A worker-only wrapper supplies SHA-256 and is directly executable in tests; it is not wired into the worker server or authoritative transaction path. No OpeningSeed, Command, Event, Posting, clock advancement, random draw, materialization or database write occurs.

One focused 70-country fixture with all six provenance domains marked `MISSING` and incomplete calibration produces a stable `PREPARATION_ONLY` report with `CALIBRATION_INPUT_INCOMPLETE`; a missing NPC model produces `MODEL_UNAVAILABLE`. The test checks no automatic control, cross-World/country/tick rejection and detached immutable results. This is a working fail-closed preflight, **not** a positive 70-country calibration/bootstrapping test.

## Verification

- Focused preflight + provenance/calibration adapter + NPC tests: PASS, 3 files / 20 tests. The first run failed 4 new tests because the test imported `SimTime` from source while the worker imported the built Core package; those are distinct WeakSet identities. The test now consistently imports the public Core runtime and the final run passes.
- Core and worker builds: PASS; targeted ESLint/Prettier: PASS.
- Architecture boundary suite: PASS, 3 files / 34 tests; authoritative-pattern and repository-boundary scans: PASS.
- Local safe environment and repository secret scan: PASS; no database configured, Supabase unlinked and mutation disallowed.
- Git staged diff check: recorded in `TEST_EVIDENCE.json` after staging.

## Remaining OPEN / NOT_RUN

World/configuration binding in V27.2 schema, actual 70-country source and calibrated values, source digest retrieval, authoritative OpeningSeed generation/bootstrap, worker runtime activation, NPC identity/policy under ADR-13, current funding/inventory/approval at commit, writer lease/fencing, independent P0 review, full repository suite, DB/RLS/migration and production remain OPEN/NOT_RUN. No C calibration module, E API, D web, original main-site or production file was changed.
