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

Current boundary: A's read code is merged, but the opt-in flag, dedicated
database role, production readback, static map URLs and formal OpeningSeed are
separate E/owner evidence. This slice does not connect the six game pages to
those APIs. `OfficialSourceStatus` is a fail-closed prewire: disconnected,
invalid, unavailable and empty states show no fixture value or command action.
Existing office gameplay remains local rehearsal until authorized runtime
projection and command receipts are independently verified.
