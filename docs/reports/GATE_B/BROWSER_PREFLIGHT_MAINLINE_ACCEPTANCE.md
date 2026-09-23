# Browser preflight harness — mainline preparation acceptance

**Date:** 2026-09-23
**Scope:** local nonproduction preview smoke, not Gate B browser E2E

F's frozen candidate `fca302b1828c07e0f9cffd7e21b36c55876c342b` adds only a bounded loopback Chrome preflight script, four-scenario `NOT_RUN` manifest, and preparation evidence. The script uses temporary browser profiles, sanitizes child environments, checks the preview's non-authoritative banner, and removes only its own temporary directory. It has no production URL or credential path. It merged cleanly with mainline `751e06b896741fc69c438f5603fa770972d3d5de`, which already includes the V25.2 event-to-Office fixture UI.

On the combined tree, pinned Node 24.20.0 / pnpm 12.3.4 world-web build, script syntax, targeted ESLint/Prettier and diff check passed. Actual local headless Chrome 154 rendered the landing and command previews and returned `previewSmoke=PASS`; both pages identified themselves as mock/non-authoritative. The four real two-country/two-Office authorization, server projection, command/receipt, and disconnect/recovery browser scenarios remain `NOT_RUN` because the required authenticated browser/API/command channel is not yet wired.

This is a reusable test harness only. It does not close V10.4, V25.2, Gate B, or any production acceptance requirement, and no status/Gate file is changed.
