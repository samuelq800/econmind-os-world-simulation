# V15.3 Staffing and Material Foundation Evidence

## Candidate disposition

`FOUNDATION_IMPLEMENTED_UNVERIFIED`. No staff are reserved or assigned by this
candidate; it validates caller-supplied, inert values only.

## Implemented calculation boundary

`assertSocialFoundationPersonnelAllocation` accepts whole person-unit pools once
per allocation snapshot and rejects either a repeated pool ID or assignments
above that pool's available people. Education and healthcare inputs retain
teachers/staff, cases, beds, medicine doses and time as distinct exact units.

No exchange rate, budget-to-headcount formula, material conversion, command,
event, database record or labour-ledger write is introduced.

## Focused evidence

The focused suite exercises duplicate-person-pool rejection, over-capacity
rejection, shortage paths and exact, ID-bound before/after replay transitions.
