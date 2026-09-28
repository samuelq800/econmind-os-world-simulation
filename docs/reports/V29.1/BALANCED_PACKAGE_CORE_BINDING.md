# Selected balanced package → Core binding preflight

Status: `PREPARATION_EVIDENCED_NOT_V29_1_ACCEPTANCE`.

The project owner selected the balanced World data already merged on main as
the intended World input. The source package entered main at `d55eab3`; this
read-only preflight pins `artifacts/world-balanced-candidate-v1/CHECKSUMS.json`
at SHA-256
`88dd44478f97d2e8893a4f11b3aaf96e256bdb13248aca0d08f097fabe10d315`.
The original 86-entry manifest still governs the source files. This selection
does not rewrite the package's `activationAllowed: false` or claim a World
creation, an authoritative OpeningSeed, or a 600/1000-day Core run.

## Tested interface

- Exact roster: 70 atlas countries, total population 14,712,146,434.
- Exact 70 × 12 stock cells: 840 entries, one per source country and fixed
  Core commodity. Every unit matches the Core catalog and every amount parses
  as a Core `Quantity`; 619 are positive and 221 are zero. Zero stocks are not
  manufactured into positive OpeningSeed entries.
- All 70 finance rows use `GCU_SCENARIO_ACCOUNTING_UNIT`. Core `Money` accepts
  only three-uppercase-letter settlement identifiers; there is no authorized
  `GCU` mapping in this preflight. In the household-deposit field alone, 60/70
  JSON numbers have more than two decimal places. No rounding or binary-float
  conversion policy has been selected.
- The atlas IDs `visual-territory-01` … `visual-territory-70` are not valid
  canonical uppercase Core `CountryId` values. A reviewed bijective identity
  mapping is required; display order is not silently made a legal identity.

## Acceptance boundary

This test verifies byte identity, coverage and numeric/catalog compatibility
for inventory **only**. It does not establish title holder, risk bearer,
physical location registration, finance double-entry, entity/team authority,
contracts, active facilities, source-kind authorization, or complete World
initialization. Those mappings require explicit design and independent P0
review before building or activating the authoritative OpeningSeed. The
original website and production Supabase were not touched.

Pinned-toolchain verification (Node 24.20.0, pnpm 12.3.4):

`pnpm exec vitest run tests/world-core/v29-balanced-candidate-core-binding.test.ts`

Result: 3/3 PASS. The unmodified `pnpm check` also passed: 1,260 tests passed,
77 skipped; 34/34 architecture gate tests passed; typecheck, lint, format,
boundary/pattern scans, safe-local environment, 19-migration validation and
rehearsal, foundation policy, secret scan, candidate PGlite import rehearsal,
map-package verification and builds passed. The candidate rehearsal reported
three frozen-source/current-file drifts and still produced zero OpeningSeeds
and zero World heads. Those are not formal V29/V30 completion evidence.
