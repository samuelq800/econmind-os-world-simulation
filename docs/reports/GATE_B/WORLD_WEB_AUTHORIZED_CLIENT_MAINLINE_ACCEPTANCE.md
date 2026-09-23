# Authorized browser client — nonproduction mainline acceptance

**Date:** 2026-09-23
**Candidate:** F `0f1b4330f15c2e4917b775887a2e6048a5b405e6` (fixed code `bce00b7024d6d1719c88214b5cea7edae58f15c3`).

B found two successive local Major defects in earlier candidates, both closed at this immutable tip. First, a POST that might have committed but returned a truncated or invalid final body must be `UNKNOWN` with reconciliation required, not `UNAVAILABLE`. Second, the first POST now reserves the complete identity, draft and request ID before asynchronous dispatch, so another command cannot race ahead while its receipt is pending. Only a verified final receipt or deterministic non-submission rejection releases the in-flight guard. B's final narrow conclusion was P0=0, Major=0 for **unimported nonproduction preparation**.

The candidate combined without conflict with `origin/main` `fd7bc40`. On the combined tree, pinned Node 24.20.0/pnpm 12.3.4 full workspace typecheck/Core build, authorized client and scoped-cache focused tests (2 files, 19 tests) and staged diff check passed. F and B separately recorded lint/format, build and boundary/pattern checks.

The client is not mounted in the UI and has not made a real E-bridge browser request. E's local bridge lacks cross-port OPTIONS/CORS, server-side expected-WorldVersion fencing and separate receipt lookup; this client's pending guard is memory-only and refresh persistence is not verified. Mock receipts do not prove durability. This accepts `PREPARATION_ONLY_NOT_BROWSER_INTEGRATED`, not Gate B browser E2E, product approval or production access. No original EconMind main-site, database, migration, status/Gate or production Supabase file was changed.
