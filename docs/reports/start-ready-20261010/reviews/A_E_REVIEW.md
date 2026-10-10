# A independent review of E candidate — CHANGES_REQUIRED

Review date: 2026-10-10. This is a read-only design/oracle assessment, not an implementation, merge, release, owner acceptance or production-readiness decision.

## Fixed identity

- Repository: /Users/samuel/Documents/econclub/econmind-os-world-simulation
- Base: 42991acfee9d0eacc702ba47a380c938a4516f03
- Head: 68b0f4970a70df4d194c8e444795a26aa12f6ff0
- Tree: 491ace37ff23b3150c414fb84a8c88623c9d8e1b
- Canonical binary/full-index/no-renames diff SHA-256: ab786bce813f0d4c53949bd3c6547183ef97b44039a6929d971bf0d3bf604ba8
- Design blob SHA-256: 05ce6dc55d9c8374d4d3e895564ef79b57746c783f6033c5bf21086c83360ead
- Oracle blob SHA-256: 4a5ae1acc643918bf888045fdc04c6f0ee59af8c9818236f6b2096526b9fccfa

Exactly two added files, 606 lines. All subject inspection used git objects at the fixed head; the old codex/world-core-planning checkout was not switched/reset or used as candidate truth. Its three pre-existing untracked paths remain untouched. No runtime, migration, DDL, status, credential, main-site file or production data changed.

## Required correction — E-01 / P1: repeated row-lock acquisition in the two-stage protocol

Source: [fixed design line77](/Users/samuel/.codex/state/plugins/codex-security/scans/econmind-os-world-simulation/artifacts-9f5b0b5b98a46d70850984477e0abe830c761ec4f4413810e3052e22052331f4/artifacts/a-e-design-review-20261010/candidate/IMPLEMENTATION_DESIGN.md:77), [line79](/Users/samuel/.codex/state/plugins/codex-security/scans/econmind-os-world-simulation/artifacts-9f5b0b5b98a46d70850984477e0abe830c761ec4f4413810e3052e22052331f4/artifacts/a-e-design-review-20261010/candidate/IMPLEMENTATION_DESIGN.md:79), [fixed oracle line126](/Users/samuel/.codex/state/plugins/codex-security/scans/econmind-os-world-simulation/artifacts-9f5b0b5b98a46d70850984477e0abe830c761ec4f4413810e3052e22052331f4/artifacts/a-e-design-review-20261010/candidate/permission-oracle.test.mjs:126), [line134](/Users/samuel/.codex/state/plugins/codex-security/scans/econmind-os-world-simulation/artifacts-9f5b0b5b98a46d70850984477e0abe830c761ec4f4413810e3052e22052331f4/artifacts/a-e-design-review-20261010/candidate/permission-oracle.test.mjs:134).
Base/current product source at the same head: apps/world-worker/src/intake/postgres-office-command-intake.ts:479-525.

The cutoff function locks existing submission → head → current authority. The same outer transaction retains those locks while TS reconstructs an original command. The register function is then required to repeat the same lock sequence. A sequence that is safe in one fresh call is not safe when that transaction already holds head.

Ordinary concurrent retry schedule:

1. A's first submission lookup sees no row, while B holds the head.
2. B registers the same command/idempotency identity and commits.
3. A acquires head and returns B's racing original without a submission lock.
4. C retries that existing identity: it locks the submission and waits for A's head.
5. A calls register, repeats submission FOR UPDATE and waits for C.

The resulting wait cycle is A(head) → C(submission) → A. PostgreSQL detects a deadlock or the configured timeout aborts a participant. This is an availability/legitimate retry regression, not evidence of partial commits or a production exploit. The control is transaction-wide consistent lock acquisition, not merely the textual order within each function. [PostgreSQL16 explicit locking/deadlocks](https://www.postgresql.org/docs/16/explicit-locking.html#LOCKING-DEADLOCKS).

The actual intake explicitly re-reads WITHOUT another submission lock after acquiring head (lines517-525). The oracle also does so (lines134-136), but models a single enqueue function. Its concurrency case blocks another registrar on head; it does not exercise cutoff → TS → register with the racing-original interleaving. Therefore 24 passing mechanism checks do not resolve this contradiction.

Required fix to design/test, not runtime in this review:

- Define one transaction-wide lock protocol for both standalone register and cutoff→register.
- No newly acquired submission lock may follow an already-held head lock. Either remove that need under a proven immutable/head-serialized protocol, or specify another executable protocol preserving all supported writers' order. Do not silently reverse the established global order.
- Standalone register must still independently enforce real caller, current coherent authorization, exact binding/intent/queue, head cutoff and atomicity. No caller Boolean, portable READY token or cached callback may select a privileged bypass.
- Add a bounded deterministic multi-session test covering the five-step race, normal new registration, exact retry, conflicting identity and standalone register. Ensure original SimTime and intent are retained and both rows remain all-or-zero.
- Correct the design's claim of proven cross-function coverage: the current oracle proves lock retention after a function returns, not this full two-function protocol.

## Boundaries retained, not implementation-approved

- Restricted definer: fixed schema-qualified SQL, pg_catalog then pg_temp, no dynamic SQL or role switching; non-table-owner NOLOGIN function owner; no runtime owner membership; no PUBLIC execution; explicit column grants/RLS; intake no direct head/authz/entitlement UPDATE or submission/queue INSERT. Local mechanism assertions support this design direction only.
- Session identity: session_user identifies the dedicated login inside definer. JWT GUC is explicitly trusted server context, not DB signature verification. Possession of the login remains within that trusted-server boundary; no stronger claim is approved.
- Authorization: each decision must bind the same subject/world/seat/revision and current exact seed/model/replay/head. FOR SHARE on existing rows alone does not close insertion phantoms. Line80 correctly withholds formal provisioning until every authorized writer uses the reviewed head-serialization contract.
- Admission/private authority: callback registry checks alone are not commit-atomic revocation evidence. Line142 correctly preserves the separate durable lock/fencing dependency and withholds admission INSERT/EXECUTE.
- Bootstrap: the design must not be read as proof of existing World/ledger-creation SQL. WorldOpeningSeedStore.bootstrap:134-185 writes the immutable opening_seed; bootstrapAndReadback:81-82 invokes that and a distinct readback. Exact World creation and each identity's grants remain separately evidenced, not supplied by this review.
- Reader/executor/seat role matrix is a proposed upper-bound/ownership matrix, not provisioned credentials or formal grants. Current economic semantics and append-only/atomic writer boundaries are not redefined.
- Unknown outcomes: commit/cleanup uncertainty stays UNKNOWN; missing FINAL receipt is not proof of no commit. No automatic replay/new identity/SimTime, no promotion to success.
- Production schema: sole old-site main-site-release-chain remains the only publisher. Fixed successor/prefix/hash/catalog checks and UNKNOWN_STOP_NO_RETRY remain mandatory; no bulk17→23 publication, incidental0022, new caller, direct linked-Supabase access or activation is permitted.

## Independent checks actually performed

- Exact immutable head/tree/base, two-file diff and patch/blob hashes: PASS.
- Exact oracle syntax check under pinned Node24.20.0 and OS sandbox: exit0.
- Exact oracle executed ONCE under pinned Node24.20.0 / local PG16.15: exit0, 24 checks, PASS_MECHANISM_ONLY.
- Environment was cleared; home-directory reads and IP network were denied; only Unix sockets allowed. Writes were limited to disposable managed storage and the oracle's own fresh validated cluster. The oracle stopped its own server and deleted its own mkdtemp tree before exit0.
- Relevant synthetic checks: caller direct writes denied, owner assumption denied, catalog search_path/RLS/owner asserted, authenticated exact retry, cross-session lock retention/revocation, rollback on queue failure and exact row counts.
- No two-function implementation was executed; E-01 is a source-established design counterexample, not a falsely reported failed test.
- No full/native suite rerun, CI claim, production schema/readback/TLS/Hyperdrive, Core parser, admission, ACK-loss or formal-grants validation.
- oracle-observation.json is reviewer-recorded tool observation, not a raw stdout transcript. oracle.sb retains the actual execution restrictions.

## Risk and decision

Skill recommendation/label: revise / revise; requested review result: CHANGES_REQUIRED.

- Impact if the proposed privileged contract is implemented incorrectly: high. Immediate patch effect: design + local synthetic test only.
- Regression likelihood: high, due to the source-visible protocol contradiction.
- Regression protection: partial; exact-head mechanism run passes but misses two-stage composition.
- Recoverability: easy now, with no state/schema changes. Future SQL rollout would require managed forward-fix/EXECUTE removal, not broad-grant restoration.
- Confidence: moderate overall; high in E-01's source proof, with implementation/production properties deliberately unclaimed.
- Status-quo risk: moderate readiness delay; continued HOLD contains production authority. This is not an assertion of a current production permission vulnerability.
- No auto-merge: privileged boundary, public function contract, architecture-specific rollout, and unresolved dependencies.

The assess-patch-risk skill drove immutable binding, boundary counterexamples, managed evidence storage, and separation of design, local oracle and production approval. It grants no release authority.

## Exact downstream permitted scope

Now: design + isolated test correction only, fixed new review target. No approval to implement or integrate privileged P0 SQL/source from this result.

Only AFTER a separate corrected-design approval: an unregistered local SQL/DCL candidate implementing the fixed cutoff/register and minimal roles/RLS, bounded manual-intake fixed calls/role guards and separately bounded seat-lock candidate, with actual World schema in an isolated non-production PG. Preserve existing Core parsers/current predicates/Worker atomic execution; independently review implementation commit/tree before integration.

Excluded: production migration registration/publication, sole-publisher changes, executor/economic authority expansion, new financial/narrow-transfer intake, private-admission grant/veto removal, World activation, credential provisioning, status promotion, merge/push/deploy. Authorization-writer, private-authority and host contracts retain their named separate owners.

HOLD = PRESERVED
SOLE_OLD_SITE_PUBLISHER = PRESERVED
P0_IMPLEMENTATION_APPROVAL = NOT_GRANTED

## Assessment format validation

The bundled validate-patch-risk-assessment helper returned exit1 initially: "only hold_for_evidence may include an evidence plan". The structured evidencePlan was removed (correction actions remain above), without changing revise/revise or weakening the finding. Final validation returned exit0 with no output.

Validated assessment SHA-256: 6ba44defa58535f5a2ca570191b90a8ef274ba2b6dfe9c2228b8accb0eeaef04.
Final git diff --exit-code returned0 and branch remained codex/world-core-planning. All retained review artifacts are managed outside the subject checkout and Git directories.
