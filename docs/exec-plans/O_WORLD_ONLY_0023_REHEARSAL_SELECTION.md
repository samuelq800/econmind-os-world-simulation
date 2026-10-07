# Exact World-only 0023 rehearsal selection

2026-10-07 Asia/Shanghai. P0, IMPLEMENTED_UNVERIFIED, PARALLEL_PREPARATION.
Independent review PENDING. No step/gate advancement or production execution.

The Owner authorized completion and normal safe main publication. This increment
prepares only the migration-chain selection needed by F's fixed 0023 proposal;
it does not approve that schema or begin V09.2. Dependency candidate:
`92cb5b9922f1bdb58ea482a65e6b9c2f3d3c487a`, artifact source
`4714c1da7af9324741996b94c6da036bf54c39a4`. Both remain separately reviewable.

## Actual issue and scoped change

`historicalWorldOnlyMigrations` formerly required a manifest of exactly 22 items.
The additive 0023 manifest was correctly rejected, preventing existing World-only
rehearsal callers from selecting the new artifact. The Storage-only 0022 cannot
be executed in a fake Storage schema just to get that rehearsal running.

Keep the historical first 21 entries and the exact immutable Storage veto at
index 21. Admit only the exact 0023 path/id/order/source commit/SHA, World-only
scope, delegated authority, null production approval, no grants and no backfill.
Exclude 0022 from the returned World-only list. Changed identities, arbitrary
suffixes and an added 0024 fail closed. This is not generic future migration
permission. Full manifest/artifact/Git validation remains mandatory in callers.
Old 0001–0022 SQL bytes, production publisher, production-mutation flag, storage
policy exception and runtime schema admission are unchanged.

The existing Storage regression is anchored to the exact veto ID/index rather
than the last manifest row. Its changed-policy/SQL/scope rejection assertions
remain intact when a legitimate later World-only migration exists.

## Actual local evidence

At 23:17:56, pinned Node24.20.0/pnpm12.3.4, no database connection:

- Four policy tests PASS, exit0, 1.97s: complete Git provenance, original exact
  Storage exception/negative cases, historical21/22 compatibility plus exact23
  selection, altered veto/suffix/production metadata and arbitrary24 refusal.
- Scoped ESLint and formatting exit0; whitespace check exit0.
- `GIT_NO_REPLACE_OBJECTS=1 node scripts/validate-migrations.mjs`: 23 artifacts,
  PASS, zero violations. Original immutable source commits are retained.

This is selection/provenance evidence, not DDL rehearsal or a database release.
F's 22-case serial PGlite matrix is separate original evidence. Complete-chain
rehearsal, native PostgreSQL locks/crash/RLS, Storage publication, staging and
production are NOT_RUN here. No linked Supabase, seed, grants, host, Clock,
admission, economic data or old-site business semantics changed.

## Handoff

Review only this three-file immutable increment after F's source-only schema
review. Root must not merge it until independent approval. This helper can select
the exact suffix after full provenance validation, but actual release/staging
callers remain blocked: their unchanged `assertV09StagingMigrationAllowlist`
accepts only 20/21 World entries and rejects the selected 22-entry World chain.
Caller readiness is NOT_READY; a separately governed exact suffix admission and
complete-chain rehearsal are still required. This increment does not widen that
allowlist. Selection never grants production execution permission.
