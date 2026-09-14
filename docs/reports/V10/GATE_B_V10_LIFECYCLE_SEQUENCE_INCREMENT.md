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

## Evidence boundary

This is local pure-Core lifecycle evidence. It covers the narrow V10
Treasury-GCU path only; it does not cover authorization revocation, arbitrary
Command types, durable worker restart across every lifecycle phase, full
real-PostgreSQL contention, process kill, browser E2E, or RLS/grant negatives.
It is not a Gate B approval, staging authorization, merge authorization, or
Supabase action.
