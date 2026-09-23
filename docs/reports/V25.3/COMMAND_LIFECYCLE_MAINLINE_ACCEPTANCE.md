# Command lifecycle UI — mainline preparation acceptance

**Date:** 2026-09-23
**Candidate:** D `96911d19278c2e7ed1dacc7d8bd9f422e701d364`.

This passive UI slice adds a reusable command lifecycle status presentation to existing G01/G02 Office event routes. It distinguishes unavailable, approval required, pending approval, submitted but awaiting final receipt, final success/rejection, version conflict and authorization revocation. Mounted states are visibly marked `LOCAL_FIXTURE`/not actual; a submission is not displayed as settled and a fixture receipt is not represented as an authoritative one. It reuses the existing Office/map interface rather than creating a competing page.

The candidate combined without conflict with `origin/main` `d5da894`. On the combined tree, pinned Node 24.20.0/pnpm 12.3.4 full workspace typecheck/Core build, three focused world-web files (15 tests) and staged diff check passed. D separately reported 17 world-web files/88 tests, web build, targeted lint/format and browser smoke on desktop/narrow layouts with no logged errors. Screenshots remain in `docs/ui-evidence/`.

This is `PREPARATION_ONLY`: it has no authorized Command client or durable receipt reconciliation. V25 product dependencies, Gate B real browser E2E, production and deployment remain open. No original EconMind main-site, Core, API, schema, migration or Gate/status file was changed.
