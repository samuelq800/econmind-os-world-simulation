# D independent PR132 CI context delta review

Date: 2026-10-10, Asia/Shanghai. Reviewer D; implementation owner C.
Disposition: **APPROVED — exact three-file source delta only, for Root-controlled composition**.
Skill recommendation: `merge`; workflow label: `human_review_required`.
This is advisory source approval, not an instruction or authority to merge, push,
dispatch, deploy, approve a package, pass Gate B, activate a World or adopt an opening.
No blockers or majors found in this bounded delta.

## Immutable identity

- Repository: https://github.com/samuelq800/econmind-os-world-simulation
- Subject: `/Users/samuel/Documents/econclub/.econmind-worktrees/c-pr132-ci-context-fix-20261010`.
- Base: `5a2d7a0ca0baf92bd2843e818a6f1ab5d5c1d6cc`.
- Head: `1d6d3355846c8db7d56fe04625177dbf21fb4527`.
- Tree: `4d30671c2d3517c1741c1a4e6a252aed1c75bd31`.
- Code commit: `0dda3da62ee11a983ab5ccd657f1ab5d7767d7cd`.
- Exact binary/no-color/no-ext-diff range SHA256:
  `13b56be83630f3f71bc5cb3182478306a92c3e55ce8da3efb55aae2dba92fea6`.
- C report SHA256: `dca1f1cd0e23b8ed849c6625421bff7308df6f81d2627073da21767d1cd36d37`.
- Subject clean before and after review; head/tree unchanged.
- Only files: workflow, pure CI contract test, C report. 160 insertions, 1 deletion.

File hashes:

| File                                                                | SHA256                                                           |
| ------------------------------------------------------------------- | ---------------------------------------------------------------- |
| .github/workflows/start-ready-candidate.yml                         | dad1b97efffd74c82b797fcff2478164ef6d641a6a1c3c7dd0cc7518563c92dd |
| tests/support/start-ready-candidate-ci.test.mjs                     | af361b70db327155437e333c7d80f1cf8fe9bf4ad339c09e3c3f60723fbd1c75 |
| tests/support/start-ready-candidate-ci.mjs, unchanged base and head | 217bc8198572e4ba7bd78a16ca977a6ef84fce19ca339b3432dfc5766afb2238 |

## Original failure remains a failure

I independently read the existing GitHub run and its jobs through read-only API.
[Run 38050960530](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/38050960530)
is completed / failure, event push, head equal to the supplied base, workflow path
`.github/workflows/start-ready-candidate.yml`, check suite 103099775241,
jobs total_count=0 and jobs=[].
I did not rerun, dispatch or inspect/poll for a replacement run.

The exact base workflow independently fails actionlint1.7.12 exit1 at line62:
runner context is not allowed in job-level env. Repaired tip exits0.
This and the official contract establish the repair mechanism; no job logs exist
to infer an executed-job failure. A previous YAML/bash-only review was insufficient
to detect this platform expression issue. Its original report and failed run
remain unchanged; this review does not retroactively upgrade them.

## Semantic delta and supported contract

The old job-level `CI_EVIDENCE_DIRECTORY: runner.temp` expression is removed.
A first explicit bash step appends one quoted runtime `RUNNER_TEMP` path to
`GITHUB_ENV`, before checkout. All later workflow steps are otherwise byte-identical.
The independent oracle reconstructs the repaired workflow from the base using
only those two exact substitutions, then asserts complete byte equality.

[GitHub context availability](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#context-availability)
excludes runner from job env, while env is supported in step with fields.
[GitHub environment files](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands#setting-an-environment-variable)
make an export available to subsequent job steps, not the producing step.
[GitHub default variables](https://docs.github.com/en/actions/reference/workflows-and-actions/variables)
define RUNNER_TEMP as runner-local temporary storage.
These contracts support the changed initialization and later upload path.
No untrusted PR text or dispatch input is interpreted as a path or shell program.
The newline-free runner-owned path contract is not generalized to arbitrary input.

### Boundary challenges

1. Platform validation: illegal base context is rejected; repaired workflow passes
   independent actionlint. Optional shellcheck/pyflakes integrations were disabled,
   not claimed as passing.
2. Shell/path handling: actual bootstrap executed with a path containing spaces,
   percent and literal dollar characters; exact env-file bytes matched. A separate
   child received the parsed variable unchanged. No shell sourcing/eval was used.
   Unwritable env-file parent produced exit1, not successful setup.
3. Failure and evidence: actual unchanged helper initialize ran in a disposable
   missing-input fixture with the F config removed and committed. It returned
   exit1 with `inputsStatus=FAIL` and that exact missing input.
   The unchanged finalize run with failed inputs/skipped later outcomes returned
   exit1 and `FAIL_OR_NOT_RUN`; four strict statuses, D and F stayed NOT_RUN;
   productionAccess/gatePromotion remained false.
   This is a negative oracle fixture, never candidate CI success.
4. Finalize/upload remain `if: always()`; upload still uses
   `env.CI_EVIDENCE_DIRECTORY` and errors when no files exist.
   Env-file propagation is independent of later inputs/install/build outcome.
   If setup/checkout fails before usable source or receipt, finalization may fail
   and there may be no receipt; that cannot become a PASS. Timeout/cancellation
   can still prevent artifact retention; no unconditional retention guarantee is made.

## Independent local evidence

Subject-controlled code ran in an isolated shared-object clone at exact tip,
with credentials absent, network denied by macOS sandbox-exec, and file writes
restricted to the tool-returned disposable workspace (plus /dev/null).
The clone alone was later changed for the missing-input negative fixture;
the source helper bytes stayed exact. No subject checkout file was written.

- Node24.20.0 `node --test tests/support/start-ready-candidate-ci.test.mjs`:
  11 PASS, 0 FAIL, 0 SKIP, exit0, run at exact candidate tip before fixture changes.
- actionlint1.7.12: base expected exit1 with exact context diagnostic; tip exit0.
- Eight actual bash run blocks: `bash -n`, all exit0.
- Bootstrap spaced/metacharacter path: exit0 and exact bytes.
- Separate-process env-file propagation model: PASS; not a GitHub runner execution.
- Bootstrap env-file write failure: expected exit1.
- Actual missing-input initialize and always-finalize helper negative control:
  expected exit1 / exit1, fail-closed receipt.
- `git diff --check BASE HEAD`: exit0.
- Exact three-file delta, clean subject and unchanged helper verified.
- Reused producer-downloaded actionlint binary is byte-identical to the release
  archive member. Archive SHA256
  `aba9ced2dee8d27fecca3dc7feb1a7f9a52caefa1eb46f3271ea66b6e0e6953f`
  independently matched the live official release checksum endpoint.
  Binary SHA256 `8db11704dc296f096216db4db65d86cd7f0ebfdf4c38453a1da276b137b88388`.
- Structured assessment validator: exit0.
- C's focused lint/format are producer-reported; D did not claim independent
  reruns of them. No dependency install or build was performed.

Retained evidence in this same managed collection:
`candidate.diff`, `original.yml`, `review-oracle.mjs`,
`oracle-result.json`, `review.sb`, `assessment.json`.
Oracle result SHA256:
`67cf78f47ee0db2b5872a28703f2e789bc029d138336ee90716c788ef95fed5e`.
Oracle source SHA256:
`591c9609930c610fdd634af8e0dcd552b74a6c5f0a8a0b493666cb99e2d77fb4`.
Assessment SHA256:
`65dd6855279045a27a2c4784d8f80bcb38ef7a2b797fe9a4642417defe2483ad`.

## Risk, remaining limits and stopping point

Impact if wrong: moderate (bounded CI availability/evidence), not lowered by tests.
Likelihood: low for this narrow delta. Protection: partial, because real GitHub
execution at repaired/composed source remains NOT_RUN. Recovery: easy, isolated
source revert/disable, no schema or persistent economic state. Confidence: moderate.
Human review/root ownership excludes auto-merge. Status-quo risk is the proven
pre-job failure blocking supplemental evidence.

No required input, four strict configs/flags, D seven-case acceptance, F NOT_RUN
and generation/provenance limitations, DB guard, fixture, full-check owner,
15-minute budget, readonly token, no credential persistence, no deploy, one
frozen install/two dependency builds or no-second-full contract changed.
No runtime/API/Core, migration, grants, production config, status/gate or authority
origin changed. Existing HOLD/veto/sole publication chain remain untouched.

Actual repaired/composed-source provider CI, four strict executions, D7/F2 native,
full/native/420 are all NOT_RUN by D. This source-delta approval is not a
substitute. Root alone decides permitted composition/push and later actual CI;
no authorization to bypass any required check or gate is implied.

4198 Captain preview process/files were left untouched; a final HTTP check was200.
Durable-admission design was not started or expanded in this turn. No new agents,
messages to peer chats, push, merge, dispatch, deployment, production access or
World start. Review complete. STOP.
