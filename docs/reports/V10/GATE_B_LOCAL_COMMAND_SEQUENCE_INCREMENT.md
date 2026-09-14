# Gate B local command-sequence increment

**Recorded:** 2026-09-14  
**Scope:** pure-Core simulation scheduler only

## Local evidence added

`tests/property/command-sequence-state-machine.test.ts` drives a bounded,
fixed-seed sequence against an independent scheduler model. The sequence
contains advancing time, pause/resume, end, scheduling, exact duplicate
scheduling, same-identity mutation attempts, due completion, retry of a
completed event, invalid completion, and serialization/restart.

After every step it checks the real scheduler against the model for season
state, monotonic SimTime, scheduled-event intent and status, authoritative
pending order, and canonical restart equality. Rejected operations must leave
the serialized state unchanged.

Run it directly with:

```sh
pnpm test:state-machine
```

The local baseline runs 250 generated sequences of at most 90 operations. It
is included in `pnpm test:property`; that suite now contains 30 tests.

## Deliberate limits

This scheduler increment is not the full Gate B command-sequence campaign. A
separate narrow V10 Reserve/Ship/Deliver model is recorded in
`GATE_B_V10_LIFECYCLE_SEQUENCE_INCREMENT.md`; together they still do not cover
the complete V10 lifecycle, real PostgreSQL concurrency or crash recovery,
browser E2E, or RLS/grant negatives. They do not authorize Gate B, staging,
deployment, main merge, or any Supabase mutation. The recorded Gate B blockers
remain open until their separately required evidence is bound to an immutable
candidate.
