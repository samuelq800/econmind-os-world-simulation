# C — PR132 workflow context repair

Date: 2026-10-10, Asia/Shanghai. Status: `IMPLEMENTED_UNVERIFIED`.
This is a minimal implementation delta awaiting D independent review, not
self-approval, provider-CI success, merge permission or Gate B authority.

## Fixed source and scope

- Base PR132 head: `5a2d7a0ca0baf92bd2843e818a6f1ab5d5c1d6cc`.
- Base tree: `545d0e0991481045531cc7e803d73068e43d9728`.
- Isolated branch: `codex/c-pr132-ci-context-fix-20261010`.
- Worktree: `/Users/samuel/Documents/econclub/.econmind-worktrees/c-pr132-ci-context-fix-20261010`.
- Code commit: `0dda3da62ee11a983ab5ccd657f1ab5d7767d7cd`.
- Code tree: `006c2013a0c06093973724e01a0da06b8b5100c5`.
- Code changes: only `.github/workflows/start-ready-candidate.yml` and
  `tests/support/start-ready-candidate-ci.test.mjs`, 24 insertions/1 deletion.
- The subsequent report commit adds only this file. Final tip/tree and report
  SHA256 are recorded in the outer handoff to avoid recursive self-reference.

The Root checkout is shared with other work. Its three untracked B documents
were not copied, staged or edited. A later concurrent tracked WINDOW_CLOSURE.md
change was observed there and left untouched. This candidate was made directly
from the immutable PR head, never from that dirty working tree.

## Confirmed original failure, not PENDING or success

[Original run 38050960530](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/38050960530)
was independently read through GitHub API and `gh run view`:

```json
{
  "event": "push",
  "status": "completed",
  "conclusion": "failure",
  "head_sha": "5a2d7a0ca0baf92bd2843e818a6f1ab5d5c1d6cc",
  "path": ".github/workflows/start-ready-candidate.yml",
  "check_suite_id": 103099775241,
  "jobs": [],
  "latest_check_runs_count": 0
}
```

`gh run view` reports that this run likely failed because of a workflow file
issue. There are no job logs to download: validation failed before jobs existed.
The push event is retained as observed metadata; it is not an authorized new
push trigger in this workflow. No rerun or dispatch was attempted.

The prior C snapshot used `statusCheckRollup=[]` plus a pull_request-event run
query. That did not expose this push-event workflow validation failure. Empty
checks mean no check-run evidence, not proof of no failed workflow. The previous
PENDING-only conclusion is corrected by the failure above.

The prior B source-only review ran YAML/bash syntax and ten pure assertions but
did not run actionlint or validate GitHub context availability. It therefore
missed a source-visible platform-expression error. Its approval is not evidence
that this workflow can start on GitHub. Original reports and failures remain
unchanged; this new delta requires independent D review and later actual CI.

## Exact cause and minimal correction

Original line62 evaluated `${{ runner.temp }}` inside `jobs.combined-candidate.env`.
[GitHub's context-availability table](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#context-availability)
does not allow `runner` in job-level `env`. This is a platform expression error,
not malformed YAML or invalid bash.

Actionlint v1.7.12 independently reproduced the original error, exit1:

```text
.github/workflows/start-ready-candidate.yml:62:34: context "runner" is not allowed here. available contexts are "github", "inputs", "matrix", "needs", "secrets", "strategy", "vars". see https://docs.github.com/en/actions/learn-github-actions/contexts#context-availability for more details [expression]
62 |       CI_EVIDENCE_DIRECTORY: ${{ runner.temp }}/start-ready-candidate
```

The fix removes only that job-level assignment. A first bash step now expands
the runner's `$RUNNER_TEMP` and writes the same absolute
`start-ready-candidate` path into `$GITHUB_ENV`. The
[documented environment-file mechanism](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands#setting-an-environment-variable)
makes it available to subsequent steps, including initialize and always-upload.
The helper's absolute-path requirement is unchanged. The setup precedes checkout
so the evidence-path variable is not conditional on checkout success. Failure
before any receipt can still fail the job/upload; it is never a PASS receipt.

The new eleventh pure contract checks job env contains only ECONMIND_ENV, rejects
job-level runner expressions, requires the quoted runtime export as the first
step, and retains the upload's env-based path. The exact new job-env assertion
was also checked against immutable original text: original fails, repaired passes.

## Actual bounded validation

Node24.20.0; existing read-only dependency link, no install/build. Actionlint
v1.7.12 was obtained from its official rhysd/actionlint release into an isolated
temporary tool directory, not the repository dependency graph. Archive checksum
matched the official release checksum file:
`aba9ced2dee8d27fecca3dc7feb1a7f9a52caefa1eb46f3271ea66b6e0e6953f`.
The exact command was `actionlint -shellcheck= -pyflakes=
.github/workflows/start-ready-candidate.yml`; optional external shellcheck and
pyflakes integrations were disabled, not claimed as passing. Core actionlint
workflow/schema/expression checks were actually executed.

| Check                                                         | Actual result                                         |
| ------------------------------------------------------------- | ----------------------------------------------------- |
| Original immutable workflow, actionlint1.7.12                 | Expected exit1, exact disallowed runner context above |
| Corrected workflow, same actionlint1.7.12                     | exit0, no diagnostics                                 |
| `node --test tests/support/start-ready-candidate-ci.test.mjs` | 11 PASS / 0 FAIL / 0 SKIP, exit0                      |
| Real focused ESLint on changed test                           | exit0, no diagnostics                                 |
| Node syntax check on changed test                             | exit0                                                 |
| YAML parse, readonly permissions, job env, 15-minute budget   | exit0                                                 |
| `bash -n` on all eight actual run blocks                      | exit0                                                 |
| Actual first bootstrap block with a path containing spaces    | exit0; exact absolute path written through GITHUB_ENV |
| Exact new job-env assertion against original/repaired text    | original rejected, repaired accepted; control exit0   |
| Prettier on workflow/test and final report                    | exit0                                                 |
| `git diff --check`                                            | exit0                                                 |

The runtime bootstrap control executed only the exact printf block in a
credential-free environment with RUNNER_TEMP/GITHUB_ENV pointing to a private
temporary fixture. It did not execute CI helpers, compiler, service or database.
Local pure controls are not actual GitHub service execution. No provider
success is inferred from actionlint exit0.

## Preserved contracts and stopping point

No CI helper code, required input list, four strict configs/flags, D seven-case
native acceptance, DB guard/fixture, F native/provenance behavior, whole-check
workflow, runtime implementation, package/lock, schema, status or gate changed.
Triggers remain filtered pull_request and input-free workflow_dispatch. Only
contents:read; credentials not persisted; no secrets, environment, production
DSN, deployment or second full entry. One frozen install, two required dependency
builds and the existing 15-minute budget remain. Evidence stays runner-local.

Four strict runs, D7 native, F2 native, full/native/420, dispatch and new GitHub
run are all NOT_RUN in this repair turn. F's original generation-specific limits
and the distinction between old provenance-limited and later repaired runs are
unchanged. Original failed runs are not overwritten or relabeled.

Root should hand this exact delta to D. Only after independent disposition may
Root decide normal PR132 integration/push and actual CI. C performed no push,
PR update, merge, bypass, deploy, production access or status mutation. STOP.
