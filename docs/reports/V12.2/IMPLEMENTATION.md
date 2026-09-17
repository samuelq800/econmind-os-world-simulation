# V12.2 foundation implementation — extraction and inventory ownership

**State:** `FOUNDATION_IMPLEMENTED_UNVERIFIED`
**Candidate:** `b0c04ab3e2bbb87edface2c652949d3c3cfcca21`
**Baseline:** `5356fe93932eb285b3c21977a655e4c6e7bb6746`

## Delivered pure-core boundary

The candidate couples an accepted `DEVELOPED → EXTRACTED` E08 transition to a
same-unit, same-resource E08 usable-inventory movement. The inventory movement
must name the exact resource transition as its source reference and preserves
before/after bucket snapshots. A forged extraction source, stale inventory
predecessor, duplicate reference, resource/commodity mismatch, or implicit
unit conversion rejects.

Commodity state has usable, strategic, contract-reserved, inbound/outbound
in-transit, and cumulative-loss buckets. Mapped F helpers perform only
usable-to-contract reservation and usable/strategic transfers. Strategic stock
has no free-consumption function. `createE08ProductionReadBoundary` provides
E10 only a typed read-only usable-availability value and explicit forbidden
mutations.

## Retained limits

No extraction capacity, recovery rate, project, labour, energy, equipment,
infrastructure, trade, production, loss-rate, or strategic-target formula is
present. There is no durable reservation or cross-writer concurrency claim.
V09.3 retains transaction, single-writer, idempotency, and recovery ownership;
ADR-04 retains time/read-order authority.
