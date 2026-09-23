# V21.1 Global Order Book pure Core foundation

## State and authority

`FOUNDATION_IMPLEMENTED_UNVERIFIED` on isolated branch
`codex/v21-1-global-order-book-foundation`, based on reviewed V20 tip
`c91744a6d02865829b82df2088025949de99d88d`.

The authoritative V21.1 contract in `planning/r2_steps.json` remains `NORMAL`
with hard dependencies V10.4, V12.3, V13.3, V18.3, and V20.3. Current
`status/progress.json` lists these and V21.1 as `PLANNED`. This candidate is a
bounded calculation foundation; it does not assert that the product dependency
gate has been met.

## Interface for E/C integration

`packages/core/src/engine-kernels/global-order-book-foundation.ts` exports
`calculateGlobalOrderBook` and `assertGlobalOrderBookReplayEvidence` directly.
The module is intentionally not added to the shared Core barrel in this
new-file-only ownership scope; a later integration owner can publish that
surface after review.

Inputs are one replay snapshot binding, caller-attested seller capacity facts,
and an ordered chain of immutable place/cancel action facts. Each fact carries
source, predecessor, source version, snapshot hash, canonical payload and
simulation-millisecond binding. Actions have strictly increasing sequence and
nondecreasing event time. The calculation accepts only the fixed 12-commodity
registry and each commodity's physical unit, with GCU per-unit limit prices.

For each new order, compatible resting orders are considered by better price,
then earlier placement time and sequence. Fills are exact decimal quantities;
an order's partial-fill preference and minimum fill are checked. An incoming
non-partial order executes only if its current matching attempt can fill its
whole quantity. The conservative foundation does not aggregate resting
non-partial orders across multiple later placement actions. Product-level
all-or-none market policy remains for the V21 owner to decide and review.

Seller capacity is deducted once when a reservation is held. Fill allocation
consumes only the held remainder; cancellation or expiry releases only the
unfilled remainder. Reservation references are unique within the supplied
snapshot, including pre-existing caller-attested references. The returned
before/delta/after movements are calculation evidence; the V08/V09 writer
must perform any authoritative inventory reservation and atomic commitment.

The output contains bid and ask limits, quantity, country, delivery-window
intersection, seller reservation reference, final book state and canonical
replay preimage. It deliberately does not select an execution cash price,
rounding, FX rate, tariff, delivery or payment posting. Those belong to
approved later policies and V21.2/V21.3 execution.

## Risk and remaining gates

P0: inventory non-duplication, exact quantity conservation, source lineage,
and deterministic price/time matching require independent review. The focused
tests cover all 12 catalog IDs, best-price/time order, partial and aggregated
incoming non-partial fill, cancellation, expiry, fractional quantities,
capacity exhaustion, duplicate reservation, mismatched units/currency/window,
unsafe discriminators, forged/stale facts and replay tampering.

No V09/V10, V20, website, Supabase, database, schema, migration, API, worker,
Command, Event, ledger, global status, Gate, main, deployment or production
file is changed. No full V21 package or Gate B claim is made.
