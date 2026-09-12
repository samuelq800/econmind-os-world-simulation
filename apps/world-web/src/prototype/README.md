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

## Six Offices G01 preparation slice

`SixOfficesG01.tsx` implements only the G01 return-to-world / office-briefing
surface from the supplied Six Offices interaction specification (source SHA-256
`0876b3a49eeadd29aaab713439d45c8760f08dbbec6159b902a5b5a41096ac0f`). It
uses the same typed local projection and deliberately keeps every non-G01
sidebar leaf visibly unconnected. It does not add an Office route, a command,
an authorization check, or any runtime integration.

Its tokens are locally redeclared from the live-world shell at
`econmind-os@5f420f7865a9c6884afc6583b3d3032dd0e52439` without importing or
modifying that application. The implementation is scoped to this prototype;
the runtime `App.tsx` and `main.tsx` remain isolated from it.
