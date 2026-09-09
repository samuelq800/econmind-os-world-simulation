# World Core Invariant Matrix

## Evidence protocol

All properties run through Vitest and the existing fast-check testkit. The
release command fixes `seed`, `numRuns`, verbosity, and `endOnFailure`. Every
failure report stores suite/property name, seed, shrink path, minimal
counterexample, run configuration, candidate commit, and relevant schema/model/
registry versions. A rerun must use the exact seed/path before a regression
fixture is added. Re-running until green is not evidence.

Recommended defaults are 1,000 runs per core property and 250 state-machine
sequences in normal CI, with a documented higher-run Gate B campaign. The
actual budget must be recorded rather than inferred from this plan.

## V06 — Clock and scheduler

| Invariant                  | Generator/attack                                                     | Oracle                                                                         | Failure result                      |
| -------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------- |
| SimTime monotonicity       | Random non-negative advances, pauses, resumes and duplicate inputs   | Every accepted `T(n+1) >= T(n)`; rejected negative/stale input changes nothing | `CLOCK_REGRESSION`, zero transition |
| 10x mapping                | Integral active-wall deltas including 0 and boundary day/year values | Delta SimTime equals exactly delta × 10 once                                   | `CLOCK_CONVERSION_ERROR`            |
| Pause freeze               | Random wall advances while PAUSED                                    | SimTime and due set unchanged                                                  | `PAUSE_INVARIANT_FAILED`            |
| Resume determinism         | Equivalent sequences with arbitrary paused wall durations            | Same canonical state after resume/next accepted active advance                 | mismatch blocks V06                 |
| Scheduler total order      | Permutations of equal/different due time, priority and IDs           | Sorted result equals `(due, priority, ID)` and is permutation-independent      | `SCHEDULER_ORDER_ERROR`             |
| Exactly-once due execution | Duplicate drain/restart sequences                                    | Each scheduled identity executes at most once                                  | `EVENT_ALREADY_PROCESSED`           |
| Boundary triggering        | Ticks immediately before/at/after day and 360-day boundaries         | Daily/year markers occur exactly once at the boundary                          | deterministic reject/block          |

Example-based tests additionally cover PREOPEN/RUNNING/PAUSED/ENDED invalid
transitions, admin-only pause/resume, late worker intended versus processed
time, and formal-Season multiplier immutability.

## V07 — Command, event, receipt, and replay

| Invariant             | Generator/attack                                                | Oracle                                                                                                            | Failure result                    |
| --------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Canonical command     | Field-order permutations and equivalent exact values            | Same fingerprint for the same canonical envelope                                                                  | schema/fingerprint reject         |
| ID/key conflict       | Same command ID or idempotency key with mutated intent field    | Conflict; no event/posting/version change                                                                         | `IDEMPOTENCY_CONFLICT`            |
| Exact duplicate       | Same key and fingerprint repeated N times                       | Same stored receipt; one execution                                                                                | duplicate response                |
| Receipt consistency   | Generated outcomes and event sets                               | Rejected/conflict has before=after and zero economic events; committed has ordered IDs and one version transition | `RECEIPT_INVARIANT_FAILED`        |
| Append-only events    | Attempted update/delete/resequence/correction overwrite         | Database and service boundary deny; correction is new event                                                       | hard failure                      |
| Replay equivalence    | Opening seeds plus generated valid event sequences              | Canonical live state/hash equals replay state/hash                                                                | `REPLAY_MISMATCH`                 |
| Corruption detection  | Missing/duplicate/out-of-order event, unknown version, bad hash | Replay halts at exact offending sequence                                                                          | explicit corruption/version error |
| Deterministic reducer | Same input, seed and version repeated                           | Byte-identical canonical output                                                                                   | mismatch blocks Gate B            |

## V08 — Inventory and financial postings

| Invariant               | Generator/attack                                              | Oracle                                                     | Failure result                  |
| ----------------------- | ------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------- |
| Inventory conservation  | Valid transfers across accounts/buckets                       | Sum Quantity by commodity/unit before equals after         | rollback, `INVENTORY_IMBALANCE` |
| Non-negative stock      | Zero, exact-full, one-unit-over, extreme canonical quantities | No committed position below zero                           | `INSUFFICIENT_STOCK`            |
| Reservation exclusivity | Repeated and concurrent reservations against one position     | Reserved total never exceeds available opening amount      | one winner or version conflict  |
| Bucket conservation     | AVAILABLE/RESERVED/IN_TRANSIT lifecycle                       | Bucket movement does not create/destroy quantity           | rollback                        |
| Unit isolation          | Mismatched commodity/unit postings                            | Deterministic `UNIT_MISMATCH`; zero write                  | reject                          |
| Money conservation      | GCU transfers among generated accounts                        | Sum Money before equals after                              | rollback, `LEDGER_IMBALANCE`    |
| Batch balance           | Missing/duplicate/reversed/unequal posting leg                | No unbalanced batch can commit                             | `LEDGER_IMBALANCE`              |
| No JS-number path       | Generated decimal syntax and static architecture scan         | Exact amounts stay Money/Quantity/Price strings/objects    | boundary failure                |
| Seed reconciliation     | Opening seed/postings with tampered source or counterleg      | Provenance/hash/version valid and opening totals reconcile | seed rejected                   |

The minimum slice permits zero and exact-full transfer. Negative quantities,
implicit unit conversion, silent clamping, money creation, and overdraft are
invalid unless a future approved instrument explicitly defines them.

## V09 — Writer, atomicity, and recovery

| Invariant                 | Generator/attack                                            | Oracle                                                            | Failure result               |
| ------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------- |
| One live writer           | Two holder IDs, lease renewal/expiry races                  | Only current highest fencing token may commit                     | `STALE_WRITER`               |
| WorldVersion monotonicity | Competing expected versions                                 | Exactly one `N -> N+1`; loser gets `VERSION_CONFLICT`             | zero loser mutation          |
| Atomicity                 | Failure at every transaction checkpoint                     | State is exactly pre-state or fully committed post-state          | any partial state is BLOCKER |
| Retry after crash         | Crash before/after commit and receipt response              | Before commit retries once; after commit returns stored receipt   | no double effect             |
| Durable idempotency       | Worker/API restart between intake, claim and commit         | Durable DB identity controls outcome                              | no memory dependence         |
| Outbox independence       | Commit succeeds then delivery repeatedly fails              | Economic commit remains once; outbox retries without re-execution | operational failure only     |
| Recovery reconciliation   | Tampered/missing head, event, position or posting watermark | Recovery detects mismatch and stops                               | explicit recovery failure    |
| Projection rebuild        | Delete derived rows and rebuild at ledger watermark         | Canonical projection equals pre-delete projection                 | projection mismatch          |

Mandatory failure-injection points: after inventory debit, after inventory
credit, after financial debit, after financial credit, after first event,
before receipt, before WorldVersion advance, and immediately before commit.
Each point runs both exception rollback and simulated worker-process death
against a real isolated PostgreSQL target.

## V10 — Two-country vertical slice

| Invariant                        | Generated sequence/attack                               | Oracle                                                                  |
| -------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------- |
| Bilateral inventory conservation | Vary seller stock and purchase quantity                 | A decrease equals B increase only after delivery                        |
| Bilateral GCU conservation       | Vary exact price/amount and buyer balance               | B decrease equals A increase; global sum unchanged                      |
| Symmetric settlement             | Random valid trade fixtures                             | Inventory and money either both commit or neither commits               |
| Approval version binding         | Mutate quantity/price/account/commodity after signature | Prior approval invalid; zero settlement                                 |
| Country/Office isolation         | Swap/forge actor country and Office                     | `PERMISSION_DENIED`; zero mutation                                      |
| Retry/duplicate                  | Duplicate before/after timeout, API/worker restart      | Same receipt and one settlement                                         |
| Concurrent double sell           | Two buyers race for same stock/version                  | At most one commits; no negative inventory                              |
| Projection non-authority         | Mutate/delete/rebuild projection                        | Mutation cannot change authority; rebuild restores canonical read model |

## Command-sequence model

The state-machine arbitrary emits bounded sequences of:

```text
advance, pause, resume, schedule, submit, duplicate, mutate-same-key,
reserve, approve, dispatch, deliver, retry, stale-version, revoke-authority,
inject-failure, restart-worker, rebuild-projection
```

Preconditions ensure both domain-valid and deliberately invalid commands occur.
The reference model tracks only canonical balances, SimTime, WorldVersion,
idempotency identities, scheduled identities, and receipt outcomes. After every
operation it asserts monotonic time/version, non-negative inventory, inventory/
money conservation, exactly-once effects, and canonical replay equality.

Shrunk failures become deterministic example-based regression fixtures in
addition to the retained property.

## Gate B invariant evidence

Gate B cannot pass unless evidence includes:

1. exact toolchain and immutable candidate commit;
2. all example/property/state-machine commands and actual counts;
3. every seed/path/counterexample for any failed run plus fixed rerun;
4. real isolated PostgreSQL concurrency, transaction and crash evidence;
5. RLS/grant negative evidence from non-production Supabase staging;
6. replay and projection rebuild hashes;
7. no skipped/focused/todo protected tests;
8. no production mutation and no V11 implementation.
