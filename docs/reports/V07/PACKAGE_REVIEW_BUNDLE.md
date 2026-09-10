# V07 package blocker/major closure review bundle

## Review target and hard stop

Independent Review B returned `V07_PACKAGE_CHANGES_REQUIRED` against immutable
target `e802a5233ded3825c56d2897374fcd2de0c40da8`. That target, every historical
V07.1/2/3 candidate and prior evidence remain unchanged. This forward bundle
binds only the requested two BLOCKER and four MAJOR corrections. Its exact new
package target is frozen separately in `PACKAGE_REVIEW_TARGET.md`.

Package status remains `IMPLEMENTED_UNVERIFIED / READY_FOR_PACKAGE_REVIEW`.
The listed findings are implemented but not independently closed. No DDL is
promoted, main is unchanged, production was not accessed, and V08 remains
`NOT_STARTED`.

## Fixed immutable step targets

- V07.1 code was not changed. Active reviewed continuation target remains
  `66da354755326fc00ece7fcdb78e35db27f0b15f`.
- `V07_2_FIXED_CODE_CANDIDATE=2c32d0918bf7bbf97a851ad785b305de1f5688fa`
- `V07_2_FIXED_REVIEW_TARGET=81d3e59de7b3dd51f9cc2eaf93dc086f1baaf5ba`
- `V07_3_FIXED_CODE_CANDIDATE=2b42e0d725da590a24e845a7046501af8f8d4c01`
- `V07_3_FIXED_REVIEW_TARGET=21299492a4acb47b5383056417bba22acbc214b2`

## Finding corrections

### V07-PKG-BLK-01 — authorization binding

The old queued path accepted any valid current Office context. The fixed path
requires an opaque, versioned commit proof issued from current server authority
and bound to the exact Command ID/fingerprint, actor, AuthSubject, World,
Country, Office, capability, team and authorization revision. Cross-context
authority yields an immutable zero-effect revocation result before the commit
port; the port is never invoked.

### V07-PKG-BLK-02 — transition versus Event order

The old replay advanced WorldVersion for every Event. V07 now defines one
Command as one transition with an explicit before/after pair and one or more
ordered Events. Every Event shares the transition causation identity and after
version. Replay applies the complete ordered group, then advances WorldVersion
once. Event `sequence` remains the independent global order.

### V07-PKG-MAJ-01 — queued idempotency

An existing receipt is returned only after durable identity/key and canonical
authoritative fingerprint validation. Same identity with changed intent throws
`IDEMPOTENCY_CONFLICT` with zero execution.

### V07-PKG-MAJ-02 — receipt evidence

Receipt schema v2 binds World, Command, idempotency key, canonical Command
fingerprint, transition identity, WorldVersionBefore/After, ordered Event IDs
and outcome. Runtime validates commit output against the transition. Branch-local
DDL rejects mismatched Command evidence, nonexistent/duplicate Event IDs,
Events from another transition/version and invalid version boundaries.

### V07-PKG-MAJ-03 — seed lineage

Replay recomputes SHA-256 from `canonicalSeed` and requires both the supplied
seed and origin lineage to equal it. Corrupted seed bytes with a retained old
hash fail closed.

### V07-PKG-MAJ-04 — Event identity

Replay rejects a duplicate Event ID before double application, including when
sequence and transition versions are otherwise contiguous and regardless of
whether payloads match.

### V07-PKG-MIN-01 — outbox payload hash

Recorded and left open as non-blocking. None of the required corrections
needed to modify outbox hashing, so `payloadHash` recomputation was not added.

## Cross-step authoritative story

```text
canonical Command intent
-> durable identity/idempotency classification
-> current authorization bound to that Command
-> one logical authoritative transition
-> N >= 1 immutable ordered Events
-> one immutable final receipt
-> one WorldVersion increment
-> deterministic replay of the same transition
-> operational-only outbox/consumer delivery
```

This is compatible with V08 Ledger/Posting facts. V09 still owns the atomic
all-facts-or-zero-facts commit, leases, fencing, checkpoint persistence and the
single authoritative writer.

## Migration state

- `0002` is unchanged, branch-local and unpromoted; SHA-256
  `92915905a159961ac0f8eb70f509501cf7697519471c1b84f832ef224cf87695`.
- Unpromoted `0003` was forward-replaced at source commit
  `f589c8fba2e4e2a5686d8a1c4ded60a8688056fa`; SHA-256
  `fe8d6b6849b4ceb5a85789fff34bd2ed47cf7d07d662883dd0c345e88ad9255e`.
- The sole V02 manifest binds the exact bytes, hash, source commit and order.
- Both clean-baseline and existing-schema PGlite rehearsals pass. No shared
  schema, RLS/grant, backfill, real database or production change occurred.

## Verification

- V07.2 focused: 3 files / 26 tests / PASS at its exact code target.
- V07.3 focused: 2 files / 19 tests / PASS.
- Full `pnpm check`: 31 files / 400 tests / PASS.
- Protected architecture: 3 files / 34 tests / PASS.
- Authoritative scanner: 25 core / 37 total files / PASS.
- Boundary scanner: 42 files / PASS.
- Migrations: 3 / manifest validation and both rehearsals / PASS.
- Environment, typecheck, lint, format, foundation policy, secrets and all
  workspace builds: PASS.

The first full run experienced only resource-saturation timeouts. All five
affected files then passed 41/41 with bounded workers, followed by an unchanged
normal `pnpm check` passing 400/400. Both observations are retained in the
forward evidence.

## Independent decision required

Review the new immutable package target, not the branch tip. Confirm or reject
closure of `V07-PKG-BLK-01`, `V07-PKG-BLK-02`, and `V07-PKG-MAJ-01` through
`04`. Until that independent decision and later owner acceptance, V07 is not
verified, merge/promotion are not authorized, and V08 cannot start.
