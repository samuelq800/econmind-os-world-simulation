# V30.4 Buyer Finance approval reader candidate

Status: candidate-only. This record is not a deployment, Supabase rollout, or Gate B approval.

The API reader accepts an immutable 0017 approval-reference row only when its
request matches the same World, buyer country, canonical
`BUYER_APPROVAL_${commandId}` proposal, approval reference, and durable Command
fingerprint. It also requires the original Finance signature to match the
binding, a current active `FINANCE_TREASURY` authorization at the bound revision,
and an unexpired Command.

The focused native PostgreSQL test uses a dedicated, server-held, read-only
role. An ordinary API role is granted `SELECT` in the test but remains unable to
read approval history because the tables use forced RLS with no browser policy.
The test rejects cross-Command reuse, an expired Command, and a stale Finance
authorization revision before the unchanged receipt-port fixture is invoked.

Validation required for a candidate:

- static formatting and API type check;
- focused native PostgreSQL 16 workflow;
- independent review.

The reader is pre-execution evidence only. The Worker remains responsible for
its existing atomic `assertCurrent` authorization check at execution time.
