# V20 FX and International Finance — foundation implementation record

## Status and boundary

`FOUNDATION_IMPLEMENTED_UNVERIFIED`. This isolated pure-Core candidate starts
from `origin/main` `ec5ceb2ef8434fc3f6c40c8c62b0311a3676a24d`; it does not
change `status/progress.json`, a Gate, `main`, or a production surface.

`fx-international-foundation.ts` consumes immutable caller facts and produces
exact calculation traces/replay proof only. All facts are bound to source and
predecessor references, source version, snapshot reference/hash, canonical
payload and integer simulation-millisecond time. Every state-like result is a
non-authoritative before/delta/after calculation output.

## Implemented V20 contracts

- V20.1 indexes one rate per country/snapshot, not a bilateral matrix; every
  conversion needs matching caller-supplied rate, rounding decision and time.
- V20.2 separates private payer/dealer/payee settlement from official reserve
  facts, requires bilateral external-debt reconciliation, and applies official
  intervention/sterilization only from supplied deltas.
- V20.3 preserves execution-rate cash as a locked historical fact and makes a
  current-rate revaluation a separate trace.

## Policy and integration exclusion

Core selects no policy exchange rate, spread, capital control, intervention
amount, rounding decision or macro formula. It creates no rate table, account,
ledger, posting, World State, durable idempotency record, Command, Event,
receipt, database/RLS/migration, API/worker/UI, authorization, deployment or
production mutation. The later authoritative writer owns persistence,
transactional uniqueness and all product integration.
