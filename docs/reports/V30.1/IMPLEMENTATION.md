# V30.1 load harness preparation

Status: `PREPARATION_ONLY_NOT_V30_ACCEPTANCE`. The formal V30.1 prerequisites
remain `PLANNED`; no 50/100/420-session load was executed.

`tools/v30/load-harness-preparation.ts` now streams a deterministic virtual
operation plan for the three named session tiers. It keeps session actions
(projection reads, orders, contracts, receipt polls and local forecast work)
separate from world-level due-obligation ticks. The caller must supply all
frequencies explicitly; the code does not assert an unmeasured production
operation mix. A latency summarizer computes nearest-rank P50/P95/P99 for
caller-supplied observations, labels zero samples `NOT_RUN`, preserves failure
counts, and **never** emits PASS. It does not open a socket, execute a command,
write a database, advance SimTime or mutate World State.

Focused V30.1 tests passed 6/6 on this P2-only mainline candidate. Targeted
ESLint, Prettier, TypeScript strict check for the V30 tool/test, Core build,
34 architecture-boundary tests and scanners, secrets check, and local
environment check passed. Full repository check, real sessions, P50/P95/P99
on an approved target, resource measurements, V29 long run, staging RLS/TLS,
independent P0 review and Gate B/V30 acceptance remain `NOT_RUN`.

The separate V28.1 Core candidate is **not included in this P2-only branch**
and must not be merged or activated before its Constitution R002/ADR-14 reconciliation,
hard-dependency closure and independent review. Original EconMind main-site
files and production Supabase were untouched.
