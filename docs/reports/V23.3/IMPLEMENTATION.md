# V23.3 — read-only risk/score pure Core preparation

## Candidate identity and readiness

- Code/plan/test commit after rebase: `3ef1828a3d33b842fae37c2aca6547263fa1f68e`.
- Final base: `origin/main` `015de795dfd1780c14c580e743cd7d0fa721b0c6`,
  which contains V23.2 preparation. The initial staging base was V23.2
  frozen tip `13fe8283a451df123d0ab710c3b69d302926ef4d` before its
  mainline integration; only the V23.3 commit was replayed on main.
- Branch: `codex/v23-3-risk-score-core`.
- Result: `PREPARATION_ONLY`. Repository `status/progress.json` still lists
  V23.2 and V23.3 as `PLANNED`; ADR-15 remains
  `PROPOSED_NOT_APPROVED`. This is not a formal score-version decision.

## Scope and behavior

The new pure Core module recomputes V23.2 current-account and fixed-basket
CPI results from caller facts. It validates that both use one snapshot,
simulation tick, country, period, currency and accounting version, and that
CPI category contributions exactly reconcile to the headline. GDP mismatch,
invalid CPI source or conflicting account lineage yields an `ACCOUNT_ERROR`
candidate with a diagnostic and **no score or risk flags**. Policy errors
after account validation still fail closed rather than being relabeled as
account errors.

Three concrete candidate metrics—production GDP, current account and CPI
basket-cost change—must exactly match the recomputed account values and
their closure fact/receipt. Each metric retains initial/current values,
initial version/receipt and same-snapshot provenance. No second GDP/CPI
value is created. Versioned caller risk-policy facts supply threshold,
comparison and source receipt; risk explanations expose the actual value,
threshold, signed gap, trigger, metric/policy facts and receipts. They do
not assert a causal crisis mechanism beyond the evidenced comparison.

A separate caller-owned candidate score policy supplies base points,
per-metric direction/slope and risk-linked caps. The kernel calculates exact
baseline deltas, per-term point contributions, pre-guardrail score and
downward-only cap reduction, with an explicit candidate score-version ref.
No weights, thresholds or official score version were invented or approved
by this branch. Results are derived/read-only and cannot issue commands,
postings, state writes or economic bonuses. CPI contributions are accounting
attribution, not ADR-15 causal attribution. Replay recalculates the full
result from the same facts, rather than trusting a public hash preimage.

## Verification

- Focused Vitest: **PASS**, one file / eight tests after final rebase.
- Core typecheck/build and targeted ESLint/Prettier: **PASS**.
- Authoritative-pattern and repository-boundary scans: **PASS**.
- Local environment, repository secrets and foundation policy: **PASS**;
  Supabase is not linked and database mutation is disallowed.
- Staged and branch diff checks: **PASS**.
- The first focused run had one test expectation in the wrong deterministic
  sort order (the code emitted `CPI_COST_CHANGE`, `CURRENT_ACCOUNT`, then
  `PRODUCTION_GDP`). The expectation was corrected; the final run is 8/8.

## Not run and remaining authority

Durable account/receipt authentication, official score-weight and guardrail
approval under ADR-15, formal V23.2 product closure, V23.3 package acceptance,
writer/publication integration, end-to-end score consumers, independent
review, migration, production access and Gate approval are **NOT_RUN** or
unresolved. No V23.1/V23.2, V22.3, API/UI, schema, original main-site,
status or production file was changed.
