# V06-V10.4 Implementation Sequence

## Entry conditions

Implementation must not begin until all conditions are observed in the
repository, not inferred from chat:

1. Gate A has an independent `APPROVED` decision tied to the exact Foundation
   remediation code candidate and evidence commit; `READY_FOR_REVIEW` and green
   candidate tests are insufficient.
2. V02.1-V05.3 are governance-valid `VERIFIED` and Foundation integration into
   `main` is explicitly authorized and completed.
3. `pnpm check`, governance validation, and `git diff --check` pass on the
   reconciled `main` baseline.
4. The JIT decisions needed before V06.1—at minimum ADR-03 and the scoped
   ordering portion of ADR-01—have responsible-human approval records.
5. A narrowly scoped World Core batch record is approved and added to
   governance because the requested Gate B model intentionally keeps internal
   P0 dependencies `IMPLEMENTED_UNVERIFIED`. It must name only V06.1-V10.4,
   branch `codex/world-core-v06-v10`, Gate B, no production mutation, no merge,
   and independent review pending. The validator may accept an unverified
   dependency only when both steps are inside that exact batch; it must never
   allow `VERIFIED` or post-V10 work without review.

If any condition is absent, report the exact blocker. Do not merge Foundation,
start V06, or emulate approval.

## Branch and lifecycle

After the entry conditions pass:

```text
reconciled main
  -> codex/world-core-v06-v10
  -> V06 -> V07 -> V08 -> V09 -> V10.1 -> V10.2 -> V10.3 -> V10.4
  -> GATE B — WORLD CORE HARD GATE
```

Each step gets one execution plan, implementation report, test evidence, trace
links, and meaningful implementation commit. Each completed step remains
`IMPLEMENTED_UNVERIFIED`. No intermediate P0 approval, merge, production
publication, or V11 implementation is permitted.

## Step sequence

### V06.1 — 10x Simulation Clock core

- **Dependencies:** V01.3, V03.3, passed Gate A, approved ADR-03 scope.
- **Build:** Pure clock state/value objects, explicit advancement input, formal
  multiplier/calendar, injected scheduler adapter interface, invalid-transition
  errors. Inherit exact-or-reject and the fail-closed public startup boundary.
  No timers or database.
- **Tests:** Exact conversions against shared oracle, monotonicity, formal
  multiplier lock, forbidden ambient clock/timer and AST architecture gates.
- **Evidence:** Source anchors MASTER-U0082-U0101, U0188-U0218 and Constitution
  U0166-U0187; seed/path for properties.
- **Commit:** `feat(v06): implement deterministic simulation clock`.

### V06.2 — Scheduling, Pause/Resume, and catch-up

- **Dependencies:** V06.1 candidate within approved batch.
- **Build:** Season state machine, scheduled-event queue contract, exact due
  selection, pause intervals, running-worker catch-up, day/year boundary
  markers. No E02-E18 economic execution.
- **Tests:** Random transition sequences, paused wall-time freeze, restart due
  drain, duplicate execution, offline-player independence.
- **Commit:** `feat(v06): add deterministic scheduling lifecycle`.

### V06.3 — Deterministic ordering and boundary tests

- **Dependencies:** V06.2; approved ADR-01/03 ordering.
- **Build:** Versioned priority/stage registries, total-order comparator,
  cutoff/boundary contract, V06 property/state-machine suite.
- **Tests:** Permutation invariance, equal-time ties, day/year edges, power-loss
  replay. Do not register future Engine behavior as implemented.
- **Commit:** `test(v06): enforce clock and scheduler invariants`.

### V07.1 — Command/Event schema and immutable ledger

- **Dependencies:** V02.3, V03.3, V05.3, V06.3; ADR-11/17 and ADR-20 timing
  approved. ADR-16 is not needed for branch-local candidate DDL but blocks any
  merge/promotion of it.
- **Build:** Canonical command/event types, external UUID `AuthSubject` plus
  resolved World IDs, schema registries, inert-data/trusted-adapter
  fingerprinting, first World Core persistence migration for World head,
  command submissions, immutable events and sequence constraints.
- **Tests:** Schema/version/exact-domain and behavioral-serialization attacks;
  ID/key conflicts; update/delete denial; ordered sequence; verified migration
  commit/path/byte hash plus clean/existing rehearsal.
- **Commit:** `feat(v07): add command and append-only event contracts`.

### V07.2 — Receipts, outbox, and idempotency

- **Dependencies:** V07.1.
- **Build:** Acceptance acknowledgement, immutable final receipt, durable
  idempotency record, command queue/claim contract, outbox with consumer dedupe.
- **Authorization:** Intake context is not authority; protected execution
  re-resolves current identity, membership, country, Office, capability and
  authorization revision.
- **Tests:** Exact duplicate, same-key/different-intent conflict, dropped
  response, restart, outbox redelivery, rejected zero-mutation receipt.
- **Commit:** `feat(v07): add durable receipts and idempotency`.

### V07.3 — Replay, seed, and version binding

- **Dependencies:** V07.2.
- **Build:** Pure reducer registry, opening-seed contract, contiguous replay,
  hash/version verification, optional explicit seeded-RNG service with no
  stochastic domain rule.
- **Tests:** Live/replay canonical equality; corrupt/missing/unknown event and
  version attacks; repeat determinism.
- **Commit:** `feat(v07): add deterministic replay contracts`.

### V08.1 — Available/reserved/in-transit inventory ledger

- **Dependencies:** V07.3; approved ADR-02 and initial ADR-05 model.
- **Build:** Inventory accounts, exact positions, immutable balanced posting
  batches, reservation/release/dispatch interfaces, migration constraints.
- **Tests:** Conservation, non-negative stock, exact-full transfer, unit
  mismatch, duplicate/concurrent reservation.
- **Commit:** `feat(v08): add conserved inventory postings`.

### V08.2 — Financial accounts and postings

- **Dependencies:** V08.1. Inherit Foundation exact-or-reject; ADR-08 stays open
  unless implementation would add rounding, FX, minor units or formula policy.
- **Build:** GCU account/position types, immutable balanced debit/credit batches,
  exact-or-explicit-reject Money transfer, causation and version fields. No
  Banking/FX or rounding.
- **Tests:** Money conservation, missing/unequal/duplicate leg rollback,
  insufficient balance, cross-asset rejection, JS-number boundary.
- **Commit:** `feat(v08): add balanced financial postings`.

### V08.3 — Opening seed and reconciliation

- **Dependencies:** V08.2.
- **Build:** Immutable fixture/provenance/hash/version contract, counterparty
  opening entries, ledger/head reconciliation utilities. Snapshot remains an
  accelerator.
- **Tests:** Valid seed, missing counterleg, tampered provenance/hash, replay
  from opening state.
- **Commit:** `feat(v08): add opening reconciliation contract`.

### V09.1 — Per-World lease and fencing

- **Dependencies:** V07.3, V08.3; ADR-17 final locking details approved.
- **Build:** Worker-only lease repository, monotonic fencing token, WorldVersion
  type/head, claim/renew/expire protocol. Canonical environment validation must
  finish before persistence or lease initialization. Real time only for lease.
- **Tests:** Two-writer race, expired holder, renewal race, stale fence/version,
  process restart against isolated PostgreSQL.
- **Commit:** `feat(v09): enforce single World writer`.

### V09.2 — Candidate state and atomic commit

- **Dependencies:** V09.1.
- **Build:** Private candidate executor and one short database transaction for
  fence/version/idempotency rechecks, complete current authorization
  re-resolution, positions, postings, events, receipt, version, and outbox.
- **Tests:** Every precondition; all failure injection points; concurrent
  `N -> N+1`; committed retry.
- **Commit:** `feat(v09): commit World transactions atomically`.

### V09.3 — Failure injection and recovery

- **Dependencies:** V09.2; isolated real PostgreSQL available under ADR-18.
- **Build:** Durable recovery scanner, abandoned-claim recovery, outbox retry,
  ledger/head reconciliation, projection rebuild hook.
- **Tests:** Exception, connection loss, worker kill, API kill, pre/post commit,
  receipt loss, lease expiry, corrupted watermark. Unit-only evidence is not
  enough.
- **Commit:** `test(v09): prove crash recovery and zero partial commits`.

### V10.1 — Two-country fixture and authorized projection

- **Dependencies:** V09.3; approved ADR-05/12 and V10 portions of ADR-09.
- **Build:** Test-only two-country opening seed; authoritative watermark-based
  country/Office/negotiation projections; scoped query API. No fake actual
  values or browser state authority.
- **Tests:** Visibility matrix, forged scope, projection delete/rebuild,
  authoritative-state independence.
- **Commit:** `feat(v10): add two-country fixture and projections`.

### V10.2 — Trade command, approval, and reservation

- **Dependencies:** V10.1; approved required-Office resolver version.
- **Build:** `CORE_GOODS_TRANSFER_V1`-style narrow command for one registered
  non-strategic commodity, Seller Trade offer, Buyer Trade acceptance, Buyer
  Finance Treasury-GCU approval, inventory reservation.
- **Tests:** No stock, wrong Office/country, revoked actor, stale version,
  stale context/revision, duplicate/conflict, mutated payload/fingerprint/policy/
  required-Office scope. No E16 claim.
- **Commit:** `feat(v10): reserve approved bilateral transfer`.

### V10.3 — Dispatch, delivery, and atomic GCU payment

- **Dependencies:** V10.2.
- **Build:** RESERVED -> IN_TRANSIT -> delivered Buyer AVAILABLE; one atomic
  delivery/payment transaction, events, receipt, WorldVersion and projection
  outbox.
- **Tests:** Bilateral inventory/GCU conservation, failure at every leg,
  exact-result overflow rejection, insufficient funds, duplicate delivery,
  retry/crash; equality is canonical exact, never tolerance-based.
- **Commit:** `feat(v10): settle first cross-country transaction`.

### V10.4 — Browser E2E and World Core hard evidence

- **Dependencies:** V10.3.
- **Build:** No new economic scope. Add real two-country/two-Office browser E2E,
  concurrency/retry/crash campaign, Gate B bundle and reconciliation.
- **Tests:** Entire attack matrix, property/state-machine campaign, projection
  rebuild, immutable replay, staging RLS/grants, full repository regression and
  all seven Gate-A-to-Gate-B inherited Foundation invariants.
- **Commit:** `docs(v10): prepare Gate B World Core candidate` after the exact
  implementation candidate is committed and all actual evidence is recorded.

## Proposed migration boundaries

1. **World Core ledger migration:** World head/clock, commands, idempotency,
   events, receipts, outbox.
2. **Posting migration:** inventory/financial accounts, positions, batches,
   postings and opening provenance.
3. **Writer/recovery migration:** leases/fencing and invariant constraints;
   avoid a migration if application-only logic suffices.
4. **Projection migration:** derived read model and watermark; test fixture seed
   stays outside production migration artifacts.

Each artifact must be ordered and hashed in the V02 manifest; its full source
commit, path at that commit and exact bytes must be verified with replace refs
disabled. It must rehearse against clean and existing schemas, include forward-
fix/rollback notes, and remain unpublished to production. No separate World
Core migration authority exists.

## Evidence and status progression

For each step:

```text
PLANNED -> IN_PROGRESS -> IMPLEMENTED_UNVERIFIED
```

Record exact implementation commit, commands/exit codes, environment/database
surface, property seeds/paths, schema/RLS/grant impact, failure history,
rollback/forward-fix, and known gaps. Do not create step-level approval records.

At V10.4 stop at `GATE_B_WORLD_CORE_HARD_GATE=PENDING`, `V11.1=PLANNED`, and
`next_step_ready=false`. Independent Gate B review must bind an immutable code
candidate and evidence commit before any merge or V11 work.
