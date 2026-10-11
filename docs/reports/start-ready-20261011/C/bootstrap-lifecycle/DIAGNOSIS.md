# PR136 bootstrap lifecycle — bounded diagnostic repair

Date: 2026-10-11, Asia/Shanghai. Producer: C. Status: **IMPLEMENTED_UNVERIFIED; CI_ROOT_CAUSE_UNRESOLVED; B_NARROW_REVIEW_PENDING**.

## Outcome and limitation

The original CI failure is preserved, not declared flaky or repaired. The exact original lifecycle code passes both bounded local reproductions. The fixed CI log does not contain the child output or exit status at the two READY failures, so it cannot distinguish startup refusal, readiness failure, child crash or another cause. No launcher product defect is established; neither launcher is modified.

This candidate repairs the demonstrated **test observation/cleanup gap**, allowing a future occurrence to identify its cause. It is not an Industry T1, World Clock, runtime/authority registration or CI-green claim. Stop after B's narrow-review handoff; no merge, workflow rerun, deployment or activation is performed.

## Fixed identity and original negative evidence

- Dedicated repository: `/Users/samuel/Documents/econclub/econmind-os-world-simulation`.
- Exclusive worktree: `/Users/samuel/Documents/econclub/.econmind-worktrees/c-bootstrap-lifecycle-ci-fix-20261011`.
- Branch: `codex/c-bootstrap-lifecycle-ci-fix-20261011`.
- Base: `5dca519927fbc3915a5459be77e0779dc14a5072`; tree `3dd03c5ef746767e6c5755d44f0a3223e2869480`; clean at creation.
- Original lifecycle file SHA-256: `c761fffd3a91bc4bf5a816caef53fc37b0c4a0c454f8000b20352ae2cacef5fe`.
- Original GitHub run `38126263727`, job `114431157473`, Unmodified complete official check: **3351 PASS / 2 FAIL / 258 SKIP**, process exit 1. Original crash-after-READY wait at line 613 and API TOCTOU candidate wait at line 644 timed out; both `captured` assignments follow those waits.
- Root-supplied artifact `11697558587`, `runtime-official-native-5dca519927fbc3915a5459be77e0779dc14a5072`: raw `official-pnpm-check.log` SHA-256 `b57f844c512fd6c520e4aaff93f7a5dee17e0af93e51ce8d64635df34bd5ba92`, independently checked before and after copying. Original location `/private/tmp/econmind-pr136-bootstrap-failure.g4Iok6/official-pnpm-check.log`; retained C copy below.
- Provider ZIP digest reported by Root: `5d990ce798fad1cbcf98af72eac445f559508ffa96dab6a19ab591dc7021b701`. C did not download or locally hash that ZIP; it is not the raw log hash.
- One decoded job-log read occurred before Root supplied the local artifact. There were no further downloads, workflow reruns or GitHub mutations. Persisted evidence uses the fixed supplied raw log.
- The prior independently approved manual rowCount fixture and its reports remain unchanged; this round does not re-review or weaken them.

## Confirmed test-harness defect and smallest owned remedy

At the base, `waitForOutput` calls generic `waitUntil`. That helper reports only a timeout/last probe exception and never reports `managed.output()`, `exitCode` or `signalCode`. An already exited public command therefore looks like a 30-second missing-READY timeout. The six READY/WAITING consumers capture descendants **after** a successful wait; if that wait fails, their `finally` calls `cleanupCaptured([])`. The Web-only case similarly needs a pre-shutdown observation if its readiness wait fails. This proves missing diagnostic/cleanup coverage, **not** that the two original CI failures leaked processes.

Changes are limited to `tests/foundation/bootstrap-lifecycle.test.ts` plus this C evidence package:

1. During READY/WAITING polling, accumulate only descendants of the public command, before readiness is established. Keep that same collection through `finally`; capture once more before cleanup.
2. Fail immediately when the public command has exited without the expected output. Wait for `close`, so stdout/stderr are drained, and attach PID, exit/signal status, observed owned rows and captured output. Real output timeout still fails with the same default 30-second bound.
3. Bind cleanup observations to PID plus process start time rather than PID alone. After the existing SIGKILL fallback, wait again for observed owned processes to exit; do not return a false cleanup success. No shared process names, user processes, broad kill or global port cleanup is used.
4. Clear settled `waitForExit` timeout handles. Existing READY-once, crash, TOCTOU, forced-cleanup failure truth, ports and runtime assertions remain intact; no timeout is increased and no skip or weaker readiness contract is added.
5. Add two ordinary regressions using the **existing unchanged** preload fixture: startup exit preserves diagnostics/ownership, and a bounded pre-READY wait failure cleans observed owned children and frees its three loopback ports.

The C `run-focused.mjs` wrapper records only its own spawned Vitest tree every 100 ms, streams output to a raw log and records exit/observed ownership/fallback cleanup. It runs only the lifecycle file. Any leftover before outer fallback makes the wrapper fail; it cannot turn a failed test into PASS. All four completed invocations below observed zero leftovers and executed zero outer fallback kills. This is observed-process evidence, not a claim that polling proves every arbitrarily short-lived process ever existed.

## Actual bounded verification

All local runtime checks used `env -i`, explicit pinned Node `24.20.0` and native pnpm `12.3.4`, `ECONMIND_ENV=local`, and only the test-provided loopback ports. No database URL, production credential, authority setting or simulation timer was supplied. `pnpm install --offline --frozen-lockfile --store-dir /Users/samuel/Library/pnpm/store/v11` completed with 161 reused packages, zero downloads, toolchain gate PASS and unchanged lockfile. Local `pnpm pretest` built Core/Worker/API prerequisites, exit 0; this is not runtime activation or full-repository verification.

At execution time, PATH began with the task-local `artifacts/c-bootstrap-lifecycle/bin` containing only a `pnpm` symlink to `/Users/samuel/.cache/node/corepack/v1/pnpm/12.3.4/pnpm-native`, followed by `/Users/samuel/.cache/npm/_npx/460b723c8ad28bd7/node_modules/node/bin` and system `/usr/bin:/bin:/usr/sbin:/sbin`. The evidence directory and that symlink were subsequently moved to the C-owned external directory below; no process was running during the move.

| Invocation                                                                                                                                       | Actual PASS / FAIL / SKIP                 | Exit  | Cleanup evidence                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Original code, `baseline-pair -t 'tears down the full stack\|rejects the API-ready-then-exit'`                                                   | 2 / 0 / 10 (10 excluded by selection)     | 0     | 173 observed rows; zero remaining before/after fallback; zero fallback kills.                                                                                                                                                                  |
| Original code, `baseline-lifecycle`                                                                                                              | 12 / 0 / 0                                | 0     | 365 observed rows; zero remaining; zero fallback kills.                                                                                                                                                                                        |
| Repaired code, `repaired-lifecycle`                                                                                                              | 14 / 0 / 0                                | 0     | 654 observed rows; zero remaining; zero fallback kills. Original 12 assertions plus two new regression cases pass.                                                                                                                             |
| Repaired code, `expected-startup-refusal -t 'tears down the full stack'`, with existing fixture preload and `TEST_BOOTSTRAP_FAIL_SERVICE=worker` | 0 / **1** / 13 (13 excluded by selection) | **1** | Expected negative control: worker exit 73, public exit 1, `BOOTSTRAP_STOPPED`, `FAILED`, `ready_emitted:false`, `cleanup_forced:false`; 15 observed rows, zero remaining and zero outer fallback kills. Preserved as FAIL, not relabeled PASS. |
| Bounded ESLint of lifecycle test and C wrapper                                                                                                   | PASS                                      | 0     | No launcher or other-owner lint scope.                                                                                                                                                                                                         |
| Prettier check of lifecycle test and C wrapper                                                                                                   | PASS                                      | 0     | Followed single-file/package formatting.                                                                                                                                                                                                       |
| Focused strict TypeScript                                                                                                                        | PASS                                      | 0     | `pnpm exec tsc --noEmit --strict --skipLibCheck --target ES2024 --module NodeNext --moduleResolution NodeNext --types node tests/foundation/bootstrap-lifecycle.test.ts`.                                                                      |
| `git diff --check`                                                                                                                               | PASS                                      | 0     | Exact changed-path checks repeated at freeze.                                                                                                                                                                                                  |

All test invocations above use `node docs/reports/start-ready-20261011/C/bootstrap-lifecycle/run-focused.mjs <label> [selection]` from the exclusive worktree. The negative control adds only `NODE_OPTIONS=--import=file:///Users/samuel/Documents/econclub/.econmind-worktrees/c-bootstrap-lifecycle-ci-fix-20261011/tests/fixtures/control-bootstrap-service.mjs` and `TEST_BOOTSTRAP_FAIL_SERVICE=worker` to the clean environment. The 100 ms wait exists only inside the added cleanup regression against an already-observed Web listener with the existing 5000 ms Worker delay fixture; it does not alter production or original acceptance timeouts.

Preserved preparation failure: the first wrapper launch used the cached `pnpm` shebang-less installer placeholder and failed before tests with `Error: spawn ENOEXEC`, errno -8, Node 24.20.0. Shell execution had succeeded, but macOS direct child spawn cannot execute that placeholder. Replacing only the task-local PATH entry with the installed native binary enabled the bounded tests. This local setup failure is **not** evidence of the CI root cause and is not counted as a test PASS/FAIL.

## Evidence inventory (SHA-256)

Retained directory: `/Users/samuel/Documents/econclub/.econmind-artifacts/c-bootstrap-lifecycle-ci-fix-20261011`.

| File                                      | SHA-256                                                            |
| ----------------------------------------- | ------------------------------------------------------------------ |
| `original-official-pnpm-check.log`        | `b57f844c512fd6c520e4aaff93f7a5dee17e0af93e51ce8d64635df34bd5ba92` |
| `baseline-pair.log`                       | `e8953f1d209d6beecde43a08a9b2afd1d6c6c043614898deee73cb8bda98bab8` |
| `baseline-pair.processes.json`            | `3fa767e1cc6f99afa8ddac4c16dbd1fc093ea8d554b4ff4a7d71e52b97555326` |
| `baseline-lifecycle.log`                  | `9153f41960489cd3465f9c6bcba0a57e2c9eed318f185608a99dafe2b80ee838` |
| `baseline-lifecycle.processes.json`       | `6d8f5f6bb311dbdd7fc2339c03db076110fa6ea1b4c778d1fba6796e3f6265df` |
| `repaired-lifecycle.log`                  | `4df1c6b6d8d4087c0c99a6c45df4c5fec4706721ba65c295f4ef83750dd556f1` |
| `repaired-lifecycle.processes.json`       | `8f70c9c7fad4edcf2d5525f49f6cfafef364afb10dbfa063ac92cb0ba31d4326` |
| `expected-startup-refusal.log`            | `ef20a85a6950b82681898c3e016833b67e51f43187845545dca8472b4d1920ca` |
| `expected-startup-refusal.processes.json` | `842de57770dfd76ddd5ae4c977e05821fb8664cc491b40def4af362a86313aa2` |

Tested lifecycle file SHA-256 `9c631e43f5326b34c7fc865d7209f1971fc71a3fe10db8fb460c5cd2c2a82541`. C wrapper SHA-256 `1990eacbaf1458b0dbceffe3374c20c0e0bc4cba84c6f68aa8d09d569f79c272`.

Unchanged product/reference hashes: `scripts/run-development-stack.mjs` = `4686765db357b3ed22c32d5f2d24995c71adff5316156837c5a183a216f45a5a`; `scripts/run-development-service.mjs` = `a69ca450b0f3dcf24b8c609179c63ccd201a8c6c1b8be68cc107da1bea462bf1`; `tests/fixtures/control-bootstrap-service.mjs` = `b048004fb12f947982743780421c0cf1091f23c7db7b9f5457e86bc2ce1ada5d`.

## Authority and stop

No Root checkout or B-owned untracked file is changed. No source/SQL/grant/credential/database/status/configuration/economic semantics/Industry/Clock file is changed. Existing manual rowCount fix, READY/TOCTOU/crash/cleanup requirements and original failures are preserved. No test is deleted or skipped to make the candidate pass.

NOT_RUN: repeat full `pnpm check`, CI rerun, native PostgreSQL, production or shared services, formal World opening, World Clock or economic timer, deployment/activation/push/merge. Local green lifecycle evidence does not replace the original failed official run.

Next authority: B may narrowly review test diagnostics, pre-READY ownership, cleanup truth and unchanged acceptance assertions. The actual CI startup cause remains OPEN; only a future instrumented occurrence or other concrete evidence can resolve it. C does not propose a speculative launcher patch, timeout increase or blanket retry. Freeze commit/tree/diff and stop at handoff.
