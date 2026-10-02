# Country × role browser audit

Non-authoritative, read-only tooling. This is not a second World model, economic
acceptance, production connectivity proof, deployment proof, or Gate B approval.
The report always separates technical checks from the real decision/result loop.

## Runtime and local checks

Use the repository's pinned Node 24.20.0 and pnpm 12.3.4. Reuse the existing
Playwright/Chromium runtime used by G; do not change package pins or install a
browser. `PLAYWRIGHT_MODULE` can identify another already-installed module. A
missing dependency fails explicitly. The default cached module is documented in
the script and the result records its path and actual Chromium version.

```sh
COUNTRY_ROLE_BROWSER_TESTS=1 pnpm exec vitest run tests/world-web/official-country-role-qa.test.ts
pnpm exec tsc -p tests/world-web/country-role-qa.tsconfig.json
pnpm exec eslint scripts/country-role-qa.mjs tests/world-web/official-country-role-qa.test.ts
pnpm exec prettier --check scripts/country-role-qa.mjs scripts/README-country-role-qa.md tests/world-web/official-country-role-qa.test.ts tests/world-web/country-role-qa.tsconfig.json
```

The browser tests use small DOM fixtures with actual selected-country JSON, not
fake economic state, results or receipts. Without the explicit environment flag,
the browser cases are **skipped**, never counted as verified browser evidence.

## Small actual-page sample

Run from this clean tracked checkout with its exact full SHA and a new output file:

```sh
node scripts/country-role-qa.mjs --sha FULL_40_CHARACTER_CHECKOUT_SHA --countries 02,70 --roles finance --output /absolute/new/sample.json
```

The script starts and closes an isolated loopback static publication preview,
using G's `/econmind-os-world-simulation/` prefix and desktop 1440×900 / mobile
390×844 geometry. It reuses one browser context and a bounded, cross-country and
cross-role GET-resource LRU cache (256 MiB), not 420 cold browser sessions. It
records cache statistics. At most 40 failed/blocked screenshots are retained.
Reports are new files (`wx`); existing reports are never overwritten. CLI exit 0
means the audit completed, **not** that its cases passed: inspect the report.

Only loopback HTTP origins are allowed. Non-read-only methods, external requests,
authorization headers, service workers and WebSockets are blocked. No Supabase,
live verification, command execution or economic POST is exercised. Only source
drawers and country/role navigation are clicked; primary action controls receive
trial-click, focus and geometry checks, not business dispatch.

## Fixed integrated run — not authorized by a sample

Only after the owners identify the final integrated C/A/D/F/G SHA, run once from
that clean tracked checkout containing this harness:

```sh
node scripts/country-role-qa.mjs --sha FIXED_INTEGRATION_SHA --full --confirm-integration-sha FIXED_INTEGRATION_SHA --output /absolute/new/full-420.json
```

Both SHA arguments must equal HEAD. Full coverage means 70 countries × six roles,
each at both viewport sizes, plus missing-data probes. The script rejects a full
run without explicit matching integration confirmation, duplicate/invalid
selections, and partial runs labelled full. It does not infer that integration
is complete merely because this flag is supplied; the coordinating owner must
establish that before execution. This workstream has **not run full 420**.

## What is checked and what remains separate

Before browsing, all 70 country inputs are bound to the selected package checksum,
source dataset hashes, lexical numeric tokens/canonical decimals, source row
identity and source-filter collection counts. No JSON regeneration occurs.
Rendered data responses must match the bound country's byte SHA.

The actual national page must bind country ID/number/name and office, render its
background, avoid horizontal overflow, expose each required role HUD metric and
its exact selected-source provenance, and show exact value + dataset SHA in the
opened read-only source drawer. Native controls must be reachable and focusable;
disabled controls retain their reason. Source access, scrolling, browser errors,
same-country atlas return and role switching are recorded. While the country
response is held pending, the loading UI is checked for legacy/model fallback.
Missing-data probes
must expose failure without a country game or legacy Avenor/North Harbour/sample
population fallback. A failed missing-data probe fails affected normal cells.

Current D contract: `[data-cmd="country-metric"][data-metric]` contains
`data-output-pointer`, `data-source-pointer` (original source, not generated
pointer), `data-source-exact`, `data-source-dataset`, `data-source-row-id`,
`data-source-unit`, `data-source-nature`, `data-source-state`. Role switching uses
a visible native `select[data-country-role-switch]` if implemented. D's delivered
slice does not implement that select or an in-app atlas-return link; these are
coverage gaps, not automatically confirmed business defects. Missing hooks are BLOCKED,
not automatically PASS. The atlas return must be an actual in-app link retaining
country and role; browser-back recovery does not count as that feature.

This preview audits the published national-role pages and their country-atlas
navigation. F's React root-map source-details contract and deployed build are
separate checks; do not infer their verification from this static preview.

`COUNTRY_ROLE_BROWSER_AUDIT_V1` contains the full 420-cell matrix with untouched
cells `NOT_RUN`, per-viewport observations, controls, source-details, navigation,
errors, requests, bounded screenshots, coverage, technical counts, missing probes,
runtime version, timestamps, harness byte SHA, package identity and cache statistics. Samples never set
`full420Executed`. Technical PASS never grants full playability acceptance:
goals/options/cost/consequence/stopping points need human review, and command,
FINAL receipt and refreshed official result remain `NOT_EXERCISED_READ_ONLY`.

## CI boundary

No workflow or package pins are changed. The existing official-page CI may trigger
for the new test filename but does **not** execute this harness's focused tests or
browser cases. Its green result must not be presented as harness test evidence.
Use the actual local commands above until a separately authorized CI owner wires
this tooling into CI.
