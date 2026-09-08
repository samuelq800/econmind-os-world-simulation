# V00.1 Independent Re-Review

## Reviewed Commit

- **Decision: CHANGES_REQUIRED.** Two independently reproduced MAJOR findings
  remain within the R1/R2 controls. The original direct reproductions now fail
  correctly, but equivalent supported paths still bypass the controls.
- Target and actual HEAD: `6e99560dfeb5581541388ab6a50252933950abe9`.
- Previous reviewed commit: `103d0fa00805518eae557ea0f143a3b32c023d2b`.
- Review date: 2026-09-08. New local executions occurred approximately
  04:43–04:51 UTC, using Node `v24.20.0` and pnpm `12.3.4` on macOS ARM64.
- Original repository:
  `/Users/samuel/Documents/econclub/econmind-os-world-simulation`.
- Initial working tree was clean. The local `origin/main` reference matched the
  target. An initial remote query failed with a TLS connection error; a later
  successful `git ls-remote origin refs/heads/main` returned the exact target.
  HEAD and tracked implementation files remained unchanged through verification.
- A separate clean clone was checked out at the exact target under
  `/tmp/econmind-v001-recheck-3r0f4p3j/repo`. All adversarial source, configuration,
  and dotenv fixtures were confined to that disposable clone. No original
  application code was modified. This report is the only reviewer addition to
  the original repository. No commit, push, promotion, or V00.2 work was performed.

## Previous Blocking Findings

The first review rejected `103d0fa` with exactly two MAJOR findings:

1. R1: raw import matching missed ordinary forbidden imports and extensions.
2. R2: app-local Vite dotenv files bypassed process-only environment validation.

The historical `REVIEW.md` is preserved, including its CHANGES_REQUIRED decision
and all R1–R5 descriptions, severity assignments, evidence, and required actions.
It was absent from the previous implementation commit and first committed in
`6e99560`; this is preservation of the independent artifact, not a rewritten
approval. The archived local review session records its creation at
01:27:05 UTC and reviewer formatting at 01:27:26 UTC. A pre-fix hash recorded at
01:34:51 UTC exactly matches the current file:

`db61ab0a9554e7d0168bcce4570ca423ebedd71885aef8ef222f29f73eb78f5b`.

The initially authored, pre-format text differs only in Markdown whitespace.
This re-review uses a separate file and does not alter that historical artifact.

## Diff Reviewed

Reviewed the complete `103d0fa..6e99560` diff: 18 files, 1,573 insertions and
103 deletions. Changes comprise the boundary parser/resolver/scanner, effective
Vite environment policy and entry points, related tests, one test-directory
ignore, Node types for the Vite config, and V00.1 documentation/evidence.
The root boundary command now runs its real regression suite before the scanner.
No unjustified scope expansion was found.

The lockfile, workspace definition, exact dependency versions, Node/pnpm pins,
toolchain guard, Supabase wrapper, and Supabase configuration are unchanged.
Application business sources are unchanged. No economic engine, World State,
database schema, authority implementation, second Source of Truth, migration,
deployment workflow, or later work package was added.

Read `AGENTS.md`, `docs/exec-plans/V00.1.md`, implementation report, both evidence
rounds in `TEST_EVIDENCE.json`, historical review, repository boundaries, and
environment runbook. Read the relevant Constitution sections on P0/P1 priority,
authority, Source of Truth, permissions, environment isolation, fail-closed
behavior, and test integrity. These two supplied files are byte-identical:

- `/Users/samuel/Desktop/Econmind/requirements.docx`
- `/Users/samuel/Downloads/EconMind_World_V2_Execution_Pack/specs/original/EconMind_Season1_Codex_Implementation_Constitution.docx`

Both SHA-256 hashes are
`960a7745a8e18b8f1cb10c754ce6681d46bdfc5933a979c4a989bd3a07ff5d49`.

## Evidence Reproduced

All results below are new executions, not copied implementation claims.
Exact cached executables were used, with the Node directory first on PATH:

```text
/Users/samuel/.npm/_npx/92e92e656f04b72c/node_modules/node/bin/node
/Users/samuel/.npm/_npx/92e92e656f04b72c/node_modules/pnpm/pnpm
```

The clean clone initially had no dependencies, build products, dotenv fixtures,
or Supabase link. Frozen installation installed 141 packages using the existing
pnpm cache; it was not a fresh-cache network installation.

Local raw logs, machine-readable results, and reviewer harnesses are retained in
`/tmp/econmind-v001-recheck-3r0f4p3j`, including `baseline.json`, `probes.json`,
`bridge-mjs.json`, `extended.json`, `vite-semantics.json`, and `safety.json`.
These temporary logs supplement the self-contained reproductions below; they
are not committed evidence or assumed permanent storage.

All temporary files in the clone were removed using cleanup blocks, including
after expected command failures. No `.vite-env-test-*` directories or reviewer
source/dotenv fixtures remained. A final clean `pnpm check` returned 0, the
clone's Git status was empty, and its lockfile/workspace diff was empty.

## R1 Re-Verification

The fix is substantive: TypeScript AST parsing extracts module references;
workspace mapping and `ts.resolveModuleName` resolve targets; architectural
ownership is then checked. It is not merely a larger raw-string blacklist.

Each source fixture below was independently added under the clone's
`apps/world-web/src` and exercised with the actual
`node scripts/check-boundaries.mjs` CLI, then removed.

| Case         | Actual import/reference                                                                                                    | Exit   | Result                                  |
| ------------ | -------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------- |
| A            | Relative `../../world-worker/src/index`                                                                                    | 1      | Forbidden worker ownership detected     |
| B            | `../../world-worker/src/index.js` resolving to existing `index.ts`                                                         | 1      | Resolved TypeScript target reported     |
| C            | Compact `import{getWorkerFoundationStatus}from"...";`                                                                      | 1      | Parsed and rejected                     |
| D            | Forbidden side-effect import in `.mts`                                                                                     | 1      | File scanned and rejected               |
| E            | `@econmind/world-worker`; reserved `@econmind/persistence`                                                                 | 1 each | Forbidden ownership detected            |
| F            | Allowed `export { App } from './App.js'`                                                                                   | 0      | Legitimate same-layer import accepted   |
| G            | Temporary `@review-worker/*` TypeScript alias to worker                                                                    | 1      | Alias resolved and rejected             |
| Import forms | Side-effect import, named re-export, `export *`, literal dynamic import, `.cjs` require, `.cts` import-equals, import type | 1 each | Forbidden references detected           |
| Unresolved   | Missing worker source                                                                                                      | 1      | Explicit `UNRESOLVED_CODE_IMPORT`       |
| Nonliteral   | Dynamic import using a variable                                                                                            | 1      | Explicit `UNRESOLVED_DYNAMIC_REFERENCE` |

There are no production aliases. Case G changed only a temporary clone config,
restored byte-for-byte afterward; no alias is imposed as a production requirement.

### R1-RC1 — Runtime re-export outside the scanned roots bypasses authority checks

**Severity: MAJOR. R1 is not fully remediated.**

Locations: `scripts/check-boundaries.mjs:15` and `:53–72`;
`scripts/boundary-rules.mjs:257–274` and `:353–395`.

The scanner only enumerates `apps/world-web/src` and `packages/core/src` and
does not inspect the runtime imports of a resolved dependency outside those
roots. A browser import of an ordinary JavaScript module with a declaration
file is accepted as same-layer, while that JavaScript module imports worker
implementation. The current project accepts this source without any tsconfig,
package, build-script, or policy modification.

Minimal added fixture files:

```javascript
// apps/world-web/review-bridge.mjs
export { getWorkerFoundationStatus } from '../world-worker/src/index.js';
```

```typescript
// apps/world-web/review-bridge.d.mts
export function getWorkerFoundationStatus(): object;
```

```typescript
// apps/world-web/src/review-entry.ts
import { getWorkerFoundationStatus } from '../review-bridge.mjs';

console.log(getWorkerFoundationStatus());
```

A temporary `apps/world-web/review.html` loaded `/src/review-entry.ts` with a
module script. The source was formatted before running the unchanged gates.

- Actual boundary CLI: **exit 0**, incorrectly PASS.
- Full root `pnpm check`, including typecheck, all tests, boundaries, environment
  checks and all normal application builds: **exit 0**.
- Actual Vite CLI dev server served the entry and bridge with HTTP 200. Its
  transformed bridge exported from
  `/@fs/.../apps/world-worker/src/index.ts`, establishing the browser path.
- An additional Vite production build using the unchanged real application
  config and only the reviewer HTML as `build.rolldownOptions.input` returned
  **exit 0**. Generated JavaScript contained the worker's
  `future-authoritative-executor` implementation marker. This supplementary
  build used Vite's API; it is not mislabeled as the canonical CLI build.

Counterevidence was checked: an all-TypeScript bridge outside the project file
list also passed the scanner, but TypeScript rejected it with TS6307. That
initial probe alone would not establish a complete canonical-gate bypass.
The `.mjs` plus `.d.mts` reproducer above passes the unchanged compiler and
complete gate. `.mjs`/`.mts` are explicitly supported by the repository policy.
No unsupported syntax or fabricated production alias is required.

The imported worker currently exposes only a disabled foundation marker, so this
is an authority-guard bypass, not a claim that an economic mutation occurred.
It violates the current prohibition on browser imports of worker implementation.

**Required correction:** cover runtime-reachable application modules outside
the enumerated `src` directories, or explicitly reject browser imports whose
runtime source is outside verified roots. A declaration target must not make
an uninspected runtime re-export safe. Add a real CLI/canonical-gate regression
for this supported path. No future economic graph implementation is requested.

## R2 Re-Verification

The original dotenv loading defect is fixed at the real config entry point.
`apps/world-web/vite.config.ts:9–18` invokes Vite's own `loadEnv` with the active
mode and the same absolute application directory assigned to `root` and
`envDir`. Both direct dev and direct build load that config. Root environment
validation independently loads development and production modes.

For the required ignored fixture:

```dotenv
VITE_SUPABASE_SERVICE_ROLE_KEY=review-only-synthetic-secret
```

| Check with `apps/world-web/.env.local` present                                    | Exit | Observation                              |
| --------------------------------------------------------------------------------- | ---- | ---------------------------------------- |
| `git check-ignore apps/world-web/.env.local`                                      | 0    | Fixture is ignored                       |
| `pnpm --filter @econmind/world-web dev --host 127.0.0.1 --port 4197 --strictPort` | 1    | Config rejects before startup            |
| `pnpm --filter @econmind/world-web build`                                         | 1    | Vite config rejects before browser build |
| `pnpm build`                                                                      | 1    | Root recursive build rejects             |
| `pnpm check`                                                                      | 1    | Root environment gate rejects            |
| `pnpm build` after fixture removal                                                | 0    | All applications build normally          |

The existing browser dist was moved aside before the negative runs. No new
browser dist was created, and no browser output containing the marker was
emitted. Rejection diagnostics identified the key/category and never printed
the synthetic value. Existing dist was restored and normal builds rerun.

Separate actual Vite CLI builds rejected the same forbidden key from `.env`,
`.env.local`, `.env.production`, `.env.production.local`, `.env.development`,
`.env.development.local`, `.env.review`, and `.env.review.local`, each with the
matching active mode and exit 1. A process-level service-role key also returned 1.
All these rejection diagnostics omitted the value.

Native Vite `resolveConfig` against the real application config reproduced
process environment precedence over `.env.production.local`, then
`.env.production`, `.env.local`, and `.env`, by removing each winning layer in
turn. Effective root/envDir stayed at `apps/world-web`, mode stayed production,
repository-root-only dotenv variables were absent, and dotenv interpolation
worked. Installed Vite source confirms this is its own loading algorithm, not a
custom interpretation. No material root/mode/search-path/precedence mismatch
was found.

Legitimate `VITE_WORLD_API_BASE_URL`, `VITE_SUPABASE_ANON_KEY`, and
`VITE_SUPABASE_PUBLISHABLE_KEY` values were accepted together by the real direct
workspace build, exit 0.

### R2-RC1 — Narrowed database-key matching restores a browser-secret bypass

**Severity: MAJOR. R2 cannot be signed off.**

Location: `scripts/vite-environment-policy.mjs:10–13`, used by both the real
Vite config and `scripts/environment-policy.mjs`.

The new database rule requires `DATABASE_URL`, `DB_PASSWORD`, or related
namespaces immediately after `VITE_`. The old process policy rejected
`DATABASE_URL` and `DB_PASSWORD` anywhere in a browser variable name. A normal
application namespace therefore loses existing protection.

Independent synthetic fixture in ignored `apps/world-web/.env.local`:

```dotenv
VITE_WORLD_DATABASE_URL=postgresql://review:review-only-synthetic-secret@db.example.invalid/db
```

Temporary browser source:

```typescript
// apps/world-web/src/review-entry.ts
document.body.dataset.review = import.meta.env.VITE_WORLD_DATABASE_URL;
```

- Current `pnpm env:check`: **exit 0**, incorrectly PASS.
- Current full `pnpm check`: **exit 0**, including all tests and builds.
- Current `pnpm env:check` with this key in the process environment: **exit 0**.
- The previous commit's actual environment policy, loaded independently with
  the same key, reports a violation; the reviewer driver exits **1**.
- The unchanged actual Vite CLI dev path served `/src/review-entry.ts` with
  HTTP 200 and the synthetic password present in browser JavaScript.
- A supplementary production build using the real application config and a
  temporary reviewer HTML input returned **exit 0** and emitted JavaScript
  containing the synthetic password. This uses the real Vite build API with
  only the input/output changed for observation, not a replacement safety config.

This is a demonstrated regression in an already protected credential category,
not a demand to detect arbitrary secrets under arbitrary public names. The
source is local developer configuration; the sink is browser code. No real
credential, remote database connection, or production write was involved.

**Required correction:** preserve forbidden database credential detection with
ordinary `VITE_*` namespace prefixes and add real environment/dev/build
regressions. Keep legitimate public configuration accepted and values redacted
on rejection. Passing native dotenv semantics alone does not fix key policy.

## Regression Results

These commands ran separately against the pristine target clone before attacks:

| Command                                | Actual exit | Result                                                   |
| -------------------------------------- | ----------- | -------------------------------------------------------- |
| `pnpm install --frozen-lockfile`       | 0           | 141 packages installed; exact toolchain guard passed     |
| `pnpm lint`                            | 0           | Real ESLint analysis                                     |
| `pnpm format:check`                    | 0           | Real Prettier check                                      |
| `pnpm typecheck`                       | 0           | All three applications                                   |
| `pnpm test`                            | 0           | 4 files, 19 tests passed                                 |
| `pnpm test:boundaries`                 | 0           | 9 boundary tests, then real scanner; 2 live source files |
| `pnpm env:check`                       | 0           | Development/production environments; clone NOT_LINKED    |
| `pnpm secrets:check`                   | 0           | Configured credential-shape scan                         |
| `pnpm build`                           | 0           | API, worker and browser builds succeeded                 |
| `pnpm check`                           | 0           | Complete aggregate gate                                  |
| `pnpm check` after all fixture cleanup | 0           | Restored clean target behavior                           |

The reported 4 files/19 tests/9 boundary cases are accurate. Boundary tests spawn
the actual scanner CLI. The two Vite tests copy the real application config and
policy and invoke the actual installed Vite CLI for allowed build and forbidden
build/dev cases. They do not merely test helpers. Assertions and cleanup are
real. Original foundation/environment assertions were preserved; architecture
tests were expanded. No skipped/weakened P0 tests, fake-success script, or
unconditional PASS replacement was introduced. Coverage is nevertheless
insufficient for R1-RC1 and R2-RC1, which both pass the full existing suite.

Additional safety controls were exercised:

| Control                                                                     | Actual exit                                       |
| --------------------------------------------------------------------------- | ------------------------------------------------- |
| Exact Node and pnpm user-agent guard                                        | 0                                                 |
| Wrong pnpm user-agent; npm user-agent; host Node v26.5.0                    | 1 each                                            |
| `pnpm supabase:safe -- --version`                                           | 0; optional global CLI 2.116.0                    |
| Wrapper probes: `db push`, `db reset`, `migration up`, `seed`, `db execute` | 2 each, rejected before CLI spawn                 |
| Original checkout `pnpm env:check`                                          | 0; production-integration-only, mutation disabled |
| Lockfile/workspace comparison after installation and cleanup                | 0; unchanged                                      |
| `git diff --check 103d0fa 6e99560`                                          | 0                                                 |

No toolchain downgrade or lockfile incoherence was found. Builds/tests do not
depend on the optional global Supabase CLI. No database mutation command was
executed by that CLI; only its version query was allowed through the wrapper.

## Deferred Findings

- **R3 — MINOR:** Secret-scanner coverage/read-failure hardening remains a
  non-blocking follow-up. Its code is unchanged. This is a bounded pattern scan,
  not proof that every credential family is absent. No active real credential
  exposure was discovered. The synthetic browser exposure above is R2-RC1 and
  does not falsely mark R3 resolved.
- **R4 — MINOR:** GOVERNANCE_FILE_GAP remains a sequencing prerequisite. The
  implementation explicitly leaves it unresolved. It must be repaired before
  V00.2, but is not an independent reason to reject V00.1's technical foundation.
- **R5 — INFO / ACCEPTABLE_DEFERRED_RISK:** Manual global Supabase CLI bypass
  remains unchanged. V02 still owns local/ephemeral CI databases, independent
  staging, environment fingerprints, isolated credentials, and the sole database
  release chain. V02 is distinct from V00.2. No broader isolation work is demanded
  in this review.

## Governance Status

`PLANS.md` and the authoritative additional R2 workflow/governance material are
still absent from the repository and the inspected supplied execution pack.
The repository explicitly records the gap; ordinary execution/planning documents
do not substitute for it. No missing content was invented.

**V00.2 MUST NOT BEGIN UNTIL R2 GOVERNANCE SYNC IS COMPLETED.**

The existing Supabase link remains **PRODUCTION_INTEGRATION_TARGET_ONLY** with
`databaseMutationAllowed: false`. This review performed no migration, push,
reset, seed, SQL execution, business-data write, or production deployment.

## Remaining Risks

- **2 MAJOR:** R1-RC1 runtime bridge bypass; R2-RC1 namespaced database credential
  exposure. Both are demonstrated in current supported tooling and block approval.
- **2 MINOR:** deferred R3 and R4. **1 INFO:** deferred R5.
- The committed application remains non-authoritative and contains no economic
  implementation or database authority path. However, its foundation checks
  still permit the demonstrated forbidden browser paths, so fail-closed
  safeguards are not yet adequate for promotion.
- No fresh-cache installation, CI-provider run, alternate operating system,
  full browser end-to-end session, authenticated API/worker runtime, economic
  invariants, local Supabase startup, RLS integration, staging connection, or
  deployment was verified. These are not claimed V00.1 implementations.
- No production audit logs were obtained. Repository inspection and safe local
  probes cannot certify the absence of historical external production actions.
- No exhaustive resolver graph or arbitrary credential-name/content audit was
  performed. The blocking cases above require neither such an audit nor later
  economic functionality to reproduce.

## Final Decision

**CHANGES_REQUIRED. V00.1 may NOT be promoted from IMPLEMENTED_UNVERIFIED to
VERIFIED at `6e99560dfeb5581541388ab6a50252933950abe9`.**

The original direct R1 attacks and the exact R2 service-role dotenv attack are
closed, and every baseline gate passes. Approval is nevertheless blocked by
the two additional demonstrated paths in those same controls. Fix only R1-RC1
and R2-RC1, add regressions that fail on this commit, rerun the baseline gates,
and obtain independent review of the next immutable commit.

**V00.2 may NOT begin.** After technical approval, it must still wait for repair
of the R4 Governance File Gap and completion of R2 governance sync.

**NEXT ACTION: FIX ONLY THE NEW REVIEW BLOCKERS. DO NOT START V00.2.**
