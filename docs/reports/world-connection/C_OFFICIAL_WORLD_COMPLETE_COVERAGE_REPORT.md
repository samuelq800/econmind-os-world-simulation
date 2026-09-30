# C — complete official-world data coverage report

Status: `IMPLEMENTED_UNVERIFIED`

Branch: `codex/c-official-world-complete-coverage`

Base candidate: `c66de7efe84539dd61e9f578d6f9ecb6b2ad9f63` (fixed PR #19; not rewritten)

Exact V2 implementation candidate:
`f711869b5265003e12adb29996ad8158cc00fd03`

## Why V2 exists

V1 normalized the opening-critical country, inventory, finance, facility,
resource, water, power, employment, social and map-link fields. It did not
place every remaining official dataset in the structured mapping artifact.
V2 closes that source-side coverage gap without claiming that every record has
already been adopted into an OpeningSeed, exposed through the API or wired to a
page.

## Machine outputs

| Artifact                                  |      Bytes | File SHA-256                                                       | Canonical fingerprint                                                     |
| ----------------------------------------- | ---------: | ------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `C_OFFICIAL_WORLD_OPENING_MAPPING.json`   | 33,555,486 | `91a8c281a88fb60e1cb31de28de2fa9ceed996aa9719d65ff23f306ac990f4f1` | `sha256:230f8d695c25ea839fb6415de3c4c2985dd6d95e6261fa10dbec73053dedac82` |
| `C_OFFICIAL_WORLD_OPENING_GAPS.json`      |    227,292 | `1254b3c2929e10d3b8a582e032bc22648b04d01236e3098a18a1c39974d46539` | `sha256:f374ed3a888305a467f52d0aeaf7c545a6513cf17accc10c9537850694b68e95` |
| `C_OFFICIAL_WORLD_COMPLETE_COVERAGE.json` |    294,812 | `c42a8336b59eec986c576427c85c6db4aca986fc0632e6b572b9e997f4f835e9` | `sha256:8b915aadb1aa299cc1c2529eb8ed996f1e8ff9c8ad5bd7ff88731c6d459efa2d` |

## Coverage result

- checksum-manifest entries: 86;
- source artifacts including `CHECKSUMS.json`: 87;
- structured JSON datasets included losslessly: 34;
- map-package files individually hash-verified and enumerated: 203;
- map-package composition: 160 image files (90 PNG + 70 SVG) and 43
  supporting data/index/documentation files; the package is not described as
  203 images;
- map assets directly associated with countries: 140 (70 country scenes + 70
  country-detail vectors);
- global map/index/geography/support files: 63;
- omitted source artifacts, structured datasets and map files: 0 each.

The 34 structured datasets cover assumptions; changes; commodity catalog;
countries; coverage; deposits; domestic access; employment; entities;
facilities and map links; finance; geography; hazards; illustration links;
land; licences; manifest; nodes; material reconciliation; population services;
power; production plans; recipes; regions; seasonal water; settlements; stocks;
supplier policy; technology; trade; transit; transport routes; and water
allocations.

All source number tokens remain lossless decimal strings. Each dataset is
included in full; detected country and region references receive explicit
source→normalized bindings. Proposal records remain proposal records.

Region-only records derive their country association through the verified
122-row region table. This now assigns all 122 `seasonal-water` records and all
130 audit-only `changes` records to the correct countries, with all 70
countries represented. Unknown regions and conflicting top-level
`countryId`/derived-country references are rejected. Truly world-level records
without either reference remain unbound. The `changes` dataset remains
`VALIDATION_METADATA` / `METADATA_NOT_RUNTIME_STATE`; association does not make
it an OpeningSeed calculation input.

## Four distinct completion states

1. **Original preservation:** the production readback reports 87 immutable
   candidate artifacts represented by 278 storage rows. C verifies their local
   package bytes. This is source preservation, not World state.
2. **Structured offline mapping:** all 34 JSON datasets are present in V2 and
   machine-readable. This is complete for the selected source package.
3. **Formal opening adoption/query API:** not complete. F/Core must adopt only
   permitted records after named ownership, currency and boundary gaps close;
   A/E must expose approved server queries.
4. **Page/static connection:** not complete for all domains. The 203 map files
   have stable versioned repository paths and verified hashes, but C does not
   claim every file is published in production or every domain is wired to the
   UI.

No official record was omitted merely because it is proposal-only. Conversely,
no proposal was converted into a permit, contract, facility activation, team
assignment or simulation event.

## Finance and authority boundaries retained

The 56 deposit-liability and 62 equity differences remain classified as source
floating tails, with maximum exact absolute deltas `0.00001` and `0.000017`.
No source finance value was changed. Scenario-currency authority and the merged
Treasury/Central-Bank boundary remain explicit blockers.

`openingSeedReady=false`, `worldId=null`, and no worker start or production
mutation is authorized by this package.

## Verification at the implementation candidate

- targeted Prettier: `PASS`;
- targeted ESLint: `PASS`;
- strict TypeScript using `tests/tsconfig.official-world-mapping.json`: `PASS`;
- targeted Vitest: `PASS` (7/7), including region-only attribution, per-country
  isolation, unknown-region rejection, country/region conflict rejection and
  world-level non-association;
- deterministic regeneration: all three canonical fingerprints and file
  SHA-256 values reproduced exactly.

Independent B review and Gate B approval remain separate and are not claimed.
