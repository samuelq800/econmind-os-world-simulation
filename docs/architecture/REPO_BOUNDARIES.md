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

### Resolved module enforcement

After the V00.1 review blocker fix, the scanner uses the TypeScript compiler API
to parse module references and resolve their targets before applying repository
ownership rules. It covers `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`,
and `.cjs` source files. Static imports, side-effect imports, exports from another
module, import-equals declarations, import types, literal dynamic imports, and
literal `require` calls are inspected. A dynamic reference without a literal
module name fails closed.

Workspace package names are mapped to their repository package roots, including
reserved future package names. Relative `.js` references that TypeScript maps to
existing `.ts` sources are judged by the resolved source owner. TypeScript path
aliases are resolved from the nearest repository `tsconfig.json`. A Vite alias
must also be represented in TypeScript resolution; an unresolved code import
fails the boundary check rather than being treated as external or safe.

The current active ownership rules prohibit `world-web` from resolving into
`world-api`, `world-worker`, persistence, or named server-authority
implementations. Future core rules activate when `packages/core` exists and
prohibit dependencies on the browser/UI layer, persistence, React, React DOM,
and Supabase SDKs. V00.1 contains no economic model in `world-api`; later engine
package rules remain part of the relevant future work package.
