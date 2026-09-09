# World Core Post-Gate Reconciliation Checklist

## Trigger

Do not run this sequence unless a fresh independent targeted review reports
zero BLOCKER and zero MAJOR and explicitly `APPROVED` the immutable remediation
candidate. A test bundle, green CI or `READY_FOR_REVIEW` is not the trigger.

## Exact sequence

1. Fetch without changing either reviewed branch. Record remote `main`,
   `codex/gate-a-targeted-fixes`, code-candidate, evidence and independent-review
   commits as full SHAs.
2. Verify the approval names the exact code candidate
   `47fe5c5d465748370d9a8ea046bc443978437203`, the evidence branch state it
   reviewed, all seven targeted findings, and zero BLOCKER/MAJOR. If the branch
   advanced, reconcile the approval to the new immutable tip; never infer it.
3. Verify the approved remediation branch contains Foundation base
   `1a950a41567900761d4f4313092ab4a3404e6f67`, has no unrelated code, and that
   its full pinned matrix/governance/diff evidence is valid.
4. Under separate merge authority, integrate the approved Foundation
   remediation into `main` by the repository's normal non-force workflow.
5. On updated `main`, record Gate A pass and V02.1-V05.3 promotions only through
   the governance-valid independent-review mechanism. Re-run governance; do not
   let the merge commit itself authenticate approval.
6. Rebase or cherry-pick the planning-only commit series from
   `codex/world-core-planning` onto that approved `main`. Preserve the original
   planning commits for audit. Resolve only real planning/control conflicts;
   never use a planning conflict to overwrite repaired Foundation runtime,
   core, migration, test or status files.
7. Audit the reconciled planning diff against approved `main`. Allowed paths
   are the named World Core files under `docs/**` and
   `prompts/control/WORLD_CORE_SPRINT_V06_V10_4.md`; any runtime/schema/status
   delta is isolated and reported before continuing.
8. Validate formatting, JSON, governance and diff hygiene. Confirm the batch
   policy remains `DRAFT_NOT_ACTIVE` and no status references it.
9. Obtain owner approval for ADR-01/03 and for the narrow batch-candidate patch;
   activate that policy through a separate reviewed governance change.
10. Run every item in `docs/exec-plans/V06_EXECUTION_PREFLIGHT.md` against the
    resulting immutable `main`.
11. Only when every item is YES, create
    `codex/world-core-v06-v10` from that exact `main`, record the branch base,
    and begin V06.1. Do not merge the planning branch itself into main as a way
    to bypass steps 4-10.

## Abort conditions

Stop on an absent/ambiguous approval, SHA mismatch, nonzero BLOCKER/MAJOR,
failed mandatory check, unauthorized merge, planning code contamination,
unapproved Group A ADR, inactive batch policy, unsafe environment, production
credential/target, or any need to touch V11.
