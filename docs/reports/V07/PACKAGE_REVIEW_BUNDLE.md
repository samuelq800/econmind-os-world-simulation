# V07 BLK-01 and MAJ-02 focused closure bundle

## Review target and status

The latest independent package review returned
`V07_PACKAGE_CHANGES_REQUIRED` against immutable target
`7cd856380e93020dabe8fb969472f9a18ce773cd` with only these findings open:

- `V07-PKG-BLK-01`
- `V07-PKG-MAJ-02`

`V07-PKG-BLK-02`, `V07-PKG-MAJ-01`, `V07-PKG-MAJ-03`, and
`V07-PKG-MAJ-04` are independently closed. `V07-PKG-MIN-01` remains
`OPEN_DEFERRED`. All earlier candidates, targets, findings and evidence remain
immutable.

Package status remains `IMPLEMENTED_UNVERIFIED / READY_FOR_PACKAGE_REVIEW`.
The exact new package target is frozen separately in
`PACKAGE_REVIEW_TARGET.md`. No main merge, DDL promotion, production access or
V08 implementation is authorized.

## Fixed lineage

```text
V07_FIXED_CODE_CANDIDATE=7e4b21e0cc70e878080a777874dad491a21501aa
V07_FIXED_MIGRATION_PROVENANCE=6f919d3a20835da39a042ee7863d849f140f4e0c
V07_FIXED_STEP_EVIDENCE_TARGET=563a96490f207d94a3110dbf9c7a037f23b46923
```

## BLK-01 closure candidate

The worker path no longer accepts a caller-provided commit-time authorization
verdict/context. `processQueuedCommand()` receives intake evidence and itself
calls the existing authorization subsystem, which re-reads current identity,
membership, active/suspension state, World, Country, Office assignment, team
and authorization revision through server-held resolver metadata.

Only that newly resolved result can be bound to the exact Command and converted
to an opaque commit proof. The proof issuer is private to the module. A stale
branded context therefore cannot bypass revocation or scope changes. Exact
retries still return the existing immutable receipt before any authorization
or execution.

The narrow authority-entry audit found no alternative exported implementation
in packages/apps/scripts that can append authoritative Events, finalize a
receipt or advance WorldVersion from a stale `AuthorizedOfficeContext`.

## MAJ-02 closure candidate

Frozen migration `0003` is unchanged. New ordered migration `0004` replaces
the receipt validator within the sole V02 chain. For a committed receipt it
derives every authoritative Event matching World, transition/causation Command
and after-version, ordered by immutable `event_sequence`, and requires exact
JSONB-array equality with `receipt.event_ids`.

Subsets, supersets, permutations, duplicate IDs, foreign transition/world IDs,
and sequence disagreement fail closed. A guard also prohibits extending a
transition after its immutable final receipt exists.

The runtime and DDL contract requires `N >= 1` Events for `COMMITTED`.
Zero-effect `REJECTED` and `AUTHORIZATION_REVOKED` outcomes require `[]` and
null transition/version evidence. Migration `0002` already makes Event history
and `event_sequence` append-only and unique per World.

## Migration state

- `0002` unchanged: SHA-256
  `92915905a159961ac0f8eb70f509501cf7697519471c1b84f832ef224cf87695`.
- `0003` unchanged: SHA-256
  `fe8d6b6849b4ceb5a85789fff34bd2ed47cf7d07d662883dd0c345e88ad9255e`.
- `0004` source commit:
  `6f919d3a20835da39a042ee7863d849f140f4e0c`.
- `0004` SHA-256:
  `28bb8ff195d9c09b0cafcab79eb4a28868a1bf0170c7065fc4913a428bc17943`.
- Manifest validation and clean/existing-schema PGlite rehearsals: PASS, four
  migrations.
- All artifacts remain branch-local and unpromoted without production
  approval.

## Verification

- BLK-01/MAJ-02 focused: 2 files / 39 tests / PASS.
- All V07 focused suites: 8 files / 80 tests / PASS.
- Full `pnpm check`: 31 files / 415 tests / PASS.
- Protected architecture: 3 files / 34 tests / PASS.
- Authoritative/boundary scanners: 25 core, 37 total, 42 boundary files / PASS.
- Governance, environment, typecheck, lint, format, migration validation and
  both rehearsals, foundation policy, secrets, and all builds: PASS.

## Required decision

Perform focused independent closure review only for `V07-PKG-BLK-01` and
`V07-PKG-MAJ-02` against the newly frozen package target. This bundle does not
self-close either finding or change the status of V07, main, migrations, or
V08.
