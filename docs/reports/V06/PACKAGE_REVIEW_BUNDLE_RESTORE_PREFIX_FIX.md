# V06 restore-prefix focused blocker-closure bundle

## Immutable targets

Review the Git commit containing this bundle. Its complete fixed
content/evidence parent is
`12d81d4fca1d37240a4af39183f69f12d60415aa`; the containing commit adds only
this bundle, aggregate evidence, target manifest and status registration.

- Historical rejected package target:
  `80ab3ecac0abbd622a7e2fc450101407db7f66f9`
- Restore-prefix finding record:
  `8b3af0f04c439018b0c3e37054afa9155b397cde`
- Fixed code candidate:
  `d9a84bd0198ecdcc2a9fe739c1eb900dc4e4cef1`
- Fixed V06.3 review target:
  `12d81d4fca1d37240a4af39183f69f12d60415aa`
- Finding under review: `V06-PKG-BLK-02`
- Prior `V06-PKG-BLK-01`: independently closed and regression remains active

## Focused review contract

Inspect the three-file code/test delta from finding record
`8b3af0f04c439018b0c3e37054afa9155b397cde` through fixed code
`d9a84bd0198ecdcc2a9fe739c1eb900dc4e4cef1`.

Confirm that every authoritative scheduler-state construction path applies one
central rule: among events due at current/snapshot SimTime, `COMPLETED` events
are a contiguous prefix of
`(dueSimTime, priorityRank, scheduledEventId)`. Invalid canonical V2 snapshots
and V1→V2 migrations must fail closed without repair. Valid completed-prefix
states restore exactly and preserve the next executable event.

Run the focused scheduler/order/restart/property matrix and check A–H in
`docs/reports/V06.3/TEST_EVIDENCE_RESTORE_PREFIX_FIX.json`. Confirm the prior
completion-API blocker, exact retry, locale independence and impossible
PREOPEN regressions remain green. The full baseline is already recorded; this
is not an invitation for open-ended adversarial expansion.

## Decision boundary

Return `APPROVED_FOR_CONTINUATION` only if `V06-PKG-BLK-02` is independently
closed; otherwise return `CHANGES_REQUIRED` with exact reproduction. Do not
mark V06 verified, merge it, or start V07.
