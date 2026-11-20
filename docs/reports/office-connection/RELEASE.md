# Office connection release status

Status: **IMPLEMENTED_UNVERIFIED / production execution CLOSED**. The user has authorized continued all-office connection and release engineering. Missing implementation, authoritative bindings and release evidence remain concrete work; old HOLD/V09.1 records are context, not a request for the user to repeat that authorization. This document grants no independent P0 approval.

## Current immutable baseline and successor

Baseline branch `codex/office-runtime-bindings-20261028` at
`3979b5146788d59b834f5cf009f54604b551c415` passed the complete `pnpm check`
(exit0): main suite 6,761 passed, zero failed, 299 skipped; all later release
checks and builds passed. The skipped cases remain skipped. The additional
exact-head Trade native test passed separately with 11 check categories.
Neither result admits source data or proves production connection.

This successor branch `codex/office-selected-source-bindings-20261028` adds:

- executable Social source bindings and derived public readback; 2,844 known
  or derived references, including 488 newly wired references; original 1,066
  composite source groups remain unresolved, with zero new raw source facts;
- corrected ordinary-housing title handling, preserving 122 unknown titles
  rather than assigning GOV from a generic project catalog;
- a proposed controlled admission SQL entry, pinned V2 server composition and
  separate source read transaction; no production installation or grants;
- explicit new-world initialization choices in
  [GENESIS_INITIALIZATION_CHOICES.md](GENESIS_INITIALIZATION_CHOICES.md).

The source/publication group passed 117 focused tests before the final cleanup
fix; its 12-case targeted regression then passed, including five new cases.
Real PG16.15 controlled-publication SQL passed one TEST_ONLY test with 13
check categories; the generated artifact was read through actual Edge Fetch
and loopback HTTP. The actual signed 70-country Service positive remains
NOT_RUN. Final checks must bind the completed immutable successor.

Current implementation and the six-Office matrix are in
[RUNTIME_BINDINGS.md](RUNTIME_BINDINGS.md).

## Host and Finance corrections

The earlier statement `ServerCommandHostBinding=never` is obsolete. `production-world-command-host.ts` now has an opaque server dependency registration, private short-lived request identities and conditional **read-only preflight**. A registered composition re-reads persisted admission/current seat/head, current authorization, actor mapping, explicit clock values and domain source before and after the source check. Missing/copied bindings remain HOLD. `openIntakeRequest()` can issue a genuine request identity for an installed binding; that identity grants neither source admission nor command execution.

`createSourceOwnedExecutorComposition` exposes `preflightOnly`; the internal execution handler remains disconnected, `commandExecutionEnabled=false`, and preflight returns `commandQueued=false`. No sole consumer or World/Clock loop is started. Providing a clock dependency is not starting a clock.

Finance now has a conditional server source/composition and actual canonical event-wire implementation. The wire creates validated events, a transition, a **receipt candidate** and replay evidence from the existing Budget semantics. Its flags remain `wireOnly=true`, `sourceAdmitted=false`, `productionAuthority=false`. The source/composition path remains explicitly TEST_ONLY; no durable budget COMMIT, formal source admission, installed sole budget consumer or browser budget family is established. The old “no event wire exists” description must not be reused; a prepared receipt is still not a persisted FINAL.

## Existing opening admission is reusable, not yet a released runtime grant

`OfficialOpeningAdmissionPublicationService` already exists in `apps/world-worker/src/admission/official-opening-admission-publication.ts`. It validates the pinned original bundle, signed private publication record, exact `world_v2.opening_seed` / `world_v2.world_head` and replay, then attempts an atomic `world_v2.runtime_opening_admission` insert/readback. Its source is not installed in startup/HTTP/Clock and deliberately leaves SQL veto/RLS/grants unchanged.

The proposal `database/proposals/runtime-read-binding-storage.sql` still defines `guard_runtime_opening_admission_publication()` to raise `ADMISSION_PUBLICATION_ENTRYPOINT_MISSING` unconditionally and supplies no admission INSERT policy. The missing work is the reviewed publisher/role/SQL-veto replacement through the sole release chain and actual target readback; it is incorrect to say no publication service exists, or that calling its constructor bypasses the proposal's veto. Existing `RuntimeReadBindingStore.readCurrentSeatFrom` / `readImmutableAdmissionFrom`, API `postgres-server-read-binding.ts` and the new host preflight already consume persisted records. Reuse those readers.

Selected 70-country source records and their owner-adoption chain also exist: `status/world-data-selection.json`, the balanced package's employment/population-services/regions/facilities files, `C_OFFICIAL_WORLD_OPENING_MAPPING.json`, and `OWNER_NON_HOST_DECISIONS.original.md` plus its receipt. Official source selection is already recorded; its interpretation still requires audited Core OpeningSeed mapping, and proposal fields remain proposals. A read-only call to the existing seed diagnostic returned 70 countries and 1,066 Labour/Social gaps (122 skill semantics, 822 operating inputs, 122 housing title), with no seed/admission/database/Clock action. These are current validator outputs for that source package, not proof that additional external originals do not exist. Action-specific Social operating custody/publisher and an ADMITTED World/seed binding remain separate connections to implement.

## Reproduce on the successor tree

Use the pinned tools without the original wrapper, which changes directory back to `/workspace`:

```bash
cd /tmp/econmind-office-runtime-next
export PATH="/workspace/.cloud-setup/tools/node-v24.20.0-linux-x64/bin:/workspace/.cloud-setup/tools/pnpm-12.3.4/node_modules/.bin:$PATH"
node tools/office-connection/run.mjs --plan
node tools/office-connection/release-preflight.mjs --plan
pnpm exec vitest run tests/world-core/office-runtime-host-binding.test.ts tests/world-api/source-owned-preflight-composition.test.ts tests/world-core/captain-operating-custody.test.ts tests/world-core/office-operating-source-commit-protection.test.ts tests/world-core/finance-budget-runtime-composition.test.ts tests/world-core/finance-budget-event-wire.test.ts tests/world-core/industry-governing-custody-adapter.test.ts tests/world-api/trade-contract-runtime-reader.test.ts tests/world-api/trade-contract-runtime-read-service.test.ts
```

These are explicit focused commands, not a claim they were rerun by this document. Run compiler and embedded-database jobs serially on the four-CPU cloud allocation. The aggregate/release plans remain offline inventories: exit0 means a report was generated, while readiness checks intentionally exit2 until their dependencies are established. Older source-pattern observations in the release inventory are not current runtime proof; this checkpoint records the actual opaque host and new adapters.

## Minimum unresolved owner inputs

Engineering should first resolve existing repository/source records. If they remain unknown, ask only for: (1) the actual source publisher/custodian location and current original/admission/lock-plan revision for the intended action, and (2) the target host's existing least-privilege DB role and connection-reference names, without credential values. A missing repository adapter does not establish that the source or an adopted record does not exist.

For Finance, the minimal handoff is **one existing effective Budget approval-policy record or pointer**, not four approval requests. Only absent policy values require an owner choice. Its policy reference/revision, effective interval and owner/source reference are binding metadata, not additional economic choices. The four specification anchors identify these fields and their applicable actions:

| Source unit and extracted line                     | Narrow unresolved policy input                                                                                                                                                                                                                                                      |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FINANCE-U0817`, `specs/extracted/FINANCE.md:2455` | Resolve source classification (`DEPARTMENTAL` versus `NATIONAL`) and the national/strategic escalation rule. Ordinary departmental `SET_ENVELOPE` is Finance-only; its ownership is settled. Do not ask again whether Finance has budget authority.                                 |
| `FINANCE-U0789`, `specs/extracted/FINANCE.md:2371` | Resolve `strategicBudgetTrigger`, its comparison basis (envelope cap, single appropriation or period aggregate), currency and period. Apply to `SET_ENVELOPE` and strategically classified `APPROVE_NEW_LINE`; never substitute zero or infinity.                                   |
| `FINANCE-U0499`, `specs/extracted/FINANCE.md:1501` | Resolve `majorProjectTrigger` and actual `crossOfficeDependencies` for project-linked `APPROVE_NEW_LINE` / later funding actions. Required Offices follows project attributes, not an automatic six-Office signature list. This does not block the ordinary-only serializer subset. |
| `FINANCE-U0507`, `specs/extracted/FINANCE.md:1525` | Resolve `projectCaptainTrigger` for national-strategy, major-fiscal-scale, security/sovereignty and national multi-Office projects. Apply to project funding; do not add these triggers to every ordinary budget line.                                                              |

`FINANCE-U0711` (`specs/extracted/FINANCE.md:2137`) expressly defines fiscal rules as policy commitments with a Fiscal Exception process, not physical constraints. Do not convert a policy cap into a hard physical capacity ceiling or ask the owner to reconsider that settled distinction. If a capacity policy is enabled, bind its actual comparison/exception reference; do not invent a numeric default. These unresolved policies do not justify stopping independent source, host, transport or test engineering.

## Remaining release work

| Layer                       | Remaining concrete work                                                                                                                                                                                                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sources and custody         | Reuse the existing opening source/publication chain; complete and bind the missing action-specific operating originals/publishers and native custodians, including current revisions, issuer/admission, revocation, complete history and cooperating guards. An existing source file, DTO, test callback or hash is not that binding. |
| Execution wiring            | Make the sole consumer enforce the reviewed source/currentness and authorization checks in the actual atomic path; install supported command/reducer/result/browser families. Preflight, wire candidates and read-only projections do not settle commands.                                                                            |
| Clock and actor binding     | Supply actual durable actor/seat and clock dependencies, verify lawful scheduling boundaries, then separately accept any consumer/Clock startup. No new loop has started in this batch.                                                                                                                                               |
| Infrastructure              | Read back the selected least-privilege role/schema/connection configuration, current seat and admitted World in the target environment. Provider configuration is not freshly verified.                                                                                                                                               |
| Final candidate and release | Finish QA, rerun affected and required checks, obtain independent P0 review of immutable bytes, then use the applicable controlled publication chain and record target readback/recovery evidence.                                                                                                                                    |

The existing Pages workflow publishes the non-authoritative frontend. The fixed Cloudflare HOLD publisher is not a generic active-world release path. Shared production Supabase schema/roles/admission remain on the companion repository's sole controlled chain; no development SQL, fallback service role or proposed migration becomes a release by appearing in this tree. Missing runtime wiring is engineering work, not an invented approval request.

No push, merge, deployment, production SQL, credential provisioning, formal source admission or World/Clock startup is claimed by this checkpoint. Historical GitHub REST CONNECT denial and configuration-name observations in the first batch are not fresh provider checks; never infer a token-scope problem from the proxy failure or print credential values.
