# Local audit browser harness

`PREPARATION_ONLY` · `NOT_LIVE` · `NOT_GATE_B`

Base: `21d43ae0fdb3a341061314314fd898984abe729a`. The only runtime change is
a development-only refresh hook on `local-audit-host.html`; it is not a Vite
production entry. `local-audit-browser-harness.ts` attaches a host object in
memory, with caller-supplied `bridgeOrigin`, `getAccessToken`, identity, and
optional server-issued draft/binding. It refuses other paths or production.
The returned detach callback clears only its own injection, so a late cleanup
cannot erase a newer Country/Office seat. Each attach remounts the authorized
read controller and clears the previous seat's UI state. Neither token nor
identity is read from URL parameters, storage, or build environment variables.

Browser smoke (in-app browser, Vite `127.0.0.1:4112`, no JWT and no API
handler):

1. Unconfigured page displayed `NOT CONNECTED`, no Country values or Command.
2. Attached synthetic `COUNTRY_NORTH`/`FINANCE`, loopback `:4102`, token
   callback returning `null`; clicked **Connect & read**. Result: `Read
unavailable`, zero verified signals, no Command, no request to the API.
3. Attached synthetic `COUNTRY_SOUTH`/`TRADE`, loopback `:4103`, same null
   token; the previous session reset to disconnected. Repeating the read gave
   the same unavailable state and no API request. A stale first-seat detach
   did not erase the second seat.
4. Detaching the second seat restored `NOT CONNECTED`. Browser console had zero
   errors. Visual evidence: `docs/ui-evidence/local-audit-two-seat-no-token.png`.

The two synthetic seats test browser isolation and fail-closed behavior only.
They are **not** proof of two authorized Countries/Offices, a Command, a final
receipt, a refreshed projection, or Gate B E2E. `MISSING`: E's bound local
JWT/native-PostgreSQL handler and verified test users; authorized G02 payload;
real two-Country/two-Office Command→UNKNOWN→receipt lookup→projection refresh
browser run; immutable trace and independent Gate B review. No shared
Supabase, service key, Core, Worker, API, original-site, or production change.
