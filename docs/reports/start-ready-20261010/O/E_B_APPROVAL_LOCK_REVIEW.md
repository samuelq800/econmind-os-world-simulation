> Presentation copy of an independent review, not a new root review.
> Original source: `/Users/samuel/.codex/state/plugins/codex-security/scans/b-approval-lock-order-20261010/artifacts-4220dc019d02c0a68159eb902784a77cb00a01c8bef481474ef9b3640414c71d/artifacts/E_B_APPROVAL_LOCK_REVIEW/review.md`
> Original raw SHA256: `546859c992399d7825cdcc77d56cebbea7da219d12f11fdab03b9461c96f0459`

# E independent narrow review — B approval lock-order compatibility

Disposition: **APPROVED (source compatibility only)**  
Recommendation: `merge`; workflow: `human_review_required`. This advisory does not merge, deploy, change grants, admit a World or close E-I01. Production HOLD is unchanged.

## Immutable subject

- Checkout: `/Users/samuel/Documents/econclub/.econmind-worktrees/b-approval-lock-order-20261010` (clean before and after review).
- Base: `eb033a4d9e717a9cb9149e450900b606c3457403`; tree `13a60f04c1a9c54eb8ffbaca8b469bf25b293dce`.
- Code: `97ab122d4da146ea20d8d57dac4fd896992b5cec`; tree `95cac687e1b9a4a1deab0e42bbbee1483dcb6634`.
- Evidence tip: `bdbc1c7c5f1d79c6c7ebc1707a9ba75f4ee93d85`; tree `78b9fa7cab2a92653c0a00fd8eee8bb605d548b9`.
- Canonical complete delta SHA256: `fb45613485530061810172fe2c45c2fa6e1d5c47025d540fc2df76c0ce825be9`.
- Canonical code delta SHA256: `6e3b4ab19530cae747c3cd1e06754b9728379b01114b2dc838673ca5bcf5e2d8`.
- Hash command: `git diff --no-ext-diff --binary --full-index --no-renames --no-color BASE HEAD | shasum -a 256`.
- Complete six-file change: one production TS file (+16/-1, eight executable additions), two test/support files, one strict test config, report and evidence JSON. No migration, dependency, grants, caller or economic write changes.
- Producer report SHA256: `34c569b5eeff2d14c160fbb2a7c2dba871a8c78a2f2726902453e681898b2453`.
- Producer evidence JSON SHA256: `57352a6c94418846301e7794e9e4d84008712c8285ac87901f88aa2db0244bdf`.
- Both producer documents were read completely before the source assessment. All 13 source/test/schema bindings independently match. Their code-delta binding was independently recomputed.

## Result and affected boundaries

No change-required defect found in this fixed delta. The helper keeps the existing durable S FOR UPDATE and exact canonical-payload/hash/fingerprint validation, then reads only the same-World H FOR SHARE. Missing, duplicate or wrong-World H denies before downstream approval access. This precedes authority, proposal, signature and implicit FK locks in every owned approval entrypoint.

H SHARE conflicts with H UPDATE and NO KEY UPDATE publishers, while remaining compatible with another SHARE holder. It does not upgrade reservation's lineage H SHARE. Supported H UPDATE callers retain their already-held stronger lock. Approval does not mutate H.

| Actual production path                                          | Existing and patched frontier                                                                                         |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Seller offer: approval-store.ts:471/491                         | durable S UPDATE → new H SHARE → current seller A UPDATE → proposals/signature                                        |
| Buyer TRADE or FINANCE: :579/600                                | durable S UPDATE → new H SHARE → proposals → signer A UPDATE → signatures                                             |
| Finance reference bind: :388/403                                | assertCurrent → S UPDATE → H SHARE → proposals/signatures/current A → immutable reference insert/readback             |
| Caller-owned assertCurrent: :683/700                            | canonical/expiry validation → S UPDATE → H SHARE → approval facts/current A                                           |
| Existing ENQUEUE: postgres-narrow-transfer-intake.ts:186–236    | S UPDATE → H UPDATE → generic A → assertCurrent reentrant S/H → queue                                                 |
| Positive commit: atomic-transition-repository.ts:831–883        | S UPDATE → lease UPDATE + H UPDATE via SQL0005 → generic A → narrow assertCurrent → economic sinks                    |
| Reservation prepare: local-narrow-reservation-worker.ts:191–220 | S UPDATE → same-S SHARE read → lease SHARE → lineage H SHARE → narrow assertCurrent same S/H → candidate construction |

Source ranges are navigation context, not separate pin identities. Lineage head query is durable-v08-ledger-lineage-reader.ts:535–540; SQL0005 guard acquires lease then H UPDATE at :242–265.

First SUBMIT with no S remains H-first and never calls this helper. Missing-S ENQUEUE returns NOT_FOUND; non-writing recovery also returns before approval assertion. The new helper is not a general-purpose initial-intake primitive. No new S-under-H lookup is added to those paths.

The staged API uses the existing approval-store public methods, preserving actor/country/Office checks before dispatch (staged-narrow-transfer-service.ts:400–470). No API/type/export change is introduced. recordZeroEffectReceipt is unchanged; D's separate work is not re-reviewed.

## Boundary challenges

1. H-first writer already owns H and will revoke A: approval must wait before acquiring A or attempting proposal FK-H. The new helper runs before every such sink. Producer six-entry native tests observe a two-query S/H trace and fresh-authority denial after revocation; this is producer attribution, not an independent race run.
2. Reservation already holds H SHARE while another reader holds H SHARE: changing the helper to UPDATE would create an upgrade problem. The actual patch uses SHARE; producer source tests this ordinary two-reader control. Positive commit and existing intake already own H UPDATE and do not downgrade it.
3. Absent/wrong/duplicated H, absent S or canonical mismatch: independent reviewer query-port tests prove denial before approval queries. The legitimate one-row same-World control reaches the fresh A lookup, so the guard is not an unconditional denial.
4. Immutable approval retry after revocation/expiry or changed canonical intent: independent PGlite13 rejects these with no replacement binding. Legitimate three-Office signatures, exact immutable reference retries, rollback and acknowledgement-loss recovery pass.
5. Different Worlds: SQL predicate and returned-row check use the same command.worldId. Producer native source holds another World's H without blocking the reviewed World; no cross-World authority is accepted.

Canonical identity, original SimTime, expiry, Office/country/revision, required TRADE+FINANCE approval, immutable reference identity, staged SUBMIT→approval→ENQUEUE and economic processing are unchanged in the complete production diff. Existing downstream rechecks remain; this review does not certify the real publisher or its source registration.

## Independent execution

Exact-tip detached disposable clone; copied existing frozen dependencies, no install or package scripts. Node24.20.0 and TypeScript6.0.3. Subject child processes have a cleared environment, denied network, denied user-home reads except the pinned Node runtime, and writes restricted to the managed disposable workspace. macOS sandbox profile and reviewer runner are retained beside actual stdout/stderr and checks.json.

| Independent check                         | Actual result                       |
| ----------------------------------------- | ----------------------------------- |
| Core build                                | exit0                               |
| Worker build                              | exit0                               |
| Worker strict typecheck                   | exit0                               |
| New native-test strict typecheck          | exit0, skipLibCheck:false unchanged |
| Existing approval-store PGlite suite      | 13/13 PASS, exit0                   |
| Reviewer-owned SQL-port frontier controls | 18/18 PASS, exit0                   |
| Producer file bindings                    | 13/13 match                         |
| Complete delta whitespace                 | exit0                               |
| Assessment schema validator               | exit0                               |

Reviewer controls are separate supplemental tests, not modifications to the candidate. The 18 tests cover five entrypoints × three invalid-head shapes, missing S, canonical mismatch and valid-head authority lookup. They do not model PostgreSQL scheduling or prove role grants. Existing PGlite suite uses its existing 17-migration fixture, not the native all23 nonadmin fixture.

## Producer evidence — separate attribution

Frozen report/JSON records native16/16, related100/100, and real local HTTP20/20 on PGlite, plus builds/typechecks/lint/format/boundaries/migrations/policy/secrets/environment checks. Native tests apply all23 manifest-bound migrations and use separate nonadmin TEST_ONLY approval/writer roles with explicit test-only policies and column grants. Source assertions, blockers and cleanup were inspected.

These are producer-recorded results, not reviewer reruns; the evidence bindings do not include raw native execution logs. Producer says native ran before the final explanatory-comment addition only, with executable source/tests already equivalent to frozen code. The report accurately preserves its initial 42501 missing test-role UPDATE-column privilege and initial TS2345 diagnostics; later standalone checks are recorded passing, without relaxed flags.

The old SQL control is **source-shaped S→A→implicit FK-H versus H→A**, with one producer-reported native40P01 and rollback. It is not execution of the immutable old API and does not prove a production incident. The competitor is a TEST_ONLY H→A primitive, not A's actual complete-replacement/CAS/current-admin/source/upstream-cutoff writer.

The review skill's no-network/write-confinement rule prevents running the supplied native helper unchanged: it starts a Unix-socket external cluster under its own /private/tmp directory. HTTP also needs network capability. Neither was run by E; no network exception or modified producer fixture was substituted.

## Risk, gaps and freeze

Impact high; likelihood moderate; protection partial; recovery managed; confidence moderate. Auto-merge excluded for privileged concurrency and persistent approval state. Reversion changes no schema/format, but removes protection and must be coordinated with H-first publishers.

Status-quo risk high: the base source has a credible A-before-implicit-FK-H cycle against an H-first publisher. This remains a source inference, not a reported deployed failure.

NOT_RUN independently: native concurrency, HTTP20, related100 as a whole, full420/full check, provider CI, immutable old API execution, actual A writer/source/admin/current-revision/upstream cutoff, deployment ACL/catalog, current-main composition, D zero-effect retest, formal opening/runtime admission, production/deployment, push/merge. F-B-01 is neither repeated nor promoted. E-I01 and production HOLD remain open.

No source/config/grant/status/gate changes; no keys read or emitted. No fixes, push, merge or production operation. Candidate remains at its original tip. This is the frozen source-compatibility decision; later composition is a separate exact-head responsibility.

## User follow-up: main pull

The user permits a pull after confirmation. Read-only inspection found the outer econclub repository has no commits; the World primary checkout is on codex/world-core-planning with pre-existing untracked directories, and its only registered main checkout points to a nonexistent /private/tmp path. No branch switch, worktree pruning, pull, candidate merge or shared-checkout modification was performed. A question was sent to distinguish an origin/main pull into a specified checkout from a candidate/PR merge into main. This ambiguity is separate from the APPROVED review result.
