# C durable command consumption preparation

## Authority and scope

- Scope: `/Users/samuel/Documents/econclub/artifacts/O_AUTHORITY_CHAIN_IMPLEMENTATION_SCOPE_2026_10_07.md`; fixed base `e3a3b98527090203b5f9241a4d652aa024b394b3`.
- Branch: `codex/c-durable-command-runtime-preparation`. C owns only the new Worker preparation module, focused test/config and this plan. Other producers are not reverted.
- Constitution U0060–U0069, `AGENTS.md`, `PLANS.md`, ADR-17/18/20 and centralized FAST_MAINLINE policy govern this candidate.
- Risk: P0 (Command authority, current authorization, writer fence, atomic settlement). Independent integrated review is blocking; implementation cannot self-approve.
- Formal V09.1 remains PLANNED; `next_step_ready=false`. V02.3/V07.3/V08.3 verified records are historical dependencies, not new runtime acceptance. This scope permits isolated parallel preparation only.

## Existing interfaces and missing primitives

- `PostgresNarrowTransferIntake` persists submission and approved queue membership; this Worker does not call submit/enqueue or accept an HTTP command/receipt callback.
- `DurableV08LedgerLineageReader.readCommandFrom` restores and validates durable canonical command identity; `rebuildFrom` uses the existing OpeningSeed store and Posting lineage, never caller balances.
- `createLocalNarrowReservationWorker.execute({worldId, commandId})` owns the existing Reserve claim/current SQL authorization/approval/candidate/executor path. Reuse unchanged.
- `createAuthoritativeWorkerExecution` fixes the transaction-cutoff authorization guard and AtomicTransitionRepository. Delivery is bound to `createSqlNarrowTreasuryGcuDeliveryCandidateFactory`, never an injected economic source or execute callback.
- There is no generic production dequeue primitive. Add only a single due-row selector and the necessary automatic Delivery claim adapter on the existing queue/lease schema. No SKIP LOCKED, competing dequeue loop or unsupported-command filtering.
- No SQL-backed authoritative SimTime reader currently exists. Reuse the existing Worker server-clock port; `null` means `SERVER_CLOCK_NOT_BOUND`. Do not derive SimTime from command fields, Date.now, HTTP time or queue availability. Binding an admitted clock and approved opening/source is an integration/activation prerequisite, not established by this module.
- No SQL Ship preparation source exists. Ship returns `MISSING_SQL_SHIP_PREPARATION_SOURCE`; other commands return `UNSUPPORTED_COMMAND`. Do not invent shipping economics or claim a complete Reserve→Ship→Deliver runtime.
- Existing server-owned producers must already have created any versioned automatic Delivery obligation/queue row. This consumer does not create an automatic obligation from user input or schedule missing Ship/Delivery work.
- Environment checks are source guards, not proof of a supplied SqlDatabase's physical target. Exact non-production target identity, official source/owner decision admission and hosting approval remain separate mandatory integration prerequisites; no boolean owner-approval bypass is added.

## Change plan

- New `apps/world-worker/src/preparation/durable-command-consumption.ts` exposes PREPARED → explicit READY → one bounded step → STOPPING/STOPPED. No timer, process, listener, default runtime or barrel wiring.
- Factory is local/CI only; reject production connection configuration. It neither creates nor closes the host's database/clock/lease resources.
- Select the first due unfinished queue row for one fixed World in existing `(available_at_sim_time, priority_rank, command_id)` order, including claims held by others so they block rather than silently skip.
- Rehydrate canonical command; validate supported type/authority, due time, current lineage/version and active server-held lease. Missing/invalid opening/source remains the exact existing DomainError; no seed regeneration/fallback.
- Delivery minimal adapter locks submission → lease → head/lineage → queue, compares canonical identity again, and either claims PENDING once with exact fence or resumes only that holder/fence. Existing SQL candidate preparation and atomic commit revalidate authority/fence/head.
- Do not acquire, renew, take over or reclaim leases in the new adapter. A failed/unknown step never retries invisibly or releases a possibly committed claim; operational failure faults the instance and requires reviewed recovery.
- Existing Reserve implementation retains its reviewed claim/lease behavior; this composition first requires an active lease. Its independent later checks remain authoritative.
- Return receipts only from existing executors; `PROCESSED` is not necessarily `COMMITTED`. Domain blockers contain no fabricated final receipt.
- Stop drains an already-running bounded step, rejects new steps and never attempts cancellation inside a commit.

## Validation plan

- Focused mechanism tests: disabled lifecycle, explicit start, one step, concurrent-call rejection, stop drain, clock absence, fixed World, supported routing, no unsupported bypass, mismatched authority, absent opening/source, stale version/fence, claim row-count failure, unknown acknowledgement fault/no retry.
- Mocks validate wiring and mechanism only. Native PostgreSQL, real admitted clock, official 70-country opening, session/intake/Worker/readback golden transaction and crash recovery: NOT_RUN.
- Pinned Node 24.20.0 / pnpm 12.3.4; frozen offline dependencies. Focused lint/format/typecheck/build; ordinary architecture/authority/environment/secret scanners. No previous native three-case rerun, no broad suite/campaign.
- Owned paths: module above; `tests/world-core/durable-command-consumption.test.ts`; `tests/support/tsconfig.c-durable-consumption.json`; this plan.
- Core, API, UI, shared exports, migrations/RLS/grants, runtime/main, status/gates and original official source bytes unchanged. No ports, database, HTTP, Supabase or production resources used.

## Exit condition

Deliver immutable commit/tree/base/diff and actual check evidence to Root as IMPLEMENTED_UNVERIFIED, distinguish mechanism mocks from native runtime evidence, disclose unresolved clock/Ship/admission/hosting, then STOP. No push, merge, activation, WorldClock/Worker launch or Gate B promotion.
