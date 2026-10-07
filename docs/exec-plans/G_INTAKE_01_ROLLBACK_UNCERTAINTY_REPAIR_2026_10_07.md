# G-INTAKE-01 direct approval rollback uncertainty repair

Status: IMPLEMENTED_UNVERIFIED. B's original decision remains
CHANGES_REQUIRED_LOCAL / G-INTAKE-01 MAJOR until independent closure of this
new fixed candidate. No merge, actual grants, production activation or Gate B.

## Immutable review and scope

Root requested this narrow repair before any opening-inclusive work. Base is
the exact original G `df48568837a50961dc2f8bb78d9d64544e25a06e`, tree
`b8c246d13de07ed8b6489b09de4eda15ac089c67`. New checkout
`/Users/samuel/Documents/econclub/.econmind-worktrees/g-intake-uncertain-rollback-repair`,
branch `codex/g-intake-uncertain-rollback-repair`. Original df/O 8c47048 and
their artifacts remain immutable. The opening-inclusive branch is preserved
at 8c47048 with no publisher/Core/schema changes or empty missing-only provider.

B report:
`/Users/samuel/.codex/state/plugins/codex-security/scans/econmind-g-postgres-server-read-binding/artifacts-5bced077f75cbae82f1c8c79b36777d4ba1b3bd233c93f01521a21121497c4fd/artifacts/B_G_AUTH_INTAKE_20261007/B_G_AUTH_INTAKE_REVIEW.md`,
verified SHA256 `9a826f2f77e93450068940e61b2cfa5f06fea1832caa535881ca844dceb30eb8`.
This increment changes only two existing G API files plus a dedicated native
test/config and this record. No Core, Worker, parser, guard query/lock order,
old fixture/test, economic rule, migration, source or shared status change.

## Reproduction and minimal repair

The original adapter catches a transaction-tail DomainError, attempts rollback,
destroys the client when rollback throws, then rethrows that same semantic
error. Direct SIGN_SELLER / SIGN_BUYER_TRADE / SIGN_BUYER_FINANCE / BIND_REFERENCE
stores do not run intake recovery. Composition traverses causes for DomainError
and reports403 AUTHORIZATION_DENIED even though rollback is unacknowledged.

Before source edits, actual fresh native PostgreSQL reproduced **4 PASS / 4 FAIL**:
all acknowledged rollback controls pass; all four direct-approval rollback-ack
loss cases return403 rather than exact UNKNOWN. Exit1, initial log retained.
Each test uses real JWT/binding/service/store SQL and an actual signature or
reference INSERT. Authorization changes inside that same writer connection at
the final guard; rollback is actually performed, then its acknowledgement is
lost. This deterministic fault injection is not a two-session concurrency proof.

The adapter now emits `FinancialIntakeRollbackUnconfirmedError`, outcome
ROLLBACK_UNCONFIRMED, when rollback is not acknowledged or the open transaction
connection was already destroyed. Original semantic and cleanup errors remain
diagnostic causes, not definite denial evidence. Composition's semantic cause
walk stops at this uncertainty marker before unwrapping its DomainError cause.
A dispatched direct approval therefore retains503 UNKNOWN with its original
action/world/command/idempotency identities. No transaction callback is replayed.
Acknowledged rollback still allows403, and existing intake's explicit recovery
behavior is unchanged.

The new tests verify one target INSERT, client destruction on ack loss, exact
UNKNOWN identity, unchanged actual database footprint after rollback, and an
explicit caller retry with the same request succeeds without a fabricated FINAL.
Test-side observation of the actual rollback result is not available as an
automatic API recovery or synthesized receipt. All four approval paths have
both acknowledged and uncertain controls.

## Verification and resource failure provenance

Pinned Node24.20.0 / pnpm12.3.4; native PostgreSQL16.15 Homebrew. Offline
frozen-lockfile install reused161 packages/downloaded0. Core/Worker/API
declarations passed; API was rebuilt after the repair. Final API/focused test
types, focused lint, boundary, authoritative-pattern, secret/environment,
format/diff checks are recorded in the external immutable receipt.

Final native suites ran **sequentially**:

- New direct approval suite: **8 PASS / 0 NOT_RUN**, exit0, started
  2026-10-07 22:23:19 Asia/Shanghai, 9.60s.
- Original G suite: **12 PASS / 0 NOT_RUN**, exit0, started
  2026-10-07 22:23:29 Asia/Shanghai, 9.17s.

An earlier combined run failed actual host resource setup: initdb reported
No space left on device and the original suite's cleanup DROP DATABASE failed
checkpoint. That invocation had12 test assertions pass and new8 NOT_RUN, but
both suites failed and exit1. It is retained as FAIL, not a repair PASS. Only
its two exact task-created disposable directories were removed after stopping
the remaining PostgreSQL process; server log was retained. Disk available space
recovered from116MiB to823MiB, then sequential native verification succeeded.
No broad user/other-agent cleanup, production DB or credentials were touched.

Root's separate O startup failure was later localized by Root to multithreaded
postmaster/locale behavior; later disk exhaustion does not establish its earlier
cause. Root's helper repair/acceptance and G's producer tests remain separate.

All original G source/admission/admin/actor/Clock/role provisioning/host/D client
limitations remain. Positive fixture admission is TEST_ONLY and temporarily
overrides the disposable veto; production application/proposal unchanged.
No native skipped case is PASS. This is local repair evidence, not B closure.

Freeze new parent/tip/tree and source-only patch/test logs. Send B the exact
target for narrow G-INTAKE-01 closure and Root the same packet, then STOP.
Root owns composition and publication after independent approval. The separate
economic-read visibility authority gap must not expand this repair or authorize
legacy/private holdings publication.
