# Legacy Asset Audit

Audit date: `2026-09-10`  
Legacy source examined: `/Users/samuel/Documents/econclub/econmind-os-main`  
Foundation target: `@econmind/calibration` only

All expected assets were located. The duplicate delivery/archive copies were not treated as separate authorities. No legacy runtime code or numeric calibration was copied.

| Legacy asset                     | Located path under legacy source                              | Class                  | Decision / Foundation V1 migration                                                                                                                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| source registry                  | `data/economic-calibration/sources.md`                        | A. MIGRATE STRUCTURE   | Provider/dataset identity, coverage, access, revision, confidence, and caveat concepts informed `source_registry.v2.json`. Old date-stamped identities and claims were not copied as current facts.                                                  |
| variable dictionary              | `data/economic-calibration/variable_dictionary.csv`           | A. MIGRATE STRUCTURE   | Registry architecture, units, frequency, provenance, transformation, confidence, caveat, and status concepts retained. The 12-country constraint and old defaults/ranges were rejected.                                                              |
| synthetic country calibration    | `data/economic-calibration/world_country_calibration.json`    | C. REFERENCE ONLY      | Old fictional-country values are hypothesis/reference material. No values or country mapping entered Foundation V1.                                                                                                                                  |
| market baselines                 | `data/economic-calibration/market_baselines.json`             | B. MIGRATE METHODOLOGY | Price-anchor provenance, supply/demand scale, inventory, concentration, transport, and validation schema ideas retained in design notes. Old price dynamics, elasticities, ranges, and direct clearing formulas remain non-authoritative hypotheses. |
| policy effect library            | `data/economic-calibration/policy_effect_library.json`        | C. REFERENCE ONLY      | Lifecycle/scenario structure may inform later work. All numeric policy coefficients remain legacy hypotheses and were not promoted.                                                                                                                  |
| shock library                    | `data/economic-calibration/shock_library.json`                | C. REFERENCE ONLY      | Scenario-template structure may inform later work. Probability, magnitude, duration, and direct macro effects were not migrated.                                                                                                                     |
| calibration tests                | `data/economic-calibration/calibration_test_suite.json`       | B. MIGRATE METHODOLOGY | The validation-suite concept informed registry, provenance, deterministic, and boundary tests. Legacy tolerances and assumed formulas are not acceptance truth.                                                                                      |
| bilateral matrix                 | `data/final-world-teaching/bilateral_trade_matrix.json`       | B. MIGRATE METHODOLOGY | Row/column constraints, sparse gravity-style seeds, path references, and IPF/RAS candidate methodology retained for design. Hard-coded country/market values and `tolerance_share_points` acceptance were rejected.                                  |
| trade route graph                | `data/final-world-teaching/trade_route_graph.json`            | A. MIGRATE STRUCTURE   | Node/edge/path, capacity, time, cost, risk, and disruption concepts retained as future calibration-compatible graph fields. Fictional route values were not copied.                                                                                  |
| territory network                | `data/final-world-teaching/territory_network.json`            | A. MIGRATE STRUCTURE   | Configurable graph/topology concepts retained. Legacy territory IDs/defaults and any fixed world size are not authoritative.                                                                                                                         |
| settlement/default rules         | `data/final-world-teaching/settlement_and_default_rules.json` | C. REFERENCE ONLY      | State names, idempotency, balance, delivery, cure, restructuring, and force-majeure concepts are requirements references only. The legacy `unpaid balance > tolerance` transition and implementation ownership are rejected.                         |
| World mutation engine            | `lib/economics/world/engine.ts`                               | D. DO NOT MIGRATE      | Explicitly excluded: authoritative mutation logic, direct macro adjustments, hidden bonuses, float authority, and browser-era assumptions.                                                                                                           |
| continuous-world mutation engine | `lib/economics/continuous-world/engine.ts`                    | D. DO NOT MIGRATE      | Explicitly excluded for the same authority/exactness reasons.                                                                                                                                                                                        |

## Structurally migrated

- source and variable registry concepts;
- provenance, confidence, caveat, status, and validation metadata;
- snapshot/price-anchor traceability concept;
- graph and bilateral flow dimensions;
- calibration-specific test architecture.

## Explicitly rejected

- old synthetic country numeric values, policy coefficients, elasticities, shocks, probabilities, and scenario tuning constants as authority;
- fixed 12-country assumptions or any Core rule requiring exactly 70 countries;
- tolerance-based conservation/reconciliation acceptance;
- floating-point-authoritative accounting or silent rounding;
- direct `macro +=`/`-=` mutation, hidden country bonuses, 0–100 substitute macro state, and browser-side authority;
- settlement/default implementation that bypasses current/future Event, Posting, and atomic-commit ownership.

## Absent assets

None of the eleven requested data assets were absent in the audited legacy source. `ABSENT` would have been recorded instead of reconstructing any missing file.
