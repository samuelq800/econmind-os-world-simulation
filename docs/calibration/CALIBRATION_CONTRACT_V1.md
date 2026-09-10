# Calibration Contract V1

Status: **DEVELOPMENT / NON_AUTHORITATIVE**  
Contract version: `1.0.0`  
Runtime authority: **NONE**

This contract defines how real-world data may become reproducible calibration evidence without becoming live simulation truth. A running World/Season may consume only a reviewed, frozen package; it must never call a provider to decide authoritative state.

## Classification and role

Every value has exactly one provenance class:

- `OBSERVED`: directly represented from one documented source observation. It must identify a raw snapshot and provider observation key.
- `DERIVED`: deterministically computed from approved observed/derived inputs. It must identify every input observation and a versioned transformation.
- `SYNTHETIC_CALIBRATION`: generated for fictional countries by an explicit, versioned empirical/design method. It is never described as an empirical observation.
- `PLACEHOLDER`: unsupported or missing. Its value is null and it cannot enter a frozen package as if observed.

`MODEL_PARAMETER` is a calibration **role**, not a fifth provenance class. An elasticity, coefficient, or policy response still needs one of the four provenance classes and may not be called observed merely because literature informed it.

## Identity and units

- A `sourceId` identifies provider plus dataset/API family, not a mutable URL result.
- A `snapshotId` identifies one retrieval and binds query, vintage metadata, exact bytes, byte length, and SHA-256.
- An `observationId` is the SHA-256-derived identity of variable, geography, period, snapshot, provider key, and transformation version.
- `geographyId` uses the provider's stable code in raw/observed layers. Cross-provider concordances are separate, versioned transformations.
- `period` retains the provider period identity. Annual, quarterly, monthly, point-in-time, and interval observations are not silently interchanged.
- `canonicalUnit` is mandatory. A source unit is converted only by a registered transformation; labels do not establish unit equivalence.

## Vintage, as-of, and revisions

`retrievedAt` is when bytes were acquired. `sourceAsOf` is the provider's stated release, update, or observation vintage when available. `asOfDate` on a package is the maximum evidence date intentionally admitted by the package, not today's date.

Raw bytes are append-only. A provider revision, different query, changed response, corrected parser, or new vintage creates a new snapshot and usually a new package version. Existing Season bindings never move to the new package implicitly.

## Missing values

Missing provider values remain null with an explicit policy/flag. Network failure, parse failure, missingness, and withheld/confidential values are distinct conditions. No failure may fall back to a synthetic value labeled `OBSERVED`. Imputation, if later approved, produces `DERIVED` or `SYNTHETIC_CALIBRATION` data under a versioned method.

## Transformations

Every derived variable names `transformId@version`, input variables, formula/algorithm, unit operation, missing behavior, and validation rules. Same frozen bytes plus same transformation version must yield byte-identical canonical output and hash.

Speculative relationships—such as a hard-coded inflation response to a tariff—are not empirical derivations. They remain hypotheses or model parameters until a later calibration process supports them.

## Exactness and rounding

Empirical decimal values are retained as canonical decimal strings. Calibration arithmetic uses string-backed integer coefficients/scales or explicitly approved exact primitives. Binary floating point is not an authoritative representation for source decimals or package values.

No silent rounding is permitted. Current exact division accepts only terminating decimal results. A non-terminating result fails with `CALIBRATION_ROUNDING_POLICY_REQUIRED` until an owner-approved scale and rounding mode exist. This policy does not import or reinterpret ADR-08 semantics.

Reconciliation acceptance is exact after the documented deterministic method. Source discrepancies are diagnostics, not tolerances to hide. Any future rational/IPF implementation must state its finite termination rule and exact residual allocation policy.

## Provenance, confidence, and hashing

Provenance is a directed chain:

`source registry -> raw snapshot -> source observation key -> normalized observation -> transformation and inputs -> synthetic method/seed (if any) -> package`

Confidence describes evidence fitness and comparability; it never changes provenance class. Caveats travel with the variable or observation.

Hashes use SHA-256 over raw bytes for snapshots and SHA-256 over canonical JSON for structured artifacts. Canonical JSON recursively sorts object keys, preserves array order, rejects undefined/non-finite values, and uses UTF-8 without presentation whitespace. A package hash excludes its own `contentHash` field and includes all other identity/version bindings.

## Package identity and freeze

A package binds:

- `packageId`, `schemaVersion`, `calibrationVersion`, `asOfDate`, and status;
- sorted `sourceSnapshotSet` and `transformationVersions`;
- variable-registry, archetype, trade-calibration, and generator versions;
- `contentHash`.

`DEVELOPMENT_NON_AUTHORITATIVE` artifacts are not Season inputs. Before cross-thread consumption, a candidate becomes immutable, uses `FROZEN_REVIEW_CANDIDATE`, and receives independent calibration/interface review. Season creation later records package ID, version, snapshot set, transformation version set, as-of date, and hash. The Season binding is immutable.

## Deterministic regeneration

Regeneration requires the exact raw snapshot bytes, registry versions, transformation implementation/version, configuration, generator version, and seed. System clock, locale, filesystem enumeration order, provider availability, and response ordering may not affect output. Collections are explicitly sorted before hashing or generation.

## Runtime isolation boundary

Provider adapters and network transports belong only to calibration/data tooling. `packages/core`, `apps/world-api`, `apps/world-worker`, and `apps/world-web` must not import them or query WDI/WTO/Comtrade for simulation truth. World Core may later consume only the frozen package interface. If that interface requires a Core change, Session C stops and submits an interface proposal to Session A.

Large provider datasets are stored outside Git in a configured ignored raw-data/artifact location. Git stores query definitions, metadata manifests, exact hashes, and small deterministic fixtures—not global dumps.
