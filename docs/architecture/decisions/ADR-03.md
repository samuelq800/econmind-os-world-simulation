# ADR-03 — Simulation Clock, pause, cutoff and same-time priority

## Status and authority

```text
Decision: APPROVED
Authority: RESPONSIBLE_HUMAN_OWNER
Approved at: 2026-09-09T13:10:09Z
```

This record transcribes the project owner's explicit decision. It is not a
Codex self-approval.

## Approved resolution

- SimTime uses non-negative integer simulation-millisecond ticks.
- One real second equals exactly 10,000 simulation ticks.
- A 360-simulation-day calendar remains authoritative.
- PAUSED wall elapsed time contributes zero SimTime.
- RUNNING downtime uses deterministic catch-up from recorded advancement
  inputs and intended due times.
- Same-time work is totally ordered by
  `(dueSimTime, priorityRank, scheduledEventId)`.
- Command cutoff locks at the World SimTime observed when the worker begins the
  authoritative transaction.

## Exact implementation boundary

- The multiplier is applied once inside the clock boundary.
- Core receives recorded advancement input from an adapter and does not read
  ambient wall time or depend on timer callback order.
- Resume continues from frozen SimTime; it does not catch up paused wall time.
- Real timestamps remain audit or adapter metadata.
- UI cadence, production scheduler topology and future stochastic timing remain
  undecided.

## Alternatives not selected

- Floating-point seconds.
- Direct `Date.now()` authority.
- Timer callbacks as authoritative ordering.
- Catching up wall time accumulated while PAUSED.

## Compatibility

Any future unit, cutoff or ordering change requires a new ADR and clock/order
version. Persisted deadlines and events retain their original version for exact
replay.

Affected work packages: V01, V06, V09.
