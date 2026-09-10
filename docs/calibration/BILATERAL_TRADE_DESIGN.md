# Bilateral Trade Calibration Design

Status: **DESIGN ONLY / NON_AUTHORITATIVE**

## Scope and handoff

The future object is `country x country x sector x period`, with country count supplied by package configuration. It is not a single aggregate relation and never hardcodes 70. `data/calibration/schemas/bilateral_trade_calibration.schema.json` defines the initial handoff shape.

The sector taxonomy is deliberately a reference (`sectorTaxonomyRef`). Candidate analytical groups include food/agriculture, energy, raw materials/metals, basic manufacturing, advanced manufacturing, consumer goods, technology, and services, but Foundation V1 does not freeze them. Calibration will consume the authoritative World Core taxonomy once Session A exposes a reviewed interface; until then no Core change is required.

## Evidence roles

- WTO: applied, bound, and preferential tariff distributions; market-access indicators; policy-baseline heterogeneity. These measures remain separate.
- UN Comtrade: reporter-partner-product-flow-period merchandise values, partner dependence, composition, and concentration.
- Services require a separately defined source; they must not be inferred from merchandise records.

## Reconciliation architecture

Reporter exports, partner-reported imports, classifications, valuation bases, and timing may disagree. Raw discrepancies are retained and diagnosed. They are not treated as natural equality.

Candidate sequence:

1. Freeze reporter and mirror snapshots plus concordance tables.
2. Normalize geography, period, flow, valuation, and product classification without destroying raw identity.
3. Produce explicit reporter/mirror discrepancy diagnostics.
4. Select a reviewed deterministic reconciliation rule.
5. Aggregate through a frozen product-to-sector concordance.
6. Build structurally nonzero seeds from evidence and documented topology.
7. Balance row/column/sector targets with an exact deterministic IPF/RAS variant or another reviewed method.
8. Allocate any indivisible exact-unit residual by a documented stable ordering; never accept an unexplained epsilon.

Final acceptance requires exact identities after reconciliation:

- bilateral sector flows sum exactly to each country's reconciled exports by sector;
- the same cells sum exactly to each country's reconciled imports by sector;
- global exports equal global imports in the same unit/valuation boundary;
- self-flows are zero unless a future schema explicitly explains and permits them;
- infeasible constraints fail with diagnostics.

Foundation V1 provides exact summation and deterministic diagnostics, not IPF/RAS implementation. The legacy `0.0001` tolerance acceptance is explicitly rejected.

## Route and logistics compatibility

Future optional references can attach route/path IDs, travel time, capacity, cost, risk, insurance, and disruption metadata. These are calibration inputs or derived annotations only. They do not connect to authoritative V18+ behavior in this phase.
