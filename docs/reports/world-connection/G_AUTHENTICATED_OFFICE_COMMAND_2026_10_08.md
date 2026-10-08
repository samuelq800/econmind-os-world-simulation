# G manual Office command boundary — source-blocked candidate

Code status: `IMPLEMENTED_UNVERIFIED` (P0; independent B review pending).
Executable SHARED-1 / canonical enqueue: `BLOCKED`, not implemented or enabled.

Base: `bf2fa0556eec59ccc5bd566496340e966c5b5c36`, tree
`240d3257d58ff0c56348a9a6899eb185c64d53b0`. Independent branch
`codex/g-authenticated-office-command`; original G415/G2711 candidates remain frozen.
Scope follows E backlog SHARED-1 at lines 327–329 and Root's explicit instruction:
missing actual source/dispatcher must produce zero submission/queue effects, never
a new persistent `PENDING_RUNTIME` workflow or caller-configured readiness.

## Implemented behavior

The new formal API service verifies an actual JWT with the existing JWKS verifier,
resolves the existing persisted seat/admission consumer, checks exact pinned seed,
uses the trusted server actor and clock, and calls the new server-only Worker.
The Worker uses a real subject-bound, repeatable-read **read-only** SQL transaction
to verify the configured non-superuser/non-bypass/non-economic-writer role, actual
current membership/revision/capability, seat, admission, immutable seed/model/replay
tuple, live private entitlement and exact WorldVersion/EventSequence.

It obtains actual membership from SQL and issues the existing Core Office context;
it constructs a true CanonicalCommand and delegates economics exclusively to:

| Manual family                            | Office / current capability                 | Existing strict parser                         |
| ---------------------------------------- | ------------------------------------------- | ---------------------------------------------- |
| `CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1`  | CAPTAIN / CAPTAIN_CABINET                   | parseCaptainPoliticalCapitalAllocation         |
| `CORE_CENTRAL_BANK_OMO_V1`               | CENTRAL_BANK / CENTRAL_BANK_MONETARY_POLICY | parseCentralBankOmoIntent                      |
| `CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1` | SOCIAL / SOCIAL_LABOUR                      | parseSocialEmploymentServiceCommand, PLAN only |

The existing generic command_submission is read for identity conflicts and real
CanonicalCommand rehydration, retaining the stored server SimTime/timestamp on an
exact historical retry. No command is accepted here. All valid currently wired
requests return `ok:false`, `SOURCE_RUNTIME_UNAVAILABLE`, `REJECTED`,
`submitted:false`, `queued:false`, with missing `ADMITTED_DOMAIN_SOURCE` and
`SOLE_DURABLE_CONSUMER`. These flags describe this call's effects, not a claim
about unrelated historical rows. A second real binding read must match the first
including the actual head before even that rejection is returned.

Industry, other Office/family pairings, SystemDue, browser actor/auth/time/binding/
approved/runtimeReady fields and unknown payload fields are rejected. No injectable
economic snapshot, bool, runtime-readiness callback, registry success fact, parked
intent, INSERT or queue statement exists in this version. Core's deterministic
kernel, sole dispatcher, domain source files, reducers and UI are unchanged.

This is the authorized **precise-source-blocker branch**, not the positive sink
branch of SHARED-1. A complete same-head once-enqueue/cutoff implementation still
requires the real Root-owned source/consumer wiring. No positive persistence or
candidate-kernel execution is claimed. Existing financial intake/database/narrow
transfer code is untouched, so its write-after-uncertainty `UNKNOWN` behavior is
not replaced. The new read-only path reports failed commit/rollback acknowledgement
as `UPSTREAM_UNAVAILABLE`; it cannot report acceptance or a write outcome and never
blindly reruns the callback.

## Actual blockers and SQL dependency

1. Base `preparation/durable-command-consumption.ts:323–327` accepts only existing
   Transfer/Shipment/Delivery. None of these three manual families has a registered
   sole durable consumer in this base. The new intake has no readiness switch that
   can bypass that fact. Root owns SHARED-3 and must integrate the actual factories.
2. No adopted domain-opening plus event-lineage reader is wired into this intake.
   Root owns SHARED-2; valid intent alone cannot establish political capital,
   security inventory or Social operating state. This report does not infer zero,
   adopt a source, or substitute a cache/fixture for that reader.
3. Formal `OFFICE_COMMAND_WRITER_PROVISIONING_MISSING`: the generic tables already
   support these command types, so no second table/queue or family schema is needed.
   The inspected release/proposal SQL provides no reviewed API Office-command
   writer role/grant. The read-binding proposal explicitly grants no privileges,
   and official-country reader roles are read-only source roles, not intake writers.
   Existing G native fixture grants are TEST_ONLY and not production authority.

   Required separate reviewed provisioning dependency: a dedicated server role
   with scoped SELECT on current_commit_authorization, runtime_read_seat,
   runtime_opening_admission, opening_seed, world_head, projection_entitlement and
   command_submission; the eventual sink also needs SELECT/INSERT on the existing
   command_submission/command_queue only, a subject/current-authority write policy
   or equivalent reviewed restricted transaction boundary, and a reviewed locking
   strategy for submission → head → authorization cutoff. PostgreSQL row locks
   require UPDATE privilege: blindly copying the native fixture's UPDATE(active)
   and UPDATE(world_version) grants would confer mutation authority and is not an
   approved least-privilege solution. No grants/functions/SQL migration are added
   or executed here. Actual current_user INSERT observations are not a write grant
   or proof of row policy/dispatcher availability.

4. Actual immutable admission publication remains blocked by
   `ADMISSION_PUBLICATION_ENTRYPOINT_MISSING` in the original proposal. No code,
   role, source selection or green test here closes that gate.

Pinned source hashes (SHA-256):

| Source                                    | Hash                                                             |
| ----------------------------------------- | ---------------------------------------------------------------- |
| E_FOUR_OFFICE_RUNTIME_GAPS_2026_10_07.md  | 4bf40b91896ac368919f536975aa440c836b3bedfa72b8b347a2f3caf99fae19 |
| 0002_world_v2_command_event_ledger.sql    | 92915905a159961ac0f8eb70f509501cf7697519471c1b84f832ef224cf87695 |
| 0003_world_v2_command_receipts_outbox.sql | fe8d6b6849b4ceb5a85789fff34bd2ed47cf7d07d662883dd0c345e88ad9255e |
| runtime-read-binding-storage.sql          | 8bb715881ebbe78336d11460306421b136f215f451c0253817b14d3916e7c0fe |

## Actual validation and preserved failures

Toolchain: Node `24.20.0`, native pnpm `12.3.4`, frozen offline install exit 0.
Initial old PATH install refused engines (Node24.19.0/pnpm11.19.0), without bypass.
Official Node24.20.0 tar download was SHA256 checked against its official manifest;
final checks used Root's independently version-checked cache wrapper.

- Core, Worker, API builds: exit 0 after correcting one Worker branded OfficeId
  type error in the first build (exit 2). The original error is preserved below.
- Direct test tsc: exit 0. Affected ESLint and Prettier: exit 0.
- Boundary and authoritative-pattern scans: PASS; environment PASS, local,
  no configured database, NOT_LINKED, databaseMutationAllowed=false.
- Repository secret scan: PASS (2150 scanned files).
- Final bounded matrix at 13:15:44, duration 71.00s: **115 passed, 8 skipped**,
  **5 passed files, 1 skipped file**, exit 0. Includes all 30 new direct tests,
  existing Captain/CB/Social Core suites and browser-safe export regression.
  Eight original financial rollback uncertainty native cases were explicitly
  NOT_RUN, controlled by existing G_NATIVE_FINANCIAL_INTAKE; no skip was added.

The new direct tests run actual PGlite SQL and restricted roles plus real signed
ES256 JWT/JWKS verification and the actual persisted consumer. They verify three
strict-family source rejections, zero command/queue/event/posting/receipt effects,
no runtime enabling even with TEST_ONLY INSERT privileges, current manual capability
independent of READ, pins/subject/actor/admission, head changes before/after snapshot,
unknown fields/SystemDue, actual privilege refusal, missing SELECT, read-only
acknowledgement uncertainty, server-clock history rehydration/conflicts and abort.

TEST_ONLY fixture: the disposable admission insertion veto alone is disabled and
re-enabled for a persisted binding mechanism case, as in the existing native
fixture. It is no official admission or adopted domain source and never supports
a positive command acceptance/transition. The original veto remains unchanged.

Preserved runs, not rewritten as PASS:

- Initial direct run 13:11:24 / 47.52s: 5 PASS, 24 FAIL; zero-effect assertion
  referenced inventory/financial posting tables omitted from the isolated fixture.
  Added unchanged original 0007 posting migration to the disposable fixture.
- Repair run 13:12:55 / 57.10s: 28 PASS, 1 FAIL; fixture attempted two REVOKEs in
  one prepared query. Split those two actual fixture queries; no guard was relaxed.
- First Worker build: TS2322, plain requestedOfficeId lacked the Core brand.
  Replaced with existing officeId parser; no Core or authorization rule change.

Native PostgreSQL role/RLS/concurrency: `NOT_RUN`. Positive canonical submission/
once-queue, actual domain source/dispatcher, commit-cutoff execution, official
admission, hosted HTTP route, browser, production, CI, merge, six-Office playability
and Gate B: `NOT_RUN` / `BLOCKED`, never PASS. No preview/demo service was created,
started, restored or modified. Only formal API/Worker/Core release source and
direct isolated verification are in this candidate. No status/progress edits.

Freeze the exact commit/tree and raw run logs in the external handoff packet;
send Root/B for independent narrow review, then STOP. This report self-awards no
review approval, merge authorization, runtime activation or source adoption.
