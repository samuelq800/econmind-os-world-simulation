# V00.2 Implementation Report

## Result

V00.2, Three Application Runtime Entries and Lifecycle Skeleton, was initially
implemented at commit `98b2079b134d9926db960994aa5a2d04d89dd8be` and has
reviewer-driven lifecycle corrections committed at
`52f44f962d9f28b27781c4ee74f7c25dea813470`. Its status remains
`IMPLEMENTED_UNVERIFIED`; the final branch HEAD containing this report is the
immutable candidate for a new independent re-review.

## Implemented behavior

- `world-web` starts as a real Vite process with strict host/port validation,
  `/healthz` and `/readyz`, no-store operational responses, and idempotent
  graceful close paths for SIGINT and SIGTERM.
- `world-api` builds and starts a real Node HTTP process with liveness,
  readiness, 404/405 behavior, fail-closed configuration, idempotent bounded
  shutdown, and structured lifecycle logs.
- `world-worker` builds and starts a separate Node process with a loopback-first
  operational health listener, fail-closed configuration, bounded shutdown,
  and explicit `simulationEnabled: false` reporting.
- Root and app scripts route through one per-application public launcher. It
  uses no shell or process-group kill, preserves API/Worker build-before-run
  behavior, detects loss of its pnpm parent, and owns only the selected
  application's current build or runtime child.
- The test suite starts all three concurrently on isolated loopback ports;
  V00.3's unified development command and Web-to-API communication were not
  implemented.

## Authority and data effects

The web process remains non-authoritative. The API exposes no domain command or
mutation route. The worker executes no simulation. Readiness is process-local
ephemeral operational state, not World State or a derived economic projection.

The implementation reads only explicit environment, HTTP requests, and OS
signals. It writes only HTTP responses and redacted lifecycle logs. It emits no
domain events, consumes no commands, and introduces no persistence, RLS,
migration, simulation-time, or legacy-site behavior.

No Supabase SDK, credential, API, database, migration, seed, SQL, deployment,
or production mutation path was used.

## Main files

- `apps/world-web/server.mjs` and `vite.config.ts`
- `apps/world-api/src/main.ts` and `runtime.ts`
- `apps/world-worker/src/main.ts` and `runtime.ts`
- `scripts/run-development-service.mjs`
- the three application package files and root package scripts
- `scripts/architecture-ownership.mjs` and `check-boundaries.mjs`
- `tests/foundation/runtime-lifecycle.test.ts` and
  `public-runtime-lifecycle.test.ts`
- `docs/exec-plans/V00.2.md`

The boundary registry classifies the web server entry as server-side web build
configuration, and the scanner deduplicates files because that entry is both
inside `apps` and explicitly governed.

## Validation

Using Node 24.20.0 and pnpm 12.3.4, the corrected tree passed lint, format
check, typecheck, 79 tests, 28 focused boundary tests plus the live scan,
environment check, secret scan, all builds, the aggregate check, and
`git diff --check`.

Those results were executed during the completed correction round and are
preserved as historical execution evidence. This candidate-finalization round
did not rerun the technical checks.

The runtime tests exercise real TCP listeners and the exact root `pnpm dev:*`
commands. They signal only the public pnpm PID, record the full process tree
before signaling, and verify descendant death, endpoint closure, and immediate
port rebind before any failure cleanup. They also cover repeated and mixed
signals during an incomplete request, parent loss before launcher
initialization, build failure, and unexpected signal exit-code propagation.

The targeted self-audit additionally covered twelve public startup-failure
cases, bounded natural and forced shutdown, app-level `dev`/`start` aliases,
and independent stop/restart of each application while its siblings remained
healthy. See `SELF_AUDIT.md`.

Earlier focused test iterations failed and were fixed; they are retained in
`TEST_EVIDENCE.json` rather than rewritten as passes.

## Not run and excluded

- Production or staging deployment: `NOT_RUN`.
- Supabase/database access, mutation, migration, RLS, and recovery: `NOT_RUN`
  because V00.2 neither requires nor permits them.
- Browser E2E rendering beyond the real Vite HTTP process: `NOT_RUN`.
- Windows lifecycle execution: `NOT_RUN`; public lifecycle tests are skipped
  there, and no cross-platform signal claim is made.
- V00.3 Web-to-API health communication, worker integration, unified dev
  command, and bootstrap report: excluded future work.

## Next action

Run a new independent re-review of the exact final `feat/v00-2` candidate HEAD
and verify its referenced correction commit. Do not start V00.3.
