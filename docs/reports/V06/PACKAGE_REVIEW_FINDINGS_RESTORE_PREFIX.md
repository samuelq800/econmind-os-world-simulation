# V06 package re-review restore-prefix finding

## Decision

- Current result: `V06_PACKAGE_CHANGES_REQUIRED`
- Reviewed package target:
  `80ab3ecac0abbd622a7e2fc450101407db7f66f9`
- Bound code candidate:
  `7a6ad76d7e43f96a143a4620afc33c8b107261e0`
- New open finding: `V06-PKG-BLK-02`
- Prior `V06-PKG-BLK-01`: remains independently closed
- Package verified: `false`
- Merge authorized: `false`
- V07 authorized: `false`

This later review result supersedes the package-approval conclusion for the
same target without rewriting that historical review record.

## V06-PKG-BLK-02 — restore accepts a non-prefix completion state

`restoreSimulationSchedulerState` accepts a canonical snapshot in which a
later due event is `COMPLETED` while the authoritative ordered head remains
`PENDING`. The state could not be reached through the corrected completion API
but becomes authoritative through the exported restore path.

The global required invariant is: among events due at snapshot/current
SimTime, `COMPLETED` events form a contiguous prefix of
`(dueSimTime, priorityRank, scheduledEventId)`. Once the first `PENDING` due
event appears, every later due event must also be `PENDING`.

## Required closure

Centralize this invariant across every authoritative scheduler-state
construction path, including canonical V2 restore and V1→V2 migration. Reject
invalid snapshots without repair or reinterpretation. Preserve ordered
completion and exact retry semantics, add the specified unit/property/restart
coverage, and freeze new immutable V06.3 and package targets before focused
independent closure review.
