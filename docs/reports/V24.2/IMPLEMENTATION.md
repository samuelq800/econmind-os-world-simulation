# V24.2 — Crisis/Admin Cause-Layer Composer pure Core preparation

## Review B locale-determinism blocker forward fix

- Forward-fix code/test commit: `e55ad9f4ca47fd22c595ae678405f7390b760201`.
- Same-target cause order now uses an explicit locale-independent codepoint
  comparison of stable fact references, not `localeCompare`. The exact
  before-to-after chain therefore has the same ordering across hosts.
- Mixed-case `FACT.I` / `FACT.i` chain and replay passed with both
  `LC_ALL=en_US.UTF-8` and `LC_ALL=tr_TR.UTF-8`: **10/10 tests each**.
  Reversed input order produces the same result. Core typecheck/build,
  targeted ESLint and diff check: **PASS**. Independent closure re-review
  remains **NOT_RUN** here; this supersedes tip `8dfc204` for review.

## Review B same-target blocker forward fix

- Forward-fix code/test commit: `fbfe6ec24cb1e73ba2b8706ffc558a75b2f73ccf`.
- The original candidate `0aa4b290afd36c0095c8a782b20b0b282e707e79`
  remains superseded for package review; this does not merge or approve V24.2.
- Causes for the same `(targetOwnerRef, targetObjectRef, targetField)` now
  execute in stable source fact-reference order. Every later cause must declare
  a `before` exactly equal to that target's preceding `after`; each individual
  transition still rejects a negative result. Conflicting independent
  starting balances are rejected rather than silently coalesced.
- Regression: two separate resource causes both claiming `10 - 7` for
  `DEPOSIT.1` are rejected. A valid `10 - 7 = 3; 3 - 2 = 1` chain and replay
  pass; a claimed `3 - 7` overdraft and a tampered replay fail.
- Forward-fix focused Vitest: **PASS**, one file / nine tests. Core typecheck,
  Core build, targeted ESLint/Prettier, authoritative-pattern scan,
  repository-boundary scan, and diff check: **PASS**. Independent closure
  review: **NOT_RUN** here; B must re-review the new immutable tip.

## Candidate identity and gate

- Code/plan/test commit: `21536380aa9df376ce6a7abb0767d21e515e95fe`.
- Base: `origin/main` `fa281e2bdb7a6b2a1628f015aa721e859438fbb8`.
- Branch: `codex/v24-2-crisis-cause-core`.
- Result: `PREPARATION_ONLY`. `status/progress.json` still lists V24.1 and
  V24.2 as `PLANNED`; this branch does not close the formal dependency or
  approve any ADR. ADR-03's integer SimTime/pause rule is respected.

## Implemented pure candidate

The new Core module accepts caller-supplied same-snapshot crisis-state,
action, authorization and shock-cause facts. It validates world/season/crisis
identity, exact state and action versions, integer simulation-millisecond
tick, action uniqueness witness and explicit server-authorization
attestation. Every caller-declared approval requirement must have exactly
one current-version approved decision. The module cannot authenticate the
server decision or determine the future required-approvals resolver; those
remain authoritative integration obligations.

`START_CRISIS` requires an inactive crisis, RUNNING clock and at least one
cause. `END_CRISIS` requires an active crisis and creates no restoration of
damaged engine-owned capacity. `PAUSE_WORLD`/`RESUME_WORLD` require the
corresponding clock mode and propose the same frozen SimTime, with no paused
wall-time catch-up. All actions require an active season and emit only
candidate lifecycle/clock events.

The cause layer permits a fixed set of physical, demand and financial
bottom-layer fields. Each proposed transition records target owner/object,
before/delta/after, exact currency or physical unit, source fact/receipt and
causal predecessors. Losses must reduce but not overdraw stock/capacity;
demand surges must increase it. Population displacement additionally needs
an explicit scenario-evidence reference. Direct GDP, inflation, stability
or score fields are not accepted. No candidate event is persisted or
executed, and no inventory, bank, population, clock or macro field is
written by this module. Full replay recalculates all candidate transitions
and events from the bound facts.

## Verification

- Focused Vitest: **PASS**, one file / eight tests.
- Core typecheck/build and targeted ESLint/Prettier: **PASS**.
- Authoritative-pattern and repository-boundary scans: **PASS**.
- Local environment, repository secret and foundation-policy checks:
  **PASS**; Supabase is not linked and database mutation is disallowed.
- Staged diff check: **PASS**.

## NOT_RUN and limitations

V24.1 Captain governance closure, server-side permission verification,
versioned approval resolver, target-owner validation, Event Kernel dispatch,
atomic writer, actual pause/resume, durable idempotency, integration with
the eleven affected engine domains, independent review, migrations,
production access and Gate approval are **NOT_RUN**. ADR-12's Admin read
classification remains pending and is not decided here. This branch changes
no V24.1, main-site, API/UI, DB, status/Gate or production file.
