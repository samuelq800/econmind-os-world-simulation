# EconMind Calibration Foundation and C2 Live Pilot

Status: **IMPLEMENTED / NON_AUTHORITATIVE / READY_FOR_CALIBRATION_REVIEW**  
Final Season 1 70-country package: **NOT CREATED**

C3: **NOT STARTED**

This workstream converts provider-shaped bytes into traceable observations and, later, frozen World inputs. It does not implement World Core economics and it has no production/DB behavior.

## Layout

- `CALIBRATION_CONTRACT_V1.md`: identity, classification, revision, exactness, hash, freeze, and runtime-isolation rules.
- `LEGACY_ASSET_AUDIT.md`: per-asset migrate/reference/reject decisions.
- `COUNTRY_ARCHETYPE_DESIGN.md`: candidate methods and deterministic future generator boundary.
- `BILATERAL_TRADE_DESIGN.md`: sectoral matrix and exact reconciliation design.
- `data/calibration/source_registry.v2.json`: eight official provider families.
- `data/calibration/variable_registry.v2.json`: initial macro/fiscal/external/sector/trade variables.
- `data/calibration/transformation_registry.v1.json`: approved deterministic Foundation transformations.
- `data/calibration/schemas/`: JSON handoff contracts.
- `data/calibration/fixtures/`: tiny, hash-manifested, non-authoritative provider-shaped fixtures.
- `data/calibration/concordances/`: versioned pilot entity and trade-classification mappings.
- `data/calibration/pilot/`: C2 specification, committed snapshot manifest, normalized observations, diagnostics, and report.
- `packages/calibration`: deterministic TypeScript implementation and adapters.
- `tests/calibration`: calibration-specific verification and runtime-boundary checks.

## Adapter status

World Bank WDI, WTO Timeseries, and UN Comtrade adapters build deterministic request specifications and parse the common source-record model. C2 adds a bounded live HTTP transport, lossless JSON numeric-token parsing, immutable raw snapshot preservation, and common normalization.

The C2 pilot fetched WDI and UN Comtrade. WTO live retrieval is implemented but was not run because no runtime-supplied `WTO_API_KEY` was available; no credential is stored. See `C2_PILOT_REPORT.md` and `data/calibration/pilot/pilot_report.v1.json` for exact status, hashes, coverage, and caveats.

IMF WEO, ILOSTAT, FAOSTAT, World Bank Pink Sheet, and BIS have registry/interface definitions only; their adapters are not implemented.

## Local verification

Use the repository-pinned Node `24.20.0`, pnpm `12.3.4`, and frozen lockfile:

```sh
pnpm install --frozen-lockfile
pnpm vitest run tests/calibration
pnpm --filter @econmind/calibration typecheck
pnpm --filter @econmind/calibration build
pnpm test:boundaries
pnpm secrets:check
```

The full repository `pnpm check` remains the broad regression command.

## Raw data storage

Do not commit large provider downloads. Configure a local/object-store path outside Git, then commit only request specifications, metadata manifests, byte hashes, and reduced deterministic fixtures. Every new retrieval is a new snapshot; never overwrite frozen bytes.

## Current stopping point

C2 is implemented and non-authoritative, ready for calibration review. C3 has not started. No archetype algorithm, archetype count, fictional-country mapping, final trade matrix, IPF/RAS result, engine formula, runtime import, World State mutation, or production database operation exists in this workstream.
