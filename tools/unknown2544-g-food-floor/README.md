# COUNTRY_01 GRAIN reference input

`projectCountry01FoodReference({ input, sourceBuffers })` validates one frozen
`G_C01_FOOD_FLOOR_DEMAND_DESIGN_V1` input. `FIXED_INPUT` contains that reviewed
design input; `readFixedFoodReferenceSources()` reads its six pinned repository
scenario files. Supplying the template alone cannot pass without those bytes.
The reader checks bounded regular files and exact size/hash; the projector
independently snapshots and verifies caller buffers and source pointers.

This implements the fixed design's closed shape and semantic checks directly,
including exact source joins, units, positive relative period, original decimal
token and recomputed candidate load. It does not claim full JSON Schema
2020-12 validation. The frozen external schema and original evidence stay intact.

The existing lossless parser and exact decimal oracle derive
`70337.8993333333262995434 TONNE` over the proposed `[0,1) SIM_DAY` interval.
The catalog token `0.0006666666666666666` is preserved; `1/1500`, the rounded
regional demand, facility capacity and planned output are not substitutes.

The result is `CONSTRUCTED_NOT_ADOPTED` reference pressure only. Normal/critical
floor selections, actual target/due/completed/qualified/pending/unmet quantities,
World/epoch/asOf/actual period, rights and quality evidence remain null. All
original stages and admission/runtime/production flags remain false; closures
and qualified imports remain zero. Any added key, actual zero, policy adoption,
authority promotion, wrong input version, source drift or inconsistent amount
is rejected. A valid reference input establishes no actual source completeness.

No actual eligibility, frontier, food-credit, conversion, settlement, financial
model, event, Clock, API or authoritative engine branch is implemented. The
future frontier and food-quality requirements remain in the reviewed design.
Tests are in `tests/world-core/g-country01-food-reference.test.ts`, which the
existing Vitest configuration discovers in the formal suite.
