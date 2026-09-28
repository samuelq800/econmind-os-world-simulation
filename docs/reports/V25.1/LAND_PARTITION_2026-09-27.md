# Complete land partition draft

User request: allocate all visible land first and draw clear country boundaries.

This change is local, display-only preparation based on `16356316144d27412183a13e4e568cd6a79151f5`.
It does not assign a team, initialise a country, change World State, or publish
to the original EconMind site. No gate or approval status changes.

## Geometry and rendering

- The unchanged V8 terrain is the visual source. Earth-coloured land and
  adjoining rock/snow are extracted at its native 1774 by 887 resolution.
  Decorative polar cloud bands are excluded. Small texture/river holes below
  100 pixels are closed; larger lakes remain water. The coast is an image-derived
  planning approximation, not surveyed geography.
- The ten largest connected land components receive 32, 20, 7, 4, 2, 1, 1, 1,
  1 and 1 region seeds. Land-only travel fronts, slowed by illustrated relief,
  divide the large landmasses. Smaller offshore islands are assigned whole to
  the closest allocated coast. Area balance and relief are planning heuristics;
  these are not population, resource, or economic allocations.
- All 459,404 pixels in the extracted land mask, across 117 connected components,
  have exactly one owner. Unioned complete pixel cells preserve common edges at
  triple junctions. Geometry is exported to `land-partition.json`.
- The political renderer now uses that partition, replacing disconnected visual
  polygons and sea envelopes. Existing 01–70 names are retained as planning slot
  labels, but their locations change in this new partition. The old `atlas.ts`
  capital/polygon fixtures remain legacy transport experiments and are not the
  rendered political geometry or a source of economic assignments.
- Borders use a dark halo and a light line; the coastline is turquoise. The
  political layer starts enabled. Full-map numbers, local-view names, a region
  selector and selected-region highlighting support the next assignment step.

The later seven-layer redraw corrected a brightness threshold that had excluded
some dark forest. Coverage counts above reflect that correction; the inland
lake remains water. See `SEVEN_LAYERS_2026-09-27.md`.

## Reproduction and validation

Generate with `python tools/build_atlas_partition.py` (Pillow, numpy, scipy,
shapely). Format the JSON with repository Prettier. Validate exported topology
with `python tools/check_atlas_partition.py` (shapely). The validator separately
parses SVG rings and checks their union, intersections, area, source hash and
label containment; it does not rerun the allocation algorithm.

Validated locally:

- Exported topology: 70 regions; zero gaps, overlaps or assigned water relative
  to the extracted coast; all 70 labels inside their own land.
- Existing fictional-atlas regression suite: 11/11 passed.
- World-web typecheck passed using pinned Node 24.20.0 and pnpm 12.3.4. Initial
  attempts through the bundled pnpm failed its engine check; no dependency
  versions or lockfile were changed to bypass it.
- World-web build, targeted ESLint and diff whitespace checks passed. Vite
  reports a bundle-size advisory (about 1.02 MB raw / 212 KB gzip for JS)
  because the detailed partition is bundled with this local preview.
- Browser: full map, north-west detail view, selection of 40 / Norvak and its
  highlighted region inspected. Default political visibility verified.

These are implementer checks, not independent approval. No production mutation
or deployment was performed.
