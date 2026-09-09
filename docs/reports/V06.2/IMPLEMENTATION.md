# V06.2 implementation report

## Status

- Current implementation commit:
  `4e35c07758f4d39b05dac402eeb03b080275c3e0`
- Original implementation commit:
  `767b718d995210eafc4742c1a5a93e798329598e`
- Original evidence target:
  `07636cc48b84602968ff75135c7a0b9c495a2487`
- Status: `IMPLEMENTED_UNVERIFIED`
- Dependency: V06.1 remains `IMPLEMENTED_UNVERIFIED` and has independent
  `APPROVED_FOR_CONTINUATION` at evidence target
  `390367442fca12cd511e5df7199d6c1dc49c345a`.

## Review B forward fixes

Review B reproduced two P0 blockers against the original evidence target. The
original commits remain immutable history.

1. Canonical scheduled-event storage used `String.localeCompare`, allowing
   locale/ICU-dependent ordering. The forward fix uses an explicit code-unit
   comparator over the already ASCII-canonical event ID domain. A regression
   test disables `localeCompare` and covers the `AA`/`Z` ordering divergence.
2. Restore accepted a canonical lifecycle-impossible PREOPEN snapshot with a
   COMPLETED event. The forward fix rejects PREOPEN snapshots with completed
   work or pause history before reconstituting scheduler authority.

The forward fix does not change V06.1 time semantics or expand V06.2 scope.
V06.2 remains `IMPLEMENTED_UNVERIFIED` pending independent re-review.

## Implemented scope

World Core now owns a versioned, immutable scheduler state around the V06.1
Simulation Clock. It defines explicit PREOPEN, RUNNING, PAUSED and ENDED
transitions; PAUSED contributes zero SimTime; RUNNING advancement and catch-up
use only recorded exact clock input. Compact exact day/year crossing ranges
avoid expanding large catch-up intervals.

Scheduled events have canonical IDs, event types, due SimTime and idempotency
keys. Exact retry returns the same state; conflicting identity reuse is
rejected. Events remain pending while paused, can complete only when due and
RUNNING, and a second completion is a no-op. Canonical serialization and strict
restoration preserve completion status so restart does not repeat applied work.

## Boundary declaration

- Authoritative owner affected: the single E01 Simulation Clock/scheduler
  state; no second clock is introduced.
- Reads: V06.1 branded clock inputs, explicit lifecycle transitions and
  canonical scheduled-event records.
- Writes: immutable in-memory scheduler state and canonical serialized
  snapshots only.
- Database/RLS/production: no schema, policy, connection, migration publication
  or production mutation.
- Time: V06.1 integer ticks, exact 10,000 ticks per real second and exact
  360-day calendar remain unchanged.

## Deliberate exclusions

Same-time priority order, command cutoff and the settlement-stage registry are
V06.3 scope. Economic E02-E18 execution, durable database persistence, UI
authority and player-online behavior are absent. ADR-04 remains
`PROPOSED_NOT_APPROVED`.
