# ADR-18 governance expectation forward fix

Date: 2026-10-06 (Asia/Shanghai).
Base: `1b85fa2594229db2fe9c303a2f7e1e04ee60948a`.
Branch: `codex/v01-adr18-governance-fix`.
Status: `IMPLEMENTED_UNVERIFIED`; Root acceptance/review remains separate.

## Scope and cause

This is a test-only governance alignment plus this report. The existing
`tests/architecture/v01-governance.test.ts` still expected
`ADR-18 before V09.1 real persistence/concurrency evidence` after PR75
(`a6951f298096ed055d76165f01fa283d246afaa7`, source `c08dd38`) reconciled three
descriptive fields in `status/progress.json`. The old test expression treated
an already approved isolation decision as pending. The test file is unchanged
between PR75 main and this PR76 main baseline; this is not a new Worker/API/UI
defect or a reason to reopen the immutable PR76 candidate.

Repository sources read: current decision register; the complete ADR-18 owner
record; PR75 progress diff and reconciliation report; current progress and Gate B
evidence snapshot. ADR-18 is APPROVED for disposable local/CI and isolated
staging, not production access/publication/cutover/mutation. Its approval does
not satisfy the remaining preflight/runtime evidence or approve economic rules.

## Fix and preserved boundaries

The current-gate assertion now matches all eight existing fields exactly,
including `PENDING_ISOLATED_V09_PREFLIGHT` and the reconciled blocker text.
`toMatchObject` becomes stricter `toEqual`, rather than dropping the failed check.
Additional assertions bind ADR-18 to its real approval record and isolation-only
scope, V09.1–V09.3/V10.4 to PLANNED, all 11 unapproved decisions to
PROPOSED_NOT_APPROVED with null approval records, and ADR-09 specifically to its
human approval requirement. The existing Gate B snapshot must still say PENDING.
No case is skipped/deleted; the test count remains 11.

Unchanged: current/next V09.1, next_step_ready=false,
historical required_gate=V09.1_ADR_18_DECISION, gate_status=PENDING;
all 101 step states (27 VERIFIED / 74 PLANNED), decisions/approval records and
economic rules. No UI, API, Worker, Core, migration, schema, permissions,
environment, clocks, Command/Event/receipt/Posting or production behavior changes.
This patch does not promote or close Gate B or any World Core package.

## Actual evidence

Pinned Node 24.20.0 / pnpm 12.3.4, frozen offline lockfile install; no database.

| Command / check | Baseline | Forward fix |
| --- | --- | --- |
| `pnpm exec vitest run tests/architecture/v01-governance.test.ts` | FAIL, exit 1; 10 PASS / 1 stale expectation FAIL | PASS, exit 0; 11/11 |
| `python3 tools/validate_r2_governance.py --json` | PASS, exit 0; 14/14 | PASS, exit 0; 14/14 |
| Scoped ESLint | PASS, exit 0 | PASS, exit 0 |
| Scoped formatting and `git diff --check` | Not part of failure reproduction | PASS, exit 0 |
| Diff against baseline for runtime, status, requirements, planning, migration, tooling and lockfile roots | Read-only identity check | Unchanged, exit 0 |

The validator explicitly reports R2_GOVERNANCE_READ_ONLY,
application_code_executed=false and database_access=false. These PASS results
are only governance checks, not formal application, browser, native PostgreSQL,
staging, least-privilege, production or Gate B acceptance. Those broader surfaces
are NOT_RUN in this task. The historical baseline FAIL remains recorded here.

Fixed implementation SHA and report are bound by the resulting PR/head metadata;
Root owns acceptance/merge. Deliver the two-file candidate and STOP. No new
approval, runtime execution, extra database or full-suite run is authorized.
