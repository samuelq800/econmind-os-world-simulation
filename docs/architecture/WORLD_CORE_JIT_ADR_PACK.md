# World Core JIT ADR Pack

## Status

Every entry below is `PROPOSED_NOT_APPROVED`. This document recommends scoped
resolutions; it is not an approval record and does not change
`status/decisions.json`. The implementation agent must re-read that register
after Gate A and stop at the stated latest point if the responsible human has
not recorded the necessary decision.

## Decision index

| ADR    | Decision required now                                                      | Latest implementation point                    | Owner approval required |
| ------ | -------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------- |
| ADR-01 | Settlement phase identity/order without renumbering E01-E18                | Before V06.3 ordering is frozen                | Yes                     |
| ADR-03 | Tick unit, pause/resume, catch-up, cutoff, equal-time order                | Before V06.1 code                              | Yes                     |
| ADR-11 | Command/idempotency/duplicate receipt semantics                            | Before V07.1 schema                            | Yes                     |
| ADR-17 | Persistence, append-only ledger, transaction, lease/fence, replay boundary | Before V07.1 schema; final detail before V09.1 | Yes                     |
| ADR-20 | Authorization at acceptance versus execution/recovery                      | Before V07.2 queues a command                  | Yes                     |
| ADR-02 | Unique owners for inventory and financial positions/postings               | Before V08.1                                   | Yes                     |
| ADR-08 | V10 GCU precision/rounding scope                                           | Before V08.2                                   | Yes                     |
| ADR-05 | Reservation/transit/title/risk/recognition point                           | Before V08.1 model; no later than V10.1        | Yes                     |
| ADR-12 | Country/Office/party projection visibility                                 | Before V10.1                                   | Yes                     |
| ADR-09 | Required Offices for the V10 transaction version                           | Before V10.2                                   | Yes                     |
| ADR-16 | `world_v2` namespace and sole publication chain for new DDL                | Before any V07-V09 migration is promoted       | Yes                     |
| ADR-18 | Isolated database/runtime targets for persistence/concurrency evidence     | Before V09 staging evidence                    | Yes                     |

## ADR-01 — Engine and settlement-phase mapping

- **Decision required:** Which identifiers define the deterministic daily
  settlement order while preserving Master E01-E18.
- **Why now:** V06.2/06.3 must schedule daily settlement and freeze an order,
  but the Constitution lists 15 settlement stages while the Master lists 18
  Engines.
- **Recommended resolution:** Keep E01-E18 unchanged. Use the Constitution's 15
  settlement-stage IDs as the versioned orchestration order. E01 schedules the
  run; future Engines register one or more operations against a stage. V06
  implements only registry/order mechanics, not E02-E18 operations.
- **Alternatives:** Use Engine IDs as stages; create a third numbered list; defer
  all daily-settlement scheduling. The first two create semantic drift; the
  last prevents V06.2 acceptance.
- **Consequence:** Stable phase IDs and explicit engine-operation mappings;
  future mapping changes require a versioned architecture decision.

## ADR-03 — Simulation Clock semantics

- **Decision required:** Tick unit, wall-clock adapter boundary, pause/resume,
  running-worker catch-up, command cutoff, and total order.
- **Why now:** These semantics are the substance of V06.
- **Recommended resolution:** Non-negative integer simulation-millisecond
  ticks; multiplier applied once in the clock; adapter-provided recorded
  advancement input; PAUSED wall time contributes zero; resume from frozen
  SimTime; running downtime drains due work using intended timestamps; total
  order `(dueSimTime, priorityRank, scheduledEventId)`; command cutoff is the
  locked World SimTime observed when the worker begins the authoritative
  transaction.
- **Alternatives:** Floating seconds, direct `Date.now`, timer callbacks, or
  pause catch-up. These violate exactness, replay, or the explicit pause rule.
- **Consequence:** All economic deadlines use SimTime and reproduce exactly;
  real time remains audit/adapter metadata.

## ADR-11 — Idempotency and receipts

- **Decision required:** Exact duplicate versus conflict identity and what is
  returned after retry.
- **Why now:** V07 tables and unique constraints cannot be defined safely
  without it.
- **Recommended resolution:** Unique `(worldId, commandId)` and
  `(worldId, idempotencyKey)`. Fingerprint all authoritative intent fields using
  V03 canonical serialization, excluding audit/transport metadata. Exact match
  returns the stored acknowledgement/final receipt and never executes again;
  same key or ID with a different fingerprint returns
  `IDEMPOTENCY_CONFLICT` with zero mutation. Consumer delivery receipts remain
  separate from immutable economic events.
- **Alternatives:** Last-write-wins, payload-only matching, or in-memory dedupe.
  Each is unsafe under restart or concurrent submission.
- **Consequence:** Retried requests are stable and auditably distinguishable
  from conflicts.

## ADR-17 — Persistence, commit, replay, and failure boundary

- **Decision required:** Canonical facts, current head materialization,
  append-only ledger, snapshot/checkpoint role, single writer, and atomic
  transaction scope.
- **Why now:** V07 starts durable command/event design; V09 enforces commit and
  recovery.
- **Recommended resolution:** Opening seed plus append-only events is replay
  lineage; current World head/positions are transaction-bound canonical
  materializations in the same World State. Per-World worker lease plus
  monotonic fencing token; private candidates; short database transaction
  rechecks fence/version/idempotency and atomically writes positions, postings,
  events, receipt, WorldVersion, and outbox. Snapshots accelerate only.
- **Alternatives:** Event-only reads, current-table-only history, distributed
  multiwriter, or projection-as-truth. These fail performance, audit, or
  single-authority constraints.
- **Consequence:** Full commit or zero commit, exact replay, and restart-safe
  dedupe; added schema/locking complexity is accepted as P0 necessity.

## ADR-20 — Authorization lifecycle for queued work

- **Decision required:** Which authority time controls accepted, queued,
  scheduled, and recovering commands.
- **Why now:** V05 intentionally left queued execution without a default.
- **Recommended resolution:** Verify identity/current membership at API
  acceptance and re-resolve current authorization in the worker immediately
  before a user-command commit. Revocation denies new or not-yet-committed user
  actions. Already committed facts/contracts survive. Later automatic
  obligations execute from the accepted versioned contract authority unless
  their command type explicitly requires reauthorization or has been cancelled
  by an authorized event.
- **Alternatives:** Acceptance-only for all queued commands or execution-only.
  The first permits revoked users' pending discretionary actions; the second
  can erase valid durable obligations.
- **Consequence:** Discretionary authority remains current while immutable
  economic commitments remain durable.

## ADR-02 — Unique entity owners

- **Decision required:** Which service alone owns physical inventory and GCU
  account balances.
- **Why now:** V08 cannot permit Trade or another Engine to update balances
  directly.
- **Recommended resolution:** A World Inventory Posting service uniquely owns
  stock accounts/positions/postings. A World Financial Posting service uniquely
  owns settlement accounts/positions/postings. Trade creates commands and
  obligations; it cannot write either ledger. Projections have no write-back.
- **Alternatives:** Per-Engine balance columns or duplicated Trade balances.
  Both create a second economic truth.
- **Consequence:** Cross-domain work uses typed posting interfaces/events and
  balanced batches.

## ADR-08 — Exact GCU settlement scope

- **Decision required:** Precision/rounding policy needed by the V10 proof.
- **Why now:** V08.2 financial postings require an exact settlement asset
  contract, while full FX/currency rounding is future scope.
- **Recommended resolution:** V10 uses the existing GCU international
  denomination. Inputs and postings are canonical decimal strings; transfer
  uses exact equal amounts and performs no FX or rounding. If a price-times-
  quantity calculation cannot be represented under the approved exact rule,
  validation fails rather than silently rounds. Full currency minor units and
  rounding postings remain future ADR-08 work.
- **Alternatives:** Invent a test currency, use JS number, or prematurely define
  all currencies. GCU is already authoritative and avoids all three.
- **Consequence:** The vertical slice proves conservation without claiming E17
  FX or global monetary policy.

## ADR-05 — Inventory, transit, title, and recognition

- **Decision required:** Minimum V10 transfer lifecycle and ownership/risk
  point.
- **Why now:** V08 account buckets and V10 delivery cannot be modeled without a
  physical boundary.
- **Recommended resolution:** `AVAILABLE -> RESERVED -> IN_TRANSIT ->
DELIVERED/AVAILABLE`. Reservation changes no owner or total. Dispatch places
  stock in seller-owned in-transit custody. In the minimal contract, title,
  risk, import/export recognition, buyer availability, and GCU payment occur in
  the single atomic delivery transaction. This rule is versioned only for the
  V10 proof.
- **Alternatives:** Title at dispatch or configurable Incoterms. Both are
  legitimate future choices but add contract/logistics semantics outside V10.
- **Consequence:** No disappearing in-transit goods, double debit, or pre-
  delivery buyer use.

## ADR-12 — Projection classification

- **Decision required:** Visibility for fixture state, offer, approvals,
  settlement, receipt, and public summary.
- **Why now:** V10.1 exposes the first real derived read model.
- **Recommended resolution:** Reuse V05 classifications. Public receives only
  aggregate non-sensitive completion data; each country sees its own balances;
  Office-private data is scoped to assigned Trade/Finance Offices; negotiation
  details are visible only to both named parties and required Offices; admin is
  separately server-resolved. Projection rows carry authoritative watermark
  and classification and are rebuilt without broadening access.
- **Alternatives:** One country-wide projection or client filtering. Both leak
  classified fields.
- **Consequence:** Query API and future RLS/grants share one server policy.

## ADR-09 — V10 required Offices

- **Decision required:** Required signatures for the exact V10 fixture command
  version.
- **Why now:** V10.2 cannot claim an approved bilateral transaction without a
  versioned resolver result.
- **Recommended resolution:** For a below-threshold, non-strategic registered
  commodity paid from Buyer Treasury GCU: Seller Trade signs the offer; Buyer
  Trade accepts; Buyer Finance approves the Treasury payment. Central Bank is
  not required because the fixture does not use official reserves; Captain is
  not required because the fixture is explicitly non-strategic/below threshold.
  Any change to asset source, threshold, commodity classification, or terms
  invalidates signatures.
- **Alternatives:** Trade-only, all six Offices, or ad-hoc UI approval. Trade-
  only ignores Treasury authority; all-six is unjustified; UI is not security.
- **Consequence:** The slice proves Office-version approvals without encoding
  the full E16 policy matrix.

## ADR-16 — Namespace and release authority

- **Decision required:** Whether new World Core DDL remains in `world_v2` and
  is published only through the main-site release chain.
- **Why now:** V07-V09 require the first authoritative persistence migration.
- **Recommended resolution:** Preserve the V02 manifest, `world_v2` ownership,
  exact artifact hashes, isolated rehearsal, and main-site-only production
  publication. No dashboard/manual SQL authority.
- **Alternatives:** A second migration chain or reuse of Legacy tables. Both are
  prohibited.
- **Consequence:** Planning and local/staging rehearsal can continue; production
  still needs separate authorized publication.

## ADR-18 — Environment isolation

- **Decision required:** Which isolated targets supply real transaction,
  concurrency, RLS/grant, and crash evidence.
- **Why now:** PGlite is suitable for pure DDL rehearsal but cannot alone prove
  all Supabase/PostgreSQL operational behavior required by V09/Gate B.
- **Recommended resolution:** Disposable local/CI PostgreSQL for deterministic
  tests plus a dedicated non-production Supabase staging project for final
  RLS/grant/concurrency/recovery evidence. Fingerprints and mutation policy
  continue to fail closed. Production remains read-inaccessible to the sprint.
- **Alternatives:** PGlite-only Gate B evidence or shared production testing.
  The former is insufficient evidence; the latter is forbidden.
- **Consequence:** Gate B must report staging evidence explicitly and cannot
  convert `NOT_RUN` to `PASS`.

## Explicitly deferred ADRs

- ADR-04: opening/current/prior-day economic feedback, due before V11-V17.
- ADR-06/07: catalogue gaps and construction/GDP, outside World Core.
- ADR-10: international subtype mapping, due V21/V22.
- ADR-13/14/15/19: NPC, orchestrators/legacy migration, scoring/season close,
  and domain/login/cache deployment are outside V06-V10.4.

These remain visible dependencies but are not requested for bulk approval now.
