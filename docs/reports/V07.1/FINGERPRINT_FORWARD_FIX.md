# V07.1 authoritative Command fingerprint forward fix

## Result

```text
Independent review result: CHANGES_REQUIRED_DOWNSTREAM_BLOCKING
Historical review target: b57b6aa9cd349776e1f5cd8ae10d20413523a69c
Fixed code candidate: 67fd40b1597fb4057ef54481ba0b8b8be4ca18a8
Implementation status: IMPLEMENTED_UNVERIFIED / FIXED_PENDING_REVIEW
V07.2 runtime: NOT_STARTED
Production mutation: NONE
```

## Root cause and correction

`parseCanonicalCommand` previously hashed a general `intent` object that
included `correlationId`. The authoritative contract defines correlation as
trace grouping only, so a retry with identical economic intent but a different
correlation ID incorrectly produced `IDEMPOTENCY_CONFLICT`.

The correction introduces one exported, explicit
`projectAuthoritativeCommandIntent` allow-list. Every Command fingerprint is
computed from that projection. Repository call-site audit found one current
Command fingerprint computation and comparison path; it now consumes the same
projection through `parseCanonicalCommand` and `classifyCommandIdentity`.

## Field classification

| Classification          | Fields                                                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTHORITATIVE_INTENT`  | `commandId`, `idempotencyKey`, `worldId`, `authSubject`, `actorId`, `countryId`, `officeId`, `commandType`, `schemaVersion`, `payload`, `expectedWorldVersion`, `simTime` |
| `TRACE_TRANSPORT_AUDIT` | `correlationId`, `submittedAtReal`                                                                                                                                        |

`canonicalPayload`, `payloadHash`, and `fingerprint` are derived outputs rather
than submitted Command fields; they are not recursively added to the
projection. The stored correlation on an already accepted Command/Event is not
rewritten when a later attempt carries a different trace identifier.

## Regression contract

- Correlation-only and real-audit-time-only changes preserve the fingerprint.
- The same `commandId` with no idempotency key and changed correlation remains
  an exact duplicate.
- The same command/idempotency identity with changed correlation remains an
  exact duplicate and appends no second represented Event/effect.
- Every mutable authoritative-intent field changes the fingerprint; unsupported
  schema versions continue to fail closed before a fingerprint is returned.
- Changed authoritative payload under the same identity remains
  `IDEMPOTENCY_CONFLICT` with zero represented authoritative effect.
- Reconstruction and canonical property ordering preserve deterministic
  fingerprints.

## Boundaries preserved

The fix does not change Event append-only behavior, correction Events, consumer
receipt ownership, V06 SimTime, migration bytes or provenance, or the V09
transaction boundary. The branch-local 0002 DDL remains candidate-only. ADR-16
approval is architecture authority, not package promotion or production
publication authority.

## Verification and next gate

Focused Command/Event/idempotency/property tests passed 3 files and 20 tests.
The pinned full baseline passed 26 files and 355 tests plus protected boundary
tests, scanners, migration validation/rehearsal, environment/policy/secret
checks and all builds. Governance validation passed all 14 groups. Exact
machine-readable evidence is in
`docs/reports/V07.1/TEST_EVIDENCE_FINGERPRINT_FORWARD_FIX.json`.

The MAJOR remains open only for independent closure. V07.1 is not `VERIFIED`,
and V07.2 may not begin until focused independent review closes the finding.
