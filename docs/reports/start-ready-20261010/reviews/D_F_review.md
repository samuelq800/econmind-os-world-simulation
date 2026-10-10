# Independent D review — F native claim recovery evidence

Date: 2026-10-10, Asia/Shanghai. Reviewer: D, not a contributor to F implementation.
Decision: **APPROVED — exact six-file test/evidence candidate only**.
Open blockers: 0. Open majors: 0. Risk remains P0.
Skill recommendation: **merge / human_review_required** (advisory, no merge performed).

## Exact immutable identity

Repository: https://github.com/samuelq800/econmind-os-world-simulation
Base: `42991acfee9d0eacc702ba47a380c938a4516f03`.
Head: `d9853754b3eb2080a5ac4d30c71cae4db013fe0c`.
Head tree: `fb2b1f8fc82a9228f40f38c6b13890ea0b44eea4`.
Parent/native-source commit: `a8210186806b415defbefcc6e0261c18d15ef68c`.
Canonical full-index binary Git diff SHA256:
`4e6f12290237b3383092ae1333782a51086cc683d89d852ffb6d000c167a88bc`.

All six changed files are additions:

- `docs/reports/start-ready-20261010/F/ACCEPTANCE_GAPS.md`
- `docs/reports/start-ready-20261010/F/V09_EVIDENCE_RECEIPT.md`
- `docs/reports/start-ready-20261010/F/V09_SOURCE_INHERITANCE.json`
- `tests/support/f-v09-source-inheritance.mjs`
- `tests/support/tsconfig.f-v09-native-claim.json`
- `tests/world-core/f-v09-native-claim-recovery.test.ts`

No existing runtime, Core, Worker, API, SQL, workflow, dependency, status/gate,
map/CSS or test was modified. Native test SHA256 is
`6dc8a2b42e67e33148b7f5ae8ae02f276f6edc43d69223a41c6a3f192cffcd6f`
at both the parent and head. Subject checkout stayed clean at the supplied head.

## Findings and falsification

| Boundary                 | Counterexample traced                                                                                             | Legitimate control and conclusion                                                                                                                                                                                                                                                                                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CI inheritance           | Bind metadata PR head instead of tested merge checkout, or inherit changed deployment behavior.                   | Raw logs independently show checkout/git-log `ac3123ed43864a4e5214bb907f62e1b73fadb4be`; metadata head is `7ad2313…`. Sandboxed helper reproduces 516 identical blobs, zero deletions and one disclosed HOLD-runner difference. Output byte-equals committed JSON. Head adds six files only, so this base-bound inheritance is not silently applied to changed runtime code. |
| Disposable native target | DSN points to production/another generation or existing schema before test DDL.                                   | Shared environment guard runs before Pool connection; actual read-only host/port/database/role/version/data-directory/socket/system/empty-schema assertions precede mutation. Test source uses genuine pg Pool and PostgresSqlDatabase, not PGlite. Installed DDL is existing hashed 0001..0012, not a new migration/publication.                                            |
| Claim generation         | Reclaim a current claim, reclaim twice, or accept old fence.                                                      | Real recovery coordinator first invokes SQL commit guard; test requires higher-fence CLAIMED attempt2/fence2, then exact confirmed-rollback causes on repeat/current claim and SQL WORLD_WRITER_FENCE_STALE for the old writer. Eleven raw-table footprints must remain identical. Empty economics are explicitly not populated conservation.                                |
| Evidence classification  | Count PGlite9 or skipped fault-runner steps as native coverage, or infer formal startup/TLS from fixture success. | Source and raw metadata confirm PGlite9; marked fault runner/upload were skipped. Receipt retains original failures, explicit skips/UNKNOWN, TEST_ONLY source/roles and staging/TLS limits. Native2 and inherited CI scenarios are separate, not one universal acceptance result.                                                                                            |

No runtime bypass, economic mutation path or weakened existing assertion is introduced.
The default test is opt-in and skips without its exact owned-generation flag. Its
machine/date/PG16.15 target restrictions are intentionally specific to this
bounded local evidence, not a portable formal-host implementation.

Industry section5 is an engineering proposal and specific source-conflict inventory,
not command registration, source adoption, cost/recipe approval or a completed
Industry loop. This review does not authorize those future changes. Historical
ACCEPTANCE_GAPS is expressly superseded where the newer receipt refines it.

## Actual independent checks

1. Immutable Git base/head/tree/parent, six additions, unchanged runtime paths
   and `git diff --check base head`: exit0.
2. Actual head helper in a separate shared-object disposable clone, with
   `env -i`, macOS sandbox denying network and writes outside temporary storage:
   exit0. `cmp` against committed JSON: exit0. Output SHA256
   `b4df014a2a69c74ac39846018f9437c3255076a40893d2f4f1183516af3b830e`.
3. Seven retained producer artifact hashes independently matched the receipt:
   native results, renewal results, official output, both native/renewal CI logs,
   CI metadata and closure receipt. Native JSON is actual2 PASS/0 FAIL/0 SKIP;
   renewal JSON is actual4 PASS/0 FAIL/0 pending.
4. Read original PG log and installed trusted `pg_controldata` read-only:
   PG16.15, system `7694989011588890045`, stopped generation, native stale-fence
   SQL error, and fast shutdown agree with producer evidence. No database was
   restarted, queried over a connection, reset or mutated by the reviewer.
5. Read raw CI checkpoint/results and official uploaded log. Counts3 native
   lease,3 native atomic-recovery,34 PASS/1 SKIP V10.4,9 PGlite recovery and
   historical official3072 PASS/154 SKIP are supported. No old crash/lost-ack
   suite or full suite was rerun.
6. Assessment JSON validated with the plugin's
   `launch_codex_security_mcp --helper validate-patch-risk-assessment`: exit0.

Reviewer source code execution was only the read-only exact-head inheritance
helper, in the constrained disposable clone. Other subject code was inspected,
not executed. No credential, provider/CI dispatch or network retrieval was used.

## Mandatory limits and nonblocking observations

The native2 run used ignored Core dist without a recorded pre-run dist hash.
Later fixed-source build cannot retrospectively bind those bytes. F explicitly
discloses this: native2 is a genuine observed mechanism run with an unchanged
test blob, not fully source-bound exact-head build/runtime acceptance. Approval
of these truthful test/evidence additions does not erase that limitation. If a
later gate requires exact-source native execution, it must obtain appropriately
bound build/runtime evidence then; this review does not declare that gate passed.

Saved CI logs were inspected, not re-fetched from GitHub during this review.
Scoped blob equality does not inherit the entire new candidate tree's CI,
deployment, runtime permissions, source admission, authentic player sessions,
production TLS or formal V09/Gate B. Staging TLS historical FAIL remains unresolved.
No fresh native/CI/full/420/browser/production execution is claimed.

## Risk rubric / disposition

Impact if wrong: **high** (P0 evidence could mislead a later release gate).
Regression likelihood: **low** (additive, unchanged tested/runtime sources and
exact replayed inheritance). Regression protection: **partial**, not strong
(pre-run dist provenance gap; reviewer did not rerun native or formal platforms).
Recoverability: **easy** (revert isolated additions; no production schema/state).
Confidence: **moderate**. Auto-merge excluded by P0 privileged evidence and partial
protection. Not merging risks retaining ambiguous native-vs-PGlite attribution.

This is the independent approval requested for `base42991ac → Fd9853754` only.
It is **not** V09 verification, a Gate B approval, approval of formal hosting/
permissions/migrations, or authorization to integrate unrelated unreviewed work.
Repository governance/status unchanged. No subject edits, commits, push, merge,
deployment, new tasks or production access. STOP.
