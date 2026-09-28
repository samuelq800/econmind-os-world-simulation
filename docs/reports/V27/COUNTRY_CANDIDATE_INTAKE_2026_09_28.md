# 70-country candidate intake — 2026-09-28

Status: `RECEIVED_AND_HASH_VERIFIED / NOT_IMPORTED / NOT_ACTIVATED`.

## Named-source handoff received later

The exact task named by the owner, `01a0e1b0-603c-7e13-81de-2cddb9c5d4c1`,
subsequently delivered a separate map-locked 70-country candidate. Its
handoff manifest is at
`/Users/samuel/Documents/econclub/.econmind-worktrees/f-v25-fictional-map-preparation/outputs/01a0e1b0-603c-7e13-81de-2cddb9c5d4c1/handoff-manifest.json`.
This is now the **named-source candidate for reconciliation**, not an activated
opening. Source baseline `16356316144d27412183a13e4e568cd6a79151f5` has
uncommitted data outputs; immutable identity is therefore the file hashes, not
that Git commit alone.

- Workbook SHA-256 `6794d573505ddf08770c92d5ed8c3bb1759da1bb0ce3687dc64b4ec84264cd19`.
- Shareable atlas ZIP SHA-256
  `37314a68086720989bc82ea4e55119ab22c8ffd982ffa3e4c1e196cc9a759401`.
- Both full-file hashes matched the handoff manifest. Six listed source JSON
  files and all 14 named CSV tables matched the package manifest's SHA-256.
  The producing task reported 70 country scenes, 70 countries, 122 regions,
  240 deposits, 350 map-locked facility candidates and 349 survey-stage freight
  paths; this intake has not independently repeated its browser or geometric
  tests.
- The new reconciliation ledger changes country 51 population from 1,549 to
  1,019,797 and country 52 from 900 to 849,031. Its world population rises
  from 14,712,146,434 to 14,714,012,813; the other 68 countries' population
  is declared unchanged. `package-validation.json` reports structural PASS,
  but complete Core economic fairness validation is NOT_RUN.
- Its balancing suggestions affect only proposed financial credit/technology
  direction, not actual cash, loan, licences or operational facilities. The
  handoff says `activationAllowed=false`,
  `ILLUSTRATIVE_PLANNING_ONLY`, no real World/Season/team binding, and no
  production mutation.

The earlier alternate package described below is **not interchangeable**:
it preserves total population 14,712,146,434 by broader redistribution and
adds 1,024 opening facility groups plus wider trade/route plans. The named
handoff instead locks existing map facilities and corrects only two countries.
Do not merge their rows, take the larger facility count as commissioned, or
promote the earlier package merely because its offline stock rehearsal passed.

No country rows were written to the production database. The existing
`world_v2` schema still lacks a candidate-input store; `opening_seed` cannot
hold this inactive/illustrative candidate. The next authorized route is an
independently reviewed non-authoritative staging contract, or later a separately
approved canonical opening after Core mappings and activation criteria are
settled. Until one exists, the immutable source package is the intake record.

## Delivery and provenance

- Delivery message came from Codex task `01a0e302-4577-7471-a357-c81779b0a4fc`.
  The user's named source task `01a0e1b0-603c-7e13-81de-2cddb9c5d4c1` is still
  active and has not supplied its promised final handoff. Do not conflate them.
- Immutable package path:
  `/Users/samuel/Documents/econclub/exports/World-V2-全数据与平衡-2026-09-28.zip`.
- Package SHA-256:
  `75dc20eb8ba9f4c2963c45e1b83f113364c939abc8b1b75a99d34903c1123028`.
- ZIP integrity: `unzip -t` passed. All 86 files listed in `CHECKSUMS.json`
  match their claimed SHA-256 and byte size; the checksum file itself is the
  87th package item.
- JSON observations: 70 country records, 70 unique IDs, population sum
  14,712,146,434; 1,374 facility records. Country IDs are
  `visual-territory-*`, not yet bound to an authoritative World ID.

## Interpretation and non-activation

The package declares `activationAllowed=false`,
`worldIdentity=CANDIDATE_ONLY_NO_PRODUCTION_WORLD_ID`, and
`newNumbersAuthority=AUTHORED_GEOGRAPHY_CONSTRAINED_CANDIDATE_NOT_HANDBOOK_FIXED_RULES`.
Its seven candidate checks and three 600-day fixed-plan stock rehearsals are
reported PASS by the producing task; Core simulation, hourly power, physical
route survey and independent review are NOT_RUN/NOT_CLAIMED. This intake
verified package integrity and selected counts, not those model calculations.

The current `world_v2` database has 21 published tables but no general
country-candidate intake table. `world_v2.opening_seed` is an immutable
WorldVersion-zero authoritative lineage table requiring a real `world_head`,
canonical seed intent and replay binding. It is expressly not a fixture or
staging store. Inserting this inactive candidate into it would misclassify the
data and potentially consume an irreversible opening slot. No production SQL,
seed, migration, or source-map overwrite was performed.

## Required before any database import

1. Receive or reconcile the named source task's final handoff, including exact
   snapshot/version identity and whether it supersedes this candidate.
2. Approve a versioned country-ID/World-ID and Core project/recipe mapping;
   resolve null agricultural project IDs, real team/Office assignment, licence
   and contract authority, and remaining route/power evidence. Do not invent
   them from the illustration layer.
3. Decide whether this authored candidate is only reviewable input or becomes
   an approved opening configuration. Until then preserve
   `activationAllowed=false` and retain the original package unchanged.
4. If a candidate storage location is needed, design a separate scoped,
   non-authoritative staging schema/ingestion contract and obtain the required
   review before publication. Do not use `opening_seed` or legacy site tables.
5. Once approved, use the governed publisher with immutable input hash,
   atomic/idempotent import and per-country read-back; only then report counts
   inserted/rejected and runtime activation separately.
