# V27 single-World worker composition — preparation only

## Entry and actual gap

The branch starts from `origin/main` `0fa8da7e74488f4554185afb68c19b4933d72586`. V27.1/V27.2/V27.3 are `PLANNED` in `status/progress.json`; ADR-13 is `PROPOSED_NOT_APPROVED`. Existing Core modules validate V27.1 country provenance, V27.2 70-country closure, exact provenance-to-calibration links, NPC candidate intents and the Simulation Clock. Worker has a durable OpeningSeed store but no runtime composition of those candidate sources. Critically, V27.2 calibration inputs do not contain `worldId` or country-configuration provenance, so the existing adapter reports `WORLD_CONFIGURATION_BINDING_UNAVAILABLE`; a linked/closed source cannot be promoted to an OpeningSeed or authoritative World initialization. No producer may infer those fields from V27.1.

## Narrow runnable slice

Add a pure Core composition function and a worker-only invocation wrapper. The Core function accepts one validated World identity, V27.1 provenance, untrusted V27.2 calibration input, a canonical initial SimTime and zero or more V27.3 NPC input candidates. It calls the existing adapter and NPC preparer, refuses cross-World/country/time inputs, captures immutable clock and issue summaries, and produces deterministic canonical review evidence. Its output is always `PREPARATION_ONLY`, `initializationAuthorized: false` and `workerDispatchAllowed: false`; it never constructs OpeningSeed, advances the clock, accepts a Command or writes a ledger. Missing NPC evidence and incomplete/unsafe calibration are explicit blockers, not default resources or automatic acceptance.

The worker wrapper provides the Node SHA-256 adapter and makes this function executable in a focused test. It is not wired into `startWorkerRuntime` or any production path. The one-World result is a diagnostic preflight, not a second World State or alternate engine. Season-specific branching is prohibited; the legacy `seasonRef` in V27.1 is audit provenance only.

## Scope and verification

- Owners: new `packages/core/src/orchestration`, its index export, new `apps/world-worker/src/preparation`, focused `tests/world-core`, and this plan/evidence report. C calibration inputs, E API, D web, original main site and frozen V27 candidate modules are untouched.
- Reads: caller-supplied candidate evidence only. Authoritative reads/writes/events/commands: none. DB/RLS/migration/production access: none. No wall-clock read or hidden economic multiplier.
- Test matrix: deterministic replay of preflight evidence; 70-country incomplete calibration remains blocked; missing NPC remains unavailable; cross-World/country/SimTime rejection; tamper resistance of returned evidence; worker wrapper running with the actual Node hash adapter. Core/worker build/typecheck, targeted tests, lint/format and repository boundaries.
- Remaining OPEN: V27.2 durable World/configuration binding, verified source digest/content and calibrated 70-country opening values, actual OpeningSeed construction/bootstrap, approved NPC principal/policy under ADR-13, current funds/inventory/approval at commit, writer lease/fencing, independent P0 review, formal dependency closure and Gate state.
