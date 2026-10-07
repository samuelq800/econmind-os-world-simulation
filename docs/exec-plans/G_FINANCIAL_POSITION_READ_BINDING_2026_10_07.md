# G opening-position server read binding increment

Status: `IMPLEMENTED_UNVERIFIED`; P0 independent review `PENDING`.

## Fixed dependency and owned scope

Independent branch `codex/g-financial-position-read-binding` is based exactly on
frozen `41559a3b93756a51357159e3180c3218fbb24c91`. Original 415, b17, intake and O
remain unchanged. Root explicitly authorized only two implementation files:
`postgres-runtime-read-executor.ts` and `postgres-read-adapter.ts`, plus direct
focused tests/config/report. No provider/store, source/seed/publisher, public
Core contract, browser consumer, SQL/migration/grant/role, Clock, host or
production file is changed. Disposable test-only SQL role/SELECT/policy
provisioning is confined to the new PGlite test.

The original opening-inclusive publisher correctly reconstructs the same
admitted seed; its API wire shape alone did not compare the cache's opening
seed tuple against the current persisted admission read context. This increment
closes that actual server read boundary. It does not grant membership, admission
or disclosure merely because a field or context is present.

## Existing real carrier and server comparison

Actual `RuntimeReadBindingStore.readImmutableAdmissionFrom` already rehydrates
`seedRef = seed.seedId` and `contentHash = seed.fingerprint`, after comparing its
immutable admission row with the parsed persisted seed and replay/model. The
unchanged actual persisted consumer compares those facts with its validated
opening facts and hydrates the current seat/admission binding. No new provider
query, producer or permission is needed.

`createPostgresRuntimeReadExecutor` now retains the actual non-null consumer
result from its existing subject-bound, repeatable-read, read-only snapshot. It
returns a bounded frozen `verifiedProjectionAuthority` only for its existing
entitled projection query. The tuple contains actual authSubject, worldId,
classification, scopeKey, seedRef, contentHash, worldVersion and eventSequence.
Every value comes from that actual persisted consumer identity/seed and the
validated same-snapshot head. It is never constructed from HTTP/request/config,
VITE, marker/status, default boolean or caller-supplied balances. Existing final
receipt query behavior is unchanged.

The actual adapter requires this context for every `AUTHORIZED_FILTERED`
opening-inclusive position. Exact world/classification/scope/verified subject
must match its actual requested projection; current context head must match
both the projection watermark and `sourceHead`; `opening.seedId` must equal
actual admission `seedRef`, and `opening.seedFingerprint` must equal actual
`contentHash`. Missing, malformed, wrong-subject/scope/tuple or stale-head
context fails with bounded non-retryable `PROTOCOL_ERROR`. Context access and
validation occur inside the existing sanitizing map boundary, including a
throwing malformed context property. No sensitive error detail is returned.

The context is server-only executor metadata and is not added to the HTTP
projection DTO. Existing signed/current authorization, seat/admission checks,
real entitlement query, cutoff/minimum watermark, cancellation and transaction
behavior remain mandatory. A denied absolute object or prior classified
movement-only payload retains its existing behavior; absence of the absolute
field grants no absolute balance claim. Legacy raw cache rejection remains.
No fallback synthesizes zero or treats net postings as available funds.

## Observed evidence

Pinned Node 24.20.0 / pnpm 12.3.4. Frozen offline install reused 161 packages,
downloaded 0. Core/Worker/API initial builds exited 0; the final affected API
build and expanded strict type/lint/check results are recorded in the receipt.

Initial actual PGlite read-chain test: **8 PASS**, exit 0 at 23:36:07
Asia/Shanghai, 6.32 seconds. Final nine-suite bounded matrix after the context
sanitization control: **181 PASS**, exit 0 at 23:36:48, 47.30 seconds. It includes
the nine actual binding cases, existing 415 publisher/source and strict API,
Country/Office flow, authenticated HTTPS composition/route, and three existing
architecture boundary suites. No test failure was observed in this increment.

The positive constructs and persists the canonical admitted source/seed and
real Core Command/Event/FinancialPosting, invokes the existing sole publisher,
then runs the actual snapshot reader, actual persisted seat/admission consumer,
actual runtime executor and actual adapter. PGlite executes actual restricted
reader-role SQL, SELECT privileges and RLS policies; the PoolClient bridge only
transports those queries serially and restores the role after release. No
binding/facts/context is fabricated for the positive. The authorized Treasury
position is 13 from opening 10 and movement +3. SQL trace verifies read-only
snapshot plus actual seat/admission reads, and HTTP DTO absence of context.

Ordinary negatives change the derived cached seed ID/hash or advance the real
held current head; the immutable source/admission stays fixed. Additional
negative executor controls remove the actual returned context or corrupt its
subject/shape/access, proving sanitized rejection. A different actual subject
is denied by the real read chain. Denied and older classified movement-only
payloads preserve their behavior. The old direct SQL publisher test now
explicitly expects missing-context absolute reads to fail; its original source
415 remains frozen, and the new real-chain test is the positive read evidence.

## Literal boundaries and handoff

Native PostgreSQL connection isolation/concurrency/RLS/grants, full 420 matrix,
browser/UI, production host, official admission, activation and release remain
`NOT_RUN`. Embedded PGlite role/RLS evidence is not native PostgreSQL proof.
The real official lawful admitted carrier remains `UNAVAILABLE`; explicit
isolated fixture admission is not an owner decision or production grant. The
actual admission veto and release boundary are unchanged. Independent B must
review the immutable two-file source read-boundary increment; normal Root
integration remains separate. No selfmerge or production/Gate claim.
