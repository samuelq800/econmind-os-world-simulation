# V26.2 scoped cache preparation — mainline acceptance

**Date:** 2026-09-23
**Scope:** nonproduction browser preparation only

F's frozen candidate `73b4e4b69127549fd80ed6e1c7cafe315e047ee4` was reviewed against mainline `593e4c45828a8a9adc7145f7110cf5eee2245501`. The five candidate paths contain only a standalone derived cache/reconnect helper, focused tests, and preparation documents. It does not import the worker, connect a live channel, persist IndexedDB data, submit commands, or change the existing UI/map pages.

Control Tower review tightened one fail-closed boundary: an invalid new authorization binding now clears the previous identity, cache and watermark instead of retaining stale presentation data. A regression test covers this case. The helper still reports `UNAVAILABLE_NO_LIVE_CHANNEL` and does not claim a live subscription or authoritative read.

Pinned Node 24.20.0 / pnpm 12.3.4 checks passed after composition with E's read-only API preparation: two focused web test files (14 tests), world-web typecheck and build, targeted ESLint/Prettier, three architecture test files (34 tests), boundary and authoritative-pattern scans, and diff checks. No live-channel, browser E2E, database, Supabase, or production test was run.

This accepts only a reusable preparation component. It does not mark V26.2 product `VERIFIED`, satisfy its hard dependencies, change `status/progress.json`, or close Gate B.
