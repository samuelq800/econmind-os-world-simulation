# World Core Attack Matrix

## Rules

Every attack must assert the API/worker result, error code, database delta,
event/posting delta, WorldVersion delta, receipt behavior, projection behavior,
and recovery/replay result. “Request failed” alone is insufficient evidence.
All protected failures are fail-closed.

| ID     | Attack                                      | Injection                                                                 | Expected canonical result                                                                           | Required evidence                                   | Gate severity if violated |
| ------ | ------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------- |
| WC-A01 | Exact duplicate command                     | Same command ID, key and fingerprint before/after completion              | Return stored acknowledgement/receipt; one execution; no second events/postings/version             | concurrent and sequential DB assertions             | BLOCKER                   |
| WC-A02 | Same key, different payload                 | Change any authoritative intent field                                     | `IDEMPOTENCY_CONFLICT`; zero authoritative mutation                                                 | fingerprint diff and unchanged watermark            | BLOCKER                   |
| WC-A03 | Same command ID, different key/payload      | Reuse command identity                                                    | conflict; zero mutation                                                                             | unique constraint/service error and unchanged state | BLOCKER                   |
| WC-A04 | Insufficient inventory                      | Quantity greater than AVAILABLE, including concurrent reservations        | `INSUFFICIENT_STOCK`; no negative position; no money movement                                       | before/after all ledgers                            | BLOCKER                   |
| WC-A05 | Insufficient money                          | GCU amount greater than Buyer balance                                     | insufficient-balance reason; no goods movement                                                      | inventory and financial rollback                    | BLOCKER                   |
| WC-A06 | Double sell                                 | Two buyers claim the same stock and expected version                      | At most one full commit; loser stock/version conflict                                               | real concurrent PostgreSQL run                      | BLOCKER                   |
| WC-A07 | Two concurrent buyers, enough stock for one | Barrier-started worker transactions                                       | Deterministic legal winner or database-order winner with invariant-safe loser; never two `N -> N+1` | lock/fence/version trace                            | BLOCKER                   |
| WC-A08 | Retry after timeout                         | Commit succeeds but API response is dropped                               | Retry returns stored receipt; no replay of settlement                                               | receipt identity and posting/event counts           | BLOCKER                   |
| WC-A09 | Wrong expected WorldVersion                 | Stale `N-1` against head `N`                                              | `VERSION_CONFLICT`; no mutation                                                                     | locked-head check                                   | BLOCKER                   |
| WC-A10 | Stale writer                                | Expired lease holder attempts commit after fencing token advances         | `STALE_WRITER`; zero mutation                                                                       | two-process/connection test                         | BLOCKER                   |
| WC-A11 | Worker crash                                | Kill at each planned transaction checkpoint                               | Pre-commit zero state; post-commit full state and durable receipt                                   | process death plus restart reconciliation           | BLOCKER                   |
| WC-A12 | API crash                                   | Kill after durable intake and before response                             | Command remains safely claimable or durably complete; retry stable                                  | restart and duplicate test                          | MAJOR                     |
| WC-A13 | Replay corruption                           | Remove/reorder/duplicate event; mutate payload/hash/version               | Replay stops at offending sequence; never skips                                                     | exact corruption code and sequence                  | BLOCKER                   |
| WC-A14 | Projection deletion/tampering               | Delete or alter read-model rows                                           | Authority unchanged; rebuild produces same canonical projection                                     | pre/post hashes and watermark                       | MAJOR                     |
| WC-A15 | Forged Office                               | Client changes Office or portable legacy role                             | `PERMISSION_DENIED`; zero authoritative mutation                                                    | server membership resolver trace                    | BLOCKER                   |
| WC-A16 | Forged Country                              | User A claims Country B                                                   | `PERMISSION_DENIED`; no cross-country disclosure/write                                              | auth and projection tests                           | BLOCKER                   |
| WC-A17 | Revoked/suspended actor                     | Revoke after intake before worker commit                                  | Current discretionary command rejected under ADR-20; committed facts remain                         | acceptance/execution timing test                    | BLOCKER                   |
| WC-A18 | Missing/stale approval                      | Remove signature or mutate approved version                               | `MISSING_REQUIRED_APPROVAL`; reservation/settlement absent                                          | proposal/version assertions                         | BLOCKER                   |
| WC-A19 | Rejected command                            | Domain/schema/authorization rejection                                     | Stable reason; before=after WorldVersion; no economic event/posting                                 | canonical receipt assertions                        | BLOCKER                   |
| WC-A20 | Malformed Decimal                           | JS number, NaN/Infinity, exponent, whitespace, separator or unit mismatch | deterministic validation error; zero mutation                                                       | API/core/property tests                             | BLOCKER                   |
| WC-A21 | Unbalanced financial batch                  | Omit/change one GCU posting leg                                           | `LEDGER_IMBALANCE`; whole transaction rolls back                                                    | deferred/before-commit constraint test              | BLOCKER                   |
| WC-A22 | Unbalanced inventory batch                  | Omit/change one commodity posting leg or bucket                           | inventory imbalance; whole transaction rolls back                                                   | batch conservation assertion                        | BLOCKER                   |
| WC-A23 | Event mutation/deletion                     | SQL/service attempt against committed event                               | denied; historical bytes/hash unchanged                                                             | grant/trigger/service negative test                 | BLOCKER                   |
| WC-A24 | Outbox redelivery storm                     | Deliver same committed outbox item repeatedly                             | Consumer idempotent; no economic re-execution                                                       | delivery attempts versus economic counts            | MAJOR                     |
| WC-A25 | Clock rollback                              | Negative/stale advancement or older observation                           | reject; SimTime unchanged                                                                           | property and state-transition tests                 | BLOCKER                   |
| WC-A26 | Pause wall-time catch-up                    | Long wall interval while PAUSED                                           | SimTime unchanged; no newly due economic event                                                      | fake adapter and restart test                       | BLOCKER                   |
| WC-A27 | Equal-time ordering race                    | Random insertion/network order for same due/priority set                  | Same canonical scheduled-event sequence                                                             | permutation property                                | BLOCKER                   |
| WC-A28 | Unknown schema/model/registry version       | Replay or submit unsupported version                                      | explicit version error; no best-effort fallback                                                     | version matrix                                      | BLOCKER                   |
| WC-A29 | Browser/direct database mutation            | UI/API tries authoritative table write                                    | grant/RLS/service boundary denies                                                                   | staging role-negative tests                         | BLOCKER                   |
| WC-A30 | Cross-asset/FX leakage                      | LC or unapproved asset supplied to V10 command                            | schema/domain reject; no implicit conversion                                                        | exact asset/unit assertion                          | MAJOR                     |

## Failure-point matrix

Each row below runs `throw`, connection termination, worker process death, then
restart/retry:

| Point                                    | Zero-commit expectation                               | Full-commit expectation                                           |
| ---------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------- |
| after inventory debit                    | No inventory, money, event, receipt, or version delta | Not applicable before commit                                      |
| after inventory credit                   | Same                                                  | Not applicable before commit                                      |
| after financial debit                    | Same                                                  | Not applicable before commit                                      |
| after financial credit                   | Same                                                  | Not applicable before commit                                      |
| after first event append                 | Same                                                  | Not applicable before commit                                      |
| before receipt                           | Same                                                  | Not applicable before commit                                      |
| before version advance                   | Same                                                  | Not applicable before commit                                      |
| immediately before commit                | Same                                                  | Not applicable before commit                                      |
| immediately after commit/before response | Not applicable                                        | All balances/postings/events/receipt/version visible exactly once |

## Gate handling

- Any violated BLOCKER or MAJOR row stops before V11 and requires correction plus
  independent re-review.
- MINOR findings may be backlogged only if the reviewer demonstrates they do
  not threaten the 14 Gate B invariants.
- A test that was not run against the required database/browser/process surface
  remains `NOT_RUN`; a unit-test substitute cannot silently become equivalent
  evidence.
