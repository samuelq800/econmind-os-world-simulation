# V19.1 Commercial Bank Ledger — foundation implementation record

## Status

`FOUNDATION_IMPLEMENTED_UNVERIFIED`. This is an owner-authorized isolated
pure-Core candidate from `origin/main`
`72dcb20d83fbc7365fb22d5ac24c373e3ca55994`. It changes neither
`status/progress.json` nor any Gate, and it is not a NORMAL-mode V19 start,
verification, or merge authorization.

The effective risk is P0: exact financial conservation, replay lineage, and
future authoritative ownership are constrained. Independent review is required
before any promotion.

## Implemented scope

- `bank-central-foundation.ts` validates caller-owned immutable bank facts and
  produces exact paired loan origination and repayment traces.
- Origination increases `loanAssets` and `demandDeposits` by exactly the same
  principal. Repayment is explicitly either deposit cancellation or settlement
  asset transfer; insufficient deposits fail closed.
- NPL recognition is a bounded classification no greater than existing loans.
- Every input fact is revalidated for source, predecessor, version, snapshot,
  snapshot hash, canonical payload, and simulation-time binding. Results carry
  deterministic replay preimages.

## Ownership and exclusions

The future Banking owner owns bank balances. This pure calculation owns no
account, posting, command, Event, receipt, mutable World State, or durable
idempotency record. There are no DB/RLS/migration, API/worker/UI, authorization,
scheduler, Supabase, production, or legacy mutations.

ADR-02 owner separation is preserved. ADR-08 and ADR-09 remain unresolved:
the code accepts exact caller facts but chooses no rate, interest, haircut,
reserve/capital ratio, maturity, approval threshold, default, or rounding rule.

## Next action

Freeze and independently review the combined V19 foundation candidate. Product
V19 dependencies, persistence, authoritative posting, and package status stay
outside this report.
