# V08.1 package-blocker forward fix

## Immutable binding

```text
HISTORICAL_PACKAGE_TARGET=c44885fdf0c639d3cce6c1e337b21042ab647965
V08_B01_FIX_CODE_CANDIDATE=08350cfa5081668c34e4104b40ae39384ec026a2
STATUS=IMPLEMENTED_UNVERIFIED
MIGRATION_CHANGE=NONE
PRODUCTION_MUTATION=NONE
```

## B01 authority correction

The former public `hydrateInventoryLedgerState` accepted caller-provided
balances, WorldVersion and applied-posting identities and registered the result
as authoritative. It has been replaced by `parseInventoryLedgerSnapshot`, which
returns an explicitly non-authoritative `InventoryLedgerSnapshot`.

`InventoryLedgerState` now carries an unforgeable nominal authority type and is
also checked against a private runtime authority registry. Only construction
from a validated Opening Seed and append-only transition-bound Posting lineage
can grant that authority. The authority marker is not exported by the package
root. A raw 999-tonne/version-77 snapshot with arbitrary posting IDs is rejected
by `applyInventoryPosting`.

## B02 compatibility

Inventory Posting facts are now reconstructed inside a V07
`AuthoritativeTransition` group. The ledger's `worldVersion` is the observed
global transition head, not an independently ordered Inventory history. Multiple
Inventory Postings can belong to one transition without advancing the global
version more than once.

V09 lease, fencing, persistence and durable transaction work remains absent.
