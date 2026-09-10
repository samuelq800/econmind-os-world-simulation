# ADR-11 — Idempotent duplicate receipts and immutable event-consumer state

## Status and authority

```text
Decision: APPROVED
Authority: RESPONSIBLE_HUMAN_OWNER
Approved at: 2026-09-10T00:11:57Z
```

This record transcribes the project owner's explicit decision. It is not a
Codex self-approval.

## Approved resolution

- `(worldId, commandId)` and, where applicable,
  `(worldId, idempotencyKey)` are unique identities bound to the immutable
  canonical command fingerprint.
- An exact duplicate canonical intent is not executed again and does not append
  duplicate authoritative Events. It returns the previously stored
  acknowledgement or final receipt.
- Reuse of either identity with a different canonical fingerprint fails closed
  with `IDEMPOTENCY_CONFLICT` and zero authoritative effect.
- Command acknowledgement/final receipt is distinct from Event-consumer
  delivery or processing receipts. Consumer receipts neither mutate nor
  redefine immutable authoritative Event history.

Last-write-wins, payload-only matching, in-memory-only deduplication and retry
semantics that depend on process lifetime are not permitted.

## Exact implementation boundary

V07 owns the versioned Command/Event/Receipt contracts and their durable
idempotency foundations. The detailed implementation remains assigned to the
exact V07 work packages and must not be recorded as complete by this decision.

Affected work package: V07.

## Compatibility

Fingerprint and schema versions are part of the durable identity contract.
Future versions may be introduced explicitly, but already accepted identities
must remain replayable and must retain their original canonical meaning.
