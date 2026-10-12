# Crisis action read-only shell

Implementation status: `IMPLEMENTED_UNVERIFIED` pending the integrated tree's
independent review. This is non-authoritative V25.1 parallel preparation;
V00.3, V01.3 and V03.3 are recorded VERIFIED in `status/progress.json`.
It does not mark V25.2, the crisis execution chain or a live World complete.

`apps/world-web/src/crisis-action/index.ts` exports `CrisisActionPage` and
`CrisisSummary`. The latter is shared by World and Country first screens.
Both default to `UNBOUND_CRISIS_STATE`: no tasks, shortages, routes,
contributions, public voices or diplomatic messages are invented. Optional
`countryLabel` and navigation links are display context and confer no identity.

The page accepts a `renderMap(slot)` callback. Reuse the existing canonical
geographic host there; do not clone the atlas or import Worker persistence.
The callback receives source-bearing location references and validated route
references, selection IDs and `onSelectLocation`. The host resolves geometry
from its admitted canonical geography; this module never computes straight-line
routes. Task selection sets the location selection; the map may focus that
location. Map location selection filters tasks. Missing authority references
are omitted. Blocked routes retain the `BLOCKED` passage label. Mobile collapses
the task panel while retaining map space, summaries and feedback.

## Integration contract

`CrisisPresentation` is a browser presentation type, not a proposed HTTP API or
server DTO. Current production read carriers do not expose crisis semantic
fields. Do not bind demo or seed-candidate objects to a real read authority.
A future existing trusted read composition must first server-authorize/filter
all child objects and map its actual fields to this type. Call
`bindCrisisPresentation(presentation, authority, config)` only in that adapter.
This uses the existing `parseAuthority` and valid read configuration to pin
world, country, office, world version, event sequence, seed/hash/admission,
seat and current identity. It clones/freezes the view and uses runtime branding
to reject forged structural views. The adapter must invalidate/re-render its
consumers immediately on session loss; every render also checks current
identity/session and permanently retires an observed invalid view.
No new permission or source-of-truth is introduced.

`state` supports UNBOUND, LOADING, DENIED, CURRENT, STALE and ERROR. The last
two may carry a still-authorized last reliable snapshot, visibly marked with
its server timestamp. `onRefresh` only delegates to the existing read host.
This module has no fetch, token persistence, timers, command transport,
claim/approval/receipt synthesis, reward or economic mutation.

The server-provided real start/end and `serverNow` define the configurable
real activity window. World label and multiplier are displayed separately.
The initial window may span fourteen real days; it is never fourteen world
days. Browser wall time does not advance either clock. Unknown values remain
`暂无数据`. Inventory and verified-delivery baselines have separate labels;
server-supplied gaps are never recomputed from arrival forecasts or from a
sum of contributions. Exact numeric strings retain their original precision.

All six office labels are an index, not controls that grant an office. Only
server-filtered `allowedActions` are displayed. Every action remains disabled
because no execution port is bound. Do not enable an action by attaching an
arbitrary callback. Future writes must use the existing authorized command
composition with server identity, current office/window/status/version,
idempotency and durable FINAL receipts; proposal, approval, in-transit and
completion must retain distinct authoritative states.

Contributions display only source-bearing DELIVERY/COMMISSIONING records with
verified time and evidence reference, deduplicated by authoritative completion
event ID. This additional display guard is not settlement or reward logic.
Citizen player content, citizen simulation, foreign-government simulation and
player diplomacy remain distinct. The UI does not generate or send messages.
Every simulation heading explicitly says `系统模拟`. Source/evidence references
are text, never unchecked clickable URLs. Missing feedback gets an empty state.

## Remaining bindings

Formal crisis semantic read mapping, trusted canonical route resolution,
current server clocks, task command/receipt mapping, actual contributions,
citizen/foreign response generation, player diplomacy and live admitted data
remain unbound. Static publication of this page does not prove economic
execution, task completion, World startup or production data admission.
