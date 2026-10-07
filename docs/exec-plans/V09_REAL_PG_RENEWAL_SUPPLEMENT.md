# V09 real PostgreSQL renewal supplement

## Authority, preparation gate and ownership

PREPARATION_ONLY_NOT_V09_2_STARTED. Implementation preparation only; real
PostgreSQL execution is NOT_RUN. This test supplement touches P0 single-writer
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
