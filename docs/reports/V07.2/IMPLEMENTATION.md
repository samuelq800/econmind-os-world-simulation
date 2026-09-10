# V07.2 receipts outbox and idempotency implementation

## Result

```text
STEP=V07.2
STATUS=IMPLEMENTED_UNVERIFIED
CODE_CANDIDATE=0f260ab1b582c524dc3005e0de62202d1c5d9a24
MIGRATION_ARTIFACT_SOURCE=2b3349555137196612bea6d55e22edf156f53cbd
RISK=P0
PRODUCTION_MUTATION=NONE
```

## Implemented contract

- Added separate immutable acceptance and final Command receipt contracts.
  Exact duplicates return the original acknowledgement or final receipt;
  changed canonical intent remains `IDEMPOTENCY_CONFLICT`.
- Added the V07.2 queued-execution ordering contract. Pending discretionary
  work re-resolves current authority immediately before the commit port.
  Revocation produces an immutable `AUTHORIZATION_REVOKED` zero-effect receipt
  and never invokes the commit port.
- Already stored final receipts return without retrospective authorization.
  Versioned automatic obligations do not depend on later actor authority loss;
  their governing version/cancellation contract remains authoritative.
- Added pure, versioned outbox and per-consumer delivery contracts. Redelivery
  changes operational attempt/delivery state only and never re-executes a
  Command or mutates Event history.
- Added branch-local migration `0003_world_v2_command_receipts_outbox` to the
  sole V02 manifest/provenance chain. It defines one queue row per accepted
  Command, immutable final receipts, separate consumer receipts and an outbox
  whose authoritative references/payload are immutable.

## Ownership and boundaries

- Reads: immutable Command submission/fingerprint, stored receipt, current
  identity/membership/country/Office/capability/revision, WorldVersion and
  SimTime references, Event identity, queue/outbox/consumer state.
- Writes: one immutable final receipt plus operational queue/outbox/consumer
  state. Economic state and Event append remain outputs of the later trusted
  transaction port.
- `packages/core` owns the canonical contracts and ordering. The port does not
  implement persistence, a second Source of Truth, or process-memory
  deduplication.
- No concrete API database adapter exists in the repository yet. V07.2 exposes
  a durable intake port rather than adding a fake process-memory implementation.
  No concrete worker persistence bootstrap exists either; the queued execution
  contract is ready for the later server adapter.
- V09 still owns lease, fencing, single-writer enforcement and the final
  all-or-zero economic/Event/receipt/outbox transaction coordinator.

## Changed files

- `packages/core/src/commands/receipt.ts`
- `packages/core/src/authorization/offices.ts`
- `packages/core/src/errors.ts`
- `packages/core/src/ids.ts`
- `packages/core/src/index.ts`
- `database/migrations/artifacts/0003_world_v2_command_receipts_outbox.sql`
- `database/migrations/manifest.json`
- focused World Core, property, migration and governance tests

## Known limits

- PGlite proves PostgreSQL DDL/constraint behavior in isolated rehearsal, not
  real Supabase RLS, multi-process contention or crash recovery. Those claims
  remain unmade.
- Queue claims are explicitly operational and are not fencing tokens. V09 must
  supply the competing-writer and transaction mechanics before production use.
- The migration remains a branch-local candidate. ADR-16 is architecture
  authority, not main merge or production publication authority.
