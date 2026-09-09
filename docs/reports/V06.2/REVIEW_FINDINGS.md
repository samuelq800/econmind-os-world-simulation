# V06.2 independent review findings

## Reviewed target

- Evidence target: `07636cc48b84602968ff75135c7a0b9c495a2487`
- Bound code candidate: `767b718d995210eafc4742c1a5a93e798329598e`
- Review decision: `P0_BLOCKER`
- Downstream action: stop V06.3 implementation; do not merge, promote or begin
  V07.

## P0-1 — locale-dependent canonical scheduler state

`createSchedulerState` sorted `scheduledEventId` with
`String.localeCompare`. Review B reproduced different allowed-ID orders under
`da-DK` and `en-US`, so serialized authoritative scheduler state depended on
locale/ICU rather than canonical input alone.

Forward fix: `4e35c07758f4d39b05dac402eeb03b080275c3e0` replaces locale collation with
explicit code-unit comparison and adds a regression that fails if
`localeCompare` participates.

## P0-2 — lifecycle-impossible PREOPEN recovery

`restoreSimulationSchedulerState` accepted and exactly round-tripped a
canonical PREOPEN snapshot containing a COMPLETED event. Starting that restored
state could silently skip work as already applied even though PREOPEN cannot
execute events.

Forward fix: `4e35c07758f4d39b05dac402eeb03b080275c3e0` rejects PREOPEN snapshots with
completed work or pause history and adds a canonical malicious-snapshot
regression.

## Status

Both findings have forward fixes and passing automated evidence. Closure is
not self-awarded: Review B must independently re-review the new immutable
evidence target before V06.3 may resume.
