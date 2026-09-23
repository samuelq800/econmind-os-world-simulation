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

## Gameplay UI V3 G01-A supplement

The supplied Gameplay UI V3 specification (source SHA-256
`2a1a28888d7196adafaa342d392a2a08206ba73f4cbfec96bcf547cc66ceb67e`) informs
the desktop object-stage composition: compact status HUD, selectable economic
objects, one contextual inspector, action dock, and visible progression tray.
The primary G01 move opens the typed local grain-transfer draft in this
directory. That draft stays `PREPARATION_ONLY_NOT_RUNTIME`: it has a reversible
review, locally mockable receipt and recovery states, but it has no network,
authoritative calculation, authorization, or World State write.

No accompanying design-package archive is imported or used as an implementation
dependency; the independently supplied local archive remains outside this
candidate's file boundary.

## Central Bank and Industry gameplay preparation

`CentralBankGovernor.tsx` and `IndustryCommandCenter.tsx` add local gameplay
rehearsals for a policy meeting and a Riverside project work order. Each uses
only fixture data and local component state. Their visible completion states
say `No World State changed` because they do not create a policy decision,
project, facility, request, inventory movement, funding release, delivery, or
workforce assignment.

These surfaces do not import World Core, the API, worker code, database or
Supabase clients, and do not contain a production route. They are not Gate B,
deployment, authorization, or runtime-integration evidence. Future wiring must
use approved public browser contracts and retain the owning Office boundaries.

## V25.1 fictional atlas in G02

The G02 Nation overview opens the source-controlled F atlas as a lazy-loaded
map scene. The atlas files were copied from the F preparation candidate at
`1635631` without its Core, database, status or report changes. A Signal table
toggle remains available, and a failed map asset or component offers that
table as the recovery path. The embedded atlas CSS is scoped so it does not
replace the World Command Brief's font and color tokens.

National values and event links beside the map come only from the scoped
`PrototypeWorldBriefProjection` supplied by the current fixture route. The
atlas has no World or country IDs, and its visual territories are not linked to
Northstar or to any authorized economic values. Authorization-revoked views
remove the projection and therefore the map intel. This integration stays
`PREPARATION_ONLY_NOT_RUNTIME`; it has no query, command or persistence wire.
