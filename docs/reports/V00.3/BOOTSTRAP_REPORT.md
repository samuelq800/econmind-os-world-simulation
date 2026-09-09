# V00.3 Bootstrap Report

## Result

The unified public command `pnpm dev` starts the three existing V00.2 public
launchers, verifies all local readiness surfaces plus Web-to-API dependency
health, and emits `BOOTSTRAP_READY` exactly once only after final live
revalidation. The implementation commit is
`6b934936d2eebb8c115afb869fbd48ebd7c611fa`.

## Public startup topology

```text
pnpm dev
  -> scripts/run-development-stack.mjs
     -> pnpm dev:web
     -> pnpm dev:api
     -> pnpm dev:worker
```

The stack coordinator is classified as SERVER_TOOL/SERVER_ONLY. Each child
continues to use the V00.2 public launcher and its own parent-loss, build,
runtime, signal, and bounded-shutdown behavior.

## Readiness commitment

The coordinator's bounded polling loop requires all of these conditions:

- `world-web /readyz`: HTTP 200, `status: ok`, `ready: true`, and
  `authoritative: false`;
- `world-api /readyz`: HTTP 200, `status: ok`, `ready: true`, and
  `authoritativeMutationEnabled: false`;
- `world-worker /readyz`: HTTP 200, `status: ok`, `ready: true`, and
  `simulationEnabled: false`;
- `world-web /__bootstrap/api-health`: HTTP 200 and the exact sanitized
  Web-to-API `status: ok` contract;
- all three owned public launcher children still alive.

After the first complete snapshot, the coordinator emits only
`BOOTSTRAP_READY_CANDIDATE`, yields, and performs a new set of one-shot probes
and child-liveness checks. Only that final snapshot can commit phase `READY` and
emit the single `BOOTSTRAP_READY` event. A dedicated adversarial test kills the
API runtime in this interval and proves that aggregate READY is not emitted.

## Phase and outcome

Lifecycle phase is separate from terminal outcome:

```text
STARTING -> WAITING_FOR_DEPENDENCIES -> READY -> SHUTTING_DOWN -> STOPPED
outcome = SUCCESS | FAILED | CANCELLED
```

A cleaned-up failure remains `phase: STOPPED`, `outcome: FAILED`, with fixed
failure metadata where applicable. A signal or parent exit before READY is
`CANCELLED`; a normal developer stop after READY is `SUCCESS`; invalid config,
startup/dependency failure, timeout, TOCTOU failure, child crash, or cleanup
timeout is `FAILED`.

## Web-to-API operational endpoint

`GET|HEAD /__bootstrap/api-health` exists only in the server-side Web
development/preview runtime. It derives the API origin from the allowlisted
local API host and validated integer port, then performs one request to the
fixed `/readyz` path with a one-second timeout, `redirect: error`, no
credentials, no cache, and no internal retry.

The response has one readiness truth:

```json
{ "service": "world-web", "dependency": "world-api", "status": "ok" }
```

HTTP 200 means the API response passed semantic readiness validation. HTTP 503
returns the same fixed schema with `status: "unavailable"`. Upstream URLs,
hosts, ports, response bodies, errors, environment values, and secrets are not
returned. Unsupported methods return 405; no broad CORS policy was added. This
reserved endpoint is not a business proxy and does not approve ADR-19.

## Fail-closed evidence

The real `pnpm dev` test matrix covers independent Web/API/Worker launcher
failure, occupied port, invalid environment, invalid/duplicate/injected port,
invalid URL-like host/path/protocol input, readiness timeout, SIGINT/SIGTERM
during startup, repeated cleanup signals, post-ready Worker crash, forced
cleanup timeout, and the API TOCTOU exit. Every failed path rejects aggregate
READY, performs bounded owned-process cleanup, and releases all three test
ports. Shell injection creates no marker, and the coordinator uses
`shell: false`.

The dependency endpoint matrix proves one upstream hit per invocation, redirect
rejection without contacting the redirect target, fresh failure after earlier
success, 503 sanitization, no upstream error disclosure, no success cache, and
no cross-origin authority header. A synthetic service-role value appears in
neither bootstrap output nor the endpoint response.

## Data and authority effects

Database/Supabase access, mutation, migration, backfill, RLS, seed, and Realtime
business state are all **NONE**. The coordinator reads only process state,
signals, validated local configuration, and operational HTTP responses. It does
not own or mutate World State, economic state, Simulation Clock, commands,
events, settlement, Office permissions, or simulation behavior.

## Status

V00.3 is `IMPLEMENTED_UNVERIFIED`. The next action is independent review of
this V00.3 candidate only. V01.1 remains `PLANNED` and must not start.
