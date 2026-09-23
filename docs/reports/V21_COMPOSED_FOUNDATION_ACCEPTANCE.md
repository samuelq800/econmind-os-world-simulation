# V21 composed foundation review and owner acceptance

**Date:** 2026-09-23
**Status:** `FOUNDATION_REVIEWED_NONPRODUCTION`

The owner authorized verified, low-risk construction candidates to proceed
to `main`. This acceptance covers only the pure-Core V21.1 order book,
V21.2 tariff/customs, and V21.3 logistics calculation foundations. It uses
the accepted V20 mainline plus the already integrated fixture UI/map branch.

The A and E candidates were composed on one branch. Control Tower review
found a snapshot-expiry gap, runtime and customs binding gaps, and three
additional Major issues in bilateral export controls, snapshot time bounds,
and replay output binding. Fixes and adverse cases are recorded in the
composed candidate and two remediation notes. An independent narrow closure
review of code tip `fb5926ac14f9623d6cdf1094adecfcaf6e36c871` found
`P0=0`, `MAJOR=0` for the three previously open Major findings.

Pinned Node 24.20.0 / pnpm 12.3.4 local checks passed: V20+V21 focused tests
3 files / 18 tests, full workspace typecheck, Core build, repository lint and
format, 34 architecture boundary tests plus boundary/pattern scans,
foundation policy, secrets, and diff check. The independent reviewer did not
run tests because its ambient Node/pnpm did not match the pinned versions.

This acceptance provides a nonproduction calculation foundation. V10.4
integration, durable order/reservation uniqueness, authoritative customs or
inventory posting, Command/Event/receipt, database/RLS, production, product
`VERIFIED` status, and Gate B approval remain separate work.
