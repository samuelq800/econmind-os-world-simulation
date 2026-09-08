# R2 Promotion Mechanism Independent Review

**Decision: CHANGES_REQUIRED. Promotion mechanism is not approved.**

- Reviewed commit: `40e882dc27d0fb41c4d72635cbd029af3ddc79ef`.
- Review date: 2026-09-08, Asia/Shanghai.
- Reviewer: this independent review session; implementation claims and tests were checked against independently constructed fixtures.
- Scope: promotion validator, PLANS, promotion tests, progress, historical independent review evidence, and relevant governance implementation reports. The full 33-package / 101-step substantive review was not reopened.
- Initial HEAD matched the requested commit; the worktree was clean.
- Review only: no real status promotion, merge, commit, push, V00.2 work, application/runtime modification, or database access occurred.

## Findings

### R2-PROMO-01 — MAJOR: committed self-created evidence passes as independent approval

Locations: `tools/validate_r2_governance.py:99–164`, `:224–234`; policy at `PLANS.md:22–29`.

The validator establishes the existence and history of a blob, but never establishes that an independent reviewer authorized it. The Markdown branch recognizes a path pattern, heading, reviewed-commit field, and decision prefix. The JSON branch recognizes a fixed filename and three self-asserted fields. Neither requires a trusted approval record or authenticates its origin. The caller controls both the evidence commit and the selected evidence paths; an ordinary implementation-agent commit can satisfy every check without changing the validator.

Independently reproduced in a temporary clone with Git author explicitly set to `Implementation Agent <implementation@example.invalid>`:

1. Start at the requested target commit, leaving the real validator unchanged.
2. Create and commit `docs/reports/governance/R2_GOVERNANCE_REVIEW_SELF.md` containing only:

```markdown
# R2 Governance Independent Review

- Reviewed HEAD: `40e882dc27d0fb41c4d72635cbd029af3ddc79ef`.

## Final Decision

**APPROVED.**
```

3. In the temporary status fixture, set Governance to `VERIFIED`, decision to `APPROVED`, reviewed_commit to the target, evidence_commit to the new child commit, evidence_paths to that file, and merge_authorized to false.
4. Execute the real validator from the original reviewed repository with `--root <fixture> --json`.

**Observed: exit 0, PASS, Governance VERIFIED. Expected: rejection.** The evidence commit in this run was `60f1abc5a1406111b24250752debc8ecfb714529`; these temporary objects were deleted with their fixtures. No independent review of the target was supplied.

Two additional reproductions returned the same false acceptance:

- Overwrite the allowed legacy JSON filename in a new implementation-agent commit with only `review_scope = INDEPENDENT_R2_GOVERNANCE_RE_REVIEW_ONLY`, `reviewed_commit = <target>`, and `decision = APPROVED`; select only that JSON file as evidence. No Markdown approval is required, and the existing authentic record is not pinned to its original evidence commit/blob.
- Copy the existing V00.1 implementation report into an allowed governance review filename, prepend the accepted independent-review heading and target field, and append an APPROVED Final Decision section. The report is accepted as independent review evidence.

Thus required negative case 9 passes only for the unchanged implementation-report path; it does not establish independence. The existing 20-test suite covers malformed/missing evidence but lacks a committed, syntactically valid self-approval case.

Required correction: establish an approval trust boundary independent of implementation-controlled status and evidence files. For example, use an authenticated independent approval attestation or a protected externally supplied approval record binding the reviewed commit, exact evidence commit, paths/blob identities, decision, and reviewer authority. A filename, heading, Git author string, or another editable `independent=true` field cannot establish that boundary. Preserve historical evidence loading and add rejection tests for all three reproductions.

### R2-PROMO-02 — MAJOR: conflicting final decisions are accepted as APPROVED

Location: `tools/validate_r2_governance.py:126–139`.

The parser requires one Final Decision heading but only matches the beginning of its contents. It does not require a unique decision within that section. A committed review with the correct target and this section returned **exit 0 / PASS**:

```markdown
## Final Decision

**APPROVED.**

**CHANGES_REQUIRED.** Approval withdrawn; do not promote.
```

Expected: rejection as ambiguous/non-approved evidence. This is distinct from reviewer authentication: even a review from an authenticated source must have an unambiguous effective decision. The fixture proves that the current prefix parser silently ignores an explicit conflicting withdrawal in the same section.

Required correction: define and enforce one authoritative, complete decision field, reject conflicting/duplicate final decision declarations, and preserve compatibility with the authentic historical approval through an explicit validated representation. Add a regression for this exact ambiguity.

## Evidence model results

| Requirement | Result |
| --- | --- |
| Verification object and APPROVED status decision required | PASS |
| Full reviewed/evidence commit IDs exist as Git commits | PASS |
| Reviewed commit is ancestor of evidence commit | PASS |
| Evidence commit is ancestor of current HEAD | PASS |
| Evidence paths exist as historical blobs | PASS |
| Current edited evidence cannot replace historical content | PASS |
| Artifact identifies the same reviewed commit | PASS |
| Effective review decision is unambiguously APPROVED | FAIL — R2-PROMO-02 |
| Independent authority cannot be supplied by implementation agent | FAIL — R2-PROMO-01 |
| Implementation/validation report cannot substitute for independent review | FAIL — relabelled report and fabricated legacy record accepted |

Historical blob behavior was tested in both directions: altering/removing current review files while selecting authentic historical evidence still passes; committing CHANGES_REQUIRED evidence and then editing only the working-tree copy to APPROVED still fails. The history mechanics work, but historical immutability does not authenticate who approved the content.

## Required negative tests

Each case used a separate temporary Git fixture and the unchanged real validator. All eleven produced exit 1 / FAIL for the intended reason.

| # | Fixture | Observed rejection |
| --- | --- | --- |
| 1 | VERIFIED without evidence | Requires a verification object |
| 2 | Verification decision CHANGES_REQUIRED | Requires verification decision APPROVED |
| 3 | Nonexistent reviewed commit | reviewed_commit does not exist |
| 4 | Nonexistent evidence commit | evidence_commit does not exist |
| 5 | Reviewed commit outside evidence ancestry | reviewed_commit is not an ancestor of evidence_commit |
| 6 | Missing evidence path at evidence commit | evidence path does not exist at evidence_commit |
| 7 | Artifact names a different reviewed commit | review evidence names a different reviewed commit |
| 8 | Complete review present only in working tree | evidence path does not exist at evidence_commit |
| 9 | Original implementation report substituted | invalid or unsupported evidence path |
| 10 | VERIFIED + merge_authorized=true; V00.1 unverified; reconciliation PASS | governance merge requires V00.1 VERIFIED |
| 11 | Evidence commit on a side branch outside HEAD ancestry | evidence_commit is not an ancestor of current governance HEAD |

These are necessary but insufficient tests: four additional adversarial fixtures unexpectedly passed (three authority forgeries and one conflicting decision). Overall anti-forgery acceptance is FAIL.

## Authentic historical approval

The user-designated authentic approval was read from its historical commit and successfully accepted by the real validator in a temporary status fixture:

```json
{
  "status": "VERIFIED",
  "merge_authorized": false,
  "verification": {
    "decision": "APPROVED",
    "reviewed_commit": "e7f8576ed559bd9167b67cd7493112855f65ca7e",
    "evidence_commit": "992c9486745288fdac2c9004e387669037c1b740",
    "evidence_paths": [
      "docs/reports/governance/R2_GOVERNANCE_REVIEW_RECHECK.md",
      "docs/reports/governance/R2_GOVERNANCE_RECHECK_VALIDATION.json"
    ]
  }
}
```

Observed: exit 0 / PASS, governance_sync_status VERIFIED, governance_merge_authorized false. Both direct `git merge-base --is-ancestor` checks (`e7f8576... → 992c948...` and `992c948... → 40e882d...`) also returned 0. Both historical artifacts name `e7f8576...` and record APPROVED. This confirms compatibility with the approval identified by the user; it does not establish that the validator can distinguish that approval from a forgery.

Historical SHA-256 values:

- Markdown: `5d1cdf53bd945724a913ad14b03180625f8bfba503de5c4e6ce81c8ba063c997`.
- JSON: `e3f68398274b79989267d94defe873c5aa467566f05739074bbd2707d90a97d0`.

## Merge separation

PASS for the requested current gate. Governance VERIFIED does not set merge_authorized. Explicit merge_authorized=true is rejected while V00.1 is IMPLEMENTED_UNVERIFIED, even with reconciliation PASS. PLANS and validator lines 597–603 separately require Governance VERIFIED, V00.1 VERIFIED, and final reconciliation PASS.

Limitation, not a new promotion blocker: the pre-existing line 575 hard-codes V00.1 to IMPLEMENTED_UNVERIFIED. A fixture declaring both Governance and V00.1 VERIFIED plus reconciliation PASS is rejected earlier with `V00.1 truth changed`. Consequently this version has no successful merge-authorized state, and the final reconciliation PASS check is not reachable after a successful V00.1 truth check. This conservatively preserves the current hold; future technical-gate handling needs a separately reviewed change. This review does not approve or exercise an actual merge.

## Governance regression and scope

`python3 tools/validate_r2_governance.py --json` returned exit 0 / PASS, with all ten checks passing. It preserved:

- 33 work packages; 101 steps; 101 prompts; eight controls.
- 99 NORMAL and two PARALLEL_PREPARATION execution modes.
- Acyclic step and work-package dependency graphs.
- Valid progress/status vocabulary; V00.1 IMPLEMENTED_UNVERIFIED, V00.2 BLOCKED, 99 later steps PLANNED.
- All 20 ADRs PROPOSED_NOT_APPROVED with null approval records.
- Eight source-document hashes, Constitution equality, and six standard evidence templates.

`python3 -B -m unittest discover -s tests/governance -p test_r2_governance_promotion.py -v` returned exit 0: all 20 existing tests passed in 13.344 seconds. Independent fixtures additionally reproduced PARTIAL status and prompt rejection, invalid dependency rejection, step/package cycle rejection, invalid execution-mode rejection, and implementation-agent ADR self-approval rejection. No regression was observed in the required existing governance checks.

The target commit changes exactly PLANS.md, the governance validator, and the governance promotion test file. `git diff --exit-code c41ddd8fa7c4098e84efdbe8f1839e8690993627 HEAD -- apps packages scripts supabase package.json pnpm-lock.yaml docs/architecture docs/runbooks docs/reports/V00.1` returned 0. Application/runtime/product/Supabase files are unchanged from that existing technical base. No runtime checks or database operations were needed for this narrow review.

## Reproduction evidence

Companion review artifacts:

- `R2_PROMOTION_MECHANISM_REVIEW_FIXTURES.py`: independently written harness, separate from the implementation test suite.
- `R2_PROMOTION_MECHANISM_REVIEW_VALIDATION.json`: actual baseline and all 26 fixture results, commands' exit codes, errors, metrics, fabricated artifact contents, and temporary commit/blob IDs.

Reproduce from this repository at the reviewed HEAD:

```sh
python3 -B docs/reports/governance/R2_PROMOTION_MECHANISM_REVIEW_FIXTURES.py "$PWD"
```

The harness creates private clones under TemporaryDirectory, runs the original real validator by absolute path without mocks or patches, and deletes the clones afterward. Only fixture inputs and fixture Git history are mutated. Its process exit 0 indicates completed evidence collection; assess each recorded expectation and `unexpected_acceptances`, which contains four failures of the approval standard. Temporary commit IDs can differ on rerun. Original status bytes, validator bytes, and HEAD are checked unchanged.

Only these three new review artifacts were added to the actual worktree. Earlier reviews and all tracked files remain unchanged; artifacts are uncommitted.

## Final decision and next action

**CHANGES_REQUIRED.** The promotion mechanism is not approved because implementation-created verification evidence can pass and conflicting final decisions can pass. Authentic historical approval compatibility, required malformed-evidence rejection, current merge separation, and existing governance regressions pass.

NEXT ACTION = preserve this review evidence; fix R2-PROMO-01 and R2-PROMO-02 in a separately authorized implementation round, then obtain independent re-review. Keep Governance IMPLEMENTED_UNVERIFIED. Do not merge or start V00.2.
