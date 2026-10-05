# Shared official-source read deadline candidate

Status: `IN_PROGRESS` — code candidate, not independent acceptance or publication.
Base: `a6951f298096ed055d76165f01fa283d246afaa7`.
Owner: E; C's country-game/runtime entrypoints are unchanged.

The single shared `boundedRead` deadline in
`apps/world-web/public/season1-immersive/country-context.js` changes from
5,000 ms to 15,000 ms. It covers both GET and complete JSON body consumption;
there is no retry or separate body deadline. External retirement still aborts
immediately. URL restrictions, request options, generation checks, provenance,
exact decimal strings, hashes, 512 KiB cap and fail-closed validation are unchanged.
No CSS, Edge/API, selected JSON, credentials, database or workflow edits.

Six fake-timer regressions exercise response headers and body independently:
valid six-second catalogue acceptance, still-pending at 14,999 ms followed by
timeout at 15,000 ms, and external retirement at 100 ms. Timed-out or retired
reads abort, clear their deadline and cannot install a late catalogue or enable
a dataset read. All scenarios assert one GET only.

Local verification uses Node 24.20.0 / pnpm 12.3.4 and the frozen lockfile:

- Ten focused official page/source/provenance files: 194 tests passed, including
  the six new regressions. The two directly affected loader suites: 32 passed.
- Changed-test ESLint, loader `node --check`, and the existing focused explorer
  TypeScript check passed.
- Non-connected World web typecheck/build passed; generated source connection
  is `NOT_CONFIGURED`, not live connectivity evidence. Existing asset/chunk
  warnings do not establish a loader regression.

Existing boundaries, safe environment, secret scan and selected-UI consistency
checks plus actual candidate CI are recorded separately at handoff. No full
database suite or live source request is claimed from these local checks.

The frontend five-second deadline is evidenced in the base code. The reported
D13 Captain request aborted at 5.026914 seconds; F28 industry showed a similar
no-response/`ERR_ABORTED` observation. Server/network slowdown cause remains
`UNKNOWN`. These regressions prove deadline and retirement behavior only, not
a production fix, data availability, economic runtime or Gate B acceptance.

World main changes under `apps/world-web` automatically trigger Pages publication.
This candidate must remain unmerged while the control tower's fixed
`0ec30a28` 420 baseline audit remains active. This document is not deployment,
Supabase mutation, launch or independent-review authorization.
