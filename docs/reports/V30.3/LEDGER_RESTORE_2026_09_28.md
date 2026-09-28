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
