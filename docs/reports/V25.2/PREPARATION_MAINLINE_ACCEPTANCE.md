# V25.2 event-to-Office preparation — mainline acceptance

**Date:** 2026-09-23
**Scope:** fixture-backed, non-authoritative browser preparation

D's candidate `2be832e472203725d02e0a1dc55c1a5fe9d90e73` extends the existing V25.1 map and six-Office UI. It adds an event-specific owner route and local G01 rehearsal entrance only when the viewer is bound to that Office and the fixture projection is current. Other-Office, approval-required, blocked, missing route, stale/offline, and missing-authorization paths display an unavailable reason. The typed adapter exposes no live command port; `submitCommand` returns `NO_AUTHORIZED_COMMAND_PORT` and performs no write.

Control Tower review found no direct Core/worker import, backend fetch, Supabase access, authoritative mutation, or main-site change. The candidate merged cleanly with current mainline. Pinned Node 24.20.0 / pnpm 12.3.4 checks passed on the combined tree: 16 world-web test files (79 tests), world-web typecheck and build, repository ESLint/Prettier, and three architecture files (34 tests) plus authoritative-pattern and boundary scans. The first boundary run failed only because the fresh worktree had not yet built the workspace Core package; after Core build, the unchanged boundary test passed. The failed initial run is not represented as a passing run.

The UI is still a local fixture and remains `PREPARATION_ONLY_NOT_V25_2_STARTED`. Approved Command→approval→ledger/event→read-model wiring, authorized backend responses, browser E2E, product status, Gate B and production release remain separate work.
