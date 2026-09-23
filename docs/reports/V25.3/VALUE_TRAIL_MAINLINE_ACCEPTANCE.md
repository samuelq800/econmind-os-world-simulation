# G02 numeric value trail — mainline preparation acceptance

**Date:** 2026-09-23
**Candidate:** D `77423e142414a84e5e326d7194248bbf9a6ffb5d`.

This UI-only slice adds a collapsible numeric trail to the existing G02 map sidebar and signal-table inspector. For the fixed local grain fixture it shows 146,000 tonnes input, −18,000 tonnes recorded reservation and 128,000 tonnes displayed output, with event/version references. The baseline source record and final receipt are visibly missing; the view is labeled `LOCAL_FIXTURE` and does not claim complete causal attribution or an actual World transition. Other, stale, offline or mismatched metrics fail to a missing-evidence state rather than inventing a trail.

The candidate combined without conflict with `origin/main` `44b4a1f`. On the combined tree, pinned Node 24.20.0/pnpm 12.3.4 full workspace typecheck/Core build, three related world-web files (15 tests) and staged diff check passed. D separately reported 18 world-web files/93 tests, web build, targeted lint/format, boundary/pattern scans and desktop/narrow browser smoke. Screenshots are retained in `docs/ui-evidence/`.

This remains `PREPARATION_ONLY_NOT_V25_2_OR_V25_3_STARTED`. Authorized source facts, baseline, receipt lineage and real browser E2E are not wired; V25 product dependencies and Gate B remain open. No original EconMind main-site, Core, API, database, migration, status/Gate or production Supabase file was changed.
