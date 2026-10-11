# B narrow review: C bootstrap diagnostics/cleanup

Disposition: CHANGES_REQUIRED_LOCAL.
Recommendation/workflow: revise / revise.
One local P2 finding, C-DIAG-01. Do not integrate this diagnostic candidate as approved yet.
CI_CAUSE=OPEN. This finding is not an explanation of historical CI failures.

## Immutable identity

- Base: 5dca519927fbc3915a5459be77e0779dc14a5072
- Tip: 88c74977abef22039bb7adde11215beca92054a6
- Tree: bdcd8180091c487e84062bfa7964c88bc047caf1
- Canonical complete diff SHA256: 7e59a0faf5d05182c640c1657466b4d64584f2295e5a95e491d8cf382e2f902f
- Subject: /Users/samuel/Documents/econclub/.econmind-worktrees/c-bootstrap-lifecycle-ci-fix-20261011
- Exactly four files: tests/foundation/bootstrap-lifecycle.test.ts plus C bootstrap-lifecycle DIAGNOSIS.md, FREEZE.md, run-focused.mjs.

Identity matches. Subject clean before/after; no subject file edited.

## C-DIAG-01 [P2]: Bound output draining independently of process exit and cleanup

At tests/foundation/bootstrap-lifecycle.test.ts:143-148, detection of exit awaits managed.exited without a deadline. That promise now resolves on child close, not exit. An inherited stdout/stderr pipe may remain open in a descendant after the public parent exits. The function cannot return its diagnostic failure or reach caller finally cleanup until close; its nominal 30-second deadline is no longer enforced on this branch. A Vitest timeout does not cancel this pending helper or ensure its finally cleanup runs.

This is grounded in the actual unchanged launcher chain: stack services use stdio inherit, and service build/runtime descendants also inherit stdio.

Independent bounded controls used the exact immutable helper (TypeScript stripped without semantic editing), with captureCommand stubbed solely to avoid shared process-table/signal activity:

- Synthetic parent-exited/open-pipe control: timeout 100ms, still unsettled at 251ms; only explicit close resolution lets it return.
- Real Node parent/descendant control: parent exit code 1 at 47ms; descendant holds inherited stdout and naturally finishes at 473ms. The 100ms helper returns at 473ms, retaining late drained output. No service, network, DB or shared process was started/signaled.
- A descendant that never closes the pipe makes this await indefinite. The real control deliberately self-terminates; no unbounded test was run.

The same ordering flaw exists in run-focused.mjs:94-110. Its 150-second deadline sends only SIGTERM; the wrapper awaits close before reaching SIGKILL fallback and writing process evidence. If an owned descendant retains the pipe and survives TERM, fallback/evidence are unreachable. Merely adding a timeout to the inner test is insufficient.

Required local revision:

1. Separate parent exit observation from stream close/drain, and bound drain waiting using the remaining deadline or explicit finite grace.
2. Ensure owned cleanup/escalation and evidence finalization are reachable even when close never arrives. Escalation must not depend on close.
3. Preserve original nonzero exit/failure, available output and any drain/cleanup timeout together; do not turn failed startup into success or lose the original failure.
4. Add an ordinary bounded regression: exited parent with descendant retaining output, plus wrapper escalation/finalization control. Retain a normal fast-exit/fully-drained control. No original acceptance timeout increases, blanket retries or skip.
5. Re-freeze the minimal delta for independent closure before the one instrumented fixed-head full CI.

## Other focused observations

The original 12 instantiated cases' acceptance assertions remain intact in the full diff: READY once, nonzero crash, zero READY in TOCTOU, FAILED/cleanup_forced truth, ports and negative controls. No original timeout increase or new skip. The TOCTOU commit delay remains 500ms. Extra ps polling may affect whether the window is reached under load, but cannot convert a missed window into PASS because zero READY/nonzero exit remain required.

PID/start-time matching improves the old PID-only cleanup filter. captureCommand traverses descendants from the public child and checks child liveness before observation. The wrapper additionally compares command text. No process-name/global kill is added. These are sampled observations with second-resolution start strings, not a claim of race-free identity or detection of all short-lived descendants; no speculative PID-reuse finding is raised.

C-style macOS and Linux-procps lstart formats, including a single-digit day, passed parser controls. Native Linux and arbitrary locales were not executed. Production trees, launchers, control fixture and the previously approved manual-rowCount file are unchanged (quiet diff exit 0). Prior A/D/manual reviews are reused, not reopened.

Cleanup now confirms exit after SIGKILL; if live rows remain it fails instead of claiming success. Finally-cleanup errors should be retained alongside the original diagnostic error when implementing the bounded drain fix.

## Evidence and limits

Independent: exact diff/tree/four-file binding; git diff --check; unchanged owned/product paths; original raw log hash; two bounded exact-helper controls; two parser-format controls. All reviewer code ran env -i, without credentials, OS network denied, writes confined to managed temporary storage. Actual generated JSON and reviewer sources are retained beside this report.

- bounded-controls.json SHA256 74278ad8e49f77e93212e6cb4728dc46382f50cf459b9782cd822cfcc1a7d610
- real-close-control.json SHA256 4124a254900de86d9eafeb1a193d198e0a818dfe4903d277510b2cf2301b19de
- exact-waitForOutput.ts SHA256 8f7deb8ac67d45de4ab65f03dd7a507a610e255aab34d8ca43b5d94adde01442
- assessment.json SHA256 3921f45afc5969032023cae12257a789c6aa67ba99abd0a153f27776bc3d0c85
- Assessment validator: exit 0.

The original official log remains hash b57f844c512fd6c520e4aaff93f7a5dee17e0af93e51ce8d64635df34bd5ba92. Historical run 38126263727 remains 3351 PASS / 2 FAIL / 258 SKIP as recorded; exact CI cause is UNRESOLVED. No assertion that this new local finding caused those failures.

Producer 14/0/0 and expected 0/1/13 evidence remain producer evidence, not independent fresh executions. Full lifecycle, complete CI, native Linux, production, DB and Clock were NOT_RUN here. A concrete local defect makes redundant broad execution unnecessary for this decision.

Risk: impact moderate (local CI/process-cleanup harness), likelihood high due to demonstrated deadline failure, protection partial, recoverability easy, confidence high for this finding. Status-quo risk moderate because diagnostics are genuinely deficient; fix the bounded diagnostic design rather than abandoning the objective. No automatic or normal merge recommendation yet.

The immutable patch-assessment skill constrained scope, isolated controls and retained evidence. No product changes, peer implementation, merge/deploy/Clock or activation performed. STOP.
