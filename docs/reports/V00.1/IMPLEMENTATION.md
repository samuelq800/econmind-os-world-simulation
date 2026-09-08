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
