# Country Archetype Design

Status: **DESIGN ONLY / NON_AUTHORITATIVE**  
Final labels: **NOT FROZEN**  
Final 70-country generator: **NOT CREATED**

## Objective

Archetypes preserve realistic joint economic structure without disguising real countries under fictional names. The pipeline is: comparable real observations, quality/missingness screening, feature transformation, empirical distributions or clustering, interpretable candidate archetypes, then seeded fictional assignments/draws. Raw country rows never become fictional country identities one-to-one.

The configurable target may be approximately 70 countries for Season 1, but schemas and algorithms accept any positive configured count. World Core must not validate a fixed count of 70.

## Candidate feature families

Income/productivity, population scale, sector structure, trade openness, manufacturing orientation, resource/energy/food dependence, fiscal capacity, debt burden, external buffers, export concentration, and logistics/connectivity are candidates. A feature enters only after its registry definition, units, missing policy, source coverage, and transformation are approved.

Features are modeled jointly. For example, a manufacturing-oriented exporter should draw from a supported joint region of manufacturing share, openness, product/partner concentration, logistics capacity, and energy/material dependence—not independent uniform ranges.

## Candidate methods

| Method                         | Interpretability                   | Reproducibility                                                          | Missing-data sensitivity                             | Covariance preservation                             | Educational suitability                                       |
| ------------------------------ | ---------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------- |
| Rule-based archetypes          | High when thresholds are published | High                                                                     | High near thresholds; explicit missing branch needed | Partial and designer-dependent                      | High, but risks encoding unsupported stereotypes              |
| Standardized k-means           | Medium                             | High with frozen preprocessing, initialization, implementation, and seed | Requires explicit complete-case/imputation policy    | Captures spherical within-feature geometry poorly   | Medium; centroids require explanation                         |
| Hierarchical clustering        | Medium-high via dendrogram         | High with frozen linkage/distance/tie-breaking                           | Distance can be distorted by missingness             | Preserves nested similarity, not full distributions | High for explaining families; cut level is a policy choice    |
| Mixture-based clustering       | Medium-low                         | Sensitive to initialization/model selection                              | High without a probabilistic missingness model       | Better for covariance within components             | Medium-low; probabilities can be overinterpreted              |
| Constrained empirical sampling | High when constraints are explicit | High with snapshot, algorithm, seed, and deterministic ties              | Can operate on carefully chosen donor pools          | Potentially strongest if sampling joint rows/blocks | High, but privacy/real-country resemblance must be controlled |

No algorithm is selected in Foundation V1. C2 must first quantify coverage, comparability, stability across vintages/seeds, and feature covariance. Candidate labels follow evidence; they do not precede it.

## Schema and determinism

`data/calibration/schemas/country_archetype.schema.json` records a candidate method, feature-set version, dimension quantile ranges/weights, empirical support, and caveats. The code exposes deterministic seed primitives for later use, but does not generate countries.

Any later generator is a pure function of:

`frozen calibration package + generator version + configuration + seed`

It sorts all candidate IDs and defines tie-breaking. It never reads current time, live provider data, locale, unstable filesystem order, or runtime World State.

## Validation before freezing

- coverage and missingness by source/geography/period;
- sensitivity to scaling, feature set, missing policy, and seed;
- stability across provider revisions;
- within- and between-archetype covariance checks;
- exclusion of one-to-one real-country replicas;
- plausibility and diversity of configurable synthetic draws;
- reproducibility of byte-level output and package hash.
