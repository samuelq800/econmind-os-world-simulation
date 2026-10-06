# G HTTPS six-Office read preparation

Status: `IMPLEMENTED_UNVERIFIED_PREPARATION_ONLY`. Exact candidate independent
review is still required. Nothing is mounted, connected, deployed or activated.

Product base: `67b5302fa73f4a082c6ab773410aa614f343f54e`. Root-owned scope parent:
`426c82d58b600f1d11986ba5f6c1502e752730a0`. Branch:
`codex/g-production-read-preparation`. The scope record is
`docs/governance/G_HTTPS_SIX_OFFICE_READ_PREPARATION.json`, SHA256
`decb85b08497f2c5a7aa5f06b9befcc865d04cbb3da320aa01d4ea901bbe967f`.
Its literal `PENDING_INDEPENDENT_SCOPE_REVIEW` is preserved. Root separately
conveyed B's acceptance of that exact scope/head/hash and authorized this
isolated offline source preparation. That does not approve this implementation.

E's fixed connection report was read first, SHA256
`091bfb8dfe112c5a0665e05c3fae1a7728b0dc4be69e6952c6f05dbecc65c3cc`:
`/Users/samuel/Documents/econclub/artifacts/E_PRODUCTION_RUNTIME_CONNECTION_CHECK_2026_10_06.md`.
Its production host, identity/seat and admitted opening gaps remain unresolved.
No scan, source GET, credential retrieval or DB check was repeated.

## Prepared capability

The new browser port exposes only `readProjection`, `lookupFinal`, `state` and
`disconnect`. It supports the six Office identity domain (`CAPTAIN`, `FINANCE`,
`CENTRAL_BANK`, `INDUSTRY`, `TRADE`, `SOCIAL`), restricted to authorized `COUNTRY`
or `OFFICE_PRIVATE` projections. It does not discover a host, access storage or
URL/VITE configuration, decode a JWT, assign a seat, create a seed, submit a
Command or enable any Office action. Default/null/incomplete configuration is
`NOT_CONNECTED`. After a fully matching server result, `READ_ONLY_BOUND` means
only that this read binding was observed, not that an economic loop is running.

The transport accepts an explicit exact canonical HTTPS origin and two distinct
exact paths from an externally reviewed configuration. Local-loopback HTTP and
`/local/` paths are rejected by this separate module. Existing local-client and
trusted runtime restrictions are unchanged. The origin/route/deployment reference
are consistency inputs; their structure or hash is not proof of approval.

Only POST bodies for the existing `READ_WORLD_PROJECTION` and
`READ_FINAL_NARROW_TRANSFER_RECEIPT` read operations can be produced. Token supply
is an opaque callback. Credentials are omitted, redirects rejected and caching
disabled. The complete token/fetch/body operation has a ten-second limit, a
one-MiB response cap, no automatic retry and no write capability. Session
invalidation permanently retires the port, aborts reads and clears private
derived cache data. Current identity/lifetime are checked before dispatch and
after every await. The existing scoped cache and receipt/UI validators are
reused; no second World State or financial arithmetic is introduced.

Projection payloads are preserved as derived server JSON with exact strings;
they are not interpreted as live cash. Public selected-source values, combined
Treasury/CB source figures, local previews and fixture balances never enter this
module. Readback and projection WorldVersion/eventSequence must match. A monotonic
readback/FINAL floor survives transient failure; behind or conflicting data is
not adopted. No UI, route, source loader, country-game/context or other runtime
file imports or mounts this preparation.

## Why the optional HTTP-neutral composition is necessary

The existing authenticated projection envelope contains World/classification/
scope/watermark but lacks current seat/revision and admitted seed/head binding.
The existing durable FINAL envelope also lacks those binding fields. Neither
contract is changed. The new server-only module wraps those two handlers in
`world-authorized-read-binding-v1`, requiring an injected `ServerReadBindingPort`.
It creates no route, pool, verifier, provider, opening, seed, grant or topology.

The composition verifies the Bearer token with the existing signature/claims
boundary before giving its subject to the binding port. Existing handlers then
independently verify JWT and their actual projection entitlement or durable
submission/current-active-authorization predicates. Binding is independently
resolved before and after the handler; a changed seat/revision/seed/head retires
the response. Only filtered public binding fields are returned. This is source
preparation, not production verification or a claim of atomic DB admission.

The real provider implementation is **MISSING**. Its contract requires current
server records, not copied browser/config assertions: a verified subject, active
seat/authorization revision, projection entitlement, same admitted World/seed
and authoritative head readback. An ambiguous, missing or revoked binding returns
null. For FINAL it must resolve the exact original durable submission's scope
from command/idempotency selectors, then require the same current seat; another
Office held by that subject cannot stand in for that scope. `readbackRef` must
identify the same immutable head readback, not a fresh per-call timestamp.
Provider, managed executor and deployment composition need later explicit review.

## Wire fields and missing external pins

| Field                                                                                     | Required provenance and check                                                                                   | Current external evidence      |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `origin`, `projectionPath`, `finalLookupPath`, `deploymentRef`                            | Exact HTTPS host/routes and reviewed deployment/config reference; no public source reader or local bridge proxy | MISSING                        |
| `sessionRef`, `isCurrent`, `onInvalidate`, `getAccessToken`                               | Trusted real session supplier/lifetime; opaque token only                                                       | MISSING                        |
| `verifier`, `expectedIssuer`, `expectedAudience`, current JWT policy                      | Actual same-project signature verification and approved issuer/audience; no test claims or publishable key      | MISSING                        |
| `authSubjectId`, `countryId`, `officeId`, `seatRef`, `seatState`, `authorizationRevision` | Verified subject and current active server seat/revision; no DOM or profile-role grant                          | MISSING                        |
| `scopeKey`, `classification`, `modelVersion`, `projectionVersion`                         | Current projection entitlement/scope and exact client binding; only COUNTRY/OFFICE_PRIVATE here                 | MISSING                        |
| `worldId`, `seedRef`, `contentHash`, `admissionRef`, `minimumWorldVersion`                | Approved admitted World/seed/opening evidence and real minimum head; source manifest is not admission           | MISSING/HOLD                   |
| `readbackRef`, readback `worldVersion`, `eventSequence`                                   | Same authoritative World/seed/head readback, consistent across the read                                         | MISSING                        |
| `ServerReadBindingPort`, managed executor                                                 | Reviewed server provider and real read-only execution/RLS composition; nothing installed by this slice          | MISSING                        |
| FINAL `commandId`, `idempotencyKey`, `commandFingerprint`                                 | Original immutable command identity and dedicated durable receipt, with current authorized scope                | No production receipt supplied |

The binding response additionally labels `SERVER_VERIFIED_READ_BINDING`,
`READ_AUTHORIZED_PROJECTION_AND_FINAL` and `ACTIVE`. Those labels alone are not
verification: only the required server implementation and externally reviewed
pins can supply their meaning. All test endpoints use `.example.invalid`; every
identity/seed/admission/token/query result is explicitly `TEST_ONLY`.

FINAL lookup has no offer, expiration, prepared reservation, Finance approval,
registration, signature, enqueue or write-capability input. It uses the original
command/idempotency/fingerprint and existing dedicated durable reader. Its
success is not a write acknowledgement, stock balance, payment or Clock advance.
The existing FINAL family remains narrow-transfer receipt recovery; testing its
query protocol in six scope fixtures does not invent six Office economic actions.
No prior offer must be renewed to recover a committed durable FINAL.

## Governance and verification limits

Risk is P0 because identity, authorization, receipt scope and future production
transport are affected. No fast-track or self-approval is claimed. `current_gate`
remains V09.1 PLANNED/PENDING with `next_step_ready=false`. V25.2 remains NORMAL
and unstarted. Its unmet real dependencies remain PLANNED: V10.4, V14.3, V15.3,
V16.3, V17.3, V18.3, V19.3, V20.3, V21.3, V22.3, V23.3, V24.3 and V25.1.
V31/V32, formal activation and economic/architecture decisions are not unlocked.

The two new offline suites exercise six-scope reads, actual authenticated-handler
and browser-parser composition using fake in-memory transport, revoked/mismatched
bindings, seed/world/version/fingerprint rejection, session/late-body retirement,
deadlines, limits, original FINAL recovery without offers, and absence of writes.
Relevant existing local-client/session/final/authenticated-read regressions and
scoped types/lint/format/import/environment/secret checks are required. Exact
commands, results, immutable tip/tree/patch and hashes are frozen outside the
repository at handoff. Initial compile diagnostics (literal widening and mock
tuple typing) are retained and repaired without weakening tests or guards.
An initial regression-suite/import scan also found missing generated Core/Worker
package exports in the new checkout. Required offline TypeScript compilation
prepares those ignored outputs only; it does not run a Worker, Clock or World.
The immediate-cancellation regression also caught a response-classification
race: self-retirement after a server denial initially returned STALE. The final
client preserves the denial cause while cancelling; DENIED is not weakened to
an ambiguous result. The failing log remains in the evidence package.

Actual JWT/server/seat/admission/DB/HTTP/browser/production connectivity,
deployment, CI network runs, full PG, online420, Worker/Clock, economic actions,
main merge and release are `NOT_RUN`. The prepared module may only be adopted
after a separate fixed-candidate B review and Root decision; formal dependent
implementation still requires its real gates. Stop after frozen handoff.
