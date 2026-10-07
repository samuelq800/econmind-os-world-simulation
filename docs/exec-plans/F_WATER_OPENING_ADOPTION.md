# F bounded water opening adoption

Status: water increment `IMPLEMENTED_UNVERIFIED`; `PREPARATION_ONLY_NOT_V09_2_STARTED`. Risk P0: source-only independent review and combined integration checks remain required. No self-approval, production or gate advance.

## Exact identity and ownership

Original clean base `201617bbba085dbbe4bf5dfab05eab98c9a577f3`, tree `0d0319d9d37c271e1793527c68f05085d12d1cb5`. Independent branch `codex/f-water-opening-adoption`, checkout `econmind-f-water-opening-adoption`; the original physical candidate and branch are unchanged.

Root explicitly instructed adoption of approved fuel repair `b23f3e7dd93f13a2a18369f262728f9ba4fad051` (merged source main `746846a8c6ebff4466461fa3135e0724d1d3256b`). Its normal cherry-pick is `548413b806e62a4274aee24b134448347d674b97`, tree `710e22c3a090fdce1145c5fa942a5c871da730cb`, the immediate pre-water-code base. The kernel SHA256 is exactly `1f8ecc18b6b7958ecab828e8928e6dae4e42f588fc05af4ae4084f93befe553f`, equal to the approved original. This dependency is Root-owned, not a new F kernel repair. Root relayed B approval; F does not award independent review.

F owns only new `packages/core/src/water/{calendar,exact-volume,foundation,index}.ts`, new Worker `official-water-opening-adoption.ts`, its focused test/config and this record. Root assigned F the sole one-line `packages/core/src/index.ts` public export; no other existing file is edited by the water increment. No shared OpeningSeed/WorldState, clock, schema, existing owner module, source data, website, API or ledger changes.

## Authority and actual reuse

Owner D04 §5.3 exact original SHA256 `57bfdec38a9a400991cb26362a99d33d7a81c8e6258c03460185e51501fb5ac5`; inherited portable original remains byte-identical. D05 is `OWNER_EXCLUDED / DEFERRED`. Governance: AGENTS / PLANS / FAST_MAINLINE; fixed status still does not authorize V09.2. Old C audit describes source facts and earlier gaps, not current adoption approval.

Actual Worker consumes public `@econmind/core` constructors, canonical SimTime, quantity/ratio checks, FoundationFact snapshot/provenance verification and canonical serialization. It reuses E's actual `inspectOfficialOpeningDecisionSource` and C's verified lossless `waterAllocations`, `seasonalWater`, region, social and all-dataset geography records, plus actual existing country/role entityProposals for aggregate holder IDs; no second mapper or official source. Fixed five source hashes:

| Source              | SHA256                                                             |
| ------------------- | ------------------------------------------------------------------ |
| water-allocations   | `53b4d7cd0425f6a0789cad2e1bcd0800420a5010f38307e895742df1c0567841` |
| seasonal-water      | `704f59f6204096b1f696d9d35c8727845a92f44efd8948b87eda0e740845fc66` |
| geography           | `c1a3d521ae91b37845f764be4ede73d522bc6958be90f4676ad5a19395b26a35` |
| population-services | `86e828a421346aecaa31c95a7805289a022c80df93399545aeea39f6ce361615` |
| entities            | `d53e64a28110ea3615d42be03fc740a2fe72b55e6aeb5d4a584f5d2c117a6593` |

## Implemented contracts

- `createGregorianWaterCalendarBinding` / `gregorianWaterPeriod` / `monthlyWaterVolumeForInterval`: explicit simulation/Gregorian anchor, canonical SimTime, UTC year 1–9999 and actual 28/29/30/31-day Gregorian months. Pure integer arithmetic; no ambient clocks, time API or conversion of economic values to JS number. Existing 360-day interest calendar is untouched. Cross-month intervals are rejected and must be split explicitly; a new month requires its own actual source period budget, not invented carryover.
- `createWaterRight`: country/region/basin/holder/purpose scoped exact daily quota and explicit grant validity. Missing validity remains null and cannot support consumption; transferability remains unresolved. The pure constructor is not permission to grant a real right.
- `createWaterOperation` / `createWaterAllocationState` / `allocateWaterPeriod`: actual typed constructors, ecology first, same-tier household + necessary public basic demands, then food/agriculture, then other industry. Same-tier approved-demand weighting redistributes residual after legal quota or individual network caps saturate. Actual shared abstraction, treatment and delivery capacities and explicit efficiency constrain delivery. Scope/expiry/duplicate/time/idempotency checks fail closed. Immutable cumulative flows and consumption records conserve gross = ecology + delivered + loss + unused; unused flow is not a reservoir stock. A 24-hour local sequence is tested. These pure records are not live World Command/Event/ledger postings.
- Exact reduced rational interval volumes preserve monthly division and constrained proportions, including 1/31 and 1/3. Dimensionless scalars are separate from m3 volumes. `waterVolumeAsQuantity` projects only exactly representable <=120-digit decimals; otherwise it returns null, exposed as `EXACT_DECIMAL_NOT_REPRESENTABLE`. No epsilon, clipping of source values, rounding into delivered water or changes to global Decimal policy.
- Worker `buildOfficialWaterOpeningAdoption` / `createOfficialOpeningWaterState` / `previewOfficialOpeningWater`: immutable exact-source adoption basis; real public Core consumer and typed FoundationFacts bound to actual cursor/snapshot. Conflicted rows cannot be qualified by a test/user approval flag. Demonstrated operating facts are explicitly `TEST_ONLY`, not source-ready operation or an authorization bypass. Retry requires current snapshot revalidation and returns the same stored pure receipt without extra consumption. Outputs always `runtimeEnabled=false`, `seedAdmitted=false`.

## Actual source result and gaps

Compiled Worker inspection exit 0: manifest hash `424a2411b6434958867aaa7728dfb2d51a847269d4929438e10371af0416cb68`, source fingerprint `sha256:230f8d695c25ea839fb6415de3c4c2985dd6d95e6261fa10dbec73053dedac82`.

122 allocation records produce 366 adopted quota bases, not 366 operational grants; 70 countries. The 122 unique seasonal contributions are aggregated once across 61 used basins. Full source geography has 71 basins; unused basins are not fabricated into supply. No annual basin inflow, lakeStorage or per-country basin copy is added to the same regional runoff.

1283 explicit country-associated gaps: 104 exact social/domestic alias differences, 119 exact component-vs-allocated differences, 98 exact available-minus-allocated-vs-remaining differences, 20 dry-season ceiling conflicts; 122 each missing grant validity, treatment facility, network capacity, operating permission, pumping power and raw-water quality; 70 each missing actual Gregorian simulation anchor, separate critical-public water quota and shared-basin operating coordination. 121 rows are CONFLICT; only REGION_48_E1 passes those source checks, still NOT_OPERATING. All original values and limitations are preserved. Source precision discrepancies are not proven production errors and are not silently corrected or treated with epsilon. The lack of a separate public quota does not authorize duplication/splitting of the household quota into GOV rights.

The genuine source row's quotas and shared monthly basin contribution drive the actual Worker consumer test; legal validity/operating capacity/time anchor facts are explicitly TEST_ONLY. Actual service, source grant commands, world state materialization, single-writer/atomic persistence, live authorization and real water infrastructure remain unverified/unwired, not supplied by fixtures.

## Verification and retained failures

Pinned Node 24.20.0 / pnpm 12.3.4, clean environment, offline frozen dependency install with scripts disabled (161 reused, zero downloads). Actual Core/Worker builds and focused strict types passed. Focused suite is new water tests plus existing simulation-clock and adopted fuel-cap regressions, not an unrelated full suite.

| Final bounded command / scope                                                                                                                               | Actual result                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `vitest run tests/world-core/official-water-opening-adoption.test.ts tests/world-core/simulation-clock.test.ts tests/world-core/v13-exact-fuel-cap.test.ts` | exit 0; 59 PASS = new 44 + clock 9 + approved fuel 6        |
| Actual Core / Worker builds                                                                                                                                 | each exit 0; no rootDir workaround or private-source import |
| `tsc -p tests/support/tsconfig.f-water-opening.json`                                                                                                        | exit 0                                                      |
| ESLint / Prettier on the exact water-owned files and public root export                                                                                     | each exit 0                                                 |
| Architecture boundaries                                                                                                                                     | exit 0; 259 files                                           |
| Authoritative patterns                                                                                                                                      | exit 0; 254 files / 80 Core files                           |
| Repository secrets                                                                                                                                          | exit 0; 2023 tracked/untracked files                        |
| Clean local environment check                                                                                                                               | exit 0; no configured/linked DB; mutation forbidden         |
| Actual compiled Worker source inspection                                                                                                                    | exit 0; exact manifest/counts/gaps above                    |
| Owner original byte hash                                                                                                                                    | unchanged and matches exact adopted source                  |
| Staged `git diff --check`                                                                                                                                   | exit 0 across nine water-owned files                        |

These passing water-slice receipts explicitly do not supersede the inherited physical FAIL below. No blanket whole-candidate/all-role green result is claimed.

Failures retained, not relabelled PASS:

- Initial focused types failed on two readonly fixture-helper parameters; fixed those types.
- First water suite: exit 1, 35 PASS / 1 FAIL, due to same-region different-purpose fixture demand IDs colliding. Corrected unique IDs; duplicate-consumption guard retained. Subsequent 36 + 9 + 6 focused tests passed (51).
- Initial authoritative-pattern scan rejected explicit-time `Date` APIs/Number conversion. Replaced them with integer Gregorian arithmetic; no guard exception or policy edit.
- Extended 44-case water run initially had 43 PASS / 1 FAIL (combined 58 PASS / 1 FAIL), because water successor lineage used `/`, unsupported by existing FoundationFact grammar. Aligned new water references and successor to that actual existing grammar; current-snapshot replay is tested. No existing provenance rule weakened.
- Inherited physical suite on the approved fuel fix: **exit 1, 20 PASS / 1 FAIL**, old characterization still expects rejection of mathematically exact 8 MWh although the approved repair now succeeds. Root expressly owns updating that inherited test in its source integration candidate. F does not modify/skip/delete it or claim this branch's combined physical suite is green. Merge/full integration is blocked on Root's fixed regression and independent review; passing water checks do not replace it.

No DB, SQL, migrations, credentials, production network, host purchase/deployment, ACTIVE/Clock/API activation, hosted CI or full role acceptance. No status/progress updates. Six roles Captain/Finance/Central Bank/Industry/Trade/Social must still each complete their own authorization, commands, views and consumer acceptance; Finance or this water mechanism does not close the total game.
