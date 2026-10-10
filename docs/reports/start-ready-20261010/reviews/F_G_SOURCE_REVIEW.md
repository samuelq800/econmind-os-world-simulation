# F independent review — G slices 1/2 (2026-10-10)

Decision: **CHANGES_REQUIRED**. Patch-risk recommendation/workflow: **revise / revise**. No merge, activation, deployment, or six-Office completion approval.

## Fixed objects and scope

- Repository: econmind-os-world-simulation only.
- Worktree: /Users/samuel/Documents/econclub/.econmind-worktrees/g-nonactivated-runtime-api-host
- Base/parent: `f19e8bad4983ae0cd247182b8ce9a0f74315a03d`
- Product: `89c4446722a22b990c410dbc5726eb1a1208fd1a`
- Product tree: `1c645b99de2cd3f608d7ebc980a2780aba320e29`
- Evidence tip: `324906488e2c0ca7d8be70067f55085a281ab766`
- Evidence tree: `b08add361aeba12ebc1583d836eca51b7b465632`
- Exact full-index binary product patch SHA256: `a94726f596ec62a0b2f370617c48a1570f1aea6d71b925d00b5aaba187123098`
- Product scope: 25 files, 19 product + 6 test/support, +4296/-141. Evidence tip adds exactly 17 report/check files; all 25 product files are byte-identical between product and evidence tip.
- B design review read fully; SHA256 `70680ef80cfabfb8d778e8d92c1ef5d45976ad8e67cce2395cddfb032b23ad13`.
- Underlying G IMPLEMENTATION_DESIGN.md at base read fully; SHA256 `6c3244d1c6f03bf42f0ead6b949f91810bbc34c4cd6b5b2313b525e319d51c65`.
- G SLICES_1_2_IMPLEMENTATION.md SHA256 `3b58b623923138073a296136670c5becccc9a1fa90257c9a4f0d41749c38f322`.
- G SLICES_1_2_EVIDENCE.json SHA256 `3370dfc9f30845e7ed9a7e934c5d0eb58f1c1c0bc4143fa725cf0d2ffd8544f0`.

This review covers only G slices 1/2. It does not review/authorize constructors 3/4, Clock/consumer/workerd slice 5, production admission, HOLD-file changes, or formal adoption. Subject was preserved; final evidence tip was clean. No implementation edits, Git commit/push, grants, full-suite rerun, production access, merge or deployment were performed.

## Required corrections

### F-G-01 — P1 — Bind financial success states to original action

Location: `apps/world-api/src/runtime-preparation/bounded-executor-transport.ts:633-667` (especially 649-654).

The reply validator checks state shape, identity and fingerprint but not whether that state can result from the original action. The forwarder trusts this predicate before returning upstream status/body.

Two deterministic exact-source controls demonstrate acceptance of unsupported successful replies:

| Request            | Reply state               | Actual validator | Required                  |
| ------------------ | ------------------------- | ---------------- | ------------------------- |
| SIGN_BUYER_FINANCE | SIGNATURE_RECORDED        | true             | true (legitimate control) |
| SIGN_BUYER_FINANCE | INTENT                    | true             | false                     |
| BIND_REFERENCE     | SIGNATURE_RECORDED        | true             | false                     |
| Wrong subject      | otherwise valid signature | false            | false (identity control)  |

Independent contract: existing `staged-narrow-transfer-service.ts:387-397` returns INTENT only for INSPECT; :441-455 returns REFERENCE_BOUND for BIND_REFERENCE; :461-473 returns SIGNATURE_RECORDED for signing. At :375, an absent command legitimately produces NOT_FOUND for any non-REGISTER action; do not accidentally reject this branch.

Consequence: a mismatched but structurally valid reply after write dispatch can escape as HTTP success rather than invalid-upstream → WRITE_OUTCOME_UNKNOWN, retryable:false. This is a protocol/outcome classification defect, not a demonstrated privilege escalation, economic mutation or live exploit.

Minimum correction: derive an exhaustive action/state matrix from the existing staged service and Core Office-action contract (8 distinct actions; valid Office/action pairs also matter), enforce it in validateReply, and add focused legal/illegal action-state controls. Preserve legitimate NOT_FOUND, original financial UNKNOWN/retryability and definite 401/403/409 behavior. Do not add economic families.

Independent execution used the exact archived unmodified TypeScript source through Node transform/VM, only validateReply and its completion-module dependency. Parser ports were stubbed to throw if invoked; no parser, JWT, SQL or whole-handler success is claimed. The isolated execution had no network/credentials. Reproducer exit 0 means the expected defect was reproduced, not that the property passed.

### F-G-02 — P2 — Restore approved current-seat request cap

Location: `apps/world-api/src/runtime-preparation/current-seat-fetch-handler.ts:99`.

Implementation passes 2048 to boundedBytes. B-approved design §3 fixes current-seat at 1024 bytes. A valid JSON request padded with whitespace into 1025–2048 bytes can pass parsing and proceed toward JWT/SQL instead of the prescribed pre-I/O 413. This is established directly from source and approved design; no independent runtime body-cap test was run.

Minimum correction: use 1024 and cover exact 1024/1025 boundaries, including streamed bytes/whitespace and zero JWT/SQL dispatch on over-limit input. A deliberate budget change needs explicit design amendment; this review does not approve 2048.

## Role completeness — explicit owner requirement

The owner requires all roles, not Finance alone. This candidate must not be reported as fulfilling that requirement.

| Office       | What this slice supports/proves                                                      | What it does not prove                                                        |
| ------------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| FINANCE      | Existing staged inspection, buyer Finance signature, reference binding remain reused | Complete Finance economic workflows or production activation                  |
| TRADE        | Existing register/inspect/seller/buyer Trade signature/enqueue/read remain reused    | Complete Trade lifecycle or delivery/settlement acceptance                    |
| CAPTAIN      | Original manual family intent/recovery path                                          | Complete Captain role product                                                 |
| CENTRAL_BANK | Original manual OMO intent/recovery path                                             | Complete monetary-policy role product                                         |
| SOCIAL       | Original manual family intent/recovery path                                          | Complete Social role product                                                  |
| INDUSTRY     | Can be represented only when a real current authorized seat/binding exists           | No new Industry executable family or complete Industry workflow in slices 1/2 |

Current-seat can enumerate up to six real Office bindings in one coherent snapshot. That is not six-Office business construction. Recovery supports exactly the three original manual families; financial uses its existing READ/INSPECT and narrow FINAL path. No unsupported Office capability may be fabricated. Full six-role workflow coverage remains an explicit downstream acceptance requirement, subject to separately authorized work.

## Traced boundaries and protective factors

- Fixed external/internal path mapping, no query/alias/trailing path dispatch, server-owned binding, no ambient command-fetch fallback. Original bytes and bearer preserved; unallowed external headers dropped.
- Real JWT is verified before API dispatch and again by original executor-side services. Fixed World, subject, model/seed/admission pins and current authority remain server-resolved.
- Current-seat enumerates distinct active assignments (multiple capabilities do not create false duplicates), rejects cross-country/team/revision and duplicate Offices, and resolves every binding at current head using original provider/admission/entitlement checks.
- Recovery now resolves all active Offices before selecting the requested Office; a missing other Office seat fails closed. It reads exact persisted original subject/intent/command/idempotency/fingerprint and only matching queue/receipt, in the same read-only repeatable snapshot.
- No NOT_FOUND from transport failure; no automatic command retry/new ID; no new economic COMMITTED claim. Invalid upstream response bodies are cancelled/drained. Original financial authentication and UNKNOWN semantics remain, subject to F-G-01.
- Completion tracking joins actual task/late fetch/connect/query promises and owned pool closure for supported finite ports. Timeout races do not silently detach writes. The five-second cleanup tail only marks uncertainty; it does not enforce finite termination of an arbitrary never-settling port.
- Shared read-binding compatibility and extracted original Worker intent helpers were traced, not called dead solely because new host factories are unmounted. Core exports remain pure DTOs; no browser import of server implementation.

## Evidence actually reviewed versus independently executed

Independently verified all 25 manifest file hashes/byte counts, product/evidence equality, exact report/JSON/B hashes, and raw-check bytes. Retained pin/raw receipt contains their contents and hashes.

Provided immutable logs, inspected but NOT rerun by F:

| Group                              | Reported pass count |
| ---------------------------------- | ------------------- |
| Focused, including 22 native cases | 37                  |
| Real budgets                       | 2                   |
| Existing regressions               | 140                 |
| Native financial rollback          | 8                   |
| Boundary groups                    | 40                  |
| Total                              | 227                 |

All 15 raw check files were reviewed. They also report relevant build, strict/type, lint, format, boundary/pattern, secrets, safe-environment, diff and packet checks passing. Safe environment states NOT_LINKED/databaseConfigured:false. These are local evidence, not CI, production, source admission or Gate B.

Native tests use real local PG16 with Unix sockets/TCP off. They observe repeatable read-only snapshots, denied write permissions, multi-Office authority conflicts/revocation/missing projection/admission/seat, subject/key/fingerprint isolation, real queue/claimed reads and fixture-finalized rejected receipts. Manual FINAL fixtures do not prove actual economic COMMITTED settlement. Financial register/ack-loss and real query cancellation/pool closure are locally exercised.

Real-budget logs cover 5s body rejection before JWT/SQL/dispatch and a finite 10s cancellation/late source completion case. They do not prove universal hard 10s response or 5s cleanup termination.

Independent F checks: identity/hash/source inspection, base..product diff check, and four narrow validateReply controls above. No native/full/420/CI/platform/production rerun.

## Failure history and unresolved limits (retained, not erased)

- G's retired monkeypatch timeout and afterAll database-in-use root cause is **NOT established**. Later real adapter passing does not erase it. Packet contains selected historic diagnostics, not complete historic raw logs; F did not rerun cleanup.
- Earlier multiple-capability and lease fixture errors were corrected; actual missing-other-Office-seat recovery defect was fixed with coverage retained.
- Earlier acknowledgement-loss fixture hit the authentication COMMIT instead of submission COMMIT; refined fixture targets actual submission and retains prior failure.
- F's initial helper failed before executing controls because strip-only mode could not handle TypeScript parameter properties. Helper changed to transform mode only; product untouched. Initial error retained.
- Native fixture imports Worker dist; no pre-run exact built-dist manifest/order receipt is included. Source pins are exact, but source pins alone are not compiled-byte provenance. Stale dist is not established.
- Arbitrary never-settling injected ports are unsupported. Hidden extra source-pool ownership remains a later constructor dependency. No cleanup-failure case is claimed fully drained.
- Private local admission/grants/source test mechanisms do not create formal runtime authority.
- Formal six-role construction, real host/platform, lease/Clock/consumer startup, all production/activation/merge/deployment gates remain NOT_RUN/out of scope.

## Risk and handoff

Impact high; regression likelihood high; protection partial; recoverability easy while unmounted; confidence moderate globally, high for the two concrete source defects. Exact-head checks do not support approval because the independent action-state safety property fails. Privileged/public-contract changes preclude auto-merge. Status-quo risk moderate: planned integration stays incomplete, but no evidence requires adopting a known protocol mismatch.

Required next candidate: bounded validator + current-seat cap corrections, focused tests, updated fixed evidence and independent re-review. Do not broaden to slices 3/4/5, economic logic, authority issuance, migrations, HOLD files or full-suite reruns solely for these findings.

Managed artifacts alongside this report:

- assessment.json (schema validated; validity is not product approval)
- subject.patch
- pin-and-raw-evidence.json
- independent-wire-control.mjs / independent-wire-control.json
- independent-control-initial-error.json

All reviewer artifacts are outside subject checkout/Git metadata. No status/progress update. STOP after immutable handoff.
