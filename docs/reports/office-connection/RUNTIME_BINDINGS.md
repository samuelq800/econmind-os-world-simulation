# Runtime binding checkpoint

Status: **P0 IMPLEMENTED_UNVERIFIED**; production execution remains closed. Baseline `3979b5146788d59b834f5cf009f54604b551c415` passed the complete check with 6,761 main-suite tests passed and 299 skipped. Its exact-head Trade native test passed separately. This successor adds Social source readback, ordinary-housing title correction and a controlled admission candidate. It passed 117 focused cases before the final cleanup fix, then its 12-case targeted regression passed. Actual signed 70-country Service acceptance and deployment remain NOT_RUN. See [RELEASE.md](RELEASE.md) for evidence scope and [README.md](README.md) for the full catalog denominator.

## Actual shared connections

- `production-world-command-host.ts` now registers explicit server-owned dependencies under an opaque identity. Its request registry binds host, World, pools, clock and cancellation lifetime. Conditional preflight checks actual persisted admission/seat/head, current authorization, actor and source. The API composition can call this read-only preflight; execution is disconnected and no command is queued by preflight.
- `office-operating-source-commit-protection.ts` supplies a separate Captain/Finance currentness guard: actual head/current authorization checks, command-bound proof and before/after source-binding equality through a required custodian. Its four-field source binding is comparison data, not source admission. The existing Social-specific guard is unchanged. Installing this module alone does not make the atomic repository invoke it.
- Read-only Trade evidence now has a real SQL reader and authenticated service. JWT, current persisted Trade seat/team/revision, admitted read binding and owner scope precede the durable receipt/event/posting query. No browser-supplied World/role/team or SQL is accepted. This is committed evidence readback, not a new trade execution engine.

## Six-Office matrix

| Office               | Implemented connection now                                                                                                                                                                                                                                                                               | Remaining source/custodian                                                                                                                                                                                                                                                                                                    | Remaining consumer/runtime acceptance                                                                                                                                                                                                                                                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Captain              | `captain-operating-source-custody.ts` and `captain-runtime-snapshot-reader.ts`: canonical command/head/complete canonical prefix, separate genesis/reason originals, existing Core replay, opaque preparation and same-head source/admission/fence rechecks. Shared currentness-scope DTO is composable. | Actual genesis/reason issuer, accepted original records/admission and a native cooperating custodian; TEST_ONLY positives do not provide them. Unknown and mixed-World history effects still fail closed; this is not a general mixed-prefix taxonomy.                                                                        | First-submission/preflight circularity is fixed with a server-only canonical read; the legacy wrapper preserves its stable-head guard. The actual atomic path still does not invoke the new Captain guard. Install that guard/sole consumer and prove durable FINAL/result readback.                                                             |
| Finance              | `finance-budget-runtime-source.ts` + `finance-budget-command-composition.ts` consume source-owned conditional facts and existing Budget replay. `finance-budget-event-wire.ts` constructs canonical Budget events, transition and receipt candidate, with Budget/Captain prefix replay validation.       | Actual envelope/line/revision/approval/history publisher and native protected source. Existing conditional kernel/source acceptance remains TEST_ONLY; no fabricated zero history or cash availability.                                                                                                                       | Native durable event/reducer/atomic guard and sole budget consumer, exact FINAL recovery and browser family. `wireOnly=true`, `productionAuthority=false`, `runtimeConnected=false`. Existing Finance trade signing remains a separate narrower path.                                                                                            |
| Central Bank         | Existing authenticated manual OMO parser/source/candidate and result path can be supplied as an explicit host reader. This batch adds shared host preflight; it does not add a new CB economic family.                                                                                                   | Admitted bank/CB accounts, security holdings, quote/batch/currency and complete ledger lineage with lawful current custody.                                                                                                                                                                                                   | Formal OMO host/consumer and durable action-to-result acceptance. Policy-rate, collateral-loan and FX families are not established by OMO.                                                                                                                                                                                                       |
| Industry / Resources | `industry-governing-custody-adapter.ts` composes the existing governing reader and historical guard through one required protected owner; checks the same backend/transaction and canonical source/history bindings.                                                                                     | Actual governing-original catalog, adoption/current admission, rights/transfer/unit history and native complete protection plan. Shared executor, DTO or lexical lineage identity is not admission/lock proof.                                                                                                                | Install the real owner in existing result publication/host; supply reviewed action/factory/consumer coverage. Resources stays within Industry/Trade, not a seventh Office.                                                                                                                                                                       |
| Trade                | `trade-contract-runtime-reader.ts` + `trade-contract-runtime-read-service.ts` query scoped durable committed evidence and apply signature/current-seat/team/revision/admission checks. Embedded-SQL and service fixtures are in the initial focused evidence.                                            | Actual operating terms, rights, inventory/logistics and current source custody; a committed-read DTO cannot admit a proposed contract.                                                                                                                                                                                        | An explicit opt-in Fetch route/mux now exposes committed references; install the real hosting/browser binding and complete intended execution families/automatic scheduling. Added TEST_ONLY real-PostgreSQL query/role/pagination/restart verification passed 1 test with 11 check categories; formal admitted-service success remains NOT_RUN. |
| Social               | Existing isolated employment/college/clinic scenario, atomic persistence and private HTTP workflow remain reusable. Source DTO/reader/manual PLAN wiring and formal missing-state denials remain present.                                                                                                | Selected 70-country original sources and the existing owner-adoption/OpeningSeed chain are present; complete the admitted Social operating genesis/current facts/physical envelope and native custodian binding. `SIMULATED_OPENING` stays `sourceAdmitted=false`; the simulated publisher is not formal automatic authority. | Formal automatic MATCH producer/grant/scheduling, college/clinic consumer wiring and intended host acceptance. Existing native/browser evidence retains its own candidate and TEST_ONLY/SIMULATED scope.                                                                                                                                         |

No row represents complete catalog acceptance, all 70 countries or all 420 country/Office pairs. Public selected-source displays, authorized readback, admitted originals, economic settlement and hosting are separate evidence categories.

## Read-only existing-source diagnostic

The already-executed `collectWorldSeedPreflight()` result is preserved at `/workspace/.cloud-setup/evidence/phase2-authoritative-source-inventory.json`. It read the existing selected-source/adoption chain and performed no database access, seed publication or Clock startup. It reports 70 countries, 350 entities, 840 stock cells (619 positive source cells), zero produced positive inventory entries and 1,470 CB category rows.

| Existing validator group | Gap rows and actual classifications                                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Financial source         | 1,051: holding-register completeness 70; FX source mapping 490; LC-code source mapping 490; unverified World/seed binding 1. |
| Canonical Seed bridge    | 2,450: unfilled CB categories 1,330; holding-register completeness 70; FX 490; LC-code 490; unverified World binding 70.     |
| Physical                 | 12,113: source conflicts 49; missing inputs in the inspected source mapping 12,064.                                          |
| Water                    | 1,283: source conflicts 341; missing mapped inputs 942.                                                                      |
| Labour/Social            | **1,066: incompatible skill semantics 122; missing operating inputs 822; unresolved housing title 122.**                     |

Groups overlap and must not be summed as unique missing facts or owner decisions. Social operating gaps include region/skill employment, versioned wages, funded payroll mapping, education queue/programme/staff/budget, care demand/backlog/staff/supplies/funding, occupancy/rent, welfare eligibility/payment and safety staffing/queues. The selected capacities/targets and existing adoption receipts remain usable inputs. These counts describe the current mapped package; they do not prove that further original records are absent outside it. Agents can reuse the existing constructors and implement missing mapping/publisher/custodian/consumer code; owner input is limited to the specific unresolved records/policies identified in RELEASE.md.

## Focused reproduction

From the pinned successor shell in [RELEASE.md](RELEASE.md), the recorded initial group consists of:

```bash
pnpm exec vitest run \
  tests/world-core/office-runtime-host-binding.test.ts \
  tests/world-api/source-owned-preflight-composition.test.ts \
  tests/world-core/captain-operating-custody.test.ts \
  tests/world-core/office-operating-source-commit-protection.test.ts \
  tests/world-core/finance-budget-runtime-composition.test.ts \
  tests/world-core/finance-budget-event-wire.test.ts \
  tests/world-core/industry-governing-custody-adapter.test.ts \
  tests/world-api/trade-contract-runtime-reader.test.ts \
  tests/world-api/trade-contract-runtime-read-service.test.ts
pnpm --filter @econmind/core build
pnpm --filter @econmind/world-worker build
pnpm --filter @econmind/world-api build
```

Run serially. The expected counts may change with QA additions; preserve actual output and failures rather than forcing 141. These commands do not deploy or start World/Clock. Embedded SQL/protocol positives, wire candidates and read-only preflight are mechanism evidence; native locks/recovery, real source admission, installed consumers, final browser flows and target deployment need their respective actual checks. Final readiness must attach to the completed immutable candidate.

## Current source and publication entry points

`createOfficialSocialStaffingTargets` supplies source-bound teacher demand;
`createOfficialSocialOperatingSourceBindings` and
`requireOfficialSocialOperatingSourceValue` expose exact known/derived values
and reject missing/conflicting inputs. These are selected-source bindings, not
actual employment, service delivery or an admitted World.

```bash
node tools/office-connection/social-source-bindings.mjs --summary
node tools/office-connection/social-source-bindings.mjs --check
```

The first command generates the current summary. The second intentionally exits2
while whole source groups remain unresolved. Build Worker first; stale compiled
source is rejected. The fixed public derived read path is
`GET /v1/world-data/social-source-bindings`, with an independent artifact
fingerprint, explicit source/Core IDs and bounded version-pinned pagination.
The Edge host must receive the validated publication snapshot explicitly;
missing installation returns503. No production factory or provider was changed.

`createOfficialOpeningServerPublicationComposition` now binds the existing
pinned V2 loader, trusted Owner keys, SQL registry and separate publisher/source
databases. The publisher retains the exact-permit/head lock while the source
uses a same-primary READ ONLY REPEATABLE READ snapshot and existing complete
Core replay. Unknown commit/rollback outcomes stop with
`OPENING_PUBLICATION_COMMIT_UNCONFIRMED`. The SQL proposal is outside the
migration manifest and grants no external runtime memberships. Actual source
connections, accepted genesis material, signed authorization and the controlled
release remain required. Neither this entry nor its tests start World/Clock.
