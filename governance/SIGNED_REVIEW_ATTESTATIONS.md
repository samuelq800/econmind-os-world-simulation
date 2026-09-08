# Signed review attestations v1

Implementation status: IMPLEMENTED_UNVERIFIED. Production authority:
**TRUST_ROOT_PROVISIONING_REQUIRED**. No real reviewer key has been supplied.
An empty registry permits the unverified baseline, but cannot authorize VERIFIED.
No historical Markdown/JSON approval is grandfathered into signing authority.

## Authority boundary

A review signature authenticates a trusted reviewer's declaration. It does not
prove substantive correctness, grant ADR approval, merge code, or start a step.
Git history, filenames, author strings, headings and self-declared reviewer roles
never grant authority. Markdown is human evidence only; the validator does not
parse any Markdown decision, including Final Decision prefixes. Only one strict,
signed JSON decision controls promotion. Reviewers must resolve contradictory
prose before signing; untrusted prose containing APPROVED and CHANGES_REQUIRED
cannot authorize anything, and a signed CHANGES_REQUIRED decision cannot be
upgraded by APPROVED prose.

The trusted operator runs the reviewed verifier on an isolated runner with an
external policy at `/etc/econmind/review-trust.json` (or an explicit protected
`--trust-policy` path). This public policy is not secret but must be outside the
repository and outside implementation agents' write authority. No environment,
Git-author, repository-local fallback or automatic enrollment supplies trust.
The operator controls the invocation, verifier, OpenSSH/Git binaries and policy
path; the implementation agent must not control those inputs in the production
approval workflow. A developer running a modified verifier or choosing their own
external policy has produced a sandbox result, not production authorization.
CLI arguments and file-location checks cannot replace OS/CI permissions.

The external policy has exactly these fields:

- `schema_version`: `econmind.external-review-trust.v1`.
- `repository_id`: `econmind-os-world-simulation`.
- `registry_sha256`: SHA-256 of the exact approved `governance/trust/reviewers.json` bytes.
- `policy_sha256`: object mapping every path in `tools/review_attestation.py:POLICY_PATHS`
  to its SHA-256. It covers both executable verifier files, schemas, this policy,
  PLANS, the authoritative step/package manifests (including lifecycle vocabulary,
  execution modes and dependencies), and the source-integrity manifest. The running verifier's bytes must also match those approved hashes.

All registry/schema/algorithm/authority/policy changes are
**GOVERNANCE_CRITICAL_CHANGE**. Independently review the exact candidate before
merge; the responsible operator updates external pins only after that review.
An implementation-agent registry addition or verifier policy change fails with
the old pins. It cannot approve its own replacement pins. No auto-rotation,
bootstrap signing key or command that provisions production trust is supplied.
This repository does not install runner permissions or branch protection; the
operator must establish them before using any local PASS as merge authority.

## Schema and canonical serialization

`governance/attestation.schema.json` documents the fixed schema; the verifier
implements the same constraints plus dates, paths, expected subjects and history.
All 13 fields are required, all values are printable ASCII strings (encoded in
UTF-8); unknown fields, nulls, numbers, arrays, nested decision objects, duplicate
keys even with identical values, NaN and Infinity are rejected. JSON escape forms
are decoded before validation, so escaped duplicate keys also fail. Exactly one
`decision` exists with enum APPROVED, CHANGES_REQUIRED, BLOCKED.

Canonical serialization order is:

1. schema_version
2. repository_id
3. review_type
4. subject_id
5. reviewed_commit
6. decision
7. artifact_commit
8. review_artifact_path
9. review_artifact_sha256
10. reviewer_id
11. issued_at
12. nonce
13. signature_algorithm

Serialize that object using Python stdlib JSON string escaping, `ensure_ascii=True`,
`separators=(',', ':')`, `allow_nan=False`, then UTF-8, with no BOM or trailing
newline. This is a deliberately restricted fixed-schema format, not RFC 8785.
Input whitespace, property order and equivalent JSON escapes do not change the
canonical message. There are no numbers or Unicode normalization ambiguities.
Artifact bytes themselves may contain arbitrary UTF-8; their SHA-256 is exact.

`review_type` is GOVERNANCE for `subject_id = Governance Sync`, STEP for any exact
manifest step ID. `signature_algorithm` is only `ssh-ed25519`. Commit IDs are full
lowercase Git IDs. Artifact paths are canonical ASCII relative paths under
`docs/reports/` or `governance/attestations/`, without traversal/symlinks.
`issued_at` is a valid UTC `YYYY-MM-DDTHH:MM:SSZ` timestamp (maximum future skew five
minutes); `nonce` is 32 lowercase random hexadecimal characters, unique per
reviewer among currently verified subjects. It is not an expiry/revocation token.
Current registry status ACTIVE/DISABLED controls reviewer eligibility; disabling
an entry invalidates its approvals until policy and status are reconciled.

## Signing workflow (human/trusted reviewer only)

1. Record the implementation commit for the subject. Complete an independent
   review of that exact commit.
2. Commit the human review artifact after the implementation commit. Record this
   `artifact_commit`, the exact path, and SHA-256 of its raw bytes. This commit
   must be a descendant of the reviewed commit and must not equal it.
3. Build the strict attestation. On the trusted reviewer's machine, run the
   independently reviewed canonicalizer:
   `python3 tools/review_attestation.py review.json > review.canonical.json`.
4. Sign there with a privately held Ed25519 key:
   `ssh-keygen -Y sign -f /private/reviewer-key -n econmind-review-attestation-v1 review.canonical.json`.
   This creates `review.canonical.json.sig`; only public review files and the
   detached signature return to the repository. A signer must independently
   verify the target/artifact hash and decision, not blindly sign agent output.
5. Commit the attestation and signature after artifact_commit. Record that later
   `evidence_commit` in verification metadata. It is intentionally outside the
   signed JSON to avoid a circular self-referential commit hash. It must contain
   the signed payload/signature and unchanged artifact; substitution still needs
   a valid signature, subject/target match, artifact hash, and ancestry.
6. A mechanical status update may now reference those immutable files. Run the
   real validator with the operator's protected policy; obtain required human
   workflow approval before treating its result as authority.

OpenSSH performs all cryptography with `ssh-keygen -Y verify`, a temporary
allowed-signers file containing only the selected pinned Ed25519 public key,
the exact reviewer principal, and namespace `econmind-review-attestation-v1`.
No manual cryptographic primitives or third-party Python dependencies are used.
See the [OpenSSH ssh-keygen manual](https://man.openbsd.org/ssh-keygen.1).
Missing tooling, invalid signatures, unknown algorithms, inactive/unknown reviewers
and wrong scope fail closed. Temporary verifier files contain only public data.

History is `reviewed_commit < artifact_commit < evidence_commit <= HEAD`.
The validator reads raw regular blobs, ignores replace objects, rejects grafts,
and compares bound artifact/attestation/signature bytes to HEAD, index and working
tree. Committed, staged or unstaged evidence mutation is rejected, including
mutation concealed by restoring old worktree bytes. Evidence remains immutable
as subjects move forward; create new paths for replacement reviews. This
intentionally tightens the earlier history-only prototype's current-file behavior.

## Generic status records and gates

Existing `steps` values and `step_evidence` arrays remain unchanged. For each
VERIFIED step, add `implementation_commits[step_id]` and
`step_verifications[step_id]`. For Governance use
`governance_sync.implementation_commit` and `governance_sync.verification`.
Each verification object has exactly:

```json
{
  "reviewed_commit": "FULL_IMPLEMENTATION_COMMIT",
  "evidence_commit": "FULL_LATER_SIGNATURE_COMMIT",
  "attestation_path": "governance/attestations/SUBJECT.json",
  "signature_path": "governance/attestations/SUBJECT.json.sig"
}
```

This is documentation, not a production attestation. The signed reviewed_commit
must match both verification metadata and the recorded implementation target.
An approval is for that immutable target; new implementation work must record a
new target and obtain a new review. Current attestations do not automatically
review every later unrelated commit. No legacy verification/evidence_paths or
unsigned Markdown authorization is accepted.

Every VERIFIED step uses the same verifier and requires VERIFIED hard dependencies.
CHANGES_REQUIRED is also review-controlled: the same implementation target and
step_verifications metadata must carry a trusted signed CHANGES_REQUIRED decision.
An APPROVED signature cannot grant CHANGES_REQUIRED, nor can CHANGES_REQUIRED
grant VERIFIED. No signature is required to report implementation-controlled
IN_PROGRESS, IMPLEMENTED_UNVERIFIED or BLOCKED.
All active work, including PARALLEL_PREPARATION, requires its listed hard
dependencies. Parallel preparation may precede parent-package integration only;
it never bypasses the detailed step dependencies or unlocks parent integration.
There is no permanent V00.1 or later-step status freeze. The actual status file
remains at the currently authorized gate throughout this implementation.

`merge_authorized=true` is a separate declaration requiring signed Governance
VERIFIED, signed V00.1 VERIFIED, and `governance_sync.final_reconciliation.status`
PASS. The old scalar `final_reconciliation_gate` is rejected. Reconciliation is
an operator-recorded workflow result, not automatically proven by signatures;
it must include the Constitution's applicable checks before a real merge.

V00.2 readiness additionally requires a recorded `governance_sync.merged_commit`
containing both approvals, present in current HEAD and `refs/remotes/origin/main`.
The trusted runner refreshes that ref from the approved authenticated remote;
local attacker-writable refs alone are not proof of a real merge. current_gate
status/readiness must agree with validated state. Neither a successful test nor
merge_authorized alone means Governance is merged or V00.2 may start.

## Manual trust bootstrap

**TRUST_ROOT_PROVISIONING_REQUIRED** until a real independent reviewer provides
only their public SSH Ed25519 key and identity/scope through an authenticated
out-of-band channel. The private key must never enter this repository, committed
environment, Codex implementation context, browser, or Supabase. Test keys are
created only in TemporaryDirectory and deleted; their public registry and
external policy are fixtures, never production configuration.

The responsible human authenticates that public key fingerprint and reviewer
independence, has the initial registry and this verifier independently reviewed,
and installs the reviewed registry/policy hashes at the protected external policy
path on the trusted runner. Keep the production registry empty until then.
Provisioning the first root is a manual human trust decision, not self-approved
by a key it is introducing. Future key/scope/algorithm changes require the same
independent governance-critical review before updating protected pins/merging.
After provisioning, the trusted reviewer must sign a real approval for the
actual reviewed implementation. No production private key or approval is created
by this task. Lack of private authority in Codex is intentional.
