# C O native privacy joint test — 2026-10-08

Status: IMPLEMENTED_UNVERIFIED; native joint test FAIL. Independent review pending.
No merge, push, PR, deployment, production mutation, admission release, 420 or Gate B claim.

## Immutable scope

Base: bf2fa0556eec59ccc5bd566496340e966c5b5c36.
Base tree: 240d3257d58ff0c56348a9a6899eb185c64d53b0.
Branch: codex/c-o-native-privacy-joint.
Only O test, O fixture and this report changed. Core/Worker/API and database
sources, C seed, admission veto and existing TEST_ONLY privileges are unchanged.
Original 2e93 SOC candidate and historical O native 1 PASS remain frozen.
No G 415/271 candidate or fabricated current context was used.

## What changed

Replaced the old raw Trade/Finance movements and inventory disclosure assertions
with current source-derived fail-closed assertions. All three actual seats retain
positive OFFICE_PRIVATE and COUNTRY query expectations; raw financial/inventory
arrays must be empty with NOT_AUTHORIZED visibility for this actual seed.
Cross-country and revoked-seat negative controls are retained/extended.
The query expectation was NOT relaxed to accept an outer query failure.

The fixture adds COUNTRY selection through the same actual read composition
and read-only diagnostic queries through WorldOpeningSeedStore and
SqlEconomicReadVisibilitySource on one held SQL head. No authority injection.

## Actual run and first failure

Own compiled Core, Worker and API builds: exit 0.
O dedicated typecheck and scoped lint: exit 0.
Pinned Node 24.20.0, pnpm lock 12.3.4, PostgreSQL 16.15, Vitest 5.0.0.
Third-party pinned packages reused read-only; workspace links and generated
Core/Worker/API dist are from this checkout. No install or foreign workspace dist.

One credential-empty env run using root vitest.config.ts and
O_NATIVE_AUTHENTICATED_ROUNDTRIP=1, started 2026-10-08 04:57:08 UTC.
One fresh owned loopback native PostgreSQL cluster; no supplied DSN.
Result: 1 FAIL / 0 PASS; duration 2.66 seconds. Original failure is preserved in
native-o.json; no second PostgreSQL run was made.

Reached assertions before line 373 prove real JWT registration, three signatures,
one discretionary enqueue despite retry, exact immutable Command, actual fenced
Reserve/Ship/Deliver, opening-aware Worker balances buyer 2 GCU / seller 8 GCU,
buyer inventory 2 tonne, version/event sequence 3, three receipts, one financial
posting batch, and actual projection publication for 2 countries / 3 offices.
Persisted source/admission diagnostic and three-seat disclosure denial assertions
also passed before the first query.

First buyerFinance OFFICE_PRIVATE read returned outer ok=false where true was
required, at tests/integration/o-authenticated-financial-roundtrip-postgres.test.ts:373.
The test did not log the failure envelope or underlying binding/query reason.
Root cause remains UNKNOWN, not presumed to be the economic visibility denial.
Remaining wire visibility, COUNTRY reads, cross-country read negatives, original
FINAL and revoked-seat/idle checks were NOT_RUN after the assertion failure.
Their assertions remain in the test. Do not claim a complete new roundtrip.

## Independent source blocker

Actual persisted opening has one DOCUMENTED_ASSUMPTION source:
tests/support/c-isolated-financial-fixture.ts#TEST_ONLY,
status TEST_ONLY_NON_AUTHORITATIVE, productionFallback false.
The diagnostic consumed the actual matching ADMISSION_O_TEST_ONLY anchor and
checked the original publication veto restored (tgenabled O).
The existing fixture temporarily overrides the missing admission publication
veto only in its owned disposable database; this unchanged mechanism is not a
real ADMITTED-result publisher or lawful production admission.

All actual opening financial accounts returned NOT_AUTHORIZED /
ADMITTED_SOURCE_UNAVAILABLE for all three seats. Inventory returned
NOT_AUTHORIZED / OWNER_MAPPING_UNAVAILABLE. No complete admitted authoritative
decision + assembly + legal-entity role carrier exists in this O seed.
Finance lawful raw-financial positive is NOT_RUN_SOURCE_BLOCKED. The same-country
Finance query failure above is a separate unresolved failure, not a successful
withheld wire result. Never relabel owner IDs or movements as lawful balances.

Original SOCIAL source blocker / 1066 gaps remains unchanged.
Full suite, native full matrix, live read host deployment, current-context future
feature, production privileges and gates remain NOT_RUN / unadvanced.

## Handoff and stop

External raw commands and immutable manifest:
/Users/samuel/Documents/econclub/artifacts/c-o-native-privacy-joint-20261008.88r8rx.
Retain this FAIL candidate for Root/independent review. Further native execution
requires new authority; no application fix or extra cluster was attempted.
