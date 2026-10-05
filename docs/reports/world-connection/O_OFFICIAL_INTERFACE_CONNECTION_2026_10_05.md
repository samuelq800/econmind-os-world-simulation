# Official-source interface connection — 2026-10-05

Date: 2026-10-05 (Asia/Shanghai). This is an incremental connection record,
not a Gate B approval or a production economic activation record.

## Current binding

- Selected source: `BALANCED_2026_09_28_V1`, 70 countries,
  population `14712146434`.
- Selection checksum:
  `88dd44478f97d2e8893a4f11b3aaf96e256bdb13248aca0d08f097fabe10d315`.
- API root:
  `https://vimksjrhaxdpnkvgsavz.supabase.co/functions/v1/world-v2-official-read/`.
- Website: `https://world.econmind.group/`.
- Reader-v2 update: main-site run `37136193366`, source World
  `0ec30a28d19f4ae51d81edad42d0598c356dc127`, function subtree
  `28d7ba3e102a7b4efb5cbb74088ed2a0f85f5d5b`.
- Actual reader receipt:
  `artifacts/e-reader-update-once.Wwh7SG/receipt/evidence.json`, SHA-256
  `8ee2b96bed1281b762b6758ced4ad3cdb721e7971f8e43b223b74dd0e770303d`.
  One deployment; same reader ID, version 2 ACTIVE; old seven function
  identities unchanged; both approved HTTPS origins GET/OPTIONS verified.
  This update made zero Storage writes and zero database calls.
- Pages run `37188781902` SUCCESS, source `0ec30a28...`, completed
  2026-10-04 16:25:32 Shanghai. Actual build log contains the exact API root,
  `CONFIGURED_READ_ONLY`, `liveWorldState=false` and public base `/`.
  This publication was discovered during current verification, not dispatched
  by Root during this round. Web/config paths are identical between that
  published SHA and current integration main `475f9476c21b7730a142e5d7f647f96774ac9694`.
  No redundant Pages dispatch or repository-variable update was performed.

## Public interface wiring

All routes below are relative to the API root, **not** a root already ending
in `/v1/world-data`. Browser reads omit credentials and never include a secret.

| Consumer             | Relative route                                                                | Identity and precision                                                       |
| -------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Country list         | `v1/world-data/countries`                                                     | Selected package and exact country coverage                                  |
| Country context      | `v1/world-data/countries/visual-territory-NN`                                 | Exact `NN=01..70`; native country DTO matches bundled opening reference      |
| All-source directory | `v1/world-data/datasets`                                                      | Exactly 34 unique frozen source identities                                   |
| Array-source page    | `v1/world-data/datasets/SLUG?countryId=visual-territory-NN&offset=0&limit=20` | Only datasets with an approved country association; lossless decimal strings |
| Global object source | `v1/world-data/datasets/SLUG`                                                 | Complete object; original field nature and units retained                    |
| Geography            | `v1/world-data/datasets/geography?section=SECTION`                            | Native array paging or hashed string fragments; not a flattened substitute   |

Filtering, permitted sections, paging and response validation remain owned by
`country-context.js`. A global dataset does not acquire an invented country
binding. Root atlas country files remain pinned local opening references;
that display path is distinct from remote source matching.

Six-role HUD/preview field provenance is owned by `country-game.js` and each
`countries/data/NN.json`. The same source session and source directory serve
all offices. The source categories prioritized per office are:

| Office          | Prioritized datasets                                                                                       |
| --------------- | ---------------------------------------------------------------------------------------------------------- |
| Captain         | countries, regions, facilities, population-services, hazard-proposals, land-program                        |
| Finance         | finance, stocks, trade-plans, facilities, countries                                                        |
| Central Bank    | finance, countries, entities                                                                               |
| Industry        | facilities, deposits, production-plans, recipes, power, water-allocations, employment                      |
| Trade           | stocks, trade-plans, transport-routes, transit-proposals, commodity-catalog, supplier-concentration-policy |
| Labour & Social | population-services, employment, settlements, water-allocations, hazard-proposals, facilities              |

These are navigation priorities, not Office authorization. The full directory
retains all 34 sources for every public role view. UI compact formatting must
not replace exact source tokens, row IDs, source pointers, units or hashes.

## Actual browser checkpoint

Root used the in-app browser at the exact HTTPS country-01 Finance URL.
After the country loader completed, the visible page was **Avenor**, with
`API-verified country record`, `Not started` and `No live World clock`.
The initial transient accessibility snapshot preceded completion of the
country loader; it is not evidence of a persistent fallback or a complete
loading-state acceptance result.

Root clicked Treasury/CB account, then **Verify source fields**. The received
result visibly changed the metric to `VERIFIED_SOURCE` / `Source matched`,
with exact `46796106931.2`, dataset `finance`, field
`treasuryCentralBankBalance`, unit `GCU_SCENARIO_ACCOUNTING_UNIT` and nature
`OPENING_INPUT_BLOCKED_ON_SEMANTICS`. The source status explicitly said
`Source fields match · not live World`.

Root then opened **All source dossiers**. The actual drawer listed 34 sources,
including geography, deposits, facilities, power, water allocations,
employment, transport routes and proposals. This proves the directory entry
point, not complete remote reconstruction of each dataset in the browser.
No Confirm, local decision save, command, user/seat grant or economic write
was performed. This checkpoint is one country/office subset, not all 420
online role views or a mobile/playability acceptance.

## Remaining readback and acceptance

- Original audit remains `ALL_DATA_READBACK_FAIL`: 12 complete datasets
  verified, then geography physical offset 50 returned HTTP 546. Historical
  cause remains UNKNOWN; original report/ledger are immutable.
- Reader-v2's single authorized failed-page probe returned HTTP 200, exact
  28 physical rows and the fixed offline response hash. Probe report SHA-256:
  `2fced60d6f86fd9e18862d52c1462ae636512172424bfeadfb78da78909182f0`.
  It is page evidence, not complete geography closure.
- PR #71 immutable head `abda53461fe156996e941081005666591b9215a9`
  was P2 owner-fast-tracked and merged as `475f9476...`; focused CI
  `37137554902` and page-config CI `37137554780` succeeded. No full-suite or
  independent-review claim is made for this tooling candidate.
- Root authorized A's single remaining-group traversal as
  `CT-OFFICIAL-SOURCE-REMAINING303-READER-V2-V1`: 22 new dataset groups,
  country list, 70 detail groups and 210 association groups. Original 13
  completed groups remain historical-only. Execution is separately reported;
  at this checkpoint the final traversal report is pending.
- Maximum traversal success is `MIXED_VERSION_ALL_GROUPS_EVIDENCED`, not
  same-version full PASS. No retries or rerunning completed groups are implied.
- G is preparing/checking country 01 and 70 across six offices and desktop /
  mobile. This bounded online subset must not overwrite the retained original
  and post-fix 840-image local HOME visual evidence.

Login, team/person/Office assignment, source-to-runtime opening adoption,
Core/Worker execution, command-to-FINAL and Gate B remain separate unfinished
boundaries. Source matching does not split Treasury/CB accounts, approve
inventory ownership, commission proposed facilities or invent missing anchors.
The original EconMind product and old public/auth/storage data are unchanged
by this connection round.
