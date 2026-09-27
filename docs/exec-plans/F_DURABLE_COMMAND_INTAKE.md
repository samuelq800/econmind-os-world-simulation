# F durable command intake / receipt slice

Frozen baseline: `e8c4337aa6db3922eb13159264485cf5177703f4`.
Branch: `codex/f-durable-command-receipt`. Risk: P0; independent B review
required before merge. Owner's 2026-09-27 code-first continuation is recorded
in `CODE_COMPLETION_2026_09_27.md`; this slice does not promote any formal step
or Gate B. Legacy formal step records remain unchanged.

## Scope and ordering

F owns new `apps/world-worker/src/intake/` code, dedicated tests/support,
focused disposable PG workflow and this record. No A approval-store, migration
0017, manifest, E reader, browser, original website or production changes.

Existing 0015 approvals require an immutable Command. The old API
`DurableNarrowTransferReceiptPort.acceptOrRead` requires approval first and
promises a final receipt. It cannot safely represent asynchronous acceptance.
Leave that contract unchanged. Add an independent server-only staged adapter:

1. `submitPending`: current server-bound actor/Office and locked database
   authorization; lock World head, bind Command ID/key/fingerprint, enforce
   expected version only for first acceptance. Persist intent but no queue.
2. Existing `NarrowTransferApprovalStore` opens/signs that durable intent.
3. `enqueueApproved`: current authorization, same immutable intent and version,
   existing store's complete current approval guard, then one existing queue
   row. Approval and intake are not economic execution.
4. Existing Worker alone claims/executes/finalizes; status reads distinguish
   pending approval/dispatch, queued, executing and stored final receipts.
5. On uncertain database completion, re-read immutable identity using a fresh
   transaction; absence/read failure stays UNKNOWN, never fabricated success
   or rollback. An exact retry cannot duplicate intent/queue/economic facts.

The server must provide a canonically built Command and authenticated actor
binding; this module is not an HTTP JSON/JWT gateway. No A unreviewed reference
contract is consumed. Native driver is existing `PostgresSqlDatabase`.

## Verification plan

Focused PGlite and disposable PG16 tests: pending-before-approval ordering,
all required signatures, scope/revision revocation, expected version and
ID/key/payload conflict, unchanged audit fields on retry, bounded concurrent
duplicate acceptance/queue insertion, precommit rollback and lost commit ACK,
durable final lookup via existing Worker receipt writer. No stress campaign.
Run affected typecheck/build, lint/format, boundary/environment/secrets gates
and `git diff --check`; no unrelated full suite. Record exact code SHA and
native run before handoff. HTTP staging/browser/production remain NOT_RUN.
