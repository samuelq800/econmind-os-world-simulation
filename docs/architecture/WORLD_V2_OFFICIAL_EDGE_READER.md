# World V2 official selected-source Edge reader candidate

Status: **code candidate only**. This document does not record a deployment,
database credential, API activation, live World read, or Gate B closure.

## Exact public boundary

The single new Supabase function is `world-v2-official-read`. Its public base is
`https://vimksjrhaxdpnkvgsavz.supabase.co/functions/v1/world-v2-official-read`.
Only these existing World API suffixes are mapped:

- `/v1/world-data/countries` and its fixed country-ID detail route;
- `/v1/world-data/datasets` and the 34 frozen dataset slugs, including the
  existing bounded geography-section, pagination and filter contracts;
- `/v1/world-data/map-assets` metadata only (203 catalogued files; no binary
  proxy or claim that static assets have been published).

The handler reuses the Node World API's source validators and response builders
through a small Fetch adapter. Source JSON checksums, byte ceilings, selected
package identity, exact-decimal string encoding and the `liveWorldState: false`
response marker are unchanged. `GET`, `HEAD` and their exact-origin `OPTIONS`
preflight are the only methods. No Command, Event, receipt, team, arbitrary
SQL/table, World State, Worker, service-role or admin route exists here. CORS is
a browser origin restriction, **not** an authorization grant.

The adapter accepts only the public `/functions/v1/world-v2-official-read`
prefix and the function-internal `/world-v2-official-read` prefix before those
suffixes. Supabase may present the latter to the function after gateway
routing. It does not accept arbitrary prefixes or an unprefixed World API path.

Only this new function has `verify_jwt = false` in the World repository's
`supabase/config.toml`. The main-site deployment owner must apply that setting
only to this slug; the existing functions and global JWT settings are out of
scope.

## Server-only runtime configuration

The function fails at initialization unless all of these are present and exact:

| Variable                            | Required value or shape                                                                                                                                                                                                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WORLD_DATABASE_URL`                | Secret PostgreSQL URL for shared transaction pooler on port `6543`, database `/postgres`, TLS `sslmode=require` or `verify-full`, username exactly `world_v2_api_login.vimksjrhaxdpnkvgsavz`; the real pooler host must come from the project's Dashboard Connect panel, not a guessed region hostname. |
| `WORLD_API_DB_LOGIN_ROLE`           | `world_v2_api_login`                                                                                                                                                                                                                                                                                    |
| `WORLD_API_DB_READER_ROLE`          | `world_v2_api_reader`                                                                                                                                                                                                                                                                                   |
| `WORLD_DATABASE_FINGERPRINT`        | `world-v2-production`                                                                                                                                                                                                                                                                                   |
| `WORLD_DATABASE_NAMESPACE`          | `world_v2`                                                                                                                                                                                                                                                                                              |
| `WORLD_DATABASE_MUTATION_MODE`      | `disabled`                                                                                                                                                                                                                                                                                              |
| `WORLD_API_OFFICIAL_PUBLIC_ORIGINS` | Exact permitted origin list; planned Pages origin: `https://samuelq800.github.io`                                                                                                                                                                                                                       |

No legacy `WORLD_API_OFFICIAL_COUNTRY_DB_ENABLED` or
`WORLD_API_ALL_DATA_ENABLED` flag is read by this isolated entry: the new
function's deployment plus a complete dedicated credential is its activation
boundary. Missing or privileged credentials fail closed. The URL's `sslmode`
parameter is validated and then removed before constructing `pg` with
certificate-verifying TLS, so connection-string parsing cannot override the
TLS setting. The pool is one connection per warm isolate, with a three-second
connect timeout. Every fixed SELECT is run sequentially in one `BEGIN READ
ONLY` transaction, `SET LOCAL ROLE world_v2_api_reader`, and a five-second
transaction-local statement budget. Queries have no named prepared statement
and no session state must survive transaction pooling. The dedicated login must
have explicit membership in the NOLOGIN reader role; the function never uses
`postgres`, `service_role`, `anon`, or a browser key.

## Self-contained function artifact and verification

`supabase/functions/world-v2-official-read/` is the complete deployable copy
allowlist: `index.ts`, `deno.json`, `deno.lock`, and the committed `lib/` JavaScript and
declaration files. It imports no World package or file outside that directory
at deployment time. The library is a deterministic TypeScript emission of the
selected `apps/world-api/src/integration/official-*` modules, not a second
contract implementation. To refresh it after source changes:

```sh
pnpm exec tsc -p tsconfig.world-v2-official-edge-bundle.json
pnpm test:world-v2-official-edge
deno check supabase/functions/world-v2-official-read/index.ts
```

The non-deploying `world-v2-official-edge-check.yml` workflow repeats the
bundle check, focused tests, Deno type check and World API type check without
secrets. Locally, a synthetic URL may boot the Deno handler and exercise the
static map route and CORS without connecting to any database. A live source
query requires a separately approved dedicated credential and release process;
this candidate performs neither. Supabase-hosted Edge limits (especially the
CPU budget for the large geography source) remain a release-performance check,
not evidence of runtime activation.
