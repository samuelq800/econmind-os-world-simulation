# V06.1 implementation report

## Status

- Implementation commit: `41fd476a221e7d14f5fc5fec76cafeb8d9263dc7`
- Effective risk: P0 authoritative time and determinism boundary
- Status: `IMPLEMENTED_UNVERIFIED`; independent review is required before
  V06.2 may start

## Implemented scope

World Core now owns one versioned, pure Simulation Clock with non-negative
integer simulation-millisecond ticks. It converts one active real millisecond
to exactly 10 simulation ticks and one real second to exactly 10,000 ticks,
applies the multiplier only at the clock boundary, and exposes exact reverse
conversion only for integral real-millisecond intervals.

Clock advancement accepts a frozen, runtime-branded `AdvanceClockInput`; it
does not read ambient clocks or execute behavioral input properties. Clock
state is immutable and runtime-branded, and calendar decomposition uses an
exact 86,400,000-tick simulation day and 360-day year. A source interface keeps
wall-clock observation outside the pure core and makes accepted recorded input
the replay boundary.

The authoritative-pattern scanner now rejects ambient `Date`, `performance`,
or timer use in World Core and rejects direct multiply/divide-by-ten operations
outside the Simulation Clock owner. Unit and property tests cover exactness,
monotonicity, composition, zero-based calendar boundaries, malformed/forged
inputs, and the required 8,640-real-second example.

## Boundary declaration

- Authoritative owner affected: the single Simulation Clock in World Core.
- Reads: explicit canonical active-real-millisecond advancement input and
  canonical `SimTime`.
- Writes: immutable in-memory clock state only.
- Events/commands: none introduced.
- Database/RLS/production: no schema, policy, connection, or mutation.
- Time: real timestamps remain adapter/audit metadata and are not accepted by
  core as authoritative economic time.
- Legacy impact: additive core exports and scanner enforcement; no existing
  state or persistence migration.

## Deliberate exclusions

PREOPEN/RUNNING/PAUSED/ENDED transitions, pause intervals, deterministic
RUNNING catch-up, due queues, same-time ordering, command cutoff, daily
settlement identity, persistence and restart recovery belong to V06.2/V06.3
and were not started. ADR-04 remains `PROPOSED_NOT_APPROVED`.
