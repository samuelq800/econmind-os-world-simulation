# Gate A final acceptance

## Decision

```text
Gate: A
Decision: PASSED
Authority: PROJECT_OWNER_ACCEPTANCE
```

The project owner explicitly accepts the immutable Gate A Foundation
remediation candidate under the repository's scoped Gate A owner-acceptance
policy. This is not an implementation-agent self-review, a P2/P3 fast-track, an
ADR approval, or a claim that every imaginable adversarial attack ran.

## Bound identity

- Foundation base: `1a950a41567900761d4f4313092ab4a3404e6f67`
- Approved code candidate: `47fe5c5d465748370d9a8ea046bc443978437203`
- Remediation branch/evidence HEAD at acceptance:
  `b383904573b2959b3f22ea6d8ded4d02c3582b83`
- Branch: `codex/gate-a-targeted-fixes`
- Review range:
  `1a950a41567900761d4f4313092ab4a3404e6f67..47fe5c5d465748370d9a8ea046bc443978437203`
- Finding scope: `GATEA-BLK-01`, `GATEA-BLK-02`, `GATEA-MAJ-01`,
  `GATEA-MAJ-02`, `GATEA-MAJ-03`, `GATEA-MAJ-04`, `GATEA-MAJ-05`

The base is an ancestor of the code candidate, and the code candidate is an
ancestor of the evidence HEAD. Later acceptance bookkeeping may advance the
branch only through non-runtime governance/evidence commits.

## Evidence retained

Baseline evidence is retained in:

- `docs/reports/GATE_A_FOUNDATION_REVIEW_BUNDLE.md`
- `docs/reports/GATE_A_FOUNDATION_TEST_EVIDENCE.json`

That evidence records the final pinned baseline PASS after preserving an early
core declaration-build failure and its correction. The final baseline included
lint, formatting, five typechecks, 146 tests, 33 protected boundary tests,
environment, migration, policy, secret and build checks; property tests passed
6/6 and architecture tests passed 66/66.

Remediation and targeted regression evidence is retained in:

- `docs/reports/GATE_A_TARGETED_REVIEW_BUNDLE/README.md`
- `docs/reports/GATE_A_TARGETED_REVIEW_BUNDLE/FINDING_CLOSURE.json`
- `docs/reports/GATE_A_TARGETED_REVIEW_BUNDLE/TEST_EVIDENCE.json`

The immutable code candidate's full matrix passed with 17 files and 288/288
tests. The bundle also preserves focused results for public runtime startup,
numeric exactness, properties, authorization, canonical serialization,
architecture enforcement, migration provenance and public lifecycle. Honest
intermediate failures remain recorded. External PostgreSQL and live staging
were `NOT_RUN`; production access and mutation were false. Those later-surface
checks were not represented as Gate A PASS evidence.

## Accepted test-policy boundary

```text
Standard engineering verification: ACTIVE
Extreme/open-ended adversarial probing: NOT REQUIRED BY OWNER POLICY
```

Required baseline, contract/invariant checks, existing regressions, realistic
failure paths, known-bug regressions, constitutional fail-closed behavior,
exact arithmetic/conservation, authorization, migration provenance and ordinary
security boundaries remain mandatory. Existing security regressions are not
deleted or weakened. A defect found through normal verification remains a real
defect and must be fixed.

The owner intentionally excludes new open-ended red-team campaigns, extreme
website exploit chains, unbounded fuzzing and unrealistic timing attacks whose
only purpose is speculative vulnerability discovery. This scope decision is
neither `FAIL` nor `INSUFFICIENT_EVIDENCE` for Gate A.

## Preserved remediation contracts

1. Public runtime startup fails closed.
2. Authoritative arithmetic is exact-or-deterministic-reject; silent rounding,
   tolerance conservation and approximate replay equality are forbidden.
3. Protected intake, approval and worker commit re-resolve current authority;
   cached Office context is not authority.
4. External UUID `AuthSubject` remains distinct from World actor, Office and
   country identifiers.
5. Canonical serialization/fingerprinting admits only inert data and explicit
   trusted domain adapters; casual duck typing is forbidden.
6. Environment validation precedes persistence, lease, recovery and
   authoritative storage access.
7. The sole V02 migration/release chain verifies source commit, historical path
   and exact artifact bytes/hash; no parallel migration truth exists.

## Merge boundary

Gate A acceptance authorizes normal, history-preserving reconciliation of this
accepted candidate into `main`. It does not authorize new runtime changes,
production database access, ADR approval, batch-candidate activation or V06
implementation. If reconciliation changes runtime beyond the accepted
candidate, stop with `GATE_A_RECONCILIATION_CHANGED_RUNTIME`.

```text
GATE A FINAL STATUS = PASSED
GATE A AUTHORITY = PROJECT_OWNER_ACCEPTANCE
```
