# World V2 main-site release handoff

Status: `PREPARED_NOT_EXECUTED`.

## Available chain

The sole publisher is `main-site-release-chain`. This repository's handoff
library loads the existing manifest only after the normal byte-hash and
immutable Git-provenance checks pass. It contains no credentials, environment
lookup, Supabase CLI call, network client, or command-line release entrypoint.

The main-site publisher must provide its own reviewed database client and run
the handoff as one transaction. Before the first artifact it requires that the
`world_v2` namespace is absent. Any pre-existing namespace, artifact error, or
ledger/table-count mismatch causes rollback. The library inserts one
`schema_release` row per manifest entry with its exact migration ID, SHA-256,
source commit, and release order.

## Handoff contents

- 17 existing manifest-listed immutable artifacts, in release order;
- expected `world_v2` base-table count: 21;
- no changed artifact bytes, economic data seed, team/lobby copy, or shared
  schema operation;
- no new browser, anon, or service-role privilege.

## Required main-site publication procedure

1. Review the immutable candidate SHA and the manifest validation output.
2. Re-run the focused disposable PostgreSQL 17 rehearsal with a non-personal
   legacy-schema sentinel. Confirm the sentinel fingerprint is unchanged.
3. Obtain the main-site chain's staging/release approval. This candidate does
   not supply or replace that approval.
4. Execute the client-injected one-transaction primitive once against the
   approved target; do not substitute dashboard SQL, `db push`, repair, seed,
   reset, or a second history.
5. Record the post-commit `schema_release` ledger and the 21-table count using
   the approved release evidence process.

## Current execution gap and minimum owner-side addition

The existing `main-site-release-chain` is an ownership and approval contract in
this repository; it is not a checked-in persistent-connection publisher. The
available Homebrew Supabase CLI `db query` management API must not execute this
handoff one artifact at a time: separate invocations do not establish one
transactional session and would defeat the all-or-nothing guarantee.

Before a remote publication can be considered executable, the main-site owner
must add and independently review a release runner that:

1. receives the verified capability object from this handoff at an immutable
   reviewed commit by calling `loadWorldV2ReleaseHandoff` and
   `applyWorldV2ReleaseHandoff` in the same module instance. The capability is
   held in a module-private identity registry and cannot be reconstructed by
   serializing, spreading, or editing a plan object;
2. acquires one approved, server-held PostgreSQL connection outside this
   repository and passes it to `applyWorldV2ReleaseHandoff` exactly once;
3. records commit, manifest validation, transaction outcome, exact ledger, and
   table-count evidence without recording credentials; and
4. rejects per-artifact CLI queries, dashboard SQL, `db push`, repair, seed,
   reset, or a second history.

No such owner-side runner is present here, and this candidate intentionally
does not create one. This is a concrete `REMOTE_EXECUTION_ENTRYPOINT_MISSING`
blocker, not an invitation to reconstruct a transaction with ad hoc CLI SQL.

No remote DDL was executed for this handoff. A live project inspection is not a
release approval, and this preparation does not advance Gate B.
