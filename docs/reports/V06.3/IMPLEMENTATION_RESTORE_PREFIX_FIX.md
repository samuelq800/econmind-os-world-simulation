# V06.3 restore completion-prefix forward fix

## Status and history

- Finding: `V06-PKG-BLK-02`
- Rejected package target:
  `80ab3ecac0abbd622a7e2fc450101407db7f66f9`
- Prior completion-API fix:
  `7a6ad76d7e43f96a143a4620afc33c8b107261e0`
- New fixed code candidate:
  `d9a84bd0198ecdcc2a9fe739c1eb900dc4e4cef1`
- Status: `IMPLEMENTED_UNVERIFIED`
- Independent closure: `PENDING`
- V07: `NOT_STARTED`

All previous candidates, findings and review conclusions remain immutable
history.

## Root cause

The prior fix enforced the ordered head only in
`completeDueSimulationEvent`. The exported restore path reconstructed
canonical event statuses and called the shared scheduler constructor, but that
constructor did not validate whether completed due work was reachable through
the ordered completion API. A canonical `PENDING, COMPLETED` snapshot was
therefore accepted as authoritative.

## Centralized invariant

`assertDueCompletionPrefixInvariant` orders every event due at the state's
current SimTime with the approved
`(dueSimTime, priorityRank, scheduledEventId)` comparator. After the first
`PENDING` event, any later `COMPLETED` event causes deterministic
`SCHEDULER_STATE_INVALID` rejection.

The invariant is invoked by the sole internal `createSchedulerState`
constructor before it registers or exposes a state. All exported authoritative
state paths converge there: initial factory, lifecycle transitions, clock
advance/catch-up, event scheduling, ordered completion, canonical V2 restore,
and V1→V2 migration. `schedulerStates.add` exists only in this constructor.

This also rejects a newly scheduled due event if inserting it before already
completed same-time work would create an unreachable non-prefix state. Invalid
restore/migration input is not reordered, repaired or reinterpreted.

## Compatibility

No persistent field or scheduler version changes. Legal `COMPLETED` prefix +
`PENDING` suffix snapshots restore exactly. The next executable event is
identical before and after restore. Ordered head completion remains
`applied: true`; its exact retry remains `applied: false`; the next ordered
event then becomes executable. The earlier completion-API, locale-independent
ordering and impossible PREOPEN regressions remain green.

No database, RLS, migration, production state or V07 code is affected.
