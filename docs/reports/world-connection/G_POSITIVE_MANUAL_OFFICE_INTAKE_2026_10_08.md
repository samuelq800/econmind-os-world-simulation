# G SHARED1 conditional positive manual Office intake

Status: `IMPLEMENTED_UNVERIFIED`, P0, independent review `PENDING`.
This source-only increment registers durable intent under tested conditions; it
is not formal production registration, economic activation or Gate B acceptance.

## Identity and owned delta

Dedicated branch `codex/g-positive-manual-office-intake` and checkout
`.econmind-worktrees/g-positive-manual-office-intake` start at fixed main
`7f1c05c7bf5b26cd2aae13f25569a4e8852f0c58`.
Dependency: independently reviewed G dispatcher
`60a8f76390bb77361da3beac078bc68fc375786c`, unchanged patch cherry-picked as
`14a08b4` (full identity/tree recorded in the packet). That frozen checkout was
not modified. The new package diff is separately measured from this dependency.
Root's integration worktree and C/A/E/D/F source are untouched.

The new delta owns Worker intake, narrow runtime composition, API service, G's
existing pure ack contract (Root explicitly authorized this minimal union), two
API test files, shared TEST_ONLY fixture/config and this plan/report. No E
read adapter, result DTO/index, kernel/economic rule, domain-source file, dispatcher,
API route installer, workflow, manifest, migration, production grant/role/schema,
admission publication, status/progress or old-site code changed.

## Actual connection and once sink

`createManualOfficeIntakeRuntime` builds the already-reviewed real sole consumer
with its fixed Captain/CB/Social source/factory composition. The consumer remains
PREPARED; no host loop is started. A module-private constructor identity binds
that exact consumer, intakePool, clock, World and readers. Plain READY objects,
copied tokens or unrelated pool/clock/World cannot enable intake. This identity
is a trusted local/CI server construction fact, not an official-source-ready or
production-registration certificate. Existing local/CI/production-DSN rejection
of the real consumer constructor remains intact.

The ordinary service default still authenticates the actual JWT, resolves actual
persisted seat/admission/pinned seed/current capability/head and returns the
original `SOURCE_RUNTIME_UNAVAILABLE` zero-effect rejection in a read-only SQL
transaction. An INSERT privilege or a source snapshot alone does not enable it.
There is no browser runtime/binding/readiness/actor/time field or source callback.

The explicitly bound positive service uses the same verifier, persisted consumer,
Core authority context and strict three family parsers. Actual source preflight
uses the existing fixed pure source/kernel checks, not a new execution protocol
or commit proof. Captain/CB readers additionally compare actual SQL head/version/
event-sequence before/after their reads. Social retains the existing real snapshot
reader/hash/provenance/head checks and manual PLAN only; automatic MATCH is refused.
A stopped/faulted consumer or missing source refuses before writes.

A real server CanonicalCommand uses server actor/auth subject/SimTime/timestamp.
Current role must be scoped, non-superuser/non-bypass/non-economic writer with the
actual verified subject. Missing INSERT/locking privileges do not become acceptance.
The transaction uses READ COMMITTED, locks existing submission first, then the
actual World head to serialize first registration and the mutable current auth/
entitlement at cutoff. Full seat/team/revision/capability/admission/seed/model/head/
sequence/entitlement binding and role observations must still match. Immutable
seat/admission/seed retain their existing mutation vetoes; no unnecessary UPDATE
privilege or lock on those immutable rows is requested.

A missing submission cannot be row-locked. Under the head, an immutable second
lookup catches a racing registrar without acquiring a submission lock in reverse
order. Actual registered server time/intent is rehydrated and compared by Core
fingerprint. New registration inserts exactly one original command_submission
and one original DISCRETIONARY_USER command_queue row in the same transaction.
Returned state comes from that queue's actual authority/due time/PENDING/CLAIMED/
FINALIZED row. No event, posting, receipt, outbox, lease or head update occurs.
Historical command without the matching queue is a conflict, not a parked intent
or permission to manufacture a queue later.

An exact retry checks current authority and immutable fingerprint, retains actual
stored clock/correlation and returns EXISTING queue state without another source
read/write. Historical retry is not a claim that a missing current source became
ready. QUEUED, EXECUTING and FINALIZED are durable queue acknowledgements only;
no economic outcome/receipt/COMMITTED is returned. Success uses the SQL cutoff
held through commit; a later read snapshot cannot falsely convert actual committed
queue registration into API403. The source-blocked read-only path keeps its
original exact after-binding check.

Commit acknowledgement loss, attempted-write connection loss or unacknowledged
rollback is `WRITE_OUTCOME_UNKNOWN`, retryable=false, no automatic replay. A fresh
explicit exact retry can read a matching actual stored command/queue. Known Core
denial remains definite only after acknowledged rollback. The service cancellation
path conservatively preserves uncertainty once a bound intake may have started.

## Actual validation and failures preserved

Pinned Node24.20.0/pnpm12.3.4; frozen offline install exit0. No production database
configured, no keys or credentials read, and no native/remote database accessed.

Final four-file bounded matrix: **101 PASS**, 4 passed files, start19:58:56,
62.43s, exit0. It includes 16 new positive cases, all30 original sourceBlocked
JWT/SQL cases,19 frozen dispatch direct cases and36 existing goods regressions.
Core/Worker/API build, Worker/API/direct typecheck, scoped ESLint/Prettier,
boundaries/patterns, safe local environment, secret scan and diff check have
individual exit0 records in the external packet. Tests were not skipped or weakened.

Captain: real JWT→current restricted SQL binding→actual TEST_ONLY domain SQL
source→same once queue→the actual existing authoritative consumer→Core genuine
proof→AtomicTransitionRepository→one COMMITTED receipt was run in isolation.
The later API returns only FINALIZED queue acknowledgement without that receipt.
The service itself retains workerActivationAllowed=false/clockActivationAllowed=false.
Only the direct test explicitly starts/stops the prepared single-step consumer;
no engine loop or production host is started.

Other cases: exact clock/fingerprint retry; default/no runtime, fake READY/copied
token, constructed consumer with missing source and stopped consumer; current
revocation/head/event-sequence/entitlement change; conflicting identity/intent;
queue failure rolling back the actual preceding submission; real local COMMIT
and ROLLBACK followed by adapter acknowledgement faults, UNKNOWN/no replay;
revoked historical retry and original production environment construction veto.
These are actual PGlite SQL/role tests; phase-change hooks use the disposable
connection, not two native concurrent sessions. Ack faults occur after actual
local SQL acknowledgement boundaries, not a real network/socket experiment.

Fixture boundaries: the existing shared API fixture retains its TEST_ONLY seed,
admission veto disable/re-enable and real restricted roles/JWT; domain quantities
come from the unchanged fixed Captain TEST_ONLY builder stored in private SQL.
No fixture is adopted as official genesis or a live domain source. UPDATE columns
for existing submission/head/auth/entitlement locks and a TEST_ONLY subject-bound
entitlement UPDATE policy are explicitly disposable evidence support, not a
production least-privilege grant/provisioning decision. Immutable seat/admission
UPDATE grants were removed because they are unnecessary. The real source reads
use the separate trusted Worker database port; the fixture adapter temporarily
restores its actual role while sharing the disposable database connection.

Preserved failures, not rewritten as PASS:

- First Worker build used an incorrectly spelled wrapper PATH; engine enforcement
  refused Node24.19.0/pnpm11.25.0. Corrected PATH, no engine bypass/install.
- First API build/direct tsc: exact optional runtime property required null rather
  than undefined; test fixture imports/count row typing and compiled Worker module
  path were corrected. Root package lacks the Worker alias, so the test imports
  the actual compiled module used by API, preserving private identity semantics.
- Initial combined test run:30 PASS default, positive suite could not resolve that
  package alias. The API default suite independently passed30 cases as well.
- First positive repair:11 FAIL, because disposable migrations/grants were sent as
  multiple commands through a prepared query. Used the real db.exec fixture setup.
- Next repair:5 PASS/6 FAIL. FOR SHARE of immutable seat/admission was filtered by
  their RLS/no UPDATE policy; unnecessary immutable-row locks/grants were removed,
  while mutable auth/entitlement/head cutoff remained. Disposable entitlement lock
  policy is explicit, not added to production. Entitlement revoke must set actual
  revoked_at to satisfy its unchanged check. Queue-trigger setup also used exec.
- Positive repair then11 PASS, followed by14 PASS after actual head/sequence gates
  and missing-lock/cleanup/current-retry coverage. Final16 cases/101 total passed.

## Remaining required dependencies and next action

This conditional source-only constructor is not bound to the default formal HTTP
route. Real registered production sources, correct official carrier/adoption,
reviewed least-privilege writer grants/locking policies, admission publication,
actual host/clock/consumer registration and release authority remain separate.
The registered local/CI construction cannot erase those prerequisites. No new
schema, grant, queue, readiness truth or policy bypass was supplied to close them.

Positive CB/Social intake-to-execution is NOT_RUN. The fixed60a8 base retains the
already-reported Social source queue.command_type defect; Root has C's independently
reviewed source fix in its separate integration. That C fix plus a real admitted
operating-state reader must be present in the eventual release and validated there.
This report does not borrow Root's combined tests or claim those paths verified.

Native PostgreSQL role/RLS/concurrency/recovery, true network/ack fault, production
SQL/keys/schema/grants, formal source/HTTP/admission/host registration, CI, merge,
full economic loops, engine activation, official result publication and Gate B are
NOT_RUN. Missing dependencies are not inferred zero or fake READY.

Freeze exact commit/tree plus separate dependency/new-delta patches, source tar,
raw initial/repair/final logs and hashes. Root receives the immutable P0 candidate
for independent review. G then STOPs without self-approval, merge or activation.
