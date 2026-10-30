# Industry and Trade source connection evidence

Status: `IMPLEMENTED_UNVERIFIED` for the new diagnostic consumer; formal
Industry/Trade connection remains `BLOCKED`. Base reviewed:
`14595f81caec2ed5ce7cec564d7db9609b693718`, plus this working tree. This report
does not approve a source, release, migration, World start or review gate.

The existing six-office catalog contains Industry (23 modules, 210 inputs) and
Trade (28 modules, 384 inputs). Resources is a domain within those offices,
including Industry geological exploration/mining and Trade resource-development
cooperation. It is not a seventh office. Catalog source anchors resolve through
`requirements/source_units.jsonl`; these specification requirements do not
constitute operating-source admission or source values.

## Implemented read-only consumer

`apps/world-worker/src/projections/office-industry-source-readiness.ts` adds
`readOfficeIndustrySourceReadinessFrom`. It consumes the existing genuine
lineage scope, existing production-prefix selector and existing governing
custody reader. It reports the exact missing production target/custody
dependency, preserves existing disclosure-denial reasons, checks current
world/country/private-Industry scope and held head, and independently checks the
result-only head and all four cause fields. It introduces no SQL, transaction,
source values, economic calculations, source admission or publisher writes.
The owning server must await it within the existing transaction and genuine
lineage callback. A borrowed, expired or other-executor view is rejected by the
existing accessor.

`checkOfficeIndustrySourceResult` is also executable independently. Its positive
output is wrapped as `CONTRACT_MATCHED_NOT_AUTHORITY`. The actual reader can
return `READ_ONLY_RESULT_AVAILABLE` only after existing source and custody
evaluation succeeds; it does not return success from a callback's presence.
Every runtime outcome states `DIAGNOSTIC_ONLY_NO_ADMISSION_OR_PUBLICATION` and
`hostInstallation: NOT_ASSESSED`. This module is not registered in the live
publisher or exported as an HTTP/browser capability.

There was no missing function call to repair in the existing publication path:
`SqlEconomicReadVisibilitySource.productionResultFrom` already invokes
`readIndustryProductionGoverningFrom`, and
`AuthoritativeActivityReadProjectionPublisher.#readIndustryDecisions` already
invokes `readIndustryOfficeDecisionResultFrom`. Adding a second publication path
would not supply the missing native source.

## Exact Industry adapter dependencies

The production adapter cannot be built honestly from the selected-source JSON,
an arbitrary SQL row, a hash, a test provider or an interface-shaped callback.
The existing `IndustryGoverningCustodyPort` in
`industry-production-governing-source.ts` explicitly supplies no production
adapter/registration. Its native implementation must independently supply and
verify the following before consuming a snapshot:

| Required existing boundary                                                  | Concrete dependency still needed                                                                                                                                                                                                                |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IndustryGoverningCustodyPort.withSnapshotFrom(executor, request, consume)` | Actual owner/custodian implementation with original provenance, explicit adoption and current admission; normative source-unit coverage; current authority/transfer rights for selected history.                                                |
| Custodied snapshot                                                          | Exact publication head, world seed/replay binding, source/adoption/admission identities and revisions, complete latest manifest, exact original record bytes and hashes. No locally invented records or permissive old revision.                |
| Account/history coverage                                                    | Governing rights for the actual production output and every historical material account, including title/risk and current authority, target command/event/posting fingerprints, effectivity and revocation at the requested head.               |
| `IndustryProductionHistoricalReadGuard`                                     | Fixed native source protection plus actual target/database/build and schema-compatibility observations. A genuine lineage token alone is data validation, not proof of native locks or admission.                                               |
| `IndustryProductionProtectedSourceAccessor`                                 | Real cooperating owner resources, aliases and parent predicates, complete protected plan, writer/revoker protocol and protection through the outer commit/rollback. `ProtectedIndustryProductionGuard` is orchestration, not that native owner. |
| Host composition                                                            | Explicit installation of the reviewed custody and protected-read dependencies in the existing publisher and lineage reader, with current seat/authorization/entitlement and ordinary isolation/concurrency evidence.                            |

Rejected substitutes are a new boolean `sourceAdmitted`, a browser-selected
role/country, inferred ownership from commodity/capability, an empty stock array
as zero inventory, or converting a proposed construction/extraction plan into
an operational asset. Existing raw inventory disclosure remains denied. The
new consumer does not weaken any of these boundaries.

## Exact Trade gaps

`apps/world-api/src/read-models/trade-contract-read-projection.ts` already
provides a pure, typed receipt/ledger result adapter. It explicitly declares
`PREPARATION_ONLY`; its query helper leaves authorization, persistence and
transport to future owners. Its useful existing inputs are
`FinalCommittedReceiptEvidence` and `TradeContractLedgerChangeFact`, with exact
money/quantity strings and receipt/event/posting/source references. It does not
accept Foundation candidates as committed ledger facts.

| Connection segment  | Existing implementation                                     | Missing concrete dependency                                                                                                                                                            |
| ------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Form to command     | Static catalog fields and local Trade rehearsal             | Reviewed command DTO/family and source-backed parser-to-command mapping for each intended action; `ManualOfficeCommandFamily` currently has no Trade family.                           |
| Actual terms/source | Pure trade/logistics and international-contract foundations | Adopted operating terms/rights/control/route sources with current custody; proposal JSON and Foundation results are insufficient.                                                      |
| Execution           | Generic atomic repository exists                            | A fixed Trade factory/sole consumer that obtains real source snapshots and produces authorized events/postings, plus idempotent queue/receipt handling and cooperating source cutoffs. |
| Read projection     | Pure `TradeContractReadProjectionInput` exists              | An authorized database reader supplying durable matching final receipt and ledger-change facts; an installed query route/DTO and scope-filtered publication contract.                  |
| Browser result      | Generic FINAL/projection clients exist                      | Exact reviewed action/final lookup identity and a matching Trade projection consumer; browser refresh and independent reload against durable database evidence.                        |

The local staged Trade workflow is narrower: host-prepared inventory
reservation with existing inspect/signature/admission checks. It does not
perform payment, shipping, delivery or the catalog's import/export/contract
actions. It cannot be relabeled as the general Trade connector. The shared
34-dataset reader remains useful public selected-source evidence and never
becomes the authoritative source of an executed order or contract.

## Verification and next implementation boundary

Focused verification under the pinned cloud toolchain:

- `pnpm exec vitest run tests/world-core/office-industry-source-readiness.test.ts`:
  exit 0, **17 tests passed**.
- `pnpm exec tsc --noEmit --strict --types node --module NodeNext --moduleResolution NodeNext --target ES2022 --skipLibCheck tests/world-core/office-industry-source-readiness.test.ts`:
  exit 0.
- Targeted ESLint and Prettier checks: exit 0.

Positive tests prove the closed result-only contract checker. Actual
genuine-view tests use the real existing reader over an empty nonproduction SQL
protocol and prove reachable denials, head/scope/lifetime checks and no additional
SQL or economic writes. They do **not** prove an admitted native production
target/custody positive, native locking, database RLS, browser readback or
reload persistence. Those remain `NOT_RUN`. No full suite, new database, World
or Clock, production action or commit was performed.

The next bounded Industry implementation is a reviewed native custodian and
protected-source accessor for an identified real source deployment, followed by
the existing publisher's native positive/rollback/revocation read tests. Until
those interfaces and sources exist, the diagnostic consumer provides executable
dependency and result checks without pretending to install the source.
For Trade, first select one existing action's authorized source and settle its
command/ledger/receipt contract before adding transport or a browser submit
port. Applicable Constitution and independent-review gates remain in force.
