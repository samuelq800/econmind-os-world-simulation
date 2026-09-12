# V10 Data-Handoff Readiness Contract

Status: **PREPARATION_ONLY_NON_AUTHORITATIVE**

V10 status: **PLANNED**

Current calibration gates: **0 CLOSED / 7 OPEN**

Runtime country-seed export: **NOT AUTHORIZED**

This layer turns the seven open C4 readiness gates into a stable,
machine-readable admission contract. It does not close a gate, select a policy,
retrieve a source, create a country, run reconciliation, or grant runtime
authority.

## Stable interfaces

- `data/calibration/preflight/v10_data_handoff_readiness_contract.v1.json` is
  the pinned policy. Its canonical hash is compiled into
  `packages/calibration/src/v10-readiness.ts`.
- `data/calibration/preflight/v10_data_handoff_readiness.v1.json` is the
  reproducible current assessment. It binds the C4 diagnostic inputs by raw
  byte hash and retains all seven gates as open.
- `v10_gate_closure_evidence.schema.json` defines the only future evidence
  envelope accepted by the validator. Each requirement needs one byte-bound,
  independently reviewed `APPROVED` envelope. A self-created implementation
  report is rejected as authority.
- `v10_1_test_two_country_fixture.schema.json` and
  `validateV101TestTwoCountryFixtureDescriptor` define a separate V10.1
  test-only placeholder interface. No fixture instance is committed.

The policy contains eight unique missing requirements: three owner decisions,
three new-source evidence requirements, and two governance authorizations.
Each gate records already satisfied computable evidence, its remaining unique
requirement, its allowed next action, dependencies, and the authority claim
that remains prohibited.

## Admission behavior

`createVerifiedV10DataHandoffPolicyBundle` snapshots caller bytes, verifies the
raw hashes before parsing diagnostics, checks the pinned canonical policy hash,
and validates the C4 diagnostic boundary. Future closure evidence is accepted
only with exact fields, the correct authority role, distinct reviewed/evidence
commit identities, a valid canonical content hash, and matching raw artifact
bytes.

`createV10DataHandoffReadinessAssessment` computes gate status; callers cannot
declare a gate closed. `verifyV10DataHandoffReadinessAssessment` recomputes the
entire assessment. `requireV10DataHandoffCandidateAdmission` rejects while any
gate is open. Even after all gates close, its return type remains a
non-runtime data-handoff candidate. `rejectV10RuntimeCountrySeedExport` always
rejects because runtime export is outside this calibration package's scope.

The evidence validator verifies document structure, byte bindings, declared
review role, and immutable commit identities. Git ancestry and the substantive
validity or independence of a future review remain external governance checks;
the validator does not self-award approval.

## Independent V10.1 test-only interface

The V10.1 two-country test-fixture path is deliberately independent from the
seven real-calibration gates. Its descriptor must state:

- exactly two unique `test:country:*` placeholder IDs;
- `calibrationReadinessRequired: false`;
- `usesCalibrationCountryValues: false`;
- empty `featureValues` arrays;
- no final-country data, projection implementation, or runtime authority.

This interface separation means an authorized V10.1 unit/integration test can
later validate its own synthetic fixture contract without treating unfinished
calibration as a dependency or treating test placeholders as real countries.
This work does not execute V10.1 or change its `PLANNED` status.

## Reproduction

Use the pinned Node 24.20.0 and pnpm 12.3.4 toolchain:

```sh
pnpm --filter @econmind/calibration v10:data-handoff:generate
pnpm vitest run tests/calibration/calibration-v10-data-handoff-readiness.test.ts
pnpm --filter @econmind/calibration typecheck
pnpm --filter @econmind/calibration build
```

The generator reports `V10_DATA_HANDOFF_NOT_READY:7:<contentHash>` and writes
only the non-authoritative readiness assessment.
