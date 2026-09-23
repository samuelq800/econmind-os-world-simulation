# V09/V10 composite — nonproduction mainline integration

**Date:** 2026-09-23
**Decision:** `CODE_MERGE_READY_NONPRODUCTION`; Gate B remains `PENDING`.

The fixed V09/V10 code candidate is `57ee0c2753d0fdd55ffca186847da6370f57143b`, based on mainline `f4815cc3d24e4876e9f09858f5536aac560592ef`. It composes the V09 atomic/recovery path and V10 runtime, migrations, API, worker and tests. The candidate did not change `status/progress.json`, the original EconMind main website, the World Web UI/map, or production Supabase. Migration artifacts are repository files only; they were not deployed.

B's independent narrow P0 review of the fixed candidate returned `CODE_MERGE_READY_NONPRODUCTION`, `P0=0`, `MAJOR=0`. The official unmodified `pnpm check` and disposable PostgreSQL V09/V10 workflow passed in Actions run `35861989785` on preceding code SHA `0cdf2ca5b314970f89a298185754d6ea232166d6`. The fixed candidate subsequently inherited the previously reviewed V22 foundation and made only a one-space SQL formatting change plus the corresponding migration manifest hash/source-commit rebinding. The final candidate itself did **not** run that full workflow; its 16 migration artifacts validated, its migration 0009 SHA matched its manifest, and its diff check passed.

After E's read-only API preparation and F's scoped cache preparation advanced main to `0d9b8151c93761558c505b5af845fdc776cbc429`, the combined tree merged without conflict. On that combined tree, pinned Node 24.20.0 / pnpm 12.3.4 workspace typecheck and build, five focused cross-surface test files (27 tests), migration validation (16 artifacts), three architecture test files (34 tests), boundary/authoritative-pattern scans, secret scan, and diff checks passed. This integration also removes a Markdown hard-break whitespace issue in F's earlier acceptance note; no F runtime behavior changes.

This decision authorizes a nonproduction code merge, **not** Gate B acceptance or production rollout. The whole-candidate 14-property/state-machine/attack evidence campaign is not yet bound to the final SHA; historical dedicated staging `CRASH_CONNECTION_LOSS` remains a TLS failure, and two-country/two-Office browser E2E remains `NOT_RUN`. A final independent Gate B evidence decision is still required. None of these gaps is represented as a passing test or waiver.
