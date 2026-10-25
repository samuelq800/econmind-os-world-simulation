# Social physical attempt envelope v1

This is a pure Worker feasibility helper, not a new economic ledger, source
issuer, commit guard, runtime registration, or adopted Social scenario.

## Interface and meaning

`assertSocialPhysicalAttemptEnvelope({command,state,readFacts,sourceEnvelope,sha256Hex})`
uses the existing Core validator and actual prepare operation. It never accepts a
caller-provided after-state or changes the supplied state. The result is deeply
owned frozen diagnostic data with `sourceAdmitted:false`, `runtimeReady:false`
and status `DERIVED_FEASIBILITY_ONLY_NOT_SOURCE_AUTHORITY`.

All committed PLANs, PENDING or SETTLED, encumber their **full requested**
opportunity count on the original due day. Per shared stage, charge is the sum
of each lane's full requests times its original per-opportunity minutes. A new
PLAN adds its request once to the proposed-after calculation; MATCH and an exact
duplicate add zero. Returned Core reservations, zero/partial MATCH, later
settlement failure and expiry do not refund the original preallocation. This
conservative restriction can strand capacity and reduce throughput. It is not
actual minutes already worked, staff hiring, wage accrual or guaranteed jobs.

The sole history is the existing canonical PLAN/state/event/receipt stream. No
attempt table, mutable counter, quota store, refund, daily-reset mutation,
financial posting or alternate matching engine exists in this helper. Existing
Core V1 commands, events, replay and success-counter semantics are unchanged.

## Exact data and finite scope

`SocialPhysicalAttemptEnvelope` is exported from the Worker module. Its closed
fields are schemaVersion, worldId, headWorldVersion, headEventSequence,
ruleRevision, sourceRevision, validFromDayIndex, validUntilDayIndex, dayIndex,
countryId, locationId, pools and stages. Each pool has exactly poolId/skill;
each stage has resourceKey/availableMinutes/minutesPerOpportunity, with exact
LOW/MEDIUM/HIGH positive integer minute costs.

There must be exactly three unique skill pools and dense1..64 unique stages.
The source must describe the entire canonical shared resource group for this
country/location/day, not a partial lane budget. Extra same-scope pools, missing
or foreign lanes, duplicate keys, unsupported shape/accessors/classes/sparse
arrays, invalid half-open day validity or integers over120 digits reject.
Envelope canonical bytes are bounded262144; complete plans are bounded10000
before Core preparation, and a proposed10001st plan rejects. Limits never
truncate history or authorize deletion/reset. Arithmetic is exact BigInt.

Each lane's full requests must fit its existing sourced pool capacity; each
shared stage's aggregate must fit available minutes. Used slots must exactly
equal known settled matched totals: unexplained initial use is missing history,
not a fabricated zero. Canonical plan/command/fingerprint/pool/country/location/
skill/day bindings are verified using Core. Orphan history rejects. All supplied
stage costs/budgets are explicit; there is no300/420-minute, mix, wage, staff or
origin default. Actual staff/qualification/stations/calendar/input facts remain
the source owner's responsibility.

## Immutable original binding: G's mandatory source check

Core PLAN does not store the new minute recipe/source revision. Before the first
applicable PLAN, a genuine admitted opening or complete committed publication/
governing history must therefore bind the complete original envelope body for
world/country/location/day, all lane pool IDs and physical resource aliases,
available minutes, recipes, validity, rule and original source revision.

The immutable body is **every envelope field except the two current head audit
fields**. `sourceRevision` is the original immutable revision, not the latest
current eligibility revision. The helper returns `immutableBodyHash` for exact
correspondence. A changed body changes that hash, but a hash authenticates
nothing. The helper cannot detect an omitted original binding or real physical
alias that is absent from the supplied data.

G must resolve the same original body and complete PLAN membership from the
actual held canonical prefix before every formal call, and reject missing,
mixed or changed bodies. No same-day replacement of recipe, available minutes,
pool/resource identity, source/rule revision or validity is supported. Renaming,
splitting groups, moving a plan's day or a cheaper current recipe cannot release
old charges. Actual current correction/revocation is checked separately; source
withdrawal can deny new effects but does not rewrite history or refund rights.
No source store or adoption record is created here. Missing original binding
means formal `NOT_READY`, not an assumed new genesis.

In particular, budget15/minutes-per-op3 with PLAN5 encumbers15. Replacing the
recipe with1 must not reinterpret that as5 or enable10 more opportunities. G's
original-body comparison must reject that replacement before this arithmetic
helper can be used for formal new effects. Pure tests showing different hashes
are not evidence that a durable binding/current guard exists.

## Call edge, concurrency and recovery

G owns the same formal `SocialEmploymentRuntimeSnapshotReader.readFrom` in
preclaim intake and postclaim `SqlSocialJobMatchCandidateSource`. Both calls are
side-effect-free proposed-after diagnostics. Repeating a preview does not debit
time or permit dispatch. G checks authenticated source/adoption, the exact held
event head and immutable body; the helper checks fresh command expected version
against the supplied head but cannot authenticate that head itself.

Preparation and `AtomicTransitionRepository.commit` are **separate transactions**.
Source preparation locks do not survive commit. The existing real H/expected
WorldVersion/fence recheck serializes conflicting World transitions, but does
not alone protect independently mutable source/revocation records. Formal
composition must provide the reviewed actual source guard/recheck in the
H-held commit transaction before events, with cooperating source writers and
revokers, or a genuinely demonstrated same-World-version protection protocol.
Without that evidence formal new effects remain `NOT_READY`. This module does
not add a callback, guard or repository bypass to claim otherwise.

Only the existing PLAN COMMITTED receipt/history durably preallocates due-day
time. Uncommitted/rejected/rolled-back PLANs create no allocation and must have
dispatched no physical work. After PLAN commits, MATCH rollback/zero success or
returned reservation does not erase it. Exact duplicate assessments charge
zero extra but do not grant another processing pass. Any repeated logical pass
needs a distinct lawful PLAN and new preallocation. There is no external task
dispatcher here and no real-world exactly-once work guarantee.

Unknown commit acknowledgement requires the existing exact durable receipt and
complete-prefix recovery; absent receipt is not rollback proof, a refund or
permission to issue a replacement/redispatch. Historical receipt recovery has
priority over fresh-effect source eligibility and remains subject to existing
read authorization. Old V1 replay/history is untouched and must not be forced
retroactively through this new rule. New due-day pools need independently
supplied binding/resources; midnight does not replenish an old day.

## Ownership and evidence limits

D owns this helper, dedicated tests and contract. G owns formal source mapping,
original-body/alias completeness and reader integration. C owns governing and
current-source protection; D's separately reviewed future repository change
will own any shared commit integration. F owns combined/native acceptance.

Synthetic tests use real Core PLAN/MATCH operations and prove only finite pure
feasibility, no-refund, duplicates, shared resources, exact arithmetic, rejection
and diagnostic hashing. They do not prove authentic records, source admission,
commit/revoker cooperation, native concurrency, external dispatch or runtime
readiness. Actual custodians for original binding/resources/current protection
remain `SUPPLIER_UNCONFIRMED` until genuine records are supplied. No repeat
empty-source lookup, production SQL, permission, seed or WorldClock operation
is implied by this engineering implementation.
