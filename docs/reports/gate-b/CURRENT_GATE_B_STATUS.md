# Gate B current evidence and remaining route

**Snapshot:** 2026-09-24. **Decision:** `GATE_B_WORLD_CORE_HARD_GATE = PENDING`.
This is a factual integration index, not a change to `status/progress.json`,
an independent review, or permission to use production Supabase.

## What is integrated

- `origin/main` reached `100524506b4fbf505b01b035b02ee6fbf0eb97cf` before
  this status-note update. The frozen
  Gate B code/CI candidate remains `ca5b056ea818dc73e113a2bf4635318ae7c8bebf`.
  Main includes the V09 cleanup fix and
  checkpoint diagnostic (`462286a`), V27.2 closure preparation,
  remediated V27.3 NPC-intent preparation, remediated V27.1-to-V27.2
  provenance adapter, and an opt-in local authorized-read UI. These are code
  slices, not formal completion of V09, V10, V25, V27, or Gate B.
- Later main commits add a V29 test-only two-country ledger/replay harness and
  V30 virtual load plan plus bounded injected runner. These P2 preparations
  are not a real 70-country World run, measured load or later-SHA Gate B check.
- The [hard-property matrix](V09_V10_HARD_PROPERTY_MATRIX.md) maps all 14
  properties to test surfaces. Its frozen candidate and exact-SHA Actions
  run `35864766026` passed the official `pnpm check` and disposable
  PostgreSQL V09/V10 suites. This evidence is not automatically transferable
  to a later code SHA.
- The later disposable fault-evidence run `35938884232` ended `FAIL_CLOSED`
  at cleanup. Run
  [35943102063](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/35943102063)
  identified `CLEANUP_ASSERT_NO_EXTERNAL_DEPENDENTS`; a fixed-branch probe
  [35944500181](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/35944500181)
  established that the aggregate returned one row but its PostgreSQL array
  was delivered as a JavaScript string. Post-rollback catalog summaries found
  no external user namespace. The reviewed forward fix keeps the identical
  external-dependency CTE and accepts only an integer count of zero; positive,
  missing or non-integer results still fail closed before any `DROP`.
- The fixed candidate `d738362b275956f2a338a2c6cba4bde50b6e9f23`
  passed [run 35946009374](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/35946009374)
  on disposable PostgreSQL 16: durable runner `PASS`, cleanup `PASS`,
  connection-loss and lost-acknowledgement `PASS`, and separate lease,
  authorization-cutoff, PostgreSQL receipt-recovery, V10.4 and recovery
  preparation test steps `PASS`. V10.4 reported 34 passing tests and one
  intentionally skipped process-kill child branch. The durable JSON was
  written before the separate receipt test step, so its
  `receipt_recovery.status=NOT_RUN` remains true for that JSON; the CI step is
  separate evidence. B independently reviewed the code diff with P0=0 and
  Major=0 for non-production merge, not Gate B approval.
- On the later `ae39e3c` main candidate, combined
  [run 35948171185](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/35948171185)
  passed the disposable PostgreSQL job but **failed** official `pnpm check`:
  the existing V00.2 repeated-signal harness attempted its second signal
  after the runtime had already exited (`ESRCH`). This is a CI failure, not
  a green final-candidate check. A test-only close-callback fixture on branch
  `codex/gate-b-code-integration` preserves the original one-start,
  one-completion and 150 ms survival assertions; its focused eight cases
  passed locally. The exact `ca5b056` candidate then passed both jobs in
  [run 35950584759](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/35950584759):
  official unmodified `pnpm check` and disposable PostgreSQL V09/V10 evidence.
  This does not replace dedicated staging or the final Gate B review.

## Still required for Gate B

| Evidence                                                                    | Current classification                      | Next action                                                                                                                                     |
| --------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Disposable cleanup and no-residue fault evidence on one frozen candidate    | `EVIDENCED` on `ca5b056`                    | Preserve the exact run/artifact; do not substitute it for staging TLS.                                                                          |
| Dedicated isolated staging connection-loss/TLS recovery                     | Historical `FAIL`, no valid replacement     | Use an approved dedicated non-production target or record an explicit owner decision on an alternative; disposable CI is not TLS equivalence.   |
| Non-production RLS/grant negative vectors                                   | `NOT_RUN` as Gate B evidence                | Execute with real scoped roles and immutable evidence on a non-production target.                                                               |
| Two-country/two-Office browser command, receipt, projection and refresh E2E | `NOT_RUN`                                   | Finish the real authenticated API/worker/browser route; the default page is still fixture-backed.                                               |
| Candidate-wide `pnpm check` and independent Gate B review                   | `PASS` at `ca5b056`; final review `NOT_RUN` | The code candidate is green; after external evidence, freeze a final tip and give its exact SHA, failures and boundaries to independent review. |

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
