# V08.2 implementation report

## Result

```text
Step: V08.2 — 金融 Accounts/Postings 基础
State: IMPLEMENTED_UNVERIFIED
Code candidate: f5c022c7957a1128660d25e36ea46df99964a850
Automated evidence: PASS
Independent verification: NOT_CLAIMED
Migration: NOT_CREATED
Production mutation: NONE
```

## Implemented scope

- Added a versioned pure-Core financial account and posting contract whose sole
  authoritative writer is `applyFinancialPostingBatch` under
  `WORLD_FINANCIAL_POSTING`.
- Added bilateral and multilateral batches with two or more strictly positive
  debit/credit legs, one settlement currency, exact balance, canonical leg
  ordering and SHA-256 intent fingerprints.
- Added durable account identities with owner, country, class, currency and
  optional paired claim/counterparty identity. Receivable/payable helpers define
  counterpart identities without issuing debt or implementing later policy.
- Added V07 Command/Event causation, SimTime, exact one-step WorldVersion
  advancement, exact-duplicate receipts and conflicting-intent rejection.
- Added deterministic position projection with explicit signed net-debit
  convention. Legal credit balances are retained as negative net-debit values;
  no unilateral balance mutation API exists.

## Boundaries preserved

- Exact `Money`/`WorldDecimal` arithmetic only. JS numbers, zero/negative legs,
  tolerance, rounding, FX and cross-currency netting fail closed.
- The in-memory account/position state is a projection of authoritative posting
  history, not a second append-only history or a V09 persistence coordinator.
- V08.3 retains opening-source provenance and reconciliation. V09 retains
  lease, fencing, single-writer runtime, transaction coordination and recovery.
- No inventory mutation, banking, monetary/fiscal behavior, legacy runtime,
  schema, migration or production path was added.

## Acceptance

Focused unit and fixed-seed property evidence covers exact bilateral and
multilateral balance, unequal/missing/duplicate/zero-leg rejection, currency
isolation, deterministic replay, idempotent retry, conflict rejection, durable
account identity, claim/debt counterpart identity and forged-record rejection.
Full evidence is recorded in `docs/reports/V08.2/TEST_EVIDENCE.json`.

## Deliberate gaps and gates

- No schema was required for this pure contract, so no V08.2 migration exists.
- ADR-08 is not applicable because no rounding, FX, minor-unit conversion or
  formula arithmetic entered the implementation.
- V08.2 is P0 `IMPLEMENTED_UNVERIFIED`. Owner-authorized adjacent continuation
  permits V08.3 preflight but does not independently verify or authorize merge.
