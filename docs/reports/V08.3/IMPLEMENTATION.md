# V08.3 implementation report

## Result

```text
Step: V08.3 — 期初 Seed/Reconciliation Contract
State: IMPLEMENTED_UNVERIFIED
Code candidate: 4f0da4104b928f3504c50164147324c8af0deab5
Automated evidence: PASS
Independent verification: NOT_CLAIMED
Migration: NOT_CREATED
Production mutation: NONE
```

## Implemented scope

- Added a versioned immutable opening-source record with explicit source kind,
  locator, source version, canonical payload and computed SHA-256 payload hash.
- Added a versioned World opening-seed manifest fixed to WorldVersion zero and
  the current V07 replay/model/registry/schema/numeric binding.
- Added positive exact inventory opening entries and financial opening batches.
  Every financial opening leg identifies an opposite debit/credit counterpart,
  and every batch balances exactly in one currency.
- Added deterministic reconstruction of V08.1 inventory and V08.2 financial
  ledger projections from the opening seed plus ordered authoritative postings.
- Added exact snapshot reconciliation reports and a fail-closed assertion.
  Missing snapshots do not prevent reconstruction; mismatch is reported and is
  never averaged, repaired or written back.

## Boundaries preserved

- Opening records establish immutable initial facts; they are not a competing
  mutable inventory or financial writer.
- V07 remains the Command/Event/replay version authority. V09 retains atomic
  persistence, lease, fencing, runtime single-writer and recovery coordination.
- V27 retains real 70-country source/calibration data and V28 retains legacy
  continuation/clean-seed migration policy.
- No rounding, FX, minor units, formulas, legacy data, schema, migration,
  production access or production mutation was introduced.

## Acceptance

Focused unit and fixed-seed property evidence proves explicit provenance,
counterpart financial items, exact balance, positive physical openings,
canonical ordering/fingerprint, tamper/forgery rejection, version binding,
opening-plus-posting reconstruction, snapshot-free recovery and explicit
snapshot mismatch. Full evidence is in `TEST_EVIDENCE.json`.

## Exit state

V08.3 is P0 `IMPLEMENTED_UNVERIFIED`. The V08 package terminal gate is reached;
V08 now stops for independent package review. No V09 entry, merge, migration
promotion or production authority is claimed.
