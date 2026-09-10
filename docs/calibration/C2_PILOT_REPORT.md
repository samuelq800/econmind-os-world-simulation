# C2 Lossless Live Pilot Report

Status: **IMPLEMENTED / NON_AUTHORITATIVE / READY_FOR_CALIBRATION_REVIEW**

Pilot artifact status: **PILOT_NON_AUTHORITATIVE_PARTIAL**

C3 at this historical C2 report target: **NOT STARTED**

Final Season 1 70-country package: **NOT CREATED**

The pilot validates the C2 ingestion and evidence contracts. It is not a simulation calibration result and is not authorized as World runtime input.

## Retrieval outcome

| Provider       | Result      | Requests | Raw observations | Caveat                                                                                                           |
| -------------- | ----------- | -------: | ---------------: | ---------------------------------------------------------------------------------------------------------------- |
| World Bank WDI | fetched     |        1 |              240 | One page; provider `lastupdated=2026-07-13`; six explicit nulls                                                  |
| UN Comtrade    | fetched     |        6 |                7 | Public preview; three reporter-export/mirror-import pairs; one exact duplicate provider row retained and flagged |
| WTO Timeseries | not fetched |        0 |                0 | `WTO_API_KEY_MISSING`; authenticated path is implemented; no key or fabricated response is stored                |

The seven exact response-byte hashes and content-addressed snapshot IDs are recorded in `data/calibration/pilot/snapshot_manifest.v1.json`. Raw files are immutable content-addressed files under the Git-ignored `data/calibration/raw/` directory.

## Normalized pilot

- 247 normalized observed rows, including the retained duplicate source row.
- 10 canonical empirical entities: Australia, Brazil, China, Germany, Indonesia, India, Japan, Mexico, United States, and South Africa.
- 10 variables: eight WDI macro/structural variables plus bilateral exports and bilateral imports.
- Annual coverage: 2021–2023 for WDI; 2022 for the bilateral slice.
- No empirical entity is mapped to an EconMind fictional country.
- Every row retains provider geography, raw numeric token or explicit null, canonical decimal value, snapshot ID, provider observation key, transformation/version, flags, and source attributes.

## Diagnostics

The committed diagnostic set contains:

- 6 `MISSING_OBSERVATION` warnings, all explicit WDI nulls.
- 1 `DUPLICATE_OBSERVATION` warning for an identical UN Comtrade provider key; both source facts remain present.
- 3 `REPORTING_ASYMMETRY` informational diagnostics. Export-reporter and mirror-import values remain separate; no averaging or reconciliation occurred.
- 0 unresolved concordances after explicit provider-code normalization.
- 0 unit mismatches under the versioned pilot plans.
- 0 unsupported classifications for the three requested H6 headings.
- 0 outlier-rule violations under `outlier_rules.v1.json`.
- 0 exactness failures and no rounding policy invocation.
- No second equivalent live vintage was fetched, so this run has no live revision comparison. The deterministic revision detector is covered by tests.

Diagnostics never change source values. They are flags, not corrections.

## Exactness design

The JSON parser tokenizes provider numbers directly from UTF-8 response bytes. It stores the exact token and separately derives a canonical decimal string using string operations. Integer, fractional, and exponent forms never pass through JavaScript `Number` for authoritative values. Unsupported or excessively expanded exponent forms fail with an explicit deterministic error; no rounding is introduced.

Snapshot metadata binds source family, provider, endpoint identity, canonical query parameters, requested dimensions, retrieval time, provider vintage where available, reproducibility response headers, byte count, SHA-256, adapter version, license URL, and status. A content-addressed filename can be reused only when its existing bytes verify against the same hash and length.

## Concordances

`source_entity_concordance.v1.json` explicitly separates ISO3, zero-padded UN M49, WDI economy codes, UN Comtrade numeric reporter codes, and pilot WTO member ISO3 identifiers. Unresolved and ambiguous lookups do not fall back silently.

`trade_classification_concordance.v1.json` preserves provider classification `UN_COMTRADE_HS`, revision `H6`, product-code prefix, and mapping version `pilot-sectors.v1`. Its three mappings are deliberately provisional and non-authoritative; they do not freeze the final sector taxonomy.

## Boundaries

No World Core, World State, Simulation Clock, Event Ledger, inventory, financial posting, V09 writer, engine parameter, production database, Supabase, final archetype, 70-country assignment, final trade matrix, or IPF/RAS path was read from or mutated by the live pilot. Calibration remains an isolated data-product owner.
