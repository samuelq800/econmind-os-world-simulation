# V27.1 to V27.2 provenance/calibration adapter preparation

## Immutable identity

- Branch: `codex/v27-provenance-calibration-adapter`.
- Preserved V27.2 candidate ancestor:
  `3b5766864dd15630b7beec7ddb358b2ec112aef6`.
- Composed V27.1/main ancestor:
  `4d38a9f6ef4191edd84ded58a2c90b130267b69f`.
- Composition merge: `18f622b`.
- Prior plan commit: `77cbb820a840a68fe05f6cca2c8a36b33c63e43e`.
- Frozen code/test commit: `652138d2179ec1102bb23efe8b3419de7af9b8de`.
- Frozen code/test tree: `1ec5c83673314c379ce6dfe642abbf501cf27507`.
- Risk/status: P0 `PREPARATION_ONLY`; no verification, merge authority or
  Gate acceptance is claimed.

## Implemented connection

The new pure adapter accepts two data inputs: an actual
`parseCountrySeedProvenance` result and an untrusted V27.2 calibration
candidate. It reconstructs and reparses the V27.1 input, revalidates V27.2 with
the existing strict closure validator, and rejects forged parser results.

It compares exact country identity sets and shared source reference, locator,
version, digest and evidence classification. V27.2 values are flattened to
stable structural paths without synthesizing a `metricRef`. A V27.1 value is
linked only when domain, country, source, unit, final amount and assumption
semantics select exactly one V27.2 quantity. The link preserves V27.1
domain/metric/subject/counterparty, source metadata, provenance amount,
original calibration amount, final amount and every exact
`before + delta = after` change. Every change must retain the same source and
assumption as the V27.1 design-assumption field.

The adapter reports `UNAVAILABLE` for explicit missing or legacy-index fields,
incomplete V27.2 input, no exact quantity, ambiguous exact tuples, unlinked
V27.2 quantities, and V27.1 `derivationRef`, which has no V27.2 schema
equivalent. Unequal country sets or source evidence report `MISMATCH` and
mismatch takes aggregate precedence.

Current V27.2 input has neither `worldId` nor country-configuration provenance.
The adapter therefore explicitly reports
`WORLD_CONFIGURATION_BINDING_UNAVAILABLE` with missing
`calibration.worldId` and `calibration.countryConfigurationRef`. This prevents
the V27.1 `worldId` from being silently assumed. V27.1 `seasonRef` is retained
only as audit metadata; it never selects a different calibration, opening
value, Core, simulation mechanism or buff. Season 1 and ordinary World remain
one World/Core path.

Output always has `generationAuthorized: false` and a canonical SHA-256 review
preimage, not an authoritative fingerprint. No OpeningSeed, ledger mutation,
runtime modifier, command, Event, clock, RNG, database or production action is
created. The existing V27.1 parser and V27.2 validator were not modified.

## Verification against frozen code

- Adapter plus existing V27.1 and V27.2 focused tests: **PASS**, 3 files / 31
  tests. Coverage includes one exact preserved causal chain, source digest
  mismatch, missing metric identity ambiguity, missing derivation field,
  country-set disagreement, incomplete calibration, forged parser output,
  deterministic order, one-World binding gap and no authorization.
- Targeted ESLint and Prettier: **PASS**.
- Core typecheck and build: **PASS**.
- Repository boundary and authoritative-pattern scans: **PASS**.
- Local safe-environment, foundation policy and repository secret scans:
  **PASS**. No database was configured, Supabase was not linked, mutation was
  disabled and 955 files were scanned for secrets.
- Composition-to-code diff check: **PASS**. Only the new adapter, focused test
  and plan changed after the V27.1/V27.2 composition commit.

## Explicitly not run

Schema changes to add world/configuration/metric/derivation bindings, real
source retrieval or digest verification, actual 70-country data linkage,
economic plausibility review, OpeningSeed generation, ledger/database writes,
runtime integration, separate Season mechanics, independent P0 review, merge
approval and Gate acceptance are `NOT_RUN`.
