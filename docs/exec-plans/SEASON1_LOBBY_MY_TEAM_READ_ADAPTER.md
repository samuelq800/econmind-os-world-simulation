# Season 1 “my team” read-adapter preparation

Status: `PREPARATION_ONLY_NOT_ACTIVE`; `LIVE_NOT_RUN`.

## Fixed source contract

The only legacy source is the deployed Season 1 RPC
`get_world_preseason_my_team`. Its server-side contract scopes the read through
`auth.uid()` and the fixed legacy Season 1 code. The adapter has no `teamId`,
`seasonId`, school, captain, or role-preference input. It must never substitute
an admin lobby, generic League team lookup, another Season version, or a
time-based “latest team” fallback.

The adapter returns only the RPC's documented `team`, `membership`, and
`members` fields. The returned `sourceRpc` and `seasonCode` labels document the
expected source contract; neither is a World authorization, Office assignment,
country boundary, or command capability.

## Server configuration contract

Only a future server composition root may parse the following variables:

- `WORLD_LOBBY_SUPABASE_URL`
- `WORLD_LOBBY_SUPABASE_PUBLISHABLE_KEY`
- `WORLD_LOBBY_SUPABASE_PROJECT_REF`

The URL must be the exact HTTPS origin derived from the project reference. The
key may be a Supabase publishable key or legacy anon public JWT, never a secret
or service-role key. A per-request user access token is transiently forwarded
only to the fixed RPC URL; it is not persisted or logged.

## Activation prerequisites

1. Provide the three server environment variables through a controlled runtime
   secret/configuration mechanism; do not place them in browser source or a
   tracked environment file.
2. Compose the adapter behind a new authenticated server endpoint with explicit
   origin and rate-limit policy. This candidate registers no endpoint.
3. Exercise one real user session only after the endpoint contract is reviewed.
   Distinguish `UNAUTHENTICATED`, `MISSING_RPC`, `OFFLINE`, and a true empty
   Season 1 team response.
4. Do not grant World permissions from lobby captain/member/school/preference
   data. Any later World authorization remains separately server-owned.
