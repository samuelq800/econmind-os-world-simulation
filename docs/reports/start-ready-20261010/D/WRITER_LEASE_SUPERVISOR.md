# D — SQL writer lease supervisor candidate

Date: 2026-10-10, Asia/Shanghai. Status: **IMPLEMENTED_UNVERIFIED**.
Risk: **P0**, single-writer/fencing/runtime integration. Independent review:
**PENDING**. This candidate does not enable a formal step, host or economy.

## Immutable scope

Base: `42991acfee9d0eacc702ba47a380c938a4516f03`; base tree:
`1254c4144279717c9075e9bbf07b4b2ac4710558`.
Branch: `codex/d-writer-lease-supervisor-20261010` in the existing independent
`.econmind-worktrees/d-office-decision-result-consumer` checkout.
Final commit/tree and this report's hash are recorded in the external
`handoff-receipt.json`, avoiding a self-referential report commit pin.

Five new files, no edits to existing product code:

1. `apps/world-worker/src/runtime-preparation/writer-lease-supervisor.ts`
2. `tests/world-core/writer-lease-supervisor.test.ts`
3. `tests/world-core/writer-lease-supervisor-postgres.test.ts`
4. `tests/world-core/writer-lease-supervisor.tsconfig.json`
5. This report.

The prior uncommitted assessment `README.md` is preserved, not silently included
in this implementation commit. The Clock rules below supersede its incorrect
suggestion that paused/downtime elapsed-time policy needs a new economic decision:
**ADR-03 is already APPROVED**.

## Implemented behavior

`createWriterLeaseSupervisor` accepts an explicit server-owned `SqlDatabase`,
scoped role, World, unique live-instance Worker ID and positive operational
duration (1..2147483647 milliseconds). Construction has no SQL effects. It
captures immutable scalar bindings and the transaction method without freezing
borrowed database objects. No discovery of env credentials or default duration.

Every operation checks actual `current_user` and `session_user`, ordinary role
flags, non-creator schema access, required individual lease/head privileges,
existing function execution privileges, and an actual bound World head.
Privileged/shared roles, missing rights/World, wrong configured role and
millisecond-lossy lease rows fail closed. This is an operational binding, **not
an opening admission or a new grant mechanism**. No role is created by product
code; the native fixture creates only its scoped disposable test role.

- `acquire(at)` calls the existing `world_v2.acquire_world_writer_lease` within
  a real transaction. It accepts only validated ACQUIRED/TAKEN_OVER rows;
  initial RENEWED is rejected/rolled back, preventing a second live instance
  with the same holder from treating renewal as a fresh startup.
- `renew(at)` first locks/compares the actual prior lease generation, then calls
  the same existing function and validates RENEWED, unchanged holder/fence/
  acquisition, and strictly extended expiry. It never silently reacquires an
  expired/replaced lease. No new SQL function or migration.
- `assertCanCommit({at, expectedWorldVersion})` (actual parameter name:
  `observedAtReal`) invokes the existing SQL commit guard and returns the Core
  canonical assertion only after confirmed COMMIT. **This is preflight, not an
  economic commit reservation**: `AtomicTransitionRepository` must still call
  its guard inside the real economic transaction. No economic callback is added.
- Only one supervisor operation can be in flight. Overlap is rejected, not
  queued or retried. Busy, expired, lost, draining, stopped or uncertain states
  are non-ready. A confirmed rolled-back database rejection closes the instance;
  unconfirmed/unknown transaction outcomes close it as UNKNOWN. Causes are
  retained, not relabeled as confirmed rollback or success.
- `drain()` immediately rejects new operations, awaits the one active SQL
  operation, and retains any failure. `stop()` is idempotent, then marks STOPPED.
  No DELETE, TRUNCATE, explicit release, fence reset or hidden retry: stop renewals
  and let the existing row expire naturally.

`status(at).ready` is **advisory local liveness at an explicit observation**, not
formal host readiness or authority. Remote takeover requires a new SQL operation
to observe; an old local snapshot never overrides the database fencing guard.
Each live host must use a distinct Worker ID. No wall clock, timer, cron, host
entry, consumer extraction, opening import, projection producer or deployment is
installed. Drain covers supervisor SQL only, not a consumer it does not own.

## Actual bounded verification

Pinned Node24.20.0 / pnpm12.3.4, frozen existing dependencies; no installation,
lockfile change or ambient production DB config. Commands ran in the independent
checkout; the native command used a cleared `env -i` with only pinned PATH,
locale, `ECONMIND_ENV=local`, explicit loopback V09 test URL and fingerprint.

| Command / evidence                                                                                                                                                                         | Actual result                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @econmind/core build`                                                                                                                                                       | exit0                                                                                                       |
| `pnpm --filter @econmind/world-worker build` on final source                                                                                                                               | exit0                                                                                                       |
| `pnpm exec tsc -p tests/world-core/writer-lease-supervisor.tsconfig.json`                                                                                                                  | exit0, strict source/test typing                                                                            |
| `pnpm exec vitest run tests/world-core/writer-lease-supervisor.test.ts tests/world-core/world-writer-lease.test.ts --reporter=json --outputFile=…/final-unit.json`                         | exit0; **25 PASS / 0 FAIL / 0 SKIP**, 20 new negatives/boundaries + 5 unchanged Core lease cases, two files |
| `node node_modules/vitest/vitest.mjs run tests/world-core/writer-lease-supervisor-postgres.test.ts --reporter=json --outputFile=…/native-final.json` under explicit disposable environment | exit0; **7 PASS / 0 FAIL / 0 SKIP**, one file, actual native PG                                             |
| Scoped ESLint on the three new TS source/test files                                                                                                                                        | exit0                                                                                                       |
| Scoped Prettier check on all five owned files                                                                                                                                              | final recorded exit0                                                                                        |
| `node scripts/check-boundaries.mjs`                                                                                                                                                        | exit0, 314 files                                                                                            |
| `node scripts/check-authoritative-patterns.mjs`                                                                                                                                            | exit0, 309 files / 89 Core files                                                                            |
| `ECONMIND_ENV=local node scripts/assert-safe-environment.mjs` under cleared env                                                                                                            | exit0; no database configured, no linked Supabase, mutations disabled                                       |
| `node scripts/check-repository-secrets.mjs`                                                                                                                                                | exit0, 2357 files before report addition; final post-report rescan recorded separately                      |
| Staged diff check / exact ownership / unchanged existing paths                                                                                                                             | final recorded exit0                                                                                        |

Native execution reuses `assertV09PostgresTestEnvironment` and
`loadFrozenRenewalMigrationFixture`: complete current/frozen provenance is
validated before connection, then only existing exact 0001..0006 artifacts are
installed in the fresh owned database, with their original hashes/source commits
read back. No old test cluster/schema is reused/reset and no migration artifact
is changed. Local trust authentication does not prove production authentication.

Final generation: PostgreSQL **16.15**, `127.0.0.1:62673`, database
`econmind_v09_d_supervisor_final_20261010`, system identifier
`7694990577777620313`. Pre-read-only evidence shows no world_v2 schema and the
sole observer; post-read-only evidence pins the same generation, six lease rows,
seven synthetic version-0 heads, and zero submissions, queue commands, events,
receipts and outbox messages. These empty facts are not populated financial/
inventory conservation evidence. No production permissions or real opening used.

Seven native cases cover real same-World dual-instance contention, same-instance
overlap rejection, unchanged-fence renewal, expired takeover, SQL stale-writer
guard rejection, refusing silent reacquisition, actual role/superuser/World
denials, unknown COMMIT acknowledgement after a **real committed acquisition**,
and stop while a **real SQL renewal transaction** is in flight. The lost-ack
transport wrapper and deterministic in-flight barrier are explicitly TEST_ONLY;
they do not substitute fabricated positive lease/settlement results. No worker
process kill or production network outage is claimed.

Preserved history: initial strict compilation failed on TS never/narrowing and
missing test-only DOM timing types; the fix uses a declared never-returning
function and test-only lib declaration, without weakening strictness. An
apply_patch context mismatch made no changes. Initial unit19/native7 cases passed;
subsequent source self-check moved expiry-overflow validation before SQL and
added the twentieth boundary case. Final native7 was rerun on a **new owned
generation**, not overwritten onto the initial successful generation. Both PG
generations were fast-stopped; `pg_ctl status` reports no server and port62673
has no listener. Evidence/data directories are retained, not dropped/deleted.

Evidence root:
`/Users/samuel/Documents/econclub/.econmind-artifacts/d-lease-supervisor-20261010.7CGpyX/`.

| Final artifact               | SHA-256                                                            |
| ---------------------------- | ------------------------------------------------------------------ |
| `native-final.json`          | `68c06d9159e24089ba304c5a0cfb4b2654d8bff3948f798a6a9ca3e3fdab204e` |
| `final-unit.json`            | `a892208bac999ab18e7fbb7ae7f903fb4d2ba726953992c00df31173c4316d02` |
| `final-pre-readonly.txt`     | `6c412085d1f823abeb8a3b2fb777359674bcd48e5e2b160444d62fdf27028176` |
| `final-post-readonly.txt`    | `3167dc051b51a6769632a9f0b3513b99e911a2595c97368cdbbbbf2a7f091226` |
| `writer-lease-supervisor.ts` | `8f5a8f4565e8cf977506ce8aba06ce7296228c3e5653e4d94064d6254f64ff80` |

## Formal Clock / recovery design — no implementation in this patch

Authority: `docs/architecture/decisions/ADR-03.md`, Decision APPROVED by
RESPONSIBLE_HUMAN_OWNER. Core APIs already implement these rules. They are **not
pending economic decisions**, and the user need not choose a timer algorithm.

| Approved rule                                                                                         | Minimum Worker/E/G adapter contract                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PAUSED elapsed time adds zero SimTime; resume uses frozen time                                        | Persist/replay pause/resume and the active advancement cursor; never convert paused wall duration into catch-up.                                                                                                                                                                                                                  |
| RUNNING downtime catches up deterministically from recorded advancement inputs and intended due times | Reconstruct the last durable RUNNING cursor and intended due work; append/deduplicate explicit advancement input through the approved durable boundary before using it. A host wake-up is not itself an authoritative input. The input/cursor persistence schema and admission are an E/G/D contract for the next reviewed patch. |
| Exactly 10,000 simulation ticks per real second, multiplier applied once                              | Adapter records active real milliseconds; Core `advanceClockInput` / `advanceRunningSimulationScheduler` applies 10× once. Never pre-multiply or use UI/timer cadence as SimTime.                                                                                                                                                 |
| Same-time `(dueSimTime, priorityRank, scheduledEventId)` total order                                  | Rehydrate versioned scheduler state with `restoreSimulationSchedulerState`; retain the completed-prefix invariant. Consume `pendingDueSimulationEventsInOrder`; callbacks cannot reorder or duplicate obligations.                                                                                                                |
| Transaction cutoff is World SimTime at authoritative transaction start                                | Existing transaction/commit authority obtains its current durable cutoff. This lease supervisor's operational timestamps cannot authorize/advance economic time or replace that cutoff.                                                                                                                                           |
| One authoritative World, replaceable projections                                                      | Validate admitted opening/head/event/posting/FINAL lineage; reclaim only eligible abandoned claims under a later fence; rebuild replaceable materializations from facts. Then hydrate the versioned Clock/scheduler and expose readiness. UNKNOWN or mismatch remains blocked; never hydrate from browser/cache snapshots.        |

Engineering proposal for B review: with the existing Workers topology, evaluate
one **private per-World alarm/coordinator wake-up** invoking the eventual bounded
host step. Wake-ups only request work; SQL lease/fence, admitted durable input
and due-order remain authoritative. Delayed/duplicate delivery is idempotent;
there is no public tick/lease/dispatch endpoint. Provider availability, resource
cost and private lifecycle suitability must be checked before approving that
hosting integration, not assumed or provisioned here. Alternative: a supervised
Node host with the same explicit step contract. Neither option changes ADR-03;
B/engineering can select topology after evaluating the existing deployment
constraints without asking the user to design timer mechanics.

Next implementation must be separately authorized after B reviews G/E/D
contracts: formal consumer boundary (retain original local guards), durable
Clock/input schema/publication, actual admission/role/ports, recovery startup
ordering, trigger adapter and narrowly scoped composed restart/unknown tests.
Lease supervision alone cannot unlock any of them or make HOLD ready.

## Stop / uncovered

No CI/provider run, full suite, 420 traversal, formal host mount, real-user
session, populated economic settlement, scheduler/Clock activation, production
TLS/permissions, opening import, release, push, merge or deployment is claimed.
No status/gate, old site, map/CSS, consumer, Core rule or existing test is edited.
The independent P0 reviewer must approve this exact immutable candidate before
merge or dependent integration. D stops at this handoff.
