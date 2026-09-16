# V11–V18 causal-channel preparation implementation

> PREPARATION_ONLY_NOT_V11_STARTED

## Candidate

- **Baseline:** `291034d1c4f4ca1f9a3fd8779cf129ec46793b4f`
- **Branch:** `codex/f-v11-v18-causal-channels`
- **Scope:** pure `packages/core` topology and inert exact-decimal scheduling
  only; no status/progress edit and no authoritative runtime path.

## Delivered

- `causal-channels.ts` records all 100 user-requested pathways as named,
  signed directed edges. Topology scheduling is deliberately value-free, so a
  bare decimal cannot masquerade as money, people, tonnes, or a rate.
- `causal-values.ts` adds the only concrete numerical path. Every input and
  result is `MONEY(currency)` or `QUANTITY(unit)`, carries an explicit sign
  rule, and returns exact canonical `before`, signed `delta`, and `after`.
  Cross-dimensional response factors declare both source and target units.
- Concrete stock updates fail closed on currency/unit mismatch, a negative
  non-negative stock, an undued effect, or a duplicate effect ID. The pure
  result remains inert and cannot mutate World State.
- The focused suite verifies all 100 paths, exact population and GCU examples,
  dimensional rejection, exact aggregation, topology scheduling, and
  deterministic partitioning.

## Boundary declaration

| Boundary                                            | Effect                                                                |
| --------------------------------------------------- | --------------------------------------------------------------------- |
| World State / ledger / events / receipts / commands | None                                                                  |
| Database, RLS, migration, Supabase, production data | None                                                                  |
| Time / scheduling                                   | Caller-supplied integer periods only; no clock or settlement ordering |
| Authorization / Office approval                     | None                                                                  |
| UI, worker, API, map, cache, forecast               | None                                                                  |
| Legacy or original EconMind site                    | None                                                                  |

## Still gated

- No calibration, elasticity, country initialization, default parameter, or
  policy reaction function was added.
- A future authoritative caller must obtain the responsible economic decision,
  resolve authorization and WorldVersion, read canonical state, then apply any
  accepted effect through the approved atomic World Core path.
- V19–V21 implementation, and real banking/FX/trade/FDI/route behavior, remain
  outside this candidate.
