# Frontend connection regressions and browser evidence

Status: `IMPLEMENTED_UNVERIFIED`. The changes repair shipped browser read behavior; they grant no admission, seat, economic write, World startup or Clock startup. Governance remains `status/progress.json`.

## Shipped fixes

- `apps/world-web/public/season1-immersive/country-context.js` rejects non-progressing pages, row counts beyond the declared total, invalid map fragment lengths and invalid/backward/out-of-range fragment offsets. A malformed response retires its catalog. Decimal source tokens remain strings.
- `apps/world-web/public/season1-immersive/country-game.js` distinguishes a genuine zero-row result from an empty final page whose source total is positive.
- `apps/world-web/src/country-runtime/staged-reservation-client.ts` bounds token acquisition, headers and body by one ten-second deadline. Retirement settles pending requests and cancels body readers; late replies cannot dispatch or restore a retired request. HTTP 401/403 is `DENIED` even without the success schema. Unknown command outcomes remain unknown, with no retry or receipt synthesis.
- `tests/world-web/office-connection-status.test.ts` contains 25 transport/contract fixtures. The original implementation produced 18 failures and three passes before the added UI/retirement cases. No existing tests were weakened.

The existing office-command, production-read and official-source-status clients retain their identity/session fences and final-receipt readback. Their focused regressions passed. No additional connection DTO was introduced without a caller. No independent Office export/background-job action was found in this inspected browser path.

## Actual verification

All commands used the installed pinned wrapper: `bash /workspace/.cloud-setup/run.sh econmind-os-world-simulation`. Actual versions were Node `24.20.0`, pnpm `12.3.4`, Vitest `5.0.0`.

| Check                                                                                          | Actual result                                                             |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| New connection test + existing full-data page and trusted-country-runtime tests                | Exit 0; 3 files, 85 passed, no skips                                      |
| Existing office-command, lifecycle UX, production-read and source-status-catalog tests         | Exit 0; 4 files, 133 passed, no skips                                     |
| `tsc -p apps/world-web/tsconfig.json`                                                          | Exit 0                                                                    |
| New test typecheck using a temporary config matching web Bundler/JSX/Vite ambient types        | Exit 0; initial temporary configs omitted web settings and were corrected |
| ESLint/Prettier for changed TypeScript; syntax checks for both static scripts; whitespace diff | Exit 0                                                                    |
| Browser harness syntax, ESLint and Prettier                                                    | Exit 0                                                                    |

The cloud has an existing Playwright module at `/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs` and Chromium at `/usr/bin/chromium`, version `154.0.8037.57`. A real headless browser was launched and closed successfully. No package or browser was installed and no Mac runtime was used.

Actual browser evidence is **`PASS_TEST_ONLY`**, nine cases. The browser loaded the tracked Season1 country page through the existing loopback static preview and obtained responses over real HTTP from a separate owned loopback fixture server. Country 01/02 files came from the bundled selected-source publication. Catalog/finance/geography responses were synthetic `TEST_ONLY` fixtures with explicit fixture row labels; their successful rendering does not prove official row availability. Non-loopback browser requests were blocked.

The nine browser cases checked: selected country loading with disabled Confirm and no World clock; genuine zero rows; malformed non-progress paging; HTTP 503; normal Next offset progression; invalid geography fragments; closing during a delayed response; public role navigation without a seat grant; and country navigation changing the source country filter. All fixture requests were GET, page errors were empty, and both owned HTTP services and Chromium were closed in `finally`.

Initial machine evidence is `/tmp/office-frontend-browser-evidence.json`; the durable harness run is `/tmp/office-frontend-browser-durable-evidence.json`. The final source-bound rerun uses `/tmp/office-frontend-browser-final-evidence.json`. These artifacts record exact source hashes, checkout HEAD, dirty/clean status, browser version, case outcomes and requested source paths. Retain the JSON with its matching script revision. The first temporary harness attempted to click the page behind an open dialog; its timeout is preserved at `/tmp/office-frontend-browser-initial-harness-failure.json`. The harness was corrected to close the dialog normally, with no forced clicks or page changes.

Production API connectivity, admitted official-source economic execution, authenticated staged-runtime browser acceptance, complete six-Office decision/result acceptance and remote browser deployment acceptance are **`NOT_RUN`**. Unit/VM tests and these local HTTP fixtures cannot increment formal live-connection counts.

## Reproduce without implicit startup

The durable harness is `tools/office-connection/browser-evidence.mjs`. It locates repository files relative to itself. No arguments defaults to `--plan`, which checks local capabilities without launching Chromium or an HTTP server. Explicit verification requires a fresh output path; existing paths are rejected.

```sh
bash /workspace/.cloud-setup/run.sh econmind-os-world-simulation node tools/office-connection/browser-evidence.mjs --plan
bash /workspace/.cloud-setup/run.sh econmind-os-world-simulation node tools/office-connection/browser-evidence.mjs --verify --out /tmp/NEW-office-browser-evidence.json
```

`OFFICE_BROWSER_PLAYWRIGHT_MODULE` (or `PLAYWRIGHT_MODULE`) and `OFFICE_BROWSER_EXECUTABLE` (or `CHROMIUM_PATH`) select already-installed absolute local files. The harness checks module readability and browser executability. Unsupported platforms or missing files produce `BLOCKED`; explicit unavailable verification exits 2. It never downloads a dependency. Verification owns only its loopback services and scratch browser context, checks source bytes did not change during the run, and records `PASS_TEST_ONLY` rather than formal approval.

## Orchestrator and CI review

`tools/office-connection/run.mjs` uses an offline `--plan` contract, validates the six-Office/row denominator, leaves formal counters zero and emits separate commands for subsequent mechanism/native/release checks. Its `--check` deliberately exits 2 because offline inventory cannot certify live authority. The fresh-output `wx` behavior prevents silently replacing evidence. Consumers must not interpret a green `--plan` as live readiness.

The new `.github/workflows/office-connection.yml` uses `--plan`, pinned Node/pnpm, a frozen install, explicit focused test files, read-only repository permissions and retained plan artifacts. It starts no browser, economic host, World or Clock; therefore browser CI acceptance remains `NOT_RUN`. The local Chromium results above are separate evidence. The workflow should keep affected existing full-data/trusted-runtime regressions and native-evidence validator tests in its explicit list when it is finalized; no full suite was run by this workstream.
