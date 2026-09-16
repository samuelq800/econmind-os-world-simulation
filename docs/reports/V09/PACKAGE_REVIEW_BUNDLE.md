# V09 package review candidate

## Immutable review request

```text
PACKAGE = V09.2 + V09.3
STATE = IMPLEMENTED_UNVERIFIED / READY_FOR_PACKAGE_REVIEW_CANDIDATE
BASE = 8da085184bf063b61ba53c10537c6a797018072b
IMPLEMENTATION_CODE_TIP = d6793dd9439cc82e959d6d086ee4735dbdf62b57
INDEPENDENT_REVIEW = REQUIRED
GATE_B = NOT_RUN
MAIN_MERGE = NO
```

Review implementation code at the immutable `d6793dd9439cc82e959d6d086ee4735dbdf62b57`
tip and this evidence bundle. Do not treat this implementation report, its
local tests, an existing CI job, or a static database adapter as independent
approval.

## Required review focus

1. Confirm one authoritative SQL transaction covers lease/fence/version and
   idempotency rechecks plus postings, Events, receipt, head and outbox.
2. Attack the version/lease/claim SQL guards and verify a prior worker cannot
   reclaim or commit after a higher fencing generation exists.
3. Reproduce acknowledgement loss and retry against real isolated PostgreSQL;
   check that a receipt prevents economic replay.
4. Inspect recovery scan joins for Event/receipt/queue/posting/head
   consistency, sequence gaps and corrupt materialization watermarks.
5. Verify recovery has no second authoritative state: outbox retry and
   projection rebuild must not write economic facts or advance the head.
6. Re-run manifest provenance, clean/existing migration rehearsal, secret and
   boundary scans after the final tip is frozen.

## Real-PostgreSQL acceptance blocker

The exact V09 test command is present in `TEST_EVIDENCE.json`, but its
dedicated disposable target is absent. This is a `NOT_RUN` evidence gap, not a
passing local result. It must be resolved on an approved isolated PostgreSQL
target before any reviewer can claim the process/connection recovery matrix is
complete. Shared staging, Supabase and production are outside this request.

## Recorded risk state

No implementation-side P0 or MAJOR defect was found by the focused local
matrix. That is not an independent severity verdict: the independent P0/MAJOR
verdict and Gate B remain `NOT_RUN` until package review and the real database
matrix are completed.
