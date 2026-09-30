# C → F/E official-world opening-input contract

Status: `IMPLEMENTED_UNVERIFIED_V2_COMPLETE_SOURCE_COVERAGE`

## Immutable source binding

- selection: `status/world-data-selection.json`
- package: `BALANCED_2026_09_28_V1`
- package checksum-manifest SHA-256:
  `88dd44478f97d2e8893a4f11b3aaf96e256bdb13248aca0d08f097fabe10d315`
- map package: `WORLD_MAP_FILES_V1_2026_09_28`
- map manifest SHA-256:
  `9a83b2de3e0da39dae9e485e8de4be5bf236de26d68937c48c7941d7d50f795f`

The adapter verifies all 86 balanced-package entries, the checksum manifest
itself, the map manifest and all 203 map files before returning output.

## Stable files and interface

- implementation: `scripts/official-world-opening-mapping.mjs`
- function: `buildOfficialWorldOpeningMapping(repositoryRoot)`
- deterministic writer: `writeOfficialWorldOpeningMapping(repositoryRoot)`
- mapping artifact:
  `docs/reports/world-connection/C_OFFICIAL_WORLD_OPENING_MAPPING.json`
- gap/rejection artifact:
  `docs/reports/world-connection/C_OFFICIAL_WORLD_OPENING_GAPS.json`
- complete coverage ledger:
  `docs/reports/world-connection/C_OFFICIAL_WORLD_COMPLETE_COVERAGE.json`

The mapping artifact schema is `OFFICIAL_WORLD_OPENING_MAPPING_V2`. Its
fingerprint is
`sha256:3463413929b1a659f0a089e041f8698c09d37caa2ad1d88fbc930db9bb9fffbb`.

The gaps schema is `OFFICIAL_WORLD_OPENING_GAPS_V1`. Its fingerprint is
`sha256:b0e37cc97802080be7f14f5a0d3bf4ef457f3c6c1e60f6560c79d110493772c5`.

The coverage schema is `OFFICIAL_WORLD_COMPLETE_COVERAGE_V1`. Its fingerprint
is
`sha256:9438a0c4b67d60a55d68fc2df676c70f63c57b8a48d6d25371cd4d6bdae6c651`.

## Consumer rules

1. Country identity is explicit:
   `visual-territory-NN` → `COUNTRY_NN`. Region identity is
   `visual-territory-NN-Ex` → `REGION_NN_Ex`.
2. All source numeric tokens are read losslessly and normalized as decimal
   strings. Consumers must not pass them through binary floating-point before
   Core decimal parsing.
3. The 12 commodity IDs and units bind exactly to the frozen fixed catalog.
   All 840 country/commodity stock cells are present.
4. Stock `sourceOwnerId`, warehouse, batch and proposed location mappings are
   deterministic. `titleHolderId` and `riskBearerId` remain `null` because the
   source entities are unbound NPC proposals. A consumer must not substitute
   `ENTITY_TEST_OPERATOR_*` or a real user/team identity.
5. Finance retains `GCU_SCENARIO_ACCOUNTING_UNIT`; `coreSettlementCurrency` is
   `null`. The merged `treasuryCentralBankBalance` is not split. Source
   liabilities/equity are preserved alongside exact arithmetic expectations
   and deltas; no balancing entry or rounding correction is supplied.
6. Facilities, deposits, water, power, employment and population-service
   records retain their proposal/unapproved/unenergized status. Display links
   remain display-only.
7. `records.allOfficialDatasets` contains every one of the 34 `data/*.json`
   datasets losslessly. Each record includes detected country/region bindings;
   datasets without such IDs are still included in full.
8. The coverage ledger enumerates all 86 checksum-manifest entries plus the
   checksum manifest itself, and all 203 versioned map-package files. It marks
   original preservation, offline structured mapping, formal-opening
   applicability, server-query status, page connection and static-publication
   evidence separately.
9. `openingSeedReady=false`, `worldId=null`, `workerStarted=false` and
   `productionDatabaseMutated=false`. The output is not permission to create a
   second World, commit a seed or start simulation.
10. A consumer must reject a changed schema, source hash, mapping fingerprint,
    country count, identifier, unit or reference. It may consume fully mapped
    domains independently, but must fail closed for the named blocking target
    of each unresolved gap.

## Current named blockers

- single authorized production World ID binding;
- approved inventory title-holder/risk-bearer identity semantics;
- scenario accounting-unit → Core settlement-currency authority;
- Treasury/Central-Bank balance split;
- facility, licence/deposit, water-rights, power, labour and social-asset
  runtime execution authority;
- user-deferred team/country/role assignment.

These blockers do not invalidate the official source data or its deterministic
mapping. They prevent only the corresponding authoritative runtime write.
