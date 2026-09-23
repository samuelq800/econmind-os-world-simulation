# V25.1 map and office preview mainline acceptance

**Date:** 2026-09-23
**Status:** `NONAUTHORITATIVE_PREVIEW_INTEGRATED`

The project owner's Control Tower direction authorizes verified, low-risk
nonproduction work to be merged to `main`. This integration starts from main
`4d13c52148770b2922e96587a5b37bbf66693111` and incorporates D's
fixture office and map candidate
`69f5681e5436424c571b6fce2f02a69bf52d40e5`. It preserves work already
built in the D and F branches, including the six-office command previews,
fictional atlas, and map/table fallback.

Local integration checks with pinned Node 24.20.0 and pnpm 12.3.4 passed:
World web typecheck and production build, 13 world-web test files / 61 tests,
repository lint and formatting, boundary and authoritative-pattern checks,
repository secret check, and Git diff check. The final formatting pass changed
only whitespace and layout in the large office CSS, its navigation component,
and the V20 acceptance Markdown.

The entry remains a local-fixture preview. It does not submit an authoritative
command, connect to World Core or Supabase, or establish V25 product acceptance
or Gate B evidence. The included Pages workflow triggers on D's preview branch
or manual dispatch, not on a push to main. No status/Gate file or original
EconMind main-site file changes in this integration.
