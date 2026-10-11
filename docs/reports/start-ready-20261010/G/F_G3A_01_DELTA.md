# G F-G3A-01 minimal repair delta

2026-10-11 · **IMPLEMENTED_UNVERIFIED / SOURCE_ONLY / UNMOUNTED / HOLD**.
F's independent finding remains pending its delta closure decision. Its P2
priority does not lower the overall P0 boundary or grant fast-track.

## Fixed source and scope

- Original code `a2d59abfc768cc93744a7a2b82af514a7f12c84b` and evidence
  `af005fb71545373542a5bd0565877b37e2580439` remain immutable.
- New code `ea0632c7e8e5e0249ec0a886e05b7867e41e5a58`; tree `96dffcc4b41c077d5a775f5d27a5e40c50ccbeab`;
  parent exactly the original evidence commit.
- Worktree `/Users/samuel/Documents/econclub/.econmind-worktrees/g-constructor-3a-20261010`;
  branch `codex/g-constructor-3a-20261010`.
- Full F review was read; its SHA256 is
  `07aec25a71b653a4f2460f39f950b590c10329acc5087fa8e866bfb529761f38`.
  Its exact path and all three changed file hashes are in
  [F_G3A_01_DELTA_EVIDENCE.json](./F_G3A_01_DELTA_EVIDENCE.json).

The sole product change replaces the source-string truthiness guard with
`sourceConnectionString !== null` before `connection(...)`.
An empty selected source now fails connection validation before any Pool is
allocated. Nonempty invalid source still fails validation; null source still
fails command-route pairing. Reader-only routes still accept null intake/source.

The other two files add the isolated regression file and include it in the
existing strict config. No original test or evidence was rewritten. The host,
private issuer, clock, actor, token, HOLD/default-null behavior, source authority,
consumer, entry/config and economic chains are unchanged.

## Reproduction and acceptance

Before changing the helper, the new ten-case test ran against the original
compiled API: **2 failed / 8 passed**, exit 1. Both empty-source command-route
cases resolved instead of rejecting, reproducing F-G3A-01. The retained red
receipt is explicitly a substantive summary of the tool output, not a claimed
full raw transcript.

The matrix covers office-command and financial-intake separately for empty,
nonempty invalid, null and valid source, plus both reader-only routes. Rejected
partitions assert **zero Pool constructor calls, zero allocated objects and zero
operation callback calls**. Valid command partitions assert exactly three real
lazy pg Pools with maxima **2+2+1**, source non-null, totalCount=0, and ended after
the callback. Reader-only partitions assert one Pool with maximum 2. The
constructor observer returns actual pg Pool objects; it creates no positive
source authority and invokes no native connection or SQL.

Actual final command:

```text
pnpm exec vitest run tests/world-api/G-source-pool-delta.test.ts tests/world-api/G-constructor-3a.test.ts -t 'F-G3A-01|3A fixed route resources'
```

Result: **18 passed / 21 intentionally filtered out**, two files, exit 0.
Ten are the new matrix and eight the existing route/resource controls.
The 21 excluded identity/completion cases are not claimed as delta passes.
The original 61/110 evidence is preserved and was not rerun or relabeled.

New strict config (skipLibCheck=false), scoped ESLint, Prettier on the three
changed files, and git diff --check all exited 0. Commands and outputs, including
the first formatting failure, are retained in the delta evidence JSON.

The first programmatic format call omitted repository configuration and used
double quotes. The first scoped formatting check therefore failed. Resolved
repository configuration restored the correct style through apply_patch; API
was rebuilt and focused checks were actually rerun. This did not broaden the
final product diff.

## Dist provenance and limits

Pinned Node24.20.0 / pnpm12.3.4. API alone was rebuilt, twice around the formatting
repair; Core and Worker were not rebuilt and every one of their dist bytes stayed
equal to the original retained manifest.

The final API build exited 0. Before the final acceptance tests, the complete
432-entry dist manifest was captured in
[F_G3A_01-pre-test-dist-manifest.json](./constructor-3a-checks/F_G3A_01-pre-test-dist-manifest.json).
Compact ordered JSON array SHA256:
`1a6788288e06ebb5031141aa399c035df8c71b5671fd4f6be09d247b82ba10d4`.
After tests, the aggregate matched again. Exactly one entry differs from the
original 3A manifest: `apps/world-api/dist/runtime-preparation/cloudflare-postgres-pools.js`,
5135 bytes, SHA256
`ebd4fc0fe65fd62e5a8b4f74f216d996414de1c1f007bc3045e7696fc8fe362d`.
The other 431 entries, including the public declaration, are unchanged.
The new matrix executes that compiled API helper; existing route controls
execute its source counterpart against unchanged compiled dependencies.

No native connection/SQL, full/420, original61/110 suites, real5s/10s timers,
CI, Linux topology, workerd, new boundary/environment suite, formal admission,
preflight, positive production token issuance/retirement, startup or3B/4A/4B/5
was run. Previous missing-dist provenance and native stall
NOT_ESTABLISHED remain unresolved. No push, merge, deployment, production,
grant, schema, migration, gate/status, map or other owner-file change occurred.

This delta awaits F's independent decision and Root's subsequent disposition.
G stops after handing off immutable code/evidence pins.
