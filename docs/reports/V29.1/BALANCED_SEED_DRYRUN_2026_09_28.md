# Selected balanced data — test-only Core opening ledger dry-run

Status: `PREPARATION_EVIDENCED_NOT_V27_V29_ACCEPTANCE`. This is the direct
follow-up to the owner's selected merged World data and the isolated runs in
`docs/reports/V29.2/BALANCED_WORLD_ISOLATED_RUN_2026_09_28.md`.

## Exact scope

The focused test pins the balanced package `CHECKSUMS.json` SHA-256
`88dd44478f97d2e8893a4f11b3aaf96e256bdb13248aca0d08f097fabe10d315`
and rechecks the country, stock and finance source hashes before any Core
construction. No source bytes are changed. It makes a **TEST_FIXTURE**
OpeningSource in memory, not a production or approved source.

The source-country display keys map bijectively to diagnostic `COUNTRY_01` …
`COUNTRY_70`. Positive stock values retain their exact parsed decimal strings
and fixed Core units. Test-only entity/location IDs stand in for missing
registered title, risk and location authorities; they do not grant those
rights. The `GCU_SCENARIO_ACCOUNTING_UNIT` values are parsed as test `GCU`
without cent-rounding. Original household/business deposits and bank
reserve/loan assets stay primary. Deposit liabilities and bank equity are
derived from those primary values, with the source deltas counted separately
instead of silently changing the candidate package.

## Observed result

- Core created and rebuilt one in-memory WorldVersion-0 test seed with 619
  positive inventory balances across all 70 countries and 70 exact-balanced
  bank opening batches yielding 280 financial positions across all 70.
- Source-to-derived comparison found 56 deposit-liability and 62 equity rows
  needing explicit sub-cent corrections. No new money, hidden macro effect or
  source overwrite was performed. The original data package remains unchanged.
- Focused Vitest: 1/1 PASS. Dedicated TypeScript typecheck, targeted ESLint and
  Prettier: PASS on Node 24.20.0/pnpm 12.3.4. Architecture gate tests 34/34,
  boundary/pattern scans, safe-local environment, foundation policy and secret
  scan also passed. The code is confined to `tests/world-core` plus this
  plan/report and a dedicated test tsconfig. Full `pnpm check` was not rerun
  for this test-only slice; its latest mainline pass is PR #10's base.

This does **not** establish the actual treasury/household/business opening
accounts, inventory title/risk, legal facilities/contracts, team/role binding,
formal V27 calibration, or production World identity. The TEST_FIXTURE seed
must not be persisted or passed to the server as authority. The formal
70-country Core/Worker 600/1000-day run, V29 independent review and V30 tests
are still `NOT_RUN`; no gate status changed. No database, Supabase, legacy
site, API, Worker or browser state was touched.
