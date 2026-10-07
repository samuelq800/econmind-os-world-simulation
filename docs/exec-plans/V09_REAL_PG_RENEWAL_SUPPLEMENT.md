# V09 real PostgreSQL renewal supplement

## Authority, preparation gate and ownership

PREPARATION_ONLY_NOT_V09_2_STARTED. This source-fix candidate has no new real
PostgreSQL execution; the previous native run failed all four cases as recorded
below. This test supplement touches P0 single-writer
acceptance evidence and requires B's independent narrow review, not self-approval.

Control Tower requested this bounded supplement on 2026-10-07, from exact base
`e3a3b98527090203b5f9241a4d652aa024b394b3`, in isolated branch
`codex/f-v09-real-pg-renewal-supplement`. F owns only these two new paths:

- `tests/world-core/world-writer-lease-renewal-postgres.test.ts`
- `docs/exec-plans/V09_REAL_PG_RENEWAL_SUPPLEMENT.md`

No edits to existing three lease tests, SQL, manifests, packages, roles,
scanners, status/progress, UI, A/C/B files or the original EconMind site.
No database connection, cluster/role/schema creation, migration execution,
production action, HTTP/Worker/Clock execution, push or main integration in this
preparation turn. Future fixture setup is executable test code, not a permission
to execute it now. No second lease algorithm or economic model.

Read authority: AGENTS/PLANS, FAST_MAINLINE_REVIEW_POLICY, V09.1–V09.3 prompts
and plans, MASTER-U0081–U0094, CONSTITUTION-U0154–U0155, approved ADR-17/18,
status/decisions and current_gate. The older V09.1 plan still describes ADR-18
as pending; the explicit current decision record and register say APPROVED.
Current progress nevertheless leaves V09.1 PLANNED / not ready; this supplement
does not reconcile or advance governance records.

## Existing SQL contract (do not replace)

`0005_world_v2_writer_lease_fencing` defines both acquire and commit guard.
`0006_world_v2_writer_lease_lineage_guard` adds DELETE/TRUNCATE protection; it
does not redefine commit guard. Load the existing full 22-artifact manifest and
snapshotStorageFixtureSql only on a separately authorized fresh disposable
target, behind the existing canonical assertV09PostgresTestEnvironment guard.

- Active same holder: RENEWED, unchanged fence and acquired timestamp,
  non-regressing renewed timestamp, strictly greater expiry.
- Active different holder: WORLD_WRITER_LEASE_HELD, row unchanged.
- Active same holder with non-extending expiry: exact monotonic-expiry error.
- Active same holder with backward observed operational time and an otherwise
  extending expiry: exact backward-time error.
- Expired same holder, including equality at expiry: TAKEN_OVER and fence +1,
  new acquired/renewed timestamps. It is NOT rejected as an expired renewal.
- After a different holder takes over: old holder cannot renew the active lease
  and old fence fails the real transaction commit guard.
- Operational timestamps are explicit constants. No wall-clock sleeps or
  operational-time-to-SimTime conversion.

## Planned four bounded cases

1. Active renewal preserves holder/fence/acquisition and extends expiry twice;
   commit guard works after old expiry but before renewed expiry, rejects exactly
   at final expiry, and changes no World/economic/SimTime rows.
2. Competitor at a time after original expiry but within renewed expiry is
   rejected, with exact raw lease-row and World-row equality.
3. Backward observed time and equal/shorter candidate expiry each reject with
   exact errors, preserving the exact lease row and all World-scoped rows.
4. Expired same-holder reacquisition is TAKEN_OVER +1; later different-holder
   takeover is +1 again. Former holder renewal/commit rejects and keeps the new
   row/fence; current holder guard remains valid.

Only synthetic `WORLD_PG_RENEW_*` worlds. Read raw fence strings and UTC
microsecond timestamp strings, not JS Date or floating-point fence values.
Snapshot every World-scoped base table except operational lease as sorted raw
PostgreSQL row-text strings; assert World head, Event/Command SimTime fields,
Posting/receipt/outbox and other economic facts remain unchanged. Empty fact
tables are intentionally retained, not a seeded-economic-transition claim.

## Preparation verification and handoff

Planned necessary slice: frozen offline pinned-toolchain install, only this
test file collection with V09_TEST_DATABASE_URL absent (four SKIPPED, not PASS),
strict targeted TypeScript, targeted eslint, Prettier and git diff --check.
No existing models or original lease tests rerun; no PGlite substitution,
21-prefix fault matrix, A/C/420 sweep or unrelated whole-suite checks.

Freeze exact base/head, patch and source artifact hashes in a local evidence
package outside the repository. Hand back to Root for B review and STOP.
Any real run needs Root's separate generation/target authorization and a fresh
disposable target; passing preparation checks are not real-PG evidence.

### Actual preparation checks (2026-10-07)

- Node 24.20.0 / pnpm 12.3.4 frozen offline install: exit 0, no lockfile change.
- Targeted strict TypeScript compilation of the new test and imported guards:
  exit 0 (no product builds, no existing model test run).
- Targeted eslint and Prettier checks: exit 0.
- New file only Vitest collection: exit 0, 1 file / 4 tests SKIPPED because
  V09_TEST_DATABASE_URL is absent. Real renewal, commit-guard, fresh 22-artifact
  fixture, PostgreSQL RLS/grants/concurrency semantics: NOT_RUN, not PASS.
- git diff --check: exit 0. Final pins/check output are frozen separately in the
  local handoff artifact; no repository status update or review approval.

## Historical native failure and source-only observer correction

The preceding preparation checks above are historical, not native evidence.
Root subsequently authorized one fresh disposable native run of exact candidate
`811b96fa7087ef4cd031be6044f55fb67f65916b` under scope
`O_F_REAL_RENEWAL_DISPOSABLE_20261007_ONCE`. Actual result: **4 FAIL, 0 PASS,
0 SKIP**, exit 1. Each case failed in facts() with `column "row_text" does not
exist` at `ORDER BY row_text COLLATE "C"`. The lease acceptance assertions did
not complete. Full22 fixture and partial facts were preserved; the generation
was stopped safely and retained, with no rerun or source repair in that scope.

Frozen historical package (not overwritten):
`/Users/samuel/Documents/econclub/artifacts/f-v09-real-renewal-once-20261007.4U3FbV/`.
Handoff SHA256: `fca9724e3745693ecc8e4dcd40d9d1c1e6a211aca1deeaea141d29165ff3e134`.
CHECKS SHA256: `8573179a907fa2b7b09992ff4b791b20e1ed812efb421b6373a18f0db8106c05`.
Raw output SHA256: `2ffb5ad763168df21e48856dcb3ebeae58f0b73f483173e2cf5be3c75bbd1f08`.

Root's separate source-only authorization creates isolated branch
`codex/f-v09-renewal-observer-sql-fix` from exact `811b96fa...`, without editing
the old clean checkout. The only test-source change repeats the actual selected
SQL expression in ORDER BY: `to_jsonb(fact)::text COLLATE "C"`. Returned
`row_text`, fixed `$1` World filter, quoted catalog identifier, raw PG text/C
ordering, table traversal, four cases and all lease/time/fence/error assertions
remain unchanged. This repairs test observation syntax, not authoritative lease
SQL, not data normalization and not an alternative observer/lease algorithm.

One separately isolated in-memory locked-PGlite diagnostic is permitted with
three tiny synthetic rows and the exact old/new observer queries. It must
reproduce the old undefined-column error and verify the new raw JSONB text,
same-World filtering and C text ordering. Diagnostic script/output are ordinary
external artifacts, not governed product dependencies or real renewal evidence.
Only targeted strict types/lint/two-path formatting/source-pin checks follow;
no already-passing test suite or four-case collection rerun is needed.

New real PostgreSQL cases remain NOT_RUN; historical native renewal remains
NOT_PASSED. The former generation and scope are consumed. No real DB/cluster
restart, Supabase, Worker/Clock, push/main, status promotion or weakening is
authorized. Freeze new exact base/head/tree/binary diff/patch/checks and hand to
Root for B exact-delta review; a new reviewed fresh-generation authority is
required before any future native run. Then STOP.

### Source-fix diagnostic result

One locked PGlite 0.5.8 in-memory instance, three tiny rows, one old/new query
each: exit 0, PASS_PGLITE_SYNTAX_REPRO_ONLY. Exact source query templates were
extracted and only the catalog table identifier substituted for the tiny probe.
Old query actually raised 42703 / `column "row_text" does not exist`; new query
returned two exact raw JSONB text strings for only WORLD_PG_RENEW_PROBE, id11
before id2 (C text order, not numeric order). No JS parsing/normalizing/sorting
was used; the unrelated World row was excluded. Instance closed.

This establishes observer syntax/filter/sort on that embedded parser only.
There was no new native PostgreSQL execution, no real lease case, migration,
cluster, old database access or four-case collection. Native renewal remains
NOT_PASSED and the earlier 4 FAIL record remains intact.
