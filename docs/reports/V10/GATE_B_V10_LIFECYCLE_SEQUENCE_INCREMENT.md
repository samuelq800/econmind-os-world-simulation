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

## Subsequent lifecycle evidence

The approval-aware model was extended by immutable candidate
`802ba25b37f25d2f097661d5ee20681938417e6e`, which interleaves a current
Buyer Finance revocation with signatures, lifecycle commands, and retries. Its
fixed-seed 250-run model requires a revoked, uncommitted Reserve to have zero
ledger effect, while facts already committed before revocation remain replayable
versioned obligations. Disposable PostgreSQL CI
[`34855951453`](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/34855951453)
passed. Candidate `1e04d72a78c75fdb82476f09509f1e0932143071` separately
proved the actual transaction-cutoff denial for a revoked Finance approval in
CI [`34855645977`](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/34855645977).

The controlled strict process-kill recovery matrix now covers all three narrow
lifecycle phases at `AFTER_EVENTS`, `AFTER_INVENTORY_POSTINGS`,
`AFTER_FINANCIAL_POSTINGS`, `BEFORE_RECEIPT`, and
`BEFORE_TRANSACTION_COMMIT`. Reserve was observed in CI
[`34856225295`](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/34856225295)
for `7541da72fd6b2ba8c59eee09961d59ec21650ada`; Ship was observed in CI
[`34856697664`](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/34856697664)
for `69b5e2297755525268d58e9dc3152add95df21d6`; Delivery remains bound to
the earlier strict CI `34850501755`. Each parent requires exact
`{ code: null, signal: 'SIGKILL' }`, verifies no durable partial footprint
through a fresh pool, then commits the same candidate once.

The current hard-property index is
[`GATE_B_HARD_PROPERTY_EVIDENCE_LEDGER.md`](GATE_B_HARD_PROPERTY_EVIDENCE_LEDGER.md).

## Evidence boundary

This remains narrow V10 Treasury-GCU lifecycle evidence, additionally
exercised in the disposable PostgreSQL suite. It now covers Finance revocation
within the generated model and controlled process-kill recovery for
Reserve/Ship/Deliver, but it does not cover arbitrary Command types, browser
E2E, or RLS/grant negatives. The newer evidence range has not received fresh
independent review. It is not a Gate B approval, staging authorization, merge
authorization, or Supabase action.
