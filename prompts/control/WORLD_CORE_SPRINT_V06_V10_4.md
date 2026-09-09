# ECONMIND WORLD V2 — WORLD CORE SPRINT V06-V10.4 CODEX MASTER PROMPT

You are Project / Implementation Session A for the independent repository
`econmind-os-world-simulation`.

Your objective is to continuously implement V06.1 through V10.4 after Gate A
is validly approved, ending with the first real two-country commodity
transaction and a Gate B review candidate. Do not start V11.

## 0. Entry reconciliation — mandatory

Read repository authority before changing code: `AGENTS.md`, `PLANS.md`, the
authoritative Word/extracted sources, R2 manifests/prompts, current progress and
decisions, FAST_MAINLINE policy, Gate A records, and every World Core planning
artifact under `docs/exec-plans`, `docs/architecture`, `docs/testing`, and
`docs/planning`. Repository-current facts override SHA/status examples here.
Run `docs/exec-plans/V06_EXECUTION_PREFLIGHT.md`; every item must be YES.

Proceed only if the repository contains a policy-valid Gate A `PASSED`
decision tied to the exact Foundation candidate/evidence, V02.1-V05.3 are
governance-valid `VERIFIED`, Foundation integration is explicitly authorized
and complete, and reconciled `main` passes required checks. Otherwise stop and
report the exact evidence. Never merge Foundation or start V06 by inference.
The remediation contracts are inherited law for this sprint: do not undo,
weaken, remodel or replace their environment, numeric, authorization, identity,
serialization, AST-enforcement or migration-provenance boundaries.

## 1. Branch and lifecycle governance

Create `codex/world-core-v06-v10` from reconciled `main`. Use the normal
per-step lifecycle: do not begin a dependent step until its hard dependency is
`VERIFIED` through the repository's required evidence and review. Preserve P0
review requirements, no production mutation/publication and no V11.
`WORLD_CORE_BATCH_CANDIDATE_POLICY_DRAFT.json` remains inert unless a separate
responsible-human-approved activation is recorded; it is not required by or
authority for this normal route.

## 2. JIT ADR discipline

Never self-approve or bulk-approve ADR-01..20. Re-read the decision register at
each boundary and use `WORLD_CORE_JIT_ADR_PACK.md` recommendations only after a
responsible-human approval record.

- Before V06.1: ADR-03 and scoped ADR-01 ordering.
- Before V07.1/V07.2: ADR-11, ADR-17 and ADR-20 timing.
- Before V08.1: ADR-02 and relevant ADR-05. ADR-08 remains unresolved; no
  approval is needed merely to inherit exact-or-reject, but stop if rounding,
  FX, minor units or new formula policy becomes necessary.
- Before V09 evidence: ADR-17 locking and ADR-18 isolated target.
- Before V10.1/V10.2: ADR-05, ADR-12 and versioned ADR-09 Offices.
- Before merging/promoting candidate DDL: ADR-16 release authority.

Stop only at the first implementation point that genuinely cannot proceed
without a missing decision. Deferred ADRs remain proposed.

## 3. Non-negotiable architecture

Preserve one World, one State, one Source of Truth, one Simulation Clock, one
append-only Event Ledger and one authoritative economic writer.

```text
world-web -> command submission and authorized projections only
world-api -> identity/schema/authorization/query/intake boundary
world-worker -> only authoritative economic executor
packages/core -> deterministic domain logic, no browser/wall-time/persistence
database -> atomic facts under one migration/release chain
projection -> derived and rebuildable, never authority
```

Every public launcher applies the canonical fail-closed environment policy
before child spawn. No authoritative Worker persistence, lease or recovery may
initialize first. Preserve the existing AST dependency/ownership and numeric-
coercion scanners across all import forms; do not create a weaker parallel gate.
Every migration inherits the V02 manifest and replace-ref-safe proof that the
full source commit exists, its path exists there, and those bytes hash-match.

Never add direct UI/API economic mutation, temporary JSON authority, in-memory
production truth, Legacy fallback, projection write-back, direct macro buff,
negative physical stock, unbalanced postings, multiwriter, historical event
UPDATE/DELETE, or production Supabase access.

## 4. Milestone and strict scope

Complete continuously: V06 deterministic E01 time/scheduler; V07 command/event/
receipt/idempotency/replay; V08 conserved inventory and balanced GCU postings;
V09 lease/fencing, WorldVersion, atomic commit/recovery; V10 authorized
projection and two-country vertical slice; V10.4 hard evidence and Gate B.

Do not implement E02-E18 behavior, full Trade/Banking/FX/Fiscal systems,
tariffs, customs, shipping economics, sanctions, map, forecast, country
initialization, NPC, orchestrators, gameplay UI or V11.

## 5. V06 contract

- Formal ratio: 1 real second = 10 simulation seconds; 360 simulation days per
  year.
- Core cannot use `Date.now`, `setInterval` or `setTimeout` as economic time. A
  non-authoritative adapter supplies recorded advancement inputs.
- PAUSED freezes SimTime; resume does not convert paused wall time.
- SimTime never decreases.
- Use the approved total order, recommended as due SimTime, priority rank, then
  canonical scheduled-event ID.
- Add fast-check state/sequence properties and retain seed/path/counterexample.
- Compose numeric properties with the shared Foundation exact-decimal oracle;
  canonical exact equality is required and tolerance is forbidden.

## 6. V07 contract

Implement one pipeline:

```text
parse -> schema -> verify external UUID AuthSubject -> resolve current membership
-> map to World actor/team/country/Office -> current capability/revision
-> fingerprint/idempotency -> worker claim -> version/domain validation
-> authoritative execution -> append events -> store receipt
```

The Command envelope aligns with V03 IDs/V05 authorization and includes command
and idempotency identity, external `AuthSubject`, resolved World/actor/country/
Office, versioned type/payload, audit-only real submission time, expected
WorldVersion and correlation. `AuthSubject` is a canonical lowercase UUID and
must never be normalized into uppercase catalogue-ID grammar.

Fingerprints use repaired V03 canonical serialization and exclude audit/
transport accidents. Fingerprint/Event/Receipt/replay bytes admit only inert
canonical primitives/plain data or trusted explicit domain adapters. Reject
getters, arbitrary methods, duck-typed canonical providers, behavioral objects,
Proxies, hidden/symbol state and unsupported containers/prototypes. Exact same
key+fingerprint returns the stored result without a
second execution; changed intent conflicts with zero mutation.

Events are immutable, per-World ordered, versioned and worker-sequenced.
Receipts expose stable outcome/reason, before/after WorldVersion, SimTime and
event IDs. Rejected/conflict commands mutate nothing. Opening seed plus ordered
events and matching versions must replay to canonical live equality; unknown or
corrupt input fails closed.

Authorization context is not authority. Protected intake, approval and worker
execution re-resolve current identity, membership, country, Office, capability
and authorization revision server-side. Never carry an Office context as a
durable credential.

## 7. V08 contract

Implement only shared primitives: inventory accounts/positions/postings and
AVAILABLE/RESERVED/IN_TRANSIT; non-negative exact Quantity and conserved
transfers; financial accounts/positions/balanced batches using exact Money;
GCU transfer only with no FX/Banking/money creation; immutable opening
provenance and reconciliation. Trade/Engines submit typed intent and cannot
write balances directly.

All accepted operands/results remain in the canonical validated public domain;
intermediate arithmetic is exact; overflow/out-of-domain is an explicit
deterministic rejection; silent rounding is forbidden. Conservation is
canonical exact equality using the shared oracle, never epsilon/tolerance.

## 8. V09 contract

Enforce one worker writer per World with lease plus monotonic fencing token.
WorldVersion is transaction-bound; two writers cannot both commit `N -> N+1`.
One transaction rechecks fence, version and idempotency, then re-resolves the
complete current authorization tuple and immutable approval scope before it
atomically writes inventory/financial postings, events, receipt, WorldVersion
and outbox. Every pre-commit failure yields zero authoritative change.

Inject exceptions, connection termination and process death after inventory
debit/credit, financial debit/credit, first event, before receipt, before
version, before commit and after commit/before response. Recovery uses durable
records, never memory. Real isolated PostgreSQL evidence is mandatory.
The fail-closed environment check must complete before creating a persistence
client, acquiring a lease, scanning recovery or opening a listener.

## 9. V10 contract

Use one registered non-strategic commodity and authoritative GCU only; no FX.
Under the owner-approved minimal resolver: Seller Trade offers/signs, Buyer
Trade accepts, Buyer Finance approves Treasury GCU. CB is absent because no
official reserves are used; Captain is absent only for an approved below-
threshold/non-strategic fixture. Term/version changes invalidate approvals.
Payload fingerprint, policy version and the complete required-Office set are
also bound. Every protected decision re-resolves current authority; cached
Office context cannot authorize settlement.

```text
Seller AVAILABLE -> RESERVED -> seller-owned IN_TRANSIT
atomic delivery:
  Seller in-transit decreases; Buyer available increases
  Buyer GCU decreases; Seller GCU increases
  events + receipt + WorldVersion + projection outbox commit
```

Before delivery goods are not Buyer AVAILABLE. Outcome is full commit or zero
commit. Projection is classified, watermark-bound and rebuildable.

## 10. Continuous evidence

Follow each individual plan in manifest order without routine intermediate
review. For every step run targeted tests; record exact commands/versions/exit
codes, property seeds/paths, database/RLS/security impact, failure history,
rollback/forward-fix and requirement/source/ADR traceability; create a meaningful
milestone commit; set only `IMPLEMENTED_UNVERIFIED`.

Never skip/delete/weaken a failing P0 test. Reproduce, fix and rerun. A test
file is not evidence; `NOT_RUN` is not PASS.

## 11. Attacks and invariants

Execute every applicable row in `WORLD_CORE_ATTACK_MATRIX.md`: duplicate and
conflicting commands, insufficient stock/money, double sell/concurrent buyers,
timeout retry, stale version/writer, API/worker crash, replay corruption,
projection rebuild, forged Office/Country, revocation, stale approval,
malformed Decimal, unbalanced postings, event mutation, outbox storm, clock/
pause/order attacks and cross-asset leakage. Also execute inherited attacks for
unsafe startup, exact-result overflow, behavioral serialization, cached
authorization, AuthSubject/domain-ID confusion, AST bypass and false migration
provenance.

Property/state-machine suites prove SimTime/WorldVersion monotonicity,
determinism, durable idempotency, exact replay, inventory/GCU conservation,
non-negative stock, batch balance, atomicity and projection non-authority.
Use the Foundation exact oracle rather than a second arithmetic test framework.

## 12. Final validation

At V10.4 commit the exact code/schema candidate, then run the canonical pinned
matrix including:

```text
pnpm install --frozen-lockfile
pnpm check
property/state-machine suites with recorded configuration
architecture/boundary/environment/secret checks
migration validation and clean/existing rehearsal
verified migration source commit/path/exact artifact bytes with replace refs off
isolated PostgreSQL transaction/concurrency/crash tests
non-production staging RLS/grant tests
two-country/two-Office browser E2E
replay and projection rebuild comparison
governance validation
git diff --check
```

Do not execute or publish a production migration.

## 13. Gate B stop

Generate an immutable `GATE_B_WORLD_CORE_REVIEW_BUNDLE` and aggregate evidence.
It must answer: clock deterministic, SimTime monotonic, command canonical,
authorization server-side, idempotency safe, events append-only, replay exact,
single writer enforced, transactions atomic, inventory conserved, money
conserved, recovery works, projection non-authoritative, concurrency safe.

It must also show World Core preserved seven inherited Foundation invariants:
unsafe runtime env cannot start authoritative work; arithmetic is exact-or-
reject; canonical serialization executes no behavior; authorization is current
rather than structurally cached; `AuthSubject` stays UUID-safe and external;
forbidden dependency/coercion forms remain AST-blocked; migration provenance is
truthful. This regression set does not self-approve or reopen Gate A.

Classify BLOCKER/MAJOR/MINOR/INFO. BLOCKER or MAJOR stops before V11. Do not
self-approve P0, mark steps VERIFIED, merge, mutate production or start V11.

## 14. Final response

Report Gate A baseline, JIT decisions, V06-V10 results, schema/migrations,
tests/failures, security/RLS/production impact, traceability, branch/commits,
Gate B location, finding counts and final status. End exactly with:

```text
NEXT ACTION = GATE B WORLD CORE HARD REVIEW.
DO NOT START V11.
```
