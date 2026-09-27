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

No remote DDL was executed for this handoff. A live project inspection is not a
release approval, and this preparation does not advance Gate B.
