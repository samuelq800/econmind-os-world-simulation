# Repository boundaries

## Purpose

V00.1 creates executable boundaries before product implementation begins. The
repository is a pnpm monorepo with browser, API, and worker applications. Shared
packages are added only when they have real implementation content.

## Dependency direction

```text
world-web ──commands/queries──> world-api ──future dispatch──> world-worker
     │                              │                              │
     └──── future contracts/ui ─────┴──── future core/contracts ──┘
```

This diagram is a responsibility model, not a claim that those integrations are
implemented.

### `apps/world-web`

- Non-authoritative browser presentation.
- May submit commands and render query responses.
- Must not import persistence, API server, worker, service-role, or authoritative
  settlement modules.
- Browser-visible configuration must never contain service-role credentials or
  database connection strings.

### `apps/world-api`

- Future authentication and authorization boundary.
- Future command acceptance and query service.
- Must not become an alternative simulation engine.

### `apps/world-worker`

- Future authoritative command execution and time progression host.
- V00.1 explicitly keeps simulation disabled.

### `packages/core`

When created, it will contain deterministic domain logic. It must not import
React, React DOM, Supabase SDKs, UI packages, or browser-only APIs. Persistence
adapters must remain outside core.

## Reserved package names

The architecture reserves `contracts`, `core`, `registries`, `persistence`,
`integration`, `ui`, and `testkit`. Empty package directories are intentionally
not created in V00.1 because they would imply capabilities that do not exist.

## Enforced checks

`pnpm test:boundaries` statically scans current web and future core source roots.
Vitest includes negative fixtures proving the rules detect forbidden imports.
These are foundation guardrails; they do not replace later dependency graph,
database policy, or end-to-end authorization tests.
