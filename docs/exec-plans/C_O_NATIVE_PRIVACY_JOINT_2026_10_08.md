# C O native privacy joint test — 2026-10-08

Status: IMPLEMENTED_UNVERIFIED; corrected scoped TEST_ONLY native case 1 PASS.
First and second native FAIL snapshots retained. Independent review pending.
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
positive OFFICE_PRIVATE query expectations; raw financial/inventory
arrays must be empty with NOT_AUTHORIZED visibility for this actual seed.
Single-Office seller COUNTRY remains a positive; multi-Office buyer COUNTRY
has an exact NOT_CONNECTED ambiguity negative under the base unique-facts contract.
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
native-o.json; at that point no second PostgreSQL run had been made.

Reached assertions before line 373 prove real JWT registration, three signatures,
one discretionary enqueue despite retry, exact immutable Command, actual fenced
Reserve/Ship/Deliver, opening-aware Worker balances buyer 2 GCU / seller 8 GCU,
buyer inventory 2 tonne, version/event sequence 3, three receipts, one financial
posting batch, and actual projection publication for 2 countries / 3 offices.
Persisted source/admission diagnostic and three-seat disclosure denial assertions
also passed before the first query.

The first failing loop assertion returned outer ok=false where true was
required, at tests/integration/o-authenticated-financial-roundtrip-postgres.test.ts:373.
The test did not log the failure envelope or underlying binding/query reason.
The classification was not recorded. The initial OFFICE_PRIVATE attribution
was incorrect; it was not established by that log. See the second run below.
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
Finance lawful raw-financial positive is NOT_RUN_SOURCE_BLOCKED. The COUNTRY
binding failure diagnosed below is separate from financial detail withholding.
Never relabel owner IDs or movements as lawful balances.

Original SOCIAL source blocker / 1066 gaps remains unchanged.
Full suite, native full matrix, live read host deployment, current-context future
feature, production privileges and gates remain NOT_RUN / unadvanced.

## First failure handoff

External raw commands and immutable manifest:
/Users/samuel/Documents/econclub/artifacts/c-o-native-privacy-joint-20261008.88r8rx.
The first FAIL candidate was retained for Root/independent review. Subsequent
execution required and received new, precisely scoped Root authority.

## Diagnostic-only follow-up

First FAIL snapshot: 08ed440eb2dd856fe1dd04fcabf0e1784875803f,
tree 5ba0d27aca81336f1bf8bca149775a78299574a6. Its native output is unchanged.
Root requested safe diagnostics after that snapshot. A subsequent test-only
change logs only seat/classification, a finite allowlist of outer error codes
and retryability before the existing strict query assertion. It also moves
the source-blocker log before that assertion and removes account-row details
from the log. No authority, SQL, fixture grants, economic assertion or query
expectation changes. At creation, the diagnostic version had NOT_RUN native status.
Original false-only output cannot distinguish the internal cause. Static
inspection confirms the composition returns fail-closed errors for several
different binding/authentication/database failures; none has been established
as this run's cause. Source denial is not an outer query success or failure code.
Root subsequently authorized precisely one second singleton diagnostic run.

## Authorized second native run and scope correction

Actual tested diagnostic commit e909a17531ae9901e73ffcd247f8a751b0ae43bf,
tree 11733b7574b57de77f3aec9c782b0dfb0e5d1cb6.
Started 2026-10-08 05:02:58 UTC; duration 2.99 seconds; exit 1; 1 FAIL / 0 PASS.
Original second output: native-o-diagnostic.json in the external evidence folder.
The same pinned toolchain, credential-empty environment, application base and
unchanged TEST_ONLY fixture/privileges/veto were used. Owned cluster was cleaned
by finally. At that point no third native run, application fix or grant expansion.

Safe log: seat buyerFinance, classification COUNTRY, code NOT_CONNECTED,
retryable false. The preceding buyerFinance OFFICE_PRIVATE query fully passed:
outer binding, nested query, exact head, country/office identity, empty financial
and inventory arrays and NOT_AUTHORIZED visibility. Earlier economic assertions
and source-denial assertions again passed. Subsequent Trade/Country/FINAL/tail
checks remain NOT_RUN after this failure. This is not a new joint-chain PASS.

Static source diagnosis (not a captured SQL row-count trace):
postgres-server-read-binding.ts lines 17-40 selects authz.office_id as part of
DISTINCT and maps COUNTRY entitlement to country scope. This fixture's same
buyer subject has FINANCE and TRADE with the same country/revision. Therefore
two distinct Office rows match the same COUNTRY request. Lines 354-366 require
exactly one scoped row before mapFacts; ambiguity yields null. The HTTPS
composition lines 395-402 maps missing before-binding to NOT_CONNECTED.
This explains the actual diagnostic and is consistent with the declared
fail-closed ambiguous-binding policy, not financial SOURCE_UNAVAILABLE or an
established grant failure/API regression. No underlying database error was logged.

The test introduced an unjustified positive COUNTRY expectation for this
multi-Office buyer. Proposed minimal test correction, subsequently authorized by Root:
retain all three OFFICE_PRIVATE positives, use the single-seat seller COUNTRY
positive for real withheld COUNTRY wire evidence, explicitly assert ambiguous
multi-Office buyer COUNTRY denial. No silent assertion relaxation was made.
If product requirements demand successful multi-Office COUNTRY access, Root
must own an explicit selector/binding identity contract decision and any API
change; C must not arbitrarily select an Office or fabricate current context.
Original 08ed FAIL and second e909 FAIL are both preserved separately.

## Authorized correction and third-run preparation

Root explicitly authorized the minimal test correction and one final third
exclusive native singleton. Only the test changes: all three OFFICE_PRIVATE
positives retain strict true/watermark/identity/withheld wire checks; the seller
single-Office COUNTRY positive remains strict true; both buyer seats' COUNTRY
queries must return precisely NOT_CONNECTED / retryable false for ambiguity.
The original 2/8 GCU, 2 tonne, three signatures/once-enqueue, FINAL, cross-scope,
revocation and idempotency assertions remain unchanged. No API, fixture, grants,
source carrier, admission veto or current context changes.
This corrected commit must be fixed before the authorized third run. At this
record stage its native status is NOT_RUN, not PASS. Both earlier FAIL outputs
and the first classification UNKNOWN correction are immutable evidence.

## Actual third native result

Tested corrected commit: 33f60a595b4d9e43fb1a8c874cfb40fe21937ab8.
Tested tree: cb37700e263fde94785f99e4238672e4242b2467.
Test SHA256: 112d562057afe1ac96b72e46eb3244656afdc49c78d32e772a43bb5cc63543f0.
Fixture SHA256: 5c443b18ba4c554d307c278a0d3511f89307873618b22f67008cca27b7b1a047.
Started 2026-10-08 05:08:39 UTC (13:08:39 Asia/Shanghai).
Actual root-config Vitest run: exit 0; 1 PASS / 0 FAIL; duration 3.41 seconds.
Raw output and exact credential-empty command: native-o-final-third.json.
No fourth native run was authorized or performed.

This run completed the whole retained TEST_ONLY case: genuine JWT and persisted
binding, three signatures, once discretionary enqueue, exact Command and fenced
Reserve/Ship/Deliver, actual opening-aware 2/8 GCU and 2 tonne, real version/event
3 projection, all three OFFICE_PRIVATE positive reads, seller single-Office
COUNTRY positive, exact buyer multi-Office COUNTRY ambiguity rejection, empty raw
financial/inventory arrays with actual NOT_AUTHORIZED visibility, cross-country
scope negatives, original fingerprint-bound FINAL receipt (COMMITTED, version1),
staged READ/REGISTER FINAL retries, idle/idempotent stable economic footprint,
revoked seller FINAL/intake/Office/Country denial, and nonactivated flags.
The existing finally stopped and removed only the owned disposable cluster.

Dedicated O typecheck, scoped lint, format and diff checks passed before the
fixed third-run commit. Core/Worker/API own builds from the same bf2 source had
already passed and application source/dist were unchanged. No full suite, CI,
production test, deployment, independent approval or acceptance gate is claimed.
Three total authorized singletons: first FAIL, diagnostic FAIL, corrected PASS;
all original output remains immutable and independently attributable.

Finance lawful raw-detail positive remains NOT_RUN_SOURCE_BLOCKED. The PASS
does not supply a real admitted role carrier or admission publication. The
unchanged fixture's explicit TEST_ONLY admission-veto override remains a limitation.
Multi-Office COUNTRY product-selector compatibility is a separate actual
requirement/contract decision, not an API change within this slice.
Final report-only commit may follow the tested commit without changing test or
fixture bytes. Hand off fixed SHA/tree/hashes/raw run to Root for narrow B review
then STOP. Original historical O 1 PASS, SOC2e93 and SOCIAL1066 remain unchanged.
