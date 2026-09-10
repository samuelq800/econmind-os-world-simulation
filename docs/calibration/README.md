# EconMind Calibration Foundation V1

Status: **IMPLEMENTED / NON_AUTHORITATIVE / READY_FOR_CALIBRATION_REVIEW**  
Final Season 1 70-country package: **NOT CREATED**

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
- `packages/calibration`: deterministic TypeScript implementation and adapters.
- `tests/calibration`: calibration-specific verification and runtime-boundary checks.

## Adapter status

World Bank WDI, WTO Timeseries, and UN Comtrade adapters build deterministic request specifications and parse deterministic fixtures. Retrieval is transport-injected. Foundation V1 does not embed credentials or ship a general live HTTP transport.

`LIVE_FETCH_NOT_RUN` applies to all three providers. WDI live freezing additionally requires a lossless JSON-number token parser because the provider emits numeric facts; converting a fractional number through JavaScript `number` could lose source decimal text. WTO live use requires a runtime-supplied API key. UN Comtrade access tier and query limits must be recorded in snapshot metadata.

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

## Next phase

C2 should implement lossless live snapshot retrieval, source-specific metadata capture, geography/unit concordances, a small `PILOT / NON_AUTHORITATIVE` dataset, data-quality diagnostics, and deterministic normalized artifact emission. Stop again before final archetypes or a 70-country package.
