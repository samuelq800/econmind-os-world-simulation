# Manifest-driven disposable restore — scoped P2 acceptance

`OWNER_FAST_TRACK_ACCEPTED` applies only to diagnostic tooling candidate
`450a6abffc1efec8592848327cf4ff324e5e6ffa`, on main baseline `2f83974`.
The owner requested continued code completion on 2026-09-27 with real-user
feedback deferred. No Core, API, Worker, migration, manifest, RLS policy,
production target or original website changes are included.

The old diagnostic applied a globbed, fixed 16-file list. The new loader
uses the existing migration-manifest and Git-provenance validator, then
freezes the exact artifact SQL before creating or connecting to any database.
Only manifest-listed, hash-matching, source-commit-matching SQL is applied in
manifest order. A future forward migration can be rehearsed without changing
this script; this is not independent approval of that migration.

Focused tests passed 6/6, including a synthetic 17-entry chain, order/path
failures, modified bytes, missing provenance, frozen SQL and a real repository
manifest read without DB access. Targeted ESLint/Prettier, secret scanning
and diff checks passed. Exact candidate
[run 36301432185](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/36301432185)
passed the disposable PostgreSQL 16 backup/restore workflow using the current
real 16-migration manifest. No real 17th migration was created or executed by
this slice. Full repository check was not repeated for this tooling-only
change; V30.3/Gate B, production restore and user acceptance remain open.
