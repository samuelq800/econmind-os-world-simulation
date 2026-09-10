# World Core Contract — V06 through V10.4

## Status and decision boundary

This is a planning contract, not an implementation or ADR approval. Gate A is
`PASSED` through the recorded `PROJECT_OWNER_ACCEPTANCE` and the Foundation is
merged into `main`; V06-V10.4 remain `PLANNED`. The contract may be
implemented only after the JIT decisions identified below are approved at their
latest implementation points. It is reconciled to remediation code candidate
`47fe5c5d465748370d9a8ea046bc443978437203` and evidence HEAD
`b383904573b2959b3f22ea6d8ded4d02c3582b83`, accepted in
`docs/reports/GATE_A/FINAL_ACCEPTANCE.md`.

## One authoritative path

```text
External AuthSubject UUID
  -> world-api: token/profile verification, canonical parse/schema checks
  -> resolve current World membership to actor/team/country/Office domain IDs
  -> current Office capability and authorization revision
  -> immutable command submission
  -> world-worker: only authoritative economic executor
  -> one database transaction under current lease/fencing token
  -> inventory + financial postings + events + receipt + world version
  -> derived projection builder
  -> query API
  -> world-web
```

`world-web` submits commands and renders authorized projections. It never owns
economic state. `world-api` may persist an immutable submission/queue record,
but cannot change economic balances, ledger facts, or WorldVersion.
`world-worker` is the only economic writer. `packages/core` contains pure,
deterministic contracts and reducers and cannot read wall time, browser state,
network state, or persistence implementations.

## Inherited repaired Foundation boundaries

- Public Web/API/Worker launchers run the canonical fail-closed environment
  policy before spawning a child. A Worker must not initialize authoritative
  persistence, acquire a lease, or begin recovery before that validation passes.
- Authoritative decimal arithmetic is exact-or-reject: accepted operands and
  successful results stay inside the canonical validated public domain,
  intermediate arithmetic is exact, and an out-of-domain result is an explicit
  deterministic error. Silent rounding is forbidden.
- Canonical serialization accepts inert data and trusted explicit domain
  adapters only. It rejects accessors, arbitrary methods/providers, behavioral
  objects, Proxies, hidden/symbol state and unsupported containers/prototypes.
- Authorization contexts are non-transferable snapshots, not credentials.
  Protected decisions re-resolve current identity, membership, country, Office,
  capability and authorization revision server-side.
- `AuthSubject` is an external canonical UUID, distinct from `ActorId`,
  `WorldId`, `CountryId`, `OfficeId` and other uppercase domain identifiers.
- Existing AST ownership/coercion enforcement remains the architecture gate;
  alternate import syntax, aliases and unresolved module references fail closed.
- Migration provenance is true only when the full commit exists, the path
  exists at that immutable commit and those bytes hash-match the manifest, with
  Git replace refs disabled.

## Authoritative versus non-authoritative data

| Class         | Examples                                                                                                                      | Rule                                                                                 |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Authoritative | World head/version, accepted command identity, events, inventory/financial positions and postings, receipts, simulation clock | Written only by the controlled command/worker transaction path.                      |
| Derived       | Country/Office read models, summaries, projection checkpoints                                                                 | Rebuildable and never accepted as command precondition without re-reading authority. |
| Operational   | Lease expiry, queue claim, outbox delivery state, real audit timestamps                                                       | May coordinate processing but cannot determine economic quantities or deadlines.     |
| Fixture       | Two-country opening state, fault scripts, synthetic principals                                                                | Test-only, provenance-labelled, never a production fallback or second truth.         |

Current positions are transaction-bound materializations inside the one World
State, not an alternate truth. Opening seed plus append-only events must be able
to reconstruct canonical head state; reconciliation failure blocks commit or
release.

## Simulation Clock

### Core boundary

- Formal Season ratio: one real second equals ten simulation seconds; one
  simulation day equals 8,640 real seconds; one simulation year is 360
  simulation days.
- Core represents non-negative integer simulation ticks. ADR-03 must approve
  the tick unit; the recommendation is one simulation millisecond per tick so
  all specified boundaries remain integral.
- `Date.now`, `setInterval`, and `setTimeout` are forbidden as authoritative
  inputs inside World Core.
- A non-authoritative scheduler adapter observes wall time and submits a
  canonical `AdvanceClockInput`. The accepted input, not an ambient clock read,
  is the deterministic replay boundary.
- Real timestamps are audit/lease metadata only and never economic due dates.

### State machine

```text
PREOPEN -> RUNNING <-> PAUSED -> ENDED
```

- `advance(deltaActiveReal)` is valid only in `RUNNING`; the clock applies the
  multiplier exactly once.
- `PAUSED` freezes SimTime. Resume continues from the frozen value and never
  converts paused wall time into simulation elapsed time.
- While the worker is unavailable but the Season remains `RUNNING`, a recorded
  advancement input may move SimTime forward. Due operations are then drained
  by original due time; their intended SimTime is unchanged and actual
  processing time is audit metadata.
- Due events during a pause remain pending. Resume processes only events due at
  or before the frozen/current SimTime; it does not manufacture elapsed pause
  time.
- `T(n+1) >= T(n)` for every accepted transition. Correction is a new audited
  event and cannot rewrite history.

### Deterministic ordering

Subject to ADR-03 approval, the proposed total order is:

```text
(dueSimTime ascending, priorityRank ascending, scheduledEventId lexical)
```

`priorityRank` comes from a versioned registry; no engine chooses an ad-hoc
number. Network arrival, database row order, object iteration, or wall-clock
races are never tie-breakers. The same state and advancement inputs produce the
same execution sequence.

## Canonical command contract

The proposed immutable envelope is:

| Field                    | Contract                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| `commandId`              | Canonical ID, unique within World; exact retry reuses it.                                    |
| `idempotencyKey`         | Caller-scoped canonical string, unique within World.                                         |
| `worldId`                | Target authoritative World.                                                                  |
| `authSubject`            | Canonical external UUID from verified token/profile; never an uppercase domain ID.           |
| `actorId`                | World actor identity, not browser profile metadata.                                          |
| `countryId` / `officeId` | Claimed routing scope; always checked against current server membership.                     |
| `commandType`            | Versioned registry value; unknown values fail closed.                                        |
| `schemaVersion`          | Exact input schema; unsupported versions fail closed.                                        |
| `payload`                | Canonically serializable domain record; no JS number for exact values.                       |
| `submittedAtReal`        | Server audit metadata only; excluded from economic calculations.                             |
| `expectedWorldVersion`   | Canonical non-negative WorldVersion or explicit omission where the command contract permits. |
| `correlationId`          | Trace grouping only; never affects ordering or outcome.                                      |
| `simTime`                | Canonical V06 simulation tick associated with the accepted command intent.                   |

The authoritative fingerprint projection is an explicit allow-list:

| Classification          | Command input fields                                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTHORITATIVE_INTENT`  | `commandId`, `idempotencyKey`, `worldId`, `authSubject`, `actorId`, `countryId`, `officeId`, `commandType`, `schemaVersion`, `payload`, `expectedWorldVersion`, `simTime` |
| `TRACE_TRANSPORT_AUDIT` | `correlationId`, `submittedAtReal`                                                                                                                                        |

Only `AUTHORITATIVE_INTENT` fields participate in the canonical command
fingerprint. `correlationId` and server audit time remain stored envelope
metadata but cannot change duplicate/conflict semantics, ordering, or outcome.
Hash input uses the repaired V03 canonical serializer and its fixed SHA-256
preimage convention. Fingerprint/Event/Receipt/replay bytes may contain only
inert canonical primitives/plain records/arrays or trusted explicit domain
adapters—never a getter, arbitrary method, duck-typed canonical provider,
Proxy, hidden state or other behavioral object.

### Processing path

```text
parse -> schema validate -> verify AuthSubject -> resolve current membership
-> map to World actor/team/country/Office -> authorize current capability/revision
-> canonical fingerprint -> intake idempotency check
-> worker claims under lease -> re-resolve all current authority and WorldVersion
-> domain validate -> execute candidate -> validate invariants
-> atomic authoritative commit -> return stored receipt
```

Every economic command uses this path. An engine cannot publish a direct
mutation API. The intake authorization context may be retained for audit but is
not authority at approval or execution time.

### Idempotency outcomes

- Same World + idempotency key + identical fingerprint: return the original
  canonical receipt/acceptance and do not execute again.
- Same key + different fingerprint: `IDEMPOTENCY_CONFLICT`, zero authoritative
  mutation.
- Same command ID + different fingerprint: conflict, zero mutation.
- Retry after timeout or restart reads durable command/idempotency/receipt
  records; memory is never proof of prior execution.

## Receipt and Event contracts

### Receipt

An immutable final receipt contains command and idempotency identities,
canonical outcome (`COMMITTED`, `REJECTED`, `DUPLICATE`, or `CONFLICT`), stable
reason code, WorldVersion before/after, SimTime, ordered event IDs, and command
fingerprint. A separate immutable acceptance acknowledgement distinguishes
queued acceptance from final execution. Duplicate submission returns the
stored acknowledgement/final receipt rather than creating a second economic
outcome.

Rejected/conflict commands have identical before/after WorldVersion and no
economic event or posting. Operational failure logs are not ledger events and
must not masquerade as economic facts.

### Event

An append-only event contains eventId, worldId, per-World sequence,
WorldVersion, causationCommandId, correlationId, SimTime, eventType,
schemaVersion, and canonical payload. The worker assigns sequence inside the
commit transaction. Event IDs are deterministically derived from command
identity plus event ordinal/type or otherwise allocated by an approved stable
server algorithm; clients never provide ordering.

Historical events cannot be updated or deleted. Correction/reversal is a new
event. Unknown schema versions and corrupted sequence/hash chains halt replay
with explicit errors.

## Replay

```text
opening seed S0 + ordered events E1..En + model/schema/registry versions -> Sn
```

Reducers are pure and exhaustively keyed by event type/version. Replay verifies
contiguous sequence, event/command hashes, causation, WorldVersion transitions,
and model/schema/registry versions. Unknown or corrupt input fails closed;
there is no best-effort skip. Live head and replayed head compare by canonical
serialization/hash, not approximate numeric equality.

Seeded randomness, when future rules require it, is passed explicitly and its
seed/version is recorded. V06-V10 introduces no stochastic economic rule.

## Exact numeric contract

- Public Money, Quantity, Price, Rate and SimTime operands/results use the
  Foundation canonical validated domain.
- Add, subtract and multiply compute exactly. A successful result is canonical;
  overflow or any out-of-domain exact result fails explicitly rather than
  rounding, clamping or returning display precision.
- Money/inventory conservation and live/replay equality are canonical exact
  equality. JS-number conversions, epsilon and tolerance assertions are not
  authoritative evidence.
- Property tests extend the shared Foundation arbitraries and independent
  BigInt coefficient/scale oracle; World Core does not create a second
  arithmetic-testing framework.
- This contract adds no FX, CPI, tax, interest, minor-unit, price-formation or
  settlement-rounding semantics. Those remain in unresolved ADR-08.

## Inventory primitives

The minimum World-owned model is:

- `InventoryAccount`: owner, country, commodity and approved location/bucket
  identity;
- `InventoryPosition`: `AVAILABLE`, `RESERVED`, or `IN_TRANSIT` exact Quantity;
- `InventoryPosting`: immutable signed quantity movement with unit, causation,
  counterparty posting, and batch;
- `InventoryTransfer`: balanced posting batch and lifecycle transition.

No physical position may be negative. Reservation moves quantity from
AVAILABLE to RESERVED without changing total stock. Dispatch moves RESERVED to
IN_TRANSIT without creating/destroying stock. Under the proposed ADR-05 minimal
slice, atomic delivery transfers title and moves seller in-transit quantity to
buyer available quantity. Before delivery it is never buyer-available.

Location, risk, title, reservation, and economic-recognition fields remain
separate. Full logistics and E08 Resource logic are outside scope.

## Financial posting primitives

- `FinancialAccount`: owner, country, settlement asset, account class.
- `FinancialPosition`: exact Money balance at WorldVersion.
- `PostingBatch`: command/event causation, settlement asset, status/version.
- `FinancialPosting`: account, debit/credit direction, exact amount, batch and
  counterparty identity.

Every committed batch balances in one settlement asset. V10 uses the
authoritative GCU international denomination only; it performs no LC/GCU
conversion, FX price discovery, central-bank reserve change, money creation, or
banking operation. Exact GCU amounts use V03 Money/WorldDecimal and no JS
number. The repaired Foundation exact-or-reject rule is inherited without an
ADR-08 approval; any operation that would require economic rounding, FX or
minor-unit policy remains blocked on future ADR-08.

## WorldVersion, single writer, and transaction

- WorldVersion is a branded non-negative monotonic integer represented as a
  canonical string in domain/JSON and a constrained integer in PostgreSQL.
- Every successful authoritative state transition increments it exactly once.
  Rejection, duplicate, and conflict do not advance it.
- The worker holds a per-World lease with a monotonically increasing fencing
  token. Lease time is operational wall time; it is not SimTime.
- The commit transaction locks the World head and rejects stale lease/fence or
  expected WorldVersion. Two writers cannot both commit `N -> N+1`.

Canonical transaction:

```text
BEGIN
  lock World head
  verify live fencing token and expected WorldVersion
  verify durable idempotency record
  re-resolve current AuthSubject, membership, country, Office, capability,
    authorization revision and immutable approval scope
  validate economic preconditions
  apply inventory postings
  apply financial postings
  append events and hash/sequence data
  store immutable execution receipt
  advance WorldVersion exactly once
  enqueue projection/outbox work at committed watermark
COMMIT
```

Any error rolls back all listed writes. Projection delivery may be asynchronous
after commit; its outbox record commits atomically, and projection lag never
changes the economic result.

## Persistence plan

The first World Core migration remains in the V02 manifest and main-site
release chain. Names are provisional until migration implementation review.
Every candidate artifact must name a full source commit and pass the existing
replace-ref-safe proof: commit exists, path exists at that commit, and exact
artifact bytes SHA-256-match the manifest. World Core creates no parallel
manifest, caller-asserted provenance or publication authority.

| Entity group         | Minimum constraints                                                                                |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| World head/clock     | One row per World; version, event sequence and fencing token monotonic; clock non-negative.        |
| Commands/idempotency | Unique `(world_id, command_id)` and `(world_id, idempotency_key)`; immutable fingerprint/envelope. |
| Receipts/events      | Unique per-World sequence/IDs; append-only events; receipt version transition constraints.         |
| Inventory            | Unique account/commodity/bucket position; non-negative check; immutable balanced posting batches.  |
| Financial            | Account/asset positions; immutable batches/postings; deferred balance validation before commit.    |
| Lease/fencing        | One active holder per World; fencing token monotonic; stale-token commit rejected.                 |
| Opening seed         | Immutable source/provenance/hash and schema/model/registry versions.                               |
| Outbox               | Durable operational delivery state; unique economic causation; retry-safe.                         |
| Projection           | Separate derived namespace/tables with authoritative watermark and rebuild procedure.              |

Browser and ordinary authenticated roles receive no authoritative-table write
grants. Worker-only write access, scoped query services, RLS/grant tests, and
live staging verification are mandatory evidence before Gate B; production
publication remains separately authorized.

## Recovery

- Uncommitted database work disappears on rollback/restart.
- A claimed command without a committed receipt becomes claimable after lease
  expiry under a higher fencing token.
- A committed command is recognized by durable fingerprint/idempotency and
  returns its stored receipt.
- Outbox/projection work retries independently and cannot replay the economic
  transaction.
- WorldVersion comes from the locked World head and is reconciled against the
  event/posting watermark.
- Projection can be deleted and rebuilt from the opening seed plus authoritative
  ledger to the same canonical read model.

## V10 minimal two-country proof

The recommended fixed fixture uses a non-strategic registered commodity and
GCU only:

1. Seller Country A owns AVAILABLE quantity; Buyer Country B owns sufficient
   non-reserve GCU settlement balance.
2. Seller Trade signs the offer. Buyer Trade accepts. Buyer Finance signs
   because the fixture payment uses a Treasury-owned balance. No Central Bank
   approval is implied because official reserves are not used.
3. Acceptance reserves seller inventory; duplicate acceptance is idempotent.
4. Dispatch moves RESERVED to seller-owned IN_TRANSIT.
5. One delivery transaction moves quantity to Buyer AVAILABLE and GCU from
   Buyer to Seller, appends events, stores receipt, advances WorldVersion, and
   emits projection work.
6. The outcome is full commit or zero commit. No tariff, shipping cost,
   customs, sanction, contract engine, FX, banking, or E16/E17 claim is made.

Required Offices, account ownership, title-transfer point, and visibility must
be approved through ADR-09/05/12 before implementation.

## Hard boundaries

V06-V10.4 does not implement E02-E18, full Trade/Banking/FX/Fiscal systems,
tariffs, logistics, sanctions, map, forecast, NPC, country initialization,
Normal/Season orchestrators, or gameplay UI. Any need for those systems becomes
a blocker or an explicit future interface—not a hidden expansion.
