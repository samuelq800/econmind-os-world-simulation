# V27 existing-opening read — worker-only forward slice

## Identity and boundary

This forward slice follows the independently reviewed preflight SHA `0cdace33915751708194ccbe9df43356ff5457d9`. That review does **not** approve this new commit. The result remains `PREPARATION_ONLY`; V27.1–V27.3 remain `PLANNED`, ADR-13 remains `PROPOSED_NOT_APPROVED`, and V27.2 still lacks durable `worldId` / `countryConfigurationRef` binding. No main merge, runtime activation, authoritative bootstrap or production access is authorized.

`inspectExistingSingleWorldOpening` is a worker-local diagnostic function, not exported through the worker entrypoint or called by runtime startup. It recomputes the existing single-World preflight from raw inputs, requires initial SimTime zero, and calls only `WorldOpeningSeedStore.load(worldId)`. The store performs canonical durable-seed rehydration and lineage validation. The frozen result pairs the existing seed identity/fingerprint with a **separate** candidate preflight fingerprint and blockers; `candidateBoundToOpening`, `initializationAuthorized` and `workerDispatchAllowed` are always `false`.

The test fixture alone uses the existing `bootstrap` method to create a disposable PGlite row. The inspection path uses a database adapter that rejects non-SELECT statements and transactions; it makes two SELECT calls for two inspections, with the opening row count and WorldVersion unchanged. No candidate calibration is promoted into an OpeningSeed.

## Verification

- Core build: PASS; worker build: PASS.
- V27.1/V27.2/V27.3, provenance adapter, worker preflight and opening-store focused suite: PASS, 6 files / 48 tests.
- Targeted ESLint and Prettier: PASS.
- Architecture boundary suite: PASS, 3 files / 34 tests; authoritative-pattern and repository-boundary scans: PASS.
- `git diff --check`: PASS.

Full repository suite, production database, complete calibrated 70-country inputs, missing V27.2 bindings, ADR-13 approval, worker activation, independent review of this new SHA, and V27 package/gate acceptance remain **NOT_RUN / OPEN**. The previous independent result applies only to `0cdace33915751708194ccbe9df43356ff5457d9`.
