# V08.3 package-blocker forward fix

## Immutable binding

```text
HISTORICAL_PACKAGE_TARGET=c44885fdf0c639d3cce6c1e337b21042ab647965
V08_B01_FIX_CODE_CANDIDATE=08350cfa5081668c34e4104b40ae39384ec026a2
V08_B02_FIX_CODE_CANDIDATE=08350cfa5081668c34e4104b40ae39384ec026a2
STATUS=IMPLEMENTED_UNVERIFIED
MIGRATION_CHANGE=NONE
PRODUCTION_MUTATION=NONE
```

## Canonical reconstruction

`rebuildV08LedgersFromLineage` now accepts one ordered sequence of V08 ledger
facts grouped by the existing V07 `AuthoritativeTransition`. For every group it
validates:

- one World and an exact contiguous `N -> N+1` global boundary;
- unique transition identity;
- Posting World, causation Command, Event membership and version binding;
- unique Inventory Posting and Financial batch identities across lineage;
- Inventory conservation/non-negativity and Financial exact balance/account
  identity before exposing a next authoritative state.

Both projections observe the same root `worldVersion`, including transitions
that affect only one ledger. A joint Inventory+Financial group is calculated in
private candidates and published only when every V08 invariant succeeds. This
is the V08 semantic all-or-zero model; V09 still owns durable database atomicity.

Snapshots are comparison/checkpoint data only. Public parsers never grant
authority, mismatches remain explicit, and no repair or balance import occurs.
