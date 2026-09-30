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
