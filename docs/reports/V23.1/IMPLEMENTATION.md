# V23.1 — Production GDP Authority: pure Core preparation

## Frozen candidate and authority

- Code/plan/test SHA: `d98106e4f8c2a08db7680b56cf482d7c4e61d53a`.
- Base: `origin/main` `ebc5fcbe010559d5d6a94e86792a77ecc02502d2`.
- Branch: `codex/v23-1-national-accounts-core`.
- Result: `PREPARATION_ONLY`; V23.1 remains `PLANNED` in authoritative
  `status/progress.json`. All ten hard dependencies V13.3–V22.3 are still
  `PLANNED`. ADR-06, ADR-07 and ADR-08 remain `PROPOSED_NOT_APPROVED`.

## Pure calculation delivered

The new Core module consumes caller-supplied immutable period-completeness,
settled sector-production and product-tax/subsidy facts. It binds country,
integer simulation-time period, currency, accounting version, snapshot hash,
source and predecessor references. A closure fact declares exactly which
sector/fiscal facts belong to the period and names them as predecessors; an
absent fact is rejected, never silently treated as zero. Each gross output,
intermediate consumption and fiscal component retains its source fact and
receipt reference.

Production GDP is calculated once as:

`Σ(gross sector output − intermediate consumption) + product taxes − product subsidies`.

Exact decimals are used without floating conversion or implicit rounding.
Duplicate receipts in the same contribution role are rejected, while the
same real settlement may legitimately appear as supplier output and buyer
input or on both production and expenditure sides. Transfer, project approval
and commissioning labels cannot enter as settled real production. The output
is only a deterministic candidate and replay preimage, never an authoritative
GDP field.

The optional C/I/G/X/M comparison is a V23.2-facing _reconciliation helper_
only. It requires all five explicit, period/version/currency-matched
components, with delivered ownership transfer for X/M. A mismatch throws
`NationalAccountsReconciliationError` containing production GDP, expenditure
GDP and their exact signed difference; neither value is averaged or
overwritten. No BOP, CPI, score or second GDP state is created.

## Verification

- Focused Vitest: **PASS**, one file / eight tests.
- Core typecheck/build: **PASS**.
- Targeted ESLint and Prettier: **PASS**.
- Authoritative-pattern scan: **PASS**.
- Boundary scan: initial parallel invocation while Core build was running
  **FAIL** with unresolved workspace imports; a standalone rerun after build
  **PASS**. The initial failure is not represented as a clean first-pass run.
- Local environment, secrets and foundation-policy checks: **PASS**; no
  linked Supabase project or permitted database mutation.
- `git diff --check`: **PASS**.

## Not run / limitations

The caller attests settled receipts and complete period sources; this pure
kernel cannot independently verify durable receipt authenticity, global
completeness, cross-period idempotency or authoritative account publication.
ADR-06/07/08 and upstream package decisions remain unresolved. V09 writer,
V23 product integration, end-to-end economic reconciliation, independent
review, migrations, production access and Gate approval are **NOT_RUN**. No
other engine, UI or page was changed to maintain GDP.
