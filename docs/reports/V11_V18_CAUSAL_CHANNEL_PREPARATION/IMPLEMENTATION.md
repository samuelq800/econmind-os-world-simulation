# V11–V18 causal-channel preparation implementation

> PREPARATION_ONLY_NOT_V11_STARTED

## Candidate

- **Baseline:** `291034d1c4f4ca1f9a3fd8779cf129ec46793b4f`
- **Branch:** `codex/f-v11-v18-causal-channels`
- **Scope:** pure `packages/core` topology, inert exact-decimal scheduling, and
  Firm Ecology calculation only; no status/progress edit and no authoritative
  runtime path.

## Delivered

- `causal-channels.ts` records all 105 user-requested pathways as named,
  signed directed edges. Topology scheduling is deliberately value-free, so a
  bare decimal cannot masquerade as money, people, tonnes, or a rate.
- `causal-values.ts` adds the only concrete numerical path. Every input and
  result is `MONEY(currency)`, `QUANTITY(unit)`, or
  `UNIT_PRICE(currency/perUnit)`, carries an explicit sign rule, and returns
  exact canonical `before`, signed `delta`, and `after`. Cross-dimensional
  response factors declare both source and target units.
- Concrete stock updates fail closed on currency/unit mismatch, a negative
  non-negative stock, an undued effect, or a duplicate effect ID. The pure
  result remains inert and cannot mutate World State.
- `firm-ecology.ts` implements C101–C105 without a representative-firm
  shortcut: discrete entry/exit, cash-flow/default/insolvency classification,
  per-firm energy-cost selection, startup cohorts, and exact SOE
  guarantee/rollover accounting. Inputs/outputs are exact money, named-unit
  quantities, price per physical unit, or explicit dimensioned rates.
- The focused suite verifies all 105 paths, exact population and GCU examples,
  unit rejection, deterministic partitioning, and all five Firm Ecology
  mechanisms.

## Boundary declaration

| Boundary                                             | Effect                                                                |
| ---------------------------------------------------- | --------------------------------------------------------------------- |
| World State / ledger / events / receipts / commands  | None                                                                  |
| Database, RLS, migration, Supabase, production data  | None                                                                  |
| Time / scheduling                                    | Caller-supplied integer periods only; no clock or settlement ordering |
| Authorization / Office approval                      | None                                                                  |
| UI, worker, API, map, cache, forecast                | None                                                                  |
| Legacy or original EconMind site                     | None                                                                  |
| Firm registry, bankruptcy, SOE guarantee application | None                                                                  |

## Still gated

- No calibration, elasticity, country initialization, default parameter, or
  policy reaction function was added.
- A future authoritative caller must obtain the responsible economic decision,
  resolve authorization and WorldVersion, read canonical state, then apply any
  accepted effect through the approved atomic World Core path.
- V19–V21 implementation, and real banking/FX/trade/FDI/route behavior, remain
  outside this candidate.
- C101–C105 calculations do not authorize a firm lifecycle, liquidation,
  creditor waterfall, guarantee approval, or World Core settlement.
