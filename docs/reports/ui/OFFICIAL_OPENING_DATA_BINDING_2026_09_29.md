# World V2 UI numerical binding — 2026-09-29

Status: `OFFICIAL_OPENING_DATA_BOUND`; live World state is `NOT_CONNECTED`.

## Fixed source and meaning

- The selected source is `status/world-data-selection.json`, package
  `BALANCED_2026_09_28_V1`, countries SHA-256
  `5d493e93dfab1425731191ba7491cce47949d176e4769b33fdca48d2d31dba89`.
- The 70 country IDs reconcile to 14,712,146,434 people. The published country
  data includes 1,374 source facility records, 240 geological deposits, and
  each country's 12 commodity stocks and 12 production reference plans.
- `scripts/sync-official-ui-country-data.mjs` deterministically maps the
  frozen source package into the country-page data. Its `--check` mode compares
  every generated file byte for byte. The original UI archive remains unchanged
  as visual provenance; its previous 14,714,012,813-person preview is no longer
  the country-page population source.
- Geography, climate, population, regions, facility proposals, resource
  deposits, power proposals, employment allocation, financial opening accounts,
  commodity stocks, production references, and population-service proposals
  retain their source identity and units in the generated JSON. Proposal values
  are displayed as proposals, not permitted construction or observed output.
- The source's `treasuryCentralBankBalance` is kept as a _combined_ account;
  the UI does not infer a separately spendable Treasury cash balance. Bank
  deposits are sourced from `bankDepositLiabilities`; grain stock and daily
  demand are sourced from the matching GRAIN stock and production rows.

## Browser boundary

- Country pages and the 70-country atlas display the selected opening data.
- Country-specific finance/industry/trade/social planning computes only a
  clearly labelled local, hypothetical allocation over those opening values.
  Saving such a plan does not change World State.
- The old North Harbour sample ledger, automatic local settlement and sample
  office modules are no longer exposed on a country-scoped route. Deep links to
  those modules fail closed with a World-not-connected message. The World clock
  reads `Not started` rather than synthesizing a running day.
- The standalone unscoped North Harbour example remains a separate sample; it
  is not an official country or live World state.

## Still required for live numbers

`status/world-data-selection.json` currently records `worldId: null`,
`openingSeedCommitted: false`, and `workerStarted: false`. Consequently no
authenticated World projection can supply current balances, executed output,
prices, contracts, player identity, commands, receipts, or settlement. A later
reviewed OpeningSeed mapping, approved runtime activation, World API read
binding and browser client must provide those values. This change does not
write Supabase, activate the Worker, mutate the original EconMind site, or
advance Gate B.
