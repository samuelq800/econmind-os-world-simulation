# ADR-02 — Unique authoritative economic-field ownership

## Status and authority

```text
Decision: APPROVED
Authority: RESPONSIBLE_HUMAN_OWNER
Approved at: 2026-09-10T11:58:11Z
```

This record transcribes the project owner's explicit architecture decision. It
is not a Codex self-approval and does not assign future fields before their
authoritative owning package.

## Approved resolution

- Every canonical economic field has exactly one authoritative owner.
- World Inventory Posting is the sole authoritative owner of V08 inventory
  posting and balance facts.
- World Financial Posting is the sole authoritative owner of V08 financial
  posting and balance facts.
- No Engine may maintain a competing authoritative balance or directly mutate
  another domain's authoritative state.
- Economic Engines cross the boundary through typed Command, Event and Posting
  request/interface contracts.
- Projections, caches, dashboards and forecasts are derived/read models only
  and must never write back as economic truth.

## Exact implementation boundary

V08 owns the inventory and financial Ledger/Posting facts assigned by its exact
step contracts. V09 later owns writer, lease, fencing, atomic commit and crash
recovery mechanics under ADR-17. V08 must not guess owners for future skills,
facilities, deposits or foreign-debt fields; the exact authoritative owning
package assigns those owners when its gate is reached.

## Alternatives not selected

- Per-Engine authoritative balance columns.
- A duplicated Trade-owned inventory or settlement balance.
- Projection/cache state that writes back as economic truth.

All three alternatives create a second authoritative economic truth.

## Compatibility and migration

Cross-domain consumers must use typed posting interfaces and immutable
causation rather than direct balance writes. Any future ownership change must
be explicit and versioned, reconcile existing facts, and preserve historical
Command/Event/Posting lineage rather than reinterpret it.

Affected work packages: V01, V03, V05, V08, V11, V12, V13, V14, V15, V16,
V17, V19, V20, V22 and V23.
