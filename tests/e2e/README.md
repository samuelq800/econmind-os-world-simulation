# Gate B browser target preparation

Run from the World V2 repository with pinned Node 24.20.0 / pnpm 12.3.4:

```sh
pnpm install --frozen-lockfile
pnpm --filter @econmind/world-web build
node tests/e2e/gate-b-browser-preflight.mjs
```

The preflight launches a disposable Vite preview on `127.0.0.1` and a fresh
headless Chrome profile. It checks that the rendered landing and command pages
still disclose their preview/mock boundary. The command emits
`previewSmoke: PASS` only for those two observations. It always emits
`gateBBrowser: NOT_RUN`; the current UI cannot exercise a server-backed
bilateral transfer. Set `GATE_B_CHROME_PATH` if Chrome is installed elsewhere.
No production URL, credentials or network stress are used.

The four required scenarios and their current blockers are in
`gate-b-required-scenarios.json`. A true Gate B browser run needs:

1. A local or isolated non-production Web/API target with two real browser
   identities, two countries, Trade and Finance Office grants, and a Buyer
   Finance approval path.
2. Authorized projection reads under both identities, with server-issued
   WorldVersion and negative cross-scope evidence.
3. A real command path with final success and failure receipts looked up by
   the original command ID; local mock receipts cannot count.
4. Refresh, disconnect, reauthentication and out-of-order delivery checks
   against server snapshots and a private scoped channel.

After those surfaces exist, replace the four `NOT_RUN` entries with actual
browser scenarios and exact run evidence. This preparation does not change
Gate B status.
