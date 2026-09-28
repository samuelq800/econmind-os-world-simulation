# Seven image-aligned map layers

User requested a redraw of all seven map layers shown in the local preview.
This supersedes the old annotation renderer, while retaining the complete
70-region land partition from the preceding local change.

## Scope

- Local display-only preparation in `f-v25-fictional-map-preparation`, based on
  `16356316144d27412183a13e4e568cd6a79151f5`, plus the preceding uncommitted land
  partition. No main-site files, production data, migrations, World State,
  lifecycle/gate records or economic contracts are changed.
- The unchanged 1774 × 887 V8 terrain is the sole coordinate reference, with
  origin at the upper left. The renderer no longer imports the old mirrored
  geographic fixture or its transport measurements.
- `atlas-layers.json` binds both terrain and partition SHA-256 hashes.
  `land-partition.json` remains the political footprint source. Country names
  are retained as display slot names; they are not country seeds.

## Redrawn layers

1. **Physical:** seven conspicuous ridge traces and six major river traces,
   placed on the actual image and clipped to the land geometry. These are
   illustrative annotations, not surveyed elevation or hydrology.
2. **Climate:** seven complete, non-overlapping land categories. The planning
   heuristic combines an authored 65° N–65° S latitude span, image colour,
   distance to coast, and traced mountain buffers. No measured weather,
   precipitation, production effects or scientific climate model is claimed.
3. **Currents:** six directional warm/cold schematics, routed through connected
   ocean and smoothed only when the resulting line stays offshore. They do not
   represent simulated flow rates, a calibrated circulation model, or travel
   modifiers.
4. **Trade:** 13 land corridors and 11 maritime connections linking 20 nodes,
   including 12 ports. Land-only and water-only pathfinding share the same coast;
   all nodes belong to one connected transport graph. The distance list measures
   those exact drawn centrelines at the existing fictional 36,000 km width.
   This is route planning, not observed trade or operational infrastructure.
5. **Resources:** 32 proposed locations covering iron, copper, grain, gas, oil,
   lithium and uranium, each assigned to its actual display region. Placement
   is authored worldbuilding, not inferred reserves or economic calibration.
6. **Political:** retain full land coverage; extract and draw internal shared
   borders once. Neighbouring countries receive distinct palette colours.
   Coastlines, internal boundaries and selected-region highlighting are separate.
7. **Infrastructure:** 20 ports/hubs and 15 proposed resource/processing sites.
   Resource-linked facilities use matching coordinates and country IDs. Combined
   views offset their badges with leader lines so the resource symbols remain
   visible without changing the site coordinates.

## Interaction and readability

- Chinese controls and legends for every layer, individual toggles, and presets
  for countries, natural geography, trade/resources, all layers and terrain only.
- Regional views, zoom controls, annotation toggle and country selection.
  The country card reports dominant proposed climate, resources, infrastructure,
  adjoining region numbers and connected route nodes. Locating a country zooms
  to it and scrolls the map into view.
- Combined views suppress dense labels; single-layer local views restore details.
  The small-screen layout puts country selection before the longer legend list.
- All data are visibly labelled as fictional planning proposals, with no
  assigned team, stock, capacity, operational state or production integration.

## Reproduction and evidence

Generate with `tools/build_atlas_layers.py` using Pillow, numpy, scipy, shapely
and scikit-image; format the JSON with repository Prettier. Run
`tools/check_atlas_layers.py` for exported geometry validation. Runtime Node
dependencies and the frozen lockfile are unchanged.

Passed locally:

- Exact climate land coverage (459,404 image pixels / 117 connected land components),
  zero overlaps and zero assigned water. Final visual QA exposed a brightness
  threshold that excluded dark forest; the partition and all seven layers were
  regenerated after correcting it. Regression checks require three dark-forest
  locations to remain land and the visible inland lake to remain water.
- Every drawn land route stays on land; every sea route and current stays off
  land; rendered paths agree with checked/measured geometry.
- 32 resource sites and 35 facilities/nodes lie inside their declared regions.
  Ports are coastal, resource-linked facility references agree, route endpoints
  agree with nodes, and the full transport network is connected.
- Country adjacency is reciprocal, neighbouring colours differ, and shared
  borders do not duplicate the coastline.
- Browser: individually toggled all seven layers and inspected their matching
  SVG groups; natural-geography, trade/resource and all-layer views rendered.
  Selecting 40 / Norvak displayed its climate, grain site, hub/farm and neighbours.
- World-web typecheck/build, targeted ESLint, and original atlas regressions
  (11/11). Vite retains a size advisory for this detailed local static atlas
  (detailed geometry is bundled into the local static atlas).

These are implementer validations. They do not constitute independent review,
deployment, economic calibration approval, or a V25/V27 gate promotion.
