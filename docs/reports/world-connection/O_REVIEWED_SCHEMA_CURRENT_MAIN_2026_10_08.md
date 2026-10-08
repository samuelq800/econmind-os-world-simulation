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
