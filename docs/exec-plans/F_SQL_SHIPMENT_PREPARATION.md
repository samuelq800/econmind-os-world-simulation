# F — SQL-backed narrow Shipment preparation

PREPARATION_ONLY_NOT_V09_2_STARTED. P0 / IMPLEMENTED_UNVERIFIED pending independent Review B. Non-activated authority-chain preparation only.

## Fixed scope and ownership

Root scope: artifacts/O_AUTHORITY_CHAIN_IMPLEMENTATION_SCOPE_2026_10_07.md and its explicit F follow-up. Fixed baseline 21a6a6fa4a64f95cb9f5141bce5af43dff86d7c7, tree c6618ebe9a239521b1858e5d5b272d4c6e5e20a2. The scope's opening e3a3 reference is historical; the delegation explicitly fixes 21a6, whose tree is identical. Separate codex/f-sql-shipment-preparation branch. Others are working in parallel; their files remain untouched.

Only new Worker persistence shipment source/draft, focused test/typecheck config and this plan are owned. No Core/library/barrel/C consumer/migration/API/UI/runtime/status changes. No original-site change.

## Contract and facts

Expose createSqlNarrowTreasuryGcuShipmentCandidateFactory({database,sha256Hex,workerId}): AtomicTransitionCandidateFactory. Load only durable canonical Ship and its referenced original transfer. Lock the submission before existing lease and head, reconstruct opening/complete committed Event/Posting lineage using DurableV08LedgerLineageReader, require a committed Reserve receipt and its unique RESERVE posting, resolve the precise credited reserved account in rebuilt current inventory. Verify quantity and complete world/asset/owner/title/risk/location/recognition identity, expected version and SimTime; derive event/posting/outbox IDs from the Ship command. Reject missing/ambiguous/forged/stale evidence and absent/inactive lease. No caller balance/account/event/approval facts.

Only shipNarrowTreasuryGcuTransfer performs RESERVED to IN_TRANSIT computation. Build existing AtomicTransitionDraft with one event/posting/receipt/outbox and no financial write. Repository retains commit-time fence/version/idempotency rechecks and all-or-zero settlement. Preparation itself performs SELECT/locks only. No new obligation, Clock, allocation, inventory model or direct partial write. SQL transaction/unknown acknowledgement errors propagate without retry or semantic masking.

## Verification and hold

Pinned Node24.20.0/pnpm12.3.4/frozen lockfile. New focused mock-SQL mechanism tests and strict typecheck/lint/format/diff, source boundary/environment/secrets slice. Synthetic mock rows do not prove actual PG, golden transaction or owner-adopted opening. No native/Supabase/production/network/WorkerClock/full-suite rerun. No push/main/activation/status/gate promotion. Deliver exact commit/tree/diff, results and limitations to Root then STOP. B must review before non-activated integration.

## Actual implementation and focused evidence

The two new modules implement the named interface. The SQL source executes only SELECT/row locks inside one existing SqlDatabase transaction, shares the existing lineage reader and checks committed Reserve receipt/Event set/posting fingerprint against replay. It derives the account from that original posting (not a command-derived reservation-name guess), compares exact Quantity and asset identities, and resolves the rebuilt current position. The candidate invokes only existing Core Shipment, then produces one existing atomic Event/Posting/receipt/outbox draft, no financial batch/materialization or future obligation. Existing lifecycle/repository performs private-candidate validation and commit; no new committer is introduced.

Final focused mock-SQL file: 44 PASS / 0 FAIL / 0 SKIP, one file. It uses the real Core canonical parsers, opening/ledger replay, Shipment algorithm and private-candidate validator against synthetic SQL rows. It includes completed mock-lineage Shipment followed by rejected second Shipment, exact original quantity mismatch, legacy TEST_FIXTURE opening denial, malformed reference/authority/version/time, missing/ambiguous rows and unchanged transaction-failure objects. These are mechanism tests only, NOT real PG/golden/runtime/owner-economics evidence.

Development failures are preserved in the external handoff evidence: first run 32 PASS / 2 FAIL because test expectations incorrectly assumed posting entry insertion order and attempted to parse a command with derived fields; second run 40 PASS / 2 FAIL because zero positions are pruned by existing Core replay and the new test's opening-source constructor omitted its payload input. Tests were corrected to assert canonical Core order/exact rejection and use canonical constructor inputs; no production algorithm, existing assertion or repository guard was changed. Initial strict checks also caught an unused import and an unbranded country ID; both were corrected normally.

Source remains P0 IMPLEMENTED_UNVERIFIED. C's frozen 5cac69a46d8390212a9aa5c2cf165992027c92b9 still explicitly blocks Ship until a separately reviewed integration replaces MISSING_SQL_SHIP_PREPARATION_SOURCE. This delivery does not patch or activate that consumer, manufacture queued automatic obligations, bind a Clock or settle anything.
