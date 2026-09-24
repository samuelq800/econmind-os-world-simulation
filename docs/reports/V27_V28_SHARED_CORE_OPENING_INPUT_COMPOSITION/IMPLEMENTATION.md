# V27/V28 shared-Core opening input composition — preparation only

## Exact provenance and conflict check

- New branch: `codex/v27-v28-single-world-core-composition`, based on V27 candidate `ec72b19e120398c17bd4550c8673a16ca0fb5bb0`.
- Donor: `origin/codex/v28-v30-preparation@875114cca52211cb752bfafaee923fc9dd63958d`; reviewed V28.1 code commit `cd7b7bd64dfab634d08bd426559b5c0c091cf574`; common ancestor `0fa8da7e74488f4554185afb68c19b4933d72586`.
- No same-path code conflict: donor V28.1 Core module and test were new paths. Only those code/test files were carried; donor V28.1 reports and unrelated V29/V30 work were not imported. The donor Core configuration was then extended to schema v2, so its earlier narrow review is **not** approval of this new candidate.

Constitution R002 remains authoritative: one World state and shared economic Core do not erase the separate World/Season thin orchestrator and lifecycle responsibilities. ADR-14 and the active V28.1 contract remain unreconciled. This slice selects neither orchestrator, changes no governance/status record, and is not a formal V28.1 implementation or merge authorization.

## Implemented input boundary

The V28.1 pure Core configuration now requires a canonical `countryConfigurationRef` in its versioned preparation snapshot. The new pure `prepareSharedCoreOpeningInput` revalidates a closed V27.2 candidate, prepares the V28 Core configuration, reparses a canonical OpeningSeed, and requires exact World ID, V27-to-V28 configuration-ref, country count 70, model/replay, clock and WorldVersion-zero agreement. It rejects incomplete calibration, malformed/forged seed, TEST_FIXTURE opening provenance, nonzero opening SimTime, and cross-World/configuration/count input. Its output is immutable diagnostic evidence with deterministic fingerprint, never a runtime initialization token.

The current OpeningSeed has **no** country-configuration reference or verified numeric mapping from V27.2. This pure function also cannot prove the caller supplied a durable persisted seed or a completed V27.1 provenance link. Accordingly it always returns `PREPARATION_ONLY`, `initializationAuthorized=false`, `orchestratorSelected=false`, `configurationRefStatus=V27_V28_ONLY`, and explicit blockers for V27.1 provenance, external configuration authority, opening durability, opening configuration binding, calibrated-value lineage and V27/V28 dependency/ADR gates. No OpeningSeed creation/bootstrap, worker runtime wiring, command, Event, Posting, migration, production access or main-site change was made.

## Verification and limits

- Final focused V27.1/V27.2/V27.3, adapter, worker preflight, V28.1 and OpeningSeed suite: **PASS**, 7 files / 58 tests.
- Architecture boundary suite: **PASS**, 3 files / 34 tests.
- Core build/typecheck, worker build, targeted ESLint/Prettier, authoritative-pattern and repository-boundary scans, local safe-environment and secret scans: **PASS**.
- During one intermediate 7-file run, an existing V27 provenance-adapter test timed out; an isolated rerun passed, followed by a full 58/58 pass. The precise cause of the timeout was not established, so the failed run remains recorded.

Still **OPEN / NOT_RUN**: independent P0 review of this new SHA; R002/ADR-14 formal reconciliation; V27/V28 hard dependencies; external configuration owner/source attestation; durable OpeningSeed read-to-configuration binding and exact calibrated-value lineage; real 70-country values; full repository suite, database/release and production. No claim of formal approval or gate closure is made.
