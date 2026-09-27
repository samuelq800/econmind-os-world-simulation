# Staged narrow-transfer HTTP — code-only first slice

Base `809d1db528a09dbca681e5dc2d6fb7afa260a38d`; branch
`codex/staged-narrow-transfer-http`. P0 implementation candidate, not package
promotion, production authorization, Gate B or actual-use acceptance.

## Ownership

New API staged handler/service and server composition, exclusive integration
tests and focused CI. The only existing HTTP change is an optional independent
staged route in `local-nonproduction-http-bridge.ts`; old final-only routes are
unchanged. Do not edit F intake, E approval reader, migration 0017, Core rules,
web pages, original main site, authority records or production.

Authorized build metadata: API explicitly depends on Core/Worker; Worker adds
only package exports for its existing reviewed intake/approval-store modules.
No Worker→API edge or cycle. API composition is typed source, not cross-app
`dist` path imports. Root pretest builds Core → Worker → API. The focused CI
does this on a fresh checkout (no cached dist), validating the lockfile too.

## Existing authority and explicit prerequisites

Consume approved immutable Command/receipt rules (ADR-11/17), current
authorization on intake/sign/commit (ADR-20), the existing exact GRAIN / Buyer
Treasury GCU transfer policy, reviewed F staged intake and reviewed 0017/E
approval lookup. No new approval matrix, economic formula or schema.

`current_commit_authorization` is the current server-held authorization source
but has no actor ID. Composition requires a trusted subject→actor directory;
missing mapping denies, HTTP cannot supply it. Trusted real/SimTime clock is
also mandatory; HTTP never supplies accepted SimTime, submission/signing time,
authorization revision or canonical fingerprint generation. A proposed expiry
is a contractual term, not the authoritative current clock.

## Protocol and real lifecycle

Versioned independent POST route: REGISTER → INSPECT → SIGN_SELLER /
SIGN_BUYER_TRADE / SIGN_BUYER_FINANCE → BIND_REFERENCE → ENQUEUE → READ.
REGISTER persists only pending canonical intent via F. No queue or economic
effect until all three actual current-authorized signatures exist. INSPECT
returns exact intent/fingerprint only to the named seller Trade or buyer
Trade/Finance; signatures explicitly echo that fingerprint. BIND_REFERENCE
derives one deterministic server-owned reference from the immutable Command
identity; it does not fabricate missing signatures. ENQUEUE matches E's exact
reference lookup and F's transactional current authorization guard. READ uses
F for the original submitting seller; only a real stored final receipt can
produce FINAL. Pending, queued, executing, not-found and unknown are distinct.

Re-registration loads the stored immutable Command to reuse server SimTime and
audit timestamps, then reconstructs and compares exact intent. Never rebuild
retry fingerprint from the new current clock. Explicit IDs/keys identify
UNKNOWN recovery; do not promise an unacknowledged write did not happen.

## Adjacent implementation boundary

Existing Worker composition consumes a queue with a candidate factory, but no
production narrow reservation candidate/source exists on this base (only
delivery factory and test-local reservation drafts). This first usable slice
ends at real queued intent and genuine state reads; it does not insert a test
final, preseed a Command/approval, execute a synthetic reservation or claim
settlement. Next slice needs the Worker reservation candidate/source plus queue
claim/run wiring using existing Core reservation logic and atomic commit. No
new economic rule is implied by this split.

F confirmed an additional boundary: Core reservation requires branded
`SIGN_OFFICE_APPROVAL` contexts plus proposal version; 0015 durable rows and
`assertCurrent(): Promise<void>` cannot supply them. This service creates only
live, verified-request Trade/Finance capability contexts for intake, never
historic-token principals or reconstructed approval credentials. The missing
durable→Core authorization bridge requires a separate reviewed decision/slice.

## Required evidence

Actual local HTTP and guarded disposable PostgreSQL: empty command/approval
tables → register → three distinct verified identities sign → bind reference
→ enqueue → read QUEUED, duplicate calls remain one intent/queue/reference,
revocation/missing signatures/cross-country/spoofed actor or clock/changed
intent denied. Inject lost commit acknowledgement, recover by IDs and repeat
without duplicate writes. No fake FINAL; no Event/Posting/receipt in this slice.
Also scoped lint/typecheck/build, legacy bridge regressions, boundary scanner
and manifest checks. Freeze source SHA, push branch and provide CI run to B;
only Control Tower merges after independent review. Actual UX deferred.
