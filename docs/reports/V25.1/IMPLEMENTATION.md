# V25.1 map-preparation implementation report

## Status

- **Preparation marker:** `PREPARATION_ONLY_NOT_V25_STARTED`.
- **Implementation commit:** `d02b1d6be63b2ff3871961d7f5dfdb684ed914b6`.
- **Immutable baseline:** `e43dd6629d8645740278156654bb224121666856`.
- **Effective risk:** P2. This is a browser-only, source-controlled visual
  fixture and local test tooling. It owns no authoritative state, command,
  projection, cache, storage or network write.
- **Review/status claim:** no V25 progress or status record was changed. This
  is neither V25 start evidence nor `VERIFIED`; there is no claimed owner
  fast-track or independent approval.

## Implemented scope

- A non-Earth local CRS (`FICTIONAL_ATLAS_KM_V1`) and deterministic SVG route
  measurement oracle. The displayed kilometre total is calculated from the
  same route polyline that is drawn.
- A high-fidelity fictional satellite-terrain **visual layer** at
  `apps/world-web/src/assets/asterra-satellite-terrain-v8.png` (SHA-256
  `4cc5e79b1293c5c5c6dbfecc0688a66aa031307ec144332c22f3fc962c179ed7`). It
  was generated with the built-in image tool using the user-supplied screenshot
  as a style-only reference: no Earth geometry, labels, national borders,
  cities or source image pixels were copied. It is horizontally wrapping and
  vertically reflected as a presentation choice. The terrain uses four unequal
  plate-derived land poles, restrained snow cover, banded ridge systems,
  explicit major drainage, a closed basin, steppe-to-desert transitions and a
  small set of geologically distinct island groups. The earlier V1 image
  remains only as a documentation concept at `docs/assets/V25.1/` and is not a
  runtime input.
- Seventy `visualTerritories`, each with a fictional label, exact local capital
  point, display-only boundary and a non-quantitative physical resource
  profile. Fourteen are island groups with a visual envelope around one or two
  display islands; that envelope is neither a legal maritime claim nor a
  country record. They have no World IDs, population, government, strength,
  inventory, reserve, capacity, throughput, price, GDP, market state or NPC
  state. They are not a V27 country seed.
- City-capital markers, ports, factory, refinery, mine, farm, energy,
  logistics, rail, bridge/tunnel, pipeline and mountain-pass rendering.
  All are position/type annotations only; none asserts construction, ownership,
  operation or capacity.
- Deterministic checks for local extent, horizontal world wrap, route endpoints,
  land/sea sampling, named strait traversal, 70-territory count,
  capital-in-territory, island-envelope form/count/containment, local-lake
  scale, tectonic satellite placement, latitude continuity, warm subsurface
  currents, resource origin compatibility and prohibited future economic seed
  values.
- The physical derivation contract is recorded in the execution plan:
  `plates → relief → drainage → latitude/wind/current → precipitation →
climate → vegetation → agriculture/mineral potential → settlements →
cities/ports → corridors`. The V8 image prompt encodes the owner’s geographic
  redline: asymmetric macro-geography, restricted snow-line logic, endorheic
  basin, sparse linked volcanic arc, credible rivers, steppe transitions,
  varied coasts/shelves and visible choke-point intent.
- A layer switcher keeps terrain clean by default. Physical annotations,
  climate, currents, trade routes, resource context, political display
  boundaries and infrastructure are independent optional layers. This is only
  a browser presentation control; it does not change authority or persist
  state.

## Safety and compatibility

- **Authoritative owners, reads, writes:** none. `apps/world-web` imports only
  bundled source-controlled fixture data and a local image asset. It performs
  no fetch, browser storage, database, Supabase, event, command, receipt,
  posting or cache write.
- **Database/RLS/credentials/environment:** none used. No production
  connection, migration, seed, RLS probe or secret access occurred.
- **Transaction/idempotency/clock/replay:** not applicable to this static UI.
- **Legacy/migration:** no original EconMind-site path, server module, schema or
  migration was changed.

## Actual validation

All checks below used Node `24.20.0` and pnpm `12.3.4` through the repository’s
pinned local toolchain, on the code commit named above.

- `pnpm exec vitest run tests/world-web/fictional-atlas.test.ts` — PASS,
  10/10 focused invariants.
- `pnpm --filter @econmind/world-web typecheck` — PASS.
- `pnpm --filter @econmind/world-web build` — PASS; bundled the V8 terrain
  asset locally.
- Targeted `eslint` over `apps/world-web/src/App.tsx`, `map-lab`, and the
  focused test — PASS.
- Targeted Prettier check, `node scripts/check-boundaries.mjs`,
  `node scripts/check-authoritative-patterns.mjs`, and `git diff --check` —
  PASS.
- Local browser inspection at `http://127.0.0.1:4173/` — PASS: the clean
  physical base rendered with all optional layers off; the Political switch
  rendered 70 display boundaries and the island-group dashed sea envelopes.
  This is visual local evidence only.

## Incomplete and deferred work

- The terrain raster is expressly a non-metric visual layer. It does **not**
  replace the local line geometry as the route-distance source. Full calibrated
  physical-data reconstruction and an authorised projection remain future
  work.
- Existing prepared vector features, routes and infrastructure are not claimed
  as a calibrated V8 overlay. They remain local test fixtures until they are
  re-authored against the accepted terrain geometry.
- MapLibre, deck.gl, PMTiles/MVT, dynamic GeoJSON, authorised classified
  projection, map-service performance, accessibility audit, browser matrix and
  offline fallback are `NOT_RUN`.
- V27 country initialisation/NPCs, numerical population, national power,
  reserves, crop output, production, port throughput and resource allocation
  values are `NOT_RUN`; the 70 display territories must not be promoted to
  those records without an authorised V27 work package and review.
- No real-world geography, classified projection, database/RLS evidence,
  production environment, security review or V25 gate evidence is claimed.

## Next action

Keep this branch as an unmerged P2 preparation candidate. Require a fresh
dependency/gate check plus the relevant owner decision before any V25 product
integration, and require an explicitly authorised V27 plan before mapping
visual territories to countries or introducing numerical demographic/economic
data.
