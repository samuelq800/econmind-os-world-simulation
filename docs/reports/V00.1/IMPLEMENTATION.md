# V00.1 Implementation Report

## A. Completed work

- Established a pnpm workspace for three minimal applications:
  `world-web`, `world-api`, and `world-worker`.
- Made application authority explicit: the web application is
  non-authoritative, API mutation authority is disabled, and worker simulation
  is disabled at this foundation stage.
- Added exact runtime/package versions, a deterministic lockfile, and a
  fail-closed preinstall version check.
- Added real lint, format-check, typecheck, test, architecture-boundary,
  environment-safety, repository-secret, and build commands.
- Added tested import boundaries and a deliberately invalid web-to-persistence
  fixture.
- Classified the existing Supabase link as a production integration target and
  added a wrapper that permits only CLI version and status queries.
- Added repository architecture, environment runbook, and V00.1 execution-plan
  documentation.

No V00.2 or later work was performed.

## B. Toolchain decisions

| Component       | Frozen selection                         | Decision                                                                                         |
| --------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Package manager | pnpm 12.3.4                              | Workspace support and deterministic frozen-lockfile installs without adding a task orchestrator. |
| Node.js         | 24.20.0 LTS                              | Exact LTS runtime for browser tooling and both server applications.                              |
| TypeScript      | 6.0.3                                    | Exact shared compiler version compatible with the selected lint stack.                           |
| React           | 19.2.8                                   | Exact frontend runtime version.                                                                  |
| Vite            | 8.2.2                                    | Exact frontend build and development tool.                                                       |
| Test runner     | Vitest 5.0.0                             | Executes TypeScript tests directly and shares the Vite ecosystem.                                |
| Lint            | ESLint 10.10.0, typescript-eslint 8.70.0 | Flat configuration for JavaScript and TypeScript.                                                |
| Formatting      | Prettier 3.9.6                           | Semicolons, single quotes, and trailing commas; CI-style check is non-mutating.                  |

Critical versions are exact in manifests. `.nvmrc`, `.node-version`, `engines`,
`packageManager`, `.npmrc`, and `scripts/verify-toolchain.mjs` prevent accidental
runtime or package-manager mixing. Turborepo/Nx was not added because the current
workspace needs are satisfied by pnpm recursive scripts.

## C. Files changed

### Root and toolchain

- `.env.example`
- `.gitignore`
- `.node-version`
- `.npmrc`
- `.nvmrc`
- `.prettierignore`
- `.prettierrc.json`
- `AGENTS.md`
- `README.md`
- `eslint.config.js`
- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `tsconfig.base.json`
- `vitest.config.ts`

### Applications

- `apps/world-web/index.html`
- `apps/world-web/package.json`
- `apps/world-web/src/App.tsx`
- `apps/world-web/src/main.tsx`
- `apps/world-web/tsconfig.json`
- `apps/world-web/vite.config.ts`
- `apps/world-api/package.json`
- `apps/world-api/src/index.ts`
- `apps/world-api/tsconfig.json`
- `apps/world-api/tsconfig.build.json`
- `apps/world-worker/package.json`
- `apps/world-worker/src/index.ts`
- `apps/world-worker/tsconfig.json`
- `apps/world-worker/tsconfig.build.json`

### Guard scripts and tests

- `scripts/assert-safe-environment.mjs`
- `scripts/boundary-rules.mjs`
- `scripts/check-boundaries.mjs`
- `scripts/check-repository-secrets.mjs`
- `scripts/environment-policy.mjs`
- `scripts/repository-secrets-policy.mjs`
- `scripts/supabase-policy.mjs`
- `scripts/supabase-safe.mjs`
- `scripts/verify-toolchain.mjs`
- `tests/architecture/boundaries.test.ts`
- `tests/architecture/environment-safety.test.ts`
- `tests/fixtures/architecture-invalid/world-web-imports-persistence.ts`
- `tests/foundation/foundation.test.ts`

### Documentation and evidence

- `docs/architecture/REPO_BOUNDARIES.md`
- `docs/exec-plans/V00.1.md`
- `docs/runbooks/ENVIRONMENT_SAFETY.md`
- `docs/reports/V00.1/IMPLEMENTATION.md`
- `docs/reports/V00.1/TEST_EVIDENCE.json`

The pre-existing `supabase/config.toml` link declaration was not changed.

## D. Commands executed

All authoritative validation commands used Node 24.20.0 and pnpm 12.3.4 via an
isolated exact-version launcher.

- `pnpm install`
- `pnpm install --frozen-lockfile`
- `pnpm format`
- `pnpm lint`
- `pnpm format:check`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:boundaries`
- `pnpm env:check`
- `pnpm secrets:check`
- `pnpm build`
- `pnpm check`
- `pnpm supabase:safe -- --version`
- `pnpm supabase:safe -- db push` as an expected-rejection safety probe
- `git diff --check`

The first full check exposed one ESLint `no-useless-assignment` error; it was
fixed. A later check exposed one formatting issue after a guard edit; it was
formatted. The final full check passed.

## E. Environment safety controls

- `.env*` files are ignored except sanitized example templates.
- The example environment contains local loopback endpoints only.
- `pnpm env:check` rejects unsupported environment names, browser-exposed secret
  variable names, and non-loopback database URLs in local/CI modes.
- The local Supabase link is detected but classified as
  `PRODUCTION_INTEGRATION_TARGET_ONLY`, with database mutation disabled.
- `pnpm supabase:safe` accepts only `status` or `--version`; a real `db push`
  argument probe was blocked before the Supabase CLI could perform work.
- `pnpm secrets:check` scans tracked and unignored candidate files for Supabase
  secret keys, JWT-shaped credentials, and private-key material.
- No migration, reset, seed, SQL, schema change, or business-data write ran.

## F. Module boundary controls

- `world-web` is forbidden from importing persistence, API server, worker,
  service-role, and authoritative-settlement modules.
- Future `packages/core` source is forbidden from importing React, React DOM,
  Supabase SDKs, or the UI package.
- The current source scan is executable through `pnpm test:boundaries`.
- Vitest proves a deliberately invalid `world-web` persistence import is found
  and proves React/Supabase imports would be found in future core code.
- API and worker foundation values explicitly keep authoritative behavior off.

## G. What was verified

- Exact toolchain installation and frozen-lockfile reuse.
- ESLint and Prettier checks execute real analysis.
- TypeScript checks all three applications.
- Vitest executes 10 genuine tests across three test files.
- The boundary scanner checks current browser source and tolerates the future
  core root being absent.
- Environment classification and positive/negative safety policy paths.
- Repository credential-shape scan.
- Production builds for all three applications, including a Vite browser bundle.
- The Supabase read-only version path and write-command rejection path.
- No whitespace errors in the candidate diff.

## H. What was NOT verified

- Independent review; therefore the status is `IMPLEMENTED_UNVERIFIED`.
- Any business, economic, Office, World State, settlement, persistence, RLS, or
  database behavior.
- Runtime API/worker servers; V00.1 only compiles their responsibility markers.
- Browser end-to-end behavior, deployment, DNS, or production services.
- Local Supabase service startup or a staging/CI database connection.
- CI-provider execution; the canonical commands were executed locally.

## I. Known limitations

- `packages/core` is deliberately absent until real domain content exists. Its
  import rules are unit-tested now, but live-source scanning begins when the
  package is created.
- The repository Supabase wrapper cannot technically prevent a developer from
  bypassing it with a globally installed CLI. Repository instructions and the
  runbook prohibit that action; stronger remote controls require later
  environment/credential administration.
- The secret scan targets common credential shapes and is not a substitute for a
  dedicated organization-wide secret scanner.
- No CI workflow was added because no CI provider was specified in V00.1.

## J. Architecture decisions still requiring approval

- The task packet names `PLANS.md` and additional R2 workflow documents, but no
  such files were present in the repository or supplied execution pack. Their
  contents were not invented. They should be supplied before work whose routing
  depends on them.
- A dedicated local/CI/staging Supabase topology and credentials must be chosen
  before any future schema work. The production-linked project remains off-limits
  for normal development.

Neither gap blocks independent review of this foundation implementation.

## K. Independent-review readiness

V00.1 is ready for independent review. Its implementation status is
`IMPLEMENTED_UNVERIFIED`, not `VERIFIED`. No `REVIEW.md` was created.

## V00.1 REVIEW BLOCKER FIX ROUND

**Date:** 2026-09-08

**Status after implementation:** `IMPLEMENTED_UNVERIFIED` pending a new
independent review.

### R1 fix — resolved authority boundaries

The boundary scanner now parses JavaScript/TypeScript syntax with the installed
TypeScript compiler API and resolves each module target before applying repository
ownership rules. Relative imports, workspace package names, configured TypeScript
paths, and `.js` specifiers resolving to `.ts` sources are covered. All eight
supported source extensions are scanned: `.ts`, `.tsx`, `.mts`, `.cts`, `.js`,
`.jsx`, `.mjs`, and `.cjs`.

Static imports/exports, import-equals, import types, literal dynamic imports, and
literal `require` calls are inspected. Non-literal dynamic references and
unresolved code imports fail closed. `pnpm test:boundaries` now executes the
CLI-level negative regressions before scanning live source.

### R2 fix — effective Vite browser environment

The actual `world-web` Vite config now loads browser variables through Vite's own
`loadEnv` behavior using the application root and active mode. The config rejects
service-role/server secrets, database administrative credentials, private keys,
and server-only credential namespaces before dev-server startup or build output.
Diagnostics contain names/categories and omit values.

The root environment command also loads the effective `world-web` development
and production environments. Regression tests copy the real Vite config into a
temporary application layout, exercise direct Vite build/dev entry points with
harmless synthetic values, and remove all fixtures in `finally` blocks.

### Changed files in this round

- `.gitignore`
- `apps/world-web/tsconfig.json`
- `apps/world-web/vite.config.ts`
- `package.json`
- `scripts/assert-safe-environment.mjs`
- `scripts/boundary-rules.mjs`
- `scripts/check-boundaries.mjs`
- `scripts/environment-policy.mjs`
- `scripts/vite-environment-policy.d.mts`
- `scripts/vite-environment-policy.mjs`
- `tests/architecture/boundaries.test.ts`
- `tests/architecture/environment-safety.test.ts`
- `tests/architecture/vite-environment.test.ts`
- `docs/architecture/REPO_BOUNDARIES.md`
- `docs/runbooks/ENVIRONMENT_SAFETY.md`
- `docs/reports/V00.1/IMPLEMENTATION.md`
- `docs/reports/V00.1/TEST_EVIDENCE.json`

The independent review file was preserved byte-for-byte and included as the
reviewer's artifact; it was not edited by the blocker-fix implementation.

### New regression coverage

- Direct forbidden workspace/reserved package imports.
- Relative `world-web` to `world-worker` resolution.
- `.js` module syntax resolving to an existing `.ts` target.
- Compact import syntax and `.mts` source traversal.
- TypeScript path aliases, dynamic imports, `require`, and unresolved dynamic
  references.
- Allowed same-layer imports.
- Safe effective Vite environments and legitimate public variables.
- Ignored app-local dotenv service-role variables blocking direct Vite build and
  dev before output, without echoing the synthetic value.

### Commands and observed blocker acceptance results

The exact-version Node 24.20.0/pnpm 12.3.4 launcher was used. Required final
command results are preserved in `TEST_EVIDENCE.json`. Independent negative
acceptance probes during implementation observed:

- relative browser-to-worker import: boundary CLI exit `1`;
- forbidden `.mts` workspace export: boundary CLI exit `1`;
- ignored `apps/world-web/.env.local` with a synthetic service-role variable:
  `pnpm env:check` exit `1`;
- direct `world-web` Vite production build with that variable: exit `1` before
  Vite emitted output; the synthetic value was absent from existing build output.

The temporary source and dotenv acceptance files were removed immediately after
their probes.

### Limitations and deferred findings

- R3 secret-scanner hardening remains a non-blocking follow-up and was not changed.
- R4 `PLANS.md`/R2 governance-file remediation remains required before V00.2 and
  was not performed here.
- R5 manual global Supabase CLI bypass remains the accepted deferred V02 risk.
- Vite-only aliases must also be resolvable through TypeScript configuration;
  otherwise the boundary scanner fails closed with a configuration violation.
- No API/worker economic model exists in V00.1. Later authority rules for actual
  engine packages must be added with those packages rather than invented here.

## V00.1 SECOND REVIEW BLOCKER FIX ROUND

**Date:** 2026-09-08. **Status:** `IMPLEMENTED_UNVERIFIED` pending second
independent re-review. Base commit: `6e99560dfeb5581541388ab6a50252933950abe9`.

### R1-RC1 cause and correction

The first resolver fix classified the whole application as web-owned but scanned
only `src`. An outside-src `.mjs` re-export, accompanied by its `.d.mts`, could
therefore import worker code without a boundary failure.

A central `architecture-ownership.mjs` now defines WORLD_WEB, WORLD_API,
WORLD_WORKER, SHARED_PUBLIC, SERVER_ONLY, UNKNOWN, scan roots, exclusions, and
allowed local edges. All eight governed JS/TS extensions are enumerated across
entire app/package directories. Shared-public source is checked independently,
so declarations and barrels cannot hide executable authority imports. Excluded
build/dependency directories are not allowed as local import targets; unknown
ownership, unresolved local/workspace references, and source symlinks fail closed.

The existing TypeScript AST/resolver remains in use. Workspace mapping supplies
ownership diagnostics without pretending a missing public package resolves.
Vite postfixes are normalized. The exact Vite config and approved environment
helpers have a separate build context, are scanned, and cannot import worker/API
implementation; runtime cannot import these build files. Ordinary installed npm
imports and legitimate Node build imports remain accepted.

A candidate review also exposed Vite glob expansion as an unchecked module
reference. A regression first reproduced the gap. V00.1 now explicitly rejects
`import.meta.glob` pending an approved future resolution policy; no current
product source uses it. This is an additional route through R1, not later work.

### R2-RC1 cause and correction

Blacklist-only key matching accepted a namespaced database connection string.
The shared client policy now uses an explicit public contract plus value
validation. It permits the task-approved `VITE_WORLD_API_URL`, retains the
previously documented API base URL and public Supabase key categories, and
narrowly accepts Vite's internal NODE_ENV marker. Other VITE keys fail closed.

HTTP(S) endpoints cannot contain userinfo, queries, fragments, or control
whitespace. Values are inspected for database connection strings, private-key
material, server credentials, and server JWTs, including encoded forms. Public
Supabase keys must have public structure/role. JWT inspection is structural, not
signature authentication. Native `loadEnv`, root, envDir, mode, interpolation,
and process precedence are unchanged. All direct and canonical entry points
continue to call the same policy. Diagnostics include names/reasons, not values.

Candidate review found that equivalent JWT-header whitespace could evade a
base64-prefix heuristic. A real Vite regression first failed, then passed after
JWT candidates were decoded independently of that prefix.

### Changed files

- New: `scripts/architecture-ownership.mjs`.
- Updated: `scripts/boundary-rules.mjs`, `scripts/check-boundaries.mjs`,
  `scripts/vite-environment-policy.mjs`, `scripts/environment-policy.mjs`.
- New: `tests/architecture/boundary-command.test.ts`.
- Updated: boundary, environment-safety, and Vite-environment regression suites.
- Updated: repository-boundary and environment-safety documentation, this report,
  and `TEST_EVIDENCE.json` with an additional evidence round.
- Preserved and included: the previously untracked independent
  `REVIEW_RECHECK.md`. Neither independent review artifact was edited.

No application business source, dependency version, lockfile, Supabase wrapper,
production configuration, or governance-branch file was changed.

### Validation and regression coverage

The final full suite contains 53 tests in five files, including 28 boundary
regressions, one actual canonical boundary-command integration test, 15 real
Vite tests, seven environment/safety tests, and two foundation tests. The
original direct-import and service-role protections remain covered. New tests
exercise outside-src re-exports and alternate extensions, shared-public
intermediaries, unknown/excluded ownership, build/runtime separation, glob
rejection, the actual pnpm boundary command, unknown client keys, unsafe allowed
URL values, process/dotenv loading, native precedence/interpolation, server-token
representations, and redacted diagnostics. Fixtures are removed after expected
or unexpected assertion failures; Vite fixture creation also cleans up on error.

All required command results and the separately reproduced negative acceptance
cases are recorded in `second_review_blocker_fix_round` in `TEST_EVIDENCE.json`.
Raw local logs are retained separately; synthetic attack source/env files are
not committed. Final normal builds replace any test build artifacts.

### Limitations and deferred findings

The scanner is a static repository ownership control, not a third-party npm
security audit or a full economic dependency graph. New package owners, Vite
aliases, glob loaders, and new public environment keys need an explicit policy
and appropriate regressions when introduced. No existing economic model or
database behavior is claimed by these checks.

R3 secret-scanner hardening remains deferred and its implementation is unchanged.
R4 governance synchronization is handled independently on a separate branch;
this task does not modify that branch or claim the gap resolved. V00.2 must wait
for governance sync and technical approval. R5 global CLI/environment isolation
remains the accepted V02 deferred risk. The linked Supabase project remains
`PRODUCTION_INTEGRATION_TARGET_ONLY`; no mutation or deployment was performed.

Passing implementation validation does not promote V00.1. Request second
independent re-review of the new immutable commit. Do not start V00.2.
