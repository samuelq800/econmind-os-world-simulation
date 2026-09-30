# C — official 70-country opening-input mapping plan

Status: `IN_PROGRESS`

Base: `cf6707d67fb56761ec7e4a403c272897401ae035`

Branch: `codex/c-official-world-mapping`

## Scope

Build a deterministic, offline-only adapter from the owner-selected
`BALANCED_2026_09_28_V1` package to a normalized opening-input proposal. The
adapter and generated evidence stay under C ownership:

- `scripts/official-world-*`
- focused tests
- `docs/reports/world-connection/C_*`

Core, Worker, API, UI, database migrations and production are out of scope.

## Required behavior

1. Reuse the existing balanced-candidate intake so all 86 listed source files
   and the checksum manifest remain byte-verified.
2. Bind the explicit official selection record, 70 ordered source country IDs,
   population total and package hash before mapping anything.
3. Emit deterministic country, region, entity-proposal, warehouse and
   commodity associations.
4. Preserve source numeric lexemes as decimal strings. Never round finance to
   cents, convert the scenario accounting unit to Core GCU, or silently repair
   balance-sheet differences.
5. Preserve all stock cells and prove exact country/commodity coverage and
   bucket conservation.
6. Associate facilities, deposits, climate/regions, water, power, employment,
   social-service and display-layer records without upgrading proposal,
   ungranted, unenergized or display-only states.
7. Produce a machine-readable per-country gap/rejection report. Missing legal
   ownership, currency authority, Treasury/Central-Bank split, team assignment
   and runtime approvals block only their named targets.
8. Keep `openingSeedReady=false`, `worldId=null` and all production mutation
   flags false. No simulation starts in this workstream.

## Verification

Run focused Vitest, deterministic regeneration/hash comparison, targeted
ESLint/Prettier, repository secret check and diff check. Request B's narrow
immutable-SHA review after pushing the candidate. Report production/database
checks as `NOT_RUN`.
