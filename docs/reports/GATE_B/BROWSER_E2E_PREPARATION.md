# Gate B browser E2E target preparation

**State:** `PREPARATION_ONLY_NOT_GATE_B_BROWSER_E2E`
**Immutable base:** `ebc5fcbe010559d5d6a94e86792a77ecc02502d2`
**Implementation commit:** `1d3d6ad5ce3aec0bea72ffa04ec71ade7a3100a4`
**Branch:** `codex/f-gate-b-browser-e2e-preparation`

## Observed entrypoints

- `apps/world-web/index.html` renders a public preview with an explicit
  warning that it does not connect to World State or establish Gate B evidence.
- `apps/world-web/command.html` renders `PrototypeApp`, whose warning says
  local mock projection, no API and no command submission. Its transfer panel
  uses `LocalMockGoodsTransferTransport` and displays mock receipts.
- `apps/world-api/src/runtime.ts` exposes `/healthz` and `/readyz` only. The
  read integration code contains a loopback mock transport, but that is not an
  authenticated browser route. No current page completes an authorized
  bilateral command/receipt path.

## Delivered harness and actual run

`tests/e2e/gate-b-browser-preflight.mjs` starts a short-lived local Vite
preview, opens the landing and command pages in Chrome 154 headless using
separate temporary profiles, and verifies their rendered preview boundaries.
It uses only loopback HTTP and sanitizes child process environments. The local
browser smoke returned `PASS`; exact rendered DOM hashes and commands are in
`BROWSER_E2E_PREPARATION.json`. The generated scenario manifest remains
`NOT_RUN` for two-country/two-Office authorization, server projections, real
success/failure receipts, and refresh/disconnect version monotonicity.

The harness is a runnable preflight for a future browser target. It cannot
turn the existing fixture UI into Gate B evidence. The minimum missing
surfaces are authenticated browser sessions for two countries/Office scopes,
server-authorized projections, a real bilateral command endpoint and receipt
lookup, and a private scoped channel plus snapshot reconciliation. Buyer
Finance approval is also required for the narrow Treasury-GCU transfer path.

## Scope and verification boundary

Only new `tests/e2e/` files, this report and a preparation plan changed. No
World Web page, Core, API, staging, database, migration, original main site,
production Supabase or status/Gate file changed. Pinned Node 24.20.0 and pnpm
12.3.4 were used. World-web build, actual headless Chrome preview, script
syntax, scoped ESLint/Prettier and diff checks passed. Full Gate B browser E2E,
PostgreSQL/RLS/staging, attack/property campaigns and independent review were
`NOT_RUN` in this slice.
