# EconMind Calibration Foundation, C2 Live Pilot, and C3 Exploration

Status: **C2 APPROVED_FOR_CONTINUATION / C3 IMPLEMENTED_UNVERIFIED / NON_AUTHORITATIVE**
Final Season 1 70-country package: **NOT CREATED**

C2 historical review target `42adf110c1d8e8f01932b8b9b5f97a1e086d0343` is
immutable reviewed evidence with required forward remediation. Independent
Review B approved its forward closure target
`56d9882cddd7244dca84a4dda3eed2dd10866ac1` for continuation under Class A:
`C2-M01` and `C2-M02` are closed, with no open blocker or MAJOR finding. C3 is
still **IMPLEMENTED_UNVERIFIED / EXPLORATORY_NON_AUTHORITATIVE**. Its historical
target `21c571cd215b89bff20804bf2e38db687b44e55e` remains `CHANGES_REQUIRED`
evidence for C3-MAJ-01; no C3 approval is implied by the C2 decision.

This workstream converts provider-shaped bytes into traceable observations and, later, frozen World inputs. It does not implement World Core economics and it has no production/DB behavior.

## Layout

- `CALIBRATION_CONTRACT_V1.md`: identity, classification, revision, exactness, hash, freeze, and runtime-isolation rules.
- `LEGACY_ASSET_AUDIT.md`: per-asset migrate/reference/reject decisions.
- `COUNTRY_ARCHETYPE_DESIGN.md`: candidate methods and deterministic future generator boundary.
- `BILATERAL_TRADE_DESIGN.md`: sectoral matrix and exact reconciliation design.
- `C3_EXPLORATION_EXECUTION_CONTRACT.md`: frozen-input, descriptive-method,
  uncertainty, and review-round contract for C3.
- `C3_EXPLORATION_REPORT.md`: readable index of the generated C3 coverage,
  distributions, retained uncertainty, and hard boundaries.
- `data/calibration/source_registry.v2.json`: eight official provider families.
- `data/calibration/variable_registry.v2.json`: initial macro/fiscal/external/sector/trade variables.
- `data/calibration/transformation_registry.v1.json`: approved deterministic Foundation transformations.
- `data/calibration/schemas/`: JSON handoff contracts.
- `data/calibration/fixtures/`: tiny, hash-manifested, non-authoritative provider-shaped fixtures.
- `data/calibration/concordances/`: versioned pilot entity and trade-classification mappings.
- `data/calibration/pilot/`: C2 specification, committed snapshot manifest, normalized observations, diagnostics, and report.
- `data/calibration/exploration/`: C3 frozen-input contract and generated
  non-authoritative exploration artifacts.
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
pnpm --filter @econmind/calibration exploration:generate
pnpm test:boundaries
pnpm secrets:check
```

The full repository `pnpm check` remains the broad regression command.

## Raw data storage

Do not commit large provider downloads. Configure a local/object-store path outside Git, then commit only request specifications, metadata manifests, byte hashes, and reduced deterministic fixtures. Every new retrieval is a new snapshot; never overwrite frozen bytes.

## Current stopping point

C2 forward remediation has independent Class A continuation approval. C3
descriptive exploration remains unverified by an independent reviewer and is
bounded to the frozen partial pilot: it does not create or approve an archetype
algorithm/count, fictional-country mapping, final trade matrix, IPF/RAS result,
engine formula, runtime import, World State mutation, or production database
operation.
