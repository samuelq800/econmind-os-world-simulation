# V30.3 disposable ledger-row restore evidence — 2026-09-28

Status: `PREPARATION_ONLY_NOT_V30_3_ACCEPTANCE`.

The isolated candidate `46b9d164e786ade76762d2b27f6930448865abeb`
passed the [PostgreSQL 16 disposable restore workflow](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/36388204579).
The workflow applied the 19 checked-in, manifest-verified World V2 migrations
only to a fresh CI loopback service. It did not contact production Supabase or
the original EconMind website.

The synthetic pre-backup fixture contains one each of World head, submitted
Command, authoritative Event, conserved inventory Posting, balanced financial
Posting, and final Command Receipt. The two Posting inserts passed the current
database transition-binding and canonical-payload triggers. The backup-point
and restored complete-row snapshot hashes both equaled
`e5b75a201921c9306a8398acd432c2fae4c28c9412f1ec9bf72625cac32e1dd8`;
the later source-only snapshot differed. The restored row count was one per
listed table. The run uploaded its redacted JSON evidence artifact.

The reported 174 ms RPO and 303 ms RTO are timings of this tiny CI fixture,
not capacity or production recovery commitments. This proves only that these
synthetic durable rows survived one PostgreSQL backup/restore at the fixed
candidate. Worker crash/fencing, Event/Posting replay through Core, a real
70-country World, backup retention, shared-database impact, and the formal
V30.3/Gate B acceptance remain `NOT_RUN` or `PENDING`.

## Mainline scope and checks

The owner's 2026-09-28 instruction to continue toward V30 permits this
non-authoritative P2 diagnostic to proceed under the repository fast-mainline
policy. The change is confined to the disposable restore script and this
report. It does not alter Core, Worker, API, browser, migration, RLS, runtime
authority, production target, or the original main site; it does not mark a
formal step verified. The target guard still requires the fixed GitHub Actions
loopback PostgreSQL service and exact checkout SHA.

At code SHA `46b9d16`, focused local tests passed 6/6; targeted ESLint,
Prettier and migration validation passed. On the documented PR branch,
architecture tests passed 34/34, both boundary scanners, safe-local environment,
foundation policy, repository secret scan and full formatting check passed.
The exact-code native PostgreSQL run is linked above. This is scoped tooling
evidence, not an independent P0 review or full V30.3 acceptance.
