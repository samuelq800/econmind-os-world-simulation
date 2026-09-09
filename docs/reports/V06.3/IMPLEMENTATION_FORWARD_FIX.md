# V06.3 package-review forward fix

## Status

- Finding: `V06-PKG-BLK-01`
- Original package target:
  `26cbb32004aa1888bac16529c4a957150035fa48`
- Original V06.3 code candidate:
  `c1bd5e073a6a8f7abdc49ca09aecf27c89b0c453`
- Forward-fix code candidate:
  `7a6ad76d7e43f96a143a4620afc33c8b107261e0`
- Step status: `IMPLEMENTED_UNVERIFIED`
- Independent closure: `PENDING`
- V07: `NOT_STARTED`

## Root cause and correction

`pendingDueSimulationEventsInOrder` exposed the approved total order, but
`completeDueSimulationEvent` independently accepted any pending due event ID.
The caller could therefore skip the ordered head and mutate later work first.

The completion transition now derives the authoritative pending due-work head
from the same versioned comparator. A pending due event that is not that head
fails with `SCHEDULED_EVENT_ORDER_VIOLATION` before any state mutation. Once
the head completes, the next ordered event becomes eligible.

The already-completed check intentionally remains before the head check, so an
exact retry is still `applied: false` even when other work is pending. No
scheduler version, serialized field, priority mapping, clock semantic or
V06.1/V06.2 behavior changes.

## Regression coverage

- Direct reproduction: priority 200 completion is rejected while a same-time
  priority 0 event is pending; state remains unchanged, then ordered
  completions succeed.
- Property/restart: across generated insertion orders, every non-head attempt
  fails, each head completes, each completion is serialized/restored, and an
  exact completed-event retry remains a no-op.
- Existing locale-independent ordering and impossible PREOPEN recovery tests
  remain active.

No database, RLS, migration, production state or V07 code is affected.
