# Gate B current evidence and remaining route

**Snapshot:** 2026-09-24. **Decision:** `GATE_B_WORLD_CORE_HARD_GATE = PENDING`.
This is a factual integration index, not a change to `status/progress.json`,
an independent review, or permission to use production Supabase.

## What is integrated

- `origin/main` reached `a6d500e2181567000fdb4e12b445074980c66419`
  before this documentation/diagnostic-workflow update. It includes the
  V09 cleanup checkpoint diagnostic (`462286a`), V27.2 closure preparation,
  remediated V27.3 NPC-intent preparation, remediated V27.1-to-V27.2
  provenance adapter, and an opt-in local authorized-read UI. These are code
  slices, not formal completion of V09, V10, V25, V27, or Gate B.
- The [hard-property matrix](V09_V10_HARD_PROPERTY_MATRIX.md) maps all 14
  properties to test surfaces. Its frozen candidate and exact-SHA Actions
  run `35864766026` passed the official `pnpm check` and disposable
  PostgreSQL V09/V10 suites. This evidence is not automatically transferable
  to a later code SHA.
- The later disposable fault-evidence run `35938884232` showed pre-commit
  connection-loss and acknowledgement/durable-marker assertions passing,
  then `CLEANUP_MARKED_BOUNDARY=FAIL`, `cleanup.status=CLEANUP_INCOMPLETE`,
  overall `FAIL_CLOSED`; receipt recovery and dedicated staging/TLS were not
  run in that attempt. The redacted-checkpoint run
  [35943102063](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/35943102063)
  at exact main SHA `9c74fb2ac055c3c9134267ea372aeeca6a932c8f` again ended
  `FAIL_CLOSED`. Its durable JSON identifies the first cleanup failure as
  `CLEANUP_ASSERT_NO_EXTERNAL_DEPENDENTS`, `error_kind=ASSERTION`, with no SQL
  error code. A separate read-only disposable dependency-class summary is
  being prepared; no cleanup invariant has been relaxed.

## Still required for Gate B

| Evidence                                                                    | Current classification                  | Next action                                                                                                                                   |
| --------------------------------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Disposable cleanup and no-residue fault evidence on one frozen candidate    | `FAIL` on the last run                  | Identify the external dependency class in disposable CI, make one narrow fix if justified, then rerun against a fixed SHA.                    |
| Dedicated isolated staging connection-loss/TLS recovery                     | Historical `FAIL`, no valid replacement | Use an approved dedicated non-production target or record an explicit owner decision on an alternative; disposable CI is not TLS equivalence. |
| Non-production RLS/grant negative vectors                                   | `NOT_RUN` as Gate B evidence            | Execute with real scoped roles and immutable evidence on a non-production target.                                                             |
| Two-country/two-Office browser command, receipt, projection and refresh E2E | `NOT_RUN`                               | Finish the real authenticated API/worker/browser route; the default page is still fixture-backed.                                             |
| Final candidate-wide `pnpm check` and independent Gate B review             | `NOT_RUN` for the eventual final SHA    | Freeze one tip after fixes, run checks once, provide all failures and boundaries to independent review.                                       |

Do not mark Gate B passed because a diagnostic becomes more precise, because
a disposable-only run turns green, or because a preparation branch was
cherry-picked to main. Preserve `FAIL` and `NOT_RUN` until their required
evidence or an explicit authorized decision changes them.

## Documentation and governance drift

`status/progress.json` remains the formal R2 ledger at V09.1 `PLANNED` and
still names an ADR-18 decision as a blocker, although `status/decisions.json`
and `docs/architecture/decisions/ADR-18.md` record ADR-18 as approved.
This mismatch needs a separate reviewed status reconciliation; it does not
justify self-promoting V09 or Gate B. The current V28.1 prompt/ADR-14 still
describes two orchestrators, while the owner has chosen one World/Core path;
the single-World branch is preparation only pending that governance update.
