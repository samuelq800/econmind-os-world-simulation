# V25.2 browser preparation: event-to-Office handoff

`PREPARATION_ONLY_NOT_V25_2_STARTED`

Main baseline: `f4815cc`. `status/progress.json` lists V25.2 and its hard
dependencies as `PLANNED`. This document is a browser-only gap note, not the
formal `docs/exec-plans/V25.2.md` required when the step can start.

| Current page or contract                                                                                                                              | Smallest missing behavior                                                                  | Preparation slice                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NationalOverview` selects a metric and shows one linked event; its only action returns to G01.                                                       | The selected event's owning Office and the projected route status do not guide the player. | Let the player select an event, inspect its owner/route, and return to their own fixture Office only.                                                                                    |
| `PrototypeWorldBriefProjection` already carries `events`, `routes`, an acting Office, freshness, and authorization revision.                          | G02 does not use those fields to distinguish a local rehearsal route from a real Command.  | A typed read-model adapter resolves a fixture handoff from exactly those supplied fields. Stale, offline, revoked, cross-Office, missing-route, and approval-required cases fail closed. |
| Six role components and the grain-transfer flow are local rehearsals; `apps/world-api` exposes no approved browser Command/query route for this page. | A UI could imply that a click caused an actual action or final receipt.                    | A typed Command port returns `UNAVAILABLE` in this preparation build. The UI never calls a live submit endpoint or shows a new actual/receipt.                                           |

Relevant product boundaries: Captain Office-specific approval records
(`CAPTAIN-U0015`–`U0016`); Trade approval and signatory matrix
(`TRADE-U0785`–`U0802`); Finance funding approval states
(`FINANCE-U0509`–`U0520`); Social cross-Office approval matrix
(`SOCIAL-U0707`–`U0718`); Central Bank independence
(`CENTRAL_BANK-U0642`–`U0648`); Industry approval matrix
(`INDUSTRY-U0716`–`U0725`). These excerpts define ownership and approval
boundaries, not an authorization grant to this browser.

Affected owner: `apps/world-web` only. Reads: supplied typed local fixture
projection. Writes, Events, Commands, approval records, ledger postings,
DB/RLS, production environment, and original EconMind site: none. The adapter
interface is a future browser seam; authoritative contracts and runtime wiring
must be supplied by a later approved step. No status or gate claim follows
from local tests.
