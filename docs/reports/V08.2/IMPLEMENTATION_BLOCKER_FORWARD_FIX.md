# V08.2 package-blocker forward fix

## Immutable binding

```text
HISTORICAL_PACKAGE_TARGET=c44885fdf0c639d3cce6c1e337b21042ab647965
V08_B01_FIX_CODE_CANDIDATE=08350cfa5081668c34e4104b40ae39384ec026a2
V08_B02_FIX_CODE_CANDIDATE=08350cfa5081668c34e4104b40ae39384ec026a2
STATUS=IMPLEMENTED_UNVERIFIED
MIGRATION_CHANGE=NONE
PRODUCTION_MUTATION=NONE
```

## B01 authority correction

The former public `hydrateFinancialLedgerState` could register a caller-supplied
position, WorldVersion and applied-batch list as authoritative. It is replaced
by `parseFinancialLedgerSnapshot`, whose output is an untrusted
`FinancialLedgerSnapshot`. It cannot enter `applyFinancialPostingBatch`; the
authoritative state uses a nominal type plus a private runtime authority
registry populated only by validated Opening Seed and Posting lineage.

The regression includes a raw unbalanced +123 GCU lone position at version 77
with arbitrary applied IDs. Parsing remains possible for diagnostics, but
authoritative mutation rejects it.

## B02 compatibility

Financial batches are grouped under the same V07 `AuthoritativeTransition`
identity/version as Inventory facts. A Financial-only transition following an
Inventory-only transition observes the shared global head. Multiple Financial
batches inside one transition do not add WorldVersion increments.

No FX, rounding, minor-unit or formula semantics were introduced; ADR-08 remains
`NOT_TRIGGERED`.
