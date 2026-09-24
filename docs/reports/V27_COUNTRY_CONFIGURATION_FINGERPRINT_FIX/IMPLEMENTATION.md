# V27 country-configuration fingerprint contract fix

Status: `IMPLEMENTED_UNVERIFIED`

This P2 preparation-only patch fixes the merged V27 manifest tool's semantic
collision with A's reviewed V27.2 Core contract. It does not modify Core,
Worker, real data, databases, production, release status or Gate B.

## Immutable identity

- base `origin/main`: `9ddfa46efee585fe2c373546faa9f87f2e168d72`
- execution plan: `aca8a4adc6f119403c848a940a890fb3a01df6a6`
- implementation: `88dfc511ec494c53dc3c9f81b73e3df1ccb368ac`
- reviewed A contract reference: `ec72b19e120398c17bd4550c8673a16ca0fb5bb0`
- branch: `codex/v27-country-config-fingerprint-contract-fix`

## Contract correction

The tool now separates unverified external provenance
(`sourceConfigurationRef`, `sourceConfigurationVersion` and
`sourceConfigurationHash`) from the structural World/country-set fingerprint.
It computes the latter with the reviewed A binding version
`v27.2-country-configuration-identity-v1`, sorted unique country IDs, canonical
record-key order, the `SHA-256\n` preimage prefix and `sha256:` output prefix.

The fixed vector for `WORLD_SHARED` plus `COUNTRY_01` through `COUNTRY_70` is:

`sha256:6a3d1df55987668814bc6ff7427289e51c4e304d543b9f40b14da609b7ebfaf3`

Comparison is explicit as `MATCH`, `MISMATCH` or `NOT_VERIFIED`. Even `MATCH`
is structural equality only: `sourceConfigurationHashVerified`,
`sourceHashesVerified`, `configurationAuthorityVerified`,
`generationAuthorized` and `formallyVerified` remain `false`. The legacy
ambiguous `countryConfigurationRef` input shape is rejected.

## Verification

- focused Vitest: `PASS` (1 file, 9 tests)
- standalone strict TypeScript: `PASS`
- targeted ESLint: `PASS`
- targeted Prettier: `PASS`
- repository secrets check: `PASS` (1,027 files)
- `git diff --check`: `PASS`

See `TEST_EVIDENCE.json` for exact commands and outcomes.

## Explicit NOT_RUN

- importing or modifying A's P0 Core candidate: `NOT_RUN`
- external source-byte/hash verification: `NOT_RUN`
- real configuration authority attestation: `NOT_RUN`
- Worker or runtime integration: `NOT_RUN`
- production database or deployment: `NOT_RUN`
- independent approval, formal Gate or Gate B: `NOT_RUN`

Accordingly this package remains `IMPLEMENTED_UNVERIFIED`; it is not an
approval, release, data-completeness or authority claim.
