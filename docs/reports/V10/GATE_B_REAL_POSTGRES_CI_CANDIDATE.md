# Gate B real PostgreSQL CI candidate

**Recorded:** 2026-09-14  
**Scope:** disposable GitHub Actions PostgreSQL service only

The V09/V10 PostgreSQL workflow is enabled for the current immutable candidate
branch. Its runner starts `postgres:16-alpine` as a disposable CI service and
sets only `V09_TEST_DATABASE_URL` to a loopback connection. The test
environment guard rejects `DATABASE_URL` and `WORLD_DATABASE_URL`, requires a
disposable fingerprint, and reports production access as false.

The workflow validates migrations, runs the existing real-PostgreSQL recovery
and writer-lease/fencing suite, runs the V10.4 Treasury-GCU atomic delivery
acceptance suite against that same disposable target, and builds Core and
Worker. Each result must be recorded from its exact GitHub Actions run before
it can count as evidence.

The current V10.4 candidate additionally starts two distinct automatic delivery
commands concurrently from the same durable WorldVersion and claimant lease.
The assertion accepts exactly one committed transition and requires the other
claim to remain without an Event, posting, receipt, outbox, or WorldVersion
effect. This is a scoped database-contention check, not a substitute for the
full V10 lifecycle or controlled process-crash campaign.

It also injects a fault after financial posting preparation, closes the initial
Worker database connection, and reconnects through a new PostgreSQL pool. The
same delivery can then commit once only if the failed transaction left no
durable partial facts. This is controlled transaction-failure/reconnect
evidence, not a process-kill or crash-at-commit-acknowledgement proof.

Finally, the candidate injects a lost acknowledgement only after the underlying
PostgreSQL transaction has committed. The repository must re-read the durable
receipt and return `RECOVERED_AFTER_UNKNOWN_ACKNOWLEDGEMENT` without creating a
second Event, posting, outbox message, or WorldVersion advance. This is a
deterministic client-response-loss simulation, not an operating-system process
kill.

The current candidate starts a separate Vitest child process that terminates
itself with `SIGKILL` at the V10 delivery repository's
`AFTER_FINANCIAL_POSTINGS` checkpoint. The parent then uses a newly-created,
guarded PostgreSQL pool to prove that the child left no Event, posting, outbox,
receipt, or WorldVersion advance before committing the same durable Command
once. This remains a narrow delivery-path crash-recovery check.

## Observed disposable CI evidence

The preceding V09-only candidate was exercised by GitHub Actions run
[`34844035170`](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/34844035170)
against source commit `aef8138579571531d5b13186ba7e90f32ec2c42e`.
The run completed successfully on 2026-09-14. Its disposable PostgreSQL
service completed migration validation, `pnpm test:v09:postgres`, Core and
Worker builds, the V09 authorization-cutoff check, and the V09 atomic-recovery
real-PostgreSQL suite. Expected fail-closed lease, fencing, version, and
append-only violations were observed as rejected assertions.

Review B recorded the first V10.4 PostgreSQL candidate
`417a8bc7294784f35f62805cc5b0e78af4e04cb8` as `CHANGES_REQUIRED` with one
Major. Its exact CI run
[`34844794409`](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/34844794409)
completed seven V10.4 tests but timed out the unchanged 1,000-run property at
the candidate's 10-second limit. Forward commit
`fd153dc20cdfaf9e7c8eeeee436e4ffcab3f8065` raises only that single-test limit
to 20 seconds; it does not reduce generated cases, assertions, or the scoped
database checks.

The forward candidate through
`05ca68b285c25efc9acea80c5d80c503b9993a14` passed GitHub Actions run
[`34845721571`](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/34845721571).
Its disposable PostgreSQL V10.4 execution completed 9/9 tests, including the
unchanged 1,000-run property (10.136 seconds) and the two-command contention
scenario. That run is scoped, partial V10 database evidence only; it predates
the subsequently added reconnect scenario and does not close Gate B.

The preceding candidate
`f2da0066d22cc6cc2ed17dd6fbd07c662a51c4d9` passed GitHub Actions run
[`34846740076`](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/34846740076).
Its disposable PostgreSQL V10.4 execution completed 12/12 tests, retaining the
1,000-run property and adding the two-pool contention, transaction-failure
reconnect, and post-commit acknowledgement-loss receipt-recovery cases.
Review B independently approved the final candidate for continuation with
`BLOCKER=0`, `MAJOR=0`, and `MINOR=0`.

The process-kill candidate
`fed2177bef7b3029015bd3b91062e96ccd4cfe68` passed GitHub Actions run
[`34848336309`](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/34848336309).
Its disposable PostgreSQL V10.4 suite completed 13 passing tests with one
environment-gated child test skipped in the parent process. The parent ran a
separate child that was deliberately killed at `AFTER_FINANCIAL_POSTINGS`,
verified rollback through a fresh guarded pool, and committed the same Command
once. This green run is not counted as process-kill evidence: independent
Review B found that the parent accepted any non-zero child exit in addition to
`SIGKILL`, which could admit an unrelated child failure before the checkpoint.
It recorded `CHANGES_REQUIRED`, `MAJOR=1`, and requires a forward candidate to
accept exactly `{ code: null, signal: 'SIGKILL' }` plus a new exact CI result.

The service was removed with the CI job. No Supabase, staging, or production
target was contacted.

## Boundary of this evidence

This is scoped V09/V10 disposable PostgreSQL evidence only. It does not
demonstrate multi-process contention or process-kill recovery across the full
V10 lifecycle, and it supplies no browser E2E or RLS/grant negative evidence
on an owner-approved non-production target. It does not authorize Gate B.
