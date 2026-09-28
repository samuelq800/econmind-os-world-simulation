# Owner-selected World V2 page UI publication review

Status: `STATIC_UI_REVIEW_PASS`, pending exact-commit CI and Pages deployment.
This review does not approve Gate B or assert live economic integration.

## Identity and scope

- Owner-selected UI: `ECONMIND_S1_AUTHORITATIVE_UI_20260928T134420Z`.
- Complete source archive SHA-256: `d436904dc061b6f909c8b5c180104f82299e987f6e89732f9b82dc9a40e3db71`.
- The archive's 860 payload files (678,539,703 uncompressed bytes) were checked
  individually against the delivered manifest; three extra archive entries are
  the handoff README and metadata, not payload mismatches.
- The deployed runtime subset verifies 364 source files against that manifest,
  including all 70 country page/data pairs. The 140 scene/detail map files are
  byte-identical to existing World V2 assets and are copied into the Pages
  artifact at build time; duplicate binaries are not committed.
- The original EconMind main-site checkout, Supabase schemas, auth, storage,
  Worker, Core and World State are untouched by this publication.

## Review evidence

- Full pinned Node 24.20.0/pnpm 12.3.4 `pnpm check`: PASS; 1,261 tests passed,
  77 skipped; 34 architecture tests passed. Lint, formatting, typecheck,
  environment, migrations, foundation policy, secrets, source data, UI
  publication and builds all passed.
- The static World web artifact built successfully with 140 reused map assets.
  Its local size is approximately 652 MB. Vite warned about large existing map
  chunks; this was a performance warning, not a build failure.
- Browser QA on the built artifact: the site root reached the Avenor Finance
  Minister country-map entry; the 70-country atlas listed 70 entries; the Rhea
  Trade Minister entry loaded; no browser error was observed in that sample.
- Development-route smoke check: existing scene PNG and detail SVG returned
  `200` with image content types; a missing numbered scene returned `404`.
- The Pages workflow is scoped to this World V2 repository and `main`, with a
  static `apps/world-web/dist` artifact. It does not publish the original
  EconMind main website or run a database mutation.

## Known boundary

The UI's bundled older country preview sums to 14,714,012,813 people, while
the separately selected official World V2 source dataset sums to
14,712,146,434 (difference 1,866,379). The UI labels planning and settlement
as local/not connected. Its country numbers must not be represented as the
official economic state. A later reviewed data adapter is required to bind
the official 70-country dataset, and authoritative login, commands, receipts
and settlement are still separate work.
