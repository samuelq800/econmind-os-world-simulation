# V16.3 Housing/Safety Authority Foundation Evidence

## Candidate disposition

`FOUNDATION_IMPLEMENTED_UNVERIFIED`. Authority is inspected as an inert input;
no authority is granted, persisted, escalated or acted upon.

## Implemented calculation boundary

An emergency calculation requires an `ACTIVE` Captain approval record whose
issued and expiry simulation-millisecond values bracket the explicit current
simulation time. Expired, future or non-active records are rejected. The replay
trace retains all relevant input/output IDs and before/after workforce/backlog
transitions.

This does not replace future authoritative authorization re-resolution, and it
does not create a hidden subsidy, population or project shortcut.

## Focused evidence

The focused suite rejects expired authority, accepts only active unexpired
authority and verifies the accepted authority identifiers are present in the
replay trace.
