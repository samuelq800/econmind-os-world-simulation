# D — E-I02 exact-column supervisor candidate

Date: 2026-10-10, Asia/Shanghai. Status: **IMPLEMENTED_UNVERIFIED** / P0.
Implementation owner D. Root must assign E/C non-implementer review. This is not
self-approval, merge/CI/Gate B authority, production provisioning or World start.

## Fixed source and scope

- Dedicated World repository, independent worktree:
  `/Users/samuel/Documents/econclub/.econmind-worktrees/d-supervisor-column-guard-20261010`.
- Branch: `codex/d-supervisor-column-guard-20261010`.
- Verified local `origin/main` base: `27307a108ce5c0c3e2ce28e3776f8ba15ed73d3b`;
  tree `69c04e4ca079e082e5f1bf85ce5d937ac6085b4d`. No fetch/remote freshness claim.
- Code commit: `c846305b34d394edbc6884ea933e4689f7ad7770`.
- Code tree: `7878ed64874e6d03ce7ae0140966385316697b25`.
- Canonical code delta (`--binary --full-index --no-renames --no-ext-diff --no-color`):
  `40441048c65966c05c0ee448a5cffe569e403a1e7e9280a07fd8f68fd556b425`.
- Code freeze was clean before final test commands. All final tests ran at this
  code commit; only this report is added afterward. Final tip/tree/report hash
  are in the outer handoff/freeze to avoid recursive self-reference.

Root explicitly authorized this E-I02 implementation after D's E integration
design review, SHA256
`25d32aac60a7a76c491886bfe0c659b47380b4f7b33538bdb7994356465d34e0`.
That review is not approval of this code. A owns E-I01 source-owner design;
E/G/B boundaries are untouched. Current V09.1 remains PLANNED/not-ready; this is
bounded isolated preparation, not a gate/status update.

Only five code/test/config files plus this report:

| File                                                                   | Responsibility / SHA256                                                                                                  |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `apps/world-worker/src/runtime-preparation/writer-lease-supervisor.ts` | bind/catalog observation only; `e1005304cd8b0726974aef03d7531429849f8936292b3b4067ca74474be2f5d3`                        |
| `tests/world-core/writer-lease-supervisor.test.ts`                     | existing20 +35 negative catalog controls; `d656a7d538bbda861e12c26b7c27c9951127a371631215578448d5bb97b61ecc`             |
| `tests/world-core/writer-lease-supervisor-postgres.test.ts`            | same seven assertions/cases, fixture UPDATE narrowed; `7787482d65ce9f3d849cfbecfbfb02a7ca6d50f9dc0006012caed106d8651e14` |
| `tests/world-core/writer-lease-supervisor-columns-postgres.test.ts`    | dedicated36 native cases; `b54b7952afaa2f777d9975c63dc16aaf5438973031e35d47d36c8b6bd33cb0c0`                             |
| `tests/world-core/writer-lease-supervisor.tsconfig.json`               | include the new dedicated suite; `36e89959787a7f5ac7fb26c1bec0b6747aef643a6f0286f8834e2847816138ff`                      |

The original seven-case CI contract is preserved; this candidate does not change
the supplemental workflow/helper or its expected D7 result. New36 is a separately
invoked suite on a separate fresh database, not silently added to D7.

## Implemented capability observation

Required privileges use individual AND checks, never a comma-separated OR or an
any-column positive shortcut:

- head: existing SELECT + UPDATE(world_version) + UPDATE(event_sequence).
- lease: existing SELECT/INSERT + UPDATE(holder_id), UPDATE(fencing_token),
  UPDATE(acquired_at_real), UPDATE(renewed_at_real), UPDATE(lease_expires_at_real).
- existing exact acquire and commit-guard function EXECUTE checks remain.

Column privilege checks include table grants, so explicit negatives independently
reject table UPDATE on either table and UPDATE(world_id) on either table.
Effective rights also cover PUBLIC/inherited rights. The scoped role must have
**no membership edges**, including non-inheriting SET-only edges, preventing a
later SET ROLE path. Even membership without INHERIT/SET is rejected rather than
becoming an undocumented compatibility exception. This is a narrow scoped role
contract, not general-purpose PostgreSQL role support.

Head INSERT is audited per actual column; head DELETE/TRUNCATE are independently
denied. Existing lease DELETE/TRUNCATE denial is unchanged. Catalog column-name
and order arrays must match the existing head3/lease6 fields; added/replaced
columns fail closed, including otherwise readonly additions. No implicit
writable future field is admitted. This is not full type/schema/RLS attestation.

All prior exact session/current_user/configured-role checks, readonly-off,
dangerous role attributes, schema CREATE denial, row-count/boolean checks and
world-head presence checks remain. False/null/missing observations deny.
The query remains a single bind observation, called at the same pre/post points.

No change outside bind: holder generation, acquisition/renewal parsing, fencing,
explicit wall time, committed-only installation, LOST/UNKNOWN, drain/stop,
transaction handling and lease→H SQL order remain unchanged. The lease is not
admission or a reservation; AtomicTransitionRepository must still check its
real in-transaction guard.

No SQL functions, artifact bytes, roles/grants provisioning, manifest, private
authority, source owner, admission/seat, economics, configuration or preview
files changed. This observes privileges; it does not grant them. Existing
overbroad table-UPDATE callers are intentionally rejected rather than supported
through broader grants. Formal provisioning remains separately reviewed.

## Actual final verification at code commit

Pinned Node24.20.0 / pnpm12.3.4. Offline frozen install: exit0, 161 cached packages
reused, downloaded0; no package/lock changes. Core and Worker were built with
their existing scripts, no browser/production entry or full suite.

| Actual command / scope                                                                                        | Result                                                                  |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `vitest run writer-lease-supervisor.test.ts world-writer-lease.test.ts` (full repository-relative test paths) | exit0,60 PASS/0 FAIL/0 SKIP,55 supervisor +5 Core                       |
| `vitest run tests/world-core/writer-lease-supervisor-columns-postgres.test.ts`                                | exit0,36 PASS/0 FAIL/0 SKIP                                             |
| `vitest run tests/world-core/writer-lease-supervisor-postgres.test.ts`                                        | exit0,7 PASS/0 FAIL/0 SKIP                                              |
| `tsc -p tests/world-core/writer-lease-supervisor.tsconfig.json --noEmit --strict --skipLibCheck false`        | exit0; strict options not weakened                                      |
| focused ESLint on changed TS files                                                                            | exit0                                                                   |
| focused Prettier check including strict config/report                                                         | exit0                                                                   |
| `pnpm --filter @econmind/core --filter @econmind/world-worker build`                                          | exit0, existing tsc builds                                              |
| `node scripts/check-boundaries.mjs`                                                                           | exit0,321 files PASS                                                    |
| `node scripts/check-authoritative-patterns.mjs`                                                               | exit0,316 files/Core89 PASS                                             |
| `node scripts/check-repository-secrets.mjs`                                                                   | exit0, final count recorded in handoff                                  |
| clean-env `ECONMIND_ENV=local node scripts/assert-safe-environment.mjs`                                       | exit0,NOT_LINKED/databaseConfigured=false/databaseMutationAllowed=false |
| `git diff --check`                                                                                            | exit0                                                                   |

Native commands used `env -i`, explicit local environment/fingerprint, canonical
credential-free loopback V09_TEST_DATABASE_URL, and the unchanged
assertV09PostgresTestEnvironment guard before any connection. The immutable
renewal loader validates complete current provenance and exact frozen artifacts;
only existing0001..0006 are applied in each fresh database. No admission or seed.

Final self-owned PG16.15 generation: `/tmp/d-column-supervisor-dT4oda/data`;
system_identifier `7695034856875557466`, listen127.0.0.1:59727. Two fresh databases:
`econmind_v09_d_supervisor_columns_final` and
`econmind_v09_d_supervisor_legacy_final`. Both have separate fresh world_v2 schema;
role names are distinct between suites. No existing/shared database was reused.
Max test pools2/3, bounded ordinary statements, serial files; no load/attack test.
Before stop, columns DB command_submission=0, authoritative_event=0, release
prefix count6 and supervisor membership count0. Operational lease/head fixture
facts are expected; they are not World/opening facts. Both owned generations
were stopped and `pg_ctl status` confirmed no server running; data/logs retained.

New native controls cover actual nonadmin exact-column acquire/renew/assert,
each of the seven missing UPDATE columns, SELECT/INSERT/each function EXECUTE,
direct table/identity/PUBLIC excess grants, INHERIT-only/SET-only/neither role
memberships, unknown writable columns, head INSERT(column)/DELETE/TRUNCATE,
lease DELETE/TRUNCATE, schema CREATE/CREATEDB, read-only transactions, permission
loss at the second bind with rollback, World-head mismatch and reader/intake-like
test identities. Each denial asserts no lease row; TEST_ONLY identities are not
formal intake/reader provisioning.

Renewal ACK/cleanup failure controls inject errors after actual SQL COMMIT and
assert UNKNOWN, old confirmed lease retained, actual renewed DB row, no liveness
or automatic retry. These are host error injections after a real commit, not a
claim of physical network loss or actual PoolClient.release failure. Original7
also retain expiry/takeover/stale-fence, duplicate holder, drain and lost acquire
ACK controls. No economic recovery/FINAL receipt closure is claimed.

## Raw evidence and failure history

Raw bytes are retained in the managed target collection at:
`/Users/samuel/.codex/state/plugins/codex-security/scans/d-supervisor-column-guard-20261010/artifacts-c816262dcd7cd273d21c658ed57fc01d237ce6861b8e868406a0ffedfa3d3264/artifacts/D_EI02_COLUMN_GUARD/`.

| Raw artifact         | SHA256                                                           |
| -------------------- | ---------------------------------------------------------------- |
| final-columns.json   | cc62e73e3691d34f9966d142427b3e4757cbf1b9c444fda96048b067edf9b6b5 |
| final-legacy.json    | c16ae38b7b2104204a0c8fc51bb8a2ce67aebb118bc17b7f621a9fc32f8f7d8f |
| final-unit.json      | c59894e35bbf67dd4104e970b43f92ff81b4ad35ef00bfbc6c5b56aa7ce869ae |
| initial-columns.json | dca168f784a468d4b16b909238a7f40188eeb969537f95e3694fecf52df3ea8c |
| repair-columns.json  | 4c2fd2e7f5d7fa241294bc7afce0ffb9c2608a252ad2ba7934c6aa51654dd2bd |

Matching raw stdout/stderr, strict stdout/stderr, both PG logs and code.diff are
also retained; all final stderr files are empty. Freeze.json binds every digest.

Failure history is retained, not relabeled:

1. Initial strict failed TS2345 due inferred non-tuple it.each rows; fixed test
   tuple types with `as const`, no compiler flag change. Subsequent strict passed.
2. Initial PG startup failed with missing LC_ALL, postmaster multithreaded FATAL;
   log retained. Explicit LANG=C/LC_ALL=C corrected only the self-owned startup.
3. Initial native columns run:34 PASS/2 FAIL. Table REVOKE UPDATE removed fixture
   column grants, contaminating later positive cases. Fixed fixture cleanup to
   restore only the original exact columns and assert baseline effective rights
   before/after every grant case. The product guard was not loosened. Earlier
   negative results are not promoted as isolated-property proof.
4. A repair attempt on another DB in the old generation failed setup because
   PostgreSQL roles are cluster-global:0 PASS/36 SKIP. Retained failure JSON.
   Stopped that generation, created an entirely new one; no role reset/drop or
   if-exists bypass. Final36/7 ran on fresh databases in that new generation.

Counts are per final command, not accumulated across attempts. No synthetic
24/21 rerun, E nine-case rerun, full/420, provider CI, product manual intake,
private authority/admission or production execution was performed.

## Review handoff and STOP

Root should give E/C the exact code commit, final report/freeze and raw bytes.
Review the SQL privilege algebra, no-membership rule, column layout policy,
unchanged lifecycle/guard callers and native fixture preconditions/restoration.
Future acceptance must be independently recorded; D cannot approve this code.
HOLD, admission veto and sole old-site schema publisher remain unchanged.
4198 Captain preview files/process unchanged; final HTTP check returned200.
No push, PR, merge, dispatch, deploy, production mutation, new authority origin,
new writer or gate/status edit. Completed bounded candidate; STOP, no waiting.
