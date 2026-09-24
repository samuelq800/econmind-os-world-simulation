# V27 exactly-70 country-configuration manifest preparation

## Immutable identity and classification

- Branch: `codex/v27-country-configuration-manifest-preparation`.
- Mainline base: `e18a7073bc487f8948061b1e140726bfe191b4a9`.
- Plan commit: `6e7e94824295a7c46bd34b61112a105763ab3ed9`.
- Frozen tool/test commit: `53da7581606e343dd781fbad1d73a1c2e382bf13`.
- Frozen code tree: `163d367c1406a6495a1faf8530eefc2f1499a2a7`.
- Status: `IMPLEMENTED_UNVERIFIED / PREPARATION_ONLY`.

Formal V27/V29 status and Gate records remain unchanged. This preparation does
not claim that a real 70-country configuration exists.

## Delivered upstream contract

`tools/v27/country-configuration-manifest-preparation.ts` provides A with a
strict structural upstream for `countryConfigurationRef`. Input requires:

- an explicit configuration reference, version and lowercase SHA-256 digest;
- a declared source registry with available/missing status and hash/reason;
- a non-empty required-parameter list;
- exactly 70 unique country IDs;
- each country's configuration-source reference and declared parameter
  coverage.

The normalized output preserves the configuration identity, canonical country
IDs, per-country source binding and one coverage row for every
country/required-parameter pair. Available coverage carries the declared source
ID and hash. Missing source, missing country source, explicitly missing
parameter or omitted coverage becomes a concrete `MISSING` row and gap code.
Nothing is silently zero-filled.

Malformed hashes, counts other than 70, duplicate countries/sources/parameters,
unknown source references, unknown parameter IDs and input schema expansion
fail closed. Exact-key validation rejects attempts to attach country policy or
parameter value fields: this tool is identity/coverage preparation only.

Declared hashes are not authenticated against source bytes, so output always
states `configurationHashVerified=false` and `sourceHashesVerified=false`.
It also keeps `generationAuthorized=false` and `formallyVerified=false`. No
Core/Worker code, country data, economic value, default, policy, database,
status/Gate, main-site or production state was changed.

## Verification

- Focused manifest validator tests: **PASS**, 1 file / 6 tests.
- Combined V27 manifest plus current V29 provenance/evidence tools: **PASS**,
  3 files / 16 tests.
- Strict standalone TypeScript for all three tools and tests: **PASS**.
- Targeted ESLint and Prettier: **PASS**.
- Repository secret scan: **PASS**, 1,023 files.
- `git diff --check`: **PASS**.
- Base-to-code changed-file audit: **PASS**; only the plan, new `tools/v27`
  validator and new focused test changed through the frozen code commit.

## Actual gaps and NOT_RUN

No production or reviewed real 70-country manifest was supplied. The valid
70-country object used in tests contains only fixture IDs and hashes and is not
data evidence. Therefore real country IDs, configuration source bytes,
configuration digest verification, required parameter catalog, per-country
coverage sources, country policy, parameter values and A's actual Worker/Core
binding remain `MISSING` or `NOT_RUN`.

Source-byte verification, configuration-hash recomputation, real-data ingest,
Core/Worker integration, independent review, full repository tests, formal
V27/V29 Gate, release and production operation are `NOT_RUN`.
