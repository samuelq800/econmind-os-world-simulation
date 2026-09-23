# V20 foundation review and owner acceptance

**Status:** `FOUNDATION_REVIEWED_NONPRODUCTION`
**Date:** 2026-09-23
**Authority:** project owner direction in the Control Tower task on
2026-09-23, authorizing verified changes to be accepted and published to `main`.

## Immutable chain

| Record                                 | SHA                                        |
| -------------------------------------- | ------------------------------------------ |
| `main` baseline                        | `ec5ceb2ef8434fc3f6c40c8c62b0311a3676a24d` |
| V20 code with runtime direction repair | `d9e6774c09f528a26c17cf289b741be13e830451` |
| V20 evidence tip                       | `c91744a6d02865829b82df2088025949de99d88d` |

B's focused review of the initial V20 candidate found one Major: unknown FX and
external-debt directions could fall through to valid branches. The code tip
above rejects both unknown directions before amount, currency, or arithmetic
processing. B's subsequent Major-only closure review reported `P0=0`,
`MAJOR=0`, and `MAJOR_RUNTIME_DIRECTION_FAIL_OPEN=CLOSED`. The candidate
evidence records five focused tests, Core build/typecheck, affected-path
lint/format, boundary, authoritative-pattern, environment, secrets, and
foundation-policy checks. The official full repository `pnpm check` was not
recorded for this candidate.

The owner accepts the reviewed pure-Core candidate for nonproduction mainline
foundation integration. This acceptance does not mark V20.1–V20.3 `VERIFIED`,
satisfy their hard dependencies, approve Gate B, or attest product behavior.

The candidate contains no database, RLS, migration, API, worker, UI, Command,
Event, durable ledger, transaction, deployment, or production mutation. It
selects no policy rate, spread, capital-control rule, intervention amount,
rounding decision, or macro formula. Those decisions and the authoritative
writer remain outside this foundation package.
