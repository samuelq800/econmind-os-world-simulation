# C — official 70-country mapping implementation report

Status: `IMPLEMENTED_UNVERIFIED`

## Immutable identity

- base: `cf6707d67fb56761ec7e4a403c272897401ae035`
- plan: `badfdf06fa994f3f357cf4ca898030fdd4381f71`
- implementation: `d101ac877eda23d44407ee82db35b5128f456b98`
- finance-bound refinement: `a3725160b8857052451efb1d6b7d2da06a96e069`
- final formatted mapping candidate: `831ffc9e982b76ede628563778b8136baa0bcb5d`
- branch: `codex/c-official-world-mapping`

## Output

| Artifact                                |     Bytes | File SHA-256                                                       |
| --------------------------------------- | --------: | ------------------------------------------------------------------ |
| `C_OFFICIAL_WORLD_OPENING_MAPPING.json` | 7,067,847 | `bf6f9dfa48177e331728922dd9fa5178773f904ed448d24209fff0c492f1cca1` |
| `C_OFFICIAL_WORLD_OPENING_GAPS.json`    |   227,231 | `7529976fc28dfca24e3b3ee61f232d2bb9b0ff5a269f3b1a28280cbfb1d06cbb` |

Canonical object fingerprints are recorded in the output contract. Regeneration
from the selected immutable packages reproduced both file hashes exactly.

## Mapped and checked

- countries: 70, ordered `visual-territory-01` through
  `visual-territory-70`;
- population: `14712146434` exactly;
- regions: 122;
- source entity proposals: 350, five roles per country;
- commodities: 12 with exact fixed-catalog units;
- stock cells: 840 = 70 × 12, including 619 positive and 221 zero opening
  balances;
- finance rows: 70;
- facilities: 1,374, comprising 1,024 opening-portfolio proposals and 350
  development options;
- deposits: 240;
- water allocations: 122;
- power rows: 70;
- employment rows: 70;
- population-service rows: 122;
- official current country scenes/details: 70 each;
- frozen balanced-package illustration links: 63, preserved separately rather
  than silently merged with the newer official map package.

## Finance finding

Exact decimal arithmetic reproduces B's read-only count: 56 countries have a
non-zero source deposit-liability difference and 62 have a non-zero source
equity difference. Every arithmetic delta is classified
`FLOATING_TAIL_SOURCE_PRECISION`; the largest absolute delta is `0.000017` and
zero countries have an arithmetic `ECONOMIC_SEMANTIC_DIFFERENCE`.

The genuine unresolved economic semantics are separate: the source currency is
still `GCU_SCENARIO_ACCOUNTING_UNIT`, and
`treasuryCentralBankBalance` is a merged source value without an approved split
rule. Neither issue was guessed or corrected.

## Authority boundary

Source OP/GOV/BANK/CENTRAL-BANK/HOUSEHOLDS records are legitimate records from
the owner-selected official package, but their own binding mode remains
`UNASSIGNED_TEAM_WITH_CANDIDATE_NPC_ADMINISTRATION`. The adapter therefore maps
their locators and proposed Core IDs without inventing a person, team,
title-holder or risk-bearer. Team absence does not block source-data mapping; it
blocks only the runtime identity-dependent write.

No proposal was upgraded to an executed facility, licence, water right,
energized grid, runtime job, social asset or team assignment.

## Verification performed

- focused Vitest: `PASS` — 1 file, 5 tests;
- dedicated strict TypeScript: `PASS`;
- targeted ESLint: `PASS`;
- targeted Prettier: `PASS` for source, test, plan and test config;
- deterministic regeneration: `PASS`;
- repository secrets: `PASS` — 1,758 files scanned;
- `git diff --check`: `PASS`.

## Explicit `NOT_RUN`

- Core, Worker, API and UI modification;
- database migration or production mutation;
- formal OpeningSeed commit;
- World creation or simulation start;
- team/country/role assignment;
- independent B approval or Gate change.
