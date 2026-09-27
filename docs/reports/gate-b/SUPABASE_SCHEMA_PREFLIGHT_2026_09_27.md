# Supabase World V2 schema preflight — 2026-09-27

Status: live administrative metadata READ completed; V2 DDL NOT_EXECUTED.

## Owner request and target

The owner explicitly requested creation of the database structures needed for
the new World and then instructed use of Homebrew. Keep the original site's
data and latest Season 1 lobby unchanged. This is not an authorization to reset
the shared database, duplicate teams, expand browser access, or initialize
invented World resources.

- Homebrew installation: `/opt/homebrew/bin/supabase`, version `2.116.0`.
- CLI project listing: `Econmind OS Project`, `vimksjrhaxdpnkvgsavz`,
  `ACTIVE_HEALTHY`. The CLI's existing login can access the intended project;
  the browser's different account could not. No credential was extracted or
  printed; no password reset or CLI login replacement was performed.
- Local CLI scope used explicit `--linked --project-ref vimksjrhaxdpnkvgsavz`.
  No local project relink, `db push`, `db reset`, migration repair or seed.

## Exact read result

The single SELECT against PostgreSQL catalogs returned:

| Field                                         | Value      |
| --------------------------------------------- | ---------- |
| Database                                      | `postgres` |
| Execution role                                | `postgres` |
| PostgreSQL version                            | `17.6`     |
| `public` ordinary/partitioned tables          | `114`      |
| `public.world_preseason_teams` exists         | `true`     |
| `public.world_preseason_team_members` exists  | `true`     |
| `public.get_world_preseason_my_team()` exists | `true`     |
| `world_v2` namespace exists                   | `false`    |
| `world_v2` ordinary/partitioned tables        | `0`        |

No team/member row, personal profile or credential was selected. This verifies
object existence, not current remote RPC function-body equivalence or an
authenticated user's returned roster. The CLI printed `Initialising login
role...`; no application schema or data mutation was requested by these
metadata queries. An earlier multi-statement query returned no rows and was
not used to infer namespace absence; the single SELECT above established it.

## Publication scope under preparation

The unchanged V2 manifest passes `pnpm migration:validate`: 17 artifacts,
preserved order, SHA-256 and source commits. Those artifacts declare 21 tables
in `world_v2` covering release provenance, World head, Command/Event/queue/
receipt/outbox, writer lease, postings, current authorization/materialization,
projection entitlements, negotiation membership, transfer approvals and
opening seed. No new lobby team table is required.

These artifact checks do not constitute production approval. E is preparing
the scoped release handoff, absence/conflict guards and transactional rollback
evidence. The established main-site publication chain and immutable artifact
provenance remain requirements; do not bypass them with ad-hoc SQL or another
migration history. Resolve any publication-chain limitation explicitly.

Before actual DDL: reconcile the exact package with the live catalog, verify
no old-site schema changes or widened public grants, run the appropriate
disposable PostgreSQL rehearsal, and obtain fixed-package independent review.
The final publisher must recheck the target and absence guard immediately
before applying. Only then record actual created objects and read-back
results. Do not relabel this preflight as completed database creation,
production readiness, World initialization or Gate B acceptance.
