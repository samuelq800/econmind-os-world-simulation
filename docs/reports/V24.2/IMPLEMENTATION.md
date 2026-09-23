# V24.2 — Crisis/Admin Cause-Layer Composer pure Core preparation

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
