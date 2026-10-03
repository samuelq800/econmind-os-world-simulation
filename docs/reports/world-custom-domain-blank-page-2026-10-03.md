# World custom-domain blank page — 2026-10-03

## Status and scope

Status: `IMPLEMENTED_UNVERIFIED` under FAST_MAINLINE; no independent review or
R2/ADR gate closure is claimed. Effective risk: P2, non-authoritative static
frontend build-path integration. Implementation commit:
`a54d8664fa9aa0ab6d3d7226d57c9c955e22b681`, based on
`a09e357aedcd24c882947ebd8a076ce68c454bf0` (including the upstream CORS fix).
The project owner explicitly requested fixing the blank page and pushing the
change. That instruction authorizes this static-site publication; it does not
approve an economic or architecture decision.

## Problem and resulting behavior

Read-only HTTPS checks returned 200 for `https://world.econmind.group/`, but
its HTML requested `/econmind-os-world-simulation/assets/main-BZKMUivi.js`,
which returned 404. `/assets/main-BZKMUivi.js` returned 200. Deployment success
therefore did not imply that the browser could load its entry module.

The Pages workflow now runs `actions/configure-pages@v5` before building and
passes `${{ steps.pages.outputs.base_path }}/` into the existing, validated
`WORLD_WEB_PUBLIC_BASE_PATH` build input. GitHub's documented `base_path` is
empty for a domain root and `/repository` for a project site:
<https://github.com/actions/configure-pages/blob/v5/action.yml>.
Both build and artifact validation use that same actual Pages path. A stale or
missing repository variable no longer selects an incompatible path. Upload is
blocked when the existing offline resource checker fails. Its script is also
included in the deployment trigger paths.

Files changed: `.github/workflows/deploy-world-web.yml` and
`tests/world-web/world-public-preview.test.ts`. The regression protects ordering,
the shared Pages output, and validation before upload.

## Actual validation

Windows PowerShell; Node 24.20.0, pnpm 12.3.4; frozen lockfile unchanged.
All final commands below exited 0:

| Command                                                                                                                                                                                                                                                                                            | Result                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`                                                                                                                                                                                                                                                                   | PASS, pinned toolchain and supply-chain check                                        |
| `pnpm --filter @econmind/core build`                                                                                                                                                                                                                                                               | PASS                                                                                 |
| `pnpm --filter @econmind/world-worker build`                                                                                                                                                                                                                                                       | PASS                                                                                 |
| `pnpm --filter @econmind/world-web typecheck`                                                                                                                                                                                                                                                      | PASS                                                                                 |
| `pnpm exec prettier --check .github/workflows/deploy-world-web.yml tests/world-web/world-public-preview.test.ts`                                                                                                                                                                                   | PASS                                                                                 |
| `pnpm exec eslint tests/world-web/world-public-preview.test.ts`                                                                                                                                                                                                                                    | PASS                                                                                 |
| `pnpm exec vitest run tests/world-web/public-base-path.test.ts tests/world-web/world-public-preview.test.ts tests/world-web/official-static-country-navigation.test.ts tests/world-web/official-map-publication.test.ts tests/world-web/visual-publication-integrity.test.ts --testTimeout=120000` | PASS, 5 files / 118 tests                                                            |
| `pnpm exec vitest run tests/world-web/official-source-connection-audit.test.ts tests/world-web/official-page-config.test.ts tests/world-web/official-country-role-navigation-qa.test.ts`                                                                                                           | PASS, 3 files / 33 tests                                                             |
| `pnpm test:boundaries`                                                                                                                                                                                                                                                                             | PASS, 3 files / 34 tests and both static scanners                                    |
| `node scripts/foundation-gate-policy.mjs`                                                                                                                                                                                                                                                          | PASS                                                                                 |
| `ECONMIND_ENV=local node scripts/assert-safe-environment.mjs` (PowerShell environment assignment)                                                                                                                                                                                                  | PASS; no configured database or linked Supabase                                      |
| `pnpm secrets:check`                                                                                                                                                                                                                                                                               | PASS, 1933 files                                                                     |
| `pnpm test:authoritative-ui`                                                                                                                                                                                                                                                                       | PASS; 288 published files, 75 derived files, 70 country pages, 140 reused map assets |
| `git diff --check`                                                                                                                                                                                                                                                                                 | PASS                                                                                 |

Production builds ran with `ECONMIND_ENV=production`, `GITHUB_ACTIONS=true`
and each explicit path in sequence:

| Build and check                                                                                                                                                                    | Result                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `WORLD_WEB_PUBLIC_BASE_PATH=/ pnpm --filter @econmind/world-web build`; `node scripts/check-world-web-public-base.mjs /`                                                           | PASS; root entry uses `/assets/`, no repository-prefix token in bundled runtime |
| `WORLD_WEB_PUBLIC_BASE_PATH=/econmind-os-world-simulation/ pnpm --filter @econmind/world-web build`; `node scripts/check-world-web-public-base.mjs /econmind-os-world-simulation/` | PASS; project entry retains its prefix                                          |

Each offline check covered 77 HTML files, 830 references, 70 country records and
140 map references, with no reachable-resource failures. The existing checker
separately reports two dormant, unreachable CSS image references; these are
unchanged. Existing large-chunk advisories remain. Both static outputs are below
the existing 1 GB budget (approximately 937.6 MB).

Headless Chrome/Playwright on a strict local static server tested both builds at
1280×800 and 390×844. All four scenarios mounted the home atlas, opened Avenor
detail and followed the national-operation link to country 01 / finance, with
no page errors, console errors, failed requests or HTTP resource failures.
Local runner, JSON evidence and screenshots are under
`D:/dev/automation/econmind-world-domain-qa/`. The runner supplies JavaScript MIME
types for both `.js` and `.mjs`; no product change was needed for that harness.

## Initial failures and remediation

The offline dependency attempt failed because the local cache lacked metadata;
the frozen online installation then passed. The initial boundary scan required
missing generated Worker exports; Core/Worker builds and the complete boundary
command subsequently passed.

Windows Git's inherited `core.autocrlf=true` had expanded immutable source bytes
to CRLF, causing real hash/size validation failures. Previously clean source
files were restored byte-for-byte from HEAD, and this repository alone now uses
`core.autocrlf=input`. No original data changes were committed, and the original
hash checks remain intact. A 70-country rendering test exceeded the initial
30-second timeout on this host; the final run uses a command-level 120-second
timeout with all assertions preserved (84.28 seconds for the five-file run).

## Safety, owners, and evidence limits

Affected owner: static World web deployment. Reads are the existing Pages
metadata and existing frontend inputs. The only publication write is the static
Pages artifact. Workflow permissions remain unchanged. No World State,
commands/events/receipts, accounting, clock, settlement, authentication, database,
RLS, migration, production Supabase, Cloudflare configuration, secret or legacy
application change is part of this patch. No new dependency was introduced.

Live deployment and browser readback must be bound to the eventual published
commit/run separately. Local tests do not establish live API, economic
functionality, all 420 country/office combinations, or a full repository-suite
result. The requested static-site repair does not start the repository's pending
V09 gate or grant `VERIFIED` to any step.

## Live readback and icon follow-up

The initial patch was published from `5536170ad39b0b447be76327b82adc3e0e0849ae`
by [Pages run 37133510640](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/37133510640):
build, path validation, upload and deployment all succeeded. Logs confirmed
`WORLD_WEB_PUBLIC_BASE_PATH: /`. Live HTTPS readback returned the corrected
`/assets/main-CcRs1ufX.js` reference and 200 JavaScript MIME for that module.
Both live viewport scenarios mounted the atlas, Avenor and the national page.
The strict browser console check still failed on the previously missing
`https://world.econmind.group/favicon.ico`; this was identified, not ignored.

Follow-up implementation: `91d123abc01eff1e080c95362489717c28409a29`. The root
HTML explicitly uses the existing, accessible EconMind badge as its favicon.
The path checker now identifies generated runtime scripts and stylesheet tags,
so a public icon whose path also contains `assets` is not misclassified as a Vite
entry bundle. The ordinary traversal still validates that icon's path and file.
No source asset bytes or hash expectations changed.

Both final root/project builds and both strict browser scenarios per build
passed again, including waiting for country facility data to finish rendering;
resource checks now cover 831 references. A deliberate root-base check against
the project build correctly exited 1. Changed-file ESLint, Prettier, boundary
scanner, authoritative UI check and `git diff --check` passed with exit 0.
The focused deployment regression rerun passed 5 tests; its 20 intentionally
unselected tests are not counted as passing (the earlier complete run passed
all 118 tests). Final live publication/readback follows the second push and
must be reported with its actual Pages run.

Final publication: `c6ceb69e4e243e86fb8726305a60424d69921039`,
[Pages run 37133967005](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/37133967005),
completed with `success`. Live root HTML includes the explicit brand icon and
root-based runtime assets. The final strict Chrome command
`node D:/dev/automation/econmind-world-domain-qa/smoke.cjs / https://world.econmind.group`
exited 0: both 1280×800 and 390×844 mounted the home, waited for Avenor's
official static facility records, and opened the national page; zero console
errors, page errors, failed requests or HTTP resource errors. A screenshot was
also inspected to confirm rendered map art and facility records. Final
`pnpm secrets:check` passed (1934 files); the working tree was clean and synced.
This confirms the requested static-page repair, not independent R2 verification
or a connection to live World State. The website currently reports the official
live read source as unconfigured; this patch does not invent an endpoint.
