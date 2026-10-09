# C — Balanced renderer exact 0023 suffix compatibility

Date: 2026-10-08
Status: IMPLEMENTED_UNVERIFIED — independent review pending
Scope: renderer contract compatibility only; no migration/publication or runtime authorization.

## Fixed starting point and failure

- Base: `041e24d7b74de193073032610ae3fb8b95a324ef`.
- Base tree: `99fe39f39089de96ecffe5d7024f058e57992aa5`.
- Branch: `codex/c-renderer-0023-compat`.
- Worktree: `/Users/samuel/Documents/econclub/.econmind-worktrees/c-renderer-0023-compat`.
- GitHub run [37747954469](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/37747954469) was independently read through `gh run view`: completed, conclusion failure, exact base head. The original whole-check FAIL remains FAIL.
- Before editing, the actual existing `scripts/test-balanced-country-candidate-release.mjs` exited 1 with `BALANCED_CANDIDATE_MIGRATION_CHAIN_INVALID` at renderer line 63.
- The complete 23-entry manifest/SQL/Git validation succeeds. The historical World-only selector validates exact 0022/0023 identities, excludes Storage 0022, and returns the 21-entry historical prefix plus 0023. Passing that result to the intentionally capped 20/21 staging allowlist is the compatibility failure.

The candidate commit/tree, report hash and exact patch hash are recorded in the external FREEZE.json after committing this report, avoiding a self-referential identity.

## Minimal implementation and preserved gates

Only the balanced renderer changes: after full current artifact and Git-source validation, call the existing exact historical selector, then pass its first 21 entries to the unchanged staging allowlist. Taking the prefix occurs **after** both validation stages, never instead of them. An unknown 0024 or altered exact suffix still throws before this slice.

The selected migration remains index 18 / release 19 / `0019_world_v2_balanced_candidate_status`. Its schema preflight is the exact original 18-artifact ledger. Current 0022/0023 SQL is validated but not rendered. Original 0021 identity and the historical 20/21 allowlist remain unchanged; the allowlist still refuses the rehearsal result containing 0023.

No edits to migration policy, staging policy, SQL, manifest, 70-country/map/source packages, selection/activation metadata, old site, engine or host. The earlier country renderer requiring an 18-chain was not changed: it is not the failing mandatory balanced path and was already inapplicable to the prior 22-chain.

## Actual bounded checks

Runtime: Node 24.20.0. Existing dependency installation reused by symlink; no install, lockfile or dependency change. Node was invoked directly for these focused checks, not a new full pnpm check.

| Check                                                                       | Actual result                                      |
| --------------------------------------------------------------------------- | -------------------------------------------------- |
| Pre-fix existing balanced rehearsal                                         | FAIL, exit 1, exact line-63 diagnostic retained    |
| New renderer compatibility tests + existing snapshot migration policy tests | PASS, exit 0, 25/25, 42.28 seconds                 |
| Existing balanced release rehearsal                                         | PASS, exit 0, disposable PGlite                    |
| Existing selected-source/map checksum verifier                              | PASS, exit 0, 203 map files; no map-view rendering |
| Full current migration manifest/Git validator                               | PASS, exit 0, all 23 migrations                    |
| Focused strict TypeScript, no skipLibCheck                                  | PASS, exit 0                                       |
| Focused ESLint                                                              | PASS, exit 0                                       |
| Focused Prettier and git diff --check                                       | PASS, exit 0                                       |
| Protected paths compared to base                                            | PASS, no differences                               |

New tests exercise the actual renderer with disposable copies of migration files and real Git provenance, while reading original candidate/source packages. Chains 20, 21, 22 and 23 produce byte-identical schema, batches and final query, identical original migration and source manifest/thread/drift identity, and exact original ledger. Negative cases cover altered prefix ID, target hash/source/path, 0021 metadata, Storage scope, 0023 ID/hash/source/path/schema/scope/order/production approval/grant flag/backfill, and unknown 0024. Actual SQL changes in the historical prefix and 0023 are rejected; recomputing the local hash cannot replace immutable Git-source bytes. A direct historical-selector assertion separately preserves future-suffix rejection.

The existing actual PGlite rehearsal observed 108 batches, max request 417751 bytes, 87 original source artifacts, 278 stored rows, 70 countries, previous candidate preserved, 19 releases, zero opening seeds and zero world heads. It retains partial-import refusal and idempotent replay checks. This is temporary regression execution, not replacement official data or a production mutation.

## Protected original identities

The protected working paths equal the fixed base, including all `database/`, `artifacts/`, selection metadata, map/source inputs, fixed catalog and `supabase/`. The existing selected-source verifier validated all balanced checksum entries and all 203 map files.

| Original                | SHA-256, unchanged                                               |
| ----------------------- | ---------------------------------------------------------------- |
| migration manifest      | e675bd8bd18ba6c51aeffa674320dba3ac79299b7e12eeef834fe28547f9025e |
| 0019 SQL                | 82f7471ddc42cf0a7c0e884cf806f3e20f8424e0f848667cd633a1f7b0f03ccb |
| 0021 SQL                | e5c75c9f731283571680647d0447fd88924bf8a1476f67fe71b7c663ead1f670 |
| 0023 SQL                | 0e1ec372429164acb94f9b9588beac75fbf984f5a41413af13715e28a4e94a36 |
| balanced CHECKSUMS.json | 88dd44478f97d2e8893a4f11b3aaf96e256bdb13248aca0d08f097fabe10d315 |
| balanced countries.json | 5d493e93dfab1425731191ba7491cce47949d176e4769b33fdca48d2d31dba89 |
| map manifest            | 9a83b2de3e0da39dae9e485e8de4be5bf236de26d68937c48c7941d7d50f795f |
| selected-source status  | 41f5bf1f50b761a2346de4190009ce34ffd13072ae1ed21455931566b3c88541 |

## Remaining authority and STOP

No full suite/full official check, native PostgreSQL, all-map-view QA, CI rerun, push, merge, upload, publication, production mutation, opening-seed admission, engine/Clock/420 or Gate B completion is claimed. Original official CI failure is not superseded by focused local PASS. Independent F review and any later integration/CI are separate Root-controlled steps.

Handoff fixed candidate, report/evidence hashes and protected identities to Root for F independent review; C STOP.
