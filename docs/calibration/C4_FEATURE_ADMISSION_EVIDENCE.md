# C4 Feature-Admission Evidence Register

Status: **READY FOR OWNER REVIEW WITH CAVEATS / EVIDENCE_ONLY_NON_AUTHORITATIVE / ZERO FEATURES ADMITTED**

This package completes the feature-evidence inventory permitted by the C4
preflight. It does not choose a feature set, approve a missing-value rule,
select an archetype method or count, map or generate fictional countries, run
trade reconciliation, or authorize final calibration or runtime use.

## Immutable baseline and inputs

The execution contract is based on reviewed C4 target
`de663d7d6a5d5dc0873f9e49905af8c57ce645fc` and its continuation record
`f8a248815db8c2474feea07f1f93d7e6aa9d5654`. The approved C4 state remains
`NOT_READY_NON_AUTHORITATIVE`, with `finalGeneratorReady=false`.

`data/calibration/preflight/c4_feature_admission_execution_contract.v1.json`
binds the exact raw SHA-256 bytes of the C4 preflight, four C3 artifacts, four
C2 pilot artifacts, and variable registry `2.1.0`. Its pinned canonical hash
is `c2b960b4465f6e8b0755d30ad721618b5454f957462aa236bde283365e59893a`.

The verifier copies each caller-supplied byte array once, validates all ten raw
artifact hashes before parsing those artifacts, reruns the existing C4
preflight verification, checks the C3-to-C2 hash chain, then validates pilot
variable identity, unit, observed classification, and preferred-or-fallback
source compatibility against the registry. The generated evidence content
hash is `cf3473c4343a88e3db7ac3e6526ef44ed2ce8a54bd1e3f93e13047de4b5a976c`.

## Closed readiness gap

The frozen observations contain ten distinct variable IDs. Registry `2.0.0`
lacked metadata for `bilateral_trade_exports_usd` and
`bilateral_trade_imports_usd`; registry `2.1.0` adds both as `OBSERVED`, annual
USD, `UN_COMTRADE_V1`, `TRADE_CALIBRATION` variables. Their reporter/mirror,
classification, partner-identity, and no-reconciliation caveats remain
explicit. The generic `bilateral_goods_trade_usd` entry is unchanged.

The resulting pilot registry check is **10/10 registered, zero missing IDs**.
No C2 observation, snapshot, normalization, diagnostic, or C3 artifact was
rewritten.

## Evidence results and calculation checks

The register inventories all 19 existing `ARCHETYPE_FEATURE` candidates in
stable variable-ID order. Every entry has `admissionStatus=NOT_ADMITTED`.

- 10 candidates are `OBSERVED`, 3 are `DERIVED`, and 6 remain `PLACEHOLDER`.
- 4 observed candidates have frozen pilot evidence with caveats; 15 candidates
  have no frozen pilot observations.
- The source contains 247 facts and 246 distinct observation IDs, so the exact
  duplicate count is 1.
- There are 6 explicit nulls, 3 retained reporter/mirror asymmetries, and 0
  exactness failures.
- The three derived candidates are marked `DERIVATION_NOT_RUN`; no derived
  values were computed.
- The six placeholders remain placeholders with
  `PLACEHOLDER_VALUE_NOT_ASSIGNED`; no numeric field is emitted.

For the four candidates with pilot observations, the register records source
fact and distinct-ID counts, explicit missingness, source snapshot IDs, actual
source IDs, and adapter transformation versions. Agriculture, manufacturing,
and services each retain two explicit nulls. Unemployment records use the
registry-approved WDI fallback rather than the preferred ILOSTAT source.

## Caveats, not silent fixes

WDI record-level unit metadata is empty in the frozen source, so the register
preserves the existing unit-metadata caveat and performs no rescaling. The
registry's semantic transform (`IDENTITY_DECIMAL@1.0.0`) and the source adapter
transform (`WDI_IDENTITY_DECIMAL@2.0.0`) are reported separately. Whether those
version namespaces should be unified is an owner design decision; this package
does not reinterpret or rewrite either lineage.

The exact Comtrade duplicate and the three reporter/mirror asymmetries remain
visible. The register does not deduplicate facts for calibration weighting,
average mirrors, reconcile trade, or run IPF/RAS. WTO remains
`NOT_FETCHED/WTO_API_KEY_MISSING`; no substitute or synthetic tariff evidence
is introduced.

## Remaining gates

The evidence artifact carries forward all seven C4 prerequisites:

1. Missing-value policy for archetype features is unapproved.
2. Archetype method, count, and labels are unselected.
3. Fictional-country mapping is not authorized.
4. WTO tariff evidence is absent.
5. Provider-vintage stability is unestablished.
6. Sector taxonomy and trade reconciliation are unreviewed.
7. Final calibration and runtime handoff remain blocked.

Consequently this package is shareable for independent owner review, but is
not a feature-admission decision and cannot support final country generation,
World Core import, runtime authority, or production access.

## Reproduction

Use the repository-pinned Node `24.20.0` and pnpm `12.3.4`:

```sh
pnpm --filter @econmind/calibration c4:feature-evidence:generate
pnpm vitest run tests/calibration/calibration-c4-feature-admission.test.ts
```

Successful generation reports
`C4_FEATURE_EVIDENCE_VERIFIED_NOT_ADMITTED`. It confirms deterministic
evidence packaging and zero admissions, not readiness to generate a world.
