# O — reviewed schema on current main, not production publication

Base: `7f1c05c7bf5b26cd2aae13f25569a4e8852f0c58` (PR117).
Owned branch: `codex/schema-current-main-integration-20261008`.
Source replay tip before CI integration: `640fce1`.

## Fixed reviewed inputs

The five commits replayed from PR114 are `9a7ab541`, `05c61305`, `c709286a`,
`bd5fa0b6`, and `7461a053`. All twelve affected artifact, manifest, policy,
fixture, test and report files are byte-identical to fixed PR114 tip
`7461a053a74131fcc8273a8ac981e28b510ca03c`, including the separately checked
`tests/foundation/snapshot-storage-migration-policy.test.ts`.
Main's later API/Worker/browser source and genuine past failures are preserved.

The registered 0023 source remains immutable
`4714c1da7af9324741996b94c6da036bf54c39a4`, with SQL SHA-256
`0e1ec372429164acb94f9b9588beac75fbf984f5a41413af13715e28a4e94a36`.
Its prior independent schema review, Root selector review/caller-claim correction,
and F's independent `7461a05` filtered-provenance review remain separate evidence.
This integration does not award itself a new independent P0 review.

No SQL was run against production. The exact existing 20/21 staging admission
allowlist and Storage veto are unchanged. `CALLER_READINESS=NOT_READY` remains:
source registration and rehearsal are not actual production caller registration,
`SchemaAdmitted`, formal admission, or economic activation.

## Fresh composed checks

Pinned Node 24.20.0 / pnpm 12.3.4, Root-owned checkout and compiled dependencies.
Direct checks, not a repeated full `pnpm check`:

| Check                                                          | Actual result                                          |
| -------------------------------------------------------------- | ------------------------------------------------------ |
| Exact twelve-file comparison with reviewed PR114               | PASS, zero byte differences                            |
| Migration manifest / artifact / Git provenance                 | PASS, 23 entries, zero violations                      |
| Ephemeral clean-baseline and existing-schema PGlite rehearsals | Both PASS; 23 release rows; productionAccess=false     |
| Filtered execution-chain provenance controls                   | 12 PASS, zero skip                                     |
| Production-posting SQL regressions                             | 22 PASS; one file, 3.38s                               |
| Snapshot/Storage exact-suffix policy                           | 4 PASS; separate invocation, 1.15s                     |
| Public-contract / Pages / schema CI prerequisites              | 4 PASS, 119ms                                          |
| Production-schema strict TypeScript                            | PASS, exit 0                                           |
| Scoped ESLint, Prettier and whitespace                         | PASS, exit 0                                           |
| AST / environment / secret scan                                | PASS; 292 sources / local DB unconfigured / 2178 files |

The first combined Vitest selector used a nonexistent `tests/world-core/` path
for the snapshot policy and therefore ran only the 22 posting tests. It did not
cover that policy; the correct `tests/foundation/` path was subsequently run
separately with four passes. No aggregate claim treats the first call as both.

The twelve Node controls also execute the two serial PGlite rehearsals through
the existing helper import. These are ephemeral PostgreSQL-compatible checks,
not native PostgreSQL renewal evidence or production access.

## Actual CI delta

Trusted no-deploy CI now fetches full Git history before provenance checks and
directly runs the exact reviewed schema, filtered-provenance, snapshot/Storage
and strict schema-type regressions. Triggers include their actual paths.
The additive prerequisite test verifies those inputs, serial file execution,
read-only/no-deploy permissions and absence of production dispatch/credentials.
No existing assertion is weakened or ignored; no `continue-on-error` is added.

The historical PR114 native-renewal failure is not relabeled PASS. A's frozen
renewal fixture compatibility candidate `fe8c4f2` completed B's independent
source-only review: `SOURCE_ONLY_MERGE_APPROVED`, zero new blockers/majors,
23 pure controls passed independently. The report SHA-256 is
`4b70ead0ce7be23aa8a12a98f763ebb99d8c29acf150cb9a9346657e8ed12bb8`.
The seven exact reviewed files were replayed as `a9dbd08`; their four real native
cases are still required. The retained old failed JSON is not a fresh provider
download; its reconstructed original bytes are separately labeled by B.
Root's seven-file comparison was byte-identical to `fe8c4f2`; fresh composed
23 pure controls passed in 2.21s at 15:20:38 Asia/Shanghai, and the focused
strict renewal TypeScript check exited 0. This is still not native renewal.
New provider
results and downloaded receipts must be bound to the final composed candidate.
Source-only merge is held until applicable checks and required review close.
Old PR114 stays separate; no automatic production dispatch or rerun was issued.

## Fresh provider failure and narrow forward correction

PR118 candidate `3bfc5864d1277cac9db86406927a7dcb6adeb821` passed trusted runtime
`37743026353`, native renewal `37743026333`, disposable V09/V10 and Storage-source
checks. Downloaded native JSON independently confirms 4PASS/0FAIL/0SKIP;
actual merge checkout and candidate share tree `e1f1c11842c3557f027e3b93d433bedad1ad09c0`.
Raw JSON SHA-256: `0c998d8a7a03a610cb0287dd6e80f1eb96bbb89b58856eed0a9a34237358a389`.

The whole official check `37743026415` nevertheless **FAILS**:
2676PASS / 1FAIL / 139SKIP, 733.07s. Its sole failure is the legacy
`v09-disposable-postgres-evidence` expectation that the current manifest still
loads as a capped 0021 staging chain. The unchanged loader correctly rejects
the newly registered 0023 suffix. This is not permission to broaden the old
staging allowlist or ignore the failure.

The forward correction changes only that stale positive expectation into an
exact registered-0023 identity check and an actual loader rejection. The same
file's legitimate 20/21 controls, missing/reordered/unknown/repinned rejection,
client-before-policy prohibitions and complete cleanup footprint assertions
remain intact. Runner, selector, staging policy, SQL, roles, source and default
callers are unchanged. The corrected file passed all 14 tests in 1.21s at
15:56:21 Asia/Shanghai; scoped lint and whitespace checks passed.
This test-only correction requires independent narrow closure and a fresh final
provider check before merge; the failed result remains failed.

Configured `pnpm typecheck` passed after the correction, including fresh Core
and Worker builds and all workspace typecheck commands. An extra ad-hoc strict
check of this legacy test with JavaScript inference was **FAIL**, not a new
test-type PASS: five diagnostics in unchanged mock-client/readonly/UUID bodies.
An in-memory TypeScript-host control loaded the immutable `3bfc5864` test at its
original path and found six diagnostics: the same five plus the removed old
mapping's implicit-any parameter. No new diagnostic was introduced. An initial
control wrongly expected equal diagnostic counts and failed; the subsequent
multiset comparison established zero added diagnostics. Neither script/config
nor any unchanged test body was weakened; this does not claim the optional
ad-hoc typecheck passed or excuse any mandatory configured check.
The downloaded whole-check FAIL log is retained separately with SHA-256
`aa4be0c8c4d2cea520f9f8d60da665d11836cb6d5978280ffd80f8062f0b32b8`.

## Subsequent actual failure and fixed main composition

The balanced-renderer exact-chain correction `755dd92` obtained F independent
SOURCE_ONLY approval and was replayed as `9f7ed3547a4f04903a0c2108105d68edda65cc1b`.
Its balanced PGlite check passed 108 batches / 70 countries; UI provenance and
build passed. Native renewal provider `37772932248` yielded a genuinely
downloaded 4 PASS / 0 FAIL / 0 SKIP receipt, SHA256
`8bc4562e05e12f4d37ba313866ad1a47ea0c4f310887ee0aa7fc1f1335a05559`.
Actual merge checkout `2a7a7cfb0bfaa1874cf566a3c5e73f337472e2e7` has the same tree
`8a45ca2406bec7645b7b766181ee6e2568f48e65` as that candidate.

The same candidate's whole official check `37772932185` nevertheless **FAILS**:
2698 assertions PASS / 139 SKIP / 0 assertion FAIL, plus one uncaught Node/Undici
`setTypeOfService EINVAL` attributed to the public runtime lifecycle test.
Zero failing assertions does not make an uncaught exception a successful check.

A's forward five-file test-only cleanup `5fdf93cbc55cc14bcec46b26ca2405a1d7c9c37a`
obtained E independent **APPROVED** for the exact patch. E report SHA256:
`5d0c99d94fecfbe5eb9341200f76319557c046ef85464d04f2ce25201d19b4c0`.
A's original lifecycle 20 and helper 8 passed; E independently ran helper 8
and three additional socket/deadline controls and verified unchanged original
44 expectation-call and five test-definition bytes. The helper consumes bodies,
enforces an absolute deadline and closes each owned native HTTP socket, without
a shared Undici pool, skips, ignored unhandled errors or production edits.
Neither reviewer nor Root claims that the vendor root cause was fully explained.
Final Linux/provider full check remains necessary.

Root composed actual reviewed main PR120 and PR121 (`f4384167cc26aec693f9e40c7ed5caf30da06f43`)
with the schema candidate through normal merges `6e5160a` and `95468d5`, retaining
both additive schema and runtime CI steps and both prerequisite tests. The first
CI union passed five actual prerequisite tests; neither side's assertions were
dropped. A's exact source patch was replayed as `348a9cf`; CI now directly checks
the helper and strict original-test config. No production SQL or startup occurred.
This is a forward candidate, not a reclassification of either old provider FAIL.

Root's new composed helper/prerequisite check passed **13 tests / 2 files**;
configured workspace typecheck (with fresh Core/Worker builds), strict helper
config, focused lint and format passed. Actual authoritative UI check passed
70 source countries, 286 original / 75 derived / 2 visual / 2 boot files and
70 pages / 140 maps, with `economicStateConnected=false`. This is not a fresh
whole local check, native result, final CI receipt or economic activation.
