# ADR-17 — Persistence, commit, replay and failure boundary

## Status and authority

```text
Decision: APPROVED
Authority: RESPONSIBLE_HUMAN_OWNER
Approved at: 2026-09-10T00:11:57Z
```

This record transcribes the project owner's explicit architecture decision. It
is not a Codex self-approval, and it does not claim that all assigned runtime
mechanisms already exist.

## Approved resolution

- Opening seed plus append-only authoritative Events define replay lineage.
  Historical correction is a new correction Event, never `UPDATE`, `DELETE`,
  silent replacement or projection rewrite.
- Current-head tables, materializations, indexes and snapshots may accelerate
  access or recovery but are not an independent historical Source of Truth.
- One logical authoritative transition must ultimately support all-or-zero
  commit semantics for all facts it owns.
- Retry, replay and recovery are deterministic, idempotent, version-aware and
  fail closed on identity or canonical-intent conflict. A retry may not create
  a second authoritative fact.
- One authoritative World must not have competing committed writers.

## Approved implementation ownership

- **V07 — Command/Event/Replay layer:** canonical Command identity and
  fingerprint, immutable Event Ledger, receipt separation, correction Events,
  replay lineage and deterministic replay contracts, V07-owned persistence
  foundations, and compatibility interfaces for later atomic commit.
- **V08 — Ledger/Posting layer:** the inventory, financial, ledger and posting
  foundations assigned by the authoritative V08 contracts, compatible with the
  same future authoritative transaction.
- **V09 — writer/commit/recovery layer:** single-World writer enforcement,
  lease, fencing, stale-writer rejection, transaction coordination, atomic
  commit, crash recovery, retry and outbox interaction assigned by the
  authoritative V09 contracts.

Later packages consume the decision only through their own authoritative
contracts. V07 must not pull V08 economic logic or V09 runtime mechanics
forward merely because the architecture decision is approved.

## Compatibility and completion boundary

V07 contracts must make the later V09 single-writer and atomic-transition
mechanics possible without redefining Command or Event semantics. Approval of
ADR-17 permits its already assigned V09 implementation once V09 dependencies
and any separate ADR gates are satisfied; it does not assert that V09 has been
implemented.

Affected work packages: V07, V08, V09, V30.
