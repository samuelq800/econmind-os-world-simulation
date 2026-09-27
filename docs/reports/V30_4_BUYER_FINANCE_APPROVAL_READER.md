# V30.4 Buyer Finance approval reader candidate

Status: independently approved and integrated as non-production code preparation.
This record is not a deployment, Supabase rollout, or Gate B approval.

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

## Fixed-candidate review and integration — 2026-09-27

B approved base `fbfe9cd255615e8278e89ed843355fa166a73b97` to exact
candidate `6a73e05c2f5c7006c87e6ebcc87233cab1f731c1`, P0=0, MAJOR=0.
Reviewer task: `01a086cd-8c3b-7182-b14f-4d3b77f3b67d`. The superseded
`c8341ed` is not the approved target.

Exact-candidate native PostgreSQL 16.15
[run 36302989147](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/36302989147)
passed its integrated scenario including cross-command, expiry, revision,
inactive-authority and RLS negatives. B reported HTTP bridge 10/10,
architecture 34/34, API build and both boundary scanners PASS. The test-only
server role has explicit BYPASSRLS and SELECT on five tables; no production
role, grant or migration publication is implied.

Control Tower merged without conflict at
`16ed0c59c5cfedaac396917c8da97058bb160215` and ran API build, the HTTP bridge
suite (10/10) and `git diff --check`, all PASS. Only the approval-reader fixture
is replaced in the native composition; the durable receipt port remains a
fixture. Real staged intake, Worker execution and HTTP receipt integration
remain open. No Gate B state change.
