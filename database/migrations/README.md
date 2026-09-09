# World V2 migration artefact source

This directory is the only World V2 migration artefact source. Artefacts are
ordered and hashed by `manifest.json`. They may be rehearsed only in disposable
local or CI databases. This repository never publishes directly to the shared
production Supabase project.

Production publication remains owned by the main-site release chain. A release
handoff must copy the exact reviewed bytes, preserve the ID and SHA-256, record
the World V2 source commit, and pass staging review before the main-site chain
may publish it. Dashboard edits, manual SQL, migration repair, or a second
`db push` history are not authority.

`artifact_source_commit` means the full immutable Git commit at which the exact
SQL artifact path exists with bytes matching the manifest SHA-256. Validation
must resolve that commit and path through Git before rehearsal may record it as
`source_repo_commit`; a caller-supplied or working-tree-only value is not
provenance.

The `world_v2` namespace and this first DDL are Gate A candidates under
unapproved ADR-16. Their presence is not an ADR approval or production release
authorization.
