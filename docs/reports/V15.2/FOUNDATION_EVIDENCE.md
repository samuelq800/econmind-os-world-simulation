# V15.2 Healthcare Foundation Evidence

## Candidate disposition

`FOUNDATION_IMPLEMENTED_UNVERIFIED`. This is a deterministic calculation
candidate, not a healthcare service, procurement, payment, API, event or
authoritative health-state implementation.

## Implemented calculation boundary

`calculateHealthcareFoundation` receives identified demand/backlog, staffed
people, facility capacity, beds, medicine doses, an explicitly supplied
case-capacity limit and an observed monetary budget. Delivered care is the exact
minimum of demand/backlog and each stated case capacity. A zero staff or dose
stock may not advertise non-zero capacity.

The result exposes case delivery/backlog, bed occupancy, an inert
facility/procurement interface and replay transitions. It intentionally returns
no health, mortality, wellbeing, productivity or population effect.

## Focused evidence

The focused suite proves capacity minima and backlog carry; it separately
exercises zero staff, zero medicine and a changed monetary amount with unchanged
care output.
