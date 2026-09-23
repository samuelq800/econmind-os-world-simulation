# V25.3 browser UX preparation: accessible atlas recovery

`PREPARATION_ONLY_NOT_V25_3_STARTED`

Baseline `ce3510e` contains the accepted V25.1 atlas and V25.2 fixture
event-to-Office route. `status/progress.json` still lists V25.2 and V25.3 as
`PLANNED`; this note is not the formal V25.3 execution plan or Gate B E2E evidence.

| Existing journey                                                | Gap                                                                                                                            | Bounded preparation                                                                                               |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| G01 → G02 → map or signal table                                 | An atlas load/asset error can strand focus, and the map switch remains usable after an asset failure.                          | Fail over to the table, disable the broken map switch, announce the reason, and move focus to the table switch.   |
| Open G02 on a narrow viewport                                   | The dense map remains the initial view even when the table better exposes the critical signal/action path.                     | Start with the table on narrow screens, retaining an opt-in map switch.                                           |
| Projection loading, empty, revoked, stale, offline, or retrying | Status screens do not consistently distinguish snapshot reading from live actions; empty G02 retains meaningless map controls. | Use status/alert semantics, an empty-state retry, and recovery language; retain supplied fixture projection only. |

Owned files: `apps/world-web/src/prototype/NationalOverview.tsx`,
`SixOfficesG01.tsx`, the associated prototype CSS, and focused
`tests/world-web` cases. Reads: supplied fixture projection and browser viewport.
Writes, Commands, Events, approvals, ledger, DB/RLS, production, original site:
none. The future actual/forecast and live/fixture boundary is unchanged. F owns
Gate B browser E2E harness; this slice does not edit it or claim that gate.
