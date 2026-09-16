# V09.2 + V09.3 implementation candidate

## Status

```text
PACKAGE = V09
V09.1 = CONTINUATION_BASELINE (independent forward-fix approvals preserved)
V09.2 = IMPLEMENTED_UNVERIFIED
V09.3 = IMPLEMENTED_UNVERIFIED
PACKAGE_READINESS = READY_FOR_PACKAGE_REVIEW_CANDIDATE
INDEPENDENT_APPROVAL = NOT_RUN
MAIN_MERGE = NOT_AUTHORIZED
PRODUCTION_ACCESS_OR_MUTATION = NONE
```

This is an implementation handoff, not an independent review, a Gate B result,
or an authorization to promote the branch. The implementation lineage begins at
the latest pushed V09.1 baseline `8da085184bf063b61ba53c10537c6a797018072b`
and includes the existing V09.2 atomic candidate through
`33f0a8855956458256c631318d54da93a3454bfb` plus the existing V09.3 recovery
candidate through `dadad8292f7b2e3f16430052d1e599d733c76031`.

## Implemented boundary

- `AtomicTransitionRepository` owns the single-writer, short authoritative
  transaction. It locks durable command/head state and rechecks lease holder,
  fence, expected WorldVersion, durable idempotency and transaction-time
  authorization before any fact is written.
- One transaction writes Events, inventory and financial postings,
  authorization audit, final receipt, current materializations, outbox,
  queue finalization and World head. A recovered receipt is returned on an
  acknowledgement-unknown retry; no second source of truth is introduced.
- `WorldRecoveryCoordinator` inspects durable head/Event/receipt/queue/posting
  and materialization lineage; it reclaims abandoned claims only under a later
  fencing generation, retries outbox independently, and rebuilds replaceable
  materializations under the locked head watermark.
- Migrations `0007` through `0012` are manifest-bound, hash-provenanced
  extensions of the V09.1 `0001` through `0006` chain. They remain
  branch-local and unpromoted.

## Explicit exclusions and evidence boundary

The local focused matrix uses disposable PGlite and proves deterministic
rollback, receipt recovery, stale lease/version rejection, recovery scan,
claim takeover, outbox retry, lineage reconciliation, projection rebuild and
corrupt-watermark rejection. It does not replace real PostgreSQL process or
connection semantics.

No `V09_TEST_DATABASE_URL` with the required disposable fingerprint was
configured on this host; no local Docker/PostgreSQL service was available.
Therefore the real PostgreSQL matrix for connection loss, worker/API process
interruption, pre/post-commit acknowledgement loss, checkpoint/restart/replay,
and database-specific lease/claim behavior is `NOT_RUN`, not PASS. No remote,
shared staging, Supabase, or production target was contacted.

The exact runnable commands and per-case outcome are recorded in
`TEST_EVIDENCE.json`.
