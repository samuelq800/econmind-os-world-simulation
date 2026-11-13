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

## Trade: narrow Treasury GCU path and remaining catalog scope

Updated against `ae7c37fca1a76b979192ab356eb257aeb1b3e622` plus the isolated
2026-11-01 follow-up. This is not adoption or deployment approval.

`ManualOfficeCommandFamily` now includes `CORE_GOODS_TRANSFER_V1` for
`TRADE_CONTRACTS`. The fixed source reads admitted originals and the complete
mixed prefix; genuine paired opening inventory/financial data supports actual
Reserve → automatic Ship → Delivery replay and the existing two-leg GCU
settlement. The automatic source verifies due/claim/lease/head and the committed
obligation, without requiring the original user to remain in office. Treasury
payment requires the actual unique GOV cash account; another domestic owner's
cash is not government authority. Owner mandate, route, three signatures,
source custody and Atomic cutoff remain necessary.

The follow-up adds a fixed internal Trade source/factory container to the sole
shared consumer, authenticated standard submit/recovery wiring, and the shipped
browser's manual Reserve transport. Browser UNKNOWN recovery sends the exact
original request without requiring a fingerprint or resubmitting. It uses the
actual bounded page client and keeps current authorized head, source origin,
queue acknowledgement and durable FINAL separate. An unavailable current
publication cannot become an action-completion claim. Automatic Ship/Delivery
are not browser command families.

Evidence is limited: Core and isolated embedded-PostgreSQL tests exercise the
narrow economic/Atomic path; client tests and real Chromium use explicitly
synthetic protocol responses, with an actual unconfigured API rejection case.
Those are not formal Trade source admission, an actual backend browser sale,
or coverage of the 28-module Trade catalog. The reusable browser probe can read
an independently running isolated backend without stubbing its responses.

Remaining concrete boundaries include adopted OP mandate/route/cash facts,
actual shared-consumer authenticated HTTP/browser acceptance, and publication
of current inventory/settlement and catalog-specific contract results. The
older staged inspect/sign/bind workflow remains distinct from general import,
export and international-contract operations. `trade-contract-read-projection`
preparation results and selected-source datasets are not committed contracts.

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
Trade already has a fixed Reserve HTTP/Recovery transport and sole-consumer
Reserve/Ship/Delivery factories with the narrow Treasury GCU contract. The
current follow-up connects genuine Captain/OMO/Rent historical originals to
complete Trade replay; its targeted evidence does not establish an admitted OP
mandate, route, production deployment or a real backend browser sale. Applicable
Constitution and independent-review gates remain in force.
