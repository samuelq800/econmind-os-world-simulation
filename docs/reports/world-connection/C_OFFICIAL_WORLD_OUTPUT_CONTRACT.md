# C → F/E official-world opening-input contract

Status: `IMPLEMENTED_UNVERIFIED`

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

The mapping artifact schema is `OFFICIAL_WORLD_OPENING_MAPPING_V1`. Its
fingerprint is
`sha256:3cec8010e0dfb6cb82aca699f95610d40ae70e30c27a1fa0abf119682885706d`.

The gaps schema is `OFFICIAL_WORLD_OPENING_GAPS_V1`. Its fingerprint is
`sha256:75f34b4a2943370cba1bd7bf64e697b03dfc44d0013f0fe3cb41c4919c2e0ca5`.

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
7. `openingSeedReady=false`, `worldId=null`, `workerStarted=false` and
   `productionDatabaseMutated=false`. The output is not permission to create a
   second World, commit a seed or start simulation.
8. A consumer must reject a changed schema, source hash, mapping fingerprint,
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
