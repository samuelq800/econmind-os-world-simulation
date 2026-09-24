# V27.1 to V27.2 provenance/calibration adapter preparation

Branch: `codex/v27-provenance-calibration-adapter`.
Immutable V27.2 candidate ancestor:
`3b5766864dd15630b7beec7ddb358b2ec112aef6`.
V27.1/main composition commit:
`18f622b` over `origin/main` `4d38a9f6ef4191edd84ded58a2c90b130267b69f`.

## Status and ownership

This is P0 `PREPARATION_ONLY`. V27.1 and V27.2 remain unverified preparation
candidates and no automated check can approve the combined package. Own only a
new adapter under `packages/core/src/calibration`, its focused
`tests/world-core` file and this plan/evidence. Do not edit the V27.1 opening
parser, existing V27.2 validator, OpeningSeed, Gate/status, database or work
owned by A/D/E/F.

## Adapter contract

- Accept two data inputs: an actual `parseCountrySeedProvenance` result and an
  untrusted V27.2 calibration candidate. Reparse/revalidate both before
  comparison; do not trust caller labels.
- Require identical country identity sets. Compare shared source identity,
  locator, version, digest and compatible evidence classification exactly.
- Flatten V27.2 values to stable structural paths without inventing a metric
  mapping. Link a V27.1 `VALUE` only when country, source, unit, amount and
  assumption semantics select exactly one V27.2 quantity.
- Preserve the V27.1 domain/metric/subject/counterparty identity and source
  metadata, the original V27.2 amount/unit, and every exact
  `before + delta = after` change in the link output.
- A missing or legacy-only V27.1 field, incomplete V27.2 result, absent exact
  quantity, ambiguous multiple match, or a `DERIVED` V27.1 field that cannot
  map to V27.2's missing `derivationRef` yields `UNAVAILABLE` with explicit
  missing-field paths.
- A shared country/source/value candidate with unequal source metadata,
  classification, unit, amount, assumption or country coverage yields
  `MISMATCH`. Mismatch outranks unavailable in the aggregate result.
- Report every unlinked V27.2 quantity; never silently discard an amount.
  Output always carries `generationAuthorized: false` and contains no
  OpeningSeed, runtime modifier, write, command, Event, database operation,
  wall clock or RNG.
- Canonically order links/issues and emit a canonical SHA-256 preimage for
  review comparison only, not an authoritative fingerprint.

## Verification

Exercise one exact assumption-backed link, full provenance gaps, country and
source mismatches, ambiguous values, unsupported derivation mapping, tampered
parser results, deterministic order and no-authorization output. Run the new
test with existing V27.1/V27.2 tests, Core typecheck/build, targeted lint and
format, boundary/authoritative-pattern checks, safe-environment/policy/secret
checks and final diff review. Real source verification, schema evolution,
OpeningSeed generation, persistence, independent review and Gate approval are
`NOT_RUN`.

