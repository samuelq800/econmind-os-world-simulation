# V11–V18 causal-channel preparation implementation

> PREPARATION_ONLY_NOT_V11_STARTED

## Candidate

- **Baseline:** `291034d1c4f4ca1f9a3fd8779cf129ec46793b4f`
- **Branch:** `codex/f-v11-v18-causal-channels`
- **Scope:** pure `packages/core` topology and inert exact-decimal scheduling
  only; no status/progress edit and no authoritative runtime path.

## Delivered

- `causal-channels.ts` records all 50 user-requested pathways as named,
  signed directed edges. Chains 1–24 are parameterized-kernel-ready; 25–50
  are explicitly marked future-interface-only for V19–V21.
- `scheduleCausalTransmission` requires caller-owned source magnitude,
  response factor, parameter version, and positive delay. It returns an inert
  future effect and cannot read or mutate World State.
- `partitionCausalEffects` is a deterministic, lossless due/pending partition;
  it deliberately does not apply an effect, emit an event, or create a posting.
- The focused test suite verifies catalogue completeness, directional signed
  deltas, failure-closed input validation, and deterministic partitioning.

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
