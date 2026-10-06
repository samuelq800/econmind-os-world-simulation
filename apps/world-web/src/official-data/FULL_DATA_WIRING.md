# Selected-source page wiring — D matrix

`full-data-wiring-matrix.json` is the machine-readable contract map for all 34
owner-selected JSON datasets. The paired test compares every slug, source path,
kind, and focus field with A's merged registry and the frozen source package.
Focus fields name intended game interactions; the API preserves every source
field, including those not yet displayed in the game.

| Surface           | Source-led interaction to build                                         | Critical distinction                                                                                          |
| ----------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| National overview | Choose country, inspect its region, labour, stock and source provenance | Selected source is not an authorized live projection.                                                         |
| Captain           | Map region → service/facility need → proposed cabinet action            | Team assignment and authorization are not inferred from source rows.                                          |
| Finance           | Cash runway, funding exposure and stock-backed consequence preview      | Proposal rates and source balances are not posted ledger balances.                                            |
| Central Bank      | Deposit/reserve position and liquidity scenario                         | The API never supplies executed monetary policy or WorldVersion.                                              |
| Industry          | Facility → deposit/recipe/worker/power/water/route constraints          | Construction, licence and extraction proposals are not operational assets.                                    |
| Trade             | Stock gap → supplier/route/transit proposal → arrival preview           | A trade plan is not an executed contract or shipment.                                                         |
| Social            | Region population → beds/school seats/water/jobs → service intervention | Service and hazard source fields do not prove runtime effects.                                                |
| Map               | Country/region/site/node IDs bind geographic and asset layers           | The 203-file catalog has 140 country-associated files, but `publicUrl` is null until publication is verified. |

The route is `/v1/world-data/datasets/{slug}` with `offset`/`limit` pagination.
Country filtering is used only when A's registry declares it; seasonal water
and changes use the verified `regions.id → regions.countryId` join. Global
object/reference datasets are read without a fabricated country filter;
geography uses its bounded section route. Exact decimal strings retain source
units and are not turned into live HUD numbers by this matrix.

The active static Season 1 country game now has a read-only **Source intel**
drawer. It loads the 34-item catalog only when opened, then fetches one chosen
dataset page at a time. Each Office's relevant dossiers appear first; all 34
remain reachable. Array reads use a country filter only when A's actual
association contract permits it. Exact source decimal strings and top-level
fields appear without numeric coercion; concise field glances are optional, and
every fetched row has an expandable full-field view. Geography sections and
large string fragments remain bounded. A country switch, drawer close or page
exit retires the old read. The existing map, local planning loop and Office
actions are unchanged and do not consume these rows as authority.

With no verified API origin, the drawer says **Source not connected** and makes
no request. Invalid provenance, lost source or an empty country result have
separate states without fixture or zero-value substitution. The React
`OfficialSourceStatus` remains a prewire; the mounted product entry is the
static `season1-immersive` page and its equivalent status drawer.

The matrix now records `ONLINE_HOME_SOURCE_SCOPE_EVIDENCED` and
`READ_ONLY_SOURCE_READER_DEPLOYMENT_EVIDENCED`, with the exact evidence scope in
[the October 6 interface checkpoint](../../../../docs/reports/world-connection/O_DATA_INTERFACE_CHECKPOINT_2026_10_06.md).
The read-only reader is deployed; all 34 datasets have complete-tree evidence
across two versions (`sameVersionFullPass=false`). Accepted online HOME/source
coverage is 420 country/Office pairs, not every HUD field or gameplay action.
Eight additional current public GETs passed on October 6 without re-imports,
credentials, retries or another complete traversal. These status fields are
evidence metadata, not a runtime admission or an execution permission.

Current boundary: `runtimeState` remains `NOT_LIVE_WORLD`. Production execution
host/JWT/seat authorization, formal OpeningSeed semantics and economic receipts
remain separate unfinished conditions. The map catalog's null-URL contract is
unchanged; published static-map evidence does not make every catalog URL
verified. Existing Office gameplay remains local rehearsal until authorized
runtime projection and command receipts are independently verified.
