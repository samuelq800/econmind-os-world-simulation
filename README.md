# EconMind OS World Simulation

Repository foundation for the EconMind World simulation. V00.1 establishes the
toolchain, workspace boundaries, and environment safety controls only. No
economic engine, authoritative World State, database schema, or gameplay
feature is implemented here yet.

## Frozen toolchain

- Node.js 24.20.0 (LTS)
- pnpm 12.3.4
- TypeScript 6.0.3
- Vite 8.2.2
- React 19.2.8
- Vitest 5.0.0
- ESLint 10.10.0
- Prettier 3.9.6

Use the exact Node and pnpm versions above. Installation fails closed when the
active versions differ.

## Workspace responsibilities

- `apps/world-web`: non-authoritative browser UI; submits commands and reads
  query results only.
- `apps/world-api`: future authentication, command, and query boundary.
- `apps/world-worker`: future authoritative execution host.
- `packages/core`: future deterministic domain logic; must remain independent
  of React, browser APIs, and arbitrary persistence writes.
- `packages/contracts`, `registries`, `persistence`, `integration`, `ui`, and
  `testkit`: reserved workspace names, created only when an implementation
  package is actually needed.

## Commands

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:boundaries
pnpm env:check
pnpm secrets:check
pnpm build
pnpm check
```

Use `pnpm supabase:safe -- status` for the only repository-approved Supabase
status check. Direct production database mutation is prohibited. See
`docs/runbooks/ENVIRONMENT_SAFETY.md` before any integration work.
