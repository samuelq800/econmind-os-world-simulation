# V07 BLK-01 and MAJ-02 forward fix

## Immutable lineage

```text
INDEPENDENT_RESULT=V07_PACKAGE_CHANGES_REQUIRED
REVIEWED_PACKAGE_TARGET=7cd856380e93020dabe8fb969472f9a18ce773cd
V07_FIXED_CODE_CANDIDATE=7e4b21e0cc70e878080a777874dad491a21501aa
V07_FIXED_MIGRATION_PROVENANCE=6f919d3a20835da39a042ee7863d849f140f4e0c
STATUS=IMPLEMENTED_UNVERIFIED
PRODUCTION_MUTATION=NONE
```

Previous candidates, targets, migration artifacts and review evidence remain
unchanged. This record implements the two findings that remain open; it does
not close or approve them.

## V07-PKG-BLK-01

The reviewed implementation allowed the caller to return the final branded
`AuthorizedOfficeContext` through a callback. A brand proved issuance, not
fresh worker-commit resolution, so a caller could return the intake context
after membership revocation.

`processQueuedCommand()` now accepts intake authorization evidence only. For a
new discretionary execution it internally invokes the authorization
subsystem's `reauthorizeOfficeCapability()`, which uses server-held
principal/resolver metadata to read current identity and membership. Only that
fresh result can be bound to the exact Command and converted into the opaque
commit proof. The proof issuer is module-private.

The binding covers Command ID/fingerprint, actor, AuthSubject, World, Country,
Office, required capability, team and the current authorization revision.
Revocation or any scope change produces an immutable zero-effect authorization
receipt before the commit port. Existing immutable final receipts are returned
before reauthorization and cannot execute twice.

A narrow exported-entry audit found only `processQueuedCommand()` plus its
abstract persistence port. No app or script implements another path that can
append authoritative Events, finalize a receipt or advance WorldVersion from a
stale/pre-resolved context. `bindCommitAuthorizationToCommand()` is no longer
exported.

## V07-PKG-MAJ-02

Migration `0003` proved only that every claimed receipt Event existed in the
transition; a subset or permutation could still pass. Frozen `0003` bytes were
not changed. New forward migration
`0004_world_v2_receipt_event_set_integrity.sql` replaces the existing receipt
validation function through the sole V02 chain.

For committed outcomes the database derives:

```text
expected_event_ids =
  every Event for (world_id, transition_id, world_version_after)
  ordered by immutable authoritative event_sequence
```

It then requires exact JSONB-array equality with `receipt.event_ids`. A second
trigger rejects appending another Event to a transition after its immutable
receipt is final, preserving completeness.

The authoritative runtime contract requires every committed transition to
contain at least one Event. Therefore committed `[]` is rejected. `REJECTED`
and `AUTHORIZATION_REVOKED` are zero-effect final outcomes and require `[]`
with null transition/version evidence.

Event order is not caller authority: migration `0002` uniquely constrains
`(world_id, event_sequence)` and rejects update/delete of authoritative Events.
Migration `0004` orders from that immutable column.

## Preserved scope

The closed BLK-02, MAJ-01, MAJ-03 and MAJ-04 regressions remain green. MIN-01
remains `OPEN_DEFERRED`. No V08/V09 implementation, main merge, migration
promotion, real database access or production mutation occurred.
