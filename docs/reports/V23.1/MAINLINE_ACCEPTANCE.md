# V23.1 production-GDP foundation — mainline acceptance

**Date:** 2026-09-23
**Scope:** nonproduction pure-Core calculation preparation

A's immutable candidate `d6968d557b62b1c852331ea2befb10231d05f00a` adds a standalone production-account calculation with a closed source-fact declaration, one row per sector, exact period/country/currency/accounting-version binding, and receipt references. The primary candidate GDP is `Σ(gross output − intermediate consumption) + product taxes − product subsidies`. A supplied `C+I+G+X−M` aggregate is used only to reconcile; disagreement raises an error containing both values and the exact difference, without averaging or overwriting either.

Control Tower's narrow review found no P0 or Major issue within this preparation-only scope. The replay assertion recomputes the full proof from the supplied facts. Source kinds exclude transfers, mere approvals and commissioning from production; however this pure module cannot independently authenticate the caller's receipt references or prove that a period is complete in the authoritative ledger. Those checks remain required at the future read/settlement boundary. The module does not write a GDP field or expose a second authoritative value.

The candidate merged without conflict with mainline `5d40aa0037634cc2212ef98c709b4fc7a773f79e`. Pinned Node 24.20.0 / pnpm 12.3.4 checks passed on the combined tree: V22.1/V22.2/V23.1 focused tests (3 files, 24 tests), full workspace typecheck, Core build, repository lint/format, three architecture test files (34 tests), boundary and authoritative-pattern scans, foundation policy, secret scan, and diff check.

V23.1's formal hard dependencies, relevant ADR decisions, authoritative receipts and World State integration are not closed. This accepts `PREPARATION_ONLY` code, not V23.1 product `VERIFIED`, Gate approval or production release; no status/Gate file is changed.
