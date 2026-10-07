# G authenticated financial intake increment

Status: IMPLEMENTED_UNVERIFIED. P0 independent review and Root integration remain
pending. No activation, publication, production operation or self-merge.

## Authority and immutable scope

Root authorized this separate increment after G's full read provider froze at
`565c35e2bfa65ce4662c5eaf6d28c3972846021c`, tree
`a778317082939df40d5e52534c1491261459d52e`. Branch:
`codex/g-authenticated-financial-intake`. The original provider increment and
its evidence remain unchanged. Root explicitly approved the new browser-safe
Core command contract and one index export; G owns only the new API modules,
fixture, tests and this record. No D/C/E/A implementation, migration,
Constitution, source/proposal record or shared status was edited.

The human-adopted Owner decisions original SHA256
`57bfdec38a9a400991cb26362a99d33d7a81c8e6258c03460185e51501fb5ac5`
and D02 implementation instruction SHA256
`5d07a94e087f545dc3c1948a321ccd74c16aecb4483f5266de59085186c7d29b`
remain the governing scoped implementation instructions. D05 production
host/activation stays excluded. Root owns the sole review/publication chain.

## Completed implementation

- Core publishes pure transport DTOs, schema `world-authenticated-financial-intake-v1`,
  fixed path `/v1/financial-intake`, existing Office action support and the
  browser client port. No API/Worker/Node imports, second economic parser,
  server grant, fake balance or browser persistence. D owns the actual client.
- API verifies the real C Supabase JWKS signature and canonical claims. It
  obtains the real G/A persisted binding for the requested exact Office scope:
  current subject, country/team/revision, immutable seed hash/admission/model,
  real head and projection entitlement. Caller country/Office are selectors,
  never authorization. Missing or incoherent facts deny.
- The existing staged request and canonical Command parsers remain sole
  validators. The service consumes the fixed real `PostgresNarrowTransferIntake`,
  `NarrowTransferApprovalStore` and Buyer Finance reference reader. Trade may
  register/inspect/sign/enqueue/read; Finance may inspect/sign/bind a reference.
  Captain, Central Bank, Industry and Social are explicitly unsupported.
  Signature, pending intake and QUEUED are not economic settlement or FINAL.
- A managed writer adapter sets the verified subject per transaction, verifies
  the named non-superuser/non-bypass role and rejects economic-table DML/schema
  CREATE. It rechecks actual persisted seat/current capability/admission/seed
  before the existing port and again at its transaction tail. The initial guard
  does not lock head or authorization; existing submission -> head -> current
  authorization lock order is preserved. The tail holds current authorization
  through commit. The real reader role remains separate and read-only.
- A definite tail denial is surfaced as AUTHORIZATION_DENIED only after an
  acknowledged rollback. Existing Worker recovery otherwise remains untouched;
  acknowledgement/recovery/cancellation uncertainty retains UNKNOWN and exact
  identities. No blind replay, new identity on retry or fabricated FINAL.
- The bounded bearer HTTP adapter handles only the fixed public path, HTTPS
  origin allowlist, exact JSON body and CORS preflight. It has body/bearer/response
  bounds, fatal UTF-8 decoding, sensitive-header duplication checks and timeouts.
  It returns false for existing unrelated routes. It is never mounted/listening
  by default, creates no pools and starts no Clock/Worker/host. Local fixture HTTP
  is transport evidence only, not proof of TLS or deployment.

## Local verification

Pinned Node 24.20.0 / pnpm 12.3.4, native PostgreSQL 16.15 Homebrew. The new
native opt-in suite creates a fresh disposable cluster, short private Unix
socket, TCP disabled, TEST_ONLY roles/World/source/actors/clock and signed EC256
tokens. It reads existing migrations only through release_order 17 plus A's
unnumbered binding proposal, not a full migration rehearsal. The synthetic
source is DOCUMENTED_ASSUMPTION / TEST_ONLY. Positive tests disable only the
admission publication veto in their disposable database, then restore it;
negative tests retain the veto. Production application/migrations have no bypass.

Final new suite: **12 PASS**, including **10 actual native PostgreSQL tests**
and two public contract/fail-closed tests. It proves pending registration,
three distinct Office signatures, Finance reference, once-only enqueue, exact
retry, current JWT/seat/admission/world/head denial, and no ledger/event/head
settlement. Four fault-injection cases use real SQL inserts and transaction-tail
authorization change to prove rollback of submission, signature/proposal,
reference and queue. These inject the authorization change on the same writer
connection to reach the tail deterministically; they are not an independent
two-session authorization-concurrency proof. Post-COMMIT acknowledgement loss
and unavailable explicit recovery yield UNKNOWN; the exact retry finds one row.
The native HTTP test consumes the shared public DTO and real signature/SQL path.

Existing affected regressions: **135 PASS / 19 NOT_RUN (native opt-in skipped)**
in six selected files; five files ran and the unchanged provider's native file
was skipped. No skipped case is claimed PASS. Core, Worker and API declaration
builds, API typecheck, focused new test typecheck, focused lint, boundary,
authoritative-pattern, secret and local environment checks passed. Formatting
and diff checks are repeated after this record is added. Exact commands, exit
codes, candidate commit/tree and hashes are frozen externally for Root/B.

Initial native setup failures were corrected in fixture provisioning: publisher
FOR SHARE needs UPDATE-column privilege; repeated database fixtures must not
rerun global official reader-role publication. Initial exact-intent negative
test exceeded the existing six-GCU threshold; it now changes intent within the
existing legal threshold, reaching genuine immutable idempotency conflict.
Initial tail rollback denial was safely UNKNOWN through the unchanged intake;
the adapter now retains acknowledged rollback denial as described above.
One chained command initially lost the pinned PATH after its first process;
the run failed engine checks, then was rerun with an exported pinned PATH.
No production guard, existing test or economic threshold was weakened.

## Explicit remaining gaps and stop boundary

- No production credentials, verified admin, actual actor directory, official
  source/admission publisher, current seat TTL publisher or producer exists in
  this increment. Missing actor/clock configuration remains NOT_CONNECTED;
  unavailable actor mapping denies. Existing A admission publication veto stays.
- Actual managed reader/writer pools, RLS and production least-privilege role
  provisioning are missing. Existing ports' SELECT FOR UPDATE/SHARE require
  UPDATE-column grants on head/current authorization/submission even though
  this code never changes head/authorization. These TEST_ONLY fixture grants are
  not a production provisioning decision; Root/B must assess that boundary.
- The configured server clock is a required port, never a newly created Clock
  authority. Actual authoritative Clock/lifecycle carrier and trusted producer
  remain blocked. simulationEnabled/workerActivationAllowed/clockActivationAllowed
  are all false. No economic execution, writer lease or FINAL is activated.
- C's real command -> ledger -> FINAL/projection integration, actual D browser
  command client, six-role/all-country acceptance, TLS/host/provider deployment,
  production activation and Gate B are NOT_RUN. Root owns the separate joint
  test after B approval; this increment does not import/copy C's fixture or host.

Freeze source-only evidence, send Root the candidate/public contract and B
handoff, then STOP. Do not self-approve, merge, deploy, grant, listen or continue
into joint economic execution from these local results.
