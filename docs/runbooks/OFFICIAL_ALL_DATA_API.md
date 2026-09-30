# Official World V2 source coverage — additive read API candidate

This is an additive follow-up to the frozen countries-only API candidate
`e9747048a082bebfc7aafbbab3e5b3da9054c9e2`. It does not rewrite that
candidate, the source package's `activationAllowed=false`, an OpeningSeed,
World state, a team appointment, or any original EconMind site table.

## Four different states

| Layer                        | Current evidence                                                                                                                                           | Not implied                                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Original source preservation | E read back 87 selected source artifacts in 278 immutable production storage rows under the existing inactive `world_v2` candidate bundle.                 | Query rights or an OpeningSeed.                                                             |
| Structured read code         | This candidate freezes all 34 `data/*.json` datasets, reconstructs database chunks and exposes bounded domain reads when opted in. Local tests inject SQL. | Published API role, production readback, or UI integration.                                 |
| Formal opening adoption      | `worldId=null`, `openingSeedCommitted=false`, `workerStarted=false` in `status/world-data-selection.json`.                                                 | Executed facilities, contracts, licences, teams, inventory/finance postings, or simulation. |
| Page/static connection       | D owns web wiring; E owns static publication. The separate map package has 203 versioned files: 160 images (90 PNG, 70 SVG) and 43 supporting files.       | That all 203 are images or deployed public URLs.                                            |

## Opt-in and DB boundary

In addition to the countries-only API's dedicated DB configuration, set
`WORLD_API_ALL_DATA_ENABLED=true` only after E's separately reviewed 0021
minimal SELECT/RLS release. The existing fixed NOLOGIN `world_v2_api_reader`
role is used inside `BEGIN READ ONLY` / `SET LOCAL ROLE` transactions. Browser,
`anon` and `authenticated` roles receive no `world_v2` grants. Missing 0021
permissions leave source reads and `/readyz` unavailable; they must not be
reported as connected. The all-data flag is off by default and rejects
partial activation. No SQL, source path, JSON pointer, table or column name
is accepted from HTTP. No arbitrary CORS grant is added.

The API maps 34 literal slugs to their frozen `data/<slug>.json` path, byte
count and SHA-256 from the selected CHECKSUMS manifest. It queries only the
selected bundle and that path's exact immutable storage key (or contiguous
`.part0001`… chunks), checks each chunk hash, reassembles UTF-8, and checks
the full file byte count/hash before parsing. It rejects gaps, mixed root and
parts, extra rows, drift, unlisted paths and raw database errors. Source JSON
number tokens are emitted as exact decimal strings, never converted through
binary floating-point; source strings, booleans and null remain unchanged.
No source value is rounded, repaired, reclassified or invented.

## HTTP shape

- `GET /v1/world-data/datasets` lists the 34 exact slugs, hashes, source
  paths, sizes, source kind and explicit association fields. The catalogue
  says `databaseAvailability=VERIFY_PER_REQUEST`; listing does not prove
  live database access.
- `GET /v1/world-data/datasets/<slug>?offset=0&limit=20` returns up to 50
  source rows per request, dynamically shortened to at most 256 KB, with
  `total`, `returned`, `nextOffset` and the original row shape. Only declared
  country/entity/reference fields can be filtered by `countryId`, `entityId`
  or `referenceId`; unsupported filters fail closed. For example, trade plans
  have seller/buyer countries and entities, while seasonal water has a
  `regionId` reference. Its country filter verifies the separate frozen
  `regions` source and joins `seasonal-water.regionId` to `regions.id` and
  `regions.countryId`; `changes.objectId` is joined through the same verified
  region index. Missing or corrupt links fail closed. The returned rows keep
  their original shape, without a fabricated direct country field. `changes`
  remains validation/audit metadata, not runtime World state.
- Small object datasets (`assumptions`, `illustration-links`, `manifest`)
  return their complete source object. `geography` exposes an explicit section
  catalogue; its arrays page by section, and large ASCII path strings return
  bounded `fragmentOffset`/`fragmentLength` pieces with a fragment hash.
  Reassemble using `nextFragmentOffset`, never an arbitrary JSON pointer.
- Each result names `OFFICIAL_SELECTED_SOURCE_DATASET`, file/package hash,
  source path, `numericEncoding=DECIMAL_STRING_EXACT`, original-unit policy,
  `proposalFieldsAreExecuted=false` and `liveWorldState=false`. Units remain
  the source's `unit` fields/field names as documented in `DATA_DICTIONARY.md`;
  this API does not redefine a GCU settlement currency.
- `GET /v1/world-data/map-assets?offset=0&limit=50` lists 203 manifest-verified
  versioned files and their path/hash/size/classification, optionally filtered
  by `countryId`. Exactly two files associate with each country (scene PNG and
  detail SVG); 63 files are global/support. `publicUrl=null` and
  `staticPublicationStatus=NOT_VERIFIED` until E/D publish and verify actual
  static URLs. The API does not serve binary image data or claim database
  storage for the map package.

All requests use exact bounded routes/parameters and static error codes.
Invalid path/filter/body/method fails before a source query. Dataset source
failures return only `SOURCE_UNAVAILABLE` (503) or `SOURCE_INVALID` (502),
without raw data or credentials. Readiness checks the countries source on
every probe and all 34 datasets at most once per five minutes; a failed full
scan makes readiness false. A ready source API still says nothing about
authorized runtime `read_projection`, WorldVersion/EventSequence or Gate B.
The full scan is bounded to ten seconds per readiness request; an unfinished
scan cannot return an optimistic ready response.

## Data families preserved

Countries, regions, settlements, entities; finance; stocks, commodity
catalog, recipes and production plans; deposits, facilities, facility-map
links, nodes and transport routes; geography, seasonal water, water
allocations and power; employment and population services; domestic access
and land program; technology, licence, transit and hazard proposals; trade
plans, supplier concentration policy, opening-material reconciliation,
assumptions, changes, coverage, illustration links and source manifest.
CSV counterparts and frozen source snapshots remain versioned in the 87-file
original archive; this JSON API is the structured value surface, not a
generic file-download endpoint.

## Evidence to record separately

Local build, typecheck, registry-vs-CHECKSUMS audit, exact-number/chunk tests,
HTTP tests, map manifest generator `--check`, lint, boundaries and secrets are
code evidence only. E's 0021 role/RLS release, a real dedicated-role DB read,
API deployment, static map URL verification, D's page wiring and formal
OpeningSeed adoption require independent records. Do not convert `NOT_RUN`
into `PASS` because a candidate branch exists.
