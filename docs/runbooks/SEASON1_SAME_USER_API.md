# Season 1 same-user read endpoint

Code-only opt-in, `LIVE_NOT_RUN`: no real user session was supplied or tested.
No schema migration, World authorization, Office assignment or economic write.

## Enable deliberately

Provide these through the API server's controlled environment, not browser
variables, source control, command-line arguments containing user sessions, or
the local-nonproduction bridge:

- `WORLD_LOBBY_API_ENABLED=true`
- `WORLD_LOBBY_SUPABASE_PROJECT_REF` — the intended 20-character project ref
- `WORLD_LOBBY_SUPABASE_URL` — its exact `https://<project-ref>.supabase.co` origin
- `WORLD_LOBBY_SUPABASE_PUBLISHABLE_KEY` — a publishable/anon key, never service-role

Absent settings (or just `WORLD_LOBBY_API_ENABLED=false`) leave the API's
existing health, readiness and 404 behavior intact. Partial configuration,
configuration without explicit enable, or disabled mode carrying connection
settings fails startup. To turn it off, remove the three connection settings
and unset the enable flag or set it to `false`.

Use the existing pinned build order Core → Worker → API before launching the
API. `readApiRuntimeConfig` and the normal `runApiProcess` entrypoint activate
this route automatically when fully configured. Startup, `/healthz` and
`/readyz` perform no Supabase calls. Readiness means process readiness, not
Supabase/RPC/session availability. Existing deployment environment safeguards
remain unchanged.

## Request and identity boundary

`GET /v1/season1/my-team`, with exactly one `Authorization: Bearer <user-session>`
header. No query string, body, userId, teamId, season selector or RPC argument.
No cookie authentication or privileged-key fallback. Forward only the received
session to `POST /rest/v1/rpc/get_world_preseason_my_team` with body `{}` and the
configured public apikey. Supabase validates the session and determines the
same-user team; API does not decode it into World permissions.

There is no added CORS grant. Requests carrying Origin are rejected; OPTIONS
and HEAD do not proxy the RPC. This is the server-side entrypoint only;
browser-session and deployment-origin integration remains separate work. Do
not weaken the local-only bridge or enable wildcard CORS to connect a UI.

Successful responses contain `ok`, `seasonCode`, `sourceRpc`, the existing
validated `data: {team, membership, members}` and `worldAuthorityGranted: false`.
A genuine no-team success is distinct from unauthenticated or unavailable.
Captain/member roles and role preferences remain lobby data only.

## Operational behavior

- Errors contain static codes only: 401 `UNAUTHENTICATED`, 403
  `AUTHORIZATION_DENIED`, 503 `MISSING_RPC` / `OFFLINE` /
  `UPSTREAM_UNAVAILABLE`, 502 `CONTRACT_INVALID` / `REMOTE_FAILURE`.
- Invalid selectors/body return 400; unsupported method 405; Origin 403.
- Ordinary protection: 5-second upstream timeout, four in-flight reads and
  60 accepted proxy attempts per process per minute, then 429. The limiter
  stores counters only, never identity or token keys. It is not a distributed
  rate-limit framework.
- `private, no-store` and `Vary: Authorization`; no shared response cache,
  server token persistence, token logging or raw upstream error reflection.
- Do not log request headers, success bodies or upstream exceptions in a
  reverse proxy/APM layer. Use HTTPS in deployment; do not paste real tokens
  into tickets, runbooks or CI. Live same-user validation needs a separately
  authorized real session and must be reported independently of fixture tests.

## Code verification

Dedicated tests exercise the real local API server with injected, non-network
fetch responses, plus the unchanged approved reader and runtime regressions.
They demonstrate protocol behavior, not live Supabase/session connectivity.
