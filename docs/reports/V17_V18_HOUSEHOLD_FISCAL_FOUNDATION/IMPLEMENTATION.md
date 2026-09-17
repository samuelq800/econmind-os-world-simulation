# V17–V18 household and fiscal foundation implementation record

## Candidate identity

- Candidate code SHA: `40c7476213f1b9d57533fbfd57286defe954202d`
- Foundation SHA: `5356fe93932eb285b3c21977a655e4c6e7bb6746`
- Branch: `codex/c-v17-v18-household-fiscal-foundation`
- Execution plan: `docs/exec-plans/V17_V18_HOUSEHOLD_FISCAL_FOUNDATION.md`
- Report state: `FOUNDATION_IMPLEMENTED_UNVERIFIED`
- Effective risk: P0; independent review remains required.

This is a pure Core preparation candidate only. It does not start, complete, or
change the lifecycle/Gate status of V17 or V18, and it makes no integration,
runtime, or release claim.

## Implemented pure-kernel surface

`packages/core/src/engine-kernels/household-fiscal-closure.ts` adds and exports
two deterministic functions through the existing Core barrel:

- `closeHouseholdDomesticClosure` consumes a Banking-owned external deposit
  snapshot plus externally settled wage, transfer, tax, and debt-service
  receipt references. It excludes approved-but-unpaid transfers from usable
  cash. It closes caller-prioritized domestic final demand against explicit
  supply and unit price inputs, with separate supply- and cash-shortage output.
- `closeFiscalTreasury` consumes a CB-owned external TGA snapshot. It keeps
  tax assessment, explicit credits, actual settled cash collection,
  appropriation/commitment capacity, and caller-declared payment priorities
  distinct. A cash shortfall yields only the supplied `ARREAR`, `DELAYED`, or
  `DEFAULT` disposition with zero paid amount; it cannot produce `PAID`.

Every returned monetary or quantity transition has a stable trace reference,
stable input/output references, canonical exact decimal amount and currency or
unit, and checked `before + delta = after` continuity. A cash-constrained
quantity that cannot be represented exactly under the existing decimal policy
fails closed rather than rounding. All balances remain inert output traces:
there is no household-owned copy of the Banking deposit and no Treasury-owned
copy of the CB TGA.

The associated focused vector is
`tests/world-core/v17-v18-household-fiscal-foundation.test.ts`. It covers
settled-only income, unpaid-transfer exclusion, exact receipt/supply/cash
traces, supply and cash shortages, no deposit duplicate, deterministic replay,
tax credit/receivable/TGA traces, commitment capacity, ordered payment
blocking, arrear/default behavior, and rejected unsettled, unordered,
overspending, fake-collection, overdraft, and non-representable allocation
inputs.

## Deliberate exclusions and remaining gaps

- This candidate does not create or mutate World State, accounts, receipts,
  events, commands, ledgers, payments, arrears, debt, guarantees, SOE assets,
  DB/RLS/migrations, API/worker/UI, authorization, schedules, or Supabase.
- It contains no tax-rate, price, payment-priority, default, poverty, cost, or
  other macro-policy formula. Price, priority, and insufficient-cash outcome
  are explicit caller inputs; no new policy is inferred.
- V17.3 poverty/cost read models, V18.2 debt/guarantee/SOE flows, and V18.3
  Finance commands/forecast/ledger/permission integration are not implemented
  by this foundation candidate.
- Normal-mode V13/V15/V16 and V17/V18 hard dependencies remain unfinished or
  unverified. V09.3 is quarantined release/persistence evidence and does not
  block this isolated preparation, but this record does not alter the
  documented dependency set or establish product readiness.
- P0 independent review, integration, DB/RLS, migration, authorization,
  persistence/recovery, concurrency, production, calibration, and full
  repository `pnpm check` evidence remain `NOT_RUN` or pending by scope.

Accordingly this record must remain
`FOUNDATION_IMPLEMENTED_UNVERIFIED` pending the required independent review.
