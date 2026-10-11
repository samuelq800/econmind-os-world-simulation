# B C-DIAG-01 closure review — 2026-10-11

APPROVED_FOR_DIAGNOSTIC_DELTA_ONLY
C-DIAG-01=CLOSED
CI_CAUSE=OPEN

Recommendation: merge; advisory workflow: human_review_required. This applies only to the frozen diagnostic delta, for unchanged integration followed by one instrumented fixed-head complete CI. It does not approve PR136 merge before that CI, claim CI green/root-cause resolution, or authorize Clock/World/production activity.

## Immutable scope

- Rejected parent/base: 88c74977abef22039bb7adde11215beca92054a6
- New tip: 96ea99090f0d399e6c7b6b54aa9d3076cbd7250c
- New tree: 0a5b4af0e2379853594852d11ba70f7922026a2d
- Parent-to-tip canonical diff SHA256: ccbfcfeefb934e3749263a9d6623f23105becad9cea7d31032dbc5f65014184a
- Original base: 5dca519927fbc3915a5459be77e0779dc14a5072
- Original-base-to-tip cumulative canonical diff SHA256: b2571fc4b84b2fe3909cc21362efb75eb2427b85ffe568049989c350374ce919
- Subject: /Users/samuel/Documents/econclub/.econmind-worktrees/c-bootstrap-lifecycle-ci-fix-20261011

Five changed paths relative to rejected parent: lifecycle test; C_DIAG_01_DELTA.md; C_DIAG_01_FREEZE.md; control-output-pipe.mjs; run-focused.mjs under the C bootstrap-lifecycle report directory. Exact identity and both diff hashes match. Subject remained clean, with unchanged head/tree.

Prior A/D/manual reviews are reused, not reopened. Product/runtime/SQL/grants/status/configuration, launchers, original control fixture and manual fixture are unchanged relative to original base. Old C DIAGNOSIS/FREEZE and rejected B report remain untouched.

## Closure rationale

The rejected helper and wrapper awaited pipe close before failure/cleanup. The revision separates parent exit from stream close:

- observeCommand exposes independent exited and closed observations.
- drainBefore races close against the remaining existing deadline.
- waitForOutput no longer awaits the close promise without a bound after observing parent exit.
- waitForExit shares one deadline between parent exit and draining, retaining exit/output on drain failure.
- preserveCleanupFailure retains exact primary and cleanup error objects/messages in AggregateError; cleanup is cause. Caller finally paths preserve both failures.
- Web cleanup attempts independent process/exit/server actions with allSettled and reports errors rather than swallowing them.

Wrapper source reaches cleanup from run-deadline expiry or finite drain-grace expiry without requiring close. It re-observes known live descendants, signals only observed current PID/start-time identities, waits a finite TERM grace, escalates to KILL and confirms observed remaining rows. Finalization records exit, separate timeouts, signals, errors and remaining rows; unresolved local read streams are destroyed and the child handle unrefed. An unknown pipe holder is not granted kill authority.

Normal wrapper bounds remain run 150s, drain 2s, TERM 2s, KILL 250ms; ps calls now have a 1s timeout. Control mode uses smaller run/drain/TERM values through the same branches. No original acceptance timeout increase, retry or skip. PID/start-time sampling remains second-resolution and non-exhaustive, not a race-free OS identity guarantee.

Success requires original exit code zero AND no run/drain/cleanup timeout/errors or initial observed leftovers. Therefore a successful cleanup cannot turn internal exit1 or timeout into wrapper success. Source and hash-verified retained controls support this property.

## Independent execution and evidence

No credentials/network; subject execution was in an exact-head archived copy under OS sandbox with writes confined to managed temporary storage. Only bare reviewer-owned Node controls ran successfully; no local service, DB, Clock or shared process was signaled.

1. Initial six-case Vitest attempt actually returned **1 PASS / 5 FAIL / 14 excluded**, exit1. Five cases were unavailable because sandbox denied setuid /bin/ps, yielding spawn EPERM before the requested runtime property could be observed. Direct sandbox execution of /bin/ps independently reproduced the denial (exit71). A copied non-setuid ps had identical bytes but was terminated (137); this tooling path was stopped, not used to weaken sandboxing. The initial failed execution is preserved in initial-sandbox-results.json and is not relabeled green or attributed to C/CI.
2. Exact immutable helper extraction, TypeScript stripped without semantic edits, captureCommand stubbed solely to avoid process-table access:
   - exited parent with naturally self-terminating descendant holding pipe: 100ms wait returns in **104ms**, close still pending, exit1/output/drain timed-out preserved;
   - fast exit: complete final stdout/stderr and exit1 retained;
   - primary+cleanup: both exact object identities/messages and cleanup cause retained;
   - parent exit deadline: 100ms wait returns failure in **102ms**.
     **4 controls PASS**, runner exit0. This does not prove ownership/cleanup: captureCommand was explicitly stubbed.
3. Exact-head isolated composition Vitest case: **1 PASS / 0 FAIL / 19 excluded**, exit0.
4. Exact-head isolated strict TypeScript, scoped ESLint, five-file Prettier: PASS, exit0.
5. git diff --check: PASS.
6. Original assertion-bearing lines, per-case timeout lines and 500ms TOCTOU delay match rejected parent after removing the six newly added cases. Full source diff confirms original expectations retained.
7. Independently hashed retained producer final log/process record and three wrapper-control process records, plus all three tested source hashes. All match immutable handoff.

Producer evidence remains distinct from independent execution:

| Retained producer record | Original result and cleanup truth                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| Final lifecycle          | 20/0/0 reported; outer exit0, no errors/timeouts/signals, observed remaining 0→0            |
| Held-pipe wrapper        | exit1, drain timeout, observed child TERM→KILL, remaining 1→0                               |
| Fast wrapper             | exit1, no timeout/signals, remaining 0→0                                                    |
| Run-deadline wrapper     | run timeout, original SIGKILL signal result, observed parent/child TERM→KILL, remaining 2→0 |

The six-case live process-table/wrapper execution was not independently completed. It is unavailable in this sandbox, not a fresh 6/6 PASS. Native Linux, full lifecycle and full CI were NOT_RUN. Source tracing plus verified producer records supports narrow diagnostic closure; regression protection remains partial and confidence moderate.

Producer intermediate executions and initial lint FAIL remain recorded; neither they nor the original two full-suite failures were overwritten. Both historical official failures remain unchanged. This local close-ordering fix is not evidence of the historical READY-timeout cause.

## Retained review artifacts

Files beside this report:

- helper-controls.json: b08d86afcc7cb9f3b535a0acf00b4d2759386de675b61ffe2101c24da68aad84
- static-results.json: cae7a762aeb9e5257d857493b00bc3516d06bab2c3a5781474c3529b0d702c4f
- evidence-audit.json: 612485b17a3ca2de8e18b81c8dc8835cf9c648beb6f2304e4d0352bcff2eebbc
- initial-sandbox-results.json: c79f8f7c524f222c7b59aef06fc94906360d34901704afd02e40be006e029ef2
- assessment.json: 9608f6209015ca78b5e22c3548819f56e082021792a8857ed68821afa1473dd3
- exact helper source, control/audit runners and sandbox profile retained.

Assessment validator initially rejected merge with a failed-validation label. Rechecking the EPERM evidence established runtime validation was unavailable, while the command's actual 1/5/14 failure remains unchanged in JSON/prose/raw output. The model classification was corrected to unavailable; recommendation and ratings were not changed. Final validator exit0.

Risk: impact moderate, regression likelihood low, protection partial, recoverability easy, confidence moderate. Status-quo risk moderate: the rejected close-first path can block diagnostics/cleanup indefinitely. No automatic merge. No new actionable finding in this bounded closure review.

The immutable assessment skill constrained target binding, preserved negative evidence and isolated execution. Approval is diagnostic-only. Root may perform unchanged integration and the one instrumented fixed-head complete CI under existing authority; any failing result remains a real gate. No subject changes, merge/deploy, database/production, World Clock or activation performed. STOP.
