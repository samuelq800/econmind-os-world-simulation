# V29 selected-data Core OpeningSeed dry-run

Status: `PREPARATION_ONLY_NOT_OPENING_SEED_APPROVAL`.

The owner selected the frozen balanced World package as the intended input and
delegated the technical mapping assessment. Run a test-only Core OpeningSeed
construction from that exact package to reveal numeric/contract defects. This
is not the V27/V29 authoritative initialization step.

## Scope and risk

- P2 test support only: one focused test plus evidence. Core/Worker/API/web,
  database schema/RLS, production Supabase, and the original site are unchanged.
- Pin `CHECKSUMS.json` and the selected country/stock/finance file hashes.
- Map source `visual-territory-NN` to diagnostic `COUNTRY_NN`, retaining source
  identity. Never assert that this maps a real player, government or right.
- Use `TEST_FIXTURE` OpeningSource. Use diagnostic legal entity/location IDs
  only to exercise Core's type and ledger constraints; they confer no title,
  risk, physical survey, or authorization.
- Map scenario GCU to test `GCU` without rounding source number strings. Keep
  household/business deposits and bank reserve/loan assets as primary values;
  derive deposit liabilities and equity from those values so each bank's
  opening batch balances exactly. Report source-to-derived deltas separately.

## Boundary

The output is an in-memory fixture. It cannot be persisted as the official
World OpeningSeed, used to start a worker, or promoted by this test. Formal
V27 provenance, source rights, exact opening balance acceptance, independent
P0 review, V29 long-run and V30 staging remain separate.
