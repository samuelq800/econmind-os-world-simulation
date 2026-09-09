# World Core Post-Gate Reconciliation Checklist

## Trigger

Run this sequence only from the recorded Gate A `PASSED`
`PROJECT_OWNER_ACCEPTANCE` bound to the immutable remediation candidate and
evidence. A test bundle or green CI alone is not the trigger.

## Exact sequence

1. Fetch without changing either reviewed branch. Record remote `main`,
   `codex/gate-a-targeted-fixes`, code-candidate, evidence and acceptance
   commits as full SHAs.
2. Verify the acceptance names the exact code candidate
   `47fe5c5d465748370d9a8ea046bc443978437203`, the evidence branch state it
   reviewed and all seven targeted findings. If the branch advanced, reconcile
   the acceptance to the new immutable tip; never infer it.
3. Verify the approved remediation branch contains Foundation base
   `1a950a41567900761d4f4313092ab4a3404e6f67`, has no unrelated code, and that
   its full pinned matrix/governance/diff evidence is valid.
4. Under separate merge authority, integrate the approved Foundation
   remediation into `main` by the repository's normal non-force workflow.
5. On updated `main`, record Gate A pass and V02.1-V05.3 promotions only through
   the scoped governance-valid owner-acceptance mechanism. Re-run governance;
   do not let the merge commit itself authenticate acceptance.
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
9. Obtain owner approval for ADR-01/03. Keep the batch draft inactive while the
   normal per-step lifecycle is used.
10. Run every item in `docs/exec-plans/V06_EXECUTION_PREFLIGHT.md` against the
    resulting immutable `main`.
11. Only when every item is YES, create
    `codex/world-core-v06-v10` from that exact `main`, record the branch base,
    and begin V06.1. Planning reconciliation into main does not bypass the
    preflight or ADR gate.

## Abort conditions

Stop on an absent/ambiguous acceptance, SHA mismatch, failed mandatory check,
unauthorized merge, planning code contamination, unapproved Group A ADR,
unsafe environment, production credential/target, or any need to touch V11.
