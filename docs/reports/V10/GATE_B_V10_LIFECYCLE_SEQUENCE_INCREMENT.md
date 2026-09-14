# Gate B V10 lifecycle command-sequence increment

**Recorded:** 2026-09-14  
**Scope:** pure-Core Treasury-GCU Reserve → Ship → Deliver lifecycle

## Local evidence added

`tests/world-core/v10.4-local-acceptance.test.ts` now drives a fixed-seed,
100-run asynchronous sequence model. Each sequence contains one to sixteen
`RESERVE`, `SHIP`, and `DELIVER` attempts against the real V10 Core functions.
The independent phase model permits only `AVAILABLE → RESERVED → IN_TRANSIT →
DELIVERED`; it varies Buyer Treasury balance from one to twelve GCU.

For an attempt that cannot advance the model—out-of-order, repeat, or an
insufficient-funds delivery—the test requires the canonical serialized ledger
state to remain unchanged. A legal advance must return a changed state, and
the final inventory posting count must match the model phase. The property
uses its own fixed seed and does not change the existing 29-property baseline
or its 1,000-run budgets.

The immutable candidate `f2da0066d22cc6cc2ed17dd6fbd07c662a51c4d9` also
executed this property in GitHub Actions run
[`34846740076`](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/34846740076),
where the disposable PostgreSQL V10.4 suite passed 12/12. Review B approved
this narrow increment for continuation with `BLOCKER=0`, `MAJOR=0`, and
`MINOR=0`.

## Approval-aware lifecycle increment

Candidate `0391a662fbe3a51db962297689d7f36e40b4000c` adds a separate,
fixed-seed 250-run model of the real V10 functions. Every generated sequence
may interleave seller Trade, buyer Trade, and buyer Finance signatures with
out-of-order Reserve, Ship, Deliver, and exact-retry attempts. The model
only permits Reserve once all three signatures have been recorded, then
enforces `AVAILABLE → RESERVED → IN_TRANSIT → DELIVERED`. Each successful
transition is reconstructed from the actual command, event, inventory, and
financial lineage; every rejected or duplicate attempt must preserve the
canonical approval-and-ledger state.

The same candidate passed the isolated disposable-PostgreSQL V09/V10 workflow
in GitHub Actions run
[`34852941751`](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/34852941751).
That run also completed migration validation and the worker/Core build steps.
It is automated evidence only and has not received a fresh independent review.

## Evidence boundary

This remains narrow V10 Treasury-GCU lifecycle evidence, additionally
exercised in the disposable PostgreSQL suite. It does not cover authorization
revocation within the generated model, arbitrary Command types, durable worker
restart across every lifecycle phase, full real-PostgreSQL contention and
process-kill recovery, browser E2E, or RLS/grant negatives. It is not a Gate B
approval, staging authorization, merge authorization, or Supabase action.
