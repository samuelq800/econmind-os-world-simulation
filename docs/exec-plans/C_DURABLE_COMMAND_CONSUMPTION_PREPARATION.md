# C durable command consumption preparation

## Authority and scope

- Scope: `/Users/samuel/Documents/econclub/artifacts/O_AUTHORITY_CHAIN_IMPLEMENTATION_SCOPE_2026_10_07.md`; fixed base `e3a3b98527090203b5f9241a4d652aa024b394b3`.
- Historical branch: `codex/c-durable-command-runtime-preparation` at `5cac69a46d8390212a9aa5c2cf165992027c92b9`, kept unchanged. Integration branch: `codex/c-durable-command-ship-integration` from that fixed C head. C owns only consumer, focused test/config and this plan. Other producers are not reverted.
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
- At historical 5cac, no SQL Ship preparation source existed and Ship returned `MISSING_SQL_SHIP_PREPARATION_SOURCE`. The old 25-case evidence/absence assertion remains immutable. This revision imports F's real fixed SQL factory, not a copied source or injectable substitute. Unsupported types still return `UNSUPPORTED_COMMAND`; source/Reserve/Opening/account failure stays a blocker, not success. Do not claim a complete Reserve→Ship→Deliver runtime.
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

## Fixed C → F source-only integration revision

- Root authorized this exact increment after B's `B_SOURCE_COMPATIBILITY_REVIEW.md` source-only approvals of C 5cac and F `f01731ec0c8af0d38f6f98deb06fd42370c162f4`. Those approvals do not approve this new integration or any runtime/World/hosting activation.
- F was cherry-picked unchanged as `6c74c85bf98bc2ee5f9771341af8eb40dde74f8b`; dependency-only tree `debdadbc3e25eb5d7ff5193449978d1978b0717c`. All five F paths must byte-match F's frozen blobs. C neither edits nor duplicates F's source/draft/test/plan/config.
- Direct Worker-internal import of `createSqlNarrowTreasuryGcuShipmentCandidateFactory({database,sha256Hex,workerId})` binds a fixed Shipment authoritative executor. No shared export, factory registry, arbitrary callback or HTTP mutation path.
- Only `CORE_GOODS_SHIPMENT_V1` joins existing Delivery as versioned automatic work. It requires office null, explicit version, fixed World/command identity and server due time. Reserve's existing execution stays unchanged.
- Reuse the former Delivery claim as closed `claimAutomatic`: submission → active lease → replay/head/version → queue, canonical reread/equality, one exact PENDING update or own holder/fence resume. Shipment/Delivery labels are diagnostic only; original Delivery errors/guard assertions stay intact. No lease acquire/takeover/reclaim, new SQL economic source, obligation creation or default Clock/startup.
- All existing applicable lifecycle, unsupported-head, missing Clock/opening, lease/version/fence, row-count and FAULT/no-replay tests remain. Original missing-Ship-module assertion is explicitly superseded only because immutable F is now installed; actual fixed-source missing-transfer/Reserve/RESERVED rejection assertions replace that absence expectation, rather than skipping it.
- New positive dispatch assertions are mocked mechanism evidence with a REJECTED receipt. New negative regressions invoke the actual fixed F factory/source and authoritative executor against scripted SQL and mocked lineage, never a real database or economic approval. Distinguish these from F's independently reviewed source suite, which is not rerun here.
- Checks: pinned offline Core/Worker build, consumer focused types/tests/lint/format, ordinary scanners and exact protected/F blob checks. No native/PGlite/full suite/campaign or prior native acceptance rerun. Runtime/session/readback/golden/Clock/official opening remain NOT_RUN.
- Observed increment checks: final focused consumer suite 36/36 PASS (intermediate 31/31 before automatic guard parity expansion), focused TypeScript/lint/format and Core/Worker build PASS. Delivery and Shipment both retain explicit lease/version/identity/row-count, own-fence resume and unknown-acknowledgement/no-retry regressions. Final immutable evidence is recorded outside this checkout.
- Highest boundary remains P0; new integration stays IMPLEMENTED_UNVERIFIED for Root/B incremental acceptance. No autonomous push/merge/production/status promotion.
