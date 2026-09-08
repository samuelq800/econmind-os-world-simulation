# Environment safety runbook

## Classification

The Supabase project linked to this checkout belongs to EconMind OS and is
classified as a **production integration target only**. It is not an approved
development or test database. V00.1 performs no database mutation.

## Allowed during V00.1

- Read local link metadata without printing credentials.
- Run `pnpm supabase:safe -- --version`.
- Run `pnpm supabase:safe -- status` when local Supabase services are expected.
- Run `pnpm env:check`.

The wrapper rejects all other Supabase command arguments. Direct invocation of
the globally installed CLI is outside the repository guard and remains
prohibited by policy.

## Prohibited against the linked project

- migrations, `db push`, `db reset`, seed operations, and arbitrary SQL;
- destructive or data-changing functions;
- schema inspection that requires exposing credentials in logs;
- service-role keys in source control or any `VITE_*` variable;
- using the linked production project as a development/test fixture.

## Local and CI policy

When `ECONMIND_ENV` is `local` or `ci`, any `DATABASE_URL` must resolve to
`localhost`, `127.0.0.1`, or `::1`. Environment files are ignored except for
sanitized `*.env.example` templates. Future schema work requires an isolated
local Supabase instance or separately approved ephemeral environment.

## Browser environment enforcement

The `world-web` Vite configuration validates the same effective browser
environment Vite loads from process variables and `.env`, `.env.local`,
`.env.[mode]`, and `.env.[mode].local` files in `apps/world-web`. It runs before
both the development server and production build. Direct workspace Vite commands
therefore use the same fail-closed check as the root workflow.

Forbidden browser names include Supabase service-role/server secrets, database
administrative credentials, private keys, and explicitly server-only credential
namespaces. Diagnostics report only the variable name and category. Values are
never included. Public values such as `VITE_WORLD_API_BASE_URL` and Supabase
publishable/anonymous browser keys remain permitted.

`pnpm env:check` independently validates both the development and production
Vite modes in addition to process-level local/CI database rules. Other Vite
modes receive the same check when their dev/build configuration is loaded.

## Safe response to uncertainty

Stop before issuing a command. Run `pnpm env:check`, inspect the intended target
without revealing secrets, and obtain an explicit environment decision. Never
infer that a linked project is safe for mutation.
