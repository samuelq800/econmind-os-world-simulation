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
  completed groups remain historical-only. The one actual traversal completed
  2026-10-05 22:04:57–22:09:05 Shanghai, exit 0: 511 actual GET responses,
  all HTTP200, all complete received body hashes, 303/303 new groups VERIFIED,
  FAILED/NOT_RUN/READING 0. Results: 22 complete new dataset trees, 70 country
  details, 210 country associations, exact population `14712146434`.
- Actual status is `MIXED_VERSION_ALL_GROUPS_EVIDENCED`, with
  `sameVersionFullPass=false`. The earlier 12 complete dataset trees are
  separately bound historical evidence; together all 34 selected datasets have
  complete-tree evidence across the two versions. No retries, new probe,
  fake skipped HTTP, extra original/map requests or economic writes occurred.
- Durable raw report:
  `artifacts/a-remaining303-v2.dSZ55A/readback/report.json`, SHA-256
  `19a4e3ea1cc4063c7d48959cdc67133f2775d190b46108a89e2eb03eed2dade6`.
  Root directly read the report, recalculated its hash, checked all 303 states,
  all 511 response status/body-hash/size records, fixed endpoint and exact
  GitHub Origin CORS, and recalculated the unchanged original inputs/ledger/
  report hashes. Source declaration and exact reconstructed DTO-tree checks
  are not a new remote raw-original hash verification claim.
- Per-country report:
  `artifacts/a-remaining303-v2.dSZ55A/REPORT.md`, SHA-256
  `d712a27e27ad22295666aa32fcdc3379061442159317b2e24fac7c483c4d9cad`.
  70/70 country detail and each country's three association results are
  recorded. Original `ALL_DATA_READBACK_FAIL` and historical 546 cause UNKNOWN
  remain unchanged; complete geography in this new traversal is VERIFIED.
- G completed the bounded online check of country 01 and 70 across six offices
  and desktop/mobile. The precise results and remaining observation gaps are
  recorded below. This subset does not overwrite the retained original and
  post-fix 840-image local HOME visual evidence.

## Six-office browser acceptance — bounded scope complete

G's final report and ledger were directly read by Root; all four reported
document/ledger/mapping hashes match. The published web/config baseline is
still the same `0ec30a28...` artifact; no new deployment was needed.

| Evidence layer               | Actual accepted result                                                                     | Limit                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Country/Office HOME          | 24/24 correct country and role, `API_COUNTRY_VERIFIED`, no horizontal overflow             | Only countries 01 and 70, six Offices, two viewports                               |
| Selected metric source match | 12/12 desktop pairs visibly `VERIFIED_SOURCE`, exact value/dataset/field/unit/nature match | One selected metric per pair, not all HUD fields online                            |
| Source directory/detail      | 12/12 mobile pairs, 34-source directory and relevant country source detail available       | Separate mobile observations, not 24 complete drawer cross-checks                  |
| Native API HTTP/CORS         | 60/60 observed HTTP200, exact custom-domain Origin/ACAO, no ACAC, snapshot transport       | Only 39/60 independent observer JSON summaries captured; remaining 21 INCONCLUSIVE |
| Country atlas return         | Four actual returns PASS, exact country/role retained                                      | Two countries, Captain, both viewports; not completion of every lazy atlas image   |
| Offline provenance           | 70 valid inputs, 1,260 HOME metric mappings and 5,496 site fields, zero missing            | Local structural checks, not 420 online country/role views                         |

Selected metrics were Captain population, Finance combined Treasury/CB,
Central Bank reserves, Industry site power, Trade grain stock and Social
labour force. Source `0` values remain exact source values, not missing-data
substitutes. Units and blocked/proposal natures remain literal.

G separately viewed 42 selected originals: 24 HOME, 12 source details,
two Finance metric drawers and four atlas-return views. Root verified all
42 file hashes and sampled the country-01 Finance metric and country-70
Social mobile HOME images. Root does not claim to have re-viewed all 42 images.

The raw strict observer's 4 PASS / 20 FAIL and two wrong-page atlas-selector
timeouts are retained. The interpretation ledger separately documents
same-URL document reuse without a new country GET, initial mobile images
with an already-open drawer, wrong React-root expectations on the static
country atlas, and post-read controller-abort observations. Corrected mobile
HOME images supersede but do not delete the originals. The raw network records
retain 23 aborts (21 API and two initial journey images); exact timing and the
21 unavailable observer bodies are INCONCLUSIVE. Successful DOM source matching
does not independently prove those bodies or establish an abort root cause.
No all-body PASS, zero-abort claim or silent raw-failure rewrite is made.

Durable directory:
`/Users/samuel/Documents/econclub/econmind-g-page-read-preparation-evidence/20261005T1402Z/`.

- `G_FINAL.md`: SHA-256
  `6c4c3ad9ea442b463587c0326b22f3e2699775d703097e22c2a435e12183d3dd`.
- `ACCEPTANCE_LEDGER.json`: SHA-256
  `abb937b1c1331cc6121ca95d86b54747eace00b39fc3c6f2d302e12110aa3f76`.
- `IMAGE_INDEX.json`: SHA-256
  `ed3ba6f35e626e04641a59a03b2010fa012f5649ae9cb098926d60c9c3a11895`.
- `OFFICE_MAPPING.json`: SHA-256
  `db345255a77d6afca2bf59cf3b406920f17b57602924f3fb4cf5e0c765e22f6e`.

No missing adapter mapping requiring a code patch was found in this scope.
A and G have completed their assigned connection checks and stopped.
Full 420 online coverage, all map/atlas asset completion and economic runtime
acceptance remain outside this finite source-interface acceptance.

Login, team/person/Office assignment, source-to-runtime opening adoption,
Core/Worker execution, command-to-FINAL and Gate B remain separate unfinished
boundaries. Source matching does not split Treasury/CB accounts, approve
inventory ownership, commission proposed facilities or invent missing anchors.
The original EconMind product and old public/auth/storage data are unchanged
by this connection round.
