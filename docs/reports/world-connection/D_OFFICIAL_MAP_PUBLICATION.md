# D — Official map source publication

Status: `IMPLEMENTED_UNVERIFIED`. This is a non-authoritative, static source-file
publication package. It does not connect live World State or grant economic
permissions. Only root may merge/release it.

## Fixed source and scope

- Implementation baseline: `8992178303677ec0f54398f3401a38bfbac0b528`.
- Selection: `status/world-data-selection.json`, `mapFiles`.
- Sole source inventory: `artifacts/world-map-files-v1/manifest.json`.
- Package: `WORLD_MAP_FILES_V1_2026_09_28`.
- Manifest SHA-256:
  `9a83b2de3e0da39dae9e485e8de4be5bf236de26d68937c48c7941d7d50f795f`.
- Original inventory: 203 files, 160 images, 43 supporting files,
  302,234,965 bytes. All originals are preserved byte-for-byte.
- National associations reproduce the existing scene/detail filename mapping:
  `01`–`70`, `visual-territory-NN`, `COUNTRY_NN`; two files per country.
  Global/support files retain null country associations. No joins into the
  contents of global support documents are invented.

The existing `publish-authoritative-ui-map-assets.mjs` covers 140 selected
immersive scene/detail files, not the whole 203-file source package. That hook
and the old scene URLs remain unchanged. A single build-script append in
`apps/world-web/package.json` publishes this separate package. No Vite config,
existing workflow, API catalog, office HTML, UI manifest, navigation, 420 harness,
Storage plan, Core, database or production variables are modified.

## Discovery and URL contract

After the normal World web build, the following paths are relative to the site
root (including the GitHub Pages project prefix):

- `official-map-source/index.html`: small, English, link-only source directory.
- `official-map-source/index.json`: stable discovery catalog.
- `official-map-source/<manifest-sha256>/index.json`: fixed-version catalog.
- `official-map-source/<manifest-sha256>/files/<original-repository-path>`:
  original source bytes. Non-ASCII path segments are percent-encoded in URLs;
  filenames on disk and downloaded bytes remain original.

The catalog is a deterministic projection of the selected manifest, not a
second maintained source list. Every row contains original path/hash/bytes,
image/support kind, original extension type, existing country associations,
null unprojected coordinates, source-only nature and a non-null `publicUrl`.
`publicationPath` is the original-filename filesystem path; consumers should
use `publicUrl` for HTTP links.

`publicUrl` is **site-root relative**, not relative to the catalog's own folder.
For example, with site base
`https://samuelq800.github.io/econmind-os-world-simulation/`, resolve a row with
`new URL(row.publicUrl, siteBase)`. The tooling helper
`resolveOfficialMapPublicUrl` rejects non-web or ambiguous bases and unknown,
traversal, encoded-alias, query-suffixed or unselected source paths. Consumers
must select exact rows from this catalog, not turn arbitrary input into paths.

`findOfficialMapSource(index, sourcePath)` is an exact whitelist lookup.
The build also verifies that its new output directory has exactly 203 source
files plus the three directory/catalog files, and checks every delivered byte
and hash. Nothing outside that inventory is silently added.

## Generation, build and bounded verification

Use pinned Node `24.20.0` and pnpm `12.3.4` with the frozen lockfile.

```sh
node scripts/official-map-publication-generate.mjs --check
pnpm exec vitest run tests/world-web/official-map-publication.test.ts
pnpm exec tsc -p tests/tsconfig.official-map-publication.json
pnpm --filter @econmind/world-web build
```

Only `--write` regenerates the two derived public catalog files, never original
maps, countries or economic data. Build fails if the committed catalog is stale,
the selection/manifest changes, any original differs, output bytes differ,
unselected output files exist, or the static-site capacity guard is exceeded.
The 302 MB payload is copied **only into ignored build output**; it is not
duplicated in Git. The source directory does not embed images, load frameworks,
prefetch files or execute supporting documents. Source links require an actual
build/preview or Pages release; development Vite does not get another copy hook.

For a Pages-shaped local check:

```sh
GITHUB_ACTIONS=true pnpm --filter @econmind/world-web build
GITHUB_ACTIONS=true pnpm --filter @econmind/world-web exec vite preview --host 127.0.0.1 --port 4123 --strictPort
node scripts/official-map-publication-smoke.mjs --site-base http://127.0.0.1:4123/econmind-os-world-simulation/
```

The smoke script makes six serial reads: discovery JSON, immutable JSON,
directory HTML, country 02 scene, country 70 detail and one global PNG with a
UTF-8 filename. It verifies full bytes/hashes, not just successful HTTP status.
It accepts only local HTTP origins and makes no API/Command/production requests.
The new isolated workflow repeats this exact check; existing workflows are not
edited. This is not a 420-combination audit or a performance/stress test.

## Capacity, rights and authority

[GitHub's published-site limit is 1 GB](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).
The build conservatively guards the entire final `dist` at **1,000,000,000
bytes**. This decimal interpretation is our conservative budget, not a claim
that the documentation specifies GB versus GiB. The real final file count,
byte count and remaining budget are emitted after the source copy. Future
integrated builds must pass the guard again; this candidate's measurement
cannot establish a later main's capacity or a successful deployment.

Existing hashed and immersive map copies are left intact. Package growth is not
hidden through hardlinks, tar tricks, source optimization or replacement of
other owners' assets.

The owner selected source-file publication. Third-party rights remain `UNKNOWN`
and no independent license proof is asserted. The original support files and
historical package/status labels remain unchanged. This catalog does not
convert proposals into operations or old geography/opening files into active
World State. Coordinate metadata is null/unprojected; any source-file coordinate
fields, including NULL values, remain byte-preserved, not interpreted or filled.

Production Pages readback, current API catalog `publicUrl` integration, formal
world opening, real Command/Receipt, and Gate B are **not evidenced by this
package**. The server/Edge map catalog remains unchanged; its old null URLs are
not falsely described as fixed. Other owners can explicitly wire this static
catalog after integration. Supabase Storage remains the separate 34-JSON plan,
not the target for these 203 map files.

The fixed PR head and command results are reported to root. Implementation is
not independent approval, merge or deployment.
