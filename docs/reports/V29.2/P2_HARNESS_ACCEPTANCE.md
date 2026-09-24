# V29 long-run replay test harness — scoped P2 acceptance

`OWNER_FAST_TRACK_ACCEPTED` applies to test-only implementation commit
`79ae441` on base `c52ad30`. The owner instructed fast construction and
direct mainline acceptance of suitable lightly checked changes on
2026-09-24. This accepts reusable test infrastructure, **not** V29.2 or
V29.3 verification, economic calibration, Gate B, or production use.

Changed paths are confined to `tests/support`; the harness imports existing
Core contracts but does not change Core, World Worker, API, web, migration,
authorization, persistent data, or the original main site. The local driver
uses synthetic two-country transfers. It produces exact daily ledger values
and fresh fixed-seed hashes, but not real 70-country World cycles.

At `79ae441` the focused new test file passed 6/6, dedicated TypeScript
typecheck, targeted ESLint/Prettier and secret scan passed. Full repository
checks, 70-country 600/1000-day non-idle execution, crisis/maturity/default
injection, real worker/PG replay and independent V29 acceptance are
`NOT_RUN`. `status/progress.json` remains unchanged.
