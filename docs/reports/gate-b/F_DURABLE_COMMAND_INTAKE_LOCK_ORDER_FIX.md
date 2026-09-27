# F-INTAKE-LOCK-ORDER-001 — scoped correction

B's decision on original implementation
`3223f3a45b12948aa400034bdc5df9d559a3440b`: **CHANGES_REQUIRED**, P0 findings 0,
MAJOR 1. The control tower explicitly authorized the bounded correction on
2026-09-27. Change risk remains P0 and needs independent re-review. Original
implementation and evidence commits are preserved; the old 26-test success
did not cover this interleaving and is not evidence against the finding.

## Confirmed cause and negative control

Original intake acquired `world_head FOR UPDATE`, then
`command_submission FOR UPDATE`. Existing `AtomicTransitionRepository.commit`
acquires submission, then its SQL guard locks lease and head. No common
upstream mutex serializes intake with Worker. Two ordinary concurrent
transactions for the same Command can therefore wait on each other's rows.

Regression-only commit `3039353b673b3f56212a3ae0b1f05dc17aa5868b` leaves that
runtime unchanged. [Native PG negative control 36303083307](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/36303083307)
reported **26 original tests PASS, 3 new tests FAIL**. All three failures were
observed PostgreSQL **40P01 / deadlock detected**, not a fixture or barrier
timeout. The three callers were `read`, exact `submitPending` retry and exact
`enqueueApproved` retry, each against an actual Worker economic commit.

## Correction and first-registration race

- For existing intent, all intake methods lock submission before head. The
  Worker remains submission → lease → head; intake needs no writer lease.
- A missing Command has no row to lock. Intake still acquires the World head
  to serialize first registrations and retains both SQL uniqueness constraints.
- If another registration commits between the initial empty lookup and head
  acquisition, `submitPending` and read-only recovery re-read the immutable
  intent **without FOR UPDATE**. They may return stored state or report a
  fingerprint conflict; they never dispatch from this branch.
- An `enqueueApproved` mutation whose first lookup found no row returns
  NOT_FOUND. A subsequent explicit call locks the registered row first; it
  does not opportunistically acquire submission after head.
- Multi-identity lookups order Command rows consistently. Expected version,
  offer lifetime, current authorization/team/revision, all three current
  signatures, exact retry and UNKNOWN recovery remain in place.
- No deadlock suppression, isolation downgrade, extra writer lease, migration
  or existing Worker modification is introduced. The inaccurate lock-order
  comment is replaced with the actual order and missing-row rule.

## Regression design

The native test wraps query observation around the existing
`PostgresSqlDatabase`, without substituting its transaction implementation.
Two backend PIDs are required. A barrier pauses actual
`createAuthoritativeWorkerExecution` after its submission row lock; intake
starts its own submission query before the Worker may proceed to lease/head.
Every SQL error is recorded before recovery can translate it to UNKNOWN.
Success requires no SQL errors (including 40P01 or lock timeout), a genuine
COMMITTED receipt, and safe exact Worker retry.

The synthetic test-only candidate reserves 2 tonnes using the existing Core
reservation posting constructor. Real current authorization, 0015 three-party
approval, writer lease, claim, atomic repository, Event/Posting/receipt/outbox
and WorldVersion transaction run in PostgreSQL. It asserts exactly one queue,
Event, inventory posting, receipt and outbox; no financial posting; version
0→1 once. This is a lock-order regression, not full reservation/delivery
lifecycle acceptance or evidence of source-ledger initialization.

Two additional native cases pause the first empty submission lookup, permit
a competing registration, then resume the original request. They verify exact
retry and conflicting-ID/same-key behavior with one durable intent, plus the
non-locking second lookup under head. No economic work is performed there.

All barriers have a five-second deadline and cleanup releases paused work;
existing native lock/statement timeouts remain unchanged. This is at most two
ordinary concurrent operations per test, not a stress/attack campaign.

## Files and current evidence

Runtime change is only
`apps/world-worker/src/intake/postgres-narrow-transfer-intake.ts`.
Tests are the existing F suite plus
`tests/support/f-durable-command-intake-worker-race.ts`. The dedicated F CI
path filter includes that helper. Existing Worker, A/E files, migrations,
production, original website and formal status/progress are untouched.

Local focused intake + existing approval-store regression: **27 PASS, 6 SKIP**;
the six skips are native-only cases, including the five added race cases.
Focused typecheck, lint, format, Worker build, architecture scanner and
`git diff --check` pass. No full repository rerun or actual-user feedback was
performed for this correction. All previously recorded
HTTP/deployment/production gaps remain separate.

## Fixed candidate and independent closure

Exact fix: **`9009528bbd48af77de80547f647dffbb14d05909`**.
[Native PG16 fixed run 36303327228](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/36303327228)
completed SUCCESS at that exact head SHA, job `108575011314`, PostgreSQL 16.15:
**31/31 PASS, no skips** (original 26 + three actual Worker interleavings + two
first-registration races). Raw output reports one file / 31 tests passed.

Independent reviewer B explicitly returned **APPROVED** for the exact fix,
**F-INTAKE-LOCK-ORDER-001=CLOSED**, P0 findings 0, MAJOR findings 0, through
review task `01a086cd-8c3b-7182-b14f-4d3b77f3b67d`. B independently checked both
negative and positive native runs, immutable ancestry, unchanged original
regression assertions, and local intake tests (25 PASS, six native-only skips)
plus focused typecheck. The broader original audit was reused rather than
repeated. The implementer did not award this approval.

Only this transaction slice and finding closure are approved. No HTTP
composition, complete economy, production, formal status ledger or Gate B is
promoted. Main integration is left to the control tower; F does not merge.
Machine-readable provenance is in
`F_DURABLE_COMMAND_INTAKE_LOCK_ORDER_EVIDENCE.json`. Original evidence files
remain historical and unchanged.
