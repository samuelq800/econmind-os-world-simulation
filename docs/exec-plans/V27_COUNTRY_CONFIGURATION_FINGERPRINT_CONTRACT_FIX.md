# V27 country-configuration fingerprint contract fix

## Scope and risk

Branch: `codex/v27-country-config-fingerprint-contract-fix`, based on
`origin/main` `9ddfa46efee585fe2c373546faa9f87f2e168d72`.

This P2 tool-only fix corrects a naming/semantic mismatch in the merged
country-configuration manifest preparation. It modifies only `tools/v27`, its
focused `tests/foundation` file and preparation evidence. A's reviewed P0 Core,
Worker, real data, status/Gate, main-site, database and production remain
untouched.

## Contract correction

The merged tool treated `countryConfigurationRef` as an arbitrary external
stable string. A's reviewed V27.2 contract instead defines the same term as a
content-addressed structural identity:

`sha256(canonicalHashInput({ bindingVersion, worldId, sorted unique countryIds }))`

with binding version `v27.2-country-configuration-identity-v1` and output
format `sha256:<64 lowercase hex>`.

The corrected tool separates:

- `sourceConfigurationRef`, `sourceConfigurationVersion` and
  `sourceConfigurationHash`: external provenance declarations whose bytes are
  not verified by this tool;
- `structuralCountrySetFingerprint`: the A-compatible World/country-set digest;
- `expectedCountrySetFingerprint`: optional caller-supplied digest used only
  for `MATCH`, `MISMATCH` or `NOT_VERIFIED` comparison.

The tool takes an injected SHA-256 adapter, uses the exact A binding version,
sorts/uniquifies the exact 70 country IDs, and constructs the canonical
preimage with lexicographically ordered record keys. A fixed golden vector for
`WORLD_SHARED` plus `COUNTRY_01`–`COUNTRY_70` locks byte-level behavior to
`sha256:6a3d1df55987668814bc6ff7427289e51c4e304d543b9f40b14da609b7ebfaf3`.

No compatible alias named `countryConfigurationRef` is retained because that
would preserve the ambiguity. Legacy-shaped input fails exact-key validation.
Even `MATCH` proves only structural equality; all external hashes remain
unverified and no configuration authority, data completeness or generation is
authorized.

## Verification and NOT_RUN

Run focused tests including golden vector, order invariance, mismatch,
not-verified and legacy-shape rejection; strict TypeScript, targeted
ESLint/Prettier, secrets and diff checks. Core cross-import/review, source-byte
verification, real configuration authority, Worker integration, formal Gate
and production remain `NOT_RUN`.
