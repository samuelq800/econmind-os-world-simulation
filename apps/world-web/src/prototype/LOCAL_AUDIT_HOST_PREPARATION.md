# Local browser audit host

`NOT_LIVE` · `NOT_GATE_B`

The local-only development page is `apps/world-web/local-audit-host.html`.
It is deliberately absent from Vite's production entry list. With no trusted
in-memory `window.__ECONMIND_LOCAL_AUDIT_HOST__` injection before module load,
it renders only **NOT CONNECTED**: no fixture fallback, World values, or
Command action. The browser smoke evidence is
`docs/ui-evidence/local-audit-host-fail-closed.png`.
At `http://127.0.0.1:4110/local-audit-host.html`, the in-app browser check
observed the NOT CONNECTED notice, zero action buttons, zero `LOCAL_FIXTURE`
matches, and zero console errors. This is a fail-closed UI check, not a live
authorization or economic E2E test.

The host must supply a current authorized identity, an explicit loopback HTTP
origin, a callback returning a user access JWT, and optionally the server-owned
narrow transfer draft plus authoritative receipt binding. The adapter rejects
non-loopback origins, non-user tokens, and `service_role`/opaque keys before
using F's browser client or sending a receipt query. This is a browser guard,
not a substitute for E's JWT signature, durable scope, or RLS enforcement.
No token is read from a URL, environment variable, fixture, or storage.

The read and Command routes remain F-owned. For UNKNOWN recovery, the D host
sends an exact `world-final-receipt-read-v1` POST to
`/local/v1/narrow-transfer-receipt` with only the original World ID, Command
ID, and idempotency key. It uses `credentials: omit`, no-store, no redirects,
no referrer, and a bounded response. The D controller still requires the
original key/fingerprint/identity match. A 401, 404, bad response, or absent
bridge leaves UNKNOWN locked and the old projection hidden; it never retries
the Command.

The current API bridge exposes an optional receipt handler and returns
`SERVER_DEPENDENCIES_UNBOUND` without one. No real user JWT, PostgreSQL-bound
handler, or authorized G02 server payload was supplied for this candidate.
Thus real browser Command→receipt→refresh E2E is `NOT_RUN`; local UI smoke and
mocked transport tests are not Gate B evidence. E owns API/PG/JWT binding and
native PostgreSQL evidence; D owns only `apps/world-web`, frontend tests, and
UI evidence. No original site, World Core, database, or production change.
