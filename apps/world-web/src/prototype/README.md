# World Command Brief prototype

`PREPARATION_ONLY_NOT_RUNTIME`

This directory is an isolated, local-data UI preparation surface for the
future V10.1/V10.4 browser work. It is served in development at
`/prototype.html`, but it is not imported by the production `App.tsx` or
`main.tsx`, and Vite's production entry remains `index.html` only.

The projection, event, receipt and Office values are explicitly typed mock
fixtures. They are not actual World State, do not call an API, and must never
become a production fallback. No control in this prototype submits a Command.

Future integration must replace the local contracts with approved shared-public
V10.1 query contracts, then connect real receipt reconciliation only after the
V10.3 dependency and V10.4 browser gate are ready.
