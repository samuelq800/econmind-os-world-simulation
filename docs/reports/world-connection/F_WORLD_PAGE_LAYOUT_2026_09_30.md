# F window — country-home page layout record (2026-09-30)

Status: `IMPLEMENTED_UNVERIFIED` pending independent review and any publication decision. This is a non-authoritative page-layout candidate, not World State, API, data, or production activation evidence.

## Identity and boundary

- Repository: `econmind-os-world-simulation` only.
- Independent branch/worktree: `codex/f-world-page-layout`, `.econmind-worktrees/f-world-page-layout`.
- Immutable baseline: `a5cc630aa0fbf9706d4546aeb838035a962ce9c1` (`origin/main` at creation).
- Changed page files: `apps/world-web/public/season1-immersive/country-game.js` and new `apps/world-web/public/country-home-layout.css`.
- Regression guard: `tests/world-web/country-home-layout.test.ts`.
- The selected UI source under `role-prototypes/season1-immersive` and its hash-locked published CSS remain unchanged. The existing derived `country-game.js` loads a page-only CSS overlay. No original EconMind website, Core, Worker, API, database, migration, official opening data, or status/progress file was changed.

## Reproduction and correction

At 1280×720 on the deployed page before the patch, the document scroll height and client height were both 720px, a wheel event left `scrollY=0`, and the square country scene used `background-size: cover`, cropping its vertical extent. The candidate retains the complete scene with `contain`, aligns facility pins to its contained square, and lets the desktop stage grow to at least 930px so the document can scroll.

Local production-build preview: `http://127.0.0.1:4174/season1-immersive/?role=finance&country=01#country` (available only while the local preview process runs).

Browser measurements on the final build:

| Viewport | Document scroll/client height | Scene                       | Site pins     | Interaction                                                                  |
| -------- | ----------------------------- | --------------------------- | ------------- | ---------------------------------------------------------------------------- |
| 1280×720 | 930/720px                     | `contain`, 1280×930px stage | 16/16 visible | One wheel event moved `scrollY` to 210px.                                    |
| 1440×900 | 930/900px                     | `contain`                   | 16/16 visible | Bottom remains reachable.                                                    |
| 390×844  | 1220/844px; width 390/390px   | `contain`                   | 16/16 visible | Page scrolled to 376px; bottom cards became visible; no horizontal overflow. |

The local-sites drawer opened at 1280×720 with 529px client height and 1333px scroll height; a wheel event inside it moved its own `scrollTop` to 720px. The source-intel drawer opened and focused Close, but the local preview had no API connection, so its source data read was not verified. A separate `country=02` load rendered Brelis, 17 site records, and its country-specific scene; 16 pins met the existing on-stage visibility threshold at the narrow viewport. Homepage map drag/zoom is not implemented by this page and was not added in this layout fix; the separate atlas was not changed.

## Checks

Pinned toolchain: Node 24.20.0 and pnpm 12.3.4. The following passed on this branch:

- `pnpm exec vitest run tests/world-web/country-home-layout.test.ts tests/world-web/official-full-data-page-read.test.ts`: 2 files, 8 tests.
- `pnpm exec eslint tests/world-web/country-home-layout.test.ts`.
- `pnpm exec prettier --check tests/world-web/country-home-layout.test.ts apps/world-web/public/country-home-layout.css`.
- `node --check apps/world-web/public/season1-immersive/country-game.js`.
- `pnpm --filter @econmind/world-web typecheck`.
- `pnpm --filter @econmind/world-web build`; existing large-chunk warning, build exit 0.
- `pnpm test:authoritative-ui`: selected 70-country source check and publication hash check passed; economic runtime connection remains false.
- `git diff --check`.

Not run: unrelated full repository test suite, real-device touch gesture, production deployment/readback, and independent review. A local preview is not a published release.
