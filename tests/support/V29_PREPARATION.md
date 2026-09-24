# V29.2–V29.3 test infrastructure preparation

Status: `PREPARATION_ONLY_NOT_V29_STARTED`.

Frozen baseline: `0fa8da7e74488f4554185afb68c19b4933d72586`.

`V29.1`, `V29.2`, and `V29.3` are `PLANNED` at this baseline. This slice owns
only `tests/support` and provides a local, non-production, test-only financial
action runner. It does not execute the World Worker, 70-country initialization,
NPC actions, crises, maturities, shortages, defaults, PostgreSQL persistence,
or official V29 acceptance. All those remain `NOT_RUN`.

The runner accepts canonical Commands, Events, and validated posting batches
from an injected day driver. It binds each Event to its Command, applies each
batch through Core's authoritative financial ledger writer, checks exact
country coverage and balanced numeric deltas, and hashes the resulting daily
trace. A fresh second run with the same seed must match every daily hash. Empty
days, repeated IDs, version gaps, and fake or unbalanced posting batches fail.

Affected owners: test support only. Reads: Core public command/event/ledger
contracts. Writes: no runtime state, database, migration, production data,
status, or gate. No time-dependent external service or legacy main-site impact.
This infrastructure is P2 test tooling; any later use as P0/P1 acceptance
evidence needs the normal independent review and real host integration.

## Local verification at this candidate

- Focused Vitest: 3 files, 33 tests passed, including two fresh executions of
  2-country × 600-day and 2-country × 1000-day local Core financial traces.
- Focused TypeScript typecheck, ESLint, Prettier check, repository boundary
  check, secret scan, and `git diff --check`: passed.
- Injected negative cases: idle day, unvalidated posting object, country with
  no posting, Event sequence gap, and same-seed replay drift all rejected.
- The daily ledger trajectory is exact GCU balances, not a calibrated economic
  output. The test-only transfer action is not an authorized gameplay command.
  Economic reasonableness and program integrity are deliberately separate.

`70 countries × 600/1000 days`, full World Worker cycles, NPCs, crises,
maturities, shortages, defaults, local PostgreSQL, and independent acceptance
review are `NOT_RUN`. The harness accepts a 70-country roster but requires real
daily postings for every declared country; a synthetic roster alone cannot
pass it. Its fixed-seed comparison is fresh re-execution of the local Core
financial trace, not a claim of complete authoritative World replay.

## Later mainline integration

The test-only commit was cherry-picked as `79ae441` on main base `c52ad30`.
On that exact integration candidate, the new focused test file passed 6/6,
its dedicated TypeScript project passed, and targeted ESLint, Prettier and
repository secret checks passed. The earlier 33-test result remains evidence
for F's original branch, not for this integration SHA. The classification
remains `PREPARATION_ONLY_NOT_V29_STARTED`.
