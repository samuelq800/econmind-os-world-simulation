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

V00.3's unified development command accepts only the exact local bind hosts
`localhost`, `127.0.0.1`, `::1`, and `0.0.0.0`, integer ports from 1024 through
65535, and distinct Web/API/Worker ports. It constructs health URLs internally;
there is no arbitrary probe URL, protocol, path, redirect, or shell command
input. The default ports are Web 4100, API 4101, and Worker health 4102. The
bootstrap timing controls are bounded integer durations and never carry
credentials or database targets.

## Browser environment enforcement

The `world-web` Vite configuration validates the same effective browser
environment Vite loads from process variables and `.env`, `.env.local`,
`.env.[mode]`, and `.env.[mode].local` files in `apps/world-web`. It runs before
both the development server and production build. Direct workspace Vite commands
therefore use the same fail-closed check as the root workflow.

The authoritative public-client contract is
`scripts/vite-environment-policy.mjs`. Unknown `VITE_*` keys fail closed. Only
these keys are approved at this foundation stage:

| Key                             | Accepted value                                                        |
| ------------------------------- | --------------------------------------------------------------------- |
| `VITE_WORLD_API_URL`            | Public HTTP(S) API endpoint                                           |
| `VITE_WORLD_API_BASE_URL`       | Existing documented API endpoint spelling, retained for compatibility |
| `VITE_SUPABASE_ANON_KEY`        | Structurally valid HS256 JWT whose role is exactly `anon`             |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase public publishable-key format                                |
| `VITE_USER_NODE_ENV`            | Vite's own marker: `development`, `production`, or `test`             |

These keys are optional. The two existing public Supabase key categories remain
approved configuration; no Supabase browser integration is added. JWT validation
classifies the public role and structure, not authenticity or authorization.
Vite derives its internal marker from dotenv NODE_ENV; accepting its narrowly
validated values preserves native environment semantics. No speculative app-env
or other future product keys are added.

API URLs must have HTTP(S) protocol and no username/password, query, fragment,
or control whitespace. All approved values also undergo credential-class checks:
database connection strings, private-key material, secret-key prefixes, bearer
credentials, and non-anonymous JWTs are rejected. Percent encodings are inspected
through decoding, and malformed encodings fail closed. JWT structure is decoded
independently of header whitespace or base64 prefixes. Database/server-semantic
key tokens provide useful denial categories; they cannot grant permission.

Errors contain only key names and reason categories, never values. The same
contract protects direct Vite dev/build, root build, and root canonical checks.
`pnpm env:check` validates both effective development and production environments
as well as process-level local/CI database rules. Other Vite modes receive the
same validation when their config is loaded. Loading, dotenv expansion, mode,
root, envDir, and process precedence continue to use Vite's native behavior.

Adding a public key requires an intentional contract update with semantic
validation and real-entry regressions. A name beginning with VITE_ alone is
never approval to expose its contents.

## Safe response to uncertainty

Stop before issuing a command. Run `pnpm env:check`, inspect the intended target
without revealing secrets, and obtain an explicit environment decision. Never
infer that a linked project is safe for mutation.
