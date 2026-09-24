# V27.1 — country seed provenance pure Core preparation

## Identity and gate

- Branch: `codex/v27-1-seed-provenance-core`.
- Base after rebase: `origin/main` `45f4070071ccdd405b36f457729a440ffa5fc5ba`.
- Code/plan commit after rebase: `03d66ffc8a4951d1341fc85bb5b7610b04319b7e`; plan/test follow-up: `8f3ae7137018e27397f1911a37bf4f7114e990b8`.
- Formal V27.1 and all its listed hard dependencies remain `PLANNED`; ADR-06/08/13/15 remain `PROPOSED_NOT_APPROVED`. Result is **PREPARATION_ONLY**, with no status/Gate change.

## Candidate behavior

The new standalone Core parser accepts a caller-supplied Season country configuration (at most the Master design cap of 70, no hardcoded country roster) and one record per configured country. Each country declares population, resources, facilities, technology, accounts and trade dependency fields. Fields are strictly one of: exact unit-bearing `VALUE` with source/origin/assumption-or-derivation binding; explicit `MISSING` with reason and no amount; or `LEGACY_INDEX_ONLY` with a 0–100 score and `conversionProhibited: true`. Legacy indexes cannot be promoted to measured values. Values use canonical exact decimal strings, integral counts, `[0,1]` trade shares, explicit currency/physical units and domain-specific numeric kinds. Source records require kind, locator, version, declared content digest, period/geography where applicable; every source must bind at least one field. Duplicate/unknown countries, fields, sources, cross-country direct observations, undeclared assumptions and mismatched counterparties fail closed. Input order normalizes deterministically and produces a canonical SHA-256 _preimage_, not an authoritative seed fingerprint.

`dataCompleteness` remains `INCOMPLETE` while any field is missing or legacy-index-only, and only `UNVERIFIED_VALUES_ONLY` even when every field is a value. The parser cannot independently verify a declared source digest, locator, observation, formula or assumption truth. It makes no financial/inventory/geological posting and does not create or alter V08 `OpeningSeed`. The existing opening-seed constructor and reconciliation remain the only current ledger-opening path. Actual 70-country data, precise account/asset closure, FX, NPC policy and runtime initialization belong to later reviewed work.

## Verification

- New V27.1 focused Vitest: **PASS**, one file / 10 tests, including 70 configured country records.
- New plus existing opening-seed suites, after Core build: **PASS**, three files / 23 tests.
- Core typecheck/build, test-file TypeScript check, targeted ESLint/Prettier: **PASS**.
- Repository boundary and authoritative-pattern scans: **PASS**.
- Local environment, repository secret and foundation-policy checks: **PASS**; Supabase unlinked, database mutation disallowed.
- Git diff check: **PASS**.
- One earlier _parallel_ build/test attempt failed to resolve `@econmind/core` while the build artifact was being produced. It was not counted as a product pass; the required build-first sequential rerun passed all 23 tests.

## NOT_RUN and authority boundary

External source retrieval and checksum verification, 70-country empirical/assumption selection, calibration, economic plausibility review, V08 ledger opening materialization and conservation, actual 70-country World initialization, NPC controls, API/UI/worker integration, database/RLS/migration, production access, independent P0 review and Gate acceptance are **NOT_RUN**. This branch changes no existing opening-seed implementation, status, ADR, main-site or production file.
