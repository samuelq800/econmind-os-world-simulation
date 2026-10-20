# COUNTRY_01 water-operation input contract — proposed slice

This is the next delta after frozen `d69d547`, not another 560-ID all-false map.
It recovers an existing **recurring potable-operation** recipe and exact
skill/energy/maintenance/loss inputs, distinct from the earlier repair capex.
It also recovers reference wages/material prices, records incompatible earlier
parameters, and reports the exact existing water constructor's raw/net seams.

The source files explicitly call these constructed, unadopted scenario choices.
The chosen R3 recipe is a proposed exact version for E review, not an approved
rule, actual quality assertion, national normal-service floor or complete cost.
Worker-days are not converted into hours; no clinical water-safety claim is made.
The old code's 120 GCU/MWh is a reference constant, not a real native tariff.

`INPUT_CONTRACT_CANDIDATE.json` defines the smallest required service-chain inputs
and the read-only D B02 interface. It preserves all eight COUNTRY_01 original
field meanings: a water-service input is not a national labour/power/transport
minimum. All unknown costs, grants, capacities and receipts remain missing.

Review is required before implementing a dependent service/cost producer.
`recover.mjs` is only a source extractor and exact lexical normalizer. It never
imports or executes the prior Python producer, arrays, jobs, journals or models.
It imports only the unchanged exact oracle and frozen d69 source-reading helpers.

With pinned Node 24.20.0, run:

```sh
node tools/unknown2544-c-water-service/run.mjs
```

The fixed C evidence output `v2-water-design` refuses overwrites and retains
source hashes/pointers/raw tokens, actual test/check logs and code/tree pins.
No Core/runtime/shared index, D/F source, grant, source admission, production
seed/SQL, World, Clock or original ledger is changed.
