# V12.1 foundation implementation — geological pools and exploration

**State:** `FOUNDATION_IMPLEMENTED_UNVERIFIED`
**Candidate:** `b0c04ab3e2bbb87edface2c652949d3c3cfcca21`
**Baseline:** `5356fe93932eb285b3c21977a655e4c6e7bb6746`

## Delivered pure-core boundary

`packages/core/src/resource-inventory/foundation.ts` introduces fixed E08
geological resource units, a geological endowment and five exact pools, and
the only four permitted forward actions:

```text
EXPLORE:              UNDISCOVERED → DISCOVERED
DECLARE_RECOVERABLE:  DISCOVERED → RECOVERABLE
DEVELOP:              RECOVERABLE → DEVELOPED
EXTRACT:              DEVELOPED → EXTRACTED
```

The wrapper invokes the mapped F conservation and one-step transition helpers,
then records the supplied causal source/predecessor references and immutable
before/after snapshots. It rejects non-positive movement, source exhaustion,
unit mismatch, a repeated transition reference, and a stale or forged
predecessor reference. Exploration cannot select another route and never
changes the fixed geological endowment.

## Retained limits

This is not a V12 product integration, Command, Event, durable receipt,
transaction, time policy, or authoritative write. V09.3 is not closed and
ADR-04 remains `PROPOSED_NOT_APPROVED`, so no product implementation or Gate
claim is made. No rate, price, recovery, capacity, labour, energy, cost,
conversion, or macro formula was introduced.

Control Tower has quarantined unresolved V09.3 release/persistence evidence
from this pure-Core foundation path. That permits this local candidate to
continue without treating V09.3 as a foundation-code blocker; it does not
alter the recorded hard dependency or remove the V09.3 product-integration and
Gate-evidence block.
