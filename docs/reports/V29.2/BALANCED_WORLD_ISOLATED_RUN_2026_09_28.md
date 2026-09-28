# Balanced World data — isolated run and Core-boundary assessment

Status: `DIAGNOSTIC_ONLY_NOT_V29_2_ACCEPTANCE`. The owner selected the balanced
package merged to main as the intended World data. This report records what
actually ran against those frozen bytes; it does not create an OpeningSeed,
World head, Command, Event, Receipt, or production state.

## Frozen input and environment

- Repository main at run start: `1a83a45` (selected-package binding PR #10).
- Source package: `artifacts/world-balanced-candidate-v1`, introduced at
  `d55eab3`; `CHECKSUMS.json` SHA-256
  `88dd44478f97d2e8893a4f11b3aaf96e256bdb13248aca0d08f097fabe10d315`.
- Original `check.py` SHA-256
  `b39b5fb65a27dc86832af18deb4ece7f78b89c0b0d1127ada37b5c5eff90effe`.
- Python 3.12.14 in an isolated temporary virtual environment; exact
  `requirements.txt` versions: numpy 2.5.3, scipy 1.18.1, shapely 2.1.2.
  The package was copied to an isolated temporary directory before execution.

## Actual runs

1. Unmodified copied `check.py`: exit 0, all seven candidate checks PASS,
   70 countries. Normal, 30-day shipping pause and 90-day grain drought each
   executed 600 days with no reported violation. The reproduced
   `VALIDATION.json` SHA-256 was exactly
   `108f7d6d094224c089bc8c243c953bdcbd5119236b318975b3f11455d2a05e2d`,
   byte-identical to the committed artifact.
2. A second **temporary-copy-only** script changed the loop from
   `range(600)` to `range(1000)` and changed only output scenario/scope labels.
   Script SHA-256:
   `3ec4de44c19c7e5ff0cc341a6c4ff2e35ab6267efdf39594df1d14cc6086dd77`.
   Exit 0; all three scenarios executed 1,000 days without reported violation.
   The diagnostic `VALIDATION.json` SHA-256 was
   `d533f40098fab2236061c2e1e39b547f8eedd03a408945233f1ab7b37288968c`.
   The lowest stock was approximately `-0.0009999999974` commodity units in
   normal/drought and `-0.0001799999995` in the shipping-pause scenario. The
   former is very close to this offline model's `0.001` tolerance; do not
   present it as exact Core conservation or a safety margin.
3. Existing pinned-toolchain Core/Worker V29 focused regressions:
   `vitest run tests/support/v29-longrun-replay-harness.test.ts
tests/support/v29-worker-delivery-driver.test.ts` — 16/16 PASS. These use
   synthetic **two-country** fixtures, not the selected 70-country opening.

The offline simulator assumes fixed recipes, available facilities and planned
trade; it does not execute authorized Core/Worker commands, real contracts,
hourly power dispatch, endogenous prices, default, or a 70-country financial
ledger. Consequently the formal 70-country 600/1000-day V29.2 requirement is
still `NOT_RUN`.

## Engineering conversion decision and hard boundary

- A bijection `visual-territory-NN` → `COUNTRY_NN` was checked against Core's
  `countryId` parser for all 70 countries: 70 valid, distinct target IDs,
  first `COUNTRY_01`, last `COUNTRY_70`. It is a safe _proposed_ technical
  identity mapping, not a registered team/role/rights mapping.
- Interpret `GCU_SCENARIO_ACCOUNTING_UNIT` as candidate `GCU` only within
  isolated Core arithmetic. Checked source numeric strings against the JSON
  decimal lexemes for the primary finance fields: zero conversion drift.
  No cent-rounding or invented missing value was used.
- Source bank identities are not exactly closed under decimal arithmetic:
  `bankReserveAssets + bankLoanAssets − bankDepositLiabilities − bankEquity`
  reaches absolute `0.000013` scenario units. A deterministic preparation
  proposal keeps primary household/business deposits, bank reserves and loan
  assets unchanged, derives deposit liabilities as the sum of the two deposits,
  and derives equity as reserve assets plus loans minus those liabilities.
  Core `Money` arithmetic balanced all 70 rows exactly. Relative to the source
  derived fields, 56 liability rows would change by at most `0.00001` GCU and
  62 equity rows by at most `0.000017` GCU. These are explicit proposed source
  corrections, **not** authorized ledger entries or an activated conversion.

The candidate itself still declares `activationAllowed: false` and lacks a
production World identity. Title/risk ownership, legal entities, exact finance
opening batches, actor/role authorization and independent P0 review remain
unresolved. V27/V28 predecessors and V29/V30 status remain `PLANNED`; R002 /
ADR-14 reconciliation and an approved non-production V30 target remain separate.
No original-site or production Supabase mutation occurred.
