# C3 Exploratory Distribution and Coverage Report

Status: **IMPLEMENTED_UNVERIFIED / EXPLORATORY_NON_AUTHORITATIVE**

This report is a readable index of the generated C3 artifacts, not a new data
source or a calibration decision. It is bound to the frozen C2 inputs through
the [execution contract](C3_EXPLORATION_EXECUTION_CONTRACT.md) and should be
read with its uncertainty register.

## Bound artifacts

- C2 historical input target: `42adf110c1d8e8f01932b8b9b5f97a1e086d0343`
- C2 independent closure target:
  `56d9882cddd7244dca84a4dda3eed2dd10866ac1` (`APPROVED_FOR_CONTINUATION`;
  `C2-M01`/`C2-M02` closed)
- C3 contract canonical hash:
  `9c9b3fab9f7def56bbe66d2e1464d278dde345d24dc37fc3e49e6dd883eafd48`
- Summary canonical content hash:
  `054e7f43641127f7aa1b94aae34e8f5f41bc8ce074a2983a759b2ef69f1c27d5`
- Uncertainty-register canonical content hash:
  `33547a374f86a6fa8670c8e5c5cf119903829239d4ec5cd07529d826b51c4bfd`
- Manifest canonical content hash:
  `b3ff2e350eb976af44d9fec17fb3d822071eb94d08f489b0f7800facc5f6419f`

The machine-readable sources are
`data/calibration/exploration/c3_exploration_summary.v1.json`,
`data/calibration/exploration/c3_uncertainty_register.v1.json`, and
`data/calibration/exploration/c3_exploration_manifest.v1.json`.

## Coverage and medians

`P50` below is a nearest-rank descriptive order statistic. It is not an
archetype centroid, an engine parameter, a fictional-country draw, or an
estimate with inferential uncertainty.

| Variable                          | Unit                    | Facts / distinct IDs | Explicit nulls | Non-missing coverage | P50              |
| --------------------------------- | ----------------------- | -------------------: | -------------: | -------------------- | ---------------- |
| agriculture_value_added_pct_gdp   | PERCENT_OF_GDP          |              30 / 30 |              2 | 28 / 30              | 3.78266528622109 |
| manufacturing_value_added_pct_gdp | PERCENT_OF_GDP          |              30 / 30 |              2 | 28 / 30              | 18.3217735042199 |
| services_value_added_pct_gdp      | PERCENT_OF_GDP          |              30 / 30 |              2 | 28 / 30              | 58.3256995087389 |
| gdp_current_usd                   | USD                     |              30 / 30 |              0 | 30 / 30              | 2191131765684.63 |
| inflation_consumer_pct            | PERCENT_PER_YEAR        |              30 / 30 |              0 | 30 / 30              | 4.69785886363742 |
| population_total                  | PERSON                  |              30 / 30 |              0 | 30 / 30              | 129739759        |
| real_gdp_growth_pct               | PERCENT_PER_YEAR        |              30 / 30 |              0 | 30 / 30              | 3.58382100798981 |
| unemployment_pct                  | PERCENT_OF_LABOUR_FORCE |              30 / 30 |              0 | 30 / 30              | 3.827            |
| bilateral_trade_exports_usd       | USD                     |                4 / 3 |              0 | 3 / not defined      | 78704554.777     |
| bilateral_trade_imports_usd       | USD                     |                3 / 3 |              0 | 3 / not defined      | 93512889.72      |

The macro coverage denominator is the contract's explicit 10-entity by
3-period grid. The bilateral trade denominator is intentionally not defined:
the data are a sparse requested slice, not an asserted full trade grid.

## Retained uncertainty

- Six explicit missing-observation diagnostics remain null rather than being
  imputed.
- One exact duplicate source fact is recorded; it is not silently weighted or
  erased from the source-fact count.
- Three reporting-asymmetry diagnostics remain separate reporter/mirror facts;
  no averaging or reconciliation occurs.
- WTO remains `NOT_FETCHED` with `WTO_API_KEY_MISSING`; no tariff observation
  has been synthesized or backfilled.
- WDI unit metadata and provider-vintage limits remain documented rather than
  being converted into confidence claims.

## Boundaries

C3 makes no p-value or confidence-interval claim and does not select an
archetype method/count, assign fictional countries, run IPF/RAS, construct a
final trade matrix, freeze a calibration package, import World Core/runtime,
or access production data systems. Independent review remains required before
any subsequent use of this exploratory work.
