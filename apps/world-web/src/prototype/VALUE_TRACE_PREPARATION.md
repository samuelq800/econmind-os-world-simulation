# G02 value trail preparation

`PREPARATION_ONLY_NOT_V25_2_OR_V25_3_STARTED`

Baseline: `7e0d849`. `status/progress.json` still lists V25.1–V25.3 and
V25.2 hard dependencies as `PLANNED`. This is a fixture-only display slice,
not V25.2's real report wiring or V25.3's E2E acceptance.

The G02 map/table shares selected metrics and related event links, but has no
numeric before → change → after trail or explicit evidence gaps. The legacy
World Command Brief has a separate narrative evidence list; it is not the
mounted G02 metric inspector and does not supply this trail.

This slice adds one typed **local fixture** value trail for available grain:
146,000 tonnes (fixture comparison input), a −18,000-tonne reservation recorded
in fixture event `EVENT-PROTOTYPE-001`, and the displayed 128,000 tonnes at
fixture snapshot v1842. The event's recorded fact supports the stock movement;
the 146,000-tonne input has no independent source record in this fixture and no
final receipt is linked. The UI exposes both gaps. A matching change label or
related event is never used to infer a policy cause or an actual World result.
All other metrics show an evidence-missing state instead of a fabricated chain.

Scope: `apps/world-web/src/prototype` component, typed fixture, G02 integration,
CSS, and focused `tests/world-web` only. Reads supplied local fixture values;
writes, Commands, Events, receipts, ledger postings, API/network, DB/RLS,
production, F/E modules, and the original EconMind site: none.

Sources: `prompts/steps/V25.1.md` (map not Source of Truth),
`prompts/steps/V25.2.md` (real actions/reports require hard dependencies),
`prompts/steps/V25.3.md` (unavailable states, accessibility/fallback),
`MASTER-U1817` (underlying amount/ratio and causal chain), and
`FINANCE-U1034` (UI forecast traceability). These are product boundaries, not
evidence of a live World calculation.

Visual rehearsal: [expanded G02 value trail](../../../../docs/ui-evidence/g02-grain-value-trail.png)
and [source/receipt gap](../../../../docs/ui-evidence/g02-grain-value-trail-evidence.png).
The [narrow signal-table inspector](../../../../docs/ui-evidence/g02-grain-value-trail-narrow.png)
keeps the same source and missing-evidence labels without horizontal overflow.
These are local fixture screenshots, not authorized runtime evidence.
