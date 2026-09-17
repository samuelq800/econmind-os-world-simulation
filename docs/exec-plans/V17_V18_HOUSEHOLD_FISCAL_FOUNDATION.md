# V17–V18 household and fiscal foundation-mode execution plan

> `FOUNDATION_IMPLEMENTED_UNVERIFIED` is the intended report-only candidate
> state. This plan does not alter `status/progress.json`, start V17/V18, or
> satisfy their NORMAL-mode dependencies.

## Authority and scope

- Work packages: V17 (E13 Household/Demand) and V18 (E14 Fiscal/Treasury).
- Binding sources: MASTER-U1235–U1312 and MASTER-U1313–U1412; in particular,
  settled-only transfers, final consumption, TGA cash, tax credits, budget /
  commitment / payment separation, cash shortfall and arrears.
- Architecture constraints: ADR-02 (one owner; deposits read from Banking),
  ADR-04 (only settled cash is usable), ADR-08 (no invented price, tax-rate or
  default formula), and the pure-kernel boundary in
  `docs/planning/V11_V18_PURE_KERNEL_PREPARATION.md`.
- Explicit exclusions: World State ownership, commands, events, durable
  receipts, ledgers, DB/RLS/migrations, worker/API/UI, authorization, time
  schedules, Supabase, production, calibration, tax-rate/price/default rules,
  and any V17/V18 status or Gate change.

## Dependency and decision gate

- V17.1–V17.3 and V18.1–V18.3 are NORMAL-mode work with unfinished hard
  dependencies. This is a controller-authorized pure-Core preparation only;
  it cannot start or complete those steps.
- No economic policy, payment-priority, price, tax-rate, or default rule is
  inferred. A caller supplies an explicit deterministic priority and an
  insufficient-cash disposition.
- Effective risk is P0 because the candidate constrains future financial and
  household settlement. It remains `FOUNDATION_IMPLEMENTED_UNVERIFIED` pending
  independent review; no self-approval, merge, or `VERIFIED` claim is made.

## Change plan

- Add one pure `packages/core/src/engine-kernels` module and export it from the
  existing kernel barrel.
- Add focused E13/E14 invariant tests using exact money, quantities, unit
  prices, explicit references, before/delta/after traces, and deterministic
  replay equality.
- Add implementation and test-evidence documents. Every derived balance is an
  inert trace against an external account reference, never a second durable
  household deposit or Treasury account.
- Household scope: settled wage/transfer/tax/debt-service paths; unpaid
  transfers excluded from cash; supply and cash-constrained final demand.
- Fiscal scope: settled tax collections and credits, budget commitment capacity,
  external TGA cash, strictly caller-declared payment priority, and explicit
  PAID/ARREAR/DELAYED/DEFAULT outcomes.

## Validation plan

- Positive vectors: settled household/fiscal paths, exact trace continuity,
  controlled demand/supply/cash shortages, credits, commitments, priorities,
  arrears and deterministic replay.
- Negative vectors: unsettled income, duplicate references, currency/unit
  mismatch, overspent commitment, unordered priorities, and fake paid outcomes.
- Required focused commands: Core build and typecheck, the E13/E14 foundation
  test, the existing kernel vector test, targeted lint/format, boundary,
  authoritative-pattern, secret, and diff checks.
- Database/RLS/migration/replay/concurrency/production/calibration checks are
  `NOT_RUN`: no such code is in scope.

## Exit condition

Freeze and push only an immutable pure-Core candidate. Report actual command
outcomes and remaining gaps, keep this candidate
`FOUNDATION_IMPLEMENTED_UNVERIFIED`, and stop for the required independent
review before any dependent or authoritative work.

## Review-remediation addendum

- Any fiscal commitment candidate must reconcile a complete caller-supplied
  immutable budget-line snapshot and its predecessor-linked submitted
  commitment chain. A caller-owned `committedBefore` field is invalid; existing
  and proposed commitments aggregate against the exact appropriation before a
  candidate can return.
- Settled household income, Treasury payment, and commitment evidence must all
  bind to one immutable source/version/snapshot/hash/predecessor-hash lineage.
  The kernel emits a canonical SHA-256 preimage for deterministic replay; the
  future authoritative owner remains responsible for external source
  attestation and durable replay/idempotency.
- Runtime inputs must fail closed for unknown household settlement kinds and
  insufficient-cash dispositions, including values introduced via an unsafe
  TypeScript cast.
