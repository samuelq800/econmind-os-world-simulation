# C4 Deterministic Gate Diagnostics Pack

Status: **SHARE WITH CAVEATS / DIAGNOSTICS_ONLY_NON_AUTHORITATIVE / ALL SEVEN GATES OPEN**

This package performs only the deterministic diagnostics authorized after C4
feature-evidence target
`f564c0ca18387ab4a07144522ec8ce0c0df9ff62`. It uses the already frozen C2/C3
and feature-evidence bytes. It does not fetch data, select a policy, fill a
value, reconcile trade, generate a country, or create runtime authority.

## Method and provenance

`data/calibration/preflight/c4_gate_diagnostics_execution_contract.v1.json`
binds twelve exact inputs: the previous feature execution contract and evidence
artifact, the C4 preflight, four C3 artifacts, four C2 pilot artifacts, and
variable registry `2.1.0`. The contract canonical hash is
`c4172d3cc746be5f82b4eadc4494156918b73cc3b25112910ed90d17063eec40`.

The verifier snapshots every supplied byte array once, checks all raw SHA-256
bindings before parsing, reconstructs the prior feature evidence from its
original bound inputs, and requires exact equality with the committed feature
artifact. Only then does it calculate this pack. Exact decimal strings are used
for every sector sum and trade difference; no floating-point or implicit
rounding path is used.

The generated pack content hash is
`fd0b7f00239b990b847bdca8e3629430a9f163ec49b997e546097b27b49882bc`.

## Missingness candidates

Four review candidates are recorded, with no selection:

1. `PRESERVE_NULL_NO_IMPUTATION`
2. `VARIABLE_AVAILABLE_CASE_NO_IMPUTATION`
3. `COMMON_GRID_COMPLETE_CASE_NO_IMPUTATION`
4. `OWNER_APPROVED_IMPUTATION`, explicitly not run

All 19 archetype candidates receive variable-level applicability. The three
sector variables each contain two explicit nulls; unemployment has no explicit
null in the frozen slice. Across the four feature variables with pilot data,
the common entity-period grid contains 30 cells: 28 complete and 2 incomplete.
The incomplete cells are `emp:USA/2022` and `emp:USA/2023`, each missing
agriculture, manufacturing, and services observations.

This quantifies the exclusion footprint of complete-case handling. It does not
approve that strategy. No candidate replaces, interpolates, carries forward,
or otherwise fills a null.

## Vintage stability

A valid comparison requires the same provider and canonical request parameters
at distinct retrievals. Period differences within one response, different
queries, and missing `sourceAsOf` metadata do not count as vintage evidence.

| Provider          | Snapshots | Query identities | Comparable pairs | Diagnostic                                                   |
| ----------------- | --------: | ---------------: | ---------------: | ------------------------------------------------------------ |
| WB WDI V2         |         1 |                1 |                0 | Single snapshot; 2021–2023 are periods, not vintages         |
| UN Comtrade V1    |         6 |                6 |                0 | Different reporter/partner/flow queries; `sourceAsOf` absent |
| WTO Timeseries V1 |         0 |                0 |                0 | Source not fetched; `WTO_API_KEY_MISSING` retained           |

The diagnostic closes the local comparability audit, but cannot close the
vintage-stability gate. That requires at least two frozen retrievals of the
same canonical provider query.

## Sector diagnostics

The available observed components are agriculture, manufacturing, and
services, all measured as percent of GDP. They are not an exhaustive sector
partition: manufacturing is only part of industry, and frozen industry-total
observations are absent. Adding a future industry total to manufacturing would
double count manufacturing.

For 28 complete cells, the pack derives an exact available-component partial
sum and its residual to 100 percentage points. The residual ranges from
`8.894215082633489` to `28.67604204198554`; none is negative. These residuals
describe omitted sector coverage and related accounting differences, not a
failed total identity. The two incomplete US cells retain null derived values.

`totalReconciliationStatus` therefore remains
`NOT_RUN_NON_EXHAUSTIVE_COMPONENT_SET`. An exhaustive owner-approved component
taxonomy and corresponding frozen observations are required before a total
reconciliation claim.

## Bilateral trade diagnostics

The pack pairs three distinct reporter-export observations with their reverse
reporter mirror imports at the same period, HS classification/product, and
pilot sector. Observed flow values remain `OBSERVED`; signed and absolute
differences are explicitly `DERIVED` diagnostics.

| Exporter → importer | Product / pilot sector         | Export minus mirror import, USD | Absolute difference, USD |
| ------------------- | ------------------------------ | ------------------------------: | -----------------------: |
| DEU → BRA           | H6 27 / energy                 |                 -48,138,945.061 |           48,138,945.061 |
| IND → ZAF           | H6 10 / food-agriculture       |                 -14,808,334.943 |           14,808,334.943 |
| USA → CHN           | H6 84 / advanced manufacturing |                  -4,739,833,509 |            4,739,833,509 |

All three differences are non-zero. The exact duplicate German export source
fact is counted once for pairing and retained as multiplicity `2`; it is not
silently weighted twice. There are zero unmatched distinct flows in this
bounded slice.

The values are not averaged, selected, balanced, or reconciled.
`reconciliationStatus` remains `NOT_RUN_NO_AVERAGING_NO_IPF_RAS`.

## Readiness disposition

The computable diagnostic work for missingness and sector/trade differences is
complete. The vintage comparability audit is also complete, but found no valid
comparison pair. All original gates remain open:

1. Missing-value policy: owner must approve one candidate and its
   variable-level applicability.
2. Archetype method/count/labels/feature set: separate owner decision required.
3. Fictional mapping: explicit governance authorization required.
4. WTO tariff evidence: authenticated frozen and reviewed source evidence
   required.
5. Vintage stability: repeated equivalent-query snapshots required.
6. Sector/trade reconciliation: exhaustive sector evidence plus owner-approved
   taxonomy and mirror policy required.
7. Final calibration/runtime handoff: blocked by all upstream gates and requires
   separate governance review.

Overall assessment is **Share with caveats**: the calculations and provenance
are reproducible, but the artifact supports gate review only. It does not
support a feature selection, stability claim, sector-total claim, reconciled
trade matrix, final calibration, or runtime use.

## Reproduction

Use repository-pinned Node `24.20.0` and pnpm `12.3.4`:

```sh
pnpm --filter @econmind/calibration c4:gate-diagnostics:generate
pnpm vitest run tests/calibration/calibration-c4-gate-diagnostics.test.ts
```

The focused tests verify raw-byte tamper rejection, prior evidence lineage,
observed/derived/null boundaries, complete JSON Schema conformance, forged
bundle rejection, single-read snapshotting, and three short independent local
runs. Success reports `C4_GATE_DIAGNOSTICS_VERIFIED_NOT_READY`.
