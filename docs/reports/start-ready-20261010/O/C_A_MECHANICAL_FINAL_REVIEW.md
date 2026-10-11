> Presentation copy, not a new Root review.
> Original: `/Users/samuel/.codex/state/plugins/codex-security/scans/a-current-authz-mechanical-prep-20261010/artifacts-3a5f1928e91c2f702d47f1bc133ce934a2d8b8e0a119271987ab2fa534f6a963/artifacts/C_AUTHZ_PREPARATION_REVIEW/review.md`
> Original raw SHA256: `b6511b3eb074eec8f0ea9f166b0669a9c192b5fe4df3efbdb3c461b9b6414d80`

# C — Independent review: A authorization mechanical preparation

Date: 2026-10-11, Asia/Shanghai. Reviewer C, implementation owner A.

**Independent decision: APPROVED — SEPARABLE_UNREGISTERED_AUTHORIZATION_PREPARATION_ONLY.**

No actionable defect was established within this exact preparation scope. The skill recommendation is `merge / human_review_required`, advisory for the frozen mechanical packet only; this report does not perform or authorize push/merge, SQL publication or activation. It does **not** approve a real-source writer, execute-only publisher ACL, source registration, current-admin evidence, B/D compatibility, E integration, E-I01 closure or real opening.

## 1. Fixed immutable subject

- Repository: https://github.com/samuelq800/econmind-os-world-simulation
- Checkout: `/Users/samuel/Documents/econclub/.econmind-worktrees/a-current-authz-mechanical-prep-20261010`
- Base: `eb033a4d9e717a9cb9149e450900b606c3457403`; tree `13a60f04c1a9c54eb8ffbaca8b469bf25b293dce`.
- Code: `cb4465e103cdbde139292e3d183a0690c86c8fb1`; tree `e6e7618e3a1800451b631ac80db5cfbc9f4e079d`.
- Final tip: `023bef139f58fb1205830c3b9f81e80f0454ca8d`; tree `777990b59101dc32f5ca0bf26f3e2e42a9c00869`.
- Exact `git diff --binary --no-ext-diff --no-textconv BASE..TIP` SHA-256: `08d6da26aba9628d2dd9f2940781e8b80ea021dbf73cb77ee3834cc8d73583e4`.
- All nine frozen file hashes independently match. Code→tip adds only the final candidate report; the eight native-bound source/frontier/test files match the final tip unchanged.
- Subject remained at the exact clean tip/tree before and after review. C did not edit it.

Changed files: two Worker preparation TS modules, one **unregistered** SQL proposal, two A reports, one TEST_ONLY fixture, its focused strict tsconfig and two focused test files. No migration, dependency/lockfile, product export, route, consumer or status change. The migration chain, original admission-veto proposal, persistence directory and actual `intake/manual-office-intake-runtime.ts` are unchanged by exact-range comparison.

Prior C design review was read in full and its SHA-256 independently matched `3555d9102ef51428645f798990e816de6391c78aa09012f1c13448e9713e6550`. It permitted separately assigned, unregistered default-deny parser/planner/H-first-refusal/oracle preparation while retaining the complete real-source gate. This candidate stays inside that separable boundary.

## 2. Independent boundary conclusions

H = existing World head; A = complete current authorization slice for one World/subject; C = derived publication checkpoint.

| Boundary and strongest counterexample                                                                                 | Source/control and conclusion                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Valid forged registration/admin fields and correct digest might be mistaken for authority                             | `current-authorization-source-contract.ts:145–235` validates bytes/schema/identity/expiry/Office pairs only and returns UNTRUSTED_PARSED_DATA_NOT_AUTHORITY. Both planner results are UNTRUSTED_PLAN_NOT_AUTHORITY. Parser does not resolve a registration or grant anything. Core's independent Office contract supplies six Offices/18 pairs; unsupported, duplicate, wildcard and SIGN_OFFICE_APPROVAL inputs are refused. Supported as untrusted data mechanics, not source admission.                                                                                                                              |
| Omitted old keys, inactive rows or a country/team/Office switch might leave an old grant active                       | `current-authorization-publication-preparation.ts:116–160,204–307` validates every supplied active/inactive row against the same World/subject/catalog; full-slice fingerprints include identity/team/revision/active. Omitted keys deactivate, every row gets the new revision, old inactive keys retain historical team, desired new keys insert into the pure plan. Incoherent active subjects and unsupported inactive capabilities reject. Empty REVOKE yields derived C without inventing an Office/tombstone. A future actual reader must prove slice completeness; this planner does not establish that reader. |
| Stale predecessor, reused operation/revision, changed bytes, or a substituted expected head might replay an old grant | Same-operation check includes source owner/registration/ref/schema/hash/revision/predecessor/operation and **original four request arguments**. Exact current C.afterFingerprint must equal full A. Exact retry after unrelated H advancement returns EXISTING_METADATA_ONLY without timestamp refresh. New operation requires exact predecessor/head/before CAS; nonempty A with no C refuses PREDECESSOR_UNESTABLISHED, not an invented baseline adoption. Native positive fixture verifies serialization, duplicates and rollback under its separate TEST_ONLY identity.                                             |
| COMMIT loss, unconfirmed rollback or cleanup exception might be silently retried or readback upgraded to ACK          | Lines310–338 return metadata-only readback labels and retryable=false; generic/commit-unknown/rollback-unconfirmed failures remain UNKNOWN. Confirmed ROLLED_BACK/NOT_STARTED are distinguished without making them retryable. Existing PostgresSqlDatabase never retries its callback. Native test commits a fixture transaction then injects a TEST_ONLY lost-ACK exception; this is not a new physical transport-loss test or real-source-currentness proof. Superseded C does not resurrect old operations.                                                                                                         |
| A caller passes a poisonous Proxy, parsed DTO, approved=true, resolver/config or extra factory arguments              | Lines341–353: factory takes/holds no database, resolver or configuration; apply/readback do not inspect request properties and always return AUTHORIZATION_SOURCE_NOT_REGISTERED/retryable=false. There is no query or write sink in either entry. Independent poison/DTO pure tests pass. Bounded actual apps/scripts/export/manifest inspection found no product caller registration; existing derived authorization-entitlement publication is separate and unchanged.                                                                                                                                               |
| SQL might lock A before H, create missing H, or reach a hidden positive DML branch                                    | SQL27–59: input/isolation checks precede any business row lock; valid invocation takes existing same-World H FOR UPDATE, missing H refuses, then unconditionally raises SOURCE_NOT_REGISTERED. No source lookup, A/C DML, H update, callback or positive body exists. SQL is VOLATILE, SECURITY INVOKER, fixed search_path; PUBLIC execute revoked. New C table is metadata-only, FORCE RLS, no policies/grants in proposal. Native probe observed H blocking before inactive A locks and zero footprint. Proposal DDL used in private test bootstrap is not product apply DML or a registered migration.               |
| A positive native oracle might be portrayed as execute-only live publication                                          | The positive `fixtureApply` is private to the test, with distinct TEST_ONLY ORACLE direct A/C DML and policy; it intentionally exercises H→C→A, **not** H→real source/current-admin→C→A. The separate product PROBE has no A/C DML and cannot SET ROLE to ORACLE. Reports state those limits and retain real source/admin/cutoff/definer ACL HOLD. This explicit separation is essential to approval.                                                                                                                                                                                                                   |

C checkpoint contains source-operation fingerprints and expected/after metadata, no active/capability grant rows or consumer permit. Consumers were not changed to trust C. Complete source-currentness, actor/issuer/audience/current-admin verification and expiry/revocation cutoff closure are absent by scope, not silently replaced with these fields.

## 3. Evidence actually checked

### Independent C execution

Exact final-tip source was extracted via `git archive` into a separate managed temporary copy. Dependencies were reused read-only, local workspace Core was relinked into the copy, and the subject Core dist was copied (Office source/dist hashes match native evidence). No old-build or full build rerun.

Node **24.20.0**; `env -i`; macOS sandbox explicitly denied networking and file writes outside the temporary review stage (apart from /dev/null).

- `vitest run tests/world-core/current-authorization-publication-preparation.test.ts --cache=false`: **15 passed**, zero failed/skipped, exit0.
- `tsc -p tests/support/tsconfig.current-authorization-preparation.json --noEmit --strict --skipLibCheck false`: **exit0**.
- Exact final Git/tree, nine source/file pins, protected-path diff and exact-range `git diff --check`: **PASS**.

Actual commands, exit codes and unmodified tool outputs are retained in `verification.json`.

Failure history is preserved: first independent pure startup exited1 **before executing tests** because copied .vite/.vite-temp symlinks targeted shared dependencies and the sandbox denied their write. Only those symlinks in C's temporary copy were moved aside and replaced with private cache directories; the unchanged candidate's pure15 then passed. No source fix, sandbox widening, test weakening or A file change occurred.

The assessment validator initially rejected classifying that historical pre-test environment failure as a current failed merge-validation row. It is now correctly recorded as a successful containment control with the actual exit1 history preserved in this report/verification; no candidate failure, rating or recommendation was hidden or changed to pass validation. Final schema/invariant validation: **exit0**.

### Producer native evidence — verified, not rerun

Read the actual retained runner, runner-evidence and native-results JSON; matched their hashes against FROZEN_HANDOFF and source bytes:

- Runner: `19a04d4ebcaa4346e19464d6c82dbfc801c337361dfddc87dd083c834156818f`.
- Runner evidence: `93d62af49b3685f7e6dd11e0cbb844a4a0923f340d62320f761161141d5872e8`.
- Native results: `7de0ee947ee6dff092f65c7f5db58c68dfdfdf7b6dc6c4a5637a192e67eece0a`.

Runner pins clean implementation code/tree and eight files before/after; sanitized environment; task-owned private Unix-socket PG16.15; database/server/data-dir/UID/modes/marker identity checked; no TCP listener; successful owned server STOPPED. Result has **9 passed,0 failed,0 pending,total9**, matching inspected assertions, not a skipped-suite green summary.

The nine cases cover product SQL refusal/zero effects; H-before-inactive-A wait; complete six-Office/country/team replacement; exact retry/stale bytes/CAS; same-before contenders; row/C-constraint atomic rollback; empty revoke/supersession; TEST_ONLY post-real-COMMIT UNKNOWN; and denied PROBE A/C DML/SET ROLE/PUBLIC execute plus original admission veto/zero admission.

**15 pure + 9 native is not real opening, a registered authorization source, current source TTL/revocation, real-admin evidence, execute-only definer/ACL, consumer compatibility or Gate B.** No new native test was run by C; producer lint/build/boundary/full provenance claims are not relabeled as independently repeated checks.

## 4. Scope of approval and retained HOLD

APPROVED only:

1. Proposed untrusted source-byte parser and pure complete replacement/CAS/derived checkpoint mechanics.
2. UNKNOWN/no-auto-retry and metadata-only comparison helpers.
3. Unregistered zero-query/zero-write TS entry.
4. Unregistered H-first unconditional SQL refusal and derived metadata-table proposal.
5. The explicitly isolated TEST_ONLY oracle/tests and accurate scoped reports.

Not approved or established:

- Real source owner/registration/immutable-current lookup, authentic actor/current-admin/issuer/audience and source revocation/expiry cutoff.
- Positive product DML writer; execute-only real publisher; NOLOGIN non-assumable/non-table-owner/NOBYPASSRLS definer and complete catalog/ACL/RLS bypass proof.
- B narrow-approval compatibility, D zero-effect/E guard, E source integration or E-I01 closure. C neither repeats nor closes those independently owned tasks.
- Migrations/SQL publication, actual authority grants, route/export/source/caller registration, Clock/consumer enablement, real opening, production, CI, deployment, activation or merge.

Do not expose the planner as a writer, import the TEST_ONLY oracle into product code, or register the SQL proposal on the strength of this approval. Any positive integration remains a separately frozen, independently reviewed packet.

## 5. Risk and stop

Impact **high** (privileged authorization/persistence contract if misused); likelihood **low** for this contained packet; protection **partial** (pure/strict plus source-pinned TEST_ONLY native, not live writer coverage); recovery **easy** (unregistered files/proposal, no production migration); confidence **high for this exact preparation decision**, not live readiness. No auto-merge eligibility: privileged/persistent/public-contract frontier requires human review.

Status-quo risk for not taking the preparation is low delay to reusable mechanics; the existing source HOLD stays closed. Deployed authorization risk is outside this review and is not asserted safe/unsafe.

The applicable patch-risk skill required fixed-range binding, boundary counterexamples, explicit evidence ratings and managed artifacts **outside A's checkout**. No A/peer source, SQL, role, configuration, migration, status, git branch or product artifact was changed. No new peer message, agent, database, full/420, production check, push or merge.

Validated assessment SHA-256: `0193e3d2cb17372d6d2292a6677bf123d70a9564909d03c8cbd5e61007a7d353`. Verification SHA-256: `0a599a128697c1bd6bf2f64b5c253d209e9619c6f902cffdbde0df04f87cfecd`.

Final: **INDEPENDENT_APPROVED_FOR_MECHANICAL_PREPARATION_ONLY**; **REAL_SOURCE_WRITER=HOLD**; **E-I01=OPEN**. Frozen review handoff; STOP.
