# F window — Callum Island and 70-country atlas home

Status: `IMPLEMENTED_UNVERIFIED` (local display candidate; not a World State, production, or Gate B claim).

## Identity and authorization

- Repository: `econmind-os-world-simulation` only. The original EconMind website is untouched.
- Immutable baseline: `a5cc630aa0fbf9706d4546aeb838035a962ce9c1` (`origin/main` at branch creation).
- Branch: `codex/f-callum-atlas-home`.
- Owner explicitly confirmed that `/` should open the map rather than the existing Season 1 page. The selected Season 1 role UI remains at its own URL and is linked as “国家操作”; its source and UI-selection status are unchanged.

## Display change

- The largest `ISLAND` polygon in the prepared `FICTIONAL_ATLAS` model is named **Callum Island**. Its stable landmass ID is retained.
- The layered atlas and the 70-country explorer both show the name. This is a display/model naming change, not a new country or authoritative territory update.
- The root page mounts the explorer. Its overview clips each of the 70 existing georeferenced country-detail SVGs to its matching national land partition and composites them over the existing satellite terrain. Country selection continues to open its existing detailed scene and facility markers.
- On narrow screens, the opening camera zooms toward the central geography; the same map can be panned and zoomed. The 70 small overview number pins are suppressed at that width to keep the cartography legible.
- The explorer describes these layers as scenario cartography, not live World State. No opening-state values, production data, migrations, settlement logic, or authority records were changed.

## Evidence and limits

- Focused automated tests assert that Callum Island is the largest prepared island polygon, and that the 70 country-detail entries uniquely match the 70 display partitions with valid frames.
- Focused web tests, typecheck, build, publication verifier, formatting, lint, and diff checks were run for this candidate. The build emits the existing large-chunk advisory; it is not a build failure.
- Local browser checks covered root entry, 70 mounted mosaic tiles, country drill-down/return, Callum label, and the Season 1 navigation link. Preview: `http://127.0.0.1:4175/` while the local server is running.
- This composition reuses existing artwork. It does **not** independently establish surveyed distances, physical geography, the exact raster silhouette area of Callum Island, production activation, or approval of the home-page authority change. The prepared polygon and visual asset are separate planning/display layers; a surveyed spatial join remains future work.
- The complete 70-SVG overview is a large first-load asset set and still needs performance profiling before a production release.

No unrelated full-suite, production Supabase, migration, or high-pressure network run was performed.

## Four-continent detail follow-up

- Owner direction: reuse the four existing continent illustrations and keep the geographic map's elements, especially the 70 country borders. No new AI image was generated and no source illustration or geographic dataset was rewritten.
- The four 1536 × 1024 PNG scenes are projected into the world overview only inside the corresponding existing land-partition country paths. A display-only color filter removes deep-blue sea pixels from those illustrations, preventing their independent coastlines from creating false inland water. The 70 country-detail SVG tiles remain mounted above them; original coastlines, political paths, river/lake paths, and mountain traces remain in their existing world coordinates. A “大陆精绘” control can switch the art overlay off to inspect the underlying geography.
- A “聚焦大陆” selector fits each scene close to its native display resolution without leaving the world explorer; the 70 country borders and physical paths remain visible during that zoom. Browser inspection counted four art images, 70 country-detail SVG tiles, 70 political paths, 71 river/lake paths, and seven mountain traces in the overview.
- The artwork is still illustrative: cities, factories, ports, and roads painted in the four scenes are not surveyed facility positions. At the full-globe fit, each 1536-pixel scene is reduced on screen; zooming or the original continent explorer preserves more of its native detail. The four paintings are not a seamless geospatial orthoimage, so native-resolution visual fidelity and exact geographic registration are distinct review criteria. The full-globe fit cannot show the same per-continent pixel density as a single-continent screenshot at the same viewport size.

## Release-preparation supplement (evidence-only follow-up, no production activation)

### Owner decision and entrypoint boundary

The owner was asked in this F chat's `request_user_input_async` reply (`call_EWK1ZmSSFBS3u6YhrIrj525V`): “你说的‘首页’，是否要把网站根路径 `/` 从现有 Season 1 页面改为 70 国拼接地图？这会改变当前锁定的唯一正式页面入口。” The recorded answer was: **“是，根路径改为地图（推荐）”**. Subsequent direction was “算了还是用四个大陆的。你注意拼接后尽量保留多的细节。原有地理图的所有元素包括国界线等等都要保留” and “然后尽量多保留细节。越精细越好.” These are owner design decisions, not release approval.

`/` now opens the non-authoritative atlas gateway; the existing Season 1 role UI remains at `/season1-immersive/` (for example, `/?atlas=explorer` links to `/season1-immersive/?role=finance&country=01#country`). No Season 1 role-source file or UI-selection status was changed by this branch. The atlas explicitly says it is not real-time World State. Whether this gateway is acceptable as the public root entry requires the central UI-authority review.

### Asset provenance and rights boundary

This branch reuses, without editing, the four `apps/world-web/src/assets/continent-scenes/*.png` files and 70 `apps/world-web/src/assets/country-detail/*.svg` files already tracked in commit `d55eab3bb66b185e3b7458359590f9d1e1b2340b` (“Add complete World V2 atlas and country candidate packages”). The underlying `asterra-satellite-terrain-v8.png` was already tracked in commit `69f5681e5436424c571b6fce2f02a69bf52d40e5`. Existing project review notes are in `apps/world-web/src/assets/continent-scenes/reviews.json` and `docs/reports/V25.1/COUNTRY_ATLAS_AND_PRESETS_2026-09-28.md`. The user-supplied reference screenshots guided the requested visual direction; this branch does not ship those screenshots.

No explicit upstream licence, model-generation receipt, or public redistribution permission for these tracked artwork assets was found in the cited repository records. **RIGHTS_UNKNOWN**: prior inclusion in Git and owner direction to reuse the files are not, by themselves, an independent licence verification. Resolve/accept this provenance question before claiming public-release rights.

### One-pass local preview liveness and size

On the production build served locally at `http://127.0.0.1:4175/`, a single browser reload with cache disabled at 1280×720 loaded 84 resource entries: all 70 country-detail SVGs, four continent PNGs, the terrain PNG, and nine code/style resources. Browser-reported resource transfer was 23,975,879 bytes total (SVGs 7,786,030; continent PNGs 13,077,685; terrain PNG 2,590,449; other 521,715); decoded resource size was 54,914,521 bytes. DOMContentLoaded was 338 ms, page `load` 437 ms, but the final SVG response ended at 10,056 ms. All `<img>` elements finished with nonzero natural width. This is a local measurement, not a CDN or real-user latency claim. It exposes a material first-load cost even though no hang occurred.

At 390×844, the same built preview mounted the atlas and all 84 initial resources; the final resource response ended at 5,390 ms, and no image failed. A normal zoom changed the SVG viewBox (280 ms automation action), drag-pan changed it again (732 ms), and choosing country 01 from the narrow-screen country directory opened its detail at `?atlas=explorer&country=01` (103 ms). On desktop, zoom, country 03 selection, and drag-pan also responded (319, 183, and 221 ms automation actions respectively). These durations include browser automation overhead and are not rendering-frame benchmarks. The preview tab reported no console warnings or errors. No pressure test or production connection was used.

### Independent PR and CI boundary

At the initial preflight, PR #33 (`codex/f-world-page-layout`, `7a1417b8eb8857a122fee19cc7cfa2f9faabb5fd`) was open. Its file set did not intersect this atlas candidate. It was subsequently reviewed and independently merged to `main` at `d32eb2a232415429ea95975ecbdc7afa159ec8cf`; this branch did not copy or modify its scrolling/full-scene-fit code. The two release tracks remain separate.

At the historical `5fae0d8` atlas head, focused Vitest passed 3 files / 16 tests; pinned Node 24.20.0 + pnpm 12.3.4 passed world-web build (`tsc -b` plus Vite), standalone world-web typecheck, `test:authoritative-ui`, focused ESLint, changed-file Prettier, and `git diff --check`. The build's large-chunk advisory remains. At that time PR #35 had no reported status checks. The existing web Pages workflow runs on `main` pushes or manual dispatch and **deploys**; it was intentionally not dispatched against this candidate. No non-deploy web branch CI was then configured for this PR, so remote branch CI was **NOT_RUN**, not silently treated as passing. Merge-build/Pages URL and independent review remain future release evidence.

### On-demand detail and non-deploy candidate CI follow-up

The full-globe scene previously displayed 70 SVG country tiles at just 16% opacity above the four large continent paintings. At the opening scale their display contribution was subtle while their 7.79 MB transfer and SVG decode cost were material. The follow-up keeps the original four PNGs, terrain, 70 political paths, physical paths and all 70 original SVG files unchanged, but mounts country SVGs only when the view width is at most 650 map units and their territory bounds intersect the viewport (with an 8% pan prefetch margin). On a selected country, the existing original scene/detail behavior is unchanged. Switching **大陆精绘** off explicitly requests the full visible SVG mosaic, preserving the prior art-off layer behavior; this can still incur the large load and is described in the UI as loading on demand. No source art was re-rendered, flattened, or downsampled.

One final normal local build-preview pass at 1280×720 with the browser cache disabled observed 14 first-view resources, four continent images, zero mounted or requested SVG tiles, 16,189,970 transfer bytes, and no failed image. The earlier global pass had 84 resources and 23,975,879 transfer bytes: a reduction of 70 initial requests and 7,785,909 bytes (about 32.5%). The final local resource response ended at 544 ms, but localhost timings varied between passes due to warmed local I/O and must not be treated as a production latency estimate. **聚焦大陆** for the eastern scene retained the four original paintings without requesting SVGs; two further zoom actions reduced the camera width to 598 units and mounted the 28 original intersecting country SVGs. Country 11 opened promptly from that view (129 ms automation action). At 390×844, the opening camera width was 700 units and again mounted zero SVGs while keeping the four paintings; one zoom to 455 units mounted 22 intersecting SVGs, and the country directory opened country 01 detail. The preview console reported no warnings or errors. The original full-detail art-off mode was unit-tested but not subjected to another 70-SVG browser load in this low-pressure pass.

`.github/workflows/world-web-atlas-candidate.yml` adds a separate PR/dispatch candidate check with `contents: read` only, pinned Node/pnpm and frozen install, focused atlas tests, world-web build/typecheck, authoritative-UI publication verifier, lint and formatting. It has no Pages deployment job, production secret, database service, migration, or Supabase step. On the local follow-up source, focused Vitest passed 4 files / 20 tests (including a non-deploy workflow guard); world-web build/typecheck, focused ESLint and changed-file formatting passed. The new remote workflow result must be bound to its eventual exact Git SHA and reported separately; a configured workflow alone is not a passing CI run. The large existing Vite chunk advisory and artwork rights question remain open for the release decision.
