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
implemented. V00.3 adds only server-side operational health communication from
the Web development runtime to the API `/readyz` surface; it does not implement
the future command/query arrow or a production proxy.

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

### V00.3 bootstrap tooling

`pnpm dev` invokes `scripts/run-development-stack.mjs`, a SERVER_ONLY
operational coordinator. It starts the existing `pnpm dev:web`, `pnpm dev:api`,
and `pnpm dev:worker` public boundaries, observes their fixed local readiness
surfaces, and owns bounded stack cleanup. It does not own World State, economic
time, commands, events, persistence, or simulation.

The Web development server reserves `GET|HEAD /__bootstrap/api-health` for one
server-side, no-redirect, no-cache probe to the fixed API `/readyz` target. The
response is sanitized to `ok` or `unavailable`. It is not an `/api/*` namespace,
does not forward credentials or upstream content, and does not approve ADR-19.

### `packages/calibration`

- Non-authoritative, Node-side empirical data engineering and frozen-package preparation.
- Owns provider request specifications, fixture/live retrieval adapters, raw snapshot metadata, normalization, provenance, and calibration-only exact arithmetic.
- Has the dedicated `CALIBRATION_DATA` owner and may import only its own local modules and installed/Node dependencies.
- No World runtime owner, shared-public package, build helper, policy helper, or server tool may import it. A future reviewed frozen-package handoff must use a separately approved public contract instead of exposing provider adapters.

## Reserved package names

The architecture reserves `contracts`, `core`, `registries`, `persistence`,
`integration`, `ui`, and `testkit`. Empty package directories are intentionally
not created in V00.1 because they would imply capabilities that do not exist.

## Enforced checks

`pnpm test:boundaries` statically scans current web and future core source roots.
Vitest includes negative fixtures proving the rules detect forbidden imports.
These are foundation guardrails; they do not replace later dependency graph,
database policy, or end-to-end authorization tests.

### Ownership and complete governed coverage

`scripts/architecture-ownership.mjs` is the single ownership and allowed-edge
registry. Paths under `apps/world-web`, `apps/world-api`, and `apps/world-worker`
are WORLD_WEB, WORLD_API, and WORLD_WORKER respectively. Reserved contracts,
core, registries, and UI paths are SHARED_PUBLIC; persistence, integration, and
testkit paths are SERVER_ONLY. `packages/calibration` is CALIBRATION_DATA and is
isolated from every World runtime and shared-public owner. No product package is
created by the reserved classifications. New/unclassified packages are UNKNOWN
and require an explicit architecture decision before their source can pass the
gate.

The scanner enumerates all `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`,
and `.cjs` files throughout `apps/**` and `packages/**`, including declarations,
outside-src modules and configuration. Every shared-public source is scanned,
so a public barrel cannot hide an authority import. WORLD_WEB may depend only
on WORLD_WEB runtime or SHARED_PUBLIC local modules; SHARED_PUBLIC may depend
only on SHARED_PUBLIC. Core retains its React/React DOM/Supabase/UI isolation.
API and worker source retain server execution context; this does not implement
an economic engine or authorize database mutation.

Only the exact `apps/world-web/vite.config.ts` entry and the two environment
policy files listed in BUILD_HELPERS have WEB_BUILD_CONFIG context. Those
helpers are scanned too. Build context can import the approved build helpers
and installed tooling/Node builtins, but cannot import worker, API, arbitrary
server helpers, or browser runtime implementation. Browser/shared runtime cannot
import build-context files. Running in Node is not an authority exemption.

The exact public service launcher and unified bootstrap coordinator listed in
SERVER_TOOLS have SERVER_TOOL context and SERVER_ONLY ownership. They are part
of complete scan coverage and may use installed tooling and Node builtins, but
do not grant browser/shared code an import edge into server operational logic.

`node_modules`, `dist`, `coverage`, and `.vite` directory segments are excluded
as installed dependencies or generated output. Governed local imports into
these unverified directories are rejected. Source symlinks fail explicitly;
resolved import paths are canonicalized before ownership is checked. Temporary
test fixtures live outside the governed app/package roots and are removed in
cleanup blocks. No general outside-src or filename-prefix exclusion exists.

Module references are parsed with the TypeScript AST. Static imports, side-effect
imports, re-exports, import-equals, import types, literal dynamic imports, and
literal require calls remain checked. TypeScript resolution handles `.js` to
`.ts` substitution and configured aliases; Vite query/hash postfixes do not
exempt imports. Runtime JavaScript is scanned independently of any declaration
file selected by TypeScript. Workspace-name mapping supplies ownership diagnostics
for reserved packages, not permission to accept a missing target. Unresolved or
unowned local/workspace references fail with UNRESOLVED_ARCHITECTURE_IMPORT.
Nonliteral module references and Vite `import.meta.glob` are not approved in
V00.1 and fail explicitly rather than being silently expanded by the bundler.

Bare external npm dependencies are a separate trust category: they must actually
resolve into installed node_modules and must not resolve to a workspace owner.
The checker does not recursively audit third-party package implementations.
Node builtins/server-only modules are forbidden to browser/shared runtime but
permitted to build/server contexts. No current Vite aliases exist; any future
alias must also be safely resolvable by the TypeScript configuration.

`pnpm test:boundaries` runs the CLI regression suite then scans the real repository.
A separate integration test executes that exact canonical command with a
controlled outside-src re-export fixture. These checks remain foundation controls,
not a replacement for future economic invariants, authorization, or RLS tests.
