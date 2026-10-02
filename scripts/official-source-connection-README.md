# Official source connection acceptance

Preparation and fixture tests only until the endpoint has an evidenced
`RELEASE_GO` and Control Tower explicitly authorizes this read acceptance.
This tool does not approve a release, activate a URL, deploy a page, access SQL,
or change World state. Operator flags acknowledge existing external authority;
they do not manufacture owner approval.

## Safe default

With the repository's pinned Node 24.20.0 / pnpm 12.3.4:

```sh
node scripts/official-source-connection-audit.mjs --plan
pnpm exec vitest run tests/world-web/official-source-connection-audit.test.ts
pnpm exec tsc --noEmit --strict --allowJs --types node --module NodeNext --moduleResolution NodeNext --target ES2022 --skipLibCheck tests/world-web/official-source-connection-audit.test.ts
pnpm exec eslint scripts/official-source-connection-audit.mjs tests/world-web/official-source-connection-audit.test.ts
pnpm exec prettier --check scripts/official-source-connection-*
```

No arguments also means `--plan`. Preparation verifies the selected package,
all 87 local artifact byte counts / hashes (86 manifest entries plus the
checksum file), the 34 frozen registry entries, and the existing public
configuration variable / Edge path. It does not set the repository variable or
write a built HTML file. Fixture transports call the existing Edge handler in
memory; they never bind network fetch.

The existing page-wiring CI path filter matches this new test's filename, but
its explicit test list does not execute it. The commands above are the focused
manual evidence boundary; a green unrelated workflow is not evidence that this
new test ran. Workflow/config edits are outside A's file ownership.

## Later authorized read acceptance

Only after both prerequisites have actually arrived, the operator may run:

```sh
node scripts/official-source-connection-audit.mjs --execute --release-go E_RELEASE_EVIDENCE_REF --root-authorization CONTROL_TOWER_NOTICE_REF
```

Use actual release and notification references, not these placeholders. The
endpoint is pinned to the approved project and preserves
`/functions/v1/world-v2-official-read`. Only credential-free GET is used, with
the exact Pages origin, no redirects, no cache, 30-second request timeouts,
a ten-minute overall deadline, at most 1,000 requests, and at most 256,000
response bytes per request. There is no retry/fallback to static data. Failure
returns exit 1, `complete: false`, and no response body/database diagnostics.

Acceptance covers:

- Catalog identities and all source-only/proposal/unit/provenance labels.
- All 34 structured trees reconstructed from existing pages, objects, geography
  sections and SHA-verified ASCII fragments. Actual returned lengths drive the
  cursors. Exact lossless equality detects omissions, duplicates, changed order,
  decimals/scientific notation converted to numbers, altered strings or dates,
  and fabricated time bases. No date or annual conversion is inferred.
- All 70 country list identities/populations and full details; native integer
  populations are summed exactly with BigInt. Detail does not need the
  list-only `countryCount` field. Structured countries separately prove numeric
  lexeme preservation.
- `regions.id -> regions.countryId` completeness, and all 70 countries' filtered
  `regions`, `changes.objectId`, and `seasonal-water.regionId` results: 210
  association checks, including empty results. Unknown regions are rejected;
  direct fields do not substitute for verified region associations.
- Correct Origin CORS, `Vary: Origin`, no-store and JSON response headers.

## Evidence limits

`SOURCE_DTO_ACCEPTANCE_PASS` is not LIVE World state, production opening,
browser-page acceptance, or a new authority. All source-only flags remain false
for live state and executed proposals. Fixture success is explicitly
`FIXTURE_PASS` / `remoteGetPerformed: false`.

Existing DTOs expose 34 complete semantic trees and declared original byte/hash
identities, not the original whitespace-preserving raw JSON bytes. The tool
checks those declarations against locally hash-verified originals and compares
exact lossless trees. It does **not** independently download/hash 87 raw remote
artifacts. The remaining 53 artifacts are not exposed by the structured routes.
Exact browser/page connectivity must be verified separately after authorized
configuration and release; a Node CORS/header check is not a browser test.
