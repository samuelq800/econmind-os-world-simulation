# Command lifecycle display preparation

`PREPARATION_ONLY_NOT_V25_2_OR_V25_3_STARTED`

Baseline: `0469d23`. `status/progress.json` still lists V25.2 and V25.3 as
`PLANNED`; their hard dependencies and Gate B browser E2E remain open. This is
only a reusable browser presentation component, not a Command client, query
adapter, approval engine, or receipt reconciliation implementation.

| Current surface                          | Gap                                                                               | This slice                                                                                                                                                                   |
| ---------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Six-Office G01 and G02 event route       | A bare `UNAVAILABLE` label gives no consistent transition or recovery vocabulary. | One compact status component for unavailable, approval needed/pending, submitted awaiting final receipt, success, rejection, version conflict, and authorization revocation. |
| Legacy World Command Brief receipt panel | A fixture `COMMITTED` example is headed “World change evidence”.                  | Label fixture receipts as rehearsal examples, never actual World changes.                                                                                                    |
| Future authorized browser client         | UI could infer success from submission or approval before a final receipt.        | Render only the explicitly supplied phase; pending states never claim finality. Final states require a receipt reference in the view contract.                               |

Every currently mounted state is sourced from the local fixture and visibly
marked **not actual**. The type can later receive an authorized read-model
source, but this slice does not construct one or attest that its data is valid.
F owns the typed browser client and E owns World API; neither is edited here.

Owned files: `apps/world-web/src/prototype` page/component/CSS and focused
`tests/world-web` cases. Reads: supplied fixture projection and local view
state. Writes, Commands, Events, approval records, ledgers, DB/RLS, production,
and original EconMind site: none.

Visual rehearsal: [G01 Command status](../../../../docs/ui-evidence/command-lifecycle-g01-desktop.png)
and [G02 approval gate](../../../../docs/ui-evidence/command-lifecycle-g02-desktop.png).
Both are screenshots of the local fixture preview, not authorized runtime proof.
