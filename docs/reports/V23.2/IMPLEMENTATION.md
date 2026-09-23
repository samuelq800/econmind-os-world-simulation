# V23.2 — Expenditure/BOP/CPI pure Core preparation

## Frozen candidate and readiness

- Code/plan/test commit: `61a35ffab2141fe8b4c74d4c8311f5c28813dd1e`.
- Base: `origin/main` `2dc1de3fc4b4ea4c5f4792538d961420317912db`.
- Branch: `codex/v23-2-reconciliation-core`.
- Result: `PREPARATION_ONLY`. Authoritative V23.1 and V23.2 step statuses
  remain `PLANNED`; ADR-08 and ADR-15 remain `PROPOSED_NOT_APPROVED`.

## Implemented pure calculations

The new Core module uses the merged V23.1 production-GDP/expenditure
comparison; it does not redefine or modify production GDP. Its eligibility
fact binds each C/I/G/X/M amount and receipt to an explicit settled final-use,
real capital formation, public-service consumption or delivered trade class.
Transfer, intermediate purchase, project approval/commission, contract and
shipment classes do not qualify. If C+I+G+X−M differs from production GDP,
the V23.1 reconciliation error preserves both values and exact difference;
there is no average or competing GDP state.

The current-account candidate uses the same reconciled X/M once, then adds
net settled primary income and net secondary transfers. An explicit closure
fact declares all flow source facts and predecessors, including a valid empty
set; missing sources are not silently zero. Transfers enter current account,
not production or expenditure GDP. The result retains country, period,
currency, accounting version, source facts and receipts.

The CPI candidate requires exactly Food, Energy, Housing, General Goods and
Services in one fixed, versioned basket. Each category has a fixed quantity,
base/previous/current observed prices and source receipt references. Exact
basket costs and signed category cost changes are calculated without float
conversion or implicit rounding. Base-relative CPI indices and period
inflation/contributions are exact numerator/denominator pairs; contribution
numerators sum exactly to headline change under the same previous-cost
denominator. These are accounting contributions, not causal attribution.

All operations consume same-snapshot caller facts, emit deterministic
canonical replay preimages and re-execute from supplied facts for replay
verification. No source fact is authenticated against durable Command/Event,
Posting or receipt storage by this pure module; that remains an integration
obligation of the authoritative owner.

## Checks

- Focused Vitest: **PASS**, one file / eight tests.
- Core typecheck/build, targeted ESLint/Prettier: **PASS**.
- Authoritative-pattern and repository-boundary scans: **PASS**.
- Local environment, repository secrets and foundation policy: **PASS**.
  No linked Supabase project or permitted database mutation.
- `git diff --check`: **PASS**.

## NOT_RUN and authority limits

Formal V23.1/V23.2 product dependencies, ADR-08 rounding/period policy,
ADR-15 CPI attribution policy, durable receipt authenticity, comprehensive
period source closure, V09 atomic publication, BOP capital/financial account,
independent review, Gate, migration and production integration are **NOT_RUN**
or unresolved. Risk/score and authoritative economic state were not written;
no V23.1, V22.3, API/UI, schema or main-site files were changed.
