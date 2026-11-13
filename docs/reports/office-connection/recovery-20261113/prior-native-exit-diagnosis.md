# Bounded read-only diagnosis of final native runner exit 1

No tests rerun; no code changes; no PostgreSQL restarts.

## Exact command / tool outcomes

Executed alone in `/workspace/econmind-os-world-simulation`:

```sh
PATH=/workspace/.cloud-setup/tools/node-v24.20.0-linux-x64/bin:/workspace/.cloud-setup/tools/pnpm-12.3.4/node_modules/.bin:$PATH ECONMIND_SOCIAL_ORDINAL_NATIVE=1 ECONMIND_SOCIAL_ORDINAL_EVIDENCE_DIR=/workspace/recovery-evidence-20261113/final-native pnpm exec vitest run tests/world-core/postwar-social-employment-creation-ordinal-native.test.ts --reporter=json --outputFile=/workspace/recovery-evidence-20261113/final-native.json > /workspace/recovery-evidence-20261113/final-native.log 2>&1
```

Initial `exec_command` returned running session 35957; `write_stdin` on that session returned **exit_code 1**. There was no shell separator, pipeline, before/after hash command, Git check, or later cleanup command in this shell invocation. The stdout/stderr redirection was the only shell operation after environment assignments. The separately executed before-input capture returned 0; separately executed after-input capture returned 0. Therefore this exit 1 cannot be attributed to an appended hash/Git command.

The log is exactly 79 bytes: `JSON report written to /workspace/recovery-evidence-20261113/final-native.json\n`. JSON has four passed assertion cases, no failed/skipped case, one file status `passed`, empty file message/failureMessages, success true. **The JSON has no `unhandledErrors` field. Absence is not proof of no unhandled errors.**

## Verified reporter limitation

Installed Vitest 5.0.0 `dist/chunks/index.B89dZ0-N.js`:

- line 17800: JSON reporter `onTestRunEnd(testModules)` takes only modules, ignores the error/state arguments.
- line 17814: JSON `success` depends only on number of failed tests/suites (and files/passWithNoTests).
- lines 17861–17874: serialized JSON contains neither unhandled errors nor final process exit status.
- line 21375: `_checkUnhandledErrors` sets `process.exitCode = 1` when unhandled errors exist and are not ignored.
- line 19980: cancellation/non-passed run state independently sets exit 1.
- worker `init.BS957yFf.js` lines 97–113: uncaught exception/unhandled rejection is sent to the runner independently of test assertion outcomes.

Thus the observed four passing cases plus exit 1 is consistent with a runner-level unhandled error; it must **not** be reported as an overall green gate. JSON-only reporter has not retained the runtime error detail. No evidence of cancellation was found in the saved output.

## Concrete startup race evidence

The new adapter opens a `pg.Client`, connects and queries version **before** checking `/proc/1/comm` to ensure final postmaster startup. A temporary init postmaster uses the same Unix socket. No client `error` listener exists during the probe. The `pg` client emits asynchronous `error` on disconnected established sessions (`pg/lib/client.js` `_handleErrorEvent`), outside the awaited query/connect promise.

Three actual container logs show `FATAL: terminating connection due to administrator command` during temporary init-postmaster shutdown, before the final PID-1 PostgreSQL starts:

- `econmind-social-ordinal-ad6e788f`: 03:25:20.597 UTC; final postmaster starts 03:25:20.715.
- `econmind-social-ordinal-1ab3c14d`: 03:25:28.493 UTC; final starts 03:25:28.609.
- `econmind-social-ordinal-9c915fa9`: 03:25:34.903 UTC; final starts 03:25:35.013.

Exact selective extracts retained in `exit-diagnosis-pg-log-extracts.json`. All test transactions subsequently passed, and all four containers stopped cleanly with exit 0 and no OOM. Startup FATAL here is distinct from the deliberate SQL permission/range errors asserted by the tests.

This is a concrete harness defect and the strongest supported explanation for exit 1. Without a captured runner error stack, it remains a diagnosed mechanism consistent with the observed logs, not a proved stack-to-exit attribution. A minimal later fix is to wait for the final PID-1 postmaster **before connecting**, record/handle probe connection events explicitly, and fail on unexpected established-session errors. A later diagnostic run should include the default reporter alongside JSON so unhandled errors are retained. Do not suppress unhandled errors or set exitCode to zero.

## Outcome

**Four SQL assertion cases passed; runner failed with exit 1. Final native gate remains failed/unresolved.** Source/build before/after digest and HEAD were unchanged. Original and new retained test databases were not modified by this read-only diagnosis.
