# V00.1 Independent Review

## Reviewed Commit

- Decision: **CHANGES_REQUIRED**.
- Target and actual HEAD: `103d0fa00805518eae557ea0f143a3b32c023d2b`.
- Review date: 2026-09-08; reproduced checks approximately 01:21–01:25 UTC.
- Repository: `/Users/samuel/Documents/econclub/econmind-os-world-simulation`.
- `git status --porcelain` was empty before review. Both initial and final
  `git ls-remote origin refs/heads/main` returned the target commit. No later
  implementation delta was present.
- The only change made to the original repository by this review is this file.
  No implementation fixes, commits, remote pushes, or database operations were
  performed by the reviewer.

## Review Scope

Reviewed all application sources, package scripts, toolchain configuration,
guard scripts, tests, ignore rules, Supabase configuration, execution plan,
implementation report, test evidence, architecture document, and environment
runbook at the target commit. Implementation claims were checked against code
and new execution results.

Re-read the relevant Constitution sections, including authority separation,
fail-closed behavior, environment isolation, and test integrity. Independently
hashed both supplied Constitution files: `requirements.docx` and the execution
pack original have identical SHA-256
`960a7745a8e18b8f1cb10c754ce6681d46bdfc5933a979c4a989bd3a07ff5d49`.

A separate local clone with detached HEAD at the target was created at
`/tmp/econmind-v001-review.rGViTh/repo`. It initially contained no dependencies,
build output, or local Supabase linkage. Clean baseline checks preceded all
negative fixtures. Adversarial fixtures and a harness were created only in this
temporary review area. They used synthetic values and never production secrets.

## Evidence Reproduced

All pnpm commands below used the exact-version launcher:

```sh
npx --yes --package=node@24.20.0 --package=pnpm@12.3.4 --call '<command>'
```

Observed runtime: Node `v24.20.0`, pnpm `12.3.4`, macOS ARM64. The following
baseline results refer to the pristine temporary clone unless otherwise stated.

| Command / check                       | Observed result          | Exit | Evidence                                                                                                                  |
| ------------------------------------- | ------------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`      | PASS                     | 0    | Installed 141 packages into the clean clone; preinstall verified the exact runtime and manager.                           |
| `pnpm install`                        | PASS                     | 0    | Subsequent ordinary install accepted the same lockfile.                                                                   |
| `pnpm lint`                           | PASS                     | 0    | ESLint ran within the aggregate gate.                                                                                     |
| `pnpm format:check`                   | PASS                     | 0    | Prettier checked the committed files.                                                                                     |
| `pnpm typecheck`                      | PASS                     | 0    | TypeScript ran for all three applications.                                                                                |
| `pnpm test`                           | PASS                     | 0    | Three test files, ten tests passed.                                                                                       |
| `pnpm test:boundaries`                | PASS on baseline         | 0    | Two live browser files scanned; absent future core root skipped. See R1 for missed violations.                            |
| `pnpm env:check`                      | PASS on baseline         | 0    | Temporary clone reported NOT_LINKED; original checkout independently reported PRODUCTION_INTEGRATION_TARGET_ONLY. See R2. |
| `pnpm secrets:check`                  | PASS on baseline         | 0    | 48 tracked/unignored files enumerated, no matching credential shapes.                                                     |
| `pnpm build`                          | PASS                     | 0    | API and worker compiled; Vite transformed 15 modules and emitted the browser bundle.                                      |
| `pnpm check`                          | PASS on baseline         | 0    | All eight constituent checks ran successfully at approximately 01:21:25 UTC.                                              |
| `pnpm supabase:safe -- --version`     | PASS                     | 0    | Original checkout reported global Supabase CLI 2.116.0.                                                                   |
| `pnpm supabase:safe -- db push`       | PASS, expected rejection | 2    | Original checkout wrapper rejected arguments before spawning Supabase. No push was executed.                              |
| `git diff --check`                    | PASS                     | 0    | No baseline whitespace errors.                                                                                            |
| Lockfile/workspace diff after install | PASS                     | 0    | `pnpm-lock.yaml` and `pnpm-workspace.yaml` unchanged.                                                                     |

Fresh dependency installation reused the pnpm content-addressed cache; this was
a clean checkout/install, not a fresh network/cache download. No source or
dependency directories from the original application checkout were copied.

Additional independently exercised negative controls:

- Exact Node plus correct pnpm user-agent: toolchain guard exit 0.
- Exact Node plus npm or wrong pnpm user-agent: guard exit 1.
- Host Node 26.5.0: guard exit 1, explicitly identifying the runtime mismatch.
- Process-level browser service-role variable: environment guard exit 1.
- Remote `DATABASE_URL` with local environment: environment guard exit 1.
- Named persistence import in a temporary `.ts` source: boundary CLI exit 1.
- Relative import of the existing worker source: boundary CLI exit 0, incorrectly.
- Named forbidden import in `.mts`: boundary CLI exit 0, scanning only the two
  original files. A separate build did fail on the nonexistent package, so this
  probe establishes a scanner omission, not a successful complete build bypass.
- A synthetic Supabase secret in a force-staged `.env.review-probe` in the
  temporary clone: secret CLI exit 1, reporting only its filename and pattern.
- Supabase-secret, JWT, and private-key synthetic strings were detected by the
  secret policy; GitHub token and password-bearing database URL strings were not.
- Temporary `.env.local` browser-secret fixture plus a browser reference passed
  the entire `pnpm check` and appeared in generated JavaScript. See R2.

## Findings

### R1 — Import boundary checks accept ordinary forbidden imports

- **Severity:** MAJOR — blocks approval.
- **File / location:** `scripts/boundary-rules.mjs:1–38`;
  `scripts/check-boundaries.mjs:11–31`.
- **Description:** The guard checks a short list of raw import strings rather
  than resolved module ownership. It does not resolve relative paths or aliases,
  misses valid compact import syntax, and does not traverse `.mts`, `.cts`, or
  `.cjs`. This fails the review requirement that ordinary imports and alternate
  extensions cannot trivially bypass the boundary.
- **Evidence:** The CLI rejected a spaced named import from
  `@econmind/persistence` with exit 1. Replacing that fixture with
  `import { getWorkerFoundationStatus } from '../../world-worker/src/index.js';`
  returned PASS/exit 0 while scanning three files. Direct policy probes also
  returned no violations for `import{x}from'@econmind/persistence';` and
  `@worker/index`. No such alias is configured in the current baseline; the alias
  result documents lack of resolution, not a current executable alias path.
  A `.mts` fixture containing the known forbidden package was entirely omitted.
- **Required action:** Parse supported import/export syntax and check resolved
  module ownership, including relative paths, configured aliases, and supported
  source extensions. Reject unsupported resolution cases explicitly when they
  affect an authority boundary. Add CLI-level positive and negative regressions
  for these cases. A full future engine graph is not required for this fix.

### R2 — Browser-secret environment files bypass the complete quality gate

- **Severity:** MAJOR — blocks approval.
- **File / location:** `scripts/assert-safe-environment.mjs:12`;
  `scripts/environment-policy.mjs:17–24`; `apps/world-web/vite.config.ts:4–6`;
  root `package.json:13–24`; `apps/world-web/package.json:7–8`.
- **Description:** The environment guard reads only `process.env`. Vite
  independently loads app-level dotenv files, which are normally ignored by Git
  and consequently excluded from the repository secret scan. Vite configuration
  does not validate the effective browser environment, and direct build/dev
  commands do not invoke an environment guard. A developer can therefore expose
  a service-role variable while every canonical check reports success.
- **Evidence:** In the temporary clone only, added
  `apps/world-web/.env.local` containing
  `VITE_SUPABASE_SERVICE_ROLE_KEY=review-only-dummy-never-real` and a JSX reference
  to `import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY`. Vite `loadEnv('production',
appDirectory, 'VITE_')` found the variable. At approximately 01:23:01 UTC,
  `pnpm check` exited 0 with all ten tests passing. `rg -l` found the dummy marker
  in `apps/world-web/dist/assets/index-C-HeiOTR.js`. No real credential was used
  or disclosed, and the original application sources were untouched.
- **Required action:** Validate the effective environment with the same root,
  mode, precedence, and dotenv loading behavior as Vite. Enforce the policy at
  both build and dev entry points, covering direct workspace commands as well as
  the root aggregate command. Add a regression using an ignored dotenv file and
  a harmless synthetic credential; forbidden browser variables must fail before
  serving or emitting browser code. Do not print values in diagnostics.

### R3 — Secret scan has limited coverage and silently skips read failures

- **Severity:** MINOR — hardening/documentation follow-up; not an additional
  approval blocker for this credential-free foundation.
- **File / location:** `scripts/repository-secrets-policy.mjs:1–10`;
  `scripts/check-repository-secrets.mjs:17–23`.
- **Description:** The policy covers Supabase secret keys, JWT-like credentials,
  and three private-key header forms. It does not cover common GitHub/personal
  tokens, password-bearing database URLs, or encrypted private-key headers.
  Enumeration includes tracked dotenv files, but read errors and NUL-containing
  files are silently skipped; `scannedFiles` counts enumerated files rather than
  successfully inspected files. This is a bounded pattern scan, not proof of no
  secrets.
- **Evidence:** Synthetic pattern probes detected the documented three families
  and missed a GitHub token and password-bearing database URL. A force-staged
  dotenv fixture correctly produced exit 1. The read-error skip is directly
  visible in the source; an unreadable-file scenario was not executed.
- **Required action:** Distinguish enumerated, inspected, skipped, and failed
  files; fail on unexpected unreadable candidate files or explicitly justify
  exclusions. Document supported credential families and add patterns appropriate
  to the project's actual GitHub/database credentials before those are introduced.

### R4 — GOVERNANCE_FILE_GAP must be repaired before V00.2

- **Severity:** MINOR — next-stage governance prerequisite.
- **File / location:** Missing repository `PLANS.md` and separately identified R2
  control documents; `AGENTS.md:10–13`; implementation report section J.
- **Description:** The gap is real in the reviewed repository and supplied pack.
  The repository records the gap, but it does not contain the authoritative
  missing material. Independent technical review can still use the explicit
  V00.1 task and review packets.
- **Evidence:** File inventory and filename/content searches across the
  repository, supplied execution pack, and supplied Desktop specification folder
  found the execution plan and ordinary planning files, but no `PLANS.md` or
  additional R2 control files. This is not a claim about inaccessible locations.
- **Required action:** Supply the authoritative files and reconcile their
  execution/review routing before V00.2 planning or execution. Do not invent
  missing contents. Classification: option B in the review request; this gap
  alone does not invalidate V00.1's technical foundation.

### R5 — Global Supabase CLI bypass is an acceptable deferred risk

- **Severity:** INFO.
- **File / location:** `scripts/supabase-safe.mjs:17–27`;
  `docs/runbooks/ENVIRONMENT_SAFETY.md`; execution pack
  `planning/03_33个工作包与依赖.md`, V02 section.
- **Description:** The wrapper cannot control a manually invoked global CLI.
  This is documented. Its allowed version/status operations depend on an
  externally installed, unpinned Supabase CLI, while dependency installation,
  tests, and builds do not depend on that CLI.
- **Evidence:** The current global CLI reports 2.116.0. The push argument probe
  exits 2 before spawning it. Reviewed normal application commands contain no
  production mutation paths. The supplied V02 definition explicitly owns local
  Supabase, ephemeral CI databases, independent staging, environment fingerprints,
  and the sole database release chain.
- **Required action:** Carry the documented limitation into V02 and establish
  isolated credentials/environments there. Document the optional CLI prerequisite
  in onboarding. Classification: **ACCEPTABLE_DEFERRED_RISK** for V00.1. This
  acceptance does not excuse the browser environment bypass in R2.

## Toolchain Assessment

The exact versions are consistent between the root/workspace manifests and the
lockfile. Fresh local installation and actual compiler, linter, test, and build
execution reproduced compatibility. No rejection is based on version novelty.

Inspected installed package metadata independently:

- TypeScript 6.0.3 requires Node >=14.17.
- Vite 8.2.2 and React plugin 6.1.1 accept Node ^20.19.0 or >=22.12.0;
  the plugin accepts Vite ^8.0.0.
- React DOM 19.2.8 requires React ^19.2.8; installed React is 19.2.8.
- Vitest 5.0.0 accepts Node ^24.0.0 and Vite ^8.0.0.
- ESLint 10.10.0 accepts Node >=24; typescript-eslint 8.70.0 accepts ESLint
  ^10.0.0 and TypeScript >=4.8.4 <6.1.0.
- Prettier 3.9.6 accepts Node >=14.

Node/manager guard rejection paths work. `.npmrc` enables engine and strict peer
checks. The lockfile and explicit release-age exceptions remained unchanged.
The npm launcher emits a warning about pnpm's `strict-peer-dependencies` setting;
this did not prevent exact pnpm execution. Core tooling has no demonstrated
dependency on an undeclared global compiler, linter, or test runner.

## Architecture Boundary Assessment

The three application directories have distinct responsibilities and compile.
The web renders a minimal React page; API/worker export explicit foundation
status values. These are acceptable bootstrap modules, not working authenticated
servers or economic execution services. No World State, authoritative client
write path, second economic model, or Season engine exists at this commit.

Shared packages and database schema are appropriately absent. Current boundary
unit tests perform assertions and can fail, but exercise only named imports.
The live scanner's ordinary import/extension bypasses in R1 prevent approval of
its claimed protection. Core rules are tested against strings only because no
core package exists yet.

## Environment Safety Assessment

The existing local link remains a production integration target. Tracked
`supabase/config.toml` contains only `project_id = "econmind-os"`; CLI local
metadata is ignored. The environment example contains local loopback endpoints.
Independent inspection of tracked sources found only harmless local/test values
and credential pattern definitions, not an obvious real credential.

The Supabase wrapper's rejection works and no review command executed migrations,
resets, seeds, SQL, or production business writes. No mutation implementation or
migration artifact appears in the reviewed commit. Repository inspection cannot
prove the absence of all historical external database actions: production audit
logs were not obtained, and that historical claim remains unverified externally.

Manual global-CLI bypass is ACCEPTABLE_DEFERRED_RISK under V02's explicit scope.
The dotenv/browser credential bypass is a separate current-tooling issue and is
blocking. LOCAL/CI naming and loopback validation exist; STAGING/PRODUCTION are
recognized labels, not provisioned isolated environments. No CI configuration
or staging connection has been established or tested.

## Test Evidence Assessment

Every PASS entry in `TEST_EVIDENCE.json` has a real command. Each was rerun
directly or as an observed child of the aggregate command. Baseline exits and
test counts reproduced. The expected exit 2 for the negative push probe is
correctly a successful rejection test, not a successful database push.

No `echo pass`, unconditional success stub, `|| true`, skipped test, or disabled
failing assertion was found. API/worker status tests have narrow bootstrap
meaning; they do not validate authentication or simulation functionality. The
secret scanner's suppressed file-read errors are the exception recorded in R3.

The historical evidence supplies a plausible directory, runtime, platform, and
batch timestamp. It does not include immutable raw command logs or per-command
start/end times; exact historical timestamps cannot be independently certified.
The reviewer used new executions rather than relying on those historical claims.

Baseline PASS remains true for the observed baseline behavior. It must not be
interpreted as proof that boundary/environment policies are complete: R1 and R2
have separately reproduced failed acceptance cases. Readiness is therefore
CHANGES_REQUIRED despite the ten passing tests.

## Governance File Assessment

**GOVERNANCE_FILE_GAP — option B.** No missing contents were inferred. The supplied
task packets suffice to assess this limited foundation, but the authoritative
PLANS/R2 routing must be supplied before V00.2. V02 (the later database isolation
work package) is distinct from V00.2 and must not be conflated with it.

## Scope-Control Assessment

The target diff contains 47 changed files confined to this repository foundation.
No E01–E18 formulas, Office business actions, World tables, 70-country seed,
MapLibre/deck.gl, forecasting Web Worker, realtime business subscription,
DuckDB/Arrow/Parquet, Rust/WASM application implementation, deployment workflow,
DNS changes, or main-site modifications were found. Build-tool transitive
dependencies do not constitute application architecture scope expansion.

Temporary reviewer probes are not part of the target commit. No V00.2 work or
implementation fix was performed in the original repository.

## P0/P1 Assessment

No current second Source of Truth, economic invariant violation, authority-bearing
client path, or real credential exposure was found. Unimplemented economic,
ledger, RLS, and settlement rules are not treated as missing V00.1 functionality.

Fail-closed authority safeguards are insufficient: the boundary guard accepts
ordinary forbidden paths (R1), and the browser environment safeguard can report
success while emitting a secret-shaped configuration variable (R2). These are
engineering foundation defects, not requests to implement later economic rules.
No existing tests were weakened during this review.

## Remaining Risks

- Two MAJOR findings block approval; R3/R4 are explicitly scoped follow-ups.
- No fresh-cache network installation, CI-provider execution, other operating
  system, browser end-to-end session, local Supabase startup, RLS integration,
  staging connection, or production audit-log verification was performed.
- The original global CLI and production linkage remain unchanged. Remote
  authorization controls are deferred to V02.
- Temporary review fixtures remain outside the original repository for local
  reproduction; they contain only dummy values and were not pushed.

## Final Decision

**CHANGES_REQUIRED. V00.1 may not be promoted to VERIFIED.**

Blocking fixes are exactly:

1. **R1:** Enforce authority boundaries for resolved ordinary imports and supported
   extensions; add regression cases that make the demonstrated bypasses fail.
2. **R2:** Validate the effective Vite environment at build/dev entry points;
   reject forbidden browser variables from ignored dotenv files before output.

After fixes, rerun the canonical checks and the negative acceptance cases, update
implementation evidence, and request independent review of the new commit.
Repair the governance gap before V00.2. Do not mark this reviewed commit VERIFIED.

**NEXT ACTION: FIX ONLY THE REVIEW BLOCKERS; DO NOT START V00.2.**
