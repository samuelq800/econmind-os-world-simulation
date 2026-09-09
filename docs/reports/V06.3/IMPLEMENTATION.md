# V06.3 implementation report

## Status and immutable code candidate

- Step: `V06.3` — deterministic time order and boundary tests.
- Code candidate:
  `c1bd5e073a6a8f7abdc49ca09aecf27c89b0c453`.
- Status: `IMPLEMENTED_UNVERIFIED`.
- Required next gate: `V06_PACKAGE_REVIEW`.
- V07 status: `NOT_STARTED` (`V07.1` remains `PLANNED`).

Project Session A does not claim verification, package acceptance or merge
authority.

## Implemented contract

- `SCHEDULER_ORDER_V1` fixes the authoritative total order as
  `(dueSimTime, priorityRank, scheduledEventId)`. The final identifier
  comparison is explicit locale-independent code-unit order.
- `SCHEDULER_PRIORITY_REGISTRY_V1` is a closed registry with ranks 0, 100 and 200. Callers provide a registered priority ID, never an ad-hoc numeric rank;
  V06.2 callers retain priority 100 by default.
- `SETTLEMENT_STAGE_REGISTRY_V1` records the exact 15 Constitution stages in
  phases 1 through 15, traced to `CONSTITUTION-U0190` through
  `CONSTITUTION-U0204`. Semantic stage IDs are separate from E01–E18 Engine
  IDs, so no third numbered stage list is introduced.
- `ENGINE_STAGE_MAPPING_V1` provides the explicit versioned
  Engine-operation-to-Stage mapping mechanism. Only E01's scheduled-event
  drain metadata is registered; it is marked `REGISTERED_NOT_IMPLEMENTED` and
  `implementationClaim: false`. No E02–E18 economic operation is implemented
  or claimed.
- The authoritative transaction cutoff is an immutable snapshot of World
  SimTime created only when the scheduler is RUNNING and the worker begins the
  authoritative transaction.
- Due work is returned only while RUNNING and in the fixed total order. Paused
  work stays pending. The scheduler does not accept player presence or online
  state as an input or tie-breaker.
- Scheduler state advances to `SIMULATION_SCHEDULER_V2`, persisting both order
  version and priority ID. Canonical V1 snapshots migrate deterministically to
  the V2 default priority; V2 restore remains exact and rejects noncanonical or
  lifecycle-impossible state.

## Preserved semantics

V06.1 bigint/non-negative SimTime, exact 10,000 ticks per real second, PAUSED
zero-time behavior, deterministic RUNNING catch-up, and exact day/year
boundaries are unchanged. V06.2 canonical identities, idempotent scheduling,
due-only completion and restart-safe duplicate prevention are unchanged. The
two V06.2 P0 regression tests remain active and pass.

## Boundary and exclusions

The change affects only `packages/core` scheduling/registry code and its tests.
It adds no database schema, RLS policy, production connection or mutation,
economic reducer, durable transaction, command/event schema, UI authority or
V07 implementation. ADR-04 remains `PROPOSED_NOT_APPROVED` with its V11–V17
gate unchanged.
