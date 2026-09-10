# V07.2 package-review forward fix

## Immutable binding

```text
SUPERSEDED_PACKAGE_REVIEW_TARGET=e802a5233ded3825c56d2897374fcd2de0c40da8
V07_2_FIXED_CODE_CANDIDATE=2c32d0918bf7bbf97a851ad785b305de1f5688fa
MIGRATION_ARTIFACT_SOURCE=f589c8fba2e4e2a5686d8a1c4ded60a8688056fa
MIGRATION_SHA256=fe8d6b6849b4ceb5a85789fff34bd2ed47cf7d07d662883dd0c345e88ad9255e
STATUS=IMPLEMENTED_UNVERIFIED
PRODUCTION_MUTATION=NONE
```

## Findings implemented pending independent closure

- `V07-PKG-BLK-01`: commit-time discretionary authority is re-resolved and
  converted to a versioned opaque proof bound to the exact Command ID,
  fingerprint, actor, AuthSubject, World, Country, Office, capability, team and
  authorization revision. Mismatches fail closed before the commit port.
- `V07-PKG-MAJ-01`: a stored final receipt is returned only after its durable
  identity and authoritative fingerprint match the queued Command. Changed
  intent returns `IDEMPOTENCY_CONFLICT` and performs no execution.
- `V07-PKG-MAJ-02`: receipt schema v2 binds World, Command, idempotency key,
  fingerprint, Command-as-transition identity, before/after WorldVersion and
  the complete ordered Event ID set. Runtime validation matches the receipt to
  the transition returned by the commit port. Migration `0003` rejects a
  mismatched Command fingerprint/idempotency key, missing or duplicate Event
  IDs, Events from another transition/version, and invalid version bounds.
- The shared transition contract states that one Command is one logical
  transition, contains one or more ordered Events, and advances WorldVersion
  exactly once. Event sequence remains independent per-World ordering.

V09 continues to own the atomic all-facts-or-zero-facts writer, leases and
fencing. This fix does not add those mechanics.

## Migration replacement provenance

Migration `0003_world_v2_command_receipts_outbox` was never promoted. Its
forward-fixed bytes are committed at `f589c8f...`; the sole V02 manifest binds
that exact source commit and SHA-256 at the fixed code candidate. The migration
remains branch-local, unpromoted and without production approval.

## Scope

No V07.1 implementation, Event DDL, V08 runtime/schema/migration, V09
coordinator, real database or production state was changed. Historical V07
candidates and review evidence remain immutable.
