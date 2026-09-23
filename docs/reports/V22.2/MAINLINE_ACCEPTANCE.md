# V22.2 executor A foundation — mainline acceptance

**Date:** 2026-09-23
**Scope:** reviewed nonproduction pure-Core preparation

A's fixed candidate `8490635605b015e1afff8c095824aabd6102c7e0` adds isolated calculation and tests for commodity supply, FDI, sovereign loan, infrastructure finance and resource-development agreements. Each candidate calculation produces exact paired numeric transitions and source-fact references; it does not post to World State, create a Command/Event/receipt, or choose an unapproved economic model.

B's independent narrow review found one Major in the earlier `f1d5813` candidate: the replay assertion accepted a re-authored economic output when its public hash was recomputed. A fixed the verifier to recompute the kind-specific result from the same bound facts and compare the entire proof. B's closure review of `8490635` returned `MAJOR-1=CLOSED`, `P0=0`, `MAJOR=0`; the new regression rejects changed buyer cash even with a recomputed hash.

The fixed candidate merged without conflict with mainline `ce3510eccd68fbb9252176ddd18c642287bec3f1`. Pinned Node 24.20.0 / pnpm 12.3.4 checks on the composed tree passed: V22.1/V22.2 focused tests (2 files, 16 tests), full workspace typecheck, Core build, repository lint/format, three architecture test files (34 tests), boundary and authoritative-pattern scans, foundation policy, secret scan, and diff check.

This is not V22.2 product `VERIFIED`: V21.3 and authoritative V10.4 integration, ADR-10, posting/settlement, package Gate, live E2E and production remain open. The kernel stays `FOUNDATION_IMPLEMENTED_UNVERIFIED`; no status/Gate file or production system is changed by this acceptance.
