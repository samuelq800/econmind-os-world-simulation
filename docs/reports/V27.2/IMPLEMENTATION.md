# V27.2 — calibration closure preparation

## Immutable identity and status

- Isolated branch: `codex/v27-2-calibration-preparation`.
- Initial planning base: `45990429bb5405675d72cfde0299ca176084485c`.
- Latest integration base after non-overlapping mainline advance:
  `7c216f6a37574d3372d2f59198aed34befa85eb0`.
- Prior plan commit after rebase:
  `bf8bd301fe19f4901268b02f9747083602b5a927`.
- Frozen code/test commit:
  `3191181f9219a92e1306e183464274026a673e8d`.
- Frozen code/test tree: `2d5bc718aedfff314629acc4bffb0196730224e7`.
- Risk: P0 because the candidate validates financial and inventory
  conservation and deterministic evidence.
- Status: `PREPARATION_ONLY`, not V27.2 completion, independent verification,
  generation approval or Gate acceptance. V27.1 and V27.2 remain `PLANNED` in
  the authoritative status file, which this branch does not modify.

## Implemented preparation boundary

The new pure Core calibration module validates inert caller-supplied candidate
records only. It requires exactly 70 unique countries for a closed result and
requires every country to supply at least one financial batch, inventory
closure, geological closure, facility/staffing record and supply-chain record.
Missing countries/domains or placeholder sources produce
`PREPARATION_INCOMPLETE`, a null fingerprint and
`generationAuthorized: false`; no values are synthesized.

Every quantity carries a canonical exact-decimal string, destination unit,
source unit, source reference, explicit nullable assumption reference and a
change chain. Sources declare `OBSERVED`, `DERIVED`,
`SYNTHETIC_CALIBRATION` or `PLACEHOLDER`, plus locator, version and SHA-256
content reference. Observed values cannot hide assumptions or changes.
Derived/synthetic values require an assumption and exact before/delta/after
chain ending at the declared value. Source/destination unit conversion is not
accepted in this preparation version; 0–100 index units are rejected rather
than mapped to physical, staffing, ratio or monetary units.

Financial batches require positive, same-unit, reciprocal opposite legs and
exact debit/credit equality. Inventory buckets and geological layers must sum
exactly to their totals. Operational capacity cannot exceed installed
capacity; assigned staff cannot exceed required staff and staffing uses
`person`. Supplier shares are unique, refer only to included countries and
sum exactly to one. Sources, countries and domain records are canonically
ordered before an injected SHA-256 function binds the candidate.

`archetypeRef` is descriptive provenance only. Exact runtime record shapes
reject unknown fields such as a per-turn buff, and the output contains no
modifier, clock, RNG, command, event, database write or OpeningSeed authority.
No file under `packages/core/src/opening` was modified.

## Verification against the frozen code commit

- New calibration tests plus existing OpeningSeed, financial-ledger and
  inventory-ledger regressions: **PASS**, 4 files / 46 tests.
- Targeted ESLint and Prettier: **PASS**.
- Core typecheck and build: **PASS**.
- Repository boundary and authoritative-pattern scans: **PASS**.
- Local safe-environment, foundation policy and repository secret scans:
  **PASS**. The environment reported no configured database, no linked
  Supabase project and database mutation disabled; 941 files were scanned for
  secrets.
- Integration-base-to-code diff check: **PASS**. Changed paths at the frozen
  code commit are only the new calibration module, focused test and prior
  plan.

During development, the first focused run exposed a non-canonical fixture
change reference and an integer in the candidate hash preimage. Both were
corrected before the frozen code commit by canonicalizing the fixture
reference and representing the fixed expected count as exact string `"70"`.
All checks above were rerun after the clean rebase and correction.

## Explicitly not run

Actual 70-country empirical inputs, missing-provider retrieval, archetype
selection, IPF/RAS or other country generation, conversion of historic 0–100
indices, V27.1 schema integration, authoritative OpeningSeed construction,
runtime parameterization, commands/events, database or production work,
independent review, merge approval and Gate acceptance are `NOT_RUN`.
