# World V2 balanced candidate production readback — 2026-09-30

Captured at `2026-09-30T00:24:15Z`, against the approved project and only the
`world_v2` namespace. This is a readback record, not Gate B approval.

## Result

- The production ledger exactly contains releases `0001` through `0019`; the
  full 19-row ID, hash, source-commit and release-order record is in the
  adjacent JSON evidence.
- `world_v2` has 24 base tables. `world_head` and `opening_seed` both contain
  zero rows.
- `BALANCED_2026_09_28_V1` already exists once, with its expected manifest
  hash, 87 source artifacts represented by 278 immutable storage rows, 70
  country profiles and total population `14,712,146,434`. Its database-side
  final integrity guard passed.
- The 86 checksum-manifest entries, 87 stored source artifacts and 203
  map-manifest files are separate measures. This does not claim that every
  map file is stored in a World business table.
- The previous map-locked candidate remains present. No insert, update,
  deletion, schema change or release retry was performed during this readback.

## Public boundary probe

With a publishable key, the fixed project health endpoint responded `200`.
Attempting the `world_v2` profile returned `406/PGRST106`; attempting the
candidate relation through the default public profile returned `404/PGRST205`.
No World V2 table or RPC is exposed to the browser role. The key and response
data were not recorded.

## Next server-only connection slice

The agreed API read path is a fixed join of
`country_candidate_bundle` and `country_candidate_artifact`, constrained to
`BALANCED_2026_09_28_V1` and the stored `data/countries.json` path. It will
verify the bundle, content hashes, 70 IDs and population before returning the
source data marked `OFFICIAL_SELECTED_SOURCE_DATASET` and
`liveWorldState=false`.

The proposed group role is `world_v2_api_reader`, with a separate future
login role `world_v2_api_login`. The API will use a read-only transaction and
`SET LOCAL ROLE` for the fixed query. A grant/RLS migration is only a candidate
until B narrowly reviews it; it is not in production. The runtime host,
independent login credential and configuration values for
`WORLD_DATABASE_URL`, `WORLD_API_DB_LOGIN_ROLE`,
`WORLD_API_DB_READER_ROLE`, and `WORLD_API_OFFICIAL_COUNTRY_DB_ENABLED` are
not configured in this repository.

No candidate source row is an OpeningSeed or a current World state. Formal
OpeningSeed creation remains blocked on the fixed C/F mapping and B's
independent review. Worker start remains disallowed.
