# V00.3 Implementation Report

## Result

V00.3, Startup-Layer Integration Verification and Bootstrap Report, is
implemented at `6b934936d2eebb8c115afb869fbd48ebd7c611fa`. The implementation
adds one unified `pnpm dev` boundary, narrow server-side Web-to-API operational
health, Worker readiness participation, aggregate bootstrap evidence, and
adversarial lifecycle/security tests. Status is `IMPLEMENTED_UNVERIFIED` pending
independent review.

## Implementation

- `scripts/run-development-stack.mjs` validates fixed local host/port/timing
  configuration before spawning three existing public `pnpm dev:*` commands
  with `shell: false`.
- The coordinator uses bounded readiness polling, separate one-shot HTTP probes,
  a global deadline, final liveness/dependency revalidation, exactly-once READY,
  phase/outcome separation, retained failure metadata, parent-loss detection,
  idempotent signals, bounded cleanup, and an owned-PID kill fallback.
- `apps/world-web/vite.config.ts` adds the server-only
  `/__bootstrap/api-health` dependency endpoint with fixed API `/readyz` target,
  semantic validation, no redirects/retry/cache/credentials, bounded body and
  timeout, and a fixed sanitized response.
- The architecture registry classifies both public launcher scripts as governed
  SERVER_TOOL/SERVER_ONLY paths and rejects imports between those tools and
  browser/application runtime ownership.
- `.env.example` now has non-conflicting safe local defaults: Web 4100, API
  4101, and Worker health 4102.

## Reads, writes, events, and commands

Reads: validated local environment values, child liveness, OS signals, process
table rows for owned cleanup, and fixed local operational HTTP responses.

Writes: process control and sanitized JSON-line operational evidence only. No
files, domain state, cache, database, or Supabase resources are written.

The coordinator emits operational lifecycle records, not domain events. It
does not accept or execute an economic command and does not create authoritative
World State.

## Validation

The pinned Node 24.20.0/pnpm 12.3.4 toolchain passed frozen install, lint,
format, typecheck, 92 tests across eight files, 29 focused boundary tests plus a
live scan of 14 governed files, local environment validation, a 249-file secret
scan, and all three builds. The tests execute the real public `pnpm dev` command
and verify process-tree termination and port reuse.

Earlier rounds failed and were fixed: the first new-suite round exposed a test
fixture undefined-target bug and an over-strict Web process matcher; the first
full round exposed an unformatted plan/status; a later full concurrent run
exposed an overly short test startup deadline. These failures remain recorded
in `TEST_EVIDENCE.json`.

## Security

The implementation accepts no arbitrary probe URL and constructs no shell
command from environment data. Tests reject URL-like host values, protocol/path
and port injection, duplicate ports, shell injection, redirect escape, cached
success, response-detail leakage, service-role leakage, unsafe `shell: true`,
and stale pre-commit readiness.

The Web dependency endpoint forwards no request headers or credentials and adds
no broad CORS. It is operational-only and does not establish production proxy,
authentication bridge, Cookie, PKCE, redirect, cache, or ADR-19 semantics.

## Database, legacy, and excluded scope

- Database/Supabase access and mutation: **NONE**.
- Migration, backfill, RLS, seed, recovery, or deployment: **NONE**.
- Existing main-site/legacy behavior: unchanged.
- V01 requirement/ADR coordination, V02 isolation, V03 registries, V05
  identity/Office permissions, V06 Simulation Clock, V07 command/event ledger,
  V08 ledgers, V25 UI/map, V26 forecast/cache, V27 country initialization, and
  V28 orchestration: not implemented.
- ADR-01 through ADR-20 remain `PROPOSED_NOT_APPROVED`.

## Limitations and next action

Windows process-tree/signal behavior was not run; the public lifecycle suite is
skipped there. Production/staging deployment and real network infrastructure
were not run because this local bootstrap step neither requires nor authorizes
them.

Next action: independent review of V00.3 only. Do not start V01.1.
