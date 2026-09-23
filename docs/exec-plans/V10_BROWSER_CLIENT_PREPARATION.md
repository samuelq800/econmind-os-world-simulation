# World Web authorized query/command client preparation

**State:** `PREPARATION_ONLY_NOT_BROWSER_INTEGRATED`
**Immutable base:** `2dc1de3fc4b4ea4c5f4792538d961420317912db`
**Branch:** `codex/f-world-web-authorized-client-preparation`

## Boundary and dependency

The current World Web entry uses fixture projection and mock receipt flows.
The local-only E HTTP bridge has not landed on this base. Its published
experimental candidate is `dbcf7c52452d0e452ff19299d310ef69f0a89dd6`
(`origin/codex/e-gate-b-api-bridge`). Build an isolated browser client under
`apps/world-web/src/authorized-client/` without changing
D-owned pages, Core, API, staging, DB or migrations. The client receives a
verified browser session identity and token provider from a future host; it
does not decide entitlement or create authoritative state.

Only an explicitly configured loopback HTTP bridge may be contacted. The client
mirrors E's fixed local read and narrow-command routes and current request and
response envelopes, without importing the API runtime. E's candidate is not
on this base; revalidate against its frozen merge candidate before wiring.
When a port/token is missing, the client returns typed `UNAVAILABLE` without
issuing a request. It neither
imports Worker/Core settlement nor exposes server credentials.

## Implementation slice

- Typed scope binds world, AuthSubject, country, Office, classification, scope,
  authorization revision, model and projection versions.
- Query and command results distinguish unavailable, stale, denied, unknown
  acknowledgement and final receipt. A result must match the active
  identity/revision and request ID. There is no separate receipt lookup
  endpoint in E's current bridge.
- Integrate the existing V26.2 in-memory derived cache for monotonic
  WorldVersion acceptance. Never treat a fixture receipt as actual.
- Keep access tokens only in per-request headers; never place them in cache,
  returned objects or diagnostic strings.
- Test default unavailable, URL rejection, cross-scope and stale responses,
  durable versus mock receipt parsing, lost acknowledgement, token handling
  and cache monotonicity. E's command wire has no expected WorldVersion field:
  the browser precondition does not constitute a server-side concurrency fence.
- After a command POST, malformed/truncated 200 responses, wrong response
  identity/schema, invalid final receipts, transport loss and non-definitive
  HTTP failures are `UNKNOWN`, never negative commit evidence. The derived
  cache requires reconciliation, and this client instance blocks new command
  identities/payloads until an exact-ID retry obtains a verified final receipt.
  This in-memory guard is not restart persistence or a receipt lookup service.
- Browser transport is not yet integrated: E's current Node bridge responds
  only to POST and does not provide an OPTIONS/CORS preflight response. A page
  on a different localhost port therefore cannot call it directly in a real
  browser. E must explicitly allow the local origin or a same-origin local
  proxy must be installed before browser E2E.

**Reads:** caller session and local bridge response only. **Writes:** request
to local bridge when explicitly configured; derived browser cache only.
**Commands/events/postings:** no direct authoritative write; server must still
authorize and settle any submitted command. **DB/RLS/production:** none.
**Time:** no simulation or wall-clock decision. **Legacy site:** untouched.

Run focused tests, world-web typecheck/build, lint/format, boundary/secret and
diff checks. Record real bridge and Gate B browser E2E as `NOT_RUN` until E's
endpoint and D's UI are wired. Do not update status/Gate or merge.
