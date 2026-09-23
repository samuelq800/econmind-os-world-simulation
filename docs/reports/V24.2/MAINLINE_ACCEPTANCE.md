# V24.2 crisis cause-layer — mainline preparation acceptance

**Date:** 2026-09-23
**Candidate:** A `d75cf5e74ef050f00855e087afb0c69c0537e6ca` (fixed code `e55ad9f4ca47fd22c595ae678405f7390b760201`).

B found and independently closed two Major defects in earlier candidate tips. Causes against the same owner/object/field now form an exact before→delta→after chain, rejecting a pair of −7 withdrawals that each incorrectly reused a starting stock of 10. Their order is a locale-independent ASCII/codepoint total order, so mixed-case fact references produce the same valid result and replay under different process locales. B's final narrow conclusion was P0=0, Major=0 for pure-Core nonproduction preparation.

The candidate combined without conflict with `origin/main` `84b3dc9`. On the combined tree, pinned Node 24.20.0/pnpm 12.3.4 full workspace typecheck/Core build, V24.1/V24.2 focused tests (2 files, 18 tests) and staged diff check passed. B separately ran the V24.2 focused suite under English and Turkish locales; A recorded targeted lint/format and boundary/pattern checks.

This module returns candidate crisis actions and cause events only. It does not execute an Event Kernel, move the simulation clock, write economic state or directly set GDP, inflation or score. Authorization/approval attestations and owner validations still require real server-side sources. Formal V24.1/V24.2 product dependencies remain open; this is `PREPARATION_ONLY`, not Gate approval or production release. No original EconMind main-site, API/web, database, migration or status/Gate file was changed.
