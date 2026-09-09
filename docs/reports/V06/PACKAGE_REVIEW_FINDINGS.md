# V06 package-level Review B findings

## Decision

- Result: `CHANGES_REQUIRED`
- Reviewed package target:
  `26cbb32004aa1888bac16529c4a957150035fa48`
- Bound V06.3 code candidate:
  `c1bd5e073a6a8f7abdc49ca09aecf27c89b0c453`
- Open findings: `BLOCKER=1`
- Package verified: `false`
- Merge authorized: `false`
- V07 authorized: `false`

This record transcribes the independent package review result. Project Session
A does not reclassify it as P0 or P1 and does not claim closure.

## V06-PKG-BLK-01 — mutation bypasses authoritative work order

The read API correctly orders due work by
`(dueSimTime, priorityRank, scheduledEventId)`, but the authoritative mutation
API accepts an arbitrary due event ID. With two due-at-zero events,
`EVENT_FIRST` at `ORDER_PRIORITY_000` and `EVENT_LAST` at
`ORDER_PRIORITY_200`, the query returns `[EVENT_FIRST, EVENT_LAST]` while
`completeDueSimulationEvent(state, EVENT_LAST)` succeeds and leaves
`EVENT_FIRST` pending.

The caller can therefore select execution order despite the approved ADR-03
total order. This blocks V06 package acceptance.

## Required closure

Make out-of-order due completion fail closed or provide an authoritative
ordered drain transition. Preserve exact retry behavior, canonical replay and
the V06.2 regressions. Add direct, property and restart coverage. Freeze new
V06.3 code/evidence and V06 package targets, then return to package review.
