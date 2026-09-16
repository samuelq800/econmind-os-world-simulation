# V11.1 implementation report — E02 Population Stocks/Flows

## Status

```text
Step: V11.1 — E02 Population Stocks/Flows
State: IMPLEMENTED_UNVERIFIED
Risk class: P0 authoritative-state change
Code candidate: c5532ebe0c7afb54ca25f228c78a541e00714321
Baseline/continuation authority: 626b2e8b25599abbd5b62cdf16a229cf8f6be307
Independent review: NOT_RUN / REQUIRED BEFORE VERIFIED OR PROMOTION
Migration: NOT_CREATED
Production/shared-Supabase access or mutation: NONE
```

This is a non-production candidate under
`docs/governance/WORLD_CORE_V11_1_CONTINUATION_POLICY.json`. It is not a Gate B
pass, a V11.1 verification decision, or authorization for V11.2, a main merge,
deployment, migration publication, or production access.

## Implemented scope

`packages/core/src/population/population-engine.ts` implements the E02-only,
pure state transition described in `docs/exec-plans/V11.1.md`.

- `PopulationCountryState` holds total population, the three E02 age cohorts,
  and household count. The stored total must exactly equal the cohort sum.
- An E01-labelled daily boundary and explicit canonical birth, death, paired
  migration, age-cohort-roll, and household-count facts are required. No rate,
  price, policy multiplier, ambient clock, or hidden macro adjustment exists.
- Per-country identity is checked as
  `previous + births - deaths + immigration - emigration = next`. Cohort deltas
  are aggregated before application so immutable fact IDs cannot choose an
  unapproved within-day timing policy.
- Migration is exactly one same-day, cross-country, equal-count departure and
  arrival under one migration identity. Its fact IDs are durable idempotency
  bindings; reuse of an already applied migration identity under fresh fact IDs
  rejects. Scheduled/approved-not-arrived notices have no population effect.
- Negative/fractional cohort outcomes, unilateral or unequal migration,
  duplicate input identity, and prior-identity payload conflict reject before a
  result is returned. Dependency ratio is a derived, reduced exact integer
  fraction rather than a rounded non-terminating decimal.
- Household updates may change only household count. A mismatched supplied
  reconciliation total emits a warning and never adjusts population.
- A migration may carry `PENDING_V11_2_CLASSIFICATION` handoff metadata only;
  no labour force, skill, vacancy, matching, wage, public-workforce, education,
  healthcare, housing, fiscal, inventory, or financial state is introduced.

`packages/core/src/index.ts` exports the module. The focused test suite is
`tests/world-core/v11-1-population-engine.test.ts`.

## Authority and boundaries preserved

- E02 alone owns population stock, age group, household-count and booked
  population-flow semantics. `packages/core` is deterministic logic only;
  `apps/world-worker` remains the future authoritative execution host and
  `apps/world-api` remains the command/query boundary.
- The candidate creates only canonical action evidence. It does not publish a
  V07 command/event/receipt type, write a posting, or implement a persistence,
  retry, lease, atomic-commit, recovery, API, worker, browser, projection,
  database, RLS, or migration path.
- V08 remains the sole inventory/financial posting owner. V09 remains the
  single-writer/lease/fencing/atomic-commit/recovery owner. V11.2 remains the
  sole owner of E03 labour/skill/jobs/wages semantics.
- ADR-04 and ADR-08 remain unapproved. This implementation accepts only
  already-explicit facts and makes no demographic formula, current/opening/
  prior-day cross-engine, price, or rounding-policy decision.

## Actual validation

All checks ran with Node `v24.20.0`, pnpm `12.3.4`, and the unchanged lockfile.
The precise commands, exit codes and observed coverage are recorded in
`TEST_EVIDENCE.json`.

- Focused E02 unit/invariant tests: PASS, 8/8.
- Core TypeScript typecheck and build: PASS.
- Targeted ESLint and Prettier checks: PASS.
- Authoritative-pattern and repository-boundary scans: PASS.
- Local safe-environment, foundation-policy and secret scans: PASS.

## Incomplete and deferred work

- Independent V11.1 review has not run; no `VERIFIED` or promotion claim is
  made.
- Full-repository test/check, persistence integration, V07 command/event/receipt
  mapping, V09 crash/atomic recovery evidence, E01 scheduler integration, and
  all database/RLS/migration checks for a population schema are not created by
  this scoped increment and remain `NOT_RUN` here.
- V11.2/V11.3 and all other engines remain outside this candidate.
- Any need for a demographic formula, cross-engine same-day consumption or a
  period-input rule stops this path for the still-pending ADR-04 decision.

## Next action

Freeze this candidate and request the required independent V11.1 review. A
reviewer must inspect `c5532ebe0c7afb54ca25f228c78a541e00714321`, the source
and test evidence, the E02 ownership boundary, and the declared V11.2/ADR-04
cut line before any status change or promotion.
