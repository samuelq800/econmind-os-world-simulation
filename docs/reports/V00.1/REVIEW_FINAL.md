# V00.1 Final Independent Technical Re-Review

## Reviewed Commit

- Final decision: **APPROVED**.
- Reviewed HEAD: `c41ddd8fa7c4098e84efdbe8f1839e8690993627`.
- `origin/main`: `c41ddd8fa7c4098e84efdbe8f1839e8690993627`.
- Review date: 2026-09-08, Asia/Shanghai.
- Review checkout: detached temporary worktree at the exact reviewed commit.
- Initial and final reviewed-worktree Git status: clean.

The active governance worktree was at later governance commit `40e882d...` and
was not treated as the technical review target. All source inspection, clean
installation, baseline commands, and adversarial technical fixtures used the
detached `c41ddd8...` worktree or separate temporary fixture directories. No
application/runtime source was changed by this reviewer. This versioned review
artifact is the only repository addition from the review.

## Previous Blocking Findings

The first review found R1, an import/authority boundary bypass, and R2, an
app-local Vite browser-secret bypass. The first re-review confirmed the direct
reproducers were fixed but found two equivalent supported paths:

- R1-RC1: executable modules outside `src`, including `.mjs` re-export paths,
  escaped boundary coverage.
- R2-RC1: a blacklist-based browser environment policy allowed an unrecognized
  database credential such as `VITE_WORLD_DATABASE_URL` into Vite output.

This review independently retested both final blockers and the legitimate paths
that must remain usable.

## R1-RC1 Result

**FIXED.** Confidence: high within the repository's defined JS/TS source model.

- Source: developer-controlled static/dynamic module references in governed
  application and package JavaScript/TypeScript files.
- Control: the TypeScript-AST parser and resolver in `boundary-rules.mjs`, with
  centralized ownership, governed roots, extensions and permitted edges in
  `architecture-ownership.mjs`.
- Sensitive sink: worker, persistence, integration, build-context or other
  server-owned implementation reachable from browser/shared-public source.
- Reachable path checked: full `apps/**` and `packages/**` traversal, import and
  export parsing, TypeScript resolution including `.js` to `.ts`, canonical
  target ownership, then edge rejection. The scanner also fails closed for
  unresolved local/workspace ownership and nonliteral dynamic references.
- Boundary: browser/shared-public code may use same-owner or approved
  shared-public contracts but cannot acquire server authority implementation.

Independent temporary fixtures produced these results using the real boundary
scanner:

| Fixture                                               | Result             | Exit |
| ----------------------------------------------------- | ------------------ | ---- |
| world-web relative import of world-worker             | Expected rejection | 1    |
| outside-src `.mjs` named re-export                    | Expected rejection | 1    |
| `export *` to world-worker                            | Expected rejection | 1    |
| `.mts` authority import                               | Expected rejection | 1    |
| `.cts` import-equals authority import                 | Expected rejection | 1    |
| `.mjs` authority import                               | Expected rejection | 1    |
| `.cjs` authority require                              | Expected rejection | 1    |
| `.js` specifier resolving to worker `.ts`             | Expected rejection | 1    |
| compact import syntax                                 | Expected rejection | 1    |
| literal dynamic import                                | Expected rejection | 1    |
| literal require                                       | Expected rejection | 1    |
| unresolved authority-sensitive local import           | Expected rejection | 1    |
| world-web import of controlled shared-public contract | PASS               | 0    |

A combined fixture containing all 12 forbidden files plus the legitimate
shared-public contract was passed through the canonical
`pnpm test:boundaries --root <fixture>` entry. The command returned 1 and
reported every forbidden filename, both forbidden-edge and unresolved-import
rules. The legitimate fixture alone passed. Baseline `pnpm test:boundaries`
returned 0 with 28 focused tests and a PASS scan of seven current governed
source files.

Counterevidence was actively checked: a controlled shared-public contract and
the current real Vite/config/helper imports remain accepted. No material proof
gap remains for R1-RC1 within `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`,
`.mjs` and `.cjs`; unsupported languages and theoretical extension systems are
outside the declared V00.1 model.

## R2-RC1 Result

**FIXED.** Confidence: high for the actual Vite development/build and root
quality entry points.

- Source: developer-controlled `VITE_*` process or app-local dotenv values.
- Control: an explicit public-client allowlist plus semantic value validation in
  `vite-environment-policy.mjs`, invoked by the actual Vite config with native
  mode-aware `loadEnv` behavior and by the root effective-environment check.
- Sensitive sink: the Vite development environment and emitted browser bundle.
- Reachable path checked: dotenv/process input to Vite loading, default-deny key
  classification, URL/JWT/credential semantic checks, fail-before-serve/build,
  and diagnostic redaction.
- Boundary: only approved public browser configuration may enter client output;
  server/database credentials remain outside the browser trust boundary.

Independent app-local dotenv fixtures exercised direct world-web build:

| Value class                                                    | Result             | Exit |
| -------------------------------------------------------------- | ------------------ | ---- |
| `VITE_SUPABASE_SERVICE_ROLE_KEY`                               | Expected rejection | 1    |
| `VITE_WORLD_DATABASE_URL` with password-bearing PostgreSQL URL | Expected rejection | 1    |
| unknown `VITE_*` key                                           | Expected rejection | 1    |
| `VITE_BACKEND_ADMIN_TOKEN`                                     | Expected rejection | 1    |
| `VITE_PRIVATE_KEY`                                             | Expected rejection | 1    |
| allowlisted URL key with embedded credentials                  | Expected rejection | 1    |
| database protocol under allowlisted URL key                    | Expected rejection | 1    |
| service-role JWT inside an allowlisted URL                     | Expected rejection | 1    |
| `VITE_WORLD_API_URL=http://127.0.0.1:<port>`                   | PASS               | 0    |

The service-role fixture also made direct Vite dev exit 1 before listening. A
valid loopback API URL allowed direct Vite dev to listen successfully. Additional
real-entry probes made root `pnpm build`, `pnpm env:check`, and full `pnpm check`
reject unsafe database, unknown-key, and admin-token fixtures respectively.
Every unsafe diagnostic named only the key/reason and omitted the complete
synthetic value. No unsafe value appeared in existing or newly emitted browser
bundle content. The approved URL remained functional.

Counterevidence was checked through the passing build/dev path and the normal
baseline. No material proof gap remains for R2-RC1 under Vite's supported dotenv
modes and the repository's declared entry points.

## Baseline Regression

All commands used Node `v24.20.0` and pnpm `12.3.4` from the exact-version local
launcher environment.

| Command                           | Result             | Exit | Observed evidence                                                            |
| --------------------------------- | ------------------ | ---- | ---------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`  | PASS               | 0    | Installed 141 packages; lockfile accepted.                                   |
| `pnpm lint`                       | PASS               | 0    | Real ESLint execution.                                                       |
| `pnpm format:check`               | PASS               | 0    | All matched files use Prettier style.                                        |
| `pnpm typecheck`                  | PASS               | 0    | world-web, world-api and world-worker TypeScript checks completed.           |
| `pnpm test`                       | PASS               | 0    | 5 files, 53 tests passed.                                                    |
| `pnpm test:boundaries`            | PASS               | 0    | 28 tests passed; live repository scan PASS.                                  |
| `pnpm env:check`                  | PASS               | 0    | local, development/production modes checked; NOT_LINKED; mutation false.     |
| `pnpm secrets:check`              | PASS               | 0    | 55 candidate files scanned.                                                  |
| `pnpm build`                      | PASS               | 0    | All three applications built; Vite transformed 15 modules.                   |
| `pnpm check`                      | PASS               | 0    | All constituent lint/format/type/test/boundary/env/secret/build gates reran. |
| `pnpm supabase:safe -- --version` | PASS               | 0    | Read-only installed CLI version 2.116.0 returned.                            |
| `pnpm supabase:safe -- db push`   | Expected rejection | 2    | Wrapper rejected before spawning a push.                                     |
| `git diff --check`                | PASS               | 0    | No whitespace errors.                                                        |

The root scripts invoke real tools and child commands; no unconditional success
stub, `|| true`, disabled suite, `.skip`, `xit` or weakened assertion was found.
The final-fix diff adds or strengthens tests. Installation, builds and all
temporary probes left the reviewed Git worktree clean.

## Scope and Environment

The final technical fix from `6e99560...` to `c41ddd8...` changes only boundary
and environment policies, their real entry wiring, tests, and related technical
documentation/evidence. App changes are limited to world-web Vite/TypeScript
configuration. It introduces no E01-E18 engine, World State, Office business
logic, database migration, 70-country seed, map, forecast engine, Realtime
business implementation, deployment, or main-site rewrite. The three app source
files remain minimal foundation status/UI modules.

The detached checkout reported no Supabase link. The environment gate reported
`databaseMutationAllowed: false`. The safe wrapper's version command was
read-only; the `db push` probe was rejected before execution. No migration,
reset, seed, SQL, remote database access, production deployment or Supabase
mutation occurred.

The earlier MINOR limitation that the repository secret scanner recognizes a
bounded set of credential shapes remains a documented hardening opportunity;
it is not a new finding and does not reopen R2-RC1, whose semantic browser-env
control was independently exercised. The global Supabase CLI remains outside
the wrapper's control, as previously documented and deferred to V02 environment
isolation. No new MAJOR, BLOCKER, MINOR or INFO finding was identified in this
final re-review.

## Final Decision

**APPROVED. V00.1 may be promoted from `IMPLEMENTED_UNVERIFIED` to `VERIFIED`
after this independent review evidence is committed.**

R1-RC1 and R2-RC1 are genuinely closed, the exact reviewed commit matches
`origin/main`, all required baseline and actual-entry checks pass, and no new
MAJOR or BLOCKER V00.1 defect was found.

This review does not itself update V00.1 status, merge governance, or authorize
V00.2. V00.2 remains blocked until the separate governance gate is independently
verified and merged in addition to the V00.1 status promotion.

NEXT ACTION = PROMOTE V00.1 TO VERIFIED AFTER REVIEW EVIDENCE IS COMMITTED.
DO NOT START V00.2 UNTIL GOVERNANCE GATE IS ALSO VERIFIED AND MERGED.
