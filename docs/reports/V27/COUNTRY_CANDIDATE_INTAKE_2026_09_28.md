# 70-country candidate intake — 2026-09-28

Status: `RECEIVED_AND_HASH_VERIFIED / NOT_IMPORTED / NOT_ACTIVATED`.

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
