# V27 exactly-70 country-configuration manifest — preparation only

## Scope and ownership

Branch: `codex/v27-country-configuration-manifest-preparation`, based on
`origin/main` `e18a7073bc487f8948061b1e140726bfe191b4a9`.

This is a non-authoritative upstream preparation for A's future
`countryConfigurationRef` binding. It does not change the V27 Core parser,
Worker composition, production data, status/Gate, main-site or any database.
Only a new `tools/v27` validator, one `tests/foundation` file and preparation
evidence are in scope.

## Minimal manifest contract

The validator accepts:

- one explicit `countryConfigurationRef`, configuration version and declared
  SHA-256 digest;
- a source registry containing source ID, availability, hash or missing reason;
- a non-empty required-parameter ID list;
- exactly 70 unique country IDs;
- per-country configuration-source reference and parameter coverage rows.

An available source requires a lowercase SHA-256 digest. Missing sources are
valid only with an explicit missing reason and do not become defaults. Covered
parameters must reference a declared source. Missing or omitted parameter
coverage is emitted as a concrete `MISSING` row. Unknown sources/parameters,
duplicate identities, malformed hashes and country counts other than 70 fail
closed.

Output is deterministic and machine-checkable: canonical country IDs, each
country's source binding, full required-parameter coverage and explicit gaps.
It contains no parameter value or country-policy field. Declared hashes are
preserved but not authenticated, so `configurationHashVerified=false` and
`sourceHashesVerified=false` always remain explicit.

The result is only `PREPARATION_ONLY_TRACEABLE` or
`PREPARATION_ONLY_MISSING`; `generationAuthorized=false` and
`formallyVerified=false` always.

## Verification and NOT_RUN

Run focused Vitest, strict standalone TypeScript, targeted ESLint/Prettier,
secrets and diff checks. Real 70-country source records, source-byte/hash
verification, parameter values, country policies, Core/Worker integration,
independent review, formal V27/V29 Gate, release and production remain
`NOT_RUN`.
