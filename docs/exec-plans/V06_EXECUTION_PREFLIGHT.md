# V06 Execution Preflight

Complete this checklist from repository evidence after Gate A approval. Until
every result is `YES`, V06 remains `NOT_STARTED`.

| Check                         | YES only when                                                                                                                                                    | Evidence to record                            |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Gate A approved?              | Policy-valid decision is `PASSED`, names the exact remediation code/evidence commits, preserves prior findings and records its authority truthfully.             | Acceptance path, commit, bound SHAs, decision |
| Approved Foundation merged?   | Current `main` contains the approved remediation and no later unreviewed Foundation code; merge was separately authorized.                                       | `main` SHA and ancestry output                |
| Foundation status valid?      | V02.1-V05.3 are `VERIFIED` through the scoped Gate A project-owner acceptance and governance passes.                                                             | status/decision paths and validator output    |
| Planning reconciled?          | World Core planning commits are rebased/cherry-picked onto approved `main`; diff contains only allowed planning/control files.                                   | planning SHAs and scope audit                 |
| Required V06 ADRs approved?   | ADR-01 and ADR-03 have responsible-human approval records containing the exact V06 rule.                                                                         | decision IDs/records                          |
| Continuation policy resolved? | Normal per-step lifecycle is selected, or a separately owner-approved batch record is active. The draft alone is inert and is not required for normal execution. | selected lifecycle and policy status          |
| Environment check green?      | Canonical fail-closed policy passes for the intended non-production environment; unsafe aliases/credentials fail before any child or persistence init.           | command, sanitized env class, exit codes      |
| Foundation full tests green?  | Pinned install/check, property, architecture, migration, governance and diff checks pass on current `main`; no protected skip/todo.                              | commands, versions, counts, exits             |
| Correct execution branch?     | `codex/world-core-v06-v10` is newly created from that exact `main` and is not ahead with unrelated changes.                                                      | branch/base SHA and ancestry                  |
| V06 plan inherits repairs?    | V06 plan uses exact-or-reject/oracle rules, AST ownership enforcement and validated startup; it does not remodel Foundation.                                     | plan/prompt commit and links                  |

## Read-only/preparation command template

Adapt path variables explicitly; do not substitute an unverified SHA:

```bash
git fetch --all --prune
git rev-parse origin/main origin/codex/gate-a-targeted-fixes
approved_remediation_sha=REPLACE_WITH_VERIFIED_FULL_SHA
git merge-base --is-ancestor "$approved_remediation_sha" origin/main
git log --oneline --decorate --graph --max-count=30 origin/main
git diff --name-status origin/main...codex/world-core-planning
python3 tools/validate_r2_governance.py --json
pnpm env:check
pnpm check
git diff --check
```

The pinned Node/pnpm versions and environment values come from repository
authority at execution time. No preflight command may contact or mutate the
production database.

## GO condition

```text
ALL TEN CHECKS = YES
V06 MAY START
```

Otherwise record the first exact blocker and keep V06 `NOT_STARTED`.
