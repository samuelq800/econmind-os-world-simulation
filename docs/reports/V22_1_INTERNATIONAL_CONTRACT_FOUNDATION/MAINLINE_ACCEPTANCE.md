# V22.1 contract foundation — mainline integration acceptance

**Date:** 2026-09-23  
**Scope:** reviewed, nonproduction pure-Core foundation only

The Control Tower reviewed C's frozen candidate `e818d4c701461f16a862e2f9bd59cb9ba3e4b445` against mainline `468dbdbb18ba567bef349be059a7c9f4976c399d`. The six changed paths are limited to the contract kernel, its Core export and focused test, plus plan/evidence documents. The merge was conflict-free. No main-site, database, Supabase, status/Gate, route or deployment path changed.

The narrow code review found no P0 or Major defect within this nonauthoritative foundation boundary. It checked exact 23-type catalog validation, immutable consecutive versions, invalidation of approvals on a new version, exact-version approval decisions, explicit lifecycle edges, and replay fact binding. The caller-supplied commercial acceptance and lifecycle reason references are **not** verified against authoritative facts by this module. The replay hash binds supplied inputs and output; it is not an independent semantic recomputation or durable idempotency guarantee. Future authoritative integration must validate those references and enforce authorization, persistence and effects.

Pinned Node 24.20.0 / pnpm 12.3.4 checks passed: four focused V20–V22 test files (25 tests), workspace typecheck, Core build, targeted ESLint and Prettier, three architecture test files (34 tests), authoritative-pattern and boundary scans, foundation policy, repository secret scan, and diff check. The full repository `pnpm check`, live PostgreSQL and production tests were not run for this narrow merge.

Integration acceptance does **not** mark V22.1 product `VERIFIED`, V21.3 authoritative integration, ADR-10 approval, V22.2/V22.3 subtype execution, Gate B, or production readiness. The kernel continues to report `FOUNDATION_IMPLEMENTED_UNVERIFIED` until those separate dependencies and evidence exist.
