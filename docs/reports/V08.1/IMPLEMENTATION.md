# V08.1 implementation report

## Result

```text
Step: V08.1 — 库存可用/预留/在途 Ledger
State: IMPLEMENTED_UNVERIFIED
Code candidate: a73c35d32d93f4067ab4e6228dbb65a4ab64734e
Automated evidence: PASS
Independent verification: NOT_CLAIMED
Migration: NOT_CREATED
Production mutation: NONE
```

## Implemented scope

- Added a versioned, pure Core inventory Ledger/Posting contract whose only
  authoritative balance writer is `applyInventoryPosting` under the declared
  `WORLD_INVENTORY_POSTING` owner.
- Added separate dimensions for World, country, commodity, batch, physical location,
  AVAILABLE/RESERVED/IN_TRANSIT bucket, reservation, shipment, title holder,
  risk bearer and an opaque economic-recognition reference.
- Added exact two-entry RESERVE, RELEASE, SHIP and DELIVER movements. Every
  posting balances exactly by World/commodity/batch/unit and every resulting
  physical position must remain non-negative.
- Added canonical entry ordering, SHA-256 posting fingerprints, duplicate
  posting receipts, conflicting-identity rejection, exact WorldVersion
  increment, V07 Command/Event causation evidence and SimTime.
- Added constructor identity checks so forged ledger or posting records cannot
  enter the sole writer boundary.

## Boundaries preserved

- Reservation, shipment and release cannot change title, risk or economic
  recognition. Delivery accepts those identities only as explicit input; it
  does not infer V10 transaction semantics or payment.
- No cash, deposit, debt, reserve, government or foreign financial balance is
  present in the inventory contract.
- V07 Event lineage remains the history. The in-memory ledger state is a
  deterministic projection of already-authoritative posting history, not a
  second append-only history.
- V08.3 retains opening-seed provenance and reconciliation ownership. V09
  retains lease, fencing, single-writer runtime, transaction coordination and
  recovery.
- No legacy runtime, mutation, schema, transaction logic, tolerance accounting
  or real-world calibration data was reused.

## Acceptance

Focused unit and fixed-seed property evidence covers exact reserve/release/
shipment/delivery conservation, over-movement rejection without partial
mutation, no negative stock, deterministic replay, duplicate protection,
unsupported/forged versioned records, V07 causation evidence, separate
ownership facts and architecture ownership. Full repository verification is
recorded in `docs/reports/V08.1/TEST_EVIDENCE.json`.

## Deliberate gaps and gates

- No schema was required for this pure contract, so no V08 migration exists.
- Persistence, opening counterpart facts and reconciliation are later V08
  scope. Atomic persistence is V09 scope.
- ADR-08 is not applicable: V08.1 uses exact `Quantity` addition/subtraction
  only and introduces no rounding, FX, minor-unit conversion or formula policy.
- V08.1 is P0 `IMPLEMENTED_UNVERIFIED`. The owner-authorized package
  continuation does not independently verify or authorize merge of this step.
