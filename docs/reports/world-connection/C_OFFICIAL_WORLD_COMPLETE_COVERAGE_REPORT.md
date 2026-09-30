# C — complete official-world data coverage report

Status: `IMPLEMENTED_UNVERIFIED`

Branch: `codex/c-official-world-complete-coverage`

Base candidate: `c66de7efe84539dd61e9f578d6f9ecb6b2ad9f63` (fixed PR #19; not rewritten)

Exact V2 implementation candidate:
`cf76332b9f41e6ac2f468892edff1b4388efcbb1`

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
| `C_OFFICIAL_WORLD_OPENING_MAPPING.json`   | 33,517,938 | `676b78fa3c00d9e194a8a1a34d13eb7900b076da1007a5d02a0db29a9071e7b7` | `sha256:3463413929b1a659f0a089e041f8698c09d37caa2ad1d88fbc930db9bb9fffbb` |
| `C_OFFICIAL_WORLD_OPENING_GAPS.json`      |    227,292 | `3b0d6bc97739732c2510ff04e7b1cf1199f3c9bfe4f6db0718ec3d7f10ccc4fd` | `sha256:b0e37cc97802080be7f14f5a0d3bf4ef457f3c6c1e60f6560c79d110493772c5` |
| `C_OFFICIAL_WORLD_COMPLETE_COVERAGE.json` |    291,660 | `c2dddd419c476609ce1e731adf62eef1cbd7a1ebce2614b15c03876a5f1fed39` | `sha256:9438a0c4b67d60a55d68fc2df676c70f63c57b8a48d6d25371cd4d6bdae6c651` |

## Coverage result

- checksum-manifest entries: 86;
- source artifacts including `CHECKSUMS.json`: 87;
- structured JSON datasets included losslessly: 34;
- map-package files individually hash-verified and enumerated: 203;
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
- targeted Vitest: `PASS` (6/6);
- deterministic regeneration: all three canonical fingerprints and file
  SHA-256 values reproduced exactly.

Independent B review and Gate B approval remain separate and are not claimed.
