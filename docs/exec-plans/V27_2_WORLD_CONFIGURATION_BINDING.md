# V27.2 World and country-configuration binding — preparation only

## Authority and scope

Branch base: `e906764dde1603754ae7a5bea49b8b457ae47f07`. V27.1/V27.2/V27.3 remain `PLANNED`; ADR-13 and ADR-14 remain `PROPOSED_NOT_APPROVED`. Constitution R002 requires World Simulation and Season to share Core while keeping orchestrator ownership distinct. This change does not choose an orchestrator, an NPC policy, a Season-specific economic path, or an authoritative country source.

The existing V27.2 inert candidate schema has no `worldId` or `countryConfigurationRef`, so the V27.1-to-V27.2 adapter must report `WORLD_CONFIGURATION_BINDING_UNAVAILABLE`. The smallest Core-owned forward fix is a versioned V27.2 candidate schema that requires both fields. Define `countryConfigurationRef` as a canonical, versioned SHA-256 identity digest over the explicit World ID and sorted exact country IDs. The validator recomputes it for a closed 70-country candidate; the adapter compares the candidate World and configuration ref to the reparsed V27.1 World/country set. This is structural binding, not proof that an external configuration owner authorized those identities. V27.1 `seasonRef` remains audit metadata only.

Do not silently accept the old schema, infer missing fields, or claim that a matching digest proves source content, economic calibration, OpeningSeed readiness or formal dependency closure. Preserve `generationAuthorized: false` and all existing exact-decimal change chains; expose a small readonly value-trace view only if it reuses those validated source/assumption/before/delta/after fields without creating new numeric semantics.

## Files, tests, and exclusions

Own `packages/core/src/calibration/country-input-closure.ts`, `country-provenance-adapter.ts`, their focused tests, the worker-preflight fixture and this evidence. No V27.1 parser, runtime entrypoint, OpeningSeed writer, schema/migration, status/ADR register, C data source, E API, D web, original main site or production change.

Test schema v1/missing binding rejection, different World rejection, mismatched configuration digest, ordering-invariant digest, unchanged fail-closed incomplete candidate, and exact numeric change-chain trace. Run Core/worker build, focused V27 tests, targeted lint/format and boundary scans. P0 independent review of the new SHA remains mandatory before merge or activation.
