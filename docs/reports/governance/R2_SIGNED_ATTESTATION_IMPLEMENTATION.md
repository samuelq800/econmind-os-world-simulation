# R2 signed review attestation implementation

**Implementation status: IMPLEMENTED_UNVERIFIED.** R2-PROMO-01 and R2-PROMO-02
have candidate fixes with passing reproduction/regression tests. Final narrow
independent review is required. This report is implementation evidence, not an
approval, trust bootstrap, production attestation or merge authorization.

Base commit: `40e882dc27d0fb41c4d72635cbd029af3ddc79ef`.
Branch: `chore/r2-governance-sync`. Date: 2026-09-08, Asia/Shanghai.
The binding Constitution was inspected directly from requirements.docx; source
integrity is also verified by the normal governance validator. Product/domain,
World Engine and Supabase code/data are outside this change.

## Root causes and replacement

The previous mechanism recognized review authority from Markdown headings,
filenames and JSON self-declarations. Git proved blob history but did not
establish reviewer independence. Its Markdown prefix parser also ignored
conflicting decisions, and frozen step assertions prevented a successful future
technical/merge state.

`tools/review_attestation.py` now implements a shared verifier for Governance and
all exact detailed-step IDs from the authoritative manifest. The authorization
message is a fixed-schema JSON attestation, canonically serialized and signed
using SSH Ed25519. OpenSSH performs the cryptography; no cryptographic primitives,
production signing keys, Python cryptography dependency, or signing service were
implemented. The tool can canonicalize an unsigned message for a trusted reviewer
but cannot create approval authority.

The schema requires 13 string fields, including repository identity, exact
subject/review type, reviewed commit, single closed-enum decision, historical
artifact commit/path/SHA-256, reviewer identity, timestamp, nonce and algorithm.
Unknown fields, duplicate keys (including escaped aliases), malformed JSON and
non-string/ambiguous decision representations fail closed. Canonical bytes use
fixed field order, compact standard JSON escaping and UTF-8 without a newline.
Equivalent property order, whitespace and JSON escape forms preserve signatures.

Full specification and manual signing/bootstrap instructions:
[Signed review attestations](../../../governance/SIGNED_REVIEW_ATTESTATIONS.md).

## Trusted public registry and external policy

`governance/trust/reviewers.json` is deliberately empty. A reviewer entry contains
public SSH Ed25519 verification material, reviewer_id, allowed review types and
ACTIVE/DISABLED status. No production key or attestation was fabricated.

**TRUST_ROOT_PROVISIONING_REQUIRED.** The responsible human must authenticate a
real independent reviewer's public key and scope, independently review the initial
registry/verifier, and install the exact approved registry and policy SHA-256
pins in `/etc/econmind/review-trust.json` on an isolated trusted runner (or another
operator-selected protected external policy path). Only public material is stored
in the repository. The corresponding private key remains solely with the trusted
reviewer, outside the repository/Codex/browser/Supabase. No production key was
generated, read or imported in this task.

The external policy pins the registry and the executable verifier, schemas,
governance policy, PLANS, step/package manifests and source-integrity manifest.
Changing any of these is GOVERNANCE_CRITICAL_CHANGE and requires independent
review before the responsible human updates protected pins and authorizes merge.
Adding an arbitrary key or weakening execution-mode/dependency policy cannot pass
under existing pins. A developer's self-selected external policy is a test
configuration, not production authority. OS/CI access controls must keep the
production policy, runner invocation and verifier outside implementation-agent
write authority; repository file checks cannot establish those external controls.
Provisioning these controls is documented, not claimed to have occurred.

## Evidence binding and lifecycle

The history chain is reviewed_commit < artifact_commit < evidence_commit <= HEAD.
The signed JSON binds artifact_commit and exact artifact bytes; a later evidence
commit stores the attestation and signature, avoiding a circular commit hash.
Verification metadata and recorded implementation target must both match the
signed reviewed commit. Subject/review type, trusted reviewer scope/status,
signature, artifact SHA-256, ancestry and current evidence integrity all must pass.

The verifier uses raw historical regular blobs, rejects symlinks/grafts, ignores
Git replace objects and caller Git environment overrides, and checks equality at
HEAD, index and working tree. Edited current evidence, including staged/committed
changes hidden by restoring old worktree bytes, fails closed. This intentionally
replaces the prototype's acceptance of edited current evidence.

Markdown remains human-readable evidence, with no Markdown decision parser.
Neither APPROVED prose nor conflicting APPROVED/CHANGES_REQUIRED text authorizes
VERIFIED. Tests bind conflicting prose to signed CHANGES_REQUIRED and verify that
it fails promotion; rewriting JSON to APPROVED without a new trusted signature
also fails. The trusted reviewer is responsible for resolving human-text
contradictions before signing; the canonical JSON is the sole effective decision.

Generic `step_verifications` and `implementation_commits` maps preserve existing
step status strings and step_evidence arrays. VERIFIED requires signed APPROVED;
review-controlled CHANGES_REQUIRED requires signed CHANGES_REQUIRED. Every active
step must satisfy its listed hard dependencies, including parallel-preparation
steps. No permanent V00.1 or later-step planning freeze remains.

`merge_authorized=true` has a successful controlled fixture only when Governance
and V00.1 are both independently signed VERIFIED and final_reconciliation.status
is PASS. All seven missing-prerequisite combinations fail. Governance verification
alone leaves merge authorization false. Reconciliation remains an operator-recorded
result requiring the Constitution's applicable checks, not proof synthesized by
a signature. V00.2 readiness additionally requires a recorded merge containing
both approvals, checked against HEAD and the trusted runner's refreshed integration
ref. Neither real merge nor V00.2 implementation occurred.

## Verification performed

Python: 3.14.6. Git and OpenSSH: system `/usr/bin/git`, `/usr/bin/ssh-keygen`.
Secret/format checks used repository-pinned Node 24.20.0 and pnpm 12.3.4 from the
existing npm tool cache, rather than the shell's mismatched defaults. No dependency
installation, lockfile mutation, network database access or Supabase operation.

- Before implementation: baseline real validator PASS; original 20-test suite PASS.
- After implementation: real validator PASS, all ten normal governance checks.
- Full updated suite: **67 tests passed**, exit 0, 43.683 seconds. This includes
  20 migrated existing promotion/history/regression tests and 47 signed-attestation,
  canonicalization, trust and lifecycle tests. No skips or expected failures.
- All **22 required negative categories** are represented by named tests 01–22.
  Each executes the real validator in a temporary Git fixture. Additional strict
  canonicalizer subcases exercise duplicate/escaped/nested decisions and enum/type
  rejection.
- Positive signed fixtures: Governance, V00.1 and dependency-ready V00.2/V00.3;
  four distinct subjects validate through the common verifier. Test-only merged
  readiness and signed CHANGES_REQUIRED lifecycle also pass where appropriate.
- Merge matrix: all eight combinations exercised; the one complete combination
  passes and the other seven fail. Missing/FAIL/INSUFFICIENT_EVIDENCE reconciliation,
  premature readiness and absent completed-merge evidence also fail.
- Secret scan: PASS; exact final output is in the companion validation record.
- Changed Markdown/JSON formatting: PASS. Python syntax compilation: PASS.
- `git diff --check`: PASS. No application/runtime/product/Supabase changes.

Temporary SSH keypairs, signatures, test registries, external test pins and Git
histories are generated inside TemporaryDirectory during execution and removed.
No private key or production-accepted test key was committed. Production default
configuration rejects the signed test trust.

The existing governance totals remain 33 packages, 101 steps, 101 prompts, eight
controls, 99 NORMAL plus two PARALLEL_PREPARATION modes, acyclic step/package DAGs,
eight intact sources and 20 unapproved ADRs. Existing PARTIAL, invalid dependency,
cycle, invalid execution mode, missing prompt, impossible VERIFIED dependency and
ADR self-approval rejection tests remain present and pass.

## Additional candidate-review corrections

The security fix workflow included a read-only boundary investigation and one
fresh read-only candidate review. Three concrete lifecycle regressions in the
candidate were confirmed and corrected before final validation:

1. An implementation could reclassify a blocked step as parallel preparation by
   changing the unpinned manifest and matching prose. A real-validator regression
   reproduced unexpected PASS; authoritative policy manifests are now pinned and
   the same mutation is rejected.
2. The candidate incorrectly interpreted parallel preparation as bypassing its
   listed dependencies. The manifest instead permits only early parent-package
   preparation. V25.1/V26.1 premature active states reproduced unexpected PASS;
   those four test combinations now fail.
3. Removing the frozen V00.1 state exposed unsigned CHANGES_REQUIRED. That
   review-controlled state now requires its own signed decision, with unsigned,
   wrong-decision and valid signed lifecycle regressions.

These implementation checks do not substitute for the requested final independent
review or establish production reviewer authority.

## Files and preserved state

Implementation files:

- `tools/validate_r2_governance.py`, `tools/review_attestation.py`.
- `tests/governance/test_r2_governance_promotion.py`,
  `tests/governance/test_r2_signed_attestations.py`,
  `tests/governance/attestation_fixtures.py`.
- `governance/attestation.schema.json`, `governance/trust/reviewers.schema.json`,
  `governance/trust/reviewers.json`, `governance/SIGNED_REVIEW_ATTESTATIONS.md`.
- `PLANS.md` and this implementation report/companion validation JSON.

The earlier R2_PROMOTION_MECHANISM_REVIEW.md, its VALIDATION.json and FIXTURES.py
are preserved byte-for-byte as historical independent evidence and included in
the commit. The unrelated untracked V00.1/REVIEW_RECHECK_2.md was left untouched
and excluded. No tracked status, decision, planning, requirement or runtime file
was changed. The companion record contains preservation hashes and actual outputs.

Current real state is unchanged: Governance Sync IMPLEMENTED_UNVERIFIED;
V00.1 IMPLEMENTED_UNVERIFIED; V00.2 BLOCKED; merge_authorized false;
ADR-01..ADR-20 PROPOSED_NOT_APPROVED. Production registry is empty.

NEXT ACTION = REQUEST FINAL NARROW INDEPENDENT REVIEW OF SIGNED ATTESTATION MECHANISM.
DO NOT PROMOTE. DO NOT MERGE. DO NOT START V00.2.
