# Opt-in local authorized read

This records the read-only slice at `da5800a3545ea621fe191673c88f0bb756a8eee0`.
The later opt-in Command/receipt extension is described in
`LOCAL_COMMAND_RECEIPT_LOOP_PREPARATION.md`; the statements below refer to that
earlier read-only candidate.

`PREPARATION_ONLY_NOT_GATE_B`

The default `prototype.html` still mounts `<PrototypeApp />` and remains
`LOCAL_FIXTURE`. A trusted host may opt in by mounting `PrototypeApp` with
`localAuthorizedRead={{ currentIdentity, getAccessToken, bridgeOrigin }}`.
No URL flag, environment variable, hard-coded token, or browser storage value
activates this mode. The host must own the current identity value and rerender
the component when it changes. A missing identity disables Read.

The opt-in surface initially shows `NOT_AVAILABLE` and a **Connect & read**
button. Clicking it constructs F's `createAuthorizedWorldBrowserClient` and
calls only `readProjection` with a fresh request ID. F validates that the
supplied bridge origin is explicit loopback HTTP, obtains the token from the
host callback, and checks the scoped identity. This prototype never displays,
persists, logs, or manufactures the token, and never calls `submitNarrowTransfer`.

Before each read, and on disconnect, identity change, or externally supplied
`UNKNOWN` Command result, the controller clears its previous projection.
It also revokes F's in-memory scoped cache on these transitions.
Late responses are ignored after that invalidation. The UI also compares the
rendered identity synchronously, so an old Office-private result cannot be
painted for a newly supplied identity while the invalidation effect runs.
The existing `authorized-read-adapter` must still validate a current
`g02-derived-read-v1` payload before G02 shows any value; F/E's current generic
payload is not that contract and remains unavailable. The optional Command
result is display-only; this entry has no submission control.

Scope: `apps/world-web/src/prototype` and focused tests only. No changes to F,
E/C, World Core, status, Gate, production, or the original EconMind site.
Real authorized browser/server E2E: `NOT_RUN`. This is not Gate B evidence.
