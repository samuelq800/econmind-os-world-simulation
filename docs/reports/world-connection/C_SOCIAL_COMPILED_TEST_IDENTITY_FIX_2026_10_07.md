# C — SOC-1 compiled Core test identity CI repair

## Status and identity

`IMPLEMENTED_UNVERIFIED`; B named closure pending. Test-integrity repair for the
P0 SOC candidate, not new economic implementation, runtime acceptance or permission
to downgrade the parent boundary. No main/PR/push/release action.

Base Root PR114 local candidate: `13fd4ce820d5c5a9296c9a3cc9bc2ece32ef8fe5`,
tree `02e2a24a9c91b9f6c9d8f665ee346eff9d3de6bb`.
Branch `codex/c-social-compiled-test-identity`; checkout
`/Users/samuel/Documents/econclub/.econmind-worktrees/c-social-compiled-test-identity`.
Final immutable commit/tree, byte/blob hashes and raw logs are supplied by the
external handoff after committing this report. Original `087cb859` stays frozen.

## Implemented scope

Four files only: this report and the three existing SOC test/config files.

- Test imports Core from actual `@econmind/core` instead of relative `src/index.js`.
- Dedicated Vitest config removes its `@econmind/core → src/index.ts` alias.
- Dedicated type config removes its matching source `paths` override.

Worker test modules continue using their existing compiled `@econmind/core` imports.
All fixture constructors, numeric instances, hashes, command parsers, authorization
proofs and actual candidate factory now use the same compiled Core identity in
default and scoped test runs. No internal-only import or new public export was needed.
Test body changes: NONE; all 31 cases, expected errors and assertions are unchanged,
including the genuine 1066 gaps and missing automatic authority/read state checks.

## Cause and actual validation

Before editing, the requested base was reproduced with default `vitest.config.ts`:
31 total, 26 PASS / 5 FAIL, exit1, at 23:36:09 Asia/Shanghai. The five cases were
official rejection of TEST_ONLY, real 1066 missing-state refusal, genuine-proof
plan/due candidate, reader MISSING_OPERATING_STATE and missing automatic/fake
preparation. They failed early with `Canonical serialization accepts plain domain
records only`, rather than reaching their asserted domain outcomes: test source
Core instances and Worker compiled Core instances were distinct module identities.
The old alias configuration concealed this default-run mismatch. Initial FAIL is
retained alongside final PASS, not relabeled or excused by prior scoped approval.

Actual pinned Node24.20.0 / pnpm12.3.4. Core compiled from this exact checkout/base
using `tsc -p packages/core/tsconfig.build.json` (exit0); no other app was built.
Package resolution is this checkout's `packages/core/dist/index.js`, not another
chat's workspace package or source alias. Third-party packages are read-only reused;
own workspace link/builds/Vite caches remain local. Frozen lockfile unchanged.

Actual commands, local, final three-file source:

- `node node_modules/vitest/vitest.mjs run tests/world-core/c-social-employment-service.test.ts`:
  default config, 31/31 PASS, exit0, 23:36:38, duration2.72s.
- Same command with `--config tests/support/vitest.c-social-employment-service.ts`:
  scoped config, 31/31 PASS, exit0, 23:36:41, duration3.53s.
- Focused `tsc ... --noEmit`: PASS exit0.
- Scoped ESLint and Prettier: PASS exit0.
- Exact tracked delta/application-scope checks: test file has one import-line
  replacement only; no apps/packages/default config/lockfile/status changes.

These are the default **runner/config** and scoped SOC selections. Full `pnpm test`
pretest/all-suite/CI, other old75 tests, Worker/API builds, native PG, official state
and browser/production tests were NOT_RUN; no broader pass is claimed.

## Safety, evidence gaps and stop

Only a sparse worktree was created because initial free disk was248MiB; no map
asset copy or full install. Initial no-checkout index was not yet populated, so
first setup attempts found no tsconfig/test. That setup failure is retained; the
new own index was populated from HEAD with sparse rules before any edits. It did
not remove or overwrite other worktrees/files.

No application logic, canonical guard, public Core authority, test assertion,
skip/ignore, 1066 gap counterexample, permission, seed/admission, automatic
grant/publisher, reader, intake/dispatcher, host/schema/DB or production change.
The prior `SOCIAL_ADMITTED_OPERATING_OPENING_CARRIER_MISSING` source blocker
and original1066 NOT_READY/STOP are unchanged. This CI repair does not clear them.

Root receives the fixed four-file delta plus baseline/final raw evidence for B's
named closure. No independent approval is self-awarded. STOP after handoff; no
merge/push/retry of GitHub failure or further source reconstruction.
