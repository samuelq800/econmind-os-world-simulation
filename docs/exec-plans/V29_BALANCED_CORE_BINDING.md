# V29 balanced-package to Core binding preflight

Status: `PREPARATION_ONLY`. The owner selected the balanced country package
already merged to main as the intended World data input. This plan binds its
immutable bytes to Core's fixed country/commodity/quantity contracts; it does
not promote candidate values to an authoritative OpeningSeed or close V29.1.

## Scope

- Owner: one read-only focused test under `tests/world-core` and its evidence
  report. No Core/Worker/API/browser runtime, schema, RLS, Supabase, original
  main-site, or product data edits.
- Input: the existing `artifacts/world-balanced-candidate-v1` package,
  `CHECKSUMS.json`, and Core's fixed commodity catalog.
- Verify all 70 country identities and population total; one stock row per
  country/commodity; exact catalog unit match; and Core `Quantity` parsing of
  every positive opening stock. Report zero stocks separately instead of
  manufacturing positive ledger entries.
- Check the finance currency against Core `Money` without silently mapping a
  scenario accounting unit to a legal settlement currency.

## Boundary and continuation

The package declares `activationAllowed: false`, has no production World ID,
and stores proposed rights, contracts and financial values. A passing preflight
proves only that the selected package is byte-bound and its inventory values
fit the current numeric/catalog interface. It does not approve title/risk
ownership, economic recognition, financial double-entry, OpeningSeed source
kind, 70-country runtime initialization, 600/1000-day replay or V30 evidence.
Those remain separate implementation and independent-review steps.
