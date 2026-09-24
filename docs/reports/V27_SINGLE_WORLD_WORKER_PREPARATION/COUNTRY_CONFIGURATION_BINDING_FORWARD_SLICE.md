# V27.2 World/configuration structural binding — forward slice

## Identity, ownership and gate

Parent isolated-branch SHA: `e906764dde1603754ae7a5bea49b8b457ae47f07`. This P0-sensitive forward commit edits only the pure Core V27.2 candidate validator, its V27.1-to-V27.2 adapter, focused tests and preparation/evidence docs. It remains `PREPARATION_ONLY`; V27.1/V27.2/V27.3 stay `PLANNED`, ADR-13 and ADR-14 stay `PROPOSED_NOT_APPROVED`. It does not reconcile Constitution R002 or approve a Season/World orchestrator. No runtime, OpeningSeed writer, schema/migration, production, status or ADR file changed.

V27.2 candidate schema is now version `v27.2-country-calibration-preparation-v2`. It requires an explicit canonical `worldId` and `countryConfigurationRef`. The ref is a versioned SHA-256 digest of the World ID plus the exact sorted country ID set. A closed 70-country candidate must reproduce that digest; v1 or missing/forged bindings fail validation. The adapter recomputes the expected ref from reparsed V27.1 provenance and rejects cross-World/configuration mismatch without emitting value links. Matching structural identities still report `COUNTRY_CONFIGURATION_AUTHORITY_UNVERIFIED`: the digest is **not** an independent attestation by the country-configuration owner, a source-content check, or generation authority. `seasonRef` remains audit metadata and never selects separate economics.

The adapter's readonly `numericDerivationTrace` exposes already validated source, assumption, unit, original/final exact amounts and before/delta/after changes for each exact linked quantity. It adds no arithmetic, conversion, causal-inference claim or runtime modifier. `generationAuthorized` remains `false`.

## Verification

- Final focused V27.1/V27.2/V27.3, adapter, worker preflight and OpeningSeed tests: **PASS**, 6 files / 50 tests.
- Core build and typecheck, worker build, targeted ESLint/Prettier: **PASS**.
- Architecture boundary tests: **PASS**, 3 files / 34 tests; authoritative-pattern and repository-boundary scans: **PASS**.
- Local safe environment, foundation policy and secret scan: **PASS**; no database configured, Supabase unlinked, mutation disabled.
- An initial test run launched concurrently with the Core rebuild failed 7 worker-preflight tests because that run loaded the old built Core schema. After build completion, the same focused suite was rerun serially and passed 50/50. The initial failure is not reclassified as a pass.

## Remaining OPEN / NOT_RUN

Independent P0 review of this new immutable SHA; external country-configuration ownership/attestation; verified 70-country source content and economic values; provenance for all numeric metrics (including derivation identity); authoritative OpeningSeed creation/bootstrap; ADR-13 NPC principal/policy; ADR-14/R002 orchestrator and legacy migration reconciliation; V27 formal dependency closure, runtime activation, full repository suite, migration/release and production access.
