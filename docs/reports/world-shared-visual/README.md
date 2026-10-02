# Shared EconMind OS visual adaptation

Status: IMPLEMENTED_UNVERIFIED. P3 paint/typography-only candidate; root window review and merge remain pending.

World base: `4b5937a980f2358fc7ed1e4ccded512bdc5bbfce`.
Source: `samuelq800/econmind-os` at `7b4db3b8cbdb1db86288a1172896ac9bb8febaa4`.
`SOURCE.json` records both CSS blobs, layout import evidence, SHA-256 hashes and extraction ranges. The three decoded sources were checked against their Git blob identities. The original main-site checkout was not modified.

Only one shared runtime stylesheet is added. The root atlas and Season 1 entry mount it with relative links that retain the GitHub Pages subpath. Existing map artwork, country selection, map return, six role views, source drawer and the 120 module catalog entries remain. World topbar controls contain required navigation, so no directory bar is hidden. National controls retain the existing Georgia typography and source light surface contract; dark panels, mint actions, warm gold labels, borders, shadows and focus use the pinned OS palette. No map dimensions, camera, clipping, scroll declarations, data or economic behavior are changed.

## Validation

Toolchain: Node 24.20.0 / pnpm 12.3.4; `pnpm install --frozen-lockfile` passed.

- `GITHUB_ACTIONS=true pnpm --filter @econmind/world-web build`: PASS, including TypeScript, Vite and 140 copied map assets. Final public CSS is byte-identical in dist. Vite retains the relative public stylesheet for runtime resolution; both mounted URLs returned 200 in the built preview. Existing large-chunk warning remains.
- `pnpm exec vitest run tests/world-web/shared-visual-contract.test.ts tests/world-web/world-public-preview.test.ts tests/world-web/country-home-layout.test.ts`: PASS, 3 files / 13 tests. Covers relative entry links, Pages prefix, scoped paint-only declarations, existing map gateway and scrolling/layout guardrails.
- Focused ESLint and Prettier: PASS. Public stylesheet formatted with `--ignore-path /dev/null`; the delivered Season 1 HTML bytes are otherwise preserved.
- `node scripts/check-boundaries.mjs`: PASS, 225 files. First attempt lacked generated core/worker export files; building those packages resolved the imports without source edits.
- `ECONMIND_ENV=local node scripts/assert-safe-environment.mjs`: PASS; database absent, linked Supabase absent, mutation disallowed. First invocation omitted the required environment and failed closed.
- `node scripts/check-authoritative-patterns.mjs`: PASS, 220 files.
- `node scripts/check-repository-secrets.mjs`: PASS, 1858 files at time of check.
- `python3 tools/validate_r2_governance.py --json`: PASS, read-only governance validation. No progress/approval record was changed.

`BROWSER_CHECK.json` records the built Pages-prefix preview at 1440×900 and 390×844. All six country-role views loaded, all stylesheet requests returned 200, country/source controls remained reachable, keyboard focus was visible, mobile document scrolling worked, and sampled geometry/scroll metrics were identical with the adaptation enabled and disabled. Module drawer button counts preserve the 120 modules (9/20/15/23/28/25 plus each drawer close button). Both atlas viewport dimensions remained identical and keyboard/wheel zoom plus country-directory scrolling worked. No page errors occurred.

The official bridge blocks module execution while disconnected. One module gateway per role was exercised and retained that guard; interior module execution/rendering and live API/settlement are NOT_VERIFIED. No backend, permission or production activation is claimed.

Two representative screenshots were visually inspected: `desktop-finance.png` and `mobile-trade.png`.

## Reproduce the narrow browser check

Start a Pages-prefix preview on port 4197 after building. Supply the installed Playwright module when it is not available in Node's normal package resolution:

```sh
GITHUB_ACTIONS=true WORLD_WEB_PORT=4197 pnpm exec vite preview --config apps/world-web/vite.config.ts
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node docs/reports/world-shared-visual/check-browser.mjs
```

The checker uses a fresh browser context per viewport, does not submit economic actions and overwrites only this report's browser evidence and screenshots. `VISUAL_PREVIEW_URL` can override the local base URL.
