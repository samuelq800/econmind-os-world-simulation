# V07.1 implementation report

## Result

```text
Step: V07.1 — Command/Event Schema 与不可变 Ledger
State: IMPLEMENTED_UNVERIFIED
Code candidate: b8c8555bac1f5e8d36d1f147732a691f248431f8
Migration provenance commit: 039ffd3226a3cb780b94c624bd87b32bdc48ee67
Acceptance/regression target: e5840f76bb6a06c636f1f2575e3245b1f7734bd9
Automated evidence: PASS
Independent verification: NOT_CLAIMED
Production mutation: NONE
```

## Implemented scope

- Added distinct branded Command, Event, idempotency, correlation and type
  identities.
- Added fail-closed `command-v1` parsing with canonical inert payload bytes,
  deterministic SHA-256 adapter contract, authoritative-intent fingerprint,
  V06 `SimTime`, actor/authorization scope and real audit timestamp.
- Added durable-record-driven duplicate classification: exact identity and
  fingerprint returns the existing intent; changed intent returns
  `IDEMPOTENCY_CONFLICT`. The helper does not provide or authorize in-memory
  persistence.
- Added fail-closed `event-v1` parsing, canonical payload/event fingerprints,
  authoritative sequence validation, causation/correlation, WorldVersion,
  V06 `SimTime`, and correction-event references.
- Added the branch-local `0002_world_v2_command_event_ledger` candidate through
  the existing V02 artifact/manifest chain. It creates World head, immutable
  Command submission and append-only authoritative Event tables. Database
  triggers reject historical Command/Event `UPDATE` and `DELETE`.
- Added focused examples, property tests and disposable PGlite tests for exact
  duplicate, identity conflict, fingerprint determinism, version failure,
  sequence, correction-as-new-Event and immutable history.

## Ownership preserved

- `packages/core` owns pure canonical contracts only.
- `apps/world-web` remains a non-authoritative Command producer; no web or API
  direct authoritative mutation path was added.
- Event order is a worker-side authoritative concern. V07.1 supplies the
  contract and persistent constraints but does not implement V09 writer,
  lease, fencing, transaction coordinator or crash recovery.
- V07.2 retains acknowledgement/final receipt, consumer receipt, outbox,
  queue/claim and durable end-to-end duplicate-return lifecycle ownership.
- V07.3 retains the replay executor, opening seed, reducer registry and complete
  version/seed replay binding.

## Acceptance

- Same `commandId` or `idempotencyKey` with changed canonical fingerprint fails
  closed with zero represented Event effect.
- An exact duplicate is classified as the original intent and the acceptance
  test demonstrates that a second Event is not appended.
- Historical authoritative Event `UPDATE` and `DELETE` fail in disposable
  PostgreSQL-compatible rehearsal.
- Correction is a new Event linked to the original; the original remains
  immutable.

## Verification notes

An early pre-candidate boundary run rejected use of `Date` for validating audit
timestamps as an ambient-time leak. The parser was changed to lexical canonical
RFC3339 validation before the code candidate was committed. After adding the
second migration, a legacy test hard-coded one manifest entry; it was updated
to assert the manifest length and landed in the acceptance target. A later full
run encountered one existing V00.3 readiness timeout; the isolated test passed,
and the subsequent complete `pnpm check` passed 350/350 tests.

## Deliberate gaps and gates

- ADR-16 remains `PROPOSED_NOT_APPROVED`. The migration is branch-local and may
  not be merged/promoted or published.
- ADR-20 remains `PROPOSED_NOT_APPROVED`; V07.2 may not queue a Command.
- No RLS/grant expansion was made. No production database was configured or
  accessed.
- The step is P0 `IMPLEMENTED_UNVERIFIED`. No independent approval or
  `VERIFIED` state is claimed.
